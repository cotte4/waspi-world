import Phaser from 'phaser';
import { COLORS } from '../config/constants';
import {
  ensureFallbackRectTexture,
  safeCreateSpritesheetAnimation,
  safeDestroyGameObject,
  safePlaySpriteAnimation,
  safeSceneDelayedCall,
  safeWithLiveSprite,
} from './AnimationSafety';

export type AvatarKind = 'procedural' | 'gengar' | 'buho' | 'piplup' | 'chacha' | 'trap_a' | 'trap_b' | 'trap_c' | 'trap_d';
export type HairStyle   = 'SPI' | 'FLA' | 'MOH' | 'MCH' | 'X' | 'CRL' | 'BUN';
export type HatStyle    = 'none' | 'snapback' | 'beanie' | 'bucket' | 'headband';
export type MouthStyle  = 'neutral' | 'smile' | 'serious' | 'grin';
export type GlassesStyle = 'none' | 'round' | 'shades' | 'visor';
export type ChainStyle  = 'none' | 'thin' | 'chunky';
export type ShoeStyle   = 'low' | 'high' | 'slides';
export type AuraEffect  = 'none' | 'smoke' | 'sparkle' | 'cash' | 'stars';
export type AvatarAction = 'shoot' | 'hurt' | 'death';

export interface AvatarConfig {
  avatarKind?:   AvatarKind;
  bodyColor?:    number;
  hairColor?:    number;
  eyeColor?:     number;
  topColor?:     number;
  bottomColor?:  number;
  hairStyle?:    HairStyle;
  pp?:           number;
  tt?:           number;
  smoke?:        boolean;
  equipTop?:     string;
  equipBottom?:  string;
  // ── DRIP STUDIO ──────────────────────────────────────────────
  hatStyle?:     HatStyle;
  hatColor?:     number;
  mouthStyle?:   MouthStyle;
  glassesStyle?: GlassesStyle;
  glassesColor?: number;
  chainStyle?:   ChainStyle;
  chainColor?:   number;
  shoeStyle?:    ShoeStyle;
  shoeColor?:    number;
  auraColor?:    number;
  auraEffect?:   AuraEffect;
  bodyWidth?:    number;
  bodyHeight?:   number;
}

export const AVATAR_STORAGE_KEY = 'waspi_avatar_config';

export const DEFAULT_AVATAR_CONFIG: Required<AvatarConfig> = {
  avatarKind:   'procedural',
  bodyColor:    COLORS.SKIN_LIGHT,
  hairColor:    COLORS.HAIR_BROWN,
  eyeColor:     0x2244CC,
  topColor:     COLORS.BODY_BLUE,
  bottomColor:  COLORS.LEGS_DARK,
  hairStyle:    'SPI',
  pp: 2, tt: 2,
  smoke:        false,
  equipTop:     '',
  equipBottom:  '',
  // DRIP STUDIO defaults
  hatStyle:     'none',
  hatColor:     0x222233,
  mouthStyle:   'neutral',
  glassesStyle: 'none',
  glassesColor: 0x111111,
  chainStyle:   'none',
  chainColor:   0xF5C842,
  shoeStyle:    'low',
  shoeColor:    0xEEEEEE,
  auraColor:    0xF5C842,
  auraEffect:   'none',
  bodyWidth:    1.0,
  bodyHeight:   1.0,
};

type AnimatedAvatarKind = 'trap_a' | 'trap_b' | 'trap_c' | 'trap_d';
type AnimatedMovementState = 'idle' | 'walk_side' | 'walk_up' | 'walk_down';
type AnimatedAvatarState = AnimatedMovementState | AvatarAction;
const ACTION_PRIORITY: Record<AvatarAction, number> = { shoot: 1, hurt: 2, death: 3 };

const AVATAR_KINDS: AvatarKind[]        = ['procedural', 'gengar', 'buho', 'piplup', 'chacha', 'trap_a', 'trap_b', 'trap_c', 'trap_d'];
const ANIMATED_AVATAR_KINDS: AnimatedAvatarKind[] = ['trap_a', 'trap_b', 'trap_c', 'trap_d'];
const HAIR_STYLES: HairStyle[]          = ['SPI', 'FLA', 'MOH', 'MCH', 'X', 'CRL', 'BUN'];
const VALID_HAT_STYLES: HatStyle[]      = ['none', 'snapback', 'beanie', 'bucket', 'headband'];
const VALID_MOUTH_STYLES: MouthStyle[]  = ['neutral', 'smile', 'serious', 'grin'];
const VALID_GLASSES_STYLES: GlassesStyle[] = ['none', 'round', 'shades', 'visor'];
const VALID_CHAIN_STYLES: ChainStyle[]  = ['none', 'thin', 'chunky'];
const VALID_SHOE_STYLES: ShoeStyle[]    = ['low', 'high', 'slides'];
const VALID_AURA_EFFECTS: AuraEffect[]  = ['none', 'smoke', 'sparkle', 'cash', 'stars'];

export function normalizeAvatarConfig(config: AvatarConfig = {}): Required<AvatarConfig> {
  const next = { ...DEFAULT_AVATAR_CONFIG, ...config };
  if (!AVATAR_KINDS.includes(next.avatarKind))         next.avatarKind   = DEFAULT_AVATAR_CONFIG.avatarKind;
  if (!HAIR_STYLES.includes(next.hairStyle))           next.hairStyle    = DEFAULT_AVATAR_CONFIG.hairStyle;
  if (!VALID_HAT_STYLES.includes(next.hatStyle))       next.hatStyle     = DEFAULT_AVATAR_CONFIG.hatStyle;
  if (!VALID_MOUTH_STYLES.includes(next.mouthStyle))   next.mouthStyle   = DEFAULT_AVATAR_CONFIG.mouthStyle;
  if (!VALID_GLASSES_STYLES.includes(next.glassesStyle)) next.glassesStyle = DEFAULT_AVATAR_CONFIG.glassesStyle;
  if (!VALID_CHAIN_STYLES.includes(next.chainStyle))   next.chainStyle   = DEFAULT_AVATAR_CONFIG.chainStyle;
  if (!VALID_SHOE_STYLES.includes(next.shoeStyle))     next.shoeStyle    = DEFAULT_AVATAR_CONFIG.shoeStyle;
  if (!VALID_AURA_EFFECTS.includes(next.auraEffect))   next.auraEffect   = DEFAULT_AVATAR_CONFIG.auraEffect;

  next.bodyColor    = typeof next.bodyColor    === 'number' ? next.bodyColor    : DEFAULT_AVATAR_CONFIG.bodyColor;
  next.hairColor    = typeof next.hairColor    === 'number' ? next.hairColor    : DEFAULT_AVATAR_CONFIG.hairColor;
  next.eyeColor     = typeof next.eyeColor     === 'number' ? next.eyeColor     : DEFAULT_AVATAR_CONFIG.eyeColor;
  next.topColor     = typeof next.topColor     === 'number' ? next.topColor     : DEFAULT_AVATAR_CONFIG.topColor;
  next.bottomColor  = typeof next.bottomColor  === 'number' ? next.bottomColor  : DEFAULT_AVATAR_CONFIG.bottomColor;
  next.hatColor     = typeof next.hatColor     === 'number' ? next.hatColor     : DEFAULT_AVATAR_CONFIG.hatColor;
  next.glassesColor = typeof next.glassesColor === 'number' ? next.glassesColor : DEFAULT_AVATAR_CONFIG.glassesColor;
  next.chainColor   = typeof next.chainColor   === 'number' ? next.chainColor   : DEFAULT_AVATAR_CONFIG.chainColor;
  next.shoeColor    = typeof next.shoeColor    === 'number' ? next.shoeColor    : DEFAULT_AVATAR_CONFIG.shoeColor;
  next.auraColor    = typeof next.auraColor    === 'number' ? next.auraColor    : DEFAULT_AVATAR_CONFIG.auraColor;
  next.pp           = typeof next.pp           === 'number' ? Phaser.Math.Clamp(next.pp, 0, 10) : DEFAULT_AVATAR_CONFIG.pp;
  next.tt           = typeof next.tt           === 'number' ? Phaser.Math.Clamp(next.tt, 0, 10) : DEFAULT_AVATAR_CONFIG.tt;
  next.bodyWidth    = typeof next.bodyWidth    === 'number' ? Phaser.Math.Clamp(next.bodyWidth,  0.7, 1.4) : 1.0;
  next.bodyHeight   = typeof next.bodyHeight   === 'number' ? Phaser.Math.Clamp(next.bodyHeight, 0.7, 1.4) : 1.0;
  return next;
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

// ── helpers ───────────────────────────────────────────────────────────────────
function darkenColor(hex: number, amount: number): number {
  const r = Math.max(0, ((hex >> 16) & 0xFF) - amount);
  const g = Math.max(0, ((hex >> 8)  & 0xFF) - amount);
  const b = Math.max(0, ( hex        & 0xFF) - amount);
  return (r << 16) | (g << 8) | b;
}

// ─────────────────────────────────────────────────────────────────────────────
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
  private specialSprite?: Phaser.GameObjects.Sprite;
  private specialBaseY = 12;
  private animatedKind?: AnimatedAvatarKind;
  private lastAnimatedState?: AnimatedAvatarState;
  private activeAnimatedAction?: AvatarAction;
  private animatedActionTimer?: Phaser.Time.TimerEvent;
  private lastIsMoving = false;
  private lastDx = 0;
  private lastDy = 0;
  private lastPuffAt = 0;
  private lastAuraAt = 0;
  readonly config: Required<AvatarConfig>;

  constructor(scene: Phaser.Scene, x: number, y: number, config: AvatarConfig = {}) {
    this.config = normalizeAvatarConfig(config);
    this.container = scene.add.container(x, y);
    this.buildAvatar(scene);
  }

  private buildAvatar(scene: Phaser.Scene) {
    const shadow = scene.add.ellipse(0, 26, 26, 9, 0x000000, 0.35);
    this.container.add(shadow);

    if (isAnimatedAvatarKind(this.config.avatarKind)) {
      this.buildAnimatedAvatar(scene, this.config.avatarKind);
      return;
    }
    if (this.config.avatarKind !== 'procedural') {
      this.buildSpecialAvatar(scene, this.config.avatarKind);
      return;
    }
    this.buildProceduralAvatar(scene);
  }

  private buildProceduralAvatar(scene: Phaser.Scene) {
    const c = this.config;
    const all: Phaser.GameObjects.GameObject[] = [];

    const tt     = Phaser.Math.Clamp(c.tt ?? 2, 0, 10);
    const pp     = Phaser.Math.Clamp(c.pp ?? 2, 0, 10);
    const bodyR  = 15;
    const bodyY  = -6;
    const footY  = bodyY + bodyR + 12; // 21

    // ── Aura glow (behind everything) ────────────────────────────
    if (c.auraEffect !== 'none') {
      const glow = scene.add.graphics();
      glow.fillStyle(c.auraColor, 0.10);
      glow.fillCircle(0, 4, 42);
      all.push(glow);
    }

    // ── Feet ─────────────────────────────────────────────────────
    this.leftFoot  = scene.add.rectangle(-6, footY, 8, 8, c.bottomColor);
    this.rightFoot = scene.add.rectangle( 6, footY, 8, 8, c.bottomColor);
    all.push(this.leftFoot, this.rightFoot);

    // ── Shoes ────────────────────────────────────────────────────
    all.push(...this.buildShoes(scene, footY, c.shoeStyle, c.shoeColor));

    // ── Body blob ────────────────────────────────────────────────
    this.body = scene.add.arc(0, bodyY, bodyR, 0, 360, false, c.bodyColor);
    const shirt = scene.add.arc(0, bodyY + 2, bodyR * 0.92, 200, 340, false, c.topColor);
    shirt.setAlpha(0.9);
    all.push(this.body, shirt);

    // ── TT / PP blobs ────────────────────────────────────────────
    const ttScale = 0.3 + tt * 0.22;
    this.ttLeft  = scene.add.ellipse(-7, bodyY + 4, 10 * ttScale, 8 * ttScale, 0x000000, 0.12);
    this.ttRight = scene.add.ellipse( 7, bodyY + 4, 10 * ttScale, 8 * ttScale, 0x000000, 0.12);
    this.ttLeft.setStrokeStyle(1, 0x000000, 0.18);
    this.ttRight.setStrokeStyle(1, 0x000000, 0.18);
    const ppScale = 0.2 + pp * 0.25;
    this.ppBlob = scene.add.ellipse(0, bodyY + 16, 10 * ppScale, 7 * ppScale, 0x000000, 0.14);
    this.ppBlob.setStrokeStyle(1, 0x000000, 0.22);
    all.push(this.ttLeft, this.ttRight, this.ppBlob);

    // ── Hands ────────────────────────────────────────────────────
    const handY = bodyY + 8;
    this.leftHand  = scene.add.rectangle(-bodyR - 4, handY, 7, 7, c.bodyColor);
    this.rightHand = scene.add.rectangle( bodyR + 4, handY, 7, 7, c.bodyColor);
    all.push(this.leftHand, this.rightHand);

    // ── Chain (below neck, before mouth) ─────────────────────────
    all.push(...this.buildChain(scene, bodyY, c.chainStyle, c.chainColor));

    // ── Mouth ────────────────────────────────────────────────────
    all.push(...this.buildMouth(scene, bodyY, c.mouthStyle));

    // ── Eyes ─────────────────────────────────────────────────────
    const eyeY = bodyY - 4;
    const eyeWhiteL = scene.add.circle(-6, eyeY, 4.2, 0xFFFFFF);
    const eyeWhiteR = scene.add.circle( 6, eyeY, 4.2, 0xFFFFFF);
    const pupilL    = scene.add.circle(-6, eyeY + 1, 2.4, c.eyeColor);
    const pupilR    = scene.add.circle( 6, eyeY + 1, 2.4, c.eyeColor);
    all.push(eyeWhiteL, eyeWhiteR, pupilL, pupilR);

    // ── Hair ─────────────────────────────────────────────────────
    this.hair = scene.add.graphics();
    this.drawHairVariant(bodyR);
    all.push(this.hair);

    // ── Hat (on top of hair) ──────────────────────────────────────
    all.push(...this.buildHat(scene, bodyR, bodyY, c.hatStyle, c.hatColor));

    // ── Glasses ──────────────────────────────────────────────────
    all.push(...this.buildGlasses(scene, bodyY, c.glassesStyle, c.glassesColor));

    this.container.add(all);
    this.applyContainerScale(this.facingLeft);
  }

  // ── Shoe builder ─────────────────────────────────────────────────────────────
  private buildShoes(scene: Phaser.Scene, footY: number, style: ShoeStyle, color: number): Phaser.GameObjects.GameObject[] {
    switch (style) {
      case 'slides': {
        const l = scene.add.rectangle(-6, footY + 2, 15, 4, color);
        const r = scene.add.rectangle( 6, footY + 2, 15, 4, color);
        return [l, r];
      }
      case 'high': {
        const dark = darkenColor(color, 30);
        const l    = scene.add.rectangle(-6, footY - 1, 11, 14, color);
        const r    = scene.add.rectangle( 6, footY - 1, 11, 14, color);
        const cuffL = scene.add.rectangle(-6, footY - 6, 11, 5, dark);
        const cuffR = scene.add.rectangle( 6, footY - 6, 11, 5, dark);
        return [l, r, cuffL, cuffR];
      }
      case 'low':
      default: {
        const l = scene.add.rectangle(-6, footY + 2, 12, 7, color);
        const r = scene.add.rectangle( 6, footY + 2, 12, 7, color);
        return [l, r];
      }
    }
  }

  // ── Mouth builder ────────────────────────────────────────────────────────────
  private buildMouth(scene: Phaser.Scene, bodyY: number, style: MouthStyle): Phaser.GameObjects.GameObject[] {
    const mouthY = bodyY + 5;
    const g = scene.add.graphics();
    g.lineStyle(1.5, 0x000000, 0.65);
    switch (style) {
      case 'smile':
        g.beginPath();
        g.moveTo(-4, mouthY);
        g.lineTo(-2, mouthY + 2);
        g.lineTo( 0, mouthY + 3);
        g.lineTo( 2, mouthY + 2);
        g.lineTo( 4, mouthY);
        g.strokePath();
        break;
      case 'serious':
        g.beginPath();
        g.moveTo(-4, mouthY + 1);
        g.lineTo( 4, mouthY + 2);
        g.strokePath();
        break;
      case 'grin': {
        g.beginPath();
        g.moveTo(-5, mouthY - 1);
        g.lineTo(-2, mouthY + 2);
        g.lineTo( 0, mouthY + 3);
        g.lineTo( 2, mouthY + 2);
        g.lineTo( 5, mouthY - 1);
        g.strokePath();
        g.fillStyle(0xFFFFFF, 0.9);
        g.fillRect(-3.5, mouthY - 0.5, 2.5, 2.5);
        g.fillRect( 0.5, mouthY - 0.5, 2.5, 2.5);
        break;
      }
      case 'neutral':
      default:
        g.beginPath();
        g.moveTo(-3, mouthY + 1);
        g.lineTo( 3, mouthY + 1);
        g.strokePath();
        break;
    }
    return [g];
  }

  // ── Hat builder ──────────────────────────────────────────────────────────────
  private buildHat(scene: Phaser.Scene, bodyR: number, bodyY: number, style: HatStyle, color: number): Phaser.GameObjects.GameObject[] {
    if (style === 'none') return [];
    const topY = bodyY - bodyR; // -21
    const dark = darkenColor(color, 28);

    switch (style) {
      case 'snapback': {
        const dome = scene.add.graphics();
        dome.fillStyle(color, 1);
        dome.fillRoundedRect(-11, topY - 10, 22, 14, { tl: 6, tr: 6, bl: 0, br: 0 });
        const brim = scene.add.graphics();
        brim.fillStyle(dark, 1);
        brim.fillRect(-14, topY + 3, 28, 4);
        const btn = scene.add.circle(0, topY - 10, 2, 0xFFFFFF, 0.45);
        return [dome, brim, btn];
      }
      case 'beanie': {
        const g = scene.add.graphics();
        g.fillStyle(color, 1);
        g.fillEllipse(0, topY + 2, 28, 22);
        g.fillStyle(dark, 1);
        g.fillRect(-13, topY + 9, 26, 5);
        const pom = scene.add.circle(0, topY - 8, 4, 0xFFFFFF, 0.8);
        return [g, pom];
      }
      case 'bucket': {
        const g = scene.add.graphics();
        g.fillStyle(color, 1);
        g.fillRoundedRect(-11, topY - 8, 22, 14, 3);
        g.fillStyle(dark, 1);
        g.fillRect(-17, topY + 5, 34, 5);
        return [g];
      }
      case 'headband': {
        const g = scene.add.graphics();
        g.fillStyle(color, 1);
        g.fillRoundedRect(-13, topY + 10, 26, 5, 2);
        return [g];
      }
    }
  }

  // ── Glasses builder ──────────────────────────────────────────────────────────
  private buildGlasses(scene: Phaser.Scene, bodyY: number, style: GlassesStyle, color: number): Phaser.GameObjects.GameObject[] {
    if (style === 'none') return [];
    const eyeY = bodyY - 4;

    switch (style) {
      case 'round': {
        const g = scene.add.graphics();
        g.lineStyle(1.5, color, 1);
        g.strokeCircle(-6, eyeY, 5);
        g.strokeCircle( 6, eyeY, 5);
        g.lineStyle(1, color, 0.7);
        g.beginPath();
        g.moveTo(-1, eyeY);
        g.lineTo( 1, eyeY);
        g.strokePath();
        return [g];
      }
      case 'shades': {
        const g = scene.add.graphics();
        g.fillStyle(color, 0.88);
        g.fillRoundedRect(-13, eyeY - 3, 10, 6, 2);
        g.fillRoundedRect(  3, eyeY - 3, 10, 6, 2);
        g.lineStyle(1, 0x000000, 0.35);
        g.strokeRoundedRect(-13, eyeY - 3, 10, 6, 2);
        g.strokeRoundedRect(  3, eyeY - 3, 10, 6, 2);
        return [g];
      }
      case 'visor': {
        const g = scene.add.graphics();
        g.fillStyle(color, 0.5);
        g.fillRoundedRect(-15, eyeY - 5, 30, 9, 3);
        g.lineStyle(1.5, color, 0.9);
        g.strokeRoundedRect(-15, eyeY - 5, 30, 9, 3);
        return [g];
      }
    }
  }

  // ── Chain builder ────────────────────────────────────────────────────────────
  private buildChain(scene: Phaser.Scene, bodyY: number, style: ChainStyle, color: number): Phaser.GameObjects.GameObject[] {
    if (style === 'none') return [];
    const chainY = bodyY + 9;

    switch (style) {
      case 'thin': {
        const g = scene.add.graphics();
        g.lineStyle(1.5, color, 0.9);
        g.beginPath();
        g.moveTo(-10, chainY - 3);
        g.lineTo( -5, chainY);
        g.lineTo(  0, chainY + 1);
        g.lineTo(  5, chainY);
        g.lineTo( 10, chainY - 3);
        g.strokePath();
        return [g];
      }
      case 'chunky': {
        const g = scene.add.graphics();
        g.lineStyle(3, color, 0.95);
        g.beginPath();
        g.moveTo(-10, chainY - 2);
        g.lineTo( -5, chainY + 1);
        g.lineTo(  0, chainY + 2);
        g.lineTo(  5, chainY + 1);
        g.lineTo( 10, chainY - 2);
        g.strokePath();
        const pendant = scene.add.circle(0, chainY + 6, 3.5, color, 1);
        pendant.setStrokeStyle(1, 0x000000, 0.3);
        return [g, pendant];
      }
    }
  }

  // ── Hair variants ────────────────────────────────────────────────────────────
  private drawHairVariant(bodyR: number) {
    const c = this.config;
    if (!this.hair) return;
    this.hair.clear();
    this.hair.fillStyle(c.hairColor, 1);
    const topY = -6 - bodyR + 2;

    switch (c.hairStyle) {
      case 'FLA':
        this.hair.fillRoundedRect(-bodyR * 0.7, topY - 4, bodyR * 1.4, 10, 3);
        break;
      case 'MOH':
        this.hair.fillRoundedRect(-3, topY - 10, 6, 18, 3);
        break;
      case 'MCH':
        this.hair.fillRoundedRect(-bodyR * 0.8, topY - 2, bodyR * 0.55, 12, 2);
        this.hair.fillRoundedRect( bodyR * 0.25, topY - 2, bodyR * 0.55, 12, 2);
        this.hair.fillRoundedRect(-4, topY - 8, 8, 16, 2);
        break;
      case 'CRL':
        // Curly: bumpy dome across the top of the head
        this.hair.fillRoundedRect(-bodyR * 0.75, topY - 2, bodyR * 1.5, 8, 3);
        for (let i = 0; i < 5; i++) {
          this.hair.fillCircle(-bodyR * 0.6 + i * 6, topY - 2, 4);
        }
        break;
      case 'BUN':
        // Base hair band + bun on top
        this.hair.fillRoundedRect(-bodyR * 0.7, topY - 1, bodyR * 1.4, 7, 3);
        this.hair.fillCircle(0, topY - 7, 6);
        break;
      case 'X':
        // bald — no hair
        break;
      case 'SPI':
      default:
        this.hair.fillTriangle(-10, topY + 4, -2, topY - 10,  6, topY + 4);
        this.hair.fillTriangle( -2, topY + 4,  6, topY - 12, 14, topY + 4);
        break;
    }
  }

  // ── Aura particle ────────────────────────────────────────────────────────────
  private spawnAuraParticle() {
    const scene = this.container.scene;
    if (!scene || !this.isContainerUsable()) return;
    const effect = this.config.auraEffect;
    const color  = this.config.auraColor;
    const cx     = this.container.x + Phaser.Math.Between(-14, 14);
    const cy     = this.container.y + Phaser.Math.Between(-22, 8);

    switch (effect) {
      case 'smoke': {
        const puff = scene.add.circle(cx, cy, Phaser.Math.Between(3, 6), color, 0.55);
        puff.setDepth(this.container.depth + 5);
        scene.tweens.add({
          targets: puff,
          y: cy - 30 - Math.random() * 10,
          x: cx + (Math.random() * 10 - 5),
          alpha: { from: 0.55, to: 0 },
          scale: { from: 1, to: 2.5 },
          duration: 900,
          ease: 'Sine.easeOut',
          onComplete: () => { if (puff.active) puff.destroy(); },
        });
        break;
      }
      case 'sparkle': {
        const sp = scene.add.star(cx, cy, 4, 2, 5, color, 1);
        sp.setDepth(this.container.depth + 5);
        scene.tweens.add({
          targets: sp,
          y: cy - 22,
          alpha: { from: 1, to: 0 },
          angle: 180,
          scale: { from: 0.9, to: 0.1 },
          duration: 650,
          ease: 'Sine.easeOut',
          onComplete: () => { if (sp.active) sp.destroy(); },
        });
        break;
      }
      case 'cash': {
        const label = scene.add.text(cx, cy, '$', {
          fontSize: '9px',
          fontFamily: '"Press Start 2P", monospace',
          color: `#${color.toString(16).padStart(6, '0')}`,
        }).setDepth(this.container.depth + 5).setOrigin(0.5);
        scene.tweens.add({
          targets: label,
          y: cy - 28,
          alpha: { from: 1, to: 0 },
          duration: 900,
          ease: 'Sine.easeOut',
          onComplete: () => { if (label.active) label.destroy(); },
        });
        break;
      }
      case 'stars': {
        const palette = [0xF5C842, 0xFFFFFF, 0xFF006E, 0x46B3FF];
        const c2 = palette[Math.floor(Math.random() * palette.length)];
        const star = scene.add.star(cx, cy, 5, 3, 7, c2, 1);
        star.setDepth(this.container.depth + 5);
        scene.tweens.add({
          targets: star,
          x: cx + Phaser.Math.Between(-22, 22),
          y: cy - 26,
          alpha: { from: 1, to: 0 },
          angle: 360,
          duration: 800,
          ease: 'Sine.easeOut',
          onComplete: () => { if (star.active) star.destroy(); },
        });
        break;
      }
    }
  }

  // ── Scale helper (preserves facing direction) ─────────────────────────────────
  private applyContainerScale(flipX: boolean) {
    const bw = this.config.bodyWidth  ?? 1.0;
    const bh = this.config.bodyHeight ?? 1.0;
    this.container.setScale(flipX ? -bw : bw, bh);
  }

  // ── Animated avatar builder ───────────────────────────────────────────────────
  private buildAnimatedAvatar(scene: Phaser.Scene, kind: AnimatedAvatarKind) {
    this.animatedKind = kind;
    ensureAnimatedCharacterAnimations(scene, kind);
    const fallbackKey = ensureFallbackRectTexture(scene, `character_${kind}_fallback`, 64, 64, 0x5c4b6d);
    this.specialSprite = scene.add.sprite(0, this.specialBaseY, scene.textures.exists(getCharacterTextureKey(kind, 'idle')) ? getCharacterTextureKey(kind, 'idle') : fallbackKey, 0);
    this.specialSprite.setOrigin(0.5, 0.78);
    this.specialSprite.setScale(1.02);
    this.container.add(this.specialSprite);
    this.playAnimatedState('idle');
  }

  private buildSpecialAvatar(scene: Phaser.Scene, kind: Exclude<AvatarKind, 'procedural'>) {
    try {
      const textureKey = ensureSeedTexture(scene, kind);
      const texture = scene.textures.get(textureKey);
      const src = texture?.getSourceImage?.() as { width?: number; height?: number } | null;
      const w = src?.width ?? 0;
      const h = src?.height ?? 0;
      if (!texture || !w || !h) throw new Error(`Invalid seed texture: ${textureKey}`);
      this.specialSprite = scene.add.sprite(0, this.specialBaseY, textureKey, 0);
      this.specialSprite.setOrigin(0.5, 1);
      this.specialSprite.setScale(Math.min(54 / w, 54 / h));
      this.container.add(this.specialSprite);
    } catch (error) {
      console.error('[Waspi] Failed to build special avatar, falling back to procedural.', error);
      this.config.avatarKind = 'procedural';
      this.buildProceduralAvatar(scene);
    }
  }

  // ── Public update (called each frame) ────────────────────────────────────────
  update(isMoving: boolean, dx: number, dy = 0) {
    if (!this.isContainerUsable()) return;
    this.lastIsMoving = isMoving;
    this.lastDx = dx;
    this.lastDy = dy;

    // Direction flip (preserving body scale)
    if (dx < -0.1 && !this.facingLeft) {
      this.facingLeft = true;
      this.applyContainerScale(true);
    } else if (dx > 0.1 && this.facingLeft) {
      this.facingLeft = false;
      this.applyContainerScale(false);
    }

    // Aura particles
    if (this.config.auraEffect !== 'none') {
      const now      = Date.now();
      const interval = isMoving ? 380 : 650;
      if (now - this.lastAuraAt > interval) {
        this.lastAuraAt = now;
        this.spawnAuraParticle();
      }
    }

    if (this.hasLiveAnimatedSprite()) {
      if (!this.activeAnimatedAction) {
        let nextState: AnimatedMovementState = 'idle';
        if (isMoving) {
          if (Math.abs(dy) > Math.abs(dx) + 0.05) {
            nextState = dy < 0 ? 'walk_up' : 'walk_down';
          } else {
            nextState = 'walk_side';
          }
        }
        this.playAnimatedState(nextState);
      }
      if (!isMoving && this.config.smoke) {
        const now = Date.now();
        if (now - this.lastPuffAt > 900) { this.lastPuffAt = now; this.puffSmoke(); }
      }
      return;
    }

    // Walk / idle animation (feet + bob)
    this.walkTick += isMoving ? 0.30 : 0.08;
    const swing = isMoving ? Math.sin(this.walkTick) * 3 : Math.sin(this.walkTick) * 1.2;
    const bob   = isMoving ? Math.sin(this.walkTick * 0.5) * 1.1 : Math.sin(this.walkTick * 0.5) * 0.6;

    this.leftFoot?.setAngle( swing);
    this.rightFoot?.setAngle(-swing);
    this.leftHand?.setAngle(-swing * 0.7);
    this.rightHand?.setAngle( swing * 0.7);
    this.container.setY(this.container.y + bob * 0.2);

    const specialSprite = this.specialSprite;
    if (this.isSpriteUsable(specialSprite)) {
      safeWithLiveSprite(specialSprite, (sprite) => {
        sprite.setY(this.specialBaseY + bob);
      }, 'avatar-special-bob');
    }

    if (!isMoving && this.config.smoke) {
      const now = Date.now();
      if (now - this.lastPuffAt > 900) { this.lastPuffAt = now; this.puffSmoke(); }
    }
  }

  private puffSmoke() {
    const scene = this.container.scene;
    if (!scene || !this.isContainerUsable()) return;
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

  playShoot()  { this.playAnimatedAction('shoot', 170); }
  playHurt()   { this.playAnimatedAction('hurt',  240); }
  playDeath()  { this.playAnimatedAction('death', 620); }

  clearActionState() {
    this.activeAnimatedAction = undefined;
    this.animatedActionTimer?.remove(false);
    this.animatedActionTimer = undefined;
    this.lastAnimatedState = undefined;
    if (!this.hasLiveAnimatedSprite()) return;
    try { this.update(this.lastIsMoving, this.lastDx, this.lastDy); }
    catch (error) { console.error('[Waspi] Failed to clear avatar action state safely.', error); }
  }

  private playAnimatedAction(action: AvatarAction, durationMs: number) {
    const specialSprite = this.specialSprite;
    if (!this.animatedKind || !this.hasLiveAnimatedSprite() || !specialSprite) return;
    if (this.activeAnimatedAction) {
      const curPri  = ACTION_PRIORITY[this.activeAnimatedAction];
      const nextPri = ACTION_PRIORITY[action];
      if (curPri > nextPri) return;
      if (curPri === nextPri && this.activeAnimatedAction === action) {
        this.animatedActionTimer?.remove(false);
      }
    }
    const textureKey  = getCharacterTextureKey(this.animatedKind, action);
    const fallbackKey = `character_${this.animatedKind}_fallback`;
    safePlaySpriteAnimation(this.container.scene, specialSprite, getCharacterAnimationKey(this.animatedKind, action), textureKey, fallbackKey, false);
    this.activeAnimatedAction = action;
    this.lastAnimatedState    = action;
    this.animatedActionTimer?.remove(false);
    this.animatedActionTimer = safeSceneDelayedCall(this.container.scene, durationMs, () => {
      this.activeAnimatedAction = undefined;
      this.lastAnimatedState    = undefined;
      this.animatedActionTimer  = undefined;
      if (!this.hasLiveAnimatedSprite()) return;
      try { this.update(this.lastIsMoving, this.lastDx, this.lastDy); }
      catch (error) { console.error('[Waspi] Failed to restore avatar state after action animation.', error); }
    }, `avatar-action-reset:${action}`);
  }

  private playAnimatedState(state: AnimatedMovementState) {
    const specialSprite = this.specialSprite;
    if (!this.animatedKind || !this.hasLiveAnimatedSprite() || !specialSprite) return;
    if (this.lastAnimatedState === state) return;
    const textureKey  = getCharacterTextureKey(this.animatedKind, state);
    const fallbackKey = `character_${this.animatedKind}_fallback`;
    safePlaySpriteAnimation(this.container.scene, specialSprite, getCharacterAnimationKey(this.animatedKind, state), textureKey, fallbackKey);
    this.lastAnimatedState = state;
  }

  setPosition(x: number, y: number) {
    if (!this.isContainerUsable()) return;
    try { this.container.setPosition(x, y); }
    catch (error) { console.error('[Waspi] Failed to set avatar container position.', error); }
  }

  setDepth(d: number) {
    if (!this.isContainerUsable()) return;
    try { this.container.setDepth(d); }
    catch (error) { console.error('[Waspi] Failed to set avatar container depth.', error); }
  }

  getContainer() { return this.container; }
  get x() { return this.container.x; }
  get y() { return this.container.y; }

  destroy() {
    try { this.clearActionState(); } catch { /* scene tearing down */ }
    safeDestroyGameObject(this.specialSprite);
    if (this.isContainerUsable()) safeDestroyGameObject(this.container);
  }

  get scene(): Phaser.Scene | null  { return this.container?.scene ?? null; }
  get active(): boolean             { return this.isContainerUsable(); }

  private isContainerUsable()  { return Boolean(this.container?.scene && this.container.active); }
  private isSpriteUsable(sprite?: Phaser.GameObjects.Sprite): sprite is Phaser.GameObjects.Sprite {
    return Boolean(sprite?.scene && sprite.active);
  }
  private hasLiveAnimatedSprite() {
    return Boolean(this.animatedKind && this.isSpriteUsable(this.specialSprite) && this.isContainerUsable());
  }
}

// ── Module-level helpers (unchanged) ─────────────────────────────────────────
function ensureSeedTexture(scene: Phaser.Scene, kind: Exclude<AvatarKind, 'procedural'>) {
  const baseKey = kind === 'gengar' ? 'seed_gengar'
    : kind === 'piplup' ? 'seed_piplup'
    : kind === 'chacha' ? 'seed_chacha'
    : 'seed_buho';
  const chromaKey = `${baseKey}_avatar`;
  if (scene.textures.exists(chromaKey)) return chromaKey;
  if (scene.textures.exists(baseKey) && createChromaKeyTexture(scene, baseKey, chromaKey, 26)) return chromaKey;
  const fallbackKey = `${baseKey}_fallback`;
  if (!scene.textures.exists(fallbackKey)) createFallbackSeedTexture(scene, fallbackKey, kind);
  return fallbackKey;
}

function isAnimatedAvatarKind(kind: AvatarKind): kind is AnimatedAvatarKind {
  return ANIMATED_AVATAR_KINDS.includes(kind as AnimatedAvatarKind);
}

function getCharacterTextureKey(kind: AnimatedAvatarKind, state: AnimatedAvatarState) {
  return `character_${kind}_${state}`;
}
function getCharacterAnimationKey(kind: AnimatedAvatarKind, state: AnimatedAvatarState) {
  return `character_${kind}_${state}_anim`;
}

function ensureAnimatedCharacterAnimations(scene: Phaser.Scene, kind: AnimatedAvatarKind) {
  const states: Array<{ state: AnimatedAvatarState; frameRate: number; repeat: number }> = [
    { state: 'idle',       frameRate: 6,  repeat: -1 },
    { state: 'walk_side',  frameRate: 10, repeat: -1 },
    { state: 'walk_up',    frameRate: 10, repeat: -1 },
    { state: 'walk_down',  frameRate: 10, repeat: -1 },
    { state: 'shoot',      frameRate: 14, repeat:  0 },
    { state: 'hurt',       frameRate: 12, repeat:  0 },
    { state: 'death',      frameRate: 10, repeat:  0 },
  ];
  ensureFallbackRectTexture(scene, `character_${kind}_fallback`, 64, 64, 0x5c4b6d);
  for (const { state, frameRate, repeat } of states) {
    safeCreateSpritesheetAnimation(scene, getCharacterAnimationKey(kind, state), getCharacterTextureKey(kind, state), frameRate, repeat);
  }
}

function createChromaKeyTexture(scene: Phaser.Scene, sourceKey: string, outKey: string, tolerance: number) {
  if (typeof document === 'undefined') return false;
  const sourceTexture = scene.textures.get(sourceKey);
  const src = sourceTexture?.getSourceImage?.() as HTMLImageElement | HTMLCanvasElement | null;
  if (!src) return false;
  const w = (src as { width?: number }).width ?? 0;
  const h = (src as { height?: number }).height ?? 0;
  if (!w || !h) return false;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  try { ctx.drawImage(src, 0, 0); } catch (error) { console.error(`[Waspi] Failed to draw seed texture ${sourceKey}`, error); return false; }
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]; const g = d[i + 1]; const b = d[i + 2];
    const isGreen = g > 140 && (g - r) > (110 - tolerance) && (g - b) > (110 - tolerance) && r < 140 && b < 140;
    if (isGreen) d[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  const texture = scene.textures.addCanvas(outKey, canvas);
  if (!texture) return false;
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return true;
}

function createFallbackSeedTexture(scene: Phaser.Scene, key: string, kind: Exclude<AvatarKind, 'procedural'>) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 64, 64);

  if (kind === 'gengar') {
    ctx.fillStyle = '#5f2aa6';
    ctx.beginPath(); ctx.moveTo(15, 46); ctx.lineTo(10, 24); ctx.lineTo(18, 12); ctx.lineTo(24, 18);
    ctx.lineTo(30, 10); ctx.lineTo(36, 18); ctx.lineTo(44, 12); ctx.lineTo(52, 24); ctx.lineTo(49, 46);
    ctx.quadraticCurveTo(32, 58, 15, 46); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(18, 27, 10, 8); ctx.fillRect(36, 27, 10, 8);
    ctx.fillStyle = '#ff3355'; ctx.fillRect(21, 29, 4, 4); ctx.fillRect(39, 29, 4, 4);
    ctx.fillStyle = '#1a102c'; ctx.fillRect(23, 40, 18, 4);
  } else if (kind === 'piplup') {
    ctx.fillStyle = '#4b8fe2';
    ctx.beginPath(); ctx.arc(32, 34, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8f1ff';
    ctx.beginPath(); ctx.ellipse(32, 38, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#163b72';
    ctx.beginPath(); ctx.moveTo(18, 26); ctx.lineTo(22, 13); ctx.lineTo(29, 24); ctx.fill();
    ctx.beginPath(); ctx.moveTo(46, 26); ctx.lineTo(42, 13); ctx.lineTo(35, 24); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(25, 33, 5, 0, Math.PI * 2); ctx.arc(39, 33, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath(); ctx.arc(25, 33, 2, 0, Math.PI * 2); ctx.arc(39, 33, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7d23a';
    ctx.beginPath(); ctx.moveTo(32, 37); ctx.lineTo(26, 42); ctx.lineTo(38, 42); ctx.closePath(); ctx.fill();
  } else if (kind === 'chacha') {
    ctx.fillStyle = '#ffd35c';
    ctx.beginPath(); ctx.arc(32, 35, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2b93d';
    ctx.beginPath(); ctx.ellipse(32, 42, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8c5a12';
    ctx.beginPath(); ctx.moveTo(19, 22); ctx.lineTo(26, 12); ctx.lineTo(31, 23); ctx.fill();
    ctx.beginPath(); ctx.moveTo(45, 22); ctx.lineTo(38, 12); ctx.lineTo(33, 23); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(25, 33, 5, 0, Math.PI * 2); ctx.arc(39, 33, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath(); ctx.arc(25, 33, 2, 0, Math.PI * 2); ctx.arc(39, 33, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f08a24';
    ctx.beginPath(); ctx.moveTo(32, 38); ctx.lineTo(26, 43); ctx.lineTo(38, 43); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#6b4c2e';
    ctx.beginPath(); ctx.arc(32, 34, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8c6239';
    ctx.beginPath(); ctx.moveTo(16, 26); ctx.lineTo(20, 12); ctx.lineTo(30, 24); ctx.fill();
    ctx.beginPath(); ctx.moveTo(48, 26); ctx.lineTo(44, 12); ctx.lineTo(34, 24); ctx.fill();
    ctx.fillStyle = '#f5c842';
    ctx.beginPath(); ctx.arc(24, 32, 7, 0, Math.PI * 2); ctx.arc(40, 32, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath(); ctx.arc(24, 32, 2, 0, Math.PI * 2); ctx.arc(40, 32, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d48018';
    ctx.beginPath(); ctx.moveTo(32, 36); ctx.lineTo(27, 42); ctx.lineTo(37, 42); ctx.closePath(); ctx.fill();
  }

  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) return;
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
