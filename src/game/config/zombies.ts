export type ZombiesWeaponId = 'pistol' | 'shotgun' | 'smg' | 'rifle' | 'raygun';
export type ZombieType = 'walker' | 'runner' | 'brute' | 'exploder' | 'boss';
export type ZombiesSectionId = 'start' | 'yard' | 'workshop' | 'street';
export type ZombiesMapId = 'map1' | 'map2';

export type ZombiesWeaponConfig = {
  id: ZombiesWeaponId;
  label: string;
  color: number;
  damage: number;
  pellets: number;
  spread: number;
  fireDelayMs: number;
  range: number;
  magazineSize: number;
  reserveAmmo: number;
  reloadMs: number;
  mysteryWeight: number;
  folder: string;
};

export type ZombieConfig = {
  type: ZombieType;
  label: string;
  tint: number;
  baseHp: number;
  speed: number;
  damage: number;
  hitReward: number;
  killReward: number;
  attackRange: number;
  attackCooldownMs: number;
  minRound: number;
  folder: string;
  explosionRadius?: number;
  explosionFuseMs?: number;
  explodesOnDeath?: boolean;
  finalPhaseThreshold?: number;
  finalPhaseLabel?: string;
  finalPhaseTint?: number;
  finalPhaseSpeedMultiplier?: number;
  finalPhaseDamageMultiplier?: number;
  finalPhaseCooldownMultiplier?: number;
};

export type SpawnPoint = {
  x: number;
  y: number;
};

export type ArenaObstacleConfig = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
};

export type SectionConfig = {
  id: ZombiesSectionId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  unlockedByDefault: boolean;
  unlockCost?: number;
  doorX?: number;
  doorY?: number;
  doorW?: number;
  doorH?: number;
  spawnPoints: SpawnPoint[];
};

export type ZombiesMapConfig = {
  id: ZombiesMapId;
  label: string;
  subtitle: string;
  titleColor: string;
  boss: ZombieConfig;
  sections: SectionConfig[];
  obstacles: ArenaObstacleConfig[];
};

export const ZOMBIES_VIEWPORT = {
  WIDTH: 800,
  HEIGHT: 600,
} as const;

export const ZOMBIES_WORLD = {
  WIDTH: 1900,
  HEIGHT: 1250,
} as const;

export const ZOMBIES_POINTS = {
  start: 500,
  mysteryBoxCost: 950,
  roundBreakMs: 3200,
  spawnDelayMs: 950,
  roundWarmupMs: 2400,
  minSpawnDelayMs: 260,
  maxConcurrentZombies: 24,
} as const;

export const ZOMBIES_BOSS_ROUND = 11 as const;
export const ZOMBIES_ROUND_TARGET = 50 as const;
export const DEFAULT_ZOMBIES_MAP_ID: ZombiesMapId = 'map1';

const ZOMBIES_UNLOCK_KEY = 'waspi_zombies_maps_v1';

export const ZOMBIES_PLAYER = {
  speed: 176,
  maxHp: 100,
  radius: 18,
  startX: 290,
  startY: 760,
} as const;

export const ZOMBIES_WEAPONS: Record<ZombiesWeaponId, ZombiesWeaponConfig> = {
  pistol: {
    id: 'pistol',
    label: 'M1911',
    color: 0xF5C842,
    damage: 34,
    pellets: 1,
    spread: 0.02,
    fireDelayMs: 220,
    range: 420,
    magazineSize: 12,
    reserveAmmo: 60,
    reloadMs: 1100,
    mysteryWeight: 0,
    folder: 'pistol',
  },
  shotgun: {
    id: 'shotgun',
    label: '12G',
    color: 0xFF8B3D,
    damage: 28,
    pellets: 5,
    spread: 0.17,
    fireDelayMs: 540,
    range: 290,
    magazineSize: 6,
    reserveAmmo: 36,
    reloadMs: 1500,
    mysteryWeight: 24,
    folder: 'shotgun',
  },
  smg: {
    id: 'smg',
    label: 'BUZZ',
    color: 0x39FF14,
    damage: 18,
    pellets: 1,
    spread: 0.06,
    fireDelayMs: 95,
    range: 390,
    magazineSize: 28,
    reserveAmmo: 168,
    reloadMs: 1200,
    mysteryWeight: 34,
    folder: 'smg',
  },
  rifle: {
    id: 'rifle',
    label: 'RANGER',
    color: 0x46B3FF,
    damage: 46,
    pellets: 1,
    spread: 0.03,
    fireDelayMs: 180,
    range: 520,
    magazineSize: 18,
    reserveAmmo: 108,
    reloadMs: 1450,
    mysteryWeight: 22,
    folder: 'rifle',
  },
  raygun: {
    id: 'raygun',
    label: 'RAY-X',
    color: 0xFF44AA,
    damage: 72,
    pellets: 1,
    spread: 0.01,
    fireDelayMs: 280,
    range: 520,
    magazineSize: 10,
    reserveAmmo: 50,
    reloadMs: 1600,
    mysteryWeight: 12,
    folder: 'raygun',
  },
};

export const ZOMBIE_TYPES: Record<ZombieType, ZombieConfig> = {
  walker: {
    type: 'walker',
    label: 'WALKER',
    tint: 0x87A86B,
    baseHp: 80,
    speed: 0.9,
    damage: 14,
    hitReward: 10,
    killReward: 60,
    attackRange: 26,
    attackCooldownMs: 900,
    minRound: 1,
    folder: 'shooter',
  },
  runner: {
    type: 'runner',
    label: 'RUNNER',
    tint: 0xC78452,
    baseHp: 58,
    speed: 1.55,
    damage: 12,
    hitReward: 10,
    killReward: 75,
    attackRange: 24,
    attackCooldownMs: 700,
    minRound: 3,
    folder: 'rusher',
  },
  brute: {
    type: 'brute',
    label: 'BRUTE',
    tint: 0x8456C2,
    baseHp: 180,
    speed: 0.62,
    damage: 24,
    hitReward: 15,
    killReward: 130,
    attackRange: 32,
    attackCooldownMs: 1050,
    minRound: 5,
    folder: 'tank',
  },
  exploder: {
    type: 'exploder',
    label: 'VOLATILE',
    tint: 0xFF7A59,
    baseHp: 80,
    speed: 1.06,
    damage: 26,
    hitReward: 12,
    killReward: 120,
    attackRange: 28,
    attackCooldownMs: 860,
    minRound: 4,
    folder: 'rusher',
    explosionRadius: 64,
    explosionFuseMs: 820,
    explodesOnDeath: true,
  },
  boss: {
    type: 'boss',
    label: 'ABOMINATION',
    tint: 0x3DD6FF,
    baseHp: 1800,
    speed: 0.9,
    damage: 32,
    hitReward: 25,
    killReward: 1800,
    attackRange: 42,
    attackCooldownMs: 760,
    minRound: ZOMBIES_BOSS_ROUND,
    folder: 'boss',
    finalPhaseThreshold: 0.3,
    finalPhaseLabel: 'BERSERK',
    finalPhaseTint: 0x8A2BFF,
    finalPhaseSpeedMultiplier: 1.22,
    finalPhaseDamageMultiplier: 1.2,
    finalPhaseCooldownMultiplier: 0.82,
  },
};

const MAP_1_BOSS: ZombieConfig = {
  ...ZOMBIE_TYPES.boss,
  label: 'ABOMINATION',
  tint: 0x3DD6FF,
  baseHp: 1800,
  speed: 0.9,
  damage: 32,
  hitReward: 25,
  killReward: 1800,
  attackRange: 42,
  attackCooldownMs: 760,
  finalPhaseThreshold: 0.28,
  finalPhaseLabel: 'BERSERK',
  finalPhaseTint: 0xA34CFF,
  finalPhaseSpeedMultiplier: 1.18,
  finalPhaseDamageMultiplier: 1.14,
  finalPhaseCooldownMultiplier: 0.88,
};

const MAP_2_BOSS: ZombieConfig = {
  ...ZOMBIE_TYPES.boss,
  label: 'WARDEN X',
  tint: 0xFF6B3D,
  baseHp: 2350,
  speed: 1.02,
  damage: 36,
  hitReward: 32,
  killReward: 2600,
  attackRange: 46,
  attackCooldownMs: 700,
  finalPhaseThreshold: 0.34,
  finalPhaseLabel: 'MELTDOWN',
  finalPhaseTint: 0xFFD24A,
  finalPhaseSpeedMultiplier: 1.22,
  finalPhaseDamageMultiplier: 1.18,
  finalPhaseCooldownMultiplier: 0.82,
};

export function isBossRound(round: number) {
  return round === ZOMBIES_BOSS_ROUND;
}

const MAP_1_SECTIONS: SectionConfig[] = [
  {
    id: 'start',
    label: 'START ROOM',
    x: 120,
    y: 470,
    w: 560,
    h: 470,
    unlockedByDefault: true,
    spawnPoints: [
      { x: 110, y: 575 },
      { x: 130, y: 825 },
      { x: 650, y: 545 },
      { x: 650, y: 865 },
    ],
  },
  {
    id: 'yard',
    label: 'YARD',
    x: 710,
    y: 420,
    w: 400,
    h: 350,
    unlockedByDefault: false,
    unlockCost: 1000,
    doorX: 690,
    doorY: 590,
    doorW: 26,
    doorH: 110,
    spawnPoints: [
      { x: 760, y: 455 },
      { x: 1010, y: 445 },
      { x: 1070, y: 720 },
    ],
  },
  {
    id: 'workshop',
    label: 'WORKSHOP',
    x: 1130,
    y: 380,
    w: 520,
    h: 370,
    unlockedByDefault: false,
    unlockCost: 1500,
    doorX: 1112,
    doorY: 560,
    doorW: 24,
    doorH: 110,
    spawnPoints: [
      { x: 1190, y: 425 },
      { x: 1460, y: 415 },
      { x: 1600, y: 710 },
    ],
  },
  {
    id: 'street',
    label: 'BURNT STREET',
    x: 700,
    y: 800,
    w: 950,
    h: 270,
    unlockedByDefault: false,
    unlockCost: 1750,
    doorX: 880,
    doorY: 782,
    doorW: 120,
    doorH: 20,
    spawnPoints: [
      { x: 760, y: 1025 },
      { x: 1110, y: 1015 },
      { x: 1540, y: 1025 },
    ],
  },
];

const MAP_2_SECTIONS: SectionConfig[] = [
  {
    id: 'start',
    label: 'SAFE ROOM',
    x: 120,
    y: 430,
    w: 420,
    h: 560,
    unlockedByDefault: true,
    spawnPoints: [
      { x: 110, y: 520 },
      { x: 130, y: 910 },
      { x: 520, y: 470 },
      { x: 520, y: 950 },
    ],
  },
  {
    id: 'yard',
    label: 'CELLBLOCK',
    x: 570,
    y: 400,
    w: 360,
    h: 320,
    unlockedByDefault: false,
    unlockCost: 1200,
    doorX: 548,
    doorY: 510,
    doorW: 24,
    doorH: 110,
    spawnPoints: [
      { x: 620, y: 440 },
      { x: 860, y: 430 },
      { x: 900, y: 680 },
    ],
  },
  {
    id: 'workshop',
    label: 'BIO LAB',
    x: 960,
    y: 380,
    w: 560,
    h: 340,
    unlockedByDefault: false,
    unlockCost: 1650,
    doorX: 936,
    doorY: 505,
    doorW: 24,
    doorH: 112,
    spawnPoints: [
      { x: 1020, y: 420 },
      { x: 1300, y: 410 },
      { x: 1480, y: 670 },
    ],
  },
  {
    id: 'street',
    label: 'QUARANTINE YARD',
    x: 560,
    y: 770,
    w: 1050,
    h: 290,
    unlockedByDefault: false,
    unlockCost: 2050,
    doorX: 870,
    doorY: 748,
    doorW: 130,
    doorH: 20,
    spawnPoints: [
      { x: 640, y: 1020 },
      { x: 1080, y: 1010 },
      { x: 1500, y: 1025 },
    ],
  },
];

const MAP_1_OBSTACLES: ArenaObstacleConfig[] = [
  { x: 280, y: 650, w: 120, h: 36, color: 0x3A2E22 },
  { x: 475, y: 740, w: 110, h: 38, color: 0x3A2E22 },
  { x: 820, y: 565, w: 120, h: 42, color: 0x232C34 },
  { x: 1290, y: 560, w: 135, h: 46, color: 0x232C34 },
  { x: 1210, y: 925, w: 170, h: 44, color: 0x2D2436 },
  { x: 920, y: 930, w: 120, h: 44, color: 0x2D2436 },
  { x: 1500, y: 875, w: 100, h: 120, color: 0x1D2A1D },
];

const MAP_2_OBSTACLES: ArenaObstacleConfig[] = [
  { x: 230, y: 615, w: 104, h: 150, color: 0x29312A },
  { x: 370, y: 830, w: 128, h: 46, color: 0x2F2721 },
  { x: 650, y: 520, w: 140, h: 36, color: 0x2B3138 },
  { x: 1120, y: 520, w: 170, h: 42, color: 0x242C36 },
  { x: 1350, y: 620, w: 112, h: 112, color: 0x2D2436 },
  { x: 840, y: 900, w: 140, h: 42, color: 0x2A3328 },
  { x: 1260, y: 870, w: 220, h: 54, color: 0x37281F },
  { x: 1510, y: 920, w: 90, h: 112, color: 0x1E2E30 },
];

export const ZOMBIES_MAPS: Record<ZombiesMapId, ZombiesMapConfig> = {
  map1: {
    id: 'map1',
    label: 'MAPA 1 BUNKER',
    subtitle: 'RONDAS, PUERTAS, CAJA MISTERIOSA',
    titleColor: '#F5C842',
    boss: MAP_1_BOSS,
    sections: MAP_1_SECTIONS,
    obstacles: MAP_1_OBSTACLES,
  },
  map2: {
    id: 'map2',
    label: 'MAPA 2 QUARANTINE',
    subtitle: 'MAYOR PRESION, NUEVO BOSS EN RONDA 11',
    titleColor: '#3DD6FF',
    boss: MAP_2_BOSS,
    sections: MAP_2_SECTIONS,
    obstacles: MAP_2_OBSTACLES,
  },
};

export const ZOMBIES_SECTIONS: SectionConfig[] = ZOMBIES_MAPS.map1.sections;

export type ZombiesMapUnlocks = Record<ZombiesMapId, boolean>;

export function loadZombiesMapUnlocks(): ZombiesMapUnlocks {
  const fallback: ZombiesMapUnlocks = { map1: true, map2: false };
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(ZOMBIES_UNLOCK_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<ZombiesMapUnlocks>;
    return {
      map1: true,
      map2: Boolean(parsed.map2),
    };
  } catch {
    return fallback;
  }
}

export function saveZombiesMapUnlocks(unlocks: ZombiesMapUnlocks) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ZOMBIES_UNLOCK_KEY, JSON.stringify(unlocks));
}

export function unlockZombiesMap(mapId: ZombiesMapId) {
  const unlocks = loadZombiesMapUnlocks();
  if (unlocks[mapId]) return unlocks;
  const nextUnlocks = { ...unlocks, [mapId]: true };
  saveZombiesMapUnlocks(nextUnlocks);
  return nextUnlocks;
}

export function getZombieMapConfig(mapId: ZombiesMapId) {
  return ZOMBIES_MAPS[mapId];
}

export function getBossZombieForMap(mapId: ZombiesMapId) {
  return ZOMBIES_MAPS[mapId].boss;
}

export function getZombieTypeConfig(type: ZombieType, mapId: ZombiesMapId = DEFAULT_ZOMBIES_MAP_ID) {
  if (type === 'boss') return getBossZombieForMap(mapId);
  return ZOMBIE_TYPES[type];
}

export function getNextZombieMapId(mapId: ZombiesMapId): ZombiesMapId | null {
  if (mapId === 'map1') return 'map2';
  return null;
}

export function getRoundZombieCount(round: number) {
  if (isBossRound(round)) return 1;
  return Math.min(56, 7 + round * 3 + Math.floor(round * 1.4));
}

export function getSpawnDelayForRound(round: number) {
  if (isBossRound(round)) return 2400;
  return Math.max(ZOMBIES_POINTS.minSpawnDelayMs, ZOMBIES_POINTS.spawnDelayMs - round * 38);
}

export function getRoundWarmupMs(round: number) {
  return Math.max(900, ZOMBIES_POINTS.roundWarmupMs - round * 28);
}

export function getRoundConcurrentCap(round: number) {
  if (isBossRound(round)) return 1;
  return Math.min(ZOMBIES_POINTS.maxConcurrentZombies, 4 + Math.floor(round * 1.8));
}

export function getZombieHpForRound(baseHp: number, round: number) {
  const safeRound = Math.max(1, round);
  const curve = Math.pow(safeRound <= ZOMBIES_BOSS_ROUND ? 1.085 : 1.04, safeRound - 1);
  const eliteBonus = safeRound >= ZOMBIES_BOSS_ROUND ? 1 + (safeRound - (ZOMBIES_BOSS_ROUND - 1)) * 0.035 : 1;

  return Math.round(baseHp * curve * eliteBonus);
}

export function getZombieSpeedForRound(baseSpeed: number, round: number) {
  return baseSpeed + Math.min(0.75, round * 0.04);
}

export function getZombieBreachMs(round: number, type: ZombieType) {
  const base = type === 'boss' ? 680 : type === 'brute' ? 1600 : type === 'runner' ? 820 : 1180;
  return Math.max(320, base - round * 12);
}

export function getEligibleZombieTypes(round: number, mapId: ZombiesMapId = DEFAULT_ZOMBIES_MAP_ID) {
  if (isBossRound(round)) return [ZOMBIE_TYPES.boss];
  return Object.values(ZOMBIE_TYPES).filter((type) => {
    if (type.type === 'boss') return false;
    if (type.type === 'exploder' && mapId !== 'map2') return false;
    return type.minRound <= round;
  });
}
