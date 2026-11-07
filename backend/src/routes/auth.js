const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');
const { publishEvent } = require('../kafka');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !EMAIL_RE.test(email) || !password || password.length < 8 || !displayName) {
    return res.status(400).json({ error: 'Valid email, displayName and password (min 8 chars) are required' });
  }

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await db.query(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, $2, $3, 'buyer') RETURNING id, email, display_name, role`,
    [email.toLowerCase(), hash, displayName]
  );
  const user = result.rows[0];

  publishEvent('user.events', { type: 'user.registered', userId: user.id, email: user.email });

  res.status(201).json({ token: signToken(user), user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  publishEvent('user.events', { type: 'user.login', userId: user.id, email: user.email });

  res.json({ token: signToken(user), user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } });
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await db.query('SELECT id, email, display_name, role FROM users WHERE id = $1', [req.user.sub]);
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  const u = result.rows[0];
  res.json({ id: u.id, email: u.email, displayName: u.display_name, role: u.role });
});

module.exports = router;
