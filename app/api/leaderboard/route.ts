import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ── types ─────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  value: number;
  level?: number;
}

type TabParam = 'zombies' | 'kd' | 'level';

interface PlayerStatsRow {
  player_id: string;
  username: string;
  zombie_kills: number;
  deaths: number;
  level: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function isValidTab(value: string | null): value is TabParam {
  return value === 'zombies' || value === 'kd' || value === 'level';
}

function buildEntries(rows: PlayerStatsRow[], tab: TabParam): LeaderboardEntry[] {
  let sorted: (PlayerStatsRow & { _value: number })[];

  if (tab === 'kd') {
    sorted = rows
      .map((r) => ({ ...r, _value: r.zombie_kills / Math.max(r.deaths, 1) }))
      .sort((a, b) => b._value - a._value);
  } else if (tab === 'level') {
    sorted = rows
      .map((r) => ({ ...r, _value: r.level }))
      .sort((a, b) => b._value - a._value);
  } else {
    // zombies
    sorted = rows
      .map((r) => ({ ...r, _value: r.zombie_kills }))
      .sort((a, b) => b._value - a._value);
  }

  return sorted.slice(0, 10).map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    username: r.username,
    value: tab === 'kd' ? parseFloat(r._value.toFixed(2)) : Math.round(r._value),
    level: r.level,
  }));
}

// ── route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ entries: [] });
  }

  const { searchParams } = new URL(request.url);
  const tabRaw = searchParams.get('tab');
  const tab: TabParam = isValidTab(tabRaw) ? tabRaw : 'zombies';

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ entries: [] });
  }

  // For kd we need to fetch more rows server-side so the JS sort is accurate;
  // for the other tabs we can let Postgres sort and limit.
  let query = admin
    .from('player_stats')
    .select('player_id, username, zombie_kills, deaths, level');

  if (tab === 'zombies') {
    query = query.order('zombie_kills', { ascending: false }).limit(10);
  } else if (tab === 'level') {
    query = query.order('level', { ascending: false }).limit(10);
  } else {
    // kd: fetch top 200 by zombie_kills then sort in JS
    query = query.order('zombie_kills', { ascending: false }).limit(200);
  }

  const { data, error } = await query.returns<PlayerStatsRow[]>();

  if (error) {
    return NextResponse.json({ entries: [] });
  }

  const rows: PlayerStatsRow[] = (data ?? []).map((r) => ({
    player_id: r.player_id ?? '',
    username: r.username ?? 'Jugador',
    zombie_kills: Number(r.zombie_kills ?? 0),
    deaths: Number(r.deaths ?? 0),
    level: Number(r.level ?? 1),
  }));

  const entries = buildEntries(rows, tab);
  return NextResponse.json({ entries });
}
