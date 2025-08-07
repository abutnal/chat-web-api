const Message = require('../models/message');

module.exports = (io) => {
  // Track online users
  const onlineUsers = new Set();

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
    socket.on('join', (userId) => {
      socket.userId = userId;
      socket.join(String(userId));
      onlineUsers.add(userId);
      // Broadcast updated online users to all clients
      io.emit('online_users', Array.from(onlineUsers));
    });

    // Handle sending a message
    socket.on('send_message', async (data) => {
      // data: { sender_id, receiver_id, content, file_url }
      const message = await Message.create({
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        content: data.content,
        file_url: data.file_url,
        status: 'sent',
      });
      // Emit to receiver and sender
      io.to(String(data.receiver_id)).emit('receive_message', message);
      io.to(String(data.sender_id)).emit('receive_message', message);
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

    socket.on('disconnect', () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit('online_users', Array.from(onlineUsers));
      }
    });
  });
};
