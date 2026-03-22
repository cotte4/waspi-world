import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

type CooldownRow = {
  npc_id: string;
  delivered_at: string;
};

// GET /api/weed/cooldowns
// Returns the last delivery timestamp (epoch ms) for each NPC dealer.
export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const { data, error } = await admin
    .from('weed_delivery_cooldowns')
    .select('npc_id, delivered_at')
    .eq('player_id', user.id)
    .returns<CooldownRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cooldowns: Record<string, number> = {};
  for (const row of data ?? []) {
    cooldowns[row.npc_id] = new Date(row.delivered_at).getTime();
  }

  return NextResponse.json({ cooldowns });
}
