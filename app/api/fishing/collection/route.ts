import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { FISH_SPECIES, VALID_FISH_IDS } from '@/src/game/config/fishSpecies';

// ── Types ──────────────────────────────────────────────────────────────────

interface FishCollectionRow {
  fish_id: string;
  caught_at: string;
  quality: string | null;
  size: number | null;
}

// ── GET /api/fishing/collection ────────────────────────────────────────────
// Returns the authenticated player's full fish collection.

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

  const { data, error } = await admin
    .from('player_fish_collection')
    .select('fish_id, caught_at, quality, size')
    .eq('user_id', user.id)
    .returns<FishCollectionRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ collection: data ?? [] });
}

// ── POST /api/fishing/collection ───────────────────────────────────────────
// Records a new fish catch. Returns is_new + xp_bonus.
// If the species was already caught, is_new = false and xp_bonus = 0.

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

  let body: { fish_id: string; quality?: string; size?: number };
  try {
    body = (await request.json()) as { fish_id: string; quality?: string; size?: number };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { fish_id, quality, size } = body;

  // Validate fish_id against the canonical species list
  if (!fish_id || !VALID_FISH_IDS.has(fish_id)) {
    return NextResponse.json({ error: 'invalid_fish_id' }, { status: 400 });
  }

  // Check if this species is already in the player's collection
  const { data: existing, error: checkError } = await admin
    .from('player_fish_collection')
    .select('fish_id')
    .eq('user_id', user.id)
    .eq('fish_id', fish_id)
    .maybeSingle();

  if (checkError) {
    return NextResponse.json({ error: checkError.message }, { status: 500 });
  }

  if (existing) {
    // Already caught — still record the catch but no bonus
    await admin.from('player_fish_collection').insert({
      user_id: user.id,
      fish_id,
      quality: quality ?? null,
      size: size ?? null,
    });

    return NextResponse.json({ is_new: false, xp_bonus: 0, fish_name: fish_id });
  }

  // First time catching this species — insert and award XP bonus
  const { error: insertError } = await admin.from('player_fish_collection').insert({
    user_id: user.id,
    fish_id,
    quality: quality ?? null,
    size: size ?? null,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const species = FISH_SPECIES.find((f) => f.id === fish_id);
  const xp_bonus = species?.baseXp ?? 0;
  const fish_name = species?.name ?? fish_id;

  return NextResponse.json({ is_new: true, xp_bonus, fish_name });
}
