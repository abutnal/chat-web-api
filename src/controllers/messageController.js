const { MyUser, Message } = require('../models');
const { Op } = require('sequelize');

exports.sendMessage = async (req, res) => {
  try {
    const { receiver_id, content } = req.body;
    const senderId = req.user.id;
    if (!receiver_id || !content) return res.status(400).json({ message: 'Message content required' });

    // Save message
    const message = await Message.create({
      sender_id: senderId,
      receiver_id,
      content,
      status: 'sent' // <-- use status, not read
    });

    // Auto-add sender to receiver's list if not present
    
    if (senderId !== receiver_id) {
      const exists = await MyUser.findOne({ where: { ownerId: receiver_id, userId: senderId } });
      if (!exists) {
        try {
          await MyUser.create({ ownerId: receiver_id, userId: senderId });
        } catch (e) {
          console.error('Auto-add MyUser error:', e);
        }
      }
    }

    // Emit the new message to receiver for real-time update
    try {
      const io = req.app.get('io');
      // Send to receiver
      io.to(String(receiver_id)).emit('receive_message', message);
      // Optionally, send to sender for instant feedback
      io.to(String(req.user.id)).emit('receive_message', message);
    } catch (e) {
      console.error('Socket emit error:', e);
    }
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: 'Send message failed', error: err.message });
  }
};


exports.getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 100;
    const offset = parseInt(req.query.offset, 10) || 0;
    const where = {
      [Op.or]: [
        { sender_id: req.user.id, receiver_id: userId },
        { sender_id: userId, receiver_id: req.user.id }
      ]
    };
    // First, get total count
    const count = await Message.count({ where });
    // Calculate correct offset from the end for latest messages
    let realOffset = count - limit - offset;
    if (realOffset < 0) realOffset = 0;
    const rows = await Message.findAll({
      where,
      order: [['createdAt', 'ASC']],
      limit,
      offset: realOffset
    });
    // Return messages in chronological order (oldest at top)
    res.json({ total: count, messages: rows.reverse() });
  } catch (err) {
    res.status(500).json({ message: 'Get messages failed', error: err.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findByPk(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    message.status = 'read';
    await message.save();
    res.json(message);
  } catch (err) {
    res.status(500).json({ message: 'Mark as read failed', error: err.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.params;
    const updated = await Message.update(
      { status: 'read' },
      {
        where: {
          sender_id: userId,
          receiver_id: req.user.id,
          status: 'sent'
        }
      }
    );
    // Find all affected messages
    const messages = await Message.findAll({
      where: {
        sender_id: userId,
        receiver_id: req.user.id,
        status: 'read'
      }
    });
    // Emit socket event for each message
    const io = req.app.get('io');
    messages.forEach(msg => {
      io.to(String(msg.sender_id)).emit('message_read', { messageId: msg.id });
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Mark all as read failed', error: err.message });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { forEveryone } = req.body;
    const message = await Message.findByPk(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    // Only sender can delete for everyone
    if (forEveryone) {
      if (message.sender_id !== req.user.id) {
        return res.status(403).json({ message: 'Only sender can delete for everyone' });
      }
      await message.destroy();
      // Emit socket event for delete for everyone
      req.app.get('io').to(String(message.sender_id)).emit('message_deleted', { messageId });
      req.app.get('io').to(String(message.receiver_id)).emit('message_deleted', { messageId });
      return res.json({ message: 'Message deleted for everyone' });
    } else {
      // Mark as deleted for this user
      let deletedFor = message.deleted_for ? message.deleted_for.split(',') : [];
      if (!deletedFor.includes(String(req.user.id))) {
        deletedFor.push(String(req.user.id));
        message.deleted_for = deletedFor.join(',');
        await message.save();
        // Emit socket event for delete for me
        req.app.get('io').to(String(req.user.id)).emit('message_deleted', { messageId });
      }
      return res.json({ message: 'Deleted for me' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Delete message failed', error: err.message });
  }
};

// PATCH /api/messages/:messageId - Edit message content (only sender)
exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Content required' });
    }
    const message = await Message.findByPk(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.sender_id !== req.user.id) {
      return res.status(403).json({ message: 'Only sender can edit message' });
    }
    message.content = content;
    await message.save();
    // Emit socket event for edit
    req.app.get('io').to(String(message.sender_id)).emit('message_edited', { message });
    req.app.get('io').to(String(message.receiver_id)).emit('message_edited', { message });
    res.json(message);
  } catch (err) {
    res.status(500).json({ message: 'Edit message failed', error: err.message });
  }
};
