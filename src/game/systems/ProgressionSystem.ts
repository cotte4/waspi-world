import {
  type ProgressionState,
  clampKills,
  clampXp,
  getProgressionForTotals,
  getLevelMilestones,
  getMaxProgressionLevel,
  getLevelFloorXp,
} from '@/src/lib/progression';
import { getAuthHeaders } from './authHelper';

export type { ProgressionState };

const STORAGE_KEY = 'waspi_progression_v2';
const LEGACY_STORAGE_KEY = 'waspi_progression_v1';

export { getLevelMilestones, getMaxProgressionLevel, getLevelFloorXp, getProgressionForTotals };

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

export function initProgressionState(kills: number, xp: number): ProgressionState {
  const state = getProgressionForTotals(kills, xp);
  saveProgressionState(state);
  return state;
}

/**
 * Load progression from server (zombie_kills, xp, level) and hydrate localStorage.
 * Server wins. Falls back silently to current localStorage value if request fails.
 * Returns deaths so the caller can also hydrate CombatStats.
 */
export async function loadProgressionFromServer(): Promise<{ deaths: number } | null> {
  try {
    const authH = await getAuthHeaders();
    if (!authH.Authorization) return null;

    const res = await fetch('/api/player/progression', { headers: authH });
    if (!res.ok) return null;

    const json = await res.json() as {
      kills?: number;
      xp?: number;
      deaths?: number;
    } | null;

    if (!json) return null;

    const kills = clampKills(json.kills ?? 0);
    const xp = clampXp(json.xp ?? 0);
    initProgressionState(kills, xp);

    return { deaths: typeof json.deaths === 'number' ? Math.max(0, Math.floor(json.deaths)) : 0 };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget sync of XP gained from a kill to the server.
 * The server applies the delta with clamps and recomputes level.
 */
export function syncXpToServer(xpDelta: number): void {
  void (async () => {
    const authH = await getAuthHeaders();
    if (!authH.Authorization) return;
    await fetch('/api/player/progression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH },
      body: JSON.stringify({ xp_delta: xpDelta }),
    }).catch(() => null);
  })();
}
