-- Jukebox del Café — Waspi World
-- Catálogo curado de canciones pre-aprobadas
CREATE TABLE IF NOT EXISTS jukebox_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    text NOT NULL UNIQUE,
  title       text NOT NULL,
  artist      text NOT NULL,
  category    text NOT NULL CHECK (category IN ('trap', 'lofi', 'retro', 'urbano_arg', 'hype')),
  duration_s  int,
  created_at  timestamptz DEFAULT now()
);

-- Cache de búsquedas para no quemar cuota de YouTube Data API v3 (10k/día)
CREATE TABLE IF NOT EXISTS jukebox_search_cache (
  query       text PRIMARY KEY,
  results     jsonb NOT NULL,
  cached_at   timestamptz DEFAULT now()
);

-- Queue de canciones del Café (estado persistido en DB para reasignación de host)
CREATE TABLE IF NOT EXISTS jukebox_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      text NOT NULL,
  title         text NOT NULL,
  artist        text NOT NULL,
  added_by      text NOT NULL,         -- player UUID
  added_by_name text NOT NULL,
  cost          int  NOT NULL,         -- 100 o 150
  added_at      timestamptz DEFAULT now(),
  played_at     timestamptz,
  skipped_at    timestamptz,
  status        text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'playing', 'played', 'skipped'))
);

-- Votos de skip (1 voto por jugador por canción; 3+ votos = skip)
CREATE TABLE IF NOT EXISTS jukebox_skip_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id    uuid NOT NULL REFERENCES jukebox_queue(id) ON DELETE CASCADE,
  player_id   text NOT NULL,
  voted_at    timestamptz DEFAULT now(),
  UNIQUE (queue_id, player_id)
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_jukebox_queue_status   ON jukebox_queue (status);
CREATE INDEX IF NOT EXISTS idx_jukebox_queue_added_by ON jukebox_queue (added_by, status);
CREATE INDEX IF NOT EXISTS idx_jukebox_skip_votes_qid ON jukebox_skip_votes (queue_id);
