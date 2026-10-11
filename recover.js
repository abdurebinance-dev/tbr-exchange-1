require('dotenv').config();
const mongoose = require('mongoose');

// ዳታቤዝህን ከ .env ፋይል ውስጥ ያነበዋል
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tbr_exchange';

// 1. Transaction Schema (መረጃ የምንወስድበት)
const transactionSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    email: String,
    type: String,
    amount: Number,
    fee: Number,
    status: String,
    createdAt: Date
}, { strict: false });

const Transaction = mongoose.model('Transaction', transactionSchema);

// 2. Trade Schema (መረጃ የምንመልስበት)
const tradeSchema = new mongoose.Schema({
    tradeNumber: String,
    tradeType: String,
    buyerId: mongoose.Schema.Types.ObjectId,
    buyerEmail: String,
    buyerName: String,
    sellerId: mongoose.Schema.Types.ObjectId,
    sellerEmail: String,
    sellerName: String,
    usdtAmount: Number,
    etbAmount: Number,
    unitPrice: Number,
    status: String,
    createdAt: Date,
    resolvedAt: Date
}, { strict: false });

const Trade = mongoose.model('Trade', tradeSchema);

async function recoverTradeHistory() {
    try {
        console.log('⏳ ከ ዳታቤዝ (MongoDB) ጋር እየተገናኘ ነው...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ ከ MongoDB ጋር በሚገባ ተገናኝቷል!');

        console.log('⏳ የድሮ ትራንዛክሽኖችን ከ transactions ኮሌክሽን በመፈለግ ላይ...');
        
        // የተሳኩ የ P2P ትሬድ ታሪኮችን ብቻ ይፈልጋል
        const p2pTransactions = await Transaction.find({ type: 'p2p_trade', status: 'completed' });
        
        if (p2pTransactions.length === 0) {
            console.log('❌ ምንም የሚመለስ የ p2p_trade ትራንዛክሽን አልተገኘም።');
            process.exit();
        }

        console.log(`✅ ${p2pTransactions.length} የተሳኩ የትሬድ ታሪኮች ተገኝተዋል! ወደ Trades ኮሌክሽን በመመለስ ላይ...`);

        let recoveredCount = 0;

        for (let tx of p2pTransactions) {
            // ተመሳሳይ ትሬድ ድጋሚ እንዳይገባ (Duplication) ቼክ እናደርጋለን
            const exists = await Trade.findOne({ buyerId: tx.userId, createdAt: tx.createdAt });
            
            if (!exists) {
                const recoveredTrade = new Trade({
                    tradeNumber: 'REC-' + Math.floor(10000 + Math.random() * 90000), // Recovered Trade Number
                    tradeType: 'buy',
                    buyerId: tx.userId,
                    buyerEmail: tx.email,
                    buyerName: tx.email ? tx.email.split('@')[0] : 'User',
                    
                    // ሻጩን ከ transaction ላይ ማወቅ ስለማንችል እንደ ሲስተም ሪከርድ እናስቀምጠዋለን
                    sellerId: tx.userId, 
                    sellerEmail: 'recovered@tbrexchange.com',
                    sellerName: 'System (Recovered)',
                    
                    usdtAmount: tx.amount,
                    etbAmount: 0, // የድሮው የ ETB መጠን አይታወቅም
                    unitPrice: 0,
                    
                    status: 'completed', // ትሬዱ ስኬታማ ነበር
                    createdAt: tx.createdAt,
                    resolvedAt: tx.createdAt
                });

                await recoveredTrade.save();
                recoveredCount++;
            }
        }

        console.log(`🎉 እንኳን ደስ ያለህ አብዱረህማን! ${recoveredCount} የትሬድ ታሪኮች በተሳካ ሁኔታ ወደ Trades ኮሌክሽን ተመልሰዋል!`);
        console.log('✅ አሁን የተጠቃሚዎችህ Trade Volume እና Total Trades ወደ ነበረበት አድጎ እና ተስተካክሎ ታገኘዋለህ።');
        
        process.exit();
    } catch (error) {
        console.error('❌ ስህተት ተፈጥሯል:', error);
        process.exit(1);
    }
}

recoverTradeHistory();