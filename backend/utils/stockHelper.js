const db = require('../config/db');

/**
 * Gets the total available stock for an item based on FIFO active batches.
 */
async function getFIFOStock(itemId, itemType, conn = db) {
  const sql = `
    SELECT COALESCE(SUM(current_qty), 0) as qty 
    FROM stock_batches 
    WHERE item_id = ? AND item_type = ? AND current_qty > 0
  `;
  const [rows] = await conn.query(sql, [itemId, itemType]);
  return parseFloat(rows[0]?.qty || 0);
}

/**
 * Deducts stock from active batches using FIFO.
 * If there is insufficient stock, it throws an error.
 */
async function deductStockFIFO(itemId, itemType, qtyToDeduct, txnType, txnId, conn = db) {
  if (qtyToDeduct <= 0) return;

  // 1. Fetch active batches ordered by purchase date (FIFO)
  const selectSql = `
    SELECT id, current_qty 
    FROM stock_batches 
    WHERE item_id = ? AND item_type = ? AND current_qty > 0 
    ORDER BY purchase_date ASC, id ASC
  `;
  const [batches] = await conn.query(selectSql, [itemId, itemType]);

  // Calculate total available first to verify
  const available = batches.reduce((sum, b) => sum + parseFloat(b.current_qty), 0);
  if (available < qtyToDeduct) {
    throw new Error(`Insufficient stock for item ID ${itemId} (${itemType}). Required: ${qtyToDeduct}, Available: ${available}`);
  }

  let remaining = qtyToDeduct;
  for (const batch of batches) {
    if (remaining <= 0) break;

    const currentQty = parseFloat(batch.current_qty);
    const deduct = Math.min(currentQty, remaining);

    // 2. Update stock batch qty
    const updateSql = `
      UPDATE stock_batches 
      SET current_qty = current_qty - ? 
      WHERE id = ?
    `;
    await conn.query(updateSql, [deduct, batch.id]);

    // 3. Log stock movement
    const insertMovementSql = `
      INSERT INTO stock_movements (batch_id, txn_type, txn_id, qty) 
      VALUES (?, ?, ?, ?)
    `;
    await conn.query(insertMovementSql, [batch.id, txnType, txnId, -deduct]);

    remaining -= deduct;
  }
}

/**
 * Reverses previous stock deductions linked to a transaction.
 */
async function reverseStockDeductions(txnType, txnId, conn = db) {
  // 1. Find all stock movements matching transaction type and ID
  const selectSql = `
    SELECT id, batch_id, qty 
    FROM stock_movements 
    WHERE txn_type = ? AND txn_id = ?
  `;
  const [movements] = await conn.query(selectSql, [txnType, txnId]);

  for (const m of movements) {
    const qtyToRestore = Math.abs(parseFloat(m.qty));

    // 2. Add quantity back to the corresponding batch
    const updateSql = `
      UPDATE stock_batches 
      SET current_qty = current_qty + ? 
      WHERE id = ?
    `;
    await conn.query(updateSql, [qtyToRestore, m.batch_id]);
  }

  // 3. Delete those stock movements
  const deleteSql = `
    DELETE FROM stock_movements 
    WHERE txn_type = ? AND txn_id = ?
  `;
  await conn.query(deleteSql, [txnType, txnId]);
}

module.exports = {
  getFIFOStock,
  deductStockFIFO,
  reverseStockDeductions
};
