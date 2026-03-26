import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Session } from '@supabase/supabase-js';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { CHAT_SCENES } from '@/app/play/lib/playPageConstants';
import { getItem as getCatalogItem } from '@/src/game/config/catalog';
import { equipItem, getInventory, replaceInventory } from '@/src/game/systems/InventorySystem';
import { loadProgressionFromServer, loadProgressionState } from '@/src/game/systems/ProgressionSystem';
import { initTenks } from '@/src/game/systems/TenksSystem';
import { initStatsSystem } from '@/src/game/systems/StatsSystem';
import { normalizePlayerState, type PlayerState } from '@/src/lib/playerState';
import { supabase } from '@/src/lib/supabase';
import type { SharedParcelState } from '@/src/lib/vecindad';
import { loadStoredAvatarConfig, saveStoredAvatarConfig } from '@/app/play/lib/playPageStorage';
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
  const GUN_UTIL_IDS = ['UTIL-GUN-01', 'UTIL-GUN-SHOT-01', 'UTIL-GUN-SMG-01', 'UTIL-GUN-GOLD-01', 'UTIL-GUN-DEAGLE-01', 'UTIL-GUN-CANNON-01', 'UTIL-GUN-RIFL-01'];
  const [gunOn, setGunOn] = useState((initialInventory.equipped.utility ?? []).some(id => GUN_UTIL_IDS.includes(id)));
  const [ballOn, setBallOn] = useState((initialInventory.equipped.utility ?? []).includes('UTIL-BALL-01'));
  const [activeWeapon, setActiveWeapon] = useState<string>('pistol');
  const playerStateRef = useRef<PlayerState | null>(null);
  const suppressSyncRef = useRef(false);
  const authHydratingRef = useRef(false);

  const buildEditablePlayerPatch = useCallback((base: PlayerState): Partial<PlayerState> => ({
    avatar: loadStoredAvatarConfig(),
    mutedPlayers: base.mutedPlayers ?? mutedPlayersRef.current,
    inventory: {
      owned: base.inventory.owned,
      equipped: getInventory().equipped,
    },
  }), [mutedPlayersRef]);

  const applyPlayerState = useCallback((player: PlayerState) => {
    suppressSyncRef.current = true;
    playerStateRef.current = player;
    saveStoredAvatarConfig({
      ...loadStoredAvatarConfig(),
      ...player.avatar,
    });
    replaceInventory(player.inventory);
    initTenks(player.tenks);
    mutedPlayersRef.current = player.mutedPlayers ?? [];
    setPlayerState(player);
    setOwned(player.inventory.owned);
    setEquipped(player.inventory.equipped);
    setGunOn((player.inventory.equipped.utility ?? []).some(id => GUN_UTIL_IDS.includes(id)));
    setBallOn((player.inventory.equipped.utility ?? []).includes('UTIL-BALL-01'));
    setTenks(player.tenks);
    eventBus.emit(EVENTS.PARCEL_STATE_CHANGED, player.vecindad);
    queueMicrotask(() => {
      suppressSyncRef.current = false;
    });
  }, [mutedPlayersRef]);

  const syncPlayerState = useCallback(async (overridePlayerState?: PlayerState) => {
    if (suppressSyncRef.current && !overridePlayerState) return;
    if (authHydratingRef.current && !overridePlayerState) return;
    const token = tokenRef.current;
    if (!token) return;
    if (!overridePlayerState && !playerStateRef.current) return;

    const base = overridePlayerState ?? playerStateRef.current;
    if (!base) return;

    await fetch('/api/player', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        player: buildEditablePlayerPatch(base),
      }),
    }).catch(() => undefined);
  }, [buildEditablePlayerPatch, tokenRef]);

  const persistEditablePlayerPatch = useCallback(async (patch: Partial<PlayerState>) => {
    const token = tokenRef.current;
    if (!token) return null;

    const res = await fetch('/api/player', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        player: patch,
      }),
    }).catch(() => null);

    if (!res?.ok) {
      return null;
    }

    const json = await res.json().catch(() => null) as { player?: PlayerState } | null;
    if (!json?.player) return null;

    const nextPlayer = normalizePlayerState(json.player);
    applyPlayerState(nextPlayer);
    return nextPlayer;
  }, [applyPlayerState, tokenRef]);

  const persistInventoryState = useCallback((inventory = getInventory()) => {
    setOwned(inventory.owned);
    setEquipped(inventory.equipped);
    setGunOn((inventory.equipped.utility ?? []).some(id => GUN_UTIL_IDS.includes(id)));
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
    setPlayerState(nextPlayer);
    void syncPlayerState(nextPlayer);
  }, [syncPlayerState]);

  const handleEquipOwnedItem = useCallback(async (itemId: string) => {
    const token = tokenRef.current;
    if (token) {
      const res = await fetch('/api/player/inventory/equip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ item_id: itemId }),
      }).catch(() => null);

      if (res?.ok) {
        const json = await res.json().catch(() => null) as { player?: PlayerState } | null;
        if (json?.player) {
          applyPlayerState(normalizePlayerState(json.player));
          return true;
        }
      }

      return false;
    }

    equipItem(itemId);
    persistInventoryState(getInventory());
    return true;
  }, [applyPlayerState, persistInventoryState, tokenRef]);

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
      authHydratingRef.current = false;
      await loadVecindadSharedState(null);
      return;
    }

    tokenRef.current = session.access_token;
    authHydratingRef.current = true;
    playerStateRef.current = null;

    try {
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
      await loadVecindadSharedState(session);

      if (remotePlayer) {
        applyPlayerState(normalizePlayerState(remotePlayer));
      }

      const serverProgression = await loadProgressionFromServer();
      if (serverProgression) {
        const progression = loadProgressionState();
        eventBus.emit(EVENTS.PLAYER_PROGRESSION, progression);
        eventBus.emit(EVENTS.PLAYER_COMBAT_STATS, {
          kills: progression.kills,
          deaths: serverProgression.deaths,
        });
      }

      const serverUsername = session.user.user_metadata?.username;
      if (typeof serverUsername === 'string' && serverUsername.trim() && typeof window !== 'undefined') {
        const storedUsername = window.localStorage.getItem('waspi_username');
        if (storedUsername !== serverUsername.trim()) {
          window.localStorage.setItem('waspi_username', serverUsername.trim());
        }
      }
    } finally {
      authHydratingRef.current = false;
    }
  }, [applyPlayerState, loadVecindadSharedState, tokenRef]);

  const refreshPlayerState = useCallback(async () => {
    let token = tokenRef.current;
    if (!token && supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
      if (data.session) {
        tokenRef.current = data.session.access_token;
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

    if (player) {
      applyPlayerState(normalizePlayerState(player));
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
    const unsubPlayerStateApply = eventBus.on(EVENTS.PLAYER_STATE_APPLY, (payload: unknown) => {
      applyPlayerState(normalizePlayerState(payload));
    });
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
      unsubPlayerStateApply();
      unsubTenks();
      unsubInventory();
      unsubAvatar();
    };
  }, [applyPlayerState, syncPlayerState]);

  useEffect(() => {
    if (!CHAT_SCENES.has(activeScene)) return;
    void syncPlayerState();
  }, [activeScene, syncPlayerState]);

  return {
    activeWeapon,
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
    setActiveWeapon,
    setBallOn,
    setEquipped,
    setGunOn,
    setOwned,
    setPlayerState,
    setTenks,
    persistEditablePlayerPatch,
    syncPlayerState,
    tenks,
  };
}
