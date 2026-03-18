-- Tabla de eventos globales del servidor
CREATE TABLE IF NOT EXISTS global_events (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  color       TEXT NOT NULL,            -- hex color string
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ NOT NULL,
  event_type  TEXT NOT NULL,            -- 'xp_boost' | 'quality_boost' | 'community'
  skill_ids   TEXT[] NOT NULL DEFAULT '{}',  -- skills afectadas; vacío = todas
  effect      JSONB NOT NULL DEFAULT '{}'    -- { multiplier: number } o { shift: number }
);

-- Solo lectura pública — nadie puede crear eventos desde el cliente
ALTER TABLE global_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_public_read" ON global_events FOR SELECT USING (true);

-- Índice para consultar eventos activos por tiempo
CREATE INDEX IF NOT EXISTS idx_global_events_active ON global_events (start_at, end_at);
