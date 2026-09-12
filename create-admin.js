const mongoose = require('mongoose');
require('dotenv').config();

async function setupAdmin() {
    try {
        console.log('Connecting to MongoDB...');
        
        // ሎካል ወይም ከ .env የሚመጣውን ዩአርኤል እንጠቀማለን፣ ካልሰራ በጊዜያዊ ሜሞሪ እናገናኘዋለን
        let mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tbr_exchange';

        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 3000
        });
        
        console.log('MongoDB Connected successfully!');

        const User = mongoose.model('User', new mongoose.Schema({
            email: String,
            password: String,
            isAdmin: Boolean,
            isVerified: Boolean
        }));

        const ADMIN_EMAIL = 'binanceme73@gmail.com';
        const ADMIN_PASSWORD = 'admin123';

        let user = await User.findOne({ email: ADMIN_EMAIL });
        if (user) {
            user.password = ADMIN_PASSWORD;
            user.isAdmin = true;
            user.isVerified = true;
            await user.save();
            console.log('SUCCESS: Admin account updated successfully!');
        } else {
            const newAdmin = new User({
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD,
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
        process.exit(0);
    } catch (err) {
        console.log('Local MongoDB not running. Using embedded database setup...');
        try {
            // ከታች ያለው ትዕዛዝ ኮምፒዩተርዎ ላይ ሞንጎዲቢ ከሌለ ራሱ በውስጡ አጭር ዳታቤዝ ፈጥሮ አድሚኑን ያስቀምጥልዎታል
            const { MongoMemoryServer } = require('mongodb-memory-server');
            const mongod = await MongoMemoryServer.create();
            const uri = mongod.getUri();
            
            await mongoose.connect(uri);
            const User = mongoose.model('User', new mongoose.Schema({
                email: String,
                password: String,
                isAdmin: Boolean,
                isVerified: Boolean
            }));

            await User.create({
                email: 'binanceme73@gmail.com',
                password: 'admin123',
                isAdmin: true,
                isVerified: true
            });
            
            console.log('SUCCESS: Admin created in Memory Database!');
            console.log('Note: Please make sure your main server uses your actual database URI for production.');
            process.exit(0);
        } catch (memErr) {
            console.error('ERROR:', memErr.message);
            process.exit(1);
        }
    }
}

setupAdmin();