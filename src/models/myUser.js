const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db');
const User = require('./user');

const MyUser = sequelize.define('MyUser', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  ownerId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  delete_policy: {
    type: DataTypes.ENUM('view_once', '24h', 'never'),
    allowNull: false,
    defaultValue: 'never',
  },
}, {
  timestamps: true,
  tableName: 'my_users',
});

// // Association
// MyUser.belongsTo(User, { foreignKey: 'userId', as: 'User' });

module.exports = MyUser;