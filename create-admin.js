require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

console.log('Script started...');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tbr_exchange';
const ADMIN_EMAIL = 'admin@tbrexchange.com';
const ADMIN_PASSWORD = 'adminpassword123';

async function setupAdmin() {
    try {
        console.log('Attempting to connect to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Database connected successfully!');

        const userSchema = new mongoose.Schema({
            email: { type: String, required: true, unique: true, lowercase: true, trim: true },
            password: { type: String, required: true },
            isAdmin: { type: Boolean, default: false },
            isVerified: { type: Boolean, default: true }
        });

        const User = mongoose.models.User || mongoose.model('User', userSchema);

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

        const existingUser = await User.findOne({ email: ADMIN_EMAIL });

        if (existingUser) {
            existingUser.password = hashedPassword;
            existingUser.isAdmin = true;
            existingUser.isVerified = true;
            await existingUser.save();
            console.log('SUCCESS: Existing user updated to Admin successfully!');
        } else {
            const newAdmin = new User({
                email: ADMIN_EMAIL,
                password: hashedPassword,
                isAdmin: true,
                isVerified: true
            });
            await newAdmin.save();
            console.log('SUCCESS: New Admin account created successfully!');
        }

        console.log(`Email: ${ADMIN_EMAIL}`);
        console.log(`Password: ${ADMIN_PASSWORD}`);

        await mongoose.connection.close();
        console.log('Database connection closed.');
    } catch (err) {
        console.error('ERROR setting up admin:', err);
    }
}

setupAdmin();