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
SQL" && 
cat > /home/ubuntu/.openclaw/workspace/FerreBot-app-fidelizacion/backend/db/migrate_008_redemptions.sql <<'SQL'
-- Redemptions
CREATE TABLE IF NOT EXISTS redemptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL" && 
cat > /home/ubuntu/.openclaw/workspace/FerreBot-app-fidelizacion/backend/db/seed_rewards.sql <<'SQL'
-- Seed 10 example rewards
INSERT INTO rewards (code, title, description, points_cost, stock)
VALUES
('DESCUENTO100','Descuento $100','Cupón de descuento $100 en tienda',100,10),
('LLAVE-ENGR','Llave combinada','Llave combinada profesional',200,5),
('KIT-CINTA','Kit cinta aislante','Pack 5 rollos cinta aislante',150,8),
('DESTORNILLADOR-PH','Destornillador PH','Destornillador PH profesional',120,10),
('SILICONA-NEUTRA','Silicona neutra 300ml','Silicona sellador 300ml',80,15),
('TALADRO-OK','Taladro manual','Taladro 18V (cupón)',1000,2),
('GUANTES-TRABAJO','Guantes de trabajo','Par de guantes resistentes',60,20),
('CINTA-POLI','Cinta polietileno','Rollo cinta polietileno',90,12),
('LAMPARA-LED','Lámpara LED 10W','Lámpara LED para hogar',250,6),
('BROCA-SET','Set brocas','Set 10 brocas',130,7)
ON CONFLICT (code) DO NOTHING;
SQL"
