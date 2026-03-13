export type VecindadParcelConfig = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cost: number;
};

export type SharedParcelState = {
  parcelId: string;
  ownerId: string;
  ownerUsername: string;
  buildStage: number;
};

export const MAX_VECINDAD_STAGE = 4;

export const BUILD_STAGE_COSTS = [0, 40, 90, 160] as const;

export function getBuildCost(stage: number) {
  if (stage <= 0) return BUILD_STAGE_COSTS[1];
  if (stage >= MAX_VECINDAD_STAGE) return 0;
  return BUILD_STAGE_COSTS[stage];
}

export const VECINDAD_PARCELS: VecindadParcelConfig[] = [
  { id: '01', x: 96, y: 1084, w: 230, h: 118, cost: 20000 },
  { id: '02', x: 390, y: 1084, w: 230, h: 118, cost: 20000 },
  { id: '03', x: 684, y: 1084, w: 230, h: 118, cost: 20000 },
  { id: '04', x: 96, y: 1234, w: 230, h: 118, cost: 20000 },
  { id: '05', x: 390, y: 1234, w: 230, h: 118, cost: 20000 },
  { id: '06', x: 684, y: 1234, w: 230, h: 118, cost: 20000 },
  { id: '07', x: 96, y: 1384, w: 230, h: 118, cost: 20000 },
  { id: '08', x: 390, y: 1384, w: 230, h: 118, cost: 20000 },
  { id: '09', x: 684, y: 1384, w: 230, h: 118, cost: 20000 },
  { id: '10', x: 96, y: 1534, w: 230, h: 118, cost: 20000 },
  { id: '11', x: 390, y: 1534, w: 230, h: 118, cost: 20000 },
];

export function getParcelById(parcelId: string) {
  return VECINDAD_PARCELS.find((parcel) => parcel.id === parcelId) ?? null;
}
