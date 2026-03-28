// milestoneCosmetics.ts
// Maps skill milestone IDs → cosmetic rewards, and which avatar-slot options are locked.

export type CosmeticId =
  | 'botanist_hat'
  | 'chef_headband'
  | 'crystal_aura'
  | 'combat_aura'
  | 'gold_shades'
  | 'fishing_visor';

export interface CosmeticDef {
  id:          CosmeticId;
  milestoneId: string;
  label:       string;
  skillLabel:  string;   // e.g. "JARDINERÍA" — shown in the reveal modal
  slot:        'hat' | 'glasses' | 'aura';
  // Avatar config values to apply when equipping this cosmetic
  hatStyle?:      'bucket' | 'headband';
  hatColor?:      number;
  glassesStyle?:  'shades' | 'visor';
  glassesColor?:  number;
  auraEffect?:    'sparkle' | 'stars';
  auraColor?:     number;
  // UI display
  uiColor:     string;  // CSS color for the reveal highlight
  description: string;  // grind reminder shown in locked tooltip
}

export const COSMETIC_DEFS: CosmeticDef[] = [
  {
    id: 'botanist_hat',
    milestoneId: 'gardening_50',
    label: 'Sombrero Botánico',
    skillLabel: 'JARDINERÍA',
    slot: 'hat',
    hatStyle: 'bucket',
    hatColor: 0x4CAF50,
    uiColor: '#4CAF50',
    description: 'Cosecha 50 plantas para desbloquear.',
  },
  {
    id: 'chef_headband',
    milestoneId: 'cooking_50',
    label: 'Banda de Chef',
    skillLabel: 'COOKING',
    slot: 'hat',
    hatStyle: 'headband',
    hatColor: 0xF5C842,
    uiColor: '#F5C842',
    description: 'Completa 50 acciones en el café para desbloquear.',
  },
  {
    id: 'crystal_aura',
    milestoneId: 'mining_200',
    label: 'Aura Cristal',
    skillLabel: 'MINERÍA',
    slot: 'aura',
    auraEffect: 'sparkle',
    auraColor: 0x46B3FF,
    uiColor: '#46B3FF',
    description: 'Recoge 200 nodos de mineral para desbloquear.',
  },
  {
    id: 'combat_aura',
    milestoneId: 'gym_200',
    label: 'Aura de Combate',
    skillLabel: 'GYM',
    slot: 'aura',
    auraEffect: 'stars',
    auraColor: 0xDC2626,
    uiColor: '#DC2626',
    description: 'Completa 200 sesiones de gym para desbloquear.',
  },
  {
    id: 'gold_shades',
    milestoneId: 'weed_200',
    label: 'Lentes Dorados',
    skillLabel: 'WEED',
    slot: 'glasses',
    glassesStyle: 'shades',
    glassesColor: 0xF5C842,
    uiColor: '#F5C842',
    description: 'Cosecha 200 veces cannabis para desbloquear.',
  },
  {
    id: 'fishing_visor',
    milestoneId: 'fishing_200',
    label: 'Visera Pescador',
    skillLabel: 'PESCA',
    slot: 'glasses',
    glassesStyle: 'visor',
    glassesColor: 0x4A9ECC,
    uiColor: '#4A9ECC',
    description: 'Pesca 200 veces para desbloquear.',
  },
];

/** milestone_id → CosmeticDef — O(1) lookup */
export const COSMETIC_BY_MILESTONE: ReadonlyMap<string, CosmeticDef> = new Map(
  COSMETIC_DEFS.map((c) => [c.milestoneId, c]),
);

/** cosmetic_id → CosmeticDef */
export const COSMETIC_BY_ID: ReadonlyMap<string, CosmeticDef> = new Map(
  COSMETIC_DEFS.map((c) => [c.id, c]),
);

/**
 * Which avatar slot options are locked behind a milestone cosmetic.
 * Key: `"${slot}:${value}"` — e.g. "hat:bucket"
 * Value: the cosmetic_id required
 */
export const SLOT_OPTION_LOCKS: ReadonlyMap<string, CosmeticId> = new Map([
  ['hat:bucket',      'botanist_hat'],
  ['hat:headband',    'chef_headband'],
  ['aura:sparkle',    'crystal_aura'],
  ['aura:stars',      'combat_aura'],
  ['glasses:shades',  'gold_shades'],
  ['glasses:visor',   'fishing_visor'],
]);
