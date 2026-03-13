export type CombatStats = {
  kills: number;
  deaths: number;
};

const STORAGE_KEY = 'waspi_combat_stats_v1';

function clamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function loadCombatStats(): CombatStats {
  if (typeof window === 'undefined') return { kills: 0, deaths: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { kills: 0, deaths: 0 };
    const parsed = JSON.parse(raw) as Partial<CombatStats>;
    return {
      kills: clamp(parsed.kills),
      deaths: clamp(parsed.deaths),
    };
  } catch {
    return { kills: 0, deaths: 0 };
  }
}

export function saveCombatStats(stats: CombatStats) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    kills: clamp(stats.kills),
    deaths: clamp(stats.deaths),
  }));
}
