import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser } from '@/src/lib/supabaseServer';
import { DEFAULT_PLAYER_STATE } from '@/src/lib/playerState';
import { appendTenksTransaction, ensureCatalogSeeded, hydratePlayerFromDatabase, syncPlayerMetadataSnapshot } from '@/src/lib/commercePersistence';
import { calculateBasketReward } from '@/src/lib/basketRewards';
import { creditBalance, debitBalance } from '@/src/lib/tenksBalance';

const MAX_SCORE = 30;
const MAX_SHOTS = 30;
const ACTIVE_RUN_WINDOW_MS = 5 * 60 * 1000;

type BasketRewardBody = {
  score?: number;
  shots?: number;
  runId?: string;
};

type BasketSessionRow = {
  id: string;
  score: number | null;
  result: string | null;
  tenks_earned: number | null;
  reward_code: string | null;
  created_at: string;
};

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin client unavailable.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as BasketRewardBody | null;
  const score = Math.min(MAX_SCORE, Math.max(0, Math.floor(body?.score ?? 0)));
  const shots = Math.min(MAX_SHOTS, Math.max(0, Math.floor(body?.shots ?? 0)));
  const runId = typeof body?.runId === 'string' ? body.runId.trim() : '';

  if (!runId) {
    return NextResponse.json({ error: 'Missing basket run id.' }, { status: 400 });
  }

  if (score > shots) {
    return NextResponse.json({ error: 'Invalid basket result.' }, { status: 400 });
  }

  const reward = calculateBasketReward(score);

  await ensureCatalogSeeded(admin);
  const { data: session, error: sessionError } = await admin
    .from('game_sessions')
    .select('id, score, result, tenks_earned, reward_code, created_at')
    .eq('player_id', user.id)
    .eq('minigame', 'basket')
    .eq('reward_code', runId)
    .maybeSingle<BasketSessionRow>();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: 'Basket run not found.' }, { status: 404 });
  }

  const sessionAgeMs = Date.now() - new Date(session.created_at).getTime();
  if (sessionAgeMs > ACTIVE_RUN_WINDOW_MS) {
    return NextResponse.json({ error: 'Basket run expired.' }, { status: 409 });
  }

  const current = await hydratePlayerFromDatabase(admin, user, DEFAULT_PLAYER_STATE);

  if (session.result === 'reward' || session.result === 'no_reward') {
    return NextResponse.json({
      score: session.score ?? score,
      shots,
      tenksEarned: session.tenks_earned ?? 0,
      player: current,
      status: 'already_claimed',
    });
  }

  if (session.result !== 'started' && session.result !== 'claiming') {
    return NextResponse.json({ error: 'Basket run is not claimable.' }, { status: 409 });
  }

  const { data: claimedSession, error: claimError } = await admin
    .from('game_sessions')
    .update({
      score,
      result: 'claiming',
      tenks_earned: reward,
    })
    .eq('id', session.id)
    .eq('result', 'started')
    .select('id')
    .maybeSingle<{ id: string }>();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  if (!claimedSession) {
    const { data: latest } = await admin
      .from('game_sessions')
      .select('score, result, tenks_earned')
      .eq('id', session.id)
      .maybeSingle<BasketSessionRow>();

    if (latest?.result === 'reward' || latest?.result === 'no_reward') {
      return NextResponse.json({
        score: latest.score ?? score,
        shots,
        tenksEarned: latest.tenks_earned ?? 0,
        player: current,
        status: 'already_claimed',
      });
    }

    return NextResponse.json({ error: 'Basket run is already being claimed.' }, { status: 409 });
  }

  const baseBalance = current.tenks;
  let next = { ...current, tenks: baseBalance };
  let creditedBalance: number | null = null;

  try {
    if (reward > 0) {
      const credited = await creditBalance(admin, {
        playerId: user.id,
        amount: reward,
        fallbackBalance: baseBalance,
      });
      creditedBalance = credited.newBalance;
      next = { ...current, tenks: credited.newBalance };
    }

    if (reward > 0) {
      try {
        await appendTenksTransaction(admin, {
          playerId: user.id,
          amount: reward,
          reason: 'basket_reward',
          balanceAfter: next.tenks,
        });
      } catch {
        // Keep the reward authoritative even if the analytics/log row fails.
      }
    }

    const { error: finalizeError } = await admin
      .from('game_sessions')
      .update({
        score,
        result: reward > 0 ? 'reward' : 'no_reward',
        tenks_earned: reward,
      })
      .eq('id', session.id);

    if (finalizeError) throw finalizeError;
  } catch (error) {
    if (reward > 0 && creditedBalance !== null) {
      await debitBalance(admin, {
        playerId: user.id,
        amount: reward,
        fallbackBalance: creditedBalance,
      }).catch((rollbackError) => {
        console.error('[Waspi][basket/reward] TENKS rollback failed:', rollbackError);
      });
    }
    await admin
      .from('game_sessions')
      .update({ result: 'started', score: 0, tenks_earned: 0 })
      .eq('id', session.id)
      .eq('result', 'claiming');

    const message = error instanceof Error ? error.message : 'Basket reward failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let refreshedPlayer = next;
  try {
    refreshedPlayer = await syncPlayerMetadataSnapshot(admin, user, next);
  } catch (error) {
    console.error('[Waspi][basket/reward] snapshot sync failed:', error);
  }

  return NextResponse.json({
    score,
    shots,
    tenksEarned: reward,
    player: refreshedPlayer,
    status: 'granted',
  });
}
