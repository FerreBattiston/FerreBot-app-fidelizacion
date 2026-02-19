require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Roles enumeration (documentación)
// Role: 'cliente' | 'albañil' | 'electricista' | 'plomero' | 'admin'
const ALLOWED_ROLES = new Set(['cliente', 'albañil', 'electricista', 'plomero', 'admin']);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function signToken(payload) {
  const secret = requireEnv('JWT_SECRET');
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Missing Bearer token' });
  try {
    const secret = requireEnv('JWT_SECRET');
    req.user = jwt.verify(m[1], secret);
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/api/v1/health', (req, res) => {
  res.json({ ok: true });
});

// Register (hash password + roles)
app.post('/api/v1/auth/register', async (req, res) => {
  const { username, password, roles } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

  const rolesArr = Array.isArray(roles) && roles.length ? roles : ['cliente'];
  for (const r of rolesArr) {
    if (!ALLOWED_ROLES.has(r)) return res.status(400).json({ error: `invalid role: ${r}` });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO users(username, password_hash) VALUES($1, $2) RETURNING id',
      [username, passwordHash]
    );
    const userId = rows[0].id;

    for (const role of rolesArr) {
      await client.query('INSERT INTO user_roles(user_id, role) VALUES($1, $2)', [userId, role]);
    }

    await client.query('COMMIT');
    const token = signToken({ sub: userId, username, roles: rolesArr });
    res.status(201).json({ id: userId, token });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'username already exists' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error registering user' });
  } finally {
    client.release();
  }
});

// Login
app.post('/api/v1/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

  const client = await pool.connect();
  try {
    const u = await client.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    if (!u.rows.length) return res.status(401).json({ error: 'invalid credentials' });

    const user = u.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const r = await client.query('SELECT role FROM user_roles WHERE user_id = $1', [user.id]);
    const roles = r.rows.map((x) => x.role);

    const token = signToken({ sub: user.id, username: user.username, roles });
    return res.json({ id: user.id, token, roles });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error logging in' });
  } finally {
    client.release();
  }
});

// Example protected endpoint
app.get('/api/v1/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
