import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser } from '@/src/lib/supabaseServer';
import { ensureCatalogSeeded, ensurePlayerRow, logChatMessage } from '@/src/lib/commercePersistence';
import { DEFAULT_PLAYER_STATE, normalizePlayerState } from '@/src/lib/playerState';

const PROFANITY = ['boludo', 'pelotudo', 'idiota', 'mierda', 'puta', 'puto'];

function sanitizeMessage(message: string) {
  let next = message;
  for (const word of PROFANITY) {
    const pattern = new RegExp(`\\b${word}\\b`, 'gi');
    next = next.replace(pattern, '***');
  }
  return next.trim();
}

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
    message?: string;
    zone?: string;
    x?: number;
    y?: number;
  } | null;

  const original = body?.message?.trim() ?? '';
  if (!original) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  try {
    await ensureCatalogSeeded(admin);
    const playerState = normalizePlayerState(user.user_metadata?.waspiPlayer ?? DEFAULT_PLAYER_STATE);
    await ensurePlayerRow(admin, user, playerState);

    const username = typeof user.user_metadata?.username === 'string' && user.user_metadata.username.trim()
      ? user.user_metadata.username.trim()
      : (user.email?.split('@')[0] ?? `player_${user.id.slice(0, 8)}`);

    const { data: recentMessages, error: rateError } = await admin
      .from('chat_messages')
      .select('created_at')
      .eq('player_id', user.id)
      .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(30);

    if (rateError) {
      return NextResponse.json({ error: rateError.message }, { status: 500 });
    }

    if ((recentMessages ?? []).length >= 30) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const latest = recentMessages?.[0]?.created_at ? new Date(recentMessages[0].created_at).getTime() : 0;
    if (latest && Date.now() - latest < 1000) {
      return NextResponse.json({ error: 'Wait a second before sending another message.' }, { status: 429 });
    }

    const sanitized = sanitizeMessage(original).slice(0, 140);
    if (!sanitized) {
      return NextResponse.json({ error: 'Message was blocked by moderation.' }, { status: 400 });
    }

    await logChatMessage(admin, {
      playerId: user.id,
      username,
      message: sanitized,
      zone: body?.zone ?? null,
      x: typeof body?.x === 'number' ? body.x : null,
      y: typeof body?.y === 'number' ? body.y : null,
    });

    return NextResponse.json({
      ok: true,
      message: sanitized,
      username,
    });
  } catch (error) {
    const fallbackUsername = typeof user.user_metadata?.username === 'string' && user.user_metadata.username.trim()
      ? user.user_metadata.username.trim()
      : (user.email?.split('@')[0] ?? `player_${user.id.slice(0, 8)}`);
    console.error('POST /api/chat/moderate degraded:', error);
    return NextResponse.json({
      ok: true,
      message: sanitizeMessage(original).slice(0, 140),
      username: fallbackUsername,
      degraded: true,
    });
  }
}
