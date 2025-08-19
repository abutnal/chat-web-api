// require('dotenv').config({path: `.env.${process.env.NODE_ENV}`});
require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` }); 
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // Allow all origins for Socket.io
    credentials: true
  }
});

// Expose io instance for REST controllers
app.set('io', io);

app.use(cors());
app.use(express.json());



// DB and models
const sequelize = require('./utils/db');
require('./models/user');
require('./models/message');



// Import routes
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/message');
const uploadRoutes = require('./routes/upload');
const userRoutes = require('./routes/user');
const callRoutes = require('./routes/call');


// Static file serving for uploads
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/calls', callRoutes);

// Error handler
app.use((err, req, res, next) => {
  res.status(500).json({ message: err.message || 'Server error' });
});

app.get('/', (req, res) => res.send('Chat API running'));


// Socket.io setup
require('./controllers/socketController')(io);

// Test DB connection, then sync and start server
const PORT = process.env.PORT || 8000;
sequelize.authenticate()
  .then(() => {
    console.log('Database connection established.');
    return sequelize.sync();
  })
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err);
  });
