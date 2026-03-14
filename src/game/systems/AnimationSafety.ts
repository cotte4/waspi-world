import Phaser from 'phaser';

function isLiveSprite(sprite: Phaser.GameObjects.Sprite | undefined | null) {
  return !!sprite
    && !!sprite.scene
    && sprite.active !== false
    && !!sprite.texture
    && !!sprite.anims;
}

export function isLiveGameObject<T extends Phaser.GameObjects.GameObject | null | undefined>(object: T): object is Exclude<T, null | undefined> {
  return Boolean(object && object.scene && object.active !== false);
}

export function safeDestroyGameObject(object: { scene?: Phaser.Scene | null; active?: boolean; destroy: () => void } | null | undefined) {
  if (!object || !object.scene) return false;
  try {
    object.destroy();
    return true;
  } catch (error) {
    console.error('[Waspi] Failed to destroy game object safely.', error);
    return false;
  }
}

export function safeSceneDelayedCall(
  scene: Phaser.Scene,
  delayMs: number,
  callback: () => void,
  label = 'delayed callback',
) {
  return scene.time.delayedCall(delayMs, () => {
    if (!scene.scene || scene.sys?.isActive?.() === false) return;
    try {
      callback();
    } catch (error) {
      console.error(`[Waspi] Failed during ${label}.`, error);
    }
  });
}

export function safeBindAnimationComplete(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  onComplete: (animation: Phaser.Animations.Animation) => void,
) {
  if (!isLiveSprite(sprite)) return () => undefined;
  const handler = (animation: Phaser.Animations.Animation) => {
    if (!isLiveSprite(sprite) || !scene.scene || scene.sys?.isActive?.() === false) return;
    try {
      onComplete(animation);
    } catch (error) {
      console.error('[Waspi] Failed during animation complete handler.', error);
    }
  };
  sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, handler);
  const off = () => {
    try {
      sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE, handler);
    } catch {
      // no-op
    }
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  return off;
}

export function safeWithLiveSprite(
  sprite: Phaser.GameObjects.Sprite | undefined | null,
  work: (sprite: Phaser.GameObjects.Sprite) => void,
  label: string,
) {
  if (!isLiveSprite(sprite)) return false;
  try {
    work(sprite as Phaser.GameObjects.Sprite);
    return true;
  } catch (error) {
    console.error(`[Waspi] Failed during ${label}.`, error);
    return false;
  }
}

export function ensureFallbackRectTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  fillColor: number,
  strokeColor = 0x111111,
) {
  if (scene.textures.exists(key) || typeof document === 'undefined') return key;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return key;

  ctx.fillStyle = `#${fillColor.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = `#${strokeColor.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  const texture = scene.textures.addCanvas(key, canvas);
  texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

export function hasUsableTexture(scene: Phaser.Scene, textureKey: string) {
  if (!scene.textures.exists(textureKey)) return false;
  const texture = scene.textures.get(textureKey);
  const frameTotal = texture?.frameTotal ?? 0;
  return frameTotal > 1;
}

export function safeCreateSpritesheetAnimation(
  scene: Phaser.Scene,
  animationKey: string,
  textureKey: string,
  frameRate: number,
  repeat: number,
  startFrame = 0,
  endFrame?: number,
) {
  if (scene.anims.exists(animationKey)) return true;
  if (!hasUsableTexture(scene, textureKey)) return false;

  try {
    const texture = scene.textures.get(textureKey);
    const resolvedEndFrame = endFrame ?? Math.max(startFrame, (texture?.frameTotal ?? 2) - 2);
    scene.anims.create({
      key: animationKey,
      frames: scene.anims.generateFrameNumbers(textureKey, { start: startFrame, end: resolvedEndFrame }),
      frameRate,
      repeat,
    });
    return true;
  } catch (error) {
    console.error(`[Waspi] Failed to create animation ${animationKey}`, error);
    return false;
  }
}

export function safeSetSpriteTexture(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  preferredTexture: string,
  fallbackTexture: string,
) {
  if (!isLiveSprite(sprite)) return fallbackTexture;
  const resolved = scene.textures.exists(preferredTexture) ? preferredTexture : fallbackTexture;
  try {
    if (sprite.texture.key !== resolved) {
      sprite.setTexture(resolved, 0);
    }
  } catch (error) {
    console.error(`[Waspi] Failed to set texture ${resolved}`, error);
  }
  return resolved;
}

export function safePlaySpriteAnimation(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  animationKey: string,
  preferredTexture: string,
  fallbackTexture: string,
  ignoreIfPlaying = true,
) {
  if (!isLiveSprite(sprite)) return false;
  if (scene.anims.exists(animationKey)) {
    try {
      sprite.play(animationKey, ignoreIfPlaying);
      return true;
    } catch (error) {
      console.error(`[Waspi] Failed to play animation ${animationKey}`, error);
    }
  }

  safeSetSpriteTexture(scene, sprite, preferredTexture, fallbackTexture);
  try {
    sprite.stop();
  } catch (error) {
    console.error(`[Waspi] Failed to stop sprite after animation fallback ${animationKey}`, error);
  }
  return false;
}

export function getSafeAnimationDurationMs(
  scene: Phaser.Scene,
  animationKey: string,
  fallbackMs: number,
) {
  try {
    const anim = scene.anims.get(animationKey);
    if (!anim) return fallbackMs;
    const frameTotal = anim.frames?.length ?? 0;
    const frameRate = anim.frameRate ?? 0;
    if (frameTotal <= 0 || frameRate <= 0) return fallbackMs;
    return Math.max(fallbackMs, Math.round((frameTotal / frameRate) * 1000));
  } catch (error) {
    console.error(`[Waspi] Failed to estimate animation duration ${animationKey}`, error);
    return fallbackMs;
  }
}
