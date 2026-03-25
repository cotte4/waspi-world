import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const REMEMBER_ME_KEY = 'waspi_auth_remember_me';
const STORAGE_KEY = 'waspi-auth-token';

export const isConfigured = !!(url && key);

function canUseBrowserStorage() {
  return typeof window !== 'undefined';
}

function getPreferredStorage(rememberMe: boolean) {
  if (!canUseBrowserStorage()) return null;
  return rememberMe ? window.localStorage : window.sessionStorage;
}

function getFallbackStorage(rememberMe: boolean) {
  if (!canUseBrowserStorage()) return null;
  return rememberMe ? window.sessionStorage : window.localStorage;
}

export function getSupabaseRememberPreference() {
  if (!canUseBrowserStorage()) return true;
  return window.localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
}

export function setSupabaseRememberPreference(rememberMe: boolean) {
  if (!canUseBrowserStorage()) return;

  const primary = getPreferredStorage(rememberMe);
  const fallback = getFallbackStorage(rememberMe);
  const existingToken = primary?.getItem(STORAGE_KEY) ?? fallback?.getItem(STORAGE_KEY) ?? null;

  window.localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false');
  if (existingToken && primary) {
    primary.setItem(STORAGE_KEY, existingToken);
  }
  fallback?.removeItem(STORAGE_KEY);
}

const browserStorageAdapter = {
  getItem(storageKey: string) {
    const rememberMe = getSupabaseRememberPreference();
    const primary = getPreferredStorage(rememberMe);
    const fallback = getFallbackStorage(rememberMe);
    return primary?.getItem(storageKey) ?? fallback?.getItem(storageKey) ?? null;
  },
  setItem(storageKey: string, value: string) {
    const rememberMe = getSupabaseRememberPreference();
    const primary = getPreferredStorage(rememberMe);
    const fallback = getFallbackStorage(rememberMe);
    primary?.setItem(storageKey, value);
    fallback?.removeItem(storageKey);
  },
  removeItem(storageKey: string) {
    if (!canUseBrowserStorage()) return;
    window.localStorage.removeItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
  },
};

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, key, {
      auth: {
        storageKey: STORAGE_KEY,
        storage: browserStorageAdapter,
      },
    })
  : null;
