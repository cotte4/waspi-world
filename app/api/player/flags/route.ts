import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

type QuestFlagRow = { flag_key: string; flag_value: string };

const ALLOWED_FLAG_KEYS = ['cottenks_met', 'plato_cooking'] as const;
type AllowedFlagKey = (typeof ALLOWED_FLAG_KEYS)[number];

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/player/flags
// Returns all quest flags for the authenticated player.
export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  const { data, error } = await admin
    .from('player_quest_flags')
    .select('flag_key, flag_value')
    .eq('player_id', user.id)
    .returns<QuestFlagRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const flags: Record<string, string> = {};
  for (const row of data ?? []) {
    flags[row.flag_key] = row.flag_value;
  }

  return NextResponse.json({ flags });
}

// POST /api/player/flags
// Upserts a quest flag for the authenticated player.
// Body: { flag_key: string, flag_value?: string }
export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { flag_key?: unknown; flag_value?: unknown };
  try {
    body = (await request.json()) as { flag_key?: unknown; flag_value?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { flag_key, flag_value } = body;

  if (typeof flag_key !== 'string' || !(ALLOWED_FLAG_KEYS as readonly string[]).includes(flag_key)) {
    return NextResponse.json(
      { error: `flag_key must be one of: ${ALLOWED_FLAG_KEYS.join(', ')}` },
      { status: 400 },
    );
  }

  const key = flag_key as AllowedFlagKey;
  let value: string;

  if (key === 'plato_cooking') {
    const today = todayUTC();
    if (typeof flag_value !== 'string' || flag_value !== today) {
      return NextResponse.json(
        { error: `flag_value for plato_cooking must be today's UTC date (${today}).` },
        { status: 400 },
      );
    }
    value = flag_value;
  } else {
    value = 'true';
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  const { error } = await admin
    .from('player_quest_flags')
    .upsert(
      { player_id: user.id, flag_key: key, flag_value: value },
      { onConflict: 'player_id,flag_key' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ flag_key: key, flag_value: value });
}
