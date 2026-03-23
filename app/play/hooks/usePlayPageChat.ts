import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject } from 'react';
import { CHAT } from '@/src/game/config/constants';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { mutePlayer, type PlayerState } from '@/src/lib/playerState';
import { supabase } from '@/src/lib/supabase';
import { CHAT_SCENES, INTERIOR_SOCIAL_SCENES } from '@/app/play/lib/playPageConstants';
import type { ChatMsg, PlayerActionsPayload, PlayerInfo, PresencePlayer } from '@/app/play/types';

type UsePlayPageChatOptions = {
  activeScene: string;
  applyPlayerState: (player: PlayerState) => void;
  chatBinding: string;
  inventoryBinding: string;
  jukeboxOpen: boolean;
  mutedPlayersRef: MutableRefObject<string[]>;
  playUiSfx: (freq: number, duration: number, sweep?: number) => void;
  playerState: PlayerState | null;
  setShopStatus: (status: string) => void;
  syncPlayerState: (overridePlayerState?: PlayerState) => Promise<void>;
  tokenRef: MutableRefObject<string | null>;
};

export function usePlayPageChat({
  activeScene,
  applyPlayerState,
  chatBinding,
  inventoryBinding,
  jukeboxOpen,
  mutedPlayersRef,
  playUiSfx,
  playerState,
  setShopStatus,
  syncPlayerState,
  tokenRef,
}: UsePlayPageChatOptions) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [lastSent, setLastSent] = useState(0);
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null);
  const [presencePlayers, setPresencePlayers] = useState<PresencePlayer[]>([]);
  const [playerActions, setPlayerActions] = useState<PlayerActionsPayload | null>(null);
  const [chatEnabled, setChatEnabled] = useState(true);
  const lastInteriorChatSentRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isChatScene = CHAT_SCENES.has(activeScene);
  const chatVisible = chatEnabled && isChatScene;

  const handleMutePlayer = useCallback(() => {
    if (!playerActions || !playerState) return;
    const next = mutePlayer(playerState, playerActions.playerId);
    applyPlayerState(next);
    void syncPlayerState();
    setMessages((prev) => prev.filter((msg) => msg.playerId !== playerActions.playerId));
    setPlayerActions(null);
    setShopStatus(`${playerActions.username} silenciado.`);
    eventBus.emit(EVENTS.PLAYER_ACTION_MUTE, { playerId: playerActions.playerId });
  }, [applyPlayerState, playerActions, playerState, setShopStatus, syncPlayerState]);

  const handleReportPlayer = useCallback(() => {
    if (!playerActions) return;

    void (async () => {
      if (!tokenRef.current) {
        setShopStatus('Inicia sesion para enviar reportes.');
        setPlayerActions(null);
        return;
      }

      const target = playerActions;
      setPlayerActions(null);

      const res = await fetch('/api/chat/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          playerId: target.playerId,
          username: target.username,
          reason: 'manual_report',
          zone: activeScene || null,
        }),
      }).catch(() => null);

      if (!res?.ok) {
        const json = await res?.json().catch(() => null);
        setShopStatus(json?.error ?? `No pude enviar el reporte para ${target.username}.`);
        return;
      }

      setShopStatus(`Reporte enviado para ${target.username}.`);
      eventBus.emit(EVENTS.PLAYER_ACTION_REPORT, { playerId: target.playerId, username: target.username });
    })();
  }, [activeScene, playerActions, setShopStatus, tokenRef]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (jukeboxOpen) return;

      if (isChatScene && e.code === 'KeyT' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        setChatEnabled((current) => {
          if (current) {
            inputRef.current?.blur();
          }
          return !current;
        });
        return;
      }

      if (!chatVisible) return;

      if (e.code === chatBinding && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }

      if (e.code === inventoryBinding && document.activeElement !== inputRef.current) {
        e.preventDefault();
        eventBus.emit(EVENTS.INVENTORY_TOGGLE);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [chatBinding, chatVisible, inventoryBinding, isChatScene, jukeboxOpen]);

  useEffect(() => {
    if (!chatVisible) {
      inputRef.current?.blur();
    }
  }, [chatVisible]);

  useEffect(() => {
    if (!playerInfo || !INTERIOR_SOCIAL_SCENES.has(activeScene)) return;

    if (!supabase) {
      const fallbackTimer = window.setTimeout(() => {
        setPresencePlayers([playerInfo]);
      }, 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    const channel = supabase.channel(`waspi-interior:${activeScene}`, {
      config: {
        presence: { key: playerInfo.playerId },
        broadcast: { self: false },
      },
    });

    const syncPresence = () => {
      const rawState = channel.presenceState();
      const nextPlayers = new Map<string, PresencePlayer>();

      Object.values(rawState).forEach((entries) => {
        const list = Array.isArray(entries) ? entries : [];
        list.forEach((entry) => {
          if (!entry || typeof entry !== 'object') return;
          const safeEntry = entry as Record<string, unknown>;
          const playerId = typeof safeEntry.playerId === 'string' ? safeEntry.playerId : '';
          const username = typeof safeEntry.username === 'string' ? safeEntry.username : '';
          if (!playerId || !username) return;
          nextPlayers.set(playerId, { playerId, username });
        });
      });

      nextPlayers.set(playerInfo.playerId, playerInfo);
      setPresencePlayers(Array.from(nextPlayers.values()));
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('broadcast', { event: 'player:chat' }, ({ payload }) => {
        const next = payload as { playerId?: string; username?: string; message?: string } | null;
        const playerId = next?.playerId;
        const username = next?.username;
        const message = next?.message;
        if (!playerId || !message || !username) return;
        if (mutedPlayersRef.current.includes(playerId)) return;

        setMessages((prev) => [
          ...prev.slice(-19),
          {
            id: `${Date.now()}-${Math.random()}`,
            playerId,
            username,
            message,
            isMe: false,
          },
        ]);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;

        await channel.track({
          playerId: playerInfo.playerId,
          username: playerInfo.username,
          scene: activeScene,
        });
        syncPresence();
      });

    const unsubscribeInteriorChat = eventBus.on(EVENTS.CHAT_SEND, (rawMessage: unknown) => {
      if (typeof rawMessage !== 'string') return;
      const now = Date.now();
      const trimmed = rawMessage.trim().slice(0, CHAT.MAX_CHARS);
      if (!trimmed || now - lastInteriorChatSentRef.current < CHAT.RATE_LIMIT_MS) return;

      const safeMessage = trimmed.replace(/\b(boludo|pelotudo|idiota|mierda|puta|puto)\b/gi, '***');
      eventBus.emit(EVENTS.CHAT_RECEIVED, {
        playerId: playerInfo.playerId,
        username: playerInfo.username,
        message: safeMessage,
        isMe: true,
      });
      lastInteriorChatSentRef.current = now;
      channel.send({
        type: 'broadcast',
        event: 'player:chat',
        payload: {
          playerId: playerInfo.playerId,
          username: playerInfo.username,
          message: safeMessage,
        },
      });
    });

    return () => {
      unsubscribeInteriorChat();
      void channel.untrack();
      void channel.unsubscribe();
    };
  }, [activeScene, mutedPlayersRef, playerInfo]);

  const sendMessage = useCallback(() => {
    const now = Date.now();
    const trimmed = input.trim().slice(0, CHAT.MAX_CHARS);
    if (!chatVisible || !trimmed || now - lastSent < CHAT.RATE_LIMIT_MS) return;

    playUiSfx(880, 0.08);
    eventBus.emit(EVENTS.CHAT_SEND, trimmed);
    setInput('');
    setLastSent(now);
  }, [chatVisible, input, lastSent, playUiSfx]);

  const handleInputKeyDown = useCallback((e: ReactKeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      sendMessage();
      e.preventDefault();
    }
    if (e.key === 'Escape') {
      setInput('');
      inputRef.current?.blur();
    }
  }, [sendMessage]);

  const handleInputFocus = useCallback(() => {
    eventBus.emit(EVENTS.CHAT_INPUT_FOCUS);
  }, []);

  const handleInputBlur = useCallback(() => {
    eventBus.emit(EVENTS.CHAT_INPUT_BLUR);
  }, []);

  return {
    chatEnabled,
    chatVisible,
    handleInputBlur,
    handleInputFocus,
    handleInputKeyDown,
    handleMutePlayer,
    handleReportPlayer,
    input,
    inputRef,
    isChatScene,
    logRef,
    messages,
    playerActions,
    playerInfo,
    presencePlayers,
    sendMessage,
    setInput,
    setMessages,
    setPlayerActions,
    setPlayerInfo,
    setPresencePlayers,
  };
}
