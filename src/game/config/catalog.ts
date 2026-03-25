export type CatalogItem = {
  id: string;
  name: string;
  slot: 'top' | 'bottom' | 'utility';
  category: 'tee' | 'cargo' | 'hoodie' | 'accessory';
  virtualType: 'tee' | 'cargo' | 'hoodie' | 'accessory';
  description?: string;
  color?: number;
  priceTenks: number;
  priceArs?: number;
  sizes?: string[];
  stripePriceEnv?: string;
  isLimited?: boolean;
  autoEquip?: boolean;
  /** Si true, el item no está implementado en el juego y no se puede comprar todavía. */
  comingSoon?: boolean;
  /**
   * Clave de textura Phaser para el sprite overlay de la prenda.
   * Si está definido, AvatarRenderer lo dibuja encima del cuerpo base
   * en lugar de usar solo el color plano.
   * Convención: 'cloth_<id_lowercase>' ej: 'cloth_tee_blk_01'
   */
  spriteKey?: string;
};

// MVP virtual catalog (TENKS-only for now)
export const CATALOG: CatalogItem[] = [
  // Arms Dealer weapons — unlock weapon in WorldScene + start with it in Zombies
  { id: 'UTIL-GUN-01',     name: 'PISTOLA 9MM',   slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'La base. Ya la tenés.', priceTenks: 5000 },
  { id: 'UTIL-GUN-SHOT-01', name: 'ESCOPETA 12G', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Desbloquea shotgun en el mundo + zombies.', priceTenks: 11000 },
  { id: 'UTIL-GUN-SMG-01',    name: 'BUZZ SMG',     slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Full auto. Ráfaga rápida, baja por impacto.', priceTenks: 14000 },
  { id: 'UTIL-GUN-GOLD-01',   name: 'RAY-X',        slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Dispara doble. Energía pura. Drop limitado.', priceTenks: 32000, isLimited: true },
  { id: 'UTIL-GUN-DEAGLE-01', name: 'DEAGLE',       slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Un tiro. Máximo daño. Para los que no fallan.', priceTenks: 22000 },
  { id: 'UTIL-GUN-CANNON-01', name: 'CANNON',       slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Perdigones pesados. Área de daño máxima.', priceTenks: 35000 },
  { id: 'UTIL-GUN-RIFL-01',   name: 'RANGER RIFLE', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Larga distancia. Empezás zombies con rifle.', priceTenks: 21000, comingSoon: true },
  { id: 'UTIL-CIG-01', name: 'CIGARRILLO', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Efecto visual al estar idle.', priceTenks: 150, autoEquip: false },
  { id: 'UTIL-BALL-01', name: 'FOOTBALL', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Bote cosmético al caminar.', priceTenks: 200, autoEquip: false },
  { id: 'UTIL-DEED-01', name: 'ESCRITURA', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Escritura oficial de tu parcela en La Vecindad.', priceTenks: 0, autoEquip: false },

  // Clothing (colors apply to avatar)
  { id: 'TEE-BLK-01', name: 'REMERA WASPI NEGRA', slot: 'top', category: 'tee', virtualType: 'tee', description: 'Remera streetwear negra de WASPI.', color: 0x1A1A1A, priceTenks: 800, priceArs: 15000, sizes: ['S', 'M', 'L', 'XL'], stripePriceEnv: 'STRIPE_PRICE_TEE_BLK_01', spriteKey: 'cloth_tee_blk_01' },
  { id: 'TEE-WHT-01', name: 'REMERA WASPI BLANCA', slot: 'top', category: 'tee', virtualType: 'tee', description: 'Remera streetwear blanca de WASPI.', color: 0xE8E8E8, priceTenks: 800, priceArs: 15000, sizes: ['S', 'M', 'L', 'XL'], stripePriceEnv: 'STRIPE_PRICE_TEE_WHT_01' },
  { id: 'TEE-RED-01', name: 'REMERA LIMITED ROJA', slot: 'top', category: 'tee', virtualType: 'tee', description: 'Drop limitado en rojo.', color: 0xD94444, priceTenks: 1200, priceArs: 22000, sizes: ['S', 'M', 'L'], stripePriceEnv: 'STRIPE_PRICE_TEE_RED_01', isLimited: true },
  { id: 'CRG-BLK-01', name: 'CARGO NEGRO', slot: 'bottom', category: 'cargo', virtualType: 'cargo', description: 'Cargo negro oversized.', color: 0x1A1A1A, priceTenks: 1400, priceArs: 35000, sizes: ['30', '32', '34', '36'], stripePriceEnv: 'STRIPE_PRICE_CRG_BLK_01', spriteKey: 'cloth_crg_blk_01' },
  { id: 'CRG-OLV-01', name: 'CARGO OLIVE', slot: 'bottom', category: 'cargo', virtualType: 'cargo', description: 'Cargo olive militar.', color: 0x556B2F, priceTenks: 1400, priceArs: 35000, sizes: ['30', '32', '34', '36'], stripePriceEnv: 'STRIPE_PRICE_CRG_OLV_01' },
  { id: 'HOD-GRY-01', name: 'HOODIE GRIS', slot: 'top', category: 'hoodie', virtualType: 'hoodie', description: 'Hoodie gris heavyweight.', color: 0x555555, priceTenks: 1600, priceArs: 45000, sizes: ['S', 'M', 'L', 'XL'], stripePriceEnv: 'STRIPE_PRICE_HOD_GRY_01' },
];

export function getItem(id: string) {
  return CATALOG.find(i => i.id === id) ?? null;
}

export function getPhysicalCatalog() {
  return CATALOG.filter((item) => typeof item.priceArs === 'number');
}
