import { useCallback, useState, type MutableRefObject } from 'react';
import { getStats, type PlayerStats } from '@/src/game/systems/StatsSystem';
import { supabase } from '@/src/lib/supabase';

type UsePlayPageStatsOptions = {
  tokenRef: MutableRefObject<string | null>;
};

export function usePlayPageStats({ tokenRef }: UsePlayPageStatsOptions) {
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsData, setStatsData] = useState<PlayerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const openStats = useCallback(async () => {
    setStatsOpen(true);
    setStatsLoading(true);

    let token = tokenRef.current;
    if (!token && supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
      tokenRef.current = token;
    }

    if (token) {
      const res = await fetch('/api/player/stats', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      if (res?.ok) {
        const json = await res.json() as { stats?: PlayerStats };
        if (json.stats) {
          setStatsData(json.stats);
        } else {
          // Defensive fallback: keep panel useful even with malformed payload.
          setStatsData(getStats() as PlayerStats);
        }
      } else {
        // If the API fails while authenticated, avoid showing "not logged in".
        setStatsData(getStats() as PlayerStats);
      }
    } else {
      // Guest: show in-memory session stats.
      setStatsData(getStats() as PlayerStats);
    }

    setStatsLoading(false);
  }, [tokenRef]);

  const closeStats = useCallback(() => {
    setStatsOpen(false);
    setStatsData(null);
  }, []);

  return {
    closeStats,
    openStats,
    statsData,
    statsLoading,
    statsOpen,
  };
}
