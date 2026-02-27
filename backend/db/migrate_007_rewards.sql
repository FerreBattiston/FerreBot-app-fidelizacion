-- Rewards / Catalog
CREATE TABLE IF NOT EXISTS rewards (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL,
  stock INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
