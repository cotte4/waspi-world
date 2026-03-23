import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser, isServerSupabaseConfigured } from '@/src/lib/supabaseServer';
import { appendTenksTransaction } from '@/src/lib/commercePersistence';
import { creditBalance, getAuthoritativeBalance } from '@/src/lib/tenksBalance';

const VALID_GAMES = ['darts', 'dino', 'flappy'] as const;
type RewardGame = typeof VALID_GAMES[number];

type RewardBody = {
  game?: unknown;
  score?: unknown;
  runId?: unknown;
  bullseyes?: unknown;
  easter404Used?: unknown;
};

type SessionRow = {
  id: string;
  score: number | null;
  result: string | null;
  tenks_earned: number | null;
  reward_code: string | null;
};

function isRewardGame(value: unknown): value is RewardGame {
  return VALID_GAMES.includes(value as RewardGame);
}

function calcDartsReward(score: number, bullseyes: number) {
  let reward = 30;
  if (score > 200) reward = 250;
  else if (score >= 151) reward = 200;
  else if (score >= 101) reward = 130;
  else if (score >= 51) reward = 70;
  reward += bullseyes * 40;
  return Math.min(450, reward);
}

function calcDinoReward(score: number, isNewBest: boolean, easter404Used: boolean) {
  let tenks = 25;
  if (score >= 1000) tenks = 500;
  else if (score >= 500) tenks = 300;
  else if (score >= 300) tenks = 150;
  else if (score >= 100) tenks = 75;

  if (isNewBest) tenks += 100;
  if (easter404Used) tenks += 404;
  return tenks;
}

function calcFlappyReward(score: number, isNewBest: boolean) {
  let tenks = 30;
  if (score >= 100) tenks = 600;
  else if (score >= 50) tenks = 300;
  else if (score >= 25) tenks = 150;
  else if (score >= 10) tenks = 75;

  if (isNewBest) tenks += 100;
  return tenks;
}

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as RewardBody | null;
  if (!isRewardGame(body?.game)) {
    return NextResponse.json({ error: 'game must be darts, dino, or flappy' }, { status: 400 });
  }
  const game = body.game;
  const score = Math.max(0, Math.floor(Number(body?.score ?? 0)));
  const runId = typeof body?.runId === 'string' ? body.runId.trim() : '';
  const bullseyes = Math.max(0, Math.floor(Number(body?.bullseyes ?? 0)));
  const easter404Used = body?.easter404Used === true;

  if (!runId) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const { data: existing, error: existingError } = await admin
    .from('game_sessions')
    .select('id, score, result, tenks_earned, reward_code')
    .eq('player_id', user.id)
    .eq('minigame', game)
    .eq('reward_code', runId)
    .maybeSingle<SessionRow>();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing && ['reward', 'no_reward', 'claiming'].includes(existing.result ?? '')) {
    const balance = await getAuthoritativeBalance(admin, { playerId: user.id });
    return NextResponse.json({
      status: 'already_claimed',
      score: existing.score ?? score,
      tenksEarned: existing.tenks_earned ?? 0,
      newBalance: balance,
    });
  }

  const { data: currentBest, error: bestError } = await admin
    .from('game_sessions')
    .select('score')
    .eq('player_id', user.id)
    .eq('minigame', game)
    .order('score', { ascending: false })
    .limit(1)
    .maybeSingle<{ score: number }>();

  if (bestError) {
    return NextResponse.json({ error: bestError.message }, { status: 500 });
  }

  const bestBefore = currentBest?.score ?? 0;
  const isNewBest = score > bestBefore;

  const tenksEarned = game === 'darts'
    ? calcDartsReward(score, bullseyes)
    : game === 'dino'
      ? calcDinoReward(score, isNewBest, easter404Used)
      : calcFlappyReward(score, isNewBest);

  const { data: inserted, error: insertError } = await admin
    .from('game_sessions')
    .insert({
      player_id: user.id,
      minigame: game,
      score,
      result: 'claiming',
      tenks_earned: tenksEarned,
      reward_code: runId,
    })
    .select('id')
    .single<{ id: string }>();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create reward session.' }, { status: 500 });
  }

  let newBalance: number;
  try {
    const credited = await creditBalance(admin, {
      playerId: user.id,
      amount: tenksEarned,
    });
    newBalance = credited.newBalance;

    if (tenksEarned > 0) {
      await appendTenksTransaction(admin, {
        playerId: user.id,
        amount: tenksEarned,
        reason: `${game}_reward`,
        balanceAfter: newBalance,
      });
    }
  } catch (error) {
    await admin
      .from('game_sessions')
      .update({ result: 'failed' })
      .eq('id', inserted.id);

    const message = error instanceof Error ? error.message : 'Failed to credit TENKS.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error: finalizeError } = await admin
    .from('game_sessions')
    .update({ result: tenksEarned > 0 ? 'reward' : 'no_reward' })
    .eq('id', inserted.id);

  if (finalizeError) {
    return NextResponse.json({ error: finalizeError.message }, { status: 500 });
  }

  return NextResponse.json({
    status: 'granted',
    score,
    tenksEarned,
    newBalance,
    isNewBest,
    best: Math.max(bestBefore, score),
  });
}
