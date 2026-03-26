import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_PLAYER_STATE } from '@/src/lib/playerState';

export const DEFAULT_TENKS_BALANCE = DEFAULT_PLAYER_STATE.tenks;

type TenksRow = { balance: number };

function normalizeTenks(value: number) {
  return Math.max(0, Math.floor(value));
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

  if (!balanceRow) {
    return seedBalanceIfMissing(admin, input.playerId, fallbackBalance);
  }

  return normalizeTenks(balanceRow.balance);
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

  return {
    ok: true as const,
    previousBalance: currentBalance,
    newBalance,
  };
}
