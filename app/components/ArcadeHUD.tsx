'use client';

import { useEffect, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

export interface ArcadeHudPayload {
  hintText: string;
  hintColor: string;
}

interface HudState {
  hintText: string;
  hintColor: string;
}

const DEFAULT_HUD: HudState = {
  hintText: '',
  hintColor: '#666666',
};

export default function ArcadeHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.ARCADE_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) {
        setHud(DEFAULT_HUD);
      }
    });

    const unsubHud = eventBus.on(EVENTS.ARCADE_HUD_UPDATE, (payload: unknown) => {
      const p = payload as ArcadeHudPayload;
      setHud({ hintText: p.hintText, hintColor: p.hintColor });
    });

    return () => {
      unsubActive();
      unsubHud();
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* ── Bottom-center: machine hint ── */}
      {hud.hintText ? (
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: 24,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 60,
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: hud.hintColor,
              textShadow: '0 0 8px rgba(0,0,0,0.9)',
              WebkitTextStroke: '1px rgba(0,0,0,0.7)',
              letterSpacing: '0.03em',
              textAlign: 'center',
              transition: 'color 0.18s',
            }}
          >
            {hud.hintText}
          </span>
        </div>
      ) : null}
    </>
  );
}
