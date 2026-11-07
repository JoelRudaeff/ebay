const API = '/api';

const state = {
  token: localStorage.getItem('admin_token') || null,
};

function money(cents) { return `$${(cents / 100).toFixed(2)}`; }

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), 3000);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const resp = await fetch(`${API}${path}`, { ...options, headers });
  if (resp.status === 204) return null;
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------------- Auth ----------------
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadOverview();
}
function showLogin() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }) });
    if (data.user.role !== 'admin') {
      errEl.textContent = 'This account does not have admin access.';
      return;
    }
    state.token = data.token;
    localStorage.setItem('admin_token', data.token);
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  state.token = null;
  localStorage.removeItem('admin_token');
  showLogin();
});

// ---------------- Navigation ----------------
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`view-${btn.dataset.view}`).classList.remove('hidden');
    if (btn.dataset.view === 'overview') loadOverview();
    if (btn.dataset.view === 'products') loadProducts();
    if (btn.dataset.view === 'orders') loadOrders();
    if (btn.dataset.view === 'users') loadUsers();
  });
});

// ---------------- Overview ----------------
async function loadOverview() {
  try {
    const summary = await api('/admin/summary');
    document.getElementById('statUsers').textContent = summary.userCount;
    document.getElementById('statProducts').textContent = summary.activeProductCount;
    document.getElementById('statOrders').textContent = summary.orderCount;
    document.getElementById('statRevenue').textContent = money(summary.revenueCents);
  } catch (err) {
    showToast(err.message);
  }

  try {
    const events = await api('/stats/events-summary');
    document.getElementById('eventsTotal').textContent = events.totalLast24h;
    const tbody = document.querySelector('#eventsByTypeTable tbody');
    tbody.innerHTML = '';
    (events.byType || []).forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(row.type)}</td><td>${row.count}</td>`;
      tbody.appendChild(tr);
    });
    if (!events.byType?.length) {
      tbody.innerHTML = '<tr><td colspan="2">No events indexed yet. Browse the storefront to generate some.</td></tr>';
    }
  } catch (err) {
    showToast(err.message);
  }
}

// ---------------- Products ----------------
async function loadProducts() {
  const products = await api('/admin/products');
  const tbody = document.getElementById('productsTable');
  tbody.innerHTML = '';
  products.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.title)}</td>
      <td>${escapeHtml(p.seller_name || '-')}</td>
      <td><input type="number" min="0" step="0.01" value="${(p.price_cents / 100).toFixed(2)}" data-field="price" style="width:80px" /></td>
      <td><input type="number" min="0" value="${p.stock_qty}" data-field="stock" style="width:60px" /></td>
      <td><span class="pill ${p.active ? 'active' : 'inactive'}">${p.active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button data-action="save">Save</button>
        <button data-action="toggle">${p.active ? 'Deactivate' : 'Activate'}</button>
      </td>`;
    tr.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const price = parseFloat(tr.querySelector('[data-field="price"]').value);
      const stock = parseInt(tr.querySelector('[data-field="stock"]').value, 10);
      try {
        await api(`/admin/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ priceCents: Math.round(price * 100), stockQty: stock }) });
        showToast('Product updated');
      } catch (err) {
        showToast(err.message);
      }
    });
    tr.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
      try {
        await api(`/admin/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) });
        loadProducts();
      } catch (err) {
        showToast(err.message);
      }
    });
    tbody.appendChild(tr);
  });
}

// ---------------- Orders ----------------
async function loadOrders() {
  const orders = await api('/admin/orders');
  const tbody = document.getElementById('ordersTable');
  tbody.innerHTML = '';
  orders.forEach((o) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${o.id}</td>
      <td>${escapeHtml(o.buyer_email || '-')}</td>
      <td>${escapeHtml(o.status)}</td>
      <td>${money(o.total_cents)}</td>
      <td>${new Date(o.created_at).toLocaleString()}</td>`;
    tbody.appendChild(tr);
  });
}

// ---------------- Users ----------------
async function loadUsers() {
  const users = await api('/admin/users');
  const tbody = document.getElementById('usersTable');
  tbody.innerHTML = '';
  users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.display_name)}</td>
      <td>
        <select data-role>
          <option value="buyer" ${u.role === 'buyer' ? 'selected' : ''}>Buyer</option>
          <option value="seller" ${u.role === 'seller' ? 'selected' : ''}>Seller</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
      <td>${new Date(u.created_at).toLocaleDateString()}</td>
      <td><button data-action="save-role">Save</button></td>`;
    tr.querySelector('[data-action="save-role"]').addEventListener('click', async () => {
      const role = tr.querySelector('[data-role]').value;
      try {
        await api(`/admin/users/${u.id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
        showToast('Role updated');
      } catch (err) {
        showToast(err.message);
      }
    });
    tbody.appendChild(tr);
  });
}

// ---------------- Init ----------------
(function init() {
  if (state.token) {
    showApp();
  } else {
    showLogin();
  }
})();
