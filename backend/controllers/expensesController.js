const db = require('../config/db');

exports.getExpenses = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM expenses ORDER BY date DESC, id DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.createExpense = async (req, res, next) => {
  try {
    const { category, amount, date, description, payment_mode, notes } = req.body;
    if (!category || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Category and positive amount are required' });
    }

    const [result] = await db.query(
      `INSERT INTO expenses (category, amount, date, description, payment_mode, notes) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        category,
        parseFloat(amount) || 0.00,
        date || new Date().toISOString().split('T')[0],
        description || null,
        payment_mode || 'Cash',
        notes || null
      ]
    );

    res.status(201).json({ success: true, id: result.insertId, message: 'Expense registered successfully' });
  } catch (err) {
    next(err);
  }
};

exports.updateExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, amount, date, description, payment_mode, notes } = req.body;
    if (!category || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Category and positive amount are required' });
    }

    const [result] = await db.query(
      `UPDATE expenses 
       SET category = ?, amount = ?, date = ?, description = ?, payment_mode = ?, notes = ? 
       WHERE id = ?`,
      [
        category,
        parseFloat(amount) || 0.00,
        date || new Date().toISOString().split('T')[0],
        description || null,
        payment_mode || 'Cash',
        notes || null,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.json({ success: true, message: 'Expense updated successfully' });
  } catch (err) {
    next(err);
  }
};

exports.deleteExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM expenses WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err) {
    next(err);
  }
};
