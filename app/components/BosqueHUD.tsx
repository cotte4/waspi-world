'use client';

import { useEffect, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

export interface BosqueHudPayload {
  materials: Record<string, number>;
  timeLeft?: number;
  prompt?: string;
}

interface HudState {
  materials: Record<string, number>;
  timeLeft: number | undefined;
  prompt: string;
}

const DEFAULT_HUD: HudState = {
  materials: {},
  timeLeft: undefined,
  prompt: '',
};

function formatMaterials(materials: Record<string, number>): string {
  const total = Object.values(materials).reduce((sum, n) => sum + n, 0);
  return `MATS: ${total}`;
}

export default function BosqueHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.BOSQUE_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) setHud(DEFAULT_HUD);
    });

    const unsubHud = eventBus.on(EVENTS.BOSQUE_HUD_UPDATE, (payload: unknown) => {
      const p = payload as BosqueHudPayload;
      setHud({
        materials: p.materials,
        timeLeft: p.timeLeft,
        prompt: p.prompt ?? '',
      });
    });

    return () => {
      unsubActive();
      unsubHud();
    };
  }, []);

  if (!visible) return null;

  const matsLine = formatMaterials(hud.materials);

  return (
    <>
      {/* ── Top-left: scene label + material counter ── */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 72, left: 8, width: 200, zIndex: 60 }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.88)',
            border: '1px solid rgba(57,255,20,0.25)',
            boxShadow: '0 0 10px rgba(57,255,20,0.06), inset 0 0 14px rgba(0,0,0,0.7)',
            backgroundImage:
              'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)',
            padding: '8px 10px 9px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          {/* Scene label */}
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 9,
              color: '#6FC86A',
              textShadow: '0 0 8px rgba(57,255,20,0.4)',
              letterSpacing: '0.03em',
            }}
          >
            BOSQUE
          </span>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.15), transparent)',
            }}
          />

          {/* Materials counter */}
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: '#B9FF9E',
              letterSpacing: '0.02em',
            }}
          >
            {matsLine}
          </span>

          {/* Timer — only shown when timeLeft is provided */}
          {hud.timeLeft !== undefined && (
            <span
              style={{
                fontFamily: 'Silkscreen, "Press Start 2P", monospace',
                fontSize: 7,
                color: hud.timeLeft <= 10 ? '#FF4444' : 'rgba(180,180,200,0.65)',
                letterSpacing: '0.04em',
              }}
            >
              {`⏱ ${hud.timeLeft}s`}
            </span>
          )}
        </div>
      </div>

      {/* ── Bottom-center: contextual interaction prompt ── */}
      {hud.prompt ? (
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
              color: '#F5C842',
              textShadow: '0 0 8px rgba(0,0,0,0.9)',
              WebkitTextStroke: '1px rgba(0,0,0,0.8)',
              letterSpacing: '0.03em',
              textAlign: 'center',
            }}
          >
            {hud.prompt}
          </span>
        </div>
      ) : null}
    </>
  );
}
