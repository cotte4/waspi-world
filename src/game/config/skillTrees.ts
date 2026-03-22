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

export type MilestoneDef = {
  id: string;        // unique, e.g. 'mining_10'
  count: number;     // action_count threshold to unlock
  name: string;      // short display name
  reward: string;    // human-readable reward description
  rewardType: 'title' | 'stat' | 'cosmetic';
};

export type SkillTreeDef = {
  id: SkillId;
  label: string;
  emoji: string;
  description: string;
  levels: SkillUnlock[];
  milestones: MilestoneDef[];
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
  milestones: [
    { id: 'mining_10',  count: 10,  name: 'Minero Veterano',     reward: 'Título desbloqueado',          rewardType: 'title'    },
    { id: 'mining_50',  count: 50,  name: 'Veta de Hierro',      reward: '+3 XP extra por golpe',        rewardType: 'stat'     },
    { id: 'mining_200', count: 200, name: 'Cristal Waspi',       reward: 'Aura de cristal (cosmético)',  rewardType: 'cosmetic' },
  ],
  levels: [
    {
      level: 1,
      name: 'Minero Novato',
      xpRequired: 0,
      description:
        'Buscá nodos brillantes en el mapa y presioná SPACE. En el minijuego, frenate en la zona DORADA para máximo drop y XP.',
      type: 'passive',
    },
    {
      level: 2,
      name: 'Extractor',
      xpRequired: 100,
      description:
        'Nodos de cobre y hierro desbloqueados. +20% velocidad de extracción (el cursor va más lento).',
      type: 'passive',
      buffs: [{ stat: 'extractSpeed', value: 20, mode: 'percent' }],
    },
    {
      level: 3,
      name: 'Dinamitero',
      xpRequired: 300,
      description:
        'Ítem Dinamita disponible en el inventario: destruye nodos al instante y triplica el drop sin minijuego.',
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
  milestones: [
    { id: 'fishing_10',  count: 10,  name: 'Pescador Regular',  reward: 'Título desbloqueado',                rewardType: 'title'    },
    { id: 'fishing_50',  count: 50,  name: 'Caña de Plata',     reward: '+10% suerte de pesca extra',         rewardType: 'stat'     },
    { id: 'fishing_200', count: 200, name: 'Maestro del Anzuelo', reward: 'Traje de pescador (cosmético)',   rewardType: 'cosmetic' },
  ],
  levels: [
    {
      level: 1,
      name: 'Pescador Amateur',
      xpRequired: 0,
      description:
        'Acercate a una zona de agua y presioná SPACE para lanzar. Esperá a que muerda y reaccioná a tiempo. Cada pesca = XP.',
      type: 'passive',
    },
    {
      level: 2,
      name: 'Anzuelero',
      xpRequired: 100,
      description:
        'Carnada especial disponible en el inventario. +25% probabilidad de peces de rareza media y superior.',
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
  milestones: [
    { id: 'gardening_5',  count: 5,  name: 'Amante del Bosque',  reward: 'Título desbloqueado',             rewardType: 'title'    },
    { id: 'gardening_20', count: 20, name: 'Manos Verdes',       reward: '+5% velocidad de cosecha extra',  rewardType: 'stat'     },
    { id: 'gardening_50', count: 50, name: 'Árbol de la Vida',   reward: 'Sombrero de botánico (cosmético)', rewardType: 'cosmetic' },
  ],
  levels: [
    {
      level: 1,
      name: 'Jardinero Principiante',
      xpRequired: 0,
      description:
        'Comprá semillas (tomate, lechuga, maíz) y plantalas en tu parcela. Regá y cosechá para ganar XP.',
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
  milestones: [
    { id: 'cooking_5',  count: 5,  name: 'Amante del Café',  reward: 'Título desbloqueado',           rewardType: 'title'    },
    { id: 'cooking_20', count: 20, name: 'Receta Secreta',   reward: '+5 HP extra al consumir comida', rewardType: 'stat'     },
    { id: 'cooking_50', count: 50, name: 'Chef del Barrio',  reward: 'Delantal dorado (cosmético)',    rewardType: 'cosmetic' },
  ],
  levels: [
    {
      level: 1,
      name: 'Cocinero Amateur',
      xpRequired: 0,
      description:
        'Usá la cocina del Café o de tu parcela. Combiná ingredientes para preparar recetas y ganar XP. Consumir da +10% HP.',
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
  milestones: [
    { id: 'gym_10',  count: 10,  name: 'Primera Sangre',   reward: 'Título desbloqueado',        rewardType: 'title'    },
    { id: 'gym_50',  count: 50,  name: 'Ironclad',         reward: '+5 HP máximo permanente',    rewardType: 'stat'     },
    { id: 'gym_200', count: 200, name: 'Modo Berserker',   reward: 'Aura de combate (cosmético)', rewardType: 'cosmetic' },
  ],
  levels: [
    {
      level: 1,
      name: 'Principiante',
      xpRequired: 0,
      description:
        'Entrá al Gym (zona norte) y usá las máquinas. Cada sesión de entrenamiento da XP. +5% HP máximo.',
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
  milestones: [
    { id: 'weed_10',  count: 10,  name: 'Fumón Regular',   reward: 'Título desbloqueado',             rewardType: 'title'    },
    { id: 'weed_50',  count: 50,  name: 'Proveedor',       reward: 'Slot extra de trade',             rewardType: 'stat'     },
    { id: 'weed_200', count: 200, name: 'Cartel de Waspi', reward: 'Lentes de sol dorados (cosmético)', rewardType: 'cosmetic' },
  ],
  levels: [
    {
      level: 1,
      name: 'Consumidor Casual',
      xpRequired: 0,
      description:
        'Comprá producto en el barrio y consumilo. Ganas XP al consumir. Buff de percepción: ves ítems ocultos 2 min.',
      type: 'active',
    },
    {
      level: 2,
      name: 'Conocedor',
      xpRequired: 100,
      description:
        'Acceso a 3 variedades (Sativa Verde, Indica Oscura, Híbrida Dorada) con buffs únicos cada una.',
      type: 'active',
    },
    {
      level: 3,
      name: 'Cultivador',
      xpRequired: 300,
      description:
        'Desbloqueás el sistema de delivery: entregá producto a dealers en la Vecindad por TENKS y XP.',
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
