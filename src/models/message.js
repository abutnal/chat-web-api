const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db');

const Message = sequelize.define('Message', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  sender_id: { type: DataTypes.INTEGER, allowNull: false },
  receiver_id: { type: DataTypes.INTEGER, allowNull: false },
  content: { type: DataTypes.TEXT },
  file_url: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('sent', 'delivered', 'read'), defaultValue: 'sent' },
  deleted_for: { type: DataTypes.STRING }, // comma-separated user ids
}, {
  timestamps: true,
  tableName: 'messages',
});

module.exports = Message;
