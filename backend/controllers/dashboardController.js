const db = require('../config/db');

exports.getDashboardStats = async (req, res, next) => {
  try {
    const [
      [orderRev],
      [dailyRev],
      [activeOrdersRow],
      [prodRow],
      [clientRow],
      [stockAlerts],
      [rawStockAlerts],
      [recentActivities],
      [categoryDistribution],
      [monthlyOrderSales],
      [monthlyDailySales]
    ] = await Promise.all([
      db.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = 'Delivered'"),
      db.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM daily_transactions"),
      db.query("SELECT COUNT(*) as count FROM orders WHERE status IN ('Pending', 'Processing')"),
      db.query("SELECT COUNT(*) as count FROM products"),
      db.query("SELECT COUNT(*) as count FROM clients"),
      db.query(`
        SELECT p.id, p.name, p.unit, p.reorder_level, COALESCE(SUM(b.current_qty), 0) as stock
        FROM products p
        LEFT JOIN stock_batches b ON p.id = b.item_id AND b.item_type = 'Catalog'
        GROUP BY p.id
        HAVING stock <= p.reorder_level AND p.reorder_level > 0
        LIMIT 6
      `),
      db.query(`
        SELECT ii.id, ii.name, ii.unit, ii.reorder_level, COALESCE(SUM(sb.current_qty), 0) as stock
        FROM inventory_items ii
        LEFT JOIN stock_batches sb ON ii.id = sb.item_id AND sb.item_type = 'Inventory'
        GROUP BY ii.id
        HAVING stock <= ii.reorder_level AND ii.reorder_level > 0
        LIMIT 6
      `),
      db.query(`
        (SELECT o.id, o.order_no as identifier, o.date, o.total_amount, o.status, o.client_name, 'Order' as type, o.created_at 
         FROM orders o)
        UNION ALL
        (SELECT t.id, t.txn_no as identifier, t.date, t.total_amount, 'Delivered' as status, c.name as client_name, 'Daily Sale' as type, t.created_at 
         FROM daily_transactions t 
         LEFT JOIN clients c ON t.client_id = c.id)
        ORDER BY created_at DESC, id DESC 
        LIMIT 5
      `),
      db.query(`
        SELECT p.category, COALESCE(SUM(b.current_qty * b.purchase_price), 0) as val 
        FROM stock_batches b 
        JOIN products p ON b.item_id = p.id AND b.item_type = 'Catalog' 
        GROUP BY p.category
      `),
      db.query(`
        SELECT SUBSTRING(date, 6, 2) as m, SUM(total_amount) as total 
        FROM orders 
        WHERE status='Delivered' 
        GROUP BY m
      `),
      db.query(`
        SELECT SUBSTRING(date, 6, 2) as m, SUM(total_amount) as total 
        FROM daily_transactions 
        GROUP BY m
      `)
    ]);

    const totalRevenue = parseFloat(orderRev[0].total) + parseFloat(dailyRev[0].total);
    const activeOrders = activeOrdersRow[0].count;
    const productsCount = prodRow[0].count;
    const clientsCount = clientRow[0].count;
    const lowStockCount = stockAlerts.length + rawStockAlerts.length;

    // Merge monthly sales into a 12-month array
    const monthlySalesData = Array(12).fill(0);
    const processSales = (rows) => {
      rows.forEach(r => {
        if (r.m) {
          const monthIdx = parseInt(r.m) - 1;
          if (monthIdx >= 0 && monthIdx < 12) {
            monthlySalesData[monthIdx] += parseFloat(r.total) || 0;
          }
        }
      });
    };
    processSales(monthlyOrderSales);
    processSales(monthlyDailySales);

    res.json({
      success: true,
      kpis: {
        revenue: totalRevenue,
        activeOrders,
        productsCount,
        clientsCount,
        lowStockCount
      },
      stockAlerts: [...stockAlerts, ...rawStockAlerts].slice(0, 6),
      recentActivities,
      categoryDistribution,
      monthlySalesTrend: monthlySalesData
    });
  } catch (err) {
    next(err);
  }
};

