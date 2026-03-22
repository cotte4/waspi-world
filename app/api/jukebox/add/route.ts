import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { appendTenksTransaction } from '@/src/lib/commercePersistence';

const MAX_SONGS_PER_PLAYER = 3;
const COST_CATALOG = 0;
const COST_OPEN = 150;
const STALE_QUEUE_TTL_MINUTES = 45;

type AddSongBody = {
  videoId: string;
  title: string;
  artist: string;
  cost: 0 | 150;
  addedByName: string;
};

type BalanceRow = { balance: number };
type PlayerRow = { tenks: number };

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as AddSongBody | null;
  if (!body?.videoId || !body?.title || !body?.artist) {
    return NextResponse.json({ error: 'Missing required fields: videoId, title, artist.' }, { status: 400 });
  }

  const cost = body.cost === COST_CATALOG ? COST_CATALOG : COST_OPEN;

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  // Auto-heal legacy/stuck entries that were never transitioned out of "queued".
  // This avoids permanent "queue full" for players after old jukebox host issues.
  const staleBeforeIso = new Date(Date.now() - STALE_QUEUE_TTL_MINUTES * 60_000).toISOString();
  const { error: staleCleanupError } = await admin
    .from('jukebox_queue')
    .update({ status: 'skipped', skipped_at: new Date().toISOString() })
    .eq('added_by', user.id)
    .eq('status', 'queued')
    .lt('added_at', staleBeforeIso);
  if (staleCleanupError) {
    console.warn('POST /api/jukebox/add stale queue cleanup error:', staleCleanupError.message);
  }

  // --- Validate player queue limit ---
  const { count, error: countError } = await admin
    .from('jukebox_queue')
    .select('*', { count: 'exact', head: true })
    .eq('added_by', user.id)
    .eq('status', 'queued');

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if ((count ?? 0) >= MAX_SONGS_PER_PLAYER) {
    return NextResponse.json(
      { error: `Ya tenés ${MAX_SONGS_PER_PLAYER} canciones en la queue. Esperá que suenen.` },
      { status: 400 }
    );
  }

  // --- Server-validated TENKS balance ---
  const { data: balanceRow, error: balanceError } = await admin
    .from('player_tenks_balance')
    .select('balance')
    .eq('player_id', user.id)
    .single<BalanceRow>();

  const { data: playerRow } = await admin
    .from('players')
    .select('tenks')
    .eq('id', user.id)
    .maybeSingle<PlayerRow>();

  let serverBalance: number;

  if (balanceError && balanceError.code === 'PGRST116') {
    serverBalance = playerRow?.tenks ?? 0;
    await admin
      .from('player_tenks_balance')
      .insert({ player_id: user.id, balance: serverBalance });
  } else if (balanceError) {
    return NextResponse.json({ error: balanceError.message }, { status: 500 });
  } else {
    serverBalance = Math.max(balanceRow.balance, playerRow?.tenks ?? balanceRow.balance);
    if (serverBalance !== balanceRow.balance) {
      await admin
        .from('player_tenks_balance')
        .upsert({ player_id: user.id, balance: serverBalance });
    }
  }

  if (serverBalance < cost) {
    return NextResponse.json(
      { error: `Necesitás ${cost} TENKS para agregar una canción. Tenés ${serverBalance}.`, balance: serverBalance },
      { status: 400 }
    );
  }

  const newBalance = serverBalance - cost;

  if (cost > 0) {
    // --- Deduct TENKS atomically ---
    const { error: deductError } = await admin
      .from('player_tenks_balance')
      .upsert({ player_id: user.id, balance: newBalance });

    if (deductError) {
      return NextResponse.json({ error: deductError.message }, { status: 500 });
    }
  }

  // --- Insert into queue ---
  const { data: queueRow, error: insertError } = await admin
    .from('jukebox_queue')
    .insert({
      video_id: body.videoId,
      title: body.title,
      artist: body.artist,
      added_by: user.id,
      added_by_name: body.addedByName,
      cost,
      status: 'queued',
    })
    .select('id')
    .single<{ id: string }>();

  if (insertError) {
    // Compensating refund if queue insert fails
    if (cost > 0) {
      await admin
        .from('player_tenks_balance')
        .upsert({ player_id: user.id, balance: serverBalance });
    }

    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // --- Get queue position ---
  const { count: queueCount } = await admin
    .from('jukebox_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued');

  const queuePosition = queueCount ?? 0;

  // --- Log TENKS transaction ---
  if (cost > 0) {
    try {
      await appendTenksTransaction(admin, {
        playerId: user.id,
        amount: -cost,
        reason: `jukebox_add_song`,
        balanceAfter: newBalance,
      });
    } catch (err) {
      console.error('POST /api/jukebox/add transaction log error:', err);
    }
  }

  return NextResponse.json({
    ok: true,
    queueId: queueRow.id,
    newBalance,
    queuePosition,
  });
}
