const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fullName: { type: String, required: true },
    idNumber: { type: String },
    dateOfBirth: { type: String },
    residentialAddress: { type: String },
    docType: { type: String },
    frontImage: { type: String, required: true },
    backImage: { type: String },
    selfieImage: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('Kyc', kycSchema);