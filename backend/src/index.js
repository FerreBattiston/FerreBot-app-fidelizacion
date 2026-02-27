require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

// uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname || '').slice(0, 10);
      const safeExt = ext && ext.startsWith('.') ? ext : '';
      cb(null, `job_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: function (req, file, cb) {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  }
});

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

    // award registration bonus +50 points
    try {
      await awardPoints({ client, userId, change: 50, reason: 'registro', created_by: null });
    } catch(e) {
      console.error('awardPoints failed on register:', e);
    }

    // if referrer_username provided, credit referer and referred
    const ref = req.body && req.body.referrer_username;
    if (ref) {
      try {
        const ruser = await client.query('SELECT id FROM users WHERE username=$1', [ref]);
        if (ruser.rows.length) {
          const refId = ruser.rows[0].id;
          await awardPoints({ client, userId: refId, change: 100, reason: 'referir', ref_type: 'user', ref_id: userId });
          // extra bonus to referred
          await awardPoints({ client, userId, change: 50, reason: 'referido', ref_type: 'user', ref_id: refId });
        }
      } catch(e) {
        console.error('referral award failed:', e);
      }
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

// Create job (client) - supports optional photo upload (multipart/form-data)
app.post('/api/v1/jobs', authMiddleware, upload.single('photo'), async (req, res) => {
  if (!requireRole(req, res, ['cliente'])) return;

  // Works for both JSON and multipart
  const trade = (req.body && req.body.trade) || null;
  const zone = (req.body && req.body.zone) || null;
  const description = (req.body && req.body.description) || null;

  if (!trade || !zone || !description) return res.status(400).json({ error: 'trade, zone, description are required' });
  if (!ALLOWED_ROLES.has(trade) || trade === 'cliente' || trade === 'admin') {
    return res.status(400).json({ error: 'trade must be albañil/electricista/plomero' });
  }

  const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO jobs(created_by, trade, zone, description, photo_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, photo_url`,
      [req.user.sub, trade, zone, description, photoUrl]
    );
    const job = rows[0];
    await client.query(
      `INSERT INTO job_status_history(job_id, status, changed_by, note)
       VALUES ($1, $2, $3, $4)`,
      [job.id, job.status, req.user.sub, 'creado']
    );
    await client.query('COMMIT');
    res.status(201).json({ id: job.id, photo_url: job.photo_url });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error creating job' });
  } finally {
    client.release();
  }
});

// List jobs (clients/professionals) - simple filter
app.get('/api/v1/jobs', authMiddleware, async (req, res) => {
  const { status, trade, zone, mine, assigned } = req.query;

  const where = [];
  const params = [];
  function add(cond, val) {
    params.push(val);
    where.push(cond.replace('?', `$${params.length}`));
  }
  if (status) add('status = ?', status);
  if (trade) add('trade = ?', trade);
  if (zone) add('zone = ?', zone);

  // mine=1 => jobs created by me
  if (mine === '1' || mine === 'true') add('created_by = ?', req.user.sub);

  // assigned=1 => jobs assigned to me
  if (assigned === '1' || assigned === 'true') add('assigned_to = ?', req.user.sub);

  const sql = `SELECT id, trade, zone, description, photo_url, finished_photo_url, status, created_at, created_by, assigned_to, assigned_at, finished_at
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
    // notify the job creator that their job was taken
    await client.query(
      `INSERT INTO notifications(user_id, type, payload)
       VALUES (
         (SELECT created_by FROM jobs WHERE id=$1),
         'job_taken',
         jsonb_build_object('job_id', $1, 'by', $2)
       )`,
      [jobId, req.user.sub]
    );
    // notify the job creator that their job was taken
    await client.query(
      `INSERT INTO notifications(user_id, type, payload)
       VALUES (
         (SELECT created_by FROM jobs WHERE id=$1),
         'job_taken',
         jsonb_build_object('job_id', $1, 'by', $2)
       )`,
      [jobId, req.user.sub]
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

// Finish job (assigned professional) - supports optional finished photo
app.post('/api/v1/jobs/:id/finish', authMiddleware, upload.single('photo'), async (req, res) => {
  const jobId = Number(req.params.id);
  if (!jobId) return res.status(400).json({ error: 'invalid id' });

  const finishedPhotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

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

    await client.query(
      `UPDATE jobs SET status='FINALIZADO', finished_at=now(), finished_photo_url=COALESCE($2, finished_photo_url) WHERE id=$1`,
      [jobId, finishedPhotoUrl]
    );
    await client.query(
      `INSERT INTO job_status_history(job_id, status, changed_by, note)
       VALUES ($1, $2, $3, $4)`,
      [jobId, 'FINALIZADO', req.user.sub, 'finalizado']
    );

    await client.query('COMMIT');
    res.json({ ok: true, finished_photo_url: finishedPhotoUrl });
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

// Professional rating summary
app.get('/api/v1/professionals/:id/rating', authMiddleware, async (req, res) => {
  const profId = Number(req.params.id);
  if (!profId) return res.status(400).json({ error: 'invalid id' });

  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT COUNT(*)::int AS count, COALESCE(AVG(stars),0)::float AS avg
       FROM job_ratings
       WHERE to_user = $1`,
      [profId]
    );
    res.json({ professional_id: profId, count: r.rows[0].count, avg: r.rows[0].avg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error reading rating' });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));

// Notifications (simple polling endpoint)
app.get('/api/v1/notifications', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT id, type, payload, read, created_at FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 50`,
      [req.user.sub]
    );
    res.json({ items: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error reading notifications' });
  } finally {
    client.release();
  }
});


// Points helper
async function awardPoints({ client, userId, change, reason, ref_type = null, ref_id = null, created_by = null, meta = null }) {
  const c = client || (await pool.connect());
  let own = !!client;
  try {
    if (!own) await c.query('BEGIN');
    await c.query(
      `INSERT INTO points_ledger(user_id, change, reason, ref_type, ref_id, created_by, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, change, reason, ref_type, ref_id, created_by, meta]
    );
    if (!own) await c.query('COMMIT');
  } catch (e) {
    if (!own) await c.query('ROLLBACK');
    throw e;
  } finally {
    if (!own) c.release();
  }
}

// Points balance
app.get('/api/v1/points/balance', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const r = await client.query('SELECT COALESCE(SUM(change),0)::int AS balance FROM points_ledger WHERE user_id=$1', [req.user.sub]);
    res.json({ balance: r.rows[0].balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error reading balance' });
  } finally {
    client.release();
  }
});

// Points history
app.get('/api/v1/points/history', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const r = await client.query('SELECT id, change, reason, ref_type, ref_id, meta, created_at FROM points_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 100', [req.user.sub]);
    res.json({ items: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error reading history' });
  } finally {
    client.release();
  }
});

// Rewards list
app.get('/api/v1/rewards', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const r = await client.query('SELECT id, code, title, description, points_cost, stock, active FROM rewards WHERE active = true ORDER BY id');
    res.json({ items: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error reading rewards' });
  } finally {
    client.release();
  }
});

// Redeem reward (client)
app.post('/api/v1/points/redeem', authMiddleware, async (req, res) => {
  if (!requireRole(req, res, ['cliente'])) return;
  const { reward_id } = req.body || {};
  if (!reward_id) return res.status(400).json({ error: 'reward_id required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT id, points_cost, stock FROM rewards WHERE id=$1 FOR UPDATE', [reward_id]);
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'reward not found' }); }
    const reward = r.rows[0];
    // compute balance
    const bal = await client.query('SELECT COALESCE(SUM(change),0)::int AS balance FROM points_ledger WHERE user_id=$1 FOR UPDATE', [req.user.sub]);
    const balance = bal.rows[0].balance;
    if (balance < reward.points_cost) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'insufficient points' }); }
    if (reward.stock !== null && reward.stock !== undefined && reward.stock <= 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'out of stock' }); }

    // create redemption and ledger
    await client.query('INSERT INTO redemptions(user_id, reward_id, points) VALUES ($1,$2,$3)', [req.user.sub, reward.id, reward.points_cost]);
    await awardPoints({ client, userId: req.user.sub, change: -reward.points_cost, reason: 'redeem', ref_type: 'reward', ref_id: reward.id, created_by: req.user.sub });
    await client.query('UPDATE rewards SET stock = stock - 1 WHERE id=$1', [reward.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error redeeming reward' });
  } finally {
    client.release();
  }
});
