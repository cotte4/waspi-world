import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { clampXp, getProgressionForTotals } from '@/src/lib/progression';

type ProgressionRow = {
  user_id: string;
  zombie_kills: number;
  deaths: number;
  xp: number;
  level: number;
};

// GET /api/player/progression
// Returns the server-authoritative progression state for the authenticated player.
export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const { data, error } = await admin
    .from('player_stats')
    .select('zombie_kills, deaths, xp, level')
    .eq('user_id', user.id)
    .maybeSingle<Pick<ProgressionRow, 'zombie_kills' | 'deaths' | 'xp' | 'level'>>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const kills = data?.zombie_kills ?? 0;
  const xp = data?.xp ?? 0;
  const deaths = data?.deaths ?? 0;
  const progression = getProgressionForTotals(kills, xp);

  return NextResponse.json({
    kills,
    xp,
    deaths,
    level: progression.level,
    next_level_at: progression.nextLevelAt,
  });
}

// POST /api/player/progression
// Applies an XP delta (from a kill) and recomputes level server-side.
// Body: { xp_delta: number }
export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const body = await request.json().catch(() => null) as { xp_delta?: number } | null;

  // Clamp: max 500 XP per kill to limit cheating impact
  const xpDelta = Math.min(500, Math.max(0, Math.floor(body?.xp_delta ?? 0)));

  if (xpDelta === 0) {
    return NextResponse.json({ error: 'xp_delta must be > 0' }, { status: 400 });
  }

  const { data: current } = await admin
    .from('player_stats')
    .select('zombie_kills, deaths, xp, level')
    .eq('user_id', user.id)
    .maybeSingle<Pick<ProgressionRow, 'zombie_kills' | 'deaths' | 'xp' | 'level'>>();

  const newXp = clampXp((current?.xp ?? 0) + xpDelta);
  const kills = current?.zombie_kills ?? 0;
  const deaths = current?.deaths ?? 0;
  const progression = getProgressionForTotals(kills, newXp);

  const { error: upsertError } = await admin
    .from('player_stats')
    .upsert(
      { user_id: user.id, xp: newXp, level: progression.level, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({
    kills,
    xp: newXp,
    deaths,
    level: progression.level,
    next_level_at: progression.nextLevelAt,
  });
}
