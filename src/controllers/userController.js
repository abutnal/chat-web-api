const User = require('../models/user');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
// Get all users except the current user

const Message = require('../models/message');

// Update logged-in user's profile
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (req.body.name) user.name = req.body.name;
    if (req.file) {
      // Upload image to Supabase
      const supabase = require('../utils/supabase');
      const bucket = process.env.SUPABASE_BUCKET;
      const fileBuffer = req.file.buffer; // Use buffer from memory
      // Generate a unique filename
      const fileExt = req.file.originalname.split('.').pop();
      const fileName = `${req.user.id}_${Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage.from(bucket).upload(fileName, fileBuffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
      if (error) return res.status(500).json({ message: 'Supabase upload failed', error: error.message });
      // Get public URL
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      user.profile_image = publicUrlData.publicUrl;
    }
    await user.save();
    res.json({ id: user.id, name: user.name, email: user.email, profile_image: user.profile_image });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Profile update failed', error: err.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    // Get all users except the current user
    const users = await User.findAll({
      where: { id: { [Op.ne]: req.user.id } },
      attributes: ['id', 'name', 'email', 'profile_image', 'status'],
    });

    // For each user, get the latest message timestamp exchanged with the logged-in user
    const usersWithLatestMessage = await Promise.all(users.map(async (user) => {
      const latestMessage = await Message.findOne({
        where: {
          [Op.or]: [
            { sender_id: req.user.id, receiver_id: user.id },
            { sender_id: user.id, receiver_id: req.user.id }
          ]
        },
        order: [['createdAt', 'DESC']],
      });
      return {
        ...user.toJSON(),
        latestMessageTimestamp: latestMessage ? latestMessage.createdAt : null
      };
    }));

    // Sort users by latestMessageTimestamp (descending), users with no messages go last
    usersWithLatestMessage.sort((a, b) => {
      if (!a.latestMessageTimestamp && !b.latestMessageTimestamp) return 0;
      if (!a.latestMessageTimestamp) return 1;
      if (!b.latestMessageTimestamp) return -1;
      return new Date(b.latestMessageTimestamp) - new Date(a.latestMessageTimestamp);
    });

    res.json(usersWithLatestMessage);
  } catch (err) {
    res.status(500).json({ message: 'Get users failed', error: err.message });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { search = '', limit = 20, offset = 0 } = req.query;
    const where = {};

    // If searching for "online" or "offline", filter by status
    if (search.toLowerCase() === 'online' || search.toLowerCase() === 'offline') {
      where.status = search.toLowerCase();
    } else if (search) {
      where.name = { [Op.like]: `%${search}%` };
    }

    const users = await User.findAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: ['id', 'name', 'profile_image', 'status']
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'User search failed', error: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });
    user.password = await bcrypt.hash(newPassword, 10); // Hash the new password
    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.log(err); // Add this for debugging
    res.status(500).json({ message: 'Failed to change password' });
  }
};