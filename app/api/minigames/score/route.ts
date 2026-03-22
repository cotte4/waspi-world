import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

const VALID_GAMES = ['dino', 'flappy'] as const;
type MinigameId = typeof VALID_GAMES[number];

function isValidGame(value: unknown): value is MinigameId {
  return VALID_GAMES.includes(value as MinigameId);
}

type BestScoreRow = { score: number };
type LeaderboardRow = { score: number; player_id: string; players: { username: string } | null };

// GET /api/minigames/score?game=dino|flappy
// Returns the player's personal best and the top-10 leaderboard.
export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const game = request.nextUrl.searchParams.get('game');
  if (!isValidGame(game)) {
    return NextResponse.json({ error: 'game must be dino or flappy' }, { status: 400 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const [bestRes, leaderboardRes] = await Promise.all([
    admin
      .from('game_sessions')
      .select('score')
      .eq('player_id', user.id)
      .eq('minigame', game)
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle<BestScoreRow>(),
    admin
      .from('game_sessions')
      .select('score, player_id, players!inner(username)')
      .eq('minigame', game)
      .order('score', { ascending: false })
      .limit(10)
      .returns<LeaderboardRow[]>(),
  ]);

  const best = bestRes.data?.score ?? 0;
  const leaderboard = (leaderboardRes.data ?? []).map((row) => ({
    username: row.players?.username ?? 'unknown',
    score: row.score,
  }));

  return NextResponse.json({ best, leaderboard });
}

// POST /api/minigames/score
// Records a new score. Only inserts if it's a personal best.
// Body: { game: 'dino' | 'flappy', score: number }
export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const body = await request.json().catch(() => null) as { game?: unknown; score?: unknown } | null;

  if (!isValidGame(body?.game)) {
    return NextResponse.json({ error: 'game must be dino or flappy' }, { status: 400 });
  }
  const game: MinigameId = body.game as MinigameId;

  const score = Math.max(0, Math.floor(Number(body?.score ?? 0)));
  if (!Number.isFinite(score) || score <= 0) {
    return NextResponse.json({ error: 'score must be a positive integer' }, { status: 400 });
  }

  // Check current personal best
  const { data: currentBest } = await admin
    .from('game_sessions')
    .select('score')
    .eq('player_id', user.id)
    .eq('minigame', game)
    .order('score', { ascending: false })
    .limit(1)
    .maybeSingle<BestScoreRow>();

  const isNewBest = score > (currentBest?.score ?? 0);

  if (isNewBest) {
    await admin.from('game_sessions').insert({
      player_id: user.id,
      minigame: game,
      score,
      result: 'new_best',
      tenks_earned: 0,
    });
  }

  return NextResponse.json({ best: isNewBest ? score : (currentBest?.score ?? 0), is_new_best: isNewBest });
}
