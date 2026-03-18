-- Maestría post-Lv5: puntos acumulados por skill
CREATE TABLE IF NOT EXISTS player_mastery_mp (
  user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id  TEXT NOT NULL,
  points    INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  PRIMARY KEY (user_id, skill_id)
);

-- Nodos de maestría desbloqueados
CREATE TABLE IF NOT EXISTS player_mastery_unlocks (
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id    TEXT NOT NULL,
  node_id     TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, skill_id, node_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mastery_mp_user ON player_mastery_mp(user_id);
CREATE INDEX IF NOT EXISTS idx_mastery_unlocks_user ON player_mastery_unlocks(user_id);

-- RLS
ALTER TABLE player_mastery_mp ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_mastery_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mastery_mp_own" ON player_mastery_mp FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "mastery_unlocks_own" ON player_mastery_unlocks FOR ALL USING (auth.uid() = user_id);
