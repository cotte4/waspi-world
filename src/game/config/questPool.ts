// questPool.ts
// Daily quest pool definitions and deterministic daily generation.
// All players share the same 3 quests per calendar day (UTC).

export type SkillId = 'mining' | 'fishing' | 'gardening' | 'cooking' | 'gym' | 'weed';

export type QuestTemplate = {
  skillId: SkillId;
  actionType: string;   // matches the 'source' used in addXp / trackAction
  targetMin: number;
  targetMax: number;
  xpPerTarget: number;
  tenksPerTarget: number;
  label: string;        // "{target}" is replaced with the actual target value
  icon: string;
};

// ---------------------------------------------------------------------------
// Quest pool — 18 templates across 6 skills
// ---------------------------------------------------------------------------

export const QUEST_POOL: QuestTemplate[] = [
  // Mining (3)
  {
    skillId: 'mining',
    actionType: 'node_collect',
    targetMin: 3, targetMax: 6,
    xpPerTarget: 6, tenksPerTarget: 30,
    label: 'Recolectá {target} materiales en el bosque',
    icon: '⛏️',
  },
  {
    skillId: 'mining',
    actionType: 'node_collect',
    targetMin: 5, targetMax: 8,
    xpPerTarget: 7, tenksPerTarget: 35,
    label: 'Extraé {target} nodos del bosque',
    icon: '🪨',
  },
  {
    skillId: 'mining',
    actionType: 'node_collect',
    targetMin: 4, targetMax: 7,
    xpPerTarget: 6, tenksPerTarget: 28,
    label: 'Minería: {target} materiales hoy',
    icon: '⛏️',
  },

  // Fishing (3)
  {
    skillId: 'fishing',
    actionType: 'fish_catch',
    targetMin: 2, targetMax: 4,
    xpPerTarget: 8, tenksPerTarget: 40,
    label: 'Pescá {target} peces en el estanque',
    icon: '🎣',
  },
  {
    skillId: 'fishing',
    actionType: 'fish_catch',
    targetMin: 3, targetMax: 5,
    xpPerTarget: 9, tenksPerTarget: 45,
    label: 'Atrapá {target} peces hoy',
    icon: '🐟',
  },
  {
    skillId: 'fishing',
    actionType: 'fish_catch',
    targetMin: 2, targetMax: 3,
    xpPerTarget: 10, tenksPerTarget: 50,
    label: 'Pesca profunda: {target} capturas',
    icon: '🌊',
  },

  // Gardening (3)
  {
    skillId: 'gardening',
    actionType: 'farm_harvest',
    targetMin: 1, targetMax: 3,
    xpPerTarget: 10, tenksPerTarget: 50,
    label: 'Cosechá {target} plantas en tu granja',
    icon: '🌿',
  },
  {
    skillId: 'gardening',
    actionType: 'farm_harvest',
    targetMin: 2, targetMax: 3,
    xpPerTarget: 9, tenksPerTarget: 45,
    label: 'Recolectá {target} cosechas hoy',
    icon: '🌱',
  },
  {
    skillId: 'gardening',
    actionType: 'communal_tend',
    targetMin: 1, targetMax: 2,
    xpPerTarget: 12, tenksPerTarget: 60,
    label: 'Cuidá {target} plantas del jardín comunal',
    icon: '🏡',
  },

  // Weed (3)
  {
    skillId: 'weed',
    actionType: 'farm_harvest',
    targetMin: 1, targetMax: 2,
    xpPerTarget: 15, tenksPerTarget: 75,
    label: 'Cosechá {target} plantas de cannabis',
    icon: '🌿',
  },
  {
    skillId: 'weed',
    actionType: 'farm_harvest',
    targetMin: 2, targetMax: 3,
    xpPerTarget: 12, tenksPerTarget: 60,
    label: 'Producí {target} cosechas de weed hoy',
    icon: '💨',
  },
  {
    skillId: 'weed',
    actionType: 'farm_harvest',
    targetMin: 1, targetMax: 3,
    xpPerTarget: 14, tenksPerTarget: 70,
    label: 'Cultivá {target} lotes en tu granja',
    icon: '🌿',
  },

  // Gym / Zombies (3)
  {
    skillId: 'gym',
    actionType: 'zombie_kill',
    targetMin: 5, targetMax: 12,
    xpPerTarget: 3, tenksPerTarget: 15,
    label: 'Eliminá {target} zombies en la arena',
    icon: '🧟',
  },
  {
    skillId: 'gym',
    actionType: 'zombie_kill',
    targetMin: 8, targetMax: 15,
    xpPerTarget: 4, tenksPerTarget: 18,
    label: 'Sobrevivé y matá {target} zombies hoy',
    icon: '💪',
  },
  {
    skillId: 'gym',
    actionType: 'zombie_kill',
    targetMin: 10, targetMax: 20,
    xpPerTarget: 3, tenksPerTarget: 16,
    label: 'Arena: {target} bajas de zombies',
    icon: '🔫',
  },

  // Cooking (3)
  {
    skillId: 'cooking',
    actionType: 'plato_del_dia',
    targetMin: 1, targetMax: 1,
    xpPerTarget: 40, tenksPerTarget: 200,
    label: 'Preparate el plato del día',
    icon: '🍳',
  },
  {
    skillId: 'cooking',
    actionType: 'plato_del_dia',
    targetMin: 1, targetMax: 1,
    xpPerTarget: 35, tenksPerTarget: 175,
    label: 'Cocinás algo especial hoy: {target} plato',
    icon: '🥘',
  },
  {
    skillId: 'cooking',
    actionType: 'plato_del_dia',
    targetMin: 1, targetMax: 1,
    xpPerTarget: 38, tenksPerTarget: 190,
    label: 'Chef del día: preparar {target} receta',
    icon: '👨‍🍳',
  },
];

// ---------------------------------------------------------------------------
// Seeded pseudo-random number generator (deterministic by seed)
// ---------------------------------------------------------------------------

function seededRng(seed: number) {
  let s = seed;
  return function next(): number {
    // xorshift32
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function dateToSeed(date: string): number {
  // date = 'YYYY-MM-DD'
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    const c = date.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return hash === 0 ? 1 : Math.abs(hash);
}

// ---------------------------------------------------------------------------
// generateDailyQuests — picks 3 templates deterministically for a given date
// One quest per skill group (mining, fishing, gardening/weed, gym, cooking)
// to ensure variety. Picks 3 of the 6 skill groups each day.
// ---------------------------------------------------------------------------

type SkillGroup = {
  skillId: SkillId;
  templates: QuestTemplate[];
};

const SKILL_GROUPS: SkillGroup[] = [
  { skillId: 'mining',    templates: QUEST_POOL.filter((q) => q.skillId === 'mining') },
  { skillId: 'fishing',   templates: QUEST_POOL.filter((q) => q.skillId === 'fishing') },
  { skillId: 'gardening', templates: QUEST_POOL.filter((q) => q.skillId === 'gardening') },
  { skillId: 'weed',      templates: QUEST_POOL.filter((q) => q.skillId === 'weed') },
  { skillId: 'gym',       templates: QUEST_POOL.filter((q) => q.skillId === 'gym') },
  { skillId: 'cooking',   templates: QUEST_POOL.filter((q) => q.skillId === 'cooking') },
];

export type GeneratedQuest = {
  skillId: SkillId;
  actionType: string;
  target: number;
  rewardXp: number;
  rewardTenks: number;
  label: string;
  icon: string;
};

export function generateDailyQuests(date: string): GeneratedQuest[] {
  const seed = dateToSeed(date);
  const rng = seededRng(seed);

  // Shuffle group order using Fisher-Yates with the seeded rng
  const groupIndices = [0, 1, 2, 3, 4, 5];
  for (let i = groupIndices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [groupIndices[i], groupIndices[j]] = [groupIndices[j], groupIndices[i]];
  }

  // Pick the first 3 groups
  const selectedGroups = groupIndices.slice(0, 3).map((idx) => SKILL_GROUPS[idx]);

  return selectedGroups.map((group): GeneratedQuest => {
    // Pick a template from the group
    const tplIdx = Math.floor(rng() * group.templates.length);
    const tpl = group.templates[tplIdx];

    // Pick a target within [targetMin, targetMax]
    const range = tpl.targetMax - tpl.targetMin;
    const target = tpl.targetMin + Math.floor(rng() * (range + 1));

    const rewardXp = tpl.xpPerTarget * target;
    const rewardTenks = tpl.tenksPerTarget * target;
    const label = tpl.label.replace('{target}', String(target));

    return {
      skillId: tpl.skillId,
      actionType: tpl.actionType,
      target,
      rewardXp,
      rewardTenks,
      label,
      icon: tpl.icon,
    };
  });
}
