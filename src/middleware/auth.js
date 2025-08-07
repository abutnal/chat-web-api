const jwt = require('jsonwebtoken');
const config = require('../config');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  // Debug log: print JWT secret and received token
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT verification error:', err.message);
    res.status(401).json({ message: 'Invalid token' });
  }
};
