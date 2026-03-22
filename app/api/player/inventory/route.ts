import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import type { InventoryState } from '@/src/lib/playerState';

const DEFAULT_UTILITY_ID = 'UTIL-GUN-01';

type PlayerRow = {
  equipped_top: string | null;
  equipped_bottom: string | null;
  utility_equipped: string[];
};

type InventoryRow = {
  product_id: string;
};

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

  const [inventoryRes, playerRes] = await Promise.all([
    admin
      .from('player_inventory')
      .select('product_id')
      .eq('player_id', user.id)
      .returns<InventoryRow[]>(),
    admin
      .from('players')
      .select('equipped_top, equipped_bottom, utility_equipped')
      .eq('id', user.id)
      .maybeSingle<PlayerRow>(),
  ]);

  if (inventoryRes.error) return NextResponse.json({ error: inventoryRes.error.message }, { status: 500 });
  if (playerRes.error) return NextResponse.json({ error: playerRes.error.message }, { status: 500 });

  const physicalOwned = (inventoryRes.data ?? []).map((r) => r.product_id);
  const utilityEquipped: string[] = Array.isArray(playerRes.data?.utility_equipped)
    ? playerRes.data.utility_equipped
    : [DEFAULT_UTILITY_ID];

  // Merge: physical items + utility items the player has equipped
  const owned = [...new Set([...physicalOwned, ...utilityEquipped, DEFAULT_UTILITY_ID])];

  const inventory: InventoryState = {
    owned,
    equipped: {
      top: playerRes.data?.equipped_top ?? undefined,
      bottom: playerRes.data?.equipped_bottom ?? undefined,
      utility: utilityEquipped.length ? utilityEquipped : [DEFAULT_UTILITY_ID],
    },
  };

  return NextResponse.json({ inventory });
}
