const mongoose = require('mongoose');

const virtualCardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  card_id: { type: String, default: null, index: true },
  order_id: { type: String, default: null },
  reference: { type: String, default: null },
  bin: { type: String, required: true },
  name_on_card: { type: String, required: true },
  last4: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'active', 'frozen', 'refunded', 'deleted'],
    default: 'pending'
  },
  initial_loaded_usd: { type: Number, default: 10 },
  total_charged_tbr_usdt: { type: Number, default: 16 }
}, { timestamps: true });

module.exports = mongoose.model('VirtualCard', virtualCardSchema);