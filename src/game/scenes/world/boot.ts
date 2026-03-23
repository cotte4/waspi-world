import Phaser from 'phaser';
import { AvatarRenderer, type AvatarConfig } from '@/src/game/systems/AvatarRenderer';
import { PLAYER } from '@/src/game/config/constants';

export type WorldSceneInitData = {
  returnX?: number;
  returnY?: number;
};

export type WorldSceneBootTarget = Pick<
  Phaser.Scene,
  'input' | 'events' | 'scene'
> & {
  runtimeFailures: Set<string>;
  inTransition: boolean;
  inputBlocked: boolean;
  px: number;
  py: number;
};

export type WorldSceneLifecycleHandlers = {
  onWake?: () => void;
  onShutdown?: () => void;
};

export type WorldSceneFrameFailureHandler = (label: string) => void;

function getSceneKey(scene: Phaser.Scene | WorldSceneBootTarget) {
  return scene.scene?.key ?? 'WorldScene';
}

export function bootstrapWorldSceneState(
  scene: WorldSceneBootTarget,
  data?: WorldSceneInitData,
) {
  scene.inTransition = false;
  scene.inputBlocked = false;
  scene.px = data?.returnX ?? PLAYER.SPAWN_X;
  scene.py = data?.returnY ?? PLAYER.SPAWN_Y;
  scene.runtimeFailures.clear();

  scene.input.enabled = true;
  if (scene.input.keyboard) {
    scene.input.keyboard.enabled = true;
  }

  return {
    px: scene.px,
    py: scene.py,
  };
}

export function attachWorldSceneLifecycle(
  scene: WorldSceneBootTarget,
  handlers: WorldSceneLifecycleHandlers = {},
) {
  const wakeHandler = () => {
    scene.inTransition = false;
    scene.inputBlocked = false;
    scene.input.enabled = true;
    if (scene.input.keyboard) {
      scene.input.keyboard.enabled = true;
    }
    handlers.onWake?.();
  };

  const shutdownHandler = () => {
    handlers.onShutdown?.();
  };

  scene.events.on(Phaser.Scenes.Events.WAKE, wakeHandler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, shutdownHandler);

  return () => {
    scene.events.off(Phaser.Scenes.Events.WAKE, wakeHandler);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, shutdownHandler);
  };
}

export function runWorldBootStep(
  scene: Phaser.Scene | WorldSceneBootTarget,
  label: string,
  fn: () => void,
) {
  try {
    fn();
  } catch (error) {
    console.error(`[Waspi][${getSceneKey(scene)}] Boot step failed: ${label}`, error);
  }
}

export function runWorldFrameStep(
  scene: Phaser.Scene | WorldSceneBootTarget,
  runtimeFailures: Set<string>,
  label: string,
  fn: () => void,
  onFirstFailure?: WorldSceneFrameFailureHandler,
) {
  try {
    fn();
  } catch (error) {
    if (!runtimeFailures.has(label)) {
      runtimeFailures.add(label);
      console.error(`[Waspi][${getSceneKey(scene)}] Runtime step failed: ${label}`, error);
      onFirstFailure?.(label);
    }
  }
}

export function safeSetupWorldRealtime<T extends 'multiplayer' | 'solo'>(
  scene: Phaser.Scene | WorldSceneBootTarget,
  setupRealtime: () => T,
) {
  try {
    return setupRealtime();
  } catch (error) {
    console.error(`[Waspi][${getSceneKey(scene)}] Boot step failed: realtime`, error);
    return 'solo' as T;
  }
}

export function createSafeWorldAvatarRenderer(
  scene: Phaser.Scene,
  x: number,
  y: number,
  config: AvatarConfig,
  label: string,
) {
  try {
    return new AvatarRenderer(scene, x, y, config);
  } catch (error) {
    console.error(`[Waspi][${getSceneKey(scene)}] Avatar rebuild failed: ${label}`, error);
    return new AvatarRenderer(scene, x, y, {
      ...config,
      avatarKind: 'procedural',
    });
  }
}
