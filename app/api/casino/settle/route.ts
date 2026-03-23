import { NextRequest, NextResponse } from 'next/server';
import { appendTenksTransaction } from '@/src/lib/commercePersistence';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { creditBalance, debitBalance, getAuthoritativeBalance } from '@/src/lib/tenksBalance';

const VALID_GAMES = ['slots', 'roulette', 'blackjack', 'poker'] as const;
type CasinoGame = typeof VALID_GAMES[number];

type SettleBody = {
  game?: unknown;
  runId?: unknown;
  wager?: unknown;
  payout?: unknown;
  score?: unknown;
};

type CasinoSessionRow = {
  id: string;
  score: number | null;
  result: string | null;
  tenks_earned: number | null;
  reward_code: string | null;
};

function isCasinoGame(value: unknown): value is CasinoGame {
  return VALID_GAMES.includes(value as CasinoGame);
}

function normalizeTenks(value: unknown) {
  return Math.max(0, Math.floor(Number(value ?? 0)));
}

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as SettleBody | null;
  if (!isCasinoGame(body?.game)) {
    return NextResponse.json({ error: 'game must be slots, roulette, blackjack, or poker' }, { status: 400 });
  }

  const runId = typeof body?.runId === 'string' ? body.runId.trim() : '';
  if (!runId) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  }

  const wager = normalizeTenks(body?.wager);
  const payout = normalizeTenks(body?.payout);
  const score = normalizeTenks(body?.score ?? payout - wager);
  const game = body.game;

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  const minigame = `casino_${game}`;
  const { data: existing, error: existingError } = await admin
    .from('game_sessions')
    .select('id, score, result, tenks_earned, reward_code')
    .eq('player_id', user.id)
    .eq('minigame', minigame)
    .eq('reward_code', runId)
    .maybeSingle<CasinoSessionRow>();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing && ['settled', 'no_payout', 'claiming'].includes(existing.result ?? '')) {
    const balance = await getAuthoritativeBalance(admin, { playerId: user.id });
    return NextResponse.json({
      status: 'already_settled',
      score: existing.score ?? score,
      netChange: existing.tenks_earned ?? (payout - wager),
      newBalance: balance,
    });
  }

  const { data: inserted, error: insertError } = await admin
    .from('game_sessions')
    .insert({
      player_id: user.id,
      minigame,
      score,
      result: 'claiming',
      tenks_earned: payout - wager,
      reward_code: runId,
    })
    .select('id')
    .single<{ id: string }>();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create casino settlement.' }, { status: 500 });
  }

  let newBalance = 0;
  try {
    const debit = await debitBalance(admin, {
      playerId: user.id,
      amount: wager,
    });

    if (!debit.ok) {
      await admin
        .from('game_sessions')
        .update({ result: 'failed' })
        .eq('id', inserted.id);

      return NextResponse.json({
        error: `Necesitas ${wager} TENKS para cerrar esta apuesta. Tenes ${debit.previousBalance}.`,
        balance: debit.previousBalance,
      }, { status: 400 });
    }

    newBalance = debit.newBalance;

    if (wager > 0) {
      await appendTenksTransaction(admin, {
        playerId: user.id,
        amount: -wager,
        reason: `casino_${game}_bet`,
        balanceAfter: newBalance,
      });
    }

    if (payout > 0) {
      const credit = await creditBalance(admin, {
        playerId: user.id,
        amount: payout,
        fallbackBalance: newBalance,
        defaultBalance: newBalance,
      });
      newBalance = credit.newBalance;

      await appendTenksTransaction(admin, {
        playerId: user.id,
        amount: payout,
        reason: `casino_${game}_payout`,
        balanceAfter: newBalance,
      });
    }
  } catch (error) {
    if (newBalance > 0 && payout === 0) {
      try {
        await creditBalance(admin, {
          playerId: user.id,
          amount: wager,
          fallbackBalance: newBalance,
          defaultBalance: newBalance,
        });
      } catch {
        // Keep the original error path; balance can be inspected from the authoritative table.
      }
    }

    await admin
      .from('game_sessions')
      .update({ result: 'failed' })
      .eq('id', inserted.id);

    const message = error instanceof Error ? error.message : 'Casino settlement failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error: finalizeError } = await admin
    .from('game_sessions')
    .update({ result: payout > 0 ? 'settled' : 'no_payout' })
    .eq('id', inserted.id);

  if (finalizeError) {
    return NextResponse.json({ error: finalizeError.message }, { status: 500 });
  }

  return NextResponse.json({
    status: 'settled',
    game,
    score,
    wager,
    payout,
    netChange: payout - wager,
    newBalance,
  });
}
