import { normalizePlayerState, type PlayerState } from '@/src/lib/playerState';
import { AVATAR_STORAGE_KEY, MAGIC_LINK_COOLDOWN_KEY, PLAYER_STATE_STORAGE_KEY, VOICE_MIC_DEVICE_KEY } from './playPageConstants';
import type { ShopTab } from '../types';

export function loadStoredAvatarConfig() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(AVATAR_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function saveStoredAvatarConfig(config: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(config));
}

export function saveStoredPlayerState(player: PlayerState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify(player));
}

export function loadStoredPlayerState(): PlayerState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PLAYER_STATE_STORAGE_KEY);
    return raw ? normalizePlayerState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function mergeHydratedPlayerState(
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
      materials: canRecoverPreAuthMaterials
        ? localPlayer.vecindad.materials
        : remotePlayer.vecindad.materials,
    },
  });
}

export function loadStoredMutedPlayers() {
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

export function getInitialMagicLinkCooldownUntil() {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(MAGIC_LINK_COOLDOWN_KEY);
  const cooldownUntil = raw ? Number(raw) : 0;
  if (!Number.isFinite(cooldownUntil) || cooldownUntil <= Date.now()) {
    window.localStorage.removeItem(MAGIC_LINK_COOLDOWN_KEY);
    return 0;
  }
  return cooldownUntil;
}

export function getInitialCheckoutState(): { open: boolean; tab: ShopTab; status: string } {
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

export function getInitialSelectedMicDeviceId(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(VOICE_MIC_DEVICE_KEY) ?? '';
}
