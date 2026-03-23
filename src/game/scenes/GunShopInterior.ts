import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { SAFE_PLAZA_RETURN, WORLD_EXITS } from '../config/constants';
import { announceScene, bindSafeResetToPlaza, createBackButton, showSceneTitle, transitionToWorldScene } from '../systems/SceneUi';
import { InteriorRoom } from '../systems/InteriorRoom';
import { SceneControls } from '../systems/SceneControls';
import { eventBus, EVENTS } from '../config/eventBus';
import { worldExitFromSceneData } from '../systems/worldReturnSpawn';

export class GunShopInterior extends Phaser.Scene {
  private static readonly RETURN_X = WORLD_EXITS.GUN_SHOP.x;
  private static readonly RETURN_Y = WORLD_EXITS.GUN_SHOP.y;

  private player!: AvatarRenderer;
  private controls!: SceneControls;
  private inTransition = false;
  private shopOverlayOpen = false;
  private px = 0;
  private py = 0;
  private roomX = 0;
  private roomY = 0;
  private roomW = 640;
  private roomH = 390;
  private dealerX = 0;
  private dealerY = 0;
  private dealerPrompt?: Phaser.GameObjects.Text;
  private room?: InteriorRoom;
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastIsMoving = false;
  private worldExitX!: number;
  private worldExitY!: number;
  private offGunShopClose?: () => void;

  constructor() {
    super({ key: 'GunShopInterior' });
  }

  init(data: Record<string, unknown> = {}) {
    this.inTransition = false;
    this.shopOverlayOpen = false;
    const w = worldExitFromSceneData(data, GunShopInterior.RETURN_X, GunShopInterior.RETURN_Y);
    this.worldExitX = w.x;
    this.worldExitY = w.y;
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);
    showSceneTitle(this, 'GUN SHOP', 0x46B3FF);
    this.input.enabled = true;
    this.controls = new SceneControls(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.inTransition = false;
      this.shopOverlayOpen = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });
    bindSafeResetToPlaza(this, () => {
      transitionToWorldScene(this, SAFE_PLAZA_RETURN.X, SAFE_PLAZA_RETURN.Y);
    });

    this.roomW = 640;
    this.roomH = 390;
    this.roomX = (width - this.roomW) / 2;
    this.roomY = (height - this.roomH) / 2;

    this.drawRoom();
    this.spawnDealer();
    this.spawnPlayer();
    this.room = new InteriorRoom(this, {
      roomKey: 'waspi-room-gunshop',
      getPosition: () => ({ x: this.px, y: this.py }),
      getMovement: () => ({ dx: this.lastMoveDx, dy: this.lastMoveDy, isMoving: this.lastIsMoving }),
      getAvatarConfig: () => loadStoredAvatarConfig(),
      onRemoteClick: (playerId, username) => {
        eventBus.emit(EVENTS.PLAYER_ACTIONS_OPEN, { playerId, username });
      },
      localColor: '#7CC7FF',
      remoteColor: '#A5BCFF',
    });
    this.room.start();

    this.add.text(width / 2, this.roomY + this.roomH + 18, 'SPACE HABLAR  •  BACK SALIR', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#445577',
    }).setOrigin(0.5);

    createBackButton(this, () => {
      if (this.shopOverlayOpen) {
        this.closeShopOverlay();
        return;
      }
      this.exitToWorld();
    });

    this.offGunShopClose = eventBus.on(EVENTS.GUN_SHOP_CLOSE, () => {
      this.shopOverlayOpen = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });

    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    if (this.inTransition) return;
    this.room?.update();

    if (this.shopOverlayOpen) {
      this.lastMoveDx = 0;
      this.lastMoveDy = 0;
      this.lastIsMoving = false;
      if (this.controls.isActionJustDown('back')) {
        this.closeShopOverlay();
      }
      return;
    }

    this.handleMovement(delta);
    const nearDealer = this.isNearDealer();
    this.dealerPrompt?.setVisible(nearDealer);

    if (this.controls.isActionJustDown('back')) {
      this.exitToWorld();
      return;
    }
    if (nearDealer && this.controls.isActionJustDown('interact')) {
      this.openShopOverlay();
    }
  }

  private drawRoom() {
    const { width, height } = this.scale;
    const g = this.add.graphics().setDepth(0);

    g.fillStyle(0x070b16);
    g.fillRect(0, 0, width, height);

    g.fillStyle(0x16305a, 0.2);
    g.fillCircle(this.roomX + 120, this.roomY + 40, 120);
    g.fillStyle(0x0f1f3d, 0.16);
    g.fillCircle(this.roomX + this.roomW - 120, this.roomY + 48, 130);

    g.fillStyle(0x0e1324);
    g.fillRoundedRect(this.roomX, this.roomY, this.roomW, this.roomH, 14);
    g.lineStyle(2, 0x46B3FF, 0.8);
    g.strokeRoundedRect(this.roomX, this.roomY, this.roomW, this.roomH, 14);

    g.fillStyle(0x111a32);
    g.fillRect(this.roomX, this.roomY, this.roomW, 70);
    g.lineStyle(1, 0x2a3d66, 0.9);
    g.lineBetween(this.roomX, this.roomY + 70, this.roomX + this.roomW, this.roomY + 70);

    g.fillStyle(0x101726);
    g.fillRect(this.roomX, this.roomY + this.roomH - 78, this.roomW, 78);
    g.lineStyle(1, 0x1f2c4a, 0.8);
    for (let y = this.roomY + this.roomH - 74; y < this.roomY + this.roomH; y += 8) {
      g.lineBetween(this.roomX + 8, y, this.roomX + this.roomW - 8, y);
    }

    g.lineStyle(1, 0x1f2d4e, 0.28);
    for (let x = this.roomX + 24; x < this.roomX + this.roomW - 20; x += 34) {
      g.lineBetween(x, this.roomY + 70, x, this.roomY + this.roomH - 78);
    }

    this.add.text(this.roomX + 18, this.roomY + 22, 'ARMS DEALER', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
      stroke: '#000000',
      strokeThickness: 2,
    });

    this.add.text(this.roomX + this.roomW - 18, this.roomY + 24, 'UTILITIES • TENKS', {
      fontSize: '6px',
      fontFamily: '"Silkscreen", monospace',
      color: '#9DBDFF',
    }).setOrigin(1, 0.5);

    this.drawCeilingLights();
    this.drawWeaponWall();
    this.drawDealerCounter();

    this.add.text(this.roomX + this.roomW / 2, this.roomY + this.roomH - 98, 'CUSTOM LOADOUTS • MODS • STREET-LEGAL? MAYBE.', {
      fontSize: '5px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#4F6D9D',
    }).setOrigin(0.5).setDepth(7);
  }

  private drawCeilingLights() {
    const lx = this.roomX + this.roomW / 2;
    const ly = this.roomY + 16;
    const lightBar = this.add.graphics().setDepth(3);
    lightBar.fillStyle(0x09152a, 1);
    lightBar.fillRoundedRect(lx - 120, ly, 240, 14, 6);
    lightBar.lineStyle(1, 0x46B3FF, 0.55);
    lightBar.strokeRoundedRect(lx - 120, ly, 240, 14, 6);
    lightBar.fillStyle(0x46B3FF, 0.28);
    lightBar.fillRect(lx - 112, ly + 4, 224, 5);

    const glow = this.add.rectangle(lx, ly + 30, 320, 90, 0x46B3FF, 0.08).setDepth(2);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.04, to: 0.14 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawWeaponWall() {
    const wall = this.add.graphics().setDepth(4);

    const leftRackX = this.roomX + 36;
    const rightRackX = this.roomX + this.roomW - 236;
    const rackY = this.roomY + 88;
    const rackW = 200;
    const rackH = 148;

    [leftRackX, rightRackX].forEach((rx) => {
      wall.fillStyle(0x0b1730, 1);
      wall.fillRoundedRect(rx, rackY, rackW, rackH, 8);
      wall.lineStyle(1, 0x2B4B7A, 0.9);
      wall.strokeRoundedRect(rx, rackY, rackW, rackH, 8);
      wall.lineStyle(1, 0x46B3FF, 0.3);
      wall.lineBetween(rx + 12, rackY + 30, rx + rackW - 12, rackY + 30);
      wall.lineBetween(rx + 12, rackY + 74, rx + rackW - 12, rackY + 74);
      wall.lineBetween(rx + 12, rackY + 118, rx + rackW - 12, rackY + 118);
    });

    this.drawWeaponSilhouette(leftRackX + 26, rackY + 18, 0x6EA9FF);
    this.drawWeaponSilhouette(leftRackX + 26, rackY + 62, 0x80C7FF);
    this.drawWeaponSilhouette(leftRackX + 26, rackY + 106, 0x5F94E0);
    this.drawWeaponSilhouette(rightRackX + 26, rackY + 18, 0x6EA9FF);
    this.drawWeaponSilhouette(rightRackX + 26, rackY + 62, 0x80C7FF);
    this.drawWeaponSilhouette(rightRackX + 26, rackY + 106, 0x5F94E0);
  }

  private drawWeaponSilhouette(x: number, y: number, tint: number) {
    const gun = this.add.graphics().setDepth(5);
    gun.fillStyle(tint, 0.65);
    gun.fillRect(x, y + 7, 112, 6);
    gun.fillRect(x + 86, y + 5, 30, 10);
    gun.fillRect(x + 28, y + 13, 14, 12);
    gun.fillRect(x + 12, y + 5, 18, 3);
    gun.fillStyle(0x0A1222, 0.35);
    gun.fillRect(x + 4, y + 8, 108, 2);
    gun.lineStyle(1, 0x9DD2FF, 0.5);
    gun.strokeRect(x, y + 7, 112, 6);
  }

  private drawDealerCounter() {
    const ctr = this.add.graphics().setDepth(8);
    const x = this.roomX + 80;
    const y = this.roomY + this.roomH - 124;
    const w = this.roomW - 160;
    const h = 54;

    ctr.fillStyle(0x0A1122, 1);
    ctr.fillRoundedRect(x, y, w, h, 8);
    ctr.fillStyle(0x132745, 1);
    ctr.fillRoundedRect(x + 6, y - 10, w - 12, 14, 5);
    ctr.lineStyle(1, 0x46B3FF, 0.8);
    ctr.strokeRoundedRect(x, y, w, h, 8);
    ctr.lineStyle(1, 0x8ED8FF, 0.5);
    ctr.lineBetween(x + 6, y - 2, x + w - 6, y - 2);

    this.add.text(x + 18, y + 8, 'NO REFUNDS', {
      fontSize: '5px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6B6B',
    }).setDepth(9);
    this.add.text(x + w - 18, y + 8, 'WASPITO CERTIFIED', {
      fontSize: '5px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(1, 0).setDepth(9);
  }

  private spawnDealer() {
    this.dealerX = this.roomX + this.roomW / 2;
    this.dealerY = this.roomY + this.roomH - 156;

    const d = this.add.graphics().setDepth(10);
    d.fillStyle(0x000000, 0.3);
    d.fillEllipse(this.dealerX, this.dealerY + 56, 54, 16);
    d.fillStyle(0xC17A4A);
    d.fillRect(this.dealerX - 11, this.dealerY - 2, 22, 20);
    d.fillStyle(0x12162a);
    d.fillRect(this.dealerX - 16, this.dealerY + 18, 32, 26);
    d.fillStyle(0x070B16);
    d.fillRect(this.dealerX - 12, this.dealerY + 44, 10, 14);
    d.fillRect(this.dealerX + 2, this.dealerY + 44, 10, 14);
    d.fillStyle(0x46B3FF);
    d.fillRect(this.dealerX - 13, this.dealerY - 12, 26, 8);
    d.fillStyle(0x111111);
    d.fillRect(this.dealerX - 6, this.dealerY + 4, 4, 4);
    d.fillRect(this.dealerX + 2, this.dealerY + 4, 4, 4);

    this.add.text(this.dealerX, this.dealerY - 24, 'DEALER', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);

    this.dealerPrompt = this.add.text(this.dealerX, this.roomY + this.roomH - 34, '[SPACE] HABLAR', {
      fontSize: '5px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#9DBDFF',
      backgroundColor: '#000000',
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(11).setVisible(false);
  }

  private spawnPlayer() {
    this.px = this.roomX + this.roomW - 110;
    this.py = this.roomY + this.roomH - 56;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(20);
  }

  private handleMovement(delta: number) {
    const { dx, dy, stepX, stepY } = this.controls.readMovementStep(delta, 180, true);
    this.px = Phaser.Math.Clamp(this.px + stepX, this.roomX + 30, this.roomX + this.roomW - 30);
    this.py = Phaser.Math.Clamp(this.py + stepY, this.roomY + 84, this.roomY + this.roomH - 16);
    this.player.update(dx !== 0 || dy !== 0, dx, dy);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(20 + Math.floor(this.py / 10));
    this.lastMoveDx = dx;
    this.lastMoveDy = dy;
    this.lastIsMoving = dx !== 0 || dy !== 0;
  }

  private isNearDealer() {
    return Phaser.Math.Distance.Between(this.px, this.py, this.dealerX, this.dealerY) <= 124;
  }

  private openShopOverlay() {
    if (this.shopOverlayOpen) return;
    this.shopOverlayOpen = true;
    this.input.enabled = false;
    eventBus.emit(EVENTS.GUN_SHOP_OPEN);
  }

  private closeShopOverlay() {
    if (!this.shopOverlayOpen) return;
    this.shopOverlayOpen = false;
    this.input.enabled = true;
    if (this.input.keyboard) this.input.keyboard.enabled = true;
    eventBus.emit(EVENTS.GUN_SHOP_CLOSE);
  }

  private exitToWorld() {
    if (this.inTransition) return;
    this.closeShopOverlay();
    const ok = transitionToWorldScene(this, this.worldExitX, this.worldExitY);
    if (ok) this.inTransition = true;
  }

  private handleSceneShutdown() {
    this.offGunShopClose?.();
    this.offGunShopClose = undefined;
    if (this.shopOverlayOpen) {
      eventBus.emit(EVENTS.GUN_SHOP_CLOSE);
      this.shopOverlayOpen = false;
    }
    this.room?.shutdown();
    this.room = undefined;
  }
}
