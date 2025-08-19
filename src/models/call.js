const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db');

const Call = sequelize.define('Call', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  caller_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  receiver_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('audio', 'video'),
    allowNull: false,
  },
  duration: {
    type: DataTypes.INTEGER,
    defaultValue: 0, // seconds
  },
  started_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  ended_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('missed', 'completed', 'rejected'),
    defaultValue: 'missed',
  },
}, {
  tableName: 'calls',
  timestamps: false,
});

module.exports = Call;
