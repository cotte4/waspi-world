import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { WORLD } from '../config/constants';
import { announceScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';

export class HouseInterior extends Phaser.Scene {
  private player!: AvatarRenderer;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private inTransition = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private px = 0;
  private py = 0;
  private mirrorRect!: Phaser.Geom.Rectangle;
  private wardrobeRect!: Phaser.Geom.Rectangle;

  constructor() {
    super({ key: 'HouseInterior' });
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);

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
    this.wardrobeRect = new Phaser.Geom.Rectangle(roomX + roomW - 120, roomY + 70, 80, 140);

    // Mirror (character creator in el futuro)
    const mirrorX = roomX + roomW / 2 - 40;
    const mirrorY = roomY + 60;
    g.fillStyle(0x222244);
    g.fillRect(mirrorX, mirrorY, 80, 120);
    g.fillStyle(0x88AAFF, 0.4);
    g.fillRect(mirrorX + 4, mirrorY + 4, 72, 112);
    this.mirrorRect = new Phaser.Geom.Rectangle(mirrorX, mirrorY, 80, 120);

    // Floor soft light
    const floor = this.add.rectangle(width / 2, roomY + roomH - 50, roomW - 80, 80, 0x101018, 0.95);
    floor.setStrokeStyle(2, 0x000000, 0.7);

    // Player avatar
    this.px = width / 2;
    this.py = roomY + roomH - 80;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(10);

    // Title / labels
    this.add.text(width / 2, roomY + 24, 'TU CASA', {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#CCCCFF',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + 52, 'ESPEJO = CREATOR · ARMARIO = INVENTARIO', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + roomH + 24, 'WASD MOVER · SPACE INTERACTUAR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#777777',
    }).setOrigin(0.5);

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update() {
    if (this.inTransition) return;
    this.handleMovement();
    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.handleInteraction();
    }
  }

  private handleMovement() {
    const speed = 180 / 60;
    let dx = 0;
    let dy = 0;

    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const up = this.cursors.up.isDown || this.keyW.isDown;
    const down = this.cursors.down.isDown || this.keyS.isDown;

    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;

    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

    const { width, height } = this.scale;
    const roomW = 560;
    const roomH = 340;
    const roomX = (width - roomW) / 2 + 20;
    const roomY = (height - roomH) / 2 + 20;

    this.px = Phaser.Math.Clamp(this.px + dx * speed * 16.6, roomX, roomX + roomW - 40);
    this.py = Phaser.Math.Clamp(this.py + dy * speed * 16.6, roomY + 40, roomY + roomH - 10);

    this.player.update(dx !== 0 || dy !== 0, dx);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
  }

  private handleInteraction() {
    const { height } = this.scale;
    const roomH = 340;
    const roomY = (height - roomH) / 2;

    // Door area: borde inferior de la habitación
    const nearDoor = this.py > roomY + roomH - 30;

    const point = new Phaser.Geom.Point(this.px, this.py);
    const nearMirror = Phaser.Geom.Rectangle.ContainsPoint(this.mirrorRect, point);
    const nearWardrobe = Phaser.Geom.Rectangle.ContainsPoint(this.wardrobeRect, point);

    if (nearMirror) {
      eventBus.emit(EVENTS.OPEN_CREATOR);
      return;
    }

    if (nearWardrobe) {
      eventBus.emit(EVENTS.INVENTORY_TOGGLE);
      return;
    }

    if (nearDoor) {
      this.inTransition = true;
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('WorldScene');
      });
    }
  }
}
