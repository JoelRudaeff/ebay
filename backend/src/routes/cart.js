const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT ci.id, ci.quantity, p.id AS product_id, p.title, p.price_cents, p.image_emoji, p.stock_qty
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1 ORDER BY ci.id`,
    [req.user.sub]
  );
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { productId, quantity } = req.body || {};
  const qty = Math.max(1, Number(quantity) || 1);
  if (!productId) return res.status(400).json({ error: 'productId is required' });

  const result = await db.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
     RETURNING *`,
    [req.user.sub, productId, qty]
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub]);
  res.status(204).end();
});

module.exports = router;
