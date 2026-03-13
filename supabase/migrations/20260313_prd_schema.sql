create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create table if not exists public.products (
  id text primary key,
  name text not null,
  price_ars integer null,
  stripe_price_id text null,
  category text not null,
  virtual_type text not null,
  virtual_color text not null,
  sizes jsonb not null default '[]'::jsonb,
  tenks_price integer null,
  is_active boolean not null default true,
  is_limited boolean not null default false
);

create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_config jsonb not null default '{}'::jsonb,
  equipped_top text null references public.products(id),
  equipped_bottom text null references public.products(id),
  tenks integer not null default 5000,
  achievements jsonb not null default '[]'::jsonb,
  chat_color text not null default '#FFFFFF',
  is_muted boolean not null default false,
  muted_players jsonb not null default '[]'::jsonb,
  last_position jsonb null,
  login_streak integer not null default 0,
  last_login_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  stripe_session_id text unique not null,
  items jsonb not null,
  subtotal integer not null,
  total integer not null,
  currency text not null default 'ars',
  status text not null default 'pending',
  shipping_address jsonb null,
  discount_code text null,
  discount_percent integer null,
  tracking_number text null,
  created_at timestamptz not null default now()
);

create table if not exists public.player_inventory (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  product_id text not null references public.products(id),
  acquired_via text not null,
  order_id uuid null references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.discount_codes (
  code text primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  percent_off integer not null,
  source text not null,
  used boolean not null default false,
  expires_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  username text not null,
  message text not null,
  zone text null,
  x double precision null,
  y double precision null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.players(id) on delete cascade,
  reported_player_id text not null,
  reported_username text not null,
  reason text not null,
  zone text null,
  x double precision null,
  y double precision null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  minigame text not null,
  score integer null,
  result text null,
  tenks_earned integer not null default 0,
  reward_code text null,
  created_at timestamptz not null default now()
);

create table if not exists public.tenks_transactions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  amount integer not null,
  reason text not null,
  balance_after integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_player_inventory_player_id on public.player_inventory(player_id);
create index if not exists idx_orders_player_id on public.orders(player_id);
create index if not exists idx_discount_codes_player_id on public.discount_codes(player_id);
create index if not exists idx_game_sessions_player_id on public.game_sessions(player_id);
create index if not exists idx_tenks_transactions_player_id on public.tenks_transactions(player_id);
create index if not exists idx_chat_messages_player_id on public.chat_messages(player_id);
create index if not exists idx_chat_messages_created_at on public.chat_messages(created_at);
create index if not exists idx_chat_reports_reporter_id on public.chat_reports(reporter_id);
create index if not exists idx_chat_reports_reported_player_id on public.chat_reports(reported_player_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_players_updated_at on public.players;
create trigger trg_players_updated_at
before update on public.players
for each row
execute function public.set_updated_at();

create or replace function public.purge_old_chat_messages()
returns void
language sql
as $$
  delete from public.chat_messages
  where created_at < now() - interval '48 hours';
$$;

select cron.schedule(
  'purge-chat-messages-48h',
  '0 * * * *',
  $$select public.purge_old_chat_messages();$$
)
where not exists (
  select 1 from cron.job where jobname = 'purge-chat-messages-48h'
);
