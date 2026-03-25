import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_PLAYER_STATE } from '@/src/lib/playerState';

export const DEFAULT_TENKS_BALANCE = DEFAULT_PLAYER_STATE.tenks;

type TenksRow = { balance: number };
type PlayerTenksRow = { tenks: number };

function normalizeTenks(value: number) {
  return Math.max(0, Math.floor(value));
}

export async function syncPlayerTenksProjection(
  admin: SupabaseClient,
  playerId: string,
  balance: number,
) {
  const normalized = normalizeTenks(balance);
  const { error } = await admin
    .from('players')
    .update({
      tenks: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq('id', playerId);

  if (error) {
    // If the player row does not exist yet, the balance table remains authoritative.
    console.warn('[Waspi][TENKS] syncPlayerTenksProjection warning:', error.message);
  }
}

export async function seedBalanceIfMissing(
  admin: SupabaseClient,
  playerId: string,
  seedBalance = DEFAULT_TENKS_BALANCE,
) {
  const normalizedSeed = normalizeTenks(seedBalance);
  const { data: existing, error: existingError } = await admin
    .from('player_tenks_balance')
    .select('balance')
    .eq('player_id', playerId)
    .maybeSingle<TenksRow>();

  if (existingError) throw existingError;
  if (existing) return normalizeTenks(existing.balance);

  const { error: insertError } = await admin
    .from('player_tenks_balance')
    .upsert({ player_id: playerId, balance: normalizedSeed }, { onConflict: 'player_id' });

  if (insertError) throw insertError;
  await syncPlayerTenksProjection(admin, playerId, normalizedSeed);
  return normalizedSeed;
}

export async function getAuthoritativeBalance(
  admin: SupabaseClient,
  input: {
    playerId: string;
    fallbackBalance?: number;
    defaultBalance?: number;
  }
) {
  const defaultBalance = normalizeTenks(input.defaultBalance ?? DEFAULT_TENKS_BALANCE);
  const fallbackBalance = normalizeTenks(input.fallbackBalance ?? defaultBalance);

  const { data: balanceRow, error: balanceError } = await admin
    .from('player_tenks_balance')
    .select('balance')
    .eq('player_id', input.playerId)
    .maybeSingle<TenksRow>();
  if (balanceError) throw balanceError;

  const { data: playerRow, error: playerError } = await admin
    .from('players')
    .select('tenks')
    .eq('id', input.playerId)
    .maybeSingle<PlayerTenksRow>();
  if (playerError) throw playerError;

  const playerTenks = typeof playerRow?.tenks === 'number' ? normalizeTenks(playerRow.tenks) : 0;

  if (!balanceRow) {
    // Row missing: seed from fallback only. Never use defaultBalance (5000) as a floor
    // because it would reset real balances for players whose row was temporarily missing.
    const seeded = Math.max(fallbackBalance, playerTenks);
    return seedBalanceIfMissing(admin, input.playerId, seeded);
  }

  // player_tenks_balance is the authoritative source. Do NOT use players.tenks as a floor —
  // that column is a denormalized projection that may be stale (e.g. stuck at 5000 from
  // an old bug). Trust only the balance table and sync the projection to match.
  const resolved = normalizeTenks(balanceRow.balance);
  if (playerTenks !== resolved) {
    // Keep players.tenks in sync with the authoritative balance row.
    await syncPlayerTenksProjection(admin, input.playerId, resolved);
  }

  return resolved;
}

export async function creditBalance(
  admin: SupabaseClient,
  input: {
    playerId: string;
    amount: number;
    fallbackBalance?: number;
    defaultBalance?: number;
  }
) {
  const amount = normalizeTenks(input.amount);
  const currentBalance = await getAuthoritativeBalance(admin, input);
  const newBalance = currentBalance + amount;

  const { error } = await admin
    .from('player_tenks_balance')
    .upsert({ player_id: input.playerId, balance: newBalance }, { onConflict: 'player_id' });
  if (error) throw error;

  await syncPlayerTenksProjection(admin, input.playerId, newBalance);
  return { previousBalance: currentBalance, newBalance };
}

export async function debitBalance(
  admin: SupabaseClient,
  input: {
    playerId: string;
    amount: number;
    fallbackBalance?: number;
    defaultBalance?: number;
  }
) {
  const amount = normalizeTenks(input.amount);
  const currentBalance = await getAuthoritativeBalance(admin, input);
  if (currentBalance < amount) {
    return {
      ok: false as const,
      previousBalance: currentBalance,
      newBalance: currentBalance,
    };
  }

  const newBalance = currentBalance - amount;
  const { error } = await admin
    .from('player_tenks_balance')
    .upsert({ player_id: input.playerId, balance: newBalance }, { onConflict: 'player_id' });
  if (error) throw error;

  await syncPlayerTenksProjection(admin, input.playerId, newBalance);
  return {
    ok: true as const,
    previousBalance: currentBalance,
    newBalance,
  };
}
