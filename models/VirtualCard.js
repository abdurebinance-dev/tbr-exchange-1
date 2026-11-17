const mongoose = require('mongoose');

const virtualCardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userEmail: { type: String, default: '' },
  card_id: { type: String, default: null, index: true },
  order_id: { type: String, default: null },
  reference: { type: String, default: null },
  bin: { type: String, default: '537872' },
  name_on_card: { type: String, required: true },
  dateOfBirth: { type: String, default: '1998-01-01' },
  last4: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending_approval', 'pending', 'active', 'frozen', 'rejected', 'refunded', 'deleted'],
    default: 'pending_approval'
  },
  requested_amount_usd: { type: Number, required: true, default: 10 },
  issuance_fee_usdt: { type: Number, default: 1.50 },
  total_charged_tbr_usdt: { type: Number, required: true, default: 11.50 },
  adminNote: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('VirtualCard', virtualCardSchema);