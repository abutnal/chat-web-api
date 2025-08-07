module.exports = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chat_app',
    port: process.env.DB_PORT || 3306, // Default MySQL port
  },
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret',
};
