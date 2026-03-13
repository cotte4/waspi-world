import Phaser from 'phaser';
import { COLORS } from '../config/constants';

export type AvatarKind = 'procedural' | 'gengar' | 'buho' | 'piplup' | 'chacha';
export type HairStyle = 'SPI' | 'FLA' | 'MOH' | 'X';

export interface AvatarConfig {
  avatarKind?: AvatarKind;
  bodyColor?: number;
  hairColor?: number;
  eyeColor?: number;
  topColor?: number;
  bottomColor?: number;
  hairStyle?: HairStyle;
  pp?: number; // 0..10 lower-body proportion (fun label)
  tt?: number; // 0..10 upper-body proportion (fun label)
  smoke?: boolean;
  equipTop?: string;
  equipBottom?: string;
}

export const AVATAR_STORAGE_KEY = 'waspi_avatar_config';

export const DEFAULT_AVATAR_CONFIG: Required<AvatarConfig> = {
  avatarKind: 'procedural',
  bodyColor: COLORS.SKIN_LIGHT,
  hairColor: COLORS.HAIR_BROWN,
  eyeColor: 0x2244CC,
  topColor: COLORS.BODY_BLUE,
  bottomColor: COLORS.LEGS_DARK,
  hairStyle: 'SPI',
  pp: 2,
  tt: 2,
  smoke: false,
  equipTop: '',
  equipBottom: '',
};

export function normalizeAvatarConfig(config: AvatarConfig = {}): Required<AvatarConfig> {
  return { ...DEFAULT_AVATAR_CONFIG, ...config };
}

export function loadStoredAvatarConfig(): Required<AvatarConfig> {
  if (typeof window === 'undefined') return { ...DEFAULT_AVATAR_CONFIG };
  const raw = window.localStorage.getItem(AVATAR_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_AVATAR_CONFIG };
  try {
    return normalizeAvatarConfig(JSON.parse(raw) as AvatarConfig);
  } catch {
    return { ...DEFAULT_AVATAR_CONFIG };
  }
}

export function saveStoredAvatarConfig(config: AvatarConfig) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(normalizeAvatarConfig(config)));
}

export class AvatarRenderer {
  private container: Phaser.GameObjects.Container;
  private facingLeft = false;
  private walkTick = 0;
  private body?: Phaser.GameObjects.Arc;
  private ppBlob?: Phaser.GameObjects.Ellipse;
  private ttLeft?: Phaser.GameObjects.Ellipse;
  private ttRight?: Phaser.GameObjects.Ellipse;
  private leftFoot?: Phaser.GameObjects.Rectangle;
  private rightFoot?: Phaser.GameObjects.Rectangle;
  private leftHand?: Phaser.GameObjects.Rectangle;
  private rightHand?: Phaser.GameObjects.Rectangle;
  private hair?: Phaser.GameObjects.Graphics;
  private specialSprite?: Phaser.GameObjects.Image;
  private specialBaseY = 12;
  private lastPuffAt = 0;
  readonly config: Required<AvatarConfig>;

  constructor(scene: Phaser.Scene, x: number, y: number, config: AvatarConfig = {}) {
    this.config = normalizeAvatarConfig(config);
    this.container = scene.add.container(x, y);
    this.buildAvatar(scene);
  }

  private buildAvatar(scene: Phaser.Scene) {
    // Shadow
    const shadow = scene.add.ellipse(0, 26, 26, 9, 0x000000, 0.35);
    this.container.add(shadow);

    if (this.config.avatarKind !== 'procedural') {
      this.buildSpecialAvatar(scene, this.config.avatarKind);
      return;
    }

    const c = this.config;

    // Separate attributes (0..10) — bizarre extremes without scaling whole character
    const tt = Phaser.Math.Clamp(c.tt ?? 2, 0, 10);
    const pp = Phaser.Math.Clamp(c.pp ?? 2, 0, 10);

    // Keep main body size mostly stable
    const bodyR = 15;
    const bodyY = -6;

    // Main blob body
    this.body = scene.add.arc(0, bodyY, bodyR, 0, 360, false, c.bodyColor);

    // Simple “shirt” band (topColor)
    const shirt = scene.add.arc(0, bodyY + 2, bodyR * 0.92, 200, 340, false, c.topColor);
    shirt.setAlpha(0.9);

    // Feet (lower body feel)
    const footY = bodyY + bodyR + 12;
    this.leftFoot = scene.add.rectangle(-6, footY, 8, 8, c.bottomColor);
    this.rightFoot = scene.add.rectangle(6, footY, 8, 8, c.bottomColor);

    // Hands
    const handY = bodyY + 8;
    this.leftHand = scene.add.rectangle(-bodyR - 4, handY, 7, 7, c.bodyColor);
    this.rightHand = scene.add.rectangle(bodyR + 4, handY, 7, 7, c.bodyColor);

    // PP / TT blobs (comical, abstract shapes)
    // TT = two blobs on upper torso
    const ttScale = 0.3 + tt * 0.22; // 0.3..2.5
    this.ttLeft = scene.add.ellipse(-7, bodyY + 4, 10 * ttScale, 8 * ttScale, 0x000000, 0.12);
    this.ttRight = scene.add.ellipse(7, bodyY + 4, 10 * ttScale, 8 * ttScale, 0x000000, 0.12);
    this.ttLeft.setStrokeStyle(1, 0x000000, 0.18);
    this.ttRight.setStrokeStyle(1, 0x000000, 0.18);

    // PP = single blob on lower torso (center)
    const ppScale = 0.2 + pp * 0.25; // 0.2..2.7
    this.ppBlob = scene.add.ellipse(0, bodyY + 16, 10 * ppScale, 7 * ppScale, 0x000000, 0.14);
    this.ppBlob.setStrokeStyle(1, 0x000000, 0.22);

    // Eyes (big, simple)
    const eyeY = bodyY - 4;
    const eyeWhiteL = scene.add.circle(-6, eyeY, 4.2, 0xFFFFFF);
    const eyeWhiteR = scene.add.circle(6, eyeY, 4.2, 0xFFFFFF);
    const pupilL = scene.add.circle(-6, eyeY + 1, 2.4, c.eyeColor);
    const pupilR = scene.add.circle(6, eyeY + 1, 2.4, c.eyeColor);

    // Hair (graphics so we can draw variants)
    this.hair = scene.add.graphics();
    this.drawHairVariant(bodyR);

    this.container.add([
      this.leftFoot,
      this.rightFoot,
      this.body,
      shirt,
      this.ttLeft,
      this.ttRight,
      this.ppBlob,
      this.leftHand,
      this.rightHand,
      this.hair,
      eyeWhiteL,
      eyeWhiteR,
      pupilL,
      pupilR,
    ]);
  }

  private buildSpecialAvatar(scene: Phaser.Scene, kind: Exclude<AvatarKind, 'procedural'>) {
    const textureKey = ensureSeedTexture(scene, kind);
    this.specialSprite = scene.add.image(0, this.specialBaseY, textureKey);
    this.specialSprite.setOrigin(0.5, 1);

    const src = scene.textures.get(textureKey).getSourceImage() as { width?: number; height?: number };
    const w = src?.width ?? 1;
    const h = src?.height ?? 1;
    const scale = Math.min(54 / w, 54 / h);
    this.specialSprite.setScale(scale);
    this.container.add(this.specialSprite);
  }

  private drawHairVariant(bodyR: number) {
    const c = this.config;
    if (!this.hair) return;
    this.hair.clear();
    this.hair.fillStyle(c.hairColor, 1);

    const topY = -6 - bodyR + 2;
    switch (c.hairStyle) {
      case 'FLA': {
        this.hair.fillRoundedRect(-bodyR * 0.7, topY - 4, bodyR * 1.4, 10, 3);
        break;
      }
      case 'MOH': {
        this.hair.fillRoundedRect(-3, topY - 10, 6, 18, 3);
        break;
      }
      case 'X': {
        // bald
        break;
      }
      case 'SPI':
      default: {
        // spikes
        this.hair.fillTriangle(-10, topY + 4, -2, topY - 10, 6, topY + 4);
        this.hair.fillTriangle(-2, topY + 4, 6, topY - 12, 14, topY + 4);
        break;
      }
    }
  }

  update(isMoving: boolean, dx: number) {
    // Direction flip
    if (dx < -0.1 && !this.facingLeft) {
      this.container.setScale(-1, 1);
      this.facingLeft = true;
    } else if (dx > 0.1 && this.facingLeft) {
      this.container.setScale(1, 1);
      this.facingLeft = false;
    }

    // Walk / idle animation (feet + subtle bob)
    this.walkTick += isMoving ? 0.30 : 0.08;
    const swing = isMoving ? Math.sin(this.walkTick) * 3 : Math.sin(this.walkTick) * 1.2;
    const bob = isMoving ? Math.sin(this.walkTick * 0.5) * 1.1 : Math.sin(this.walkTick * 0.5) * 0.6;

    this.leftFoot?.setAngle(swing);
    this.rightFoot?.setAngle(-swing);
    this.leftHand?.setAngle(-swing * 0.7);
    this.rightHand?.setAngle(swing * 0.7);

    this.container.setY(this.container.y + bob * 0.2);

    if (this.specialSprite) {
      this.specialSprite.setY(this.specialBaseY + bob);
    }

    // Smoking idle puffs
    if (!isMoving && this.config.smoke) {
      const now = Date.now();
      if (now - this.lastPuffAt > 900) {
        this.lastPuffAt = now;
        this.puffSmoke();
      }
    }
  }

  private puffSmoke() {
    const scene = this.container.scene;
    if (!scene) return;

    // Approx mouth position relative to container
    const x = this.container.x + 10;
    const y = this.container.y - 12;

    const puff = scene.add.circle(x, y, 3, 0xDDE2EE, 0.75);
    puff.setDepth(this.container.depth + 5);

    scene.tweens.add({
      targets: puff,
      y: y - 24 - Math.random() * 8,
      x: x + (Math.random() * 10 - 5),
      alpha: { from: 0.75, to: 0 },
      scale: { from: 1, to: 2.2 },
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  setPosition(x: number, y: number) {
    this.container.setPosition(x, y);
  }

  setDepth(d: number) {
    this.container.setDepth(d);
  }

  getContainer() { return this.container; }
  get x() { return this.container.x; }
  get y() { return this.container.y; }

  destroy() {
    this.container.destroy();
  }
}

function ensureSeedTexture(scene: Phaser.Scene, kind: Exclude<AvatarKind, 'procedural'>) {
  const baseKey = kind === 'gengar'
    ? 'seed_gengar'
    : kind === 'piplup'
      ? 'seed_piplup'
      : kind === 'chacha'
        ? 'seed_chacha'
      : 'seed_buho';
  const chromaKey = `${baseKey}_avatar`;

  if (scene.textures.exists(chromaKey)) return chromaKey;

  if (scene.textures.exists(baseKey) && createChromaKeyTexture(scene, baseKey, chromaKey, 26)) {
    return chromaKey;
  }

  const fallbackKey = `${baseKey}_fallback`;
  if (!scene.textures.exists(fallbackKey)) {
    createFallbackSeedTexture(scene, fallbackKey, kind);
  }
  return fallbackKey;
}

function createChromaKeyTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  outKey: string,
  tolerance: number,
) {
  if (typeof document === 'undefined') return false;

  const src = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = (src as { width?: number }).width ?? 0;
  const h = (src as { height?: number }).height ?? 0;
  if (!w || !h) return false;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const isGreen =
      g > 140 &&
      (g - r) > (110 - tolerance) &&
      (g - b) > (110 - tolerance) &&
      r < 140 &&
      b < 140;
    if (isGreen) d[i + 3] = 0;
  }

  ctx.putImageData(img, 0, 0);
  const texture = scene.textures.addCanvas(outKey, canvas);
  if (!texture) return false;
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return true;
}

function createFallbackSeedTexture(
  scene: Phaser.Scene,
  key: string,
  kind: Exclude<AvatarKind, 'procedural'>,
) {
  if (typeof document === 'undefined') return;

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, 64, 64);

  if (kind === 'gengar') {
    ctx.fillStyle = '#5f2aa6';
    ctx.beginPath();
    ctx.moveTo(15, 46);
    ctx.lineTo(10, 24);
    ctx.lineTo(18, 12);
    ctx.lineTo(24, 18);
    ctx.lineTo(30, 10);
    ctx.lineTo(36, 18);
    ctx.lineTo(44, 12);
    ctx.lineTo(52, 24);
    ctx.lineTo(49, 46);
    ctx.quadraticCurveTo(32, 58, 15, 46);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(18, 27, 10, 8);
    ctx.fillRect(36, 27, 10, 8);
    ctx.fillStyle = '#ff3355';
    ctx.fillRect(21, 29, 4, 4);
    ctx.fillRect(39, 29, 4, 4);
    ctx.fillStyle = '#1a102c';
    ctx.fillRect(23, 40, 18, 4);
  } else if (kind === 'piplup') {
    ctx.fillStyle = '#4b8fe2';
    ctx.beginPath();
    ctx.arc(32, 34, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d8f1ff';
    ctx.beginPath();
    ctx.ellipse(32, 38, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#163b72';
    ctx.beginPath();
    ctx.moveTo(18, 26);
    ctx.lineTo(22, 13);
    ctx.lineTo(29, 24);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(46, 26);
    ctx.lineTo(42, 13);
    ctx.lineTo(35, 24);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(25, 33, 5, 0, Math.PI * 2);
    ctx.arc(39, 33, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(25, 33, 2, 0, Math.PI * 2);
    ctx.arc(39, 33, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f7d23a';
    ctx.beginPath();
    ctx.moveTo(32, 37);
    ctx.lineTo(26, 42);
    ctx.lineTo(38, 42);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'chacha') {
    ctx.fillStyle = '#ffd35c';
    ctx.beginPath();
    ctx.arc(32, 35, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f2b93d';
    ctx.beginPath();
    ctx.ellipse(32, 42, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8c5a12';
    ctx.beginPath();
    ctx.moveTo(19, 22);
    ctx.lineTo(26, 12);
    ctx.lineTo(31, 23);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(45, 22);
    ctx.lineTo(38, 12);
    ctx.lineTo(33, 23);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(25, 33, 5, 0, Math.PI * 2);
    ctx.arc(39, 33, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(25, 33, 2, 0, Math.PI * 2);
    ctx.arc(39, 33, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f08a24';
    ctx.beginPath();
    ctx.moveTo(32, 38);
    ctx.lineTo(26, 43);
    ctx.lineTo(38, 43);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#6b4c2e';
    ctx.beginPath();
    ctx.arc(32, 34, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8c6239';
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(20, 12);
    ctx.lineTo(30, 24);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(48, 26);
    ctx.lineTo(44, 12);
    ctx.lineTo(34, 24);
    ctx.fill();

    ctx.fillStyle = '#f5c842';
    ctx.beginPath();
    ctx.arc(24, 32, 7, 0, Math.PI * 2);
    ctx.arc(40, 32, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(24, 32, 2, 0, Math.PI * 2);
    ctx.arc(40, 32, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d48018';
    ctx.beginPath();
    ctx.moveTo(32, 36);
    ctx.lineTo(27, 42);
    ctx.lineTo(37, 42);
    ctx.closePath();
    ctx.fill();
  }

  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) return;
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
