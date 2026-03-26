'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { getMaxProgressionLevel } from '@/src/game/systems/ProgressionSystem';
import type { ProgressionState } from '@/src/game/systems/ProgressionSystem';

interface HpState {
  hp: number;
  maxHp: number;
}

interface CombatStats {
  kills: number;
  deaths: number;
}

interface PlayerInfo {
  playerId: string;
  username: string;
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function Bar({
  pct,
  color,
  glow,
  height = 6,
  pulse = false,
}: {
  pct: number;
  color: string;
  glow: string;
  height?: number;
  pulse?: boolean;
}) {
  return (
    <div
      style={{
        width: '100%',
        height,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(1, pct)) * 100}%`,
          height: '100%',
          background: color,
          boxShadow: `0 0 4px ${glow}`,
          borderRadius: 1,
          transition: 'width 0.15s ease-out',
          animation: pulse ? 'wwHpPulse 0.35s ease-out' : undefined,
        }}
      />
    </div>
  );
}

const HUD_COLLAPSED_KEY = 'waspi_hud_collapsed';

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(HUD_COLLAPSED_KEY) === '1';
}

/* ─── GameHUD ────────────────────────────────────────────────────────────── */

export default function GameHUD() {
  const maxLvl = getMaxProgressionLevel();

  const [hp, setHp] = useState<HpState>({ hp: 100, maxHp: 100 });
  const [progression, setProgression] = useState<ProgressionState | null>(null);
  const [tenks, setTenks] = useState<number | null>(null);
  const [combat, setCombat] = useState<CombatStats>({ kills: 0, deaths: 0 });
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const [hpDamaged, setHpDamaged] = useState(false);
  const [tenksFlash, setTenksFlash] = useState(false);

  const hpTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tenksTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      window.localStorage.setItem(HUD_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  useEffect(() => {
    const unsubs = [
      eventBus.on(EVENTS.PLAYER_HP_CHANGED, (payload: unknown) => {
        const p = payload as HpState;
        setHp(prev => {
          if (p.hp < prev.hp && prev.hp > 0) {
            setHpDamaged(true);
            clearTimeout(hpTimerRef.current);
            hpTimerRef.current = setTimeout(() => setHpDamaged(false), 350);
          }
          return p;
        });
      }),

      eventBus.on(EVENTS.PLAYER_PROGRESSION, (payload: unknown) => {
        setProgression(payload as ProgressionState);
      }),

      eventBus.on(EVENTS.TENKS_CHANGED, (payload: unknown) => {
        const p = payload as { balance: number };
        setTenks(p.balance);
        setTenksFlash(true);
        clearTimeout(tenksTimerRef.current);
        tenksTimerRef.current = setTimeout(() => setTenksFlash(false), 550);
      }),

      eventBus.on(EVENTS.PLAYER_COMBAT_STATS, (payload: unknown) => {
        setCombat(payload as CombatStats);
      }),

      eventBus.on(EVENTS.PLAYER_INFO, (payload: unknown) => {
        setPlayerInfo(payload as PlayerInfo);
      }),

      eventBus.on(EVENTS.PLAYER_READY, (payload: unknown) => {
        const p = payload as { hp?: number; maxHp?: number };
        if (typeof p.hp === 'number' && typeof p.maxHp === 'number') {
          setHp({ hp: p.hp, maxHp: p.maxHp });
        }
      }),
    ];

    return () => {
      unsubs.forEach(u => u());
      clearTimeout(hpTimerRef.current);
      clearTimeout(tenksTimerRef.current);
    };
  }, []);

  /* derived */
  const hpPct = hp.maxHp > 0 ? hp.hp / hp.maxHp : 0;
  const hpColor = hpPct > 0.55 ? '#39FF14' : hpPct > 0.28 ? '#F5C842' : '#FF006E';
  const hpGlow  = hpPct > 0.55 ? 'rgba(57,255,20,0.55)' : hpPct > 0.28 ? 'rgba(245,200,66,0.55)' : 'rgba(255,0,110,0.7)';
  const xpPct   = progression
    ? (progression.nextLevelAt === null ? 1 : Math.min(1, progression.xp / progression.nextLevelAt))
    : 0;
  const hasKD = combat.kills > 0 || combat.deaths > 0;

  /* ── border glow changes on damage ── */
  const borderColor = hpDamaged ? 'rgba(255,0,110,0.75)' : 'rgba(57,255,20,0.32)';
  const outerGlow   = hpDamaged
    ? '0 0 18px rgba(255,0,110,0.35), inset 0 0 14px rgba(0,0,0,0.7)'
    : '0 0 10px rgba(57,255,20,0.1),  inset 0 0 14px rgba(0,0,0,0.7)';

  const panelBase: React.CSSProperties = {
    background: 'rgba(8,8,14,0.91)',
    border: `1px solid ${borderColor}`,
    boxShadow: outerGlow,
    backgroundImage:
      'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)',
    transition: 'border-color 0.18s, box-shadow 0.18s',
  };

  return (
    <div
      className="absolute pointer-events-none"
      style={{ top: 8, right: 8, width: 168, zIndex: 50 }}
    >
      {/* ── main panel ── */}
      {collapsed ? (
        /* ── collapsed: TENKS + level + toggle ── */
        <div
          style={{
            ...panelBase,
            padding: '5px 9px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
          }}
        >
          {/* TENKS mini */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              color: tenksFlash ? '#ffffff' : '#F5C842',
              textShadow: tenksFlash ? '0 0 10px #F5C842' : '0 0 4px rgba(245,200,66,0.2)',
              transition: 'color 0.18s, text-shadow 0.18s',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/sprites/icon_coin_64.png" alt="" width={10} height={10} style={{ imageRendering: 'auto' }} />
            {tenks !== null ? tenks.toLocaleString('es-AR') : '–'}
          </div>
          {/* level */}
          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: '#F5C842', opacity: 0.7 }}>
            {progression ? `LV${progression.level}` : 'LV–'}
          </span>
          {/* toggle */}
          <button
            onClick={toggleCollapsed}
            style={{
              pointerEvents: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0 2px',
              color: 'rgba(255,255,255,0.35)',
              fontSize: 8,
              lineHeight: 1,
              flexShrink: 0,
            }}
            title="Expandir HUD"
          >
            ▼
          </button>
        </div>
      ) : (
        /* ── expanded panel ── */
        <div
          style={{
            ...panelBase,
            padding: '7px 9px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          {/* ── row 1: username + level + toggle ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* username / status dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
              {playerInfo ? (
                <>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: '#39FF14',
                      boxShadow: '0 0 5px #39FF14',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: 6,
                      color: 'rgba(255,255,255,0.75)',
                      letterSpacing: '0.04em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 72,
                    }}
                  >
                    {playerInfo.username}
                  </span>
                </>
              ) : (
                <span
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: 6,
                    color: 'rgba(150,150,150,0.7)',
                    letterSpacing: '0.04em',
                  }}
                >
                  CARGANDO
                </span>
              )}
            </div>

            {/* level badge */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, flexShrink: 0 }}>
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 7,
                  color: '#F5C842',
                  textShadow: '0 0 8px rgba(245,200,66,0.5)',
                  letterSpacing: '0.03em',
                }}
              >
                {progression ? `LV${progression.level}` : 'LV–'}
              </span>
              <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: 'rgba(245,200,66,0.55)' }}>
                /{maxLvl}
              </span>
            </div>

            {/* toggle collapse */}
            <button
              onClick={toggleCollapsed}
              style={{
                pointerEvents: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 0 0 5px',
                color: 'rgba(255,255,255,0.3)',
                fontSize: 8,
                lineHeight: 1,
                flexShrink: 0,
              }}
              title="Colapsar HUD"
            >
              ▲
            </button>
          </div>

          {/* ── HP ── */}
          <div>
            <div
              style={{
                fontFamily: 'Silkscreen, "Press Start 2P", monospace',
                fontSize: 6,
                color: hpDamaged ? '#FF006E' : 'rgba(180,180,200,0.55)',
                marginBottom: 3,
                letterSpacing: '0.07em',
                transition: 'color 0.15s',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>HP</span>
              <span>{hp.hp}/{hp.maxHp}</span>
            </div>
            <Bar pct={hpPct} color={hpColor} glow={hpGlow} height={7} pulse={hpDamaged} />
          </div>

          {/* ── XP ── */}
          {progression && (
            <div>
              <div
                style={{
                  fontFamily: 'Silkscreen, "Press Start 2P", monospace',
                  fontSize: 6,
                  color: 'rgba(130,130,160,0.7)',
                  marginBottom: 3,
                  letterSpacing: '0.07em',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>XP</span>
                <span>
                  {progression.xp}
                  {progression.nextLevelAt !== null ? `/${progression.nextLevelAt}` : ' MAX'}
                </span>
              </div>
              <Bar pct={xpPct} color="#FF006E" glow="rgba(255,0,110,0.55)" height={4} />
            </div>
          )}

          {/* ── divider ── */}
          <div
            style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.15), transparent)',
            }}
          />

          {/* ── TENKS ── */}
          <div>
            {tenks !== null ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 8,
                  color: tenksFlash ? '#ffffff' : '#F5C842',
                  textShadow: tenksFlash
                    ? '0 0 14px #F5C842, 0 0 28px rgba(245,200,66,0.4)'
                    : '0 0 6px rgba(245,200,66,0.25)',
                  transition: 'color 0.18s, text-shadow 0.18s',
                  transform: tenksFlash ? 'scale(1.06)' : 'scale(1)',
                  transformOrigin: 'left center',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/sprites/icon_coin_64.png"
                  alt=""
                  width={12}
                  height={12}
                  style={{
                    imageRendering: 'auto',
                    filter: tenksFlash
                      ? 'brightness(1.4) drop-shadow(0 0 3px #F5C842)'
                      : 'none',
                    transition: 'filter 0.18s',
                  }}
                />
                {tenks.toLocaleString('es-AR')}
              </div>
            ) : (
              <div
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 7,
                  color: 'rgba(245,200,66,0.2)',
                }}
              >
                –
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── K/D badge — separado del panel principal ── */}
      {hasKD && (
        <div
          style={{
            marginTop: 3,
            background: 'rgba(8,8,14,0.82)',
            border: '1px solid rgba(70,179,255,0.2)',
            padding: '4px 9px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 6,
            color: '#46B3FF',
            textShadow: '0 0 6px rgba(70,179,255,0.35)',
            letterSpacing: '0.04em',
          }}
        >
          <span style={{ color: 'rgba(70,179,255,0.5)', fontSize: 5 }}>K</span>
          {combat.kills}
          <span style={{ color: 'rgba(70,179,255,0.3)' }}>/</span>
          <span style={{ color: 'rgba(70,179,255,0.5)', fontSize: 5 }}>D</span>
          {combat.deaths}
        </div>
      )}
    </div>
  );
}
