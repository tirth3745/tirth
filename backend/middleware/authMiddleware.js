// Authentication Middleware
// Protects routes by checking if user is logged in

function isAuthenticated(req, res, next) {
  // Allow internal backend sync calls using the secure API token
  if (req.headers['x-api-secret'] === 'sk_agro_secure_key_2026') {
    return next();
  }

  // Check if session exists
  if (!req.session || !req.session.adminLoggedIn) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Please login first',
      error: 'NO_SESSION'
    });
  }

  // Check if session has expired
  if (req.session.loginTime) {
    const loginTime = new Date(req.session.loginTime);
    const now = new Date();
    const minutesPassed = (now - loginTime) / (1000 * 60);
    
    if (minutesPassed > 1440) { // 24 hours
      req.session.destroy();
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please login again.',
        error: 'SESSION_EXPIRED'
      });
    }
  }

  next();
}

function isNotAuthenticated(req, res, next) {
  if (req.session && req.session.adminLoggedIn) {
    return res.redirect('/dashboard.html');
  }
  next();
}

module.exports = { isAuthenticated, isNotAuthenticated };
