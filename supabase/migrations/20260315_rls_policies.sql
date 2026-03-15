-- RLS policies for player_inventory, orders, and tenks_transactions.
--
-- NOTE on player_id type:
--   These tables store player_id as UUID referencing public.players(id).
--   public.players(id) itself references auth.users(id), so auth.uid() matches
--   player_id directly — same pattern used by player_tenks_balance.
--
-- NOTE on service_role writes:
--   All inserts and updates to these tables are performed server-side via
--   Next.js API routes authenticated with the Supabase service role key.
--   Clients (the Phaser game) only need SELECT on their own rows.

-- ─────────────────────────────────────────────
-- player_inventory
-- ─────────────────────────────────────────────

ALTER TABLE public.player_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_select_own" ON public.player_inventory;
CREATE POLICY "inventory_select_own"
  ON public.player_inventory FOR SELECT
  USING (player_id = auth.uid());

DROP POLICY IF EXISTS "inventory_service_write" ON public.player_inventory;
CREATE POLICY "inventory_service_write"
  ON public.player_inventory FOR ALL
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────
-- orders
-- ─────────────────────────────────────────────

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own"
  ON public.orders FOR SELECT
  USING (player_id = auth.uid());

DROP POLICY IF EXISTS "orders_service_write" ON public.orders;
CREATE POLICY "orders_service_write"
  ON public.orders FOR ALL
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────
-- tenks_transactions
-- ─────────────────────────────────────────────

ALTER TABLE public.tenks_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenks_transactions_select_own" ON public.tenks_transactions;
CREATE POLICY "tenks_transactions_select_own"
  ON public.tenks_transactions FOR SELECT
  USING (player_id = auth.uid());

DROP POLICY IF EXISTS "tenks_transactions_service_write" ON public.tenks_transactions;
CREATE POLICY "tenks_transactions_service_write"
  ON public.tenks_transactions FOR ALL
  USING (auth.role() = 'service_role');
