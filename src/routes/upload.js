const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const upload = multer(); // Use memory storage for direct buffer access
const { createClient } = require('@supabase/supabase-js');

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'uploads';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// File upload endpoint (to Supabase Storage)
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.error('No file uploaded. req.file:', req.file);
      return res.status(400).json({ message: 'No file uploaded', debug: { body: req.body, headers: req.headers } });
    }
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `${Date.now()}-${Math.floor(Math.random() * 1e9)}.${fileExt}`;
    const uploadResult = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });
    if (uploadResult.error) {
      console.error('Supabase upload error:', uploadResult.error);
      return res.status(500).json({ message: 'Upload failed', error: uploadResult.error.message, debug: uploadResult.error });
    }
    // Get public URL
    const { publicUrl } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(fileName).data;
    // Only return file URL and name, do not create a message
    res.status(201).json({ url: publicUrl, name: fileName });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Upload failed', error: err.message, debug: err });
  }
});

module.exports = router;
