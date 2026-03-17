// qualityTiers.ts
// Defines the quality tier system for all skill outputs (mining, gardening, fishing, etc.)
// Quality is always rolled server-side — this file provides shared types and display config.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QualityTier = 'basic' | 'normal' | 'good' | 'excellent' | 'legendary';

// ---------------------------------------------------------------------------
// Display config — used client-side for feedback only
// ---------------------------------------------------------------------------

export const QUALITY_LABELS: Record<QualityTier, string> = {
  basic:     'BASICO',
  normal:    'NORMAL',
  good:      'BUENO',
  excellent: 'EXCELENTE',
  legendary: 'LEGENDARIO',
};

export const QUALITY_COLORS: Record<QualityTier, string> = {
  basic:     '#666677',
  normal:    '#B0B0C0',
  good:      '#4A9ECC',
  excellent: '#9B59B6',
  legendary: '#F5C842',
};

// TENKS value multiplier when selling/using a quality item
export const QUALITY_VALUE_MULT: Record<QualityTier, number> = {
  basic:     1.0,
  normal:    1.5,
  good:      2.0,
  excellent: 3.0,
  legendary: 5.0,
};

// XP bonus granted on top of the base XP when a quality roll fires
export const QUALITY_XP_BONUS: Record<QualityTier, number> = {
  basic:     0,
  normal:    0,
  good:      5,
  excellent: 15,
  legendary: 30,
};

// ---------------------------------------------------------------------------
// Server-side roll weights by skill level
// Each array: [basic%, normal%, good%, excellent%, legendary%] — must sum to 100
// Auto mode (Lv5 automation) is always capped at basic/normal.
// ---------------------------------------------------------------------------

export const QUALITY_ROLL_WEIGHTS: Record<number, [number, number, number, number, number]> = {
  0: [70, 30,  0,  0,  0],
  1: [60, 40,  0,  0,  0],
  2: [25, 50, 25,  0,  0],
  3: [10, 35, 45, 10,  0],
  4: [ 0, 20, 45, 30,  5],
  5: [ 0, 10, 35, 35, 20],
};

export const QUALITY_ROLL_WEIGHTS_AUTO: [number, number, number, number, number] = [50, 50, 0, 0, 0];

// ---------------------------------------------------------------------------
// Helper — rolls a quality tier given weights (used server-side only)
// Exported so the API route can import and use it without duplication.
// ---------------------------------------------------------------------------

export function rollQualityFromWeights(
  weights: [number, number, number, number, number],
): QualityTier {
  const tiers: QualityTier[] = ['basic', 'normal', 'good', 'excellent', 'legendary'];
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) return tiers[i];
  }
  return 'normal'; // fallback
}

// ---------------------------------------------------------------------------
// Client-side helper — derives quality ceiling from skill level (display only)
// Never use this to determine actual quality — always trust the server response.
// ---------------------------------------------------------------------------

export function getQualityCeilingLabel(level: number): string {
  if (level <= 1) return 'Normal';
  if (level <= 3) return 'Bueno';
  if (level === 4) return 'Excelente';
  return 'Legendario';
}
