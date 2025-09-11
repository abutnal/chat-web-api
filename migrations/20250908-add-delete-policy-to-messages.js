"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('messages', 'delete_policy', {
      type: Sequelize.ENUM('view_once', '24h', 'never'),
      defaultValue: 'never',
      allowNull: false,
    });
    await queryInterface.addColumn('messages', 'viewed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('messages', 'sent_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('messages', 'delete_policy');
    await queryInterface.removeColumn('messages', 'viewed_at');
    await queryInterface.removeColumn('messages', 'sent_at');
  }
};
