const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    fullName: { type: String, required: true },
    idNumber: { type: String },
    dob: { type: String },
    address: { type: String },
    docType: { type: String, default: 'national_id' },
    frontImage: { type: String, required: true }, // Base64 String
    backImage: { type: String },                 // Base64 String
    selfieImage: { type: String, required: true }, // Base64 String
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    rejectionReason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('KYC', kycSchema);