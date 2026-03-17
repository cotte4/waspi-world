// guilds.ts
// Definición de los 4 gremios del mundo Waspi.
// Los datos canónicos viven en la tabla `guilds` de Supabase,
// pero duplicamos aquí para acceso offline en el cliente.

import type { SkillId } from '../systems/SkillSystem';

export type GuildId = 'mineros' | 'pescadores' | 'cocineros' | 'botanicos';
export type GuildRank = 'novato' | 'aprendiz' | 'miembro' | 'veterano' | 'leyenda';

export type GuildDef = {
  id: GuildId;
  name: string;
  tagline: string;
  color: string;
  icon: string;
  skillId: SkillId;          // skill principal para ganar rep
  rankThresholds: Record<GuildRank, number>; // rep mínimo para cada rango
  rankBenefits: Record<GuildRank, string>;   // descripción del beneficio
};

export const GUILD_RANK_ORDER: GuildRank[] = ['novato', 'aprendiz', 'miembro', 'veterano', 'leyenda'];

export const RANK_THRESHOLDS: Record<GuildRank, number> = {
  novato:   0,
  aprendiz: 100,
  miembro:  300,
  veterano: 700,
  leyenda:  1500,
};

export const GUILD_DEFS: GuildDef[] = [
  {
    id: 'mineros',
    name: 'GREMIO DE MINEROS',
    tagline: 'Dureza y precisión bajo tierra',
    color: '#C8A45A',
    icon: '⛏️',
    skillId: 'mining',
    rankThresholds: RANK_THRESHOLDS,
    rankBenefits: {
      novato:   'Acceso al gremio',
      aprendiz: '+5% velocidad de extracción',
      miembro:  'Contratos exclusivos de minería',
      veterano: '+10% calidad en materiales',
      leyenda:  'Área secreta del gremio desbloqueada',
    },
  },
  {
    id: 'pescadores',
    name: 'GREMIO DE PESCADORES',
    tagline: 'Paciencia y ojo fino en las aguas',
    color: '#4A9ECC',
    icon: '🎣',
    skillId: 'fishing',
    rankThresholds: RANK_THRESHOLDS,
    rankBenefits: {
      novato:   'Acceso al gremio',
      aprendiz: '+5% suerte de pesca',
      miembro:  'Contratos exclusivos de pesca',
      veterano: 'Acceso a zonas de pesca premium',
      leyenda:  'Recetas exclusivas de mar',
    },
  },
  {
    id: 'cocineros',
    name: 'GREMIO DE COCINEROS',
    tagline: 'Sabor y técnica en cada preparación',
    color: '#FF7043',
    icon: '🍳',
    skillId: 'cooking',
    rankThresholds: RANK_THRESHOLDS,
    rankBenefits: {
      novato:   'Acceso al gremio',
      aprendiz: 'Recetas básicas del gremio',
      miembro:  '+10% duración de buffs de comida',
      veterano: 'Recetas avanzadas desbloqueadas',
      leyenda:  'Comidas legendarias disponibles',
    },
  },
  {
    id: 'botanicos',
    name: 'GREMIO DE BOTÁNICOS',
    tagline: 'Cultivo y cosecha con maestría',
    color: '#4CAF50',
    icon: '🌿',
    skillId: 'gardening',
    rankThresholds: RANK_THRESHOLDS,
    rankBenefits: {
      novato:   'Acceso al gremio',
      aprendiz: '+5% velocidad de cultivo',
      miembro:  'Semillas especiales disponibles',
      veterano: '+10% calidad de cosecha',
      leyenda:  'Acceso a invernadero secreto',
    },
  },
];

export function getGuildDef(id: GuildId): GuildDef | undefined {
  return GUILD_DEFS.find((g) => g.id === id);
}

export function getRankForRep(rep: number): GuildRank {
  const ranks = GUILD_RANK_ORDER.slice().reverse(); // leyenda primero
  for (const rank of ranks) {
    if (rep >= RANK_THRESHOLDS[rank]) return rank;
  }
  return 'novato';
}
