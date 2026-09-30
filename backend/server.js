const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();

// 1. CORS Configuration (Allows custom x-admin-pin header)
app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'x-admin-pin']
}));

app.use(express.json({ limit: '15mb' }));

// 2. MongoDB Atlas Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log(' Connected to MongoDB Atlas'))
  .catch(err => console.error(' MongoDB Connection Error:', err));

// 3. Schemas & Models
const JobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, default: 'General' },
  url: { type: String, required: true },
  tag: { type: String, default: 'Remote' },
  urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  starred: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'applied'], default: 'active' },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const ResumeSchema = new mongoose.Schema({
  fileName: String,
  fileSize: String,
  uploadedAt: { type: Date, default: Date.now },
  pdfBase64: String
});

// Settings Schema to store PIN across all devices in MongoDB
const SettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true }
});

const Job = mongoose.model('Job', JobSchema);
const Resume = mongoose.model('Resume', ResumeSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// Helper function to resolve the current active PIN
async function getActivePin() {
  try {
    const pinDoc = await Settings.findOne({ key: 'admin_pin' });
    if (pinDoc && pinDoc.value) return String(pinDoc.value).trim();
  } catch (err) {
    console.error('Error fetching PIN from DB:', err);
  }
  return String(process.env.ADMIN_PIN || '1234').trim();
}

// Multer memory storage for PDF file upload
const upload = multer({
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});

// 4. Middleware for Admin PIN Verification (Queries MongoDB)
const verifyPin = async (req, res, next) => {
  try {
    const incomingPin = String(req.headers['x-admin-pin'] || '').trim();
    const currentPin = await getActivePin();

    if (incomingPin && incomingPin === currentPin) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN' });
  } catch (err) {
    return res.status(500).json({ error: 'PIN verification failed' });
  }
};

// --- PIN Authentication Routes ---

// Verify PIN (Used when entering PIN on phone or laptop)
app.post('/api/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    const currentPin = await getActivePin();

    if (String(pin).trim() === currentPin) {
      return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Incorrect PIN' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update PIN (Updates in MongoDB so laptop and phone stay in sync)
app.post('/api/update-pin', verifyPin, async (req, res) => {
  try {
    const { newPin } = req.body;
    if (!newPin || String(newPin).trim().length < 4) {
      return res.status(400).json({ error: 'PIN must be at least 4 digits' });
    }

    await Settings.findOneAndUpdate(
      { key: 'admin_pin' },
      { value: String(newPin).trim() },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'PIN updated successfully across all devices' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Job Routes ---

// Public read (Safe for shared/borrowed laptops)
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protected: Add job link
app.post('/api/jobs', verifyPin, async (req, res) => {
  try {
    const newJob = new Job(req.body);
    await newJob.save();
    res.status(201).json(newJob);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Protected: Update job status or star
app.patch('/api/jobs/:id', verifyPin, async (req, res) => {
  try {
    const updated = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Protected: Delete job
app.delete('/api/jobs/:id', verifyPin, async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Resume Routes ---

// Public read & 1-click download (Safe for shared laptops)
app.get('/api/resume', async (req, res) => {
  try {
    const resume = await Resume.findOne().sort({ uploadedAt: -1 });
    res.json(resume || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protected: Upload PDF
app.post('/api/resume', verifyPin, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file provided' });

    const base64Data = `data:application/pdf;base64,${req.file.buffer.toString('base64')}`;
    const sizeKB = (req.file.size / 1024).toFixed(1) + ' KB';

    // Replace previous resume with the newest uploaded version
    await Resume.deleteMany({});
    const newResume = new Resume({
      fileName: req.file.originalname,
      fileSize: sizeKB,
      pdfBase64: base64Data
    });
    await newResume.save();

    res.status(201).json({
      fileName: newResume.fileName,
      fileSize: newResume.fileSize,
      uploadedAt: newResume.uploadedAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));