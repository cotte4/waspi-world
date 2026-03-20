'use client';

import type { CSSProperties } from 'react';

export interface PlayerActionsOverlayProps {
  player: { playerId: string; username: string } | null;
  onMute: () => void;
  onReport: () => void;
  onClose: () => void;
}

const GOLD = '#F5C842';
const PINK = '#FF006E';
const MUTED = 'rgba(255,255,255,0.38)';

function cornerStyle(pos: { top?: number; bottom?: number; left?: number; right?: number }, color: string): CSSProperties {
  return {
    position: 'absolute',
    width: 10,
    height: 10,
    borderTop: pos.top !== undefined ? `2px solid ${color}` : undefined,
    borderBottom: pos.bottom !== undefined ? `2px solid ${color}` : undefined,
    borderLeft: pos.left !== undefined ? `2px solid ${color}` : undefined,
    borderRight: pos.right !== undefined ? `2px solid ${color}` : undefined,
    top: pos.top,
    bottom: pos.bottom,
    left: pos.left,
    right: pos.right,
    pointerEvents: 'none',
  };
}

function ActionButton({
  label,
  onClick,
  variant,
}: {
  label: string;
  onClick: () => void;
  variant: 'gold' | 'danger' | 'muted';
}) {
  const base: CSSProperties = {
    width: '100%',
    padding: '10px 0',
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '9px',
    letterSpacing: '0.06em',
    cursor: 'pointer',
    border: '1px solid',
    background: 'transparent',
    transition: 'opacity 0.15s',
  };

  const variants: Record<typeof variant, CSSProperties> = {
    gold: {
      background: GOLD,
      borderColor: GOLD,
      color: '#0E0E14',
    },
    danger: {
      background: 'transparent',
      borderColor: PINK,
      color: PINK,
      boxShadow: `0 0 8px ${PINK}22`,
    },
    muted: {
      background: 'rgba(255,255,255,0.06)',
      borderColor: 'rgba(255,255,255,0.16)',
      color: MUTED,
    },
  };

  return (
    <button
      onClick={onClick}
      style={{ ...base, ...variants[variant] }}
    >
      {label}
    </button>
  );
}

export default function PlayerActionsOverlay({
  player,
  onMute,
  onReport,
  onClose,
}: PlayerActionsOverlayProps) {
  if (!player) return null;

  return (
    <div
      className="ww-overlay absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', zIndex: 40 }}
    >
      <div
        className="ww-modal"
        style={{
          position: 'relative',
          width: 320,
          background: 'rgba(10,10,20,0.97)',
          border: `1px solid rgba(245,200,66,0.30)`,
          boxShadow: `0 0 24px rgba(245,200,66,0.08), 0 10px 40px rgba(0,0,0,0.55)`,
          padding: '20px 18px 18px',
        }}
      >
        {/* Corner decorations */}
        <span style={cornerStyle({ top: -2, left: -2 }, GOLD)} />
        <span style={cornerStyle({ top: -2, right: -2 }, GOLD)} />
        <span style={cornerStyle({ bottom: -2, left: -2 }, GOLD)} />
        <span style={cornerStyle({ bottom: -2, right: -2 }, GOLD)} />

        {/* Header */}
        <div style={{
          fontFamily: '"Press Start 2P", monospace',
          color: GOLD,
          fontSize: '9px',
          letterSpacing: '0.08em',
          marginBottom: 14,
        }}>
          ACCIONES
        </div>

        {/* Username */}
        <div style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: '18px',
          color: '#FFFFFF',
          marginBottom: 4,
          lineHeight: 1.2,
          wordBreak: 'break-word',
        }}>
          {player.username}
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: '12px',
          color: MUTED,
          marginBottom: 18,
        }}>
          Elige una accion de moderacion rapida.
        </div>

        {/* Divider */}
        <div style={{
          height: 1,
          background: 'rgba(245,200,66,0.12)',
          marginBottom: 14,
        }} />

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionButton label="SILENCIAR" onClick={onMute} variant="gold" />
          <ActionButton label="REPORTAR" onClick={onReport} variant="danger" />
          <ActionButton label="CANCELAR" onClick={onClose} variant="muted" />
        </div>
      </div>
    </div>
  );
}
