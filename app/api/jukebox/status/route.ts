import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

type QueueRow = {
  id: string;
  video_id: string;
  title: string;
  artist: string;
  added_by: string;
  added_by_name: string;
  cost: 100 | 150;
  status: 'queued' | 'playing' | 'played' | 'skipped';
  added_at: string;
};

type StatusBody = {
  queueId: string;
  status: 'playing' | 'played' | 'skipped';
};

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

  const { data, error } = await admin
    .from('jukebox_queue')
    .select('id, video_id, title, artist, added_by, added_by_name, cost, status, added_at')
    .in('status', ['queued', 'playing'])
    .order('added_at', { ascending: true })
    .limit(40)
    .returns<QueueRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const nowPlayingRow = rows.find((r) => r.status === 'playing') ?? null;
  const queueRows = rows.filter((r) => r.status === 'queued');

  return NextResponse.json({
    ok: true,
    nowPlaying: nowPlayingRow
      ? {
          queueId: nowPlayingRow.id,
          videoId: nowPlayingRow.video_id,
          title: nowPlayingRow.title,
          artist: nowPlayingRow.artist,
          addedBy: nowPlayingRow.added_by,
          addedByName: nowPlayingRow.added_by_name,
          cost: nowPlayingRow.cost,
          addedAt: Date.parse(nowPlayingRow.added_at) || Date.now(),
        }
      : null,
    queue: queueRows.map((row) => ({
      queueId: row.id,
      videoId: row.video_id,
      title: row.title,
      artist: row.artist,
      addedBy: row.added_by,
      addedByName: row.added_by_name,
      cost: row.cost,
      addedAt: Date.parse(row.added_at) || Date.now(),
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as StatusBody | null;
  if (!body?.queueId || (body.status !== 'playing' && body.status !== 'played' && body.status !== 'skipped')) {
    return NextResponse.json({ error: 'Missing required fields: queueId, status.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  if (body.status === 'playing') {
    const { data: queueEntry, error: queueError } = await admin
      .from('jukebox_queue')
      .select('id, status')
      .eq('id', body.queueId)
      .maybeSingle<{ id: string; status: 'queued' | 'playing' | 'played' | 'skipped' }>();

    if (queueError) {
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }
    if (!queueEntry || queueEntry.status !== 'queued') {
      return NextResponse.json({ error: 'La canción ya no está disponible para reproducirse.' }, { status: 409 });
    }

    const { data: currentPlaying, error: currentPlayingError } = await admin
      .from('jukebox_queue')
      .select('id')
      .eq('status', 'playing')
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (currentPlayingError) {
      return NextResponse.json({ error: currentPlayingError.message }, { status: 500 });
    }
    if (currentPlaying) {
      return NextResponse.json({ error: 'Ya hay una canción en reproducción.' }, { status: 409 });
    }
  } else {
    const { data: queueEntry, error: queueError } = await admin
      .from('jukebox_queue')
      .select('id, status')
      .eq('id', body.queueId)
      .maybeSingle<{ id: string; status: 'queued' | 'playing' | 'played' | 'skipped' }>();

    if (queueError) {
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }
    if (!queueEntry || queueEntry.status !== 'playing') {
      return NextResponse.json({ error: 'La canción ya no está sonando.' }, { status: 409 });
    }
  }

  const updatePayload =
    body.status === 'skipped'
      ? { status: 'skipped', skipped_at: new Date().toISOString() }
      : body.status === 'played'
        ? { status: 'played', played_at: new Date().toISOString() }
        : { status: 'playing' };

  const { error } = await admin
    .from('jukebox_queue')
    .update(updatePayload)
    .eq('id', body.queueId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
