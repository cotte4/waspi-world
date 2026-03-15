-- Player TENKS balance — dedicated server-side source of truth.
-- NOTE: players.tenks already exists for backward compat; this table is the
-- authoritative, RLS-protected balance used by server-validated purchases.

CREATE TABLE IF NOT EXISTS public.player_tenks_balance (
  player_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance   INTEGER NOT NULL DEFAULT 5000 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: players can only read their own balance; writes are service-role only.
ALTER TABLE public.player_tenks_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenks_balance_select_own" ON public.player_tenks_balance;
CREATE POLICY "tenks_balance_select_own"
  ON public.player_tenks_balance FOR SELECT
  USING (player_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "tenks_balance_service_only" ON public.player_tenks_balance;
CREATE POLICY "tenks_balance_service_only"
  ON public.player_tenks_balance FOR ALL
  USING (auth.role() = 'service_role');

-- Reuse the existing set_updated_at() function (defined in 20260313_prd_schema.sql).
DROP TRIGGER IF EXISTS trg_player_tenks_balance_updated_at ON public.player_tenks_balance;
CREATE TRIGGER trg_player_tenks_balance_updated_at
  BEFORE UPDATE ON public.player_tenks_balance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Back-fill from players.tenks for any existing players.
INSERT INTO public.player_tenks_balance (player_id, balance)
  SELECT id, tenks FROM public.players
ON CONFLICT (player_id) DO NOTHING;
