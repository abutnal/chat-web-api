"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("messages", "replyToMessageId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "messages",
        key: "id"
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("messages", "replyToMessageId");
  }
};
