import Phaser from 'phaser';
import { eventBus, EVENTS } from '../config/eventBus';
import { safeSceneDelayedCall } from './AnimationSafety';
import { clearVirtualJoystickState } from './ControlSettings';

const transitioningScenes = new WeakSet<Phaser.Scene>();

export function announceScene(scene: Phaser.Scene) {
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

export function transitionToScene(
  scene: Phaser.Scene,
  targetKey: string,
  data: Record<string, unknown> = {},
  duration = 250,
) {
  if (transitioningScenes.has(scene)) return;
  transitioningScenes.add(scene);
  const camera = scene.cameras.main;
  let finished = false;
  const finalize = () => {
    if (finished) return;
    finished = true;
    transitioningScenes.delete(scene);
    try {
      if (!scene.scene || scene.sys?.isActive?.() === false) return;
      camera.resetFX();
      camera.setAlpha(1);
      scene.scene.start(targetKey, data);
    } catch (error) {
      console.error(`[Waspi] Failed to transition to ${targetKey}.`, error);
    }
  };

  scene.input.enabled = false;
  if (scene.input.keyboard) {
    scene.input.keyboard.enabled = false;
  }
  clearVirtualJoystickState();
  camera.resetFX();
  camera.setAlpha(1);
  camera.fadeOut(duration, 0, 0, 0);
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, finalize);
  safeSceneDelayedCall(scene, duration + 100, finalize, `transition fallback:${targetKey}`);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    transitioningScenes.delete(scene);
  });
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
