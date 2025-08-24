const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');


router.get('/', auth, userController.getAllUsers);
router.put('/profile', auth, require('../middleware/upload').single('profile_image'), userController.updateProfile);
const authController = require('../controllers/authController');
router.post('/logout', auth, authController.logout);

module.exports = router;
