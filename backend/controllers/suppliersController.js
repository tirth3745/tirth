const db = require('../config/db');

exports.getSuppliers = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM suppliers ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getSupplierById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM suppliers WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.getSupplierStats = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [purchasesRow] = await db.query('SELECT COUNT(*) as cnt FROM purchases WHERE supplier_id = ?', [id]);
    const [batchesRow] = await db.query('SELECT COUNT(*) as cnt FROM stock_batches WHERE supplier_id = ? AND item_type = "Inventory"', [id]);
    res.json({
      purchases: purchasesRow[0].cnt,
      batches: batchesRow[0].cnt
    });
  } catch (err) {
    next(err);
  }
};

exports.createSupplier = async (req, res, next) => {
  try {
    const { name, company_name, contact, email, address, city, gst, category, payment_terms, balance } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Supplier name is required' });
    }
    const [result] = await db.query(
      `INSERT INTO suppliers (name, company_name, contact, email, address, city, gst, category, payment_terms, balance, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
      [
        name,
        company_name || null,
        contact || null,
        email || null,
        address || null,
        city || null,
        gst || null,
        category || null,
        parseInt(payment_terms) || 30,
        parseFloat(balance) || 0.00
      ]
    );
    res.status(201).json({ success: true, id: result.insertId, message: 'Supplier created successfully' });
  } catch (err) {
    next(err);
  }
};

exports.updateSupplier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, company_name, contact, email, address, city, gst, category, payment_terms, balance, status } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Supplier name is required' });
    }
    const [result] = await db.query(
      `UPDATE suppliers 
       SET name = ?, company_name = ?, contact = ?, email = ?, address = ?, city = ?, gst = ?, category = ?, payment_terms = ?, balance = ?, status = ?
       WHERE id = ?`,
      [
        name,
        company_name || null,
        contact || null,
        email || null,
        address || null,
        city || null,
        gst || null,
        category || null,
        parseInt(payment_terms) || 30,
        parseFloat(balance) || 0.00,
        status || 'Active',
        id
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }
    res.json({ success: true, message: 'Supplier updated successfully' });
  } catch (err) {
    next(err);
  }
};

exports.deleteSupplier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM suppliers WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }
    res.json({ success: true, message: 'Supplier deleted successfully' });
  } catch (err) {
    next(err);
  }
};
