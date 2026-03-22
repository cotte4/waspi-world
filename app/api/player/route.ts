import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser, hasServiceRole, isServerSupabaseConfigured } from '@/src/lib/supabaseServer';
import { DEFAULT_PLAYER_STATE, normalizePlayerState, type PlayerState } from '@/src/lib/playerState';
import { ensureCatalogSeeded, ensurePlayerRow, syncPlayerInventory } from '@/src/lib/commercePersistence';
import { mergePlayerWithVecindad } from '@/src/lib/vecindadPersistence';

const PLAYER_METADATA_KEY = 'waspiPlayer';

export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let player = normalizePlayerState(user.user_metadata?.[PLAYER_METADATA_KEY] ?? DEFAULT_PLAYER_STATE);

  let syncWarning: string | null = null;
  if (hasServiceRole) {
    const admin = createSupabaseAdminClient();
    if (admin) {
      try {
        await ensureCatalogSeeded(admin);
        await ensurePlayerRow(admin, user, player);
        player = await mergePlayerWithVecindad(admin, user.id, player);
      } catch (error) {
        syncWarning = error instanceof Error ? error.message : 'Player sync failed.';
        console.error('GET /api/player sync failed:', error);
      }
    }
  }

  return NextResponse.json({
    playerId: user.id,
    email: user.email ?? null,
    player,
    persistence: hasServiceRole ? 'supabase_user_metadata' : 'read_only_session',
    syncWarning,
  });
}

export async function PUT(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasServiceRole) {
    return NextResponse.json({ error: 'Server persistence is not configured.' }, { status: 501 });
  }

  const body = await request.json().catch(() => null) as { player?: Partial<PlayerState> } | null;
  let nextPlayer = normalizePlayerState({
    ...(user.user_metadata?.[PLAYER_METADATA_KEY] ?? DEFAULT_PLAYER_STATE),
    ...(body?.player ?? {}),
  });

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      [PLAYER_METADATA_KEY]: nextPlayer,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let syncWarning: string | null = null;
  try {
    await ensureCatalogSeeded(admin);
    await ensurePlayerRow(admin, user, nextPlayer, { syncTenksBalance: true });
    await syncPlayerInventory(admin, user.id, nextPlayer);
    nextPlayer = await mergePlayerWithVecindad(admin, user.id, nextPlayer);
  } catch (syncError) {
    syncWarning = syncError instanceof Error ? syncError.message : 'Player sync failed.';
    console.error('PUT /api/player sync failed:', syncError);
  }

  return NextResponse.json({
    playerId: user.id,
    player: nextPlayer,
    persistence: 'supabase_user_metadata',
    syncWarning,
  });
}

