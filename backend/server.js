const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const compression = require('compression');
const session = require('express-session');
const errorHandler = require('./middleware/errorHandler');
const { isAuthenticated } = require('./middleware/authMiddleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 7890;
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production';

// Session Configuration
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(compression());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from workspace root with cache control disabled for active development
const publicPath = path.join(__dirname, '../');
app.use(express.static(publicPath, {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Auth Routes (Public)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// API Routes (Protected - all data routes require authentication)
const apiRoutes = require('./routes/api');
app.use('/api', isAuthenticated, apiRoutes);

// Catch-all route to serve index.html for undefined frontend routes
app.get('*', (req, res, next) => {
  // If request is for an API endpoint that wasn't found
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'API Endpoint not found' });
  }
  // Otherwise, serve frontend landing index.html
  res.sendFile(path.join(publicPath, 'index.html'), (err) => {
    if (err) next();
  });
});

// Global Error Handler
app.use(errorHandler);

// Listen on configured port on all network interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`==================================================`);
  console.log(` AgroChem ERP Server running in ${process.env.NODE_ENV || 'production'} mode`);
  console.log(` Local Address:   http://localhost:${PORT}`);
  console.log(` Authentication:  Admin Login Enabled`);
  console.log(`==================================================`);
});

module.exports = app;
