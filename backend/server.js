const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// MongoDB Atlas Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log(' Connected to MongoDB Atlas'))
  .catch(err => console.error(' MongoDB Connection Error:', err));

// Schemas
const JobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, default: 'General' },
  url: { type: String, required: true },
  platform: { type: String, default: 'Other' },
  tags: [String],
  status: { type: String, enum: ['to_apply', 'applied'], default: 'to_apply' },
  notes: String,
  createdAt: { type: Date, default: Date.now }
});

const ResumeSchema = new mongoose.Schema({
  fileName: String,
  fileSize: String,
  uploadedAt: { type: Date, default: Date.now },
  pdfBase64: String // Stored as Base64 data URI
});

const Job = mongoose.model('Job', JobSchema);
const Resume = mongoose.model('Resume', ResumeSchema);

// Multer memory storage for PDF file upload
const upload = multer({
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed!'), false);
  }
});

// Middleware for Admin PIN Verification (for mutative actions)
const verifyPin = (req, res, next) => {
  const pin = req.headers['x-admin-pin'];
  if (pin === (process.env.ADMIN_PIN || '1234')) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN' });
  }
};

// --- Job Routes ---
// Public read (No login needed for shared laptops)
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protected: Add job
app.post('/api/jobs', verifyPin, async (req, res) => {
  try {
    const newJob = new Job(req.body);
    await newJob.save();
    res.status(201).json(newJob);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Protected: Update job status
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
// Public read & download
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
    if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });

    const base64Data = `data:application/pdf;base64,${req.file.buffer.toString('base64')}`;
    const sizeKB = (req.file.size / 1024).toFixed(1) + ' KB';

    // Replace previous resume with latest
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