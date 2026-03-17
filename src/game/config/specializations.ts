// specializations.ts
// Defines the two-branch specialization system for each skill tree.
// Each skill unlocks two mutually exclusive specializations at Lv3.
// This file is client-safe — used by UI, game scenes, and config reads.

import type { SkillId } from '../systems/SkillSystem';
import type { QualityTier } from './qualityTiers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpecId =
  | 'mining_extractor'    | 'mining_prospector'
  | 'gardening_botanist'  | 'gardening_cultivator'
  | 'weed_grower'         | 'weed_dealer'
  | 'fishing_baitmaster'  | 'fishing_hunter'
  | 'cooking_neighborhood'| 'cooking_alchemist'
  | 'gym_athlete'         | 'gym_fighter';

export type SpecEffectType = 'quality_shift' | 'xp_bonus' | 'speed_bonus' | 'access';

export type SpecEffect = {
  type: SpecEffectType;
  value: number | string;
  description: string;
};

export type SpecDef = {
  id: SpecId;
  skillId: SkillId;
  branch: 'A' | 'B';
  name: string;
  tagline: string;   // one-line description for the UI
  color: string;     // hex accent color
  effects: SpecEffect[];
};

// Suppress unused import warning — QualityTier is reserved for future typed effects
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _QualityTierRef = QualityTier;

// ---------------------------------------------------------------------------
// Spec definitions
// ---------------------------------------------------------------------------

export const SPEC_DEFS: SpecDef[] = [
  // ── Mining ──────────────────────────────────────────────────────────────
  {
    id: 'mining_extractor', skillId: 'mining', branch: 'A',
    name: 'EXTRACTOR', tagline: 'Volumen y velocidad sobre rareza',
    color: '#C8A45A',
    effects: [
      { type: 'xp_bonus',    value: 5,  description: '+5 XP por nodo recolectado' },
      { type: 'speed_bonus', value: 15, description: '-15% cooldown de nodos' },
    ],
  },
  {
    id: 'mining_prospector', skillId: 'mining', branch: 'B',
    name: 'PROSPECTOR', tagline: 'Rareza y calidad sobre volumen',
    color: '#FFD700',
    effects: [
      { type: 'quality_shift', value: 1, description: '+1 tier de calidad en rolls de mining' },
    ],
  },

  // ── Gardening ────────────────────────────────────────────────────────────
  {
    id: 'gardening_botanist', skillId: 'gardening', branch: 'A',
    name: 'BOTANICO', tagline: 'Frutas y verduras con buffs de cocina',
    color: '#4CAF50',
    effects: [
      { type: 'xp_bonus', value: 5,                description: '+5 XP al cosechar frutos no-cannabis' },
      { type: 'access',   value: 'cooking_synergy', description: 'Buffs de comida propia duran +30%' },
    ],
  },
  {
    id: 'gardening_cultivator', skillId: 'gardening', branch: 'B',
    name: 'CULTIVADOR', tagline: 'Cannabis de alta calidad',
    color: '#39FF14',
    effects: [
      { type: 'quality_shift', value: 1, description: '+1 tier en cosechas de cannabis' },
    ],
  },

  // ── Weed ─────────────────────────────────────────────────────────────────
  {
    id: 'weed_grower', skillId: 'weed', branch: 'A',
    name: 'GROWER', tagline: 'Produccion maxima de cepa',
    color: '#66BB6A',
    effects: [
      { type: 'quality_shift', value: 1, description: '+1 tier de calidad en weed harvests' },
      { type: 'xp_bonus',      value: 5, description: '+5 XP al cultivar' },
    ],
  },
  {
    id: 'weed_dealer', skillId: 'weed', branch: 'B',
    name: 'DEALER', tagline: 'Precios dinamicos y red de clientes',
    color: '#FF6B35',
    effects: [
      { type: 'access',   value: 'dynamic_pricing', description: 'Precios de venta varían +/-20% segun mercado' },
      { type: 'xp_bonus', value: 8,                 description: '+8 XP al vender' },
    ],
  },

  // ── Fishing ──────────────────────────────────────────────────────────────
  {
    id: 'fishing_baitmaster', skillId: 'fishing', branch: 'A',
    name: 'BATEADOR', tagline: 'Cantidad y zonas amplias',
    color: '#4A9ECC',
    effects: [
      { type: 'xp_bonus',    value: 5,  description: '+5 XP por pesca' },
      { type: 'speed_bonus', value: 20, description: '+20% velocidad de pesca' },
    ],
  },
  {
    id: 'fishing_hunter', skillId: 'fishing', branch: 'B',
    name: 'CAZADOR', tagline: 'Peces raros y trofeos',
    color: '#1565C0',
    effects: [
      { type: 'quality_shift', value: 1, description: '+1 tier de calidad en pesca' },
    ],
  },

  // ── Cooking ──────────────────────────────────────────────────────────────
  {
    id: 'cooking_neighborhood', skillId: 'cooking', branch: 'A',
    name: 'CHEF DE BARRIO', tagline: 'Buffs grupales y platos del dia',
    color: '#FF7043',
    effects: [
      { type: 'access',   value: 'group_buffs', description: 'Buffs de comida aplican a jugadores cercanos' },
      { type: 'xp_bonus', value: 5,             description: '+5 XP al cocinar para otros' },
    ],
  },
  {
    id: 'cooking_alchemist', skillId: 'cooking', branch: 'B',
    name: 'ALQUIMISTA', tagline: 'Buffs raros de larga duracion',
    color: '#AB47BC',
    effects: [
      { type: 'quality_shift', value: 1,              description: '+1 tier en recetas especiales' },
      { type: 'access',        value: 'rare_recipes',  description: 'Acceso a recetas secretas' },
    ],
  },

  // ── Gym ──────────────────────────────────────────────────────────────────
  {
    id: 'gym_athlete', skillId: 'gym', branch: 'A',
    name: 'ATLETA', tagline: 'Speed, sprint y resistencia',
    color: '#EF5350',
    effects: [
      { type: 'speed_bonus', value: 10, description: '+10% velocidad de movimiento adicional' },
      { type: 'xp_bonus',    value: 5,  description: '+5 XP en sesiones de gym' },
    ],
  },
  {
    id: 'gym_fighter', skillId: 'gym', branch: 'B',
    name: 'PELEADOR', tagline: 'Dano, stun y ventaja en PvP',
    color: '#B71C1C',
    effects: [
      { type: 'access',   value: 'combat_bonus', description: '+15% daño en PvP y PvE' },
      { type: 'xp_bonus', value: 5,              description: '+5 XP en combate' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getSpecDef(specId: SpecId): SpecDef | undefined {
  return SPEC_DEFS.find((s) => s.id === specId);
}

/**
 * Returns exactly [branchA, branchB] for the given skill.
 * Both entries are guaranteed to exist by the SPEC_DEFS definition above.
 */
export function getSpecsForSkill(skillId: SkillId): [SpecDef, SpecDef] {
  const specs = SPEC_DEFS.filter((s) => s.skillId === skillId);
  return [
    specs.find((s) => s.branch === 'A')!,
    specs.find((s) => s.branch === 'B')!,
  ];
}

export const ALL_SPEC_IDS: SpecId[] = SPEC_DEFS.map((s) => s.id);
