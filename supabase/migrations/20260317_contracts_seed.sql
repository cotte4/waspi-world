insert into contracts (id, guild_id, skill_id, type, title, description, objective, reward_tenks, reward_xp, reward_rep, week_id, min_level) values
(
  'miners_w12_01', 'miners', 'mining', 'production',
  'Provision de Materiales',
  'Recolecta 25 materiales de cualquier calidad para el gremio.',
  '{"action":"node_collect","skill":"mining","quantity":25}',
  2000, 50, 60, '2026-W12', 0
),
(
  'miners_w12_02', 'miners', 'mining', 'production',
  'Calidad de Extraccion',
  'Recolecta 10 materiales de calidad Buena o superior.',
  '{"action":"node_collect","skill":"mining","quantity":10,"min_quality":"good"}',
  3500, 80, 100, '2026-W12', 2
),
(
  'growers_w12_01', 'growers', 'gardening', 'production',
  'Cosecha Semanal',
  'Cosecha 8 plantas de cualquier tipo.',
  '{"action":"farm_harvest","skill":"gardening","quantity":8}',
  1800, 40, 60, '2026-W12', 0
),
(
  'growers_w12_02', 'growers', 'weed', 'production',
  'Cepa Premium',
  'Cosecha 5 plantas de cannabis de calidad Normal o superior.',
  '{"action":"farm_harvest","skill":"weed","quantity":5,"min_quality":"normal"}',
  2800, 60, 80, '2026-W12', 1
),
(
  'chefs_w12_01', 'chefs', 'cooking', 'production',
  'Menu de la Semana',
  'Prepara 6 recetas de cocina.',
  '{"action":"cook_recipe","skill":"cooking","quantity":6}',
  2200, 50, 70, '2026-W12', 0
),
(
  'cartel_w12_01', 'cartel', 'weed', 'production',
  'Abastecimiento del Cartel',
  'Cosecha 12 plantas de cannabis esta semana.',
  '{"action":"farm_harvest","skill":"weed","quantity":12}',
  4000, 100, 120, '2026-W12', 0
)
on conflict (id) do nothing;
