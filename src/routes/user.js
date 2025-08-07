const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

router.get('/', auth, userController.getAllUsers);
router.put('/profile', auth, require('../middleware/upload').single('profile_image'), userController.updateProfile);

module.exports = router;
