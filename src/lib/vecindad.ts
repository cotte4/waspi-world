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

export const VECINDAD_MAP = {
  WIDTH: 2800,
  HEIGHT: 1900,
  SPAWN_X: 180,
  SPAWN_Y: 980,
  RETURN_WORLD_X: 96,
  RETURN_WORLD_Y: 820,
} as const;

export const BUILD_STAGE_COSTS = [0, 40, 90, 160] as const;

export function normalizeVecindadBuildStage(stage: number | null | undefined) {
  if (typeof stage !== 'number' || !Number.isFinite(stage)) return 0;
  return Math.min(MAX_VECINDAD_STAGE, Math.max(0, Math.floor(stage)));
}

export function getBuildCost(stage: number) {
  const normalizedStage = normalizeVecindadBuildStage(stage);
  if (normalizedStage <= 0) return BUILD_STAGE_COSTS[1];
  if (normalizedStage >= MAX_VECINDAD_STAGE) return 0;
  return BUILD_STAGE_COSTS[normalizedStage];
}

export function getNextVecindadBuildCost(stage: number | null | undefined) {
  const normalizedStage = normalizeVecindadBuildStage(stage);
  if (normalizedStage >= MAX_VECINDAD_STAGE) return 0;
  return getBuildCost(normalizedStage);
}

export function getNextVecindadBuildStage(stage: number | null | undefined) {
  return Math.min(MAX_VECINDAD_STAGE, normalizeVecindadBuildStage(stage) + 1);
}

export function hasBuiltVecindadHouse(stage: number | null | undefined) {
  return normalizeVecindadBuildStage(stage) > 0;
}

export function getHouseInteriorStage(stage: number | null | undefined) {
  return Math.max(1, normalizeVecindadBuildStage(stage));
}

export const VECINDAD_PARCELS: VecindadParcelConfig[] = [
  { id: '01', x: 290, y: 700, w: 430, h: 240, cost: 20000 },
  { id: '02', x: 1180, y: 700, w: 430, h: 240, cost: 20000 },
  { id: '03', x: 2070, y: 700, w: 430, h: 240, cost: 20000 },
  { id: '04', x: 160, y: 1020, w: 430, h: 240, cost: 20000 },
  { id: '05', x: 1030, y: 1020, w: 430, h: 240, cost: 20000 },
  { id: '06', x: 1900, y: 1020, w: 430, h: 240, cost: 20000 },
  { id: '07', x: 290, y: 1340, w: 430, h: 240, cost: 20000 },
  { id: '08', x: 1180, y: 1340, w: 430, h: 240, cost: 20000 },
  { id: '09', x: 2070, y: 1340, w: 430, h: 240, cost: 20000 },
  { id: '10', x: 735, y: 1630, w: 430, h: 180, cost: 20000 },
  { id: '11', x: 1635, y: 1630, w: 430, h: 180, cost: 20000 },
];

export function getParcelById(parcelId: string) {
  return VECINDAD_PARCELS.find((parcel) => parcel.id === parcelId) ?? null;
}
