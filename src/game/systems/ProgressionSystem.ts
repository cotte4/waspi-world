export type ProgressionState = {
  kills: number;
  xp: number;
  level: number;
  nextLevelAt: number | null;
};

const STORAGE_KEY = 'waspi_progression_v1';
const LEVEL_MILESTONES = [0, 8, 20, 36, 56, 80, 110, 146, 188, 236, 290] as const;

function clampKills(kills: unknown) {
  return typeof kills === 'number' && Number.isFinite(kills) ? Math.max(0, Math.floor(kills)) : 0;
}

function clampXp(xp: unknown) {
  return typeof xp === 'number' && Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
}

export function getLevelMilestones() {
  return [...LEVEL_MILESTONES];
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

export function initProgressionState(kills: number, xp: number): ProgressionState {
  const state = getProgressionForTotals(kills, xp);
  saveProgressionState(state);
  return state;
}
