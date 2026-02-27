-- Seed 10 example rewards
INSERT INTO rewards (code, title, description, points_cost, stock)
VALUES
('DESCUENTO100','Descuento 00','Cupón de descuento 00 en tienda',100,10),
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
