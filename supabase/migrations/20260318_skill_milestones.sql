-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: skill milestones + action_count tracking
-- Date: 2026-03-18
-- ──────────────────────────────────────────────────────────────────────────────

-- Add action counter to player_skills (incremented on every XP grant)
ALTER TABLE player_skills
  ADD COLUMN IF NOT EXISTS action_count INTEGER NOT NULL DEFAULT 0;

-- Milestone completion log: one row per player × skill × milestone
CREATE TABLE IF NOT EXISTS player_skill_milestones (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id      TEXT        NOT NULL,
  milestone_id  TEXT        NOT NULL,
  reached_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS player_skill_milestones_user_idx
  ON player_skill_milestones (user_id);
