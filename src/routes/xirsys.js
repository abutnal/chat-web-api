const express = require('express');
const router = express.Router();
const xirsysController = require('../controllers/xirsysController');

router.post('/ice', xirsysController.getIceServers);

module.exports = router;
