import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { getLocalJukeboxSongsByCategory } from '@/src/game/systems/jukeboxLibrary';

type CatalogRow = {
  video_id: string;
  title: string;
  artist: string;
  category: string;
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
    .from('jukebox_catalog')
    .select('video_id, title, artist, category')
    .order('artist', { ascending: true })
    .order('title', { ascending: true })
    .returns<CatalogRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    songs: [
      ...getLocalJukeboxSongsByCategory(),
      ...((data ?? []).map((row) => ({
        videoId: row.video_id,
        title: row.title,
        artist: row.artist,
        category: row.category,
      }))),
    ],
  });
}
