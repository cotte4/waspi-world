'use client';

import { useEffect, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

interface BasketHudPayload {
  score: number;
  streak: number;
  shot: number;
  totalShots: number;
}

interface BasketResultPayload {
  score: number;
  made: number;
  attempts: number;
}

interface HudState {
  score: number;
  streak: number;
  shot: number;
  totalShots: number;
}

const DEFAULT_HUD: HudState = {
  score: 0,
  streak: 0,
  shot: 1,
  totalShots: 10,
};

export default function BasketHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [result, setResult] = useState<BasketResultPayload | null>(null);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.BASKET_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) {
        setHud(DEFAULT_HUD);
        setResult(null);
      }
    });

    const unsubHud = eventBus.on(EVENTS.BASKET_HUD_UPDATE, (payload: unknown) => {
      setHud(payload as BasketHudPayload);
      setResult(null);
    });

    const unsubResult = eventBus.on(EVENTS.BASKET_RESULT, (payload: unknown) => {
      setResult(payload as BasketResultPayload);
    });

    return () => {
      unsubActive();
      unsubHud();
      unsubResult();
    };
  }, []);

  if (!visible) return null;

  const isPerfect = result && result.made === result.attempts;

  return (
    <>
      {/* Top-left: shot + streak */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 8, left: 8, zIndex: 60 }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.88)',
            border: '1px solid rgba(245,200,66,0.28)',
            padding: '7px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minWidth: 140,
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: '#FFFFFF',
              letterSpacing: '0.03em',
            }}
          >
            TIRO {hud.shot}/{hud.totalShots}
          </span>
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: hud.streak >= 3 ? '#FF6B00' : hud.streak >= 2 ? '#F5C842' : '#9a9ab8',
              letterSpacing: '0.03em',
              transition: 'color 0.15s',
            }}
          >
            RACHA {hud.streak}
            {hud.streak >= 4 ? ' 🔥' : ''}
          </span>
        </div>
      </div>

      {/* Top-right: score */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 8, right: 8, zIndex: 60 }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.88)',
            border: '1px solid rgba(245,200,66,0.28)',
            padding: '7px 10px',
            textAlign: 'right',
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: '#F5C842',
              textShadow: '0 0 8px rgba(245,200,66,0.45)',
              letterSpacing: '0.03em',
            }}
          >
            SCORE: {hud.score}
          </span>
        </div>
      </div>

      {/* Final result overlay */}
      {result && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'rgba(8,8,14,0.94)',
              border: `2px solid ${isPerfect ? 'rgba(57,255,20,0.6)' : 'rgba(245,200,66,0.45)'}`,
              boxShadow: isPerfect
                ? '0 0 40px rgba(57,255,20,0.2)'
                : '0 0 24px rgba(245,200,66,0.12)',
              padding: '28px 36px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              minWidth: 240,
            }}
          >
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 13,
                color: '#F5C842',
                textShadow: '0 0 16px rgba(245,200,66,0.6)',
                letterSpacing: '0.05em',
              }}
            >
              FINAL: {result.score} PTS
            </span>
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 9,
                color: isPerfect ? '#39FF14' : '#FFFFFF',
                letterSpacing: '0.04em',
              }}
            >
              {isPerfect ? 'PARTIDA PERFECTA!' : `${result.made}/${result.attempts} CANASTAS`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
