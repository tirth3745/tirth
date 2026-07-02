const db = require('../config/db');
const { getFIFOStock } = require('../utils/stockHelper');

exports.getInventoryItems = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT ii.*, 
             COALESCE(SUM(sb.current_qty), 0) as stock,
             COALESCE(AVG(CASE WHEN sb.current_qty > 0 THEN sb.purchase_price END), 0) as avg_cost
      FROM inventory_items ii
      LEFT JOIN stock_batches sb ON ii.id = sb.item_id AND sb.item_type = 'Inventory'
      GROUP BY ii.id
      ORDER BY ii.name
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getInventoryItemById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM inventory_items WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }
    
    // Fetch opening stock batch details if any
    const [batches] = await db.query(
      `SELECT * FROM stock_batches 
       WHERE item_id = ? AND item_type = 'Inventory' AND (batch_no LIKE '%OPEN%' OR batch_no = 'OPEN-BATCH') 
       LIMIT 1`,
      [id]
    );
    
    const item = rows[0];
    if (batches.length > 0) {
      item.opening_qty = batches[0].initial_qty;
      item.opening_cost = batches[0].purchase_price;
      item.opening_batch_no = batches[0].batch_no;
    } else {
      item.opening_qty = 0;
      item.opening_cost = 0;
      item.opening_batch_no = '';
    }

    res.json(item);
  } catch (err) {
    next(err);
  }
};

exports.getInventoryStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stock = await getFIFOStock(id, 'Inventory');
    res.json({ id, stock });
  } catch (err) {
    next(err);
  }
};

exports.createInventoryItem = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { name, category, unit, reorder_level, item_subtype, item_size, description, opening_qty, opening_cost, opening_batch_no } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Item name is required' });
    }

    const [result] = await conn.query(
      `INSERT INTO inventory_items (name, category, unit, reorder_level, item_subtype, item_size, description) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        category || 'Technical',
        unit || 'Nos',
        parseFloat(reorder_level) || 0.0,
        item_subtype || null,
        item_size || null,
        description || null
      ]
    );

    const itemId = result.insertId;
    const qty = parseFloat(opening_qty) || 0;
    const cost = parseFloat(opening_cost) || 0;
    const batchNo = opening_batch_no || 'OPEN-BATCH';

    // Log opening stock in stock_batches and stock_movements if qty > 0
    if (qty > 0) {
      const today = new Date().toISOString().split('T')[0];
      const [batchResult] = await conn.query(
        `INSERT INTO stock_batches (item_id, item_name, item_type, batch_no, purchase_date, purchase_price, initial_qty, current_qty, unit, expiry_date, warehouse) 
         VALUES (?, ?, 'Inventory', ?, ?, ?, ?, ?, ?, '', 'Main Warehouse')`,
        [itemId, name, batchNo, today, cost, qty, qty, unit || 'Nos']
      );

      const batchId = batchResult.insertId;

      await conn.query(
        `INSERT INTO stock_movements (batch_id, txn_type, txn_id, qty) 
         VALUES (?, 'Opening Stock', 0, ?)`,
        [batchId, qty]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, id: itemId, message: 'Inventory item created successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.updateInventoryItem = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const { name, category, unit, reorder_level, item_subtype, item_size, description, opening_qty, opening_cost, opening_batch_no } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Item name is required' });
    }

    const [itemUpdate] = await conn.query(
      `UPDATE inventory_items 
       SET name = ?, category = ?, unit = ?, reorder_level = ?, item_subtype = ?, item_size = ?, description = ? 
       WHERE id = ?`,
      [
        name,
        category || 'Technical',
        unit || 'Nos',
        parseFloat(reorder_level) || 0.0,
        item_subtype || null,
        item_size || null,
        description || null,
        id
      ]
    );

    if (itemUpdate.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    const qty = parseFloat(opening_qty) || 0;
    const cost = parseFloat(opening_cost) || 0;
    const batchNo = opening_batch_no || 'OPEN-BATCH';

    // Find if opening stock batch already exists
    const [existingBatches] = await conn.query(
      `SELECT id FROM stock_batches 
       WHERE item_id = ? AND item_type = 'Inventory' AND (batch_no LIKE '%OPEN%' OR batch_no = 'OPEN-BATCH') 
       LIMIT 1`,
      [id]
    );

    if (existingBatches.length > 0) {
      const batchId = existingBatches[0].id;
      // Update existing batch
      await conn.query(
        `UPDATE stock_batches 
         SET batch_no = ?, purchase_price = ?, initial_qty = ?, current_qty = ?, unit = ? 
         WHERE id = ?`,
        [batchNo, cost, qty, qty, unit || 'Nos', batchId]
      );
      // Update opening stock movement
      await conn.query(
        `UPDATE stock_movements 
         SET qty = ? 
         WHERE batch_id = ? AND txn_type = 'Opening Stock'`,
        [qty, batchId]
      );
    } else if (qty > 0) {
      // Create new opening stock batch
      const today = new Date().toISOString().split('T')[0];
      const [batchResult] = await conn.query(
        `INSERT INTO stock_batches (item_id, item_name, item_type, batch_no, purchase_date, purchase_price, initial_qty, current_qty, unit, expiry_date, warehouse) 
         VALUES (?, ?, 'Inventory', ?, ?, ?, ?, ?, ?, '', 'Main Warehouse')`,
        [id, name, batchNo, today, cost, qty, qty, unit || 'Nos']
      );

      const batchId = batchResult.insertId;

      await conn.query(
        `INSERT INTO stock_movements (batch_id, txn_type, txn_id, qty) 
         VALUES (?, 'Opening Stock', 0, ?)`,
        [batchId, qty]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Inventory item updated successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.deleteInventoryItem = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;

    // Delete stock batches (this cascades to stock movements automatically)
    await conn.query(`DELETE FROM stock_batches WHERE item_id = ? AND item_type = 'Inventory'`, [id]);

    const [result] = await conn.query('DELETE FROM inventory_items WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    await conn.commit();
    res.json({ success: true, message: 'Inventory item deleted successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.getItemBatches = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type } = req.query;
    const [rows] = await db.query(
      `SELECT b.*, s.name as supplier_name 
       FROM stock_batches b 
       LEFT JOIN suppliers s ON b.supplier_id = s.id 
       WHERE b.item_id = ? AND b.item_type = ? AND b.current_qty > 0 
       ORDER BY b.purchase_date ASC`,
      [id, type || 'Inventory']
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

