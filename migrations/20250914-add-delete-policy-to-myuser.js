"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("myUsers", "delete_policy", {
      type: Sequelize.ENUM("view_once", "24h", "never"),
      allowNull: false,
      defaultValue: "never",
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("myUsers", "delete_policy");
    await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_myUsers_delete_policy\";");
  },
};
