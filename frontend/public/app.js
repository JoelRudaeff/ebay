const API = '/api';

const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  categories: [],
  activeCategory: '',
  searchTerm: '',
  sort: 'newest',
};

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

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

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal').forEach((modal) => {
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
});

// ---------------- Auth ----------------
function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  refreshAuthUI();
}
function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  refreshAuthUI();
}
function refreshAuthUI() {
  const greeting = document.getElementById('userGreeting');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const sellBtn = document.getElementById('sellBtn');
  if (state.user) {
    greeting.textContent = `Hi, ${state.user.displayName}${state.user.role === 'admin' ? ' (admin)' : ''}`;
    greeting.classList.remove('hidden');
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    sellBtn.classList.remove('hidden');
  } else {
    greeting.classList.add('hidden');
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    sellBtn.classList.add('hidden');
  }
}

document.getElementById('loginBtn').addEventListener('click', () => openModal('authModal'));
document.getElementById('logoutBtn').addEventListener('click', () => { clearSession(); showToast('Signed out'); });

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}Form`).classList.remove('hidden');
  });
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.querySelector('[data-for="loginForm"]');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }) });
    setSession(data.token, data.user);
    closeModal('authModal');
    showToast(`Welcome back, ${data.user.displayName}`);
    e.target.reset();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.querySelector('[data-for="registerForm"]');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: fd.get('email'), password: fd.get('password'), displayName: fd.get('displayName') }),
    });
    setSession(data.token, data.user);
    closeModal('authModal');
    showToast(`Account created, welcome ${data.user.displayName}`);
    e.target.reset();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// ---------------- Categories ----------------
async function loadCategories() {
  state.categories = await api('/categories');
  const bar = document.getElementById('categoryBar');
  bar.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.textContent = 'All';
  allBtn.className = 'active';
  allBtn.addEventListener('click', () => selectCategory('', allBtn));
  bar.appendChild(allBtn);

  const sellSelect = document.getElementById('sellCategorySelect');
  sellSelect.innerHTML = '';

  state.categories.forEach((cat) => {
    const btn = document.createElement('button');
    btn.textContent = cat.name;
    btn.addEventListener('click', () => selectCategory(cat.slug, btn));
    bar.appendChild(btn);

    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    sellSelect.appendChild(opt);
  });
}

function selectCategory(slug, btnEl) {
  state.activeCategory = slug;
  document.querySelectorAll('.categories button').forEach((b) => b.classList.remove('active'));
  btnEl.classList.add('active');
  document.getElementById('pageTitle').textContent = slug
    ? state.categories.find((c) => c.slug === slug)?.name || 'Items'
    : 'All items';
  loadProducts();
}

// ---------------- Products ----------------
async function loadProducts() {
  const params = new URLSearchParams();
  if (state.searchTerm) params.set('search', state.searchTerm);
  if (state.activeCategory) params.set('category', state.activeCategory);
  if (state.sort) params.set('sort', state.sort);

  const products = await api(`/products?${params.toString()}`);
  const grid = document.getElementById('grid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  if (!products.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  products.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'card';
    const priceLabel = p.listing_type === 'auction'
      ? `Bid: ${money(p.highest_bid_cents || p.price_cents)}`
      : money(p.price_cents);
    card.innerHTML = `
      <div class="card-image">${p.image_emoji}</div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(p.title)}</p>
        <div class="card-price">${priceLabel}</div>
        ${p.listing_type === 'auction' ? `<span class="badge">${p.bid_count} bids</span>` : ''}
      </div>`;
    card.addEventListener('click', () => openProduct(p.id));
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById('searchBtn').addEventListener('click', () => {
  state.searchTerm = document.getElementById('searchInput').value.trim();
  document.getElementById('pageTitle').textContent = state.searchTerm ? `Results for "${state.searchTerm}"` : 'All items';
  loadProducts();
});
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('searchBtn').click();
});
document.getElementById('sortSelect').addEventListener('change', (e) => {
  state.sort = e.target.value;
  loadProducts();
});

// ---------------- Product detail ----------------
async function openProduct(id) {
  const p = await api(`/products/${id}`);
  const detail = document.getElementById('productDetail');

  const buyBlock = p.listing_type === 'auction'
    ? `<div class="bid-row">
         <input type="number" id="bidInput" placeholder="Your bid (USD)" min="${((p.highest_bid_cents || p.price_cents) / 100 + 0.01).toFixed(2)}" step="0.01" />
         <button class="btn btn-primary" id="bidBtn">Place bid</button>
       </div>`
    : `<div class="detail-actions">
         <button class="btn btn-primary" id="addToCartBtn">Add to cart</button>
       </div>`;

  detail.innerHTML = `
    <div class="detail-grid">
      <div class="detail-image">${p.image_emoji}</div>
      <div>
        <h2>${escapeHtml(p.title)}</h2>
        <div class="detail-price">${p.listing_type === 'auction' ? money(p.highest_bid_cents || p.price_cents) : money(p.price_cents)}</div>
        <p class="detail-meta">Condition: ${p.condition}</p>
        <p class="detail-meta">Category: ${escapeHtml(p.category_name || 'Uncategorized')}</p>
        <p class="detail-meta">Sold by: ${escapeHtml(p.seller_name || 'Unknown seller')}</p>
        <p class="detail-meta">${p.stock_qty} in stock</p>
        <p>${escapeHtml(p.description || '')}</p>
        ${buyBlock}
        <p class="form-error" id="detailError"></p>
      </div>
    </div>`;

  const addBtn = document.getElementById('addToCartBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      if (!requireAuth()) return;
      try {
        await api('/cart', { method: 'POST', body: JSON.stringify({ productId: p.id, quantity: 1 }) });
        showToast('Added to cart');
        refreshCartCount();
      } catch (err) {
        document.getElementById('detailError').textContent = err.message;
      }
    });
  }
  const bidBtn = document.getElementById('bidBtn');
  if (bidBtn) {
    bidBtn.addEventListener('click', async () => {
      if (!requireAuth()) return;
      const val = parseFloat(document.getElementById('bidInput').value);
      if (!val || val <= 0) return;
      try {
        await api(`/products/${p.id}/bid`, { method: 'POST', body: JSON.stringify({ amountCents: Math.round(val * 100) }) });
        showToast('Bid placed!');
        openProduct(p.id);
        loadProducts();
      } catch (err) {
        document.getElementById('detailError').textContent = err.message;
      }
    });
  }

  openModal('productModal');
}

function requireAuth() {
  if (!state.token) {
    closeModal('productModal');
    openModal('authModal');
    showToast('Please sign in first');
    return false;
  }
  return true;
}

// ---------------- Cart ----------------
document.getElementById('cartBtn').addEventListener('click', async () => {
  if (!requireAuth()) return;
  await renderCart();
  openModal('cartModal');
});

async function refreshCartCount() {
  if (!state.token) { document.getElementById('cartCount').textContent = '0'; return; }
  try {
    const items = await api('/cart');
    document.getElementById('cartCount').textContent = String(items.reduce((n, i) => n + i.quantity, 0));
  } catch {
    // ignore
  }
}

async function renderCart() {
  const items = await api('/cart');
  const container = document.getElementById('cartItems');
  container.innerHTML = '';
  let total = 0;
  if (!items.length) {
    container.innerHTML = '<p>Your cart is empty.</p>';
  }
  items.forEach((item) => {
    total += item.price_cents * item.quantity;
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <span class="emoji">${item.image_emoji}</span>
      <span class="info">${escapeHtml(item.title)} &times; ${item.quantity}<br><strong>${money(item.price_cents * item.quantity)}</strong></span>
      <button class="remove">Remove</button>`;
    row.querySelector('.remove').addEventListener('click', async () => {
      await api(`/cart/${item.id}`, { method: 'DELETE' });
      await renderCart();
      refreshCartCount();
    });
    container.appendChild(row);
  });
  document.getElementById('cartTotal').textContent = money(total);
  document.getElementById('cartError').textContent = '';
}

document.getElementById('checkoutBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('cartError');
  try {
    const order = await api('/orders/checkout', { method: 'POST' });
    showToast(`Order #${order.id} placed!`);
    closeModal('cartModal');
    refreshCartCount();
    loadProducts();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// ---------------- Sell ----------------
document.getElementById('sellBtn').addEventListener('click', () => openModal('sellModal'));

document.getElementById('sellForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.querySelector('[data-for="sellForm"]');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    await api('/products', {
      method: 'POST',
      body: JSON.stringify({
        title: fd.get('title'),
        description: fd.get('description'),
        categoryId: Number(fd.get('categoryId')),
        priceCents: Math.round(parseFloat(fd.get('price')) * 100),
        condition: fd.get('condition'),
        listingType: fd.get('listingType'),
        stockQty: Number(fd.get('stockQty')),
        imageEmoji: fd.get('imageEmoji') || '📦',
      }),
    });
    showToast('Listing published');
    closeModal('sellModal');
    e.target.reset();
    loadProducts();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// ---------------- Init ----------------
(async function init() {
  refreshAuthUI();
  await loadCategories();
  await loadProducts();
  refreshCartCount();
})();
