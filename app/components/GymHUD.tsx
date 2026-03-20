'use client';

import { useEffect, useState, useRef } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

export interface GymHudPayload {
  bagPhase: 'idle' | 'active' | 'cooldown';
  bagPrompt: string;
  bagComboDisplay: string;
  benchPhase: 'idle' | 'active' | 'cooldown';
  benchPrompt: string;
  benchProgress: number;
  feedbackMsg: string;
  feedbackColor: string;
}

interface HudState {
  bagPrompt: string;
  bagComboDisplay: string;
  benchPhase: 'idle' | 'active' | 'cooldown';
  benchPrompt: string;
  benchProgress: number;
}

const DEFAULT_HUD: HudState = {
  bagPrompt: '',
  bagComboDisplay: '',
  benchPhase: 'idle',
  benchPrompt: '',
  benchProgress: 0,
};

interface FeedbackState {
  msg: string;
  color: string;
  key: number;
}

export default function GymHUD() {
  const [visible, setVisible] = useState(false);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const unsubActive = eventBus.on(EVENTS.GYM_SCENE_ACTIVE, (payload: unknown) => {
      const active = payload as boolean;
      setVisible(active);
      if (!active) {
        setHud(DEFAULT_HUD);
        setFeedback(null);
      }
    });

    const unsubHud = eventBus.on(EVENTS.GYM_HUD_UPDATE, (payload: unknown) => {
      const p = payload as GymHudPayload;
      setHud({
        bagPrompt: p.bagPrompt,
        bagComboDisplay: p.bagComboDisplay,
        benchPhase: p.benchPhase,
        benchPrompt: p.benchPrompt,
        benchProgress: p.benchProgress,
      });
      if (p.feedbackMsg) {
        clearTimeout(feedbackTimerRef.current);
        setFeedback({ msg: p.feedbackMsg, color: p.feedbackColor, key: Date.now() });
        feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1800);
      }
    });

    return () => {
      unsubActive();
      unsubHud();
      clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  if (!visible) return null;

  const benchPct = Math.max(0, Math.min(1, hud.benchProgress));
  const benchFillColor = benchPct >= 1 ? '#00FF88' : '#44AAFF';

  return (
    <>
      {/* ── Top-left panel: bag prompt + combo display ── */}
      {hud.bagPrompt ? (
        <div
          className="absolute pointer-events-none"
          style={{ top: 8, left: 8, zIndex: 60 }}
        >
          <div
            style={{
              background: 'rgba(8,8,14,0.88)',
              border: '1px solid rgba(255,68,68,0.35)',
              boxShadow: '0 0 10px rgba(255,68,68,0.10), inset 0 0 12px rgba(0,0,0,0.7)',
              padding: '6px 10px 7px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              minWidth: 140,
            }}
          >
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 7,
                color: '#FF4444',
                textShadow: '0 0 6px rgba(255,68,68,0.5)',
                letterSpacing: '0.03em',
              }}
            >
              {hud.bagPrompt}
            </span>
            {hud.bagComboDisplay ? (
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 8,
                  color: '#F5C842',
                  textShadow: '0 0 8px rgba(245,200,66,0.5)',
                  letterSpacing: '0.05em',
                }}
              >
                {hud.bagComboDisplay}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Bottom-center: bench prompt + progress bar ── */}
      {hud.benchPrompt ? (
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: 60,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            zIndex: 60,
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              color: '#44AAFF',
              textShadow: '0 0 8px rgba(68,170,255,0.5)',
              WebkitTextStroke: '1px rgba(0,0,0,0.7)',
              letterSpacing: '0.03em',
            }}
          >
            {hud.benchPrompt}
          </span>

          {hud.benchPhase === 'active' ? (
            <div
              style={{
                width: 160,
                height: 14,
                background: 'rgba(17,17,17,0.85)',
                border: `1px solid ${benchFillColor}`,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: '1px 1px 1px 1px',
                  width: `calc(${benchPct * 100}% - 2px)`,
                  background: benchFillColor,
                  boxShadow: `0 0 6px ${benchFillColor}88`,
                  transition: 'width 0.05s linear',
                }}
              />
              {/* Segment dividers at 25%, 50%, 75% */}
              {[25, 50, 75].map((pct) => (
                <div
                  key={pct}
                  style={{
                    position: 'absolute',
                    top: 1,
                    bottom: 1,
                    left: `${pct}%`,
                    width: 1,
                    background: 'rgba(13,16,32,0.7)',
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Center feedback flash ── */}
      {feedback ? (
        <div
          key={feedback.key}
          className="absolute pointer-events-none"
          style={{
            top: '28%',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 65,
            animation: 'gym-feedback-fade 1.6s ease-in forwards',
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 9,
              color: feedback.color,
              textShadow: `0 0 12px ${feedback.color}80`,
              WebkitTextStroke: '1px rgba(0,0,0,0.8)',
              letterSpacing: '0.04em',
            }}
          >
            {feedback.msg}
          </span>
          <style>{`
            @keyframes gym-feedback-fade {
              0%   { opacity: 1; transform: translateY(0); }
              30%  { opacity: 1; }
              100% { opacity: 0; transform: translateY(-28px); }
            }
          `}</style>
        </div>
      ) : null}
    </>
  );
}
