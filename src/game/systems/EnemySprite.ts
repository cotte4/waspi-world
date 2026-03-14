import Phaser from 'phaser';
import {
  ensureFallbackRectTexture,
  getSafeAnimationDurationMs,
  safeCreateSpritesheetAnimation,
  safeDestroyGameObject,
  safePlaySpriteAnimation,
  safeSceneDelayedCall,
  safeWithLiveSprite,
} from './AnimationSafety';

export type ZombieState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
export type ZombieType = 'rusher' | 'shooter' | 'tank' | 'boss';

const ZOMBIE_SCALE: Record<ZombieType, number> = {
  rusher:  1.0,
  shooter: 1.0,
  tank:    1.0,
  boss:    1.0,
};

// How many px above center the sprite should be offset (sprites are drawn top-down)
const ZOMBIE_Y_OFFSET: Record<ZombieType, number> = {
  rusher:  -8,
  shooter: -8,
  tank:    -12,
  boss:    -16,
};

export class EnemySprite {
  private sprite: Phaser.GameObjects.Sprite;
  private type: ZombieType;
  private currentState: ZombieState = 'idle';
  private dead = false;
  private scene: Phaser.Scene;
  private stateToken = 0;
  private stateLockUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, type: ZombieType) {
    this.scene = scene;
    this.type = type;
    const initialTexture = scene.textures.exists(`zombie_${type}_idle`)
      ? `zombie_${type}_idle`
      : ensureZombieFallbackTexture(scene, type);
    this.sprite = scene.add.sprite(x, y + ZOMBIE_Y_OFFSET[type], initialTexture);
    this.sprite.setDepth(30);
    this.sprite.setScale(ZOMBIE_SCALE[type]);
    this.sprite.setOrigin(0.5, 0.5);
    this.playAnim('idle');
  }

  private animKey(state: ZombieState): string {
    return `zombie_${this.type}_${state}`;
  }

  private canUseSprite() {
    return !!this.sprite
      && !!this.sprite.scene
      && this.sprite.active !== false
      && !!this.sprite.texture
      && !!this.sprite.anims;
  }

  private getAnimDurationMs(state: ZombieState) {
    const fallback = state === 'death' ? 520 : state === 'attack' ? 280 : state === 'hurt' ? 220 : 180;
    return getSafeAnimationDurationMs(this.scene, this.animKey(state), fallback);
  }

  private playAnim(state: ZombieState) {
    if (!this.canUseSprite()) return false;
    try {
      const key = this.animKey(state);
      const fallbackKey = ensureZombieFallbackTexture(this.scene, this.type);
      return safePlaySpriteAnimation(this.scene, this.sprite, key, `zombie_${this.type}_${state}`, fallbackKey, true);
    } catch (error) {
      console.error(`[Waspi] EnemySprite playAnim failed for ${this.type}:${state}`, error);
      return false;
    }
  }

  setState(state: ZombieState) {
    if (!this.canUseSprite()) return;
    try {
      if (this.dead && state !== 'death') return;
      if ((state === 'idle' || state === 'walk') && this.scene.time.now < this.stateLockUntil) return;

      // Avoid re-triggering looping anims every frame
      if (
        (state === 'idle' || state === 'walk') &&
        this.currentState === state
      ) return;

      this.currentState = state;
      const token = ++this.stateToken;

      if (state === 'death') {
        this.dead = true;
        this.stateLockUntil = Number.POSITIVE_INFINITY;
        this.playAnim('death');
        const delay = this.getAnimDurationMs('death');
        safeSceneDelayedCall(this.scene, delay, () => {
          if (!this.canUseSprite()) return;
          if (token !== this.stateToken) return;
          this.sprite.setAlpha(0);
        }, `${this.type}:death-hide`);
        return;
      }

      this.playAnim(state);
      if (state === 'attack' || state === 'hurt') {
        const delay = this.getAnimDurationMs(state);
        this.stateLockUntil = this.scene.time.now + delay;
        safeSceneDelayedCall(this.scene, delay, () => {
          if (!this.canUseSprite()) return;
          if (token !== this.stateToken || this.dead) return;
          if (this.currentState !== state) return;
          this.currentState = 'idle';
          this.stateLockUntil = 0;
          this.playAnim('idle');
        }, `${this.type}:${state}-reset`);
        return;
      }

      this.stateLockUntil = 0;
    } catch (error) {
      console.error(`[Waspi] EnemySprite setState failed for ${this.type}:${state}`, error);
    }
  }

  setPosition(x: number, y: number) {
    safeWithLiveSprite(this.sprite, (sprite) => {
      sprite.setPosition(x, y + ZOMBIE_Y_OFFSET[this.type]);
    }, `EnemySprite setPosition ${this.type}`);
  }

  revive() {
    if (!this.canUseSprite()) return;
    this.dead = false;
    this.currentState = 'idle';
    this.stateLockUntil = 0;
    this.stateToken += 1;
    try {
      this.sprite.setAlpha(1);
      this.playAnim('idle');
    } catch (error) {
      console.error(`[Waspi] EnemySprite revive failed for ${this.type}`, error);
    }
  }

  setAlpha(alpha: number) {
    safeWithLiveSprite(this.sprite, (sprite) => {
      sprite.setAlpha(alpha);
    }, `EnemySprite setAlpha ${this.type}`);
  }

  setFlipX(flip: boolean) {
    safeWithLiveSprite(this.sprite, (sprite) => {
      sprite.setFlipX(flip);
    }, `EnemySprite setFlipX ${this.type}`);
  }

  destroy() {
    this.dead = true;
    this.stateToken += 1;
    safeDestroyGameObject(this.sprite);
  }
}

/** Register all zombie animations. Call once in WorldScene.create() */
export function registerZombieAnims(scene: Phaser.Scene) {
  const configs: Array<{
    type: ZombieType;
    state: ZombieState;
    frames: number;
    fps: number;
    loop: boolean;
  }> = [
    // Rusher
    { type: 'rusher', state: 'idle',   frames: 4, fps: 6,  loop: true  },
    { type: 'rusher', state: 'walk',   frames: 6, fps: 8,  loop: true  },
    { type: 'rusher', state: 'attack', frames: 4, fps: 12, loop: false },
    { type: 'rusher', state: 'hurt',   frames: 3, fps: 10, loop: false },
    { type: 'rusher', state: 'death',  frames: 6, fps: 8,  loop: false },
    // Shooter
    { type: 'shooter', state: 'idle',   frames: 4, fps: 6,  loop: true  },
    { type: 'shooter', state: 'walk',   frames: 6, fps: 8,  loop: true  },
    { type: 'shooter', state: 'attack', frames: 4, fps: 12, loop: false },
    { type: 'shooter', state: 'hurt',   frames: 3, fps: 10, loop: false },
    { type: 'shooter', state: 'death',  frames: 6, fps: 8,  loop: false },
    // Tank
    { type: 'tank', state: 'idle',   frames: 4, fps: 6,  loop: true  },
    { type: 'tank', state: 'walk',   frames: 6, fps: 5,  loop: true  },
    { type: 'tank', state: 'attack', frames: 4, fps: 10, loop: false },
    { type: 'tank', state: 'hurt',   frames: 3, fps: 10, loop: false },
    { type: 'tank', state: 'death',  frames: 6, fps: 6,  loop: false },
    // Boss
    { type: 'boss', state: 'idle',   frames: 4, fps: 5,  loop: true  },
    { type: 'boss', state: 'walk',   frames: 6, fps: 6,  loop: true  },
    { type: 'boss', state: 'attack', frames: 6, fps: 12, loop: false },
    { type: 'boss', state: 'hurt',   frames: 3, fps: 10, loop: false },
    { type: 'boss', state: 'death',  frames: 8, fps: 7,  loop: false },
  ];

  for (const c of configs) {
    const key = `zombie_${c.type}_${c.state}`;
    ensureZombieFallbackTexture(scene, c.type);
    safeCreateSpritesheetAnimation(scene, key, key, c.fps, c.loop ? -1 : 0, 0, c.frames - 1);
  }
}

function ensureZombieFallbackTexture(scene: Phaser.Scene, type: ZombieType) {
  const size = type === 'boss' ? 128 : type === 'tank' ? 96 : 64;
  const fill = type === 'boss' ? 0x7a274c : type === 'tank' ? 0x6f5f3f : type === 'shooter' ? 0x55773d : 0x6b7d4b;
  return ensureFallbackRectTexture(scene, `zombie_fallback_${type}`, size, size, fill);
}
