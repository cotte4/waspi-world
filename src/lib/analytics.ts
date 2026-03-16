/**
 * Minimal analytics wrapper — currently a no-op stub.
 *
 * When Plausible (or PostHog) is added, replace the `track` implementation
 * to forward events to the provider.  All existing call-sites will just work.
 *
 * Usage:
 *   import { track } from '@/src/lib/analytics';
 *   track('shop_open');
 *   track('minigame_complete', { game: 'basket', score: 12 });
 */

type Props = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Props }) => void;
  }
}

export function track(event: string, props?: Props): void {
  if (typeof window === 'undefined') return;
  // Plausible custom event (fires when script is loaded)
  if (typeof window.plausible === 'function') {
    window.plausible(event, props ? { props } : undefined);
  }
  // Dev logging
  if (process.env.NODE_ENV === 'development') {
    console.debug('[analytics]', event, props ?? '');
  }
}
