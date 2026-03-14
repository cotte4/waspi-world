import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser, hasServiceRole, isServerSupabaseConfigured } from '@/src/lib/supabaseServer';
import { cancelPvpStake, reportPvpLoss, reservePvpStake, settlePvpForfeit, settlePvpMatch } from '@/src/lib/pvpMatchServer';

type ReserveBody = {
  action: 'reserve';
  matchId?: string;
  opponentId?: string;
  bet?: number;
};

type CancelBody = {
  action: 'cancel';
  matchId?: string;
};

type SettleBody = {
  action: 'settle';
  matchId?: string;
  winnerId?: string;
  loserId?: string;
};

type SettleForfeitBody = {
  action: 'settle_forfeit';
  matchId?: string;
  winnerId?: string;
  loserId?: string;
};

type ReportLossBody = {
  action: 'report_loss';
  matchId?: string;
  winnerId?: string;
};

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => null) as (
    ReserveBody | CancelBody | SettleBody | SettleForfeitBody | ReportLossBody | null
  );
  if (!body?.action) {
    return NextResponse.json({ error: 'Missing action.' }, { status: 400 });
  }

  try {
    if (body.action === 'reserve') {
      if (!body.matchId || !body.opponentId || typeof body.bet !== 'number') {
        return NextResponse.json({ error: 'Missing reserve payload.' }, { status: 400 });
      }

      const result = await reservePvpStake(admin, {
        user,
        opponentId: body.opponentId,
        matchId: body.matchId,
        bet: body.bet,
      });

      return NextResponse.json({
        player: result.player,
        reservation: result.reservation,
        alreadyReserved: result.alreadyReserved,
      });
    }

    if (body.action === 'cancel') {
      if (!body.matchId) {
        return NextResponse.json({ error: 'Missing matchId.' }, { status: 400 });
      }

      const result = await cancelPvpStake(admin, {
        user,
        matchId: body.matchId,
      });

      return NextResponse.json({
        player: result.player,
        refunded: result.refunded,
      });
    }

    if (body.action === 'report_loss') {
      if (!body.matchId || !body.winnerId) {
        return NextResponse.json({ error: 'Missing report payload.' }, { status: 400 });
      }

      const result = await reportPvpLoss(admin, {
        caller: user,
        matchId: body.matchId,
        winnerId: body.winnerId,
      });

      return NextResponse.json(result);
    }

    if (body.action === 'settle_forfeit') {
      if (!body.matchId || !body.winnerId || !body.loserId) {
        return NextResponse.json({ error: 'Missing forfeit payload.' }, { status: 400 });
      }

      const result = await settlePvpForfeit(admin, {
        caller: user,
        matchId: body.matchId,
        winnerId: body.winnerId,
        loserId: body.loserId,
      });

      return NextResponse.json(result);
    }

    if (!body.matchId || !body.winnerId || !body.loserId) {
      return NextResponse.json({ error: 'Missing settle payload.' }, { status: 400 });
    }

    const result = await settlePvpMatch(admin, {
      caller: user,
      matchId: body.matchId,
      winnerId: body.winnerId,
      loserId: body.loserId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PvP match action failed.';
    const status = message.toLowerCase().includes('unauthorized') ? 403 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
