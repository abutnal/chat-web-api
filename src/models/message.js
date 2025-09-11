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
  delete_policy: { type: DataTypes.ENUM('view_once', '24h', 'never'), defaultValue: 'never', allowNull: false },
  viewed_at: { type: DataTypes.DATE, allowNull: true },
  sent_at: { type: DataTypes.DATE, allowNull: true },
  replyToMessageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'messages',
      key: 'id'
    },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  },
  msg_view_flag: {
    type: DataTypes.ENUM('0', '1', '2'),
    allowNull: false,
    defaultValue: '0',
    comment: '0=not viewed, 1=viewed, 2=expired for view_once',
  },
}, {
  timestamps: true,
  tableName: 'messages',
});

module.exports = Message;
