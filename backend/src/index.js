require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Roles enumeration (documentación)
// Role: 'cliente' | 'albañil' | 'electricista' | 'plomero' | 'admin'

// User registration with role
app.post('/api/v1/auth/register', async (req, res) => {
  const { username, password, roles } = req.body;
  // roles: array of Role
  // TODO: hash password and store user with roles
  try {
    const client = await pool.connect();
    const { rows } = await client.query(
      'INSERT INTO users(username, password) VALUES($1, $2) RETURNING id',
      [username, password]
    );
    const userId = rows[0].id;
    // Assign roles
    for (const role of roles) {
      await client.query(
        'INSERT INTO user_roles(user_id, role) VALUES($1, $2)',
        [userId, role]
      );
    }
    client.release();
    res.status(201).json({ id: userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error registering user' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
