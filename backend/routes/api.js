const express = require('express');
const router = express.Router();

// Controllers
const clientsController = require('../controllers/clientsController');
const suppliersController = require('../controllers/suppliersController');
const productsController = require('../controllers/productsController');
const inventoryController = require('../controllers/inventoryController');
const purchasesController = require('../controllers/purchasesController');
const ordersController = require('../controllers/ordersController');
const dailyTxnController = require('../controllers/dailyTxnController');
const expensesController = require('../controllers/expensesController');
const transactionsController = require('../controllers/transactionsController');
const formulationsController = require('../controllers/formulationsController');
const masterOptsController = require('../controllers/masterOptsController');
const dashboardController = require('../controllers/dashboardController');
const reportsController = require('../controllers/reportsController');
const databaseController = require('../controllers/databaseController');

// 1. Dashboard Endpoint
router.get('/dashboard/stats', dashboardController.getDashboardStats);
router.get('/reports/summary', reportsController.getReportSummary);
router.post('/database/reset', databaseController.resetDatabase);

// 2. Clients CRUD
router.get('/clients', clientsController.getClients);
router.get('/clients/:id', clientsController.getClientById);
router.get('/clients/:id/stats', clientsController.getClientStats);
router.post('/clients', clientsController.createClient);
router.put('/clients/:id', clientsController.updateClient);
router.delete('/clients/:id', clientsController.deleteClient);

// 3. Suppliers CRUD
router.get('/suppliers', suppliersController.getSuppliers);
router.get('/suppliers/:id', suppliersController.getSupplierById);
router.get('/suppliers/:id/stats', suppliersController.getSupplierStats);
router.post('/suppliers', suppliersController.createSupplier);
router.put('/suppliers/:id', suppliersController.updateSupplier);
router.delete('/suppliers/:id', suppliersController.deleteSupplier);

// 4. Products & Packaging CRUD
router.get('/products', productsController.getProducts);
router.get('/products/packaging', productsController.getAllPackaging);
router.get('/products/:id', productsController.getProductById);
router.post('/products', productsController.createProduct);
router.put('/products/:id', productsController.updateProduct);
router.delete('/products/:id', productsController.deleteProduct);
router.delete('/products/packaging/:id', productsController.deletePackagingOption);

// 5. Inventory Items CRUD (Raw Materials)
router.get('/inventory', inventoryController.getInventoryItems);
router.get('/inventory/:id', inventoryController.getInventoryItemById);
router.get('/inventory/:id/stock', inventoryController.getInventoryStock);
router.get('/inventory/:id/batches', inventoryController.getItemBatches);
router.post('/inventory', inventoryController.createInventoryItem);
router.put('/inventory/:id', inventoryController.updateInventoryItem);
router.delete('/inventory/:id', inventoryController.deleteInventoryItem);

// 6. Purchases CRUD (Raw Materials Purchases)
router.get('/purchases', purchasesController.getPurchases);
router.get('/purchases/next-no', purchasesController.getNextPurchaseNo);
router.get('/purchases/:id', purchasesController.getPurchaseById);
router.post('/purchases', purchasesController.createPurchase);
router.put('/purchases/:id', purchasesController.updatePurchase);
router.delete('/purchases/:id', purchasesController.deletePurchase);

// 7. Orders CRUD (Sales Orders)
router.get('/orders', ordersController.getOrders);
router.get('/orders/next-no', ordersController.getNextOrderNo);
router.get('/orders/:id', ordersController.getOrderById);
router.post('/orders', ordersController.createOrder);
router.put('/orders/:id', ordersController.updateOrder);
router.delete('/orders/:id', ordersController.deleteOrder);

// 8. Daily Sales CRUD
router.get('/daily-transactions', dailyTxnController.getDailyTxns);
router.get('/daily-transactions/next-no', dailyTxnController.getNextDailyTxnNo);
router.get('/daily-transactions/:id', dailyTxnController.getDailyTxnById);
router.post('/daily-transactions', dailyTxnController.createDailyTxn);
router.put('/daily-transactions/:id', dailyTxnController.updateDailyTxn);
router.delete('/daily-transactions/:id', dailyTxnController.deleteDailyTxn);

// 9. Expenses CRUD
router.get('/expenses', expensesController.getExpenses);
router.post('/expenses', expensesController.createExpense);
router.put('/expenses/:id', expensesController.updateExpense);
router.delete('/expenses/:id', expensesController.deleteExpense);

// 10. Ledger Transactions CRUD (Payments/Receipts)
router.get('/transactions', transactionsController.getTransactions);
router.post('/transactions', transactionsController.createTransaction);
router.put('/transactions/:id', transactionsController.updateTransaction);
router.delete('/transactions/:id', transactionsController.deleteTransaction);

// 11. Formulations CRUD (Manufacturing runs)
router.get('/formulations', formulationsController.getFormulations);
router.get('/formulations/:id', formulationsController.getFormulationById);
router.post('/formulations', formulationsController.createFormulation);
router.put('/formulations/:id', formulationsController.updateFormulation);
router.delete('/formulations/:id', formulationsController.deleteFormulation);

// 12. Master Options CRUD
router.get('/master-options', masterOptsController.getMasterOptions);
router.post('/master-options', masterOptsController.createMasterOption);
router.put('/master-options/:id', masterOptsController.updateMasterOption);
router.delete('/master-options/:id', masterOptsController.deleteMasterOption);

module.exports = router;
