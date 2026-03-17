// synergies.ts
// Defines cross-skill synergies for Skill Trees v2.
// Synergies are computed client-side — no extra DB table needed.
// A synergy is active when the player meets ALL requirements.

import type { SkillId } from '../systems/SkillSystem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  color: string;
  requires: SynergyRequirement[];
  effects: SynergyEffect[];
};

// ---------------------------------------------------------------------------
// Synergy catalog — 5 initial synergies
// ---------------------------------------------------------------------------

export const SYNERGY_DEFS: SynergyDef[] = [
  {
    id: 'athletic_miner',
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
        stat: 'speed',
        value: 15,
        description: '+15% velocidad en Bosque de Materiales',
      },
    ],
  },
  {
    id: 'home_garden',
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
        stat: 'cooking',
        value: 10,
        description: '+10 XP extra al cocinar con cosecha propia',
      },
      {
        type: 'access',
        value: 0,
        description: 'Buffs de comida casera duran +30%',
      },
    ],
  },
  {
    id: 'sea_gourmet',
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
        stat: 'cooking',
        value: 15,
        description: '+15 XP al cocinar con pescado propio',
      },
      {
        type: 'access',
        value: 0,
        description: 'Recetas exclusivas de mar disponibles',
      },
    ],
  },
  {
    id: 'hybrid_strain',
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
        type: 'access',
        value: 0,
        description: 'Cepas hibridas disponibles en el farm',
      },
      {
        type: 'xp_bonus',
        stat: 'weed',
        value: 10,
        description: '+10 XP al cultivar cepa cruzada',
      },
    ],
  },
  {
    id: 'machine_body',
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
        type: 'speed_bonus',
        stat: 'speed',
        value: 8,
        description: '+8% velocidad global por dieta de atleta',
      },
      {
        type: 'access',
        value: 0,
        description: 'Buffs de comida aplican a stats de combate',
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
