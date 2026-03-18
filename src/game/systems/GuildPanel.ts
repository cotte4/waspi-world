// GuildPanel.ts
// In-game overlay for guild membership and rep. Toggle with key G.
// Architecture mirrors ContractPanel.

import Phaser from 'phaser';
import type { GuildRank } from '../config/guilds';
import { GUILD_RANK_ORDER, RANK_THRESHOLDS as GUILD_REP_THRESHOLDS } from '../config/guilds';
import {
  getGuildSystem,
} from './GuildSystem';
import type { GuildId, GuildWithRep } from './GuildSystem';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PANEL_DEPTH = 9200;
const PANEL_W     = 600;
const PANEL_H     = 500;
const CARD_W      = 576;
const CARD_H      = 96;
const CARD_GAP_Y  = 8;
const MAX_GUILDS  = 4;
const MAX_MEMBERSHIPS = 2;

const FONT_HUD  = 'monospace';
const FONT_BODY = 'monospace';
const BG_COLOR  = 0x0e0e14;
const GOLD      = 0xf5c842;
const GOLD_HEX  = '#F5C842';
const GREEN_HEX = '#4CAF50';
const DIM_ALPHA = 0.78;

// ---------------------------------------------------------------------------
// Helper — parse a CSS hex color string (e.g. '#F5C842') to a Phaser hex int
// ---------------------------------------------------------------------------

function hexStrToInt(hex: string): number {
  const cleaned = hex.replace('#', '');
  const parsed  = parseInt(cleaned, 16);
  return isNaN(parsed) ? 0x888888 : parsed;
}

// ---------------------------------------------------------------------------
// Rank thresholds for the rep progress bar
// ---------------------------------------------------------------------------

function getRepToNextThreshold(rank: GuildRank, rep: number): {
  current: number;
  needed: number;
} {
  const rankIndex = GUILD_RANK_ORDER.indexOf(rank);
  const nextRank  = GUILD_RANK_ORDER[rankIndex + 1];

  if (!nextRank) {
    // Max rank — full bar
    return { current: 1, needed: 1 };
  }

  const fromRep = GUILD_REP_THRESHOLDS[rank];
  const toRep   = GUILD_REP_THRESHOLDS[nextRank];
  const current = Math.max(0, rep - fromRep);
  const needed  = Math.max(1, toRep - fromRep);
  return { current, needed };
}

// ---------------------------------------------------------------------------
// Type alias for panel-internal game objects
// ---------------------------------------------------------------------------

type CardElements = Phaser.GameObjects.GameObject[];

// ---------------------------------------------------------------------------
// GuildPanel
// ---------------------------------------------------------------------------

export class GuildPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible = false;

  private noticeText?: Phaser.GameObjects.Text;
  private cardElements: CardElements[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setDepth(PANEL_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);

    this.buildSkeleton();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  show(): void {
    this.build();
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
  // build — (re)draws guild cards; called on show() and after joinGuild()
  // ---------------------------------------------------------------------------

  private build(): void {
    // Destroy existing card elements
    for (const group of this.cardElements) {
      for (const obj of group) obj.destroy();
    }
    this.cardElements = [];

    const guilds = getGuildSystem().getGuilds();
    const memberCount = getGuildSystem().getMemberCount();

    const { width, height } = this.scene.scale;
    const panelTop  = height / 2 - PANEL_H / 2;
    const listStartY = panelTop + 68;

    const visible = guilds.slice(0, MAX_GUILDS);

    visible.forEach((guild, i) => {
      const yOffset = listStartY + i * (CARD_H + CARD_GAP_Y);
      const elements = this.buildGuildCard(guild, width / 2, yOffset, memberCount);
      this.cardElements.push(elements);
      this.container.add(elements);
    });

    if (visible.length === 0) {
      const { width: w, height: h } = this.scene.scale;
      const emptyText = this.scene.add
        .text(w / 2, h / 2, 'Sin gremios disponibles.', {
          fontFamily: FONT_BODY,
          fontSize: '10px',
          color: '#555566',
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      this.cardElements.push([emptyText]);
      this.container.add(emptyText);
    }
  }

  // ---------------------------------------------------------------------------
  // refresh — alias used after join; redraws cards
  // ---------------------------------------------------------------------------

  private refresh(): void {
    this.build();
  }

  // ---------------------------------------------------------------------------
  // buildSkeleton — static chrome drawn once (bg, border, title, hint, notice)
  // ---------------------------------------------------------------------------

  private buildSkeleton(): void {
    const { width, height } = this.scene.scale;
    const pcx = width  / 2;
    const pcy = height / 2;

    // Dimmer
    const dim = this.scene.add
      .rectangle(pcx, pcy, width, height, 0x000000, DIM_ALPHA)
      .setScrollFactor(0);

    // Panel background
    const panelBg = this.scene.add
      .rectangle(pcx, pcy, PANEL_W, PANEL_H, BG_COLOR, 0.97)
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
      .text(pcx - PANEL_W / 2 + 18, pcy - PANEL_H / 2 + 22, 'GREMIOS', {
        fontFamily: FONT_HUD,
        fontSize: '11px',
        color: GOLD_HEX,
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);

    // Close hint
    this.scene.add
      .text(pcx + PANEL_W / 2 - 14, pcy - PANEL_H / 2 + 22, '[G] CERRAR', {
        fontFamily: FONT_HUD,
        fontSize: '9px',
        color: '#555566',
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0);

    // Notice text (bottom of panel)
    this.noticeText = this.scene.add
      .text(pcx, pcy + PANEL_H / 2 - 20, '', {
        fontFamily: FONT_HUD,
        fontSize: '9px',
        color: GOLD_HEX,
        stroke: '#000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.container.add([
      dim,
      panelBg,
      borderGfx,
      sepGfx,
      this.noticeText,
    ]);
  }

  // ---------------------------------------------------------------------------
  // buildGuildCard — one card per guild
  // ---------------------------------------------------------------------------

  private buildGuildCard(
    guild: GuildWithRep,
    centerX: number,
    topY: number,
    memberCount: number,
  ): CardElements {
    const elements: CardElements = [];
    const cardX  = centerX - CARD_W / 2;
    const cardCY = topY + CARD_H / 2;

    const guildColorInt = hexStrToInt(guild.color);
    const membership    = guild.player_rep;
    const isMember      = membership !== null;
    const atLimit       = !isMember && memberCount >= MAX_MEMBERSHIPS;

    // ── Card background ──────────────────────────────────────────────────────
    const cardBg = this.scene.add.graphics().setScrollFactor(0);
    cardBg.fillStyle(0x131320, 1);
    cardBg.fillRoundedRect(cardX, topY, CARD_W, CARD_H, 6);
    cardBg.lineStyle(1, guildColorInt, isMember ? 0.8 : 0.35);
    cardBg.strokeRoundedRect(cardX, topY, CARD_W, CARD_H, 6);
    elements.push(cardBg);

    // ── Icon + Name ──────────────────────────────────────────────────────────
    const iconText = this.scene.add
      .text(cardX + 14, topY + 14, guild.icon, {
        fontFamily: FONT_BODY,
        fontSize: '16px',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    elements.push(iconText);

    const nameText = this.scene.add
      .text(cardX + 42, topY + 14, guild.name.toUpperCase(), {
        fontFamily: FONT_HUD,
        fontSize: '11px',
        color: guild.color,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    elements.push(nameText);

    // ── Tagline ──────────────────────────────────────────────────────────────
    const taglineText = this.scene.add
      .text(cardX + 42, topY + 30, guild.tagline, {
        fontFamily: FONT_BODY,
        fontSize: '9px',
        color: '#888899',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    elements.push(taglineText);

    // ── Rep / Rank area ───────────────────────────────────────────────────────
    if (isMember && membership) {
      const rank    = membership.rank;
      const rep     = membership.rep;
      const rankStr = rank.toUpperCase();

      const repLabel = this.scene.add
        .text(cardX + 14, topY + 52, `Rep: ${rep}  |  Rango: ${rankStr}`, {
          fontFamily: FONT_BODY,
          fontSize: '9px',
          color: '#B0B0C0',
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0);
      elements.push(repLabel);

      // Rep bar
      const barX = cardX + 14;
      const barY = topY + 64;
      const barW = 260;
      const barH = 7;

      const { current, needed } = getRepToNextThreshold(rank, rep);
      const ratio  = Math.min(1, current / needed);
      const fillW  = Math.max(0, Math.floor(ratio * barW));

      const barBg = this.scene.add.graphics().setScrollFactor(0);
      barBg.fillStyle(0x2a2a3a, 1);
      barBg.fillRoundedRect(barX, barY, barW, barH, 3);
      elements.push(barBg);

      if (fillW > 0) {
        const barFill = this.scene.add.graphics().setScrollFactor(0);
        barFill.fillStyle(guildColorInt, 1);
        barFill.fillRoundedRect(barX, barY, fillW, barH, 3);
        elements.push(barFill);
      }

      // Next rank label
      const rankIndex = GUILD_RANK_ORDER.indexOf(rank);
      const nextRank  = GUILD_RANK_ORDER[rankIndex + 1];
      const nextLabel = nextRank
        ? `→ ${nextRank.toUpperCase()} (${GUILD_REP_THRESHOLDS[nextRank]} rep)`
        : '★ RANGO MÁXIMO';

      const nextRankText = this.scene.add
        .text(barX + barW + 8, barY + barH / 2, nextLabel, {
          fontFamily: FONT_BODY,
          fontSize: '8px',
          color: '#555566',
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0);
      elements.push(nextRankText);

      // "MIEMBRO ✓" badge
      const memberBadge = this.scene.add
        .text(cardX + CARD_W - 14, topY + 14, '✓ MIEMBRO', {
          fontFamily: FONT_HUD,
          fontSize: '9px',
          color: GREEN_HEX,
        })
        .setOrigin(1, 0.5)
        .setScrollFactor(0);
      elements.push(memberBadge);
    } else {
      // Not a member — show rep as 0
      const noRepLabel = this.scene.add
        .text(cardX + 14, topY + 52, 'Rep: 0  |  No eres miembro', {
          fontFamily: FONT_BODY,
          fontSize: '9px',
          color: '#555566',
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0);
      elements.push(noRepLabel);
    }

    // ── skill_id label ────────────────────────────────────────────────────────
    const skillLabel = this.scene.add
      .text(cardX + CARD_W - 14, topY + 52, `Habilidad: ${guild.skill_id}`, {
        fontFamily: FONT_BODY,
        fontSize: '8px',
        color: '#444455',
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0);
    elements.push(skillLabel);

    // ── UNIRSE / disabled button ──────────────────────────────────────────────
    if (!isMember) {
      const btnW  = 90;
      const btnH  = 20;
      const btnX  = cardX + CARD_W - btnW - 14;
      const btnCY = cardCY + 22;

      const btnColor   = atLimit ? 0x222230 : 0x2a2a3a;
      const btnBorder  = atLimit ? 0x444455 : GOLD;
      const btnTxtCol  = atLimit ? '#555566' : '#FFFFFF';
      const btnLabel   = atLimit ? 'LLENO' : 'UNIRSE';

      const btnBg = this.scene.add
        .rectangle(btnX + btnW / 2, btnCY, btnW, btnH, btnColor, 1)
        .setScrollFactor(0);
      btnBg.setStrokeStyle(1, btnBorder, 1);

      if (!atLimit) {
        btnBg.setInteractive({ useHandCursor: true });
        btnBg.on('pointerover', () => btnBg.setFillStyle(0x3a3a50, 1));
        btnBg.on('pointerout',  () => btnBg.setFillStyle(0x2a2a3a, 1));

        const guildId = guild.id as GuildId;

        btnBg.on('pointerdown', () => {
          btnText.setText('...');
          btnBg.disableInteractive();

          getGuildSystem()
            .joinGuild(guildId)
            .then((result) => {
              // Guard: panel or container may have been destroyed while awaiting
              if (!this.container || !this.container.scene) return;
              if (result.success) {
                const msg = result.notice ?? `¡Te uniste a ${guild.name}!`;
                this.showNotice(msg, GREEN_HEX);
                this.refresh();
              } else {
                if (!btnText.active) return;
                btnText.setText(btnLabel);
                btnBg.setInteractive({ useHandCursor: true });
                this.showNotice(result.error ?? 'Error al unirse.', '#FF4444');
              }
            })
            .catch(() => {
              if (!this.container || !this.container.scene) return;
              if (!btnText.active) return;
              btnText.setText(btnLabel);
              btnBg.setInteractive({ useHandCursor: true });
              this.showNotice('Error de red.', '#FF4444');
            });
        });
      }

      elements.push(btnBg);

      const btnText = this.scene.add
        .text(btnX + btnW / 2, btnCY, btnLabel, {
          fontFamily: FONT_HUD,
          fontSize: '9px',
          color: btnTxtCol,
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      elements.push(btnText);
    }

    return elements;
  }

  // ---------------------------------------------------------------------------
  // showNotice — auto-clears after 2 s
  // ---------------------------------------------------------------------------

  private showNotice(msg: string, color: string): void {
    this.noticeText?.setText(msg).setColor(color);
    this.scene.time.delayedCall(2000, () => {
      if (this.visible) this.noticeText?.setText('');
    });
  }
}
