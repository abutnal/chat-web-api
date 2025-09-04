const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');


router.get('/', auth, userController.getAllUsers);
router.put('/profile', auth, require('../middleware/upload').single('profile_image'), userController.updateProfile);
router.get('/search', auth, userController.searchUsers);
const authController = require('../controllers/authController');
router.post('/logout', async (req, res, next) => {
  let token = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token && req.body && req.body.token) {
    token = req.body.token;
  }
  if (token) {
    const jwt = require('jsonwebtoken');
    const config = require('../config');
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.user = decoded;
    } catch (err) {
      req.user = null; // Token invalid/expired
    }
  } else {
    req.user = null; // No token provided
  }
  // Always call the logout controller
  return require('../controllers/authController').logout(req, res, next);
});

module.exports = router;
