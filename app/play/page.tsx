'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { CHAT } from '@/src/game/config/constants';

const PhaserGame = dynamic(() => import('@/app/components/PhaserGame'), { ssr: false });

interface ChatMsg {
  id: string;
  username: string;
  message: string;
  isMe: boolean;
}

interface PlayerInfo {
  playerId: string;
  username: string;
}

export default function PlayPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [lastSent, setLastSent] = useState(0);
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for chat messages from the game
  useEffect(() => {
    const unsubChat = eventBus.on(EVENTS.CHAT_RECEIVED, (msg: unknown) => {
      const m = msg as Omit<ChatMsg, 'id'>;
      setMessages(prev => [
        ...prev.slice(-19),
        { ...m, id: `${Date.now()}-${Math.random()}` },
      ]);
    });

    const unsubInfo = eventBus.on(EVENTS.PLAYER_INFO, (info: unknown) => {
      setPlayerInfo(info as PlayerInfo);
      setConnected(true);
    });

    return () => {
      unsubChat();
      unsubInfo();
    };
  }, []);

  // Auto-scroll chat log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  // Global ENTER key to focus chat
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const sendMessage = useCallback(() => {
    const now = Date.now();
    const trimmed = input.trim().slice(0, CHAT.MAX_CHARS);
    if (!trimmed || now - lastSent < CHAT.RATE_LIMIT_MS) return;

    eventBus.emit(EVENTS.CHAT_SEND, trimmed);
    setInput('');
    setLastSent(now);
  }, [input, lastSent]);

  return (
    <div
      className="w-screen h-screen overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: '#0E0E14' }}
    >
      <div className="relative" style={{ width: 800, height: 600 }}>
        {/* Game canvas */}
        <PhaserGame />

        {/* HUD: top left — player info */}
        <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
          <div
            className="px-2 py-1 text-xs"
            style={{
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(245,200,66,0.4)',
              fontFamily: '"Press Start 2P", monospace',
              color: '#F5C842',
              fontSize: '7px',
            }}
          >
            {playerInfo ? playerInfo.username : 'CARGANDO...'}
          </div>
          {connected && (
            <div
              className="px-2 py-1 text-xs flex items-center gap-1"
              style={{
                background: 'rgba(0,0,0,0.7)',
                border: '1px solid rgba(57,255,20,0.3)',
                fontFamily: '"Press Start 2P", monospace',
                color: '#39FF14',
                fontSize: '7px',
              }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
              ONLINE
            </div>
          )}
        </div>

        {/* Controls hint */}
        <div
          className="absolute top-2 right-2 pointer-events-none"
          style={{
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '4px 8px',
            fontFamily: '"Press Start 2P", monospace',
            color: 'rgba(255,255,255,0.3)',
            fontSize: '6px',
            lineHeight: '1.8',
          }}
        >
          WASD / ↑↓←→ MOVER<br />
          ENTER CHATEAR
        </div>

        {/* Chat overlay */}
        <div className="absolute bottom-0 left-0 right-0">
          {/* Chat log */}
          <div
            ref={logRef}
            className="overflow-y-auto px-2 pt-1 pb-1"
            style={{
              maxHeight: '100px',
              background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.65))',
            }}
          >
            {messages.map(m => (
              <p
                key={m.id}
                style={{
                  fontFamily: '"Silkscreen", "Courier New", monospace',
                  fontSize: '10px',
                  lineHeight: '1.5',
                  color: 'rgba(255,255,255,0.75)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                }}
              >
                <span style={{ color: m.isMe ? '#F5C842' : '#88AAFF' }}>
                  {m.username}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>: </span>
                {m.message}
              </p>
            ))}
          </div>

          {/* Chat input */}
          <div className="px-2 pb-2 pt-0.5">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  sendMessage();
                  e.preventDefault();
                }
                if (e.key === 'Escape') {
                  setInput('');
                  inputRef.current?.blur();
                }
              }}
              onFocus={() => eventBus.emit(EVENTS.CHAT_INPUT_FOCUS)}
              onBlur={() => eventBus.emit(EVENTS.CHAT_INPUT_BLUR)}
              maxLength={CHAT.MAX_CHARS}
              placeholder="Presioná ENTER para chatear..."
              autoComplete="off"
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.75)',
                border: '1px solid rgba(245,200,66,0.3)',
                color: '#FFFFFF',
                fontFamily: '"Silkscreen", "Courier New", monospace',
                fontSize: '10px',
                padding: '7px 12px',
                outline: 'none',
                caretColor: '#F5C842',
              }}
              className="focus:border-[rgba(245,200,66,0.8)] transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
