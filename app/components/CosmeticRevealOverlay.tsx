'use client';

import { useEffect, useState, useCallback } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import type { CosmeticDef } from '@/src/game/config/milestoneCosmetics';

// ── Slot display labels ───────────────────────────────────────────────────────
const SLOT_ICONS: Record<string, string> = {
  hat:     '▲',
  glasses: '⊡',
  aura:    '✦',
};

const SLOT_LABELS: Record<string, string> = {
  hat:     'HAT',
  glasses: 'GLASSES',
  aura:    'AURA',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function CosmeticRevealOverlay() {
  const [reveal, setReveal] = useState<CosmeticDef | null>(null);
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setReveal(null), 350);
  }, []);

  useEffect(() => {
    const unsub = eventBus.on(EVENTS.COSMETIC_UNLOCKED, (payload: unknown) => {
      const def = payload as CosmeticDef;
      if (!def?.id) return;
      setReveal(def);
      setVisible(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, dismiss]);

  if (!reveal) return null;

  const slotIcon = SLOT_ICONS[reveal.slot] ?? '◈';
  const slotLabel = SLOT_LABELS[reveal.slot] ?? reveal.slot.toUpperCase();

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(8,8,14,0.88)',
        backdropFilter: 'blur(3px)',
        transition: 'opacity 0.35s ease',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'all' : 'none',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 320,
          maxWidth: '90vw',
          background: '#0E0E14',
          border: `2px solid ${reveal.uiColor}`,
          boxShadow: `0 0 40px ${reveal.uiColor}44, 0 0 80px ${reveal.uiColor}22`,
          padding: '28px 24px 22px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          transform: visible ? 'scale(1)' : 'scale(0.88)',
          transition: 'transform 0.35s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        {/* Top badge */}
        <div style={{
          position: 'absolute',
          top: -13,
          background: '#0E0E14',
          padding: '2px 10px',
          border: `1px solid ${reveal.uiColor}`,
          fontFamily: '"Press Start 2P", monospace',
          fontSize: 7,
          color: reveal.uiColor,
          letterSpacing: '0.1em',
        }}>
          LOGRO DESBLOQUEADO
        </div>

        {/* Skill source */}
        <div style={{
          fontFamily: 'Silkscreen, monospace',
          fontSize: 9,
          color: 'rgba(170,170,170,0.6)',
          letterSpacing: '0.15em',
          marginTop: 4,
        }}>
          {reveal.skillLabel}
        </div>

        {/* Big cosmetic icon */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${reveal.uiColor}22 0%, transparent 70%)`,
          border: `2px solid ${reveal.uiColor}88`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          boxShadow: `0 0 24px ${reveal.uiColor}66`,
          animation: visible ? 'cosmeticPulse 2s ease-in-out infinite' : 'none',
        }}>
          {slotIcon}
        </div>

        {/* Cosmetic name */}
        <div style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: 11,
          color: reveal.uiColor,
          textAlign: 'center',
          lineHeight: 1.5,
          textShadow: `0 0 16px ${reveal.uiColor}`,
        }}>
          {reveal.label.toUpperCase()}
        </div>

        {/* Slot label */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'Silkscreen, monospace',
          fontSize: 8,
          color: 'rgba(200,200,200,0.7)',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '4px 10px',
        }}>
          <span>{slotIcon}</span>
          <span>SLOT: {slotLabel}</span>
        </div>

        {/* Hint */}
        <div style={{
          fontFamily: 'Silkscreen, monospace',
          fontSize: 7,
          color: 'rgba(130,130,130,0.55)',
          textAlign: 'center',
          lineHeight: 1.6,
        }}>
          Disponible en el creador de personaje
        </div>

        {/* CTA button */}
        <button
          onClick={dismiss}
          style={{
            marginTop: 4,
            padding: '9px 22px',
            background: `${reveal.uiColor}22`,
            border: `1px solid ${reveal.uiColor}`,
            color: reveal.uiColor,
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 8,
            cursor: 'pointer',
            outline: 'none',
            letterSpacing: '0.08em',
            transition: 'background .15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${reveal.uiColor}44`; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${reveal.uiColor}22`; }}
        >
          ACEPTAR
        </button>

        {/* Dismiss hint */}
        <div style={{
          fontFamily: 'Silkscreen, monospace',
          fontSize: 6,
          color: 'rgba(100,100,100,0.4)',
        }}>
          ESC · ENTER · CLICK
        </div>
      </div>

      {/* Pulse keyframe */}
      <style>{`
        @keyframes cosmeticPulse {
          0%, 100% { box-shadow: 0 0 24px ${reveal.uiColor}66; }
          50%       { box-shadow: 0 0 40px ${reveal.uiColor}99; }
        }
      `}</style>
    </div>
  );
}
