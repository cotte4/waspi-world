'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  setVirtualJoystickState,
  clearVirtualJoystickState,
} from '@/src/game/systems/ControlSettings';

export interface VirtualJoystickProps {
  visible: boolean;
}

interface JoystickUi {
  active: boolean;
  dx: number;
  dy: number;
}

export default function VirtualJoystick({ visible }: VirtualJoystickProps) {
  const [joystickUi, setJoystickUi] = useState<JoystickUi>({ active: false, dx: 0, dy: 0 });
  const joystickRef = useRef<HTMLDivElement>(null);

  const updateJoystickFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = joystickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const max = rect.width * 0.28;
    const rawDx = clientX - centerX;
    const rawDy = clientY - centerY;
    const distance = Math.hypot(rawDx, rawDy) || 1;
    const clamped = Math.min(max, distance);
    const dx = Number(((rawDx / distance) * (clamped / max)).toFixed(4));
    const dy = Number(((rawDy / distance) * (clamped / max)).toFixed(4));
    setJoystickUi({ active: true, dx, dy });
    setVirtualJoystickState({ active: true, dx, dy });
  }, []);

  const endJoystick = useCallback(() => {
    setJoystickUi({ active: false, dx: 0, dy: 0 });
    clearVirtualJoystickState();
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearVirtualJoystickState();
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Pulse animation for MOVE label when inactive */}
      <style>{`
        @keyframes vj-pulse {
          0%, 100% { opacity: 0.42; }
          50% { opacity: 0.18; }
        }
      `}</style>

      <div
        ref={joystickRef}
        onPointerDown={(event) => {
          (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
          updateJoystickFromPoint(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if ((event.buttons & 1) !== 1 && !joystickUi.active) return;
          updateJoystickFromPoint(event.clientX, event.clientY);
        }}
        onPointerUp={endJoystick}
        onPointerCancel={endJoystick}
        onPointerLeave={() => {
          if (!joystickUi.active) return;
          endJoystick();
        }}
        className="absolute left-4 bottom-16"
        style={{
          width: 144,
          height: 144,
          borderRadius: '999px',
          border: '2px solid rgba(70,179,255,0.25)',
          background: 'radial-gradient(circle at 50% 50%, rgba(70,179,255,0.08), rgba(0,0,0,0.35))',
          boxShadow: '0 18px 38px rgba(0,0,0,0.35)',
          touchAction: 'none',
          zIndex: 25,
          position: 'absolute',
        }}
      >
        {/* North indicator */}
        <div style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderBottom: '8px solid rgba(70,179,255,0.3)',
          pointerEvents: 'none',
        }} />
        {/* South indicator */}
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '8px solid rgba(70,179,255,0.3)',
          pointerEvents: 'none',
        }} />
        {/* West indicator */}
        <div style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 0,
          height: 0,
          borderTop: '5px solid transparent',
          borderBottom: '5px solid transparent',
          borderRight: '8px solid rgba(70,179,255,0.3)',
          pointerEvents: 'none',
        }} />
        {/* East indicator */}
        <div style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 0,
          height: 0,
          borderTop: '5px solid transparent',
          borderBottom: '5px solid transparent',
          borderLeft: '8px solid rgba(70,179,255,0.3)',
          pointerEvents: 'none',
        }} />

        {/* Gold thumb */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 56,
          height: 56,
          borderRadius: '999px',
          background: 'rgba(245,200,66,0.32)',
          border: '1px solid rgba(245,200,66,0.42)',
          transform: `translate(calc(-50% + ${joystickUi.dx * 34}px), calc(-50% + ${joystickUi.dy * 34}px))`,
          boxShadow: joystickUi.active
            ? '0 0 20px rgba(245,200,66,0.5)'
            : '0 0 10px rgba(245,200,66,0.2)',
          transition: joystickUi.active ? 'none' : 'box-shadow 0.2s ease',
          pointerEvents: 'none',
        }} />

        {/* MOVE label */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '8px',
          color: 'rgba(255,255,255,0.42)',
          pointerEvents: 'none',
          animation: joystickUi.active ? 'none' : 'vj-pulse 2s ease-in-out infinite',
        }}>
          MOVE
        </div>
      </div>
    </>
  );
}
