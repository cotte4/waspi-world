export type CatalogItem = {
  id: string;
  name: string;
  slot: 'top' | 'bottom' | 'utility';
  color?: number;
  priceTenks: number;
};

// MVP virtual catalog (TENKS-only for now)
export const CATALOG: CatalogItem[] = [
  // Cotte Shop utilities (requested: cost 5k)
  { id: 'UTIL-GUN-01', name: 'GUN', slot: 'utility', priceTenks: 5000 },
  { id: 'UTIL-BALL-01', name: 'FOOTBALL', slot: 'utility', priceTenks: 5000 },

  // Clothing (colors apply to avatar)
  { id: 'TEE-BLK-01', name: 'REMERA WASPI NEGRA', slot: 'top', color: 0x1A1A1A, priceTenks: 800 },
  { id: 'TEE-WHT-01', name: 'REMERA WASPI BLANCA', slot: 'top', color: 0xE8E8E8, priceTenks: 800 },
  { id: 'TEE-RED-01', name: 'REMERA LIMITED ROJA', slot: 'top', color: 0xD94444, priceTenks: 1200 },
  { id: 'CRG-BLK-01', name: 'CARGO NEGRO', slot: 'bottom', color: 0x1A1A1A, priceTenks: 1400 },
  { id: 'CRG-OLV-01', name: 'CARGO OLIVE', slot: 'bottom', color: 0x556B2F, priceTenks: 1400 },
  { id: 'HOD-GRY-01', name: 'HOODIE GRIS', slot: 'top', color: 0x555555, priceTenks: 1600 },
];

export function getItem(id: string) {
  return CATALOG.find(i => i.id === id) ?? null;
}

