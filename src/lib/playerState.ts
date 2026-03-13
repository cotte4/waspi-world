import type { AvatarConfig } from '../game/systems/AvatarRenderer';
import { getItem } from '../game/config/catalog';

const DEFAULT_UTILITY_ID = 'UTIL-GUN-01';

export type InventoryState = {
  owned: string[];
  equipped: {
    top?: string;
    bottom?: string;
    utility?: string[];
  };
};

export type PlayerState = {
  tenks: number;
  inventory: InventoryState;
  avatar: AvatarConfig;
  mutedPlayers?: string[];
};

export const DEFAULT_PLAYER_STATE: PlayerState = {
  tenks: 5000,
  inventory: {
    owned: [DEFAULT_UTILITY_ID],
    equipped: {
      utility: [DEFAULT_UTILITY_ID],
    },
  },
  avatar: {
    avatarKind: 'procedural',
    bodyColor: 0xF2C7A1,
    hairColor: 0x4A2F1B,
    eyeColor: 0x2244CC,
    topColor: 0x4C67FF,
    bottomColor: 0x1D2233,
    hairStyle: 'SPI',
    pp: 2,
    tt: 2,
    smoke: false,
  },
  mutedPlayers: [],
};

export function normalizePlayerState(input: unknown): PlayerState {
  const state = (input && typeof input === 'object') ? (input as Partial<PlayerState>) : {};
  const inventory = state.inventory && typeof state.inventory === 'object'
    ? state.inventory
    : DEFAULT_PLAYER_STATE.inventory;
  const equipped = inventory.equipped && typeof inventory.equipped === 'object'
    ? inventory.equipped
    : DEFAULT_PLAYER_STATE.inventory.equipped;
  const owned = Array.isArray(inventory.owned) ? inventory.owned.filter((v): v is string => typeof v === 'string') : [];
  const utility = Array.isArray(equipped.utility)
    ? equipped.utility.filter((v): v is string => typeof v === 'string')
    : [];
  const ownedWithDefaults = owned.includes(DEFAULT_UTILITY_ID) ? owned : [...owned, DEFAULT_UTILITY_ID];
  const utilityWithDefaults = utility.length ? utility : [DEFAULT_UTILITY_ID];

  return {
    tenks: typeof state.tenks === 'number' ? state.tenks : DEFAULT_PLAYER_STATE.tenks,
    inventory: {
      owned: ownedWithDefaults,
      equipped: {
        top: typeof equipped.top === 'string' ? equipped.top : undefined,
        bottom: typeof equipped.bottom === 'string' ? equipped.bottom : undefined,
        utility: utilityWithDefaults,
      },
    },
    avatar: {
      ...DEFAULT_PLAYER_STATE.avatar,
      ...(state.avatar && typeof state.avatar === 'object' ? state.avatar : {}),
    },
    mutedPlayers: Array.isArray(state.mutedPlayers)
      ? state.mutedPlayers.filter((v): v is string => typeof v === 'string')
      : [],
  };
}

export function creditTenks(state: PlayerState, amount: number): PlayerState {
  return {
    ...state,
    tenks: Math.max(0, state.tenks + amount),
  };
}

export function grantInventoryItem(state: PlayerState, itemId: string): PlayerState {
  const item = getItem(itemId);
  if (!item) return state;

  const owned = state.inventory.owned.includes(itemId)
    ? state.inventory.owned
    : [...state.inventory.owned, itemId];

  const equipped = { ...state.inventory.equipped };
  if (item.slot === 'utility') {
    const utility = new Set(equipped.utility ?? []);
    utility.add(itemId);
    equipped.utility = [...utility];
  } else {
    equipped[item.slot] = itemId;
  }

  return {
    ...state,
    inventory: {
      owned,
      equipped,
    },
    avatar: {
      ...state.avatar,
      ...(item.slot === 'top' ? { topColor: item.color ?? state.avatar.topColor } : {}),
      ...(item.slot === 'bottom' ? { bottomColor: item.color ?? state.avatar.bottomColor } : {}),
    },
  };
}

export function mutePlayer(state: PlayerState, playerId: string): PlayerState {
  if (state.mutedPlayers?.includes(playerId)) return state;
  return {
    ...state,
    mutedPlayers: [...(state.mutedPlayers ?? []), playerId],
  };
}

export function unmutePlayer(state: PlayerState, playerId: string): PlayerState {
  return {
    ...state,
    mutedPlayers: (state.mutedPlayers ?? []).filter((id) => id !== playerId),
  };
}
