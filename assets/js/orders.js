/* orders.js */
let allOrders = [], orderItems = [], editingOrderId = null;

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadOrders() {
  console.log('Loading orders...');
  updatePageDebug('Loading Orders...', '#10B981');
  try {
    UTILS.renderTableSkeleton('orders-table');
    await DB.initDB();
    
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error('Failed to fetch orders from API');
    allOrders = await res.json();
    
    // Retrieve client list to map display names
    const resCli = await fetch('/api/clients');
    const clientsList = resCli.ok ? await resCli.json() : [];
    
    allOrders.forEach(o => {
      const match = clientsList.find(c => c.id === o.client_id);
      o.client_display = match ? match.name : (o.client_name || '—');
    });

    renderTable(allOrders);
    updatePageDebug('Ready (' + allOrders.length + ')', '#10B981');
    setTimeout(() => UTILS.initAllAutocompleteSelects(), 50);
  } catch (err) {
    console.error('loadOrders failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load orders: ' + err.message, 'error');
  }
}

function renderTable(data) {
  const tbody = document.querySelector('#orders-table tbody');
  if (!tbody) return;
  document.getElementById('total-info').textContent = `${data.length} order${data.length !== 1 ? 's' : ''}`;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h3>No orders found</h3><p>Create your first order.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(o => `<tr>
    <td><input type="checkbox" class="row-check" value="${o.id}"></td>
    <td class="cell-bold">${o.order_no}</td>
    <td>${o.client_display || '—'}</td>
    <td>${UTILS.fmtDate(o.date)}</td>
    <td class="cell-amount">${UTILS.fmtCurrency(o.total_amount)}</td>
    <td class="cell-amount text-success">${UTILS.fmtCurrency(o.paid_amount)}</td>
    <td class="cell-amount text-danger">${UTILS.fmtCurrency(o.total_amount - (o.paid_amount || 0))}</td>
    <td><div class="row-actions">
      <button class="action-btn edit" onclick="openEdit(${o.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="action-btn delete" onclick="deleteOrder(${o.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
    </div></td>
  </tr>`).join('');
  UTILS.applyMobileTableLabels('orders-table');
}

async function populateClientSelect() {
  const sel = document.getElementById('client-select');
  if (!sel) return;
  try {
    const res = await fetch('/api/clients');
    const clients = res.ok ? await res.json() : [];
    sel.innerHTML = '<option value="">Select Client</option>' + clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch (err) {
    console.error('populateClientSelect failed:', err);
  }
}

async function openAdd() {
  editingOrderId = null;
  document.getElementById('modal-title').textContent = 'New Sales Order';
  document.getElementById('order-form').reset();
  orderItems = [];
  await populateClientSelect();
  await renderOrderItems();
  APP.openModal('order-modal');
}

async function openEdit(id) {
  editingOrderId = id;
  try {
    await populateClientSelect();
    
    const res = await fetch(`/api/orders/${id}`);
    if (!res.ok) throw new Error('Failed to fetch order details');
    const o = await res.json();

    document.getElementById('modal-title').textContent = 'Edit Order';
    UTILS.populateForm('order-form', o);
    orderItems = o.items || [];
    
    orderItems.forEach(item => {
      item.total = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
    });

    await renderOrderItems();
    APP.openModal('order-modal');
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to load order: ' + err.message, 'error');
  }
}

function addOrderItem() {
  orderItems.push({ id: Date.now(), product_id: '', product_name: '', quantity: 1, unit_price: 0, total: 0 });
  renderOrderItems();
}

async function renderOrderItems() {
  const tbody = document.getElementById('order-items-tbody');
  if (!tbody) return;
  
  try {
    const res = await fetch('/api/products');
    const products = res.ok ? await res.json() : [];
    
    tbody.innerHTML = orderItems.map((item, idx) => `
      <tr>
        <td style="min-width:200px">
          <select class="form-select search-select" onchange="updateItem(${idx}, 'product_id', this.value)" data-autocomplete>
            <option value="">Select Product</option>
            ${products.map(p => `<option value="${p.id}" ${p.id == item.product_id ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
        </td>
        <td><input type="number" class="form-input" value="${item.quantity}" onchange="updateItem(${idx}, 'quantity', this.value)"></td>
        <td><input type="number" class="form-input" value="${item.unit_price}" onchange="updateItem(${idx}, 'unit_price', this.value)"></td>
        <td class="cell-amount">${UTILS.fmtCurrency(item.total)}</td>
        <td><button class="action-btn delete" onclick="removeItem(${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button></td>
      </tr>
    `).join('');
    calculateTotal();
    setTimeout(() => UTILS.initAllAutocompleteSelects(), 10);
  } catch (err) {
    console.error(err);
  }
}

async function updateItem(idx, key, val) {
  const it = orderItems[idx];
  it[key] = val;
  if (key === 'product_id') {
    try {
      const res = await fetch(`/api/products/${val}`);
      const p = res.ok ? await res.json() : null;
      it.product_name = p?.name || '';
      it.unit_price = p?.sell_price || 0;
    } catch (err) {
      console.error(err);
    }
  }
  it.total = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  await renderOrderItems();
}

function removeItem(idx) {
  orderItems.splice(idx, 1);
  renderOrderItems();
}

function calculateTotal() {
  const total = orderItems.reduce((s, it) => s + it.total, 0);
  const el = document.getElementById('order-total-display');
  if (el) el.textContent = UTILS.fmtCurrency(total);
}

async function saveOrder() {
  const d = UTILS.getFormData('order-form');
  if (!d.client_id) { APP.showToast('Please select a client', 'error'); return; }
  if (orderItems.length === 0) { APP.showToast('Please add at least one item', 'error'); return; }
  
  const clientSelect = document.getElementById('client-select');
  const clientName = clientSelect ? clientSelect.options[clientSelect.selectedIndex].text : '';
  const total = orderItems.reduce((s, it) => s + it.total, 0);
  
  try {
    const payload = {
      client_id: d.client_id,
      client_name: clientName,
      date: d.date || new Date().toISOString().split('T')[0],
      due_date: d.due_date || null,
      status: d.status || 'Delivered',
      total_amount: total,
      paid_amount: parseFloat(d.paid_amount) || 0.00,
      notes: d.notes || '',
      items: orderItems.map(it => ({
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: parseFloat(it.quantity) || 0,
        unit_price: parseFloat(it.unit_price) || 0,
        total: parseFloat(it.total) || 0
      }))
    };

    const url = editingOrderId ? `/api/orders/${editingOrderId}` : '/api/orders';
    const method = editingOrderId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Failed to save order');

    APP.closeModal('order-modal');
    APP.showToast('Order saved!', 'success');
    setTimeout(() => loadOrders(), 100);
  } catch (err) {
    console.error('saveOrder failed:', err);
    APP.showToast('Failed to save order: ' + err.message, 'error');
  }
}

async function deleteOrder(id) {
  APP.showConfirm('Delete this order and its items?', async () => {
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to delete order');
      
      APP.showToast('Order deleted!', 'success');
      setTimeout(() => loadOrders(), 100);
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete order: ' + err.message, 'error');
    }
  });
}

loadOrders();
