// Auth Controller - Handles login/logout
const adminConfig = require('../config/admin');

// Login endpoint
async function login(req, res) {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
        error: 'MISSING_CREDENTIALS'
      });
    }

    // Check credentials (compare with admin config)
    if (username === adminConfig.admin_username && password === adminConfig.admin_password_hash) {
      // Set session
      req.session.adminLoggedIn = true;
      req.session.loginTime = new Date();
      req.session.username = username;

      return res.json({
        success: true,
        message: 'Login successful',
        redirect: '/pages/dashboard.html'
      });
    } else {
      // Invalid credentials
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
        error: 'INVALID_CREDENTIALS'
      });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      message: 'Login failed: ' + err.message,
      error: 'SERVER_ERROR'
    });
  }
}

// Logout endpoint
function logout(req, res) {
  const sendLoggedOutResponse = () => {
    res.clearCookie('connect.sid');
    return res.json({
      success: true,
      message: 'Logged out successfully',
      redirect: '/'
    });
  };

  if (!req.session) {
    return sendLoggedOutResponse();
  }

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Logout failed',
        error: 'SESSION_DESTROY_ERROR'
      });
    }

    return sendLoggedOutResponse();
  });
}

// Check auth status
function checkAuth(req, res) {
  if (req.session && req.session.adminLoggedIn) {
    res.json({
      success: true,
      authenticated: true,
      username: req.session.username
    });
  } else {
    res.json({
      success: true,
      authenticated: false
    });
  }
}

module.exports = { login, logout, checkAuth };
