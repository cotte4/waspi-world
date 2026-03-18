// masteryTrees.ts
// Define los árboles de maestría post-Lv5 para cada skill.
// 5 nodos por skill en forma de árbol: 1 root → 2 tier2 → 2 tier3.

import type { SkillId } from '../systems/SkillSystem';

export type MasteryNodeEffect = {
  stat: string;   // e.g. 'extractSpeed', 'fishingLuck', 'xpBonus', 'cropSpeed', 'speed', 'damage', 'maxHp'
  value: number;
  mode: 'percent' | 'flat';
};

export type MasteryNodeDef = {
  id: string;                 // e.g. 'mining_m1'
  skillId: SkillId;
  tier: 1 | 2 | 3;
  requires: string[];         // node ids que deben estar desbloqueados primero
  name: string;
  description: string;
  cost: number;               // MP cost (always 1 for now)
  effect: MasteryNodeEffect;
};

export type MasteryTreeDef = {
  skillId: SkillId;
  nodes: MasteryNodeDef[];
};

// ── Mining ──────────────────────────────────────────────────────────────────
const miningTree: MasteryTreeDef = {
  skillId: 'mining',
  nodes: [
    { id: 'mining_m1', skillId: 'mining', tier: 1, requires: [], cost: 1,
      name: 'VETA RICA',         description: '+15% velocidad de extracción',
      effect: { stat: 'extractSpeed', value: 15, mode: 'percent' } },
    { id: 'mining_m2a', skillId: 'mining', tier: 2, requires: ['mining_m1'], cost: 1,
      name: 'EXPLOSIVO',         description: '+20% XP de minería',
      effect: { stat: 'xpBonus', value: 20, mode: 'percent' } },
    { id: 'mining_m2b', skillId: 'mining', tier: 2, requires: ['mining_m1'], cost: 1,
      name: 'GEÓLOGO',           description: '+10% velocidad de movimiento en Bosque',
      effect: { stat: 'speed', value: 10, mode: 'percent' } },
    { id: 'mining_m3a', skillId: 'mining', tier: 3, requires: ['mining_m2a'], cost: 1,
      name: 'DEMOLEDOR',         description: '+25% extractSpeed total',
      effect: { stat: 'extractSpeed', value: 25, mode: 'percent' } },
    { id: 'mining_m3b', skillId: 'mining', tier: 3, requires: ['mining_m2b'], cost: 1,
      name: 'MAESTRO VETA',      description: '+15% velocidad global',
      effect: { stat: 'speed', value: 15, mode: 'percent' } },
  ],
};

// ── Fishing ─────────────────────────────────────────────────────────────────
const fishingTree: MasteryTreeDef = {
  skillId: 'fishing',
  nodes: [
    { id: 'fishing_m1', skillId: 'fishing', tier: 1, requires: [], cost: 1,
      name: 'OJO DE PESCADOR',   description: '+20% suerte de pesca',
      effect: { stat: 'fishingLuck', value: 20, mode: 'percent' } },
    { id: 'fishing_m2a', skillId: 'fishing', tier: 2, requires: ['fishing_m1'], cost: 1,
      name: 'CEBO MAESTRO',      description: '+25% XP de pesca',
      effect: { stat: 'xpBonus', value: 25, mode: 'percent' } },
    { id: 'fishing_m2b', skillId: 'fishing', tier: 2, requires: ['fishing_m1'], cost: 1,
      name: 'TRAMPA DE RED',     description: '+15% suerte de pesca adicional',
      effect: { stat: 'fishingLuck', value: 15, mode: 'percent' } },
    { id: 'fishing_m3a', skillId: 'fishing', tier: 3, requires: ['fishing_m2a'], cost: 1,
      name: 'PESCA PROFUNDA',    description: '+30% chance de calidad rara+',
      effect: { stat: 'fishingLuck', value: 30, mode: 'percent' } },
    { id: 'fishing_m3b', skillId: 'fishing', tier: 3, requires: ['fishing_m2b'], cost: 1,
      name: 'MAESTRO ANZUELO',   description: '+10% velocidad global',
      effect: { stat: 'speed', value: 10, mode: 'percent' } },
  ],
};

// ── Gardening ───────────────────────────────────────────────────────────────
const gardeningTree: MasteryTreeDef = {
  skillId: 'gardening',
  nodes: [
    { id: 'gardening_m1', skillId: 'gardening', tier: 1, requires: [], cost: 1,
      name: 'TIERRA FÉRTIL',     description: '+20% velocidad de cultivo',
      effect: { stat: 'cropSpeed', value: 20, mode: 'percent' } },
    { id: 'gardening_m2a', skillId: 'gardening', tier: 2, requires: ['gardening_m1'], cost: 1,
      name: 'SEMILLA ESPECIAL',  description: '+25% XP de jardinería',
      effect: { stat: 'xpBonus', value: 25, mode: 'percent' } },
    { id: 'gardening_m2b', skillId: 'gardening', tier: 2, requires: ['gardening_m1'], cost: 1,
      name: 'RIEGO EFICIENTE',   description: '+15% cropSpeed adicional',
      effect: { stat: 'cropSpeed', value: 15, mode: 'percent' } },
    { id: 'gardening_m3a', skillId: 'gardening', tier: 3, requires: ['gardening_m2a'], cost: 1,
      name: 'COSECHA DOBLE',     description: '+20% velocidad global',
      effect: { stat: 'speed', value: 20, mode: 'percent' } },
    { id: 'gardening_m3b', skillId: 'gardening', tier: 3, requires: ['gardening_m2b'], cost: 1,
      name: 'MAESTRO BOTANICO',  description: '+30% cropSpeed total',
      effect: { stat: 'cropSpeed', value: 30, mode: 'percent' } },
  ],
};

// ── Cooking ─────────────────────────────────────────────────────────────────
const cookingTree: MasteryTreeDef = {
  skillId: 'cooking',
  nodes: [
    { id: 'cooking_m1', skillId: 'cooking', tier: 1, requires: [], cost: 1,
      name: 'SAZÓN MAESTRO',     description: '+10 HP máximo',
      effect: { stat: 'maxHp', value: 10, mode: 'flat' } },
    { id: 'cooking_m2a', skillId: 'cooking', tier: 2, requires: ['cooking_m1'], cost: 1,
      name: 'RECETA SECRETA',    description: '+30% XP de cocina',
      effect: { stat: 'xpBonus', value: 30, mode: 'percent' } },
    { id: 'cooking_m2b', skillId: 'cooking', tier: 2, requires: ['cooking_m1'], cost: 1,
      name: 'CHEF ATLETA',       description: '+15% velocidad global',
      effect: { stat: 'speed', value: 15, mode: 'percent' } },
    { id: 'cooking_m3a', skillId: 'cooking', tier: 3, requires: ['cooking_m2a'], cost: 1,
      name: 'PLATO LEGENDARIO',  description: '+15 HP máximo adicional',
      effect: { stat: 'maxHp', value: 15, mode: 'flat' } },
    { id: 'cooking_m3b', skillId: 'cooking', tier: 3, requires: ['cooking_m2b'], cost: 1,
      name: 'MAESTRO CHEF',      description: '+20% velocidad global',
      effect: { stat: 'speed', value: 20, mode: 'percent' } },
  ],
};

// ── Gym ─────────────────────────────────────────────────────────────────────
const gymTree: MasteryTreeDef = {
  skillId: 'gym',
  nodes: [
    { id: 'gym_m1', skillId: 'gym', tier: 1, requires: [], cost: 1,
      name: 'CUERPO DE ACERO',   description: '+15% HP máximo',
      effect: { stat: 'maxHp', value: 15, mode: 'percent' } },
    { id: 'gym_m2a', skillId: 'gym', tier: 2, requires: ['gym_m1'], cost: 1,
      name: 'FUERZA BRUTA',      description: '+20% daño',
      effect: { stat: 'damage', value: 20, mode: 'percent' } },
    { id: 'gym_m2b', skillId: 'gym', tier: 2, requires: ['gym_m1'], cost: 1,
      name: 'VELOCIDAD PURA',    description: '+20% velocidad global',
      effect: { stat: 'speed', value: 20, mode: 'percent' } },
    { id: 'gym_m3a', skillId: 'gym', tier: 3, requires: ['gym_m2a'], cost: 1,
      name: 'GOLPE DEVASTADOR',  description: '+30% daño total',
      effect: { stat: 'damage', value: 30, mode: 'percent' } },
    { id: 'gym_m3b', skillId: 'gym', tier: 3, requires: ['gym_m2b'], cost: 1,
      name: 'ATLETA LEGENDARIO', description: '+25% velocidad global',
      effect: { stat: 'speed', value: 25, mode: 'percent' } },
  ],
};

// ── Weed ────────────────────────────────────────────────────────────────────
const weedTree: MasteryTreeDef = {
  skillId: 'weed',
  nodes: [
    { id: 'weed_m1', skillId: 'weed', tier: 1, requires: [], cost: 1,
      name: 'CEPA PREMIUM',      description: '+25% XP de weed',
      effect: { stat: 'xpBonus', value: 25, mode: 'percent' } },
    { id: 'weed_m2a', skillId: 'weed', tier: 2, requires: ['weed_m1'], cost: 1,
      name: 'CULTIVO RÁPIDO',    description: '+20% velocidad de cultivo',
      effect: { stat: 'cropSpeed', value: 20, mode: 'percent' } },
    { id: 'weed_m2b', skillId: 'weed', tier: 2, requires: ['weed_m1'], cost: 1,
      name: 'TERPENOS RAROS',    description: '+30% XP de weed adicional',
      effect: { stat: 'xpBonus', value: 30, mode: 'percent' } },
    { id: 'weed_m3a', skillId: 'weed', tier: 3, requires: ['weed_m2a'], cost: 1,
      name: 'MAESTRA RAÍZ',      description: '+25% cropSpeed total',
      effect: { stat: 'cropSpeed', value: 25, mode: 'percent' } },
    { id: 'weed_m3b', skillId: 'weed', tier: 3, requires: ['weed_m2b'], cost: 1,
      name: 'CULTIVAR LEYENDA',  description: '+15% velocidad global',
      effect: { stat: 'speed', value: 15, mode: 'percent' } },
  ],
};

// ── Catalog ─────────────────────────────────────────────────────────────────

export const MASTERY_TREES: MasteryTreeDef[] = [
  miningTree, fishingTree, gardeningTree, cookingTree, gymTree, weedTree,
];

export function getMasteryTree(skillId: SkillId): MasteryTreeDef | undefined {
  return MASTERY_TREES.find((t) => t.skillId === skillId);
}

export function getMasteryNode(nodeId: string): MasteryNodeDef | undefined {
  for (const tree of MASTERY_TREES) {
    const node = tree.nodes.find((n) => n.id === nodeId);
    if (node) return node;
  }
  return undefined;
}
