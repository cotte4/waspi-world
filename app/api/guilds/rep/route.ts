// POST /api/guilds/rep
// Body: { guild_id: string, action: string, amount: number }
// Validaciones:
// - Usuario autenticado
// - guild_id válido, jugador es miembro
// - amount entre 1 y 50 (anti-cheat)
// - Actualiza rep + recalcula rank + actualiza last_active
// Returns: { new_rep, new_rank, rank_up: boolean }

import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ── Types ──────────────────────────────────────────────────────────────────

interface RepBody {
  guild_id?: string;
  action?: string;
  amount?: number;
}

interface RepRow {
  rep: number;
  rank: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_GUILDS = ['mineros', 'pescadores', 'cocineros', 'botanicos'];
const MAX_REP_PER_CALL = 50;

const RANK_THRESHOLDS: Record<string, number> = {
  novato:   0,
  aprendiz: 100,
  miembro:  300,
  veterano: 700,
  leyenda:  1500,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function getRank(rep: number): string {
  const ranks = ['leyenda', 'veterano', 'miembro', 'aprendiz', 'novato'];
  for (const rank of ranks) {
    if (rep >= RANK_THRESHOLDS[rank]) return rank;
  }
  return 'novato';
}

// ── POST /api/guilds/rep ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({})) as RepBody;
  const { guild_id, amount } = body;

  if (!guild_id || !VALID_GUILDS.includes(guild_id)) {
    return NextResponse.json({ error: 'Gremio inválido.' }, { status: 400 });
  }

  const safeAmount = Math.min(Math.max(Math.floor(Number(amount) || 1), 1), MAX_REP_PER_CALL);

  const { data: repRow } = await admin
    .from('player_guild_rep')
    .select('rep, rank')
    .eq('user_id', user.id)
    .eq('guild_id', guild_id)
    .single<RepRow>();

  if (!repRow) {
    return NextResponse.json({ error: 'No eres miembro de este gremio.' }, { status: 400 });
  }

  const newRep = repRow.rep + safeAmount;
  const oldRank = repRow.rank;
  const newRank = getRank(newRep);
  const rankUp = newRank !== oldRank;

  const { error: updateError } = await admin
    .from('player_guild_rep')
    .update({
      rep: newRep,
      rank: newRank,
      last_active: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('guild_id', guild_id);

  if (updateError) {
    return NextResponse.json({ error: 'Error al actualizar reputación.' }, { status: 500 });
  }

  return NextResponse.json({ new_rep: newRep, new_rank: newRank, rank_up: rankUp });
}
