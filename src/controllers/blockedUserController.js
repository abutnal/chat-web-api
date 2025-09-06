const BlockedUser = require('../models/blockedUser');
const User = require('../models/user');

exports.blockUser = async (req, res) => {
  try {
    const { blocked_id } = req.body;
    await BlockedUser.findOrCreate({
      where: { blocker_id: req.user.id, blocked_id }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Block failed', error: err.message });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const { blocked_id } = req.body;
    await BlockedUser.destroy({
      where: { blocker_id: req.user.id, blocked_id }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Unblock failed', error: err.message });
  }
};

exports.getBlockedUsers = async (req, res) => {
  try {
    const blocks = await BlockedUser.findAll({
      where: { blocker_id: req.user.id },
      include: [{ model: User, as: 'blockedUser', attributes: ['id', 'name', 'profile_image', 'status'] }]
    });
    res.json(blocks.map(b => b.blockedUser));
  } catch (err) {
    res.status(500).json({ message: 'Fetch blocked users failed', error: err.message });
  }
};