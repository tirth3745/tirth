const db = require('../config/db');
const { deductStockFIFO, reverseStockDeductions } = require('../utils/stockHelper');

function normalizeUnit(unit) {
  if (!unit) return '';
  const normalized = String(unit || '').trim().toLowerCase();
  if (['l', 'ltr', 'liter', 'litre', 'litres', 'liters'].includes(normalized)) return 'litre';
  if (['ml', 'milliliter', 'millilitre', 'milliliters', 'millilitres'].includes(normalized)) return 'ml';
  if (['kg', 'kilogram', 'kilograms'].includes(normalized)) return 'kg';
  if (['g', 'gram', 'grams'].includes(normalized)) return 'gram';
  if (['nos', 'no', 'pcs', 'pieces'].includes(normalized)) return 'nos';
  return normalized;
}

function convertUnit(qty, fromUnit, toUnit) {
  if (!fromUnit || !toUnit) return qty;
  const f = normalizeUnit(fromUnit);
  const t = normalizeUnit(toUnit);
  if (f === t) return qty;

  if (f === 'ml' && t === 'litre') return qty / 1000.0;
  if (f === 'litre' && t === 'ml') return qty * 1000.0;
  if (f === 'gram' && t === 'kg') return qty / 1000.0;
  if (f === 'kg' && t === 'gram') return qty * 1000.0;
  return qty;
}

function normalizeDate(dateValue) {
  return String(dateValue || new Date().toISOString().slice(0, 10)).substring(0, 10);
}

function sanitizeMaterials(materials) {
  if (!Array.isArray(materials)) return [];
  return materials
    .map(item => ({
      item_id: parseInt(item.item_id, 10),
      item_name: String(item.item_name || '').trim(),
      item_type: String(item.item_type || '').trim(),
      quantity: parseFloat(item.quantity) || 0,
      unit: String(item.unit || '').trim()
    }))
    .filter(item => item.item_id && item.item_name && item.quantity > 0 && item.unit);
}

function buildMaterialSummary(materials) {
  if (!materials.length) return 'No materials recorded';
  return materials
    .slice(0, 3)
    .map(item => `${item.item_name} (${item.quantity} ${item.unit})`)
    .join(', ') + (materials.length > 3 ? ` +${materials.length - 3} more` : '');
}

exports.getDailyTxns = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT
        t.*,
        COALESCE(t.material_summary, t.item_summary) AS material_summary,
        COALESCE(t.material_count, 0) AS material_count,
        COALESCE(SUM(m.quantity), 0) AS total_material_qty
      FROM daily_transactions t
      LEFT JOIN daily_transaction_materials m ON m.daily_transaction_id = t.id
      GROUP BY t.id
      ORDER BY t.date DESC, t.id DESC
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getDailyTxnById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [txns] = await db.query('SELECT * FROM daily_transactions WHERE id = ?', [id]);
    if (txns.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    const [materials] = await db.query('SELECT * FROM daily_transaction_materials WHERE daily_transaction_id = ? ORDER BY id ASC', [id]);

    const txn = txns[0];
    txn.items = [];
    txn.materials = materials;
    res.json(txn);
  } catch (err) {
    next(err);
  }
};

exports.getNextDailyTxnNo = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM daily_transactions');
    const nextId = rows[0].next_id;
    res.json({ txn_no: `DLY-${String(nextId).padStart(4, '0')}` });
  } catch (err) {
    next(err);
  }
};

exports.createDailyTxn = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const date = normalizeDate(req.body.date);
    const notes = req.body.notes || '';
    const materials = sanitizeMaterials(req.body.materials_used);
    if (!materials.length) {
      return res.status(400).json({ success: false, message: 'At least one material with positive quantity is required' });
    }

    const [seqRows] = await conn.query('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM daily_transactions');
    const nextId = seqRows[0].next_id;
    const txnNo = `DLY-${String(nextId).padStart(4, '0')}`;

    const materialSummary = buildMaterialSummary(materials);

    const [txnResult] = await conn.query(
      `INSERT INTO daily_transactions (txn_no, date, client_id, total_amount, paid_amount, notes, item_summary, material_summary, material_count)
       VALUES (?, ?, NULL, 0, 0, ?, ?, ?, ?)`,
      [txnNo, date, notes, materialSummary, materialSummary, materials.length]
    );

    const txnId = txnResult.insertId;

    for (const material of materials) {
      const [itemRows] = await conn.query('SELECT name, category, unit FROM inventory_items WHERE id = ?', [material.item_id]);
      const item = itemRows[0];
      if (!item) {
        throw new Error(`Inventory item ${material.item_id} not found`);
      }

      const convertedQty = convertUnit(material.quantity, material.unit, item.unit || material.unit);
      await deductStockFIFO(material.item_id, 'Inventory', convertedQty, 'Sale_Raw', txnId, conn);

      await conn.query(
        `INSERT INTO daily_transaction_materials (daily_transaction_id, item_id, item_name, item_type, quantity, unit)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [txnId, material.item_id, item.name, item.category || material.item_type || 'Other', material.quantity, material.unit]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, id: txnId, txn_no: txnNo, message: 'Daily entry saved successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.updateDailyTxn = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const date = normalizeDate(req.body.date);
    const notes = req.body.notes || '';
    const materials = sanitizeMaterials(req.body.materials_used);
    if (!materials.length) {
      return res.status(400).json({ success: false, message: 'At least one material with positive quantity is required' });
    }

    await reverseStockDeductions('Sale', id, conn);
    await reverseStockDeductions('Sale_Raw', id, conn);
    await conn.query('DELETE FROM daily_transaction_materials WHERE daily_transaction_id = ?', [id]);
    await conn.query('DELETE FROM daily_transaction_items WHERE daily_transaction_id = ?', [id]);
    await conn.query('DELETE FROM transactions WHERE type="Receipt" AND ref_no = ?', [`Sale Ref: DLY-${id}`]);

    const materialSummary = buildMaterialSummary(materials);

    const [txnUpdate] = await conn.query(
      `UPDATE daily_transactions
       SET date = ?, client_id = NULL, total_amount = 0, paid_amount = 0, notes = ?, item_summary = ?, material_summary = ?, material_count = ?
       WHERE id = ?`,
      [date, notes, materialSummary, materialSummary, materials.length, id]
    );

    if (txnUpdate.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    for (const material of materials) {
      const [itemRows] = await conn.query('SELECT name, category, unit FROM inventory_items WHERE id = ?', [material.item_id]);
      const item = itemRows[0];
      if (!item) {
        throw new Error(`Inventory item ${material.item_id} not found`);
      }

      const convertedQty = convertUnit(material.quantity, material.unit, item.unit || material.unit);
      await deductStockFIFO(material.item_id, 'Inventory', convertedQty, 'Sale_Raw', id, conn);

      await conn.query(
        `INSERT INTO daily_transaction_materials (daily_transaction_id, item_id, item_name, item_type, quantity, unit)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, material.item_id, item.name, item.category || material.item_type || 'Other', material.quantity, material.unit]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Daily entry updated successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.deleteDailyTxn = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    await reverseStockDeductions('Sale', id, conn);
    await reverseStockDeductions('Sale_Raw', id, conn);
    await conn.query('DELETE FROM transactions WHERE type="Receipt" AND ref_no = ?', [`Sale Ref: DLY-${id}`]);

    const [result] = await conn.query('DELETE FROM daily_transactions WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    await conn.commit();
    res.json({ success: true, message: 'Daily entry deleted and stocks restored successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};
