const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { cacheDel, PRODUCT_LIST_CACHE_KEY } = require('../redis');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/summary', async (req, res) => {
  const [users, products, orders, revenue] = await Promise.all([
    db.query('SELECT count(*)::int AS n FROM users'),
    db.query('SELECT count(*)::int AS n FROM products WHERE active = true'),
    db.query('SELECT count(*)::int AS n FROM orders'),
    db.query(`SELECT coalesce(sum(total_cents), 0)::bigint AS total FROM orders WHERE status != 'cancelled'`),
  ]);
  res.json({
    userCount: users.rows[0].n,
    activeProductCount: products.rows[0].n,
    orderCount: orders.rows[0].n,
    revenueCents: Number(revenue.rows[0].total),
  });
});

router.get('/users', async (req, res) => {
  const result = await db.query('SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at DESC LIMIT 200');
  res.json(result.rows);
});

router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body || {};
  if (!['buyer', 'seller', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const result = await db.query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, display_name, role', [role, req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
});

router.get('/products', async (req, res) => {
  const result = await db.query(
    `SELECT p.*, u.display_name AS seller_name FROM products p LEFT JOIN users u ON u.id = p.seller_id ORDER BY p.created_at DESC LIMIT 200`
  );
  res.json(result.rows);
});

router.patch('/products/:id', async (req, res) => {
  const { active, priceCents, stockQty } = req.body || {};
  const result = await db.query(
    `UPDATE products SET
       active = COALESCE($1, active),
       price_cents = COALESCE($2, price_cents),
       stock_qty = COALESCE($3, stock_qty)
     WHERE id = $4 RETURNING *`,
    [active, priceCents, stockQty, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
  await cacheDel(PRODUCT_LIST_CACHE_KEY);
  res.json(result.rows[0]);
});

router.delete('/products/:id', async (req, res) => {
  await db.query('UPDATE products SET active = false WHERE id = $1', [req.params.id]);
  await cacheDel(PRODUCT_LIST_CACHE_KEY);
  res.status(204).end();
});

router.get('/orders', async (req, res) => {
  const result = await db.query(
    `SELECT o.*, u.email AS buyer_email FROM orders o LEFT JOIN users u ON u.id = o.buyer_id ORDER BY o.created_at DESC LIMIT 200`
  );
  res.json(result.rows);
});

module.exports = router;
