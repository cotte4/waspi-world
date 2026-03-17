// GET /api/guilds
// Returns: { guilds: GuildWithRep[] }
// GuildWithRep = guild row + player's rep, rank, joined_at (null si no unido)

import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ── Types ──────────────────────────────────────────────────────────────────

interface GuildRow {
  id: string;
  name: string;
  tagline: string;
  color: string;
  icon: string;
  skill_id: string;
}

interface GuildRepRow {
  guild_id: string;
  rep: number;
  rank: string;
  joined_at: string;
  last_active: string;
}

// ── GET /api/guilds ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const [guildsRes, repRes] = await Promise.all([
    admin.from('guilds').select('*').order('id').returns<GuildRow[]>(),
    admin.from('player_guild_rep').select('*').eq('user_id', user.id).returns<GuildRepRow[]>(),
  ]);

  if (guildsRes.error) {
    return NextResponse.json({ error: guildsRes.error.message }, { status: 500 });
  }

  const repMap = new Map<string, GuildRepRow>(
    (repRes.data ?? []).map((r) => [r.guild_id, r])
  );

  const result = (guildsRes.data ?? []).map((g) => ({
    ...g,
    player_rep: repMap.get(g.id) ?? null,
  }));

  return NextResponse.json({ guilds: result });
}
