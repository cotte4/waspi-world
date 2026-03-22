import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { getItem } from '@/src/game/config/catalog';

type PlayerRow = {
  equipped_top: string | null;
  equipped_bottom: string | null;
  utility_equipped: string[];
};

type InventoryRow = {
  product_id: string;
};

// POST /api/player/inventory/equip
// Validates ownership and updates the equipped slot for the authenticated player.
// Body: { item_id: string }
export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const body = await request.json().catch(() => null) as { item_id?: string } | null;
  const itemId = typeof body?.item_id === 'string' ? body.item_id.trim() : '';
  if (!itemId) return NextResponse.json({ error: 'Missing item_id.' }, { status: 400 });

  const item = getItem(itemId);
  if (!item) return NextResponse.json({ error: 'Item not found in catalog.' }, { status: 404 });

  // Fetch current player equipped state
  const { data: playerRow, error: playerError } = await admin
    .from('players')
    .select('equipped_top, equipped_bottom, utility_equipped')
    .eq('id', user.id)
    .maybeSingle<PlayerRow>();

  if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 });

  // Verify ownership
  if (item.slot === 'utility') {
    const currentUtility: string[] = Array.isArray(playerRow?.utility_equipped)
      ? playerRow.utility_equipped
      : [];
    if (!currentUtility.includes(itemId)) {
      return NextResponse.json({ error: 'Item not owned.' }, { status: 403 });
    }
  } else {
    const { data: owned, error: ownedError } = await admin
      .from('player_inventory')
      .select('product_id')
      .eq('player_id', user.id)
      .eq('product_id', itemId)
      .maybeSingle<InventoryRow>();

    if (ownedError) return NextResponse.json({ error: ownedError.message }, { status: 500 });
    if (!owned) return NextResponse.json({ error: 'Item not owned.' }, { status: 403 });
  }

  // Compute new equipped state
  const currentUtility: string[] = Array.isArray(playerRow?.utility_equipped)
    ? playerRow.utility_equipped
    : [];

  let update: Record<string, string | string[] | null>;

  if (item.slot === 'top') {
    update = { equipped_top: itemId };
  } else if (item.slot === 'bottom') {
    update = { equipped_bottom: itemId };
  } else {
    // utility: toggle
    const has = currentUtility.includes(itemId);
    update = {
      utility_equipped: has
        ? currentUtility.filter((id) => id !== itemId)
        : [...currentUtility, itemId],
    };
  }

  const { error: updateError } = await admin
    .from('players')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const newUtility = item.slot === 'utility'
    ? (update.utility_equipped as string[])
    : currentUtility;

  return NextResponse.json({
    equipped: {
      top: item.slot === 'top' ? itemId : (playerRow?.equipped_top ?? undefined),
      bottom: item.slot === 'bottom' ? itemId : (playerRow?.equipped_bottom ?? undefined),
      utility: newUtility,
    },
  });
}
