// synergies.ts
// Defines cross-skill synergies for Skill Trees v2.
// Synergies are computed client-side — no extra DB table needed.
// A synergy is active when the player meets ALL requirements.

import type { SkillId } from '../systems/SkillSystem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SynergyId =
  | 'minero_atletico'
  | 'huerto_propio'
  | 'gourmet_del_mar'
  | 'cepa_cruzada'
  | 'cuerpo_maquina';

export type SynergyEffectType = 'speed_bonus' | 'xp_bonus' | 'quality_bonus' | 'access';

export type SynergyEffect = {
  type: SynergyEffectType;
  stat?: string;       // for speed_bonus: 'speed'; for xp_bonus: skill_id
  value: number;       // percent for bonuses, 0 for access-only
  description: string;
};

export type SynergyRequirement = {
  skillId: SkillId;
  minLevel: number;
};

export type SynergyDef = {
  id: SynergyId;
  name: string;
  tagline: string;
  emoji: string;
  color: string;
  requires: SynergyRequirement[];
  effects: SynergyEffect[];
};

// ---------------------------------------------------------------------------
// Synergy catalog — 5 passive synergies
// ---------------------------------------------------------------------------

export const SYNERGY_DEFS: SynergyDef[] = [
  {
    id: 'minero_atletico',
    name: 'MINERO ATLETICO',
    tagline: 'Fuerza y resistencia al picar',
    emoji: '⛏️',
    color: '#C8A45A',
    requires: [
      { skillId: 'mining', minLevel: 2 },
      { skillId: 'gym',    minLevel: 2 },
    ],
    effects: [
      {
        type: 'speed_bonus',
        stat: 'collect_range',
        value: 15,
        description: '+15% rango de recolección en Bosque',
      },
    ],
  },
  {
    id: 'huerto_propio',
    name: 'HUERTO PROPIO',
    tagline: 'La mejor cocina empieza en tu parcela',
    emoji: '🌿',
    color: '#4CAF50',
    requires: [
      { skillId: 'gardening', minLevel: 2 },
      { skillId: 'cooking',   minLevel: 1 },
    ],
    effects: [
      {
        type: 'xp_bonus',
        stat: 'gardening',
        value: 30,
        description: '+30% XP de jardinería al cosechar',
      },
    ],
  },
  {
    id: 'gourmet_del_mar',
    name: 'GOURMET DEL MAR',
    tagline: 'Del agua al plato sin intermediarios',
    emoji: '🎣',
    color: '#4A9ECC',
    requires: [
      { skillId: 'fishing', minLevel: 2 },
      { skillId: 'cooking', minLevel: 2 },
    ],
    effects: [
      {
        type: 'xp_bonus',
        stat: 'fishing',
        value: 25,
        description: '+25% XP al pescar',
      },
    ],
  },
  {
    id: 'cepa_cruzada',
    name: 'CEPA CRUZADA',
    tagline: 'Lo mejor de dos mundos botanicos',
    emoji: '🌱',
    color: '#66BB6A',
    requires: [
      { skillId: 'weed',      minLevel: 3 },
      { skillId: 'gardening', minLevel: 3 },
    ],
    effects: [
      {
        type: 'xp_bonus',
        stat: 'weed',
        value: 0,
        description: 'XP base del puesto: 8→12 (16→20 con dealer)',
      },
    ],
  },
  {
    id: 'cuerpo_maquina',
    name: 'CUERPO MAQUINA',
    tagline: 'El gym potencia todo lo que comes',
    emoji: '💪',
    color: '#EF5350',
    requires: [
      { skillId: 'gym',     minLevel: 3 },
      { skillId: 'cooking', minLevel: 2 },
    ],
    effects: [
      {
        type: 'access',
        value: 3,
        description: 'Furia dura +3s (10s→13s)',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getSynergyDef(id: string): SynergyDef | undefined {
  return SYNERGY_DEFS.find((s) => s.id === id);
}
