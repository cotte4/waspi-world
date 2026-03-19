// fishSpecies.ts
// Master list of 12 collectible fish species for the Fish Compendium (Acuario).

export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type FishZone   = 'pond' | 'deep' | 'river';

export type FishSpecies = {
  id: string;
  name: string;
  emoji: string;
  rarity: FishRarity;
  zone: FishZone;
  description: string;
  /** XP bonus awarded server-side on first catch of this species. */
  baseXp: number;
};

export const FISH_SPECIES: FishSpecies[] = [
  // ── pond (common zone, no level requirement) ────────────────────────────
  { id: 'carpa',     name: 'CARPA',    emoji: '🐟', rarity: 'common',    zone: 'pond',  description: 'El clásico del estanque',      baseXp: 10  },
  { id: 'trucha',    name: 'TRUCHA',   emoji: '🐠', rarity: 'common',    zone: 'pond',  description: 'Rápida pero predecible',       baseXp: 10  },
  { id: 'bagre',     name: 'BAGRE',    emoji: '🐡', rarity: 'uncommon',  zone: 'pond',  description: 'Fondo del estanque',           baseXp: 20  },
  { id: 'anguila',   name: 'ANGUILA',  emoji: '🐍', rarity: 'uncommon',  zone: 'pond',  description: 'Escurridiza. Cuidado.',        baseXp: 20  },
  // ── deep (requires Fishing Lv3) ──────────────────────────────────────────
  { id: 'salmon',    name: 'SALMON',   emoji: '🐟', rarity: 'uncommon',  zone: 'deep',  description: 'Aguas profundas, gran lucha',  baseXp: 30  },
  { id: 'lucio',     name: 'LUCIO',    emoji: '🦈', rarity: 'rare',      zone: 'deep',  description: 'Depredador de las profundidades', baseXp: 50 },
  { id: 'dorado',    name: 'DORADO',   emoji: '✨', rarity: 'rare',      zone: 'deep',  description: 'Brilla en el agua oscura',     baseXp: 50  },
  { id: 'mojarron',  name: 'MOJARRON', emoji: '🐠', rarity: 'common',    zone: 'deep',  description: 'Abundante en profundidad',     baseXp: 25  },
  // ── river (future zone) ──────────────────────────────────────────────────
  { id: 'pejerrey',  name: 'PEJERREY', emoji: '🐟', rarity: 'uncommon',  zone: 'river', description: 'Delicado y veloz',             baseXp: 35  },
  { id: 'surubi',    name: 'SURUBÍ',   emoji: '🐋', rarity: 'rare',      zone: 'river', description: 'El gigante del río',           baseXp: 60  },
  { id: 'pacu',      name: 'PACÚ',     emoji: '🐠', rarity: 'uncommon',  zone: 'river', description: 'Dientes de fruta',             baseXp: 35  },
  { id: 'doradillo', name: 'DORADILLO',emoji: '⭐', rarity: 'legendary', zone: 'river', description: 'Casi un mito. Muy pocos lo han visto.', baseXp: 150 },
];

/** Set of valid fish IDs for server-side validation. */
export const VALID_FISH_IDS = new Set(FISH_SPECIES.map((f) => f.id));

/** Weighted random pick of a fish species given a zone and rarity roll. */
export function pickFishForZone(zone: FishZone): FishSpecies {
  const pool = FISH_SPECIES.filter((f) => f.zone === zone);

  // Rarity weights: common 60%, uncommon 30%, rare 9%, legendary 1%
  const rarityWeight: Record<FishRarity, number> = {
    common:    0.60,
    uncommon:  0.30,
    rare:      0.09,
    legendary: 0.01,
  };

  // Assign weights and do a weighted pick
  const weighted = pool.map((f) => ({ species: f, weight: rarityWeight[f.rarity] }));
  const total = weighted.reduce((acc, w) => acc + w.weight, 0);
  let roll = Math.random() * total;

  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.species;
  }

  // Fallback: last in pool
  return pool[pool.length - 1];
}
