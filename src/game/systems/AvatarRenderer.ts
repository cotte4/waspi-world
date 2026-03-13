import Phaser from 'phaser';
import { COLORS } from '../config/constants';

export interface AvatarConfig {
  bodyColor?: number;
  hairColor?: number;
  eyeColor?: number;
  topColor?: number;
  bottomColor?: number;
}

const DEFAULT_CONFIG: Required<AvatarConfig> = {
  bodyColor: COLORS.SKIN_LIGHT,
  hairColor: COLORS.HAIR_BROWN,
  eyeColor: 0x2244CC,
  topColor: COLORS.BODY_BLUE,
  bottomColor: COLORS.LEGS_DARK,
};

export class AvatarRenderer {
  private container: Phaser.GameObjects.Container;
  private facingLeft = false;
  private walkTick = 0;
  private leftArm!: Phaser.GameObjects.Rectangle;
  private rightArm!: Phaser.GameObjects.Rectangle;
  private leftLeg!: Phaser.GameObjects.Rectangle;
  private rightLeg!: Phaser.GameObjects.Rectangle;
  readonly config: Required<AvatarConfig>;

  constructor(scene: Phaser.Scene, x: number, y: number, config: AvatarConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.container = scene.add.container(x, y);
    this.buildAvatar(scene);
  }

  private buildAvatar(scene: Phaser.Scene) {
    const c = this.config;

    // Shadow
    const shadow = scene.add.ellipse(0, 28, 22, 7, 0x000000, 0.45);

    // Legs (split into left/right for walk animation)
    this.leftLeg = scene.add.rectangle(-4, 18, 8, 14, c.bottomColor);
    this.rightLeg = scene.add.rectangle(4, 18, 8, 14, c.bottomColor);

    // Body / shirt
    const body = scene.add.rectangle(0, 3, 20, 18, c.topColor);

    // Collar / neck
    const neck = scene.add.rectangle(0, -6, 7, 5, c.bodyColor);

    // Arms (left and right)
    this.leftArm = scene.add.rectangle(-12, 4, 7, 14, c.topColor);
    this.rightArm = scene.add.rectangle(12, 4, 7, 14, c.topColor);

    // Head
    const head = scene.add.arc(0, -18, 13, 0, 360, false, c.bodyColor);

    // Hair top (dome)
    const hairTop = scene.add.arc(0, -24, 13, 180, 360, false, c.hairColor);
    // Hair sides
    const hairL = scene.add.rectangle(-12, -20, 5, 10, c.hairColor);
    const hairR = scene.add.rectangle(12, -20, 5, 10, c.hairColor);
    // Hair back
    const hairBack = scene.add.rectangle(0, -30, 22, 8, c.hairColor);

    // Eye whites
    const eyeWhiteL = scene.add.arc(-5, -20, 4.5, 0, 360, false, 0xFFFFFF);
    const eyeWhiteR = scene.add.arc(5, -20, 4.5, 0, 360, false, 0xFFFFFF);

    // Pupils
    const pupilL = scene.add.arc(-5, -19, 2.8, 0, 360, false, c.eyeColor);
    const pupilR = scene.add.arc(5, -19, 2.8, 0, 360, false, c.eyeColor);

    // Eye shine
    const shineL = scene.add.arc(-3.5, -20.5, 1.2, 0, 360, false, 0xFFFFFF);
    const shineR = scene.add.arc(6.5, -20.5, 1.2, 0, 360, false, 0xFFFFFF);

    // Blush
    const blushL = scene.add.arc(-8, -16, 3, 0, 360, false, 0xFF9999, 0.35);
    const blushR = scene.add.arc(8, -16, 3, 0, 360, false, 0xFF9999, 0.35);

    this.container.add([
      shadow,
      this.leftLeg, this.rightLeg,
      this.leftArm, this.rightArm,
      body, neck,
      head,
      hairBack, hairTop, hairL, hairR,
      eyeWhiteL, eyeWhiteR,
      pupilL, pupilR,
      shineL, shineR,
      blushL, blushR,
    ]);
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

    // Walk animation (simple leg/arm bob)
    if (isMoving) {
      this.walkTick += 0.25;
      const swing = Math.sin(this.walkTick) * 5;
      this.leftLeg.setAngle(swing);
      this.rightLeg.setAngle(-swing);
      this.leftArm.setAngle(-swing * 0.6);
      this.rightArm.setAngle(swing * 0.6);
    } else {
      this.walkTick = 0;
      this.leftLeg.setAngle(0);
      this.rightLeg.setAngle(0);
      this.leftArm.setAngle(0);
      this.rightArm.setAngle(0);
    }
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
