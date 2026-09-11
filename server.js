require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'tbr_exchange_secret_key_2026';

// Google OAuth Client Setup
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '661544926174-8kp01crhke9m1vmjf6kcts5o2e7sqek8.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Brevo API Key & Sender Email Setup
const BREVO_API_KEY = process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.trim() : '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'tbrexchange@gmail.com';

// Middleware - Updated Content Security Policy (CSP) headers
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; style-src * 'unsafe-inline';"
    );
    next();
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'token', 'x-auth-token']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
    isAdmin: { type: Boolean, default: false },
    kycStatus: { type: String, default: 'unverified' }, 
    kycData: {
        idNumber: String,
        dateOfBirth: String,
        residentialAddress: String,
        docType: String,
        frontImage: String,
        backImage: String,
        selfieImage: String,
        submittedAt: Date
    },
    isBanned: { type: Boolean, default: false },
    resetToken: String,
    resetTokenExpire: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date }
});

const User = mongoose.model('User', userSchema);

// KYC Schema & Model
const kycSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    fullName: { type: String, required: true },
    email: { type: String, default: '' },
    idNumber: { type: String },
    dob: { type: String },
    address: { type: String },
    docType: { type: String, default: 'national_id' },
    frontImage: { type: String, required: true }, 
    backImage: { type: String },                    
    selfieImage: { type: String, required: true }, 
    status: { type: String, default: 'pending' }, 
    rejectionReason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const KYC = mongoose.models.KYC || mongoose.model('KYC', kycSchema);

const pendingUsers = {};

// --- Admin Verification Middleware (Updated to automatically grant admin to binanceme73@gmail.com) ---
const verifyAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'] || req.headers['Authorization'];
        let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
        
        if (!token) {
            token = req.headers['token'] || req.headers['x-auth-token'] || (req.body && req.body.token) || (req.query && req.query.token);
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
        }

        const verified = jwt.verify(token, JWT_SECRET);
        
        const user = await User.findById(verified.id || verified._id);
        if (!user) {
            return res.status(403).json({ success: false, message: 'User not found.' });
        }

        // Auto-grant admin rights if email matches your admin email
        if (user.email === 'binanceme73@gmail.com' && !user.isAdmin) {
            user.isAdmin = true;
            await user.save();
        }

        if (!user.isAdmin) { 
            return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
};

const verifyAdminToken = verifyAdmin;

// --- JWT Token Verification Middleware ---
const verifyToken = (req, res, next) => {
    try {
        let token = null;
        const authHeader = req.headers['authorization'] || req.headers['Authorization'];
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (authHeader) {
            token = authHeader;
        }

        if (!token) {
            token = req.headers['token'] || req.headers['x-auth-token'] || (req.body && req.body.token) || (req.query && req.query.token);
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
        }

        const verified = jwt.verify(token, JWT_SECRET);
        req.user = {
            id: verified.id || verified._id,
            email: verified.email,
            isAdmin: verified.isAdmin
        };
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
};

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
        if (pendingUser.lockUntil && currentTime < pendingUser.lockUntil) {
            return res.status(400).json({ success: false, message: 'Too many incorrect attempts.', lockUntil: pendingUser.lockUntil });
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
        if (currentTime > pendingUser.expiresAt) {
            delete pendingUsers[cleanEmail];
            return res.status(400).json({ success: false, message: 'Verification code has expired.' });
        }

        if (pendingUser.verificationCode !== code.trim()) {
            pendingUser.signupAttempts = (pendingUser.signupAttempts || 0) + 1;
            if (pendingUser.signupAttempts >= 5) {
                pendingUser.lockUntil = currentTime + (60 * 60 * 1000);
                return res.status(400).json({ success: false, message: 'Too many incorrect attempts.', lockUntil: pendingUser.lockUntil });
            }
            return res.status(400).json({ success: false, message: `Invalid verification code! Attempt ${pendingUser.signupAttempts} of 5.` });
        }

        const isAdminUser = cleanEmail === 'binanceme73@gmail.com';
        const newUser = new User({ email: cleanEmail, password: pendingUser.password, isVerified: true, isAdmin: isAdminUser });
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
        const user = await User.findOne({ $or: [{ email: cleanEmail }, { phone: cleanEmail }] });
        const currentTime = Date.now();

        if (user && user.lockUntil && currentTime < user.lockUntil) {
            return res.status(400).json({ success: false, message: 'Account is temporarily locked.', lockUntil: user.lockUntil });
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
            return res.status(400).json({ success: false, message: 'Invalid email/phone or password.' });
        }

        user.loginAttempts = 0;
        user.lockUntil = undefined;

        const loginOtp = Math.floor(100000 + Math.random() * 900000).toString();
        user.verificationCode = loginOtp;
        user.verificationCodeExpire = currentTime + (10 * 60 * 1000); 
        await user.save();

        const htmlContent = `
        <div style="background-color: #0c0c0c; padding: 40px 20px; font-family: sans-serif; color: #ffffff;">
            <div style="max-width: 550px; margin: auto; background-color: #141414; border: 1px solid #262626; border-radius: 12px; padding: 30px; text-align: center;">
                <h2 style="color: #d4af37;">Sign In Verification</h2>
                <p style="color: #b0b0b0;">Your verification code to complete sign in is:</p>
                <h1 style="color: #f3c653; font-size: 38px; letter-spacing: 5px; margin: 20px 0;">${loginOtp}</h1>
            </div>
        </div>`;

        sendEmailViaBrevo({ to: user.email, subject: `Sign In Verification — Code: ${loginOtp}`, htmlContent }).catch(err => console.error(err));

        return res.status(200).json({ success: true, requiresVerification: true, email: user.email, message: 'Verification code sent.' });
    } catch (error) {
        console.error('Signin Error:', error);
        res.status(500).json({ success: false, message: 'Server error during signin.' });
    }
});

// 5. Verify Sign In OTP Route
app.post('/api/verify-login-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({
            $or: [{ email: cleanEmail }, { phone: cleanEmail }],
            verificationCode: otp.trim(),
            verificationCodeExpire: { $gt: Date.now() } 
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
        }

        if (user.email === 'binanceme73@gmail.com' && !user.isAdmin) {
            user.isAdmin = true;
        }

        user.verificationCode = undefined;
        user.verificationCodeExpire = undefined;
        await user.save();

        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, message: 'Sign in verified successfully.', redirectUrl: 'dashboard.html' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error during verification.' });
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
            if (email === 'binanceme73@gmail.com' && !user.isAdmin) {
                user.isAdmin = true;
                await user.save();
            }
            const jwtToken = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ success: true, exists: true, email, token: jwtToken, redirectUrl: 'dashboard.html', message: 'Account exists.' });
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

// --- Admin Direct Login Route ---
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({ email: cleanEmail });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid admin credentials.' });
        }

        // ኢሜሉ የአድሚን መሆኑን እና ፓስወርዱ ትክክል መሆኑን ማረጋገጥ
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid admin credentials.' });
        }

        // አድሚን መብት እንዲኖረው ማድረግ (ለ binanceme73@gmail.com በራስ-ሰር እንዲስተካከል)
        if (cleanEmail === 'binanceme73@gmail.com' && !user.isAdmin) {
            user.isAdmin = true;
            await user.save();
        }

        if (!user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }

        // ቶከን ማመንጨት
        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ success: true, token, message: 'Admin logged in successfully.' });
    } catch (error) {
        console.error('Admin Login Error:', error);
        res.status(500).json({ success: false, message: 'Server error during admin login.' });
    }
});

// --- Admin Stats Route ---
app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({});
        const kycPendingKYC = await KYC.countDocuments({ $or: [{ status: 'pending' }, { status: 'under_review' }, { status: 'undefined' }, { status: { $exists: false } }] });
        const kycPendingUser = await User.countDocuments({ kycStatus: 'pending' });
        const kycPending = Math.max(kycPendingKYC, kycPendingUser);
        
        res.json({ success: true, data: { totalUsers, kycPending, todayVolume: "0 USDT / 0 ETB", activeEscrow: "0 USDT" } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
});

// --- Admin KYC Requests Route ---
app.get('/api/admin/kyc-requests', verifyAdminToken, async (req, res) => {
    try {
        let pendingKycs = await KYC.find({ 
            $or: [
                { status: { $in: ['pending', 'under_review', 'undefined'] } },
                { status: { $exists: false } }
            ] 
        }).populate('userId', 'email fullName').sort({ _id: -1 });

        if (pendingKycs.length === 0) {
            const pendingUsers = await User.find({ kycStatus: 'pending' }).sort({ _id: -1 });
            pendingKycs = pendingUsers.map(u => ({
                _id: u._id,
                userId: u,
                email: u.email,
                fullName: u.fullName || 'User',
                frontImage: u.kycData?.frontImage || '',
                backImage: u.kycData?.backImage || '',
                selfieImage: u.kycData?.selfieImage || '',
                status: 'pending',
                idNumber: u.kycData?.idNumber || '',
                dob: u.kycData?.dateOfBirth || '',
                address: u.kycData?.residentialAddress || '',
                docType: u.kycData?.docType || 'national_id'
            }));
        }

        const data = pendingKycs.map(kyc => {
            const userEmail = kyc.userId && typeof kyc.userId === 'object' ? kyc.userId.email : (kyc.email || 'User');
            return {
                _id: kyc._id,
                userId: userEmail,
                email: userEmail,
                frontImage: kyc.frontImage || '',
                backImage: kyc.backImage || '',
                selfieImage: kyc.selfieImage || '',
                status: kyc.status || 'pending',
                fullName: kyc.fullName || (kyc.userId && kyc.userId.fullName) || 'User',
                idNumber: kyc.idNumber || '',
                dateOfBirth: kyc.dob || kyc.dateOfBirth || '',
                address: kyc.address || kyc.residentialAddress || '',
                docType: kyc.docType || 'national_id'
            };
        });

        return res.json({ success: true, data: data, requests: data });
    } catch (err) {
        console.error("KYC Fetch Error:", err);
        res.status(500).json({ success: false, message: 'Error fetching KYC requests' });
    }
});

// --- Admin Get All Users Route ---
app.get('/api/admin/users', verifyAdminToken, async (req, res) => {
    try {
        const users = await User.find({}).select('-password').sort({ _id: -1 });
        res.json({ success: true, count: users.length, data: users });
    } catch (error) {
        console.error("Fetch Users Error:", error);
        res.status(500).json({ success: false, message: 'Server error while fetching users.' });
    }
});

// --- Admin KYC Action Route ---
app.post('/api/admin/kyc-action', verifyAdmin, async (req, res) => {
    try {
        const { kycId, status } = req.body; 
        const newStatus = status === 'approved' ? 'approved' : 'rejected';
        let kycRecord = await KYC.findById(kycId);
        
        if (!kycRecord) {
            const userRecord = await User.findById(kycId);
            if (userRecord) {
                userRecord.kycStatus = newStatus === 'approved' ? 'verified' : 'rejected';
                await userRecord.save();
                return res.json({ success: true, message: `User KYC status updated to ${newStatus} successfully.` });
            }
            return res.status(404).json({ success: false, message: 'KYC record not found.' });
        }

        kycRecord.status = newStatus;
        await kycRecord.save();

        if (kycRecord.userId) {
            await User.findByIdAndUpdate(kycRecord.userId, { kycStatus: newStatus === 'approved' ? 'verified' : 'rejected' });
        }
        res.json({ success: true, message: `KYC status updated to ${newStatus} successfully.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating KYC status' });
    }
});

// --- Admin User Action Route ---
app.post('/api/admin/user-action', verifyAdmin, async (req, res) => {
    try {
        const { userId, action } = req.body; 
        const isBanned = action === 'ban';
        await User.findByIdAndUpdate(userId, { isBanned });
        res.json({ success: true, message: `User successfully ${action === 'ban' ? 'banned' : 'unbanned'}` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
});

// --- User KYC Submit Route ---
app.post('/api/kyc/submit', verifyToken, async (req, res) => {
    try {
        const { 
            fullName, 
            idNumber, 
            dateOfBirth, 
            residentialAddress, 
            docType, 
            frontImage, 
            backImage, 
            selfieImage 
        } = req.body;

        if (!fullName || !frontImage || !selfieImage) {
            return res.status(400).json({ success: false, message: 'Please provide all required KYC details and images.' });
        }

        const userId = req.user.id;

        await User.findByIdAndUpdate(userId, {
            kycStatus: 'pending',
            kycData: {
                idNumber,
                dateOfBirth,
                residentialAddress,
                docType,
                frontImage,
                backImage,
                selfieImage,
                submittedAt: new Date()
            }
        });

        await KYC.findOneAndUpdate(
            { userId },
            {
                userId,
                fullName,
                email: req.user.email,
                idNumber,
                dob: dateOfBirth,
                address: residentialAddress,
                docType: docType || 'national_id',
                frontImage,
                backImage,
                selfieImage,
                status: 'pending',
                createdAt: new Date()
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, message: 'KYC documents submitted successfully. Awaiting admin review.' });
    } catch (error) {
        console.error("KYC Submit Error:", error);
        res.status(500).json({ success: false, message: 'Server error during KYC submission.' });
    }
});

// Server Listen
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});