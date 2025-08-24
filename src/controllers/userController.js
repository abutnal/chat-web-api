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
      user.profile_image = publicUrlData.publicUrl;
    }
    await user.save();
    res.json({ id: user.id, name: user.name, email: user.email, profile_image: user.profile_image });
  } catch (err) {
    res.status(500).json({ message: 'Profile update failed', error: err.message });
  }
};
const User = require('../models/user');
const { Op } = require('sequelize');

// Get all users except the current user
const Message = require('../models/message');

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
