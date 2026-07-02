/* inventory.js */
let allInventory = [], editingItemId = null, activeTab = 'Technical';

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadInventory() {
  console.log('Loading inventory...');
  updatePageDebug('Loading Inventory...', '#10B981');
  try {
    UTILS.renderTableSkeleton('inventory-table');
    await DB.initDB();
    await loadMasterOptions();

    const res = await fetch('/api/inventory');
    if (!res.ok) throw new Error('Failed to fetch inventory from API');
    const items = await res.json();
    
    allInventory = items.map(ii => {
      const stock = parseFloat(ii.stock) || 0;
      const cost = parseFloat(ii.avg_cost) || 0;
      return {
        id: ii.id,
        name: ii.name,
        category: ii.category,
        unit: ii.unit,
        item_type: 'Inventory',
        description: ii.description,
        item_subtype: ii.item_subtype,
        item_size: ii.item_size,
        total_stock: stock,
        avg_cost: cost,
        total_value: stock * cost
      };
    });

    renderTable(allInventory);
    updatePageDebug('Ready (' + allInventory.length + ')', '#10B981');
  } catch (err) {
    console.error('loadInventory failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load inventory: ' + err.message, 'error');
    renderTable([]);
  }
}

function renderTable(data) {
  const tbody = document.querySelector('#inventory-table tbody');
  if (!tbody) return;
  const filtered = filterData(data);
  document.getElementById('total-info').textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><h3>No items found</h3></div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(it => `<tr>
    <td><input type="checkbox" class="row-check" value="${it.id}"></td>
    <td class="cell-bold"><div style="display:flex;flex-direction:column"><span>${it.name}</span><span style="font-size:10px;color:var(--text-muted)">RAW MATERIAL</span></div></td>
    <td><span class="badge badge-purple">${it.category || '—'}</span></td>
    <td style="font-weight:700;color:var(--accent)">${it.total_stock.toFixed(2)}</td>
    <td>${it.unit || '—'}</td>
    <td>${UTILS.fmtCurrency(it.avg_cost)}</td>
    <td class="cell-amount">${UTILS.fmtCurrency(it.total_value)}</td>
    <td><span class="badge ${it.total_stock > 0 ? 'badge-success' : 'badge-gray'}">${it.total_stock > 0 ? 'In Stock' : 'Out of Stock'}</span></td>
    <td><div class="row-actions">
      <button class="action-btn view" onclick="viewBatches('${it.item_type}', ${it.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      <button class="action-btn edit" onclick="openEdit('${it.item_type}', ${it.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="action-btn delete" onclick="deleteInventoryItem('${it.item_type}', ${it.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
    </div></td>
  </tr>`).join('');
  UTILS.applyMobileTableLabels('inventory-table');
}

async function deleteInventoryItem(itemType, id) {
  let message = 'Delete this inventory item?';
  APP.showConfirm(message, async () => {
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to delete item');
      
      APP.showToast('Inventory item deleted!', 'success');
      setTimeout(() => loadInventory(), 100);
    } catch (err) {
      console.error(err);
      APP.showToast('Error deleting item: ' + err.message, 'error');
    }
  });
}

async function viewBatches(type, id) {
  const el = document.getElementById('batch-content');
  if (!el) return;
  
  try {
    const res = await fetch(`/api/inventory/${id}/batches?type=${type}`);
    if (!res.ok) throw new Error('Failed to fetch item batches');
    const batches = await res.json();
    
    if (!batches.length) { 
      el.innerHTML = '<div class="empty-state">No active batches.</div>'; 
    } else { 
      el.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Batch No</th>
              <th>Supplier</th>
              <th>Price</th>
              <th>Expiry</th>
              <th>Current Qty</th>
            </tr>
          </thead>
          <tbody>
            ${batches.map(b => `
              <tr>
                <td class="cell-mono">${b.batch_no || '—'}</td>
                <td>${b.supplier_name || '—'}</td>
                <td>${UTILS.fmtCurrency(b.purchase_price)}</td>
                <td>${b.expiry_date ? UTILS.fmtDate(b.expiry_date) : '—'}</td>
                <td style="font-weight:600;color:var(--accent)">${b.current_qty}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`; 
    }
    APP.openModal('batch-modal');
  } catch (err) {
    console.error(err);
    APP.showToast('Error loading active batches: ' + err.message, 'error');
  }
}

function filterData(data) {
  const q = document.getElementById('search-input')?.value.toLowerCase();
  return data.filter(it => {
    if (activeTab !== 'All') {
      if (activeTab === 'Technical' && it.category !== 'Technical') return false;
      if (activeTab === 'Bottles' && it.category !== 'Bottles') return false;
      if (activeTab === 'Boxes' && it.category !== 'Boxes') return false;
      if (activeTab === 'Labels' && it.category !== 'Labels') return false;
      if (activeTab === 'Others' && ['Technical','Bottles','Boxes','Labels'].includes(it.category || it.item_type)) return false;
    }
    if (q && !it.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

/* ─── DYNAMIC FORM LOGIC ─── */
let masterCache = { technical: [], bottles: [], boxes: [] };

async function loadMasterOptions() {
  try {
    const res = await fetch('/api/master-options');
    if (!res.ok) throw new Error('Failed to fetch options');
    const opts = await res.json();
    
    masterCache.technical = opts.filter(o => o.category === 'technical_unit');
    masterCache.bottles = opts.filter(o => o.category === 'bottle_option');
    masterCache.boxes = opts.filter(o => o.category === 'box_option');
    
    const techUnitSelect = document.getElementById('tech-unit-select');
    if (techUnitSelect && masterCache.technical.length > 0) {
      const currentVal = techUnitSelect.value;
      techUnitSelect.innerHTML = masterCache.technical.map(u => `<option value="${u.value}">${u.value}</option>`).join('');
      if (masterCache.technical.find(u => u.value === currentVal)) techUnitSelect.value = currentVal;
    }
  } catch (err) {
    console.error('Failed to load master options:', err);
  }
}

function populateDependentTypes(cacheArray, typeSelectId, sizeSelectId) {
  const typeSelect = document.getElementById(typeSelectId);
  const sizeSelect = document.getElementById(sizeSelectId);
  if (!typeSelect || !sizeSelect) return;
  
  const types = [...new Set(cacheArray.map(o => o.parent_value))].filter(Boolean);
  const currentType = typeSelect.value;
  
  typeSelect.innerHTML = '<option value="">-- Select Type --</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
  if (types.includes(currentType)) typeSelect.value = currentType;
  
  typeSelect.onchange = () => {
    const selectedType = typeSelect.value;
    const sizes = cacheArray.filter(o => o.parent_value === selectedType).map(o => o.value);
    sizeSelect.innerHTML = '<option value="">-- Select Size --</option>' + sizes.map(s => `<option value="${s}">${s}</option>`).join('');
  };
  
  typeSelect.onchange();
}

function openAdd() {
  const cat = activeTab;
  if (cat === 'Technical') {
    openAddTechnical();
  } else if (cat === 'Bottles') {
    openAddBottle();
  } else if (cat === 'Boxes') {
    openAddBox();
  } else if (cat === 'Labels') {
    openAddLabel();
  } else if (cat === 'Others') {
    openAddOther();
  } else {
    APP.openModal('category-selector-modal');
  }
}

function selectCategoryForAdd(cat) {
  APP.closeModal('category-selector-modal');
  setTimeout(() => {
    if (cat === 'Technical') openAddTechnical();
    else if (cat === 'Bottles') openAddBottle();
    else if (cat === 'Boxes') openAddBox();
    else if (cat === 'Labels') openAddLabel();
    else if (cat === 'Others') openAddOther();
  }, 150);
}

function toggleOpeningStockSection() {
  const openingSections = document.querySelectorAll('.opening-stock-section');
  openingSections.forEach(sec => {
    sec.style.display = 'grid';
  });
}

function openAddTechnical() {
  editingItemId = null;
  document.getElementById('technical-modal-title').textContent = 'Add Technical Item';
  const form = document.getElementById('technical-form');
  if (form) form.reset();
  toggleOpeningStockSection();
  goToInventoryStep('technical', 1);
  APP.openModal('technical-modal');
}

function openAddBottle() {
  editingItemId = null;
  document.getElementById('bottle-modal-title').textContent = 'Add Bottle Option';
  const form = document.getElementById('bottle-form');
  if (form) form.reset();
  populateDependentTypes(masterCache.bottles, 'tech-bottle-type-select', 'tech-bottle-size-select');
  toggleOpeningStockSection();
  goToInventoryStep('bottle', 1);
  APP.openModal('bottle-modal');
}

function openAddBox() {
  editingItemId = null;
  document.getElementById('box-modal-title').textContent = 'Add Box Option';
  const form = document.getElementById('box-form');
  if (form) form.reset();
  populateDependentTypes(masterCache.boxes, 'tech-box-type-select', 'tech-box-size-select');
  toggleOpeningStockSection();
  goToInventoryStep('box', 1);
  APP.openModal('box-modal');
}

function openAddLabel() {
  editingItemId = null;
  document.getElementById('label-modal-title').textContent = 'Add Label Option';
  const form = document.getElementById('label-form');
  if (form) form.reset();
  populateDependentTypes(masterCache.bottles, 'tech-label-type-select', 'tech-label-size-select');
  toggleOpeningStockSection();
  goToInventoryStep('label', 1);
  APP.openModal('label-modal');
}

function openAddOther() {
  editingItemId = null;
  document.getElementById('other-modal-title').textContent = 'Add Other Item';
  const form = document.getElementById('other-form');
  if (form) form.reset();
  toggleOpeningStockSection();
  goToInventoryStep('other', 1);
  APP.openModal('other-modal');
}

async function openEdit(type, id) {
  editingItemId = id;
  try {
    const res = await fetch(`/api/inventory/${id}`);
    if (!res.ok) throw new Error('Failed to load item info');
    const it = await res.json();

    toggleOpeningStockSection();

    const openingQty = it.opening_qty || '';
    const openingCost = it.opening_cost || '';
    const openingBatchNo = it.opening_batch_no || '';

    if (it.category === 'Technical') {
      goToInventoryStep('technical', 1);
      document.getElementById('technical-modal-title').textContent = 'Edit Technical Item';
      UTILS.populateForm('technical-form', it);
      await loadMasterOptions();
      const typeSelect = document.querySelector('#technical-form [name="item_type"]');
      if (typeSelect) typeSelect.value = type;
      
      const qtyField = document.querySelector('#technical-form [name="opening_qty"]');
      if (qtyField) qtyField.value = openingQty;
      const costField = document.querySelector('#technical-form [name="opening_cost"]');
      if (costField) costField.value = openingCost;
      const batchField = document.querySelector('#technical-form [name="opening_batch_no"]');
      if (batchField) batchField.value = openingBatchNo;
      
      APP.openModal('technical-modal');
    } else if (it.category === 'Bottles') {
      goToInventoryStep('bottle', 1);
      document.getElementById('bottle-modal-title').textContent = 'Edit Bottle Option';
      document.getElementById('bottle-form').reset();
      populateDependentTypes(masterCache.bottles, 'tech-bottle-type-select', 'tech-bottle-size-select');
      
      document.getElementById('tech-bottle-type-select').value = it.item_subtype || '';
      document.getElementById('tech-bottle-type-select').onchange();
      document.getElementById('tech-bottle-size-select').value = it.item_size || '';
      
      const descField = document.querySelector('#bottle-form [name="description"]');
      if (descField) descField.value = it.description || '';
      
      const qtyField = document.querySelector('#bottle-form [name="opening_qty"]');
      if (qtyField) qtyField.value = openingQty;
      const costField = document.querySelector('#bottle-form [name="opening_cost"]');
      if (costField) costField.value = openingCost;
      const batchField = document.querySelector('#bottle-form [name="opening_batch_no"]');
      if (batchField) batchField.value = openingBatchNo;
      
      APP.openModal('bottle-modal');
    } else if (it.category === 'Boxes') {
      goToInventoryStep('box', 1);
      document.getElementById('box-modal-title').textContent = 'Edit Box Option';
      document.getElementById('box-form').reset();
      populateDependentTypes(masterCache.boxes, 'tech-box-type-select', 'tech-box-size-select');
      
      document.getElementById('tech-box-type-select').value = it.item_subtype || '';
      document.getElementById('tech-box-type-select').onchange();
      document.getElementById('tech-box-size-select').value = it.item_size || '';
      
      const descField = document.querySelector('#box-form [name="description"]');
      if (descField) descField.value = it.description || '';
      
      const qtyField = document.querySelector('#box-form [name="opening_qty"]');
      if (qtyField) qtyField.value = openingQty;
      const costField = document.querySelector('#box-form [name="opening_cost"]');
      if (costField) costField.value = openingCost;
      const batchField = document.querySelector('#box-form [name="opening_batch_no"]');
      if (batchField) batchField.value = openingBatchNo;
      
      APP.openModal('box-modal');
    } else if (it.category === 'Labels') {
      goToInventoryStep('label', 1);
      document.getElementById('label-modal-title').textContent = 'Edit Label Option';
      document.getElementById('label-form').reset();
      populateDependentTypes(masterCache.bottles, 'tech-label-type-select', 'tech-label-size-select');
      
      document.getElementById('tech-label-type-select').value = it.item_subtype || '';
      document.getElementById('tech-label-type-select').onchange();
      document.getElementById('tech-label-size-select').value = it.item_size || '';
      
      const descField = document.querySelector('#label-form [name="description"]');
      if (descField) descField.value = it.description || '';
      
      const qtyField = document.querySelector('#label-form [name="opening_qty"]');
      if (qtyField) qtyField.value = openingQty;
      const costField = document.querySelector('#label-form [name="opening_cost"]');
      if (costField) costField.value = openingCost;
      const batchField = document.querySelector('#label-form [name="opening_batch_no"]');
      if (batchField) batchField.value = openingBatchNo;
      
      APP.openModal('label-modal');
    } else {
      goToInventoryStep('other', 1);
      document.getElementById('other-modal-title').textContent = 'Edit Other Item';
      UTILS.populateForm('other-form', it);
      const typeSelect = document.querySelector('#other-form [name="item_type"]');
      if (typeSelect) typeSelect.value = type;
      
      const qtyField = document.querySelector('#other-form [name="opening_qty"]');
      if (qtyField) qtyField.value = openingQty;
      const costField = document.querySelector('#other-form [name="opening_cost"]');
      if (costField) costField.value = openingCost;
      const batchField = document.querySelector('#other-form [name="opening_batch_no"]');
      if (batchField) batchField.value = openingBatchNo;
      
      APP.openModal('other-modal');
    }
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to load item data: ' + err.message, 'error');
  }
}

async function saveInventoryItemAPI(payload) {
  try {
    const url = editingItemId ? `/api/inventory/${editingItemId}` : '/api/inventory';
    const method = editingItemId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Failed to save item');
    return result;
  } catch (err) {
    throw err;
  }
}

async function saveTechnicalItem() {
  const d = UTILS.getFormData('technical-form');
  if (!d.name) { APP.showToast('Technical name is required', 'error'); return; }
  try {
    const payload = {
      name: d.name,
      category: 'Technical',
      unit: d.unit,
      description: d.description,
      opening_qty: d.opening_qty,
      opening_cost: d.opening_cost,
      opening_batch_no: d.opening_batch_no
    };
    await saveInventoryItemAPI(payload);
    APP.showToast(editingItemId ? 'Technical updated!' : 'Technical added!', 'success');
    APP.closeModal('technical-modal');
    setTimeout(() => loadInventory(), 100);
  } catch (err) {
    console.error('saveTechnicalItem failed:', err);
    APP.showToast('Error saving technical item: ' + err.message, 'error');
  }
}

async function saveBottleItem() {
  const d = UTILS.getFormData('bottle-form');
  if (!d.bottle_type || !d.bottle_size) { APP.showToast('Bottle type and size are required', 'error'); return; }
  
  const name = `${d.bottle_type} Bottle ${d.bottle_size}`;
  const unit = 'Nos';
  
  try {
    const payload = {
      name,
      category: 'Bottles',
      unit,
      description: d.description,
      item_subtype: d.bottle_type,
      item_size: d.bottle_size,
      opening_qty: d.opening_qty,
      opening_cost: d.opening_cost,
      opening_batch_no: d.opening_batch_no
    };
    await saveInventoryItemAPI(payload);
    APP.showToast(editingItemId ? 'Bottle updated!' : 'Bottle added!', 'success');
    APP.closeModal('bottle-modal');
    setTimeout(() => loadInventory(), 100);
  } catch (err) {
    console.error('saveBottleItem failed:', err);
    APP.showToast('Error saving bottle: ' + err.message, 'error');
  }
}

async function saveBoxItem() {
  const d = UTILS.getFormData('box-form');
  if (!d.box_type || !d.box_size) { APP.showToast('Box type and size are required', 'error'); return; }
  
  const name = `${d.box_type} Box ${d.box_size}`;
  const unit = 'Nos';
  
  try {
    const payload = {
      name,
      category: 'Boxes',
      unit,
      description: d.description,
      item_subtype: d.box_type,
      item_size: d.box_size,
      opening_qty: d.opening_qty,
      opening_cost: d.opening_cost,
      opening_batch_no: d.opening_batch_no
    };
    await saveInventoryItemAPI(payload);
    APP.showToast(editingItemId ? 'Box updated!' : 'Box added!', 'success');
    APP.closeModal('box-modal');
    setTimeout(() => loadInventory(), 100);
  } catch (err) {
    console.error('saveBoxItem failed:', err);
    APP.showToast('Error saving box: ' + err.message, 'error');
  }
}

async function saveLabelItem() {
  const d = UTILS.getFormData('label-form');
  if (!d.label_type || !d.label_size) { APP.showToast('Label type and size are required', 'error'); return; }
  
  const name = `${d.label_type} Label ${d.label_size}`;
  const unit = 'Nos';
  
  try {
    const payload = {
      name,
      category: 'Labels',
      unit,
      description: d.description,
      item_subtype: d.label_type,
      item_size: d.label_size,
      opening_qty: d.opening_qty,
      opening_cost: d.opening_cost,
      opening_batch_no: d.opening_batch_no
    };
    await saveInventoryItemAPI(payload);
    APP.showToast(editingItemId ? 'Label updated!' : 'Label added!', 'success');
    APP.closeModal('label-modal');
    setTimeout(() => loadInventory(), 100);
  } catch (err) {
    console.error('saveLabelItem failed:', err);
    APP.showToast('Error saving label: ' + err.message, 'error');
  }
}

async function saveOtherItem() {
  const d = UTILS.getFormData('other-form');
  if (!d.name || !d.unit) { APP.showToast('Item name and unit are required', 'error'); return; }
  try {
    const payload = {
      name: d.name,
      category: 'Others',
      unit: d.unit,
      description: d.description,
      opening_qty: d.opening_qty,
      opening_cost: d.opening_cost,
      opening_batch_no: d.opening_batch_no
    };
    await saveInventoryItemAPI(payload);
    APP.showToast(editingItemId ? 'Item updated!' : 'Item added!', 'success');
    APP.closeModal('other-modal');
    setTimeout(() => loadInventory(), 100);
  } catch (err) {
    console.error('saveOtherItem failed:', err);
    APP.showToast('Error saving item: ' + err.message, 'error');
  }
}

/* ─── MASTER OPTIONS LOGIC ─── */
function openInventoryOptionManager() {
  const cat = activeTab;
  if (cat === 'Technical') {
    renderTechnicalUnits();
    APP.openModal('technical-unit-manager-modal');
  } else if (cat === 'Bottles') {
    renderGroupedOptions('bottle_option', 'bottle-options-groups', 'editBottleOption', 'deleteMasterOption');
    APP.openModal('bottle-manager-modal');
  } else if (cat === 'Boxes') {
    renderGroupedOptions('box_option', 'box-options-groups', 'editBoxOption', 'deleteMasterOption');
    APP.openModal('box-manager-modal');
  } else if (cat === 'Labels') {
    renderGroupedOptions('bottle_option', 'bottle-options-groups', 'editBottleOption', 'deleteMasterOption');
    APP.openModal('bottle-manager-modal');
  } else {
    APP.showToast('Please select the Technical, Bottles, Boxes, or Labels tab to manage options.', 'info');
  }
}

async function renderTechnicalUnits() {
  const el = document.getElementById('technical-unit-groups');
  if (!el) return;
  try {
    const res = await fetch('/api/master-options');
    const all = await res.json();
    const opts = all.filter(o => o.category === 'technical_unit').sort((a,b) => a.value.localeCompare(b.value));
    
    let html = `<div style="display:flex;flex-direction:column;gap:8px;">`;
    opts.forEach(o => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);">
        <div style="font-size:14px;font-weight:700">${o.value}</div>
        <div style="display:flex;gap:12px;">
          <button class="action-btn edit" onclick="editTechnicalUnit(${o.id}, '${o.value}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="action-btn delete" onclick="deleteMasterOption(${o.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
        </div>
      </div>`;
    });
    html += `</div>`;
    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = '<div style="color:var(--danger)">Failed to load units</div>';
  }
}

async function renderGroupedOptions(category, containerId, editFuncStr, delFuncStr) {
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    const res = await fetch('/api/master-options');
    const all = await res.json();
    const opts = all.filter(o => o.category === category).sort((a,b) => (a.parent_value || '').localeCompare(b.parent_value || ''));
    
    const grouped = {};
    opts.forEach(o => {
      if (!grouped[o.parent_value]) grouped[o.parent_value] = [];
      grouped[o.parent_value].push(o);
    });
    
    let html = `<div style="display:flex;flex-direction:column;gap:16px;">`;
    for (const [parent, items] of Object.entries(grouped)) {
      html += `<div style="border:1px solid var(--border); border-radius:var(--radius); overflow:hidden;">`;
      html += `<div style="padding:16px 20px; background:rgba(255,255,255,0.02); border-bottom:1px solid var(--border); font-size:14px; font-weight:800; letter-spacing:0.05em; text-transform:uppercase;">${parent}</div>`;
      html += `<div style="padding:16px; display:flex; flex-direction:column; gap:8px;">`;
      items.forEach(o => {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);">
          <div><div style="font-size:10px;color:var(--text-muted);font-weight:700;margin-bottom:4px;letter-spacing:0.05em;">SIZE</div><div style="font-size:16px;font-weight:700">${o.value}</div></div>
          <div style="display:flex;gap:12px;">
            <button class="action-btn edit" onclick="${editFuncStr}(${o.id}, '${o.parent_value.replace(/'/g, "\\'")}', '${o.value.replace(/'/g, "\\'")}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="action-btn delete" onclick="${delFuncStr}(${o.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
          </div>
        </div>`;
      });
      html += `</div></div>`;
    }
    html += `</div>`;
    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = '<div style="color:var(--danger)">Failed to load grouped options</div>';
  }
}

// Technical Unit Manager
async function saveTechnicalUnit() {
  const id = document.getElementById('technical-unit-id').value;
  const unit = document.getElementById('technical-unit-input').value.trim();
  if (!unit) { APP.showToast('Unit is required', 'error'); return; }
  
  try {
    const payload = { category: 'technical_unit', value: unit };
    const url = id ? `/api/master-options/${id}` : '/api/master-options';
    const method = id ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Failed to save technical unit');
    
    APP.showToast('Unit saved', 'success');
    resetTechnicalUnitManagerForm();
    await renderTechnicalUnits();
    await loadMasterOptions();
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to save unit: ' + err.message, 'error');
  }
}

function editTechnicalUnit(id, value) {
  document.getElementById('technical-unit-id').value = id;
  document.getElementById('technical-unit-input').value = value;
}

function resetTechnicalUnitManagerForm() {
  document.getElementById('technical-unit-manager-form').reset();
  document.getElementById('technical-unit-id').value = '';
}

// Bottle Option Manager
async function saveBottleOption() {
  const id = document.getElementById('bottle-option-id').value;
  const type = document.getElementById('bottle-type-input').value.trim();
  const size = document.getElementById('bottle-size-input').value.trim();
  
  if (!type || !size) { APP.showToast('Type and size are required', 'error'); return; }
  
  try {
    const payload = { category: 'bottle_option', parent_value: type, value: size };
    const url = id ? `/api/master-options/${id}` : '/api/master-options';
    const method = id ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Failed to save bottle option');
    
    APP.showToast(id ? 'Option updated successfully' : 'Option added successfully', 'success');
    resetBottleManagerForm();
    await renderGroupedOptions('bottle_option', 'bottle-options-groups', 'editBottleOption', 'deleteMasterOption');
    await loadMasterOptions();
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to save bottle option: ' + err.message, 'error');
  }
}

function editBottleOption(id, type, size) {
  document.getElementById('bottle-option-id').value = id;
  document.getElementById('bottle-type-input').value = type;
  document.getElementById('bottle-size-input').value = size;
}

function resetBottleManagerForm() {
  document.getElementById('bottle-manager-form').reset();
  document.getElementById('bottle-option-id').value = '';
}

// Box Option Manager
async function saveBoxOption() {
  const id = document.getElementById('box-option-id').value;
  const type = document.getElementById('box-type-input').value.trim();
  const size = document.getElementById('box-size-input').value.trim();
  
  if (!type || !size) { APP.showToast('Type and size are required', 'error'); return; }
  
  try {
    const payload = { category: 'box_option', parent_value: type, value: size };
    const url = id ? `/api/master-options/${id}` : '/api/master-options';
    const method = id ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Failed to save box option');
    
    APP.showToast(id ? 'Option updated successfully' : 'Option added successfully', 'success');
    resetBoxManagerForm();
    await renderGroupedOptions('box_option', 'box-options-groups', 'editBoxOption', 'deleteMasterOption');
    await loadMasterOptions();
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to save box option: ' + err.message, 'error');
  }
}

function editBoxOption(id, type, size) {
  document.getElementById('box-option-id').value = id;
  document.getElementById('box-type-input').value = type;
  document.getElementById('box-size-input').value = size;
}

function resetBoxManagerForm() {
  document.getElementById('box-manager-form').reset();
  document.getElementById('box-option-id').value = '';
}

async function deleteMasterOption(id) {
  APP.showConfirm('Delete this option?', async () => {
    try {
      const res = await fetch(`/api/master-options/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to delete option');
      
      APP.showToast('Option deleted', 'success');
      
      const cat = activeTab;
      if (cat === 'Technical') await renderTechnicalUnits();
      if (cat === 'Bottles') await renderGroupedOptions('bottle_option', 'bottle-options-groups', 'editBottleOption', 'deleteMasterOption');
      if (cat === 'Boxes') await renderGroupedOptions('box_option', 'box-options-groups', 'editBoxOption', 'deleteMasterOption');
      
      await loadMasterOptions();
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete option: ' + err.message, 'error');
    }
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => { 
  btn.addEventListener('click', () => { 
    document.querySelector('.tab-btn.active').classList.remove('active'); 
    btn.classList.add('active'); 
    activeTab = btn.dataset.tab; 
    renderTable(allInventory); 
  }); 
});

document.getElementById('search-input')?.addEventListener('input', () => renderTable(allInventory));

loadInventory();

let inventoryFormSteps = { technical: 1, bottle: 1, box: 1, label: 1, other: 1 };

function goToInventoryStep(type, step) {
  inventoryFormSteps[type] = Math.max(1, Math.min(2, step));
  const currentStep = inventoryFormSteps[type];

  document.querySelectorAll('#' + type + '-modal .product-step-panel').forEach(panel => {
    panel.classList.toggle('active', Number(panel.dataset.stepPanel) === currentStep);
  });

  const modalBody = document.querySelector('#' + type + '-modal .modal-body');
  if (modalBody) modalBody.scrollTop = 0;

  const isStepOne = currentStep === 1;
  const pill1 = document.getElementById(type + '-step-pill-1');
  const pill2 = document.getElementById(type + '-step-pill-2');
  if(pill1) pill1.classList.toggle('active', isStepOne);
  if(pill2) pill2.classList.toggle('active', !isStepOne);

  const prevBtn = document.getElementById(type + '-prev-btn');
  const nextBtn = document.getElementById(type + '-next-btn');
  const saveBtn = document.getElementById(type + '-save-btn');
  if (prevBtn) prevBtn.style.display = isStepOne ? 'none' : 'inline-flex';
  if (nextBtn) nextBtn.style.display = isStepOne ? 'inline-flex' : 'none';
  if (saveBtn) saveBtn.style.display = isStepOne ? 'none' : 'inline-flex';
}

function inventoryFormNextStep(type) {
  const d = UTILS.getFormData(type + '-form');
  if (type === 'technical' && !d.name) {
    APP.showToast('Please enter technical name before continuing', 'error');
    return;
  }
  if (type === 'bottle' && (!d.bottle_type || !d.bottle_size)) {
    APP.showToast('Please select bottle type and size before continuing', 'error');
    return;
  }
  if (type === 'box' && (!d.box_type || !d.box_size)) {
    APP.showToast('Please select box type and size before continuing', 'error');
    return;
  }
  if (type === 'label' && (!d.label_type || !d.label_size)) {
    APP.showToast('Please select label type and size before continuing', 'error');
    return;
  }
  if (type === 'other' && !d.name) {
    APP.showToast('Please enter item name before continuing', 'error');
    return;
  }
  goToInventoryStep(type, 2);
}
