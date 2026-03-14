-- Player stats table for cross-device stat persistence and future leaderboards.
-- All counters are append-only (incremented server-side or upserted from client).

create table if not exists public.player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- combat
  zombie_kills     integer not null default 0,
  pvp_kills        integer not null default 0,
  deaths           integer not null default 0,
  kill_streak_best integer not null default 0,
  -- economy
  tenks_earned     integer not null default 0,
  tenks_spent      integer not null default 0,
  -- exploration
  time_played_seconds integer not null default 0,
  distance_walked     integer not null default 0,
  zones_visited       text[]  not null default '{}',
  npcs_talked_to      integer not null default 0,
  -- minigames: basket
  basket_best_score integer not null default 0,
  basket_shots      integer not null default 0,
  basket_makes      integer not null default 0,
  -- minigames: penalty
  penalty_goals  integer not null default 0,
  penalty_saves  integer not null default 0,
  penalty_wins   integer not null default 0,
  penalty_losses integer not null default 0,
  -- meta
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at on any row change.
create or replace function public.touch_player_stats_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_player_stats_updated_at on public.player_stats;
create trigger trg_player_stats_updated_at
  before update on public.player_stats
  for each row execute procedure public.touch_player_stats_updated_at();

-- Row-level security: players can only read and write their own row.
alter table public.player_stats enable row level security;

drop policy if exists "player_stats_select_own" on public.player_stats;
create policy "player_stats_select_own"
  on public.player_stats for select
  using (auth.uid() = user_id);

drop policy if exists "player_stats_upsert_own" on public.player_stats;
create policy "player_stats_upsert_own"
  on public.player_stats for insert
  with check (auth.uid() = user_id);

drop policy if exists "player_stats_update_own" on public.player_stats;
create policy "player_stats_update_own"
  on public.player_stats for update
  using (auth.uid() = user_id);
