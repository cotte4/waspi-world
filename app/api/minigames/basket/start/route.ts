import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser } from '@/src/lib/supabaseServer';

const ACTIVE_RUN_WINDOW_MS = 5 * 60 * 1000;

type BasketRunRow = {
  id: string;
  reward_code: string | null;
  result: string | null;
  created_at: string;
};

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin client unavailable.' }, { status: 500 });
  }

  const now = Date.now();
  const { data: existing, error: existingError } = await admin
    .from('game_sessions')
    .select('id, reward_code, result, created_at')
    .eq('player_id', user.id)
    .eq('minigame', 'basket')
    .in('result', ['started', 'claiming'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<BasketRunRow>();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing?.reward_code) {
    const ageMs = now - new Date(existing.created_at).getTime();
    if (ageMs <= ACTIVE_RUN_WINDOW_MS) {
      return NextResponse.json({ runId: existing.reward_code });
    }
  }

  const runId = `basket_${crypto.randomUUID()}`;
  const { error } = await admin
    .from('game_sessions')
    .insert({
      player_id: user.id,
      minigame: 'basket',
      score: 0,
      result: 'started',
      tenks_earned: 0,
      reward_code: runId,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ runId });
}
