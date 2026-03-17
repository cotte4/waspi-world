// POST /api/guilds/join
// Body: { guild_id: string }
// Validaciones:
// - Usuario autenticado
// - guild_id válido
// - No está ya en ese gremio
// - Máximo 2 gremios activos

import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ── Types ──────────────────────────────────────────────────────────────────

interface JoinBody {
  guild_id?: string;
}

interface ExistingRepRow {
  guild_id: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_GUILDS = ['mineros', 'pescadores', 'cocineros', 'botanicos'] as const;
type ValidGuildId = (typeof VALID_GUILDS)[number];
const MAX_GUILDS = 2;

// ── POST /api/guilds/join ──────────────────────────────────────────────────

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

  const body = await request.json().catch(() => ({})) as JoinBody;
  const guildId = body.guild_id;

  if (!guildId || !VALID_GUILDS.includes(guildId as ValidGuildId)) {
    return NextResponse.json({ error: 'Gremio inválido.' }, { status: 400 });
  }

  // Check cuántos gremios tiene ya
  const { data: existing } = await admin
    .from('player_guild_rep')
    .select('guild_id')
    .eq('user_id', user.id)
    .returns<ExistingRepRow[]>();

  if ((existing ?? []).length >= MAX_GUILDS) {
    return NextResponse.json({ error: 'Ya estás en el máximo de gremios (2).' }, { status: 400 });
  }

  const alreadyIn = (existing ?? []).some((r) => r.guild_id === guildId);
  if (alreadyIn) {
    return NextResponse.json({ error: 'Ya eres miembro de este gremio.' }, { status: 400 });
  }

  const { error } = await admin.from('player_guild_rep').insert({
    user_id: user.id,
    guild_id: guildId,
    rep: 0,
    rank: 'novato',
  });

  if (error) {
    return NextResponse.json({ error: 'No se pudo unir al gremio.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, notice: '¡Bienvenido al gremio!' });
}
