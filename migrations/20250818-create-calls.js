'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('calls', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      caller_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      receiver_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM('audio', 'video'),
        allowNull: false,
      },
      duration: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      started_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      ended_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('missed', 'completed', 'rejected'),
        defaultValue: 'missed',
      }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('calls');
  }
};
