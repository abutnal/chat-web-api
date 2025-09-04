const User = require('./user');
const MyUser = require('./myUser');
const Message = require('./message');

// Associate userId to User as 'User'
MyUser.belongsTo(User, { foreignKey: 'userId', as: 'User' });
// If you want to associate ownerId as well, use a different alias:
MyUser.belongsTo(User, { foreignKey: 'ownerId', as: 'Owner' });

module.exports = {
  User,
  MyUser,
  Message,
};