import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser } from '@/src/lib/supabaseServer';
import { appendTenksTransaction, ensureCatalogSeeded, ensurePlayerRow, hydratePlayerFromDatabase, recordGameSession, syncPlayerMetadataSnapshot } from '@/src/lib/commercePersistence';
import { creditBalance, debitBalance, getAuthoritativeBalance } from '@/src/lib/tenksBalance';

const PENALTY_TENKS_REWARD = 220;

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin client unavailable.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as { goals?: number; shots?: number } | null;
  const goals = Math.max(0, Math.floor(body?.goals ?? 0));
  const shots = Math.max(1, Math.floor(body?.shots ?? 5));
  const won = goals >= 3;

  await ensureCatalogSeeded(admin);
  const current = await hydratePlayerFromDatabase(admin, user);
  const baseBalance = await getAuthoritativeBalance(admin, {
    playerId: user.id,
    fallbackBalance: current.tenks,
  });
  let next = current;
  let creditedBalance: number | null = null;

  if (won) {
    const credited = await creditBalance(admin, {
      playerId: user.id,
      amount: PENALTY_TENKS_REWARD,
      fallbackBalance: baseBalance,
    });
    creditedBalance = credited.newBalance;
    next = { ...current, tenks: credited.newBalance };
    try {
      await appendTenksTransaction(admin, {
        playerId: user.id,
        amount: PENALTY_TENKS_REWARD,
        reason: 'penalty_win',
        balanceAfter: next.tenks,
      });
    } catch (error) {
      console.error('[Waspi][minigames/penalty] transaction log failed:', error);
    }
  } else {
    next = { ...current, tenks: baseBalance };
  }

  try {
    await ensurePlayerRow(admin, user, next, { syncTenksBalance: won });
    await recordGameSession(admin, {
      playerId: user.id,
      minigame: 'penalty',
      score: goals,
      result: won ? 'win' : 'lose',
      tenksEarned: won ? PENALTY_TENKS_REWARD : 0,
      rewardCode: null,
    });
    next = await syncPlayerMetadataSnapshot(admin, user, next);
  } catch (error) {
    if (won && creditedBalance !== null) {
      await debitBalance(admin, {
        playerId: user.id,
        amount: PENALTY_TENKS_REWARD,
        fallbackBalance: creditedBalance,
      }).catch((rollbackError) => {
        console.error('[Waspi][minigames/penalty] rollback failed:', rollbackError);
      });
    }
    const message = error instanceof Error ? error.message : 'Metadata update failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    won,
    goals,
    shots,
    tenksEarned: won ? PENALTY_TENKS_REWARD : 0,
    player: next,
  });
}
