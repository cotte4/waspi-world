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
    name: 'PACK TENKS 5K [TEST $1]',
    description: 'Ideal para utilities o primeras prendas.',
    tenks: 100,
    priceArs: 1,
  },
  {
    id: 'TENKS-12000',
    name: 'PACK TENKS 12K [TEST $1]',
    description: 'Pack mediano con bonus para varias compras.',
    tenks: 100,
    priceArs: 1,
  },
  {
    id: 'TENKS-30000',
    name: 'PACK TENKS 30K [TEST $1]',
    description: 'Pack grande para equiparte completo.',
    tenks: 100,
    priceArs: 1,
  },
];

export function getTenksPack(id: string) {
  return TENKS_PACKS.find((pack) => pack.id === id) ?? null;
}
