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

// ----------------------------
// Oficios / Jobs (MVP)
// ----------------------------

function requireRole(req, res, roles) {
  const userRoles = (req.user && req.user.roles) || [];
  const ok = roles.some((r) => userRoles.includes(r));
  if (!ok) {
    res.status(403).json({ error: `requires role: ${roles.join(' or ')}` });
    return false;
  }
  return true;
}

// Professional profile (zones/trades)
app.post('/api/v1/professionals/profile', authMiddleware, async (req, res) => {
  // professionals are: albañil/electricista/plomero
  if (!requireRole(req, res, ['albañil', 'electricista', 'plomero'])) return;

  const { displayName, whatsapp, zones, trades } = req.body || {};
  const zonesArr = Array.isArray(zones) ? zones : [];
  const tradesArr = Array.isArray(trades) ? trades : [];

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO professional_profiles(user_id, display_name, whatsapp, zones, trades)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         whatsapp = EXCLUDED.whatsapp,
         zones = EXCLUDED.zones,
         trades = EXCLUDED.trades`,
      [req.user.sub, displayName || null, whatsapp || null, zonesArr, tradesArr]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error saving professional profile' });
  } finally {
    client.release();
  }
});

// Create job (client)
app.post('/api/v1/jobs', authMiddleware, async (req, res) => {
  if (!requireRole(req, res, ['cliente'])) return;

  const { trade, zone, description } = req.body || {};
  if (!trade || !zone || !description) return res.status(400).json({ error: 'trade, zone, description are required' });
  if (!ALLOWED_ROLES.has(trade) || trade === 'cliente' || trade === 'admin') {
    return res.status(400).json({ error: 'trade must be albañil/electricista/plomero' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO jobs(created_by, trade, zone, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status`,
      [req.user.sub, trade, zone, description]
    );
    const job = rows[0];
    await client.query(
      `INSERT INTO job_status_history(job_id, status, changed_by, note)
       VALUES ($1, $2, $3, $4)`,
      [job.id, job.status, req.user.sub, 'creado']
    );
    await client.query('COMMIT');
    res.status(201).json({ id: job.id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error creating job' });
  } finally {
    client.release();
  }
});

// List jobs (professionals) - simple filter
app.get('/api/v1/jobs', authMiddleware, async (req, res) => {
  // allow both client/professional to see list for now
  const { status, trade, zone } = req.query;

  const where = [];
  const params = [];
  function add(cond, val) {
    params.push(val);
    where.push(cond.replace('?', `$${params.length}`));
  }
  if (status) add('status = ?', status);
  if (trade) add('trade = ?', trade);
  if (zone) add('zone = ?', zone);

  const sql = `SELECT id, trade, zone, description, status, created_at, assigned_to
              FROM jobs
              ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
              ORDER BY id DESC
              LIMIT 50`;

  const client = await pool.connect();
  try {
    const r = await client.query(sql, params);
    res.json({ items: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error listing jobs' });
  } finally {
    client.release();
  }
});

// Take job (professional)
app.post('/api/v1/jobs/:id/take', authMiddleware, async (req, res) => {
  if (!requireRole(req, res, ['albañil', 'electricista', 'plomero'])) return;

  const jobId = Number(req.params.id);
  if (!jobId) return res.status(400).json({ error: 'invalid id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // lock row to avoid race
    const j = await client.query('SELECT id, status, trade FROM jobs WHERE id=$1 FOR UPDATE', [jobId]);
    if (!j.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'job not found' });
    }
    const job = j.rows[0];
    if (job.status !== 'PUBLICADO') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'job already taken' });
    }
    // role must match job.trade
    if (!req.user.roles.includes(job.trade)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `role mismatch, requires: ${job.trade}` });
    }

    await client.query(
      `UPDATE jobs SET status='ASIGNADO', assigned_to=$1, assigned_at=now() WHERE id=$2`,
      [req.user.sub, jobId]
    );
    await client.query(
      `INSERT INTO job_status_history(job_id, status, changed_by, note)
       VALUES ($1, $2, $3, $4)`,
      [jobId, 'ASIGNADO', req.user.sub, 'tomado por profesional']
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error taking job' });
  } finally {
    client.release();
  }
});

// Finish job (assigned professional)
app.post('/api/v1/jobs/:id/finish', authMiddleware, async (req, res) => {
  const jobId = Number(req.params.id);
  if (!jobId) return res.status(400).json({ error: 'invalid id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const j = await client.query('SELECT id, status, assigned_to FROM jobs WHERE id=$1 FOR UPDATE', [jobId]);
    if (!j.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'job not found' });
    }
    const job = j.rows[0];
    if (job.status !== 'ASIGNADO') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'job not in ASIGNADO' });
    }
    if (Number(job.assigned_to) !== Number(req.user.sub)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'only assigned professional can finish' });
    }

    await client.query(`UPDATE jobs SET status='FINALIZADO', finished_at=now() WHERE id=$1`, [jobId]);
    await client.query(
      `INSERT INTO job_status_history(job_id, status, changed_by, note)
       VALUES ($1, $2, $3, $4)`,
      [jobId, 'FINALIZADO', req.user.sub, 'finalizado']
    );

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error finishing job' });
  } finally {
    client.release();
  }
});

// Rate job (client -> professional) after finish
app.post('/api/v1/jobs/:id/rate', authMiddleware, async (req, res) => {
  if (!requireRole(req, res, ['cliente'])) return;

  const jobId = Number(req.params.id);
  const { stars, comment } = req.body || {};
  const s = Number(stars);
  if (!jobId || !s) return res.status(400).json({ error: 'id and stars required' });
  if (s < 1 || s > 5) return res.status(400).json({ error: 'stars must be 1..5' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const j = await client.query('SELECT id, status, created_by, assigned_to FROM jobs WHERE id=$1 FOR UPDATE', [jobId]);
    if (!j.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'job not found' });
    }
    const job = j.rows[0];
    if (job.status !== 'FINALIZADO') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'job not finished' });
    }
    if (Number(job.created_by) !== Number(req.user.sub)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'only creator can rate' });
    }
    if (!job.assigned_to) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'job has no assigned professional' });
    }

    await client.query(
      `INSERT INTO job_ratings(job_id, from_user, to_user, stars, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (job_id) DO UPDATE SET stars=EXCLUDED.stars, comment=EXCLUDED.comment`,
      [jobId, req.user.sub, job.assigned_to, s, comment || null]
    );

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error rating job' });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
