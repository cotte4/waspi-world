import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { hasUtilityEquipped } from '@/src/game/systems/InventorySystem';
import { getTenksBalance } from '@/src/game/systems/TenksSystem';
import type { ProgressionState } from '@/src/game/systems/ProgressionSystem';
import { normalizePlayerState, type PlayerState } from '@/src/lib/playerState';
import { track } from '@/src/lib/analytics';
import type {
  ChatMsg,
  CombatStats,
  FarmActionRequestPayload,
  ParcelBuyPayload,
  PenaltyResultPayload,
  PlayerActionsPayload,
  PlayerInfo,
  PresencePlayer,
  ShopOpenPayload,
  VecindadSharedPayload,
  VecindadUpdatePayload,
} from '../types';

type UiNotice = { msg: string; color?: string } | null;

type SceneEventStateSetters = {
  setMessages: Dispatch<SetStateAction<ChatMsg[]>>;
  setPlayerInfo: Dispatch<SetStateAction<PlayerInfo | null>>;
  setPresencePlayers: Dispatch<SetStateAction<PresencePlayer[]>>;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setCombatStats: Dispatch<SetStateAction<CombatStats>>;
  setProgression: Dispatch<SetStateAction<ProgressionState>>;
  setTenks: Dispatch<SetStateAction<number | null>>;
  setTenksAnimating: Dispatch<SetStateAction<boolean>>;
  setActiveScene: Dispatch<SetStateAction<string>>;
  setShopOpen: Dispatch<SetStateAction<boolean>>;
  setShopSource: Dispatch<SetStateAction<string>>;
  setCheckoutRedirecting: Dispatch<SetStateAction<boolean>>;
  setJukeboxOpen: Dispatch<SetStateAction<boolean>>;
  setShowOnboarding: Dispatch<SetStateAction<boolean>>;
  setInventoryOpen: Dispatch<SetStateAction<boolean>>;
  setOwned: Dispatch<SetStateAction<string[]>>;
  setEquipped: Dispatch<SetStateAction<{ top?: string; bottom?: string }>>;
  setGunOn: Dispatch<SetStateAction<boolean>>;
  setBallOn: Dispatch<SetStateAction<boolean>>;
  setPlayerActions: Dispatch<SetStateAction<PlayerActionsPayload | null>>;
  setUiNotice: Dispatch<SetStateAction<UiNotice>>;
  setShopStatus: Dispatch<SetStateAction<string>>;
  setZombiesHudActive: Dispatch<SetStateAction<boolean>>;
  setBasketHudActive: Dispatch<SetStateAction<boolean>>;
  setPenaltyHudActive: Dispatch<SetStateAction<boolean>>;
  setDartsHudActive: Dispatch<SetStateAction<boolean>>;
  setBosqueHudActive: Dispatch<SetStateAction<boolean>>;
  setFlappyHudActive: Dispatch<SetStateAction<boolean>>;
  setDinoHudActive: Dispatch<SetStateAction<boolean>>;
  setPvpHudActive: Dispatch<SetStateAction<boolean>>;
};

type UsePlayPageSceneEventsOptions = SceneEventStateSetters & {
  mutedPlayersRef: MutableRefObject<string[]>;
  previousPhaserSceneRef: MutableRefObject<string>;
  tokenRef: MutableRefObject<string | null>;
  playerState: PlayerState | null;
  applyPlayerState: (player: PlayerState) => void;
  playUiSfx: (freq: number, duration: number, sweep?: number) => void;
  syncPlayerState: (overridePlayerState?: PlayerState) => Promise<void>;
};

export function usePlayPageSceneEvents({
  mutedPlayersRef,
  previousPhaserSceneRef,
  tokenRef,
  playerState,
  applyPlayerState,
  playUiSfx,
  syncPlayerState,
  setMessages,
  setPlayerInfo,
  setPresencePlayers,
  setConnected,
  setCombatStats,
  setProgression,
  setTenks,
  setTenksAnimating,
  setActiveScene,
  setShopOpen,
  setShopSource,
  setCheckoutRedirecting,
  setJukeboxOpen,
  setShowOnboarding,
  setInventoryOpen,
  setOwned,
  setEquipped,
  setGunOn,
  setBallOn,
  setPlayerActions,
  setUiNotice,
  setShopStatus,
  setZombiesHudActive,
  setBasketHudActive,
  setPenaltyHudActive,
  setDartsHudActive,
  setBosqueHudActive,
  setFlappyHudActive,
  setDinoHudActive,
  setPvpHudActive,
}: UsePlayPageSceneEventsOptions) {
  useEffect(() => {
    const unsubChat = eventBus.on(EVENTS.CHAT_RECEIVED, (msg: unknown) => {
      const m = msg as Omit<ChatMsg, 'id'>;
      if (!m.isMe && mutedPlayersRef.current.includes(m.playerId)) return;
      setMessages((prev) => [...prev.slice(-19), { ...m, id: `${Date.now()}-${Math.random()}` }]);
    });

    const unsubInfo = eventBus.on(EVENTS.PLAYER_INFO, (info: unknown) => {
      const next = info as PlayerInfo;
      setPlayerInfo(next);
      setPresencePlayers((prev) => {
        const filtered = prev.filter((player) => player.playerId !== next.playerId);
        return [{ playerId: next.playerId, username: next.username }, ...filtered];
      });
      setConnected(true);
      try {
        localStorage.setItem('waspi_player_info', JSON.stringify({ playerId: next.playerId, username: next.username }));
      } catch {
        // noop
      }
    });

    const unsubPresence = eventBus.on(EVENTS.PLAYER_PRESENCE, (payload: unknown) => {
      const players = Array.isArray(payload) ? (payload as PresencePlayer[]) : [];
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
        if (nextLevel > prev.level) playUiSfx(392, 0.4, 784);
        return {
          kills: typeof next?.kills === 'number' ? next.kills : 0,
          xp: typeof next?.xp === 'number' ? next.xp : 0,
          level: nextLevel,
          nextLevelAt:
            typeof next?.nextLevelAt === 'number' || next?.nextLevelAt === null ? next.nextLevelAt : null,
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
          else if (p.delta < 0) playUiSfx(330, 0.1, 220);
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
        setShopOpen(false);
        setShopSource('');
        setCheckoutRedirecting(false);
        setJukeboxOpen(false);
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

    const unsubJukeboxOpen = eventBus.on(EVENTS.JUKEBOX_OPEN, () => setJukeboxOpen(true));
    const unsubJukeboxClose = eventBus.on(EVENTS.JUKEBOX_CLOSE, () => setJukeboxOpen(false));

    const unsubPlayerActions = eventBus.on(EVENTS.PLAYER_ACTIONS_OPEN, (payload: unknown) => {
      setPlayerActions(payload as PlayerActionsPayload | null);
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
          body: JSON.stringify({ goals: result.goals, shots: result.shots }),
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
          body: JSON.stringify({ action: 'buy', parcelId: next.parcelId }),
        }).catch(() => null);

        const json = (await res?.json().catch(() => null)) as {
          error?: string;
          notice?: string;
          player?: PlayerState;
          parcels?: VecindadSharedPayload['parcels'];
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

        const json = (await res?.json().catch(() => null)) as {
          error?: string;
          notice?: string;
          player?: PlayerState;
          parcels?: VecindadSharedPayload['parcels'];
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

        const json = (await res?.json().catch(() => null)) as {
          error?: string;
          notice?: string;
          player?: PlayerState;
          parcels?: VecindadSharedPayload['parcels'];
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

    const unsubZombiesActive = eventBus.on(EVENTS.ZOMBIES_SCENE_ACTIVE, (payload: unknown) => {
      setZombiesHudActive(payload as boolean);
    });

    const unsubBasketActive = eventBus.on(EVENTS.BASKET_SCENE_ACTIVE, (payload: unknown) => {
      setBasketHudActive(payload as boolean);
    });

    const unsubPenaltyActive = eventBus.on(EVENTS.PENALTY_SCENE_ACTIVE, (payload: unknown) => {
      setPenaltyHudActive(payload as boolean);
    });

    const unsubDartsActive = eventBus.on(EVENTS.DARTS_SCENE_ACTIVE, (payload: unknown) => {
      setDartsHudActive(payload as boolean);
    });

    const unsubBosqueActive = eventBus.on(EVENTS.BOSQUE_SCENE_ACTIVE, (payload: unknown) => {
      setBosqueHudActive(payload as boolean);
    });

    const unsubFlappyActive = eventBus.on(EVENTS.FLAPPY_SCENE_ACTIVE, (payload: unknown) => {
      setFlappyHudActive(payload as boolean);
    });

    const unsubDinoActive = eventBus.on(EVENTS.DINO_SCENE_ACTIVE, (payload: unknown) => {
      setDinoHudActive(payload as boolean);
    });

    const unsubPvpActive = eventBus.on(EVENTS.PVP_SCENE_ACTIVE, (payload: unknown) => {
      setPvpHudActive(payload as boolean);
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
      unsubZombiesActive();
      unsubBasketActive();
      unsubPenaltyActive();
      unsubDartsActive();
      unsubBosqueActive();
      unsubFlappyActive();
      unsubDinoActive();
      unsubPvpActive();
    };
  }, [
    applyPlayerState,
    mutedPlayersRef,
    playUiSfx,
    playerState,
    previousPhaserSceneRef,
    setActiveScene,
    setBallOn,
    setBasketHudActive,
    setBosqueHudActive,
    setCheckoutRedirecting,
    setCombatStats,
    setConnected,
    setDartsHudActive,
    setDinoHudActive,
    setEquipped,
    setFlappyHudActive,
    setGunOn,
    setInventoryOpen,
    setJukeboxOpen,
    setMessages,
    setOwned,
    setPenaltyHudActive,
    setPlayerActions,
    setPlayerInfo,
    setPresencePlayers,
    setProgression,
    setPvpHudActive,
    setShopOpen,
    setShopSource,
    setShopStatus,
    setShowOnboarding,
    setTenks,
    setTenksAnimating,
    setUiNotice,
    setZombiesHudActive,
    syncPlayerState,
    tokenRef,
  ]);
}
