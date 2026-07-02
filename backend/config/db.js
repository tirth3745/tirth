const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  database: process.env.DB_NAME || 'agrochem_erp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true // Return date fields as strings instead of JS Date objects
});

// Test connection on server start
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully to ' + (process.env.DB_NAME || 'agrochem_erp'));
    connection.release();
  } catch (err) {
    console.error('Database connection failed!');
    console.error('Error Details:', err.message);
  }
}

testConnection();

module.exports = pool;
