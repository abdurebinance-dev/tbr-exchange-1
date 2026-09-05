const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    fullName: { type: String, required: true },
    email: { type: String, default: '' },
    idNumber: { type: String },
    dob: { type: String },
    dateOfBirth: { type: String }, // አዲሱን ትክክለኛ የትውልድ ቀን ፊልድ አካትተናል
    address: { type: String },
    docType: { type: String, default: 'national_id' },
    documentType: { type: String }, // አዲሱን የመታወቂያ ዓይነት ፊልድ አካትተናል
    documentNumber: { type: String }, // አዲሱን የመታወቂያ ቁጥር ፊልድ አካትተናል
    frontImage: { type: String, required: true }, // Base64 String
    backImage: { type: String },                  // Base64 String
    selfieImage: { type: String, required: true }, // Base64 String
    idFrontImage: { type: String },               // ከተጠቃሚው ፊት ለፊት የሚመጣ ሌላው ፎርማት አማራጭ
    idBackImage: { type: String },                // ከተጠቃሚው ጀርባ የሚመጣ ሌላው ፎርማት አማራጭ
    status: { type: String, default: 'pending' }, // አውቶማቲክ እንዳይሆን ፔንዲንግ ሆኖ ለአድሚን ብቻ ይሄዳል
    rejectionReason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('KYC', kycSchema);