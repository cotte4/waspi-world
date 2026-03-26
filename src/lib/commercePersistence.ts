import type { SupabaseClient, User } from '@supabase/supabase-js';
import { DEFAULT_PLAYER_STATE, normalizePlayerState, type PlayerState } from '@/src/lib/playerState';
import { getSerializedCatalog, toProductRecord } from '@/src/lib/catalogServer';
import { getAuthoritativeBalance } from '@/src/lib/tenksBalance';
import { assembleHydratedPlayer } from '@/src/lib/playerPersistenceModel';

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type DiscountCodeRow = {
  code: string;
  player_id: string;
  percent_off: number;
  used: boolean;
  expires_at: string | null;
};

type PlayerRow = {
  avatar_config: unknown;
  equipped_top: string | null;
  equipped_bottom: string | null;
  utility_equipped: unknown;
};

type PlayerStatsRow = {
  zombie_kills: number;
  xp: number;
};

export const PLAYER_METADATA_KEY = 'waspiPlayer';

type EnsurePlayerRowOptions = {
  syncTenksBalance?: boolean;
};

function getUsername(user: User) {
  const username = user.user_metadata?.username;
  if (typeof username === 'string' && username.trim()) return username.trim();
  if (user.email) return user.email.split('@')[0];
  return `player_${user.id.slice(0, 8)}`;
}

async function resolveUniqueUsername(admin: SupabaseClient, user: User) {
  const baseUsername = getUsername(user)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 24) || `player_${user.id.slice(0, 8)}`;

  const candidates = [
    baseUsername,
    `${baseUsername.slice(0, 16)}_${user.id.slice(0, 6)}`,
    `player_${user.id.slice(0, 8)}`,
  ];

  for (const candidate of candidates) {
    const { data, error } = await admin
      .from('players')
      .select('id')
      .eq('username', candidate)
      .maybeSingle<{ id: string }>();

    if (error) throw error;
    if (!data || data.id === user.id) return candidate;
  }

  return `player_${user.id.slice(0, 8)}`;
}

export async function ensureCatalogSeeded(admin: SupabaseClient) {
  // Only seed physical/purchasable items (those with priceArs defined).
  // Utility items (guns, CIG, BALL) don't have priceArs and the products
  // table requires price_ars to be non-null.
  const rows = getSerializedCatalog()
    .filter((item) => typeof item.priceArs === 'number')
    .map((item) => toProductRecord(item));

  if (!rows.length) return;

  const { error } = await admin
    .from('products')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
}

export async function ensurePlayerRow(
  admin: SupabaseClient,
  user: User,
  playerState?: PlayerState,
  options: EnsurePlayerRowOptions = {}
) {
  const state = normalizePlayerState(playerState ?? user.user_metadata?.[PLAYER_METADATA_KEY] ?? DEFAULT_PLAYER_STATE);
  const username = await resolveUniqueUsername(admin, user);
  const { error } = await admin
    .from('players')
    .upsert({
      id: user.id,
      username,
      avatar_config: state.avatar as unknown as Json,
      equipped_top: state.inventory.equipped.top ?? null,
      equipped_bottom: state.inventory.equipped.bottom ?? null,
      utility_equipped: state.inventory.equipped.utility ?? [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) throw error;

  if (options.syncTenksBalance) {
    const { error: tenksError } = await admin
      .from('player_tenks_balance')
      .upsert({ player_id: user.id, balance: state.tenks }, { onConflict: 'player_id' });

    if (tenksError) throw tenksError;
  }
}

export async function ensurePlayerStatsRow(
  admin: SupabaseClient,
  userId: string,
  progression?: PlayerState['progression']
) {
  const { data, error } = await admin
    .from('player_stats')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle<{ user_id: string }>();

  if (error) throw error;
  if (data) return;

  const { error: insertError } = await admin
    .from('player_stats')
    .insert({
      user_id: userId,
      zombie_kills: progression?.kills ?? 0,
      xp: progression?.xp ?? 0,
      level: 1,
      updated_at: new Date().toISOString(),
    });

  if (insertError) throw insertError;
}

export async function ensurePlayerTenksBalanceRow(
  admin: SupabaseClient,
  userId: string,
  balance: number
) {
  const { data, error } = await admin
    .from('player_tenks_balance')
    .select('player_id')
    .eq('player_id', userId)
    .maybeSingle<{ player_id: string }>();

  if (error) throw error;
  if (data) return;

  const { error: insertError } = await admin
    .from('player_tenks_balance')
    .insert({
      player_id: userId,
      balance,
    });

  if (insertError) throw insertError;
}

export async function ensurePlayerPersistenceRows(
  admin: SupabaseClient,
  user: User,
  playerState?: PlayerState,
  options: EnsurePlayerRowOptions = {}
) {
  const state = normalizePlayerState(playerState ?? user.user_metadata?.[PLAYER_METADATA_KEY] ?? DEFAULT_PLAYER_STATE);
  await ensurePlayerRow(admin, user, state, options);
  await ensurePlayerTenksBalanceRow(admin, user.id, state.tenks);
  await ensurePlayerStatsRow(admin, user.id, state.progression);
}

export async function resolveAuthoritativeTenksBalance(
  admin: SupabaseClient,
  input: {
    playerId: string;
    fallbackBalance?: number;
    defaultBalance?: number;
  }
) {
  return getAuthoritativeBalance(admin, input);
}

export async function syncPlayerInventory(admin: SupabaseClient, playerId: string, playerState: PlayerState) {
  const ownedProductIds = playerState.inventory.owned;
  if (!ownedProductIds.length) return;

  const rows = ownedProductIds.map((productId) => ({
    player_id: playerId,
    product_id: productId,
    acquired_via: 'sync',
    order_id: null,
  }));

  const { error } = await admin
    .from('player_inventory')
    .upsert(rows, { onConflict: 'player_id,product_id' });

  // Non-fatal: player_inventory is secondary storage. The authoritative inventory
  // lives in the players row and player metadata. If the table schema is mismatched
  // (e.g. missing migrations), warn but don't block the purchase.
  if (error) {
    console.warn('[Waspi] syncPlayerInventory: non-fatal sync error:', error.message);
  }
}

export async function loadDiscountCode(admin: SupabaseClient, playerId: string, code: string) {
  const { data, error } = await admin
    .from('discount_codes')
    .select('code, player_id, percent_off, used, expires_at')
    .eq('code', code)
    .eq('player_id', playerId)
    .maybeSingle<DiscountCodeRow>();

  if (error) throw error;
  if (!data) return null;
  if (data.used) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

export async function markDiscountCodeUsed(admin: SupabaseClient, code: string) {
  const { error } = await admin
    .from('discount_codes')
    .update({ used: true })
    .eq('code', code);

  if (error) throw error;
}

export async function createDiscountCode(
  admin: SupabaseClient,
  input: {
    playerId: string;
    percentOff: number;
    source: string;
    expiresAt: string;
  }
) {
  const code = `PENAL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { data, error } = await admin
    .from('discount_codes')
    .insert({
      code,
      player_id: input.playerId,
      percent_off: input.percentOff,
      source: input.source,
      used: false,
      expires_at: input.expiresAt,
    })
    .select('code, percent_off, expires_at')
    .single<{ code: string; percent_off: number; expires_at: string }>();

  if (error) throw error;
  return data;
}

export async function recordGameSession(
  admin: SupabaseClient,
  input: {
    playerId: string;
    minigame: string;
    score: number;
    result: string;
    tenksEarned: number;
    rewardCode?: string | null;
  }
) {
  const { error } = await admin
    .from('game_sessions')
    .insert({
      player_id: input.playerId,
      minigame: input.minigame,
      score: input.score,
      result: input.result,
      tenks_earned: input.tenksEarned,
      reward_code: input.rewardCode ?? null,
    });

  if (error) throw error;
}

export async function logChatMessage(
  admin: SupabaseClient,
  input: {
    playerId: string;
    username: string;
    message: string;
    zone?: string | null;
    x?: number | null;
    y?: number | null;
  }
) {
  const { error } = await admin
    .from('chat_messages')
    .insert({
      player_id: input.playerId,
      username: input.username,
      message: input.message,
      zone: input.zone ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
    });

  if (error) throw error;
}

export async function logChatReport(
  admin: SupabaseClient,
  input: {
    reporterId: string;
    reportedPlayerId: string;
    reportedUsername: string;
    reason: string;
    zone?: string | null;
    x?: number | null;
    y?: number | null;
  }
) {
  const { error } = await admin
    .from('chat_reports')
    .insert({
      reporter_id: input.reporterId,
      reported_player_id: input.reportedPlayerId,
      reported_username: input.reportedUsername,
      reason: input.reason,
      zone: input.zone ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
    });

  if (error) throw error;
}

export async function createOrderRecord(
  admin: SupabaseClient,
  input: {
    playerId: string;
    stripeSessionId: string;
    itemId: string;
    size: string;
    subtotalArs: number;
    totalArs: number;
    discountCode?: string | null;
    discountPercent?: number | null;
    shippingAddress?: Json | null;
  }
) {
  const order = {
    player_id: input.playerId,
    stripe_session_id: input.stripeSessionId,
    items: [{ product_id: input.itemId, size: input.size }] as unknown as Json,
    subtotal: input.subtotalArs * 100,
    total: input.totalArs * 100,
    currency: 'ars',
    status: 'paid',
    shipping_address: input.shippingAddress ?? null,
    discount_code: input.discountCode ?? null,
    discount_percent: input.discountPercent ?? null,
  };

  const { data, error } = await admin
    .from('orders')
    .insert(order)
    .select('id')
    .single<{ id: string }>();

  if (error) throw error;
  return data;
}

export async function addInventoryFromOrder(admin: SupabaseClient, input: { playerId: string; productId: string; orderId: string }) {
  const { error } = await admin
    .from('player_inventory')
    .insert({
      player_id: input.playerId,
      product_id: input.productId,
      acquired_via: 'purchase',
      order_id: input.orderId,
    });

  if (error) throw error;
}

export async function appendXpTransaction(admin: SupabaseClient, input: { playerId: string; amount: number; reason: string; xpAfter: number }) {
  const { error } = await admin
    .from('xp_transactions')
    .insert({
      player_id: input.playerId,
      amount: input.amount,
      reason: input.reason,
      xp_after: input.xpAfter,
    });

  if (error) throw error;
}

export async function appendTenksTransaction(admin: SupabaseClient, input: { playerId: string; amount: number; reason: string; balanceAfter: number }) {
  const { error } = await admin
    .from('tenks_transactions')
    .insert({
      player_id: input.playerId,
      amount: input.amount,
      reason: input.reason,
      balance_after: input.balanceAfter,
    });

  if (error) throw error;
}

/**
 * Compares the player's owned items in user_metadata against the durable
 * player_inventory table and returns a merged array. Any item present in DB
 * but missing from metadata is added — this covers the case where the Stripe
 * webhook wrote to DB successfully but the user_metadata update failed.
 */
export async function reconcileInventoryFromDB(
  admin: SupabaseClient,
  playerId: string,
  currentOwnedItems: string[]
): Promise<string[]> {
  try {
    const { data: dbItems, error } = await admin
      .from('player_inventory')
      .select('product_id')
      .eq('player_id', playerId);

    if (error) {
      console.warn('[Waspi] reconcileInventoryFromDB: query failed, keeping current inventory', error.message);
      return currentOwnedItems;
    }

    if (!dbItems || dbItems.length === 0) return currentOwnedItems;

    const dbItemIds = (dbItems as { product_id: string }[]).map((r) => r.product_id);
    const merged = Array.from(new Set([...currentOwnedItems, ...dbItemIds]));

    const added = merged.length - currentOwnedItems.length;
    if (added > 0) {
      console.log(`[Waspi] reconcileInventoryFromDB: reconciled ${added} item(s) from DB for player ${playerId}`);
    }

    return merged;
  } catch (err) {
    console.warn('[Waspi] reconcileInventoryFromDB: unexpected error, keeping current inventory', err);
    return currentOwnedItems;
  }
}

export async function hydratePlayerFromDatabase(
  admin: SupabaseClient,
  user: User,
  fallbackPlayer?: PlayerState
): Promise<PlayerState> {
  // Check existence BEFORE any write. For existing players we must NOT overwrite
  // DB data with potentially-stale metadata (e.g. after a session loss the metadata
  // may be empty, causing DEFAULT_PLAYER_STATE to wipe real TENKS/XP).
  const { data: existingRow } = await admin
    .from('players')
    .select('id')
    .eq('id', user.id)
    .maybeSingle<{ id: string }>();

  if (!existingRow) {
    // New player: initialize all rows from metadata or defaults.
    const newPlayerState = normalizePlayerState(
      fallbackPlayer ?? user.user_metadata?.[PLAYER_METADATA_KEY] ?? DEFAULT_PLAYER_STATE
    );
    await ensurePlayerPersistenceRows(admin, user, newPlayerState);
  } else {
    // Existing player: only INSERT missing sub-table rows (safe no-ops if they exist).
    // Never UPSERT the players row here — avatar/equips are written by their own endpoints.
    // Do NOT call ensurePlayerTenksBalanceRow here — if the row is missing it gets seeded
    // by resolveAuthoritativeTenksBalance below, which uses the correct fallback (not 5000).
    await ensurePlayerStatsRow(admin, user.id);
  }

  const basePlayer = normalizePlayerState(fallbackPlayer ?? user.user_metadata?.[PLAYER_METADATA_KEY] ?? DEFAULT_PLAYER_STATE);

  const [{ data: playerRow, error: playerError }, { data: statsRow, error: statsError }] = await Promise.all([
    admin
      .from('players')
      .select('avatar_config, equipped_top, equipped_bottom, utility_equipped')
      .eq('id', user.id)
      .maybeSingle<PlayerRow>(),
    admin
      .from('player_stats')
      .select('zombie_kills, xp')
      .eq('user_id', user.id)
      .maybeSingle<PlayerStatsRow>(),
  ]);

  if (playerError) throw playerError;
  if (statsError) throw statsError;

  const reconciledOwned = await reconcileInventoryFromDB(admin, user.id, basePlayer.inventory.owned);
  const tenks = await resolveAuthoritativeTenksBalance(admin, {
    playerId: user.id,
    fallbackBalance: basePlayer.tenks,
  });

  const utilityEquipped = Array.isArray(playerRow?.utility_equipped)
    ? playerRow.utility_equipped.filter((value): value is string => typeof value === 'string')
    : basePlayer.inventory.equipped.utility;
  const mutedPlayers = basePlayer.mutedPlayers ?? [];

  // Utility items can't sync to player_inventory (FK — they're not in the products table),
  // so player_inventory never has them. If player_metadata is stale, reconcileInventoryFromDB
  // may return an owned list that's missing equipped utility items (guns the player bought).
  // Since utility_equipped is stored in the durable players row, treat it as authoritative:
  // any equipped utility item must have been purchased and therefore is owned.
  const owned = utilityEquipped?.length
    ? Array.from(new Set([...reconciledOwned, ...(utilityEquipped as string[])]))
    : reconciledOwned;

  return assembleHydratedPlayer(basePlayer, {
    tenks,
    owned,
    playerRow: {
      avatar_config: playerRow?.avatar_config,
      equipped_top: playerRow?.equipped_top,
      equipped_bottom: playerRow?.equipped_bottom,
      utility_equipped: utilityEquipped,
      muted_players: mutedPlayers,
    },
    statsRow,
  });
}

export async function syncPlayerMetadataSnapshot(
  admin: SupabaseClient,
  user: User,
  fallbackPlayer?: PlayerState
): Promise<PlayerState> {
  // Regenerate the compatibility snapshot from durable DB-backed state.
  const player = await hydratePlayerFromDatabase(admin, user, fallbackPlayer);
  // Non-critical side-effects: catalog seeding and row persistence must not block
  // the metadata save. If they fail, the player state snapshot still saves below.
  try { await ensureCatalogSeeded(admin); } catch (e) {
    console.warn('[Waspi] syncPlayerMetadataSnapshot: catalog seed failed (non-fatal):', (e as Error).message);
  }
  try { await syncPlayerInventory(admin, user.id, player); } catch { /* non-fatal */ }
  try { await ensurePlayerPersistenceRows(admin, user, player); } catch (e) {
    console.warn('[Waspi] syncPlayerMetadataSnapshot: persistence rows failed (non-fatal):', (e as Error).message);
  }
  const { data: latestUserData, error: latestUserError } = await admin.auth.admin.getUserById(user.id);
  if (latestUserError) throw latestUserError;

  const latestUser = latestUserData.user ?? user;
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(latestUser.user_metadata ?? {}),
      [PLAYER_METADATA_KEY]: player as unknown as Json,
    },
  });

  if (error) throw error;
  return player;
}
