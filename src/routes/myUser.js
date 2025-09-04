const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const myUserController = require('../controllers/myUserController');

// Get my user list
router.get('/', auth, myUserController.getMyUsers);

// Add user to my list
router.post('/add', auth, myUserController.addMyUser);

// Remove user from my list
router.post('/remove', auth, myUserController.removeMyUser);

module.exports = router;