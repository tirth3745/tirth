const db = require('../config/db');

exports.getMasterOptions = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM master_options ORDER BY category, parent_value, value');
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.createMasterOption = async (req, res, next) => {
  try {
    const { category, value, parent_value } = req.body;
    if (!category || !value) {
      return res.status(400).json({ success: false, message: 'Category and value are required' });
    }

    const [result] = await db.query(
      `INSERT INTO master_options (category, value, parent_value) 
       VALUES (?, ?, ?)`,
      [category, value, parent_value || null]
    );

    res.status(201).json({ success: true, id: result.insertId, message: 'Master option created successfully' });
  } catch (err) {
    // Check for duplicate constraint
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'This option already exists' });
    }
    next(err);
  }
};

exports.updateMasterOption = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, value, parent_value } = req.body;
    if (!category || !value) {
      return res.status(400).json({ success: false, message: 'Category and value are required' });
    }

    const [result] = await db.query(
      `UPDATE master_options 
       SET category = ?, value = ?, parent_value = ? 
       WHERE id = ?`,
      [category, value, parent_value || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Master option not found' });
    }

    res.json({ success: true, message: 'Master option updated successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'This option already exists' });
    }
    next(err);
  }
};

exports.deleteMasterOption = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM master_options WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Master option not found' });
    }
    res.json({ success: true, message: 'Master option deleted successfully' });
  } catch (err) {
    next(err);
  }
};
