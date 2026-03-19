-- Fish Compendium collection table
-- Each row represents one fish catch. Species uniqueness is enforced
-- at the application layer (API route returns is_new = false when
-- the player already has that fish_id in their collection).

create table if not exists player_fish_collection (
  id        uuid        primary key default gen_random_uuid(),
  user_id   uuid        references auth.users not null,
  fish_id   text        not null,
  caught_at timestamptz default now(),
  quality   text,
  size      int
);

alter table player_fish_collection enable row level security;

create policy "Users can read own fish collection"
  on player_fish_collection for select
  using (auth.uid() = user_id);

create policy "Users can insert own fish collection"
  on player_fish_collection for insert
  with check (auth.uid() = user_id);
