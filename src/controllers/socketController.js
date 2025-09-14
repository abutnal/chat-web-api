const Message = require('../models/message');
const MyUser = require('../models/myUser'); // Import MyUser model
const BlockedUser = require('../models/blockedUser');

module.exports = (io) => {
  // Robust online user tracking: userId -> Set of socket IDs
  const userSockets = new Map();

  // Helper: Get latest message for a user pair, skipping expired view_once
  async function getLatestMessageForUser(ownerId, userId) {
    const { Op } = require('sequelize');
    const msg = await Message.findOne({
      where: {
        [Op.or]: [
          { sender_id: ownerId, receiver_id: userId },
          { sender_id: userId, receiver_id: ownerId }
        ],
        // Exclude view_once messages with msg_view_flag = '2'
        [Op.or]: [
          { delete_policy: { [Op.ne]: 'view_once' } },
          { delete_policy: 'view_once', msg_view_flag: { [Op.ne]: '2' } }
        ]
      },
      order: [['createdAt', 'DESC']]
    });
    return msg;
  }

  // Emit online users (unchanged)
  function broadcastOnlineUsers() {
    io.emit('online_users', Array.from(userSockets.keys()));
  }

  // Emit user_list_updated with latestMessage for each myUser
  async function emitUserListUpdated(userId) {
    // Find all myUsers for this user
    const myUsers = await MyUser.findAll({ where: { ownerId: userId } });
    const result = [];
    for (const mu of myUsers) {
      const user = await require('../models/user').findByPk(mu.userId);
      if (!user) continue;
      const latestMsg = await getLatestMessageForUser(userId, mu.userId);
      result.push({
        id: user.id,
        name: user.name,
        email: user.email,
        profile_image: user.profile_image,
        status: user.status,
        latestMessage: latestMsg ? latestMsg.content : '',
        latestMessageTime: latestMsg ? latestMsg.createdAt : null
      });
    }
    io.to(String(userId)).emit('user_list_updated', result);
  }

  // Store pending tone timeouts by messageId
  const pendingToneTimeouts = new Map();

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
      // Refresh user list for this user so latestMessage is recalculated
      emitUserListUpdated(userId);
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
        // Emit all_users_updated to all clients
        const users = await User.findAll({ attributes: ['id', 'name', 'email', 'profile_image', 'status'] });
        io.emit('all_users_updated', users);
      } catch (err) {
        console.error('Error setting user online on join:', err);
      }
      broadcastOnlineUsers();
    });

    // Track user focus/tab state
    const userFocusState = new Map(); // userId -> { focused: true/false, activeChatUserId: string|null }
    socket.on('user_status', ({ userId, focused, activeChatUserId }) => {
      userFocusState.set(userId, { focused, activeChatUserId });
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
        delete_policy: data.delete_policy || 'never',
        replyToMessageId: data.replyToMessageId || null,
      });

      // Determine if receiver is focused and in chat with sender
      const focusInfo = userFocusState.get(String(data.receiver_id));
      const isReceiverFocused = focusInfo?.focused;
      const isReceiverInChat = focusInfo?.activeChatUserId == String(data.sender_id);

      // Only emit receive_message for UI (single emit per user)
      io.to(String(data.receiver_id)).emit('receive_message', message);
      io.to(String(data.sender_id)).emit('receive_message', message);

      // Play message tone and show unread only for single tick (not delivered/read)
      if (!isReceiverFocused || !isReceiverInChat) {
        // Delay tone emission by 300ms
        const timeout = setTimeout(async () => {
          // Check if message is delivered or read before playing tone
          const latest = await Message.findByPk(message.id);
          if (latest.status === 'sent') {
            // console.log('[SOCKET] play_message_tone emit for message', message.id, 'to', data.receiver_id);
            io.to(String(data.receiver_id)).emit('play_message_tone', { messageId: message.id });
            io.to(String(data.receiver_id)).emit('unread_message', { from: data.sender_id, messageId: message.id });
          } else {
            console.log('[SOCKET] play_message_tone skipped for message', message.id, 'status', latest.status);
          }
          pendingToneTimeouts.delete(message.id);
        }, 300);
        pendingToneTimeouts.set(message.id, timeout);
      }

      // Auto-add sender to receiver's list if not present
      let myUserAdded = false;
      if (data.sender_id !== data.receiver_id) {
        try {
          const exists = await MyUser.findOne({ where: { ownerId: data.receiver_id, userId: data.sender_id } });
          if (!exists) {
            await MyUser.create({ ownerId: data.receiver_id, userId: data.sender_id });
            myUserAdded = true;
          }
        } catch (e) {
          console.error('Auto-add MyUser error (socket):', e);
        }
      }
      // Only emit user_list_updated if a new MyUser was added
      if (myUserAdded) {
        emitUserListUpdated(data.receiver_id);
      }
    });

    // Cancel pending tone if delivered or read quickly
    socket.on('delivered_message', async ({ messageId, userId }) => {
      if (pendingToneTimeouts.has(messageId)) {
        clearTimeout(pendingToneTimeouts.get(messageId));
        pendingToneTimeouts.delete(messageId);
        // console.log('[SOCKET] play_message_tone cancelled for delivered', messageId);
      }
      // Only mark as delivered if user is focused and in chat with sender
      const message = await Message.findByPk(messageId);
      const focusInfo = userFocusState.get(String(userId));
      const isReceiverFocused = focusInfo?.focused;
      const isReceiverInChat = focusInfo?.activeChatUserId == String(message.sender_id);
      if (
        message &&
        message.receiver_id == userId &&
        message.status !== 'read' &&
        isReceiverFocused &&
        isReceiverInChat
      ) {
        message.status = 'delivered';
        await message.save();
        // console.log('[SOCKET] stop_message_tone emit for delivered', messageId, 'to', message.receiver_id);
        io.to(String(message.sender_id)).emit('message_delivered', {
          messageId,
          sender_id: message.sender_id,
          receiver_id: message.receiver_id
        });
        io.to(String(message.receiver_id)).emit('message_delivered', {
          messageId,
          sender_id: message.sender_id,
          receiver_id: message.receiver_id
        });
        // Stop message tone and clear unread for double tick
        io.to(String(message.receiver_id)).emit('stop_message_tone', { messageId });
        io.to(String(message.receiver_id)).emit('clear_unread', { from: message.sender_id });
      } else {
        console.log('[SOCKET] delivered_message ignored: not focused or not in chat', messageId, userId);
      }
    });


    socket.on('read_message', async ({ messageId, userId }) => {

      // const message = await Message.findByPk(messageId);
         console.log('message fetched for read_message', userId, messageId);

    const message = await Message.findByPk(messageId, {
            where: { receiver_id: userId } // Assumes userId is a column in the Message model
         })
      //  console.log('message fetched for read_message old', userId, messageId, message ? 'found' : 'not found');
       // rID is receiver_id from client, should match userId
       // const rID = receiver_id;
       //
        // Only allow receiver to update status to read, and sender cannot update their own message
      if (!message) {
        console.log('[SOCKET] read_message ignored: message not found', { messageId, userId });
        return;
      }
      if (message.sender_id == userId) {
        // Sender is trying to update read status, block this
        console.log('[SOCKET] read_message BLOCKED: sender tried to update status to read', { messageId, userId, sender_id: message.sender_id });
        return;
      }
      if (message.receiver_id != userId) {
        // Not the receiver, block this
        console.log('[SOCKET] read_message ignored: user is not receiver', { messageId, userId, receiver_id: message.receiver_id });
        return;
      }
      if (pendingToneTimeouts.has(messageId)) {
        clearTimeout(pendingToneTimeouts.get(messageId));
        pendingToneTimeouts.delete(messageId);
        console.log('[SOCKET] play_message_tone cancelled for read', messageId);
      }
      // Set viewed_at and msg_view_flag for view_once messages
      if (message.delete_policy === 'view_once') {
        if (!message.viewed_at) {
          message.viewed_at = new Date();
        }
        if (message.msg_view_flag === '0' && message.sender_id == userId) {
          message.msg_view_flag = '1';
        }
      }

      // console.log('read_message called by receiver', userId);
       if (message.msg_view_flag === '0' && message.receiver_id == userId) {
        console.log('read_message called by receiver IN***', userId);
         message.status = 'read';
       }
        await message.save();

      
      io.to(String(message.sender_id)).emit('message_read', {
        messageId,
        sender_id: message.sender_id,
        receiver_id: message.receiver_id,
        viewed_at: message.viewed_at,
        delete_policy: message.delete_policy
      });
      io.to(String(message.receiver_id)).emit('message_read', {
        messageId,
        sender_id: message.sender_id,
        receiver_id: message.receiver_id,
        viewed_at: message.viewed_at,
        delete_policy: message.delete_policy
      });
      io.to(String(message.receiver_id)).emit('stop_message_tone', { messageId });
      io.to(String(message.receiver_id)).emit('clear_unread', { from: message.sender_id });
    });

    // Handle message delete
  socket.on('delete_message', async ({ messageId, userId, forEveryone }) => {
      const message = await Message.findByPk(messageId);
      if (!message) return;
      // Prevent deleting view_once messages from DB; treat like other types
      if (forEveryone) {
        if (message.delete_policy === 'view_once') {
          // Do not destroy, just emit delete for everyone (optional: mark as deleted)
          io.to(String(message.sender_id)).emit('message_deleted', { messageId });
          io.to(String(message.receiver_id)).emit('message_deleted', { messageId });
        } else {
          await message.destroy();
          io.to(String(message.sender_id)).emit('message_deleted', { messageId });
          io.to(String(message.receiver_id)).emit('message_deleted', { messageId });
        }
        // Update user lists for both users
        emitUserListUpdated(message.sender_id);
        emitUserListUpdated(message.receiver_id);
      } else {
        let deletedFor = message.deleted_for ? message.deleted_for.split(',') : [];
        if (!deletedFor.includes(String(userId))) {
          deletedFor.push(String(userId));
          message.deleted_for = deletedFor.join(',');
          await message.save();
        }
        io.to(String(userId)).emit('message_deleted', { messageId });
        // Update user list for this user
        emitUserListUpdated(userId);
      }
    });

    // Handle message edit
    socket.on('edit_message', async ({ messageId, userId, content }) => {
      // console.log('[edit_message] called', { messageId, userId, content });
      const message = await Message.findByPk(messageId);
      if (!message) {
        console.log('[edit_message] Message not found', { messageId });
        return;
      }
      if (message.sender_id !== userId) {
        // console.log('[edit_message] Sender mismatch', { sender_id: message.sender_id, userId });
        return;
      }
      message.content = content;
      await message.save();
      // console.log('[edit_message] Message updated', { id: message.id, content: message.content });
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
        // Play ringtone on receiver
        io.to(String(to)).emit('play_call_ringtone', { from });
        // Show incoming call popup on receiver
        io.to(String(to)).emit('incoming_call_popup', { from, to });
    });

    // WebRTC signaling events for video/audio calls
    socket.on('call_offer', ({ to, from, offer, callType }) => {
      io.to(String(to)).emit('call_offer', { from, offer, callType });
      // Store callType in socket for later use in call_end
      socket.currentCallType = callType;
      socket.callStartedAt = new Date();
      socket.callAnswered = false;
      // Play ringtone on receiver
      io.to(String(to)).emit('play_call_ringtone', { from });
    });

    socket.on('call_answer', ({ to, from, answer }) => {
      io.to(String(to)).emit('call_answer', { from, answer });
      // Mark call as answered
      socket.callAnswered = true;
      // Stop ringtone on receiver
      io.to(String(to)).emit('stop_call_ringtone', { from });
      // Hide incoming call popup
      io.to(String(to)).emit('hide_incoming_call_popup', { from });
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
      // Stop ringtone on receiver
      io.to(String(to)).emit('stop_call_ringtone', { from });
      // Hide incoming call popup
      io.to(String(to)).emit('hide_incoming_call_popup', { from });
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
      // Stop ringtone on receiver
      io.to(String(to)).emit('stop_call_ringtone', { from });
      // Hide incoming call popup
      io.to(String(to)).emit('hide_incoming_call_popup', { from });
    });

    // Incoming call notification
    socket.on('incoming_call', ({ to, from, callType }) => {
      io.to(String(to)).emit('incoming_call', { from, callType });
    });

    // --- Handle delete_view_once_messages ---
    socket.on('delete_view_once_messages', async ({ messageIds, userId, otherUserId }) => {
      // console.log('[SOCKET] Received delete_view_once_messages', { messageIds, userId, otherUserId });
      if (!Array.isArray(messageIds) || !userId || !otherUserId) return;
      for (const messageId of messageIds) {
        const msg = await Message.findByPk(messageId);
        if (
          msg &&
          msg.delete_policy === 'view_once' &&
          msg.viewed_at &&
          ((msg.receiver_id == userId && msg.sender_id == otherUserId) || (msg.sender_id == userId && msg.receiver_id == otherUserId))
        ) {
          // Do NOT delete view_once messages from DB anymore
          // console.log('[SOCKET] Not deleting view_once message (policy updated)', messageId);
          // Optionally emit an event if you want to update UI
        } else {
          console.log('[SOCKET] Not deleting message', messageId, {
            found: !!msg,
            delete_policy: msg?.delete_policy,
            viewed_at: msg?.viewed_at,
            sender_id: msg?.sender_id,
            receiver_id: msg?.receiver_id
          });
        }
      }
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
            // Emit all_users_updated to all clients
            const users = await User.findAll({ attributes: ['id', 'name', 'email', 'profile_image', 'status'] });
            io.emit('all_users_updated', users);
          } catch (err) {
            console.error('Error setting user offline on disconnect:', err);
          }
        }
        broadcastOnlineUsers();
      }
    });
  });
};
