import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import type { InventoryState } from '@/src/lib/playerState';
import { hydratePlayerFromDatabase } from '@/src/lib/commercePersistence';

// GET /api/player/inventory
// Returns the server-authoritative inventory for the authenticated player.
export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const player = await hydratePlayerFromDatabase(admin, user);
  const inventory: InventoryState = player.inventory;

  return NextResponse.json({ inventory });
}
