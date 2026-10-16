const mongoose = require('mongoose');
require('dotenv').config();

// ከዳታቤዝ ጋር መገናኘት
mongoose.connect(process.env.MONGO_URI || 'YOUR_MONGO_URI_HERE').then(async () => {
    console.log("Connected to DB for fixing escrow...");
    
    const Trade = mongoose.model('Trade', new mongoose.Schema({ status: String, usdtAmount: Number }));
    
    // ያቺን የተጣበቀችውን 5.1 ትሬድ ስተተስ በግልጽ ወደ resolved መቀየር
    const result = await Trade.updateMany(
        { usdtAmount: 5.1, status: { $in: ['funds_locked', 'Funds_Locked', 'payment_sent'] } },
        { $set: { status: 'resolved' } }
    );
    
    console.log("Fixed trades count:", result.modifiedCount);
    mongoose.disconnect();
}).catch(err => console.log(err));