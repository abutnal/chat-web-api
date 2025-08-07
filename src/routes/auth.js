const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const upload = require('../middleware/upload');

router.post('/signup', upload.single('profile_image'), authController.signup);
router.post('/login', authController.login);

module.exports = router;
