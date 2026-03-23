import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { getAuthoritativeBalance } from '@/src/lib/tenksBalance';

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

  try {
    const balance = await getAuthoritativeBalance(admin, { playerId: user.id });
    return NextResponse.json({ balance });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve TENKS balance.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
