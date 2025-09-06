const express = require('express');
const router = express.Router();
const blockedUserController = require('../controllers/blockedUserController');
const auth = require('../middleware/auth');

router.post('/block-user', auth, blockedUserController.blockUser);
router.post('/unblock-user', auth, blockedUserController.unblockUser);
router.get('/blocked-users', auth, blockedUserController.getBlockedUsers);

module.exports = router;