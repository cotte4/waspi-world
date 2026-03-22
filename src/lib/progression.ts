export type ProgressionState = {
  kills: number;
  xp: number;
  level: number;
  nextLevelAt: number | null;
};

export const MAX_LEVEL = 42;

function buildLevelMilestones(maxLevel: number) {
  const milestones = [0];
  let totalXp = 0;
  for (let level = 2; level <= maxLevel; level += 1) {
    const stepXp = Math.round(6 + Math.pow(level - 1, 2.08) * 2.1);
    totalXp += stepXp;
    milestones.push(totalXp);
  }
  return milestones;
}

export const LEVEL_MILESTONES = buildLevelMilestones(MAX_LEVEL);

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

export function clampKills(kills: unknown) {
  return typeof kills === 'number' && Number.isFinite(kills) ? Math.max(0, Math.floor(kills)) : 0;
}

export function clampXp(xp: unknown) {
  return typeof xp === 'number' && Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
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
  return { kills: safeKills, xp: safeXp, level, nextLevelAt };
}
