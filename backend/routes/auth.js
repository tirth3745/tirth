// Auth Routes
const express = require('express');
const router = express.Router();
const { login, logout, checkAuth } = require('../controllers/authController');

// Public routes
router.post('/login', login);
router.get('/check', checkAuth);

// Logout should still succeed even if the session is already missing/expired.
router.post('/logout', logout);

module.exports = router;
