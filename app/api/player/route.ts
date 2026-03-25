import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser, hasServiceRole, isServerSupabaseConfigured } from '@/src/lib/supabaseServer';
import type { PlayerState } from '@/src/lib/playerState';
import { ensureCatalogSeeded, ensurePlayerPersistenceRows, hydratePlayerFromDatabase, syncPlayerInventory, syncPlayerMetadataSnapshot } from '@/src/lib/commercePersistence';
import { applyEditablePlayerPatch } from '@/src/lib/playerPersistenceModel';
import { mergePlayerWithVecindad } from '@/src/lib/vecindadPersistence';

export async function GET(request: NextRequest) {
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

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  let syncWarning: string | null = null;
  let player: PlayerState;
  try {
    await ensureCatalogSeeded(admin);
    player = await hydratePlayerFromDatabase(admin, user);
    player = await mergePlayerWithVecindad(admin, user.id, player);
  } catch (error) {
    syncWarning = error instanceof Error ? error.message : 'Player sync failed.';
    console.error('GET /api/player sync failed:', error);
    return NextResponse.json({ error: syncWarning }, { status: 500 });
  }

  return NextResponse.json({
    playerId: user.id,
    email: user.email ?? null,
    player,
    persistence: hasServiceRole ? 'db_authoritative_snapshot' : 'read_only_session',
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
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  let nextPlayer: PlayerState;
  try {
    const currentPlayer = await hydratePlayerFromDatabase(admin, user);
    nextPlayer = applyEditablePlayerPatch(currentPlayer, body?.player ?? null);
  } catch (hydrateError) {
    const message = hydrateError instanceof Error ? hydrateError.message : 'Failed to resolve player state.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let syncWarning: string | null = null;
  try {
    await ensureCatalogSeeded(admin);
    await ensurePlayerPersistenceRows(admin, user, nextPlayer);
    await syncPlayerInventory(admin, user.id, nextPlayer);
    nextPlayer = await hydratePlayerFromDatabase(admin, user, nextPlayer);
    nextPlayer = await mergePlayerWithVecindad(admin, user.id, nextPlayer);
  } catch (syncError) {
    syncWarning = syncError instanceof Error ? syncError.message : 'Player sync failed.';
    console.error('PUT /api/player sync failed:', syncError);
  }

  try {
    nextPlayer = await syncPlayerMetadataSnapshot(admin, user, nextPlayer);
  } catch (snapshotError) {
    const message = snapshotError instanceof Error ? snapshotError.message : 'Failed to sync player metadata snapshot.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    playerId: user.id,
    player: nextPlayer,
    persistence: 'db_authoritative_snapshot',
    syncWarning,
  });
}

