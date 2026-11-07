const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const db = require('./db');
const { connectProducer } = require('./kafka');

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const statsRoutes = require('./routes/stats');

const app = express();
app.set('trust proxy', 1); // behind nginx

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/categories', categoryRoutes);
app.use('/products', productRoutes);
app.use('/cart', cartRoutes);
app.use('/orders', orderRoutes);
app.use('/admin', adminRoutes);
app.use('/stats', statsRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function waitForDb(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      await db.query('SELECT 1');
      return;
    } catch {
      console.log(`Waiting for Postgres... (${i + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Postgres never became available');
}

// Idempotently ensures a single admin account exists, driven by env vars,
// so operators never have to hand-edit the seed SQL to get admin access.
async function ensureAdminUser() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('ADMIN_EMAIL/ADMIN_PASSWORD not set - skipping admin bootstrap');
    return;
  }
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) return;

  const hash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, 'Administrator', 'admin')`,
    [email, hash]
  );
  console.log(`Admin account bootstrapped for ${email}`);
}

const PORT = process.env.PORT || 4000;

(async () => {
  await waitForDb();
  await ensureAdminUser();
  connectProducer().catch((err) => console.error('Kafka producer connect failed (will retry lazily):', err.message));

  app.listen(PORT, () => console.log(`Backend API listening on :${PORT}`));
})();
