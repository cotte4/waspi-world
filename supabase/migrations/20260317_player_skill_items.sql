create table if not exists player_skill_items (
  user_id uuid references auth.users not null,
  item_id text not null,
  purchased_at timestamptz default now(),
  primary key (user_id, item_id)
);

alter table player_skill_items enable row level security;

create policy "Users can read own skill items"
  on player_skill_items for select
  using (auth.uid() = user_id);

create policy "Users can insert own skill items"
  on player_skill_items for insert
  with check (auth.uid() = user_id);
