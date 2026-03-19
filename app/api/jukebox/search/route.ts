import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const MAX_RESULTS = 5;

type YouTubeSnippet = {
  title: string;
  channelTitle: string;
  thumbnails?: { default?: { url?: string } };
};

type YouTubeItem = {
  id: { videoId: string };
  snippet: YouTubeSnippet;
};

type YouTubeApiResponse = {
  items?: YouTubeItem[];
  error?: { message: string };
};

export type JukeboxSearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
};

type CacheRow = {
  results: JukeboxSearchResult[];
  cached_at: string;
};

export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters.' }, { status: 400 });
  }

  const query = q.toLowerCase();
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  // --- Check cache first ---
  const { data: cached } = await admin
    .from('jukebox_search_cache')
    .select('results, cached_at')
    .eq('query', query)
    .maybeSingle<CacheRow>();

  if (cached) {
    const age = Date.now() - new Date(cached.cached_at).getTime();
    if (age < CACHE_TTL_MS) {
      return NextResponse.json({ results: cached.results, source: 'cache' });
    }
  }

  // --- Call YouTube Data API v3 ---
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'YouTube API key not configured.' }, { status: 503 });
  }

  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'video',
    videoEmbeddable: 'true',
    safeSearch: 'strict',
    maxResults: String(MAX_RESULTS),
    key: apiKey,
  });

  let ytData: YouTubeApiResponse;
  try {
    const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
    ytData = await ytRes.json() as YouTubeApiResponse;
  } catch (err) {
    console.error('GET /api/jukebox/search YouTube fetch error:', err);
    return NextResponse.json({ error: 'YouTube API unavailable.' }, { status: 502 });
  }

  if (ytData.error) {
    console.error('GET /api/jukebox/search YouTube error:', ytData.error.message);
    return NextResponse.json({ error: `YouTube API error: ${ytData.error.message}` }, { status: 502 });
  }

  const results: JukeboxSearchResult[] = (ytData.items ?? []).map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.default?.url ?? '',
  }));

  // --- Store in cache ---
  await admin
    .from('jukebox_search_cache')
    .upsert({ query, results, cached_at: new Date().toISOString() });

  return NextResponse.json({ results, source: 'api' });
}
