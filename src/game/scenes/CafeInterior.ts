import Phaser from 'phaser';
import { AvatarRenderer } from '../systems/AvatarRenderer';
import { COLORS, WORLD } from '../config/constants';

export class CafeInterior extends Phaser.Scene {
  private player!: AvatarRenderer;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private inTransition = false;

  constructor() {
    super({ key: 'CafeInterior' });
  }

  create() {
    const { width, height } = this.scale;

    const g = this.add.graphics();
    g.fillStyle(0x140608);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    const roomW = 640;
    const roomH = 360;
    const roomX = (width - roomW) / 2;
    const roomY = (height - roomH) / 2;

    g.fillStyle(0x1C0E10);
    g.fillRect(roomX, roomY, roomW, roomH);
    g.lineStyle(3, COLORS.NEON_ORANGE, 0.55);
    g.strokeRect(roomX, roomY, roomW, roomH);

    // Simple bar counter
    g.fillStyle(0x2A1510);
    g.fillRect(roomX + 60, roomY + 90, roomW - 120, 40);

    // Tables
    const tableCenters = [
      { x: roomX + 160, y: roomY + 210 },
      { x: roomX + 320, y: roomY + 240 },
      { x: roomX + 480, y: roomY + 210 },
    ];
    tableCenters.forEach(({ x, y }) => {
      g.fillStyle(0x1F1410);
      g.fillCircle(x, y, 20);
    });

    // Floor warm glow
    const floor = this.add.rectangle(width / 2, roomY + roomH - 60, roomW - 80, 80, 0x1A0C08, 0.95);
    floor.setStrokeStyle(2, 0x000000, 0.7);

    // Player avatar
    this.player = new AvatarRenderer(this, width / 2, roomY + roomH - 80, {
      bodyColor: COLORS.SKIN_LIGHT,
      hairColor: COLORS.HAIR_BROWN,
      topColor: COLORS.BODY_BLUE,
      bottomColor: COLORS.LEGS_DARK,
    });
    this.player.setDepth(10);

    // Title
    this.add.text(width / 2, roomY + 24, 'CAFÉ', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6B00',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + 52, 'ESPAClO SOCIAL COMING SOON', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#BBBBBB',
    }).setOrigin(0.5);

    // Exit hint
    this.add.text(width / 2, roomY + roomH + 24, 'SPACE PARA SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#777777',
    }).setOrigin(0.5);

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update() {
    if (this.inTransition) return;
    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.inTransition = true;
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('WorldScene');
      });
    }
  }
}

