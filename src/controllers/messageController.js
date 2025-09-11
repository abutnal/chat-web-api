// PATCH /api/messages/view-flag/:userId
// Only receiver can call this. Updates msg_view_flag for all view_once messages in this chat:
// - If msg_view_flag = 0, set to 1
// - If msg_view_flag = 1, set to 2
exports.updateMsgViewFlag = async (req, res) => {
  try {
    const { userId } = req.params; // sender id
    const receiverId = req.user.id;
    //  console.log('updateMsgViewFlag called by receiver', receiverId, 'for sender', userId);
    // Restrict: Only receiver can call this, sender cannot update their own messages
    if (parseInt(userId) === parseInt(receiverId)) {
      return res.status(403).json({ message: 'Sender cannot update msg_view_flag for their own messages' });
    } else {

      console.log('updateMsgViewFlag called by sender', receiverId);
      console.log('updateMsgViewFlag called by reciever', userId);
    // Update all view_once messages from sender to receiver
    // Only update 0->1 if any exist, otherwise update 1->2. Never both in one call.
    let updated0to1 = 0;
    let updated1to2 = 0;
    let updated0to2 = 0;

    const alreadyRead = await Message.count({
      where: {
        sender_id: userId,
        receiver_id: receiverId,
        delete_policy: 'view_once',
        msg_view_flag: '0',
        status: 'read'
      }
    });

    if(alreadyRead > 0)
      {
      console.log('zeroCount IN first'); 
      [updated0to2] = await Message.update(
        { msg_view_flag: '2' },
        {
          where: {
            sender_id: userId,
            receiver_id: receiverId,
            delete_policy: 'view_once',
            msg_view_flag: '0'
          }
        }
      );
    }

    
    const oneToTwo = await Message.count({
      where: {
        sender_id: userId,
        receiver_id: receiverId,
        delete_policy: 'view_once',
        msg_view_flag: '1'
      }
    });
    if(oneToTwo > 0)
      {
      console.log('zeroCount IN first'); 
      [updated1to2] = await Message.update(
        { msg_view_flag: '2' },
        {
          where: {
            sender_id: userId,
            receiver_id: receiverId,
            delete_policy: 'view_once',
            msg_view_flag: '1'
          }
        }
      );
    }
   
    const zeroToOne = await Message.count({
      where: {
        sender_id: userId,
        receiver_id: receiverId,
        delete_policy: 'view_once',
        msg_view_flag: '0'
      }
    });
    
    if (zeroToOne > 0) {
      console.log('zeroCount IN second'); 
      [updated0to1] = await Message.update(
        { msg_view_flag: '1' },
        {
          where: {
            sender_id: userId,
            receiver_id: receiverId,
            delete_policy: 'view_once',
            msg_view_flag: '0'
          }
        }
      );
    } 

   
    
    
    res.json({ updated_0_to_1: updated0to1, updated_1_to_2: updated1to2 });
  
  }
  
  } catch (err) {
    res.status(500).json({ message: 'Update msg_view_flag failed', error: err.message });
  }
};
const { MyUser, Message } = require('../models');
const { Op } = require('sequelize');

exports.sendMessage = async (req, res) => {
  try {
    const { receiver_id, content, delete_policy, replyToMessageId } = req.body;
    const senderId = req.user.id;
    if (!receiver_id || !content) return res.status(400).json({ message: 'Message content required' });

    // Set sent_at to now, default delete_policy to 'never'
    const message = await Message.create({
      sender_id: senderId,
      receiver_id,
      content,
      status: 'sent',
      delete_policy: delete_policy || 'never',
      sent_at: new Date(),
      replyToMessageId: replyToMessageId || null
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
      io.to(String(receiver_id)).emit('receive_message', message);
      io.to(String(req.user.id)).emit('receive_message', message);
    } catch (e) {
      console.error('Socket emit error:', e);
    }
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: 'Send message failed', error: err.message });
  }
};

// Helper: Delete expired 24h/view_once messages for a user pair
async function cleanupEphemeralMessages(userA, userB) {
  // Delete 24h messages older than 24h
  await Message.destroy({
    where: {
      [Op.or]: [
        { sender_id: userA, receiver_id: userB },
        { sender_id: userB, receiver_id: userA }
      ],
      delete_policy: '24h',
      sent_at: { [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  });
  // Do NOT delete view_once messages anymore
}

exports.getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 100;
    const offset = parseInt(req.query.offset, 10) || 0;
    // Clean up expired ephemeral messages before fetching
    await cleanupEphemeralMessages(req.user.id, userId);

    // Custom filter for view_once messages:
    // - Sender sees if msg_view_flag = 0 or 1
    // - Receiver sees if msg_view_flag = 1
    // - Neither sees if msg_view_flag = 2
    const userA = req.user.id;
    const userB = parseInt(userId, 10);
    const allMessages = await Message.findAll({
      where: {
        [Op.or]: [
          { sender_id: userA, receiver_id: userB },
          { sender_id: userB, receiver_id: userA }
        ]
      },
      order: [['createdAt', 'ASC']],
      include: [
        {
          model: Message,
          as: 'replyTo',
          attributes: ['id', 'content', 'sender_id']
        }
      ]
    });

    // Filter according to msg_view_flag and user role
    const filtered = allMessages.filter(msg => {
      // Exclude if deleted_for includes current user
      if (msg.deleted_for) {
        const deletedForArr = msg.deleted_for.split(',').map(s => s.trim());
        if (deletedForArr.includes(String(userA))) return false;
      }
      if (msg.delete_policy !== 'view_once') return true;
      if (msg.msg_view_flag === '2') return false;
      if (msg.delete_policy == 'view_once' && msg.status == 'read' && msg.msg_view_flag == '0') return false;
      // Sender: show if flag 0 or 1
      if (msg.sender_id === userA && msg.receiver_id === userB) {
        return msg.msg_view_flag === '0' || msg.msg_view_flag === '1';
      }
      // Receiver: show if flag 1
      if (msg.sender_id === userB && msg.receiver_id === userA) {
        return msg.msg_view_flag === '1';
      }
      return false;
    });
    const count = filtered.length;
    let realOffset = count - limit - offset;
    if (realOffset < 0) realOffset = 0;
    const rows = filtered.slice(realOffset, realOffset + limit);
    res.json({ total: count, messages: rows.reverse() });
  } catch (err) {
    res.status(500).json({ message: 'Get messages failed', error: err.message });
  }
};

// Mark a message as viewed (for view_once)
exports.markAsViewed = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findByPk(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    // Only receiver can mark as viewed, and sender cannot update their own message
    if (message.receiver_id !== req.user.id || message.sender_id === req.user.id) {
      return res.status(403).json({ message: 'Only receiver can mark as viewed' });
    }
    if (message.delete_policy === 'view_once' && !message.viewed_at) {
      message.viewed_at = new Date();
      await message.save();
      // Do NOT delete view_once messages anymore
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Mark as viewed failed', error: err.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findByPk(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    // Only receiver can mark as read, and sender cannot update their own message
    if (message.receiver_id !== req.user.id || message.sender_id === req.user.id) {
      return res.status(403).json({ message: 'Only receiver can mark as read' });
    }
    message.status = 'read';
    // If view_once and msg_view_flag is 0, set to 1
    if (message.delete_policy === 'view_once' && message.msg_view_flag === '0') {
      message.msg_view_flag = '1';
    }
    await message.save();
    res.json(message);
  } catch (err) {
    res.status(500).json({ message: 'Mark as read failed', error: err.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.params;
    // Only receiver can mark as read, and sender cannot update their own message
    // userId is sender, req.user.id is receiver
    if (parseInt(userId) === req.user.id) {
      return res.status(403).json({ message: 'Sender cannot mark messages as read' });
    }{
    // Extra defense: do not allow sender to update their own messages
    if (!req.user || !req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    // Extra check: Only receiver can call this
    // Find any message from sender to receiver
    const anyMsg = await Message.findOne({
      where: {
        sender_id: userId,
        receiver_id: req.user.id
      }
    });
   
    // if (!anyMsg) {
    //   return res.status(404).json({ message: 'No messages found from this sender to you' });
    // }
    // Update status to read for all messages
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
    // For view_once messages with msg_view_flag = 0, also set msg_view_flag = 1
    // await Message.update(
    //   { msg_view_flag: '1' },
    //   {
    //     where: {
    //       sender_id: userId,
    //       receiver_id: req.user.id,
    //       delete_policy: 'view_once',
    //       msg_view_flag: '0'
    //     }
    //   }
    // );


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
  }

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
