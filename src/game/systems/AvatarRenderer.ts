import Phaser from 'phaser';
import { COLORS } from '../config/constants';

export type HairStyle = 'SPI' | 'FLA' | 'MOH' | 'X';

export interface AvatarConfig {
  bodyColor?: number;
  hairColor?: number;
  eyeColor?: number;
  topColor?: number;
  bottomColor?: number;
  hairStyle?: HairStyle;
  pp?: number; // 0..10 lower-body proportion (fun label)
  tt?: number; // 0..10 upper-body proportion (fun label)
  smoke?: boolean;
}

const DEFAULT_CONFIG: Required<AvatarConfig> = {
  bodyColor: COLORS.SKIN_LIGHT,
  hairColor: COLORS.HAIR_BROWN,
  eyeColor: 0x2244CC,
  topColor: COLORS.BODY_BLUE,
  bottomColor: COLORS.LEGS_DARK,
  hairStyle: 'SPI',
  pp: 2,
  tt: 2,
  smoke: false,
};

export class AvatarRenderer {
  private container: Phaser.GameObjects.Container;
  private facingLeft = false;
  private walkTick = 0;
  private body!: Phaser.GameObjects.Arc;
  private ppBlob!: Phaser.GameObjects.Ellipse;
  private ttLeft!: Phaser.GameObjects.Ellipse;
  private ttRight!: Phaser.GameObjects.Ellipse;
  private leftFoot!: Phaser.GameObjects.Rectangle;
  private rightFoot!: Phaser.GameObjects.Rectangle;
  private leftHand!: Phaser.GameObjects.Rectangle;
  private rightHand!: Phaser.GameObjects.Rectangle;
  private hair!: Phaser.GameObjects.Graphics;
  private lastPuffAt = 0;
  readonly config: Required<AvatarConfig>;

  constructor(scene: Phaser.Scene, x: number, y: number, config: AvatarConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.container = scene.add.container(x, y);
    this.buildAvatar(scene);
  }

  private buildAvatar(scene: Phaser.Scene) {
    const c = this.config;

    // Shadow
    const shadow = scene.add.ellipse(0, 26, 26, 9, 0x000000, 0.35);

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
      shadow,
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

  private drawHairVariant(bodyR: number) {
    const c = this.config;
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

    // Walk animation (simple feet/hand bob)
    if (isMoving) {
      this.walkTick += 0.25;
      const swing = Math.sin(this.walkTick) * 2.5;
      this.leftFoot.setAngle(swing);
      this.rightFoot.setAngle(-swing);
      this.leftHand.setAngle(-swing);
      this.rightHand.setAngle(swing);
    } else {
      this.walkTick = 0;
      this.leftFoot.setAngle(0);
      this.rightFoot.setAngle(0);
      this.leftHand.setAngle(0);
      this.rightHand.setAngle(0);

      // Smoking idle puffs
      if (this.config.smoke) {
        const now = Date.now();
        if (now - this.lastPuffAt > 900) {
          this.lastPuffAt = now;
          this.puffSmoke();
        }
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
