// ContractPanel.ts
// In-game overlay for weekly contracts. Toggle with key C.
// Architecture mirrors SkillShopPanel.

import Phaser from 'phaser';
import { getContractSystem } from './ContractSystem';
import type { Contract } from './ContractSystem';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PANEL_DEPTH = 9200;
const PANEL_W     = 500;
const PANEL_H     = 460;
const CARD_W      = 478;
const CARD_H      = 90;
const CARD_GAP_Y  = 8;
const FONT        = '"Press Start 2P", monospace';
const BG_COLOR    = 0x0d0d14;
const GOLD        = 0xf5c842;
const GOLD_HEX    = '#F5C842';

// ---------------------------------------------------------------------------
// Guild badge colors
// ---------------------------------------------------------------------------

const GUILD_COLORS: Record<string, number> = {
  miners: 0xc8a45a,
  growers: 0x4caf50,
  chefs: 0xff7043,
  cartel: 0xab47bc,
};

const GUILD_COLORS_HEX: Record<string, string> = {
  miners: '#C8A45A',
  growers: '#4CAF50',
  chefs: '#FF7043',
  cartel: '#AB47BC',
};

function getGuildColor(guildId: string): number {
  return GUILD_COLORS[guildId] ?? 0x888888;
}

function getGuildColorHex(guildId: string): string {
  return GUILD_COLORS_HEX[guildId] ?? '#888888';
}

// ---------------------------------------------------------------------------
// Card element refs (for destroy)
// ---------------------------------------------------------------------------

type CardElements = Phaser.GameObjects.GameObject[];

// ---------------------------------------------------------------------------
// ContractPanel
// ---------------------------------------------------------------------------

export class ContractPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible = false;

  private weekText?: Phaser.GameObjects.Text;
  private noticeText?: Phaser.GameObjects.Text;
  private cardElements: CardElements[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setDepth(PANEL_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);

    this.buildPanel();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  show(): void {
    this.refresh();
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
    this.container.destroy();
  }

  // ---------------------------------------------------------------------------
  // refresh — re-reads contracts and rebuilds cards
  // ---------------------------------------------------------------------------

  private refresh(): void {
    // Destroy existing card elements
    for (const group of this.cardElements) {
      for (const obj of group) {
        obj.destroy();
      }
    }
    this.cardElements = [];

    const contracts = getContractSystem().getContracts();
    const weekId    = getContractSystem().getWeekId();

    if (this.weekText) {
      this.weekText.setText(weekId ? `Semana ${weekId}` : 'Contratos Semanales');
    }

    // Show up to 4 contracts
    const visible = contracts.slice(0, 4);
    const { width, height } = this.scene.scale;
    const panelTop = height / 2 - PANEL_H / 2;
    const listStartY = panelTop + 72;

    visible.forEach((contract, i) => {
      const yOffset = listStartY + i * (CARD_H + CARD_GAP_Y);
      const elements = this.buildContractCard(contract, width / 2, yOffset);
      this.cardElements.push(elements);
      this.container.add(elements);
    });

    if (visible.length === 0) {
      const { width: w, height: h } = this.scene.scale;
      const noContractsText = this.scene.add
        .text(w / 2, h / 2, 'Sin contratos disponibles.', {
          fontSize: '7px',
          fontFamily: FONT,
          color: '#555566',
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      this.cardElements.push([noContractsText]);
      this.container.add(noContractsText);
    }
  }

  // ---------------------------------------------------------------------------
  // buildPanel — skeleton built once
  // ---------------------------------------------------------------------------

  private buildPanel(): void {
    const { width, height } = this.scene.scale;
    const pcx = width / 2;
    const pcy = height / 2;

    // Dimmer
    const dim = this.scene.add
      .rectangle(pcx, pcy, width, height, 0x000000, 0.76)
      .setScrollFactor(0);

    // Panel background
    const panelBg = this.scene.add
      .rectangle(pcx, pcy, PANEL_W, PANEL_H, BG_COLOR, 0.98)
      .setScrollFactor(0);

    // Gold border
    const borderGfx = this.scene.add.graphics().setScrollFactor(0);
    borderGfx.lineStyle(2, GOLD, 1);
    borderGfx.strokeRoundedRect(
      pcx - PANEL_W / 2,
      pcy - PANEL_H / 2,
      PANEL_W,
      PANEL_H,
      10,
    );

    // Separator
    const sepY = pcy - PANEL_H / 2 + 44;
    const sepGfx = this.scene.add.graphics().setScrollFactor(0);
    sepGfx.lineStyle(1, GOLD, 0.3);
    sepGfx.lineBetween(
      pcx - PANEL_W / 2 + 16,
      sepY,
      pcx + PANEL_W / 2 - 16,
      sepY,
    );

    // Title
    const titleText = this.scene.add
      .text(pcx - PANEL_W / 2 + 18, pcy - PANEL_H / 2 + 22, 'CONTRATOS SEMANALES', {
        fontSize: '9px',
        fontFamily: FONT,
        color: GOLD_HEX,
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);

    // Week label (top right)
    this.weekText = this.scene.add
      .text(pcx + PANEL_W / 2 - 18, pcy - PANEL_H / 2 + 22, '', {
        fontSize: '6px',
        fontFamily: FONT,
        color: '#555566',
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0);

    // Notice area
    this.noticeText = this.scene.add
      .text(pcx, pcy + PANEL_H / 2 - 22, '', {
        fontSize: '6px',
        fontFamily: FONT,
        color: GOLD_HEX,
        stroke: '#000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // Close hint
    const closeHint = this.scene.add
      .text(pcx + PANEL_W / 2 - 14, pcy + PANEL_H / 2 - 14, '[C] CERRAR', {
        fontSize: '5px',
        fontFamily: FONT,
        color: '#555566',
      })
      .setOrigin(1, 1)
      .setScrollFactor(0);

    this.container.add([
      dim,
      panelBg,
      borderGfx,
      sepGfx,
      titleText,
      this.weekText,
      this.noticeText,
      closeHint,
    ]);
  }

  // ---------------------------------------------------------------------------
  // buildContractCard — builds one contract card at the given Y position
  // ---------------------------------------------------------------------------

  private buildContractCard(
    contract: Contract,
    centerX: number,
    topY: number,
  ): CardElements {
    const elements: CardElements = [];
    const cardX = centerX - CARD_W / 2;
    const cardCY = topY + CARD_H / 2;

    const guildColor    = getGuildColor(contract.guild_id);
    const guildColorHex = getGuildColorHex(contract.guild_id);

    // Card background
    const cardBg = this.scene.add.graphics().setScrollFactor(0);
    cardBg.fillStyle(0x131320, 1);
    cardBg.fillRoundedRect(cardX, topY, CARD_W, CARD_H, 6);
    cardBg.lineStyle(1, guildColor, 0.55);
    cardBg.strokeRoundedRect(cardX, topY, CARD_W, CARD_H, 6);
    elements.push(cardBg);

    // Guild badge
    const badgeX = cardX + 8;
    const badgeY = topY + 7;
    const badgeGfx = this.scene.add.graphics().setScrollFactor(0);
    badgeGfx.fillStyle(guildColor, 0.18);
    badgeGfx.fillRoundedRect(badgeX, badgeY, 68, 13, 3);
    badgeGfx.lineStyle(1, guildColor, 0.5);
    badgeGfx.strokeRoundedRect(badgeX, badgeY, 68, 13, 3);
    elements.push(badgeGfx);

    const badgeLabel = this.scene.add
      .text(badgeX + 34, badgeY + 6.5, contract.guild_id.toUpperCase(), {
        fontSize: '4px',
        fontFamily: FONT,
        color: guildColorHex,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    elements.push(badgeLabel);

    // Title
    const titleText = this.scene.add
      .text(cardX + 86, topY + 13, contract.title, {
        fontSize: '6px',
        fontFamily: FONT,
        color: '#E8E8F0',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    elements.push(titleText);

    // Description (truncated)
    const maxDescLen = 52;
    const desc =
      contract.description.length > maxDescLen
        ? contract.description.slice(0, maxDescLen - 1) + '…'
        : contract.description;
    const descText = this.scene.add
      .text(cardX + 10, topY + 31, desc, {
        fontSize: '5px',
        fontFamily: FONT,
        color: '#666677',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    elements.push(descText);

    // Progress bar
    const barX = cardX + 10;
    const barY = topY + 48;
    const barW = 200;
    const barH = 8;
    const ratio = Math.min(1, contract.progress / Math.max(1, contract.objective.quantity));
    const fillW = Math.max(0, Math.floor(ratio * barW));
    const fillColor = contract.completed ? 0x39ff14 : 0x4a9ecc;

    const barBg = this.scene.add.graphics().setScrollFactor(0);
    barBg.fillStyle(0x1e1e30, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, 3);
    elements.push(barBg);

    if (fillW > 0) {
      const barFill = this.scene.add.graphics().setScrollFactor(0);
      barFill.fillStyle(fillColor, 1);
      barFill.fillRoundedRect(barX, barY, fillW, barH, 3);
      elements.push(barFill);
    }

    // Progress text
    const progressText = this.scene.add
      .text(barX + barW + 8, barY + barH / 2, `${contract.progress}/${contract.objective.quantity}`, {
        fontSize: '5px',
        fontFamily: FONT,
        color: '#888899',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    elements.push(progressText);

    // Rewards
    const rewardStr = `${contract.reward_tenks.toLocaleString('es-AR')}T  ${contract.reward_xp}XP`;
    const rewardText = this.scene.add
      .text(cardX + 10, cardCY + 18, rewardStr, {
        fontSize: '5px',
        fontFamily: FONT,
        color: GOLD_HEX,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    elements.push(rewardText);

    // RECLAMAR button — only when completed and not yet claimed
    if (contract.completed && !contract.reward_claimed) {
      const btnW  = 88;
      const btnH  = 18;
      const btnX  = cardX + CARD_W - btnW - 10;
      const btnCY = cardCY + 18;

      const btnBg = this.scene.add
        .rectangle(btnX + btnW / 2, btnCY, btnW, btnH, 0x1a3a1a, 1)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      btnBg.setStrokeStyle(1, 0x39ff14, 0.9);
      elements.push(btnBg);

      const btnLabel = this.scene.add
        .text(btnX + btnW / 2, btnCY, 'RECLAMAR', {
          fontSize: '5px',
          fontFamily: FONT,
          color: '#39FF14',
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      elements.push(btnLabel);

      const contractId = contract.id;

      btnBg.on('pointerover', () => btnBg.setFillStyle(0x245a24, 1));
      btnBg.on('pointerout',  () => btnBg.setFillStyle(0x1a3a1a, 1));

      btnBg.on('pointerdown', () => {
        btnLabel.setText('...');
        btnBg.disableInteractive();

        getContractSystem()
          .claimReward(contractId)
          .then((result) => {
            if (result.success) {
              const msg = result.notice
                ?? (result.reward_tenks !== undefined
                  ? `+${result.reward_tenks.toLocaleString('es-AR')} TENKS`
                  : 'Recompensa reclamada!');
              this.showNotice(msg, '#39FF14');
              // Refresh to hide button
              this.refresh();
            } else {
              btnLabel.setText('RECLAMAR');
              btnBg.setInteractive({ useHandCursor: true });
              this.showNotice(result.error ?? 'Error al reclamar.', '#FF4444');
            }
          })
          .catch(() => {
            btnLabel.setText('RECLAMAR');
            btnBg.setInteractive({ useHandCursor: true });
            this.showNotice('Error de red.', '#FF4444');
          });
      });
    } else if (contract.reward_claimed) {
      // Show claimed badge
      const claimedText = this.scene.add
        .text(cardX + CARD_W - 12, cardCY + 18, '✓ RECLAMADO', {
          fontSize: '5px',
          fontFamily: FONT,
          color: '#555566',
        })
        .setOrigin(1, 0.5)
        .setScrollFactor(0);
      elements.push(claimedText);
    }

    return elements;
  }

  // ---------------------------------------------------------------------------
  // Notice helper — auto-clears after 2.5 s
  // ---------------------------------------------------------------------------

  private showNotice(msg: string, color: string): void {
    this.noticeText?.setText(msg).setColor(color);
    this.scene.time.delayedCall(2500, () => {
      if (this.visible) this.noticeText?.setText('');
    });
  }
}
