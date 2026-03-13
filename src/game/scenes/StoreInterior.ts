import Phaser from 'phaser';
import { AvatarRenderer } from '../systems/AvatarRenderer';
import { COLORS, WORLD } from '../config/constants';

export class StoreInterior extends Phaser.Scene {
  private player!: AvatarRenderer;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private inTransition = false;

  constructor() {
    super({ key: 'StoreInterior' });
  }

  create() {
    const { width, height } = this.scale;

    // Background room
    const g = this.add.graphics();
    g.fillStyle(0x0C0C16);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    // Room bounds
    const roomW = 640;
    const roomH = 400;
    const roomX = (width - roomW) / 2;
    const roomY = (height - roomH) / 2;

    g.fillStyle(0x141426);
    g.fillRect(roomX, roomY, roomW, roomH);
    g.lineStyle(3, COLORS.GOLD, 0.6);
    g.strokeRect(roomX, roomY, roomW, roomH);

    // Simple racks / estanterías
    g.fillStyle(0x151520);
    g.fillRect(roomX + 40, roomY + 70, 120, 40);
    g.fillRect(roomX + roomW - 160, roomY + 70, 120, 40);
    g.fillRect(roomX + 40, roomY + 150, 120, 40);
    g.fillRect(roomX + roomW - 160, roomY + 150, 120, 40);

    // Light gradient on floor
    const floor = this.add.rectangle(width / 2, roomY + roomH - 60, roomW - 40, 90, 0x111018, 0.9);
    floor.setStrokeStyle(2, 0x000000, 0.6);

    // Player avatar in the middle-bottom of the room
    this.player = new AvatarRenderer(this, width / 2, roomY + roomH - 80, {
      bodyColor: COLORS.SKIN_LIGHT,
      hairColor: COLORS.HAIR_BROWN,
      topColor: COLORS.BODY_BLUE,
      bottomColor: COLORS.LEGS_DARK,
    });
    this.player.setDepth(10);

    // Title / label
    this.add.text(width / 2, roomY + 24, 'WASPI STORE', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + 52, 'SHOP COMING SOON', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#888888',
    }).setOrigin(0.5);

    // Exit hint
    this.add.text(width / 2, roomY + roomH + 24, 'SPACE PARA SALIR A LA CALLE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(0.5);

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Fade in
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

