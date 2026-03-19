// QuestPanel.ts
// In-game overlay for daily quests. Toggle with key Q.
// Architecture mirrors ContractPanel.

import Phaser from 'phaser';
import { getQuestSystem } from './QuestSystem';
import type { DailyQuest } from './QuestSystem';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PANEL_DEPTH = 9300;
const PANEL_W     = 500;
const PANEL_H     = 440;
const CARD_W      = 478;
const CARD_H      = 100;
const CARD_GAP_Y  = 8;
const FONT        = '"Press Start 2P", monospace';
const BG_COLOR    = 0x0d0d14;
const GOLD        = 0xf5c842;
const GOLD_HEX    = '#F5C842';

// ---------------------------------------------------------------------------
// Skill accent colors
// ---------------------------------------------------------------------------

const SKILL_COLORS: Record<string, number> = {
  mining:    0xc8a45a,
  fishing:   0x4a9ecc,
  gardening: 0x4caf50,
  weed:      0x7ec850,
  gym:       0xff6a6a,
  cooking:   0xff7043,
};

const SKILL_COLORS_HEX: Record<string, string> = {
  mining:    '#C8A45A',
  fishing:   '#4A9ECC',
  gardening: '#4CAF50',
  weed:      '#7EC850',
  gym:       '#FF6A6A',
  cooking:   '#FF7043',
};

function skillColor(skillId: string): number {
  return SKILL_COLORS[skillId] ?? 0x888888;
}

function skillColorHex(skillId: string): string {
  return SKILL_COLORS_HEX[skillId] ?? '#888888';
}

// ---------------------------------------------------------------------------
// Card element refs (for destroy on refresh)
// ---------------------------------------------------------------------------

type CardElements = Phaser.GameObjects.GameObject[];

// ---------------------------------------------------------------------------
// QuestPanel
// ---------------------------------------------------------------------------

export class QuestPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible = false;

  private footerText?: Phaser.GameObjects.Text;
  private allCompleteText?: Phaser.GameObjects.Text;
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
  // refresh — re-reads quests and rebuilds cards
  // ---------------------------------------------------------------------------

  private refresh(): void {
    for (const group of this.cardElements) {
      for (const obj of group) {
        if ((obj as Phaser.GameObjects.GameObject & { active?: boolean }).active !== false) {
          obj.destroy();
        }
      }
    }
    this.cardElements = [];

    const quests = getQuestSystem().getQuests();
    const { width, height } = this.scene.scale;
    const panelTop = height / 2 - PANEL_H / 2;
    const listStartY = panelTop + 72;

    const visible = quests.slice(0, 3);

    visible.forEach((quest, i) => {
      const yOffset = listStartY + i * (CARD_H + CARD_GAP_Y);
      const elements = this.buildQuestCard(quest, width / 2, yOffset);
      this.cardElements.push(elements);
      this.container.add(elements);
    });

    if (visible.length === 0) {
      const noQuestsText = this.scene.add
        .text(width / 2, height / 2, 'Sin misiones hoy. Volvé mañana!', {
          fontSize: '7px',
          fontFamily: FONT,
          color: '#555566',
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      this.cardElements.push([noQuestsText]);
      this.container.add(noQuestsText);
    }

    // All-completed banner
    const allDone = quests.length > 0 && quests.every((q) => q.completed);
    if (this.allCompleteText) {
      this.allCompleteText.setVisible(allDone);
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

    // Separator below title
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
    this.scene.add
      .text(pcx - PANEL_W / 2 + 18, pcy - PANEL_H / 2 + 22, 'MISIONES DEL DIA', {
        fontSize: '9px',
        fontFamily: FONT,
        color: GOLD_HEX,
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);

    // "Reset" label top-right
    this.scene.add
      .text(pcx + PANEL_W / 2 - 18, pcy - PANEL_H / 2 + 22, 'reset 00:00 UTC', {
        fontSize: '5px',
        fontFamily: FONT,
        color: '#444455',
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0);

    // All-completed banner (hidden by default)
    this.allCompleteText = this.scene.add
      .text(pcx, pcy - PANEL_H / 2 + 33, 'TODAS COMPLETADAS! +50T BONUS', {
        fontSize: '6px',
        fontFamily: FONT,
        color: '#39FF14',
        stroke: '#000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setVisible(false);

    // Footer — close hint
    this.footerText = this.scene.add
      .text(pcx + PANEL_W / 2 - 14, pcy + PANEL_H / 2 - 14, '[Q] CERRAR', {
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
      this.allCompleteText,
      this.footerText,
    ]);
  }

  // ---------------------------------------------------------------------------
  // buildQuestCard — one quest card at the given Y position
  // ---------------------------------------------------------------------------

  private buildQuestCard(
    quest: DailyQuest,
    centerX: number,
    topY: number,
  ): CardElements {
    const elements: CardElements = [];
    const cardX = centerX - CARD_W / 2;
    const cardCY = topY + CARD_H / 2;
    const accentColor    = skillColor(quest.skill_id);
    const accentColorHex = skillColorHex(quest.skill_id);

    // Card background
    const cardBg = this.scene.add.graphics().setScrollFactor(0);
    cardBg.fillStyle(0x131320, 1);
    cardBg.fillRoundedRect(cardX, topY, CARD_W, CARD_H, 6);
    cardBg.lineStyle(1, accentColor, quest.completed ? 0.8 : 0.45);
    cardBg.strokeRoundedRect(cardX, topY, CARD_W, CARD_H, 6);
    elements.push(cardBg);

    // Icon + skill badge
    const badgeX = cardX + 8;
    const badgeY = topY + 7;
    const badgeGfx = this.scene.add.graphics().setScrollFactor(0);
    badgeGfx.fillStyle(accentColor, 0.15);
    badgeGfx.fillRoundedRect(badgeX, badgeY, 76, 14, 3);
    badgeGfx.lineStyle(1, accentColor, 0.5);
    badgeGfx.strokeRoundedRect(badgeX, badgeY, 76, 14, 3);
    elements.push(badgeGfx);

    const badgeLabel = this.scene.add
      .text(badgeX + 38, badgeY + 7, `${quest.icon} ${quest.skill_id.toUpperCase()}`, {
        fontSize: '4px',
        fontFamily: FONT,
        color: accentColorHex,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    elements.push(badgeLabel);

    // Quest label (truncated to fit)
    const maxLen = 54;
    const labelText =
      quest.label.length > maxLen
        ? quest.label.slice(0, maxLen - 1) + '…'
        : quest.label;
    const questLabel = this.scene.add
      .text(cardX + 94, topY + 14, labelText, {
        fontSize: '6px',
        fontFamily: FONT,
        color: quest.completed ? '#555566' : '#E8E8F0',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    elements.push(questLabel);

    // Progress bar
    const barX = cardX + 10;
    const barY = topY + 42;
    const barW = 220;
    const barH = 8;
    const ratio = Math.min(1, quest.progress / Math.max(1, quest.target));
    const fillW = Math.max(0, Math.floor(ratio * barW));
    const fillColor = quest.completed ? 0x39ff14 : accentColor;

    const barBg = this.scene.add.graphics().setScrollFactor(0);
    barBg.fillStyle(0x1e1e30, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, 3);
    elements.push(barBg);

    if (fillW > 0) {
      const barFill = this.scene.add.graphics().setScrollFactor(0);
      barFill.fillStyle(fillColor, quest.completed ? 0.7 : 1);
      barFill.fillRoundedRect(barX, barY, fillW, barH, 3);
      elements.push(barFill);
    }

    // Progress counter
    const progressLabel = this.scene.add
      .text(barX + barW + 8, barY + barH / 2, `${quest.progress}/${quest.target}`, {
        fontSize: '5px',
        fontFamily: FONT,
        color: quest.completed ? '#555566' : '#888899',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    elements.push(progressLabel);

    // Reward line
    const rewardStr = `${quest.reward_tenks.toLocaleString('es-AR')}T  ${quest.reward_xp}XP`;
    const rewardText = this.scene.add
      .text(cardX + 10, cardCY + 20, rewardStr, {
        fontSize: '5px',
        fontFamily: FONT,
        color: quest.completed ? '#444455' : GOLD_HEX,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    elements.push(rewardText);

    // Status badge (completed / in-progress)
    if (quest.completed) {
      const completedBadge = this.scene.add
        .text(cardX + CARD_W - 14, cardCY + 20, '✓ COMPLETADA', {
          fontSize: '5px',
          fontFamily: FONT,
          color: '#39FF14',
        })
        .setOrigin(1, 0.5)
        .setScrollFactor(0);
      elements.push(completedBadge);
    }

    return elements;
  }
}
