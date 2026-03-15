import { eventBus, EVENTS } from '../config/eventBus';

let balance = 5000;
const KEY = 'waspi_tenks_v1';

function readStoredBalance() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function persistBalance() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, String(balance));
}

export function getTenksBalance() {
  return balance;
}

export function addTenks(amount: number, reason: string) {
  balance += amount;
  persistBalance();
  eventBus.emit(EVENTS.TENKS_CHANGED, { balance, delta: amount, reason });
}

export function spendTenks(amount: number, reason: string): boolean {
  if (balance < amount) return false;
  balance -= amount;
  persistBalance();
  eventBus.emit(EVENTS.TENKS_CHANGED, { balance, delta: -amount, reason });
  return true;
}

export function initTenks(initial: number, options?: { preferStored?: boolean }) {
  const preferStored = options?.preferStored ?? true;
  balance = preferStored ? (readStoredBalance() ?? initial) : initial;
  persistBalance();
  eventBus.emit(EVENTS.TENKS_CHANGED, { balance, delta: 0, reason: 'init' });
}

/**
 * Fetch the server-authoritative balance and overwrite the local state.
 * Requires the caller to pass the player's JWT so the API can authenticate.
 * Falls back silently to the existing localStorage value if the request fails.
 */
export async function initTenksFromServer(playerId: string, authToken?: string): Promise<void> {
  // playerId is kept for future per-player cache invalidation; the API
  // identifies the user via the Authorization header.
  void playerId;
  try {
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch('/api/player/tenks', { headers });
    if (!res.ok) return; // graceful fallback — keep localStorage value

    const json = await res.json() as { balance?: number };
    if (typeof json.balance !== 'number') return;

    // Override localStorage with the server value.
    initTenks(json.balance, { preferStored: false });
  } catch {
    // Network error or parse failure — keep current localStorage balance.
  }
}

