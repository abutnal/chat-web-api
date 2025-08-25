const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');


router.get('/', auth, userController.getAllUsers);
router.put('/profile', auth, require('../middleware/upload').single('profile_image'), userController.updateProfile);
const authController = require('../controllers/authController');
router.post('/logout', async (req, res, next) => {
  // Try to get token from Authorization header
  let token = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // If not found, get token from body (for sendBeacon)
  if (!token && req.body && req.body.token) {
    token = req.body.token;
  }
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  // Verify token and attach user to req
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  // Call the logout controller
  return require('../controllers/authController').logout(req, res, next);
});

module.exports = router;
