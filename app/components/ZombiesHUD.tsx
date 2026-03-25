'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

interface ZombiesHudPayload {
  wave: number;
  totalWaves: number;
  kills: number;
  enemiesLeft: number;
  score: number;
  hp: number;
  maxHp: number;
  weapon: string;
  ammoInMag: number;
  reserveAmmo: number;
  doublePointsLeft: number;
  instaKillLeft: number;
  status: string;
  weapons: string;
}

interface GameOverPayload {
  score: number;
  kills: number;
  wave: number;
}

interface HudState {
  wave: number;
  totalWaves: number;
  kills: number;
  enemiesLeft: number;
  score: number;
  hp: number;
  maxHp: number;
  weapon: string;
  ammoInMag: number;
  reserveAmmo: number;
  doublePointsLeft: number;
  instaKillLeft: number;
  status: string;
  weapons: string;
}

const DEFAULT_HUD: HudState = {
  wave: 0,
  totalWaves: 0,
  kills: 0,
  enemiesLeft: 0,
  score: 0,
  hp: 100,
  maxHp: 100,
  weapon: '',
  ammoInMag: 0,
  reserveAmmo: 0,
  doublePointsLeft: 0,
  instaKillLeft: 0,
  status: '',
  weapons: '',
};

export default function ZombiesHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [scoreFlash, setScoreFlash] = useState(false);
  const [hpFlash, setHpFlash] = useState(false);

  const prevScoreRef = useRef(0);
  const prevHpRef = useRef(100);
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hpTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current !== undefined) {
      clearTimeout(countdownTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.ZOMBIES_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) {
        setHud(DEFAULT_HUD);
        setCountdown(null);
        setGameOver(null);
        setScoreFlash(false);
        setHpFlash(false);
        prevScoreRef.current = 0;
        prevHpRef.current = 100;
      }
    });

    const unsubHud = eventBus.on(EVENTS.ZOMBIES_HUD_UPDATE, (payload: unknown) => {
      const p = payload as ZombiesHudPayload;
      setHud((prev) => {
        if (p.score > prev.score) {
          setScoreFlash(true);
          clearTimeout(scoreTimerRef.current);
          scoreTimerRef.current = setTimeout(() => setScoreFlash(false), 400);
        }
        if (p.hp < prev.hp) {
          setHpFlash(true);
          clearTimeout(hpTimerRef.current);
          hpTimerRef.current = setTimeout(() => setHpFlash(false), 350);
        }
        prevScoreRef.current = p.score;
        prevHpRef.current = p.hp;
        return p;
      });
      // If the scene is already in game-over but ZOMBIES_GAME_OVER event was never
      // emitted (e.g. instant death on scene launch), synthesize the overlay.
      if (p.status.includes('GAME OVER') && p.hp === 0) {
        setGameOver({ score: p.score, kills: p.kills, wave: p.wave });
      } else {
        setGameOver(null);
      }
    });

    const unsubCountdown = eventBus.on(EVENTS.ZOMBIES_COUNTDOWN, (payload: unknown) => {
      const p = payload as { count: number };
      setCountdown(p.count);
      clearCountdownTimer();
      if (p.count === 0) {
        countdownTimerRef.current = setTimeout(() => setCountdown(null), 800);
      }
    });

    const unsubGameOver = eventBus.on(EVENTS.ZOMBIES_GAME_OVER, (payload: unknown) => {
      setGameOver(payload as GameOverPayload);
      setCountdown(null);
    });

    return () => {
      unsubActive();
      unsubHud();
      unsubCountdown();
      unsubGameOver();
      clearTimeout(scoreTimerRef.current);
      clearTimeout(hpTimerRef.current);
      clearCountdownTimer();
    };
  }, [clearCountdownTimer]);

  if (!visible) return null;

  const hpPct = hud.maxHp > 0 ? Math.max(0, Math.min(1, hud.hp / hud.maxHp)) : 0;
  const hpColor = hpPct > 0.55 ? '#39FF14' : hpPct > 0.28 ? '#F5C842' : '#FF006E';
  const hpGlow = hpPct > 0.55 ? 'rgba(57,255,20,0.55)' : hpPct > 0.28 ? 'rgba(245,200,66,0.55)' : 'rgba(255,0,110,0.7)';

  return (
    <>
      {/* ── Top-left panel: round + score + hp ── */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 8, left: 8, width: 178, zIndex: 60 }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.91)',
            border: `1px solid ${hpFlash ? 'rgba(255,0,110,0.75)' : 'rgba(245,200,66,0.32)'}`,
            boxShadow: hpFlash
              ? '0 0 18px rgba(255,0,110,0.35), inset 0 0 14px rgba(0,0,0,0.7)'
              : '0 0 10px rgba(245,200,66,0.1), inset 0 0 14px rgba(0,0,0,0.7)',
            backgroundImage:
              'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)',
            transition: 'border-color 0.18s, box-shadow 0.18s',
            padding: '7px 9px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          {/* Wave */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 9,
                color: '#F5C842',
                textShadow: '0 0 8px rgba(245,200,66,0.5)',
                letterSpacing: '0.03em',
              }}
            >
              {hud.wave > 0 ? `ROUND ${hud.wave}` : 'ZOMBIES'}
            </span>
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 6,
                color: 'rgba(245,200,66,0.4)',
              }}
            >
              {hud.enemiesLeft > 0 ? `${hud.enemiesLeft} LEFT` : ''}
            </span>
          </div>

          {/* Score */}
          <div
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: scoreFlash ? '#ffffff' : '#9EFFB7',
              textShadow: scoreFlash
                ? '0 0 14px #9EFFB7, 0 0 28px rgba(158,255,183,0.4)'
                : '0 0 6px rgba(158,255,183,0.25)',
              transition: 'color 0.18s, text-shadow 0.18s',
              transform: scoreFlash ? 'scale(1.05)' : 'scale(1)',
              transformOrigin: 'left center',
            }}
          >
            PTS {hud.score.toLocaleString('es-AR')}
          </div>

          {/* HP bar */}
          <div>
            <div
              style={{
                fontFamily: 'Silkscreen, "Press Start 2P", monospace',
                fontSize: 5,
                color: hpFlash ? '#FF006E' : 'rgba(180,180,200,0.55)',
                marginBottom: 3,
                letterSpacing: '0.07em',
                transition: 'color 0.15s',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>HP</span>
              <span>{Math.max(0, Math.round(hud.hp))}/{hud.maxHp}</span>
            </div>
            <div
              style={{
                height: 7,
                background: 'rgba(0,0,0,0.55)',
                border: `1px solid ${hpFlash ? `${hpColor}60` : `${hpColor}22`}`,
                overflow: 'hidden',
                transition: 'border-color 0.2s',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${hpPct * 100}%`,
                  background: hpColor,
                  boxShadow: `0 0 ${hpFlash ? 10 : 6}px ${hpGlow}`,
                  transition: 'width 0.15s ease-out',
                }}
              />
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(245,200,66,0.15), transparent)',
            }}
          />

          {/* Status row */}
          {hud.status ? (
            <div
              style={{
                fontFamily: 'Silkscreen, "Press Start 2P", monospace',
                fontSize: 5,
                color: '#7CC9FF',
                letterSpacing: '0.05em',
                whiteSpace: 'pre-line',
                lineHeight: '1.5',
              }}
            >
              {hud.status}
            </div>
          ) : null}

          {/* Buffs */}
          {(hud.doublePointsLeft > 0 || hud.instaKillLeft > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {hud.doublePointsLeft > 0 && (
                <span
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: 5,
                    color: '#FFB36A',
                    textShadow: '0 0 6px rgba(255,179,106,0.5)',
                  }}
                >
                  2X PTS {hud.doublePointsLeft}s
                </span>
              )}
              {hud.instaKillLeft > 0 && (
                <span
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: 5,
                    color: '#FF006E',
                    textShadow: '0 0 6px rgba(255,0,110,0.5)',
                  }}
                >
                  INSTA KILL {hud.instaKillLeft}s
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom-right panel: weapon + ammo ── */}
      {hud.weapon && (
        <div
          className="absolute pointer-events-none"
          style={{ bottom: 50, right: 18, zIndex: 60, textAlign: 'right' }}
        >
          <div
            style={{
              background: 'rgba(8,8,14,0.85)',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: '6px 10px',
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 3,
            }}
          >
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 8,
                color: '#FFFFFF',
                letterSpacing: '0.04em',
              }}
            >
              {hud.weapon}
            </span>
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 7,
                color: hud.ammoInMag === 0 ? '#FF006E' : 'rgba(255,255,255,0.7)',
              }}
            >
              {hud.ammoInMag}
              <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 3px' }}>/</span>
              {hud.reserveAmmo}
            </span>
          </div>
          {hud.weapons && (
            <div
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 5,
                color: '#F5C842',
                marginTop: 4,
                letterSpacing: '0.04em',
              }}
            >
              {hud.weapons}
            </div>
          )}
        </div>
      )}

      {/* ── Countdown overlay ── */}
      {countdown !== null && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span
            key={countdown}
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: countdown === 0 ? 42 : 72,
              color: countdown === 0 ? '#39FF14' : '#F5C842',
              textShadow:
                countdown === 0
                  ? '0 0 32px rgba(57,255,20,0.8)'
                  : '0 0 32px rgba(245,200,66,0.8)',
              animation: 'zombies-countdown-pop 0.35s ease-out both',
            }}
          >
            {countdown === 0 ? 'GO!' : countdown}
          </span>
          <style>{`
            @keyframes zombies-countdown-pop {
              from { transform: scale(1.6); opacity: 0; }
              to   { transform: scale(1);   opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* ── Game over overlay ── */}
      {gameOver && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 80,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(14,14,20,0.72)',
          }}
        >
          <div
            style={{
              background: 'rgba(8,8,14,0.95)',
              border: '2px solid rgba(255,0,110,0.55)',
              boxShadow: '0 0 40px rgba(255,0,110,0.2)',
              padding: '32px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 18,
              minWidth: 260,
            }}
          >
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 18,
                color: '#FF006E',
                textShadow: '0 0 24px rgba(255,0,110,0.7)',
                letterSpacing: '0.06em',
              }}
            >
              GAME OVER
            </span>

            <div
              style={{
                height: 1,
                width: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,0,110,0.4), transparent)',
              }}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 24 }}>
                <Stat label="ROUND" value={String(gameOver.wave)} color="#F5C842" />
                <Stat label="KILLS" value={String(gameOver.kills)} color="#9EFFB7" />
              </div>
              <Stat label="SCORE" value={gameOver.score.toLocaleString('es-AR')} color="#FFFFFF" large />
            </div>

            <div
              style={{
                height: 1,
                width: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,0,110,0.2), transparent)',
              }}
            />

            <span
              style={{
                fontFamily: 'Silkscreen, "Press Start 2P", monospace',
                fontSize: 7,
                color: 'rgba(150,150,180,0.7)',
                letterSpacing: '0.05em',
                textAlign: 'center',
              }}
            >
              SPACE / INTERACT — REINICIAR
              <br />
              BACK — SALIR
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  color,
  large = false,
}: {
  label: string;
  value: string;
  color: string;
  large?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          fontFamily: 'Silkscreen, "Press Start 2P", monospace',
          fontSize: 5,
          color: 'rgba(180,180,200,0.55)',
          letterSpacing: '0.07em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: large ? 16 : 11,
          color,
          textShadow: `0 0 10px ${color}80`,
          letterSpacing: '0.03em',
        }}
      >
        {value}
      </span>
    </div>
  );
}
