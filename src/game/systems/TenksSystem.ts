import { eventBus, EVENTS } from '../config/eventBus';

let balance = 0;

export function getTenksBalance() {
  return balance;
}

export function addTenks(amount: number, reason: string) {
  balance += amount;
  eventBus.emit(EVENTS.TENKS_CHANGED, { balance, delta: amount, reason });
}

export function spendTenks(amount: number, reason: string): boolean {
  if (balance < amount) return false;
  balance -= amount;
  eventBus.emit(EVENTS.TENKS_CHANGED, { balance, delta: -amount, reason });
  return true;
}

/** Authoritative balance from API — overwrites in-memory state. */
export function applyTenksBalanceFromServer(newBalance: number, reason: string) {
  if (typeof newBalance !== 'number' || !Number.isFinite(newBalance)) return;
  const prev = balance;
  balance = Math.max(0, Math.floor(newBalance));
  eventBus.emit(EVENTS.TENKS_CHANGED, { balance, delta: balance - prev, reason });
}

export function initTenks(initial: number) {
  balance = Math.max(0, Math.floor(initial));
  eventBus.emit(EVENTS.TENKS_CHANGED, { balance, delta: 0, reason: 'init' });
}

/**
 * Fetch the server-authoritative balance and set the in-memory state.
 * Falls back silently to 0 if the request fails.
 */
export async function initTenksFromServer(playerId: string, authToken?: string): Promise<void> {
  void playerId;
  try {
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch('/api/player/tenks', { headers });
    if (!res.ok) return;

    const json = await res.json() as { balance?: number };
    if (typeof json.balance !== 'number') return;

    initTenks(json.balance);
  } catch {
    // Network error — balance stays at current in-memory value.
  }
}
