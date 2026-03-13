import Phaser from 'phaser';
import { AvatarRenderer } from '../systems/AvatarRenderer';
import { COLORS, WORLD } from '../config/constants';

export class ArcadeInterior extends Phaser.Scene {
  private player!: AvatarRenderer;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private inTransition = false;

  constructor() {
    super({ key: 'ArcadeInterior' });
  }

  create() {
    const { width, height } = this.scale;

    // Dark neon room
    const g = this.add.graphics();
    g.fillStyle(0x08081A);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    const roomW = 640;
    const roomH = 380;
    const roomX = (width - roomW) / 2;
    const roomY = (height - roomH) / 2;

    g.fillStyle(0x10102A);
    g.fillRect(roomX, roomY, roomW, roomH);
    g.lineStyle(3, COLORS.NEON_PINK, 0.6);
    g.strokeRect(roomX, roomY, roomW, roomH);

    // Simple arcade machines
    const machinePositions = [roomX + 80, roomX + 200, roomX + 320, roomX + 440, roomX + 560];
    machinePositions.forEach(mx => {
      g.fillStyle(0x080820);
      g.fillRect(mx - 20, roomY + 70, 40, 90);
      g.fillStyle(0x111144);
      g.fillRect(mx - 18, roomY + 74, 36, 32);
      g.fillStyle(COLORS.NEON_BLUE, 0.6);
      g.fillRect(mx - 16, roomY + 78, 32, 24);
    });

    // Floor glow
    const floor = this.add.rectangle(width / 2, roomY + roomH - 60, roomW - 60, 80, 0x090912, 0.95);
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
    this.add.text(width / 2, roomY + 24, 'ARCADE', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF006E',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + 52, 'MINIJUEGOS COMING SOON', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    // Exit hint
    this.add.text(width / 2, roomY + roomH + 24, 'SPACE PARA VOLVER A LA CALLE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
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
        this.scene.start('PenaltyMinigame');
      });
    }
  }
}

