'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { CHAT } from '@/src/game/config/constants';
import { CATALOG, getItem as getCatalogItem, type CatalogItem } from '@/src/game/config/catalog';
import { getInventory, equipItem, hasUtilityEquipped, replaceInventory } from '@/src/game/systems/InventorySystem';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from '@/src/game/systems/AudioSettings';
import { loadHudSettings, saveHudSettings, type HudSettings } from '@/src/game/systems/HudSettings';
import { loadProgressionState, initProgressionState, type ProgressionState } from '@/src/game/systems/ProgressionSystem';
import { initStatsSystem, flushStatsSystem, teardownStatsSystem, getStats, type PlayerStats } from '@/src/game/systems/StatsSystem';
import { supabase } from '@/src/lib/supabase';
import { getTenksBalance, initTenks } from '@/src/game/systems/TenksSystem';
import { mutePlayer, normalizePlayerState, type PlayerState } from '@/src/lib/playerState';
import type { SharedParcelState } from '@/src/lib/vecindad';

const PhaserGame = dynamic(() => import('@/app/components/PhaserGame'), { ssr: false });
const AVATAR_STORAGE_KEY = 'waspi_avatar_config';
const PLAYER_STATE_STORAGE_KEY = 'waspi_player_state';
const MAGIC_LINK_COOLDOWN_KEY = 'waspi_magic_link_cooldown_until';
const MAGIC_LINK_COOLDOWN_MS = 60_000;

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

interface CombatStats {
  kills: number;
  deaths: number;
}

type ShopTab = 'products';

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

interface ParcelBuyPayload {
  parcelId: string;
  cost: number;
}

interface VecindadUpdatePayload {
  vecindad: PlayerState['vecindad'];
  notice?: string;
}

interface VecindadSharedPayload {
  parcels: SharedParcelState[];
  broadcast?: boolean;
}

const CHAT_SCENES = new Set(['WorldScene', 'VecindadScene', 'StoreInterior', 'CafeInterior', 'ArcadeInterior', 'HouseInterior']);
const INTERIOR_SOCIAL_SCENES = new Set(['VecindadScene', 'StoreInterior', 'CafeInterior', 'ArcadeInterior', 'HouseInterior']);

export default function PlayPage() {
  const initialInventory = useMemo(() => getInventory(), []);
  const initialCheckout = useMemo(() => getInitialCheckoutState(), []);
  const initialAudioSettings = useMemo(() => loadAudioSettings(), []);
  const initialHudSettings = useMemo(() => loadHudSettings(), []);
  const initialProgression = useMemo(() => loadProgressionState(), []);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [lastSent, setLastSent] = useState(0);
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [presencePlayers, setPresencePlayers] = useState<PresencePlayer[]>([]);
  const [combatStats, setCombatStats] = useState<CombatStats>({ kills: 0, deaths: 0 });
  const [progression, setProgression] = useState<ProgressionState>(initialProgression);
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
  const [magicLinkCooldownUntil, setMagicLinkCooldownUntil] = useState(getInitialMagicLinkCooldownUntil);
  const [uiNotice, setUiNotice] = useState('');
  const [shopOpen, setShopOpen] = useState(initialCheckout.open);
  const [shopSource, setShopSource] = useState(initialCheckout.open ? 'checkout_return' : '');
  const [shopItems, setShopItems] = useState<CatalogItem[]>([]);
  const [checkoutBusyId, setCheckoutBusyId] = useState<string | null>(null);
  const [shopStatus, setShopStatus] = useState(initialCheckout.status);
  const [isMobile, setIsMobile] = useState(false);
  const [playerActions, setPlayerActions] = useState<PlayerActionsPayload | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'AUDIO' | 'HUD'>('AUDIO');
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsTab, setStatsTab] = useState<'COMBAT' | 'PROGRESS' | 'EXPLORE' | 'MINIGAMES'>('COMBAT');
  const [statsSnapshot, setStatsSnapshot] = useState<PlayerStats | null>(null);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(initialAudioSettings);
  const [hudSettings, setHudSettings] = useState<HudSettings>(initialHudSettings);
  const tokenRef = useRef<string | null>(null);
  const playerStateRef = useRef<PlayerState | null>(null);
  const suppressSyncRef = useRef(false);
  const mutedPlayersRef = useRef<string[]>(loadStoredMutedPlayers());
  const lastInteriorChatSentRef = useRef(0);
  const progressionSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatVisible = CHAT_SCENES.has(activeScene);
  const isAuthenticated = Boolean(authEmail);
  const closeShop = useCallback(() => {
    setShopSource('');
    setShopOpen(false);
    eventBus.emit(EVENTS.SHOP_CLOSE);
  }, []);
  const closeInventory = useCallback(() => {
    setInventoryOpen(false);
  }, []);
  const closePlayerActions = useCallback(() => {
    setPlayerActions(null);
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);
  const closeStats = useCallback(() => {
    setStatsOpen(false);
  }, []);
  const openStats = useCallback(() => {
    setStatsSnapshot(getStats());
    setStatsOpen(true);
  }, []);

  const clothingItems = useMemo(
    () => (shopItems.length ? shopItems : CATALOG).filter((item) => item.slot !== 'utility' && item.priceTenks > 0),
    [shopItems]
  );

  const applyPlayerState = useCallback((player: PlayerState) => {
    const nextPlayer = normalizePlayerState(player);
    suppressSyncRef.current = true;
    playerStateRef.current = nextPlayer;
    saveStoredAvatarConfig({
      ...loadStoredAvatarConfig(),
      ...nextPlayer.avatar,
    });
    saveStoredPlayerState(nextPlayer);
    replaceInventory(nextPlayer.inventory);
    initTenks(nextPlayer.tenks, { preferStored: false });
    mutedPlayersRef.current = nextPlayer.mutedPlayers ?? [];
    if (nextPlayer.progression) {
      const prog = initProgressionState(nextPlayer.progression.kills, nextPlayer.progression.xp);
      setProgression(prog);
    }
    setPlayerState(nextPlayer);
    setOwned(nextPlayer.inventory.owned);
    setEquipped(nextPlayer.inventory.equipped);
    setGunOn((nextPlayer.inventory.equipped.utility ?? []).includes('UTIL-GUN-01'));
    setBallOn((nextPlayer.inventory.equipped.utility ?? []).includes('UTIL-BALL-01'));
    setTenks(nextPlayer.tenks);
    eventBus.emit(EVENTS.PARCEL_STATE_CHANGED, nextPlayer.vecindad);
    queueMicrotask(() => {
      suppressSyncRef.current = false;
    });
  }, []);

  const syncPlayerState = useCallback(async (overridePlayerState?: PlayerState) => {
    if (suppressSyncRef.current && !overridePlayerState) return;
    const token = tokenRef.current;
    if (!token) return;

    const base = overridePlayerState ?? playerStateRef.current;
    const nextPlayer: PlayerState = {
      ...(base ?? {
        tenks: getTenksBalance(),
        inventory: getInventory(),
        avatar: loadStoredAvatarConfig(),
        mutedPlayers: mutedPlayersRef.current,
        vecindad: {
          ownedParcelId: undefined,
          buildStage: 0,
          materials: 0,
        },
      }),
      tenks: getTenksBalance(),
      inventory: getInventory(),
      avatar: loadStoredAvatarConfig(),
      mutedPlayers: base?.mutedPlayers ?? mutedPlayersRef.current,
      vecindad: base?.vecindad ?? {
        ownedParcelId: undefined,
        buildStage: 0,
        materials: 0,
      },
      progression: (() => {
        const prog = loadProgressionState();
        return { kills: prog.kills, xp: prog.xp };
      })(),
    };

    await fetch('/api/player', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        player: {
          ...nextPlayer,
      } satisfies PlayerState,
      }),
    }).catch(() => undefined);
  }, []);

  const persistInventoryState = useCallback((inventory = getInventory()) => {
    setOwned(inventory.owned);
    setEquipped(inventory.equipped);
    setGunOn((inventory.equipped.utility ?? []).includes('UTIL-GUN-01'));
    setBallOn((inventory.equipped.utility ?? []).includes('UTIL-BALL-01'));

    const currentPlayer = playerStateRef.current;
    if (!currentPlayer) return;

    const equippedTop = inventory.equipped.top ? getCatalogItem(inventory.equipped.top) : null;
    const equippedBottom = inventory.equipped.bottom ? getCatalogItem(inventory.equipped.bottom) : null;

    const nextPlayer = normalizePlayerState({
      ...currentPlayer,
      inventory,
      avatar: {
        ...currentPlayer.avatar,
        ...(equippedTop ? { topColor: equippedTop.color ?? currentPlayer.avatar.topColor } : {}),
        ...(equippedBottom ? { bottomColor: equippedBottom.color ?? currentPlayer.avatar.bottomColor } : {}),
      },
    });

    playerStateRef.current = nextPlayer;
    saveStoredAvatarConfig({
      ...loadStoredAvatarConfig(),
      ...nextPlayer.avatar,
    });
    saveStoredPlayerState(nextPlayer);
    setPlayerState(nextPlayer);
    void syncPlayerState(nextPlayer);
  }, [syncPlayerState]);

  const handleEquipOwnedItem = useCallback((itemId: string) => {
    equipItem(itemId);
    persistInventoryState(getInventory());
  }, [persistInventoryState]);

  const loadVecindadSharedState = useCallback(async (session?: Session | null) => {
    const headers: HeadersInit = {};
    const token = session?.access_token ?? tokenRef.current;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch('/api/vecindad', {
      method: 'GET',
      headers,
    }).catch(() => null);

    if (!res?.ok) return null;
    const json = await res.json().catch(() => null) as { parcels?: SharedParcelState[] } | null;
    if (json?.parcels) {
      eventBus.emit(EVENTS.VECINDAD_SHARED_STATE_CHANGED, {
        parcels: json.parcels,
        broadcast: false,
      } satisfies VecindadSharedPayload);
    }
    return json;
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

    const unsubCombatStats = eventBus.on(EVENTS.PLAYER_COMBAT_STATS, (payload: unknown) => {
      const next = payload as Partial<CombatStats> | null;
      setCombatStats({
        kills: typeof next?.kills === 'number' ? next.kills : 0,
        deaths: typeof next?.deaths === 'number' ? next.deaths : 0,
      });
    });

    const unsubProgression = eventBus.on(EVENTS.PLAYER_PROGRESSION, (payload: unknown) => {
      const next = payload as Partial<ProgressionState> | null;
      setProgression({
        kills: typeof next?.kills === 'number' ? next.kills : 0,
        xp: typeof next?.xp === 'number' ? next.xp : 0,
        level: typeof next?.level === 'number' ? next.level : 1,
        nextLevelAt: typeof next?.nextLevelAt === 'number' || next?.nextLevelAt === null
          ? next.nextLevelAt
          : null,
      });
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
      setShopSource(next.source ?? 'scene');
      setShopOpen(true);
      setShopStatus(next.source === 'store_interior' ? 'Compra ropa con TENKS y equipala al instante.' : '');
    });

    const unsubShopClose = eventBus.on(EVENTS.SHOP_CLOSE, () => {
      setShopSource('');
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
          setShopStatus(`Ganaste ${json.reward.percentOff}% OFF. Codigo: ${json.reward.code}`);
          setUiNotice(`Premio guardado: ${json.reward.percentOff}% OFF · Codigo ${json.reward.code}`);
        }
      })();
    });

    const unsubParcelBuy = eventBus.on(EVENTS.PARCEL_BUY_REQUEST, (payload: unknown) => {
      const next = payload as ParcelBuyPayload | null;
      if (!next?.parcelId) return;

      void (async () => {
        if (!tokenRef.current) {
          setUiNotice('Inicia sesion para comprar una parcela unica en La Vecindad.');
          return;
        }

        const res = await fetch('/api/vecindad', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: JSON.stringify({
            action: 'buy',
            parcelId: next.parcelId,
          }),
        }).catch(() => null);

        const json = await res?.json().catch(() => null) as {
          error?: string;
          notice?: string;
          player?: PlayerState;
          parcels?: SharedParcelState[];
        } | null;

        if (!res?.ok || !json?.player) {
          setUiNotice(json?.error ?? 'No pude comprar esa parcela.');
          return;
        }

        applyPlayerState(normalizePlayerState(json.player));
        if (json.parcels) {
          eventBus.emit(EVENTS.VECINDAD_SHARED_STATE_CHANGED, {
            parcels: json.parcels,
            broadcast: true,
          } satisfies VecindadSharedPayload);
        }
        setUiNotice(json.notice ?? `Compraste la parcela ${next.parcelId}.`);
      })();
    });

    const unsubParcelBuild = eventBus.on(EVENTS.PARCEL_BUILD_REQUEST, () => {
      void (async () => {
        if (!tokenRef.current) {
          setUiNotice('Inicia sesion para construir en tu parcela.');
          return;
        }

        const res = await fetch('/api/vecindad', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: JSON.stringify({ action: 'build' }),
        }).catch(() => null);

        const json = await res?.json().catch(() => null) as {
          error?: string;
          notice?: string;
          player?: PlayerState;
          parcels?: SharedParcelState[];
        } | null;

        if (!res?.ok || !json?.player) {
          setUiNotice(json?.error ?? 'No pude mejorar la casa.');
          return;
        }

        applyPlayerState(normalizePlayerState(json.player));
        if (json.parcels) {
          eventBus.emit(EVENTS.VECINDAD_SHARED_STATE_CHANGED, {
            parcels: json.parcels,
            broadcast: true,
          } satisfies VecindadSharedPayload);
        }
        setUiNotice(json.notice ?? 'Casa mejorada.');
      })();
    });

    const unsubVecindadUpdate = eventBus.on(EVENTS.VECINDAD_UPDATE_REQUEST, (payload: unknown) => {
      const next = payload as VecindadUpdatePayload | null;
      if (!next?.vecindad || !playerState) return;

      const updatedPlayer: PlayerState = {
        ...playerState,
        tenks: getTenksBalance(),
        vecindad: next.vecindad,
      };

      applyPlayerState(updatedPlayer);
      void syncPlayerState(updatedPlayer);
      if (next.notice) setUiNotice(next.notice);
    });

    const unsubUiNotice = eventBus.on(EVENTS.UI_NOTICE, (payload: unknown) => {
      if (typeof payload === 'string' && payload.trim()) {
        setUiNotice(payload);
      }
    });

    const unsubOpenStats = eventBus.on(EVENTS.OPEN_STATS, openStats);

    return () => {
      unsubChat();
      unsubInfo();
      unsubPresence();
      unsubCombatStats();
      unsubProgression();
      unsubTenks();
      unsubScene();
      unsubInv();
      unsubInvChanged();
      unsubShopOpen();
      unsubShopClose();
      unsubPlayerActions();
      unsubOpenStats();
      unsubPenalty();
      unsubParcelBuy();
      unsubParcelBuild();
      unsubVecindadUpdate();
      unsubUiNotice();
    };
  }, [applyPlayerState, openStats, playerState, syncPlayerState]);

  useEffect(() => {
    if (!uiNotice) return;
    const timer = window.setTimeout(() => setUiNotice(''), 4200);
    return () => window.clearTimeout(timer);
  }, [uiNotice]);

  useEffect(() => {
    saveAudioSettings(audioSettings);
    eventBus.emit(EVENTS.AUDIO_SETTINGS_CHANGED, audioSettings);
  }, [audioSettings]);

  useEffect(() => {
    saveHudSettings(hudSettings);
    eventBus.emit(EVENTS.HUD_SETTINGS_CHANGED, hudSettings);
  }, [hudSettings]);

  useEffect(() => {
    if (!magicLinkCooldownUntil || magicLinkCooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= magicLinkCooldownUntil) {
        setMagicLinkCooldownUntil(0);
        window.localStorage.removeItem(MAGIC_LINK_COOLDOWN_KEY);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [magicLinkCooldownUntil]);

  const hydratePlayerState = useCallback(async (session: Session | null) => {
    if (!session?.access_token) {
      teardownStatsSystem();
      tokenRef.current = null;
      setAuthEmail(session?.user?.email ?? null);
      void loadVecindadSharedState(null);
      return;
    }

    tokenRef.current = session.access_token;
    setAuthEmail(session.user.email ?? null);
    void initStatsSystem(session.user.id);

    const res = await fetch('/api/player', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (!res.ok) return;
    const json = await res.json();
    const remotePlayer = json.player as PlayerState | undefined;
    const localPlayer = loadStoredPlayerState();
    await loadVecindadSharedState(session);

    if (remotePlayer) {
      const merged = mergeHydratedPlayerState(
        localPlayer,
        normalizePlayerState(remotePlayer)
      );
      applyPlayerState(merged);
      // Always push when local has progression the server hasn't seen yet.
      // Also covers the normal case where other fields (tenks, inventory) differ.
      const localProg = loadProgressionState();
      const serverHasProgress =
        (remotePlayer.progression?.kills ?? 0) >= localProg.kills &&
        (remotePlayer.progression?.xp ?? 0) >= localProg.xp;
      const statesDiffer = JSON.stringify(merged) !== JSON.stringify(normalizePlayerState(remotePlayer));
      if (statesDiffer || !serverHasProgress) {
        void syncPlayerState(merged);
      }
    }
  }, [applyPlayerState, loadVecindadSharedState, syncPlayerState]);

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
    if (player) applyPlayerState(normalizePlayerState(player));
    await loadVecindadSharedState();
  }, [applyPlayerState, loadVecindadSharedState]);

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
      } else if (event === 'SIGNED_OUT') {
        setAuthStatus('Sesion cerrada.');
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

  const sendMagicLink = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('Supabase no esta configurado.');
      return;
    }

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setAuthStatus('Escribi tu email primero.');
      return;
    }

    const remainingMs = magicLinkCooldownUntil - Date.now();
    if (remainingMs > 0) {
      setAuthStatus(`Ya te mandamos un link. Espera ${Math.ceil(remainingMs / 1000)}s o usa el ultimo mail.`);
      return;
    }

    const { data: currentSession } = await supabase.auth.getSession();
    if (currentSession.session?.user?.email?.toLowerCase() === email) {
      setAuthStatus('Ese mail ya tiene una sesion iniciada.');
      return;
    }

    setAuthBusy(true);
    setAuthStatus('');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
    const redirectTo = appUrl
      ? `${appUrl}/play`
      : typeof window !== 'undefined'
        ? `${window.location.origin}/play`
        : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setAuthBusy(false);
    if (error) {
      const lowered = error.message.toLowerCase();
      if (lowered.includes('rate limit') || lowered.includes('security purposes')) {
        const cooldownUntil = Date.now() + MAGIC_LINK_COOLDOWN_MS;
        setMagicLinkCooldownUntil(cooldownUntil);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(MAGIC_LINK_COOLDOWN_KEY, String(cooldownUntil));
        }
        setAuthStatus('Tu mail ya puede entrar. Usa el ultimo link recibido o espera 60s para pedir otro.');
        return;
      }
      setAuthStatus(error.message);
      return;
    }

    const cooldownUntil = Date.now() + MAGIC_LINK_COOLDOWN_MS;
    setMagicLinkCooldownUntil(cooldownUntil);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MAGIC_LINK_COOLDOWN_KEY, String(cooldownUntil));
    }
    setAuthStatus('Magic link enviado. Si tu mail ya esta verificado, entra con el ultimo link del correo.');
  }, [emailInput, magicLinkCooldownUntil]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setAuthBusy(true);
    await flushStatsSystem();
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);
    if (error) {
      setAuthStatus(error.message);
      return;
    }
    teardownStatsSystem();
    tokenRef.current = null;
    setAuthEmail(null);
    setAuthStatus('Sesion cerrada.');
  }, []);

  const buyShopItem = useCallback(async (item: CatalogItem) => {
    if (!tokenRef.current) {
      setShopStatus('Inicia sesion para comprar ropa con TENKS.');
      return;
    }

    setCheckoutBusyId(item.id);
    setShopStatus('');

    const res = await fetch('/api/shop/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ itemId: item.id }),
    }).catch(() => null);

    if (!res?.ok) {
      const json = await res?.json().catch(() => null);
      setCheckoutBusyId(null);
      setShopStatus(json?.error ?? 'No pude completar la compra.');
      return;
    }

    const json = await res.json();
    if (json.player) {
      applyPlayerState(normalizePlayerState(json.player as PlayerState));
    }
    setCheckoutBusyId(null);
    setShopStatus(
      (json.notice as string | undefined)
      ?? `${item.name} comprado por ${item.priceTenks.toLocaleString('es-AR')} TENKS y equipado.`
    );
  }, [applyPlayerState]);

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
    // Debounce progression syncs — can fire frequently during combat.
    const unsubProgressionSync = eventBus.on(EVENTS.PLAYER_PROGRESSION, () => {
      if (progressionSyncTimerRef.current) clearTimeout(progressionSyncTimerRef.current);
      progressionSyncTimerRef.current = setTimeout(() => {
        void syncPlayerState();
      }, 10_000);
    });

    // Flush progression on tab close using keepalive so the browser completes
    // the request even after the page unloads (async syncPlayerState won't work here).
    const handleUnload = () => {
      const token = tokenRef.current;
      const base = playerStateRef.current;
      // Flush progression to /api/player with keepalive so it completes after page closes.
      if (token && base) {
        const prog = loadProgressionState();
        fetch('/api/player', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            player: { ...base, progression: { kills: prog.kills, xp: prog.xp } } satisfies PlayerState,
          }),
          keepalive: true,
        });
      }
      // Flush detailed stats (keepalive handled inside flushStatsSystem via supabase-js).
      void flushStatsSystem();
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      unsubTenks();
      unsubInventory();
      unsubAvatar();
      unsubProgressionSync();
      if (progressionSyncTimerRef.current) clearTimeout(progressionSyncTimerRef.current);
      window.removeEventListener('beforeunload', handleUnload);
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
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (playerActions) { closePlayerActions(); return; }
        if (inventoryOpen) { closeInventory(); return; }
        if (shopOpen) { closeShop(); return; }
        if (statsOpen) { closeStats(); return; }
        if (settingsOpen) { closeSettings(); return; }
      }
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
  }, [chatVisible, closeInventory, closePlayerActions, closeSettings, closeShop, closeStats, inventoryOpen, playerActions, settingsOpen, shopOpen, statsOpen]);

  useEffect(() => {
    if (!chatVisible) {
      inputRef.current?.blur();
    }
  }, [chatVisible]);

  useEffect(() => {
    if (shopSource !== 'store_interior') return;
    if (activeScene === 'StoreInterior') return;
    const closeTimer = window.setTimeout(() => {
      closeShop();
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [activeScene, closeShop, shopSource]);

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
          const playerId = typeof safeEntry.playerId === 'string'
            ? safeEntry.playerId
            : '';
          const username = typeof safeEntry.username === 'string'
            ? safeEntry.username
            : '';
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
      setMessages((prev) => [
        ...prev.slice(-19),
        {
          id: `${Date.now()}-${Math.random()}`,
          playerId: playerInfo.playerId,
          username: playerInfo.username,
          message: safeMessage,
          isMe: true,
        },
      ]);
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
  }, [activeScene, playerInfo]);

  const sendMessage = useCallback(() => {
    const now = Date.now();
    const trimmed = input.trim().slice(0, CHAT.MAX_CHARS);
    if (!chatVisible || !trimmed || now - lastSent < CHAT.RATE_LIMIT_MS) return;

    eventBus.emit(EVENTS.CHAT_SEND, trimmed);
    setInput('');
    setLastSent(now);
  }, [chatVisible, input, lastSent]);

  const nextLevelDelta = progression.nextLevelAt === null
    ? 0
    : Math.max(0, progression.nextLevelAt - progression.xp);
  const progressPct = progression.nextLevelAt === null
    ? 1
    : Math.max(0, Math.min(1, progression.xp / progression.nextLevelAt));
  const passiveUtilityItems = useMemo(
    () => owned
      .map((id) => CATALOG.find((i) => i.id === id))
      .filter((item): item is CatalogItem => Boolean(item))
      .filter((item) => item.slot === 'utility' && item.id !== 'UTIL-GUN-01' && item.id !== 'UTIL-BALL-01'),
    [owned],
  );

  return (
    <>
      <style jsx global>{`
        @keyframes wwFadeUp {
          from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.98); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes wwModalIn {
          from { opacity: 0; transform: translate3d(0, 22px, 0) scale(0.94); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes wwToastIn {
          from { opacity: 0; transform: translate3d(-50%, -10px, 0); }
          to { opacity: 1; transform: translate3d(-50%, 0, 0); }
        }
        @keyframes wwPulseGlow {
          0%, 100% { box-shadow: 0 0 0 rgba(57,255,20,0.1); opacity: 0.82; }
          50% { box-shadow: 0 0 14px rgba(57,255,20,0.45); opacity: 1; }
        }
        @keyframes wwChatIn {
          from { opacity: 0; transform: translate3d(-8px, 0, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        .ww-shell {
          animation: wwFadeUp 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .ww-frame {
          animation: wwFadeUp 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .ww-frame button,
        .ww-frame input {
          transition:
            transform 160ms ease,
            box-shadow 160ms ease,
            border-color 160ms ease,
            background-color 160ms ease,
            opacity 160ms ease,
            color 160ms ease;
        }
        .ww-frame button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.24);
        }
        .ww-frame button:active:not(:disabled) {
          transform: translateY(0);
        }
        .ww-frame input:focus {
          transform: translateY(-1px);
          box-shadow: 0 0 0 1px rgba(245, 200, 66, 0.18), 0 14px 28px rgba(0, 0, 0, 0.18);
        }
        .ww-chip,
        .ww-panel,
        .ww-auth-card {
          backdrop-filter: blur(8px);
          animation: wwFadeUp 440ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .ww-panel {
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .ww-panel:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 30px rgba(0, 0, 0, 0.22);
        }
        .ww-panel-delayed,
        .ww-auth-card {
          animation-delay: 70ms;
        }
        .ww-auth-card {
          transition: width 220ms ease, padding 220ms ease, transform 180ms ease, box-shadow 180ms ease;
        }
        .ww-status-dot {
          animation: wwPulseGlow 1.4s ease-in-out infinite;
        }
        .ww-overlay {
          animation: wwFadeUp 180ms ease-out both;
          backdrop-filter: blur(9px);
        }
        .ww-modal {
          animation: wwModalIn 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .ww-presence-row,
        .ww-chat-line {
          animation: wwChatIn 220ms ease-out both;
        }
        .ww-chat-shell {
          backdrop-filter: blur(7px);
        }
        .ww-notice {
          animation: wwToastIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .ww-shell,
          .ww-frame,
          .ww-chip,
          .ww-panel,
          .ww-auth-card,
          .ww-overlay,
          .ww-modal,
          .ww-presence-row,
          .ww-chat-line,
          .ww-notice,
          .ww-status-dot {
            animation: none !important;
          }
          .ww-frame button,
          .ww-frame input,
          .ww-panel,
          .ww-auth-card {
            transition: none !important;
          }
        }
      `}</style>
      <div
      className="ww-shell w-screen h-screen overflow-hidden flex items-center justify-center"
      style={{
        backgroundColor: '#02030A',
        backgroundImage: 'radial-gradient(circle at top, rgba(245,200,66,0.12), transparent 55%)',
      }}
    >
      <div
        className="ww-frame relative"
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

        <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none flex-wrap max-w-[68%]">
          <div className="ww-chip px-2 py-1 text-xs" style={hudBadge('#F5C842', 'rgba(245,200,66,0.4)')}>
            {playerInfo ? playerInfo.username : 'CARGANDO...'}
          </div>
          {connected && (
            <div className="ww-chip px-2 py-1 text-xs flex items-center gap-1" style={hudBadge('#39FF14', 'rgba(57,255,20,0.3)')}>
              <span className="ww-status-dot inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
              ONLINE
            </div>
          )}
          {tenks !== null && (
            <div className="ww-chip px-2 py-1 text-xs" style={hudBadge('#F5C842', 'rgba(245,200,66,0.4)')}>
              TENKS {tenks}
            </div>
          )}
          <div className="ww-chip px-2 py-1 text-xs" style={hudBadge('#46B3FF', 'rgba(70,179,255,0.35)')}>
            LVL {progression.level}
          </div>
          <div className="ww-chip px-2 py-1 text-xs" style={hudBadge('#88AAFF', 'rgba(136,170,255,0.35)')}>
            K/D {combatStats.kills}/{combatStats.deaths}
          </div>
        </div>

        <div className="absolute top-12 left-2 flex flex-col gap-2">
          {hudSettings.showSocialPanel && (
            <div
              className="ww-panel ww-panel-delayed"
              style={{
                width: 182,
                background: 'rgba(0,0,0,0.7)',
                border: '1px solid rgba(57,255,20,0.22)',
                padding: '6px 8px',
                boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: hudSettings.socialCollapsed ? 0 : 6 }}>
                <div
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '7px',
                    color: '#39FF14',
                  }}
                >
                  CONECTADOS {presencePlayers.length}
                </div>
                <button
                  onClick={() => setHudSettings((current) => ({ ...current, socialCollapsed: !current.socialCollapsed }))}
                  style={hudCollapseButtonStyle()}
                >
                  {hudSettings.socialCollapsed ? '+' : '-'}
                </button>
              </div>
              {!hudSettings.socialCollapsed && (
                <div style={{ display: 'grid', gap: 4 }}>
                  {presencePlayers.slice(0, 6).map((player, index) => (
                    <div
                      className="ww-presence-row"
                      key={player.playerId}
                      style={{
                        fontFamily: '"Silkscreen", monospace',
                        fontSize: '11px',
                        color: player.playerId === playerInfo?.playerId ? '#F5C842' : 'rgba(255,255,255,0.8)',
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        animationDelay: `${index * 45}ms`,
                      }}
                    >
                      {player.playerId === playerInfo?.playerId ? 'TU ' : '+ '} {player.username}
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
              )}
            </div>
          )}

          {hudSettings.showProgressPanel && (
            <div
              className="ww-panel"
              style={{
                width: 182,
                background: 'rgba(0,0,0,0.74)',
                border: '1px solid rgba(70,179,255,0.24)',
                padding: '6px 8px',
                boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: hudSettings.progressCollapsed ? 0 : 6 }}>
                <div
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '7px',
                    color: '#46B3FF',
                  }}
                >
                  PROGRESO
                </div>
                <button
                  onClick={() => setHudSettings((current) => ({ ...current, progressCollapsed: !current.progressCollapsed }))}
                  style={hudCollapseButtonStyle()}
                >
                  {hudSettings.progressCollapsed ? '+' : '-'}
                </button>
              </div>
              {hudSettings.progressCollapsed ? (
                <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: 'rgba(255,255,255,0.82)' }}>
                  LVL {progression.level} {nextLevelDelta > 0 ? `| NEXT ${nextLevelDelta} XP` : '| MAX'}
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: 4, fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: 'rgba(255,255,255,0.82)' }}>
                    <div className="flex items-center justify-between">
                      <span>LVL {progression.level}</span>
                      <span>{progression.nextLevelAt === null ? 'MAX' : `${nextLevelDelta} XP`}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>XP {progression.xp}</span>
                      <span>KOs {progression.kills}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 6, height: 8, border: '1px solid rgba(70,179,255,0.28)', background: 'rgba(255,255,255,0.05)' }}>
                    <div
                      style={{
                        width: `${progressPct * 100}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #46B3FF 0%, #8CE0FF 100%)',
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {hudSettings.showControlsPanel && (
          <div
            className="ww-panel absolute top-2 right-2 pointer-events-none"
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
        )}

        <button
          onClick={() => {
            setShopSource('hud');
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

        <button
          onClick={() => setSettingsOpen(true)}
          className="absolute right-2 top-28"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '13px',
            padding: '6px 9px',
            background: 'rgba(255,255,255,0.08)',
            color: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ⚙
        </button>

        <button
          onClick={openStats}
          className="absolute right-2 top-40"
          title="Ver estadísticas"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '11px',
            padding: '7px 10px',
            background: 'rgba(245,200,66,0.12)',
            color: '#F5C842',
            border: '1px solid rgba(245,200,66,0.35)',
            cursor: 'pointer',
          }}
        >
          🏆
        </button>

        <div
          className="ww-auth-card absolute top-32 right-2"
          style={{
            width: isAuthenticated ? 156 : 228,
            background: 'rgba(0,0,0,0.78)',
            border: '1px solid rgba(245,200,66,0.18)',
            padding: isAuthenticated ? '6px 8px' : '8px',
            boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
          }}
        >
          {isAuthenticated ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
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
                    color: 'rgba(255,255,255,0.82)',
                    lineHeight: 1.1,
                  }}
                >
                  Sesion OK
                </div>
              </div>
              <button
                onClick={() => void signOut()}
                disabled={authBusy}
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '7px',
                  color: authBusy ? 'rgba(255,255,255,0.4)' : '#BBBBBB',
                  background: 'transparent',
                  border: 'none',
                  cursor: authBusy ? 'not-allowed' : 'pointer',
                  padding: 0,
                }}
              >
                {authBusy ? '...' : 'SALIR'}
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '7px',
                  color: '#F5C842',
                  marginBottom: 8,
                }}
              >
                LOGIN OPCIONAL
              </div>
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
              </div>

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
          )}
        </div>

        {shopOpen && (
          <div
            className="ww-overlay absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) closeShop(); }}
          >
            <div
              className="ww-modal flex flex-col"
              style={{
                width: isMobile ? '94%' : 560,
                maxHeight: isMobile ? '88%' : 500,
                background: 'rgba(10,10,18,0.96)',
                border: '1px solid rgba(245,200,66,0.35)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                overflow: 'hidden',
              }}
            >
              <div
                className="flex items-center justify-between"
                style={{
                  padding: '16px 16px 10px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  fontFamily: '"Press Start 2P", monospace',
                  color: '#F5C842',
                  fontSize: '10px',
                  flexShrink: 0,
                }}
              >
                <span>WASPI SHOP</span>
                <button onClick={closeShop} style={modalCloseButtonStyle()}>
                  CERRAR
                </button>
              </div>

              <div style={{ overflowY: 'auto', padding: '12px 16px 16px', flexGrow: 1 }}>
                <div className="flex gap-2 mb-3">
                  <button style={tabButtonStyle(true)}>
                    ROPA TENKS
                  </button>
                </div>

                <div style={{ fontFamily: '"Silkscreen", monospace', color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
                    Compra ropa con TENKS. La prenda se agrega al inventario y se equipa al instante.
                  </div>
                  <div className="space-y-2">
                    {clothingItems.map((item) => {
                      const ownedItem = owned.includes(item.id);
                      const active = item.slot === 'top' ? equipped.top === item.id : equipped.bottom === item.id;
                      return (
                        <div
                          key={item.id}
                          className="ww-panel"
                          style={{
                            padding: '12px',
                            border: active ? '1px solid rgba(57,255,20,0.45)' : '1px solid rgba(255,255,255,0.1)',
                            background: active ? 'rgba(57,255,20,0.07)' : 'rgba(255,255,255,0.04)',
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
                                {active && <span style={{ fontSize: '11px', color: '#39FF14' }}>PUESTO</span>}
                                {!active && ownedItem && <span style={{ fontSize: '11px', color: '#39FF14' }}>TUYO</span>}
                              </div>
                              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.58)', marginTop: 4 }}>{item.description}</div>
                              <div style={{ fontSize: '12px', color: '#F5C842', marginTop: 4 }}>
                                {item.priceTenks.toLocaleString('es-AR')} TENKS
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (ownedItem) {
                                  handleEquipOwnedItem(item.id);
                                  setShopStatus(active ? `${item.name} ya esta equipado.` : `${item.name} equipado.`);
                                  return;
                                }
                                void buyShopItem(item);
                              }}
                              disabled={checkoutBusyId === item.id || active || (!ownedItem && !isAuthenticated)}
                              style={authButtonStyle(
                                active ? 'rgba(57,255,20,0.25)' : '#F5C842',
                                active ? '#39FF14' : '#0E0E14',
                                checkoutBusyId === item.id || active || (!ownedItem && !isAuthenticated),
                                active
                              )}
                            >
                              {active
                                ? 'PUESTO'
                                : checkoutBusyId === item.id
                                  ? 'CARGANDO...'
                                  : ownedItem
                                    ? 'EQUIPAR'
                                    : 'COMPRAR'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: shopStatus ? '#BBBBBB' : 'rgba(255,255,255,0.35)', marginTop: 10, minHeight: 16 }}>
                  {shopStatus || 'Toda la ropa de la tienda se compra con TENKS y se equipa al instante.'}
                </div>
              </div>

              <div
                style={{
                  padding: '10px 16px 16px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  flexShrink: 0,
                }}
              >
                <button onClick={closeShop} style={secondaryModalButtonStyle()}>
                  CERRAR SHOP
                </button>
              </div>
            </div>
          </div>
        )}

        {playerActions && (
          <div
            className="ww-overlay absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={(e) => { if (e.target === e.currentTarget) closePlayerActions(); }}
          >
            <div
              className="ww-modal"
              style={{
                width: 320,
                background: 'rgba(10,10,18,0.97)',
                border: '1px solid rgba(245,200,66,0.28)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
                padding: 16,
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: '"Press Start 2P", monospace', color: '#F5C842', fontSize: '10px' }}>
                  ACCIONES DE JUGADOR
                </div>
                <button onClick={closePlayerActions} style={modalCloseButtonStyle()}>
                  CERRAR
                </button>
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
                <button onClick={closePlayerActions} style={authButtonStyle('rgba(255,255,255,0.08)', '#FFFFFF', false, true)}>
                  CANCELAR
                </button>
              </div>
            </div>
          </div>
        )}

        {inventoryOpen && (
          <div
            className="ww-overlay absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={(e) => { if (e.target === e.currentTarget) closeInventory(); }}
          >
            <div
              className="ww-modal p-4"
              style={{
                width: isMobile ? '94%' : 420,
                background: 'rgba(10,10,18,0.95)',
                border: '1px solid rgba(245,200,66,0.35)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              }}
            >
              <div className="flex items-center justify-between mb-3" style={{ fontFamily: '"Press Start 2P", monospace', color: '#F5C842', fontSize: '10px' }}>
                <span>INVENTARIO</span>
                <button onClick={closeInventory} style={modalCloseButtonStyle()}>
                  CERRAR
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
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>1 pistol / 2 shotgun en training</div>
                    </div>
                  <button
                    onClick={() => {
                        handleEquipOwnedItem('UTIL-GUN-01');
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
                        handleEquipOwnedItem('UTIL-BALL-01');
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
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>DOCUMENTOS</div>
                  <div className="mt-2 space-y-1">
                    {passiveUtilityItems.length === 0 && (
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>
                        No tenes documentos especiales todavia.
                      </div>
                    )}
                    {passiveUtilityItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <div>
                          <div style={{ fontSize: '13px' }}>{item.name}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                            {item.description ?? 'Documento de propiedad.'}
                          </div>
                        </div>
                        <div
                          style={{
                            fontFamily: '"Press Start 2P", monospace',
                            fontSize: '7px',
                            color: '#F5C842',
                            border: '1px solid rgba(245,200,66,0.28)',
                            padding: '7px 9px',
                          }}
                        >
                          TUYO
                        </div>
                      </div>
                    ))}
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
                                handleEquipOwnedItem(id);
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
                    onClick={closeInventory}
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
              className="ww-chat-shell overflow-y-auto px-2 pt-1 pb-1"
              style={{
                maxHeight: isMobile ? '72px' : '100px',
                background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.65))',
              }}
            >
              {messages.map((m, index) => (
                <p
                  className="ww-chat-line"
                  key={m.id}
                  style={{
                    fontFamily: '"Silkscreen", "Courier New", monospace',
                    fontSize: '10px',
                    lineHeight: '1.5',
                    color: 'rgba(255,255,255,0.75)',
                    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                    animationDelay: `${Math.min(index, 6) * 25}ms`,
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

        {statsOpen && statsSnapshot && (
          <div
            className="ww-overlay absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.92)', zIndex: 40 }}
            onClick={(e) => { if (e.target === e.currentTarget) closeStats(); }}
          >
            <div
              className="ww-modal flex flex-col"
              style={{
                width: isMobile ? '100%' : 640,
                height: isMobile ? '100%' : 500,
                background: 'rgba(8,8,18,0.98)',
                border: '1px solid rgba(245,200,66,0.3)',
                boxShadow: '0 0 60px rgba(245,200,66,0.08), 0 20px 60px rgba(0,0,0,0.7)',
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(245,200,66,0.12) 0%, rgba(0,0,0,0) 60%)',
                  borderBottom: '1px solid rgba(245,200,66,0.18)',
                  padding: '14px 16px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 36, height: 36,
                    borderRadius: '50%',
                    background: 'rgba(245,200,66,0.15)',
                    border: '2px solid rgba(245,200,66,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  🎮
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 9, color: '#F5C842', letterSpacing: 1 }}>
                    {playerInfo?.username ?? '---'}
                  </div>
                  <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
                    NIVEL {progression.level}
                    {progression.nextLevelAt !== null && (
                      <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>
                        · {progression.xp} / {progression.nextLevelAt} XP
                      </span>
                    )}
                  </div>
                  {/* XP bar */}
                  <div style={{ marginTop: 5, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.round(progressPct * 100)}%`,
                        background: 'linear-gradient(90deg, #F5C842, #FFE084)',
                        borderRadius: 2,
                        transition: 'width 600ms ease',
                      }}
                    />
                  </div>
                </div>
                <button
                  onClick={closeStats}
                  style={modalCloseButtonStyle()}
                >
                  CERRAR
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                {(['COMBAT', 'PROGRESS', 'EXPLORE', 'MINIGAMES'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStatsTab(tab)}
                    style={{
                      flex: 1,
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: isMobile ? 6 : 7,
                      padding: '9px 4px',
                      background: statsTab === tab ? 'rgba(245,200,66,0.14)' : 'transparent',
                      color: statsTab === tab ? '#F5C842' : 'rgba(255,255,255,0.35)',
                      border: 'none',
                      borderBottom: statsTab === tab ? '2px solid #F5C842' : '2px solid transparent',
                      cursor: 'pointer',
                      letterSpacing: 0.5,
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {statsTab === 'COMBAT' && (
                  <div>
                    {[
                      { label: 'ZOMBIE KILLS',  value: statsSnapshot.zombie_kills },
                      { label: 'PVP KILLS',     value: statsSnapshot.pvp_kills },
                      { label: 'TOTAL KILLS',   value: statsSnapshot.zombie_kills + statsSnapshot.pvp_kills, gold: true },
                      { label: 'DEATHS',        value: statsSnapshot.deaths },
                      { label: 'K/D RATIO',     value: statsSnapshot.deaths === 0
                          ? (statsSnapshot.zombie_kills + statsSnapshot.pvp_kills > 0 ? '∞' : '---')
                          : ((statsSnapshot.zombie_kills + statsSnapshot.pvp_kills) / statsSnapshot.deaths).toFixed(2), gold: true },
                      { label: 'BEST STREAK',   value: statsSnapshot.kill_streak_best },
                    ].map(({ label, value, gold }) => (
                      <StatRow key={label} label={label} value={value} gold={gold} />
                    ))}
                  </div>
                )}

                {statsTab === 'PROGRESS' && (
                  <div>
                    {[
                      { label: 'LEVEL',         value: progression.level, gold: true },
                      { label: 'TOTAL XP',      value: progression.xp },
                      { label: 'NEXT LEVEL AT', value: progression.nextLevelAt ?? '---' },
                      { label: 'ITEMS OWNED',   value: owned.filter((id) => !id.startsWith('UTIL-')).length },
                    ].map(({ label, value, gold }) => (
                      <StatRow key={label} label={label} value={value} gold={gold} />
                    ))}
                  </div>
                )}

                {statsTab === 'EXPLORE' && (
                  <div>
                    {[
                      { label: 'TIME PLAYED',   value: formatTime(statsSnapshot.time_played_seconds), gold: true },
                      { label: 'ZONES VISITED', value: statsSnapshot.zones_visited.length, gold: true },
                    ].map(({ label, value, gold }) => (
                      <StatRow key={label} label={label} value={value} gold={gold} />
                    ))}
                    {statsSnapshot.zones_visited.length > 0 && (
                      <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                        <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
                          ZONAS EXPLORADAS
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {statsSnapshot.zones_visited.map((z) => (
                            <span
                              key={z}
                              style={{
                                fontFamily: '"Silkscreen", monospace',
                                fontSize: 10,
                                padding: '2px 7px',
                                background: 'rgba(245,200,66,0.1)',
                                border: '1px solid rgba(245,200,66,0.25)',
                                color: 'rgba(245,200,66,0.85)',
                              }}
                            >
                              {z}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {statsTab === 'MINIGAMES' && (
                  <div>
                    <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: 'rgba(255,255,255,0.3)', marginBottom: 8, letterSpacing: 1 }}>BASKET</div>
                    {[
                      { label: 'BEST SCORE', value: statsSnapshot.basket_best_score, gold: true },
                      { label: 'SHOTS TAKEN', value: statsSnapshot.basket_shots },
                      { label: 'BASKETS',    value: statsSnapshot.basket_makes },
                      { label: 'ACCURACY',   value: statsSnapshot.basket_shots === 0 ? '---' : `${Math.round((statsSnapshot.basket_makes / statsSnapshot.basket_shots) * 100)}%`, gold: true },
                    ].map(({ label, value, gold }) => (
                      <StatRow key={`b-${label}`} label={label} value={value} gold={gold} />
                    ))}

                    <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: 'rgba(255,255,255,0.3)', margin: '14px 0 8px', letterSpacing: 1 }}>PENALTY</div>
                    {[
                      { label: 'WINS',       value: statsSnapshot.penalty_wins, gold: true },
                      { label: 'LOSSES',     value: statsSnapshot.penalty_losses },
                      { label: 'GOALS',      value: statsSnapshot.penalty_goals },
                      { label: 'SAVES',      value: statsSnapshot.penalty_saves },
                    ].map(({ label, value, gold }) => (
                      <StatRow key={`p-${label}`} label={label} value={value} gold={gold} />
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '7px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
                  {isAuthenticated ? '✓ SINCRONIZADO' : '⚠ INICIA SESION PARA GUARDAR'}
                </div>
                <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
                  WASPI WORLD
                </div>
              </div>
            </div>
          </div>
        )}

        {settingsOpen && (
          <div
            className="ww-overlay absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', zIndex: 9000 }}
            onClick={(e) => { if (e.target === e.currentTarget) closeSettings(); }}
          >
            <div
              style={{
                width: isMobile ? '92%' : 380,
                background: 'rgba(10,10,18,0.97)',
                border: '1px solid rgba(245,200,66,0.3)',
                boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '80vh',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px 0',
                fontFamily: '"Press Start 2P", monospace',
                color: '#F5C842',
                fontSize: '10px',
                flexShrink: 0,
              }}>
                <span>⚙ SETTINGS</span>
                <button onClick={closeSettings} style={modalCloseButtonStyle()}>
                  CERRAR
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '10px 16px 0', flexShrink: 0 }}>
                {(['AUDIO', 'HUD'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSettingsTab(tab)}
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: '7px',
                      padding: '8px 14px',
                      background: 'none',
                      border: 'none',
                      borderBottom: settingsTab === tab ? '2px solid #F5C842' : '2px solid transparent',
                      color: settingsTab === tab ? '#F5C842' : 'rgba(255,255,255,0.35)',
                      cursor: 'pointer',
                      marginBottom: -1,
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Scrollable content */}
              <div style={{ overflowY: 'auto', padding: '8px 16px 16px', flexGrow: 1 }}>
                {settingsTab === 'AUDIO' && (
                  <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: '13px' }}>
                    {[
                      { label: 'MUSIC', desc: 'Arcade theme & scene tracks', value: audioSettings.musicEnabled, toggle: () => setAudioSettings((c) => ({ ...c, musicEnabled: !c.musicEnabled })) },
                      { label: 'SFX', desc: 'Shots, hits, UI sounds', value: audioSettings.sfxEnabled, toggle: () => setAudioSettings((c) => ({ ...c, sfxEnabled: !c.sfxEnabled })) },
                    ].map(({ label, desc, value, toggle }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <div style={{ color: '#fff', marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{desc}</div>
                        </div>
                        <button onClick={toggle} style={toggleButtonStyle(value)}>
                          {value ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {settingsTab === 'HUD' && (
                  <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: '13px' }}>
                    {[
                      { label: 'SOCIAL PANEL', desc: 'Connected players list (left)', value: hudSettings.showSocialPanel, toggle: () => setHudSettings((c) => ({ ...c, showSocialPanel: !c.showSocialPanel })) },
                      { label: 'PROGRESS PANEL', desc: 'Level, XP & KOs card', value: hudSettings.showProgressPanel, toggle: () => setHudSettings((c) => ({ ...c, showProgressPanel: !c.showProgressPanel })) },
                      { label: 'CONTROLS TIP', desc: 'Keybind hint card (top-right)', value: hudSettings.showControlsPanel, toggle: () => setHudSettings((c) => ({ ...c, showControlsPanel: !c.showControlsPanel })) },
                      { label: 'ARENA HUD', desc: 'Combat & progression text in-world', value: hudSettings.showArenaHud, toggle: () => setHudSettings((c) => ({ ...c, showArenaHud: !c.showArenaHud })) },
                    ].map(({ label, desc, value, toggle }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <div style={{ color: '#fff', marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{desc}</div>
                        </div>
                        <button onClick={toggle} style={toggleButtonStyle(value)}>
                          {value ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  padding: '0 16px 16px',
                  flexShrink: 0,
                }}
              >
                <button onClick={closeSettings} style={secondaryModalButtonStyle()}>
                  CERRAR SETTINGS
                </button>
              </div>
            </div>
          </div>
        )}

        {uiNotice && (
          <div
            className="ww-notice absolute top-14 left-1/2 -translate-x-1/2 px-3 py-2"
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
    </>
  );
}

function StatRow({ label, value, gold }: { label: string; value: string | number; gold?: boolean }) {
  const isEmpty = value === 0 || value === '0' || value === '';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '7px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <span style={{ fontFamily: '"Silkscreen", monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
        {label}
      </span>
      <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 8, color: isEmpty ? 'rgba(255,255,255,0.2)' : gold ? '#F5C842' : '#FFFFFF' }}>
        {isEmpty ? '---' : value}
      </span>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '---';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function nextBtnBg(smoking: boolean) {
  return smoking ? '#39FF14' : 'rgba(255,255,255,0.08)';
}

function toggleButtonStyle(enabled: boolean) {
  return {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '9px',
    padding: '10px 12px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: enabled ? '#39FF14' : 'rgba(255,255,255,0.08)',
    color: enabled ? '#0E0E14' : '#FFFFFF',
    cursor: 'pointer',
  } as const;
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

function modalCloseButtonStyle() {
  return {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '8px',
    padding: '8px 10px',
    color: '#FFFFFF',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    cursor: 'pointer',
    flexShrink: 0,
  } as const;
}

function secondaryModalButtonStyle() {
  return {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '8px',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
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

function hudCollapseButtonStyle() {
  return {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '8px',
    color: '#BBBBBB',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
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

function saveStoredPlayerState(player: PlayerState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify(player));
}

function loadStoredPlayerState(): PlayerState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PLAYER_STATE_STORAGE_KEY);
    return raw ? normalizePlayerState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function mergeHydratedPlayerState(
  localPlayer: PlayerState | null,
  remotePlayer: PlayerState
): PlayerState {
  if (!localPlayer) return remotePlayer;

  const remoteParcelId = remotePlayer.vecindad.ownedParcelId;
  const localParcelId = localPlayer.vecindad.ownedParcelId;
  const canRecoverPreAuthMaterials =
    !remoteParcelId &&
    !localParcelId &&
    remotePlayer.vecindad.materials === 0 &&
    localPlayer.vecindad.materials > 0;

  // Take the higher of local vs remote to avoid rolling back offline progress.
  // Fall back to ProgressionSystem's own localStorage key when localPlayer.progression
  // is absent — this covers saves created before the progression-persistence patch.
  const localProg = localPlayer.progression ?? (() => {
    const p = loadProgressionState();
    return (p.kills > 0 || p.xp > 0) ? { kills: p.kills, xp: p.xp } : undefined;
  })();
  const remoteProg = remotePlayer.progression;
  const mergedProgression: PlayerState['progression'] =
    localProg || remoteProg
      ? {
          kills: Math.max(localProg?.kills ?? 0, remoteProg?.kills ?? 0),
          xp: Math.max(localProg?.xp ?? 0, remoteProg?.xp ?? 0),
        }
      : undefined;

  return normalizePlayerState({
    ...remotePlayer,
    mutedPlayers: (remotePlayer.mutedPlayers?.length ? remotePlayer.mutedPlayers : localPlayer.mutedPlayers) ?? [],
    vecindad: {
      ...remotePlayer.vecindad,
      ownedParcelId: remoteParcelId,
      buildStage: remotePlayer.vecindad.buildStage,
      // Only recover pre-auth farming when the backend still has no vecindad progress at all.
      materials: canRecoverPreAuthMaterials
        ? localPlayer.vecindad.materials
        : remotePlayer.vecindad.materials,
    },
    progression: mergedProgression,
  });
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

function getInitialMagicLinkCooldownUntil() {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(MAGIC_LINK_COOLDOWN_KEY);
  const cooldownUntil = raw ? Number(raw) : 0;
  if (!Number.isFinite(cooldownUntil) || cooldownUntil <= Date.now()) {
    window.localStorage.removeItem(MAGIC_LINK_COOLDOWN_KEY);
    return 0;
  }
  return cooldownUntil;
}

function getInitialCheckoutState(): { open: boolean; tab: ShopTab; status: string } {
  if (typeof window === 'undefined') {
    return { open: false, tab: 'products', status: '' };
  }
  const status = new URLSearchParams(window.location.search).get('checkout');
  if (status === 'success') {
    return {
      open: true,
      tab: 'products',
      status: 'La tienda ya usa TENKS para ropa. Si venias de un checkout viejo, ya podes comprar directo en la tienda.',
    };
  }
  if (status === 'product_success') {
    return {
      open: true,
      tab: 'products',
      status: 'La ropa ahora se compra directo con TENKS y se equipa al instante.',
    };
  }
  if (status === 'cancelled') {
    return {
      open: true,
      tab: 'products',
      status: 'La tienda ya no necesita checkout para ropa. Compra directo con TENKS.',
    };
  }
  return { open: false, tab: 'products', status: '' };
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

