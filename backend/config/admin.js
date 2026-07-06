// Admin Credentials Configuration
// SECURITY: Change these credentials immediately after first login
// Store admin username and password hash here

module.exports = {
  // Line 6-7: Edit these credentials
  admin_username: 'admin',
  admin_password_hash: 'admin123', // In production, this should be bcrypt hashed
  
  // Session expiry time (in minutes)
  session_expiry: 1440, // 24 hours
};
