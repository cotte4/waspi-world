import type { SupabaseClient, User } from '@supabase/supabase-js';
import { DEFAULT_PLAYER_STATE, normalizePlayerState, type PlayerState } from '@/src/lib/playerState';
import { getSerializedCatalog, toProductRecord } from '@/src/lib/catalogServer';

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type DiscountCodeRow = {
  code: string;
  player_id: string;
  percent_off: number;
  used: boolean;
  expires_at: string | null;
};

const PLAYER_METADATA_KEY = 'waspiPlayer';

function getUsername(user: User) {
  const username = user.user_metadata?.username;
  if (typeof username === 'string' && username.trim()) return username.trim();
  if (user.email) return user.email.split('@')[0];
  return `player_${user.id.slice(0, 8)}`;
}

export async function ensureCatalogSeeded(admin: SupabaseClient) {
  const rows = getSerializedCatalog()
    .filter((item) => item.slot !== 'utility' || item.priceTenks > 0)
    .map((item) => toProductRecord(item));

  const { error } = await admin
    .from('products')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
}

export async function ensurePlayerRow(admin: SupabaseClient, user: User, playerState?: PlayerState) {
  const state = normalizePlayerState(playerState ?? user.user_metadata?.[PLAYER_METADATA_KEY] ?? DEFAULT_PLAYER_STATE);
  const { error } = await admin
    .from('players')
    .upsert({
      id: user.id,
      username: getUsername(user),
      avatar_config: state.avatar as unknown as Json,
      equipped_top: state.inventory.equipped.top ?? null,
      equipped_bottom: state.inventory.equipped.bottom ?? null,
      tenks: state.tenks,
      muted_players: state.mutedPlayers ?? [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) throw error;
}

export async function syncPlayerInventory(admin: SupabaseClient, playerId: string, playerState: PlayerState) {
  const ownedProductIds = playerState.inventory.owned.filter((id) => !id.startsWith('UTIL-'));
  const { error: deleteError } = await admin
    .from('player_inventory')
    .delete()
    .eq('player_id', playerId)
    .is('order_id', null);

  if (deleteError) throw deleteError;

  if (!ownedProductIds.length) return;

  const rows = ownedProductIds.map((productId) => ({
    player_id: playerId,
    product_id: productId,
    acquired_via: 'sync',
    order_id: null,
  }));

  const { error } = await admin
    .from('player_inventory')
    .insert(rows);

  if (error) throw error;
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
