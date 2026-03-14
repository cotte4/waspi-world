export type ZombiesWeaponId = 'pistol' | 'shotgun' | 'smg' | 'rifle' | 'raygun';
export type ZombieType = 'walker' | 'runner' | 'brute';
export type ZombiesSectionId = 'start' | 'yard' | 'workshop' | 'street';

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
};

export type SpawnPoint = {
  x: number;
  y: number;
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

export const ZOMBIES_ROUND_TARGET = 50 as const;

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
};

export const ZOMBIES_SECTIONS: SectionConfig[] = [
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

export function getRoundZombieCount(round: number) {
  return Math.min(60, 6 + round * 2 + Math.floor(round * 0.8));
}

export function getSpawnDelayForRound(round: number) {
  return Math.max(ZOMBIES_POINTS.minSpawnDelayMs, ZOMBIES_POINTS.spawnDelayMs - round * 38);
}

export function getRoundWarmupMs(round: number) {
  return Math.max(900, ZOMBIES_POINTS.roundWarmupMs - round * 28);
}

export function getRoundConcurrentCap(round: number) {
  return Math.min(ZOMBIES_POINTS.maxConcurrentZombies, 4 + Math.floor(round * 1.5));
}

export function getZombieHpForRound(baseHp: number, round: number) {
  const safeRound = Math.max(1, round);
  const curve = Math.pow(1.0175, safeRound - 1);
  const eliteBonus = safeRound >= 35 ? 1 + (safeRound - 34) * 0.006 : 1;

  return Math.round(baseHp * curve * eliteBonus);
}

export function getZombieSpeedForRound(baseSpeed: number, round: number) {
  return baseSpeed + Math.min(0.9, round * 0.03);
}

export function getZombieBreachMs(round: number, type: ZombieType) {
  const base = type === 'brute' ? 1600 : type === 'runner' ? 820 : 1180;
  return Math.max(320, base - round * 12);
}

export function getEligibleZombieTypes(round: number) {
  return Object.values(ZOMBIE_TYPES).filter((type) => type.minRound <= round);
}
