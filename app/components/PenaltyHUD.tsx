'use client';

import { useEffect, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

interface PenaltyHudPayload {
  goals: number;
  shotsLeft: number;
  shotsTaken: number;
  maxShots: number;
}

interface HudState {
  goals: number;
  shotsLeft: number;
  shotsTaken: number;
  maxShots: number;
}

const DEFAULT_HUD: HudState = {
  goals: 0,
  shotsLeft: 5,
  shotsTaken: 0,
  maxShots: 5,
};

export default function PenaltyHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.PENALTY_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) {
        setHud(DEFAULT_HUD);
      }
    });

    const unsubHud = eventBus.on(EVENTS.PENALTY_HUD_UPDATE, (payload: unknown) => {
      setHud(payload as PenaltyHudPayload);
    });

    return () => {
      unsubActive();
      unsubHud();
    };
  }, []);

  if (!visible) return null;

  const pips = Array.from({ length: hud.maxShots }, (_, i) => {
    if (i < hud.shotsTaken) {
      const isGoal = i < hud.goals;
      return isGoal ? 'goal' : 'miss';
    }
    return 'pending';
  });

  return (
    <>
      {/* Top-left: goals + shots info */}
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
            gap: 5,
            minWidth: 150,
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: '#39FF14',
              textShadow: '0 0 8px rgba(57,255,20,0.4)',
              letterSpacing: '0.03em',
            }}
          >
            GOLES {hud.goals}
          </span>
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: '#FFFFFF',
              letterSpacing: '0.03em',
            }}
          >
            TIROS {hud.shotsTaken}/{hud.maxShots}
          </span>
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              color: '#9a9ab8',
              letterSpacing: '0.03em',
            }}
          >
            RESTAN {hud.shotsLeft}
          </span>

          {/* Shot pips */}
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {pips.map((state, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 8,
                  background:
                    state === 'goal'
                      ? '#39FF14'
                      : state === 'miss'
                      ? '#FF006E'
                      : 'rgba(60,60,80,0.9)',
                  border: '1px solid rgba(100,100,140,0.5)',
                  transition: 'background 0.2s',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
