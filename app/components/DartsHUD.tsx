'use client';

import { useEffect, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

interface DartsHudPayload {
  score: number;
  turn: number;
  round: number;
  dartsInRound: number;
  bullseyes: number;
}

interface DartsResultPayload {
  score: number;
  bullseyes: number;
  tenksEarned: number;
}

interface HudState {
  score: number;
  turn: number;
  round: number;
  dartsInRound: number;
  bullseyes: number;
}

const DEFAULT_HUD: HudState = {
  score: 0,
  turn: 0,
  round: 1,
  dartsInRound: 0,
  bullseyes: 0,
};

export default function DartsHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [result, setResult] = useState<DartsResultPayload | null>(null);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.DARTS_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) {
        setHud(DEFAULT_HUD);
        setResult(null);
      }
    });

    const unsubHud = eventBus.on(EVENTS.DARTS_HUD_UPDATE, (payload: unknown) => {
      setHud(payload as DartsHudPayload);
      setResult(null);
    });

    const unsubResult = eventBus.on(EVENTS.DARTS_RESULT, (payload: unknown) => {
      setResult(payload as DartsResultPayload);
    });

    return () => {
      unsubActive();
      unsubHud();
      unsubResult();
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Top-left: score + round + darts + bullseyes */}
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
              color: '#F5C842',
              textShadow: '0 0 8px rgba(245,200,66,0.45)',
              letterSpacing: '0.03em',
            }}
          >
            SCORE {hud.score}
          </span>
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              color: '#FFFFFF',
              letterSpacing: '0.03em',
            }}
          >
            RONDA {hud.round}/3
          </span>
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              color: '#9a9ab8',
              letterSpacing: '0.03em',
            }}
          >
            DARDOS {hud.dartsInRound}/3
          </span>
          {hud.bullseyes > 0 && (
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 7,
                color: '#39FF14',
                textShadow: '0 0 6px rgba(57,255,20,0.5)',
                letterSpacing: '0.03em',
              }}
            >
              BULL {hud.bullseyes}
            </span>
          )}
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
              border: '2px solid rgba(245,200,66,0.45)',
              boxShadow: '0 0 24px rgba(245,200,66,0.12)',
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
                color: '#39FF14',
                textShadow: '0 0 16px rgba(57,255,20,0.6)',
                letterSpacing: '0.05em',
              }}
            >
              FINAL {result.score}
            </span>
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 9,
                color: '#F5C842',
                letterSpacing: '0.04em',
                textShadow: '0 0 10px rgba(245,200,66,0.55)',
              }}
            >
              +{result.tenksEarned} TENKS
            </span>
            {result.bullseyes > 0 && (
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 7,
                  color: '#39FF14',
                  letterSpacing: '0.04em',
                }}
              >
                BULLSEYES: {result.bullseyes}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
