import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser, isServerSupabaseConfigured } from '@/src/lib/supabaseServer';
import type { PlayerStats } from '@/src/game/systems/StatsSystem';

type PlayerStatsResponse = PlayerStats & {
  xp: number;
  level: number;
};

export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const { data, error } = await admin
    .from('player_stats')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle<PlayerStatsResponse & { user_id: string; updated_at: string }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Row might not exist yet for a new player — return zeroed defaults
  const stats: PlayerStatsResponse = data ?? {
    zombie_kills: 0,
    pvp_kills: 0,
    deaths: 0,
    kill_streak_best: 0,
    tenks_earned: 0,
    tenks_spent: 0,
    time_played_seconds: 0,
    distance_walked: 0,
    zones_visited: [],
    npcs_talked_to: 0,
    basket_best_score: 0,
    basket_shots: 0,
    basket_makes: 0,
    penalty_goals: 0,
    penalty_saves: 0,
    penalty_wins: 0,
    penalty_losses: 0,
    xp: 0,
    level: 1,
  };

  return NextResponse.json({ stats });
}
