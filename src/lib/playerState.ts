import type { AvatarConfig } from '../game/systems/AvatarRenderer';
import { getItem } from '../game/config/catalog';
import { normalizeVecindadBuildStage } from './vecindad';

const DEFAULT_UTILITY_ID = 'UTIL-GUN-01';
export const VECINDAD_DEED_ITEM_ID = 'UTIL-DEED-01';
const FARM_SEED_TYPES = ['basica', 'indica', 'sativa', 'purple_haze', 'og_kush'] as const;
type FarmSeedType = (typeof FARM_SEED_TYPES)[number];

export type InventoryState = {
  owned: string[];
  equipped: {
    top?: string;
    bottom?: string;
    utility?: string[];
  };
};

export type VecindadState = {
  ownedParcelId?: string;
  buildStage: number;
  materials: number;
  cannabisFarmUnlocked?: boolean;
  farmPlants?: Array<{
    slotIndex: number;
    seedType: 'basica' | 'indica' | 'sativa' | 'purple_haze' | 'og_kush';
    plantedAt: number;
    wateredAt?: number;
    waterCount: number;
  }>;
};

function isFarmSeedType(value: unknown): value is NonNullable<VecindadState['farmPlants']>[number]['seedType'] {
  return typeof value === 'string' && FARM_SEED_TYPES.includes(value as FarmSeedType);
}

export type PlayerState = {
  tenks: number;
  inventory: InventoryState;
  avatar: AvatarConfig;
  mutedPlayers?: string[];
  vecindad: VecindadState;
  progression?: { kills: number; xp: number };
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
  vecindad: {
    ownedParcelId: undefined,
    buildStage: 0,
    materials: 0,
    cannabisFarmUnlocked: false,
    farmPlants: [],
  },
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

  const progRaw = state.progression;
  const progression: PlayerState['progression'] =
    progRaw && typeof progRaw === 'object'
      ? {
          kills: typeof progRaw.kills === 'number' ? Math.max(0, Math.floor(progRaw.kills)) : 0,
          xp: typeof progRaw.xp === 'number' ? Math.max(0, Math.floor(progRaw.xp)) : 0,
        }
      : undefined;

  return {
    tenks: typeof state.tenks === 'number' ? Math.max(0, Math.floor(state.tenks)) : DEFAULT_PLAYER_STATE.tenks,
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
    vecindad: {
      ownedParcelId:
        state.vecindad && typeof state.vecindad === 'object' && typeof state.vecindad.ownedParcelId === 'string'
          ? state.vecindad.ownedParcelId
          : undefined,
      buildStage: normalizeVecindadBuildStage(
        state.vecindad && typeof state.vecindad === 'object' && typeof state.vecindad.buildStage === 'number'
          ? state.vecindad.buildStage
          : DEFAULT_PLAYER_STATE.vecindad.buildStage
      ),
      materials:
        state.vecindad && typeof state.vecindad === 'object' && typeof state.vecindad.materials === 'number'
          ? Math.max(0, Math.floor(state.vecindad.materials))
          : DEFAULT_PLAYER_STATE.vecindad.materials,
      cannabisFarmUnlocked:
        state.vecindad && typeof state.vecindad === 'object' && typeof state.vecindad.cannabisFarmUnlocked === 'boolean'
          ? state.vecindad.cannabisFarmUnlocked
          : false,
      farmPlants:
        state.vecindad && typeof state.vecindad === 'object' && Array.isArray(state.vecindad.farmPlants)
          ? state.vecindad.farmPlants
              .filter((entry): entry is NonNullable<VecindadState['farmPlants']>[number] =>
                Boolean(entry)
                && typeof entry === 'object'
                && typeof entry.slotIndex === 'number'
                && isFarmSeedType(entry.seedType)
                && typeof entry.plantedAt === 'number'
                && typeof entry.waterCount === 'number'
              )
              .map((entry) => ({
                slotIndex: Math.max(0, Math.min(11, Math.floor(entry.slotIndex))),
                seedType: entry.seedType,
                plantedAt: Math.max(0, Math.floor(entry.plantedAt)),
                wateredAt: typeof entry.wateredAt === 'number' ? Math.max(0, Math.floor(entry.wateredAt)) : undefined,
                waterCount: Math.max(0, Math.floor(entry.waterCount)),
              }))
          : [],
    },
    progression,
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
    if (item.autoEquip !== false) {
      const utility = new Set(equipped.utility ?? []);
      utility.add(itemId);
      equipped.utility = [...utility];
    }
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

export function revokeInventoryItem(state: PlayerState, itemId: string): PlayerState {
  const item = getItem(itemId);
  if (!item) return state;

  const owned = state.inventory.owned.filter((id) => id !== itemId);
  const equipped = { ...state.inventory.equipped };

  if (item.slot === 'utility') {
    equipped.utility = (equipped.utility ?? []).filter((id) => id !== itemId);
  } else if (equipped[item.slot] === itemId) {
    delete equipped[item.slot];
  }

  return {
    ...state,
    inventory: {
      owned,
      equipped,
    },
  };
}

export function syncVecindadDeed(state: PlayerState): PlayerState {
  if (state.vecindad.ownedParcelId) {
    return state.inventory.owned.includes(VECINDAD_DEED_ITEM_ID)
      ? state
      : grantInventoryItem(state, VECINDAD_DEED_ITEM_ID);
  }

  return state.inventory.owned.includes(VECINDAD_DEED_ITEM_ID)
    ? revokeInventoryItem(state, VECINDAD_DEED_ITEM_ID)
    : state;
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
