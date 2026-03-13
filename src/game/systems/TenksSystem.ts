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

export function initTenks(initial: number) {
  balance = readStoredBalance() ?? initial;
  persistBalance();
  eventBus.emit(EVENTS.TENKS_CHANGED, { balance, delta: 0, reason: 'init' });
}

