import Phaser from 'phaser';
import { eventBus, EVENTS } from '../config/eventBus';
import { clearGlobalBgm } from './AudioManager';
import { clearVirtualJoystickState } from './ControlSettings';

const transitioningScenes = new WeakSet<Phaser.Scene>();

export function announceScene(scene: Phaser.Scene) {
  // transitionToScene() disables input during fade-out; ensure each new scene
  // starts with keyboard/input re-enabled to avoid re-entry freezes.
  scene.input.enabled = true;
  if (scene.input.keyboard) {
    scene.input.keyboard.enabled = true;
    const keyboardWithReset = scene.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin & { resetKeys?: () => void };
    keyboardWithReset.resetKeys?.();
  }
  eventBus.emit(EVENTS.SCENE_CHANGED, scene.scene.key);
}

export function createBackButton(scene: Phaser.Scene, onClick: () => void, label = 'VOLVER') {
  const bg = scene.add.rectangle(62, 28, 96, 30, 0x000000, 0.72)
    .setScrollFactor(0)
    .setDepth(12000)
    .setStrokeStyle(1, 0xF5C842, 0.55)
    .setInteractive({ useHandCursor: true });

  const text = scene.add.text(62, 28, `< ${label}`, {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#F5C842',
  })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(12001);

  bg.on('pointerdown', onClick);
  text.setInteractive({ useHandCursor: true });
  text.on('pointerdown', onClick);

  const pulseTween = scene.tweens.add({
    targets: [bg, text],
    alpha: { from: 0.92, to: 1 },
    duration: 1100,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  scene.tweens.add({
    targets: [bg, text],
    y: '+=6',
    alpha: { from: 0, to: 1 },
    duration: 220,
    ease: 'Sine.easeOut',
  });

  const hoverIn = () => {
    scene.tweens.add({
      targets: [bg, text],
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 120,
      ease: 'Quad.easeOut',
    });
    bg.setFillStyle(0x111111, 0.92);
    bg.setStrokeStyle(1, 0xF5C842, 0.9);
  };

  const hoverOut = () => {
    scene.tweens.add({
      targets: [bg, text],
      scaleX: 1,
      scaleY: 1,
      duration: 150,
      ease: 'Quad.easeOut',
    });
    bg.setFillStyle(0x000000, 0.72);
    bg.setStrokeStyle(1, 0xF5C842, 0.55);
  };

  bg.on('pointerover', hoverIn);
  bg.on('pointerout', hoverOut);
  text.on('pointerover', hoverIn);
  text.on('pointerout', hoverOut);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    pulseTween.remove();
  });

  return { bg, text };
}

export type TransitionToSceneOptions = {
  /** Salida al mundo: no compite con el throttle del ingreso (entrar+salir rápido del mismo local). */
  bypassThrottle?: boolean;
};

export function transitionToScene(
  scene: Phaser.Scene,
  targetKey: string,
  data: Record<string, unknown> = {},
  duration = 250,
  _options: TransitionToSceneOptions = {},
): boolean {
  void _options;
  if (transitioningScenes.has(scene)) return false;
  transitioningScenes.add(scene);

  if (targetKey === 'WorldScene') {
    eventBus.emit(EVENTS.SHOP_CLOSE);
  }

  const camera = scene.cameras.main;
  let finished = false;

  // Hard fallback via window.setTimeout — fires even if Phaser scene loop pauses/stops.
  // This is the key guard against permanent freeze: if FADE_OUT_COMPLETE never fires,
  // this guarantees the transition completes within duration + 300ms.
  const hardTimeout = window.setTimeout(() => finalize(), duration + 300);

  const finalize = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(hardTimeout);
    transitioningScenes.delete(scene);
    try { camera.resetFX(); camera.setAlpha(1); } catch { /* scene may already be gone */ }
    try {
      scene.scene.start(targetKey, data);
    } catch (error) {
      console.error(`[Waspi] Failed to transition to ${targetKey}.`, error);
      // Last resort: re-enable input so the player is never permanently stuck
      try { scene.input.enabled = true; } catch { /* ignore */ }
      try { if (scene.input.keyboard) scene.input.keyboard.enabled = true; } catch { /* ignore */ }
    }
  };

  scene.input.enabled = false;
  if (scene.input.keyboard) {
    scene.input.keyboard.enabled = false;
  }
  clearVirtualJoystickState();
  // Un solo BGM a la vez: cortar tema al salir (evita zombies + mundo + tienda mezclados).
  clearGlobalBgm(scene);
  camera.resetFX();
  camera.setAlpha(1);
  camera.fadeOut(duration, 0, 0, 0);
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, finalize);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    transitioningScenes.delete(scene);
    window.clearTimeout(hardTimeout);
  });

  return true;
}

/**
 * Vuelta al WorldScene desde interiores / tiendas: emite SHOP_CLOSE (React overlay)
 * y usa el mismo fade + timeout que transitionToScene. Devuelve false si fue throttled.
 */
export function transitionToWorldScene(
  scene: Phaser.Scene,
  returnX: number,
  returnY: number,
  duration = 250,
): boolean {
  return transitionToScene(scene, 'WorldScene', { returnX, returnY }, duration, { bypassThrottle: true });
}

/**
 * showSceneTitle — shows a large centered title overlay on scene fade-in.
 * Fade in 200ms → hold 800ms → fade out 400ms, then self-destructs.
 * Depth 15000, scrollFactor 0 (always on screen).
 */
export function showSceneTitle(scene: Phaser.Scene, title: string, color = 0xF5C842) {
  const W = 800;
  const H = 600;
  const cx = W / 2;
  const cy = H / 2;

  // Semi-transparent dark backdrop
  const bg = scene.add.rectangle(cx, cy, W, 80, 0x000000, 0.72)
    .setScrollFactor(0)
    .setDepth(15000)
    .setAlpha(0);

  // Convert hex number to CSS color string (#RRGGBB)
  const hexStr = `#${color.toString(16).padStart(6, '0')}`;

  const text = scene.add.text(cx, cy, title, {
    fontSize: '18px',
    fontFamily: '"Press Start 2P", monospace',
    color: hexStr,
    stroke: '#000000',
    strokeThickness: 4,
  })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(15001)
    .setAlpha(0);

  const destroy = () => {
    bg.destroy();
    text.destroy();
  };

  // Fade in
  scene.tweens.add({
    targets: [bg, text],
    alpha: 1,
    duration: 200,
    ease: 'Sine.easeOut',
    onComplete: () => {
      // Hold
      scene.time.delayedCall(800, () => {
        // Fade out
        scene.tweens.add({
          targets: [bg, text],
          alpha: 0,
          duration: 400,
          ease: 'Sine.easeIn',
          onComplete: destroy,
        });
      });
    },
  });

  // Safety cleanup if scene shuts down early
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
}

export function bindSafeResetToPlaza(scene: Phaser.Scene, onReset: () => void) {
  const handler = () => {
    try {
      onReset();
    } catch (error) {
      console.error('[Waspi] Failed to run safe plaza reset.', error);
    }
  };
  const off = eventBus.on(EVENTS.SAFE_RESET_TO_PLAZA, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  return off;
}
