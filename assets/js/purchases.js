/* purchases.js */
let allPurchases = [], purchaseItems = [], editingPurchaseId = null;
let purchasableItems = [];

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadPurchases() {
  console.log('Loading purchases...');
  updatePageDebug('Loading Purchases...', '#10B981');
  
  try {
    UTILS.renderTableSkeleton('purchases-table');
    await DB.initDB();
    
    console.log('Purchases: Loading purchasable items...');
    await refreshPurchasableItems();
    
    console.log('Purchases: Loading purchases from database...');
    const res = await fetch('/api/purchases');
    if (!res.ok) throw new Error('Failed to fetch purchases from API');
    allPurchases = await res.json();
    
    // Retrieve supplier list to map display names
    const resSup = await fetch('/api/suppliers');
    const suppliersList = resSup.ok ? await resSup.json() : [];
    
    allPurchases.forEach(p => {
      const match = suppliersList.find(s => s.id === p.supplier_id);
      p.supplier_display = match ? match.name : (p.supplier_name || '—');
    });

    renderTable(allPurchases);
    await populateSupplierSelect();
    
    updatePageDebug('Ready (' + allPurchases.length + ')', '#10B981');
    setTimeout(() => UTILS.initAllAutocompleteSelects(), 50);
    
    console.log('Purchases: All data loaded successfully');

  // Attach search listener
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', filterAndRender);
  }

  } catch (err) {
    console.error('Purchases loadPurchases failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load purchases: ' + err.message, 'error');
  }
}

async function refreshPurchasableItems() {
  try {
    const resProd = await fetch('/api/products');
    const p = resProd.ok ? await resProd.json() : [];
    const resInv = await fetch('/api/inventory');
    const i = resInv.ok ? await resInv.json() : [];
    
    purchasableItems = [
      ...p.map(x => ({ id: x.id, name: x.name, unit: x.unit, type: 'Catalog' })),
      ...i.map(x => ({ id: x.id, name: x.name, unit: x.unit, type: 'Inventory' }))
    ];
  } catch (err) {
    console.error('refreshPurchasableItems failed:', err);
  }
}

function renderTable(data) {
  const tbody = document.querySelector('#purchases-table tbody');
  if (!tbody) return;
  document.getElementById('total-info').textContent = `${data.length} purchase${data.length !== 1 ? 's' : ''}`;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h3>No purchases found</h3></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(p => `<tr>
    <td><input type="checkbox" class="row-check" value="${p.id}"></td>
    <td class="cell-bold">${p.purchase_no}</td>
    <td class="cell-mono">${p.invoice_no || '—'}</td>
    <td>${p.supplier_display || '—'}</td>
    <td>${UTILS.fmtDate(p.date)}</td>
    <td class="cell-amount">${UTILS.fmtCurrency(p.total_amount)}</td>
    <td class="cell-amount">${UTILS.fmtCurrency(p.paid_amount || 0)}</td>
    <td class="cell-amount text-danger">${UTILS.fmtCurrency((parseFloat(p.total_amount) || 0) - (parseFloat(p.paid_amount) || 0))}</td>
    <td><div class="row-actions">
      <button class="action-btn edit" onclick="openEdit(${p.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="action-btn delete" onclick="deletePurchase(${p.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
    </div></td>
  </tr>`).join('');
  UTILS.applyMobileTableLabels('purchases-table');
}

function filterAndRender() {
  const q = document.getElementById('search-input')?.value.toLowerCase() || '';
  let filtered = allPurchases;
  if (q) {
    filtered = filtered.filter(p => 
      (p.purchase_no || '').toLowerCase().includes(q) || 
      (p.supplier_display || '').toLowerCase().includes(q) || 
      (p.invoice_no || '').toLowerCase().includes(q) ||
      (p.date || '').toLowerCase().includes(q)
    );
  }
  renderTable(filtered);
}

async function populateSupplierSelect() {
  const sel = document.getElementById('supplier-select');
  if (!sel) return;
  try {
    const res = await fetch('/api/suppliers');
    const suppliers = res.ok ? await res.json() : [];
    sel.innerHTML = '<option value="">Select Supplier</option>' + suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  } catch (err) {
    console.error('populateSupplierSelect failed:', err);
  }
}

function openAdd() {
  editingPurchaseId = null;
  document.getElementById('modal-title').textContent = 'New Purchase Entry';
  document.getElementById('purchase-form').reset();
  purchaseItems = [];
  renderPurchaseItems();
  APP.openModal('purchase-modal');
}

async function openEdit(id) {
  editingPurchaseId = id;
  try {
    const res = await fetch(`/api/purchases/${id}`);
    if (!res.ok) throw new Error('Failed to fetch purchase details');
    const p = await res.json();
    
    document.getElementById('modal-title').textContent = 'Edit Purchase';
    UTILS.populateForm('purchase-form', p);
    purchaseItems = p.items || [];
    
    // Map items list correctly
    purchaseItems.forEach(it => {
      it.total = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
    });

    renderPurchaseItems();
    APP.openModal('purchase-modal');
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to load purchase details: ' + err.message, 'error');
  }
}

function addPurchaseItem() {
  purchaseItems.push({ id: Date.now(), item_id: '', item_name: '', item_type: 'Catalog', quantity: 1, unit_price: 0, batch_no: '', expiry_date: '', total: 0 });
  renderPurchaseItems();
}

function renderPurchaseItems() {
  const tbody = document.getElementById('purchase-items-tbody');
  if (!tbody) return;
  tbody.innerHTML = purchaseItems.map((it, idx) => `
    <tr>
      <td style="min-width:200px">
        <select class="form-select search-select" onchange="updateItem(${idx}, 'item_key', this.value)" data-autocomplete>
          <option value="">Select Item</option>
          ${purchasableItems.map(m => `<option value="${m.type}:${m.id}" ${it.item_type === m.type && it.item_id == m.id ? 'selected' : ''}>[${m.type}] ${m.name}</option>`).join('')}
        </select>
      </td>
      <td><input type="text" class="form-input" value="${it.batch_no || ''}" placeholder="Batch #" onchange="updateItem(${idx}, 'batch_no', this.value)"></td>
      <td><input type="date" class="form-input" value="${it.expiry_date ? it.expiry_date.split('T')[0] : ''}" onchange="updateItem(${idx}, 'expiry_date', this.value)"></td>
      <td><input type="number" class="form-input" value="${it.quantity}" onchange="updateItem(${idx}, 'quantity', this.value)"></td>
      <td><input type="number" class="form-input" value="${it.unit_price}" onchange="updateItem(${idx}, 'unit_price', this.value)"></td>
      <td class="cell-amount">${UTILS.fmtCurrency(it.total)}</td>
      <td><button class="action-btn delete" onclick="removePurchaseItem(${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button></td>
    </tr>
  `).join('');
  calculateTotal();
  setTimeout(() => UTILS.initAllAutocompleteSelects(), 10);
}

function updateItem(idx, key, val) {
  const it = purchaseItems[idx];
  if (key === 'item_key') {
    const [type, id] = val.split(':');
    it.item_type = type;
    it.item_id = id;
    const match = purchasableItems.find(m => m.type === type && m.id == id);
    it.item_name = match ? match.name : '';
    it.unit = match ? match.unit : '';
  } else {
    it[key] = val;
  }
  it.total = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  renderPurchaseItems();
}

function removePurchaseItem(idx) {
  purchaseItems.splice(idx, 1);
  renderPurchaseItems();
}

function calculateTotal() {
  const total = purchaseItems.reduce((s, it) => s + it.total, 0);
  document.getElementById('purchase-total-display').textContent = UTILS.fmtCurrency(total);
}

async function savePurchase() {
  const d = UTILS.getFormData('purchase-form');
  if (!d.supplier_id) { APP.showToast('Please select a supplier', 'error'); return; }
  if (purchaseItems.length === 0) { APP.showToast('Please add at least one item', 'error'); return; }
  
  const supplierSelect = document.getElementById('supplier-select');
  const supplierName = supplierSelect ? supplierSelect.options[supplierSelect.selectedIndex].text : '';
  const total = purchaseItems.reduce((s, it) => s + it.total, 0);
  
  try {
    const payload = {
      invoice_no: d.invoice_no || '',
      supplier_id: d.supplier_id,
      supplier_name: supplierName,
      date: d.date || new Date().toISOString().split('T')[0],
      due_date: d.due_date || null,
      status: d.status || 'Pending',
      total_amount: total,
      paid_amount: parseFloat(d.paid_amount) || 0.00,
      notes: d.notes || '',
      items: purchaseItems.map(it => ({
        item_id: it.item_id,
        item_name: it.item_name,
        item_type: it.item_type,
        quantity: parseFloat(it.quantity) || 0,
        unit_price: parseFloat(it.unit_price) || 0,
        batch_no: it.batch_no || '',
        expiry_date: it.expiry_date || null,
        unit: it.unit || 'Nos',
        total: parseFloat(it.total) || 0
      }))
    };

    const url = editingPurchaseId ? `/api/purchases/${editingPurchaseId}` : '/api/purchases';
    const method = editingPurchaseId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Failed to save purchase');

    APP.showToast(editingPurchaseId ? 'Purchase updated and inventory synced!' : 'Purchase added and inventory synced!', 'success');
    APP.closeModal('purchase-modal');
    setTimeout(() => loadPurchases(), 100);
  } catch (err) {
    console.error('savePurchase failed:', err);
    APP.showToast('Failed to save purchase: ' + err.message, 'error');
  }
}

async function deletePurchase(id) {
  APP.showConfirm('Delete this purchase and all its line items?', async () => {
    try {
      const res = await fetch(`/api/purchases/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to delete purchase');
      
      APP.showToast('Purchase deleted and inventory restored!', 'success');
      setTimeout(() => loadPurchases(), 100);
    } catch (err) {
      console.error('deletePurchase failed:', err);
      APP.showToast('Failed to delete purchase: ' + err.message, 'error');
    }
  });
}

loadPurchases();
