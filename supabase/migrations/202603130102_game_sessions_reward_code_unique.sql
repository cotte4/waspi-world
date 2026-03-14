alter table public.game_sessions
add column if not exists reward_code text null;

create unique index if not exists idx_game_sessions_reward_code_unique
on public.game_sessions(reward_code)
where reward_code is not null;
