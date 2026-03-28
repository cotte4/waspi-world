import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { COSMETIC_BY_MILESTONE } from '@/src/game/config/milestoneCosmetics';

// The set of milestone IDs that carry cosmetic rewards
const COSMETIC_MILESTONE_IDS = [...COSMETIC_BY_MILESTONE.keys()];

export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const { data, error } = await admin
    .from('player_skill_milestones')
    .select('milestone_id')
    .eq('user_id', user.id)
    .in('milestone_id', COSMETIC_MILESTONE_IDS);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unlocked: string[] = (data ?? []).reduce<string[]>((acc, row) => {
    const id = COSMETIC_BY_MILESTONE.get(row.milestone_id as string)?.id;
    if (id) acc.push(id);
    return acc;
  }, []);

  return NextResponse.json({ unlocked });
}
