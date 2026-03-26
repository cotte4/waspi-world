'use client';

import { useEffect, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

interface PromptState {
  text: string;
  visible: boolean;
  color: string;
}

interface InteractionPromptPayload {
  text: string;
  visible: boolean;
  color: string;
}

export default function WorldHUD() {
  const [prompt, setPrompt] = useState<PromptState>({ text: '', visible: false, color: '#F5C842' });

  useEffect(() => {
    const unsub = eventBus.on(EVENTS.WORLD_INTERACTION_PROMPT, (payload: unknown) => {
      const p = payload as InteractionPromptPayload;
      setPrompt({ text: p.text, visible: p.visible, color: p.color });
    });
    return unsub;
  }, []);

  if (!prompt.visible || !prompt.text) return null;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        bottom: 48,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        animation: 'worldhud-bob 1.8s ease-in-out infinite',
      }}
    >
      <style>{`
        @keyframes worldhud-bob {
          0%, 100% { transform: translateX(-50%) translateY(0px); }
          50%       { transform: translateX(-50%) translateY(-4px); }
        }
      `}</style>
      <div
        style={{
          background: 'rgba(8,8,14,0.82)',
          border: `1px solid ${prompt.color}55`,
          boxShadow: `0 0 12px ${prompt.color}33`,
          padding: '6px 14px',
          fontFamily: '"Press Start 2P", monospace',
          fontSize: 9,
          color: prompt.color,
          textShadow: `0 0 8px ${prompt.color}88`,
          letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
          maxWidth: '280px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {prompt.text}
      </div>
    </div>
  );
}
