const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'agrochem_erp'
  });

  try {
    console.log('--- DAILY TRANSACTIONS ---');
    const [txns] = await connection.query('SELECT * FROM daily_transactions');
    console.log(txns);

    console.log('--- DAILY TRANSACTION MATERIALS ---');
    const [mats] = await connection.query('SELECT * FROM daily_transaction_materials');
    console.log(mats);

    console.log('--- STOCK MOVEMENTS ---');
    const [movs] = await connection.query('SELECT * FROM stock_movements');
    console.log(movs);

    console.log('--- STOCK BATCHES ---');
    const [batches] = await connection.query('SELECT * FROM stock_batches');
    console.log(batches);

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
