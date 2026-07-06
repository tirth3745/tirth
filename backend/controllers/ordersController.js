const db = require('../config/db');
const { deductStockFIFO, reverseStockDeductions } = require('../utils/stockHelper');

exports.getOrders = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM orders ORDER BY date DESC, id DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [orders] = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const [items] = await db.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    
    const order = orders[0];
    order.items = items;
    res.json(order);
  } catch (err) {
    next(err);
  }
};

exports.getNextOrderNo = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM orders');
    const nextId = rows[0].next_id;
    res.json({ order_no: `ORD-${String(nextId).padStart(4, '0')}` });
  } catch (err) {
    next(err);
  }
};

exports.createOrder = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { client_id, client_name, date, due_date, status, total_amount, paid_amount, discount, tax, notes, items } = req.body;
    if (!client_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Client and line items are required' });
    }

    // 1. Generate Order No
    const [seqRows] = await conn.query('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM orders');
    const nextId = seqRows[0].next_id;
    const orderNo = `ORD-${String(nextId).padStart(4, '0')}`;

    const total = parseFloat(total_amount) || 0.00;
    const paid = parseFloat(paid_amount) || 0.00;
    const pendingAmount = total - paid;

    // 2. Insert Order
    const [ordResult] = await conn.query(
      `INSERT INTO orders (order_no, client_id, client_name, date, due_date, status, total_amount, paid_amount, discount, tax, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNo,
        client_id,
        client_name,
        date || new Date().toISOString().split('T')[0],
        due_date || null,
        status || 'Delivered',
        total,
        paid,
        parseFloat(discount) || 0.00,
        parseFloat(tax) || 0.00,
        notes || null
      ]
    );

    const orderId = ordResult.insertId;

    // 3. Process Line Items and deduct finished goods stock via FIFO
    for (const item of items) {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const itemDisc = parseFloat(item.discount) || 0;
      const lineTotal = parseFloat(item.total) || ((qty * price) - itemDisc);

      // A. Insert Order Item
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, discount, total) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          qty,
          price,
          itemDisc,
          lineTotal
        ]
      );

      // B. Deduct Finished Goods Stock using FIFO
      // Only do stock deduction if status is not 'Cancelled'
      if (status !== 'Cancelled') {
        await deductStockFIFO(item.product_id, 'Catalog', qty, 'Sale', orderId, conn);
      }
    }

    // 4. Update Client Balance
    await conn.query(
      `UPDATE clients 
       SET balance = balance + ? 
       WHERE id = ?`,
      [pendingAmount, client_id]
    );

    // 5. Create Payment Transaction (Receipt) if paid > 0
    if (paid > 0) {
      await conn.query(
        `INSERT INTO transactions (type, ref_no, ref_type, party_id, party_name, amount, mode, date, notes) 
         VALUES ('Receipt', ?, 'Order', ?, ?, ?, 'Cash', ?, ?)`,
        [
          `Order Ref: ${orderNo}`,
          client_id,
          client_name,
          paid,
          date || new Date().toISOString().split('T')[0],
          `Payment for order ${orderNo}`
        ]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, id: orderId, order_no: orderNo, message: 'Order created and stock deducted successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.deleteOrder = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;

    // 1. Fetch Order details
    const [orders] = await conn.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (orders.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = orders[0];
    const pendingAmount = parseFloat(order.total_amount) - parseFloat(order.paid_amount);

    // 2. Delete payments associated with this order from ledger
    await conn.query(
      `DELETE FROM transactions 
       WHERE type = 'Receipt' AND ref_type = 'Order' AND ref_no LIKE ?`,
      [`%${order.order_no}%`]
    );

    // 3. Revert Client Balance
    if (order.client_id) {
      await conn.query(
        `UPDATE clients 
         SET balance = balance - ? 
         WHERE id = ?`,
        [pendingAmount, order.client_id]
      );
    }

    // 4. Restore Stock Deductions
    await reverseStockDeductions('Sale', id, conn);

    // 5. Delete Order (Cascades automatically on order_items due to DB constraint)
    await conn.query('DELETE FROM orders WHERE id = ?', [id]);

    await conn.commit();
    res.json({ success: true, message: 'Order deleted and finished stock restored successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.updateOrder = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { client_id, client_name, date, due_date, status, total_amount, paid_amount, discount, tax, notes, items } = req.body;

    const [original] = await conn.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (original.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const orig = original[0];
    const origPending = parseFloat(orig.total_amount) - parseFloat(orig.paid_amount);

    if (orig.client_id) {
      await conn.query(
        'UPDATE clients SET balance = balance - ? WHERE id = ?',
        [origPending, orig.client_id]
      );
    }

    await conn.query(
      `DELETE FROM transactions 
       WHERE type = 'Receipt' AND ref_type = 'Order' AND ref_no LIKE ?`,
      [`%${orig.order_no}%`]
    );

    await reverseStockDeductions('Sale', id, conn);
    await conn.query('DELETE FROM order_items WHERE order_id = ?', [id]);

    const total = parseFloat(total_amount) || 0.00;
    const paid = parseFloat(paid_amount) || 0.00;
    const pendingAmount = total - paid;

    await conn.query(
      `UPDATE orders 
       SET client_id = ?, client_name = ?, date = ?, due_date = ?, status = ?, total_amount = ?, paid_amount = ?, discount = ?, tax = ?, notes = ? 
       WHERE id = ?`,
      [
        client_id,
        client_name,
        date || new Date().toISOString().split('T')[0],
        due_date || null,
        status || 'Delivered',
        total,
        paid,
        parseFloat(discount) || 0.00,
        parseFloat(tax) || 0.00,
        notes || null,
        id
      ]
    );

    for (const item of items) {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const itemDisc = parseFloat(item.discount) || 0;
      const lineTotal = parseFloat(item.total) || ((qty * price) - itemDisc);

      await conn.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, discount, total) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          item.product_id,
          item.product_name,
          qty,
          price,
          itemDisc,
          lineTotal
        ]
      );

      if (status !== 'Cancelled') {
        await deductStockFIFO(item.product_id, 'Catalog', qty, 'Sale', id, conn);
      }
    }

    await conn.query(
      `UPDATE clients 
       SET balance = balance + ? 
       WHERE id = ?`,
      [pendingAmount, client_id]
    );

    if (paid > 0) {
      await conn.query(
        `INSERT INTO transactions (type, ref_no, ref_type, party_id, party_name, amount, mode, date, notes) 
         VALUES ('Receipt', ?, 'Order', ?, ?, ?, 'Cash', ?, ?)`,
        [
          `Order Ref: ${orig.order_no}`,
          client_id,
          client_name,
          paid,
          date || new Date().toISOString().split('T')[0],
          `Payment for order ${orig.order_no}`
        ]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Order updated successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

async function syncOrderToInvoice(conn, orderId, isDelete = false) {
  try {
    // If delete
    if (isDelete) {
      // Find the order number first
      const [ordRows] = await conn.query('SELECT order_no FROM orders WHERE id = ?', [orderId]);
      if (ordRows.length > 0) {
        const orderNo = ordRows[0].order_no;
        const strippedNo = orderNo.startsWith('INV-') ? orderNo.substring(4) : orderNo;
        await conn.query(
          'DELETE FROM invoices WHERE UniqueID = ? OR InvoiceNumber = ? OR UniqueID = ? OR InvoiceNumber = ?',
          [orderNo, orderNo, strippedNo, strippedNo]
        );
      }
      return;
    }

    // Load order
    const [ordRows] = await conn.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (ordRows.length === 0) return;
    const order = ordRows[0];

    // Load client info
    let clientAddress = '';
    let clientPhone = '';
    let clientGSTIN = '';
    if (order.client_id) {
      const [cRows] = await conn.query('SELECT address, contact, gst FROM clients WHERE id = ?', [order.client_id]);
      if (cRows.length > 0) {
        clientAddress = cRows[0].address || '';
        clientPhone = cRows[0].contact || '';
        clientGSTIN = cRows[0].gst || '';
      }
    }

    // Load order items
    const [itemRows] = await conn.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    // Build productRows for ItemsJSON
    const productRows = itemRows.map(it => ({
      id: String(it.product_id),
      brand: '',
      name: it.product_name,
      desc: '',
      qty: parseFloat(it.quantity) || 0,
      price: parseFloat(it.unit_price) || 0,
      total: parseFloat(it.total) || 0,
      hsn: '',
      gstRate: 0
    }));

    const subtotal = parseFloat(order.total_amount) || 0;
    const dueAmount = subtotal - (parseFloat(order.paid_amount) || 0);

    const strippedNo = order.order_no.startsWith('INV-') ? order.order_no.substring(4) : order.order_no;
    const [existing] = await conn.query(
      'SELECT UniqueID FROM invoices WHERE UniqueID = ? OR InvoiceNumber = ? OR UniqueID = ? OR InvoiceNumber = ?',
      [order.order_no, order.order_no, strippedNo, strippedNo]
    );

    let targetUniqueId = order.order_no;
    let targetInvoiceNo = strippedNo;
    if (existing.length > 0) {
      targetUniqueId = existing[0].UniqueID;
    }

    const inv = {
      InvoiceNumber: targetInvoiceNo,
      UniqueID: targetUniqueId,
      InvoiceType: 'Non-GST',
      Date: order.date,
      DueDate: order.due_date || '',
      ClientName: order.client_name,
      ClientAddress: clientAddress,
      ClientPhone: clientPhone,
      ClientGSTIN: clientGSTIN,
      Subtotal: subtotal,
      TaxableAmount: subtotal,
      Tax: parseFloat(order.tax) || 0,
      CGST: 0,
      SGST: 0,
      IGST: 0,
      TotalTax: parseFloat(order.tax) || 0,
      GrandTotal: subtotal,
      DueAmount: dueAmount,
      NonGstTaxType: '',
      CompanyName: 'AgroChem',
      FromAddress: 'Survey No.207/1, Nr. Balaji Agro, Shapar, Rajkot, Gujarat - 360024',
      FromPhone: '9664675227',
      FromEmail: 'skagro3105@gmail.com',
      FromGSTIN: '24AERFS1718Q1ZB',
      Signatory: 'Authorized Signatory',
      rows: productRows,
      calculations: {
        subtotal: subtotal,
        totalTax: parseFloat(order.tax) || 0,
        grandTotal: subtotal,
        dueAmount: dueAmount
      }
    };

    const itemsJSON = JSON.stringify(inv);
    const lastUpdated = new Date().toISOString();

    const dbParams = [
      targetInvoiceNo,
      'Non-GST',
      order.date,
      order.due_date || '',
      order.client_name,
      clientAddress,
      clientPhone,
      clientGSTIN,
      'Gujarat',
      '24',
      'Gujarat',
      subtotal,
      subtotal,
      parseFloat(order.tax) || 0,
      0, 0, 0,
      parseFloat(order.tax) || 0,
      subtotal,
      dueAmount,
      '',
      'AgroChem',
      'Survey No.207/1, Nr. Balaji Agro, Shapar, Rajkot, Gujarat - 360024',
      '9664675227',
      'skagro3105@gmail.com',
      '24AERFS1718Q1ZB',
      'Authorized Signatory',
      '', '', '', '', '', '',
      itemsJSON,
      lastUpdated,
      targetUniqueId
    ];

    if (existing.length > 0) {
      await conn.query(
        `UPDATE invoices SET 
          InvoiceNumber = ?, InvoiceType = ?, Date = ?, DueDate = ?, ClientName = ?, ClientAddress = ?, 
          ClientPhone = ?, ClientGSTIN = ?, ClientState = ?, ClientStateCode = ?, PlaceOfSupply = ?, 
          Subtotal = ?, TaxableAmount = ?, Tax = ?, CGST = ?, SGST = ?, IGST = ?, TotalTax = ?, 
          GrandTotal = ?, DueAmount = ?, NonGstTaxType = ?, CompanyName = ?, FromAddress = ?, 
          FromPhone = ?, FromEmail = ?, FromGSTIN = ?, Signatory = ?, BankName = ?, BankAcc = ?, 
          BankIFSC = ?, UPI = ?, Intro = ?, Terms = ?, ItemsJSON = ?, LastUpdated = ? 
         WHERE UniqueID = ?`,
        dbParams
      );
    } else {
      await conn.query(
        `INSERT INTO invoices (
          InvoiceNumber, InvoiceType, Date, DueDate, ClientName, ClientAddress, 
          ClientPhone, ClientGSTIN, ClientState, ClientStateCode, PlaceOfSupply, 
          Subtotal, TaxableAmount, Tax, CGST, SGST, IGST, TotalTax, 
          GrandTotal, DueAmount, NonGstTaxType, CompanyName, FromAddress, 
          FromPhone, FromEmail, FromGSTIN, Signatory, BankName, BankAcc, 
          BankIFSC, UPI, Intro, Terms, ItemsJSON, LastUpdated, UniqueID
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        dbParams
      );
    }
  } catch (err) {
    console.error('Error syncing order to invoice:', err);
  }
}

