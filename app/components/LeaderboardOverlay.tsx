'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthHeaders } from '@/src/game/systems/authHelper';
import type { LeaderboardEntry } from '@/app/api/leaderboard/route';

// ── types ─────────────────────────────────────────────────────────────────────

export interface LeaderboardOverlayProps {
  onClose: () => void;
  isMobile: boolean;
  currentPlayerId?: string;
}

type Tab = 'zombies' | 'kd' | 'level';

interface FetchResult {
  entries: LeaderboardEntry[];
}

// ── constants ─────────────────────────────────────────────────────────────────

const TAB_LABELS: Record<Tab, string> = {
  zombies: 'ZOMBIES',
  kd: 'K/D',
  level: 'NIVEL',
};

const TAB_COLORS: Record<Tab, string> = {
  zombies: '#FF6B6B',
  kd: '#FF006E',
  level: '#46B3FF',
};

const RANK_COLORS: Record<number, string> = {
  1: '#F5C842',
  2: '#AAAAAA',
  3: '#CD7F32',
};

const REFRESH_INTERVAL_MS = 30_000;

// ── helpers ───────────────────────────────────────────────────────────────────

function isFetchResult(v: unknown): v is FetchResult {
  return (
    typeof v === 'object' &&
    v !== null &&
    'entries' in v &&
    Array.isArray((v as Record<string, unknown>).entries)
  );
}

function rankColor(rank: number): string {
  return RANK_COLORS[rank] ?? 'rgba(255,255,255,0.35)';
}

function formatValue(value: number, tab: Tab): string {
  if (tab === 'kd') return value.toFixed(2);
  return value.toLocaleString();
}

// ── sub-components ────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <>
      <style>{`@keyframes lb-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 40,
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 9,
            color: '#46B3FF',
            letterSpacing: '0.12em',
            animation: 'lb-pulse 1.2s ease-in-out infinite',
            textShadow: '0 0 10px rgba(70,179,255,0.6)',
          }}
        >
          CARGANDO...
        </div>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 40,
        gap: 10,
      }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }}>☠</span>
      <div
        style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: 12,
          color: 'rgba(255,255,255,0.4)',
          textAlign: 'center',
          maxWidth: 260,
          lineHeight: 1.6,
        }}
      >
        Sin datos todavía
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  tab,
  isCurrentPlayer,
}: {
  entry: LeaderboardEntry;
  tab: Tab;
  isCurrentPlayer: boolean;
}) {
  const tabColor = TAB_COLORS[tab];
  const rColor = rankColor(entry.rank);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px',
        borderRadius: 2,
        background: isCurrentPlayer
          ? 'rgba(245,200,66,0.06)'
          : 'rgba(255,255,255,0.02)',
        border: isCurrentPlayer
          ? '1px solid rgba(245,200,66,0.25)'
          : '1px solid transparent',
        marginBottom: 3,
        minHeight: 34,
      }}
    >
      {/* rank */}
      <span
        style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: 8,
          color: rColor,
          minWidth: 22,
          textAlign: 'right',
          flexShrink: 0,
          textShadow: entry.rank <= 3 ? `0 0 6px ${rColor}` : 'none',
        }}
      >
        #{entry.rank}
      </span>

      {/* username */}
      <span
        style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: 13,
          color: '#FFFFFF',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {entry.username}
        {isCurrentPlayer && (
          <span
            style={{
              marginLeft: 6,
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 6,
              color: '#F5C842',
              verticalAlign: 'middle',
            }}
          >
            YOU
          </span>
        )}
      </span>

      {/* level context (shown when not on level tab) */}
      {tab !== 'level' && entry.level !== undefined && (
        <span
          style={{
            fontFamily: '"Silkscreen", monospace',
            fontSize: 10,
            color: 'rgba(255,255,255,0.28)',
            flexShrink: 0,
            minWidth: 38,
            textAlign: 'right',
          }}
        >
          lv{entry.level}
        </span>
      )}

      {/* value */}
      <span
        style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: 14,
          color: tabColor,
          flexShrink: 0,
          minWidth: 56,
          textAlign: 'right',
          textShadow: `0 0 6px ${tabColor}66`,
        }}
      >
        {formatValue(entry.value, tab)}
      </span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function LeaderboardOverlay({
  onClose,
  isMobile,
  currentPlayerId,
}: LeaderboardOverlayProps) {
  const [activeTab, setActiveTab] = useState<Tab>('zombies');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLeaderboard = useCallback(
    async (tab: Tab) => {
      setLoading(true);
      try {
        const authH = await getAuthHeaders();
        const res = await fetch(`/api/leaderboard?tab=${tab}`, {
          headers: authH,
          cache: 'no-store',
        });
        if (!res.ok) {
          setEntries([]);
          return;
        }
        const json: unknown = await res.json();
        if (isFetchResult(json)) {
          setEntries(json.entries);
        } else {
          setEntries([]);
        }
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Fetch on mount and on tab change
  useEffect(() => {
    void fetchLeaderboard(activeTab);
  }, [activeTab, fetchLeaderboard]);

  // Auto-refresh every 30s
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void fetchLeaderboard(activeTab);
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [activeTab, fetchLeaderboard]);

  // ESC key to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const activeColor = TAB_COLORS[activeTab];

  return (
    <div
      className="ww-overlay absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', zIndex: 20 }}
      onClick={handleBackdropClick}
    >
      {/* CRT scanlines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)',
          pointerEvents: 'none',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative',
          width: isMobile ? '94%' : 480,
          maxHeight: isMobile ? '88vh' : 560,
          background: 'rgba(10,10,20,0.97)',
          border: '1px solid rgba(70,179,255,0.35)',
          boxShadow: '0 0 28px rgba(70,179,255,0.08), 0 10px 40px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Corner decorations */}
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <div
            key={c}
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              top: c.startsWith('t') ? 6 : undefined,
              bottom: c.startsWith('b') ? 6 : undefined,
              left: c.endsWith('l') ? 6 : undefined,
              right: c.endsWith('r') ? 6 : undefined,
              borderTop: c.startsWith('t') ? '1px solid rgba(70,179,255,0.5)' : undefined,
              borderBottom: c.startsWith('b') ? '1px solid rgba(70,179,255,0.5)' : undefined,
              borderLeft: c.endsWith('l') ? '1px solid rgba(70,179,255,0.5)' : undefined,
              borderRight: c.endsWith('r') ? '1px solid rgba(70,179,255,0.5)' : undefined,
            }}
          />
        ))}

        {/* ── HEADER ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 10,
              color: '#46B3FF',
              letterSpacing: '0.06em',
              textShadow: '0 0 10px rgba(70,179,255,0.5)',
            }}
          >
            LEADERBOARD
          </span>
          <button
            onClick={onClose}
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: 'rgba(255,255,255,0.35)',
              background: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '5px 9px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            ESC
          </button>
        </div>

        {/* ── TABS ── */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}
        >
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
            const isActive = tab === activeTab;
            const color = TAB_COLORS[tab];
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 7,
                  color: isActive ? color : 'rgba(255,255,255,0.35)',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                  transition: 'color 0.15s, border-color 0.15s',
                  textShadow: isActive ? `0 0 8px ${color}` : 'none',
                  marginBottom: -1,
                }}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        {/* ── BODY ── */}
        <div
          style={{
            overflowY: 'auto',
            padding: '12px 14px 16px',
            flex: 1,
          }}
        >
          {/* tab color context label */}
          <div
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 6,
              color: activeColor,
              letterSpacing: '0.1em',
              marginBottom: 10,
              opacity: 0.7,
              textShadow: `0 0 6px ${activeColor}`,
            }}
          >
            {activeTab === 'zombies' && '◆ TOP CAZADORES'}
            {activeTab === 'kd' && '◆ MEJOR K/D RATIO'}
            {activeTab === 'level' && '◆ MAYOR NIVEL'}
          </div>

          {loading ? (
            <LoadingState />
          ) : entries.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {entries.map((entry) => (
                <EntryRow
                  key={entry.playerId}
                  entry={entry}
                  tab={activeTab}
                  isCurrentPlayer={
                    currentPlayerId !== undefined && entry.playerId === currentPlayerId
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
