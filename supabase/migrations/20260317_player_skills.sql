-- Player skills table: tracks XP and level per skill per player
create table if not exists player_skills (
  user_id uuid references auth.users(id) on delete cascade not null,
  skill_id text not null check (skill_id in ('mining', 'fishing', 'gardening', 'cooking', 'gym', 'weed')),
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 0 check (level >= 0 and level <= 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

-- RLS
alter table player_skills enable row level security;

create policy "Players can read own skills"
  on player_skills for select
  using (auth.uid() = user_id);

create policy "Players can insert own skills"
  on player_skills for insert
  with check (auth.uid() = user_id);

create policy "Players can update own skills"
  on player_skills for update
  using (auth.uid() = user_id);
