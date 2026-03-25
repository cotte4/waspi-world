import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser, hasServiceRole, isServerSupabaseConfigured } from '@/src/lib/supabaseServer';
import { DEFAULT_PLAYER_STATE, grantInventoryItem, syncVecindadDeed } from '@/src/lib/playerState';
import { getItem } from '@/src/game/config/catalog';
import { appendTenksTransaction, ensureCatalogSeeded, ensurePlayerRow, hydratePlayerFromDatabase, syncPlayerInventory, syncPlayerMetadataSnapshot } from '@/src/lib/commercePersistence';
import { creditBalance, debitBalance } from '@/src/lib/tenksBalance';

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

  const currentPlayer = syncVecindadDeed(await hydratePlayerFromDatabase(admin, user, DEFAULT_PLAYER_STATE));

  if (currentPlayer.inventory.owned.includes(item.id)) {
    return NextResponse.json({
      player: currentPlayer,
      notice: `${item.name} ya esta en tu inventario.`,
    });
  }

  const debit = await debitBalance(admin, {
    playerId: user.id,
    amount: item.priceTenks,
    fallbackBalance: currentPlayer.tenks,
  });

  if (!debit.ok) {
    return NextResponse.json({
      error: `Necesitas ${item.priceTenks.toLocaleString('es-AR')} TENKS para comprar ${item.name}.`,
      balance: debit.previousBalance,
      required: item.priceTenks,
    }, { status: 400 });
  }

  const newBalance = debit.newBalance;

  const nextPlayer = syncVecindadDeed(
    grantInventoryItem(
      {
        ...currentPlayer,
        tenks: newBalance,
      },
      item.id
    )
  );

  let syncWarning: string | null = null;
  try {
    await ensureCatalogSeeded(admin);
    await ensurePlayerRow(admin, user, nextPlayer);
    await syncPlayerInventory(admin, user.id, nextPlayer);
  } catch (error) {
    try {
      await creditBalance(admin, {
        playerId: user.id,
        amount: item.priceTenks,
        fallbackBalance: newBalance,
      });
    } catch {
      // no-op; balance already changed, we keep the durable error visible.
    }

    const message = error instanceof Error ? error.message : 'Shop sync failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    await appendTenksTransaction(admin, {
      playerId: user.id,
      amount: -item.priceTenks,
      reason: `shop_buy_${item.id.toLowerCase()}`,
      balanceAfter: nextPlayer.tenks,
    });
  } catch (error) {
    syncWarning = error instanceof Error ? error.message : 'Shop transaction log failed.';
    console.error('POST /api/shop/buy transaction log failed:', error);
  }

  try {
    const refreshedPlayer = await syncPlayerMetadataSnapshot(admin, user, nextPlayer);
    return NextResponse.json({
      player: refreshedPlayer,
      itemId: item.id,
      notice: `${item.name} comprado por ${item.priceTenks.toLocaleString('es-AR')} TENKS y equipado.`,
      syncWarning,
    });
  } catch (error) {
    syncWarning = error instanceof Error ? error.message : 'Shop snapshot sync failed.';
    console.error('POST /api/shop/buy snapshot sync failed:', error);
  }

  return NextResponse.json({
    player: nextPlayer,
    itemId: item.id,
    notice: `${item.name} comprado por ${item.priceTenks.toLocaleString('es-AR')} TENKS y equipado.`,
    syncWarning,
  });
}
