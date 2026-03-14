export type ProgressionState = {
  kills: number;
  xp: number;
  level: number;
  nextLevelAt: number | null;
};

const STORAGE_KEY = 'waspi_progression_v2';
const LEGACY_STORAGE_KEY = 'waspi_progression_v1';
const MAX_LEVEL = 42;

function buildLevelMilestones(maxLevel: number) {
  const milestones = [0];
  let totalXp = 0;
  for (let level = 2; level <= maxLevel; level += 1) {
    // Easier early levels, then a steep late-game climb.
    const stepXp = Math.round(6 + Math.pow(level - 1, 2.08) * 2.1);
    totalXp += stepXp;
    milestones.push(totalXp);
  }
  return milestones;
}

const LEVEL_MILESTONES = buildLevelMilestones(MAX_LEVEL);

function clampKills(kills: unknown) {
  return typeof kills === 'number' && Number.isFinite(kills) ? Math.max(0, Math.floor(kills)) : 0;
}

function clampXp(xp: unknown) {
  return typeof xp === 'number' && Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
}

export function getLevelMilestones() {
  return [...LEVEL_MILESTONES];
}

export function getMaxProgressionLevel() {
  return LEVEL_MILESTONES.length;
}

export function getLevelFloorXp(level: number) {
  const safeLevel = Math.max(1, Math.min(getMaxProgressionLevel(), Math.floor(level)));
  return LEVEL_MILESTONES[safeLevel - 1] ?? 0;
}

export function getProgressionForTotals(kills: number, xp: number): ProgressionState {
  const safeKills = clampKills(kills);
  const safeXp = clampXp(xp);
  let levelIndex = 0;
  for (let i = 0; i < LEVEL_MILESTONES.length; i += 1) {
    if (safeXp >= LEVEL_MILESTONES[i]) {
      levelIndex = i;
    } else {
      break;
    }
  }

  const level = levelIndex + 1;
  const nextLevelAt = LEVEL_MILESTONES[levelIndex + 1] ?? null;
  return {
    kills: safeKills,
    xp: safeXp,
    level,
    nextLevelAt,
  };
}

export function loadProgressionState(): ProgressionState {
  if (typeof window === 'undefined') return getProgressionForTotals(0, 0);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return getProgressionForTotals(0, 0);
    const parsed = JSON.parse(raw) as { kills?: number; xp?: number };
    const safeKills = parsed.kills ?? 0;
    const safeXp = parsed.xp ?? safeKills;
    return getProgressionForTotals(safeKills, safeXp);
  } catch {
    return getProgressionForTotals(0, 0);
  }
}

export function saveProgressionState(state: ProgressionState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    kills: clampKills(state.kills),
    xp: clampXp(state.xp),
  }));
}

export function addXpToProgression(state: ProgressionState, xpGained: number) {
  return getProgressionForTotals(state.kills + 1, state.xp + clampXp(xpGained));
}
