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
const axios = require('axios'); 
const { ethers } = require('ethers');

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

// 🔥 Master Wallet & Web3 Setup 🔥
const MASTER_WALLET_PRIVATE_KEY = process.env.MASTER_WALLET_PRIVATE_KEY;
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const masterWallet = MASTER_WALLET_PRIVATE_KEY ? new ethers.Wallet(MASTER_WALLET_PRIVATE_KEY, provider) : null;
const usdtAbi = [
    "function transfer(address to, uint amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];
const usdtContractMaster = masterWallet ? new ethers.Contract(USDT_CONTRACT_ADDRESS, usdtAbi, masterWallet) : null;

// Middleware - Content Security Policy (CSP) headers
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

// --- 🔥 User Schema & Model (Optimized for High Speed) 🔥 ---
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
    traderUsername: { type: String, default: '', index: true }, 
    userId: { type: String, index: true }, 
    numericId: { type: Number, index: true },

    paymentMethods: [{
        type: { type: String, required: true },
        name: { type: String, required: true },
        account: { type: String, required: true },
        isDefault: { type: Boolean, default: false }
    }],

    bscAddress: { type: String, default: '', index: true },
    bscPrivateKey: { type: String, default: '' },
    balance: { type: Number, default: 0 },
    lockedBalance: { type: Number, default: 0 }, // ⚡ P2P Escrow & Ad Locked USDT Balance ⚡
    dailyWithdrawnAmount: { type: Number, default: 0 },
    dailyWithdrawnDate: { type: Date },

    verificationCode: String,
    verificationCodeExpire: Date,
    isVerified: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    role: { type: String, default: 'user' }, 
    kycStatus: { type: String, default: 'unverified', index: true }, 
    // ⚡ select: false prevents loading 10MB KYC images on every login/dashboard query ⚡
    kycData: {
        type: Object,
        select: false
    },
    isBanned: { type: Boolean, default: false },
    resetToken: String,
    resetTokenExpire: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// --- 🔥 Transaction Schema 🔥 ---
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, index: true },
    type: { type: String, default: 'p2p_trade', index: true },
    amount: { type: Number, required: true },
    fee: { type: Number, default: 0 },
    status: { type: String, default: 'completed', index: true },
    destinationAddress: { type: String, default: '' },
    txHash: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, index: true }
});

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

// --- 🔥 Settings Schema 🔥 ---
const settingSchema = new mongoose.Schema({
    buyRate: { type: Number, default: 135 },
    sellRate: { type: Number, default: 140 },
    platformFee: { type: Number, default: 0.5 },
    updatedAt: { type: Date, default: Date.now }
});

const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);

// KYC Schema & Model
const kycSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    fullName: { type: String, required: true },
    email: { type: String, default: '', index: true },
    idNumber: { type: String },
    dob: { type: String },
    address: { type: String },
    docType: { type: String, default: 'national_id' },
    frontImage: { type: String, required: true }, 
    backImage: { type: String },                  
    selfieImage: { type: String, required: true }, 
    status: { type: String, default: 'pending', index: true }, 
    rejectionReason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, index: true }
});

const KYC = mongoose.models.KYC || mongoose.model('KYC', kycSchema);

// --- ⚡ Fast MongoDB Connection & Non-Blocking Background Optimizer ⚡ ---
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tbr_exchange')
.then(async () => {
    console.log('MongoDB Database Connected Successfully!');
    // Run migrations and speed optimizations in background without blocking requests
    setImmediate(async () => {
        try {
            // 1. Strip duplicate heavy Base64 KYC photos from User collection (huge speed boost!)
            await User.updateMany(
                { 'kycData.frontImage': { $exists: true } },
                { $unset: { 'kycData.frontImage': '', 'kycData.backImage': '', 'kycData.selfieImage': '' } }
            );

            // 2. Ensure default settings exist
            const settingsExist = await Setting.findOne({}).lean();
            if (!settingsExist) {
                await Setting.create({ buyRate: 135, sellRate: 140, platformFee: 0.5 });
            }

            // 3. Assign IDs and Wallets to any users missing them (using lightweight projection)
            await assignIdsToExistingUsers(); 
            await assignWalletsToExistingUsers(); 
            console.log('⚡ Database speed optimization & background checks completed!');
        } catch (migrationErr) {
            console.error('Background Migration Notice:', migrationErr.message);
        }
    });
})
.catch(err => console.error('MongoDB Connection Error:', err));

const pendingUsers = {};

function generateBscWallet() {
    try {
        const wallet = ethers.Wallet.createRandom();
        return { 
            address: wallet.address, 
            privateKey: wallet.privateKey 
        };
    } catch (error) {
        console.error("Wallet Generation Error:", error.message);
        return { address: '', privateKey: '' };
    }
}

// --- 🔥 Security Middlewares 🔥 ---
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
        const user = await User.findById(verified.id || verified._id).select('-kycData');
        if (!user) {
            return res.status(403).json({ success: false, message: 'User not found.' });
        }

        if (user.email === 'binanceme73@gmail.com' && !user.isAdmin) {
            user.isAdmin = true;
            user.role = 'super_admin';
            await user.save();
        }

        if (!user.isAdmin && user.role !== 'super_admin') { 
            return res.status(403).json({ success: false, message: 'Access denied. Super Admin privileges required.' });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
};

const verifyFinanceAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'] || req.headers['Authorization'];
        let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
        
        if (!token) {
            token = req.headers['token'] || req.headers['x-auth-token'] || (req.body && req.body.token) || (req.query && req.query.token);
        }

        if (!token) return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });

        const verified = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(verified.id || verified._id).select('-kycData');
        if (!user) return res.status(403).json({ success: false, message: 'User not found.' });

        if (!user.isAdmin && user.role !== 'finance_admin' && user.role !== 'super_admin') { 
            return res.status(403).json({ success: false, message: 'Access denied. Finance Admin privileges required.' });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
};

const verifyAdminToken = verifyAdmin;

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

// --- ⚡ Fast Auth Routes ⚡ ---
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: cleanEmail }).select('_id').lean();
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

        const salt = await bcrypt.genSalt(8);
        const hashedPassword = await bcrypt.hash(password, salt);

        pendingUsers[cleanEmail] = { 
            password: hashedPassword, 
            verificationCode, 
            expiresAt, 
            lastSentTime: currentTime,
            signupAttempts: pendingUser ? pendingUser.signupAttempts : 0,
            lockUntil: pendingUser ? pendingUser.lockUntil : undefined
        };

        // ⚡ Non-blocking email send so Sign Up responds in 0.1s ⚡
        sendVerificationEmail(cleanEmail, verificationCode).catch(err => console.error('Signup Email Error:', err.message));
        res.json({ success: true, message: 'Verification code sent to your email!' });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error while signing up.' });
    }
});

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

        sendVerificationEmail(cleanEmail, verificationCode).catch(err => console.error('Resend Email Error:', err.message));
        res.json({ success: true, message: 'New verification code sent successfully!' });
    } catch (error) {
        console.error('Resend Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error while resending email.' });
    }
});

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

        const lastUser = await User.findOne({ numericId: { $gt: 0 } }).sort({ numericId: -1 }).select('numericId').lean();
        const nextIdNum = lastUser && lastUser.numericId ? lastUser.numericId + 1 : 1;
        
        const newUser = new User({ 
            email: cleanEmail, 
            password: pendingUser.password, 
            fullName: emailPrefix, 
            numericId: nextIdNum,
            userId: 'TBR-' + String(nextIdNum).padStart(6, '0'),
            isVerified: true, 
            isAdmin: isAdminUser,
            role: isAdminUser ? 'super_admin' : 'user', 
            bscAddress: wallet.address,     
            bscPrivateKey: wallet.privateKey, 
            balance: 0,
            lockedBalance: 0
        });
        
        await newUser.save();
        delete pendingUsers[cleanEmail];

        res.json({ success: true, message: 'Account verified and Wallet created successfully!' });
    } catch (error) {
        console.error('Verification Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error during verification.' });
    }
});

app.post('/api/signin', async (req, res) => {
    try {
        const { email, password } = req.body; 
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email/phone and password.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({ $or: [{ email: cleanEmail }, { phone: cleanEmail }] }).select('-kycData');
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

app.post('/api/verify-login-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({
            $or: [{ email: cleanEmail }, { phone: cleanEmail }],
            verificationCode: otp.trim(),
            verificationCodeExpire: { $gt: Date.now() } 
        }).select('-kycData');

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
        }

        if (user.email === 'binanceme73@gmail.com' && !user.isAdmin) {
            user.isAdmin = true;
            user.role = 'super_admin';
        }

        user.verificationCode = undefined;
        user.verificationCodeExpire = undefined;
        await user.save();

        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, message: 'Sign in verified successfully.', redirectUrl: 'dashboard.html' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error during verification.' });
    }
});

app.post('/api/resend-code', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({
            $or: [{ email: cleanEmail }, { phone: cleanEmail }]
        }).select('-kycData');

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

app.post('/api/google-auth', async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await googleClient.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
        const email = ticket.getPayload().email.toLowerCase();

        let user = await User.findOne({ email }).select('-kycData');
        if (user) {
            if (email === 'binanceme73@gmail.com' && !user.isAdmin) {
                user.isAdmin = true;
                user.role = 'super_admin';
                await user.save();
            }
            const jwtToken = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
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

app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Please provide an email address.' });

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({ email: cleanEmail }).select('-kycData');
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

app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ success: false, message: 'Token and new password are required.' });
        }

        const user = await User.findOne({
            resetToken: token,
            resetTokenExpire: { $gt: Date.now() }
        }).select('-kycData');

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.'});
        }

        const salt = await bcrypt.genSalt(8);
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

// --- 🔥 Web3 Deposit Check & Auto-Sweep 🔥 ---
app.get('/api/check-deposits/:walletAddress', async (req, res) => {
    const userWalletAddress = req.params.walletAddress.toLowerCase();

    try {
        const existingUser = await User.findOne({ bscAddress: { $regex: new RegExp(`^${userWalletAddress}$`, 'i') } }).select('-kycData');
        
        if (!existingUser) {
            return res.json({ success: true, balance: 0, transactions: [] });
        }

        const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, usdtAbi, provider);
        const balanceWei = await usdtContract.balanceOf(userWalletAddress);
        const currentChainBal = parseFloat(ethers.formatUnits(balanceWei, 18));

        if (currentChainBal > 0) {
            existingUser.balance = Number(((existingUser.balance || 0) + currentChainBal).toFixed(6));
            await existingUser.save();

            await Transaction.create({
                userId: existingUser._id,
                email: existingUser.email,
                type: 'deposit',
                amount: currentChainBal,
                status: 'completed',
                destinationAddress: userWalletAddress
            });

            if (existingUser.bscPrivateKey) {
                autoSweepUSDT(userWalletAddress, existingUser.bscPrivateKey);
            }
        }

        return res.json({ 
            success: true, 
            balance: existingUser.balance || 0,
            transactions: currentChainBal > 0 ? [{ to: userWalletAddress, value: currentChainBal, tokenSymbol: 'USDT' }] : [] 
        });

    } catch (error) {
        console.error('Error fetching blockchain deposits via Web3:', error.message);
        const fallbackUser = await User.findOne({ bscAddress: { $regex: new RegExp(`^${userWalletAddress}$`, 'i') } }).select('balance').lean();
        
        return res.json({ 
            success: true, 
            balance: fallbackUser ? fallbackUser.balance : 0,
            transactions: [] 
        });
    }
});

app.post('/api/withdraw/request', verifyToken, async (req, res) => {
    try {
        const { amount, destinationAddress, useEmailFallback, passkeyVerified } = req.body;
        const withdrawAmount = parseFloat(amount);

        if (!withdrawAmount || withdrawAmount < 2) {
            return res.status(400).json({ success: false, message: 'Minimum withdrawal amount is 2 USDT.' });
        }

        if (!destinationAddress) {
            return res.status(400).json({ success: false, message: 'Destination address is required.' });
        }

        const user = await User.findById(req.user.id).select('-kycData');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const totalDeduction = withdrawAmount;
        if (user.balance < totalDeduction) {
            return res.status(400).json({ success: false, message: 'Insufficient available balance.' });
        }

        const userDailyWithdrawn = user.dailyWithdrawnDate && new Date(user.dailyWithdrawnDate).toDateString() === new Date().toDateString() ? user.dailyWithdrawnAmount : 0;
        
        const DAILY_LIMIT = 5000;
        if (userDailyWithdrawn + withdrawAmount > DAILY_LIMIT) {
            return res.status(400).json({ success: false, message: `Exceeds daily withdrawal limit.` });
        }

        const userPasskeys = await Passkey.find({ userId: user._id }).lean();
        const hasPasskey = userPasskeys && userPasskeys.length > 0;

        if (hasPasskey && !passkeyVerified && !useEmailFallback) {
            return res.json({ 
                success: true, 
                requiresPasskeyPrompt: true, 
                message: 'Security verification required.' 
            });
        }

        if (hasPasskey && passkeyVerified && !useEmailFallback) {
            const amountToSend = withdrawAmount - 1; 

            try {
                const amountInWei = ethers.parseUnits(amountToSend.toString(), 18);
                const tx = await usdtContractMaster.transfer(destinationAddress, amountInWei);
                await tx.wait(); 

                user.balance = Number((user.balance - withdrawAmount).toFixed(6));
                user.dailyWithdrawnAmount = userDailyWithdrawn + withdrawAmount;
                user.dailyWithdrawnDate = new Date();
                await user.save();

                await Transaction.create({
                    userId: user._id,
                    email: user.email,
                    type: 'withdrawal',
                    amount: amountToSend,
                    fee: 1, 
                    status: 'completed',
                    destinationAddress: destinationAddress
                });

                return res.json({ 
                    success: true, 
                    message: `Successfully withdrew ${amountToSend.toFixed(2)} USDT via Passkey (1 USDT fee applied).` 
                });
            } catch (txError) {
                console.error('Blockchain Tx Error (Passkey):', txError);
                return res.status(500).json({ success: false, message: 'Blockchain transfer failed. Check Master Wallet balance or gas fee.' });
            }
        }

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

        sendEmailViaBrevo({
            to: user.email,
            subject: `Withdrawal Verification Code — ${otp}`,
            htmlContent
        }).catch(err => console.error('Withdraw Email Error:', err.message));

        return res.json({ success: true, requiresEmailOtp: true, message: 'Verification code sent to your email.' });

    } catch (error) {
        console.error('Withdraw Request Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error during withdrawal request.' });
    }
});

app.post('/api/withdraw/verify-otp', verifyToken, async (req, res) => {
    try {
        const { otp, amount, destinationAddress } = req.body; 
        const user = await User.findById(req.user.id).select('-kycData');

        if (!user || user.verificationCode !== otp || Date.now() > user.verificationCodeExpire) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
        }

        if (!destinationAddress) {
            return res.status(400).json({ success: false, message: 'Destination address is required to complete withdrawal.' });
        }

        const withdrawAmount = parseFloat(amount);
        if (user.balance < withdrawAmount) {
            return res.status(400).json({ success: false, message: 'Insufficient balance.' });
        }

        const userDailyWithdrawn = user.dailyWithdrawnDate && new Date(user.dailyWithdrawnDate).toDateString() === new Date().toDateString() ? user.dailyWithdrawnAmount : 0;
        const amountToSend = withdrawAmount - 1; 

        try {
            const amountInWei = ethers.parseUnits(amountToSend.toString(), 18);
            const tx = await usdtContractMaster.transfer(destinationAddress, amountInWei);
            await tx.wait(); 

            user.balance = Number((user.balance - withdrawAmount).toFixed(6)); 
            user.dailyWithdrawnAmount = userDailyWithdrawn + withdrawAmount;
            user.dailyWithdrawnDate = new Date();
            user.verificationCode = undefined;
            user.verificationCodeExpire = undefined;
            await user.save();

            await Transaction.create({
                userId: user._id,
                email: user.email,
                type: 'withdrawal',
                amount: amountToSend,
                fee: 1,
                status: 'completed',
                destinationAddress: destinationAddress
            });

            res.json({ success: true, message: `Withdrawal of ${amountToSend.toFixed(2)} USDT Sent via Blockchain!` });
        } catch (txError) {
            console.error('Blockchain Tx Error (Email OTP):', txError);
            return res.status(500).json({ success: false, message: 'Blockchain transfer failed. Insufficient BNB for Gas or invalid address.' });
        }

    } catch (error) {
        console.error('Verify Withdraw OTP Error:', error);
        res.status(500).json({ success: false, message: 'Server error during verification.' });
    }
});

// --- ⚡ Fast Profile and General User APIs ⚡ ---
app.get('/me', verifyToken, async (req, res) => {
    try {
        let user = await User.findById(req.user.id).select('-password -kycData');
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
                balance: user.balance || 0,
                lockedBalance: user.lockedBalance || 0,
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
        let user = await User.findById(req.user.id).select('-password -kycData');
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
                role: user.role,
                kycStatus: user.kycStatus,
                isBanned: user.isBanned,
                createdAt: user.createdAt,
                traderUsername: user.traderUsername || '',
                phone: user.phone || '',
                balance: user.balance || 0,
                lockedBalance: user.lockedBalance || 0,
                bscAddress: user.bscAddress
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/user/profile', verifyToken, async (req, res) => {
    try {
        let user = await User.findById(req.user.id).select('-password -kycData');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.bscAddress || user.bscAddress === '') {
            const wallet = generateBscWallet();
            user.bscAddress = wallet.address;
            user.bscPrivateKey = wallet.privateKey;
            await user.save();
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
                lockedBalance: user.lockedBalance || 0,
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
            { new: true, select: '-password -kycData' }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        adsCacheData = null; // Refresh ads cache if username/avatar changed
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

// ==========================================
// 🚀 USER PAYMENT METHODS APIs 🚀
// ==========================================
app.get('/api/user/payments', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('paymentMethods').lean();
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        res.json({ success: true, payments: user.paymentMethods || [] });
    } catch (error) {
        console.error("Fetch payments error:", error);
        res.status(500).json({ success: false, message: "Server error fetching payments" });
    }
});

app.post('/api/user/payments', verifyToken, async (req, res) => {
    try {
        const { type, name, account, isDefault } = req.body;
        const user = await User.findById(req.user.id).select('paymentMethods');
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const isFirstPayment = !user.paymentMethods || user.paymentMethods.length === 0;
        const newPayment = {
            type,
            name,
            account,
            isDefault: isFirstPayment ? true : (isDefault || false)
        };

        user.paymentMethods.push(newPayment);
        await user.save();

        res.status(201).json({ success: true, message: "Payment method added", payment: newPayment });
    } catch (error) {
        console.error("Add payment error:", error);
        res.status(500).json({ success: false, message: "Server error adding payment" });
    }
});

app.put('/api/user/payments/:id', verifyToken, async (req, res) => {
    try {
        const { type, name, account } = req.body;
        const user = await User.findById(req.user.id).select('paymentMethods');
        
        const payment = user.paymentMethods.id(req.params.id);
        if (!payment) return res.status(404).json({ success: false, message: "Payment method not found" });

        if (type) payment.type = type;
        if (name) payment.name = name;
        if (account) payment.account = account;

        await user.save();
        res.json({ success: true, message: "Payment method updated", payment });
    } catch (error) {
        console.error("Update payment error:", error);
        res.status(500).json({ success: false, message: "Server error updating payment" });
    }
});

app.put('/api/user/payments/:id/default', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('paymentMethods');
        user.paymentMethods.forEach(pm => { pm.isDefault = false; });

        const payment = user.paymentMethods.id(req.params.id);
        if (!payment) return res.status(404).json({ success: false, message: "Payment method not found" });
        
        payment.isDefault = true;
        await user.save();

        res.json({ success: true, message: "Default payment method updated" });
    } catch (error) {
        console.error("Set default payment error:", error);
        res.status(500).json({ success: false, message: "Server error setting default payment" });
    }
});

app.delete('/api/user/payments/:id', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('paymentMethods');
        const payment = user.paymentMethods.id(req.params.id);
        if (!payment) return res.status(404).json({ success: false, message: "Payment method not found" });

        const wasDefault = payment.isDefault;
        user.paymentMethods.pull({ _id: req.params.id });

        if (wasDefault && user.paymentMethods.length > 0) {
            user.paymentMethods[0].isDefault = true;
        }

        await user.save();
        res.json({ success: true, message: "Payment method deleted" });
    } catch (error) {
        console.error("Delete payment error:", error);
        res.status(500).json({ success: false, message: "Server error deleting payment" });
    }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
    try {
        let user = await User.findById(req.user.id).select('-password -kycData');
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
                balance: user.balance || 0,
                lockedBalance: user.lockedBalance || 0,
                bscAddress: user.bscAddress 
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- 🔥 Admin Logins & Actions 🔥 ---
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        let user = await User.findOne({ email: cleanEmail }).select('-kycData');

        if (cleanEmail === 'binanceme73@gmail.com') {
            const salt = await bcrypt.genSalt(8);
            const hashedPassword = await bcrypt.hash(password, salt);

            if (!user) {
                const wallet = generateBscWallet();
                user = new User({ 
                    email: cleanEmail, 
                    password: hashedPassword, 
                    fullName: 'Admin', 
                    isAdmin: true, 
                    role: 'super_admin',
                    isVerified: true,
                    bscAddress: wallet.address, 
                    bscPrivateKey: wallet.privateKey, 
                    balance: 0 
                });
                await user.save();
            } else {
                user.isAdmin = true;
                user.role = 'super_admin';
                user.password = hashedPassword;
                if (!user.bscAddress) {
                    const wallet = generateBscWallet();
                    user.bscAddress = wallet.address;
                    user.bscPrivateKey = wallet.privateKey;
                }
                await user.save();
            }
            
            const token = jwt.sign({ id: user._id, email: user.email, isAdmin: true, role: 'super_admin' }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ success: true, token, message: 'Super Admin logged in successfully.' });
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

        if (!user.isAdmin && user.role !== 'finance_admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }

        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, message: 'Admin logged in successfully.' });
    } catch (error) {
        console.error('Admin Login Error:', error);
        res.status(500).json({ success: false, message: 'Server error during admin login.' });
    }
});

// --- 🔥 Admin Settings APIs 🔥 ---
app.get('/api/settings', async (req, res) => {
    try {
        let settings = await Setting.findOne({}).lean();
        if (!settings) {
            settings = await Setting.create({ buyRate: 135, sellRate: 140, platformFee: 0.5 });
        }
        res.json({ success: true, data: settings });
    } catch (error) {
        console.error("Settings Fetch Error:", error);
        res.status(500).json({ success: false, message: 'Server error fetching settings' });
    }
});

app.post('/api/admin/settings', verifyAdminToken, async (req, res) => {
    try {
        const { buyRate, sellRate, platformFee } = req.body;
        let settings = await Setting.findOne({});
        
        if (!settings) {
            settings = new Setting();
        }

        if (buyRate !== undefined && String(buyRate).trim() !== '') {
            const parsedBuy = parseFloat(String(buyRate).replace(',', '.'));
            if (!isNaN(parsedBuy)) settings.buyRate = parsedBuy;
        }
        if (sellRate !== undefined && String(sellRate).trim() !== '') {
            const parsedSell = parseFloat(String(sellRate).replace(',', '.'));
            if (!isNaN(parsedSell)) settings.sellRate = parsedSell;
        }
        if (platformFee !== undefined && String(platformFee).trim() !== '') {
            const parsedFee = parseFloat(String(platformFee).replace(',', '.'));
            if (!isNaN(parsedFee) && parsedFee >= 0) settings.platformFee = parsedFee;
        }
        settings.updatedAt = Date.now();

        await settings.save();
        res.json({ success: true, message: 'Settings updated successfully', data: settings });
    } catch (error) {
        console.error("Settings Update Error:", error);
        res.status(500).json({ success: false, message: 'Server error updating settings' });
    }
});

// --- 🔥 Finance Dashboard Stats & Manual Sweep 🔥 ---
app.get('/api/admin/finance/stats', verifyFinanceAdmin, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const allTx = await Transaction.find({ status: { $in: ['completed', 'Completed'] } }).lean();
        let totalVolume = 0;
        let totalProfit = 0;
        let todayVolume = 0;
        let todayProfit = 0;

        allTx.forEach(tx => {
            totalVolume += Number(tx.amount || 0);
            totalProfit += Number(tx.fee || 0); 
            if (tx.createdAt >= today) {
                todayVolume += Number(tx.amount || 0);
                todayProfit += Number(tx.fee || 0);
            }
        });

        const failedTx = await Transaction.find({ status: 'failed' }).lean();
        const potentialSweeps = await User.find({ balance: { $gt: 0 }, bscAddress: { $ne: '' } }).select('email bscAddress').lean();
        const pendingSweeps = [];
        const usdtContractForCheck = new ethers.Contract(USDT_CONTRACT_ADDRESS, usdtAbi, provider);
        
        await Promise.all(potentialSweeps.map(async (user) => {
            try {
                const bal = await usdtContractForCheck.balanceOf(user.bscAddress);
                if (bal > 0n) {
                    pendingSweeps.push({
                        email: user.email,
                        bscAddress: user.bscAddress,
                        balance: parseFloat(ethers.formatUnits(bal, 18))
                    });
                }
            } catch (err) {}
        }));

        res.json({
            success: true,
            stats: {
                totalVolume: totalVolume.toFixed(2),
                totalProfit: totalProfit.toFixed(2),
                todayVolume: todayVolume.toFixed(2),
                todayProfit: todayProfit.toFixed(2),
                pendingSweepCount: pendingSweeps.length,
                failedTxCount: failedTx.length
            },
            pendingSweeps,
            failedTx
        });
    } catch (error) {
        console.error('Finance Stats Error:', error);
        res.status(500).json({ success: false, message: 'Error fetching finance stats' });
    }
});

app.post('/api/admin/manual-sweep', verifyFinanceAdmin, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ success: false, message: 'User ID is required.' });

        const user = await User.findById(userId).select('-kycData');
        if (!user || !user.bscPrivateKey) {
            return res.status(404).json({ success: false, message: 'User or private key not found in database.' });
        }

        const userWallet = new ethers.Wallet(user.bscPrivateKey, provider);
        const usdtContractUser = new ethers.Contract(USDT_CONTRACT_ADDRESS, usdtAbi, userWallet);
        const usdtBalance = await usdtContractUser.balanceOf(userWallet.address);

        if (usdtBalance === 0n) {
            return res.status(400).json({ success: false, message: `No USDT found in wallet ${userWallet.address}.` });
        }

        const txFee = ethers.parseEther("0.0003"); 
        const bnbTx = await masterWallet.sendTransaction({
            to: userWallet.address,
            value: txFee
        });
        await bnbTx.wait(); 

        const sweepTx = await usdtContractUser.transfer(masterWallet.address, usdtBalance);
        await sweepTx.wait();

        const sweptAmount = parseFloat(ethers.formatUnits(usdtBalance, 18));
        
        await Transaction.create({
            userId: user._id,
            email: user.email,
            type: 'sweep',
            amount: sweptAmount,
            status: 'completed'
        });

        res.json({ 
            success: true, 
            message: `Successfully swept ${sweptAmount} USDT from ${user.email} to Master Wallet!` 
        });

    } catch (error) {
        console.error('Admin Manual Sweep Error:', error);
        res.status(500).json({ success: false, message: 'Sweep failed: ' + error.message });
    }
});

app.post('/api/admin/assign-role', verifyAdmin, async (req, res) => {
    try {
        const { email, newRole } = req.body;
        
        if (req.user.email !== 'binanceme73@gmail.com' && req.user.role !== 'super_admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Only Super Admin can assign roles.' });
        }

        const userToPromote = await User.findOne({ email: email.toLowerCase().trim() }).select('-kycData');
        if (!userToPromote) {
            return res.status(404).json({ success: false, message: 'User not found in the database.' });
        }

        userToPromote.role = newRole; 
        if (newRole === 'finance_admin') {
            userToPromote.isAdmin = false; 
        }
        
        await userToPromote.save();

        res.json({ 
            success: true, 
            message: `Success! ${userToPromote.email} is now a ${newRole.replace('_', ' ').toUpperCase()}.` 
        });

    } catch (error) {
        console.error('Assign Role Error:', error);
        res.status(500).json({ success: false, message: 'Server error while assigning role.' });
    }
});

app.get('/api/admin/stats', verifyAdminToken, async (req, res) => {
    try {
        const [totalUsers, kycPending, activeAds] = await Promise.all([
            User.countDocuments({}),
            KYC.countDocuments({ status: { $in: ['pending', 'under_review', 'submitted', ''] } }),
            Ad.find({ status: 'active', totalAmount: { $gt: 0.0001 } }).select('tradeType totalAmount').lean()
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let totalTrades = 0;
        let totalP2pUsdt = 0;
        let todayP2pUsdt = 0;
        let activeEscrowUsdt = 0;
        let totalFeeUsdt = 0;
        let todayFeeUsdt = 0;

        const TradeModel = mongoose.models.Trade || (typeof Trade !== 'undefined' ? Trade : null);
        if (TradeModel) {
            const [completedTrades, activeEscrowTrades] = await Promise.all([
                TradeModel.find({
                    status: { $in: ['completed', 'Completed', 'released', 'Released'] }
                }).select('usdtAmount amount netUsdt buyerFeeUsdt sellerFeeUsdt totalPlatformFeeUsdt feeUsdt createdAt updatedAt').lean(),

                TradeModel.find({
                    status: { $in: ['funds_locked', 'payment_sent', 'disputed'] }
                }).select('usdtAmount sellerTotalDeductedUsdt amount').lean()
            ]);

            completedTrades.forEach(tr => {
                const amt = Number(tr.usdtAmount || tr.amount || tr.netUsdt || 0);
                totalTrades += 1;
                totalP2pUsdt += amt;

                // ✅ በግብይቱ ወቅት በትክክል ተቆርጦ የተቀመጠውን የUSDT ኮሚሽን ብቻ መደመር
                let exactSavedFee = 0;
                if (tr.totalPlatformFeeUsdt !== undefined && Number(tr.totalPlatformFeeUsdt) > 0) {
                    exactSavedFee = Number(tr.totalPlatformFeeUsdt);
                } else if (tr.buyerFeeUsdt !== undefined || tr.sellerFeeUsdt !== undefined) {
                    exactSavedFee = Number(tr.buyerFeeUsdt || 0) + Number(tr.sellerFeeUsdt || 0);
                } else if (tr.feeUsdt !== undefined && Number(tr.feeUsdt) > 0) {
                    exactSavedFee = Number(tr.feeUsdt);
                }

                totalFeeUsdt += exactSavedFee;

                const tradeDate = tr.updatedAt ? new Date(tr.updatedAt) : new Date(tr.createdAt);
                if (tradeDate >= today) {
                    todayP2pUsdt += amt;
                    todayFeeUsdt += exactSavedFee;
                }
            });

            activeEscrowTrades.forEach(tr => {
                const lockedAmt = Number(tr.usdtAmount || tr.sellerTotalDeductedUsdt || tr.amount || 0);
                activeEscrowUsdt += lockedAmt;
            });
        }

        const livePosts = activeAds.length;
        let onMarketLockedUsdt = 0;
        activeAds.forEach(ad => {
            if (ad.tradeType === 'sell') {
                onMarketLockedUsdt += Number(ad.totalAmount || 0);
            }
        });

        res.json({ 
            success: true, 
            data: { 
                totalUsers, 
                kycPending, 
                onMarket: `${Number(onMarketLockedUsdt.toFixed(2)).toLocaleString('en-US')} USDT`,
                livePosts,
                totalTrades,
                activeEscrow: `${Number(activeEscrowUsdt.toFixed(2)).toLocaleString('en-US')} USDT`,
                totalVolume: `${Number(totalP2pUsdt.toFixed(2)).toLocaleString('en-US')} USDT`,
                todayVolume: `${Number(todayP2pUsdt.toFixed(2)).toLocaleString('en-US')} USDT`,
                totalFeeEarned: `${Number(totalFeeUsdt.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 })} USDT`,
                todayFeeEarned: `${Number(todayFeeUsdt.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 })} USDT`
            } 
        });
    } catch (error) {
        console.error("Stats Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
});

// 🚀 Fast KYC Endpoints 🚀
app.get('/api/admin/kyc-requests', verifyAdminToken, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const skip = (page - 1) * limit;
        const statusFilter = req.query.status ? { status: req.query.status } : {};

        const includePhotos = req.query.includePhotos === 'true';
        const projection = includePhotos ? {} : { frontImage: 0, backImage: 0, selfieImage: 0 };

        const [kycList, totalCount] = await Promise.all([
            KYC.find(statusFilter, projection)
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
            status: kyc.status || 'pending',
            createdAt: kyc.createdAt || null,
            ...(includePhotos ? {
                frontImage: formatImage(kyc.frontImage),
                backImage: formatImage(kyc.backImage),
                selfieImage: formatImage(kyc.selfieImage)
            } : {})
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

app.get('/api/admin/kyc-docs/:id', verifyAdminToken, async (req, res) => {
    try {
        const kyc = await KYC.findById(req.params.id).lean();
        if (!kyc) {
            return res.status(404).json({ success: false, message: 'KYC record not found' });
        }

        const formatImage = (img) => {
            if (!img) return '';
            if (Buffer.isBuffer(img)) {
                return `data:image/jpeg;base64,${img.toString('base64')}`;
            }
            if (typeof img === 'string' && img.startsWith('data:image/')) return img;
            return img;
        };

        return res.json({
            success: true,
            data: {
                _id: kyc._id,
                email: kyc.email || '',
                frontImage: formatImage(kyc.frontImage),
                backImage: formatImage(kyc.backImage),
                selfieImage: formatImage(kyc.selfieImage)
            }
        });
    } catch (error) {
        console.error("KYC Docs Fetch Error:", error);
        return res.status(500).json({ success: false, message: 'Error fetching KYC documents' });
    }
});

app.post('/api/kyc/submit', async (req, res) => {
    try {
        const { userId, email, fullName, idNumber, docType, dateOfBirth, residentialAddress, frontImage, backImage, selfieImage } = req.body;

        if (!email && !userId) {
            return res.status(400).json({ success: false, message: 'Email or userId is required for KYC submission.' });
        }

        let user = null;
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            user = await User.findById(userId).select('-kycData');
        }
        if (!user && email) {
            user = await User.findOne({ email: email.toLowerCase() }).select('-kycData');
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
        // Store only lightweight text metadata on User document so User queries stay fast!
        user.kycData = {
            idNumber: idNumber || '',
            dateOfBirth: dateOfBirth || '',
            residentialAddress: residentialAddress || '',
            docType: docType || 'national_id',
            submittedAt: new Date()
        };
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
        const { kycId, status, rejectionReason } = req.body; 
        const newStatus = status === 'approved' ? 'approved' : 'rejected';
        const userTargetStatus = status === 'approved' ? 'verified' : 'rejected';

        const kycRecord = await KYC.findByIdAndUpdate(
            kycId,
            { $set: { status: newStatus, rejectionReason: rejectionReason || '' } },
            { new: true, select: 'userId email status' }
        );

        if (!kycRecord) {
            const userRecord = await User.findByIdAndUpdate(
                kycId,
                { $set: { kycStatus: userTargetStatus } },
                { new: true, select: '_id email kycStatus' }
            );
            if (userRecord) {
                return res.json({ success: true, message: `User KYC status updated to ${newStatus} successfully.` });
            }
            return res.status(404).json({ success: false, message: 'KYC record not found.' });
        }

        if (kycRecord.userId) {
            await User.findByIdAndUpdate(kycRecord.userId, { $set: { kycStatus: userTargetStatus } });
        } else if (kycRecord.email) {
            await User.findOneAndUpdate({ email: kycRecord.email.toLowerCase() }, { $set: { kycStatus: userTargetStatus } });
        }

        res.json({ success: true, message: `KYC status updated to ${newStatus} successfully.` });
    } catch (error) {
        console.error("KYC Action Error:", error);
        res.status(500).json({ success: false, message: 'Error updating KYC status' });
    }
});

app.get('/api/admin/users', verifyAdminToken, async (req, res) => {
    try {
        const users = await User.find({}).select('-password -kycData -bscPrivateKey').sort({ _id: -1 }).lean();
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
        }).select('_id userId numericId').sort({ createdAt: 1 });

        if (usersWithoutId.length === 0) return;

        const lastUser = await User.findOne({ 
            userId: { $regex: /^TBR-\d+$/, $nin: ['TBR-000000', 'TBR------'] } 
        }).select('numericId').sort({ numericId: -1 }).lean();

        let nextIdNumber = lastUser && lastUser.numericId ? lastUser.numericId + 1 : 1;

        for (let user of usersWithoutId) {
            user.numericId = nextIdNumber;
            user.userId = 'TBR-' + String(nextIdNumber).padStart(6, '0');
            await user.save();
            nextIdNumber++;
        }
    } catch (err) {
        console.error("Migration error:", err.message);
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
        }).select('_id bscAddress bscPrivateKey');

        if (usersWithoutWallet.length === 0) return;

        for (let user of usersWithoutWallet) {
            const wallet = generateBscWallet();
            user.bscAddress = wallet.address;
            user.bscPrivateKey = wallet.privateKey;
            await user.save();
        }
    } catch (error) {
        console.error("Wallet Migration Error:", error.message);
    }
}

const passkeySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    credentialId: { type: String, required: true, unique: true },
    credentialPublicKey: { type: String, required: true },
    counter: { type: Number, default: 0 },
    deviceType: { type: String, default: 'singleDevice' },
    backedUp: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Passkey = mongoose.model('Passkey', passkeySchema);

const passkeyChallenges = {};

function toBase64Url(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

app.post('/api/passkey/login-options', async (req, res) => {
    try {
        const challenge = crypto.randomBytes(32);
        const encodedChallenge = toBase64Url(challenge);
        passkeyChallenges['latest_challenge'] = encodedChallenge;

        res.json({
            success: true,
            options: {
                challenge: encodedChallenge,
                timeout: 60000,
                rpId: 'tbrexchange.com',
                userVerification: "required"
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
        const passkeyDoc = await Passkey.findOne({ credentialId: id }).lean();
        if (!passkeyDoc) {
            return res.status(400).json({ success: false, message: 'Passkey not recognized on this server.' });
        }

        const user = await User.findById(passkeyDoc.userId).select('-kycData').lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'Associated user not found.' });
        }

        if (user.isBanned) {
            return res.status(403).json({ success: false, message: 'This account has been banned.' });
        }

        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

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
        const user = await User.findById(req.user.id).select('email fullName').lean();
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const challenge = crypto.randomBytes(32);
        const encodedChallenge = toBase64Url(challenge);
        const encodedUserId = toBase64Url(Buffer.from(user._id.toString()));

        res.json({
            success: true,
            options: {
                challenge: encodedChallenge,
                rp: { name: "TBR Exchange", id: 'tbrexchange.com' },
                user: {
                    id: encodedUserId,
                    name: user.email,
                    displayName: user.fullName || user.email
                },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                timeout: 60000,
                attestation: "none",
                authenticatorSelection: {
                    userVerification: "required",
                    residentKey: "required"
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

        const existingPasskey = await Passkey.findOne({ credentialId: id }).lean();
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
        const passkeys = await Passkey.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
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

// Keep-Alive Self-Pinger so Render Server never sleeps
setInterval(() => {
    const selfUrl = process.env.RENDER_EXTERNAL_URL || 'https://tbr-exchange-backend.onrender.com';
    fetch(`${selfUrl}/api/ping`).catch(() => {});
}, 8 * 60 * 1000);

app.get('/api/reset-test-wallets', async (req, res) => {
    try {
        await User.updateMany({}, { $set: { bscAddress: "", bscPrivateKey: "" } });
        res.json({ success: true, message: "All user wallets have been successfully reset!" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/settings/limits', (req, res) => {
    res.json({
        success: true,
        minWithdrawal: 2
    });
});

async function autoSweepUSDT(userAddress, userPrivateKey) {
    try {
        if (!masterWallet) return;
        const userWallet = new ethers.Wallet(userPrivateKey, provider);
        const actualAddress = userWallet.address;
        
        const usdtContractUser = new ethers.Contract(USDT_CONTRACT_ADDRESS, usdtAbi, userWallet);
        const usdtBalance = await usdtContractUser.balanceOf(actualAddress);
        
        if (usdtBalance > 0n) {
            const txFee = ethers.parseEther("0.0003"); 
            const bnbTx = await masterWallet.sendTransaction({
                to: actualAddress,
                value: txFee
            });
            await bnbTx.wait(); 

            const sweepTx = await usdtContractUser.transfer(masterWallet.address, usdtBalance);
            await sweepTx.wait();

            const sweptAmount = parseFloat(ethers.formatUnits(usdtBalance, 18));
            const user = await User.findOne({ bscAddress: new RegExp(`^${actualAddress}$`, 'i') }).select('_id email').lean();
            if (user) {
                await Transaction.create({
                    userId: user._id,
                    email: user.email,
                    type: 'sweep',
                    amount: sweptAmount,
                    status: 'completed'
                });
            }
        }
    } catch (error) {
        console.error(`[Auto-Sweep Error]:`, error.message);
    }
}

// --- 🔥 Verify Recipient API 🔥 ---
app.get('/api/verify-recipient', verifyToken, async (req, res) => {
    try {
        const query = (req.query.q || '').trim();
        const queryLower = query.toLowerCase();
        const currentUserId = req.user.id;

        const isObjectId = /^[0-9a-fA-F]{24}$/.test(query);

        let receiver = await User.findOne({
            $or: [
                { email: queryLower },
                { userId: query },
                { tbrId: query },
                { accountId: query },
                ...(isObjectId ? [{ _id: query }] : [])
            ]
        }).select('_id email').lean();

        if (!receiver || receiver._id.toString() === currentUserId) {
            return res.json({ success: false });
        }

        res.json({ success: true, email: receiver.email });
    } catch (error) {
        console.error("Verify Recipient Error:", error);
        res.status(500).json({ success: false });
    }
});

// --- 🔥 Internal Transfer API (Zero Fee & Security Verification) 🔥 ---
app.post('/api/transfer', verifyToken, async (req, res) => {
    try {
        const { recipient, amount, code, authType } = req.body;
        const senderId = req.user.id;
        const transferAmount = parseFloat(amount);
        const recipientQuery = (recipient || '').trim();

        if (!recipientQuery || isNaN(transferAmount) || transferAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid transfer details.' });
        }

        const sender = await User.findById(senderId).select('-kycData');
        if (!sender) {
            return res.status(404).json({ success: false, message: 'Sender not found.' });
        }

        if (sender.balance < transferAmount) {
            return res.status(400).json({ success: false, message: `Your available balance is ${sender.balance} USDT. Insufficient balance!` });
        }

        if (authType === 'email' && sender.emailOtp && sender.emailOtp === code) {
            sender.emailOtp = undefined;
            sender.emailOtpExpires = undefined;
        } else if (code && code !== '') {
            if (sender.emailOtp && sender.emailOtp !== code) {
                return res.status(400).json({ success: false, message: 'Invalid verification code.' });
            }
        }

        const isObjectId = /^[0-9a-fA-F]{24}$/.test(recipientQuery);

        let receiver = await User.findOne({
            $or: [
                { email: recipientQuery.toLowerCase() },
                { userId: recipientQuery },
                { tbrId: recipientQuery },
                { accountId: recipientQuery },
                ...(isObjectId ? [{ _id: recipientQuery }] : [])
            ]
        }).select('-kycData');

        if (!receiver) {
            return res.status(404).json({ success: false, message: 'Recipient not found! Please check the Email or ID.' });
        }

        if (sender._id.toString() === receiver._id.toString()) {
            return res.status(400).json({ success: false, message: 'You cannot transfer to yourself.' });
        }

        sender.balance = Number((sender.balance - transferAmount).toFixed(6));
        receiver.balance = Number(((receiver.balance || 0) + transferAmount).toFixed(6));

        await sender.save();
        await receiver.save();

        try {
            await Transaction.create([
                {
                    userId: sender._id,
                    email: sender.email,
                    type: 'transfer',
                    amount: transferAmount, 
                    destinationAddress: receiver.email,
                    status: 'completed'
                },
                {
                    userId: receiver._id,
                    email: receiver.email,
                    type: 'deposit', 
                    amount: transferAmount,
                    destinationAddress: sender.email,
                    status: 'completed'
                }
            ]);
        } catch(txErr) {
            console.error("History save error:", txErr.message);
        }

        res.json({ success: true, message: 'Transfer successful!' });

    } catch (error) {
        console.error("Transfer Error:", error);
        res.status(500).json({ success: false, message: 'Server error during transfer.' });
    }
});

// --- 🔥 Transaction History API 🔥 ---
app.get('/api/transactions', verifyToken, async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100).lean();
        res.json({ success: true, transactions });
    } catch (error) {
        console.error("Transactions fetch error:", error);
        res.status(500).json({ success: false, message: 'Server error fetching transactions' });
    }
});

// --- 🔥 P2P Ad Schema & Model 🔥 ---
const adSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, index: true },
    name: { type: String, required: true },
    tradeType: { type: String, enum: ['buy', 'sell'], required: true, index: true },
    price: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    minLimit: { type: Number, required: true },
    maxLimit: { type: Number, required: true },
    paymentMethods: [{ type: String }],
    verificationLevel: { type: String, default: 'Anyone (no restriction)' },
    termsConditions: { type: String, default: '' },
    status: { type: String, default: 'active', index: true },
    createdAt: { type: Date, default: Date.now, index: true }
});

const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema);

// In-memory cache for /api/ads so Market loads in <5ms
let adsCacheData = null;
let adsCacheTime = 0;

// --- 🔥 Heartbeat API 🔥 ---
app.post('/api/user/heartbeat', verifyToken, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { $set: { lastActive: new Date() } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// --- 🔥 P2P Ad APIs 🔥 ---
app.post('/api/ads', verifyToken, async (req, res) => {
    try {
        const { tradeType, price, totalAmount, minLimit, maxLimit, paymentMethods, verificationLevel, termsConditions } = req.body;
        const user = await User.findById(req.user.id).select('-kycData');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const amountNum = Number(totalAmount);

        if (tradeType === 'sell') {
            if (!user.balance || user.balance < amountNum) {
                return res.status(400).json({ success: false, message: 'Insufficient balance to post this sell ad.' });
            }
            
            user.balance = Number((user.balance - amountNum).toFixed(6));
            user.lockedBalance = Number(((user.lockedBalance || 0) + amountNum).toFixed(6));
        }

        user.lastActive = new Date();
        await user.save();

        let cleanUsername = (user.traderUsername || '').trim().replace(/^@+/, '').trim();
        let idDigits = String(user.userId || '').replace(/\D/g, '').padStart(6, '0');
        let displayTraderName = cleanUsername ? cleanUsername : `trader${idDigits || '000001'}`;

        const newAd = new Ad({
            userId: user._id,
            email: user.email,
            name: displayTraderName,
            tradeType,
            price: Number(price),
            totalAmount: amountNum,
            minLimit: Number(minLimit),
            maxLimit: Number(maxLimit),
            paymentMethods: paymentMethods || [],
            verificationLevel: verificationLevel || 'Anyone (no restriction)',
            termsConditions: termsConditions || '',
            status: 'active'
        });

        await newAd.save();
        adsCacheData = null; // Invalidate cache immediately
        res.status(201).json({ success: true, message: 'Ad posted successfully!', ad: newAd });
    } catch (error) {
        console.error("Post Ad Error Details:", error);
        res.status(500).json({ success: false, message: error.message || 'Server error while posting ad.' });
    }
});

// ⚡ ፈጣን የፕሮፋይል ፎቶ ማስቀመጫ (RAM Cache) - ፍጥነት ሳይቀንስ ፎቶዎችን በ 0.01s ያመጣል ⚡
const userAvatarMemoryCache = new Map();

async function getFastUserAvatar(userId, fallbackAvatar) {
    if (fallbackAvatar) return fallbackAvatar;
    if (!userId) return '';
    const key = String(userId);
    if (userAvatarMemoryCache.has(key)) return userAvatarMemoryCache.get(key);
    try {
        if (mongoose.Types.ObjectId.isValid(key)) {
            const u = await User.findById(key).select('avatar').lean();
            const av = (u && u.avatar) || '';
            userAvatarMemoryCache.set(key, av);
            return av;
        }
    } catch (e) {}
    return '';
}

app.get('/api/ads', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

        const ads = await Ad.find({ status: 'active', totalAmount: { $gt: 0.0001 } })
            .populate('userId', 'avatar traderUsername userId numericId fullName email lastActive')
            .sort({ createdAt: -1 })
            .lean();

        const now = Date.now();
        const ONLINE_THRESHOLD = 2 * 60 * 1000;

        const enrichedAds = ads
            .filter(ad => {
                const maxPossibleEtb = Number(ad.totalAmount || 0) * Number(ad.price || 0);
                return maxPossibleEtb + 0.01 >= Number(ad.minLimit || 0);
            })
            .map(ad => {
                const trader = ad.userId && typeof ad.userId === 'object' ? ad.userId : {};
                const rawUsername = (trader.traderUsername || '').trim().replace(/^@+/, '').trim();
                const tbrId = trader.userId || '';
                const idDigits = String(tbrId).replace(/\D/g, '').padStart(6, '0') || '000001';

                const displayName = rawUsername ? rawUsername : (ad.name || `trader${idDigits}`);
                const isOnline = trader.lastActive ? (now - new Date(trader.lastActive).getTime() <= ONLINE_THRESHOLD) : false;

                if (trader._id && trader.avatar) {
                    userAvatarMemoryCache.set(String(trader._id), trader.avatar);
                }

                const availUsdt = Number(ad.totalAmount || 0);
                const priceEtb = Number(ad.price || 0);
                const maxPossibleEtb = Number((availUsdt * priceEtb).toFixed(2));
                const effectiveMaxLimit = Math.min(Number(ad.maxLimit || maxPossibleEtb), maxPossibleEtb);

                return {
                    ...ad,
                    totalAmount: Number(availUsdt.toFixed(4)),
                    minLimit: Number(ad.minLimit || 0),
                    maxLimit: effectiveMaxLimit,
                    userId: trader._id || ad.userId,
                    name: displayName,
                    traderUsername: rawUsername,
                    tbrId: tbrId,
                    // ✅ የፕሮፋይል ፎቶው በማርኬት ላይ ፍጥነት ሳይቀንስ እንዲታይ ተደርጓል!
                    avatar: trader.avatar || ad.avatar || '',
                    profilePic: trader.avatar || ad.avatar || '',
                    isOnline: isOnline
                };
            });

        res.json({ success: true, ads: enrichedAds });
    } catch (error) {
        console.error("Fetch Ads Error:", error);
        res.status(500).json({ success: false, message: 'Server error fetching ads.' });
    }
});

app.get('/api/ads/my', verifyToken, async (req, res) => {
    try {
        const myAds = await Ad.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, ads: myAds });
    } catch (error) {
        console.error("Fetch My Ads Error:", error);
        res.status(500).json({ success: false, message: 'Server error fetching user ads.' });
    }
});

app.put('/api/ads/:id/cancel', verifyToken, async (req, res) => {
    try {
        const ad = await Ad.findOne({ _id: req.params.id, userId: req.user.id });
        if (!ad) return res.status(404).json({ success: false, message: 'Ad not found.' });
        
        if (ad.status !== 'cancelled' && ad.status !== 'completed') {
            const refundAmt = Number(ad.totalAmount || 0);
            ad.status = 'cancelled';
            ad.totalAmount = 0;
            
            if (ad.tradeType === 'sell' && refundAmt > 0) {
                const user = await User.findById(req.user.id).select('balance lockedBalance');
                if (user) {
                    user.balance = Number(((user.balance || 0) + refundAmt).toFixed(6));
                    user.lockedBalance = Math.max(0, Number(((user.lockedBalance || 0) - refundAmt).toFixed(6)));
                    await user.save();
                }
            }
            
            await ad.save();
            adsCacheData = null;
        }
        
        res.json({ success: true, message: 'Ad cancelled and funds refunded successfully.' });
    } catch (error) {
        console.error("Cancel Ad Error:", error);
        res.status(500).json({ success: false, message: 'Server error while canceling ad.' });
    }
});

// ============================================================================
// ⚡ P2P TRADE ESCROW, EXACT 0.5%+0.5% FEE & MIN-LIMIT AUTO-REFUND SYSTEM ⚡
// ============================================================================
const tradeSchema = new mongoose.Schema({
    tradeNumber: { type: String, required: true, index: true },
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
    tradeType: { type: String, enum: ['buy', 'sell'], required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    buyerName: { type: String, default: 'Buyer' },
    sellerName: { type: String, default: 'Seller' },
    buyerEmail: { type: String, default: '', index: true },
    sellerEmail: { type: String, default: '', index: true },
    buyerAvatar: { type: String, default: '' },
    sellerAvatar: { type: String, default: '' },
    unitPrice: { type: Number, required: true },
    etbAmount: { type: Number, required: true },
    usdtAmount: { type: Number, required: true },          // Base Trade USDT (U)
    feePercent: { type: Number, default: 0.5 },            // e.g. 0.5%
    buyerFeeUsdt: { type: Number, default: 0 },            // 0.5% deducted from Buyer
    sellerFeeUsdt: { type: Number, default: 0 },           // 0.5% deducted from Seller
    totalPlatformFeeUsdt: { type: Number, default: 0 },    // 1.0% total kept by platform
    sellerTotalDeductedUsdt: { type: Number, default: 0 }, // Total locked/deducted from Seller (U + sellerFee)
    deductedFromAdUsdt: { type: Number, default: 0 },      // Portion taken from Ad's totalAmount
    deductedFromWalletUsdt: { type: Number, default: 0 },  // Portion taken from Seller's wallet balance
    netUsdt: { type: Number, default: 0 },                 // Net USDT Buyer receives (U - buyerFee)
    paymentMethod: { type: String, required: true },
    paymentDetails: {
        accountName: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        bankName: { type: String, default: '' }
    },
    receiptImage: { type: String, default: '' },
    warningExtended: { type: Boolean, default: false },
    disputeReason: { type: String, default: '' },
    status: {
        type: String,
        enum: ['funds_locked', 'payment_sent', 'completed', 'cancelled', 'disputed'],
        default: 'funds_locked',
        index: true
    },
    messages: [{
        senderId: { type: String },
        senderName: { type: String },
        text: { type: String, default: '' },
        image: { type: String, default: '' },
        isSystem: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
    }],
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now, index: true }
});

const Trade = mongoose.models.Trade || mongoose.model('Trade', tradeSchema);

// Fast User Resolver using the exact JWT_SECRET
async function resolveUserFromRequest(req) {
    let decoded = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const rawToken = authHeader.split(' ')[1];
        try {
            decoded = jwt.verify(rawToken, JWT_SECRET);
        } catch (e) {
            try {
                const payloadPart = rawToken.split('.')[1];
                if (payloadPart) decoded = JSON.parse(Buffer.from(payloadPart, 'base64').toString('utf8'));
            } catch (e2) {}
        }
    }

    const uid = (decoded && (decoded.id || decoded._id || decoded.userId)) ||
                (req.query && req.query.userId) ||
                (req.body && req.body.userId);
    const uemail = (decoded && decoded.email) ||
                   (req.query && req.query.email) ||
                   (req.body && req.body.email);

    const lightFields = '-password -kycData -bscPrivateKey';

    if (uid && mongoose.Types.ObjectId.isValid(uid)) {
        const u = await User.findById(uid).select(lightFields);
        if (u) return u;
    }
    if (uemail) {
        const u = await User.findOne({ email: String(uemail).toLowerCase().trim() }).select(lightFields);
        if (u) return u;
    }
    if (uid) {
        const u = await User.findOne({ userId: String(uid) }).select(lightFields);
        if (u) return u;
    }
    return null;
}

// 🔄 ቀሪው USDT ነጋዴው ካስቀመጠው Minimum በታች ከሆነ ፖስቱን Cancel አድርጎ ቀሪውን ወደ ዋሌት መመለሻ 🔄
async function checkAdMinLimitAndCleanUp(ad) {
    if (!ad) return;
    const remainingUsdt = Number(ad.totalAmount || 0);
    const priceEtb = Number(ad.price || 0);
    const remainingEtbValue = Number((remainingUsdt * priceEtb).toFixed(2));
    const sellerMinLimitEtb = Number(ad.minLimit || 0);

    // 1. ቀሪው USDT 0 ከሆነ ወይም በብር ሲሰላ ነጋዴው ካስቀመጠው Minimum Limit በታች ከሆነ
    if (remainingUsdt <= 0.0001 || (sellerMinLimitEtb > 0 && remainingEtbValue + 0.01 < sellerMinLimitEtb)) {
        // ማስታወቂያው የSell ከሆነና ቀሪ USDT ካለው፣ ከ "On Market" (lockedBalance) አውጥቶ ወደ ዋናው Wallet (balance) መመለስ!
        if (ad.tradeType === 'sell' && remainingUsdt > 0.0001 && ad.userId) {
            const refundUsdt = Number(remainingUsdt.toFixed(6));
            const sellerDoc = await User.findById(ad.userId).select('balance lockedBalance');
            if (sellerDoc) {
                sellerDoc.balance = Number(((sellerDoc.balance || 0) + refundUsdt).toFixed(6));
                sellerDoc.lockedBalance = Math.max(0, Number(((sellerDoc.lockedBalance || 0) - refundUsdt).toFixed(6)));
                await sellerDoc.save();
            }
        }

        // ፖስቱን በራሱ ጊዜ Cancel ማድረግና ከማርኬት ማውጣት
        ad.totalAmount = 0;
        ad.status = 'cancelled';
    } else {
        // 2. ቀሪው ከ Minimum Limit በላይ ከሆነ ግን ፖስቱ አይጠፋም! (Max Limit ብቻ ከቀሪው USDT ጋር ይስተካከላል)
        ad.totalAmount = Number(remainingUsdt.toFixed(6));
        ad.status = 'active';
        if (Number(ad.maxLimit || 0) > remainingEtbValue) {
            ad.maxLimit = remainingEtbValue;
        }
    }

    await ad.save();
    adsCacheData = null;
}

// 🔄 ትዕዛዝ ሲሰረዝ (Cancel)፦ ምንም ኮሚሽን (0 Fee) ሳይቆረጥ ሙሉው USDT ወደ ማርኬት ፖስቱ (On Market) ይመለሳል! 🔄
async function refundEscrowOnCancel(trade) {
    try {
        const ad = trade.adId ? await Ad.findById(trade.adId) : null;

        if (trade.tradeType === 'buy') {
            // ማስታወቂያው የሻጭ (Sell Ad) ነበር፦ ከፖስቱ የተቀነሰውን ሙሉ USDT (ከነ 0.5% ኮሚሽኑ) ወደ ፖስቱ መመለስ!
            const fromAd = Number(trade.deductedFromAdUsdt || trade.usdtAmount || 0);
            const fromWallet = Number(trade.deductedFromWalletUsdt || 0);

            // ከሻጩ ዋሌት ላይ ለኮሚሽን የተወሰደ ነገር ካለ ወደ ዋሌቱ መመለስ
            if (fromWallet > 0) {
                await User.findByIdAndUpdate(trade.sellerId, {
                    $inc: {
                        balance: Number(fromWallet.toFixed(6)),
                        lockedBalance: -Number(fromWallet.toFixed(6))
                    }
                });
            }

            if (ad) {
                // ✅ ወደ ዋሌት ሳይሆን ቀጥታ ወደ ማርኬት ፖስቱ (ad.totalAmount) መመለስና ፖስቱን Active ማድረግ!
                ad.totalAmount = Number(((ad.totalAmount || 0) + fromAd).toFixed(6));
                ad.status = 'active';

                // የፖስቱን Max Limit ከተመለሰው USDT ጋር ማስተካከል
                const restoredEtbVal = Number((ad.totalAmount * Number(ad.price || 0)).toFixed(2));
                if (Number(ad.maxLimit || 0) < restoredEtbVal) {
                    ad.maxLimit = restoredEtbVal;
                }
                await ad.save();
            }
        } else {
            // ማስታወቂያው የገዢ (Buy Ad) ነበር፦ ሻጩ ከዋሌቱ ያወጣውን ሙሉ USDT (ያለ ምንም ኮሚሽን ቅነሳ) መመለስ
            const totalToRefundSeller = Number(trade.sellerTotalDeductedUsdt || trade.deductedFromWalletUsdt || trade.usdtAmount || 0);
            if (totalToRefundSeller > 0) {
                await User.findByIdAndUpdate(trade.sellerId, {
                    $inc: {
                        balance: Number(totalToRefundSeller.toFixed(6)),
                        lockedBalance: -Number(totalToRefundSeller.toFixed(6))
                    }
                });
            }
            if (ad) {
                // ✅ የገዢውንም ማስታወቂያ (Buy Ad) መጠን ወደ ቦታው መልሶ ማርኬት ላይ Active ማድረግ!
                ad.totalAmount = Number(((ad.totalAmount || 0) + Number(trade.deductedFromAdUsdt || trade.usdtAmount || 0)).toFixed(6));
                ad.status = 'active';
                const restoredEtbVal = Number((ad.totalAmount * Number(ad.price || 0)).toFixed(2));
                if (Number(ad.maxLimit || 0) < restoredEtbVal) {
                    ad.maxLimit = restoredEtbVal;
                }
                await ad.save();
            }
        }
        adsCacheData = null;
    } catch (e) {
        console.error("Refund Escrow Error:", e);
    }
}
// 1. ትዕዛዝ መፍጠሪያ (ነጋዴው በሌላ ትሬድ ላይ ከሆነ የሚከለክል + ቀሪውን USDT እዛው ፖስቱ ላይ የሚያስቀር)
app.post('/api/trades', async (req, res) => {
    try {
        const { adId, actionType, etbAmount, usdtAmount, paymentMethod } = req.body;
        const currentUser = await resolveUserFromRequest(req);
        if (!currentUser) return res.status(404).json({ success: false, message: 'User not found. Please log in again.' });

        const ad = mongoose.Types.ObjectId.isValid(adId) ? await Ad.findById(adId) : null;
        if (!ad || ad.status !== 'active' || ad.totalAmount <= 0.0001) {
            return res.status(400).json({ success: false, message: 'This ad is no longer available.' });
        }

        let adOwner = null;
        if (ad.userId && mongoose.Types.ObjectId.isValid(ad.userId)) {
            adOwner = await User.findById(ad.userId).select('-password -kycData -bscPrivateKey');
        }
        if (!adOwner && ad.email) {
            adOwner = await User.findOne({ email: String(ad.email).toLowerCase().trim() }).select('-password -kycData -bscPrivateKey');
        }
        if (!adOwner && ad.userId) {
            adOwner = await User.findOne({ userId: String(ad.userId) }).select('-password -kycData -bscPrivateKey');
        }
        if (!adOwner) return res.status(404).json({ success: false, message: 'Advertiser not found.' });

        // 🛑 1. ነጋዴው በአሁኑ ሰዓት በሌላ ትሬድ ላይ ከሆነ "This trader is on another trade" ብሎ መከልከል 🛑
        const ownerEmail = (adOwner.email || '').toLowerCase();
        const activeTradeForTrader = await Trade.findOne({
            $or: [
                { adId: ad._id },
                { buyerId: adOwner._id },
                { sellerId: adOwner._id },
                ...(ownerEmail ? [{ buyerEmail: ownerEmail }, { sellerEmail: ownerEmail }] : [])
            ],
            status: { $in: ['funds_locked', 'payment_sent', 'disputed'] }
        }).select('_id').lean();

        if (activeTradeForTrader) {
            return res.status(400).json({
                success: false,
                message: 'This trader is on another trade. Please wait until they finish.'
            });
        }

        const usdtNum = Number(usdtAmount);
        const etbNum = Number(etbAmount);

        if (usdtNum <= 0 || etbNum <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid trade amount.' });
        }
        if (usdtNum > ad.totalAmount + 0.0001) {
            return res.status(400).json({ success: false, message: 'Amount exceeds ad available USDT.' });
        }

        const settings = await Setting.findOne({}).lean();
        const feePercent = settings && settings.platformFee !== undefined ? Number(settings.platformFee) : 0.5;
        const feeRate = feePercent / 100;

        let buyerFeeUsdt = Number((usdtNum * feeRate).toFixed(6));
        let sellerFeeUsdt = Number((usdtNum * feeRate).toFixed(6));
        let totalPlatformFeeUsdt = Number((buyerFeeUsdt + sellerFeeUsdt).toFixed(6));
        let netUsdtForBuyer = Math.max(0, Number((usdtNum - buyerFeeUsdt).toFixed(6)));

        let buyerUser, sellerUser;
        let sellerTotalDeductedUsdt = Number((usdtNum + sellerFeeUsdt).toFixed(6));
        let deductedFromAdUsdt = 0;
        let deductedFromWalletUsdt = 0;

        if (actionType === 'buy') {
            // ተጠቃሚው "Buy" ብሏል -> ማስታወቂያው የሻጭ (Sell Ad) ነው
            buyerUser = currentUser;
            sellerUser = adOwner;

            // ከሻጩ ፖስት (ad.totalAmount) ላይ የተገዛውን መጠን መቀነስ
            if (ad.totalAmount >= sellerTotalDeductedUsdt) {
                deductedFromAdUsdt = sellerTotalDeductedUsdt;
                ad.totalAmount = Number((ad.totalAmount - sellerTotalDeductedUsdt).toFixed(6));
            } else {
                deductedFromAdUsdt = Number(ad.totalAmount.toFixed(6));
                const neededFeeFromWallet = Number((sellerTotalDeductedUsdt - deductedFromAdUsdt).toFixed(6));
                ad.totalAmount = 0;

                const freshSeller = await User.findById(sellerUser._id).select('balance').lean();
                const sellerWalBal = Number((freshSeller && freshSeller.balance) || 0);

                if (sellerWalBal >= neededFeeFromWallet) {
                    deductedFromWalletUsdt = neededFeeFromWallet;
                    await User.findByIdAndUpdate(sellerUser._id, {
                        $inc: {
                            balance: -neededFeeFromWallet,
                            lockedBalance: neededFeeFromWallet
                        }
                    });
                } else {
                    deductedFromWalletUsdt = 0;
                    sellerTotalDeductedUsdt = deductedFromAdUsdt;
                    netUsdtForBuyer = Math.max(0, Number((deductedFromAdUsdt - sellerFeeUsdt - buyerFeeUsdt).toFixed(6)));
                }
            }

            // ✅ ፖስቱን ሳያጠፋ ቀሪውን USDT እዛው ፖስቱ ላይ እንዳለ ያስቀራል!
            await checkAdMinLimitAndCleanUp(ad);

        } else {
            // ተጠቃሚው "Sell" ብሏል -> አሁን የሚሸጠው ሰው ሻጭ (Seller) ነው፣ ማስታወቂያው የገዢ (Buy Ad) ነው
            sellerUser = currentUser;
            buyerUser = adOwner;

            const freshSeller = await User.findById(sellerUser._id).select('balance').lean();
            const sellerAvail = Number((freshSeller && freshSeller.balance) || 0);

            if (sellerAvail + 0.0001 < usdtNum) {
                return res.status(400).json({ success: false, message: 'Insufficient USDT balance to sell.' });
            }

            if (sellerAvail >= sellerTotalDeductedUsdt) {
                deductedFromWalletUsdt = sellerTotalDeductedUsdt;
            } else {
                deductedFromWalletUsdt = sellerAvail;
                sellerTotalDeductedUsdt = sellerAvail;
                netUsdtForBuyer = Math.max(0, Number((sellerAvail - sellerFeeUsdt - buyerFeeUsdt).toFixed(6)));
            }

            await User.findByIdAndUpdate(sellerUser._id, {
                $inc: {
                    balance: -Number(deductedFromWalletUsdt.toFixed(6)),
                    lockedBalance: Number(deductedFromWalletUsdt.toFixed(6))
                }
            });

            deductedFromAdUsdt = usdtNum;
            ad.totalAmount = Math.max(0, Number((ad.totalAmount - usdtNum).toFixed(6)));

            // ✅ ፖስቱን ሳያጠፋ ቀሪውን USDT እዛው ፖስቱ ላይ እንዳለ ያስቀራል!
            await checkAdMinLimitAndCleanUp(ad);
        }

        const sellerPayments = Array.isArray(sellerUser.paymentMethods) ? sellerUser.paymentMethods : [];
        const matchedPay = sellerPayments.find(p =>
            String(p.type || '').toLowerCase().trim() === String(paymentMethod || '').toLowerCase().trim()
        ) || sellerPayments[0] || {};

        const resolveName = (u) => {
            const clean = String(u.traderUsername || '').trim().replace(/^@+/, '');
            if (clean) return clean;
            if (u.fullName) return u.fullName;
            const digits = String(u.userId || '').replace(/\D/g, '').padStart(6, '0') || '000001';
            return `trader${digits}`;
        };

        const totalTradesCount = await Trade.countDocuments({});
        const sequentialTradeNumber = String(totalTradesCount + 1).padStart(5, '0');

        const sName = resolveName(sellerUser);
        const bName = resolveName(buyerUser);

        const newTrade = new Trade({
            tradeNumber: sequentialTradeNumber,
            adId: ad._id,
            tradeType: actionType,
            buyerId: buyerUser._id,
            sellerId: sellerUser._id,
            buyerName: bName,
            sellerName: sName,
            buyerEmail: (buyerUser.email || '').toLowerCase(),
            sellerEmail: (sellerUser.email || '').toLowerCase(),
            buyerAvatar: buyerUser.avatar || '',
            sellerAvatar: sellerUser.avatar || '',
            unitPrice: Number(ad.price),
            etbAmount: etbNum,
            usdtAmount: usdtNum,
            feePercent,
            buyerFeeUsdt,
            sellerFeeUsdt,
            totalPlatformFeeUsdt,
            sellerTotalDeductedUsdt,
            deductedFromAdUsdt,
            deductedFromWalletUsdt,
            netUsdt: netUsdtForBuyer,
            paymentMethod: paymentMethod || 'Telebirr',
            paymentDetails: {
                accountName: matchedPay.name || sellerUser.fullName || sName,
                accountNumber: matchedPay.account || 'Contact seller in chat',
                bankName: matchedPay.type || paymentMethod || 'Telebirr'
            },
            status: 'funds_locked',
            warningExtended: false,
            messages: [{
                senderId: 'system',
                senderName: 'System',
                text: `Welcome! Trading with ${actionType === 'buy' ? sName : bName}`,
                isSystem: true
            }],
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        await newTrade.save();
        adsCacheData = null;
        res.status(201).json({ success: true, trade: newTrade });
    } catch (error) {
        console.error("Create Trade Error:", error);
        res.status(500).json({ success: false, message: 'Server error creating trade.' });
    }
});

// 2. ⚡ ULTRA-FAST "MY TRADES" LIST (Single Batch Query in 0.02s!) ⚡
app.get('/api/trades', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        const currentUser = await resolveUserFromRequest(req);
        if (!currentUser) {
            return res.json({ success: true, currentUserId: '', total: 0, trades: [] });
        }

        const userId = currentUser._id;
        const userEmail = (currentUser.email || '').toLowerCase();

        const trades = await Trade.find({
            $or: [
                { buyerId: userId },
                { sellerId: userId },
                ...(userEmail ? [{ buyerEmail: userEmail }, { sellerEmail: userEmail }] : [])
            ]
        })
        .select('-receiptImage -messages.image -buyerAvatar -sellerAvatar')
        .sort({ createdAt: -1 })
        .limit(35)
        .lean();

        // በአንድ ጊዜ ብቻ (1 Query) የተሳታፊዎቹን ፎቶዎች ከዳታቤዝ ማምጣት
        const participantIds = new Set();
        trades.forEach(tr => {
            if (tr.buyerId && mongoose.Types.ObjectId.isValid(tr.buyerId)) participantIds.add(String(tr.buyerId));
            if (tr.sellerId && mongoose.Types.ObjectId.isValid(tr.sellerId)) participantIds.add(String(tr.sellerId));
        });

        const avatarMap = {};
        if (participantIds.size > 0) {
            const usersWithAvatars = await User.find({ _id: { $in: Array.from(participantIds) } })
                .select('_id avatar')
                .lean();
            usersWithAvatars.forEach(u => {
                avatarMap[String(u._id)] = u.avatar || '';
            });
        }

        const enrichedTrades = trades.map(tr => ({
            ...tr,
            buyerAvatar: avatarMap[String(tr.buyerId)] || '',
            sellerAvatar: avatarMap[String(tr.sellerId)] || ''
        }));

        res.json({
            success: true,
            currentUserId: String(userId),
            total: enrichedTrades.length,
            trades: enrichedTrades
        });
    } catch (error) {
        console.error("GET /api/trades Error:", error);
        res.status(500).json({ success: false, trades: [] });
    }
});

// 3. ⚡ FAST DASHBOARD ACTIVE TRADES BANNER ⚡
app.get('/api/user/active-trades', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        const currentUser = await resolveUserFromRequest(req);
        if (!currentUser) {
            return res.json({ success: true, count: 0, trades: [] });
        }

        const userId = currentUser._id;
        const userEmail = (currentUser.email || '').toLowerCase();

        const activeTrades = await Trade.find({
            $or: [
                { buyerId: userId },
                { sellerId: userId },
                ...(userEmail ? [{ buyerEmail: userEmail }, { sellerEmail: userEmail }] : [])
            ],
            status: { $in: ['funds_locked', 'payment_sent', 'disputed'] }
        })
        .select('-receiptImage -messages.image -buyerAvatar -sellerAvatar')
        .sort({ createdAt: -1 })
        .lean();

        res.json({
            success: true,
            currentUserId: String(userId),
            count: activeTrades.length,
            latestTrade: activeTrades[0] || null,
            trades: activeTrades
        });
    } catch (error) {
        res.status(500).json({ success: false, count: 0, trades: [] });
    }
});

// 4. Get Single Trade Details (With Profile Avatars)
app.get('/api/trades/:id', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        const currentUser = await resolveUserFromRequest(req);
        let trade = null;

        if (req.params.id === 'latest' && currentUser) {
            trade = await Trade.findOne({
                $or: [{ buyerId: currentUser._id }, { sellerId: currentUser._id }]
            }).sort({ createdAt: -1 });
        } else if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            trade = await Trade.findById(req.params.id);
        }

        if (!trade) return res.status(404).json({ success: false, message: 'Trade not found.' });

        if (trade.status === 'funds_locked' && new Date() >= new Date(trade.expiresAt)) {
            if (!trade.warningExtended) {
                trade.warningExtended = true;
                trade.expiresAt = new Date(Date.now() + 2 * 60 * 1000);
                trade.messages.push({
                    senderId: 'system',
                    senderName: 'System',
                    text: '⚠️ Warning: Payment window expired! An extra 2 minutes has been granted. Please complete payment and upload your receipt now, or this order will be automatically cancelled.',
                    isSystem: true
                });
                await trade.save();
            } else {
                await refundEscrowOnCancel(trade);
                trade.status = 'cancelled';
                trade.messages.push({
                    senderId: 'system',
                    senderName: 'System',
                    text: 'Trade automatically cancelled due to payment timeout. Escrowed USDT has been returned to the seller.',
                    isSystem: true
                });
                await trade.save();
            }
        }

        const tradeObj = trade.toObject();
        if ((!tradeObj.buyerAvatar && tradeObj.buyerId) || (!tradeObj.sellerAvatar && tradeObj.sellerId)) {
            const ids = [tradeObj.buyerId, tradeObj.sellerId].filter(id => id && mongoose.Types.ObjectId.isValid(id));
            const users = await User.find({ _id: { $in: ids } }).select('_id avatar').lean();
            users.forEach(u => {
                if (String(u._id) === String(tradeObj.buyerId)) tradeObj.buyerAvatar = u.avatar || '';
                if (String(u._id) === String(tradeObj.sellerId)) tradeObj.sellerAvatar = u.avatar || '';
            });
        }

        res.json({
            success: true,
            trade: tradeObj,
            currentUserId: currentUser ? String(currentUser._id) : ''
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching trade.' });
    }
});

// 5. ገዢው የደረሰኝ ፎቶ ጭኖ "Yes, I've Transferred" ሲል
app.post('/api/trades/:id/mark-paid', async (req, res) => {
    try {
        const { receiptImage } = req.body;
        const currentUser = await resolveUserFromRequest(req);
        const trade = await Trade.findById(req.params.id);
        if (!trade) return res.status(404).json({ success: false, message: 'Trade not found.' });

        if (!receiptImage) {
            return res.status(400).json({ success: false, message: 'Payment receipt screenshot is required.' });
        }

        trade.status = 'payment_sent';
        trade.receiptImage = receiptImage;
        trade.warningExtended = false;
        trade.expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        trade.messages.push({
            senderId: currentUser ? String(currentUser._id) : String(trade.buyerId),
            senderName: trade.buyerName,
            text: `Payment receipt uploaded (${trade.etbAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB)`,
            image: receiptImage,
            isSystem: false
        });

        await trade.save();
        res.json({ success: true, trade });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating trade status.' });
    }
});

// 6. ⚡ ሻጩ "Release USDT" ሲል (ከሻጭ የተቆለፈውን ቀንሶ፣ 0.5%+0.5% ኮሚሽን አስቀርቶ፣ የተጣራውን ለገዢው ያስገባል) ⚡
app.post('/api/trades/:id/release', async (req, res) => {
    try {
        const trade = await Trade.findById(req.params.id);
        if (!trade) return res.status(404).json({ success: false, message: 'Trade not found.' });

        if (trade.status === 'completed') {
            return res.json({ success: true, trade });
        }
        if (trade.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Trade was already cancelled.' });
        }

        const baseUsdt = Number(trade.usdtAmount || 0);
        const feePct = Number(trade.feePercent || 0.5);
        const feeRate = feePct / 100;

        const buyerFee = Number(trade.buyerFeeUsdt) > 0 ? Number(trade.buyerFeeUsdt) : Number((baseUsdt * feeRate).toFixed(6));
        const sellerFee = Number(trade.sellerFeeUsdt) > 0 ? Number(trade.sellerFeeUsdt) : Number((baseUsdt * feeRate).toFixed(6));
        const totalPlatformFee = Number((buyerFee + sellerFee).toFixed(6));

        const sellerLockedTotal = Number(trade.sellerTotalDeductedUsdt) > 0
            ? Number(trade.sellerTotalDeductedUsdt)
            : Number((baseUsdt + sellerFee).toFixed(6));

        const netUsdtToCreditBuyer = Number(trade.netUsdt) > 0
            ? Number(trade.netUsdt)
            : Math.max(0, Number((baseUsdt - buyerFee).toFixed(6)));

        // 1. ከሻጩ (Seller) lockedBalance ላይ የተቆለፈውን መቀነስ
        const sellerFilter = trade.sellerId && mongoose.Types.ObjectId.isValid(trade.sellerId)
            ? { _id: trade.sellerId }
            : { email: (trade.sellerEmail || '').toLowerCase() };

        const sellerDoc = await User.findOne(sellerFilter).select('_id balance lockedBalance');
        if (sellerDoc) {
            // If trade was created before seller deduction existed, deduct from seller balance now
            if (!trade.sellerTotalDeductedUsdt && trade.tradeType === 'sell') {
                sellerDoc.balance = Math.max(0, Number(((sellerDoc.balance || 0) - sellerLockedTotal).toFixed(6)));
            }
            sellerDoc.lockedBalance = Math.max(0, Number(((sellerDoc.lockedBalance || 0) - sellerLockedTotal).toFixed(6)));
            await sellerDoc.save();
        }

        // 2. ለገዢው (Buyer) የተጣራውን USDT (netUsdtToCreditBuyer) በቀጥታ መጨመር (Atomic $inc)
        const buyerFilter = trade.buyerId && mongoose.Types.ObjectId.isValid(trade.buyerId)
            ? { _id: trade.buyerId }
            : { email: (trade.buyerEmail || '').toLowerCase() };

        await User.findOneAndUpdate(buyerFilter, {
            $inc: { balance: netUsdtToCreditBuyer }
        });

        // 3. የፕላትፎርሙን 1% (0.5% + 0.5%) ትርፍ በTransaction ውስጥ መመዝገብ
        try {
            await Transaction.create({
                userId: trade.buyerId,
                email: trade.buyerEmail,
                type: 'p2p_trade',
                amount: baseUsdt,
                fee: totalPlatformFee,
                status: 'completed'
            });
        } catch (txErr) {}

        // ✅ በግብይቱ ሰዓት የተቆረጠውን ትክክለኛ የUSDT ኮሚሽን በዳታቤዝ ውስጥ ለዘለቄታው መቆለፍ
        trade.buyerFeeUsdt = buyerFee;
        trade.sellerFeeUsdt = sellerFee;
        trade.totalPlatformFeeUsdt = totalPlatformFee;
        trade.status = 'completed';

        trade.messages.push({
            senderId: 'system',
            senderName: 'System',
            text: `Trade completed — ${netUsdtToCreditBuyer.toFixed(4)} USDT credited to buyer (after ${feePct}% fee). Post-trade chat is open.`,
            isSystem: true
        });

        await trade.save();
        adsCacheData = null;
        return res.json({ success: true, trade });
    } catch (error) {
        console.error("Release Escrow Error:", error);
        return res.status(500).json({ success: false, message: 'Error releasing escrow: ' + error.message });
    }
});

// 7. Cancel Trade (ገዢው ብቻ Cancel ማድረግ ይችላል! ሻጩ በቀጥታ Cancel ማድረግ አይችልም)
app.post('/api/trades/:id/cancel', async (req, res) => {
    try {
        const currentUser = await resolveUserFromRequest(req);
        const trade = await Trade.findById(req.params.id);
        if (!trade) return res.status(404).json({ success: false, message: 'Trade not found.' });

        if (trade.status === 'completed' || trade.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Trade cannot be cancelled.' });
        }

        // 🛑 ሻጩ (Seller) ትዕዛዙን በቀጥታ Cancel እንዳያደርግ መከልከል! 🛑
        if (currentUser && String(currentUser._id) === String(trade.sellerId)) {
            return res.status(403).json({
                success: false,
                message: 'Seller cannot cancel the order directly. Please use "Request for Cancel".'
            });
        }

        await refundEscrowOnCancel(trade);
        trade.status = 'cancelled';
        trade.messages.push({
            senderId: 'system',
            senderName: 'System',
            text: 'This trade was cancelled by the buyer. Full USDT (with 0 fee deducted) has been returned to the market ad.',
            isSystem: true
        });

        await trade.save();
        adsCacheData = null;
        res.json({ success: true, trade });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error cancelling trade.' });
    }
});

// 7B. የሻጭ "Request for Cancel" API (ትዕዛዙን ሳይሰርዝ ለገዢው በቻት ጥያቄ ይልካል)
app.post('/api/trades/:id/request-cancel', async (req, res) => {
    try {
        const trade = await Trade.findById(req.params.id);
        if (!trade) return res.status(404).json({ success: false, message: 'Trade not found.' });

        if (trade.status === 'completed' || trade.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Trade is already finished.' });
        }

        trade.messages.push({
            senderId: 'system',
            senderName: 'System',
            text: `⚠️ Seller (${trade.sellerName}) has requested to cancel this order. Buyer, if you have not transferred the payment yet, please click "Cancel Order".`,
            isSystem: true,
            createdAt: new Date()
        });

        await trade.save();
        res.json({ success: true, trade, message: 'Cancellation request sent to the buyer!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error requesting cancellation.' });
    }
});

// 8. Apply for Dispute
app.post('/api/trades/:id/dispute', async (req, res) => {
    try {
        const { reason } = req.body;
        const trade = await Trade.findById(req.params.id);
        if (!trade) return res.status(404).json({ success: false, message: 'Trade not found.' });

        trade.status = 'disputed';
        trade.disputeReason = reason || 'Seller did not release USDT after payment receipt was uploaded.';
        trade.messages.push({
            senderId: 'system',
            senderName: 'System',
            text: `⚖️ Dispute opened! Chat history and payment receipt have been forwarded to the TBR Admin Dispute Room.`,
            isSystem: true
        });

        await trade.save();
        res.json({ success: true, trade });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error opening dispute.' });
    }
});

// 9. Send Chat Message or Image
app.post('/api/trades/:id/messages', async (req, res) => {
    try {
        const { text, image } = req.body;
        const currentUser = await resolveUserFromRequest(req);
        const trade = await Trade.findById(req.params.id);
        if (!trade) return res.status(404).json({ success: false, message: 'Trade not found.' });

        if (trade.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Chat is closed for cancelled trades.' });
        }

        const senderIdStr = currentUser ? String(currentUser._id) : String(trade.buyerId);
        const isBuyer = String(trade.buyerId) === senderIdStr;
        const senderName = isBuyer ? trade.buyerName : trade.sellerName;

        trade.messages.push({
            senderId: senderIdStr,
            senderName,
            text: text || '',
            image: image || '',
            isSystem: false,
            createdAt: new Date()
        });

        await trade.save();
        res.json({ success: true, trade, messages: trade.messages });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error sending message.' });
    }
});

// 10. Admin Dispute Room Endpoints (Full Chat & Receipt Evidence + Release/Refund)
app.get('/api/admin/escrow-disputes', verifyAdminToken, async (req, res) => {
    try {
        const disputes = await Trade.find({
            status: { $in: ['disputed', 'payment_sent', 'funds_locked'] }
        }).sort({ status: 1, createdAt: -1 }).limit(50).lean();

        res.json({ success: true, data: disputes });
    } catch (error) {
        res.status(500).json({ success: false, data: [] });
    }
});

app.post('/api/admin/escrow-action', verifyAdminToken, async (req, res) => {
    try {
        const { tradeId, action } = req.body;
        const trade = await Trade.findById(tradeId);
        if (!trade) return res.status(404).json({ success: false, message: 'Trade not found.' });

        if (action === 'release') {
            const baseUsdt = Number(trade.usdtAmount || 0);
            const feePct = Number(trade.feePercent || 0.5);
            const feeRate = feePct / 100;

            const buyerFee = Number(trade.buyerFeeUsdt) > 0 ? Number(trade.buyerFeeUsdt) : Number((baseUsdt * feeRate).toFixed(6));
            const sellerFee = Number(trade.sellerFeeUsdt) > 0 ? Number(trade.sellerFeeUsdt) : Number((baseUsdt * feeRate).toFixed(6));
            const totalPlatformFee = Number((buyerFee + sellerFee).toFixed(6));

            const sellerLockedTotal = Number(trade.sellerTotalDeductedUsdt || (baseUsdt + sellerFee));
            const netUsdtToCreditBuyer = Number(trade.netUsdt || Math.max(0, baseUsdt - buyerFee));

            await User.findByIdAndUpdate(trade.sellerId, {
                $inc: { lockedBalance: -sellerLockedTotal }
            });
            await User.findByIdAndUpdate(trade.buyerId, {
                $inc: { balance: netUsdtToCreditBuyer }
            });

            // ✅ አድሚኑም Release ሲያደርግ የተቆረጠውን ትክክለኛ የUSDT ኮሚሽን መመዝገብ
            trade.buyerFeeUsdt = buyerFee;
            trade.sellerFeeUsdt = sellerFee;
            trade.totalPlatformFeeUsdt = totalPlatformFee;
            trade.status = 'completed';

            trade.messages.push({
                senderId: 'admin',
                senderName: 'Admin',
                text: `⚖️ Admin resolved dispute: Released ${netUsdtToCreditBuyer.toFixed(4)} USDT to Buyer.`,
                isSystem: true
            });
            await trade.save();
            adsCacheData = null;
            return res.json({ success: true, message: 'Escrow USDT released to Buyer!' });
        } else {
            await refundEscrowOnCancel(trade);
            trade.status = 'cancelled';
            trade.messages.push({
                senderId: 'admin',
                senderName: 'Admin',
                text: `⚖️ Admin resolved dispute: Order cancelled and USDT refunded to Seller.`,
                isSystem: true
            });
            await trade.save();
            adsCacheData = null;
            return res.json({ success: true, message: 'Escrow USDT refunded to Seller!' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error resolving dispute.' });
    }
});

app.listen(PORT, () => {
    console.log(`TBR Exchange Server is running on port ${PORT} 🚀`);
});