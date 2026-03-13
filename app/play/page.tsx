'use client';

import dynamic from 'next/dynamic';
import { loadStripe } from '@stripe/stripe-js';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { CHAT } from '@/src/game/config/constants';
import { CATALOG, type CatalogItem } from '@/src/game/config/catalog';
import { getInventory, equipItem, hasUtilityEquipped, replaceInventory } from '@/src/game/systems/InventorySystem';
import { supabase } from '@/src/lib/supabase';
import { getTenksBalance, initTenks } from '@/src/game/systems/TenksSystem';
import { mutePlayer, type PlayerState } from '@/src/lib/playerState';
import type { TenksPack } from '@/src/lib/tenksPacks';

const PhaserGame = dynamic(() => import('@/app/components/PhaserGame'), { ssr: false });
const AVATAR_STORAGE_KEY = 'waspi_avatar_config';
const PLAYER_STATE_STORAGE_KEY = 'waspi_player_state';

interface ChatMsg {
  id: string;
  playerId: string;
  username: string;
  message: string;
  isMe: boolean;
}

interface PlayerInfo {
  playerId: string;
  username: string;
}

interface PresencePlayer {
  playerId: string;
  username: string;
}

type ShopTab = 'products' | 'tenks';

interface ShopOpenPayload {
  tab?: ShopTab;
  itemId?: string;
  source?: string;
}

interface PenaltyResultPayload {
  won: boolean;
  goals: number;
  shots: number;
}

interface PlayerActionsPayload {
  playerId: string;
  username: string;
}

const CHAT_SCENES = new Set(['WorldScene', 'StoreInterior', 'CafeInterior', 'ArcadeInterior', 'HouseInterior']);

export default function PlayPage() {
  const initialInventory = useMemo(() => getInventory(), []);
  const initialCheckout = useMemo(() => getInitialCheckoutState(), []);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [lastSent, setLastSent] = useState(0);
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [presencePlayers, setPresencePlayers] = useState<PresencePlayer[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [tenks, setTenks] = useState<number | null>(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [smoking, setSmoking] = useState(false);
  const [owned, setOwned] = useState<string[]>(initialInventory.owned);
  const [equipped, setEquipped] = useState<{ top?: string; bottom?: string }>(initialInventory.equipped);
  const [gunOn, setGunOn] = useState((initialInventory.equipped.utility ?? []).includes('UTIL-GUN-01'));
  const [ballOn, setBallOn] = useState((initialInventory.equipped.utility ?? []).includes('UTIL-BALL-01'));
  const [activeScene, setActiveScene] = useState('');
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [authPanelOpen, setAuthPanelOpen] = useState(true);
  const [uiNotice, setUiNotice] = useState('');
  const [shopOpen, setShopOpen] = useState(initialCheckout.open);
  const [shopTab, setShopTab] = useState<ShopTab>(initialCheckout.tab);
  const [shopItems, setShopItems] = useState<CatalogItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [tenksPacks, setTenksPacks] = useState<TenksPack[]>([]);
  const [checkoutBusyId, setCheckoutBusyId] = useState<string | null>(null);
  const [shopStatus, setShopStatus] = useState(initialCheckout.status);
  const [isMobile, setIsMobile] = useState(false);
  const [playerActions, setPlayerActions] = useState<PlayerActionsPayload | null>(null);
  const tokenRef = useRef<string | null>(null);
  const mutedPlayersRef = useRef<string[]>(loadStoredMutedPlayers());
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatVisible = CHAT_SCENES.has(activeScene);
  const isAuthenticated = Boolean(authEmail);

  const physicalItems = useMemo(
    () => (shopItems.length ? shopItems : CATALOG).filter((item) => typeof item.priceArs === 'number'),
    [shopItems]
  );

  const applyPlayerState = useCallback((player: PlayerState) => {
    saveStoredAvatarConfig({
      ...loadStoredAvatarConfig(),
      ...player.avatar,
    });
    saveStoredMutedPlayers(player.mutedPlayers ?? []);
    replaceInventory(player.inventory);
    initTenks(player.tenks);
    mutedPlayersRef.current = player.mutedPlayers ?? [];
    setPlayerState(player);
    setOwned(player.inventory.owned);
    setEquipped(player.inventory.equipped);
    setGunOn((player.inventory.equipped.utility ?? []).includes('UTIL-GUN-01'));
    setBallOn((player.inventory.equipped.utility ?? []).includes('UTIL-BALL-01'));
    setTenks(player.tenks);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const unsubChat = eventBus.on(EVENTS.CHAT_RECEIVED, (msg: unknown) => {
      const m = msg as Omit<ChatMsg, 'id'>;
      if (!m.isMe && mutedPlayersRef.current.includes(m.playerId)) return;
      setMessages((prev) => [
        ...prev.slice(-19),
        { ...m, id: `${Date.now()}-${Math.random()}` },
      ]);
    });

    const unsubInfo = eventBus.on(EVENTS.PLAYER_INFO, (info: unknown) => {
      const next = info as PlayerInfo;
      setPlayerInfo(next);
      setPresencePlayers((prev) => {
        const filtered = prev.filter((player) => player.playerId !== next.playerId);
        return [{ playerId: next.playerId, username: next.username }, ...filtered];
      });
      setConnected(true);
    });

    const unsubPresence = eventBus.on(EVENTS.PLAYER_PRESENCE, (payload: unknown) => {
      const players = Array.isArray(payload)
        ? (payload as PresencePlayer[])
        : [];
      setPresencePlayers(players);
    });

    const unsubTenks = eventBus.on(EVENTS.TENKS_CHANGED, (payload: unknown) => {
      const p = payload as { balance: number };
      setTenks(p.balance);
    });

    const unsubScene = eventBus.on(EVENTS.SCENE_CHANGED, (sceneName: unknown) => {
      if (typeof sceneName === 'string') setActiveScene(sceneName);
    });

    const unsubInv = eventBus.on(EVENTS.INVENTORY_TOGGLE, () => {
      setInventoryOpen((v) => !v);
    });

    const unsubInvChanged = eventBus.on(EVENTS.INVENTORY_CHANGED, (payload: unknown) => {
      const p = payload as { owned: string[]; equipped: { top?: string; bottom?: string } };
      setOwned(p.owned ?? []);
      setEquipped(p.equipped ?? {});
      setGunOn(hasUtilityEquipped('UTIL-GUN-01'));
      setBallOn(hasUtilityEquipped('UTIL-BALL-01'));
    });

    const unsubShopOpen = eventBus.on(EVENTS.SHOP_OPEN, (payload: unknown) => {
      const next = (payload as ShopOpenPayload | undefined) ?? {};
      setShopTab(next.tab ?? 'products');
      if (next.itemId) setSelectedProductId(next.itemId);
      setShopOpen(true);
      setShopStatus(next.source === 'store_interior' ? 'Elegi talle y completa el checkout.' : '');
    });

    const unsubShopClose = eventBus.on(EVENTS.SHOP_CLOSE, () => {
      setShopOpen(false);
    });

    const unsubPlayerActions = eventBus.on(EVENTS.PLAYER_ACTIONS_OPEN, (payload: unknown) => {
      const next = payload as PlayerActionsPayload | null;
      setPlayerActions(next);
    });

    const unsubPenalty = eventBus.on(EVENTS.PENALTY_RESULT, (payload: unknown) => {
      const result = payload as PenaltyResultPayload;
      if (!result?.won) return;
      if (!tokenRef.current) {
        setUiNotice('Ganaste el minijuego. Inicia sesion para guardar el descuento.');
        return;
      }

      void (async () => {
        const res = await fetch('/api/minigames/penalty/reward', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: JSON.stringify({
            goals: result.goals,
            shots: result.shots,
          }),
        }).catch(() => null);

        if (!res?.ok) {
          setShopStatus('Ganaste el minijuego, pero no pude guardar el premio todavia.');
          setUiNotice('Ganaste el minijuego, pero el premio no se guardo todavia.');
          return;
        }

        const json = await res.json();
        if (json.player) {
          applyPlayerState(json.player as PlayerState);
        }
        if (json.reward?.code) {
          setDiscountCodeInput(json.reward.code as string);
          setShopStatus(`Ganaste ${json.reward.percentOff}% OFF. Codigo: ${json.reward.code}`);
          setUiNotice(`Premio guardado: ${json.reward.percentOff}% OFF · Codigo ${json.reward.code}`);
        }
      })();
    });

    return () => {
      unsubChat();
      unsubInfo();
      unsubPresence();
      unsubTenks();
      unsubScene();
      unsubInv();
      unsubInvChanged();
      unsubShopOpen();
      unsubShopClose();
      unsubPlayerActions();
      unsubPenalty();
    };
  }, [applyPlayerState]);

  useEffect(() => {
    if (!uiNotice) return;
    const timer = window.setTimeout(() => setUiNotice(''), 4200);
    return () => window.clearTimeout(timer);
  }, [uiNotice]);

  const hydratePlayerState = useCallback(async (session: Session | null) => {
    if (!session?.access_token) {
      tokenRef.current = null;
      setAuthEmail(session?.user?.email ?? null);
      setAuthPanelOpen(true);
      return;
    }

    tokenRef.current = session.access_token;
    setAuthEmail(session.user.email ?? null);
    setAuthPanelOpen(false);

    const res = await fetch('/api/player', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (!res.ok) return;
    const json = await res.json();
    const player = json.player as PlayerState | undefined;
    if (player) applyPlayerState(player);
  }, [applyPlayerState]);

  const refreshPlayerState = useCallback(async () => {
    let token = tokenRef.current;
    if (!token && supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
      if (data.session) {
        tokenRef.current = data.session.access_token;
        setAuthEmail(data.session.user.email ?? null);
      }
    }
    if (!token) return;

    const res = await fetch('/api/player', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => null);

    if (!res?.ok) return;
    const json = await res.json();
    const player = json.player as PlayerState | undefined;
    if (player) applyPlayerState(player);
  }, [applyPlayerState]);

  useEffect(() => {
    if (!supabase) return;
    const supabaseClient = supabase;

    let active = true;
    const bootstrap = async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (!active) return;
      await hydratePlayerState(data.session ?? null);
    };
    bootstrap();

    const { data } = supabaseClient.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
      void hydratePlayerState(session);
      setAuthBusy(false);
      if (event === 'SIGNED_IN') {
        setAuthStatus('Sesion iniciada.');
        setAuthPanelOpen(false);
      } else if (event === 'SIGNED_OUT') {
        setAuthStatus('Sesion cerrada.');
        setAuthPanelOpen(true);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [hydratePlayerState]);

  useEffect(() => {
    if (!initialCheckout.status) return;
    const delays = [1500, 5000, 12000];
    const timers = delays.map((delay) => window.setTimeout(() => {
      void refreshPlayerState();
    }, delay));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [initialCheckout.status, refreshPlayerState]);

  const syncPlayerState = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;

    await fetch('/api/player', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        player: {
          tenks: getTenksBalance(),
          inventory: getInventory(),
          avatar: loadStoredAvatarConfig(),
        } satisfies PlayerState,
      }),
    }).catch(() => undefined);
  }, []);

  const sendMagicLink = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('Supabase no esta configurado.');
      return;
    }

    const email = emailInput.trim();
    if (!email) {
      setAuthStatus('Escribi tu email primero.');
      return;
    }

    setAuthBusy(true);
    setAuthStatus('');
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/play` : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setAuthBusy(false);
    setAuthStatus(error ? error.message : 'Magic link enviado. Revisa tu mail.');
  }, [emailInput]);

  const signInWithProvider = useCallback(async (provider: 'google' | 'discord') => {
    if (!supabase) {
      setAuthStatus('Supabase no esta configurado.');
      return;
    }

    setAuthBusy(true);
    setAuthStatus('');
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/play` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      setAuthBusy(false);
      setAuthStatus(error.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setAuthBusy(true);
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);
    if (error) {
      setAuthStatus(error.message);
      return;
    }
    tokenRef.current = null;
    setAuthEmail(null);
    setAuthStatus('Sesion cerrada.');
    setAuthPanelOpen(true);
  }, []);

  const ensureStripe = useCallback(async () => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      setCheckoutBusyId(null);
      setShopStatus('Falta NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.');
      return null;
    }

    const stripeJs = await loadStripe(publishableKey);
    if (!stripeJs) {
      setCheckoutBusyId(null);
      setShopStatus('No se pudo inicializar Stripe.');
      return null;
    }
    return stripeJs;
  }, []);

  const createCheckout = useCallback(async (body: object, busyId: string, missingAuthMessage: string) => {
    if (!tokenRef.current) {
      setShopStatus(missingAuthMessage);
      return;
    }

    setCheckoutBusyId(busyId);
    setShopStatus('');

    const stripeReady = await ensureStripe();
    if (!stripeReady) return;

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!res?.ok) {
      const json = await res?.json().catch(() => null);
      setCheckoutBusyId(null);
      setShopStatus(json?.error ?? 'No se pudo crear el checkout.');
      return;
    }

    const json = await res.json();
    if (json.url) {
      window.location.href = json.url as string;
      return;
    }

    setCheckoutBusyId(null);
    setShopStatus('Respuesta invalida de checkout.');
  }, [ensureStripe]);

  const startTenksCheckout = useCallback(async (packId: string) => {
    await createCheckout(
      { type: 'tenks_pack', packId },
      packId,
      'Inicia sesion para acreditar TENKS en tu cuenta.'
    );
  }, [createCheckout]);

  const startProductCheckout = useCallback(async (item: CatalogItem) => {
    const size = selectedSizes[item.id];
    if (!size) {
      setShopStatus('Selecciona un talle antes de comprar.');
      return;
    }

    await createCheckout(
      { type: 'product', itemId: item.id, size, discountCode: discountCodeInput.trim() || undefined },
      item.id,
      'Inicia sesion para comprar prendas y recibirlas en tu inventario.'
    );
  }, [createCheckout, discountCodeInput, selectedSizes]);

  const handleMutePlayer = useCallback(() => {
    if (!playerActions || !playerState) return;
    const next = mutePlayer(playerState, playerActions.playerId);
    applyPlayerState(next);
    void syncPlayerState();
    setMessages((prev) => prev.filter((msg) => msg.playerId !== playerActions.playerId));
    setPlayerActions(null);
    setShopStatus(`${playerActions.username} silenciado.`);
    eventBus.emit(EVENTS.PLAYER_ACTION_MUTE, { playerId: playerActions.playerId });
  }, [applyPlayerState, playerActions, playerState, syncPlayerState]);

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
  }, [activeScene, playerActions]);

  useEffect(() => {
    const unsubTenks = eventBus.on(EVENTS.TENKS_CHANGED, () => {
      void syncPlayerState();
    });
    const unsubInventory = eventBus.on(EVENTS.INVENTORY_CHANGED, () => {
      void syncPlayerState();
    });
    const unsubAvatar = eventBus.on(EVENTS.AVATAR_SET, () => {
      void syncPlayerState();
    });

    return () => {
      unsubTenks();
      unsubInventory();
      unsubAvatar();
    };
  }, [syncPlayerState]);

  useEffect(() => {
    if (!CHAT_SCENES.has(activeScene)) return;
    void syncPlayerState();
  }, [activeScene, syncPlayerState]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const res = await fetch('/api/shop').catch(() => null);
      if (!res?.ok) return;
      const json = await res.json();
      if (!active) return;
      const items = (json.items ?? []) as CatalogItem[];
      setShopItems(items);
      setTenksPacks((json.tenksPacks ?? []) as TenksPack[]);
      setSelectedSizes((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (!next[item.id] && item.sizes?.[0]) {
            next[item.id] = item.sizes[0];
          }
        }
        return next;
      });
      if (!selectedProductId) {
        const first = items.find((item) => typeof item.priceArs === 'number');
        if (first) setSelectedProductId(first.id);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [selectedProductId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!chatVisible) return;
      if (e.key === 'Enter' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key.toLowerCase() === 'i' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        eventBus.emit(EVENTS.INVENTORY_TOGGLE);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [chatVisible]);

  useEffect(() => {
    if (!chatVisible) {
      inputRef.current?.blur();
    }
  }, [chatVisible]);

  const sendMessage = useCallback(() => {
    const now = Date.now();
    const trimmed = input.trim().slice(0, CHAT.MAX_CHARS);
    if (!chatVisible || !trimmed || now - lastSent < CHAT.RATE_LIMIT_MS) return;

    eventBus.emit(EVENTS.CHAT_SEND, trimmed);
    setInput('');
    setLastSent(now);
  }, [chatVisible, input, lastSent]);

  return (
    <div
      className="w-screen h-screen overflow-hidden flex items-center justify-center"
      style={{
        backgroundColor: '#02030A',
        backgroundImage: 'radial-gradient(circle at top, rgba(245,200,66,0.12), transparent 55%)',
      }}
    >
      <div
        className="relative"
        style={{
          width: isMobile ? '100%' : 800,
          height: isMobile ? '100%' : 600,
          borderRadius: isMobile ? 0 : 18,
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
          border: '1px solid rgba(245,200,66,0.25)',
          background: 'radial-gradient(circle at top, #161623 0, #05050A 55%)',
        }}
      >
        <PhaserGame />

        <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
          <div className="px-2 py-1 text-xs" style={hudBadge('#F5C842', 'rgba(245,200,66,0.4)')}>
            {playerInfo ? playerInfo.username : 'CARGANDO...'}
          </div>
          {connected && (
            <div className="px-2 py-1 text-xs flex items-center gap-1" style={hudBadge('#39FF14', 'rgba(57,255,20,0.3)')}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
              ONLINE
            </div>
          )}
          {tenks !== null && (
            <div className="px-2 py-1 text-xs" style={hudBadge('#F5C842', 'rgba(245,200,66,0.4)')}>
              TENKS {tenks}
            </div>
          )}
        </div>

        <div
          className="absolute top-12 left-2"
          style={{
            width: 172,
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(57,255,20,0.22)',
            padding: '6px 8px',
            boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
          }}
        >
          <div
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '7px',
              color: '#39FF14',
              marginBottom: 6,
            }}
          >
            CONECTADOS {presencePlayers.length}
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {presencePlayers.slice(0, 6).map((player) => (
              <div
                key={player.playerId}
                style={{
                  fontFamily: '"Silkscreen", monospace',
                  fontSize: '11px',
                  color: player.playerId === playerInfo?.playerId ? '#F5C842' : 'rgba(255,255,255,0.8)',
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {player.playerId === playerInfo?.playerId ? 'TU ' : '• '} {player.username}
              </div>
            ))}
            {presencePlayers.length === 0 && (
              <div
                style={{
                  fontFamily: '"Silkscreen", monospace',
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.45)',
                }}
              >
                Solo vos por ahora.
              </div>
            )}
          </div>
        </div>

        <div
          className="absolute top-2 right-2 pointer-events-none"
          style={{
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '4px 8px',
            fontFamily: '"Press Start 2P", monospace',
            color: 'rgba(255,255,255,0.3)',
            fontSize: isMobile ? '5px' : '6px',
            lineHeight: '1.8',
          }}
        >
          WASD / FLECHAS MOVER<br />
          {chatVisible ? 'ENTER CHATEAR' : 'ENTER CHAT OFF'}<br />
          I INVENTARIO
        </div>

        <button
          onClick={() => {
            setShopTab('tenks');
            setShopOpen(true);
          }}
          className="absolute right-2 top-16"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '8px',
            padding: '8px 10px',
            background: '#F5C842',
            color: '#0E0E14',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          SHOP
        </button>

        <div
          className="absolute top-20 right-2"
          style={{
            width: authPanelOpen ? 228 : 132,
            background: 'rgba(0,0,0,0.78)',
            border: '1px solid rgba(245,200,66,0.18)',
            padding: authPanelOpen ? '8px' : '6px 8px',
            boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: authPanelOpen ? 8 : 0 }}>
            <div
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '7px',
                color: '#F5C842',
              }}
            >
              {isAuthenticated ? 'CUENTA CONECTADA' : 'LOGIN OPCIONAL'}
            </div>
            {isAuthenticated && (
              <button
                onClick={() => setAuthPanelOpen((value) => !value)}
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '7px',
                  color: '#BBBBBB',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {authPanelOpen ? 'OCULTAR' : '+'}
              </button>
            )}
          </div>

          {authPanelOpen ? (
            <>
              {isAuthenticated ? (
                <div>
                  <div
                    style={{
                      fontFamily: '"Silkscreen", monospace',
                      fontSize: '13px',
                      color: '#FFFFFF',
                      marginBottom: 8,
                      wordBreak: 'break-word',
                    }}
                  >
                    {authEmail}
                  </div>
                  <button onClick={() => void signOut()} disabled={authBusy} style={authButtonStyle('#F5C842', '#0E0E14', authBusy)}>
                    {authBusy ? 'CERRANDO...' : 'CERRAR SESION'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
              <input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="email@waspi.world"
                autoComplete="email"
                id="account-email"
                name="email"
                style={textInputStyle}
              />
                  <button onClick={() => void sendMagicLink()} disabled={authBusy} style={authButtonStyle('#F5C842', '#0E0E14', authBusy)}>
                    {authBusy ? 'ENVIANDO...' : 'MAGIC LINK'}
                  </button>
                  <button onClick={() => void signInWithProvider('google')} disabled={authBusy} style={authButtonStyle('rgba(255,255,255,0.08)', '#FFFFFF', authBusy, true)}>
                    ENTRAR CON GOOGLE
                  </button>
                  <button onClick={() => void signInWithProvider('discord')} disabled={authBusy} style={authButtonStyle('rgba(88,101,242,0.22)', '#FFFFFF', authBusy, true)}>
                    ENTRAR CON DISCORD
                  </button>
                </div>
              )}

              <div
                style={{
                  fontFamily: '"Silkscreen", monospace',
                  fontSize: '11px',
                  color: authStatus ? '#BBBBBB' : 'rgba(255,255,255,0.35)',
                  marginTop: 8,
                  minHeight: 14,
                }}
              >
                {authStatus || 'Guarda TENKS, inventario y avatar en tu cuenta.'}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
              <span
                className="inline-block"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '999px',
                  background: '#39FF14',
                  boxShadow: '0 0 10px rgba(57,255,20,0.5)',
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  fontFamily: '"Silkscreen", monospace',
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.7)',
                  lineHeight: 1.1,
                }}
              >
                Sesion OK
              </div>
            </div>
          )}
        </div>

        {shopOpen && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div
              className="p-4"
              style={{
                width: isMobile ? '94%' : 560,
                maxHeight: isMobile ? '88%' : 500,
                overflowY: 'auto',
                background: 'rgba(10,10,18,0.96)',
                border: '1px solid rgba(245,200,66,0.35)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              }}
            >
              <div className="flex items-center justify-between mb-3" style={{ fontFamily: '"Press Start 2P", monospace', color: '#F5C842', fontSize: '10px' }}>
                <span>WASPI SHOP</span>
                <button
                  onClick={() => {
                    setShopOpen(false);
                    eventBus.emit(EVENTS.SHOP_CLOSE);
                  }}
                  style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '9px', color: '#999999' }}
                >
                  X
                </button>
              </div>

              <div className="flex gap-2 mb-3">
                <button onClick={() => setShopTab('products')} style={tabButtonStyle(shopTab === 'products')}>
                  ROPA REAL
                </button>
                <button onClick={() => setShopTab('tenks')} style={tabButtonStyle(shopTab === 'tenks')}>
                  PACKS TENKS
                </button>
              </div>

              {shopTab === 'products' ? (
                <div style={{ fontFamily: '"Silkscreen", monospace', color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
                    Compra la prenda real con Stripe. Cuando el webhook confirme el pago, la misma prenda se agrega y equipa en tu Waspi.
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <input
                      value={discountCodeInput}
                      onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase())}
                      placeholder="CODIGO DE DESCUENTO"
                      style={textInputStyle}
                    />
                  </div>
                  <div className="space-y-2">
                    {physicalItems.map((item) => {
                      const selected = selectedProductId === item.id;
                      const ownedItem = owned.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '12px',
                            border: selected ? '1px solid rgba(245,200,66,0.45)' : '1px solid rgba(255,255,255,0.1)',
                            background: selected ? 'rgba(245,200,66,0.06)' : 'rgba(255,255,255,0.04)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block"
                                  style={{
                                    width: 12,
                                    height: 12,
                                    background: `#${(item.color ?? 0x777777).toString(16).padStart(6, '0')}`,
                                    border: '1px solid rgba(0,0,0,0.35)',
                                  }}
                                />
                                <div style={{ fontSize: '15px', color: '#FFFFFF' }}>{item.name}</div>
                                {ownedItem && <span style={{ fontSize: '11px', color: '#39FF14' }}>YA EN INVENTARIO</span>}
                              </div>
                              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.58)', marginTop: 4 }}>{item.description}</div>
                              <div style={{ fontSize: '12px', color: '#F5C842', marginTop: 4 }}>ARS {item.priceArs?.toLocaleString('es-AR')}</div>
                            </div>
                            <button
                              onClick={() => setSelectedProductId(item.id)}
                              style={authButtonStyle(selected ? '#F5C842' : 'rgba(255,255,255,0.08)', selected ? '#0E0E14' : '#FFFFFF', false, !selected)}
                            >
                              {selected ? 'SELECCIONADO' : 'VER'}
                            </button>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-2">
                              {(item.sizes ?? []).map((size) => (
                                <button
                                  key={size}
                                  onClick={() => {
                                    setSelectedProductId(item.id);
                                    setSelectedSizes((prev) => ({ ...prev, [item.id]: size }));
                                  }}
                                  style={sizeChipStyle(selectedSizes[item.id] === size)}
                                >
                                  {size}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => void startProductCheckout(item)}
                              disabled={!isAuthenticated || checkoutBusyId === item.id}
                              style={authButtonStyle('#F5C842', '#0E0E14', !isAuthenticated || checkoutBusyId === item.id)}
                            >
                              {checkoutBusyId === item.id ? 'CARGANDO...' : 'COMPRAR'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ fontFamily: '"Silkscreen", monospace', color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
                    Compra TENKS con Stripe y usalos despues en la tienda del juego. {isAuthenticated ? 'Tu cuenta recibira el credito del pack.' : 'Necesitas iniciar sesion para acreditar TENKS.'}
                  </div>
                  <div className="space-y-2">
                    {tenksPacks.map((pack) => (
                      <div
                        key={pack.id}
                        className="flex items-center justify-between gap-3"
                        style={{
                          padding: '10px 12px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.04)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '15px', color: '#FFFFFF' }}>{pack.name}</div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.58)' }}>{pack.description}</div>
                          <div style={{ fontSize: '12px', color: '#39FF14' }}>{pack.tenks.toLocaleString('es-AR')} TENKS</div>
                          <div style={{ fontSize: '12px', color: '#F5C842' }}>ARS {pack.priceArs.toLocaleString('es-AR')}</div>
                        </div>
                        <button
                          onClick={() => void startTenksCheckout(pack.id)}
                          disabled={!isAuthenticated || checkoutBusyId === pack.id}
                          style={authButtonStyle('#F5C842', '#0E0E14', !isAuthenticated || checkoutBusyId === pack.id)}
                        >
                          {checkoutBusyId === pack.id ? 'CARGANDO...' : 'COMPRAR'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '12px', color: shopStatus ? '#BBBBBB' : 'rgba(255,255,255,0.35)', marginTop: 10, minHeight: 16 }}>
                {shopStatus || (shopTab === 'products'
                  ? 'Cada compra real usa Stripe Checkout y acredita la prenda virtual por webhook.'
                  : 'Cada pack abre un checkout alojado por Stripe y el webhook acredita TENKS.')}
              </div>
            </div>
          </div>
        )}

        {playerActions && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
            <div
              style={{
                width: 320,
                background: 'rgba(10,10,18,0.97)',
                border: '1px solid rgba(245,200,66,0.28)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
                padding: 16,
              }}
            >
              <div style={{ fontFamily: '"Press Start 2P", monospace', color: '#F5C842', fontSize: '10px', marginBottom: 12 }}>
                ACCIONES DE JUGADOR
              </div>
              <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: '16px', color: '#FFFFFF', marginBottom: 6 }}>
                {playerActions.username}
              </div>
              <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: 'rgba(255,255,255,0.58)', marginBottom: 14 }}>
                Elige una accion de moderacion rapida.
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={handleMutePlayer} style={authButtonStyle('#F5C842', '#0E0E14', false)}>
                  SILENCIAR
                </button>
                <button onClick={handleReportPlayer} style={authButtonStyle('rgba(255,255,255,0.08)', '#FFFFFF', false, true)}>
                  REPORTAR
                </button>
                <button onClick={() => setPlayerActions(null)} style={authButtonStyle('rgba(255,255,255,0.08)', '#FFFFFF', false, true)}>
                  CANCELAR
                </button>
              </div>
            </div>
          </div>
        )}

        {inventoryOpen && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
            <div
              className="p-4"
              style={{
                width: isMobile ? '94%' : 420,
                background: 'rgba(10,10,18,0.95)',
                border: '1px solid rgba(245,200,66,0.35)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              }}
            >
              <div className="flex items-center justify-between mb-3" style={{ fontFamily: '"Press Start 2P", monospace', color: '#F5C842', fontSize: '10px' }}>
                <span>INVENTARIO</span>
                <button onClick={() => setInventoryOpen(false)} style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '9px', color: '#999999' }}>
                  X
                </button>
              </div>

              <div style={{ fontFamily: '"Silkscreen", monospace', color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>ITEM</div>
                    <div style={{ fontSize: '16px' }}>CIG</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>Idle smoke puffs</div>
                  </div>
                  <button
                    onClick={() => {
                      const next = !smoking;
                      setSmoking(next);
                      eventBus.emit(EVENTS.AVATAR_SET, { smoke: next });
                    }}
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: '9px',
                      padding: '10px 12px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: nextBtnBg(smoking),
                      color: smoking ? '#0E0E14' : '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    {smoking ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>UTIL</div>
                      <div style={{ fontSize: '16px' }}>GUN</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>Click o F para disparar</div>
                    </div>
                    <button
                      onClick={() => {
                        equipItem('UTIL-GUN-01');
                        const snap = getInventory();
                        setOwned(snap.owned);
                        setEquipped(snap.equipped);
                        setGunOn(hasUtilityEquipped('UTIL-GUN-01'));
                      }}
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '9px',
                        padding: '10px 12px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: gunOn ? '#39FF14' : 'rgba(255,255,255,0.08)',
                        color: gunOn ? '#0E0E14' : '#FFFFFF',
                        cursor: 'pointer',
                      }}
                    >
                      {gunOn ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>UTIL</div>
                      <div style={{ fontSize: '16px' }}>FOOTBALL</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>Bote cosmetic</div>
                    </div>
                    <button
                      onClick={() => {
                        equipItem('UTIL-BALL-01');
                        const snap = getInventory();
                        setOwned(snap.owned);
                        setEquipped(snap.equipped);
                        setBallOn(hasUtilityEquipped('UTIL-BALL-01'));
                      }}
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '9px',
                        padding: '10px 12px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: ballOn ? '#39FF14' : 'rgba(255,255,255,0.08)',
                        color: ballOn ? '#0E0E14' : '#FFFFFF',
                        cursor: 'pointer',
                      }}
                    >
                      {ballOn ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>ROPA</div>
                  <div className="mt-2 space-y-1">
                    {owned.length === 0 && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>No tenes ropa todavia. Comprala en la tienda.</div>}
                    {owned
                      .map((id) => CATALOG.find((i) => i.id === id))
                      .filter((item): item is NonNullable<typeof item> => !!item)
                      .filter((item) => item.slot !== 'utility')
                      .map((item) => {
                        const id = item.id;
                        const active = item.slot === 'top' ? equipped.top === id : equipped.bottom === id;
                        return (
                          <div key={id} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block"
                                style={{
                                  width: 10,
                                  height: 10,
                                  background: `#${(item.color ?? 0x777777).toString(16).padStart(6, '0')}`,
                                  border: '1px solid rgba(0,0,0,0.35)',
                                }}
                              />
                              <span style={{ fontSize: '13px' }}>{item.name}</span>
                              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>({item.slot})</span>
                            </div>
                            <button
                              onClick={() => {
                                equipItem(id);
                                const snap = getInventory();
                                setOwned(snap.owned);
                                setEquipped(snap.equipped);
                              }}
                              style={{
                                fontFamily: '"Press Start 2P", monospace',
                                fontSize: '8px',
                                padding: '8px 10px',
                                border: '1px solid rgba(255,255,255,0.15)',
                                background: active ? '#F5C842' : 'rgba(255,255,255,0.08)',
                                color: active ? '#0E0E14' : '#FFFFFF',
                                cursor: 'pointer',
                              }}
                            >
                              EQUIP
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => eventBus.emit(EVENTS.OPEN_CREATOR)}
                    style={{
                      flex: 1,
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: '9px',
                      padding: '12px 10px',
                      background: '#F5C842',
                      color: '#0E0E14',
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    EDITAR WASPI
                  </button>
                  <button
                    onClick={() => setInventoryOpen(false)}
                    style={{
                      flex: 1,
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: '9px',
                      padding: '12px 10px',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#FFFFFF',
                      cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                  >
                    CERRAR (I)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {chatVisible && (
          <div className="absolute bottom-0 left-0 right-0">
            <div
              ref={logRef}
              className="overflow-y-auto px-2 pt-1 pb-1"
              style={{
                maxHeight: isMobile ? '72px' : '100px',
                background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.65))',
              }}
            >
              {messages.map((m) => (
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
                  <span style={{ color: m.isMe ? '#F5C842' : '#88AAFF' }}>{m.username}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>: </span>
                  {m.message}
                </p>
              ))}
            </div>

            <div className="px-2 pb-2 pt-0.5">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
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
                placeholder="Presiona ENTER para chatear..."
                autoComplete="off"
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.75)',
                  border: '1px solid rgba(245,200,66,0.3)',
                  color: '#FFFFFF',
                  fontFamily: '"Silkscreen", "Courier New", monospace',
                  fontSize: isMobile ? '9px' : '10px',
                  padding: '7px 12px',
                  outline: 'none',
                  caretColor: '#F5C842',
                }}
                className="focus:border-[rgba(245,200,66,0.8)] transition-colors"
              />
            </div>
          </div>
        )}

        {uiNotice && (
          <div
            className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-2"
            style={{
              background: 'rgba(0,0,0,0.82)',
              border: '1px solid rgba(57,255,20,0.35)',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '8px',
              color: '#39FF14',
              boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
              zIndex: 30,
              maxWidth: isMobile ? '92%' : 420,
              textAlign: 'center',
            }}
          >
            {uiNotice}
          </div>
        )}
      </div>
    </div>
  );
}

function nextBtnBg(smoking: boolean) {
  return smoking ? '#39FF14' : 'rgba(255,255,255,0.08)';
}

function authButtonStyle(background: string, color: string, disabled: boolean, bordered = false) {
  return {
    width: '100%',
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '8px',
    padding: '10px 8px',
    background,
    color,
    cursor: disabled ? 'default' : 'pointer',
    border: bordered ? '1px solid rgba(255,255,255,0.15)' : 'none',
    opacity: disabled ? 0.65 : 1,
  } as const;
}

function tabButtonStyle(active: boolean) {
  return {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '8px',
    padding: '10px 12px',
    background: active ? '#F5C842' : 'rgba(255,255,255,0.08)',
    color: active ? '#0E0E14' : '#FFFFFF',
    border: active ? 'none' : '1px solid rgba(255,255,255,0.15)',
    cursor: 'pointer',
  } as const;
}

function sizeChipStyle(active: boolean) {
  return {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '8px',
    padding: '8px 10px',
    background: active ? '#39FF14' : 'rgba(255,255,255,0.08)',
    color: active ? '#0E0E14' : '#FFFFFF',
    border: '1px solid rgba(255,255,255,0.15)',
    cursor: 'pointer',
  } as const;
}

function hudBadge(color: string, border: string) {
  return {
    background: 'rgba(0,0,0,0.7)',
    border: `1px solid ${border}`,
    fontFamily: '"Press Start 2P", monospace',
    color,
    fontSize: '7px',
  } as const;
}

function loadStoredAvatarConfig() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(AVATAR_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function saveStoredAvatarConfig(config: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(config));
}

function loadStoredMutedPlayers() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PLAYER_STATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { mutedPlayers?: string[] };
    return Array.isArray(parsed.mutedPlayers)
      ? parsed.mutedPlayers.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveStoredMutedPlayers(mutedPlayers: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify({ mutedPlayers }));
}

function getInitialCheckoutState(): { open: boolean; tab: ShopTab; status: string } {
  if (typeof window === 'undefined') {
    return { open: false, tab: 'tenks', status: '' };
  }
  const status = new URLSearchParams(window.location.search).get('checkout');
  if (status === 'success') {
    return {
      open: true,
      tab: 'tenks',
      status: 'Pago recibido. Cuando Stripe confirme el webhook, tus TENKS se acreditaran.',
    };
  }
  if (status === 'product_success') {
    return {
      open: true,
      tab: 'products',
      status: 'Pago recibido. Cuando Stripe confirme el webhook, la prenda se agregara y equipara en tu Waspi.',
    };
  }
  if (status === 'cancelled') {
    return {
      open: true,
      tab: 'tenks',
      status: 'Checkout cancelado.',
    };
  }
  return { open: false, tab: 'tenks', status: '' };
}

const textInputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#FFFFFF',
  fontFamily: '"Silkscreen", monospace',
  fontSize: '12px',
  padding: '8px 10px',
  outline: 'none',
} as const;
