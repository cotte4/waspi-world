-- player_specializations
-- Stores the chosen specialization (branch A or B) for each skill per player.
-- Each player can choose at most one spec per skill, and it cannot be changed.

create table if not exists player_specializations (
  user_id    uuid references auth.users not null,
  skill_id   text not null,
  spec_id    text not null,
  chosen_at  timestamptz default now(),
  primary key (user_id, skill_id)
);

alter table player_specializations enable row level security;

create policy "Users can read own specializations"
  on player_specializations for select
  using (auth.uid() = user_id);

create policy "Users can insert own specializations"
  on player_specializations for insert
  with check (auth.uid() = user_id);
