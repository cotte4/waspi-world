-- XP transaction log — mirrors tenks_transactions for auditability and recovery.
-- Every XP delta (kill reward, quest reward, etc.) is appended here so we can
-- reconstruct the true XP balance if player_stats is ever corrupted or reset.

create table if not exists public.xp_transactions (
  id            uuid        primary key default gen_random_uuid(),
  player_id     uuid        not null references public.players(id) on delete cascade,
  amount        integer     not null,
  reason        text        not null,
  xp_after      integer     not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_xp_transactions_player_id
  on public.xp_transactions(player_id, created_at desc);

-- RLS: players can read their own transactions; only service role can write.
alter table public.xp_transactions enable row level security;

create policy "players_read_own_xp_transactions"
  on public.xp_transactions for select
  using (player_id = auth.uid());
