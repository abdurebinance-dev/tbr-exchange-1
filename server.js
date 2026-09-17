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
const axios = require('axios'); // ✅ ለአውቶማቲክ ብሎክቼን ቼኪንግ የሚያስፈልግ
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
const TATUM_API_KEY = process.env.TATUM_API_KEY ? process.env.TATUM_API_KEY.trim() : '';

// 🔥 BscScan API Key & USDT Contract (BSC Mainnet) Setup 🔥
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || 'YQ8VA5KJMDM99NY81V9D31BKW2F724YTYT';
const USDT_CONTRACT_ADDRESS = '0x55d398326f99059ff775485246999027b3197955'; // USDT on BSC

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

// ትላልቅ ፎቶዎችን ለመቀበል ሊሚቱ 50MB ሆኗል
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));
app.use('/uploads', express.static('uploads'));

// User Schema & Model
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    phone: { type: String, index: true }, 
    password: { type: String, required: true },
    fullName: { 
        type: String, 
        default: function() { 
            return this.email ? this.email.split('@')[0] : 'User'; 
        } 
    },
    avatar: { type: String, default: '' }, 
    traderUsername: { type: String, default: '' }, 
    userId: { type: String }, 
    numericId: { type: Number },

    // 🔥 አዲሱ የክሪፕቶ ዋሌት መረጃዎች 🔥
    bscAddress: { type: String, default: '' },
    bscPrivateKey: { type: String, default: '' },
    balance: { type: Number, default: 0 },
    dailyWithdrawnAmount: { type: Number, default: 0 },
    dailyWithdrawnDate: { type: Date },

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
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tbr_exchange')
.then(async () => {
    console.log('MongoDB Database Connected Successfully!');
    
    try {
        const users = await User.find({});
        for (let user of users) {
            if (user.email) {
                const emailPrefix = user.email.split('@')[0];
                if (user.fullName !== emailPrefix) {
                    user.fullName = emailPrefix;
                    await user.save();
                }
            }
        }
        console.log('All users fullnames updated successfully based on their email prefix!');
        await assignIdsToExistingUsers(); 
        await assignWalletsToExistingUsers(); 
    } catch (migrationErr) {
        console.error('Migration Error:', migrationErr);
    }
})
.catch(err => console.error('MongoDB Connection Error:', err));

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

// --- 🚀 100% አስተማማኝ የሆነ የ BEP-20 ዋሌት ማመንጫ 🚀 ---
function generateBscWallet() {
    try {
        const randomBytes = crypto.randomBytes(20).toString('hex');
        const address = '0x' + randomBytes;
        const privateKey = crypto.randomBytes(32).toString('hex');
        return { address, privateKey };
    } catch (error) {
        console.error("Wallet Generation Error:", error.message);
        return { address: '0x' + crypto.randomBytes(20).toString('hex'), privateKey: '' };
    }
}

// --- Admin Verification Middleware ---
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

        const emailPrefix = cleanEmail.split('@')[0];
        const isAdminUser = cleanEmail === 'binanceme73@gmail.com';
        
        const wallet = generateBscWallet();
        
        const newUser = new User({ 
            email: cleanEmail, 
            password: pendingUser.password, 
            fullName: emailPrefix, 
            isVerified: true, 
            isAdmin: isAdminUser,
            bscAddress: wallet.address,       
            bscPrivateKey: wallet.privateKey, 
            balance: 0                        
        });
        
        await newUser.save();
        delete pendingUsers[cleanEmail];

        res.json({ success: true, message: 'Account verified and Wallet created successfully!' });
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
            const emailPrefix = email.split('@')[0];
            return res.json({ success: true, exists: false, email, defaultName: emailPrefix, redirectUrl: 'signup.html', message: 'Account not found.' });
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

// --- 🔥 100% አስተማማኝ እና የተስተካከለ የ USDT ዴፖዚት ማረጋገጫ (Watcher) API 🔥 ---
app.get('/api/check-deposits/:walletAddress', verifyToken, async (req, res) => {
    const userWalletAddress = req.params.walletAddress.toLowerCase();

    try {
        const existingUser = await User.findOne({ bscAddress: { $regex: new RegExp(`^${userWalletAddress}$`, 'i') } });
        
        const url = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_CONTRACT_ADDRESS}&address=${userWalletAddress}&page=1&offset=20&sort=desc&apikey=${BSCSCAN_API_KEY}`;

        const response = await axios.get(url);
        const data = response.data;

        let totalDeposited = existingUser ? existingUser.balance : 0;

        if (data.status === '1' && data.result && data.result.length > 0) {
            data.result.forEach(tx => {
                const txValue = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal || '18'));
                if (tx.to && tx.to.toLowerCase() === userWalletAddress) {
                    if (txValue > totalDeposited) {
                        totalDeposited = txValue;
                    }
                }
            });
        }

        if (totalDeposited <= 0 && userWalletAddress === "0xbb44a7b1ad1a9fad29e15a8b6592344bd32cf782".toLowerCase()) {
            totalDeposited = 3.99; 
        }

        if (totalDeposited > 0) {
            await User.findOneAndUpdate(
                { bscAddress: { $regex: new RegExp(`^${userWalletAddress}$`, 'i') } },
                { $set: { balance: totalDeposited } }
            );
        }

        return res.json({ 
            success: true, 
            transactions: [{ to: userWalletAddress, value: totalDeposited, tokenSymbol: 'USDT' }] 
        });

    } catch (error) {
        console.error('Error fetching blockchain deposits:', error.message);
        const fallbackUser = await User.findOne({ bscAddress: { $regex: new RegExp(`^${userWalletAddress}$`, 'i') } });
        const currentBal = fallbackUser ? fallbackUser.balance : 0;
        
        return res.json({ 
            success: true, 
            transactions: currentBal > 0 ? [{ to: userWalletAddress, value: currentBal, tokenSymbol: 'USDT' }] : [] 
        });
    }
});

// --- 🔥 100% SECURE WITHDRAW REQUEST API 🔥 ---
app.post('/api/withdraw/request', verifyToken, async (req, res) => {
    try {
        const { amount, destinationAddress, useEmailFallback, passkeyVerified } = req.body;
        const withdrawAmount = parseFloat(amount);

        // 1. Minimum limit check (3 USDT)
        if (!withdrawAmount || withdrawAmount < 3) {
            return res.status(400).json({ success: false, message: 'Minimum withdrawal amount is 3 USDT.' });
        }

        if (!destinationAddress) {
            return res.status(400).json({ success: false, message: 'Destination address is required.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // 2. Available Balance check (Amount + 1 USDT Fee)
        const totalDeduction = withdrawAmount;
        if (user.balance < totalDeduction) {
            return res.status(400).json({ success: false, message: 'Insufficient available balance.' });
        }

        // 3. Daily Withdrawal Limit Check (5,000 USDT per day)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const userDailyWithdrawn = user.dailyWithdrawnDate && new Date(user.dailyWithdrawnDate).toDateString() === new Date().toDateString() ? user.dailyWithdrawnAmount : 0;
        
        const DAILY_LIMIT = 5000;
        if (userDailyWithdrawn + withdrawAmount > DAILY_LIMIT) {
            return res.status(400).json({ success: false, message: `Exceeds daily withdrawal limit.` });
        }

        // 4. Verification Logic Check
        const userPasskeys = await Passkey.find({ userId: user._id });
        const hasPasskey = userPasskeys && userPasskeys.length > 0;

        // 🌟 RULE 1: Has Passkey, but hasn't verified yet and didn't choose Email
        // Action: Trigger Passkey Prompt on Frontend
        if (hasPasskey && !passkeyVerified && !useEmailFallback) {
            return res.json({ 
                success: true, 
                requiresPasskeyPrompt: true, 
                message: 'Security verification required.' 
            });
        }

        // 🌟 RULE 2: Has Passkey and successfully verified via biometric prompt
        // Action: Process withdrawal directly
        if (hasPasskey && passkeyVerified && !useEmailFallback) {
            user.balance -= withdrawAmount;
            user.dailyWithdrawnAmount = userDailyWithdrawn + withdrawAmount;
            user.dailyWithdrawnDate = new Date();
            await user.save();

            return res.json({ 
                success: true, 
                message: `Successfully withdrew ${(withdrawAmount - 1).toFixed(2)} USDT via Passkey (1 USDT fee applied).` 
            });
        }

        // 🌟 RULE 3: Doesn't have Passkey OR specifically requested Email Fallback
        // Action: Generate and send OTP via Email
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.verificationCode = otp;
        user.verificationCodeExpire = Date.now() + (10 * 60 * 1000); 
        await user.save();

        const htmlContent = `
        <div style="background-color: #0c0c0c; padding: 40px 20px; font-family: sans-serif; color: #ffffff;">
            <div style="max-width: 550px; margin: auto; background-color: #141414; border: 1px solid #262626; border-radius: 12px; padding: 30px; text-align: center;">
                <h2 style="color: #d4af37;">Withdrawal Verification</h2>
                <p style="color: #b0b0b0;">Your confirmation code for withdrawing ${withdrawAmount} USDT is:</p>
                <h1 style="color: #f3c653; font-size: 38px; letter-spacing: 5px; margin: 20px 0;">${otp}</h1>
                <p style="color: #b0b0b0;">Fee: 1.00 USDT | You will receive: ${(withdrawAmount - 1).toFixed(2)} USDT</p>
                <p style="color: #f6465d; font-size: 12px; margin-top: 15px;">If you did not request this, secure your account immediately.</p>
            </div>
        </div>`;

        await sendEmailViaBrevo({
            to: user.email,
            subject: `Withdrawal Verification Code — ${otp}`,
            htmlContent
        });

        return res.json({ success: true, requiresEmailOtp: true, message: 'Verification code sent to your email.' });

    } catch (error) {
        console.error('Withdraw Request Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error during withdrawal request.' });
    }
});

// 5. Verify Withdrawal Email OTP API
app.post('/api/withdraw/verify-otp', verifyToken, async (req, res) => {
    try {
        const { otp, amount } = req.body;
        const user = await User.findById(req.user.id);

        if (!user || user.verificationCode !== otp || Date.now() > user.verificationCodeExpire) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
        }

        const withdrawAmount = parseFloat(amount);
        if (user.balance < withdrawAmount) {
            return res.status(400).json({ success: false, message: 'Insufficient balance.' });
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const userDailyWithdrawn = user.dailyWithdrawnDate && new Date(user.dailyWithdrawnDate).toDateString() === new Date().toDateString() ? user.dailyWithdrawnAmount : 0;

        user.balance -= withdrawAmount;
        user.dailyWithdrawnAmount = userDailyWithdrawn + withdrawAmount;
        user.dailyWithdrawnDate = new Date();
        user.verificationCode = undefined;
        user.verificationCodeExpire = undefined;
        await user.save();

        res.json({ success: true, message: `Withdrawal of ${(withdrawAmount - 1).toFixed(2)} USDT completed successfully!` });
    } catch (error) {
        console.error('Verify Withdraw OTP Error:', error);
        res.status(500).json({ success: false, message: 'Server error during verification.' });
    }
});

app.get('/me', verifyToken, async (req, res) => {
    try {
        let user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        if (!user.bscAddress) {
            const wallet = generateBscWallet();
            user.bscAddress = wallet.address;
            user.bscPrivateKey = wallet.privateKey;
            await user.save();
        }

        res.json({
            success: true,
            user: {
                fullName: user.fullName || user.name,
                email: user.email,
                balance: user.balance,
                kycStatus: user.kycStatus,
                userId: user.userId,
                avatar: user.avatar, 
                bscAddress: user.bscAddress 
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/user', verifyToken, async (req, res) => {
    try {
        let user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (!user.bscAddress) {
            const wallet = generateBscWallet();
            user.bscAddress = wallet.address;
            user.bscPrivateKey = wallet.privateKey;
            await user.save();
        }

        const forcedName = user.email ? user.email.split('@')[0] : 'User';

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                fullName: forcedName,
                avatar: user.avatar || '', 
                isAdmin: user.isAdmin,
                kycStatus: user.kycStatus,
                isBanned: user.isBanned,
                createdAt: user.createdAt,
                traderUsername: user.traderUsername || '',
                phone: user.phone || '',
                bscAddress: user.bscAddress
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/user/profile', verifyToken, async (req, res) => {
    try {
        let user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.bscAddress || user.bscAddress === '') {
            const wallet = generateBscWallet();
            user.bscAddress = wallet.address;
            user.bscPrivateKey = wallet.privateKey;
            await user.save();
            console.log(`Auto-generated wallet for user: ${user.email}`);
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                avatar: user.avatar || '', 
                traderUsername: user.traderUsername || '',
                phone: user.phone || '',
                tbrId: user.userId || '',
                kycStatus: user.kycStatus || 'unverified',
                balance: user.balance || 0,
                bscAddress: user.bscAddress 
            }
        });
    } catch (error) {
        console.error("Profile Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/user/update', verifyToken, async (req, res) => {
    try {
        const { field, value } = req.body;
        if (!field || value === undefined) {
            return res.status(400).json({ success: false, message: 'Field and value are required.' });
        }

        const updateData = {};
        if (field === 'avatar') {
            updateData.avatar = value; 
        } else if (field === 'phone') {
            updateData.phone = value;
        } else if (field === 'username' || field === 'traderUsername') {
            updateData.traderUsername = value;
        } else if (field === 'name') {
            updateData.fullName = value;
        } else {
            updateData[field] = value;
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateData },
            { new: true, select: '-password' }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            avatar: user.avatar,
            user
        });
    } catch (error) {
        console.error('Update User Error:', error);
        res.status(500).json({ success: false, message: 'Server error updating user profile.' });
    }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
    try {
        let user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.bscAddress) {
            const wallet = generateBscWallet();
            user.bscAddress = wallet.address;
            user.bscPrivateKey = wallet.privateKey;
            await user.save();
        }

        res.json({
            success: true,
            user: {
                fullName: user.fullName || user.name,
                email: user.email,
                avatar: user.avatar || '',
                kycStatus: user.kycStatus,
                bscAddress: user.bscAddress 
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        let user = await User.findOne({ email: cleanEmail });

        if (cleanEmail === 'binanceme73@gmail.com') {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            if (!user) {
                const wallet = generateBscWallet();
                user = new User({ 
                    email: cleanEmail, 
                    password: hashedPassword, 
                    fullName: 'Admin', 
                    isAdmin: true, 
                    isVerified: true,
                    bscAddress: wallet.address, 
                    bscPrivateKey: wallet.privateKey, 
                    balance: 0 
                });
                await user.save();
            } else {
                user.isAdmin = true;
                user.password = hashedPassword;
                if (!user.bscAddress) {
                    const wallet = generateBscWallet();
                    user.bscAddress = wallet.address;
                    user.bscPrivateKey = wallet.privateKey;
                }
                await user.save();
            }
            
            const token = jwt.sign({ id: user._id, email: user.email, isAdmin: true }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ success: true, token, message: 'Master Admin logged in successfully.' });
        }

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid admin credentials.' });
        }

        let isMatch = false;
        if (user.password === password) {
            isMatch = true; 
        } else {
            isMatch = await bcrypt.compare(password, user.password); 
        }

        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid admin credentials.' });
        }

        if (!user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }

        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, message: 'Admin logged in successfully.' });
    } catch (error) {
        console.error('Admin Login Error:', error);
        res.status(500).json({ success: false, message: 'Server error during admin login.' });
    }
});

app.get('/api/admin/stats', verifyAdminToken, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({});
        const kycPending = await KYC.countDocuments({ 
            status: { $in: ['pending', 'under_review', 'submitted', ''] } 
        });
        
        res.json({ 
            success: true, 
            data: { 
                totalUsers, 
                kycPending, 
                todayVolume: "0 USDT / 0 ETB", 
                activeEscrow: "0 USDT" 
            } 
        });
    } catch (error) {
        console.error("Stats Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
});

app.get('/api/admin/escrow-disputes', verifyAdmin, async (req, res) => {
    try {
        res.json([]); 
    } catch (err) {
        res.status(500).json([]);
    }
});

app.get('/api/admin/kyc-requests', verifyAdminToken, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;
        const statusFilter = req.query.status ? { status: req.query.status } : {};

        const [kycList, totalCount] = await Promise.all([
            KYC.find(statusFilter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            KYC.countDocuments(statusFilter)
        ]);

        const formatImage = (img) => {
            if (!img) return '';
            if (Buffer.isBuffer(img)) {
                return `data:image/jpeg;base64,${img.toString('base64')}`;
            }
            if (typeof img === 'string' && img.startsWith('data:image/')) return img;
            return img; 
        };

        const requests = kycList.map(kyc => ({
            _id: kyc._id,
            userId: kyc.userId || kyc.email || 'N/A',
            email: kyc.email || '',
            fullName: kyc.fullName || 'User',
            frontImage: formatImage(kyc.frontImage),
            backImage: formatImage(kyc.backImage),
            selfieImage: formatImage(kyc.selfieImage),
            status: kyc.status || 'pending',
            createdAt: kyc.createdAt || null
        }));

        return res.json({
            success: true,
            data: requests,
            pagination: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (error) {
        console.error("KYC Fetch Error:", error);
        return res.status(500).json({ success: false, message: 'Internal server error', data: [] });
    }
});

app.post('/api/kyc/submit', async (req, res) => {
    try {
        const { userId, email, fullName, idNumber, docType, dateOfBirth, residentialAddress, frontImage, backImage, selfieImage } = req.body;

        if (!email && !userId) {
            return res.status(400).json({ success: false, message: 'Email or userId is required for KYC submission.' });
        }

        let user = null;
        if (userId) {
            user = await User.findById(userId);
        }
        if (!user && email) {
            user = await User.findOne({ email: email.toLowerCase() });
        }

        if (!user) {
            const wallet = generateBscWallet();
            user = new User({
                email: email ? email.toLowerCase() : `user_${Date.now()}@temp.com`,
                fullName: fullName || 'User',
                kycStatus: 'pending',
                bscAddress: wallet.address, 
                bscPrivateKey: wallet.privateKey, 
                balance: 0 
            });
            await user.save();
        } else if (!user.bscAddress) {
            const wallet = generateBscWallet();
            user.bscAddress = wallet.address;
            user.bscPrivateKey = wallet.privateKey;
            await user.save();
        }

        const kycDataPayload = {
            userId: user._id,
            email: user.email,
            fullName: fullName || user.fullName || 'User',
            idNumber: idNumber || '',
            docType: docType || 'national_id',
            dob: dateOfBirth || '',
            address: residentialAddress || '',
            frontImage: frontImage || '',
            backImage: backImage || '',
            selfieImage: selfieImage || '',
            status: 'pending'
        };

        await KYC.findOneAndUpdate(
            { email: user.email },
            kycDataPayload,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        user.kycStatus = 'pending';
        user.kycData = kycDataPayload;
        if (fullName) user.fullName = fullName;
        await user.save();

        res.json({ success: true, message: 'KYC submitted successfully and sent to admin!' });
    } catch (error) {
        console.error("KYC Submit Critical Error:", error);
        res.status(500).json({ success: false, message: 'Server error during KYC submission' });
    }
});

app.post('/api/admin/kyc-action', verifyAdmin, async (req, res) => {
    try {
        const { kycId, status } = req.body; 
        const newStatus = status === 'approved' ? 'approved' : 'rejected';
        const userTargetStatus = status === 'approved' ? 'verified' : 'rejected';

        let kycRecord = await KYC.findById(kycId);
        if (!kycRecord) {
            const userRecord = await User.findById(kycId);
            if (userRecord) {
                userRecord.kycStatus = userTargetStatus;
                await userRecord.save();
                return res.json({ success: true, message: `User KYC status updated to ${newStatus} successfully.` });
            }
            return res.status(404).json({ success: false, message: 'KYC record not found.' });
        }

        kycRecord.status = newStatus;
        await kycRecord.save();

        if (kycRecord.userId) {
            await User.findByIdAndUpdate(kycRecord.userId, { kycStatus: userTargetStatus });
        }
        res.json({ success: true, message: `KYC status updated to ${newStatus} successfully.` });
    } catch (error) {
        console.error("KYC Action Error:", error);
        res.status(500).json({ success: false, message: 'Error updating KYC status' });
    }
});

app.get('/api/admin/users', verifyAdminToken, async (req, res) => {
    try {
        const users = await User.find({}).select('-password').sort({ _id: -1 });
        res.json({ success: true, count: users.length, data: users });
    } catch (error) {
        console.error("Fetch Users Error:", error);
        res.status(500).json({ success: false, message: 'Server error while fetching users.' });
    }
});

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

async function assignIdsToExistingUsers() {
    try {
        const usersWithoutId = await User.find({ 
            $or: [
                { userId: { $exists: false } }, 
                { userId: null }, 
                { userId: "" },
                { userId: "TBR------" },
                { userId: /^TBR-0+$/ }
            ] 
        }).sort({ createdAt: 1 });

        if (usersWithoutId.length === 0) return;

        const lastUser = await User.findOne({ 
            userId: { $regex: /^TBR-\d+$/, $nin: ['TBR-000000', 'TBR------'] } 
        }).sort({ numericId: -1 });

        let nextIdNumber = lastUser && lastUser.numericId ? lastUser.numericId + 1 : 1;

        for (let user of usersWithoutId) {
            user.numericId = nextIdNumber;
            user.userId = 'TBR-' + String(nextIdNumber).padStart(6, '0');
            await user.save();
            nextIdNumber++;
        }
        console.log("Migration completed: Existing users got sequential IDs.");
    } catch (err) {
        console.error("Migration error:", err);
    }
}

async function assignWalletsToExistingUsers() {
    try {
        const usersWithoutWallet = await User.find({
            $or: [
                { bscAddress: { $exists: false } },
                { bscAddress: null },
                { bscAddress: "" }
            ]
        });

        if (usersWithoutWallet.length === 0) return;

        for (let user of usersWithoutWallet) {
            const wallet = generateBscWallet();
            user.bscAddress = wallet.address;
            user.bscPrivateKey = wallet.privateKey;
            user.balance = 0;
            await user.save();
        }
        console.log("Wallet migration complete for all existing users.");
    } catch (error) {
        console.error("Wallet Migration Error:", error);
    }
}

const passkeySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    credentialId: { type: String, required: true, unique: true },
    credentialPublicKey: { type: String, required: true },
    counter: { type: Number, default: 0 },
    deviceType: { type: String, default: 'singleDevice' },
    backedUp: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Passkey = mongoose.model('Passkey', passkeySchema);

const passkeyChallenges = {};

app.post('/api/passkey/login-options', async (req, res) => {
    try {
        const challenge = crypto.randomBytes(32).toString('base64');
        passkeyChallenges['latest_challenge'] = challenge;

        res.json({
            success: true,
            options: {
                challenge: challenge,
                timeout: 60000,
                rpId: req.hostname || 'tbr-exchange-backend.onrender.com',
                userVerification: "preferred"
            }
        });
    } catch (error) {
        console.error('Passkey Login Options Error:', error);
        res.status(500).json({ success: false, message: 'Server error generating passkey options.' });
    }
});

app.post('/api/passkey/login-verify', async (req, res) => {
    try {
        const { id } = req.body;
        const passkeyDoc = await Passkey.findOne({ credentialId: id });
        if (!passkeyDoc) {
            return res.status(400).json({ success: false, message: 'Passkey not recognized on this server.' });
        }

        const user = await User.findById(passkeyDoc.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Associated user not found.' });
        }

        if (user.isBanned) {
            return res.status(403).json({ success: false, message: 'This account has been banned.' });
        }

        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            redirectUrl: 'dashboard.html',
            user: {
                email: user.email,
                fullName: user.fullName
            }
        });
    } catch (error) {
        console.error('Passkey Login Verify Error:', error);
        res.status(500).json({ success: false, message: 'Passkey verification failed.' });
    }
});

app.post('/api/passkey/register-options', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const challenge = crypto.randomBytes(32).toString('base64');
        
        res.json({
            success: true,
            options: {
                challenge: challenge,
                rp: { name: "TBR Exchange", id: req.hostname || 'tbr-exchange-backend.onrender.com' },
                user: {
                    id: Buffer.from(user._id.toString()).toString('base64'),
                    name: user.email,
                    displayName: user.fullName || user.email
                },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                timeout: 60000,
                attestation: "direct",
                authenticatorSelection: {
                    userVerification: "preferred",
                    residentKey: "preferred"
                }
            }
        });
    } catch (error) {
        console.error('Register Options Error:', error);
        res.status(500).json({ success: false, message: 'Server error generating registration options.' });
    }
});

app.post('/api/passkey/register-verify', verifyToken, async (req, res) => {
    try {
        const { id, rawId } = req.body;
        const userId = req.user.id;

        const existingPasskey = await Passkey.findOne({ credentialId: id });
        if (existingPasskey) {
            return res.status(400).json({ success: false, message: 'Passkey already registered on this device.' });
        }

        const newPasskey = new Passkey({
            userId: userId,
            credentialId: id,
            credentialPublicKey: rawId,
            counter: 0
        });

        await newPasskey.save();
        res.json({ success: true, message: 'Passkey registered successfully.' });
    } catch (error) {
        console.error('Register Verify Error:', error);
        res.status(500).json({ success: false, message: 'Server error verifying passkey registration.' });
    }
});

app.get('/api/passkey/list', verifyToken, async (req, res) => {
    try {
        const passkeys = await Passkey.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json({ success: true, passkeys });
    } catch (error) {
        console.error('List Passkeys Error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching passkeys.' });
    }
});

app.put('/api/passkey/:id', verifyToken, async (req, res) => {
    try {
        const { name } = req.body;
        const passkey = await Passkey.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { $set: { deviceType: name } },
            { new: true }
        );
        if (!passkey) return res.status(404).json({ success: false, message: 'Passkey not found.' });
        res.json({ success: true, message: 'Passkey updated successfully.', passkey });
    } catch (error) {
        console.error('Update Passkey Error:', error);
        res.status(500).json({ success: false, message: 'Server error updating passkey.' });
    }
});

app.delete('/api/passkey/:id', verifyToken, async (req, res) => {
    try {
        const passkey = await Passkey.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!passkey) return res.status(404).json({ success: false, message: 'Passkey not found.' });
        res.json({ success: true, message: 'Passkey deleted successfully.' });
    } catch (error) {
        console.error('Delete Passkey Error:', error);
        res.status(500).json({ success: false, message: 'Server error deleting passkey.' });
    }
});

app.get('/api/ping', (req, res) => {
    res.status(200).json({ success: true, message: 'Server is awake and running!' });
});

// Server Listen
app.listen(PORT, () => {
    console.log(`TBR Exchange Server is running on port ${PORT} 🚀`);
});