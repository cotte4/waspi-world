# DB Migrations — Waspi World

All migrations applied manually via Supabase SQL Editor (CLI not usable due to path-with-spaces issue on Windows).

## Applied ✓

| File | Applied | Notes |
|------|---------|-------|
| 20260313_prd_schema.sql | Initial setup | Core tables: players, products, orders, player_inventory, etc. |
| 202603130101_vecindad_parcels.sql | Initial setup | vecindad_parcels table |
| 202603130102_game_sessions_reward_code_unique.sql | Initial setup | reward_code unique index |
| 202603130103_vecindad_stage_zero.sql | Initial setup | build_stage default + constraint |
| 20260314_player_stats.sql | Initial setup | player_stats table |
| 20260314_vecindad_realtime.sql | Initial setup | Realtime on vecindad_parcels |
| 20260315_player_tenks_balance.sql | Initial setup | player_tenks_balance table |
| 20260315_rls_policies.sql | Initial setup | RLS for player_inventory, orders, tenks_transactions |
| 20260317_player_skills.sql | 2026-03-25 | player_skills table |
| 20260317_player_skill_items.sql | 2026-03-25 | player_skill_items table |
| 20260317_player_specializations.sql | 2026-03-25 | player_specializations table |
| 20260317_contracts.sql | 2026-03-25 | contracts + player_contracts tables |
| 20260317_contracts_seed.sql | 2026-03-25 | 6 seed contracts for 2026-W12 |
| 20260317_guilds.sql | 2026-03-25 | guilds + player_guild_rep tables |
| 20260317_guilds_seed.sql | 2026-03-25 | 4 guilds seeded (icons as text, no emojis) |
| 20260317_mastery.sql | 2026-03-25 | player_mastery_mp + player_mastery_unlocks |
| 20260317_global_events.sql | 2026-03-25 | global_events table |
| 20260317_global_events_seed.sql | 2026-03-25 | 3 events seeded (icons as text, no emojis) |
| 20260318_skill_milestones.sql | 2026-03-25 | action_count + player_skill_milestones |
| 20260319_fish_collection.sql | 2026-03-25 | player_fish_collection table |
| 20260319_jukebox.sql | 2026-03-25 | jukebox_catalog, queue, skip_votes tables |
| 20260322_progression_quest_delivery.sql | 2026-03-25 | xp/level on player_stats, utility_equipped on players, weed_delivery_cooldowns, player_quest_flags |
| 20260325_xp_transactions.sql | 2026-03-25 | xp_transactions table |
| 20260325_adhoc_patches.sql | 2026-03-25 | muted_players column, product_id column, player_inventory unique constraint |
| 20260327_skill_level6_cosmetics.sql | 2026-03-27 | Compound index on player_skill_milestones for cosmetics query; documents Lv6 LEGEND (3500 XP) and 6 cosmetic milestone IDs |

## Notes

- Emoji characters in seed files cause syntax errors when copy-pasting via SQL Editor on Windows. Icons replaced with text strings ('pick', 'rod', 'pan', 'plant').
- Numbers like 4000 can get split by line-wrap when pasting — use dollar quoting or split into insert + update.
- `ADD CONSTRAINT IF NOT EXISTS` syntax requires Postgres 9.x+. Supabase supports this.
