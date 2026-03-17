// ─────────────────────────────────────────────────────────────────────────────
// Skill Tree System — Waspi World
// ─────────────────────────────────────────────────────────────────────────────

export type SkillId = 'mining' | 'fishing' | 'gardening' | 'cooking' | 'gym' | 'weed';

export type SkillBuff = {
  stat: 'maxHp' | 'speed' | 'damage' | 'extractSpeed' | 'cropSpeed' | 'fishingLuck';
  value: number;
  mode: 'percent' | 'flat';
};

export type SkillUnlock = {
  level: number;
  name: string;
  xpRequired: number;
  description: string;
  type: 'passive' | 'active';
  buffs?: SkillBuff[];
};

export type SkillTreeDef = {
  id: SkillId;
  label: string;
  emoji: string;
  description: string;
  levels: SkillUnlock[];
};

// ─────────────────────────────────────────────────────────────────────────────
// XP Thresholds (cumulative)
// Index = level that was just reached (0 = start, 1 = lv1, …, 4 = lv5)
// ─────────────────────────────────────────────────────────────────────────────
export const SKILL_XP_THRESHOLDS = [0, 100, 300, 700, 1500] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Mining
// ─────────────────────────────────────────────────────────────────────────────
const miningTree: SkillTreeDef = {
  id: 'mining',
  label: 'Mining',
  emoji: '⛏️',
  description: 'Extrae recursos del mundo — piedra, metales y cristales legendarios.',
  levels: [
    {
      level: 1,
      name: 'Minero Novato',
      xpRequired: 0,
      description:
        'Acceso a nodos de piedra y tierra. Extraés 1 recurso por golpe.',
      type: 'passive',
    },
    {
      level: 2,
      name: 'Extractor',
      xpRequired: 100,
      description:
        'Nodos de cobre y hierro desbloqueados. Velocidad de extracción +20%.',
      type: 'passive',
      buffs: [{ stat: 'extractSpeed', value: 20, mode: 'percent' }],
    },
    {
      level: 3,
      name: 'Dinamitero',
      xpRequired: 300,
      description:
        'Ítem Dinamita: destruye nodos instantáneamente y triplica el drop.',
      type: 'active',
    },
    {
      level: 4,
      name: 'Geólogo',
      xpRequired: 700,
      description:
        'Radar de vetas en el minimapa. 15% de probabilidad de drop doble.',
      type: 'passive',
    },
    {
      level: 5,
      name: 'Magnate Minero',
      xpRequired: 1500,
      description:
        'Nodos legendarios (oro, cristal waspi) desbloqueados. Auto-drop cada 10 min en tu parcela.',
      type: 'passive',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Fishing
// ─────────────────────────────────────────────────────────────────────────────
const fishingTree: SkillTreeDef = {
  id: 'fishing',
  label: 'Fishing',
  emoji: '🎣',
  description: 'Pesca desde zonas comunes hasta los mares legendarios de Waspi.',
  levels: [
    {
      level: 1,
      name: 'Pescador Amateur',
      xpRequired: 0,
      description:
        'Caña básica habilitada. Acceso a zonas de pesca comunes.',
      type: 'passive',
    },
    {
      level: 2,
      name: 'Anzuelero',
      xpRequired: 100,
      description:
        'Carnada especial disponible. +25% probabilidad de peces de rareza media.',
      type: 'passive',
      buffs: [{ stat: 'fishingLuck', value: 25, mode: 'percent' }],
    },
    {
      level: 3,
      name: 'Pescador Experto',
      xpRequired: 300,
      description:
        'Zonas restringidas desbloqueadas. Lanzado largo activo para alcanzar spots profundos.',
      type: 'active',
    },
    {
      level: 4,
      name: 'Arponero',
      xpRequired: 700,
      description:
        'Arpón desbloqueado. 10% de probabilidad de pez legendario por sesión.',
      type: 'passive',
    },
    {
      level: 5,
      name: 'Maestro del Mar',
      xpRequired: 1500,
      description:
        'Peces legendarios accesibles. Trampa automática: 1 pez cada 30 min sin necesidad de estar presente.',
      type: 'passive',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Gardening
// ─────────────────────────────────────────────────────────────────────────────
const gardeningTree: SkillTreeDef = {
  id: 'gardening',
  label: 'Gardening',
  emoji: '🌱',
  description: 'Cultivá tu parcela, desde tomates hasta cultivos con efectos místicos.',
  levels: [
    {
      level: 1,
      name: 'Jardinero Principiante',
      xpRequired: 0,
      description:
        'Semillas básicas habilitadas (tomate, lechuga, maíz). Tiempo de cosecha estándar.',
      type: 'passive',
    },
    {
      level: 2,
      name: 'Cultivador',
      xpRequired: 100,
      description:
        'Fertilizante disponible. -30% tiempo de cosecha. Las plantas no se marchitan.',
      type: 'passive',
      buffs: [{ stat: 'cropSpeed', value: 30, mode: 'percent' }],
    },
    {
      level: 3,
      name: 'Agrónomo',
      xpRequired: 300,
      description:
        'Cultivos especiales desbloqueados (especias, hongos, cacao). Riego masivo activo.',
      type: 'active',
    },
    {
      level: 4,
      name: 'Botánico',
      xpRequired: 700,
      description:
        'Plantas con efectos de buff. Cosecha doble por ciclo.',
      type: 'passive',
    },
    {
      level: 5,
      name: 'Maestro Botánico',
      xpRequired: 1500,
      description:
        'Ciclo de jardín automático. 20% de probabilidad de drop de semilla rara.',
      type: 'passive',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Cooking
// ─────────────────────────────────────────────────────────────────────────────
const cookingTree: SkillTreeDef = {
  id: 'cooking',
  label: 'Cooking',
  emoji: '🍳',
  description: 'Preparate recetas que buffean a tu personaje y a jugadores cercanos.',
  levels: [
    {
      level: 1,
      name: 'Cocinero Amateur',
      xpRequired: 0,
      description:
        'Recetas básicas habilitadas (sándwich, mate, café). Consumir otorga +10% buff de HP.',
      type: 'active',
      buffs: [{ stat: 'maxHp', value: 5, mode: 'flat' }],
    },
    {
      level: 2,
      name: 'Sous Chef',
      xpRequired: 100,
      description:
        'Recetas multi-ingrediente. Buff de +15% velocidad durante 5 minutos al consumir.',
      type: 'active',
      buffs: [{ stat: 'speed', value: 15, mode: 'percent' }],
    },
    {
      level: 3,
      name: 'Chef',
      xpRequired: 300,
      description:
        'Recetas secretas desbloqueadas. Plato especial del día: buff poderoso aleatorio 1 vez por día.',
      type: 'active',
    },
    {
      level: 4,
      name: 'Chef Ejecutivo',
      xpRequired: 700,
      description:
        'Vendé comida a jugadores desde tu parcela o el café. Buff de catering grupal.',
      type: 'active',
    },
    {
      level: 5,
      name: 'Maestro Chef',
      xpRequired: 1500,
      description:
        'Recetas legendarias desbloqueadas. Todos los buffs de comida duran el doble.',
      type: 'passive',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Gym
// ─────────────────────────────────────────────────────────────────────────────
const gymTree: SkillTreeDef = {
  id: 'gym',
  label: 'Gym',
  emoji: '🏋️',
  description: 'Entrenamiento físico que mejora HP, velocidad, daño y resistencia.',
  levels: [
    {
      level: 1,
      name: 'Principiante',
      xpRequired: 0,
      description:
        'Máquinas básicas del gym desbloqueadas. +5% HP máximo.',
      type: 'passive',
      buffs: [{ stat: 'maxHp', value: 5, mode: 'percent' }],
    },
    {
      level: 2,
      name: 'Atleta',
      xpRequired: 100,
      description:
        'Rutinas intermedias. +10% velocidad de movimiento y sprint 20% más largo.',
      type: 'passive',
      buffs: [{ stat: 'speed', value: 10, mode: 'percent' }],
    },
    {
      level: 3,
      name: 'Deportista',
      xpRequired: 300,
      description:
        'Entrenamiento de combate. +15% daño físico y knockback reducido.',
      type: 'passive',
      buffs: [{ stat: 'damage', value: 15, mode: 'percent' }],
    },
    {
      level: 4,
      name: 'Competidor',
      xpRequired: 700,
      description:
        'Torneos del gym habilitados. Modo Furia activo: +30% daño durante 10 seg, cooldown 3 min.',
      type: 'active',
    },
    {
      level: 5,
      name: 'Élite',
      xpRequired: 1500,
      description:
        'Stats físicos al máximo. Regeneración de HP en combate. Inmunidad a stun.',
      type: 'passive',
      buffs: [
        { stat: 'maxHp', value: 10, mode: 'percent' },
        { stat: 'speed', value: 5, mode: 'percent' },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Weed
// ─────────────────────────────────────────────────────────────────────────────
const weedTree: SkillTreeDef = {
  id: 'weed',
  label: 'Weed',
  emoji: '🌿',
  description: 'Del consumo casual al control del mercado negro de Waspi.',
  levels: [
    {
      level: 1,
      name: 'Consumidor Casual',
      xpRequired: 0,
      description:
        'Comprá y consumí producto básico. Buff de percepción activo: ves ítems ocultos durante 2 min.',
      type: 'active',
    },
    {
      level: 2,
      name: 'Conocedor',
      xpRequired: 100,
      description:
        'Variedades disponibles (indica / sativa / híbrido), cada una con buff único.',
      type: 'active',
    },
    {
      level: 3,
      name: 'Cultivador',
      xpRequired: 300,
      description:
        'Plantá tus propias variedades en la parcela de la Vecindad. Buff pasivo suave mientras estés abastecido.',
      type: 'passive',
    },
    {
      level: 4,
      name: 'Dealer',
      xpRequired: 700,
      description:
        'Vendé producto a otros jugadores con precios dinámicos según oferta y demanda.',
      type: 'active',
    },
    {
      level: 5,
      name: 'Kingpin',
      xpRequired: 1500,
      description:
        'Monopolio temporal del mercado. Cobrás un 5% de rake sobre todas las transacciones globales de weed.',
      type: 'passive',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Master registry
// ─────────────────────────────────────────────────────────────────────────────
const SKILL_TREE_REGISTRY: Record<SkillId, SkillTreeDef> = {
  mining: miningTree,
  fishing: fishingTree,
  gardening: gardeningTree,
  cooking: cookingTree,
  gym: gymTree,
  weed: weedTree,
};

export const ALL_SKILL_IDS: SkillId[] = [
  'mining',
  'fishing',
  'gardening',
  'cooking',
  'gym',
  'weed',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the skill level (0–5) for a given cumulative XP amount.
 * Level 0 means the skill has been selected but no level has been reached yet.
 * Level 1 is the entry level (0 XP required).
 */
export function getSkillLevel(xp: number): number {
  // Level 1 is always available (xpRequired = 0).
  // We iterate from the highest threshold down to find the current level.
  let level = 0;
  for (let i = 0; i < SKILL_XP_THRESHOLDS.length; i++) {
    if (xp >= SKILL_XP_THRESHOLDS[i]) {
      level = i + 1; // thresholds[0]=0 → lv1, thresholds[4]=1500 → lv5
    }
  }
  return level;
}

/**
 * Returns the cumulative XP required to reach the next level after `currentLevel`.
 * Returns null if the player is already at max level (5).
 */
export function getXpForNextLevel(currentLevel: number): number | null {
  if (currentLevel >= 5) return null;
  // SKILL_XP_THRESHOLDS[i] is the XP to reach level i+1.
  // So to reach level currentLevel+1, we need SKILL_XP_THRESHOLDS[currentLevel].
  return SKILL_XP_THRESHOLDS[currentLevel] as number;
}

/**
 * Returns the full SkillTreeDef for a given SkillId.
 */
export function getSkillDef(id: SkillId): SkillTreeDef {
  return SKILL_TREE_REGISTRY[id];
}
