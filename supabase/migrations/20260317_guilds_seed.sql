-- ── Guilds Seed ────────────────────────────────────────────────────────────
-- Datos canónicos de los 4 gremios del mundo Waspi World

INSERT INTO guilds (id, name, tagline, color, icon, skill_id) VALUES
  ('mineros',     'GREMIO DE MINEROS',     'Dureza y precisión bajo tierra',       '#C8A45A', '⛏️',  'mining'),
  ('pescadores',  'GREMIO DE PESCADORES',  'Paciencia y ojo fino en las aguas',    '#4A9ECC', '🎣',  'fishing'),
  ('cocineros',   'GREMIO DE COCINEROS',   'Sabor y técnica en cada preparación',  '#FF7043', '🍳',  'cooking'),
  ('botanicos',   'GREMIO DE BOTÁNICOS',   'Cultivo y cosecha con maestría',       '#4CAF50', '🌿',  'gardening')
ON CONFLICT (id) DO NOTHING;
