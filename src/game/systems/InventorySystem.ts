import { eventBus, EVENTS } from '../config/eventBus';
import { getItem } from '../config/catalog';

type InventoryState = {
  owned: string[];
  equipped: {
    top?: string;
    bottom?: string;
  };
};

const KEY = 'waspi_inventory_v1';

function loadState(): InventoryState {
  if (typeof window === 'undefined') return { owned: [], equipped: {} };
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return { owned: [], equipped: {} };
  try {
    const parsed = JSON.parse(raw) as InventoryState;
    return {
      owned: Array.isArray(parsed.owned) ? parsed.owned : [],
      equipped: typeof parsed.equipped === 'object' && parsed.equipped ? parsed.equipped : {},
    };
  } catch {
    return { owned: [], equipped: {} };
  }
}

function saveState(s: InventoryState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function getInventory() {
  return loadState();
}

export function ownItem(id: string) {
  const item = getItem(id);
  if (!item) return false;
  const s = loadState();
  if (!s.owned.includes(id)) s.owned.push(id);
  saveState(s);
  eventBus.emit(EVENTS.INVENTORY_CHANGED, s);
  return true;
}

export function equipItem(id: string) {
  const item = getItem(id);
  if (!item) return false;
  const s = loadState();
  if (!s.owned.includes(id)) return false;
  s.equipped[item.slot] = id;
  saveState(s);
  eventBus.emit(EVENTS.INVENTORY_CHANGED, s);
  // Tell world to rebuild avatar with new clothing colors
  eventBus.emit(EVENTS.AVATAR_SET, { equipTop: s.equipped.top, equipBottom: s.equipped.bottom });
  return true;
}

export function getEquippedColors(): { topColor?: number; bottomColor?: number } {
  const s = loadState();
  const top = s.equipped.top ? getItem(s.equipped.top) : null;
  const bottom = s.equipped.bottom ? getItem(s.equipped.bottom) : null;
  return {
    topColor: top?.color,
    bottomColor: bottom?.color,
  };
}

