const Message = require('../models/message');
const MyUser = require('../models/myUser'); // Import MyUser model
const BlockedUser = require('../models/blockedUser');

module.exports = (io) => {
  // Robust online user tracking: userId -> Set of socket IDs
  const userSockets = new Map();
  function broadcastOnlineUsers() {
    io.emit('online_users', Array.from(userSockets.keys()));
  }

  io.on('connection', (socket) => {
    // Clear chat for sender
    socket.on('clear_chat', async ({ userId, otherUserId }) => {
      const { Op } = require('sequelize');
      const messages = await Message.findAll({
        where: {
          [Op.or]: [
            { sender_id: userId, receiver_id: otherUserId },
            { sender_id: otherUserId, receiver_id: userId }
          ]
        }
      });
      for (const msg of messages) {
        let deletedFor = msg.deleted_for ? msg.deleted_for.split(',') : [];
        if (!deletedFor.includes(String(userId))) {
          deletedFor.push(String(userId));
          msg.deleted_for = deletedFor.join(',');
          await msg.save();
        }
      }
      io.to(String(userId)).emit('chat_cleared', { otherUserId });
    });
    // Store userId for this socket
    socket.on('join', async (userId) => {
      socket.userId = userId;
      socket.join(String(userId));
      // Add socket.id to user's set
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket.id);
      // Set user status to online in DB
      try {
        const User = require('../models/user');
        const user = await User.findByPk(userId);
        if (user) {
          user.status = 'online';
          await user.save();
        }
        // Emit user_list_updated to all clients
        const users = await User.findAll({ attributes: ['id', 'name', 'email', 'profile_image', 'status'] });
        io.emit('user_list_updated', users);
      } catch (err) {
        console.error('Error setting user online on join:', err);
      }
      broadcastOnlineUsers();
    });

    // Handle sending a message
    socket.on('send_message', async (data) => {
      // Check if receiver has blocked sender
      const isBlocked = await BlockedUser.findOne({
        where: { blocker_id: data.receiver_id, blocked_id: data.sender_id }
      });
      if (isBlocked) {
        // Optionally emit an error to sender
        io.to(String(data.sender_id)).emit('message_blocked', { receiver_id: data.receiver_id });
        return; // Do not send or save the message
      }

      // data: { sender_id, receiver_id, content, file_url }
      const message = await Message.create({
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        content: data.content,
        file_url: data.file_url,
        status: 'sent',
      });

      // Auto-add sender to receiver's list if not present
      if (data.sender_id !== data.receiver_id) {
        try {
          const exists = await MyUser.findOne({ where: { ownerId: data.receiver_id, userId: data.sender_id } });
          if (!exists) {
            await MyUser.create({ ownerId: data.receiver_id, userId: data.sender_id });

            // Emit event to receiver to refresh their user list
            io.to(String(data.receiver_id)).emit('user_list_updated');
          }
        } catch (e) {
          console.error('Auto-add MyUser error (socket):', e);
        }
      }

      // Emit to receiver and sender
      io.to(String(data.receiver_id)).emit('receive_message', message);
      io.to(String(data.sender_id)).emit('receive_message', message);

      // Emit user_list_updated to both sender and receiver for real-time sorting
      io.to(String(data.receiver_id)).emit('user_list_updated');
      io.to(String(data.sender_id)).emit('user_list_updated');
    });

    // Handle message read
    socket.on('read_message', async ({ messageId, userId }) => {
      const message = await Message.findByPk(messageId);
      if (message && message.receiver_id == userId) {
        message.status = 'read';
        await message.save();
        io.to(String(message.sender_id)).emit('message_read', { messageId });
      }
    });

    // Handle message delete
    socket.on('delete_message', async ({ messageId, userId, forEveryone }) => {
      const message = await Message.findByPk(messageId);
      if (!message) return;
      if (forEveryone) {
        await message.destroy();
        io.to(String(message.sender_id)).emit('message_deleted', { messageId });
        io.to(String(message.receiver_id)).emit('message_deleted', { messageId });
      } else {
        let deletedFor = message.deleted_for ? message.deleted_for.split(',') : [];
        if (!deletedFor.includes(String(userId))) {
          deletedFor.push(String(userId));
          message.deleted_for = deletedFor.join(',');
          await message.save();
        }
        io.to(String(userId)).emit('message_deleted', { messageId });
      }
    });

    // Handle message edit
    socket.on('edit_message', async ({ messageId, userId, content }) => {
      const message = await Message.findByPk(messageId);
      if (!message) return;
      if (message.sender_id !== userId) return;
      message.content = content;
      await message.save();
      // Emit to both sender and receiver
      io.to(String(message.sender_id)).emit('message_edited', { message });
      io.to(String(message.receiver_id)).emit('message_edited', { message });
    });

    // Typing indicator
    socket.on('typing', ({ from, to }) => {
      io.to(String(to)).emit('typing', { from, to });
    });

    // ZEGOCLOUD call invite relay
    socket.on('call:invite', ({ from, to }) => {
        io.to(String(to)).emit('call:invite', { from, to });
    });

    // WebRTC signaling events for video/audio calls
    socket.on('call_offer', ({ to, from, offer, callType }) => {
      io.to(String(to)).emit('call_offer', { from, offer, callType });
      // Store callType in socket for later use in call_end
      socket.currentCallType = callType;
      socket.callStartedAt = new Date();
      socket.callAnswered = false;
    });

    socket.on('call_answer', ({ to, from, answer }) => {
      io.to(String(to)).emit('call_answer', { from, answer });
      // Mark call as answered
      socket.callAnswered = true;
    });

    socket.on('ice_candidate', ({ to, from, candidate }) => {
      io.to(String(to)).emit('ice_candidate', { from, candidate });
    });

    socket.on('call_reject', ({ to, from }) => {
      io.to(String(to)).emit('call_reject', { from });
      // Save missed call to DB
      const Call = require('../models/call');
      const callType = socket.currentCallType || 'audio';
      const started_at = socket.callStartedAt || new Date();
      const ended_at = new Date();
      Call.create({
        caller_id: from,
        receiver_id: to,
        type: callType,
        duration: 0,
        started_at,
        ended_at,
        status: 'missed'
      }).catch(err => {
        console.error('Error saving missed call:', err);
      });
    });

    socket.on('call_end', ({ to, from, duration }) => {
      io.to(String(to)).emit('call_end', { from, duration });
      // Save call history to DB
      const Call = require('../models/call');
      // Get callType from socket data (store in socket during call_offer)
      const callType = socket.currentCallType || 'audio';
      const started_at = socket.callStartedAt || new Date();
      const ended_at = new Date();
      // If call was never answered, mark as missed
      const status = socket.callAnswered ? 'completed' : 'missed';
      Call.create({
        caller_id: from,
        receiver_id: to,
        type: callType,
        duration: typeof duration !== 'undefined' && status === 'completed' ? duration : 0,
        started_at,
        ended_at,
        status
      }).catch(err => {
        console.error('Error saving call history:', err);
      });
    });

    // Incoming call notification
    socket.on('incoming_call', ({ to, from, callType }) => {
      io.to(String(to)).emit('incoming_call', { from, callType });
    });

    socket.on('disconnect', async () => {
      if (socket.userId && userSockets.has(socket.userId)) {
        const sockets = userSockets.get(socket.userId);
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(socket.userId);
          // Set user status to offline in DB
          try {
            const User = require('../models/user');
            const user = await User.findByPk(socket.userId);
            if (user) {
              user.status = 'offline';
              await user.save();
            }
            // Emit user_list_updated to all clients
            const users = await User.findAll({ attributes: ['id', 'name', 'email', 'profile_image', 'status'] });
            io.emit('user_list_updated', users);
          } catch (err) {
            console.error('Error setting user offline on disconnect:', err);
          }
        }
        broadcastOnlineUsers();
      }
    });
  });
};
