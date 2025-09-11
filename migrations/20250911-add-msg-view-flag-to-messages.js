"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('messages', 'msg_view_flag', {
      type: Sequelize.ENUM('0', '1', '2'),
      allowNull: false,
      defaultValue: '0',
      comment: '0=not viewed, 1=viewed, 2=expired for view_once',
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('messages', 'msg_view_flag');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_messages_msg_view_flag";');
  }
};
