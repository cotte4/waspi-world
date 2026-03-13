export type TenksPack = {
  id: string;
  name: string;
  description: string;
  tenks: number;
  priceArs: number;
};

export const TENKS_PACKS: TenksPack[] = [
  {
    id: 'TENKS-5000',
    name: 'PACK TENKS 5K',
    description: 'Ideal para utilities o primeras prendas.',
    tenks: 5000,
    priceArs: 4900,
  },
  {
    id: 'TENKS-12000',
    name: 'PACK TENKS 12K',
    description: 'Pack mediano con bonus para varias compras.',
    tenks: 12000,
    priceArs: 9900,
  },
  {
    id: 'TENKS-30000',
    name: 'PACK TENKS 30K',
    description: 'Pack grande para equiparte completo.',
    tenks: 30000,
    priceArs: 21900,
  },
];

export function getTenksPack(id: string) {
  return TENKS_PACKS.find((pack) => pack.id === id) ?? null;
}
