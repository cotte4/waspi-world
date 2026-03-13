import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, hasAdminConfig } from '@/src/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  if (!hasAdminConfig || !supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return NextResponse.json({ error: 'Missing Bearer token' }, { status: 401 });
  }

  // Get user from access token
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  const user = userData.user;

  // Upsert player row
  const username =
    (user.user_metadata as any)?.username ??
    (user.email ? user.email.split('@')[0] : `player_${user.id.slice(0, 8)}`);

  const { data: upserted, error: upsertErr } = await supabaseAdmin
    .from('players')
    .upsert(
      {
        id: user.id,
        username,
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // Load inventory
  const { data: inventory, error: invErr } = await supabaseAdmin
    .from('player_inventory')
    .select('item_id, acquired_via, created_at')
    .eq('player_id', user.id)
    .order('created_at', { ascending: true });

  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }

  return NextResponse.json({
    player: upserted,
    inventory: inventory ?? [],
  });
}

