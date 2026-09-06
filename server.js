require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'tbr_exchange_secret_key_2026';

// Google OAuth Client Setup
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '661544926174-8kp01crhke9m1vmjf6kcts5o2e7sqek8.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Brevo API Key & Sender Email Setup
const BREVO_API_KEY = process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.trim() : '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'tbrexchange@gmail.com';

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// የ Base64 ምስሎች ትልቅ መጠን ስላቸው ገደቡን ወደ 50mb ከፍ አድርገነዋል (BadRequestError እንዳይመጣ)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 1. ስታቲክ ፋይሎችን በግልጽ እና በትክክለኛ አቅጣጫ ማስቀመጥ
const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tbr_exchange')
.then(() => console.log('MongoDB Database Connected Successfully!'))
.catch(err => console.log('MongoDB Connection Error:', err));

// User Schema & Model
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    phone: { type: String, index: true }, 
    password: { type: String, required: true },
    fullName: { type: String, default: 'User' },
    verificationCode: String,
    verificationCodeExpire: Date,
    isVerified: { type: Boolean, default: false },
    kycStatus: { type: String, default: 'unverified' }, // unverified, pending, verified, rejected
    resetToken: String,
    resetTokenExpire: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date }
});

const User = mongoose.model('User', userSchema);

// KYC Schema & Model (ከቀድሞው KycModel.js ጋር የተጣጣመ)
const kycSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    fullName: { type: String, required: true },
    email: { type: String, default: '' },
    idNumber: { type: String },
    dob: { type: String },
    address: { type: String },
    docType: { type: String, default: 'national_id' },
    frontImage: { type: String, required: true }, // Base64 String
    backImage: { type: String },                  // Base64 String
    selfieImage: { type: String, required: true }, // Base64 String
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    rejectionReason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const KYC = mongoose.models.KYC || mongoose.model('KYC', kycSchema);

// Temporary memory to store verification codes and signup attempts/lockout
const pendingUsers = {};

// Helper Function: Verify Token Middleware
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified; // { id: user._id }
        next();
    } catch (err) {
        res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
}

// Helper Function to send email using Brevo API
async function sendEmailViaBrevo({ to, subject, htmlContent }) {
    if (!BREVO_API_KEY) {
        throw new Error('BREVO_API_KEY is missing in environment variables.');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { email: EMAIL_FROM, name: 'TBR Exchange' },
            to: [{ email: to }],
            subject: subject,
            htmlContent: htmlContent
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send email via Brevo');
    }

    return await response.json();
}

// Function to generate and send verification email
async function sendVerificationEmail(email, verificationCode) {
    const uniqueId = Date.now(); 
    const htmlContent = `
    <div style="background-color: #0c0c0c; padding: 40px 20px; font-family: sans-serif; color: #ffffff;">
        <div style="max-width: 550px; margin: auto; background-color: #141414; border: 1px solid #262626; border-radius: 12px; padding: 30px; text-align: center;">
            <h1 style="color: #d4af37; margin: 0; font-size: 26px;">TBR Exchange</h1>
            <p style="color: #b0b0b0; font-size: 14px;">Your Verification Code is:</p>
            <span style="color: #f3c653; font-size: 38px; font-weight: bold; letter-spacing: 6px; display: block; margin: 20px 0;">${verificationCode}</span>
        </div>
    </div>`;

    await sendEmailViaBrevo({
        to: email,
        subject: `${verificationCode} — Your TBR Verification Code (${uniqueId})`,
        htmlContent
    });
}

// 1. Signup Route
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: cleanEmail });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered!' });
        }

        const currentTime = Date.now();
        const pendingUser = pendingUsers[cleanEmail];

        if (pendingUser && pendingUser.lockUntil) {
            if (currentTime < pendingUser.lockUntil) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Too many incorrect attempts.',
                    lockUntil: pendingUser.lockUntil
                });
            } else {
                pendingUser.signupAttempts = 0;
                pendingUser.lockUntil = undefined;
            }
        }

        if (pendingUser && (currentTime - pendingUser.lastSentTime < 60000)) {
            return res.status(400).json({ success: false, message: 'Please wait before requesting a new code.' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = currentTime + 10 * 60 * 1000;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        pendingUsers[cleanEmail] = { 
            password: hashedPassword, 
            verificationCode, 
            expiresAt, 
            lastSentTime: currentTime,
            signupAttempts: pendingUser ? pendingUser.signupAttempts : 0,
            lockUntil: pendingUser ? pendingUser.lockUntil : undefined
        };

        await sendVerificationEmail(cleanEmail, verificationCode);
        res.json({ success: true, message: 'Verification code sent to your email!' });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error while sending email.' });
    }
});

// 2. Resend Code Route
app.post('/api/resend', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

        const cleanEmail = email.trim().toLowerCase();
        const pendingUser = pendingUsers[cleanEmail];
        if (!pendingUser) {
            return res.status(400).json({ success: false, message: 'Session expired. Please sign up again.' });
        }

        const currentTime = Date.now();

        if (pendingUser.lockUntil) {
            if (currentTime < pendingUser.lockUntil) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Too many incorrect attempts.',
                    lockUntil: pendingUser.lockUntil
                });
            } else {
                pendingUser.signupAttempts = 0;
                pendingUser.lockUntil = undefined;
            }
        }

        if (currentTime - pendingUser.lastSentTime < 60000) {
            return res.status(400).json({ success: false, message: 'Please wait 60 seconds before resending.' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        pendingUser.verificationCode = verificationCode;
        pendingUser.expiresAt = currentTime + 10 * 60 * 1000;
        pendingUser.lastSentTime = currentTime;

        await sendVerificationEmail(cleanEmail, verificationCode);
        res.json({ success: true, message: 'New verification code sent successfully!' });
    } catch (error) {
        console.error('Resend Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error while resending email.' });
    }
});

// 3. Verify Code Route
app.post('/api/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ success: false, message: 'Email and code are required.' });

        const cleanEmail = email.trim().toLowerCase();
        const pendingUser = pendingUsers[cleanEmail];
        if (!pendingUser) {
            return res.status(400).json({ success: false, message: 'Session expired. Please sign up again.' });
        }

        const currentTime = Date.now();

        if (pendingUser.lockUntil) {
            if (currentTime < pendingUser.lockUntil) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Too many incorrect attempts.',
                    lockUntil: pendingUser.lockUntil
                });
            } else {
                pendingUser.signupAttempts = 0;
                pendingUser.lockUntil = undefined;
            }
        }

        if (currentTime > pendingUser.expiresAt) {
            delete pendingUsers[cleanEmail];
            return res.status(400).json({ success: false, message: 'Verification code has expired.' });
        }

        if (pendingUser.verificationCode !== code.trim()) {
            pendingUser.signupAttempts = (pendingUser.signupAttempts || 0) + 1;
            
            if (pendingUser.signupAttempts >= 5) {
                pendingUser.lockUntil = currentTime + (60 * 60 * 1000);
                return res.status(400).json({ 
                    success: false, 
                    message: 'Too many incorrect attempts.',
                    lockUntil: pendingUser.lockUntil
                });
            }

            return res.status(400).json({ 
                success: false, 
                message: `Invalid verification code! Attempt ${pendingUser.signupAttempts} of 5.` 
            });
        }

        const newUser = new User({ email: cleanEmail, password: pendingUser.password, isVerified: true });
        await newUser.save();
        delete pendingUsers[cleanEmail];

        res.json({ success: true, message: 'Account verified successfully!' });
    } catch (error) {
        console.error('Verification Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error during verification.' });
    }
});

// 4. Signin Route
app.post('/api/signin', async (req, res) => {
    try {
        const { email, password } = req.body; 
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email/phone and password.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({
            $or: [{ email: cleanEmail }, { phone: cleanEmail }]
        });

        const currentTime = Date.now();

        if (user) {
            if (user.lockUntil && currentTime < user.lockUntil) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Account is temporarily locked.',
                    lockUntil: user.lockUntil
                });
            } else if (user.lockUntil && currentTime >= user.lockUntil) {
                user.loginAttempts = 0;
                user.lockUntil = undefined;
                await user.save();
            }
        }

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid email/phone or password.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) {
                user.lockUntil = currentTime + (60 * 60 * 1000);
            }
            await user.save();
            
            if (user.lockUntil) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Account is temporarily locked.',
                    lockUntil: user.lockUntil
                });
            }

            return res.status(400).json({ success: false, message: 'Invalid email/phone or password.' });
        }

        user.loginAttempts = 0;
        user.lockUntil = undefined;

        const loginOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const uniqueId = Date.now();

        user.verificationCode = loginOtp;
        user.verificationCodeExpire = currentTime + (10 * 60 * 1000); 
        await user.save();

        const htmlContent = `
        <div style="background-color: #0c0c0c; padding: 40px 20px; font-family: sans-serif; color: #ffffff;">
            <div style="max-width: 550px; margin: auto; background-color: #141414; border: 1px solid #262626; border-radius: 12px; padding: 30px; text-align: center;">
                <h2 style="color: #d4af37;">Sign In Verification</h2>
                <p style="color: #b0b0b0;">Your verification code to complete sign in is:</p>
                <h1 style="color: #f3c653; font-size: 38px; letter-spacing: 5px; margin: 20px 0;">${loginOtp}</h1>
                <p style="color: #b0b0b0;">This code expires in 10 minutes.</p>
            </div>
        </div>`;

        sendEmailViaBrevo({
            to: user.email,
            subject: `Sign In Verification — Code: ${loginOtp} (#${uniqueId})`,
            htmlContent
        }).catch(err => console.error('Email send error:', err));

        return res.status(200).json({ 
            success: true, 
            requiresVerification: true, 
            email: user.email, 
            message: 'Verification code sent to your email.' 
        });

    } catch (error) {
        console.error('Signin Error:', error);
        res.status(500).json({ success: false, message: 'Server error during signin.' });
    }
});

// 5. Verify Sign In OTP Route
app.post('/api/verify-login-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({
            $or: [{ email: cleanEmail }, { phone: cleanEmail }],
            verificationCode: otp.trim(),
            verificationCodeExpire: { $gt: Date.now() } 
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
        }

        user.verificationCode = undefined;
        user.verificationCodeExpire = undefined;
        await user.save();

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ 
            success: true, 
            token, 
            message: 'Sign in verified successfully.',
            redirectUrl: 'dashboard.html' 
        });

    } catch (error) {
        console.error('OTP Verification Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error during verification.' });
    }
});

// 6. Resend Login OTP Route
app.post('/api/resend-code', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({
            $or: [{ email: cleanEmail }, { phone: cleanEmail }]
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const newLoginOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const uniqueId = Date.now();

        user.verificationCode = newLoginOtp;
        user.verificationCodeExpire = Date.now() + (10 * 60 * 1000); 
        await user.save();

        const htmlContent = `
        <div style="background-color: #0c0c0c; padding: 40px 20px; font-family: sans-serif; color: #ffffff;">
            <div style="max-width: 550px; margin: auto; background-color: #141414; border: 1px solid #262626; border-radius: 12px; padding: 30px; text-align: center;">
                <h2 style="color: #d4af37;">Sign In Verification</h2>
                <p style="color: #b0b0b0;">Your new verification code is:</p>
                <h1 style="color: #f3c653; font-size: 38px; letter-spacing: 5px; margin: 20px 0;">${newLoginOtp}</h1>
                <p style="color: #b0b0b0;">This code expires in 10 minutes.</p>
            </div>
        </div>`;

        sendEmailViaBrevo({
            to: user.email,
            subject: `Resend Sign In Verification — Code: ${newLoginOtp} (#${uniqueId})`,
            htmlContent
        }).catch(err => console.error('Resend Email error:', err));

        res.json({ success: true, message: 'New verification code sent successfully.' });
    } catch (error) {
        console.error('Resend Login OTP Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error while resending code.' });
    }
});

// 7. Google Auth Route
app.post('/api/google-auth', async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await googleClient.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
        const email = ticket.getPayload().email.toLowerCase();

        let user = await User.findOne({ email });
        if (user) {
            return res.json({ success: true, exists: true, email, redirectUrl: 'dashboard.html', message: 'Account exists.' });
        } else {
            return res.json({ success: true, exists: false, email, redirectUrl: 'signup.html', message: 'Account not found.' });
        }
    } catch (error) {
        console.error('Google Auth Error:', error);
        res.status(500).json({ success: false, message: 'Google authentication failed.' });
    }
});

// 8. Forgot Password Route
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Please provide an email address.' });

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({ email: cleanEmail });
        if (!user) {
            return res.status(400).json({ success: false, message: 'This email is not registered in our system.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const timestamp = Date.now();
        
        user.resetToken = resetToken;
        user.resetTokenExpire = timestamp + (15 * 60 * 1000);
        await user.save();

        const host = req.get('host');
        const protocol = req.protocol;
        const resetLink = `${protocol}://${host}/reset-password.html?token=${resetToken}&t=${timestamp}`;
        const uniqueId = Date.now();

        const htmlContent = `
        <style>
            .reset-btn { background-color: #d4af37; color: #111; padding: 12px 20px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block; margin-top: 20px; }
        </style>
        <div style="background-color: #0c0c0c; padding: 40px 20px; font-family: sans-serif; color: #ffffff;">
            <div style="max-width: 550px; margin: auto; background-color: #141414; border: 1px solid #262626; border-radius: 12px; padding: 30px; text-align: center;">
                <h2 style="color: #d4af37;">Password Reset Request</h2>
                <p style="color: #b0b0b0;">Click the button below to reset your password. This link expires in 15 minutes.</p>
                <a href="${resetLink}" class="reset-btn">Reset Password</a>
            </div>
        </div>`;

        sendEmailViaBrevo({
            to: cleanEmail,
            subject: `Password Reset Request (#${uniqueId})`,
            htmlContent
        }).catch(err => console.error('Reset Email error:', err));
        
        res.json({ success: true, message: 'Password reset link sent to your email.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error while processing request.' });
    }
});

// 9. Reset Password Confirmation Route
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ success: false, message: 'Token and new password are required.' });
        }

        const user = await User.findOne({
            resetToken: token,
            resetTokenExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.'});
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.resetToken = undefined;
        user.resetTokenExpire = undefined;
        await user.save();

        res.json({ success: true, message: 'Password has been successfully reset. You can now sign in.' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error during password reset.' });
    }
});

// ==========================================
// TBR Exchange - KYC & User Profile Routes
// ==========================================

app.get('/api/auth/me', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                kycStatus: user.kycStatus || 'pending',
                isVerified: user.isVerified || false
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/kyc/submit', async (req, res) => {
    try {
        const { userId, fullName, idNumber, dob, address, docType, frontImage, backImage, selfieImage, email } = req.body;

        if (!fullName || !frontImage || !selfieImage) {
            return res.status(400).json({ success: false, message: 'እባክዎ አስፈላጊዎቹን መረጃዎች እና ፎቶዎች በትክክል ይሙሉ!' });
        }

        const newKyc = new KYC({
            userId: userId || null,
            fullName,
            idNumber,
            dob,
            address,
            docType: docType || 'national_id',
            frontImage,
            backImage,
            selfieImage,
            email: email || '',
            status: 'pending'
        });

        await newKyc.save();

        if (userId) {
            await User.findByIdAndUpdate(userId, { kycStatus: 'pending' });
        }

        res.status(200).json({ 
            success: true, 
            status: 'pending', 
            message: 'የ KYC መረጃዎ በትክክል ተልኳል! አድሚኑ እስኪያጸድቀው ድረስ በትዕግስት ይጠብቁ።' 
        });
    } catch (err) {
        console.error('KYC Submit Error:', err);
        res.status(500).json({ success: false, message: 'ሰርቨር ላይ ስህተት ተፈጥሯል' });
    }
});

// Admin: Get all KYC requests
app.get('/api/admin/kyc/pending', async (req, res) => {
    try {
        const pendingList = await KYC.find({})
            .select('-frontImage -backImage -selfieImage') // ግዙፍ ፎቶዎችን አናመጣም
            .lean(); // ፈጣን እንዲሆን
            
        pendingList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.status(200).json({ success: true, data: pendingList });
    } catch (error) {
        console.error('Fetch KYC Error:', error);
        res.status(500).json({ success: false, message: 'መረጃዎችን ማምጣት አልተቻለም' });
    }
});

// Admin: Get Single KYC Details by ID (የጠፍቶ የነበረው እና ሞዳሉን የሚያስተካክለው)
app.get('/api/admin/kyc/:id', async (req, res) => {
    try {
        const kycId = req.params.id;
        const kycRecord = await KYC.findById(kycId) || await KYCModel.findById(kycId);
        
        if (!kycRecord) {
            return res.status(404).json({ success: false, message: 'የ KYC መዝገብ አልተገኘም' });
        }

        res.status(200).json({ success: true, data: kycRecord });
    } catch (error) {
        console.error('Fetch Single KYC Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/kyc/approve/:id', async (req, res) => {
    try {
        const kycId = req.params.id;
        const kycRecord = await KYC.findById(kycId) || await KYCModel.findById(kycId);
        
        if (!kycRecord) {
            return res.status(404).json({ success: false, message: 'የ KYC መዝገብ አልተገኘም' });
        }

        kycRecord.status = 'approved';
        await kycRecord.save();
        
        const targetUserId = kycRecord.userId || kycRecord.user;
        
        if (targetUserId) {
            await User.findByIdAndUpdate(targetUserId, { kycStatus: 'verified', isVerified: true });
        }
        
        return res.json({ success: true, message: 'KYC approved successfully.' });
    } catch (error) {
        console.error('Approve KYC Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// የተስተካከለ አጠቃላይ የ KYC Approve እና Reject ሮውቶች (ሁሉንም የጥያቄ አይነቶች በድብቅ ይይዛል)
app.put(['/api/admin/kyc/:id', '/api/admin/kyc/approve/:id', '/api/admin/kyc/reject/:id'], async (req, res) => {
    try {
        const kycId = req.params.id;
        // ፍሮንትኤንዱ ከላከው አካል ስቴተሱን እንወስዳለን፣ ከሌለም ከዩአርኤሉ እንለያለን
        let status = req.body.status;
        if (req.url.includes('approve')) status = 'approved';
        if (req.url.includes('reject')) status = 'rejected';
        
        if (!status) status = 'approved'; // ነባሪ (Default)

        const kycRecord = await KYC.findById(kycId);
        
        if (!kycRecord) {
            return res.status(404).json({ success: false, message: 'የ KYC መዝገብ አልተገኘም' });
        }

        kycRecord.status = status;
        if (status === 'rejected') {
            kycRecord.rejectionReason = req.body.reason || 'Rejected by admin';
        } else {
            kycRecord.rejectionReason = '';
        }
        await kycRecord.save();
        
        // ዩዘሩን ለማግኘት ሁለቱንም ሊሆኑ የሚችሉ ቁልፎች እንፈትሻለን (userId ወይም user)
        const targetUserId = kycRecord.userId || kycRecord.user;
        
        if (targetUserId) {
            await User.findByIdAndUpdate(targetUserId, { 
                kycStatus: status === 'approved' ? 'verified' : status,
                isVerified: status === 'approved'
            });
        }
        
        return res.json({ success: true, message: `KYC ${status} successfully.` });
    } catch (error) {
        console.error('KYC Action Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ለ POST ጥያቄዎች የሚሆን (አንዳንዴ ፍሮንትኤንዱ POST ሊጠቀም ስለሚችል)
app.post(['/api/admin/kyc/:id/approve', '/api/admin/kyc/:id/reject', '/api/admin/kyc-action'], async (req, res) => {
    try {
        const kycId = req.body.kycId || req.body.id || req.params.id;
        let action = req.body.action;
        if (req.url.includes('approve')) action = 'approved';
        if (req.url.includes('reject')) action = 'rejected';

        const kycRecord = await KYC.findById(kycId);
        if (!kycRecord) {
            return res.status(404).json({ success: false, message: 'የ KYC መዝገብ አልተገኘም' });
        }

        kycRecord.status = action;
        await kycRecord.save();

        const targetUserId = kycRecord.userId || kycRecord.user;
        if (targetUserId) {
            await User.findByIdAndUpdate(targetUserId, { 
                kycStatus: action === 'approved' ? 'verified' : action,
                isVerified: action === 'approved'
            });
        }

        res.json({ success: true, message: `KYC successfully ${action}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.patch('/api/admin/kyc/:id', async (req, res) => {
    try {
        const kycId = req.params.id;
        const kycDoc = await KYC.findByIdAndUpdate(kycId, { status: 'approved', rejectionReason: '' }, { new: true }) 
                    || await KYCModel.findByIdAndUpdate(kycId, { status: 'approved', rejectionReason: '' }, { new: true });
        
        if (kycDoc && kycDoc.userId) {
            await User.findByIdAndUpdate(kycDoc.userId, { kycStatus: 'verified', isVerified: true });
        }

        res.json({ success: true, message: 'KYC approved successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/kyc/approve/:id', async (req, res) => {
    try {
        const kycId = req.params.id;
        const kycRecord = await KYC.findById(kycId) || await KYCModel.findById(kycId);
        
        if (!kycRecord) {
            return res.status(404).json({ success: false, message: 'የ KYC መዝገብ አልተገኘም' });
        }

        kycRecord.status = 'approved';
        kycRecord.rejectionReason = '';
        await kycRecord.save();
        
        if (kycRecord.userId) {
            await User.findByIdAndUpdate(kycRecord.userId, { kycStatus: 'verified', isVerified: true });
        }
        
        return res.json({ success: true, message: 'KYC approved successfully.' });
    } catch (error) {
        console.error('Approve KYC Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/kyc/reject/:id', async (req, res) => {
    try {
        const kycId = req.params.id;
        const kycRecord = await KYC.findById(kycId) || await KYCModel.findById(kycId);
        
        if (!kycRecord) {
            return res.status(404).json({ success: false, message: 'የ KYC መዝገብ አልተገኘም' });
        }

        kycRecord.status = 'rejected';
        kycRecord.rejectionReason = req.body.reason || 'Rejected by admin';
        await kycRecord.save();
        
        if (kycRecord.userId) {
            await User.findByIdAndUpdate(kycRecord.userId, { kycStatus: 'rejected', isVerified: false });
        }
        
        return res.json({ success: true, message: 'KYC rejected.' });
    } catch (error) {
        console.error('Reject KYC Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post(['/api/admin/users/unlock', '/api/admin/unlock-account'], async (req, res) => {
    try {
        const { identifier, userId } = req.body;
        const targetId = identifier || userId;
        
        if (!targetId) {
            return res.status(400).json({ success: false, message: 'User identifier is required' });
        }

        const query = {
            $or: [{ email: targetId }, { phone: targetId }]
        };
        if (mongoose.isValidObjectId(targetId)) {
            query.$or.push({ _id: targetId });
        }

        const user = await User.findOne(query);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.loginAttempts = 0;
        user.lockUntil = undefined;
        await user.save();

        res.json({ success: true, message: 'User account unlocked successfully' });
    } catch (error) {
        console.error('Unlock Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});