/**
 * AudioManager — centraliza reproducción de música y SFX en Waspi World.
 * Cada escena puede registrar su tema musical. Los SFX sintéticos se generan
 * via Web Audio API (no requieren assets externos).
 */

import { loadAudioSettings } from './AudioSettings';

// Claves de tracks de música (los archivos pueden no existir aún — graceful fallback)
export type MusicTrack =
  | 'arcade_theme'
  | 'world_ambient'    // public/assets/audio/world-ambient.ogg (pendiente)
  | 'zombies_dark'     // public/assets/audio/zombies-dark.ogg (pendiente)
  | 'store_upbeat';    // public/assets/audio/store-upbeat.ogg (pendiente)

// Tipos de SFX sintéticos (generados con Web Audio API, sin assets)
export type SfxEvent =
  | 'chat_send'
  | 'tenks_earn'
  | 'tenks_spend'
  | 'item_pickup'
  | 'shop_confirm'
  | 'level_up'
  | 'basket_score'
  | 'penalty_goal';

// Configuración de SFX sintéticos
const SFX_CONFIG: Record<SfxEvent, { freq: number; duration: number; type: OscillatorType; gain: number; sweep?: number }> = {
  chat_send:     { freq: 880,  duration: 0.08, type: 'sine',     gain: 0.15 },
  tenks_earn:    { freq: 440,  duration: 0.12, type: 'sine',     gain: 0.18, sweep: 660 },
  tenks_spend:   { freq: 330,  duration: 0.10, type: 'triangle', gain: 0.14, sweep: 220 },
  item_pickup:   { freq: 520,  duration: 0.15, type: 'sine',     gain: 0.20, sweep: 780 },
  shop_confirm:  { freq: 660,  duration: 0.18, type: 'sine',     gain: 0.22, sweep: 990 },
  level_up:      { freq: 392,  duration: 0.40, type: 'sine',     gain: 0.25, sweep: 784 },
  basket_score:  { freq: 600,  duration: 0.20, type: 'sine',     gain: 0.20, sweep: 900 },
  penalty_goal:  { freq: 200,  duration: 0.35, type: 'sawtooth', gain: 0.22, sweep: 400 },
};

let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (_audioCtx.state === 'suspended') {
    void _audioCtx.resume();
  }
  return _audioCtx;
}

/**
 * Reproduce un SFX sintético usando Web Audio API.
 * No requiere assets externos. Respeta el toggle sfxEnabled.
 */
export function playSfx(event: SfxEvent): void {
  const settings = loadAudioSettings();
  if (!settings.sfxEnabled) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const cfg = SFX_CONFIG[event];
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = cfg.type;
  osc.frequency.setValueAtTime(cfg.freq, now);
  if (cfg.sweep) {
    osc.frequency.linearRampToValueAtTime(cfg.sweep, now + cfg.duration);
  }

  gain.gain.setValueAtTime(cfg.gain, now);
  gain.gain.linearRampToValueAtTime(0, now + cfg.duration);

  osc.start(now);
  osc.stop(now + cfg.duration + 0.01);
}

/**
 * Inicia música de una escena en Phaser.
 * Fallback silencioso si el asset no existe.
 */
export function startSceneMusic(
  scene: Phaser.Scene,
  track: MusicTrack,
  volume = 0.40,
): Phaser.Sound.BaseSound | null {
  const settings = loadAudioSettings();
  if (!settings.musicEnabled) return null;

  try {
    if (!scene.cache.audio.exists(track)) return null; // asset no cargado aún

    const sound = scene.sound.add(track, { loop: true, volume: 0 });
    sound.play();
    scene.tweens.add({ targets: sound, volume, duration: 700, ease: 'Sine.easeIn' });
    return sound;
  } catch {
    return null;
  }
}

/**
 * Detiene música con fade out.
 */
export function stopSceneMusic(
  scene: Phaser.Scene,
  sound: Phaser.Sound.BaseSound | null,
  duration = 500,
): void {
  if (!sound) return;
  try {
    scene.tweens.add({
      targets: sound,
      volume: 0,
      duration,
      ease: 'Sine.easeOut',
      onComplete: () => { sound.stop(); sound.destroy(); },
    });
  } catch {
    sound.stop();
    sound.destroy();
  }
}
