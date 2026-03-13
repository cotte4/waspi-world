import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser } from '@/src/lib/supabaseServer';
import { DEFAULT_PLAYER_STATE, creditTenks, normalizePlayerState } from '@/src/lib/playerState';
import { appendTenksTransaction, createDiscountCode, ensureCatalogSeeded, ensurePlayerRow, recordGameSession } from '@/src/lib/commercePersistence';

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
  const current = normalizePlayerState(user.user_metadata?.waspiPlayer ?? DEFAULT_PLAYER_STATE);
  let next = current;
  let discount: { code: string; percent_off: number; expires_at: string } | null = null;

  if (won) {
    next = creditTenks(current, 300);
    await appendTenksTransaction(admin, {
      playerId: user.id,
      amount: 300,
      reason: 'penalty_win',
      balanceAfter: next.tenks,
    });
    discount = await createDiscountCode(admin, {
      playerId: user.id,
      percentOff: 10,
      source: 'penalty_win',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });
  }

  await ensurePlayerRow(admin, user, next);
  await recordGameSession(admin, {
    playerId: user.id,
    minigame: 'penalty',
    score: goals,
    result: won ? 'win' : 'lose',
    tenksEarned: won ? 300 : 0,
    rewardCode: discount?.code ?? null,
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
    reward: discount
      ? {
          code: discount.code,
          percentOff: discount.percent_off,
          expiresAt: discount.expires_at,
        }
      : null,
    player: next,
  });
}
