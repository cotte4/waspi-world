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
};

// MVP virtual catalog (TENKS-only for now)
export const CATALOG: CatalogItem[] = [
  // Cotte Shop utilities (requested: cost 5k)
  { id: 'UTIL-GUN-01', name: 'GUN', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Utilidad cosmetica para disparar.', priceTenks: 5000 },
  { id: 'UTIL-BALL-01', name: 'FOOTBALL', slot: 'utility', category: 'accessory', virtualType: 'accessory', description: 'Pelota cosmetica con bote.', priceTenks: 5000 },

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
