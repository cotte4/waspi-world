import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { appendTenksTransaction, syncPlayerMetadataSnapshot } from '@/src/lib/commercePersistence';
import { creditBalance, getAuthoritativeBalance } from '@/src/lib/tenksBalance';
import { logEvent } from '@/src/lib/logger';

const SERVER_EARN_RULES = {
  training_rusher: { maxAmount: 50 },
  training_shooter: { maxAmount: 50 },
  training_tank: { maxAmount: 50 },
  training_boss: { maxAmount: 50 },
  camara_del_tiempo: { maxAmount: 6 },
} as const;

// GET /api/player/tenks
// Returns the server-authoritative TENKS balance for the authenticated player.
// Creates a row with the default balance if none exists yet.
export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  try {
    const balance = await getAuthoritativeBalance(admin, { playerId: user.id });
    return NextResponse.json({ balance });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve TENKS balance.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as { amount?: unknown; reason?: unknown } | null;
  const amount = Math.max(0, Math.floor(Number(body?.amount ?? 0)));
  const reason = typeof body?.reason === 'string' ? body.reason : '';
  const rule = SERVER_EARN_RULES[reason as keyof typeof SERVER_EARN_RULES];

  if (!rule) {
    return NextResponse.json({ error: 'Invalid TENKS earn reason.' }, { status: 400 });
  }

  if (amount <= 0 || amount > rule.maxAmount) {
    return NextResponse.json({ error: 'Invalid TENKS earn amount.' }, { status: 400 });
  }

  try {
    const credited = await creditBalance(admin, {
      playerId: user.id,
      amount,
    });

    await appendTenksTransaction(admin, {
      playerId: user.id,
      amount,
      reason,
      balanceAfter: credited.newBalance,
    });

    try {
      await syncPlayerMetadataSnapshot(admin, user);
    } catch (snapshotError) {
      console.error('[Waspi][player/tenks] snapshot sync failed:', snapshotError);
    }

    void logEvent({
      event_type: 'tenks_earn',
      player_id: user.id,
      player_email: user.email,
      metadata: { amount, reason, balance_after: credited.newBalance },
    });

    return NextResponse.json({ newBalance: credited.newBalance, creditedAmount: amount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to credit TENKS.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
