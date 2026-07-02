-- AgroChem ERP Sample Seed Data
-- Run this script to populate sample values in the database.

-- Disable foreign key checks
SET FOREIGN_KEY_CHECKS = 0;

-- Clear existing data
TRUNCATE TABLE master_options;
TRUNCATE TABLE clients;
TRUNCATE TABLE suppliers;
TRUNCATE TABLE products;
TRUNCATE TABLE product_packaging;
TRUNCATE TABLE inventory_items;
TRUNCATE TABLE stock_batches;
TRUNCATE TABLE stock_movements;
TRUNCATE TABLE purchases;
TRUNCATE TABLE purchase_items;
TRUNCATE TABLE orders;
TRUNCATE TABLE order_items;
TRUNCATE TABLE expenses;
TRUNCATE TABLE transactions;
TRUNCATE TABLE formulations;
TRUNCATE TABLE formulation_ingredients;
TRUNCATE TABLE daily_transactions;
TRUNCATE TABLE daily_transaction_items;
TRUNCATE TABLE daily_transaction_materials;

-- 1. Seed Master Options
INSERT INTO master_options (category, parent_value, value) VALUES
('technical_unit', NULL, 'Litre'),
('technical_unit', NULL, 'ML'),
('technical_unit', NULL, 'KG'),
('technical_unit', NULL, 'Gram'),
('bottle_option', 'HDPE', '1 Ltr'),
('bottle_option', 'HDPE', '500 ml'),
('bottle_option', 'HDPE', '250 ml'),
('bottle_option', 'HDPE', '100 ml'),
('bottle_option', 'PET', '1 Ltr'),
('bottle_option', 'PET', '500 ml'),
('bottle_option', 'Glass', '100 ml'),
('bottle_option', 'Glass', '50 ml'),
('box_option', 'Corrugated', '20 Ltr'),
('box_option', 'Corrugated', '10 Ltr'),
('box_option', 'Corrugated', '5 Ltr'),
('box_option', 'Corrugated', '10 kg'),
('box_option', 'Corrugated', '5 kg');

-- 2. Seed Clients
INSERT INTO clients (name, contact, email, address, city, gst, type, credit_limit, balance) VALUES
('Shree Agro Agency', '98765 43210', 'shreeagro@example.com', 'Main Market Road', 'Pune', '27ABCDE1234F1Z1', 'Distributor', 150000.00, 24500.00),
('Balaji Pesticides', '91234 56789', 'balaji@example.com', 'Station Road', 'Nashik', '27ABCDE5678G1Z2', 'Retailer', 50000.00, 0.00),
('Sai Farmers Club', '88888 77777', 'saifarmers@example.com', 'Kalyan Naka', 'Ahmednagar', NULL, 'Farmer', 10000.00, 1200.00);

-- 3. Seed Suppliers
INSERT INTO suppliers (name, company_name, contact, email, address, city, gst, category, payment_terms, balance, status) VALUES
('ChemiCorp Industries', 'ChemiCorp India Pvt Ltd', '99999 88888', 'sales@chemicorp.com', 'GIDC Industrial Area', 'Vapi', '24GIDC1234A1Z3', 'Technical Supplier', 45, 18500.00, 'Active'),
('Apex Packaging Ltd', 'Apex Packaging Limited', '98888 77777', 'support@apexpkg.com', 'MIDC Phase 2', 'Thane', '27APEX5678B1Z4', 'Packing Supplier', 30, 0.00, 'Active');

-- 4. Seed Products (Finished Goods)
INSERT INTO products (name, batch_no, brand, category, unit, composition, reorder_level, purchase_price, sell_price, gst, status, description) VALUES
('Monocrotophos 36% SL', 'MNC-2026-B1', 'Kavach', 'Insecticide', 'Litre', 'Monocrotophos Active Ingredient 36% w/w, Solvents and Emulsifiers 64% w/w', 100, 220.00, 310.00, '18%', 'Active', 'Organophosphate insecticide with systemic and contact action.'),
('Glyphosate 41% SL', 'GLY-2026-B1', 'Vijay', 'Herbicide', 'Litre', 'Glyphosate Isopropylamine Salt 41% w/w, Surfactants 59% w/w', 200, 160.00, 230.00, '18%', 'Active', 'Non-selective systemic herbicide for annual and perennial weeds.');

-- 5. Seed Product Packaging Variants
INSERT INTO product_packaging (product_id, packaging_size, purchase_price, sell_price) VALUES
(1, '1 Ltr', 220.00, 310.00), -- Base variant
(1, '500 ml', 0.00, 165.00),
(1, '250 ml', 0.00, 90.00),
(2, '1 Ltr', 160.00, 230.00), -- Base variant
(2, '500 ml', 0.00, 125.00);

-- 6. Seed Inventory Items (Raw Materials)
INSERT INTO inventory_items (name, category, unit, reorder_level, item_subtype, item_size, description) VALUES
('Monocrotophos Tech 72%', 'Technical', 'Litre', 200, NULL, NULL, 'High purity monocrotophos technical liquid.'),
('Glyphosate Tech 95%', 'Technical', 'KG', 500, NULL, NULL, 'White powder formulation pesticide ingredient.'),
('1 Ltr HDPE Bottle', 'Bottles', 'Nos', 1000, 'HDPE', '1 Ltr', 'White high density polyethylene bottle.'),
('500 ml HDPE Bottle', 'Bottles', 'Nos', 2000, 'HDPE', '500 ml', 'White high density polyethylene bottle.'),
('Corrugated Box 10 Ltr', 'Boxes', 'Nos', 200, 'Corrugated', '10 Ltr', 'Heavy duty shipping carton for 10x 1 Ltr bottles.'),
('Solvent Emulsifier-C', 'Others', 'Litre', 300, NULL, NULL, 'Inert chemical helper agent.');

-- 7. Seed Initial FIFO Stock Batches
-- Seed raw materials in stock
INSERT INTO stock_batches (item_id, item_name, item_type, batch_no, purchase_id, supplier_id, purchase_date, purchase_price, initial_qty, current_qty, unit, expiry_date, warehouse) VALUES
(1, 'Monocrotophos Tech 72%', 'Inventory', 'RM-MNC-001', NULL, 1, '2026-04-10', 180.00, 300.0, 300.0, 'Litre', '2028-04-10', 'Main Warehouse'),
(2, 'Glyphosate Tech 95%', 'Inventory', 'RM-GLY-001', NULL, 1, '2026-04-15', 120.00, 600.0, 600.0, 'KG', '2028-04-15', 'Main Warehouse'),
(3, '1 Ltr HDPE Bottle', 'Inventory', 'RM-BTL-1L', NULL, 2, '2026-04-20', 14.50, 1500.0, 1500.0, 'Nos', NULL, 'Main Warehouse'),
(4, '500 ml HDPE Bottle', 'Inventory', 'RM-BTL-500', NULL, 2, '2026-04-20', 9.00, 1000.0, 1000.0, 'Nos', NULL, 'Main Warehouse'),
(5, 'Corrugated Box 10 Ltr', 'Inventory', 'RM-BOX-10', NULL, 2, '2026-04-22', 40.00, 250.0, 250.0, 'Nos', NULL, 'Main Warehouse'),
(6, 'Solvent Emulsifier-C', 'Inventory', 'RM-SOL-01', NULL, 1, '2026-04-10', 35.00, 500.0, 500.0, 'Litre', NULL, 'Main Warehouse');

-- Seed finished goods in stock
INSERT INTO stock_batches (item_id, item_name, item_type, batch_no, purchase_id, supplier_id, purchase_date, purchase_price, initial_qty, current_qty, unit, expiry_date, warehouse) VALUES
(1, 'Monocrotophos 36% SL', 'Catalog', 'MNC-2026-B1', NULL, NULL, '2026-05-01', 220.00, 120.0, 120.0, 'Litre', '2028-05-01', 'Finished Goods Yard'),
(2, 'Glyphosate 41% SL', 'Catalog', 'GLY-2026-B1', NULL, NULL, '2026-05-02', 160.00, 80.0, 80.0, 'Litre', '2028-05-02', 'Finished Goods Yard');

-- 8. Seed Stock Movements corresponding to initial stock
INSERT INTO stock_movements (batch_id, txn_type, txn_id, qty) VALUES
(1, 'Opening Stock', 0, 300.0),
(2, 'Opening Stock', 0, 600.0),
(3, 'Opening Stock', 0, 1500.0),
(4, 'Opening Stock', 0, 1000.0),
(5, 'Opening Stock', 0, 250.0),
(6, 'Opening Stock', 0, 500.0),
(7, 'Opening Stock', 0, 120.0),
(8, 'Opening Stock', 0, 80.0);

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;
