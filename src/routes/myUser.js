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

// Update delete_policy for a user in my list
router.patch('/:userId/delete-policy', auth, myUserController.updateDeletePolicy);

module.exports = router;