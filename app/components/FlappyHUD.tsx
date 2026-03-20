'use client';

import { useEffect, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

interface FlappyHudPayload {
  score: number;
  highScore: number;
}

interface FlappyGameOverPayload {
  score: number;
  highScore: number;
}

interface HudState {
  score: number;
  highScore: number;
}

const DEFAULT_HUD: HudState = { score: 0, highScore: 0 };

export default function FlappyHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [gameOver, setGameOver] = useState<FlappyGameOverPayload | null>(null);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.FLAPPY_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) {
        setHud(DEFAULT_HUD);
        setGameOver(null);
      }
    });

    const unsubHud = eventBus.on(EVENTS.FLAPPY_HUD_UPDATE, (payload: unknown) => {
      setHud(payload as FlappyHudPayload);
      setGameOver(null);
    });

    const unsubGameOver = eventBus.on(EVENTS.FLAPPY_GAME_OVER, (payload: unknown) => {
      setGameOver(payload as FlappyGameOverPayload);
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
      {/* Top-center: score */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 60 }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.88)',
            border: '1px solid rgba(245,200,66,0.28)',
            padding: '7px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 18,
              color: '#FFFFFF',
              textShadow: '0 0 8px rgba(255,255,255,0.3)',
              letterSpacing: '0.05em',
            }}
          >
            {hud.score}
          </span>
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              color: '#46B3FF',
              letterSpacing: '0.03em',
            }}
          >
            BEST: {hud.highScore}
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
              minWidth: 240,
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
                fontSize: 12,
                color: '#FFFFFF',
                letterSpacing: '0.04em',
              }}
            >
              SCORE: {gameOver.score}
            </span>
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 9,
                color: gameOver.score >= gameOver.highScore ? '#F5C842' : '#46B3FF',
                letterSpacing: '0.03em',
              }}
            >
              BEST: {gameOver.highScore}
              {gameOver.score >= gameOver.highScore ? ' NEW!' : ''}
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
              SPACE or CLICK to retry
            </span>
          </div>
        </div>
      )}
    </>
  );
}
