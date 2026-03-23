import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser } from '@/src/lib/supabaseServer';
import { DEFAULT_PLAYER_STATE, creditTenks, normalizePlayerState } from '@/src/lib/playerState';
import { appendTenksTransaction, ensureCatalogSeeded, ensurePlayerRow, recordGameSession } from '@/src/lib/commercePersistence';
import { creditBalance, getAuthoritativeBalance } from '@/src/lib/tenksBalance';

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
  const baseBalance = await getAuthoritativeBalance(admin, {
    playerId: user.id,
    fallbackBalance: (user.user_metadata?.waspiPlayer as { tenks?: number } | undefined)?.tenks ?? DEFAULT_PLAYER_STATE.tenks,
  });
  const current = normalizePlayerState(user.user_metadata?.waspiPlayer ?? DEFAULT_PLAYER_STATE);
  let next = current;

  if (won) {
    next = creditTenks({ ...current, tenks: baseBalance }, PENALTY_TENKS_REWARD);
    await appendTenksTransaction(admin, {
      playerId: user.id,
      amount: PENALTY_TENKS_REWARD,
      reason: 'penalty_win',
      balanceAfter: next.tenks,
    });
    await creditBalance(admin, {
      playerId: user.id,
      amount: PENALTY_TENKS_REWARD,
      fallbackBalance: baseBalance,
    });
  } else {
    next = { ...current, tenks: baseBalance };
  }

  await ensurePlayerRow(admin, user, next, { syncTenksBalance: won });
  await recordGameSession(admin, {
    playerId: user.id,
    minigame: 'penalty',
    score: goals,
    result: won ? 'win' : 'lose',
    tenksEarned: won ? PENALTY_TENKS_REWARD : 0,
    rewardCode: null,
  });

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      waspiPlayer: next,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    won,
    goals,
    shots,
    tenksEarned: won ? PENALTY_TENKS_REWARD : 0,
    player: next,
  });
}
