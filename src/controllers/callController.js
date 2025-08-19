const Call = require('../models/call');
const { Op } = require('sequelize');
const User = require('../models/user');

// Save a new call record
exports.saveCall = async (req, res) => {
  try {
    const { caller_id, receiver_id, type, duration, started_at, ended_at, status } = req.body;
    const call = await Call.create({ caller_id, receiver_id, type, duration, started_at, ended_at, status });
    res.status(201).json(call);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get call history for a user
exports.getCallHistory = async (req, res) => {
  try {
    const userId = req.params.userId;
    const calls = await Call.findAll({
      where: {
        [Op.or]: [
          { caller_id: userId },
          { receiver_id: userId }
        ]
      },
      order: [['started_at', 'DESC']]
    });
    res.json(calls);
  } catch (err) {
    console.error('Error in getCallHistory:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};
