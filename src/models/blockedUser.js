const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db');

const BlockedUser = sequelize.define('BlockedUser', {
  blocker_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  blocked_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  indexes: [
    { unique: true, fields: ['blocker_id', 'blocked_id'] }
  ]
});

module.exports = BlockedUser;