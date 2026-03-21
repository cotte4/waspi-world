/**
 * AudioManager — centraliza reproducción de música y SFX en Waspi World.
 * Cada escena puede registrar su tema musical. Los SFX sintéticos se generan
 * via Web Audio API (no requieren assets externos).
 */

import { loadAudioSettings } from './AudioSettings';
import { applySinkIdToAudioContext, getStoredAudioOutputDeviceId } from './audioOutputSink';

// Claves de tracks de música (los archivos pueden no existir aún — graceful fallback)
export type MusicTrack =
  | 'arcade_theme'
  | 'world_ambient'    // public/assets/audio/world-ambient.ogg (pendiente)
  | 'zombies_dark'     // public/assets/audio/zombies-dark.ogg (pendiente)
  | 'store_upbeat';    // public/assets/audio/store-upbeat.ogg (pendiente)

/** Claves de música loop (una sola puede sonar a la vez). */
export const BGM_TRACK_KEYS = new Set<string>([
  'arcade_theme',
  'world_ambient',
  'zombies_dark',
  'store_upbeat',
]);

/** Último BGM activo — Phaser no destruye sonidos al cambiar de escena; esto evita mezclas. */
let globalBgmSound: Phaser.Sound.BaseSound | null = null;

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
  let created = false;
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      created = true;
    } catch {
      return null;
    }
  }
  if (_audioCtx.state === 'suspended') {
    void _audioCtx.resume();
  }
  if (created) {
    const sink = getStoredAudioOutputDeviceId();
    if (sink) {
      void applySinkIdToAudioContext(_audioCtx, sink);
    }
  }
  return _audioCtx;
}

/** Llamar al cambiar dispositivo en Settings (SFX del AudioManager). */
export function applyOutputSinkToSfxContext(sinkId: string): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  void applySinkIdToAudioContext(ctx, sinkId);
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
 * Detiene y destruye cualquier BGM conocido (registrado + huérfanos en el SoundManager).
 * Llamar antes de arrancar otro tema y al iniciar `transitionToScene()`.
 */
export function clearGlobalBgm(scene: Phaser.Scene): void {
  if (globalBgmSound) {
    try {
      scene.tweens.killTweensOf(globalBgmSound);
    } catch { /* ignore */ }
    try {
      globalBgmSound.stop();
      globalBgmSound.destroy();
    } catch { /* ignore */ }
    globalBgmSound = null;
  }

  // Por si quedó una instancia sin referencia (orden de shutdown / race).
  try {
    const mgr = scene.game.sound as Phaser.Sound.BaseSoundManager & {
      sounds?: Phaser.Sound.BaseSound[];
    };
    const list = mgr.sounds;
    if (!Array.isArray(list)) return;
    for (const s of [...list]) {
      if (!s || typeof s.key !== 'string') continue;
      if (!BGM_TRACK_KEYS.has(s.key)) continue;
      try {
        scene.tweens.killTweensOf(s);
        s.stop();
        s.destroy();
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/**
 * Registra el BGM actual (p. ej. Arcade que no usa startSceneMusic).
 * El caller debe haber llamado antes a `clearGlobalBgm` si reemplaza otro tema.
 */
export function attachGlobalBgm(sound: Phaser.Sound.BaseSound | null): void {
  globalBgmSound = sound;
}

/** Cuando una escena hace fade-out manual del BGM, suelta el slot si coincide. */
export function detachGlobalBgmIfMatch(sound: Phaser.Sound.BaseSound | null | undefined): void {
  if (!sound) return;
  if (globalBgmSound === sound) globalBgmSound = null;
}

/**
 * Inicia música de una escena en Phaser.
 * Fallback silencioso si el asset no existe.
 * Garantiza un solo stream: corta cualquier BGM previo.
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

    clearGlobalBgm(scene);

    const sound = scene.sound.add(track, { loop: true, volume: 0 });
    globalBgmSound = sound;
    sound.play();
    // Tween sobre proxy plain-JS para evitar "Cannot set properties of null
    // (setting 'volume')": Phaser tweena el proxy (nunca crashea) y nosotros
    // aplicamos el valor al sound solo si sigue vivo. Esto cubre el caso donde
    // clearGlobalBgm() es llamado desde otra escena y no puede matar el tween
    // de SceneA desde el TweenManager de SceneB.
    const fadeProxy = { volume: 0 };
    scene.tweens.add({
      targets: fadeProxy,
      volume,
      duration: 700,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        if ((sound as Phaser.Sound.BaseSound & { manager?: unknown }).manager) {
          try { (sound as Phaser.Sound.WebAudioSound).volume = fadeProxy.volume; } catch { /* ignore */ }
        }
      },
    });
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
  detachGlobalBgmIfMatch(sound);
  const managedSound = sound as Phaser.Sound.BaseSound & { manager?: unknown };
  const sceneIsActive = !!scene.sys?.isActive?.();
  try {
    scene.tweens.killTweensOf(sound);
  } catch { /* ignore */ }
  // If scene is shutting down (or the sound was already destroyed by a global
  // cleanup), avoid tweening sound.volume because WebAudio internals may be null.
  if (!sceneIsActive || !managedSound.manager || duration <= 0) {
    try { sound.stop(); } catch { /* ignore */ }
    try { sound.destroy(); } catch { /* ignore */ }
    return;
  }
  try {
    scene.tweens.add({
      targets: sound,
      volume: 0,
      duration,
      ease: 'Sine.easeOut',
      onComplete: () => {
        try { scene.tweens.killTweensOf(sound); } catch { /* ignore */ }
        try { sound.stop(); } catch { /* ignore */ }
        try { sound.destroy(); } catch { /* ignore */ }
      },
    });
  } catch {
    try { sound.stop(); } catch { /* ignore */ }
    try { sound.destroy(); } catch { /* ignore */ }
  }
}
