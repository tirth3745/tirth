const db = require('../config/db');

exports.getClients = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM clients ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getClientById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM clients WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.getClientStats = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Check orders and daily sales count
    const [ordersRow] = await db.query('SELECT COUNT(*) as cnt FROM orders WHERE client_id = ?', [id]);
    const [salesRow] = await db.query('SELECT COUNT(*) as cnt FROM daily_transactions WHERE client_id = ?', [id]);
    res.json({
      orders: ordersRow[0].cnt,
      sales: salesRow[0].cnt
    });
  } catch (err) {
    next(err);
  }
};

exports.createClient = async (req, res, next) => {
  try {
    const { name, type, contact, email, address, city, gst, credit_limit, balance } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Client name is required' });
    }
    const [result] = await db.query(
      `INSERT INTO clients (name, type, contact, email, address, city, gst, credit_limit, balance) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        type || 'Retailer',
        contact || null,
        email || null,
        address || null,
        city || null,
        gst || null,
        parseFloat(credit_limit) || 0.00,
        parseFloat(balance) || 0.00
      ]
    );
    res.status(201).json({ success: true, id: result.insertId, message: 'Client created successfully' });
  } catch (err) {
    next(err);
  }
};

exports.updateClient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, type, contact, email, address, city, gst, credit_limit, balance } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Client name is required' });
    }
    const [result] = await db.query(
      `UPDATE clients 
       SET name = ?, type = ?, contact = ?, email = ?, address = ?, city = ?, gst = ?, credit_limit = ?, balance = ?
       WHERE id = ?`,
      [
        name,
        type || 'Retailer',
        contact || null,
        email || null,
        address || null,
        city || null,
        gst || null,
        parseFloat(credit_limit) || 0.00,
        parseFloat(balance) || 0.00,
        id
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    res.json({ success: true, message: 'Client updated successfully' });
  } catch (err) {
    next(err);
  }
};

exports.deleteClient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM clients WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (err) {
    next(err);
  }
};
