const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const auth = require('../middleware/auth');

router.post('/send', auth, messageController.sendMessage);
router.get('/:userId', auth, messageController.getMessages);
router.patch('/:messageId/read', auth, messageController.markAsRead);
router.delete('/:messageId', auth, messageController.deleteMessage);
router.patch('/:messageId', auth, messageController.editMessage);
router.post('/mark-all-read/:userId', auth, messageController.markAllAsRead);

module.exports = router;
