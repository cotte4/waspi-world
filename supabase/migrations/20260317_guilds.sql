-- ── Guilds Schema ──────────────────────────────────────────────────────────
-- Los 4 gremios del mundo Waspi World

CREATE TABLE IF NOT EXISTS guilds (
  id         TEXT PRIMARY KEY,          -- 'mineros', 'pescadores', 'cocineros', 'botanicos'
  name       TEXT NOT NULL,
  tagline    TEXT NOT NULL,
  color      TEXT NOT NULL,             -- hex color
  icon       TEXT NOT NULL,             -- emoji
  skill_id   TEXT NOT NULL              -- skill principal requerida
);

-- Reputación del jugador en cada gremio
CREATE TABLE IF NOT EXISTS player_guild_rep (
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guild_id    TEXT REFERENCES guilds(id) ON DELETE CASCADE,
  rep         INTEGER NOT NULL DEFAULT 0 CHECK (rep >= 0),
  rank        TEXT NOT NULL DEFAULT 'novato',  -- novato, aprendiz, miembro, veterano, leyenda
  joined_at   TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, guild_id)
);

-- Índice para buscar miembros de un gremio
CREATE INDEX IF NOT EXISTS idx_guild_rep_guild ON player_guild_rep(guild_id);

-- RLS
ALTER TABLE guilds ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_guild_rep ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guilds_public_read" ON guilds FOR SELECT USING (true);
CREATE POLICY "guild_rep_own_read" ON player_guild_rep FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "guild_rep_own_write" ON player_guild_rep FOR ALL USING (auth.uid() = user_id);
