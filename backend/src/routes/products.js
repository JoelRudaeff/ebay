const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { publishEvent } = require('../kafka');
const { cacheGet, cacheSet, cacheDel, PRODUCT_LIST_CACHE_KEY } = require('../redis');

const router = express.Router();

const DEFAULT_LIST_CACHE_KEY = PRODUCT_LIST_CACHE_KEY;
const DEFAULT_LIST_CACHE_TTL = 15; // seconds

// GET /products?search=&category=&sort=price_asc|price_desc|newest
router.get('/', async (req, res) => {
  const { search, category, sort } = req.query;
  const isDefaultQuery = !search && !category && (!sort || sort === 'newest');

  if (isDefaultQuery) {
    const cached = await cacheGet(DEFAULT_LIST_CACHE_KEY);
    if (cached) return res.json(cached);
  }

  const clauses = ['p.active = true'];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    clauses.push(`p.title ILIKE $${params.length}`);
  }
  if (category) {
    params.push(category);
    clauses.push(`c.slug = $${params.length}`);
  }

  let orderBy = 'p.created_at DESC';
  if (sort === 'price_asc') orderBy = 'p.price_cents ASC';
  if (sort === 'price_desc') orderBy = 'p.price_cents DESC';

  const sql = `
    SELECT p.id, p.title, p.description, p.price_cents, p.currency, p.condition,
           p.stock_qty, p.listing_type, p.highest_bid_cents, p.bid_count, p.image_emoji,
           p.created_at, c.name AS category_name, c.slug AS category_slug,
           u.display_name AS seller_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN users u ON u.id = p.seller_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT 100
  `;
  const result = await db.query(sql, params);
  if (isDefaultQuery) await cacheSet(DEFAULT_LIST_CACHE_KEY, result.rows, DEFAULT_LIST_CACHE_TTL);
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const result = await db.query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, u.display_name AS seller_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN users u ON u.id = p.seller_id
     WHERE p.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });

  publishEvent('product.events', { type: 'product.viewed', productId: Number(req.params.id) });

  res.json(result.rows[0]);
});

router.post('/', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const { title, description, categoryId, priceCents, condition, stockQty, listingType, imageEmoji } = req.body || {};
  if (!title || !priceCents || priceCents <= 0) {
    return res.status(400).json({ error: 'title and a positive priceCents are required' });
  }

  const result = await db.query(
    `INSERT INTO products (title, description, category_id, seller_id, price_cents, condition, stock_qty, listing_type, image_emoji)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [title, description || '', categoryId || null, req.user.sub, priceCents, condition || 'used', stockQty ?? 1, listingType || 'fixed', imageEmoji || '📦']
  );

  publishEvent('product.events', { type: 'product.created', productId: result.rows[0].id, sellerId: req.user.sub });
  await cacheDel(DEFAULT_LIST_CACHE_KEY);

  res.status(201).json(result.rows[0]);
});

router.post('/:id/bid', requireAuth, async (req, res) => {
  const { amountCents } = req.body || {};
  const productRes = await db.query('SELECT * FROM products WHERE id = $1 AND active = true', [req.params.id]);
  const product = productRes.rows[0];
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.listing_type !== 'auction') return res.status(400).json({ error: 'This item is not an auction listing' });

  const floor = product.highest_bid_cents || product.price_cents;
  if (!amountCents || amountCents <= floor) {
    return res.status(400).json({ error: `Bid must be greater than ${floor}` });
  }

  const updated = await db.query(
    `UPDATE products SET highest_bid_cents = $1, bid_count = bid_count + 1 WHERE id = $2 RETURNING *`,
    [amountCents, req.params.id]
  );

  publishEvent('bid.events', { type: 'bid.placed', productId: Number(req.params.id), userId: req.user.sub, amountCents });

  res.json(updated.rows[0]);
});

module.exports = router;
