const db = require('../config/db');

exports.getPurchases = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM purchases ORDER BY date DESC, id DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getPurchaseById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [purchases] = await db.query('SELECT * FROM purchases WHERE id = ?', [id]);
    if (purchases.length === 0) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }
    const [items] = await db.query('SELECT * FROM purchase_items WHERE purchase_id = ?', [id]);
    
    const purchase = purchases[0];
    purchase.items = items;
    res.json(purchase);
  } catch (err) {
    next(err);
  }
};

exports.getNextPurchaseNo = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM purchases');
    const nextId = rows[0].next_id;
    res.json({ purchase_no: `PUR-${String(nextId).padStart(4, '0')}` });
  } catch (err) {
    next(err);
  }
};

exports.createPurchase = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { invoice_no, supplier_id, supplier_name, date, due_date, status, total_amount, paid_amount, notes, items } = req.body;
    if (!supplier_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Supplier and line items are required' });
    }

    // 1. Generate Purchase No
    const [seqRows] = await conn.query('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM purchases');
    const nextId = seqRows[0].next_id;
    const purchaseNo = `PUR-${String(nextId).padStart(4, '0')}`;

    const total = parseFloat(total_amount) || 0.00;
    const paid = parseFloat(paid_amount) || 0.00;
    const pendingAmount = total - paid;

    // 2. Insert Purchase
    const [purResult] = await conn.query(
      `INSERT INTO purchases (purchase_no, invoice_no, supplier_id, supplier_name, date, due_date, status, total_amount, paid_amount, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        purchaseNo,
        invoice_no || null,
        supplier_id,
        supplier_name,
        date || new Date().toISOString().split('T')[0],
        due_date || null,
        status || 'Pending',
        total,
        paid,
        notes || null
      ]
    );

    const purchaseId = purResult.insertId;

    // 3. Process Line Items
    for (const item of items) {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const lineTotal = parseFloat(item.total) || (qty * price);

      // A. Insert Purchase Item
      await conn.query(
        `INSERT INTO purchase_items (purchase_id, item_id, item_name, item_type, quantity, unit_price, batch_no, expiry_date, total) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchaseId,
          item.item_id,
          item.item_name,
          item.item_type || 'Inventory',
          qty,
          price,
          item.batch_no || null,
          item.expiry_date || null,
          lineTotal
        ]
      );

      // B. Create Stock Batch (Only if status is 'Completed' or 'Pending' - in our system all purchases immediately add to stock)
      const [batchResult] = await conn.query(
        `INSERT INTO stock_batches (item_id, item_name, item_type, batch_no, purchase_id, supplier_id, purchase_date, purchase_price, initial_qty, current_qty, unit, expiry_date, warehouse) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Main Warehouse')`,
        [
          item.item_id,
          item.item_name,
          item.item_type || 'Inventory',
          item.batch_no || `B-${purchaseNo}`,
          purchaseId,
          supplier_id,
          date || new Date().toISOString().split('T')[0],
          price,
          qty,
          qty,
          item.unit || 'Nos',
          item.expiry_date || null
        ]
      );

      const batchId = batchResult.insertId;

      // C. Insert Stock Movement
      await conn.query(
        `INSERT INTO stock_movements (batch_id, txn_type, txn_id, qty) 
         VALUES (?, 'Purchase', ?, ?)`,
        [batchId, purchaseId, qty]
      );
    }

    // 4. Update Supplier Balance
    await conn.query(
      `UPDATE suppliers 
       SET balance = balance + ? 
       WHERE id = ?`,
      [pendingAmount, supplier_id]
    );

    // 5. Create Payment Transaction if paid > 0
    if (paid > 0) {
      await conn.query(
        `INSERT INTO transactions (type, ref_no, ref_type, party_id, party_name, amount, mode, date, notes) 
         VALUES ('Payment', ?, 'Purchase', ?, ?, ?, 'Cash', ?, ?)`,
        [
          `Purchase Ref: ${purchaseNo}`,
          supplier_id,
          supplier_name,
          paid,
          date || new Date().toISOString().split('T')[0],
          `Payment for purchase ${purchaseNo}`
        ]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, id: purchaseId, purchase_no: purchaseNo, message: 'Purchase registered successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.deletePurchase = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;

    // 1. Fetch Purchase to get supplier information and details
    const [purchases] = await conn.query('SELECT * FROM purchases WHERE id = ?', [id]);
    if (purchases.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }
    const purchase = purchases[0];
    const pendingAmount = parseFloat(purchase.total_amount) - parseFloat(purchase.paid_amount);

    // 2. Delete payments associated with this purchase from ledger
    await conn.query(
      `DELETE FROM transactions 
       WHERE type = 'Payment' AND ref_type = 'Purchase' AND ref_no LIKE ?`,
      [`%${purchase.purchase_no}%`]
    );

    // 3. Revert Supplier Balance
    if (purchase.supplier_id) {
      await conn.query(
        `UPDATE suppliers 
         SET balance = balance - ? 
         WHERE id = ?`,
        [pendingAmount, purchase.supplier_id]
      );
    }

    // 4. Delete Stock Movements and Stock Batches (Cascades automatically on stock_movements)
    await conn.query('DELETE FROM stock_batches WHERE purchase_id = ?', [id]);

    // 5. Delete Purchase Items (Cascades automatically on DB due to FOREIGN KEY delete cascade)
    await conn.query('DELETE FROM purchases WHERE id = ?', [id]);

    await conn.commit();
    res.json({ success: true, message: 'Purchase deleted and inventory reverted successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.updatePurchase = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { invoice_no, supplier_id, supplier_name, date, due_date, status, total_amount, paid_amount, notes, items } = req.body;

    const [original] = await conn.query('SELECT * FROM purchases WHERE id = ?', [id]);
    if (original.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }
    const orig = original[0];
    const origPending = parseFloat(orig.total_amount) - parseFloat(orig.paid_amount);

    if (orig.supplier_id) {
      await conn.query(
        'UPDATE suppliers SET balance = balance - ? WHERE id = ?',
        [origPending, orig.supplier_id]
      );
    }

    await conn.query(
      "DELETE FROM transactions WHERE type = 'Payment' AND ref_type = 'Purchase' AND ref_no LIKE ?",
      [`%${orig.purchase_no}%`]
    );
    await conn.query('DELETE FROM stock_batches WHERE purchase_id = ?', [id]);
    await conn.query('DELETE FROM purchase_items WHERE purchase_id = ?', [id]);

    const total = parseFloat(total_amount) || 0.00;
    const paid = parseFloat(paid_amount) || 0.00;
    const pendingAmount = total - paid;

    await conn.query(
      `UPDATE purchases 
       SET invoice_no = ?, supplier_id = ?, supplier_name = ?, date = ?, due_date = ?, status = ?, total_amount = ?, paid_amount = ?, notes = ? 
       WHERE id = ?`,
      [
        invoice_no || null,
        supplier_id,
        supplier_name,
        date || new Date().toISOString().split('T')[0],
        due_date || null,
        status || 'Pending',
        total,
        paid,
        notes || null,
        id
      ]
    );

    for (const item of items) {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const lineTotal = parseFloat(item.total) || (qty * price);

      await conn.query(
        `INSERT INTO purchase_items (purchase_id, item_id, item_name, item_type, quantity, unit_price, batch_no, expiry_date, total) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          item.item_id,
          item.item_name,
          item.item_type || 'Inventory',
          qty,
          price,
          item.batch_no || null,
          item.expiry_date || null,
          lineTotal
        ]
      );

      const [batchResult] = await conn.query(
        `INSERT INTO stock_batches (item_id, item_name, item_type, batch_no, purchase_id, supplier_id, purchase_date, purchase_price, initial_qty, current_qty, unit, expiry_date, warehouse) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Main Warehouse')`,
        [
          item.item_id,
          item.item_name,
          item.item_type || 'Inventory',
          item.batch_no || `B-${orig.purchase_no}`,
          id,
          supplier_id,
          date || new Date().toISOString().split('T')[0],
          price,
          qty,
          qty,
          item.unit || 'Nos',
          item.expiry_date || null
        ]
      );

      const batchId = batchResult.insertId;

      await conn.query(
        `INSERT INTO stock_movements (batch_id, txn_type, txn_id, qty) 
         VALUES (?, 'Purchase', ?, ?)`,
        [batchId, id, qty]
      );
    }

    await conn.query(
      `UPDATE suppliers 
       SET balance = balance + ? 
       WHERE id = ?`,
      [pendingAmount, supplier_id]
    );

    if (paid > 0) {
      await conn.query(
        `INSERT INTO transactions (type, ref_no, ref_type, party_id, party_name, amount, mode, date, notes) 
         VALUES ('Payment', ?, 'Purchase', ?, ?, ?, 'Cash', ?, ?)`,
        [
          `Purchase Ref: ${orig.purchase_no}`,
          supplier_id,
          supplier_name,
          paid,
          date || new Date().toISOString().split('T')[0],
          `Payment for purchase ${orig.purchase_no}`
        ]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Purchase updated successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

