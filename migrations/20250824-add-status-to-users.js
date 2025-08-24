"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("users", "status", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "offline"
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("users", "status");
  }
};
