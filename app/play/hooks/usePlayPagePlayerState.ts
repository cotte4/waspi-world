import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Session } from '@supabase/supabase-js';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { CHAT_SCENES } from '@/app/play/lib/playPageConstants';
import { getItem as getCatalogItem } from '@/src/game/config/catalog';
import { equipItem, getInventory, replaceInventory } from '@/src/game/systems/InventorySystem';
import { getTenksBalance, initTenks, initTenksFromServer } from '@/src/game/systems/TenksSystem';
import { initStatsSystem } from '@/src/game/systems/StatsSystem';
import { grantInventoryItem, normalizePlayerState, type PlayerState } from '@/src/lib/playerState';
import { supabase } from '@/src/lib/supabase';
import { reconcileInventoryFromDB } from '@/src/lib/commercePersistence';
import type { SharedParcelState } from '@/src/lib/vecindad';
import { loadStoredAvatarConfig, loadStoredPlayerState, mergeHydratedPlayerState, saveStoredAvatarConfig, saveStoredPlayerState } from '@/app/play/lib/playPageStorage';
import type { VecindadSharedPayload } from '@/app/play/types';

type UsePlayPagePlayerStateOptions = {
  tokenRef: MutableRefObject<string | null>;
  mutedPlayersRef: MutableRefObject<string[]>;
  activeScene: string;
};

export function usePlayPagePlayerState({
  tokenRef,
  mutedPlayersRef,
  activeScene,
}: UsePlayPagePlayerStateOptions) {
  const initialInventory = useMemo(() => getInventory(), []);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [tenks, setTenks] = useState<number | null>(null);
  const [owned, setOwned] = useState<string[]>(initialInventory.owned);
  const [equipped, setEquipped] = useState<{ top?: string; bottom?: string }>(initialInventory.equipped);
  const [gunOn, setGunOn] = useState((initialInventory.equipped.utility ?? []).includes('UTIL-GUN-01'));
  const [ballOn, setBallOn] = useState((initialInventory.equipped.utility ?? []).includes('UTIL-BALL-01'));
  const playerStateRef = useRef<PlayerState | null>(null);
  const suppressSyncRef = useRef(false);

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
  }, [mutedPlayersRef]);

  const syncPlayerState = useCallback(async (overridePlayerState?: PlayerState) => {
    if (suppressSyncRef.current && !overridePlayerState) return;
    const token = tokenRef.current;
    if (!token) return;

    const base = overridePlayerState ?? playerStateRef.current;
    const nextPlayer: PlayerState = normalizePlayerState({
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
    });

    await fetch('/api/player', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        player: nextPlayer,
      }),
    }).catch(() => undefined);
  }, [mutedPlayersRef, tokenRef]);

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

    if (!res?.ok) return;
    const json = await res.json().catch(() => null) as { parcels?: SharedParcelState[] } | null;
    if (json?.parcels) {
      eventBus.emit(EVENTS.VECINDAD_SHARED_STATE_CHANGED, {
        parcels: json.parcels,
        broadcast: false,
      } satisfies VecindadSharedPayload);
    }
  }, [tokenRef]);

  const hydratePlayerState = useCallback(async (session: Session | null) => {
    if (!session?.access_token) {
      tokenRef.current = null;
      await loadVecindadSharedState(null);
      return;
    }

    tokenRef.current = session.access_token;
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

    void initTenksFromServer(session.user.id, session.access_token);

    const serverUsername = session.user.user_metadata?.username;
    if (typeof serverUsername === 'string' && serverUsername.trim() && typeof window !== 'undefined') {
      const storedUsername = window.localStorage.getItem('waspi_username');
      if (storedUsername !== serverUsername.trim()) {
        window.localStorage.setItem('waspi_username', serverUsername.trim());
      }
    }
  }, [applyPlayerState, loadVecindadSharedState, syncPlayerState, tokenRef]);

  const refreshPlayerState = useCallback(async () => {
    let token = tokenRef.current;
    let playerId: string | null = null;
    if (!token && supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
      if (data.session) {
        tokenRef.current = data.session.access_token;
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

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of ['checkout', 'code', 'error', 'error_description']) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) window.history.replaceState({}, '', url.toString());
    }

    await loadVecindadSharedState();
  }, [applyPlayerState, loadVecindadSharedState, tokenRef]);

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

  return {
    applyPlayerState,
    ballOn,
    equipped,
    gunOn,
    handleEquipOwnedItem,
    hydratePlayerState,
    loadVecindadSharedState,
    owned,
    persistInventoryState,
    playerState,
    refreshPlayerState,
    setBallOn,
    setEquipped,
    setGunOn,
    setOwned,
    setPlayerState,
    setTenks,
    syncPlayerState,
    tenks,
  };
}
