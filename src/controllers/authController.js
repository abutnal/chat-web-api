const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const config = require('../config');

exports.signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email already exists' });
    let profile_image = null;
    if (req.file) {
      // Upload image to Supabase
      const supabase = require('../utils/supabase');
      const bucket = process.env.SUPABASE_BUCKET;
      const fs = require('fs');
      const fileBuffer = fs.readFileSync(req.file.path);
      const fileName = req.file.filename;
      const { data, error } = await supabase.storage.from(bucket).upload(fileName, fileBuffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
      if (error) return res.status(500).json({ message: 'Supabase upload failed', error: error.message });
      // Get public URL
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      profile_image = publicUrlData.publicUrl;
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hash, profile_image });
    // Emit user_list_updated event to all clients
    try {
      const io = req.app.get('io');
      if (io) {
        const users = await User.findAll({ attributes: ['id', 'name', 'email', 'profile_image'] });
        io.emit('user_list_updated', users);
      }
    } catch (e) {
      // Ignore socket errors
    }
    res.status(201).json({ id: user.id, name: user.name, email: user.email, profile_image: user.profile_image });
  } catch (err) {
    res.status(500).json({ message: 'Signup failed', error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });
    // Set user status to online
    user.status = 'online';
    await user.save();
    const token = jwt.sign({ id: user.id, email: user.email }, config.jwtSecret, { expiresIn: '1d' });
    // Emit user_list_updated event to all clients for real-time update
    try {
      const io = req.app.get('io');
      if (io) {
        const users = await User.findAll({ attributes: ['id', 'name', 'email', 'profile_image', 'status'] });
        io.emit('user_list_updated', users);
      }
    } catch (e) {
      // Ignore socket errors
    }
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, profile_image: user.profile_image, status: user.status } });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
}
// Logout: set user status to offline
exports.logout = async (req, res) => {
  try {
    if (req.user && req.user.id) {
      const user = await User.findByPk(req.user.id);
      if (user) {
        user.status = 'offline';
        await user.save();
        // Emit user_list_updated event to all clients for real-time update
        try {
          const io = req.app.get('io');
          if (io) {
            const users = await User.findAll({ attributes: ['id', 'name', 'email', 'profile_image', 'status'] });
            io.emit('user_list_updated', users);
          }
        } catch (e) {
          // Ignore socket errors
        }
      }
    }
    // Always return success, even if user not found or token invalid/expired
    res.json({ message: 'Logged out' });
  } catch (err) {
    // Always return success for logout, even on error
    res.json({ message: 'Logged out' });
  }
};
