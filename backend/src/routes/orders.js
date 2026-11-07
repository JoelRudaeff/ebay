const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { publishEvent } = require('../kafka');

const router = express.Router();
router.use(requireAuth);

// Checkout: turns the current cart into an order.
router.post('/checkout', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const cartRes = await client.query(
      `SELECT ci.quantity, p.id AS product_id, p.price_cents, p.stock_qty
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1 FOR UPDATE`,
      [req.user.sub]
    );
    if (!cartRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cart is empty' });
    }

    for (const item of cartRes.rows) {
      if (item.quantity > item.stock_qty) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Not enough stock for product ${item.product_id}` });
      }
    }

    const totalCents = cartRes.rows.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
    const orderRes = await client.query(
      `INSERT INTO orders (buyer_id, status, total_cents) VALUES ($1, 'paid', $2) RETURNING *`,
      [req.user.sub, totalCents]
    );
    const order = orderRes.rows[0];

    for (const item of cartRes.rows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)`,
        [order.id, item.product_id, item.quantity, item.price_cents]
      );
      await client.query(`UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2`, [item.quantity, item.product_id]);
    }

    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.sub]);
    await client.query('COMMIT');

    publishEvent('order.events', {
      type: 'order.created',
      orderId: order.id,
      buyerId: req.user.sub,
      totalCents,
      itemCount: cartRes.rows.length,
    });

    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Checkout failed', err);
    res.status(500).json({ error: 'Checkout failed' });
  } finally {
    client.release();
  }
});

router.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC`,
    [req.user.sub]
  );
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const orderRes = await db.query('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2', [req.params.id, req.user.sub]);
  if (!orderRes.rows.length) return res.status(404).json({ error: 'Order not found' });

  const itemsRes = await db.query(
    `SELECT oi.*, p.title, p.image_emoji FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1`,
    [req.params.id]
  );
  res.json({ ...orderRes.rows[0], items: itemsRes.rows });
});

module.exports = router;
