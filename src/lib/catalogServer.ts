import { CATALOG, getItem, getPhysicalCatalog, type CatalogItem } from '@/src/game/config/catalog';

export type ProductRecord = {
  id: string;
  name: string;
  price_ars: number | null;
  stripe_price_id: string | null;
  category: string;
  virtual_type: string;
  virtual_color: string;
  sizes: Array<{ size: string; stock: number | null }>;
  tenks_price: number | null;
  is_active: boolean;
  is_limited: boolean;
};

export function getStripePriceId(item: CatalogItem): string | null {
  if (!item.stripePriceEnv) return null;
  return process.env[item.stripePriceEnv] ?? null;
}

export function serializeCatalogItem(item: CatalogItem) {
  return {
    ...item,
    stripePriceId: getStripePriceId(item),
    stripePriceConfigured: Boolean(getStripePriceId(item)),
  };
}

export function getSerializedCatalog() {
  return CATALOG.map(serializeCatalogItem);
}

export function getSerializedPhysicalCatalog() {
  return getPhysicalCatalog().map(serializeCatalogItem);
}

export function getCatalogItemWithStripe(id: string) {
  const item = getItem(id);
  if (!item) return null;
  return {
    item,
    stripePriceId: getStripePriceId(item),
  };
}

export function toProductRecord(item: CatalogItem): ProductRecord {
  return {
    id: item.id,
    name: item.name,
    price_ars: item.priceArs ?? null,
    stripe_price_id: getStripePriceId(item),
    category: item.category,
    virtual_type: item.virtualType,
    virtual_color: item.color !== undefined ? `#${item.color.toString(16).padStart(6, '0')}` : '#111111',
    sizes: (item.sizes ?? []).map((size) => ({ size, stock: null })),
    tenks_price: item.priceTenks ?? null,
    is_active: true,
    is_limited: Boolean(item.isLimited),
  };
}
