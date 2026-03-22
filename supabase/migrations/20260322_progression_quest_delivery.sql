-- Phase 0: server-side progression, quest flags, weed delivery cooldowns

-- ── player_stats: add xp and level columns ───────────────────────────────────
alter table public.player_stats
  add column if not exists xp    integer not null default 0,
  add column if not exists level integer not null default 1;

-- ── players: add utility_equipped for gun/utility item slots ─────────────────
alter table public.players
  add column if not exists utility_equipped jsonb not null default '[]'::jsonb;

-- ── weed_delivery_cooldowns ───────────────────────────────────────────────────
create table if not exists public.weed_delivery_cooldowns (
  player_id    uuid not null references auth.users(id) on delete cascade,
  npc_id       text not null check (npc_id in ('dealer_1', 'dealer_2', 'dealer_3')),
  delivered_at timestamptz not null,
  primary key (player_id, npc_id)
);

alter table public.weed_delivery_cooldowns enable row level security;

drop policy if exists "weed_cooldowns_select_own" on public.weed_delivery_cooldowns;
create policy "weed_cooldowns_select_own"
  on public.weed_delivery_cooldowns for select
  using (auth.uid() = player_id);

-- Writes are service-role only (done inside /api/weed/deliver).

-- ── player_quest_flags ────────────────────────────────────────────────────────
create table if not exists public.player_quest_flags (
  player_id  uuid not null references auth.users(id) on delete cascade,
  flag_key   text not null,
  flag_value text not null default 'true',
  created_at timestamptz not null default now(),
  primary key (player_id, flag_key)
);

alter table public.player_quest_flags enable row level security;

drop policy if exists "quest_flags_select_own" on public.player_quest_flags;
create policy "quest_flags_select_own"
  on public.player_quest_flags for select
  using (auth.uid() = player_id);

drop policy if exists "quest_flags_upsert_own" on public.player_quest_flags;
create policy "quest_flags_upsert_own"
  on public.player_quest_flags for insert
  with check (auth.uid() = player_id);

drop policy if exists "quest_flags_update_own" on public.player_quest_flags;
create policy "quest_flags_update_own"
  on public.player_quest_flags for update
  using (auth.uid() = player_id);
