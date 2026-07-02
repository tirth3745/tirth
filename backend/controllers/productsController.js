const db = require('../config/db');

exports.getProducts = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM products ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [products] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const [packaging] = await db.query('SELECT * FROM product_packaging WHERE product_id = ?', [id]);
    const [stockRow] = await db.query('SELECT COALESCE(SUM(current_qty), 0) as stock FROM stock_batches WHERE item_id = ? AND item_type = "Catalog"', [id]);
    
    // Format response to match product structure with options
    const product = products[0];
    product.packaging_options = packaging;
    product.stock = parseFloat(stockRow[0].stock || 0);
    
    res.json(product);
  } catch (err) {
    next(err);
  }
};

exports.getAllPackaging = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT pk.*, p.name as product_name, p.unit as product_unit 
      FROM product_packaging pk
      JOIN products p ON pk.product_id = p.id
      ORDER BY p.name, pk.packaging_size
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.createProduct = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { name, batch_no, brand, category, composition, unit, purchase_price, sell_price, gst, description, packaging_options } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Product name is required' });
    }

    const [prodResult] = await conn.query(
      `INSERT INTO products (name, batch_no, brand, category, composition, unit, purchase_price, sell_price, gst, description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        batch_no || null,
        brand || null,
        category || null,
        composition || null,
        unit || 'Kg',
        parseFloat(purchase_price) || 0.00,
        parseFloat(sell_price) || 0.00,
        gst || '',
        description || null
      ]
    );

    const productId = prodResult.insertId;

    // Add packaging options if provided
    if (Array.isArray(packaging_options) && packaging_options.length > 0) {
      for (const opt of packaging_options) {
        if (opt.packaging_size) {
          await conn.query(
            `INSERT INTO product_packaging (product_id, packaging_size, purchase_price, sell_price) 
             VALUES (?, ?, ?, ?)`,
            [
              productId,
              opt.packaging_size,
              parseFloat(opt.purchase_price) || 0.00,
              parseFloat(opt.sell_price) || 0.00
            ]
          );
        }
      }
    }

    await conn.commit();
    res.status(201).json({ success: true, id: productId, message: 'Product created successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.updateProduct = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const { name, batch_no, brand, category, composition, unit, purchase_price, sell_price, gst, description, packaging_options } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Product name is required' });
    }

    const [prodUpdate] = await conn.query(
      `UPDATE products 
       SET name = ?, batch_no = ?, brand = ?, category = ?, composition = ?, unit = ?, purchase_price = ?, sell_price = ?, gst = ?, description = ?
       WHERE id = ?`,
      [
        name,
        batch_no || null,
        brand || null,
        category || null,
        composition || null,
        unit || 'Kg',
        parseFloat(purchase_price) || 0.00,
        parseFloat(sell_price) || 0.00,
        gst || '',
        description || null,
        id
      ]
    );

    if (prodUpdate.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Delete existing packaging options
    await conn.query('DELETE FROM product_packaging WHERE product_id = ?', [id]);

    // Insert updated packaging options
    if (Array.isArray(packaging_options) && packaging_options.length > 0) {
      for (const opt of packaging_options) {
        if (opt.packaging_size) {
          await conn.query(
            `INSERT INTO product_packaging (product_id, packaging_size, purchase_price, sell_price) 
             VALUES (?, ?, ?, ?)`,
            [
              id,
              opt.packaging_size,
              parseFloat(opt.purchase_price) || 0.00,
              parseFloat(opt.sell_price) || 0.00
            ]
          );
        }
      }
    }

    await conn.commit();
    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Foreign key constraint triggers ON DELETE CASCADE for product_packaging automatically
    const [result] = await db.query('DELETE FROM products WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    next(err);
  }
};

exports.deletePackagingOption = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM product_packaging WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Packaging option not found' });
    }
    res.json({ success: true, message: 'Packaging option deleted successfully' });
  } catch (err) {
    next(err);
  }
};
