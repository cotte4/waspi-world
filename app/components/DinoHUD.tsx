'use client';

import { useEffect, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

interface DinoHudPayload {
  score: number;
  highScore: number;
}

interface DinoGameOverPayload {
  score: number;
}

interface HudState {
  score: number;
  highScore: number;
}

const DEFAULT_HUD: HudState = { score: 0, highScore: 0 };

export default function DinoHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [gameOver, setGameOver] = useState<DinoGameOverPayload | null>(null);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.DINO_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) {
        setHud(DEFAULT_HUD);
        setGameOver(null);
      }
    });

    const unsubHud = eventBus.on(EVENTS.DINO_HUD_UPDATE, (payload: unknown) => {
      setHud(payload as DinoHudPayload);
      setGameOver(null);
    });

    const unsubGameOver = eventBus.on(EVENTS.DINO_GAME_OVER, (payload: unknown) => {
      setGameOver(payload as DinoGameOverPayload);
    });

    return () => {
      unsubActive();
      unsubHud();
      unsubGameOver();
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Top-right: hi score + score */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 8, right: 8, zIndex: 60 }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.88)',
            border: '1px solid rgba(245,200,66,0.28)',
            padding: '7px 10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: '#888888',
              letterSpacing: '0.03em',
            }}
          >
            HI {String(hud.highScore).padStart(5, '0')}
          </span>
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: '#FFFFFF',
              letterSpacing: '0.03em',
            }}
          >
            {String(hud.score).padStart(5, '0')}
          </span>
        </div>
      </div>

      {/* Game over overlay */}
      {gameOver && (
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
              border: '2px solid rgba(255,0,110,0.6)',
              boxShadow: '0 0 32px rgba(255,0,110,0.18)',
              padding: '28px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              minWidth: 280,
            }}
          >
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 16,
                color: '#FF006E',
                textShadow: '0 0 16px rgba(255,0,110,0.6)',
                letterSpacing: '0.05em',
              }}
            >
              GAME OVER
            </span>
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 14,
                color: '#FFFFFF',
                letterSpacing: '0.04em',
              }}
            >
              {String(gameOver.score).padStart(5, '0')}
            </span>
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 7,
                color: '#888888',
                letterSpacing: '0.02em',
                marginTop: 4,
              }}
            >
              PRESS SPACE TO RETRY
            </span>
          </div>
        </div>
      )}
    </>
  );
}
