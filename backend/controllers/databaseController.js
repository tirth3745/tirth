const db = require('../config/db');

exports.resetDatabase = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    const tables = [
      'clients',
      'suppliers',
      'products',
      'product_packaging',
      'inventory_items',
      'stock_batches',
      'stock_movements',
      'purchases',
      'purchase_items',
      'orders',
      'order_items',
      'daily_transactions',
      'daily_transaction_items',
      'expenses',
      'transactions',
      'formulations',
      'formulation_ingredients',
      'master_options'
    ];

    for (const table of tables) {
      await conn.query(`TRUNCATE TABLE ${table}`);
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    res.json({ success: true, message: 'Database reset successfully. All data erased.' });
  } catch (err) {
    next(err);
  } finally {
    conn.release();
  }
};
