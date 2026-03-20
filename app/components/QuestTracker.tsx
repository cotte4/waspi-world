'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { getAuthHeaders } from '@/src/game/systems/authHelper';

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface DailyQuest {
  id: string;
  skill_id: string;
  action_type: string;
  target: number;
  reward_xp: number;
  reward_tenks: number;
  label: string;
  icon: string;
  progress: number;
  completed: boolean;
  completed_at: string | null;
}

export interface QuestTrackerProps {
  isAuthenticated: boolean;
  isMobile: boolean;
}

/* ─── Constants ────────────────────────────────────────────────────────────── */

const REFETCH_INTERVAL_MS = 5 * 60 * 1000;

const PANEL_WIDTH = 220;

const STYLES = {
  fontHeader: '"Press Start 2P", monospace',
  fontBody: '"Silkscreen", monospace',
  green: '#39FF14',
  gold: '#F5C842',
  blue: '#46B3FF',
  white: '#FFFFFF',
  bg: 'rgba(14,14,20,0.92)',
  borderColor: '#39FF14',
};

/* ─── Sub-components ───────────────────────────────────────────────────────── */

function LoadingDots() {
  const [dots, setDots] = useState('.');
  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => (d.length >= 3 ? '.' : d + '.'));
    }, 400);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      style={{
        fontFamily: STYLES.fontBody,
        fontSize: 11,
        color: 'rgba(255,255,255,0.55)',
        padding: '12px 8px',
        textAlign: 'center',
      }}
    >
      Cargando{dots}
    </div>
  );
}

function QuestRow({ quest }: { quest: DailyQuest }) {
  const pct = quest.target > 0 ? Math.min(quest.progress / quest.target, 1) : 0;
  const muted = quest.completed ? 0.55 : 1;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 10px',
        borderBottom: '1px solid rgba(57,255,20,0.10)',
        opacity: muted,
      }}
    >
      {/* Icon + label row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{quest.icon}</span>
        <span
          style={{
            fontFamily: STYLES.fontBody,
            fontSize: 11,
            color: STYLES.white,
            lineHeight: '1.35',
            flex: 1,
          }}
        >
          {quest.label}
        </span>
        {quest.completed ? (
          <span
            style={{
              fontFamily: STYLES.fontHeader,
              fontSize: 6,
              color: STYLES.green,
              border: `1px solid ${STYLES.green}`,
              padding: '2px 4px',
              borderRadius: 3,
              flexShrink: 0,
              boxShadow: `0 0 6px ${STYLES.green}66`,
              whiteSpace: 'nowrap',
            }}
          >
            ✓ DONE
          </span>
        ) : (
          <span
            style={{
              fontFamily: STYLES.fontHeader,
              fontSize: 7,
              color: STYLES.gold,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            +{quest.reward_tenks}T
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            flex: 1,
            height: 4,
            background: 'rgba(0,0,0,0.55)',
            border: `1px solid rgba(57,255,20,0.22)`,
            overflow: 'hidden',
            borderRadius: 2,
          }}
        >
          <div
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              background: quest.completed
                ? `linear-gradient(90deg, ${STYLES.green}99, ${STYLES.green})`
                : STYLES.green,
              transition: 'width 0.4s ease',
              boxShadow: quest.completed ? `0 0 4px ${STYLES.green}` : 'none',
            }}
          />
        </div>
        <span
          style={{
            fontFamily: STYLES.fontHeader,
            fontSize: 6,
            color: 'rgba(255,255,255,0.55)',
            whiteSpace: 'nowrap',
          }}
        >
          {quest.progress}/{quest.target}
        </span>
      </div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────────────────── */

export default function QuestTracker({ isAuthenticated, isMobile }: QuestTrackerProps) {
  const [expanded, setExpanded] = useState(false);
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchingRef = useRef(false);

  const completedCount = quests.filter(q => q.completed).length;
  const totalCount = quests.length;

  const fetchQuests = useCallback(async () => {
    // Guard against concurrent fetches (React Strict Mode double-effect)
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/quests/daily', { headers: authH });
      if (!res.ok) {
        // 401 = not authenticated; API always requires auth so no preview fetch needed
        setQuests([]);
        if (res.status !== 401) setError(true);
      } else {
        const json = await res.json() as { quests?: DailyQuest[] };
        setQuests(json.quests ?? []);
      }
    } catch {
      setQuests([]);
      setError(true);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  // Initial fetch + periodic re-fetch (single effect)
  useEffect(() => {
    void fetchQuests();
    intervalRef.current = setInterval(() => void fetchQuests(), REFETCH_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [fetchQuests]);

  // EventBus listener
  useEffect(() => {
    const unsub = eventBus.on(EVENTS.QUEST_TRACKER_REFRESH, fetchQuests);
    return unsub;
  }, [fetchQuests]);

  const panelHeight = isMobile ? '100%' : 'min(480px, calc(100% - 80px))';

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: isMobile ? 0 : '50%',
        transform: isMobile ? 'none' : 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        zIndex: 200,
        pointerEvents: 'none',
      }}
    >
      {/* Expanded panel */}
      <div
        style={{
          width: expanded ? PANEL_WIDTH : 0,
          height: panelHeight,
          overflow: 'hidden',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
          pointerEvents: expanded ? 'all' : 'none',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: PANEL_WIDTH,
            height: '100%',
            background: STYLES.bg,
            border: `1px solid ${STYLES.borderColor}44`,
            borderRight: 'none',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: `inset 0 0 20px rgba(57,255,20,0.04), -4px 0 24px rgba(0,0,0,0.6)`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 10px 8px',
              borderBottom: `1px solid ${STYLES.borderColor}33`,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: STYLES.fontHeader,
                fontSize: 8,
                color: STYLES.green,
                textShadow: `0 0 8px ${STYLES.green}`,
                letterSpacing: '0.04em',
              }}
            >
              MISIONES DIARIAS
            </span>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: 'none',
                border: `1px solid ${STYLES.green}55`,
                color: STYLES.green,
                fontFamily: STYLES.fontHeader,
                fontSize: 8,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: 2,
                lineHeight: 1,
              }}
              aria-label="Cerrar misiones"
            >
              →
            </button>
          </div>

          {/* Auth notice */}
          {!isAuthenticated && (
            <div
              style={{
                fontFamily: STYLES.fontBody,
                fontSize: 9,
                color: STYLES.blue,
                padding: '6px 10px',
                borderBottom: `1px solid rgba(70,179,255,0.18)`,
                flexShrink: 0,
              }}
            >
              Inicia sesión para guardar misiones
            </div>
          )}

          {/* Quest list */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {loading ? (
              <LoadingDots />
            ) : error ? (
              <div
                style={{
                  fontFamily: STYLES.fontBody,
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.4)',
                  padding: '16px 10px',
                  textAlign: 'center',
                }}
              >
                No se pudieron cargar las misiones
              </div>
            ) : quests.length === 0 ? (
              <div
                style={{
                  fontFamily: STYLES.fontBody,
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.4)',
                  padding: '16px 10px',
                  textAlign: 'center',
                }}
              >
                {isAuthenticated ? 'Vuelve mañana' : 'Iniciá sesión para ver tus misiones'}
              </div>
            ) : (
              quests.map(q => <QuestRow key={q.id} quest={q} />)
            )}
          </div>

          {/* Footer summary */}
          {quests.length > 0 && !loading && (
            <div
              style={{
                padding: '6px 10px',
                borderTop: `1px solid ${STYLES.borderColor}22`,
                fontFamily: STYLES.fontHeader,
                fontSize: 6,
                color: 'rgba(255,255,255,0.35)',
                flexShrink: 0,
              }}
            >
              {completedCount}/{totalCount} completadas
            </div>
          )}
        </div>
      </div>

      {/* Collapsed tab */}
      <button
        onClick={() => setExpanded(v => !v)}
        aria-label={expanded ? 'Cerrar misiones' : 'Abrir misiones'}
        style={{
          pointerEvents: 'all',
          background: STYLES.bg,
          border: `1px solid ${STYLES.borderColor}55`,
          borderRight: 'none',
          borderRadius: '4px 0 0 4px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '12px 6px',
          boxShadow: `-2px 0 12px rgba(57,255,20,0.08)`,
          transition: 'border-color 0.2s, box-shadow 0.2s',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = `${STYLES.green}99`;
          (e.currentTarget as HTMLButtonElement).style.boxShadow = `-2px 0 16px rgba(57,255,20,0.22)`;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = `${STYLES.green}55`;
          (e.currentTarget as HTMLButtonElement).style.boxShadow = `-2px 0 12px rgba(57,255,20,0.08)`;
        }}
      >
        {/* Badge */}
        {totalCount > 0 && (
          <div
            style={{
              background: completedCount === totalCount ? STYLES.green : STYLES.gold,
              color: '#0E0E14',
              fontFamily: STYLES.fontHeader,
              fontSize: 6,
              width: 16,
              height: 16,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {totalCount - completedCount > 0 ? totalCount - completedCount : '✓'}
          </div>
        )}

        {/* Vertical label */}
        <span
          style={{
            fontFamily: STYLES.fontHeader,
            fontSize: 7,
            color: STYLES.green,
            textShadow: `0 0 6px ${STYLES.green}`,
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            transform: 'rotate(180deg)',
            letterSpacing: '0.12em',
            userSelect: 'none',
          }}
        >
          MISIONES
        </span>
      </button>
    </div>
  );
}
