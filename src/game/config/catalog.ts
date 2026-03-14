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
};

// MVP virtual catalog (TENKS-only for now)
export const CATALOG: CatalogItem[] = [
  // Arms Dealer weapons — unlock weapon in WorldScene + start with it in Zombies
  { id: 'UTIL-GUN-01',     name: 'PISTOLA 9MM',   slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'La base. Ya la tenés.', priceTenks: 5000 },
  { id: 'UTIL-GUN-SHOT-01', name: 'ESCOPETA 12G', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Desbloquea shotgun en el mundo + zombies.', priceTenks: 11000 },
  { id: 'UTIL-GUN-SMG-01',  name: 'BUZZ SMG',     slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Full auto. Empezás zombies con el SMG.', priceTenks: 14000 },
  { id: 'UTIL-GUN-RIFL-01', name: 'RANGER RIFLE', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Larga distancia. Empezás zombies con rifle.', priceTenks: 21000 },
  { id: 'UTIL-GUN-GOLD-01', name: 'RAY-X',        slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'El cañón. Desbloquea RAY-X desde ronda 1.', priceTenks: 42000, isLimited: true },
  { id: 'UTIL-BALL-01', name: 'FOOTBALL', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Pelota cosmetica con bote.', priceTenks: 5000 },
  { id: 'UTIL-DEED-01', name: 'ESCRITURA', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Escritura oficial de tu parcela en La Vecindad.', priceTenks: 0, autoEquip: false },

  // Clothing (colors apply to avatar)
  { id: 'TEE-BLK-01', name: 'REMERA WASPI NEGRA', slot: 'top', category: 'tee', virtualType: 'tee', description: 'Remera streetwear negra de WASPI.', color: 0x1A1A1A, priceTenks: 800, priceArs: 15000, sizes: ['S', 'M', 'L', 'XL'], stripePriceEnv: 'STRIPE_PRICE_TEE_BLK_01' },
  { id: 'TEE-WHT-01', name: 'REMERA WASPI BLANCA', slot: 'top', category: 'tee', virtualType: 'tee', description: 'Remera streetwear blanca de WASPI.', color: 0xE8E8E8, priceTenks: 800, priceArs: 15000, sizes: ['S', 'M', 'L', 'XL'], stripePriceEnv: 'STRIPE_PRICE_TEE_WHT_01' },
  { id: 'TEE-RED-01', name: 'REMERA LIMITED ROJA', slot: 'top', category: 'tee', virtualType: 'tee', description: 'Drop limitado en rojo.', color: 0xD94444, priceTenks: 1200, priceArs: 22000, sizes: ['S', 'M', 'L'], stripePriceEnv: 'STRIPE_PRICE_TEE_RED_01', isLimited: true },
  { id: 'CRG-BLK-01', name: 'CARGO NEGRO', slot: 'bottom', category: 'cargo', virtualType: 'cargo', description: 'Cargo negro oversized.', color: 0x1A1A1A, priceTenks: 1400, priceArs: 35000, sizes: ['30', '32', '34', '36'], stripePriceEnv: 'STRIPE_PRICE_CRG_BLK_01' },
  { id: 'CRG-OLV-01', name: 'CARGO OLIVE', slot: 'bottom', category: 'cargo', virtualType: 'cargo', description: 'Cargo olive militar.', color: 0x556B2F, priceTenks: 1400, priceArs: 35000, sizes: ['30', '32', '34', '36'], stripePriceEnv: 'STRIPE_PRICE_CRG_OLV_01' },
  { id: 'HOD-GRY-01', name: 'HOODIE GRIS', slot: 'top', category: 'hoodie', virtualType: 'hoodie', description: 'Hoodie gris heavyweight.', color: 0x555555, priceTenks: 1600, priceArs: 45000, sizes: ['S', 'M', 'L', 'XL'], stripePriceEnv: 'STRIPE_PRICE_HOD_GRY_01' },
];

export function getItem(id: string) {
  return CATALOG.find(i => i.id === id) ?? null;
}

export function getPhysicalCatalog() {
  return CATALOG.filter((item) => typeof item.priceArs === 'number');
}
