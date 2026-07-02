const db = require('../config/db');

exports.getTransactions = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.createTransaction = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { type, ref_no, ref_type, party_id, party_name, amount, mode, date, notes } = req.body;
    if (!type || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Type and positive amount are required' });
    }

    const value = parseFloat(amount);

    // 1. Insert Transaction Log
    const [result] = await conn.query(
      `INSERT INTO transactions (type, ref_no, ref_type, party_id, party_name, amount, mode, date, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        ref_no || null,
        ref_type || null,
        party_id || null,
        party_name || null,
        value,
        mode || 'Cash',
        date || new Date().toISOString().split('T')[0],
        notes || null
      ]
    );

    // 2. Adjust Client or Supplier balance if party_id is present
    if (party_id) {
      if (type === 'Receipt') {
        await conn.query(
          'UPDATE clients SET balance = balance - ? WHERE id = ?',
          [value, party_id]
        );
      } else if (type === 'Payment') {
        await conn.query(
          'UPDATE suppliers SET balance = balance - ? WHERE id = ?',
          [value, party_id]
        );
      }
    }

    await conn.commit();
    res.status(201).json({ success: true, id: result.insertId, message: 'Transaction logged successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.deleteTransaction = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;

    const [txns] = await conn.query('SELECT * FROM transactions WHERE id = ?', [id]);
    if (txns.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const txn = txns[0];
    const value = parseFloat(txn.amount);

    // Revert client/supplier balance adjustment if party_id is present
    if (txn.party_id) {
      if (txn.type === 'Receipt') {
        await conn.query(
          'UPDATE clients SET balance = balance + ? WHERE id = ?',
          [value, txn.party_id]
        );
      } else if (txn.type === 'Payment') {
        await conn.query(
          'UPDATE suppliers SET balance = balance + ? WHERE id = ?',
          [value, txn.party_id]
        );
      }
    }

    await conn.query('DELETE FROM transactions WHERE id = ?', [id]);

    await conn.commit();
    res.json({ success: true, message: 'Transaction deleted successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.updateTransaction = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { type, ref_no, ref_type, party_id, party_name, amount, mode, date, notes } = req.body;

    if (!type || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Type and positive amount are required' });
    }

    const [txns] = await conn.query('SELECT * FROM transactions WHERE id = ?', [id]);
    if (txns.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const orig = txns[0];
    const origValue = parseFloat(orig.amount);

    // 1. Revert original balance adjustment
    if (orig.party_id) {
      if (orig.type === 'Receipt') {
        await conn.query(
          'UPDATE clients SET balance = balance + ? WHERE id = ?',
          [origValue, orig.party_id]
        );
      } else if (orig.type === 'Payment') {
        await conn.query(
          'UPDATE suppliers SET balance = balance + ? WHERE id = ?',
          [origValue, orig.party_id]
        );
      }
    }

    const newValue = parseFloat(amount);

    // 2. Update transaction
    await conn.query(
      `UPDATE transactions 
       SET type = ?, ref_no = ?, ref_type = ?, party_id = ?, party_name = ?, amount = ?, mode = ?, date = ?, notes = ? 
       WHERE id = ?`,
      [
        type,
        ref_no || null,
        ref_type || null,
        party_id || null,
        party_name || null,
        newValue,
        mode || 'Cash',
        date || new Date().toISOString().split('T')[0],
        notes || null,
        id
      ]
    );

    // 3. Apply new balance adjustment
    if (party_id) {
      if (type === 'Receipt') {
        await conn.query(
          'UPDATE clients SET balance = balance - ? WHERE id = ?',
          [newValue, party_id]
        );
      } else if (type === 'Payment') {
        await conn.query(
          'UPDATE suppliers SET balance = balance - ? WHERE id = ?',
          [newValue, party_id]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, message: 'Transaction updated successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

