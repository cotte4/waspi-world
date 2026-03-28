-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Skill Level 6 (LEGEND) + cosmetics milestone index
-- Date: 2026-03-27
-- ──────────────────────────────────────────────────────────────────────────────

-- Level 6 "LEGEND" is a cosmetic rank earned at 3500 cumulative XP.
-- No new columns needed — player_skills.level is already INTEGER with no max
-- constraint. This migration documents the threshold and adds the index below.

-- Compound index on player_skill_milestones for the cosmetics unlock query:
--   SELECT milestone_id FROM player_skill_milestones
--   WHERE user_id = $1 AND milestone_id = ANY($2)
-- The existing (user_id) index already covers this well, but the compound
-- index avoids a heap fetch when only milestone_id is needed.
CREATE INDEX IF NOT EXISTS player_skill_milestones_user_milestone_idx
  ON player_skill_milestones (user_id, milestone_id);

-- Cosmetic milestone IDs (documentation only — enforced in application layer):
-- gardening_50  → botanist_hat   (bucket hat, green)
-- cooking_50    → chef_headband  (headband, gold)
-- mining_200    → crystal_aura   (sparkle aura, blue)
-- gym_200       → combat_aura    (stars aura, red)
-- weed_200      → gold_shades    (shades, gold)
-- fishing_200   → fishing_visor  (visor, blue)
