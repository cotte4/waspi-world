import Phaser from 'phaser';
import { AvatarRenderer } from '../systems/AvatarRenderer';
import { COLORS, WORLD } from '../config/constants';
import { CATALOG } from '../config/catalog';
import { spendTenks } from '../systems/TenksSystem';
import { ownItem, equipItem } from '../systems/InventorySystem';

export class StoreInterior extends Phaser.Scene {
  private player!: AvatarRenderer;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private inTransition = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private px = 0;
  private py = 0;

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
    this.px = width / 2;
    this.py = roomY + roomH - 80;
    this.player = new AvatarRenderer(this, this.px, this.py, {
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

    this.add.text(width / 2, roomY + 52, 'COTTE SHOP — CLICK PARA COMPRAR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#888888',
    }).setOrigin(0.5);

    // Simple shop list (click to buy + auto-equip)
    const listX = roomX + 210;
    let listY = roomY + 90;
    // Put utilities first, then clothing
    const items = [...CATALOG].sort((a, b) => (a.slot === 'utility' ? -1 : 1) - (b.slot === 'utility' ? -1 : 1));
    items.forEach((item) => {
      const row = this.add.rectangle(listX, listY, 360, 26, 0x0B0B12, 1)
        .setStrokeStyle(1, 0x333333, 1)
        .setInteractive({ useHandCursor: true });
      const swatch = this.add.rectangle(listX - 165, listY, 18, 18, (item.color ?? 0x111111), 1)
        .setStrokeStyle(1, 0x000000, 0.35);
      const label = this.add.text(listX - 140, listY, `${item.name}`, {
        fontSize: '8px',
        fontFamily: '"Silkscreen", monospace',
        color: '#FFFFFF',
      }).setOrigin(0, 0.5);
      const price = this.add.text(listX + 165, listY, `${item.priceTenks}`, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#F5C842',
      }).setOrigin(1, 0.5);

      row.on('pointerdown', () => {
        const ok = spendTenks(item.priceTenks, 'shop_buy');
        if (!ok) {
          this.flashMessage(width / 2, roomY + roomH - 30, 'NO TENKS', '#FF4444');
          return;
        }
        ownItem(item.id);
        // auto-equip for clothing; utilities are toggled in inventory
        if (item.slot !== 'utility') equipItem(item.id);
        this.flashMessage(width / 2, roomY + roomH - 30, 'COMPRADO!', '#39FF14');
      });

      listY += 30;
    });

    // Exit hint
    this.add.text(width / 2, roomY + roomH + 24, 'ESC PARA SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(0.5);

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    // Fade in
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private flashMessage(x: number, y: number, msg: string, color: string) {
    const t = this.add.text(x, y, msg, {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9999);
    this.tweens.add({
      targets: t,
      alpha: { from: 1, to: 0 },
      y: y - 10,
      duration: 700,
      ease: 'Sine.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  update() {
    if (this.inTransition) return;
    this.handleMovement();

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.inTransition = true;
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('WorldScene');
      });
    }
  }

  private handleMovement() {
    const speed = 180 / 60; // px per frame approx
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
    const roomW = 640;
    const roomH = 400;
    const roomX = (width - roomW) / 2 + 20;
    const roomY = (height - roomH) / 2 + 20;

    this.px = Phaser.Math.Clamp(this.px + dx * speed * 16.6, roomX, roomX + roomW - 40);
    this.py = Phaser.Math.Clamp(this.py + dy * speed * 16.6, roomY + 40, roomY + roomH - 10);

    this.player.update(dx !== 0 || dy !== 0, dx);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
  }
}

