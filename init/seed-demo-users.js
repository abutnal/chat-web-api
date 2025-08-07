const bcrypt = require('bcryptjs');
const User = require('../src/models/user');
const sequelize = require('../src/utils/db');

async function seed() {
  await sequelize.sync();
  const users = [
    {
      name: 'Alice Demo',
      email: 'alice@example.com',
      password: await bcrypt.hash('password123', 10),
      profile_image: '',
    },
    {
      name: 'Bob Demo',
      email: 'bob@example.com',
      password: await bcrypt.hash('password123', 10),
      profile_image: '',
    },
    {
      name: 'Charlie Demo',
      email: 'charlie@example.com',
      password: await bcrypt.hash('password123', 10),
      profile_image: '',
    },
  ];
  for (const user of users) {
    await User.findOrCreate({ where: { email: user.email }, defaults: user });
  }
  console.log('Demo users seeded!');
  process.exit();
}

seed();
