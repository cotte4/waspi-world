import { eventBus, EVENTS } from '../config/eventBus';
import { getItem } from '../config/catalog';
import type { InventoryState } from '../../lib/playerState';
import { getAuthHeaders } from './authHelper';

const KEY = 'waspi_inventory_v1';
const DEFAULT_UTILITY_ID = 'UTIL-GUN-01';

function ensureDemoLoadout(state: InventoryState): InventoryState {
  const owned = state.owned.includes(DEFAULT_UTILITY_ID)
    ? state.owned
    : [...state.owned, DEFAULT_UTILITY_ID];
  const utility = Array.isArray(state.equipped.utility) ? state.equipped.utility : [];
  return {
    owned,
    equipped: {
      ...state.equipped,
      utility: utility.length ? utility : [DEFAULT_UTILITY_ID],
    },
  };
}

function loadState(): InventoryState {
  if (typeof window === 'undefined') return ensureDemoLoadout({ owned: [], equipped: {} });
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return ensureDemoLoadout({ owned: [], equipped: {} });
  try {
    const parsed = JSON.parse(raw) as InventoryState;
    // Migrate old shapes
    const equipped = typeof parsed.equipped === 'object' && parsed.equipped ? parsed.equipped : {};
    if (!Array.isArray(equipped.utility)) equipped.utility = [];
    return ensureDemoLoadout({
      owned: Array.isArray(parsed.owned) ? parsed.owned : [],
      equipped,
    });
  } catch {
    return ensureDemoLoadout({ owned: [], equipped: {} });
  }
}

function saveState(s: InventoryState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function getInventory() {
  return loadState();
}

export function replaceInventory(next: InventoryState) {
  saveState(next);
  eventBus.emit(EVENTS.INVENTORY_CHANGED, next);
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
  if (item.slot === 'utility') {
    const list = s.equipped.utility ?? [];
    const has = list.includes(id);
    s.equipped.utility = has ? list.filter(x => x !== id) : [...list, id];
  } else {
    s.equipped[item.slot] = id;
  }
  saveState(s);
  eventBus.emit(EVENTS.INVENTORY_CHANGED, s);
  // Tell world to rebuild avatar with new clothing colors
  eventBus.emit(EVENTS.AVATAR_SET, { equipTop: s.equipped.top, equipBottom: s.equipped.bottom });
  return true;
}

/**
 * Idempotent equip helper.
 * Unlike equipItem() it never toggles utility items OFF.
 */
export function ensureItemEquipped(id: string) {
  const item = getItem(id);
  if (!item) return false;
  const s = loadState();
  if (!s.owned.includes(id)) return false;

  if (item.slot === 'utility') {
    const list = s.equipped.utility ?? [];
    if (list.includes(id)) return true;
    s.equipped.utility = [...list, id];
  } else if (s.equipped[item.slot] === id) {
    return true;
  } else {
    s.equipped[item.slot] = id;
  }

  saveState(s);
  eventBus.emit(EVENTS.INVENTORY_CHANGED, s);
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

export function hasUtilityEquipped(id: string) {
  const s = loadState();
  return (s.equipped.utility ?? []).includes(id);
}

/**
 * Load inventory from server and hydrate localStorage.
 * Server wins on load. Falls back silently if the request fails.
 */
export async function initInventoryFromServer(): Promise<void> {
  try {
    const authH = await getAuthHeaders();
    if (!authH.Authorization) return;

    const res = await fetch('/api/player/inventory', { headers: authH });
    if (!res.ok) return;

    const json = await res.json() as { inventory?: InventoryState } | null;
    if (!json?.inventory) return;

    replaceInventory(ensureDemoLoadout(json.inventory));
  } catch {
    // Network error — keep current localStorage state.
  }
}
