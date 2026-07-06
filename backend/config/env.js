// Environment Configuration Loader
require('dotenv').config();

const config = {
  // Server
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 7890,
  host: process.env.HOST || 'localhost',

  // Database
  db_path: process.env.DB_PATH || './database/data.db',
  db_backup_path: process.env.DB_BACKUP_PATH || './database/backups',

  // Session
  session_secret: process.env.SESSION_SECRET || 'change-me-in-production',
  session_timeout: parseInt(process.env.SESSION_TIMEOUT) || 1440,

  // Admin
  admin_username: process.env.ADMIN_USERNAME || 'admin',
  admin_password: process.env.ADMIN_PASSWORD || 'admin123',

  // Email
  email_service: process.env.EMAIL_SERVICE || 'gmail',
  email_user: process.env.EMAIL_USER || '',
  email_password: process.env.EMAIL_PASSWORD || '',
  email_from: process.env.EMAIL_FROM || 'noreply@agrochimerp.com',

  // Logging
  log_level: process.env.LOG_LEVEL || 'info',
  log_dir: process.env.LOG_DIR || './logs',

  // Features
  enable_email_alerts: process.env.ENABLE_EMAIL_ALERTS === 'true',
  enable_backups: process.env.ENABLE_BACKUPS !== 'false',
  backup_interval: parseInt(process.env.BACKUP_INTERVAL) || 24,

  // Derived values
  is_production: process.env.NODE_ENV === 'production',
  is_development: process.env.NODE_ENV === 'development'
};

module.exports = config;
