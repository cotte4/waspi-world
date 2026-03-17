-- Contracts published by guilds each week
create table if not exists contracts (
  id          text primary key,
  guild_id    text not null,   -- 'miners' | 'growers' | 'chefs' | 'cartel'
  skill_id    text not null,   -- which skill this contract belongs to
  type        text not null,   -- 'production' | 'delivery' | 'cooperative'
  title       text not null,
  description text not null,
  objective   jsonb not null,  -- { action, skill, quantity, min_quality? }
  reward_tenks int not null default 0,
  reward_xp    int not null default 0,
  reward_rep   int not null default 50,
  week_id      text not null,  -- 'YYYY-WNN'
  min_level    int not null default 0
);

create table if not exists player_contracts (
  user_id          uuid references auth.users not null,
  contract_id      text references contracts(id) not null,
  progress         int not null default 0,
  completed_at     timestamptz,
  reward_claimed_at timestamptz,
  updated_at       timestamptz default now(),
  primary key (user_id, contract_id)
);

alter table player_contracts enable row level security;
create policy "Users read own contracts"    on player_contracts for select using (auth.uid() = user_id);
create policy "Users insert own contracts"  on player_contracts for insert with check (auth.uid() = user_id);
create policy "Users update own contracts"  on player_contracts for update using (auth.uid() = user_id);
