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

    // Shadow (más ancha y difusa)
    const shadow = scene.add.ellipse(0, 30, 26, 9, 0x000000, 0.5);

    // Piernas — cuerpo más pequeño, cabeza más grande (proporción chibi)
    this.leftLeg = scene.add.rectangle(-4, 19, 7, 13, c.bottomColor);
    this.rightLeg = scene.add.rectangle(4, 19, 7, 13, c.bottomColor);

    // Cuerpo / remera (más corto)
    const body = scene.add.rectangle(0, 5, 18, 15, c.topColor);

    // Cuello
    const neck = scene.add.rectangle(0, -4, 7, 4, c.bodyColor);

    // Brazos
    this.leftArm = scene.add.rectangle(-11, 5, 6, 13, c.topColor);
    this.rightArm = scene.add.rectangle(11, 5, 6, 13, c.topColor);

    // Cabeza más grande
    const head = scene.add.arc(0, -18, 15, 0, 360, false, c.bodyColor);

    // Contorno oscuro tipo “stroke” alrededor de la cabeza/cuerpo
    const headOutline = scene.add.arc(0, -18, 16, 0, 360, true, 0x000000);
    headOutline.setAlpha(0.7);

    // Pelo top (dome)
    const hairTop = scene.add.arc(0, -25, 15, 180, 360, false, c.hairColor);
    const hairL = scene.add.rectangle(-13, -20, 5, 11, c.hairColor);
    const hairR = scene.add.rectangle(13, -20, 5, 11, c.hairColor);
    const hairBack = scene.add.rectangle(0, -30, 24, 8, c.hairColor);

    // Ojos: un toque más separados y “tristes”
    const eyeWhiteL = scene.add.arc(-6, -20, 4.8, 0, 360, false, 0xFFFFFF);
    const eyeWhiteR = scene.add.arc(6, -20, 4.8, 0, 360, false, 0xFFFFFF);
    const pupilL = scene.add.arc(-6, -19, 2.6, 0, 360, false, c.eyeColor);
    const pupilR = scene.add.arc(6, -19, 2.6, 0, 360, false, c.eyeColor);

    // Pequeña caída en los ojos (parpado) para el mood
    const eyelidL = scene.add.rectangle(-6, -21.5, 6, 2, 0xE0B090);
    const eyelidR = scene.add.rectangle(6, -21.5, 6, 2, 0xE0B090);

    // Eye shine
    const shineL = scene.add.arc(-4.2, -20.8, 1.1, 0, 360, false, 0xFFFFFF);
    const shineR = scene.add.arc(7.0, -20.8, 1.1, 0, 360, false, 0xFFFFFF);

    // Blush más sutil
    const blushL = scene.add.arc(-9, -15.5, 3, 0, 360, false, 0xFF9999, 0.28);
    const blushR = scene.add.arc(9, -15.5, 3, 0, 360, false, 0xFF9999, 0.28);

    // Contorno inferior del cuerpo
    const bodyOutline = scene.add.rectangle(0, 5, 19, 16);
    bodyOutline.setStrokeStyle(2, 0x000000, 0.8);
    bodyOutline.setFillStyle(0x000000, 0); // solo borde

    this.container.add([
      shadow,
      headOutline,
      bodyOutline,
      this.leftLeg, this.rightLeg,
      this.leftArm, this.rightArm,
      body, neck,
      head,
      hairBack, hairTop, hairL, hairR,
      eyeWhiteL, eyeWhiteR,
      pupilL, pupilR,
      eyelidL, eyelidR,
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
