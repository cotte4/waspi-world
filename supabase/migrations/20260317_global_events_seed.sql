INSERT INTO global_events (id, name, description, icon, color, start_at, end_at, event_type, skill_ids, effect)
VALUES
  (
    'mining_week_2026_w12',
    'SEMANA DEL MINERO',
    '+50% XP en minería por 7 días',
    '⛏️', '#C8A45A',
    now() - INTERVAL '1 day',
    now() + INTERVAL '6 days',
    'xp_boost',
    ARRAY['mining'],
    '{"multiplier": 1.5}'::jsonb
  ),
  (
    'quality_fiesta_2026_w12',
    'FIESTA DE CALIDAD',
    'Mayor chance de calidad GOOD+ en todas las skills',
    '✨', '#F5C842',
    now() - INTERVAL '2 hours',
    now() + INTERVAL '4 days',
    'quality_boost',
    ARRAY[]::TEXT[],
    '{"shift": 1}'::jsonb
  ),
  (
    'fishing_tournament_2026_w12',
    'TORNEO DE PESCA',
    '+100% XP en pesca este fin de semana',
    '🎣', '#4A9ECC',
    now() - INTERVAL '30 minutes',
    now() + INTERVAL '2 days',
    'xp_boost',
    ARRAY['fishing'],
    '{"multiplier": 2.0}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
