'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

export interface PvpHudPayload {
  bet: string;
  ready: string;
  roster: string;
  liveBoard: string;
  spectator: string;
  arenaStatus: string;
  hp: number;
  maxHp: number;
  lives: number;
  maxLives: number;
  notice: string;
  noticeColor: string;
  countdown: number;
  isSpectator: boolean;
}

interface HudState {
  bet: string;
  ready: string;
  roster: string;
  liveBoard: string;
  spectator: string;
  arenaStatus: string;
  hp: number;
  maxHp: number;
  lives: number;
  maxLives: number;
  notice: string;
  noticeColor: string;
  countdown: number;
  isSpectator: boolean;
}

const DEFAULT_HUD: HudState = {
  bet: '',
  ready: '',
  roster: '',
  liveBoard: '',
  spectator: '',
  arenaStatus: '',
  hp: 100,
  maxHp: 100,
  lives: 3,
  maxLives: 3,
  notice: '',
  noticeColor: '#39FF14',
  countdown: 0,
  isSpectator: false,
};

export default function PvpHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearNoticeTimer = useCallback(() => {
    if (noticeTimerRef.current !== undefined) {
      clearTimeout(noticeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.PVP_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) {
        setHud(DEFAULT_HUD);
        setNoticeVisible(false);
        clearNoticeTimer();
      }
    });

    const unsubHud = eventBus.on(EVENTS.PVP_HUD_UPDATE, (payload: unknown) => {
      const p = payload as PvpHudPayload;
      setHud(p);
      if (p.notice) {
        setNoticeVisible(true);
        clearNoticeTimer();
        noticeTimerRef.current = setTimeout(() => setNoticeVisible(false), 2200);
      }
    });

    return () => {
      unsubActive();
      unsubHud();
      clearNoticeTimer();
    };
  }, [clearNoticeTimer]);

  if (!visible) return null;

  const hpPct = hud.maxHp > 0 ? Math.max(0, Math.min(1, hud.hp / hud.maxHp)) : 0;
  const hpColor = hpPct > 0.55 ? '#46B3FF' : hpPct > 0.28 ? '#F5C842' : '#FF006E';
  const hpGlow = hpPct > 0.55 ? 'rgba(70,179,255,0.5)' : hpPct > 0.28 ? 'rgba(245,200,66,0.5)' : 'rgba(255,0,110,0.7)';

  const rosterLines = hud.roster.split('\n');
  const liveBoardLines = hud.liveBoard.split('\n');
  const spectatorLines = hud.spectator.split('\n');

  return (
    <>
      {/* ── Top-left panel: bet + ready + roster ── */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 8, left: 8, width: 210, zIndex: 60 }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.91)',
            border: '1px solid rgba(245,200,66,0.28)',
            boxShadow: '0 0 10px rgba(245,200,66,0.08), inset 0 0 14px rgba(0,0,0,0.7)',
            backgroundImage:
              'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)',
            padding: '7px 9px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          {/* Bet */}
          {hud.bet ? (
            <div
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 7,
                color: '#F5C842',
                textShadow: '0 0 6px rgba(245,200,66,0.4)',
                letterSpacing: '0.03em',
              }}
            >
              {hud.bet}
            </div>
          ) : null}

          {/* Ready */}
          {hud.ready ? (
            <div
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 7,
                color: '#B8D7FF',
                letterSpacing: '0.03em',
              }}
            >
              {hud.ready}
            </div>
          ) : null}

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(245,200,66,0.15), transparent)',
            }}
          />

          {/* Roster */}
          {rosterLines.map((line, i) => (
            <div
              key={i}
              style={{
                fontFamily: 'Silkscreen, "Press Start 2P", monospace',
                fontSize: i === 0 ? 6 : 5,
                color: i === 0 ? 'rgba(180,180,200,0.65)' : '#D6D7E0',
                letterSpacing: '0.04em',
                lineHeight: '1.5',
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* ── Top-right panel: live board + spectators ── */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 8, right: 8, width: 210, zIndex: 60 }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.91)',
            border: '1px solid rgba(70,179,255,0.22)',
            boxShadow: '0 0 10px rgba(70,179,255,0.06), inset 0 0 14px rgba(0,0,0,0.7)',
            backgroundImage:
              'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)',
            padding: '7px 9px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            textAlign: 'right',
          }}
        >
          {/* Live board */}
          {liveBoardLines.map((line, i) => (
            <div
              key={i}
              style={{
                fontFamily: i === 0 ? 'Silkscreen, "Press Start 2P", monospace' : '"Press Start 2P", monospace',
                fontSize: i === 0 ? 6 : 7,
                color: i === 0 ? 'rgba(180,180,200,0.65)' : '#F0F3FF',
                letterSpacing: '0.04em',
                lineHeight: '1.5',
              }}
            >
              {line}
            </div>
          ))}

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(70,179,255,0.15), transparent)',
            }}
          />

          {/* Spectators */}
          {spectatorLines.map((line, i) => (
            <div
              key={i}
              style={{
                fontFamily: 'Silkscreen, "Press Start 2P", monospace',
                fontSize: 5,
                color: '#9FC6FF',
                letterSpacing: '0.04em',
                lineHeight: '1.5',
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* ── Spectator mode indicator ── */}
      {hud.isSpectator && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 61,
          }}
        >
          <div
            style={{
              background: 'rgba(8,8,14,0.82)',
              border: '1px solid rgba(159,198,255,0.35)',
              padding: '6px 14px',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: '#9FC6FF',
              textShadow: '0 0 10px rgba(159,198,255,0.5)',
              letterSpacing: '0.05em',
            }}
          >
            ESPECTADOR
          </div>
        </div>
      )}

      {/* ── Arena status ── */}
      {hud.arenaStatus ? (
        <div
          className="absolute pointer-events-none"
          style={{
            top: 160,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
          }}
        >
          <div
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              color: '#8EA4BE',
              textShadow: '0 0 8px rgba(142,164,190,0.3)',
              letterSpacing: '0.04em',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {hud.arenaStatus}
          </div>
        </div>
      ) : null}

      {/* ── Bottom-left: HP bar ── */}
      <div
        className="absolute pointer-events-none"
        style={{ bottom: 44, left: 8, width: 180, zIndex: 60 }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.85)',
            border: `1px solid ${hpColor}22`,
            padding: '5px 8px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'Silkscreen, "Press Start 2P", monospace',
              fontSize: 5,
              color: 'rgba(180,180,200,0.55)',
              letterSpacing: '0.07em',
            }}
          >
            <span>HP</span>
            <span>{Math.max(0, Math.round(hud.hp))}/{hud.maxHp}</span>
          </div>
          <div
            style={{
              height: 7,
              background: 'rgba(0,0,0,0.55)',
              border: `1px solid ${hpColor}22`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${hpPct * 100}%`,
                background: hpColor,
                boxShadow: `0 0 6px ${hpGlow}`,
                transition: 'width 0.15s ease-out',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Bottom-center: lives ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: 44,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 60,
        }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.85)',
            border: '1px solid rgba(245,200,66,0.2)',
            padding: '5px 12px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {Array.from({ length: hud.maxLives }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: i < hud.lives ? '#F5C842' : 'rgba(245,200,66,0.15)',
                boxShadow: i < hud.lives ? '0 0 6px rgba(245,200,66,0.6)' : 'none',
                border: `1px solid ${i < hud.lives ? 'rgba(245,200,66,0.7)' : 'rgba(245,200,66,0.2)'}`,
                transition: 'background 0.2s, box-shadow 0.2s',
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Notice / announcement ── */}
      {noticeVisible && hud.notice ? (
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: 44,
            right: 8,
            zIndex: 60,
          }}
        >
          <div
            style={{
              background: 'rgba(8,8,14,0.88)',
              border: `1px solid ${hud.noticeColor}44`,
              padding: '5px 10px',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              color: hud.noticeColor,
              textShadow: `0 0 8px ${hud.noticeColor}80`,
              letterSpacing: '0.04em',
              maxWidth: 220,
              textAlign: 'right',
            }}
          >
            {hud.notice}
          </div>
        </div>
      ) : null}

      {/* ── Countdown 3-2-1-GO ── */}
      {hud.countdown > 0 ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span
            key={hud.countdown}
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 72,
              color: '#F5C842',
              textShadow: '0 0 32px rgba(245,200,66,0.8)',
              animation: 'pvp-countdown-pop 0.35s ease-out both',
            }}
          >
            {hud.countdown}
          </span>
          <style>{`
            @keyframes pvp-countdown-pop {
              from { transform: scale(1.6); opacity: 0; }
              to   { transform: scale(1);   opacity: 1; }
            }
          `}</style>
        </div>
      ) : null}
    </>
  );
}
