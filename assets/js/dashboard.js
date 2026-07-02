/* dashboard.js */
let revenueChart = null;
let categoryChart = null;

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadDashboard() {
  console.log('Loading dashboard...');
  updatePageDebug('Initializing...', '#10B981');
  
  try {
    renderDashboardSkeleton();
    await DB.initDB();
    
    const res = await fetch('/api/dashboard/stats');
    if (!res.ok) throw new Error('Failed to fetch dashboard stats');
    const stats = await res.json();
    
    // 1. Render KPIs
    const kpis = stats.kpis || {};
    
    const kpiRevenue = document.getElementById('kpi-revenue');
    if (kpiRevenue) kpiRevenue.textContent = UTILS.fmtCurrency(kpis.revenue || 0);
    
    const kpiOrders = document.getElementById('kpi-orders');
    if (kpiOrders) kpiOrders.textContent = kpis.activeOrders || 0;
    
    const kpiProducts = document.getElementById('kpi-products');
    if (kpiProducts) kpiProducts.textContent = kpis.productsCount || 0;
    
    const kpiClients = document.getElementById('kpi-clients');
    if (kpiClients) kpiClients.textContent = kpis.clientsCount || 0;
    
    const kpiLowStock = document.getElementById('kpi-low-stock');
    if (kpiLowStock) {
      const lowStockCount = kpis.lowStockCount || 0;
      kpiLowStock.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg> ${lowStockCount} low stock`;
      kpiLowStock.className = lowStockCount > 0 ? 'stat-trend down' : 'stat-trend up';
    }
    
    const badge = document.getElementById('pending-badge');
    if (badge) { 
      badge.textContent = kpis.activeOrders || 0; 
      badge.style.display = kpis.activeOrders ? '' : 'none'; 
    }

    // 2. Render Charts
    renderRevenueChart(stats.monthlySalesTrend || Array(12).fill(0));
    renderCategoryChart(stats.categoryDistribution || []);

    // 3. Render Activities & Alerts
    renderRecentActivities(stats.recentActivities || []);
    renderStockAlerts(stats.stockAlerts || []);
    
    console.log('Dashboard: All data loaded successfully');
    updatePageDebug('Ready', '#10B981');
    
  } catch (err) {
    console.error('Dashboard loadDashboard failed:', err);
    updatePageDebug('FAILED: ' + (err.message || 'Unknown error'), '#EF4444');
    APP.showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}

function renderDashboardSkeleton() {
  ['kpi-revenue', 'kpi-orders', 'kpi-products', 'kpi-clients'].forEach(id => UTILS.setSkeletonText(id, 'w-50', true));
  UTILS.setSkeletonText('kpi-low-stock', 'w-40');
  UTILS.renderListSkeleton('recent-orders-list', 5);
  UTILS.renderListSkeleton('stock-alerts-list', 4);
}

function renderRevenueChart(data) {
  const ctx = document.getElementById('revenue-chart');
  if (!ctx) return;
  
  UTILS.destroyChart(revenueChart);
  const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  
  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Revenue (₹)', data, backgroundColor: 'rgba(124,58,237,0.15)', borderColor: '#7C3AED', borderWidth: 2, borderRadius: 8 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

function renderCategoryChart(data) {
  const ctx = document.getElementById('category-chart');
  if (!ctx) return;
  
  UTILS.destroyChart(categoryChart);
  
  const labels = data.map(d => d.category || 'Unknown').filter(Boolean);
  const values = data.map(d => parseFloat(d.val || 0));
  
  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: { 
      labels: labels.length > 0 ? labels : ['No Data'], 
      datasets: [{ 
        data: values.length > 0 ? values : [1], 
        backgroundColor: ['#7C3AED','#10B981','#10B981','#EF4444','#3B82F6','#EC4899'] 
      }] 
    },
    options: { responsive: true, cutout: '70%', plugins: { legend: { display: labels.length > 0 } } }
  });
}

function renderRecentActivities(activities) {
  const el = document.getElementById('recent-orders-list');
  if (!el) return;
  
  if (!activities || activities.length === 0) { 
    el.innerHTML = '<p class="text-muted text-sm">No orders yet.</p>'; 
    return; 
  }
  
  el.innerHTML = activities.map(o => {
    return `<div class="activity-item">
      <div class="activity-dot ${o.status === 'Delivered' ? 'green' : 'yellow'}"></div>
      <div class="activity-text">
        <strong>${o.identifier || 'N/A'}</strong> — ${o.client_name || 'Guest'}
        <p>${UTILS.fmtDate(o.date)} • ${UTILS.fmtCurrency(o.total_amount)}</p>
      </div>
      <div>${UTILS.statusBadge(o.status)}</div>
    </div>`;
  }).join('');
}

function renderStockAlerts(alerts) {
  const el = document.getElementById('stock-alerts-list');
  if (!el) return;
  
  if (!alerts || alerts.length === 0) { 
    el.innerHTML = '<p class="text-success text-sm">All stock levels healthy!</p>'; 
    return; 
  }
  
  el.innerHTML = alerts.map(p => {
    return `<div class="stock-alert-item">
      <div class="stock-alert-content">
        <div class="stock-alert-name">${p.name || 'Unknown'}</div>
        <div class="stock-alert-meta">${parseFloat(p.stock || 0).toFixed(1)} / ${p.reorder_level} ${p.unit || ''}</div>
      </div>
      <span class="badge badge-danger">Low</span>
    </div>`;
  }).join('');
}

loadDashboard();
