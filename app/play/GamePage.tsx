'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { CHAT } from '@/src/game/config/constants';
import { CATALOG, getItem as getCatalogItem, getPhysicalCatalog, type CatalogItem } from '@/src/game/config/catalog';
import { TENKS_PACKS } from '@/src/lib/tenksPacks';
import { getInventory, equipItem, hasUtilityEquipped, replaceInventory } from '@/src/game/systems/InventorySystem';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from '@/src/game/systems/AudioSettings';
import { applyOutputSinkToSfxContext } from '@/src/game/systems/AudioManager';
import {
  applySinkIdToAudioContext,
  getStoredAudioOutputDeviceId,
  setStoredAudioOutputDeviceId,
  supportsAudioOutputDevicePicker,
} from '@/src/game/systems/audioOutputSink';
import { loadHudSettings, saveHudSettings, type HudSettings } from '@/src/game/systems/HudSettings';
import {
  assignActionBinding,
  assignMovementBinding,
  clearVirtualJoystickState,
  formatMovementBindingLabel,
  isSupportedActionBindingCode,
  isSupportedMovementBindingCode,
  loadControlSettings,
  saveControlSettings,
  setVirtualJoystickState,
  type ActionBinding,
  type ControlSettings,
  type MovementDirection,
  type MovementScheme,
} from '@/src/game/systems/ControlSettings';
import { getLevelFloorXp, getMaxProgressionLevel, loadProgressionState, type ProgressionState } from '@/src/game/systems/ProgressionSystem';
import { initStatsSystem, teardownStatsSystem, getStats, type PlayerStats } from '@/src/game/systems/StatsSystem';
import { supabase } from '@/src/lib/supabase';
import { getTenksBalance, initTenks } from '@/src/game/systems/TenksSystem';
import { mutePlayer, normalizePlayerState, grantInventoryItem, type PlayerState } from '@/src/lib/playerState';
import type { SharedParcelState } from '@/src/lib/vecindad';
import { reconcileInventoryFromDB } from '@/src/lib/commercePersistence';
import { track } from '@/src/lib/analytics';

const PhaserGame = dynamic(() => import('@/app/components/PhaserGame'), { ssr: false });
const JukeboxOverlay = dynamic(() => import('@/app/components/JukeboxOverlay'), { ssr: false });
const GameHUD = dynamic(() => import('@/app/components/GameHUD'), { ssr: false });
const CharacterCreatorOverlay = dynamic(() => import('@/app/components/CharacterCreatorOverlay'), { ssr: false });
const ShopOverlay = dynamic(() => import('@/app/components/ShopOverlay'), { ssr: false });
const InventoryOverlay = dynamic(() => import('@/app/components/InventoryOverlay'), { ssr: false });
const UINotice = dynamic(() => import('@/app/components/UINotice'), { ssr: false });
const PlayerActionsOverlay = dynamic(() => import('@/app/components/PlayerActionsOverlay'), { ssr: false });
const StatsOverlay = dynamic(() => import('@/app/components/StatsOverlay'), { ssr: false });
const SettingsOverlay = dynamic(() => import('@/app/components/SettingsOverlay'), { ssr: false });
const LoginCard = dynamic(() => import('@/app/components/LoginCard'), { ssr: false });
const LeaderboardOverlay = dynamic(() => import('@/app/components/LeaderboardOverlay'), { ssr: false });
const QuestTracker = dynamic(() => import('@/app/components/QuestTracker'), { ssr: false });
const VirtualJoystick = dynamic(() => import('@/app/components/VirtualJoystick'), { ssr: false });
const AVATAR_STORAGE_KEY = 'waspi_avatar_config';
const PLAYER_STATE_STORAGE_KEY = 'waspi_player_state';
const MAGIC_LINK_COOLDOWN_KEY = 'waspi_magic_link_cooldown_until';
const VOICE_MIC_DEVICE_KEY = 'waspi_voice_mic_device_id';
const MAGIC_LINK_COOLDOWN_MS = 60_000;

type SettingsTab = 'audio' | 'hud' | 'controls' | 'voice';

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

type ShopTab = 'tenks_virtual' | 'physical' | 'tenks_packs' | 'orders';

interface OrderRow {
  id: string;
  created_at: string;
  items: Array<{ product_id: string; size: string }>;
  total: number;
  currency: string;
  status: string;
  discount_code: string | null;
}

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

type FarmActionRequestPayload =
  | { action: 'farm_unlock' }
  | { action: 'farm_plant'; slotIndex: number; seedType: 'basica' | 'indica' | 'sativa' | 'purple_haze' | 'og_kush' }
  | { action: 'farm_water'; slotIndex: number }
  | { action: 'farm_harvest'; slotIndex: number };

const CHAT_SCENES = new Set([
  'WorldScene',
  'VecindadScene',
  'StoreInterior',
  'GunShopInterior',
  'CafeInterior',
  'ArcadeInterior',
  'CasinoInterior',
  'HouseInterior',
  'PvpArenaScene',
  'ZombiesScene',
  'BasementZombiesScene',
  'BosqueMaterialesScene',
]);
const INTERIOR_SOCIAL_SCENES = new Set([
  'VecindadScene',
  'StoreInterior',
  'GunShopInterior',
  'CafeInterior',
  'ArcadeInterior',
  'CasinoInterior',
  'HouseInterior',
  'ZombiesScene',
  'BasementZombiesScene',
  'BosqueMaterialesScene',
]);
const JOYSTICK_SCENES = new Set(['WorldScene', 'VecindadScene', 'StoreInterior', 'GunShopInterior', 'PvpArenaScene', 'ZombiesScene', 'BasementZombiesScene', 'BosqueMaterialesScene']);

export default function PlayPage() {
  const initialInventory = useMemo(() => getInventory(), []);
  const initialCheckout = useMemo(() => getInitialCheckoutState(), []);
  const initialAudioSettings = useMemo(() => loadAudioSettings(), []);
  const initialHudSettings = useMemo(() => loadHudSettings(), []);
  const initialControlSettings = useMemo(() => loadControlSettings(), []);
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
  const [tenksAnimating, setTenksAnimating] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [smoking, setSmoking] = useState(false);
  const [owned, setOwned] = useState<string[]>(initialInventory.owned);
  const [equipped, setEquipped] = useState<{ top?: string; bottom?: string }>(initialInventory.equipped);
  const [gunOn, setGunOn] = useState((initialInventory.equipped.utility ?? []).includes('UTIL-GUN-01'));
  const [ballOn, setBallOn] = useState((initialInventory.equipped.utility ?? []).includes('UTIL-BALL-01'));
  const [activeScene, setActiveScene] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingSlide, setOnboardingSlide] = useState(0);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [magicLinkCooldownUntil, setMagicLinkCooldownUntil] = useState(getInitialMagicLinkCooldownUntil);
  const [uiNotice, setUiNotice] = useState<{ msg: string; color?: string } | null>(null);
  const [shopOpen, setShopOpen] = useState(initialCheckout.open);
  const [shopSource, setShopSource] = useState(initialCheckout.open ? 'checkout_return' : '');
  const [shopTab, setShopTab] = useState<ShopTab>(initialCheckout.tab);
  const [shopItems, setShopItems] = useState<CatalogItem[]>([]);
  const [checkoutBusyId, setCheckoutBusyId] = useState<string | null>(null);
  const [shopStatus, setShopStatus] = useState(initialCheckout.status);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [checkoutRedirecting, setCheckoutRedirecting] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [showMobileHint, setShowMobileHint] = useState(false);
  const [playerActions, setPlayerActions] = useState<PlayerActionsPayload | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [statsData, setStatsData] = useState<PlayerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicDeviceId, setSelectedMicDeviceId] = useState<string>(getInitialSelectedMicDeviceId);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>(() =>
    typeof window !== 'undefined' ? getStoredAudioOutputDeviceId() : ''
  );
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('audio');
  const [jukeboxOpen, setJukeboxOpen] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(initialAudioSettings);
  const [hudSettings, setHudSettings] = useState<HudSettings>(initialHudSettings);
  const [controlSettings, setControlSettings] = useState<ControlSettings>(initialControlSettings);
  const [bindingCaptureDirection, setBindingCaptureDirection] = useState<MovementDirection | null>(null);
  const [bindingCaptureAction, setBindingCaptureAction] = useState<ActionBinding | null>(null);
  const [joystickUi, setJoystickUi] = useState({ active: false, dx: 0, dy: 0 });
  const [rescueArmed, setRescueArmed] = useState(false);
  const [activeActivities, setActiveActivities] = useState<ReadonlySet<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tokenRef = useRef<string | null>(null);
  const playerStateRef = useRef<PlayerState | null>(null);
  const activeSceneRef = useRef('');
  /** Escena Phaser anterior (para no re-abrir onboarding al volver del interior con ESC). */
  const previousPhaserSceneRef = useRef('');
  const suppressSyncRef = useRef(false);
  const mutedPlayersRef = useRef<string[]>(loadStoredMutedPlayers());
  const lastInteriorChatSentRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  const rescueTimeoutRef = useRef<number | null>(null);
  const [chatEnabled, setChatEnabled] = useState(true);
  const chatVisible = chatEnabled && CHAT_SCENES.has(activeScene);
  const isAuthenticated = Boolean(authEmail);

  const clothingItems = useMemo(
    () => (shopItems.length ? shopItems : CATALOG).filter((item) => item.slot !== 'utility' && item.priceTenks > 0),
    [shopItems]
  );

  const playUiSfx = useCallback((freq: number, duration: number, sweep?: number) => {
    try {
      if (!loadAudioSettings().sfxEnabled) return;
      let created = false;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        created = true;
      }
      const ctx = audioCtxRef.current;
      if (created) {
        const sid = getStoredAudioOutputDeviceId();
        if (sid) void applySinkIdToAudioContext(ctx, sid);
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (sweep !== undefined) osc.frequency.linearRampToValueAtTime(sweep, ctx.currentTime + duration);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.01);
    } catch { /* silent fail */ }
  }, []);

  const applyPlayerState = useCallback((player: PlayerState) => {
    suppressSyncRef.current = true;
    playerStateRef.current = player;
    saveStoredAvatarConfig({
      ...loadStoredAvatarConfig(),
      ...player.avatar,
    });
    saveStoredPlayerState(player);
    replaceInventory(player.inventory);
    initTenks(player.tenks);
    mutedPlayersRef.current = player.mutedPlayers ?? [];
    setPlayerState(player);
    setOwned(player.inventory.owned);
    setEquipped(player.inventory.equipped);
    setGunOn((player.inventory.equipped.utility ?? []).includes('UTIL-GUN-01'));
    setBallOn((player.inventory.equipped.utility ?? []).includes('UTIL-BALL-01'));
    setTenks(player.tenks);
    eventBus.emit(EVENTS.PARCEL_STATE_CHANGED, player.vecindad);
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
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsMobile(w <= 768);
      setIsPortrait(w < h);
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
      // Persist player identity for game systems that read it (e.g. JukeboxSystem)
      try {
        localStorage.setItem('waspi_player_info', JSON.stringify({ playerId: next.playerId, username: next.username }));
      } catch { /* silent */ }
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
      setProgression((prev) => {
        const nextLevel = typeof next?.level === 'number' ? next.level : 1;
        if (nextLevel > prev.level) playUiSfx(392, 0.40, 784);
        return {
          kills: typeof next?.kills === 'number' ? next.kills : 0,
          xp: typeof next?.xp === 'number' ? next.xp : 0,
          level: nextLevel,
          nextLevelAt: typeof next?.nextLevelAt === 'number' || next?.nextLevelAt === null
            ? next.nextLevelAt
            : null,
        };
      });
    });

    const unsubTenks = eventBus.on(EVENTS.TENKS_CHANGED, (payload: unknown) => {
      const p = payload as { balance: number; delta?: number; reason?: string };
      setTenks(p.balance);
      if (p.reason !== 'init') {
        setTenksAnimating(true);
        window.setTimeout(() => setTenksAnimating(false), 400);
        if (typeof p.delta === 'number') {
          if (p.delta > 0) playUiSfx(440, 0.12, 660);
          else if (p.delta < 0) playUiSfx(330, 0.10, 220);
        }
      }
    });

    const unsubScene = eventBus.on(EVENTS.SCENE_CHANGED, (sceneName: unknown) => {
      if (typeof sceneName !== 'string') return;
      const prev = previousPhaserSceneRef.current;
      previousPhaserSceneRef.current = sceneName;
      setActiveScene(sceneName);
      track('scene_enter', { scene: sceneName });
      if (sceneName === 'WorldScene') {
        // Evita overlay oscuro “pegado” al salir de interiores (shop / Stripe) si React no sincronizó.
        setShopOpen(false);
        setShopSource('');
        setCheckoutRedirecting(false);
        setJukeboxOpen(false);
        // Onboarding es casi fullscreen oscuro: solo al primer ingreso (Creator / boot), no al salir con ESC de una tienda.
        if (!localStorage.getItem('waspi_onboarding_v1')) {
          const firstWorldEntry = prev === '' || prev === 'CreatorScene';
          if (firstWorldEntry) {
            setShowOnboarding(true);
          }
        }
      }
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
      playUiSfx(660, 0.18, 990);
    });

    const unsubShopOpen = eventBus.on(EVENTS.SHOP_OPEN, (payload: unknown) => {
      const next = (payload as ShopOpenPayload | undefined) ?? {};
      setShopSource(next.source ?? 'scene');
      setShopOpen(true);
      setShopStatus(next.source === 'store_interior' ? 'Compra ropa con TENKS y equipala al instante.' : '');
      track('shop_open', { source: next.source ?? 'scene' });
    });

    const unsubShopClose = eventBus.on(EVENTS.SHOP_CLOSE, () => {
      setShopSource('');
      setShopOpen(false);
    });

    const unsubJukeboxOpen  = eventBus.on(EVENTS.JUKEBOX_OPEN,  () => setJukeboxOpen(true));
    const unsubJukeboxClose = eventBus.on(EVENTS.JUKEBOX_CLOSE, () => setJukeboxOpen(false));

    const unsubPlayerActions = eventBus.on(EVENTS.PLAYER_ACTIONS_OPEN, (payload: unknown) => {
      const next = payload as PlayerActionsPayload | null;
      setPlayerActions(next);
    });

    const unsubPenalty = eventBus.on(EVENTS.PENALTY_RESULT, (payload: unknown) => {
      const result = payload as PenaltyResultPayload;
      if (!result?.won) return;
      if (!tokenRef.current) {
        setUiNotice({ msg: 'Ganaste el minijuego. Inicia sesion para acreditar TENKS.', color: '#46B3FF' });
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
          setUiNotice({ msg: 'Ganaste el minijuego, pero el premio no se guardo todavia.', color: '#FF4444' });
          return;
        }

        const json = await res.json();
        if (json.player) {
          applyPlayerState(json.player as PlayerState);
        }
        const earned = typeof json.tenksEarned === 'number' ? json.tenksEarned : 0;
        setUiNotice({ msg: earned > 0 ? `Premio guardado: +${earned} TENKS` : 'Partida registrada.' });
      })();
    });

    const unsubParcelBuy = eventBus.on(EVENTS.PARCEL_BUY_REQUEST, (payload: unknown) => {
      const next = payload as ParcelBuyPayload | null;
      if (!next?.parcelId) return;

      void (async () => {
        if (!tokenRef.current) {
          setUiNotice({ msg: 'Inicia sesion para comprar una parcela unica en La Vecindad.', color: '#46B3FF' });
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
          setUiNotice({ msg: json?.error ?? 'No pude comprar esa parcela.', color: '#FF4444' });
          return;
        }

        applyPlayerState(normalizePlayerState(json.player));
        if (json.parcels) {
          eventBus.emit(EVENTS.VECINDAD_SHARED_STATE_CHANGED, {
            parcels: json.parcels,
            broadcast: true,
          } satisfies VecindadSharedPayload);
        }
        setUiNotice({ msg: json.notice ?? `Compraste la parcela ${next.parcelId}.` });
      })();
    });

    const unsubParcelBuild = eventBus.on(EVENTS.PARCEL_BUILD_REQUEST, () => {
      void (async () => {
        if (!tokenRef.current) {
          setUiNotice({ msg: 'Inicia sesion para construir en tu parcela.', color: '#46B3FF' });
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
          setUiNotice({ msg: json?.error ?? 'No pude mejorar la casa.', color: '#FF4444' });
          return;
        }

        applyPlayerState(normalizePlayerState(json.player));
        if (json.parcels) {
          eventBus.emit(EVENTS.VECINDAD_SHARED_STATE_CHANGED, {
            parcels: json.parcels,
            broadcast: true,
          } satisfies VecindadSharedPayload);
        }
        setUiNotice({ msg: json.notice ?? 'Casa mejorada.' });
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
      if (next.notice) setUiNotice({ msg: next.notice });
    });

    const unsubFarmAction = eventBus.on(EVENTS.FARM_ACTION_REQUEST, (payload: unknown) => {
      const next = payload as FarmActionRequestPayload | null;
      if (!next?.action) return;
      void (async () => {
        if (!tokenRef.current) {
          setUiNotice({ msg: 'Inicia sesion para usar Cannabis Farm.', color: '#46B3FF' });
          return;
        }
        const res = await fetch('/api/vecindad', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: JSON.stringify(next),
        }).catch(() => null);

        const json = await res?.json().catch(() => null) as {
          error?: string;
          notice?: string;
          player?: PlayerState;
          parcels?: SharedParcelState[];
          reward?: number;
        } | null;

        if (!res?.ok || !json?.player) {
          setUiNotice({ msg: json?.error ?? 'No pude procesar la accion del farm.', color: '#FF4444' });
          return;
        }

        applyPlayerState(normalizePlayerState(json.player));
        if (json.parcels) {
          eventBus.emit(EVENTS.VECINDAD_SHARED_STATE_CHANGED, {
            parcels: json.parcels,
            broadcast: true,
          } satisfies VecindadSharedPayload);
        }
        if (next.action === 'farm_unlock') {
          eventBus.emit(EVENTS.FARM_UNLOCKED, {});
        } else if (next.action === 'farm_plant') {
          eventBus.emit(EVENTS.FARM_PLANTED, { slotIndex: next.slotIndex, seedType: next.seedType });
        } else if (next.action === 'farm_water') {
          eventBus.emit(EVENTS.FARM_WATERED, { slotIndex: next.slotIndex });
        } else if (next.action === 'farm_harvest') {
          eventBus.emit(EVENTS.FARM_HARVESTED, { slotIndex: next.slotIndex, reward: json.reward });
        }
        setUiNotice({ msg: json.notice ?? 'Accion de farm completada.' });
      })();
    });

    const unsubUiNotice = eventBus.on(EVENTS.UI_NOTICE, (payload: unknown) => {
      if (typeof payload === 'string' && payload.trim()) {
        setUiNotice({ msg: payload });
      } else if (payload && typeof payload === 'object' && typeof (payload as { msg?: unknown }).msg === 'string') {
        const p = payload as { msg: string; color?: string };
        if (p.msg.trim()) setUiNotice({ msg: p.msg, color: p.color });
      }
    });

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
      unsubJukeboxOpen();
      unsubJukeboxClose();
      unsubPlayerActions();
      unsubPenalty();
      unsubParcelBuy();
      unsubParcelBuild();
      unsubVecindadUpdate();
      unsubFarmAction();
      unsubUiNotice();
    };
  }, [applyPlayerState, playUiSfx, playerState, syncPlayerState]);

  useEffect(() => {
    if (!uiNotice) return;
    const timer = window.setTimeout(() => setUiNotice(null), 4200);
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
    saveControlSettings(controlSettings);
    eventBus.emit(EVENTS.CONTROL_SETTINGS_CHANGED, controlSettings);
    if (!controlSettings.showVirtualJoystick) {
      clearVirtualJoystickState();
    }
  }, [controlSettings]);

  useEffect(() => {
    if (!settingsOpen) return;
    navigator.mediaDevices?.enumerateDevices().then((devices) => {
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      setMicDevices(inputs);
      setSelectedMicDeviceId((prev) => {
        if (inputs.length === 0) return prev;
        if (prev && inputs.some((d) => d.deviceId === prev)) return prev;
        return inputs[0].deviceId;
      });
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      setOutputDevices(outputs);
      setSelectedOutputDeviceId((prev) => {
        if (!prev) return prev;
        if (outputs.some((d) => d.deviceId === prev)) return prev;
        return '';
      });
    }).catch(() => {});
  }, [settingsOpen]);

  useEffect(() => {
    setStoredAudioOutputDeviceId(selectedOutputDeviceId);
  }, [selectedOutputDeviceId]);

  useEffect(() => {
    eventBus.emit(EVENTS.AUDIO_OUTPUT_SINK_CHANGED, selectedOutputDeviceId);
    void applyOutputSinkToSfxContext(selectedOutputDeviceId);
    const ctx = audioCtxRef.current;
    if (ctx) void applySinkIdToAudioContext(ctx, selectedOutputDeviceId);
  }, [selectedOutputDeviceId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (selectedMicDeviceId) {
        window.localStorage.setItem(VOICE_MIC_DEVICE_KEY, selectedMicDeviceId);
      } else {
        window.localStorage.removeItem(VOICE_MIC_DEVICE_KEY);
      }
    } catch {
      // noop
    }
  }, [selectedMicDeviceId]);

  useEffect(() => {
    activeSceneRef.current = activeScene;
  }, [activeScene]);

  useEffect(() => {
    if (isMobile && activeScene === 'WorldScene' && !localStorage.getItem('waspi_mobile_hint_v1')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowMobileHint(true);
      const t = window.setTimeout(() => {
        setShowMobileHint(false);
        localStorage.setItem('waspi_mobile_hint_v1', 'done');
      }, 5000);
      return () => window.clearTimeout(t);
    }
  }, [isMobile, activeScene]);

  useEffect(() => () => {
    clearVirtualJoystickState();
    if (rescueTimeoutRef.current) {
      window.clearTimeout(rescueTimeoutRef.current);
      rescueTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if ((!bindingCaptureDirection && !bindingCaptureAction) || !settingsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (jukeboxOpen) return;
      if (event.repeat) return;
      event.preventDefault();
      event.stopPropagation();

      if (event.code === 'Escape') {
        setBindingCaptureDirection(null);
        setBindingCaptureAction(null);
        setUiNotice({ msg: 'Remapeo cancelado.' });
        return;
      }

      if (bindingCaptureDirection && !isSupportedMovementBindingCode(event.code)) {
        setUiNotice({ msg: 'Tecla no soportada para movimiento.', color: '#FF4444' });
        return;
      }

      if (bindingCaptureAction && !isSupportedActionBindingCode(event.code)) {
        setUiNotice({ msg: 'Tecla no soportada para accion.', color: '#FF4444' });
        return;
      }

      if (bindingCaptureDirection) {
        setControlSettings((current) => ({
          ...current,
          movementScheme: 'custom',
          movementBindings: assignMovementBinding(current.movementBindings, bindingCaptureDirection, event.code),
        }));
        setBindingCaptureDirection(null);
        setUiNotice({ msg: `Movimiento ${directionLabel(bindingCaptureDirection)}: ${formatMovementBindingLabel(event.code)}` });
        return;
      }

      if (bindingCaptureAction) {
        setControlSettings((current) => ({
          ...current,
          actionBindings: assignActionBinding(current.actionBindings, bindingCaptureAction, event.code),
        }));
        setBindingCaptureAction(null);
        setUiNotice({ msg: `Accion ${actionLabel(bindingCaptureAction)}: ${formatMovementBindingLabel(event.code)}` });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [bindingCaptureAction, bindingCaptureDirection, jukeboxOpen, settingsOpen]);

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
      if (JSON.stringify(merged) !== JSON.stringify(normalizePlayerState(remotePlayer))) {
        void syncPlayerState(merged);
      }
    }
  }, [applyPlayerState, loadVecindadSharedState, syncPlayerState]);

  const refreshPlayerState = useCallback(async () => {
    let token = tokenRef.current;
    let playerId: string | null = null;
    if (!token && supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
      if (data.session) {
        tokenRef.current = data.session.access_token;
        setAuthEmail(data.session.user.email ?? null);
        playerId = data.session.user.id;
      }
    } else if (supabase) {
      const { data } = await supabase.auth.getSession();
      playerId = data.session?.user.id ?? null;
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

    if (player) {
      let normalized = normalizePlayerState(player);

      // Reconcile: if the webhook wrote to DB but user_metadata update failed,
      // items will be in player_inventory but missing from the player state.
      // Merge them back in so the player gets their purchases.
      if (playerId && supabase) {
        const reconciledOwned = await reconcileInventoryFromDB(supabase, playerId, normalized.inventory.owned);
        if (reconciledOwned.length > normalized.inventory.owned.length) {
          const newItemIds = reconciledOwned.filter((id) => !normalized.inventory.owned.includes(id));
          let reconciledState = normalized;
          for (const itemId of newItemIds) {
            reconciledState = grantInventoryItem(reconciledState, itemId);
          }
          normalized = reconciledState;
        }
      }

      applyPlayerState(normalized);
    }

    // Clean up transient query params (checkout, OAuth code) from URL
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of ['checkout', 'code', 'error', 'error_description']) {
        if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; }
      }
      if (changed) window.history.replaceState({}, '', url.toString());
    }

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

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('Supabase no esta configurado.');
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    setAuthBusy(false);
    if (error) {
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
    teardownStatsSystem();
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
    track('shop_purchase', { item_id: item.id, price_tenks: item.priceTenks });
    setCheckoutBusyId(null);
    setShopStatus(
      (json.notice as string | undefined)
      ?? `${item.name} comprado por ${item.priceTenks.toLocaleString('es-AR')} TENKS y equipado.`
    );
  }, [applyPlayerState]);

  const loadOrders = useCallback(async () => {
    if (!tokenRef.current || ordersLoading) return;
    setOrdersLoading(true);
    try {
      const res = await fetch('/api/player/orders', {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (!res.ok) return;
      const data = await res.json() as { orders?: OrderRow[] };
      setOrders(data.orders ?? []);
      setOrdersLoaded(true);
    } catch { /* silent */ } finally {
      setOrdersLoading(false);
    }
  }, [ordersLoading]);

  const startStripeCheckout = useCallback(async (
    type: 'product' | 'tenks_pack',
    payload: { itemId?: string; size?: string; discountCode?: string; packId?: string }
  ) => {
    if (!tokenRef.current) {
      setShopStatus('Iniciá sesión para comprar.');
      return;
    }
    setCheckoutRedirecting(true);
    setShopStatus('');

    const body = type === 'product'
      ? { type: 'product', itemId: payload.itemId, size: payload.size, discountCode: payload.discountCode || undefined }
      : { type: 'tenks_pack', packId: payload.packId };

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!res?.ok) {
      const json = await res?.json().catch(() => null);
      setCheckoutRedirecting(false);
      setShopStatus((json as { error?: string } | null)?.error ?? 'No se pudo iniciar el checkout.');
      return;
    }

    const json = await res.json() as { url?: string };
    if (json.url) {
      window.location.href = json.url;
    } else {
      setCheckoutRedirecting(false);
      setShopStatus('Error al obtener la URL de pago.');
    }
  }, []);

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
      if (jukeboxOpen) return;
      // Toggle chat visibility (keeps ENTER for focusing the input)
      if (CHAT_SCENES.has(activeScene) && e.code === 'KeyT' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        setChatEnabled((v) => !v);
        if (chatEnabled) {
          inputRef.current?.blur();
        }
        return;
      }

      if (!chatVisible) return;
      if (e.code === controlSettings.actionBindings.chat && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.code === controlSettings.actionBindings.inventory && document.activeElement !== inputRef.current) {
        e.preventDefault();
        eventBus.emit(EVENTS.INVENTORY_TOGGLE);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeScene, chatEnabled, chatVisible, controlSettings.actionBindings.chat, controlSettings.actionBindings.inventory, jukeboxOpen]);

  useEffect(() => {
    if (!chatVisible) {
      inputRef.current?.blur();
    }
  }, [chatVisible]);

  useEffect(() => {
    if (shopTab === 'orders' && !ordersLoaded && isAuthenticated) {
      void loadOrders();
    }
  }, [shopTab, ordersLoaded, isAuthenticated, loadOrders]);

  useEffect(() => {
    if (shopSource !== 'store_interior') return;
    if (activeScene === 'StoreInterior') return;
    const closeTimer = window.setTimeout(() => {
      eventBus.emit(EVENTS.SHOP_CLOSE);
      setShopOpen(false);
      setShopSource('');
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [activeScene, shopSource]);

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
  }, [activeScene, playerInfo]);

  // ── Combo HUD: track simultaneous active skills ────────────────────────────
  useEffect(() => {
    const onStart = (payload: unknown) => {
      const p = payload as { activity?: string };
      if (typeof p?.activity === 'string') {
        setActiveActivities((prev) => new Set([...prev, p.activity as string]));
      }
    };
    const onStop = (payload: unknown) => {
      const p = payload as { activity?: string };
      if (typeof p?.activity === 'string') {
        setActiveActivities((prev) => {
          const next = new Set(prev);
          next.delete(p.activity as string);
          return next;
        });
      }
    };
    const offStart = eventBus.on(EVENTS.ACTIVITY_STARTED, onStart);
    const offStop  = eventBus.on(EVENTS.ACTIVITY_STOPPED,  onStop);
    // Clear all activities when the scene changes (scene exit clears stale state)
    const offScene = eventBus.on(EVENTS.SCENE_CHANGED, () => setActiveActivities(new Set()));
    return () => {
      offStart();
      offStop();
      offScene();
    };
  }, []);

  const sendMessage = useCallback(() => {
    const now = Date.now();
    const trimmed = input.trim().slice(0, CHAT.MAX_CHARS);
    if (!chatVisible || !trimmed || now - lastSent < CHAT.RATE_LIMIT_MS) return;

    playUiSfx(880, 0.08);
    eventBus.emit(EVENTS.CHAT_SEND, trimmed);
    setInput('');
    setLastSent(now);
  }, [chatVisible, input, lastSent, playUiSfx]);

  const currentLevelFloorXp = getLevelFloorXp(progression.level);
  const nextLevelDelta = progression.nextLevelAt === null
    ? 0
    : Math.max(0, progression.nextLevelAt - progression.xp);
  const levelSpanXp = progression.nextLevelAt === null
    ? 1
    : Math.max(1, progression.nextLevelAt - currentLevelFloorXp);
  const progressPct = progression.nextLevelAt === null
    ? 1
    : Math.max(0, Math.min(1, (progression.xp - currentLevelFloorXp) / levelSpanXp));
  const joystickVisible = controlSettings.showVirtualJoystick && JOYSTICK_SCENES.has(activeScene);
  const comboCount = activeActivities.size;
  const comboMultiplier = comboCount >= 3 ? '2.0' : comboCount === 2 ? '1.5' : null;
  const armSafeReset = useCallback(() => {
    setRescueArmed(true);
    setUiNotice({ msg: 'Volver a plaza armado. Toca de nuevo para confirmar.', color: '#46B3FF' });
    window.setTimeout(() => {
      setRescueArmed(false);
    }, 4000);
  }, []);
  const openStats = useCallback(async () => {
    setStatsOpen(true);
    setStatsLoading(true);
    let token = tokenRef.current;
    if (!token && supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
      tokenRef.current = token;
      setAuthEmail(data.session?.user?.email ?? null);
    }

    if (token) {
      const res = await fetch('/api/player/stats', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (res?.ok) {
        const json = await res.json() as { stats?: PlayerStats };
        if (json.stats) {
          setStatsData(json.stats);
        } else {
          // Defensive fallback: keep panel useful even with malformed payload.
          setStatsData(getStats() as PlayerStats);
        }
      } else {
        // If the API fails while authenticated, avoid showing "not logged in".
        setStatsData(getStats() as PlayerStats);
      }
    } else {
      // Guest: show in-memory session stats
      setStatsData(getStats() as PlayerStats);
    }
    setStatsLoading(false);
  }, []);

  const closeStats = useCallback(() => {
    setStatsOpen(false);
    setStatsData(null);
  }, []);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => {
    setBindingCaptureDirection(null);
    setBindingCaptureAction(null);
    setSettingsOpen(false);
  }, []);

  const confirmSafeReset = useCallback(() => {
    setRescueArmed(false);
    closeSettings();
    setUiNotice({ msg: 'Rescate a plaza...', color: '#46B3FF' });
    eventBus.emit(EVENTS.SAFE_RESET_TO_PLAZA);
    if (rescueTimeoutRef.current) {
      window.clearTimeout(rescueTimeoutRef.current);
    }
    rescueTimeoutRef.current = window.setTimeout(() => {
      if (activeSceneRef.current !== 'WorldScene') {
        window.location.assign('/play');
      }
    }, 1200);
  }, [closeSettings]);

  const handleSafeReset = useCallback(() => {
    if (rescueArmed) {
      confirmSafeReset();
      return;
    }
    armSafeReset();
  }, [armSafeReset, confirmSafeReset, rescueArmed]);

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

  const passiveUtilityItems = useMemo(
    () => owned
      .map((id) => CATALOG.find((i) => i.id === id))
      .filter((item): item is CatalogItem => Boolean(item))
      .filter((item) => item.slot === 'utility' && item.id !== 'UTIL-GUN-01' && item.id !== 'UTIL-BALL-01'),
    [owned],
  );

  const ONBOARDING_SLIDES = [
    {
      title: 'BIENVENIDO A WASPI WORLD',
      body: 'Un mundo abierto donde la ropa que usás es real.\nExplorá, jugá y vestí a tu waspi.',
      icon: '👋',
    },
    {
      title: 'TENKS',
      body: 'Ganás TENKS jugando minijuegos y en combate.\nUsalos para comprar ropa y parcelas.',
      icon: '🪙',
    },
    {
      title: 'EMPEZÁ POR COTTENKS',
      body: 'Hablá con COTTENKS en la plaza.\nTe explica todo lo que necesitás saber.',
      icon: '🗣️',
    },
  ];

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
        @keyframes wwComboIn {
          from { opacity: 0; transform: translate3d(-50%, 0, 0) scale(0.7); }
          to   { opacity: 1; transform: translate3d(-50%, 0, 0) scale(1); }
        }
        @keyframes wwComboPulse {
          0%, 100% { box-shadow: 0 0 6px rgba(245,200,66,0.3); }
          50%       { box-shadow: 0 0 18px rgba(245,200,66,0.75); }
        }
        .ww-combo-badge {
          animation: wwComboIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both,
                     wwComboPulse 1.6s ease-in-out 280ms infinite;
        }
        /* ── Right toolbar ── */
        .ww-toolbar {
          display: flex;
          flex-direction: column;
          gap: 3px;
          background: rgba(0,0,0,0.72);
          border: 1px solid rgba(245,200,66,0.14);
          padding: 5px;
          backdrop-filter: blur(8px);
          animation: wwFadeUp 540ms cubic-bezier(0.22,1,0.36,1) both;
        }
        .ww-toolbar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 28px;
          cursor: pointer;
          border: 1px solid transparent;
          background: transparent;
          font-size: 13px;
          line-height: 1;
          color: rgba(255,255,255,0.45);
        }
        .ww-toolbar-btn img {
          width: 22px;
          height: 22px;
          object-fit: contain;
          display: block;
          pointer-events: none;
          opacity: 0.9;
        }
        .ww-toolbar-btn:hover:not(:disabled) img {
          opacity: 1;
        }
        .ww-toolbar-btn svg.ww-toolbar-icon {
          width: 22px;
          height: 22px;
          display: block;
          pointer-events: none;
          flex-shrink: 0;
          opacity: 0.92;
          filter: drop-shadow(0 0 4px rgba(245, 200, 66, 0.35));
        }
        .ww-toolbar-btn:hover:not(:disabled) svg.ww-toolbar-icon {
          opacity: 1;
          filter: drop-shadow(0 0 6px rgba(245, 200, 66, 0.5));
        }
        .ww-toolbar-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.07) !important;
          border-color: rgba(255,255,255,0.14) !important;
          color: rgba(255,255,255,0.9) !important;
          transform: translateY(0) !important;
        }
        .ww-toolbar-divider {
          height: 1px;
          background: rgba(255,255,255,0.07);
          margin: 1px 0;
        }
        /* ── Stripe redirect spinner ── */
        @keyframes wwSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes wwStripeSlide {
          from { opacity: 0; transform: translate3d(-50%, -16px, 0); }
          to   { opacity: 1; transform: translate3d(-50%, 0, 0); }
        }
        .ww-stripe-spinner {
          width: 28px;
          height: 28px;
          border: 2px solid rgba(245,200,66,0.18);
          border-top-color: #F5C842;
          border-radius: 50%;
          animation: wwSpin 0.7s linear infinite;
        }
        /* ── Shop status banner ── */
        @keyframes wwStatusIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ww-shop-status {
          animation: wwStatusIn 220ms ease-out both;
        }
        /* ── TENKS pack cards ── */
        .ww-pack-card {
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }
        .ww-pack-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 28px rgba(0,0,0,0.32);
        }
        .ww-pack-card:hover .ww-pack-popular {
          border-color: rgba(245,200,66,0.9);
        }
        /* ── Tab bar ── */
        .ww-tab-bar {
          display: flex;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          margin-bottom: 14px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .ww-tab-bar::-webkit-scrollbar { display: none; }
        /* ── Controls hint ── */
        .ww-ctrl-wrap {
          position: relative;
          display: inline-block;
        }
        .ww-ctrl-toggle {
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: default;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(0,0,0,0.55);
          color: rgba(255,255,255,0.28);
          font-family: "Press Start 2P", monospace;
          font-size: 7px;
          backdrop-filter: blur(6px);
        }
        .ww-ctrl-panel {
          display: none;
          position: absolute;
          top: 0;
          right: 30px;
          white-space: nowrap;
          background: rgba(0,0,0,0.82);
          border: 1px solid rgba(255,255,255,0.09);
          padding: 6px 8px;
          font-family: "Press Start 2P", monospace;
          color: rgba(255,255,255,0.32);
          font-size: 7px;
          line-height: 1.9;
          backdrop-filter: blur(8px);
        }
        .ww-ctrl-wrap:hover .ww-ctrl-panel {
          display: block;
        }
      `}</style>
      {isMobile && isPortrait && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#0E0E14',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
            padding: 32,
          }}
        >
          <div style={{ fontSize: 56 }}>↻</div>
          <div style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '9px',
            color: '#F5C842',
            textAlign: 'center',
            lineHeight: 2,
          }}>
            GIRA TU CELULAR<br />
            <span style={{ color: '#46B3FF', fontSize: '7px' }}>el juego funciona en landscape</span>
          </div>
        </div>
      )}
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

        <GameHUD />

        {activeScene === 'CreatorScene' && (
          <CharacterCreatorOverlay isMobile={isMobile} />
        )}

        {comboMultiplier !== null && (
          <div
            className="ww-combo-badge pointer-events-none"
            style={{
              position: 'absolute',
              bottom: 48,
              left: '50%',
              transform: 'translate3d(-50%, 0, 0)',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '10px',
              color: '#F5C842',
              background: 'rgba(14,14,20,0.88)',
              border: '1px solid rgba(245,200,66,0.55)',
              padding: '5px 12px',
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
            }}
          >
            COMBO x{comboMultiplier}
          </div>
        )}

        <div className="absolute top-12 left-2 flex flex-col gap-2">
          {hudSettings.showSocialPanel && (
            <div
              className="ww-panel ww-panel-delayed"
              style={{
                width: 182,
                background: 'rgba(0,0,0,0.7)',
                border: '1px solid rgba(57,255,20,0.14)',
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
                      {player.playerId === playerInfo?.playerId ? '→ ' : '· '}{player.username}
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
                  LVL {progression.level}/{getMaxProgressionLevel()} {nextLevelDelta > 0 ? `| NEXT ${nextLevelDelta} XP` : '| MAX'}
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: 4, fontFamily: '"Silkscreen", monospace', fontSize: '12px', color: 'rgba(255,255,255,0.82)' }}>
                    <div className="flex items-center justify-between">
                      <span>LVL {progression.level}/{getMaxProgressionLevel()}</span>
                      <span>{progression.nextLevelAt === null ? 'MAX' : `${nextLevelDelta} XP`}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>XP {progression.xp}</span>
                      <span>KOs {progression.kills}</span>
                    </div>
                  </div>
                  <div style={{ position: 'relative', marginTop: 6, height: 8, border: '1px solid rgba(70,179,255,0.28)', background: 'rgba(255,255,255,0.05)' }}>
                    <div
                      style={{
                        width: `${progressPct * 100}%`,
                        height: '100%',
                        background: '#46B3FF',
                        transition: 'width 0.6s ease-out',
                      }}
                    />
                    {/* Pixel segment dividers */}
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: 'repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), rgba(5,5,10,0.65) calc(10% - 1px), rgba(5,5,10,0.65) 10%)',
                      pointerEvents: 'none',
                    }} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {hudSettings.showControlsPanel && !isMobile && (
          <div className="ww-ctrl-wrap absolute top-2 right-2 pointer-events-auto">
            <div className="ww-ctrl-toggle">[?]</div>
            <div className="ww-ctrl-panel">
              WASD / FLECHAS MOVER<br />
              {chatVisible ? 'ENTER CHATEAR' : 'ENTER CHAT OFF'}<br />
              {CHAT_SCENES.has(activeScene) ? (chatEnabled ? 'T CHAT OFF' : 'T CHAT ON') : ''}<br />
              I INVENTARIO
            </div>
          </div>
        )}

        {/* ── Right toolbar ── */}
        <div className="ww-toolbar absolute right-2 top-12">
          {/* SHOP — primary action */}
          <button
            onClick={() => { setShopSource('hud'); setShopOpen(true); }}
            title="Tienda"
            style={{
              width: 34,
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '7px',
              padding: '7px 4px',
              background: '#F5C842',
              color: '#0E0E14',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: '0.02em',
              lineHeight: 1.4,
            }}
          >
            🛍️<br />SHOP
          </button>

          <div className="ww-toolbar-divider" />

          {/* Settings — SVG (el PNG era RGB sin alpha; el “tablero” quedaba como fondo gris) */}
          <button type="button" onClick={openSettings} className="ww-toolbar-btn" title="Ajustes" aria-label="Ajustes">
            <svg className="ww-toolbar-icon" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#F5C842"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M11.078 2.25c.63-1.121 2.193-1.121 2.824 0l.357.63c.155.274.425.458.722.519.155.031.31.064.465.097.295.063.564.255.718.525l.22.4c.609 1.109 2.047 1.109 2.656 0l.155-.282a.978.978 0 011.639-.97l.389.689c.615 1.078-.325 2.393-1.51 2.393H19.5v.883c0 .615-.299 1.191-.797 1.541l-3.647 2.484a.978.978 0 00-.354 1.343l.11.192a.98.98 0 01-.97 1.422l-3.308-.769a.98.98 0 01-.63-.363l-.219-.312a1.125 1.125 0 00-1.851.086l-.45.677A1.125 1.125 0 018.583 21h-1.167c-.603 0-1.15-.363-1.384-.92l-.45-.677a1.125 1.125 0 00-1.852-.086l-.219.313a.982.982 0 01-.63.363l-3.308.769a.98.98 0 01-.97-1.422l.11-.192a.978.978 0 00-.354-1.343L2.303 13.33A1.989 1.989 0 012 11.883V11h.5c1.185 0 2.125-1.315 1.51-2.393l.389-.689a.978.978 0 011.639-.97l.155.282c.609 1.109 2.047 1.109 2.656 0l.22-.4c.154-.27.423-.462.718-.525.155-.033.31-.066.465-.097.297-.061.567-.245.722-.519l.357-.63zM12 15a3 3 0 100-6 3 3 0 000 6z"
              />
            </svg>
          </button>

          {/* Stats */}
          <button onClick={() => void openStats()} className="ww-toolbar-btn" title="Estadísticas">📊</button>

          {/* Leaderboard */}
          <button onClick={() => setLeaderboardOpen(true)} className="ww-toolbar-btn" title="Leaderboard">🏆</button>

          <div className="ww-toolbar-divider" />

          {/* Rescue — dormant strip, activates on arm */}
          <button
            onClick={handleSafeReset}
            title={rescueArmed ? 'Confirmar vuelta a plaza' : 'Volver a plaza'}
            style={{
              width: 34,
              height: rescueArmed ? 28 : 8,
              cursor: 'pointer',
              border: 'none',
              background: rescueArmed ? '#FF6A6A' : 'rgba(255,106,106,0.2)',
              color: rescueArmed ? '#0E0E14' : 'transparent',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '6px',
              overflow: 'hidden',
              transition: 'height 220ms ease, background 220ms ease, color 220ms ease, box-shadow 220ms ease',
              boxShadow: rescueArmed ? '0 0 16px rgba(255,106,106,0.45)' : 'none',
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
            }}
          >
            {rescueArmed ? '✓ PLAZA' : ''}
          </button>
        </div>

        {activeScene !== 'CreatorScene' && !isAuthenticated && (
          <LoginCard
            emailInput={emailInput}
            onEmailChange={setEmailInput}
            authBusy={authBusy}
            authStatus={authStatus}
            onMagicLink={() => void sendMagicLink()}
            onGoogle={() => void signInWithGoogle()}
          />
        )}

        {checkoutRedirecting && (
          <div className="ww-overlay absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ background: 'rgba(0,0,0,0.78)', zIndex: 70 }}>
            <div className="ww-stripe-spinner" style={{ marginBottom: 18 }} />
            <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '9px', color: '#F5C842', letterSpacing: '0.06em', textAlign: 'center', lineHeight: 2 }}>
              CONECTANDO<br />CON STRIPE...
            </div>
          </div>
        )}

        {shopOpen && (
          <ShopOverlay
            isMobile={isMobile}
            shopTab={shopTab}
            onTabChange={setShopTab}
            onClose={() => {
              setShopSource('');
              setShopOpen(false);
              setOrdersLoaded(false);
              setOrders([]);
              eventBus.emit(EVENTS.SHOP_CLOSE);
            }}
            clothingItems={clothingItems}
            owned={owned}
            equipped={equipped}
            tenks={tenks}
            isAuthenticated={isAuthenticated}
            checkoutBusyId={checkoutBusyId}
            checkoutRedirecting={checkoutRedirecting}
            selectedSize={selectedSize}
            onSizeChange={setSelectedSize}
            discountCode={discountCodeInput}
            onDiscountChange={setDiscountCodeInput}
            shopStatus={shopStatus}
            orders={orders}
            ordersLoaded={ordersLoaded}
            ordersLoading={ordersLoading}
            onLoadOrders={() => void loadOrders()}
            onBuyVirtual={(item) => void buyShopItem(item)}
            onEquip={(itemId, active) => {
              handleEquipOwnedItem(itemId);
              setShopStatus(active ? 'Ya está puesto.' : 'Equipado.');
            }}
            onBuyPhysical={(item) => void startStripeCheckout('product', { itemId: item.id, size: selectedSize, discountCode: discountCodeInput })}
            onBuyPack={(packId) => void startStripeCheckout('tenks_pack', { packId })}
          />
        )}


        <PlayerActionsOverlay
          player={playerActions}
          onMute={handleMutePlayer}
          onReport={handleReportPlayer}
          onClose={() => setPlayerActions(null)}
        />

        {inventoryOpen && (
          <InventoryOverlay
            isMobile={isMobile}
            owned={owned}
            equipped={equipped}
            smoking={smoking}
            onToggleSmoke={setSmoking}
            gunOn={gunOn}
            ballOn={ballOn}
            passiveUtilityItems={passiveUtilityItems}
            clothingCatalog={CATALOG}
            onEquip={handleEquipOwnedItem}
            onClose={() => setInventoryOpen(false)}
          />
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

        {settingsOpen && (
          <SettingsOverlay
            isMobile={isMobile}
            settingsTab={settingsTab}
            onTabChange={setSettingsTab}
            onClose={closeSettings}
            audioSettings={audioSettings}
            onAudioChange={(patch) => setAudioSettings((current) => ({ ...current, ...patch }))}
            outputDevices={outputDevices}
            selectedOutputDeviceId={selectedOutputDeviceId}
            onOutputDeviceChange={setSelectedOutputDeviceId}
            hudSettings={hudSettings}
            onHudChange={(patch) => setHudSettings((current) => ({ ...current, ...patch }))}
            controlSettings={controlSettings}
            onControlChange={(patch) => setControlSettings((current) => ({ ...current, ...patch }))}
            bindingCaptureDirection={bindingCaptureDirection}
            onCaptureDirection={setBindingCaptureDirection}
            bindingCaptureAction={bindingCaptureAction}
            onCaptureAction={setBindingCaptureAction}
            micDevices={micDevices}
            selectedMicDeviceId={selectedMicDeviceId}
            onMicDeviceChange={setSelectedMicDeviceId}
          />
        )}

        {statsOpen && (
          <StatsOverlay
            isMobile={isMobile}
            statsLoading={statsLoading}
            statsData={statsData}
            isAuthenticated={isAuthenticated}
            onClose={closeStats}
          />
        )}

        <VirtualJoystick visible={joystickVisible} />

        {/* Leaderboard overlay */}
        {leaderboardOpen && (
          <LeaderboardOverlay
            isMobile={isMobile}
            currentPlayerId={undefined}
            onClose={() => setLeaderboardOpen(false)}
          />
        )}

        {/* Quest Tracker — always mounted when in-game, self-manages visibility */}
        {activeScene !== 'CreatorScene' && (
          <QuestTracker isAuthenticated={isAuthenticated} isMobile={isMobile} />
        )}

        {showOnboarding && (
          <div
            className="ww-overlay absolute inset-0 flex flex-col items-center justify-center"
            style={{
              background: 'rgba(14,14,20,0.92)',
              zIndex: 9999,
              fontFamily: '"Press Start 2P", monospace',
            }}
          >
            <div style={{ textAlign: 'center', padding: '0 24px', maxWidth: 480 }}>
              <div style={{ fontSize: 48, marginBottom: 24 }}>
                {ONBOARDING_SLIDES[onboardingSlide].icon}
              </div>
              <div style={{ color: '#F5C842', fontSize: 10, marginBottom: 20, lineHeight: '20px' }}>
                {ONBOARDING_SLIDES[onboardingSlide].title}
              </div>
              <div style={{ color: '#ffffff', fontSize: 7, lineHeight: '16px', whiteSpace: 'pre-line' }}>
                {ONBOARDING_SLIDES[onboardingSlide].body}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, margin: '32px 0 24px' }}>
              {ONBOARDING_SLIDES.map((_, i) => (
                <div key={i} style={{
                  width: 8, height: 8,
                  borderRadius: '50%',
                  background: i === onboardingSlide ? '#F5C842' : '#444',
                }} />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              {onboardingSlide < ONBOARDING_SLIDES.length - 1 ? (
                <button
                  onClick={() => setOnboardingSlide(s => s + 1)}
                  style={{
                    background: '#F5C842', color: '#0E0E14',
                    border: 'none', padding: '10px 24px',
                    fontFamily: '"Press Start 2P", monospace', fontSize: 8,
                    cursor: 'pointer',
                  }}
                >
                  SIGUIENTE →
                </button>
              ) : (
                <button
                  onClick={() => {
                    localStorage.setItem('waspi_onboarding_v1', 'done');
                    setShowOnboarding(false);
                  }}
                  style={{
                    background: '#F5C842', color: '#0E0E14',
                    border: 'none', padding: '10px 24px',
                    fontFamily: '"Press Start 2P", monospace', fontSize: 8,
                    cursor: 'pointer',
                  }}
                >
                  ¡ENTRAR AL MUNDO!
                </button>
              )}
              <button
                onClick={() => {
                  localStorage.setItem('waspi_onboarding_v1', 'done');
                  setShowOnboarding(false);
                }}
                style={{
                  background: 'transparent', color: '#666',
                  border: '1px solid #333', padding: '10px 16px',
                  fontFamily: '"Press Start 2P", monospace', fontSize: 7,
                  cursor: 'pointer',
                }}
              >
                SKIP
              </button>
            </div>
          </div>
        )}

        {showMobileHint && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(14,14,20,0.88)',
              border: '1px solid #46B3FF44',
              color: '#46B3FF',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 6,
              padding: '8px 16px',
              textAlign: 'center',
              zIndex: 8000,
              pointerEvents: 'none',
              lineHeight: '14px',
              whiteSpace: 'nowrap',
            }}
          >
            JOYSTICK = MOVER · A = INTERACTUAR
          </div>
        )}

        {jukeboxOpen && (
          <JukeboxOverlay
            onClose={() => { setJukeboxOpen(false); eventBus.emit(EVENTS.JUKEBOX_CLOSE); }}
            isMobile={isMobile}
          />
        )}

        <UINotice notice={uiNotice} isMobile={isMobile} />
      </div>
    </div>
    </>
  );
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

function optionButtonStyle(active: boolean) {
  return {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '8px',
    padding: '10px 8px',
    border: active ? '1px solid rgba(245,200,66,0.45)' : '1px solid rgba(255,255,255,0.12)',
    background: active ? 'rgba(245,200,66,0.18)' : 'rgba(255,255,255,0.05)',
    color: active ? '#F5C842' : '#FFFFFF',
    cursor: 'pointer',
    textAlign: 'center',
  } as const;
}

function movementSchemeLabel(scheme: MovementScheme) {
  switch (scheme) {
    case 'wasd':
      return 'Solo WASD';
    case 'arrows':
      return 'Solo flechas';
    case 'ijkl':
      return 'IJKL';
    case 'custom':
      return 'Custom';
    case 'both':
    default:
      return 'WASD + flechas';
  }
}

function directionLabel(direction: MovementDirection) {
  switch (direction) {
    case 'up':
      return 'ARRIBA';
    case 'left':
      return 'IZQ';
    case 'down':
      return 'ABAJO';
    case 'right':
      return 'DER';
    default:
      return 'DIR';
  }
}

function actionLabel(action: ActionBinding) {
  switch (action) {
    case 'interact':
      return 'INTERACT';
    case 'shoot':
      return 'DISPARAR';
    case 'inventory':
      return 'INVENTARIO';
    case 'chat':
      return 'CHAT';
    case 'back':
      return 'VOLVER';
    default:
      return 'ACCION';
  }
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
    fontSize: '7px',
    padding: '9px 10px',
    background: active ? 'rgba(245,200,66,0.1)' : 'transparent',
    color: active ? '#F5C842' : 'rgba(255,255,255,0.38)',
    border: 'none',
    borderBottom: active ? '2px solid #F5C842' : '2px solid transparent',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
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
    return { open: false, tab: 'tenks_virtual', status: '' };
  }
  const status = new URLSearchParams(window.location.search).get('checkout');
  if (status === 'success') {
    return {
      open: true,
      tab: 'tenks_packs',
      status: '¡TENKS acreditados! Ya están disponibles en tu cuenta.',
    };
  }
  if (status === 'product_success') {
    return {
      open: true,
      tab: 'physical',
      status: '¡Compra exitosa! Tu prenda llegará en 3-5 días hábiles. Te enviamos un email de confirmación.',
    };
  }
  if (status === 'cancelled') {
    return {
      open: true,
      tab: 'tenks_virtual',
      status: '',
    };
  }
  return { open: false, tab: 'tenks_virtual', status: '' };
}

function getInitialSelectedMicDeviceId(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(VOICE_MIC_DEVICE_KEY) ?? '';
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

