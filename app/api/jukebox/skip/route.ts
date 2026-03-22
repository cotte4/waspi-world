import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { appendTenksTransaction } from '@/src/lib/commercePersistence';

const SKIP_COST = 500;
const SKIP_THRESHOLD = 1;

type SkipBody = { videoId: string; queueId: string };
type BalanceRow = { balance: number };
type PlayerRow = { tenks: number };
type ExistingVoteRow = { id: string };

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as SkipBody | null;
  if (!body?.queueId) {
    return NextResponse.json({ error: 'Missing queueId.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  // --- Verify the song is actually playing ---
  const { data: queueEntry, error: queueError } = await admin
    .from('jukebox_queue')
    .select('id, status, video_id')
    .eq('id', body.queueId)
    .eq('status', 'playing')
    .maybeSingle<{ id: string; status: string; video_id: string }>();

  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 });
  }
  if (!queueEntry) {
    return NextResponse.json({ error: 'La canción ya no está sonando.' }, { status: 404 });
  }
  if (body.videoId && body.videoId !== queueEntry.video_id) {
    return NextResponse.json({ error: 'La canción enviada no coincide con la que está sonando.' }, { status: 400 });
  }

  // --- Reject duplicate votes before charging ---
  const { data: existingVote, error: existingVoteError } = await admin
    .from('jukebox_skip_votes')
    .select('id')
    .eq('queue_id', body.queueId)
    .eq('player_id', user.id)
    .maybeSingle<ExistingVoteRow>();

  if (existingVoteError) {
    return NextResponse.json({ error: existingVoteError.message }, { status: 500 });
  }
  if (existingVote) {
    return NextResponse.json({ error: 'Ya votaste skip para esta canción.' }, { status: 409 });
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

  if (serverBalance < SKIP_COST) {
    return NextResponse.json(
      { error: `Necesitás ${SKIP_COST} TENKS para votar skip. Tenés ${serverBalance}.`, balance: serverBalance },
      { status: 400 }
    );
  }

  const newBalance = serverBalance - SKIP_COST;

  // --- Register vote first so we never charge twice for the same vote ---
  const { error: voteError } = await admin
    .from('jukebox_skip_votes')
    .insert({ queue_id: body.queueId, player_id: user.id });

  if (voteError) {
    return NextResponse.json({ error: voteError.message }, { status: 500 });
  }

  // --- Deduct TENKS ---
  const { error: deductError } = await admin
    .from('player_tenks_balance')
    .upsert({ player_id: user.id, balance: newBalance });

  if (deductError) {
    await admin
      .from('jukebox_skip_votes')
      .delete()
      .eq('queue_id', body.queueId)
      .eq('player_id', user.id);
    return NextResponse.json({ error: deductError.message }, { status: 500 });
  }

  // --- Count total votes ---
  const { count: voteCount, error: countError } = await admin
    .from('jukebox_skip_votes')
    .select('*', { count: 'exact', head: true })
    .eq('queue_id', body.queueId);

  if (countError) {
    await admin
      .from('player_tenks_balance')
      .upsert({ player_id: user.id, balance: serverBalance });
    await admin
      .from('jukebox_skip_votes')
      .delete()
      .eq('queue_id', body.queueId)
      .eq('player_id', user.id);
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const totalVotes = voteCount ?? 0;
  const skipped = totalVotes >= SKIP_THRESHOLD;

  // --- If threshold reached: mark as skipped ---
  if (skipped) {
    await admin
      .from('jukebox_queue')
      .update({ status: 'skipped', skipped_at: new Date().toISOString() })
      .eq('id', body.queueId);
  }

  // --- Log TENKS transaction ---
  try {
    await appendTenksTransaction(admin, {
      playerId: user.id,
      amount: -SKIP_COST,
      reason: 'jukebox_skip_vote',
      balanceAfter: newBalance,
    });
  } catch (err) {
    console.error('POST /api/jukebox/skip transaction log error:', err);
  }

  return NextResponse.json({
    ok: true,
    voteCount: totalVotes,
    skipped,
    newBalance,
  });
}
