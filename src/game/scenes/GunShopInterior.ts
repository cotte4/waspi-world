import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { SAFE_PLAZA_RETURN, ZONES } from '../config/constants';
import { CATALOG, getItem } from '../config/catalog';
import { announceScene, bindSafeResetToPlaza, createBackButton, showSceneTitle, transitionToWorldScene } from '../systems/SceneUi';
import { InteriorRoom } from '../systems/InteriorRoom';
import { addTenks, getTenksBalance, initTenks } from '../systems/TenksSystem';
import { ensureItemEquipped, getInventory, ownItem, replaceInventory } from '../systems/InventorySystem';
import { SceneControls } from '../systems/SceneControls';
import { createScrollArea } from '../systems/ScrollArea';
import { supabase, isConfigured } from '../../lib/supabase';
import { eventBus, EVENTS } from '../config/eventBus';

type CatalogEntry = (typeof CATALOG)[number];

export class GunShopInterior extends Phaser.Scene {
  private static readonly RETURN_X = 2240;
  private static readonly RETURN_Y = ZONES.PLAZA_Y + 428;

  private player!: AvatarRenderer;
  private controls!: SceneControls;
  private inTransition = false;
  private px = 0;
  private py = 0;
  private roomX = 0;
  private roomY = 0;
  private roomW = 640;
  private roomH = 390;
  private dealerX = 0;
  private dealerY = 0;
  private dealerPrompt?: Phaser.GameObjects.Text;
  private dealerPanel?: Phaser.GameObjects.Container;
  private room?: InteriorRoom;
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastIsMoving = false;

  constructor() {
    super({ key: 'GunShopInterior' });
  }

  init() {
    this.inTransition = false;
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
      if (this.dealerPanel) {
        this.closeDealerPanel();
        return;
      }
      this.exitToWorld();
    });
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    if (this.inTransition) return;
    this.room?.update();

    if (this.dealerPanel) {
      this.lastMoveDx = 0;
      this.lastMoveDy = 0;
      this.lastIsMoving = false;
      if (this.controls.isActionJustDown('back')) {
        this.closeDealerPanel();
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
      this.openDealerPanel();
    }
  }

  private drawRoom() {
    const { width, height } = this.scale;
    const g = this.add.graphics().setDepth(0);

    g.fillStyle(0x070b16);
    g.fillRect(0, 0, width, height);

    // Subtle blue ambient blooms so the room feels alive.
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

    // Thin wall grid for industrial vibe.
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

    // Counter face + top
    ctr.fillStyle(0x0A1122, 1);
    ctr.fillRoundedRect(x, y, w, h, 8);
    ctr.fillStyle(0x132745, 1);
    ctr.fillRoundedRect(x + 6, y - 10, w - 12, 14, 5);
    ctr.lineStyle(1, 0x46B3FF, 0.8);
    ctr.strokeRoundedRect(x, y, w, h, 8);
    ctr.lineStyle(1, 0x8ED8FF, 0.5);
    ctr.lineBetween(x + 6, y - 2, x + w - 6, y - 2);

    // Sticker labels
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

  private openDealerPanel() {
    if (this.dealerPanel) return;
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const pw = 560;
    const ph = 330;
    const px = cx - pw / 2;
    const py = cy - ph / 2;

    const container = this.add.container(0, 0).setDepth(1000);
    this.dealerPanel = container;

    const overlay = this.add.rectangle(cx, cy, width, height, 0x000000, 0.72);
    container.add(overlay);

    const bg = this.add.graphics();
    bg.fillStyle(0x090e1a, 0.98);
    bg.fillRoundedRect(px, py, pw, ph, 12);
    bg.lineStyle(2, 0x46B3FF, 1);
    bg.strokeRoundedRect(px, py, pw, ph, 12);
    container.add(bg);

    const headerGlow = this.add.rectangle(cx, py + 22, pw - 4, 36, 0x46B3FF, 0.06);
    container.add(headerGlow);

    const corners = this.add.graphics();
    const cLen = 14; const cThick = 2;
    ([[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]] as [number, number][]).forEach(([bx, by], i) => {
      const sx = i % 2 === 0 ? 1 : -1;
      const sy = i < 2 ? 1 : -1;
      corners.lineStyle(cThick, 0x8ED8FF, 0.9);
      corners.lineBetween(bx, by, bx + sx * cLen, by);
      corners.lineBetween(bx, by, bx, by + sy * cLen);
    });
    container.add(corners);

    const title = this.add.text(cx, py + 22, 'ARMS DEALER', {
      fontSize: '11px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
    }).setOrigin(0.5);
    container.add(title);

    const closeBtn = this.add.text(px + pw - 16, py + 16, 'X', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF5A5A',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeDealerPanel());
    closeBtn.on('pointerover', () => closeBtn.setColor('#FFA0A0'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#FF5A5A'));
    container.add(closeBtn);

    const balText = this.add.text(cx, py + 44, `🪙 ${getTenksBalance().toLocaleString('es-AR')} T`, {
      fontSize: '8px',
      fontFamily: '"Silkscreen", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);
    container.add(balText);

    // On open, refresh local TENKS from server-authoritative balance.
    void this.syncAuthoritativeTenks().then((balance) => {
      if (balance === null || !this.dealerPanel || !balText.active) return;
      balText.setText(`🪙 ${balance.toLocaleString('es-AR')} T`);
    });

    const divider = this.add.graphics();
    divider.lineStyle(1, 0x46B3FF, 0.45);
    divider.lineBetween(px + 20, py + 58, px + pw - 20, py + 58);
    container.add(divider);

    const footerHint = this.add.text(cx, py + ph - 10, 'BACK CIERRA', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#6E9BDB',
    }).setOrigin(0.5);
    container.add(footerHint);

    const gunItems = CATALOG.filter((item) => item.id.startsWith('UTIL-GUN'));
    const listY = py + 68;
    const listH = ph - (listY - py) - 12;
    const scrollArea = createScrollArea(this, {
      x: px,
      y: listY,
      w: pw,
      h: listH,
      mount: container,
      step: 34,
      scrollbar: { depth: 1101, insetRight: 16, insetY: 8 },
    });

    gunItems.forEach((item, idx) => {
      const rowY = listY + 10 + idx * 72;
      this.buildGunShopRow(scrollArea.content, px, rowY, pw, item, balText);
    });
  }

  private buildGunShopRow(
    container: Phaser.GameObjects.Container,
    panelX: number,
    rowY: number,
    panelW: number,
    item: CatalogEntry,
    balText: Phaser.GameObjects.Text,
  ) {
    const owned = getInventory().owned.includes(item.id);
    const comingSoon = !!item.comingSoon;

    const rowBg = this.add.graphics();
    rowBg.fillStyle(0x121A2D, owned ? 0.45 : comingSoon ? 0.25 : 0.8);
    rowBg.fillRoundedRect(panelX + 16, rowY, panelW - 32, 60, 6);
    rowBg.lineStyle(1, owned ? 0x39FF14 : comingSoon ? 0x586A8A : 0x46B3FF, 0.8);
    rowBg.strokeRoundedRect(panelX + 16, rowY, panelW - 32, 60, 6);
    container.add(rowBg);

    if (owned) {
      const ownedBadge = this.add.text(panelX + panelW - 32, rowY + 10, 'OWNED', {
        fontSize: '5px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#39FF14',
        backgroundColor: '#001100',
        padding: { x: 3, y: 1 },
      });
      container.add(ownedBadge);
    }

    const nameText = this.add.text(panelX + 30, rowY + 13, item.name + (item.isLimited ? ' ★' : ''), {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: comingSoon ? '#6E7B95' : item.isLimited ? '#F5C842' : '#FFFFFF',
    });
    container.add(nameText);

    const descText = this.add.text(panelX + 30, rowY + 30, item.description ?? '', {
      fontSize: '7px',
      fontFamily: '"Silkscreen", monospace',
      color: comingSoon ? '#5A6885' : '#8DA6D4',
    });
    container.add(descText);

    const priceLabel = owned ? '—' : `${item.priceTenks.toLocaleString('es-AR')} T`;
    const priceColor = owned ? '#39FF14' : comingSoon ? '#6E7B95' : '#F5C842';
    const priceText = this.add.text(panelX + panelW - 164, rowY + 22, priceLabel, {
      fontSize: '8px',
      fontFamily: '"Silkscreen", monospace',
      color: priceColor,
    }).setOrigin(0, 0.5);
    container.add(priceText);

    if (comingSoon) {
      const soonLabel = this.add.text(panelX + panelW - 62, rowY + 30, 'SOON', {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#6E7B95',
      }).setOrigin(0.5);
      container.add(soonLabel);
      return;
    }

    if (owned) {
      const ownedLabel = this.add.text(panelX + panelW - 62, rowY + 30, 'OWNED', {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#39FF14',
      }).setOrigin(0.5);
      container.add(ownedLabel);
      return;
    }

    const buyBtn = this.add.text(panelX + panelW - 62, rowY + 30, 'COMPRAR', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
      backgroundColor: '#0A1428',
      padding: { x: 6, y: 4 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    buyBtn.on('pointerover', () => buyBtn.setColor('#8ED8FF'));
    buyBtn.on('pointerout', () => buyBtn.setColor('#46B3FF'));
    buyBtn.on('pointerdown', () => {
      buyBtn.setText('...').setColor('#777777').disableInteractive();
      this.buyGunItem(item.id, item.priceTenks).then((result) => {
        if (!buyBtn.active) return;
        if (result.success) {
          buyBtn.setText('✓ LISTO').setColor('#39FF14');
          if (!rowBg.active) return; // panel was closed while purchase was in-flight
          rowBg.clear();
          rowBg.fillStyle(0x121A2D, 0.45);
          rowBg.fillRoundedRect(panelX + 16, rowY, panelW - 32, 60, 6);
          rowBg.lineStyle(1, 0x39FF14, 0.8);
          rowBg.strokeRoundedRect(panelX + 16, rowY, panelW - 32, 60, 6);
          balText.setText(`🪙 ${getTenksBalance().toLocaleString('es-AR')} T`);
          return;
        }
        buyBtn.setText('ERROR').setColor('#FF4455');
        eventBus.emit(EVENTS.UI_NOTICE, result.message);
        this.time.delayedCall(1200, () => {
          if (!buyBtn.active) return;
          buyBtn.setText('COMPRAR').setColor('#46B3FF').setInteractive({ useHandCursor: true });
        });
      });
    });
    container.add(buyBtn);
  }

  private closeDealerPanel() {
    this.dealerPanel?.destroy(true);
    this.dealerPanel = undefined;
  }

  private async buyGunItem(itemId: string, priceTenks: number): Promise<{ success: boolean; message: string }> {
    const item = getItem(itemId);
    if (item?.comingSoon) {
      return { success: false, message: 'Ese arma todavia no esta implementada.' };
    }

    if (!supabase || !isConfigured) {
      if (getTenksBalance() < priceTenks) {
        return { success: false, message: `Necesitas ${priceTenks.toLocaleString('es-AR')} TENKS.` };
      }
      ownItem(itemId);
      ensureItemEquipped(itemId);
      addTenks(-priceTenks, `gun_shop_${itemId.toLowerCase()}`);
      return { success: true, message: `${itemId} equipado (modo offline).` };
    }

    const token = await this.getSessionToken();
    if (!token) {
      return { success: false, message: 'Tenes que estar logueado para comprar.' };
    }

    const res = await fetch('/api/shop/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemId }),
    }).catch(() => null);

    if (!res?.ok) {
      const err = await res?.json().catch(() => null) as { error?: string } | null;
      // Keep local HUD in sync when server rejects purchase by balance.
      await this.syncAuthoritativeTenks(token);
      return { success: false, message: err?.error ?? 'Error al comprar. Intenta de nuevo.' };
    }

    const result = await res.json() as {
      player?: { tenks?: number; inventory?: { owned: string[]; equipped: Record<string, unknown> } };
      notice?: string;
    };

    // Sync full inventory from server if available, otherwise grant+equip locally.
    if (result.player?.inventory) {
      replaceInventory(result.player.inventory as Parameters<typeof replaceInventory>[0]);
    } else {
      ownItem(itemId);
    }
    ensureItemEquipped(itemId);

    if (typeof result.player?.tenks === 'number') {
      initTenks(result.player.tenks, { preferStored: false });
    } else {
      await this.syncAuthoritativeTenks(token);
    }

    return { success: true, message: result.notice ?? 'Compra completada.' };
  }

  private async getSessionToken() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  private async syncAuthoritativeTenks(token?: string) {
    const authToken = token ?? await this.getSessionToken();
    if (!authToken) return null;
    const res = await fetch('/api/player/tenks', {
      headers: { Authorization: `Bearer ${authToken}` },
    }).catch(() => null);
    if (!res?.ok) return null;
    const json = await res.json().catch(() => null) as { balance?: number } | null;
    if (typeof json?.balance !== 'number') return null;
    initTenks(json.balance, { preferStored: false });
    return json.balance;
  }

  private exitToWorld() {
    if (this.inTransition) return;
    this.closeDealerPanel();
    const ok = transitionToWorldScene(this, GunShopInterior.RETURN_X, GunShopInterior.RETURN_Y);
    if (ok) this.inTransition = true;
  }

  private handleSceneShutdown() {
    this.room?.shutdown();
    this.room = undefined;
  }
}
