'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('classes', 'canvas_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      unique: false,
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('classes', 'canvas_id');
  }
};
