const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const auth = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// File upload endpoint
router.post('/', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  // Return just the filename, matching frontend and socketController expectations
  res.status(201).json({ url: req.file.filename });
});

module.exports = router;
