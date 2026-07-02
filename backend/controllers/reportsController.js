const db = require('../config/db');

exports.getReportSummary = async (req, res, next) => {
  try {
    const { from, to } = req.query;

    let dateFilterOrders = "WHERE status = 'Delivered'";
    let dateFilterGeneric = "";
    let paramsOrders = [];
    let paramsGeneric = [];

    if (from && to) {
      dateFilterOrders += " AND date >= ? AND date <= ?";
      dateFilterGeneric += " WHERE date >= ? AND date <= ?";
      paramsOrders = [from, to];
      paramsGeneric = [from, to];
    }

    // 1. Summary KPIs
    const [orderRev] = await db.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM orders ${dateFilterOrders}`, paramsOrders);
    const [dailyRev] = await db.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM daily_transactions ${dateFilterGeneric}`, paramsGeneric);
    const revenue = parseFloat(orderRev[0].total) + parseFloat(dailyRev[0].total);

    const [expenses] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses ${dateFilterGeneric}`, paramsGeneric);
    const totalExpenses = parseFloat(expenses[0].total);

    const [purchases] = await db.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM purchases ${dateFilterGeneric}`, paramsGeneric);
    const totalPurchases = parseFloat(purchases[0].total);

    const profit = revenue - totalExpenses - totalPurchases;

    // 2. Sales Trend (Monthly)
    // For MySQL we can use SUBSTRING(date, 1, 7) to extract YYYY-MM
    const [ordersTrend] = await db.query(
      `SELECT SUBSTRING(date, 1, 7) as mo, SUM(total_amount) as total 
       FROM orders 
       ${dateFilterOrders} 
       GROUP BY mo`,
      paramsOrders
    );

    const [dailyTrend] = await db.query(
      `SELECT SUBSTRING(date, 1, 7) as mo, SUM(total_amount) as total 
       FROM daily_transactions 
       ${dateFilterGeneric} 
       GROUP BY mo`,
      paramsGeneric
    );

    const trendMap = {};
    [...ordersTrend, ...dailyTrend].forEach(item => {
      if (item.mo) {
        if (!trendMap[item.mo]) trendMap[item.mo] = 0;
        trendMap[item.mo] += parseFloat(item.total) || 0;
      }
    });

    const sortedMonths = Object.keys(trendMap).sort();
    const salesTrend = sortedMonths.map(mo => ({
      mo,
      total: trendMap[mo]
    }));

    // 3. Expenses by Category
    const [expensesByCategory] = await db.query(
      `SELECT category, SUM(amount) as total 
       FROM expenses 
       ${dateFilterGeneric} 
       GROUP BY category 
       ORDER BY total DESC`,
      paramsGeneric
    );

    // 4. Top Products
    let topProductsParams = [];
    let topProductsQuery = `
      SELECT product_name, SUM(total_qty) as total_qty, SUM(total_rev) as total_rev 
      FROM (
        SELECT oi.product_name, SUM(oi.quantity) as total_qty, SUM(oi.total) as total_rev 
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status = 'Delivered' ${from && to ? 'AND o.date >= ? AND o.date <= ?' : ''}
        GROUP BY oi.product_name
        
        UNION ALL
        
        SELECT dti.product_name, SUM(dti.quantity) as total_qty, SUM(dti.total) as total_rev 
        FROM daily_transaction_items dti
        JOIN daily_transactions dt ON dti.daily_transaction_id = dt.id
        ${from && to ? 'WHERE dt.date >= ? AND dt.date <= ?' : ''}
        GROUP BY dti.product_name
      ) as combined
      GROUP BY product_name 
      ORDER BY total_rev DESC 
      LIMIT 8
    `;
    if (from && to) {
      topProductsParams = [from, to, from, to];
    }
    const [topProducts] = await db.query(topProductsQuery, topProductsParams);

    // 5. Top Clients
    let topClientsParams = [];
    let topClientsQuery = `
      SELECT name, SUM(total_rev) as total_rev 
      FROM (
        SELECT c.name, SUM(o.total_amount) as total_rev 
        FROM orders o 
        LEFT JOIN clients c ON o.client_id = c.id 
        WHERE o.status = 'Delivered' AND c.name IS NOT NULL AND c.name != ''
        ${from && to ? 'AND o.date >= ? AND o.date <= ?' : ''}
        GROUP BY o.client_id
        
        UNION ALL
        
        SELECT c.name, SUM(dt.total_amount) as total_rev 
        FROM daily_transactions dt 
        LEFT JOIN clients c ON dt.client_id = c.id 
        WHERE c.name IS NOT NULL AND c.name != ''
        ${from && to ? 'AND dt.date >= ? AND dt.date <= ?' : ''}
        GROUP BY dt.client_id
      ) as combined
      GROUP BY name 
      ORDER BY total_rev DESC 
      LIMIT 8
    `;
    if (from && to) {
      topClientsParams = [from, to, from, to];
    }
    const [topClients] = await db.query(topClientsQuery, topClientsParams);

    // Also fetch raw data for CSV export
    const [ordersRaw] = await db.query(`SELECT * FROM orders ${dateFilterOrders}`, paramsOrders);
    const [dailyTxnsRaw] = await db.query(`SELECT * FROM daily_transactions ${dateFilterGeneric}`, paramsGeneric);
    const [expensesRaw] = await db.query(`SELECT * FROM expenses ${dateFilterGeneric}`, paramsGeneric);
    const [purchasesRaw] = await db.query(`SELECT * FROM purchases ${dateFilterGeneric}`, paramsGeneric);

    res.json({
      success: true,
      summary: {
        revenue,
        expenses: totalExpenses,
        purchases: totalPurchases,
        profit
      },
      salesTrend,
      expensesByCategory,
      topProducts,
      topClients,
      raw: {
        orders: ordersRaw,
        dailyTxns: dailyTxnsRaw,
        expenses: expensesRaw,
        purchases: purchasesRaw
      }
    });
  } catch (err) {
    next(err);
  }
};
