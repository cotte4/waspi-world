// Core world constants aligned to the current PRD-driven layout.

export const WORLD = {
  WIDTH: 3200,
  HEIGHT: 1800,
} as const;

export const VIEWPORT = {
  WIDTH: 800,
  HEIGHT: 600,
} as const;

export const PLAYER = {
  SPEED: 180,
  SPAWN_X: 400,
  SPAWN_Y: 780,
} as const;

export const CAMERA = {
  LERP: 0.1,
} as const;

export const COLORS = {
  BG: 0x0e0e14,
  SIDEWALK: 0x20202c,
  STREET: 0x12121c,
  GRASS: 0x0f2414,
  FOUNTAIN: 0x183654,
  BUILDING_ARCADE: 0x14142a,
  BUILDING_STORE: 0x181820,
  BUILDING_CAFE: 0x1a0e0a,
  BUILDING_HOUSE: 0x18181f,
  ROOF_DARK: 0x0b0b14,
  WINDOW_COOL: 0x3c6cff,
  WINDOW_WARM: 0xffb347,
  WINDOW_NEON: 0xff44aa,
  NEON_BLUE: 0x46b3ff,
  NEON_PINK: 0xff006e,
  NEON_GREEN: 0x39ff14,
  NEON_ORANGE: 0xff6b00,
  GOLD: 0xf5c842,
  SKIN_LIGHT: 0xf5d5a4,
  HAIR_DARK: 0x2a1400,
  HAIR_BROWN: 0x8b5a2b,
  BODY_BLUE: 0x1f3b5b,
  LEGS_DARK: 0x1a1a24,
} as const;

export const ZONES = {
  NORTH_SIDEWALK_Y: 520,
  NORTH_SIDEWALK_H: 80,
  STREET_Y: 600,
  STREET_H: 120,
  SOUTH_SIDEWALK_Y: 720,
  SOUTH_SIDEWALK_H: 80,
  BUILDING_TOP: 260,
  BUILDING_BOTTOM: 520,
  HOUSE_Y: 880,
  HOUSE_H: 220,
  PLAZA_Y: 860,
  VECINDAD_X: 40,
  VECINDAD_Y: 900,
  VECINDAD_W: 930,
  VECINDAD_H: 850,
  TRAINING_X: 1150,
  TRAINING_Y: 960,
  TRAINING_W: 900,
  TRAINING_H: 420,
} as const;

export const SAFE_PLAZA_RETURN = {
  X: 980,
  Y: ZONES.PLAZA_Y + 72,
} as const;

export const BUILDINGS = {
  ARCADE: {
    x: 520,
    y: 300,
    w: 420,
    h: 220,
  },
  STORE: {
    x: 1240,
    y: 290,
    w: 520,
    h: 240,
  },
  CAFE: {
    x: 2080,
    y: 310,
    w: 420,
    h: 230,
  },
  HOUSE: {
    x: 260,
    y: 880,
    w: 360,
    h: 220,
  },
} as const;

export const CHAT = {
  MAX_CHARS: 140,
  BUBBLE_DURATION: 5000,
  RATE_LIMIT_MS: 1000,
} as const;

export const AVATAR = {
  SHADOW_W: 22,
  SHADOW_H: 7,
  BODY_W: 18,
  BODY_H: 16,
  HEAD_R: 12,
  LEGS_W: 14,
  LEGS_H: 14,
} as const;
