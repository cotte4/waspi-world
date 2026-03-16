import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser, hasServiceRole, isServerSupabaseConfigured } from '@/src/lib/supabaseServer';
import { DEFAULT_PLAYER_STATE, grantInventoryItem, normalizePlayerState, syncVecindadDeed } from '@/src/lib/playerState';
import { getItem } from '@/src/game/config/catalog';
import { appendTenksTransaction, ensureCatalogSeeded, ensurePlayerRow, syncPlayerInventory } from '@/src/lib/commercePersistence';

const PLAYER_METADATA_KEY = 'waspiPlayer';

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => null) as { itemId?: string } | null;
  const item = body?.itemId ? getItem(body.itemId) : null;
  if (!item || item.priceTenks <= 0 || item.id === 'UTIL-DEED-01') {
    return NextResponse.json({ error: 'Ese item no se puede comprar en la tienda.' }, { status: 400 });
  }

  if (item.comingSoon) {
    return NextResponse.json({ error: 'Este item estará disponible próximamente.' }, { status: 400 });
  }

  const currentPlayer = syncVecindadDeed(
    normalizePlayerState(user.user_metadata?.[PLAYER_METADATA_KEY] ?? DEFAULT_PLAYER_STATE)
  );

  if (currentPlayer.inventory.owned.includes(item.id)) {
    return NextResponse.json({
      player: currentPlayer,
      notice: `${item.name} ya esta en tu inventario.`,
    });
  }

  // --- Server-validated TENKS balance ---
  // Read the authoritative balance from player_tenks_balance.
  // If no row exists yet, seed it from players.tenks (back-compat).
  const { data: balanceRow, error: balanceError } = await admin
    .from('player_tenks_balance')
    .select('balance')
    .eq('player_id', user.id)
    .single<{ balance: number }>();

  let serverBalance: number;

  if (balanceError && balanceError.code === 'PGRST116') {
    // Row missing — seed from players.tenks or fall back to client state.
    const { data: playerRow } = await admin
      .from('players')
      .select('tenks')
      .eq('id', user.id)
      .single<{ tenks: number }>();
    serverBalance = playerRow?.tenks ?? currentPlayer.tenks;

    await admin
      .from('player_tenks_balance')
      .insert({ player_id: user.id, balance: serverBalance });
  } else if (balanceError) {
    return NextResponse.json({ error: balanceError.message }, { status: 500 });
  } else {
    serverBalance = balanceRow.balance;
  }

  if (serverBalance < item.priceTenks) {
    return NextResponse.json({
      error: `Necesitas ${item.priceTenks.toLocaleString('es-AR')} TENKS para comprar ${item.name}.`,
    }, { status: 400 });
  }

  const newBalance = serverBalance - item.priceTenks;

  // Deduct from the authoritative table atomically before updating metadata.
  const { error: deductError } = await admin
    .from('player_tenks_balance')
    .upsert({ player_id: user.id, balance: newBalance });

  if (deductError) {
    return NextResponse.json({ error: deductError.message }, { status: 500 });
  }

  const nextPlayer = syncVecindadDeed(
    grantInventoryItem(
      {
        ...currentPlayer,
        tenks: newBalance,
      },
      item.id
    )
  );

  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      [PLAYER_METADATA_KEY]: nextPlayer,
    },
  });

  if (metadataError) {
    // Compensating action: refund TENKS if persistence to user_metadata fails.
    // Without this, the player can lose TENKS but not receive the item.
    try {
      const { data: afterDeduct } = await admin
        .from('player_tenks_balance')
        .select('balance')
        .eq('player_id', user.id)
        .single<{ balance: number }>();
      const currentBalance = typeof afterDeduct?.balance === 'number' ? afterDeduct.balance : newBalance;
      const refundBalance = currentBalance + item.priceTenks;
      await admin
        .from('player_tenks_balance')
        .upsert({ player_id: user.id, balance: refundBalance });
    } catch (refundErr) {
      console.error('POST /api/shop/buy refund failed after metadata error:', refundErr);
    }

    return NextResponse.json({
      error: `No se pudo guardar la compra en tu cuenta (${metadataError.message}). Reembolsamos los TENKS.`,
    }, { status: 500 });
  }

  let syncWarning: string | null = null;
  try {
    await ensureCatalogSeeded(admin);
    await ensurePlayerRow(admin, user, nextPlayer);
    await syncPlayerInventory(admin, user.id, nextPlayer);
    await appendTenksTransaction(admin, {
      playerId: user.id,
      amount: -item.priceTenks,
      reason: `shop_buy_${item.id.toLowerCase()}`,
      balanceAfter: nextPlayer.tenks,
    });
  } catch (error) {
    syncWarning = error instanceof Error ? error.message : 'Shop sync failed.';
    console.error('POST /api/shop/buy sync failed:', error);
  }

  return NextResponse.json({
    player: nextPlayer,
    itemId: item.id,
    notice: `${item.name} comprado por ${item.priceTenks.toLocaleString('es-AR')} TENKS y equipado.`,
    syncWarning,
  });
}
