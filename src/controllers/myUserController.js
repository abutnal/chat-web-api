const { MyUser, User, Message } = require('../models');
const sequelize = require('sequelize');

exports.getMyUsers = async (req, res) => {
  try {
    const myUsers = await MyUser.findAll({
      where: { ownerId: req.user.id },
      include: [{ model: User, as: 'User', attributes: ['id', 'name', 'profile_image', 'status'] }]
    });

    // Get unread counts for each user
    const unreadCounts = await Message.findAll({
      where: {
        receiver_id: req.user.id,
        status: 'sent' // Only messages not yet read
      },
      attributes: ['sender_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['sender_id']
    });

    // Map sender_id to count
    const unreadMap = {};
    unreadCounts.forEach(row => {
      unreadMap[row.sender_id] = row.dataValues.count;
    });

    // Get latest message for each user in myUsers
    const latestMessagesMap = {};
    for (const mu of myUsers) {
      const latestMsg = await Message.findOne({
        where: {
          [sequelize.Op.and]: [
            {
              [sequelize.Op.or]: [
                { sender_id: req.user.id, receiver_id: mu.userId },
                { sender_id: mu.userId, receiver_id: req.user.id }
              ]
            },
            {
              [sequelize.Op.or]: [
                { deleted_for: null },
                { deleted_for: { [sequelize.Op.notLike]: `%${req.user.id}%` } }
              ]
            }
          ]
        },
        order: [['createdAt', 'DESC']],
        attributes: ['content', 'createdAt']
      });
      latestMessagesMap[mu.userId] = latestMsg
        ? { content: latestMsg.content, createdAt: latestMsg.createdAt }
        : { content: '', createdAt: null };
    }

    // Attach unread count and latest message info to each user
    let result = myUsers.map(mu => ({
      ...mu.User.toJSON(),
      unread: unreadMap[mu.User.id] || 0,
      latestMessage: latestMessagesMap[mu.userId]?.content || '',
      latestMessageTime: latestMessagesMap[mu.userId]?.createdAt || null
    }));

    // Sort by latestMessageTime DESC (most recent first)
    result = result.sort((a, b) => {
      if (!a.latestMessageTime && !b.latestMessageTime) return 0;
      if (!a.latestMessageTime) return 1;
      if (!b.latestMessageTime) return -1;
      return new Date(b.latestMessageTime) - new Date(a.latestMessageTime);
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch user list', error: err.message });
  }
};

exports.addMyUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId required' });
    await MyUser.findOrCreate({ where: { ownerId: req.user.id, userId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add user', error: err.message });
  }
};

exports.removeMyUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId required' });
    await MyUser.destroy({ where: { ownerId: req.user.id, userId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove user', error: err.message });
  }
};