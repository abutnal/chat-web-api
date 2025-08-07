const { Sequelize } = require('sequelize');
const config = require('../config');

const sequelize = new Sequelize(
  config.db.database,
  config.db.user,
  config.db.password,
  {
    host: config.db.host,
    port: config.db.port, // Add port to Sequelize config
    dialect: 'mysql',
    logging: false,
  }
);

module.exports = sequelize;
