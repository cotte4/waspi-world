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
  status: 'queued' | 'playing' | 'skipped';
  created_at: string;
};

type StatusBody = {
  queueId: string;
  status: 'playing' | 'skipped';
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
    .select('id, video_id, title, artist, added_by, added_by_name, cost, status, created_at')
    .in('status', ['queued', 'playing'])
    .order('created_at', { ascending: true })
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
          addedAt: Date.parse(nowPlayingRow.created_at) || Date.now(),
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
      addedAt: Date.parse(row.created_at) || Date.now(),
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
  if (!body?.queueId || (body.status !== 'playing' && body.status !== 'skipped')) {
    return NextResponse.json({ error: 'Missing required fields: queueId, status.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  const { error } = await admin
    .from('jukebox_queue')
    .update(
      body.status === 'skipped'
        ? { status: 'skipped', skipped_at: new Date().toISOString() }
        : { status: 'playing' }
    )
    .eq('id', body.queueId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
