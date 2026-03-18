// SkillShopPanel.ts
// In-game overlay for buying skill items with TENKS.
// 2×3 grid. Interactive buy buttons. Balance tracks TENKS_CHANGED event.

import Phaser from 'phaser';
import { getSkillSystem } from './SkillSystem';
import { getTenksBalance, initTenks } from './TenksSystem';
import { eventBus, EVENTS } from '../config/eventBus';

// ---------------------------------------------------------------------------
// Shop catalog — mirrors app/api/skills/purchase/route.ts
// ---------------------------------------------------------------------------

type ShopItem = {
  id: string;
  skillId: string;
  skillLabel: string;
  name: string;
  cost: number;
  description: string;
  skillColor: number;
  skillColorHex: string;
};

const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'mining_pickaxe',
    skillId: 'mining',
    skillLabel: 'MINERIA',
    name: 'PICO REFORZADO',
    cost: 800,
    description: '+20% velocidad extraccion',
    skillColor: 0xc8a45a,
    skillColorHex: '#C8A45A',
  },
  {
    id: 'mining_dynamite',
    skillId: 'mining',
    skillLabel: 'MINERIA',
    name: 'DINAMITA x5',
    cost: 1200,
    description: 'Drop x3 en proxima extraccion',
    skillColor: 0xc8a45a,
    skillColorHex: '#C8A45A',
  },
  {
    id: 'garden_fertilizer',
    skillId: 'gardening',
    skillLabel: 'JARDINERIA',
    name: 'FERTILIZANTE PRO',
    cost: 600,
    description: '-30% tiempo cosecha x5 usos',
    skillColor: 0x4caf50,
    skillColorHex: '#4CAF50',
  },
  {
    id: 'garden_seeds_rare',
    skillId: 'gardening',
    skillLabel: 'JARDINERIA',
    name: 'SEMILLAS RARAS x3',
    cost: 500,
    description: 'Semillas premium alto rendim.',
    skillColor: 0x4caf50,
    skillColorHex: '#4CAF50',
  },
  {
    id: 'gym_membership',
    skillId: 'gym',
    skillLabel: 'GYM',
    name: 'MEMBRESIA GYM',
    cost: 1000,
    description: 'Acceso maquinas premium',
    skillColor: 0xef5350,
    skillColorHex: '#EF5350',
  },
  {
    id: 'weed_grow_lamp',
    skillId: 'weed',
    skillLabel: 'WEED',
    name: 'LAMPARA UV',
    cost: 900,
    description: '-25% tiempo cultivo cannabis',
    skillColor: 0x66bb6a,
    skillColorHex: '#66BB6A',
  },
];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const PANEL_DEPTH = 9100;
const PANEL_W     = 660;
const PANEL_H     = 490;
const CARD_W      = 294;
const CARD_H      = 124;
const CARD_COLS   = 2;
const CARD_GAP_X  = 18;
const CARD_GAP_Y  = 11;
const BTN_W       = 106;
const BTN_H       = 22;
const FONT        = '"Press Start 2P", monospace';
const BG_COLOR    = 0x0d0d14;
const CARD_BG     = 0x131320;
const GOLD        = 0xf5c842;
const GOLD_HEX    = '#F5C842';

// ---------------------------------------------------------------------------
// Internal card state refs
// ---------------------------------------------------------------------------

type CardRefs = {
  gfx: Phaser.GameObjects.Graphics;
  btnBg: Phaser.GameObjects.Rectangle;
  btnLabel: Phaser.GameObjects.Text;
  ownedBadge: Phaser.GameObjects.Text;
  costText: Phaser.GameObjects.Text;
};

// ---------------------------------------------------------------------------
// SkillShopPanel
// ---------------------------------------------------------------------------

export class SkillShopPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible = false;
  private isBuying = false;

  private balanceText?: Phaser.GameObjects.Text;
  private noticeText?: Phaser.GameObjects.Text;
  private cards: CardRefs[] = [];

  // TENKS_CHANGED unsubscribe fn
  private unsubTenks?: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0)
      .setDepth(PANEL_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);

    this.buildPanel();

    // Live balance updates
    const handler = (data: unknown) => {
      const balance = (data as { balance: number })?.balance;
      if (typeof balance === 'number') {
        this.balanceText?.setText(`${balance.toLocaleString('es-AR')} T`);
      }
      this.refreshButtonStates();
    };
    eventBus.on(EVENTS.TENKS_CHANGED, handler);
    this.unsubTenks = () => eventBus.off(EVENTS.TENKS_CHANGED, handler);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  show(): void {
    void this.refresh();
    this.container.setVisible(true);
    this.visible = true;
  }

  hide(): void {
    this.container.setVisible(false);
    this.visible = false;
    this.noticeText?.setText('');
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    this.unsubTenks?.();
    this.container.destroy();
  }

  // ---------------------------------------------------------------------------
  // Refresh — called on show(), re-fetches purchased items list
  // ---------------------------------------------------------------------------

  private async refresh(): Promise<void> {
    await getSkillSystem().loadPurchasedItems();
    this.balanceText?.setText(`${getTenksBalance().toLocaleString('es-AR')} T`);
    this.refreshButtonStates();
    this.noticeText?.setText('');
  }

  // ---------------------------------------------------------------------------
  // refreshButtonStates — call whenever balance or purchase state changes
  // ---------------------------------------------------------------------------

  private refreshButtonStates(): void {
    // Guard: if container was destroyed (scene changed), don't touch dead objects
    if (!this.container?.active) return;
    const balance = getTenksBalance();

    SHOP_ITEMS.forEach((item, i) => {
      const card = this.cards[i];
      if (!card) return;
      const owned    = getSkillSystem().hasPurchased(item.id);
      const canAfford = balance >= item.cost;

      if (owned) {
        card.btnBg.setVisible(false);
        card.btnLabel.setVisible(false);
        card.ownedBadge.setVisible(true);
        // Gold border for owned
        this.drawCardBorder(card.gfx, i, GOLD, 1);
      } else {
        card.btnBg.setVisible(true);
        card.btnLabel.setVisible(true);
        card.ownedBadge.setVisible(false);

        if (canAfford) {
          card.btnBg.setFillStyle(0x1a3a1a, 1);
          card.btnBg.setStrokeStyle(1, 0x39ff14, 0.9);
          card.btnLabel.setText('COMPRAR').setColor('#39FF14');
          this.drawCardBorder(card.gfx, i, item.skillColor, 0.7);
        } else {
          card.btnBg.setFillStyle(0x2a1010, 1);
          card.btnBg.setStrokeStyle(1, 0x883333, 0.6);
          card.btnLabel.setText('SIN TENKS').setColor('#884444');
          this.drawCardBorder(card.gfx, i, 0x332222, 0.5);
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Card border helper
  // ---------------------------------------------------------------------------

  private drawCardBorder(
    gfx: Phaser.GameObjects.Graphics,
    index: number,
    color: number,
    alpha: number,
  ): void {
    const { cx, cy } = this.cardPos(index);
    gfx.clear();
    gfx.fillStyle(CARD_BG, 1);
    gfx.fillRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 8);
    gfx.lineStyle(2, color, alpha);
    gfx.strokeRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 8);
  }

  // ---------------------------------------------------------------------------
  // Card position
  // ---------------------------------------------------------------------------

  private cardPos(index: number): { cx: number; cy: number } {
    const { width, height } = this.scene.scale;
    const panelLeft = width  / 2 - PANEL_W / 2;
    const panelTop  = height / 2 - PANEL_H / 2;

    const gridOriginX =
      panelLeft + (PANEL_W - (CARD_COLS * CARD_W + (CARD_COLS - 1) * CARD_GAP_X)) / 2 + CARD_W / 2;
    const gridOriginY = panelTop + 72 + CARD_H / 2;

    const col = index % CARD_COLS;
    const row = Math.floor(index / CARD_COLS);
    return {
      cx: gridOriginX + col * (CARD_W + CARD_GAP_X),
      cy: gridOriginY + row * (CARD_H + CARD_GAP_Y),
    };
  }

  // ---------------------------------------------------------------------------
  // Build panel skeleton (called once)
  // ---------------------------------------------------------------------------

  private buildPanel(): void {
    const { width, height } = this.scene.scale;
    const pcx = width  / 2;
    const pcy = height / 2;

    // Dimmer
    const dim = this.scene.add.rectangle(pcx, pcy, width, height, 0x000000, 0.76)
      .setScrollFactor(0);

    // Panel bg
    const panelBg = this.scene.add.rectangle(pcx, pcy, PANEL_W, PANEL_H, BG_COLOR, 0.98)
      .setScrollFactor(0);

    // Panel border
    const borderGfx = this.scene.add.graphics().setScrollFactor(0);
    borderGfx.lineStyle(2, GOLD, 1);
    borderGfx.strokeRoundedRect(pcx - PANEL_W / 2, pcy - PANEL_H / 2, PANEL_W, PANEL_H, 10);

    // Header separator line
    const sepY = pcy - PANEL_H / 2 + 44;
    const sepGfx = this.scene.add.graphics().setScrollFactor(0);
    sepGfx.lineStyle(1, GOLD, 0.3);
    sepGfx.lineBetween(pcx - PANEL_W / 2 + 16, sepY, pcx + PANEL_W / 2 - 16, sepY);

    // Title
    const titleText = this.scene.add.text(
      pcx - PANEL_W / 2 + 20,
      pcy - PANEL_H / 2 + 16,
      'SKILL SHOP',
      { fontSize: '11px', fontFamily: FONT, color: GOLD_HEX, stroke: '#000', strokeThickness: 3 },
    ).setOrigin(0, 0.5).setScrollFactor(0);

    // Subtitle
    const subtitleText = this.scene.add.text(
      pcx - PANEL_W / 2 + 20,
      pcy - PANEL_H / 2 + 30,
      'Comprá items con TENKS para potenciar tus skills',
      { fontSize: '6px', fontFamily: FONT, color: '#888899' },
    ).setOrigin(0, 0.5).setScrollFactor(0);

    // TENKS balance (top right)
    const tenksIcon = this.scene.add.text(
      pcx + PANEL_W / 2 - 20,
      pcy - PANEL_H / 2 + 14,
      'SALDO',
      { fontSize: '5px', fontFamily: FONT, color: '#666677' },
    ).setOrigin(1, 0.5).setScrollFactor(0);

    this.balanceText = this.scene.add.text(
      pcx + PANEL_W / 2 - 20,
      pcy - PANEL_H / 2 + 28,
      `${getTenksBalance().toLocaleString('es-AR')} T`,
      { fontSize: '8px', fontFamily: FONT, color: '#39FF14' },
    ).setOrigin(1, 0.5).setScrollFactor(0);

    // Notice area (bottom center)
    this.noticeText = this.scene.add.text(
      pcx,
      pcy + PANEL_H / 2 - 18,
      '',
      { fontSize: '6px', fontFamily: FONT, color: GOLD_HEX, stroke: '#000', strokeThickness: 2 },
    ).setOrigin(0.5, 0.5).setScrollFactor(0);

    // Close hint (bottom right)
    const closeHint = this.scene.add.text(
      pcx + PANEL_W / 2 - 14,
      pcy + PANEL_H / 2 - 14,
      '[Y] CERRAR',
      { fontSize: '5px', fontFamily: FONT, color: '#555566' },
    ).setOrigin(1, 1).setScrollFactor(0);

    this.container.add([
      dim, panelBg, borderGfx, sepGfx,
      titleText, subtitleText, tenksIcon, this.balanceText,
      this.noticeText, closeHint,
    ]);

    // Build the 6 item cards
    SHOP_ITEMS.forEach((item, i) => this.buildCard(item, i));
  }

  // ---------------------------------------------------------------------------
  // Build a single item card
  // ---------------------------------------------------------------------------

  private buildCard(item: ShopItem, index: number): void {
    const { cx, cy } = this.cardPos(index);

    // Card bg + border graphic (redrawn on refresh)
    const gfx = this.scene.add.graphics().setScrollFactor(0);
    gfx.fillStyle(CARD_BG, 1);
    gfx.fillRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 8);
    gfx.lineStyle(2, item.skillColor, 0.7);
    gfx.strokeRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 8);

    // ── Skill badge (top-left pill) ──
    const badgeGfx = this.scene.add.graphics().setScrollFactor(0);
    const badgeX = cx - CARD_W / 2 + 8;
    const badgeY = cy - CARD_H / 2 + 8;
    badgeGfx.fillStyle(item.skillColor, 0.18);
    badgeGfx.fillRoundedRect(badgeX, badgeY, 72, 14, 4);
    badgeGfx.lineStyle(1, item.skillColor, 0.5);
    badgeGfx.strokeRoundedRect(badgeX, badgeY, 72, 14, 4);

    const badgeText = this.scene.add.text(
      badgeX + 36, badgeY + 7,
      item.skillLabel,
      { fontSize: '4px', fontFamily: FONT, color: item.skillColorHex },
    ).setOrigin(0.5, 0.5).setScrollFactor(0);

    // ── Item name ──
    const nameText = this.scene.add.text(
      cx - CARD_W / 2 + 10,
      cy - CARD_H / 2 + 36,
      item.name,
      { fontSize: '6px', fontFamily: FONT, color: '#E8E8F0' },
    ).setOrigin(0, 0.5).setScrollFactor(0);

    // ── Description ──
    const descText = this.scene.add.text(
      cx - CARD_W / 2 + 10,
      cy - CARD_H / 2 + 58,
      item.description,
      {
        fontSize: '5px',
        fontFamily: FONT,
        color: '#666677',
        wordWrap: { width: CARD_W - 130 },
      },
    ).setOrigin(0, 0.5).setScrollFactor(0);

    // ── Cost (bottom left) ──
    const costText = this.scene.add.text(
      cx - CARD_W / 2 + 10,
      cy + CARD_H / 2 - 20,
      `${item.cost.toLocaleString('es-AR')} T`,
      { fontSize: '8px', fontFamily: FONT, color: GOLD_HEX },
    ).setOrigin(0, 0.5).setScrollFactor(0);

    // ── BUY button (bottom right) ──
    const btnX = cx + CARD_W / 2 - BTN_W / 2 - 10;
    const btnY = cy + CARD_H / 2 - BTN_H / 2 - 8;

    const btnBg = this.scene.add.rectangle(btnX, btnY, BTN_W, BTN_H, 0x1a3a1a, 1)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    btnBg.setStrokeStyle(1, 0x39ff14, 0.9);

    const btnLabel = this.scene.add.text(
      btnX, btnY,
      'COMPRAR',
      { fontSize: '6px', fontFamily: FONT, color: '#39FF14' },
    ).setOrigin(0.5).setScrollFactor(0);

    // ── OWNED badge ──
    const ownedBadge = this.scene.add.text(
      btnX, btnY,
      '✓ TENIDO',
      { fontSize: '6px', fontFamily: FONT, color: '#555566' },
    ).setOrigin(0.5).setScrollFactor(0).setVisible(false);

    // Store refs
    this.cards[index] = { gfx, btnBg, btnLabel, ownedBadge, costText };

    // ── Hover ──
    btnBg.on('pointerover', () => {
      if (getSkillSystem().hasPurchased(item.id)) return;
      const canAfford = getTenksBalance() >= item.cost;
      if (canAfford) btnBg.setFillStyle(0x245a24, 1);
    });
    btnBg.on('pointerout', () => {
      if (getSkillSystem().hasPurchased(item.id)) return;
      const canAfford = getTenksBalance() >= item.cost;
      btnBg.setFillStyle(canAfford ? 0x1a3a1a : 0x2a1010, 1);
    });

    // ── Buy click ──
    btnBg.on('pointerdown', () => {
      if (this.isBuying || getSkillSystem().hasPurchased(item.id)) return;
      if (getTenksBalance() < item.cost) {
        this.showNotice(`Necesitas ${item.cost.toLocaleString('es-AR')} T`, '#FF4444');
        return;
      }

      this.isBuying = true;
      btnLabel.setText('...');
      this.noticeText?.setText('');

      getSkillSystem()
        .buyItem(item.id)
        .then((result) => {
          this.isBuying = false;

          if (result.success) {
            // Sync local TENKS balance with server value
            if (typeof result.new_balance === 'number') {
              initTenks(result.new_balance, { preferStored: false });
            }
            this.showNotice(result.notice ?? `${item.name} comprado!`, '#39FF14');
            eventBus.emit(EVENTS.UI_NOTICE, { message: `${item.name} comprado!`, color: '#39FF14' });
            this.refreshButtonStates();
          } else {
            this.refreshButtonStates(); // restore button label
            this.showNotice(result.error ?? 'Error al comprar.', '#FF4444');
          }
        })
        .catch(() => {
          this.isBuying = false;
          this.refreshButtonStates();
          this.showNotice('Error de red.', '#FF4444');
        });
    });

    this.container.add([
      gfx, badgeGfx, badgeText,
      nameText, descText, costText,
      btnBg, btnLabel, ownedBadge,
    ]);
  }

  // ---------------------------------------------------------------------------
  // Notice helper — auto-clears after 2.5s
  // ---------------------------------------------------------------------------

  private showNotice(msg: string, color: string): void {
    this.noticeText?.setText(msg).setColor(color);
    this.scene.time.delayedCall(2500, () => {
      if (this.visible) this.noticeText?.setText('');
    });
  }
}
