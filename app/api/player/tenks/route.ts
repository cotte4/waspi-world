import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

const DEFAULT_BALANCE = 5000;

// GET /api/player/tenks
// Returns the server-authoritative TENKS balance for the authenticated player.
// Creates a row with the default balance if none exists yet.
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
    .from('player_tenks_balance')
    .select('balance')
    .eq('player_id', user.id)
    .single<{ balance: number }>();

  const { data: playerRow, error: playerError } = await admin
    .from('players')
    .select('tenks')
    .eq('id', user.id)
    .maybeSingle<{ tenks: number }>();

  if (playerError) {
    return NextResponse.json({ error: playerError.message }, { status: 500 });
  }

  if (error && error.code === 'PGRST116') {
    // Row not found — seed from players.tenks if available, else use default.
    const seedBalance = playerRow?.tenks ?? DEFAULT_BALANCE;

    const { data: created, error: insertError } = await admin
      .from('player_tenks_balance')
      .insert({ player_id: user.id, balance: seedBalance })
      .select('balance')
      .single<{ balance: number }>();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ balance: created?.balance ?? seedBalance });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reconciledBalance = Math.max(data.balance, playerRow?.tenks ?? data.balance);
  if (reconciledBalance !== data.balance) {
    const { error: upsertError } = await admin
      .from('player_tenks_balance')
      .upsert({ player_id: user.id, balance: reconciledBalance });
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ balance: reconciledBalance });
}
