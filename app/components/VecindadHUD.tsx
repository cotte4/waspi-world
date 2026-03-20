'use client';

import { useEffect, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

const FARM_SLOTS = 6;

export interface VecindadHudPayload {
  materials: number;
  nextCost: number;
  stage: number;
  maxStage: number;
  ownedParcelId: string | undefined;
  cannabisFarmUnlocked: boolean;
  farmPlantsCount: number;
  prompt: string;
  promptColor: string;
}

interface HudState {
  materials: number;
  nextCost: number;
  stage: number;
  maxStage: number;
  ownedParcelId: string | undefined;
  cannabisFarmUnlocked: boolean;
  farmPlantsCount: number;
  prompt: string;
  promptColor: string;
}

const DEFAULT_HUD: HudState = {
  materials: 0,
  nextCost: 0,
  stage: 0,
  maxStage: 4,
  ownedParcelId: undefined,
  cannabisFarmUnlocked: false,
  farmPlantsCount: 0,
  prompt: '',
  promptColor: '#F5C842',
};

function buildProgressBar(mats: number, nextCost: number, stage: number, maxStage: number): string {
  if (stage >= maxStage) return '[██████████]';
  if (nextCost <= 0) return '[██████████]';
  const filled = Math.min(Math.floor((mats / nextCost) * 10), 10);
  return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + ']';
}

function buildObjective(ownedParcelId: string | undefined, stage: number, maxStage: number, nextCost: number): string {
  if (!ownedParcelId) return 'OBJETIVO: COMPRÁ UNA PARCELA';
  if (stage <= 0) return `OBJETIVO: FARMEA Y LEVANTÁ BASE (${nextCost} MATS)`;
  if (stage >= maxStage) return 'OBJETIVO: CASA COMPLETA';
  return `OBJETIVO: STAGE ${stage + 1} — ${nextCost} MATS`;
}

export default function VecindadHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.VECINDAD_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) {
        setHud(DEFAULT_HUD);
      }
    });

    const unsubHud = eventBus.on(EVENTS.VECINDAD_HUD_UPDATE, (payload: unknown) => {
      const p = payload as VecindadHudPayload;
      setHud({
        materials: p.materials,
        nextCost: p.nextCost,
        stage: p.stage,
        maxStage: p.maxStage,
        ownedParcelId: p.ownedParcelId,
        cannabisFarmUnlocked: p.cannabisFarmUnlocked,
        farmPlantsCount: p.farmPlantsCount,
        prompt: p.prompt,
        promptColor: p.promptColor,
      });
    });

    return () => {
      unsubActive();
      unsubHud();
    };
  }, []);

  if (!visible) return null;

  const progressBar = buildProgressBar(hud.materials, hud.nextCost, hud.stage, hud.maxStage);
  const matsLine = hud.stage >= hud.maxStage
    ? `MATS ${hud.materials} (MAX)`
    : `MATS ${hud.materials} / ${hud.nextCost} → STAGE ${hud.stage + 1}`;
  const farmLine = hud.cannabisFarmUnlocked
    ? `FARM ON | PLANTAS ${hud.farmPlantsCount}/${FARM_SLOTS}`
    : 'FARM LOCKED';
  const objective = buildObjective(hud.ownedParcelId, hud.stage, hud.maxStage, hud.nextCost);

  return (
    <>
      {/* ── Top-left: parcel info + materials + build progress ── */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 72, left: 8, width: 210, zIndex: 60 }}
      >
        <div
          style={{
            background: 'rgba(8,8,14,0.88)',
            border: '1px solid rgba(245,200,66,0.30)',
            boxShadow: '0 0 10px rgba(245,200,66,0.08), inset 0 0 14px rgba(0,0,0,0.7)',
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
              color: '#F5C842',
              textShadow: '0 0 8px rgba(245,200,66,0.5)',
              letterSpacing: '0.03em',
            }}
          >
            LA VECINDAD
          </span>

          {/* Parcela owned */}
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              color: hud.ownedParcelId ? '#B9FF9E' : 'rgba(180,180,200,0.55)',
              letterSpacing: '0.02em',
            }}
          >
            {hud.ownedParcelId ? `PARCELA ${hud.ownedParcelId}` : 'SIN PARCELA'}
          </span>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(245,200,66,0.15), transparent)',
            }}
          />

          {/* Materials line */}
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 6,
              color: '#B9FF9E',
              letterSpacing: '0.02em',
            }}
          >
            {matsLine}
          </span>

          {/* Progress bar */}
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 6,
              color: hud.stage >= hud.maxStage ? '#F5C842' : '#4ADE80',
              letterSpacing: '0.01em',
            }}
          >
            {progressBar}
          </span>

          {/* Stage */}
          <span
            style={{
              fontFamily: 'Silkscreen, "Press Start 2P", monospace',
              fontSize: 5,
              color: 'rgba(180,180,200,0.55)',
              letterSpacing: '0.07em',
            }}
          >
            {`STAGE ${hud.stage}/${hud.maxStage}${hud.stage >= hud.maxStage ? ' MAX' : ''}`}
          </span>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(245,200,66,0.15), transparent)',
            }}
          />

          {/* Farm status */}
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 5,
              color: hud.cannabisFarmUnlocked ? '#39FF14' : 'rgba(180,180,200,0.40)',
              letterSpacing: '0.02em',
            }}
          >
            {farmLine}
          </span>

          {/* Objective */}
          <span
            style={{
              fontFamily: 'Silkscreen, "Press Start 2P", monospace',
              fontSize: 5,
              color: 'rgba(180,180,200,0.6)',
              letterSpacing: '0.05em',
              lineHeight: '1.5',
              whiteSpace: 'pre-line',
            }}
          >
            {objective}
          </span>
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
              color: hud.promptColor,
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
