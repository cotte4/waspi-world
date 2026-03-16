import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { SAFE_PLAZA_RETURN, ZONES } from '../config/constants';
import { CATALOG, getItem } from '../config/catalog';
import { announceScene, bindSafeResetToPlaza, createBackButton, showSceneTitle, transitionToScene } from '../systems/SceneUi';
import { addTenks, getTenksBalance } from '../systems/TenksSystem';
import { equipItem, getInventory, ownItem } from '../systems/InventorySystem';
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

  constructor() {
    super({ key: 'GunShopInterior' });
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);
    showSceneTitle(this, 'GUN SHOP', 0x46B3FF);
    this.controls = new SceneControls(this);
    bindSafeResetToPlaza(this, () => {
      transitionToScene(this, 'WorldScene', { returnX: SAFE_PLAZA_RETURN.X, returnY: SAFE_PLAZA_RETURN.Y });
    });

    this.roomW = 640;
    this.roomH = 390;
    this.roomX = (width - this.roomW) / 2;
    this.roomY = (height - this.roomH) / 2;

    this.drawRoom();
    this.spawnDealer();
    this.spawnPlayer();

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

    if (this.dealerPanel) {
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
    const g = this.add.graphics();

    g.fillStyle(0x070b16);
    g.fillRect(0, 0, width, height);

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
  }

  private spawnDealer() {
    this.dealerX = this.roomX + 126;
    this.dealerY = this.roomY + this.roomH - 132;

    const d = this.add.graphics();
    d.fillStyle(0x000000, 0.3);
    d.fillEllipse(this.dealerX, this.dealerY + 56, 44, 14);
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
    d.setDepth(10);

    this.add.text(this.dealerX, this.dealerY - 24, 'DEALER', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);

    this.dealerPrompt = this.add.text(this.dealerX, this.dealerY + 74, '[SPACE] HABLAR', {
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

    const title = this.add.text(cx, py + 22, 'ARMS DEALER', {
      fontSize: '11px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
    }).setOrigin(0.5);
    container.add(title);

    const balText = this.add.text(cx, py + 44, `TENKS: ${getTenksBalance().toLocaleString('es-AR')}`, {
      fontSize: '8px',
      fontFamily: '"Silkscreen", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);
    container.add(balText);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0x46B3FF, 0.45);
    divider.lineBetween(px + 20, py + 58, px + pw - 20, py + 58);
    container.add(divider);

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

    const priceText = this.add.text(panelX + panelW - 164, rowY + 22, `${item.priceTenks.toLocaleString('es-AR')} T`, {
      fontSize: '9px',
      fontFamily: '"Silkscreen", monospace',
      color: comingSoon ? '#6E7B95' : '#F5C842',
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
          rowBg.clear();
          rowBg.fillStyle(0x121A2D, 0.45);
          rowBg.fillRoundedRect(panelX + 16, rowY, panelW - 32, 60, 6);
          rowBg.lineStyle(1, 0x39FF14, 0.8);
          rowBg.strokeRoundedRect(panelX + 16, rowY, panelW - 32, 60, 6);
          balText.setText(`TENKS: ${getTenksBalance().toLocaleString('es-AR')}`);
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

    if (getTenksBalance() < priceTenks) {
      return { success: false, message: `Necesitas ${priceTenks.toLocaleString('es-AR')} TENKS.` };
    }

    if (!supabase || !isConfigured) {
      ownItem(itemId);
      equipItem(itemId);
      addTenks(-priceTenks, `gun_shop_${itemId.toLowerCase()}`);
      return { success: true, message: `${itemId} equipado (modo offline).` };
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
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
      return { success: false, message: err?.error ?? 'Error al comprar. Intenta de nuevo.' };
    }

    return { success: true, message: 'Compra completada.' };
  }

  private exitToWorld() {
    if (this.inTransition) return;
    this.closeDealerPanel();
    this.inTransition = true;
    transitionToScene(this, 'WorldScene', {
      returnX: GunShopInterior.RETURN_X,
      returnY: GunShopInterior.RETURN_Y,
    });
  }
}
