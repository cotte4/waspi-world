import { AVATAR_STORAGE_KEY, MAGIC_LINK_COOLDOWN_KEY, VOICE_MIC_DEVICE_KEY } from './playPageConstants';
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
