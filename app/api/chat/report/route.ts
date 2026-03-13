import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser } from '@/src/lib/supabaseServer';
import { ensureCatalogSeeded, ensurePlayerRow, logChatReport } from '@/src/lib/commercePersistence';
import { DEFAULT_PLAYER_STATE, normalizePlayerState } from '@/src/lib/playerState';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin client unavailable.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as {
    playerId?: string;
    username?: string;
    reason?: string;
    zone?: string;
    x?: number;
    y?: number;
  } | null;

  const reportedPlayerId = body?.playerId?.trim() ?? '';
  const reportedUsername = body?.username?.trim() ?? '';
  const reason = body?.reason?.trim() ?? 'manual_report';

  if (!reportedPlayerId || !reportedUsername) {
    return NextResponse.json({ error: 'Reported player is required.' }, { status: 400 });
  }

  if (reportedPlayerId === user.id) {
    return NextResponse.json({ error: 'You cannot report yourself.' }, { status: 400 });
  }

  await ensureCatalogSeeded(admin);
  const playerState = normalizePlayerState(user.user_metadata?.waspiPlayer ?? DEFAULT_PLAYER_STATE);
  await ensurePlayerRow(admin, user, playerState);

  await logChatReport(admin, {
    reporterId: user.id,
    reportedPlayerId,
    reportedUsername,
    reason,
    zone: body?.zone ?? null,
    x: typeof body?.x === 'number' ? body.x : null,
    y: typeof body?.y === 'number' ? body.y : null,
  });

  return NextResponse.json({ ok: true });
}
