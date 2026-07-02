/* transactions.js */
let allTransactions = [], editingTxnId = null;

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadTransactions() {
  console.log('Loading transactions...');
  updatePageDebug('Loading Transactions...', '#10B981');
  
  try {
    UTILS.renderTableSkeleton('txn-table');
    UTILS.setSkeletonText('total-receipts', 'w-50', true);
    UTILS.setSkeletonText('total-payments', 'w-50', true);
    UTILS.setSkeletonText('net-balance', 'w-50', true);
    
    await DB.initDB();
    
    const res = await fetch('/api/transactions');
    if (!res.ok) throw new Error('Failed to fetch transactions');
    allTransactions = await res.json();
    
    renderTable(allTransactions);
    renderSummary(allTransactions);
    
    updatePageDebug('Ready (' + allTransactions.length + ')', '#10B981');
    console.log('Transactions: All data loaded successfully');
  } catch (err) {
    console.error('Transactions loadTransactions failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load transactions: ' + err.message, 'error');
    renderTable([]);
  }
}

function renderTable(data) {
  const tbody = document.querySelector('#txn-table tbody');
  if (!tbody) return;
  document.getElementById('total-info').textContent = `${data.length} transaction${data.length !== 1 ? 's' : ''}`;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span aria-hidden="true" style="font-size:28px;font-weight:800;line-height:1;color:var(--accent)">₹</span><h3>No transactions</h3><p>Record your first payment.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(t => `<tr>
    <td><input type="checkbox" class="row-check" value="${t.id}"></td>
    <td>${UTILS.fmtDate(t.date)}</td>
    <td><span class="badge ${t.type === 'Receipt' ? 'badge-success' : 'badge-danger'}">${t.type}</span></td>
    <td>${t.ref_no || '—'}</td>
    <td class="cell-bold">${t.party_name || '—'}</td>
    <td><span class="badge badge-gray">${t.mode}</span></td>
    <td class="cell-amount ${t.type === 'Receipt' ? 'positive' : 'negative'}">${UTILS.fmtCurrency(t.amount)}</td>
    <td><div class="row-actions">
      <button class="action-btn edit" onclick="openEdit(${t.id})" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="action-btn delete" onclick="deleteTxn(${t.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
    </div></td>
  </tr>`).join('');
  UTILS.applyMobileTableLabels('txn-table');
}

function renderSummary(data) {
  const receipts = data.filter(t => t.type === 'Receipt').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const payments = data.filter(t => t.type === 'Payment').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const receiptCount = data.filter(t => t.type === 'Receipt').length;
  const paymentCount = data.filter(t => t.type === 'Payment').length;
  const net = receipts - payments;
  document.getElementById('total-receipts').textContent = UTILS.fmtCurrency(receipts);
  document.getElementById('total-payments').textContent = UTILS.fmtCurrency(payments);
  document.getElementById('net-balance').textContent = UTILS.fmtCurrency(net);
  const netEl = document.getElementById('net-balance');
  if (netEl) netEl.style.color = net >= 0 ? 'var(--success)' : 'var(--danger)';

  const receiptMetaEl = document.getElementById('receipt-meta');
  if (receiptMetaEl) receiptMetaEl.textContent = receiptCount ? `${receiptCount} receipt${receiptCount === 1 ? '' : 's'} recorded` : 'Incoming cash collected';

  const paymentMetaEl = document.getElementById('payment-meta');
  if (paymentMetaEl) paymentMetaEl.textContent = paymentCount ? `${paymentCount} payment${paymentCount === 1 ? '' : 's'} recorded` : 'Payments Made';

  const netMetaEl = document.getElementById('net-balance-meta');
  if (netMetaEl) {
    netMetaEl.textContent = net > 0
      ? 'Receipts are ahead of payments'
      : net < 0
        ? 'Payments are ahead of receipts'
        : 'Receipts and payments are even';
    netMetaEl.style.color = net > 0 ? 'var(--success)' : net < 0 ? 'var(--danger)' : 'var(--text-secondary)';
  }
}

function openAdd() {
  editingTxnId = null;
  document.getElementById('modal-title').textContent = 'Record Transaction';
  document.getElementById('txn-form').reset();
  document.getElementById('txn-date-field').value = UTILS.todayStr();
  APP.openModal('txn-modal');
}

function openEdit(id) {
  editingTxnId = id;
  const t = allTransactions.find(x => x.id === id);
  if (!t) return;
  document.getElementById('modal-title').textContent = 'Edit Transaction';
  UTILS.populateForm('txn-form', t);
  APP.openModal('txn-modal');
}

async function saveTxn() {
  const d = UTILS.getFormData('txn-form');
  if (!d.type || !d.amount || !d.date) { APP.showToast('Type, amount and date are required', 'error'); return; }
  
  try {
    const payload = {
      type: d.type,
      ref_no: d.ref_no || '',
      ref_type: 'Manual',
      party_name: d.party_name || '',
      amount: parseFloat(d.amount),
      mode: d.mode || 'Cash',
      date: d.date,
      notes: d.notes || ''
    };

    const url = editingTxnId ? `/api/transactions/${editingTxnId}` : '/api/transactions';
    const method = editingTxnId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Failed to save transaction');

    APP.showToast(editingTxnId ? 'Transaction updated!' : 'Transaction recorded!', 'success');
    APP.closeModal('txn-modal');
    setTimeout(() => loadTransactions(), 100);
  } catch (err) {
    console.error('saveTxn failed:', err);
    APP.showToast('Error saving transaction: ' + err.message, 'error');
  }
}

async function deleteTxn(id) {
  APP.showConfirm('Delete this transaction?', async () => {
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to delete transaction');
      
      APP.showToast('Transaction deleted.', 'warning');
      setTimeout(() => loadTransactions(), 100);
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete transaction: ' + err.message, 'error');
    }
  });
}

document.getElementById('search-input')?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderTable(q ? allTransactions.filter(t => `${t.type} ${t.ref_no} ${t.party_name} ${t.mode}`.toLowerCase().includes(q)) : allTransactions);
});

document.getElementById('type-filter')?.addEventListener('change', e => {
  const t = e.target.value;
  renderTable(t ? allTransactions.filter(x => x.type === t) : allTransactions);
});

loadTransactions();
