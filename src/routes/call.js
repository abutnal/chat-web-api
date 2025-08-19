const express = require('express');
const router = express.Router();
const callController = require('../controllers/callController');
const auth = require('../middleware/auth');

// Save a call record
router.post('/', auth, callController.saveCall);

// Get call history for a user
router.get('/history/:userId', auth, callController.getCallHistory);

module.exports = router;
