const db = require('../config/db');
const { deductStockFIFO, reverseStockDeductions } = require('../utils/stockHelper');

const ROUND_DECIMALS = 4;
const ROUND_TOLERANCE = 0.0001;
let schemaReadyPromise = null;

function roundTo(value, decimals = ROUND_DECIMALS) {
  const factor = 10 ** decimals;
  return Math.round(((parseFloat(value) || 0) + Number.EPSILON) * factor) / factor;
}

function parseNumber(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isNearlyEqual(left, right, tolerance = ROUND_TOLERANCE) {
  return Math.abs(parseNumber(left) - parseNumber(right)) <= tolerance;
}

async function ensureFormulationSchema(executor = db) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const requiredColumns = {
        formulations: [
          ['total_percentage', 'DOUBLE DEFAULT 0.0'],
          ['total_quantity', 'DOUBLE DEFAULT 0.0'],
          ['total_cost', 'DOUBLE DEFAULT 0.0'],
          ['cost_per_unit', 'DOUBLE DEFAULT 0.0'],
          ['created_by', 'VARCHAR(255) NULL']
        ],
        formulation_ingredients: [
          ['percentage', 'DOUBLE DEFAULT 0.0'],
          ['cost_per_unit', 'DOUBLE DEFAULT 0.0'],
          ['total_cost', 'DOUBLE DEFAULT 0.0'],
          ['entry_mode', "VARCHAR(20) DEFAULT 'percentage'"]
        ]
      };

      for (const [tableName, columns] of Object.entries(requiredColumns)) {
        for (const [columnName, definition] of columns) {
          const [existing] = await executor.query(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [tableName, columnName]
          );

          if (existing.length === 0) {
            await executor.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
          }
        }
      }
    })().catch(err => {
      schemaReadyPromise = null;
      throw err;
    });
  }

  return schemaReadyPromise;
}

function validateFormulationPayload(body) {
  const productId = parseInt(body.product_id, 10);
  const productName = String(body.product_name || '').trim();
  const batchNo = String(body.batch_no || '').trim();
  const batchSize = roundTo(parseNumber(body.batch_size));
  const batchUnit = String(body.batch_unit || 'L').trim() || 'L';
  const status = String(body.status || 'Draft').trim() || 'Draft';
  const notes = body.notes ?? null;
  const createdBy = body.created_by ? String(body.created_by).trim() : null;
  const rawIngredients = Array.isArray(body.ingredients) ? body.ingredients : [];

  if (!productId) {
    return { ok: false, message: 'Product is required.' };
  }

  if (!productName) {
    return { ok: false, message: 'Product name is required.' };
  }

  if (!batchNo) {
    return { ok: false, message: 'Batch number is required.' };
  }

  if (batchSize <= 0) {
    return { ok: false, message: 'Batch size must be greater than zero.' };
  }

  if (rawIngredients.length < 2) {
    return { ok: false, message: 'At least 2 ingredients are required.' };
  }

  const duplicateCheck = new Set();
  const duplicates = new Set();
  const ingredients = [];

  for (let index = 0; index < rawIngredients.length; index += 1) {
    const ingredient = rawIngredients[index] || {};
    const ingredientId = parseInt(ingredient.product_id, 10);
    const ingredientName = String(ingredient.product_name || '').trim();
    const percentage = roundTo(parseNumber(ingredient.percentage));
    const quantity = roundTo(parseNumber(ingredient.quantity));
    const unit = String(ingredient.unit || batchUnit).trim() || batchUnit;
    const costPerUnit = roundTo(parseNumber(ingredient.cost_per_unit));
    const totalCost = roundTo(parseNumber(ingredient.total_cost || (quantity * costPerUnit)));
    const entryMode = ingredient.entry_mode === 'quantity' ? 'quantity' : 'percentage';

    if (!ingredientId || !ingredientName) {
      return { ok: false, message: `Ingredient name is required for row ${index + 1}.` };
    }

    if (percentage < 0 || quantity < 0 || costPerUnit < 0 || totalCost < 0) {
      return { ok: false, message: `Negative values are not allowed for ingredient row ${index + 1}.` };
    }

    const duplicateKey = ingredientName.toLowerCase();
    if (duplicateCheck.has(duplicateKey)) duplicates.add(ingredientName);
    duplicateCheck.add(duplicateKey);

    ingredients.push({
      product_id: ingredientId,
      product_name: ingredientName,
      percentage,
      quantity,
      unit,
      cost_per_unit: costPerUnit,
      total_cost: totalCost,
      entry_mode: entryMode
    });
  }

  const totalPercentage = roundTo(ingredients.reduce((sum, ingredient) => sum + ingredient.percentage, 0));
  const totalQuantity = roundTo(ingredients.reduce((sum, ingredient) => sum + ingredient.quantity, 0));
  const totalCost = roundTo(
    parseNumber(body.total_cost) || ingredients.reduce((sum, ingredient) => sum + ingredient.total_cost, 0)
  );
  const costPerUnit = roundTo(parseNumber(body.cost_per_unit) || (batchSize > 0 ? totalCost / batchSize : 0));

  if (totalPercentage > 100 + ROUND_TOLERANCE) {
    return { ok: false, message: 'Total percentage cannot exceed 100%.' };
  }

  if (totalQuantity > batchSize + ROUND_TOLERANCE) {
    return { ok: false, message: 'Total quantity cannot exceed batch size.' };
  }

  if (!isNearlyEqual(totalPercentage, 100) && !isNearlyEqual(totalQuantity, batchSize)) {
    return { ok: false, message: 'Total percentage must equal 100% or total quantity must equal the batch size.' };
  }

  return {
    ok: true,
    data: {
      product_id: productId,
      product_name: productName,
      batch_no: batchNo,
      batch_size: batchSize,
      batch_unit: batchUnit,
      date: body.date || new Date().toISOString().split('T')[0],
      status,
      notes,
      created_by: createdBy,
      ingredients,
      total_percentage: totalPercentage,
      total_quantity: totalQuantity,
      total_cost: totalCost,
      cost_per_unit: costPerUnit,
      warnings: duplicates.size ? [`Duplicate ingredients selected: ${Array.from(duplicates).join(', ')}`] : []
    }
  };
}

exports.getFormulations = async (req, res, next) => {
  try {
    await ensureFormulationSchema();
    const [rows] = await db.query('SELECT * FROM formulations ORDER BY date DESC, id DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getFormulationById = async (req, res, next) => {
  try {
    await ensureFormulationSchema();
    const { id } = req.params;
    const [formulations] = await db.query('SELECT * FROM formulations WHERE id = ?', [id]);
    if (formulations.length === 0) {
      return res.status(404).json({ success: false, message: 'Formulation not found' });
    }

    const [ingredients] = await db.query(
      'SELECT * FROM formulation_ingredients WHERE formulation_id = ? ORDER BY id ASC',
      [id]
    );

    const formulation = formulations[0];
    formulation.ingredients = ingredients;
    res.json(formulation);
  } catch (err) {
    next(err);
  }
};

exports.createFormulation = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await ensureFormulationSchema(conn);
    await conn.beginTransaction();

    const validation = validateFormulationPayload(req.body);
    if (!validation.ok) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: validation.message });
    }

    const payload = validation.data;
    const [formResult] = await conn.query(
      `INSERT INTO formulations
       (product_id, product_name, batch_no, batch_size, batch_unit, date, status, notes, total_percentage, total_quantity, total_cost, cost_per_unit, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.product_id,
        payload.product_name,
        payload.batch_no,
        payload.batch_size,
        payload.batch_unit,
        payload.date,
        payload.status,
        payload.notes,
        payload.total_percentage,
        payload.total_quantity,
        payload.total_cost,
        payload.cost_per_unit,
        payload.created_by
      ]
    );

    const formulationId = formResult.insertId;

    for (const ingredient of payload.ingredients) {
      await conn.query(
        `INSERT INTO formulation_ingredients
         (formulation_id, product_id, product_name, quantity, unit, percentage, cost_per_unit, total_cost, entry_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          formulationId,
          ingredient.product_id,
          ingredient.product_name,
          ingredient.quantity,
          ingredient.unit,
          ingredient.percentage,
          ingredient.cost_per_unit,
          ingredient.total_cost,
          ingredient.entry_mode
        ]
      );
    }

    if (payload.status === 'Completed') {
      await executeFormulationStockMovement(
        formulationId,
        payload.product_id,
        payload.product_name,
        payload.batch_no,
        payload.batch_size,
        payload.batch_unit,
        payload.date,
        payload.ingredients,
        conn
      );
    }

    await conn.commit();
    res.status(201).json({
      success: true,
      id: formulationId,
      message: 'Formulation created successfully',
      warnings: payload.warnings
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.updateFormulation = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await ensureFormulationSchema(conn);
    await conn.beginTransaction();

    const { id } = req.params;
    const validation = validateFormulationPayload(req.body);
    if (!validation.ok) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: validation.message });
    }

    const payload = validation.data;
    const [previousRows] = await conn.query('SELECT * FROM formulations WHERE id = ?', [id]);
    if (previousRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Formulation not found' });
    }

    const previous = previousRows[0];
    if (previous.status === 'Completed') {
      await revertFormulationStockMovement(id, previous.product_id, previous.batch_no, conn);
    }

    await conn.query('DELETE FROM formulation_ingredients WHERE formulation_id = ?', [id]);

    await conn.query(
      `UPDATE formulations
       SET product_id = ?, product_name = ?, batch_no = ?, batch_size = ?, batch_unit = ?, date = ?, status = ?, notes = ?,
           total_percentage = ?, total_quantity = ?, total_cost = ?, cost_per_unit = ?, created_by = ?
       WHERE id = ?`,
      [
        payload.product_id,
        payload.product_name,
        payload.batch_no,
        payload.batch_size,
        payload.batch_unit,
        payload.date,
        payload.status,
        payload.notes,
        payload.total_percentage,
        payload.total_quantity,
        payload.total_cost,
        payload.cost_per_unit,
        payload.created_by,
        id
      ]
    );

    for (const ingredient of payload.ingredients) {
      await conn.query(
        `INSERT INTO formulation_ingredients
         (formulation_id, product_id, product_name, quantity, unit, percentage, cost_per_unit, total_cost, entry_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          ingredient.product_id,
          ingredient.product_name,
          ingredient.quantity,
          ingredient.unit,
          ingredient.percentage,
          ingredient.cost_per_unit,
          ingredient.total_cost,
          ingredient.entry_mode
        ]
      );
    }

    if (payload.status === 'Completed') {
      await executeFormulationStockMovement(
        id,
        payload.product_id,
        payload.product_name,
        payload.batch_no,
        payload.batch_size,
        payload.batch_unit,
        payload.date,
        payload.ingredients,
        conn
      );
    }

    await conn.commit();
    res.json({
      success: true,
      message: 'Formulation updated successfully',
      warnings: payload.warnings
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.deleteFormulation = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await ensureFormulationSchema(conn);
    await conn.beginTransaction();

    const { id } = req.params;
    const [forms] = await conn.query('SELECT * FROM formulations WHERE id = ?', [id]);
    if (forms.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Formulation not found' });
    }

    const form = forms[0];
    if (form.status === 'Completed') {
      await revertFormulationStockMovement(id, form.product_id, form.batch_no, conn);
    }

    await conn.query('DELETE FROM formulations WHERE id = ?', [id]);

    await conn.commit();
    res.json({ success: true, message: 'Formulation deleted and stocks reverted successfully' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

async function executeFormulationStockMovement(formulationId, productId, productName, batchNo, size, unit, date, ingredients, conn) {
  let totalMaterialCost = 0;

  for (const ingredient of ingredients) {
    const qty = parseNumber(ingredient.quantity);
    if (qty <= 0) continue;

    const [priceRows] = await conn.query(
      `SELECT COALESCE(AVG(purchase_price), 0) AS avg_price
       FROM stock_batches
       WHERE item_id = ? AND item_type = 'Inventory' AND current_qty > 0`,
      [ingredient.product_id]
    );

    const avgPrice = parseNumber(priceRows[0]?.avg_price);
    totalMaterialCost += qty * avgPrice;

    await deductStockFIFO(ingredient.product_id, 'Inventory', qty, 'Manufacturing_Raw', formulationId, conn);
  }

  const computedUnitCost = size > 0 ? (totalMaterialCost / size) : 0;
  const [batchResult] = await conn.query(
    `INSERT INTO stock_batches
     (item_id, item_name, item_type, batch_no, purchase_id, supplier_id, purchase_date, purchase_price, initial_qty, current_qty, unit, expiry_date, warehouse)
     VALUES (?, ?, 'Catalog', ?, NULL, NULL, ?, ?, ?, ?, ?, NULL, 'Finished Goods Yard')`,
    [
      productId,
      productName,
      batchNo,
      date || new Date().toISOString().split('T')[0],
      computedUnitCost,
      size,
      size,
      unit
    ]
  );

  await conn.query(
    `INSERT INTO stock_movements (batch_id, txn_type, txn_id, qty)
     VALUES (?, 'Manufacturing', ?, ?)`,
    [batchResult.insertId, formulationId, size]
  );
}

async function revertFormulationStockMovement(formulationId, productId, batchNo, conn) {
  await reverseStockDeductions('Manufacturing_Raw', formulationId, conn);

  await conn.query(
    `DELETE FROM stock_batches
     WHERE item_id = ? AND item_type = 'Catalog' AND batch_no = ?`,
    [productId, batchNo]
  );
}
