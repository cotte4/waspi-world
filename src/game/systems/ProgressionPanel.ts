// ProgressionPanel.ts
// Panel [I] — muestra nivel general del jugador, barra XP, bonus de armas y kills.

import {
  loadProgressionState,
  getLevelMilestones,
  getMaxProgressionLevel,
} from './ProgressionSystem';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_DEPTH = 9000;
const PANEL_W = 520;
const PANEL_H = 320;

const BG_COLOR     = 0x0d0d14;
const BORDER_COLOR = 0xf5c842;
const ACCENT_COLOR = 0xf5c842;
const BAR_BG_COLOR = 0x1e1e2e;
const BAR_COLOR    = 0x46b3ff;

const FONT = '"Press Start 2P", monospace';

// ---------------------------------------------------------------------------
// ProgressionPanel
// ---------------------------------------------------------------------------

export class ProgressionPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible = false;

  // Dynamic text refs
  private levelText!: Phaser.GameObjects.Text;
  private xpText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;
  private dmgBonusText!: Phaser.GameObjects.Text;
  private fireBonusText!: Phaser.GameObjects.Text;
  private nextLevelText!: Phaser.GameObjects.Text;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private xpBarBack!: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0)
      .setDepth(PANEL_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);

    this.build();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    this.refresh();
    this.container.setVisible(true);
    this.visible = true;
  }

  hide(): void {
    this.container.setVisible(false);
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    this.container.destroy();
  }

  // ---------------------------------------------------------------------------
  // Build (once)
  // ---------------------------------------------------------------------------

  private build(): void {
    const { width, height } = this.scene.scale;
    const cx = (width - PANEL_W) / 2;
    const cy = (height - PANEL_H) / 2;

    const add = this.scene.add;

    // Background + border
    const bg = add.graphics();
    bg.fillStyle(BG_COLOR, 0.97);
    bg.fillRect(cx, cy, PANEL_W, PANEL_H);
    bg.lineStyle(2, BORDER_COLOR, 1);
    bg.strokeRect(cx, cy, PANEL_W, PANEL_H);

    // Title
    const title = add.text(cx + PANEL_W / 2, cy + 22, 'PROGRESIÓN', {
      fontFamily: FONT,
      fontSize: '11px',
      color: '#F5C842',
    }).setOrigin(0.5, 0);

    // Hint
    const hint = add.text(cx + PANEL_W - 14, cy + 12, '[I] CERRAR', {
      fontFamily: FONT,
      fontSize: '6px',
      color: '#555566',
    }).setOrigin(1, 0);

    // Divider
    const div = add.graphics();
    div.lineStyle(1, BORDER_COLOR, 0.3);
    div.lineBetween(cx + 16, cy + 48, cx + PANEL_W - 16, cy + 48);

    // ── Level row ────────────────────────────────────────────────────────────
    add.text(cx + 20, cy + 62, 'NIVEL', {
      fontFamily: FONT, fontSize: '8px', color: '#888899',
    });
    this.levelText = add.text(cx + 100, cy + 62, '', {
      fontFamily: FONT, fontSize: '8px', color: '#46B3FF',
    });

    this.killsText = add.text(cx + PANEL_W - 20, cy + 62, '', {
      fontFamily: FONT, fontSize: '8px', color: '#9EFFB7',
    }).setOrigin(1, 0);

    // ── XP bar ────────────────────────────────────────────────────────────────
    const barX = cx + 20;
    const barY = cy + 86;
    const barW = PANEL_W - 40;
    const barH = 10;

    this.xpBarBack = add.rectangle(barX, barY, barW, barH, BAR_BG_COLOR)
      .setOrigin(0, 0);
    this.xpBarFill = add.rectangle(barX, barY, 0, barH, BAR_COLOR)
      .setOrigin(0, 0);

    // XP label below bar
    this.xpText = add.text(barX, barY + 14, '', {
      fontFamily: FONT, fontSize: '7px', color: '#888899',
    });
    this.nextLevelText = add.text(cx + PANEL_W - 20, barY + 14, '', {
      fontFamily: FONT, fontSize: '7px', color: '#555566',
    }).setOrigin(1, 0);

    // ── Divider ───────────────────────────────────────────────────────────────
    const div2 = add.graphics();
    div2.lineStyle(1, 0x333344, 1);
    div2.lineBetween(cx + 16, cy + 122, cx + PANEL_W - 16, cy + 122);

    // ── Bonus section title ───────────────────────────────────────────────────
    add.text(cx + 20, cy + 134, 'BONUS DE ARMAS', {
      fontFamily: FONT, fontSize: '7px', color: '#888899',
    });

    // DMG bonus card
    const card1x = cx + 20;
    const card1y = cy + 156;
    const cardW = (PANEL_W - 56) / 2;
    const cardH = 80;

    const cardBg1 = add.graphics();
    cardBg1.fillStyle(0x141420, 1);
    cardBg1.fillRect(card1x, card1y, cardW, cardH);
    cardBg1.lineStyle(1, 0xef5350, 0.5);
    cardBg1.strokeRect(card1x, card1y, cardW, cardH);

    add.text(card1x + cardW / 2, card1y + 12, 'DAÑO', {
      fontFamily: FONT, fontSize: '7px', color: '#EF5350',
    }).setOrigin(0.5, 0);

    this.dmgBonusText = add.text(card1x + cardW / 2, card1y + 34, '', {
      fontFamily: FONT, fontSize: '14px', color: '#FFFFFF',
    }).setOrigin(0.5, 0);

    add.text(card1x + cardW / 2, card1y + 58, 'POR NIVEL', {
      fontFamily: FONT, fontSize: '6px', color: '#555566',
    }).setOrigin(0.5, 0);

    // Fire rate bonus card
    const card2x = cx + 20 + cardW + 16;
    const card2y = cy + 156;

    const cardBg2 = add.graphics();
    cardBg2.fillStyle(0x141420, 1);
    cardBg2.fillRect(card2x, card2y, cardW, cardH);
    cardBg2.lineStyle(1, 0x39ff14, 0.5);
    cardBg2.strokeRect(card2x, card2y, cardW, cardH);

    add.text(card2x + cardW / 2, card2y + 12, 'CADENCIA', {
      fontFamily: FONT, fontSize: '7px', color: '#39FF14',
    }).setOrigin(0.5, 0);

    this.fireBonusText = add.text(card2x + cardW / 2, card2y + 34, '', {
      fontFamily: FONT, fontSize: '14px', color: '#FFFFFF',
    }).setOrigin(0.5, 0);

    add.text(card2x + cardW / 2, card2y + 58, 'POR NIVEL', {
      fontFamily: FONT, fontSize: '6px', color: '#555566',
    }).setOrigin(0.5, 0);

    this.container.add([
      bg, title, hint, div, div2,
      add.text(cx + 20, cy + 62, '', { fontSize: '0px' }), // spacer
      this.levelText, this.killsText,
      this.xpBarBack, this.xpBarFill,
      this.xpText, this.nextLevelText,
      cardBg1, cardBg2,
      this.dmgBonusText, this.fireBonusText,
    ]);
  }

  // ---------------------------------------------------------------------------
  // Refresh (on every show)
  // ---------------------------------------------------------------------------

  refresh(): void {
    const state = loadProgressionState();
    const milestones = getLevelMilestones();
    const maxLevel = getMaxProgressionLevel();

    const level = state.level;
    const xp = state.xp;
    const kills = state.kills;
    const isMax = level >= maxLevel;

    // Level label
    this.levelText.setText(`${level} / ${maxLevel}`);

    // Kills
    this.killsText.setText(`${kills} KILLS`);

    // XP bar
    const floorXp = milestones[level - 1] ?? 0;
    const ceilXp = milestones[level] ?? floorXp + 1;
    const xpIntoLevel = xp - floorXp;
    const xpNeeded = ceilXp - floorXp;
    const ratio = isMax ? 1 : Math.min(1, Math.max(0, xpIntoLevel / xpNeeded));
    const barW = PANEL_W - 40;
    const fillW = Math.max(2, Math.floor(ratio * barW));

    this.xpBarFill.setDisplaySize(fillW, this.xpBarFill.height);
    if (isMax) {
      this.xpBarFill.setFillStyle(ACCENT_COLOR);
      this.xpText.setText('MAX LEVEL');
      this.nextLevelText.setText('');
    } else {
      this.xpBarFill.setFillStyle(BAR_COLOR);
      this.xpText.setText(`${xpIntoLevel} / ${xpNeeded} XP`);
      this.nextLevelText.setText(`FALTA ${xpNeeded - xpIntoLevel} XP`);
    }

    // Damage bonus: +5% per level above 1
    const lvl = level - 1;
    const dmgPct = Math.round(lvl * 5);
    this.dmgBonusText.setText(`+${dmgPct}%`);
    this.dmgBonusText.setColor(lvl === 0 ? '#555566' : '#FFFFFF');

    // Fire rate bonus: -3% per level delay (converted to +cadencia display)
    const delayMult = Math.max(0.55, 1 - lvl * 0.03);
    const firePct = Math.round((1 - delayMult) * 100);
    this.fireBonusText.setText(`+${firePct}%`);
    this.fireBonusText.setColor(lvl === 0 ? '#555566' : '#FFFFFF');
  }
}
