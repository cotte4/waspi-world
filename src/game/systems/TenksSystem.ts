import { eventBus, EVENTS } from '../config/eventBus';

let balance = 5000;

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

export function initTenks(initial: number) {
  balance = initial;
  eventBus.emit(EVENTS.TENKS_CHANGED, { balance, delta: 0, reason: 'init' });
}

