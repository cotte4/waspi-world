import Phaser from 'phaser';
import { AvatarRenderer } from '../systems/AvatarRenderer';
import { COLORS, WORLD } from '../config/constants';

export class HouseInterior extends Phaser.Scene {
  private player!: AvatarRenderer;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private inTransition = false;

  constructor() {
    super({ key: 'HouseInterior' });
  }

  create() {
    const { width, height } = this.scale;

    const g = this.add.graphics();
    g.fillStyle(0x0B0B14);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    const roomW = 560;
    const roomH = 340;
    const roomX = (width - roomW) / 2;
    const roomY = (height - roomH) / 2;

    g.fillStyle(0x171724);
    g.fillRect(roomX, roomY, roomW, roomH);
    g.lineStyle(3, 0x333344, 0.7);
    g.strokeRect(roomX, roomY, roomW, roomH);

    // Simple bed
    g.fillStyle(0x222233);
    g.fillRect(roomX + 40, roomY + 70, 140, 60);
    g.fillStyle(0x444477);
    g.fillRect(roomX + 40, roomY + 70, 140, 26);

    // Simple wardrobe
    g.fillStyle(0x2A1A10);
    g.fillRect(roomX + roomW - 120, roomY + 70, 80, 140);

    // Mirror (character creator in el futuro)
    g.fillStyle(0x222244);
    g.fillRect(roomX + roomW / 2 - 40, roomY + 60, 80, 120);
    g.fillStyle(0x88AAFF, 0.4);
    g.fillRect(roomX + roomW / 2 - 36, roomY + 64, 72, 112);

    // Floor soft light
    const floor = this.add.rectangle(width / 2, roomY + roomH - 50, roomW - 80, 80, 0x101018, 0.95);
    floor.setStrokeStyle(2, 0x000000, 0.7);

    // Player avatar
    this.player = new AvatarRenderer(this, width / 2, roomY + roomH - 80, {
      bodyColor: COLORS.SKIN_LIGHT,
      hairColor: COLORS.HAIR_BROWN,
      topColor: COLORS.BODY_BLUE,
      bottomColor: COLORS.LEGS_DARK,
    });
    this.player.setDepth(10);

    // Title / labels
    this.add.text(width / 2, roomY + 24, 'TU CASA', {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#CCCCFF',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + 52, 'CUSTOMIZACIÓN COMING SOON', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + roomH + 24, 'SPACE PARA SALIR AL MUNDO', {
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

