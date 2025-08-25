const Message = require('../models/message');
const User = require('../models/user');
const { Op } = require('sequelize');

exports.sendMessage = async (req, res) => {
  try {
    const { receiver_id, content, file_url } = req.body;
    if (!receiver_id || (!content && !file_url)) return res.status(400).json({ message: 'Message content or file required' });

    // file_url should be the public URL from Supabase (or other storage)
    // If file_url is present, store it in the messages table
    const message = await Message.create({
      sender_id: req.user.id,
      receiver_id,
      content,
      file_url: file_url || null,
      status: 'sent',
    });
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
    console.log('Fetching messages with params:', { userId, limit, offset, where });
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
