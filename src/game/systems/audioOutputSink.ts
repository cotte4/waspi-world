/**
 * Preferencia de dispositivo de salida (Chrome/Edge: AudioContext.setSinkId).
 * La jukebox del café usa iframe de YouTube → sigue la salida por defecto del navegador/OS.
 */

const STORAGE_KEY = 'waspi_audio_output_device_id';

type AudioContextWithSink = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

export function getStoredAudioOutputDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setStoredAudioOutputDeviceId(deviceId: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (deviceId) {
      window.localStorage.setItem(STORAGE_KEY, deviceId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // noop
  }
}

export function supportsAudioOutputDevicePicker(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    const proto = Ctx.prototype as AudioContextWithSink;
    return typeof proto.setSinkId === 'function';
  } catch {
    return false;
  }
}

export async function applySinkIdToAudioContext(ctx: AudioContext, sinkId: string): Promise<void> {
  const c = ctx as AudioContextWithSink;
  if (typeof c.setSinkId !== 'function') return;
  try {
    await c.setSinkId(sinkId);
  } catch (e) {
    console.warn('[AudioOutput] setSinkId failed:', e);
  }
}
