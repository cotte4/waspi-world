-- Ad-hoc patches applied manually via Supabase SQL Editor on 2026-03-25
-- These were not in the original migration files.

-- 1. muted_players column on players (was missing from prd_schema)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS muted_players jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. product_id column on player_inventory (was missing from prd_schema)
ALTER TABLE public.player_inventory
  ADD COLUMN IF NOT EXISTS product_id text REFERENCES public.products(id);

-- 3. Unique constraint on player_inventory to allow upsert by (player_id, product_id)
ALTER TABLE public.player_inventory
  ADD CONSTRAINT IF NOT EXISTS player_inventory_player_product_unique
  UNIQUE (player_id, product_id);
