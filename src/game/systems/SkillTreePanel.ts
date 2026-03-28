// SkillTreePanel.ts
// In-game overlay panel that displays the player's 6 skill trees.
// Built with Phaser GameObjects (no DOM). Fixed to camera via setScrollFactor(0).

import { getSkillSystem } from './SkillSystem';
import type { SkillId } from './SkillSystem';
import { getSkillDef, getXpForNextLevel, ALL_SKILL_IDS, SKILL_XP_THRESHOLDS } from '../config/skillTrees';
import type { MilestoneDef } from '../config/skillTrees';
import { getSpecsForSkill, type SpecDef } from '../config/specializations';
import { eventBus, EVENTS } from '../config/eventBus';
import type { SynergyDef } from '../config/synergies';
import { getAuthHeaders } from './authHelper';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_DEPTH = 9000;
const PANEL_W = 760;
const PANEL_H = 520;

const BG_COLOR      = 0x0d0d14;
const BORDER_COLOR  = 0xf5c842;
const CARD_BG_COLOR = 0x141420;

const FONT = '"Press Start 2P", monospace';

const SKILL_COLORS: Record<SkillId, number> = {
  mining:    0xc8a45a,
  fishing:   0x4a9ecc,
  gardening: 0x4caf50,
  cooking:   0xff7043,
  gym:       0xef5350,
  weed:      0x66bb6a,
};

const SKILL_COLORS_HEX: Record<SkillId, string> = {
  mining:    '#C8A45A',
  fishing:   '#4A9ECC',
  gardening: '#4CAF50',
  cooking:   '#FF7043',
  gym:       '#EF5350',
  weed:      '#66BB6A',
};

// Card grid layout
const CARD_W = 220;
const CARD_H = 200;
const GRID_COLS = 3;
const GRID_GAP_X = 16;
const GRID_GAP_Y = 14;

// ---------------------------------------------------------------------------
// Types for milestone fetch
// ---------------------------------------------------------------------------

interface CompletedMilestone {
  skill_id: string;
  milestone_id: string;
  reached_at: string;
}

// ---------------------------------------------------------------------------
// SkillTreePanel
// ---------------------------------------------------------------------------

export class SkillTreePanel {
  private container: Phaser.GameObjects.Container;
  private scene: Phaser.Scene;
  private visible = false;

  // Dynamic elements refreshed on every show()
  private cardGraphics: Phaser.GameObjects.Graphics[] = [];
  private cardTexts: Phaser.GameObjects.Text[][] = [];
  private xpBarFills: Phaser.GameObjects.Rectangle[] = [];
  private xpBarBacks: Phaser.GameObjects.Rectangle[] = [];

  // Milestone progress row (per card)
  private milestoneLabels: Phaser.GameObjects.Text[] = [];
  private milestoneBarBacks: Phaser.GameObjects.Rectangle[] = [];
  private milestoneBarFills: Phaser.GameObjects.Rectangle[] = [];

  // Specialization modal state
  private specModal?: Phaser.GameObjects.Container;
  private specModalVisible = false;
  private specBadges: (Phaser.GameObjects.Text | null)[] = [];

  // Synergy display
  private synergyRows: Phaser.GameObjects.Text[] = [];
  private synergyContainer?: Phaser.GameObjects.Container;

  // Per-card synergy active badges (index matches ALL_SKILL_IDS order)
  private synBadges: (Phaser.GameObjects.Text | null)[] = [];

  // Tab state
  private activeTab: 'skills' | 'logros' = 'skills';
  private tabSkillsBtn?: Phaser.GameObjects.Text;
  private tabLogrosBtn?: Phaser.GameObjects.Text;
  private tabSkillsBg?: Phaser.GameObjects.Rectangle;
  private tabLogrosBg?: Phaser.GameObjects.Rectangle;
  private tabSkillsLine?: Phaser.GameObjects.Graphics;
  private tabLogrosLine?: Phaser.GameObjects.Graphics;
  private logrosBadge?: Phaser.GameObjects.Text;

  // Skills view container (card grid + synergy strip)
  private skillsView?: Phaser.GameObjects.Container;

  // Logros view container (rebuilt on each open)
  private logrosView?: Phaser.GameObjects.Container;

  // Milestone data
  private completedMilestones: CompletedMilestone[] = [];
  private milestonesLoaded = false;
  private milestonesLoading = false;
  // milestones newly unlocked this session (tracked by milestone_id)
  private sessionNewMilestones: Set<string> = new Set();
  // milestones that were known-completed when the panel first opened this session
  private knownMilestonesOnOpen: Set<string> = new Set();

  // ---------------------------------------------------------------------------
  // Constructor — builds the full panel DOM once
  // ---------------------------------------------------------------------------

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0)
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
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Re-reads SkillSystem data and redraws all card elements.
   * Called every time show() is invoked, and can also be called manually.
   */
  refresh(): void {
    const sys = getSkillSystem();

    ALL_SKILL_IDS.forEach((skillId, index) => {
      const level       = sys.getLevel(skillId);
      const xp          = sys.getXp(skillId);
      const actionCount = sys.getActionCount(skillId);
      const def         = getSkillDef(skillId);
      const isMax       = level >= 6;
      const texts       = this.cardTexts[index];
      const barFill     = this.xpBarFills[index];
      const barBack     = this.xpBarBacks[index];
      const msLabel     = this.milestoneLabels[index];
      const msBarFill   = this.milestoneBarFills[index];
      const msBarBack   = this.milestoneBarBacks[index];

      if (!texts || !barFill || !barBack) return;

      const colorHex = SKILL_COLORS_HEX[skillId];

      // [0] level text e.g. "LV 3"
      texts[0].setText(level === 0 ? 'LV 0' : `LV ${level}`).setColor(colorHex);

      // [1] title — current level's title, or "Inactivo" if level 0
      const title = level === 0
        ? 'Inactivo'
        : sys.getTitle(skillId);
      texts[1].setText(title.toUpperCase()).setColor(colorHex);

      // [2] xp text / MAX LEVEL label
      if (isMax) {
        texts[2].setText('MAX LEVEL').setColor('#F5C842');
      } else {
        const nextThreshold = getXpForNextLevel(level);
        const prevThreshold = level === 0 ? 0 : (SKILL_XP_THRESHOLDS[level - 1] as number);
        const xpIntoLevel = xp - prevThreshold;
        const xpNeeded    = nextThreshold !== null ? nextThreshold - prevThreshold : 1;
        texts[2].setText(`${xpIntoLevel} / ${xpNeeded} XP`).setColor('#888899');
      }

      // [3] next unlock preview
      if (isMax) {
        texts[3].setText('').setColor('#888899');
      } else {
        const nextLevelDef = def.levels.find((l) => l.level === level + 1);
        if (nextLevelDef) {
          const previewName = nextLevelDef.name.toUpperCase();
          texts[3].setText(`NEXT: ${previewName}`).setColor('#888899');
        } else {
          texts[3].setText('').setColor('#888899');
        }
      }

      // XP bar fill
      const barW = CARD_W - 28; // total bar width (matches barBack)
      if (isMax) {
        barFill.setDisplaySize(barW, barFill.height).setFillStyle(0xf5c842, 1);
      } else {
        const nextThreshold = getXpForNextLevel(level);
        const prevThreshold = level === 0 ? 0 : (SKILL_XP_THRESHOLDS[level - 1] as number);
        const xpIntoLevel = xp - prevThreshold;
        const xpNeeded    = nextThreshold !== null ? nextThreshold - prevThreshold : 1;
        const ratio       = Math.min(1, Math.max(0, xpIntoLevel / xpNeeded));
        const fillW       = Math.max(2, Math.floor(ratio * barW));
        barFill.setDisplaySize(fillW, barFill.height).setFillStyle(SKILL_COLORS[skillId], 1);
      }

      // Milestone progress bar
      if (msLabel && msBarFill && msBarBack) {
        const nextMs = def.milestones.find((m) => actionCount < m.count);
        const msBarW = CARD_W - 44;
        if (nextMs) {
          const ratio = Math.min(1, actionCount / nextMs.count);
          const fillW = Math.max(2, Math.floor(ratio * msBarW));
          const pct = Math.floor(ratio * 100);
          msLabel.setText(`${actionCount}/${nextMs.count} ${nextMs.name.toUpperCase()}`).setColor('#555577');
          msBarFill.setDisplaySize(fillW, 3).setFillStyle(0x4a4a8a, 1);
          msBarBack.setVisible(true);
          msBarFill.setVisible(true);
          // Flash gold when near (≥80%)
          if (pct >= 80) {
            msLabel.setColor('#c8a45a');
            msBarFill.setFillStyle(0xc8a45a, 1);
          }
        } else {
          // All milestones done
          msLabel.setText('TODOS LOGROS').setColor('#F5C842');
          msBarFill.setDisplaySize(msBarW, 3).setFillStyle(0xf5c842, 1);
          msBarBack.setVisible(true);
          msBarFill.setVisible(true);
        }
      }

      // Redraw card border with correct color (highlight if non-zero level)
      const gfx = this.cardGraphics[index];
      if (gfx) {
        const { cx, cy } = this.cardPosition(index);
        const borderCol = level > 0 ? SKILL_COLORS[skillId] : 0x2a2a3a;
        gfx.clear();
        gfx.fillStyle(CARD_BG_COLOR, 1);
        gfx.fillRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 8);
        gfx.lineStyle(2, borderCol, level > 0 ? 0.9 : 0.5);
        gfx.strokeRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 8);
      }

      // Spec badge visibility
      const badge = this.specBadges[index];
      if (badge) {
        const hasSpec = !!getSkillSystem().getSpec(skillId);
        const isLv3 = level >= 3;
        badge.setVisible(isLv3 && !hasSpec);
      }

      // Synergy badge — show when this skill participates in at least one active synergy
      const synBadge = this.synBadges[index];
      if (synBadge) {
        const activeSynergies = getSkillSystem().getActiveSynergies();
        const inActiveSynergy = activeSynergies.some((syn) =>
          syn.requires.some((req) => req.skillId === skillId),
        );
        synBadge.setVisible(inActiveSynergy);
      }
    });

    this.refreshSynergies();
  }

  destroy(): void {
    this.closeSpecModal();
    this.container.destroy();
  }

  // ---------------------------------------------------------------------------
  // Layout helpers
  // ---------------------------------------------------------------------------

  private cardPosition(index: number): { cx: number; cy: number } {
    const { width, height } = this.scene.scale;
    const panelLeft  = width  / 2 - PANEL_W / 2;
    const panelTop   = height / 2 - PANEL_H / 2;

    // Cards start below the title bar (50px) + tab row (28px) with padding
    const gridOriginX = panelLeft + (PANEL_W - (GRID_COLS * CARD_W + (GRID_COLS - 1) * GRID_GAP_X)) / 2 + CARD_W / 2;
    const gridOriginY = panelTop  + 74 + CARD_H / 2;

    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);

    const cx = gridOriginX + col * (CARD_W + GRID_GAP_X);
    const cy = gridOriginY + row * (CARD_H + GRID_GAP_Y);

    return { cx, cy };
  }

  // ---------------------------------------------------------------------------
  // Build — called once in constructor
  // ---------------------------------------------------------------------------

  private buildPanel(): void {
    const { width, height } = this.scene.scale;
    const cx = width  / 2;
    const cy = height / 2;

    // Full-screen dim overlay
    const overlay = this.scene.add.rectangle(cx, cy, width, height, 0x000000, 0.72)
      .setScrollFactor(0);

    // Panel background
    const panelBg = this.scene.add.rectangle(cx, cy, PANEL_W, PANEL_H, BG_COLOR, 0.98)
      .setScrollFactor(0);

    // Panel border (drawn via Graphics for rounded rect)
    const borderGfx = this.scene.add.graphics().setScrollFactor(0);
    borderGfx.lineStyle(2, BORDER_COLOR, 1);
    borderGfx.strokeRoundedRect(cx - PANEL_W / 2, cy - PANEL_H / 2, PANEL_W, PANEL_H, 10);

    // Title
    const titleText = this.scene.add.text(cx, cy - PANEL_H / 2 + 16, 'SKILL TREES', {
      fontSize: '12px',
      fontFamily: FONT,
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setScrollFactor(0);

    // Subtitle
    const subtitleText = this.scene.add.text(cx, cy - PANEL_H / 2 + 30, 'Acumulá XP en cada actividad para subir de nivel', {
      fontSize: '6px',
      fontFamily: FONT,
      color: '#888899',
    }).setOrigin(0.5, 0.5).setScrollFactor(0);

    // Close hint
    const closeHint = this.scene.add.text(
      cx + PANEL_W / 2 - 12,
      cy + PANEL_H / 2 - 14,
      '[T] CERRAR',
      {
        fontSize: '6px',
        fontFamily: FONT,
        color: '#888899',
      },
    ).setOrigin(1, 1).setScrollFactor(0);

    // Gold separator line below the title / subtitle block
    const sep = this.scene.add.graphics().setScrollFactor(0);
    sep.lineStyle(1, 0xf5c842, 0.25);
    sep.lineBetween(cx - PANEL_W / 2 + 24, cy - PANEL_H / 2 + 38, cx + PANEL_W / 2 - 24, cy - PANEL_H / 2 + 38);

    this.container.add([overlay, panelBg, borderGfx, titleText, subtitleText, sep, closeHint]);

    // Build tab toggle row
    this.buildTabRow();

    // Build the 6 skill cards inside a sub-container (skillsView)
    this.skillsView = this.scene.add.container(0, 0).setScrollFactor(0);
    this.container.add(this.skillsView);

    ALL_SKILL_IDS.forEach((skillId, index) => {
      this.buildCard(skillId, index);
    });

    // Synergy strip at the bottom of the panel
    this.buildSynergyStrip();
  }

  // ---------------------------------------------------------------------------
  // Tab row
  // ---------------------------------------------------------------------------

  private buildTabRow(): void {
    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const cy = height / 2;
    const panelTop = cy - PANEL_H / 2;

    const tabY = panelTop + 46;
    const tabW = 110;
    const tabH = 20;
    const gap = 6;

    // SKILLS tab (active by default)
    const skillsTabX = cx - tabW - gap / 2;
    const skillsBg = this.scene.add.rectangle(skillsTabX, tabY, tabW, tabH, 0x1e1e30, 1)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    skillsBg.setStrokeStyle(1, 0xf5c842, 1);
    const skillsLabel = this.scene.add.text(skillsTabX, tabY, '[SKILLS]', {
      fontSize: '7px',
      fontFamily: FONT,
      color: '#F5C842',
    }).setOrigin(0.5, 0.5).setScrollFactor(0);

    // Active bottom border line for SKILLS tab
    const skillsLine = this.scene.add.graphics().setScrollFactor(0);
    skillsLine.lineStyle(2, 0xf5c842, 1);
    skillsLine.lineBetween(skillsTabX - tabW / 2, tabY + tabH / 2, skillsTabX + tabW / 2, tabY + tabH / 2);
    this.tabSkillsLine = skillsLine;

    // LOGROS tab
    const logrosTabX = cx + tabW / 2 + gap / 2;
    const logrosBg = this.scene.add.rectangle(logrosTabX, tabY, tabW, tabH, 0x0d0d14, 1)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    logrosBg.setStrokeStyle(1, 0x444455, 0.8);

    // Inactive bottom border line for LOGROS tab (hidden by default)
    const logrosLine = this.scene.add.graphics().setScrollFactor(0);
    logrosLine.lineStyle(2, 0xf5c842, 1);
    logrosLine.lineBetween(logrosTabX - tabW / 2, tabY + tabH / 2, logrosTabX + tabW / 2, tabY + tabH / 2);
    logrosLine.setAlpha(0);
    this.tabLogrosLine = logrosLine;
    const logrosLabel = this.scene.add.text(logrosTabX, tabY, '[LOGROS]', {
      fontSize: '7px',
      fontFamily: FONT,
      color: '#888899',
    }).setOrigin(0.5, 0.5).setScrollFactor(0);

    // New-milestone badge (red pill, hidden by default)
    const badge = this.scene.add.text(logrosTabX + tabW / 2 - 4, tabY - tabH / 2 + 4, '', {
      fontSize: '5px',
      fontFamily: FONT,
      color: '#FF4444',
      backgroundColor: '#330000',
      padding: { x: 3, y: 1 },
    }).setOrigin(1, 0).setScrollFactor(0).setVisible(false);

    this.tabSkillsBg   = skillsBg;
    this.tabLogrosBg   = logrosBg;
    this.tabSkillsBtn  = skillsLabel;
    this.tabLogrosBtn  = logrosLabel;
    this.logrosBadge   = badge;

    // Interactivity
    skillsBg.on('pointerdown', () => this.switchTab('skills'));
    logrosBg.on('pointerdown', () => this.switchTab('logros'));

    this.container.add([skillsBg, skillsLabel, skillsLine, logrosBg, logrosLabel, logrosLine, badge]);
  }

  private switchTab(tab: 'skills' | 'logros'): void {
    this.activeTab = tab;

    if (tab === 'skills') {
      this.skillsView?.setVisible(true);
      this.logrosView?.setVisible(false);
      // Update tab visuals — subtler fill + gold bottom border for active
      this.tabSkillsBg?.setFillStyle(0x1e1e30, 1);
      this.tabSkillsBg?.setStrokeStyle(1, 0xf5c842, 1);
      this.tabSkillsBtn?.setColor('#F5C842');
      this.tabSkillsLine?.setAlpha(1);
      this.tabLogrosBg?.setFillStyle(0x0d0d14, 1);
      this.tabLogrosBg?.setStrokeStyle(1, 0x444455, 0.8);
      this.tabLogrosBtn?.setColor('#888899');
      this.tabLogrosLine?.setAlpha(0);
    } else {
      this.skillsView?.setVisible(false);
      // Update tab visuals — subtler fill + gold bottom border for active
      this.tabSkillsBg?.setFillStyle(0x0d0d14, 1);
      this.tabSkillsBg?.setStrokeStyle(1, 0x444455, 0.8);
      this.tabSkillsBtn?.setColor('#888899');
      this.tabSkillsLine?.setAlpha(0);
      this.tabLogrosBg?.setFillStyle(0x1e1e30, 1);
      this.tabLogrosBg?.setStrokeStyle(1, 0xf5c842, 1);
      this.tabLogrosBtn?.setColor('#F5C842');
      this.tabLogrosLine?.setAlpha(1);

      // Load milestones if not yet loaded, then render
      if (!this.milestonesLoaded && !this.milestonesLoading) {
        this.fetchAndRenderLogros();
      } else {
        this.renderLogrosView();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Logros fetch + render
  // ---------------------------------------------------------------------------

  private fetchAndRenderLogros(): void {
    this.milestonesLoading = true;

    // Show loading indicator while fetching
    this.buildLogrosLoading();

    void (async () => {
      try {
        const authH = await getAuthHeaders();
        const res = await fetch('/api/skills/milestones', { headers: authH });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = await res.json() as { milestones: CompletedMilestone[] };
        this.completedMilestones = body.milestones ?? [];
        this.milestonesLoaded = true;

        // Record which milestones were completed when the panel opened
        this.knownMilestonesOnOpen = new Set(
          this.completedMilestones.map((m) => m.milestone_id),
        );
        this.sessionNewMilestones = new Set();
      } catch {
        this.completedMilestones = [];
        this.milestonesLoaded = true;
      } finally {
        this.milestonesLoading = false;

        // Guard: only render if panel is still visible and we are on logros tab
        if (!this.visible) return;
        if (this.activeTab !== 'logros') return;
        this.renderLogrosView();
      }
    })();
  }

  private buildLogrosLoading(): void {
    this.logrosView?.destroy();
    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const cy = height / 2;

    const view = this.scene.add.container(0, 0).setScrollFactor(0);
    view.add(
      this.scene.add.text(cx, cy, 'CARGANDO LOGROS...', {
        fontSize: '7px',
        fontFamily: FONT,
        color: '#444455',
      }).setOrigin(0.5, 0.5).setScrollFactor(0),
    );
    this.logrosView = view;
    this.container.add(view);
  }

  private renderLogrosView(): void {
    // Destroy old logros view if exists
    this.logrosView?.destroy();
    this.logrosView = undefined;

    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const cy = height / 2;
    const panelLeft  = cx - PANEL_W / 2;
    const panelTop   = cy - PANEL_H / 2;

    const view = this.scene.add.container(0, 0).setScrollFactor(0);

    const sys = getSkillSystem();

    // Content area: from below tab row to above close hint
    const contentTop    = panelTop + 66;
    const contentBottom = panelTop + PANEL_H - 28;
    const contentH      = contentBottom - contentTop;
    const rowH          = 16; // height per milestone row
    const skillBlockGap = 10; // gap between skill blocks
    const skillLabelH   = 14;

    // Compute total milestones: 6 skills × 3 = 18 rows + 6 skill headers
    // Layout: column-based, 2 cols of 3 skills each
    const colW     = (PANEL_W - 32) / 2;
    const colLeftX = panelLeft + 16;
    const colRightX = colLeftX + colW;

    const leftSkills  = ALL_SKILL_IDS.slice(0, 3); // mining, fishing, gardening
    const rightSkills = ALL_SKILL_IDS.slice(3);    // cooking, gym, weed

    const completedSet = new Map<string, string>(); // milestone_id → reached_at
    for (const m of this.completedMilestones) {
      completedSet.set(m.milestone_id, m.reached_at);
    }

    const renderSkillBlock = (skillId: SkillId, startX: number, startY: number): void => {
      const def       = getSkillDef(skillId);
      const colorHex  = SKILL_COLORS_HEX[skillId];
      const actionCount = sys.getActionCount(skillId);

      // Skill header
      view.add(
        this.scene.add.text(startX, startY, `${def.emoji} ${def.label.toUpperCase()}`, {
          fontSize: '6px',
          fontFamily: FONT,
          color: colorHex,
        }).setOrigin(0, 0.5).setScrollFactor(0),
      );

      // Separator line
      const sepGfx = this.scene.add.graphics().setScrollFactor(0);
      sepGfx.lineStyle(1, SKILL_COLORS[skillId], 0.3);
      sepGfx.lineBetween(startX, startY + 8, startX + colW - 16, startY + 8);
      view.add(sepGfx);

      // Milestone rows
      def.milestones.forEach((ms: MilestoneDef, mIdx: number) => {
        const rowY    = startY + skillLabelH + mIdx * (rowH + 4);
        const reachedAt = completedSet.get(ms.id);
        const isDone  = reachedAt !== undefined;

        // Bar width available
        const barTotalW = colW - 16;
        const barY      = rowY + rowH - 5;

        if (isDone) {
          // Completed milestone — green check + name
          view.add(
            this.scene.add.text(startX, rowY, `✓ ${ms.name.toUpperCase()}`, {
              fontSize: '5px',
              fontFamily: FONT,
              color: '#39FF14',
            }).setOrigin(0, 0).setScrollFactor(0),
          );

          // Reward label
          view.add(
            this.scene.add.text(startX + barTotalW, rowY, ms.reward, {
              fontSize: '4px',
              fontFamily: FONT,
              color: '#555566',
            }).setOrigin(1, 0).setScrollFactor(0),
          );

          // Date of completion (truncated)
          const dateStr = reachedAt.substring(0, 10); // YYYY-MM-DD
          view.add(
            this.scene.add.text(startX, rowY + 8, dateStr, {
              fontSize: '4px',
              fontFamily: FONT,
              color: '#2a6a2a',
            }).setOrigin(0, 0).setScrollFactor(0),
          );

          // Full bar (gold)
          const barBg = this.scene.add.rectangle(startX, barY, barTotalW, 3, 0x1a1a28, 1)
            .setOrigin(0, 0.5).setScrollFactor(0);
          const barFill = this.scene.add.rectangle(startX, barY, barTotalW, 3, 0x39aa14, 1)
            .setOrigin(0, 0.5).setScrollFactor(0);
          view.add([barBg, barFill]);
        } else {
          // Pending milestone — lock + progress
          const ratio  = Math.min(1, actionCount / ms.count);
          const fillW  = Math.max(2, Math.floor(ratio * barTotalW));
          const pct    = Math.floor(ratio * 100);
          const isNear = pct >= 80;

          const labelColor = isNear ? '#C8A45A' : '#444455';
          const barColor   = isNear ? 0xc8a45a : 0x3a3a6a;

          view.add(
            this.scene.add.text(startX, rowY, `🔒 ${ms.name.toUpperCase()}`, {
              fontSize: '5px',
              fontFamily: FONT,
              color: labelColor,
            }).setOrigin(0, 0).setScrollFactor(0),
          );

          // Progress text
          view.add(
            this.scene.add.text(startX + barTotalW, rowY, `${actionCount}/${ms.count}`, {
              fontSize: '4px',
              fontFamily: FONT,
              color: isNear ? '#C8A45A' : '#333344',
            }).setOrigin(1, 0).setScrollFactor(0),
          );

          // Reward preview
          view.add(
            this.scene.add.text(startX, rowY + 8, ms.reward, {
              fontSize: '4px',
              fontFamily: FONT,
              color: '#333344',
            }).setOrigin(0, 0).setScrollFactor(0),
          );

          // Progress bar
          const barBg = this.scene.add.rectangle(startX, barY, barTotalW, 3, 0x1a1a28, 1)
            .setOrigin(0, 0.5).setScrollFactor(0);
          const barFill = this.scene.add.rectangle(startX, barY, fillW, 3, barColor, 1)
            .setOrigin(0, 0.5).setScrollFactor(0);
          view.add([barBg, barFill]);
        }
      });
    };

    // Determine block heights for vertical positioning
    // Each skill block = skillLabelH + 3 * (rowH + 4) + skillBlockGap
    const blockH = skillLabelH + 3 * (rowH + 4) + skillBlockGap;

    // Vertical centering of the two columns within content area
    const totalH   = 3 * blockH;
    const startY   = contentTop + Math.max(0, (contentH - totalH) / 2) + 4;

    leftSkills.forEach((skillId, i) => {
      renderSkillBlock(skillId, colLeftX, startY + i * blockH);
    });

    rightSkills.forEach((skillId, i) => {
      renderSkillBlock(skillId, colRightX, startY + i * blockH);
    });

    this.logrosView = view;
    this.container.add(view);

    // Detect newly completed milestones this session and update badge
    this.updateLogrosBadge();
  }

  /**
   * Checks if any milestones completed after knownMilestonesOnOpen and updates badge.
   */
  private updateLogrosBadge(): void {
    const newCount = this.completedMilestones.filter(
      (m) => !this.knownMilestonesOnOpen.has(m.milestone_id),
    ).length;

    if (newCount > 0 && this.logrosBadge) {
      this.logrosBadge.setText(`+${newCount}`).setVisible(true);
    } else {
      this.logrosBadge?.setVisible(false);
    }
  }

  /**
   * Call this when a milestone is unlocked during the session (from SkillSystem events).
   * Adds to sessionNewMilestones and triggers badge update.
   */
  notifyMilestoneUnlocked(milestoneId: string): void {
    if (!this.knownMilestonesOnOpen.has(milestoneId)) {
      this.sessionNewMilestones.add(milestoneId);
    }
    // If the panel is open on logros tab, re-fetch to refresh data
    if (this.visible && this.activeTab === 'logros') {
      this.milestonesLoaded = false;
      this.fetchAndRenderLogros();
    } else {
      // Just update badge if panel is visible on skills tab
      if (this.logrosBadge?.active) {
        const newCount = this.sessionNewMilestones.size;
        if (newCount > 0) {
          this.logrosBadge.setText(`+${newCount}`).setVisible(true);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Build — skill cards (added to skillsView)
  // ---------------------------------------------------------------------------

  private buildCard(skillId: SkillId, index: number): void {
    const def = getSkillDef(skillId);
    const { cx, cy } = this.cardPosition(index);
    const colorHex = SKILL_COLORS_HEX[skillId];
    const barW = CARD_W - 28;

    // ── Card background + border graphics (redrawn in refresh) ──
    const gfx = this.scene.add.graphics().setScrollFactor(0);
    gfx.fillStyle(CARD_BG_COLOR, 1);
    gfx.fillRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 8);
    gfx.lineStyle(2, 0x2a2a3a, 0.5);
    gfx.strokeRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 8);
    this.cardGraphics[index] = gfx;

    // ── Colored top accent strip (4px, skill color at 0.6 alpha) ──
    const accentStrip = this.scene.add.graphics().setScrollFactor(0);
    accentStrip.fillStyle(SKILL_COLORS[skillId], 0.6);
    accentStrip.fillRect(cx - CARD_W / 2 + 2, cy - CARD_H / 2 + 2, CARD_W - 4, 4);

    // ── Emoji + label row ──
    const emojiLabel = this.scene.add.text(
      cx,
      cy - CARD_H / 2 + 16,
      `${def.emoji} ${def.label.toUpperCase()}`,
      {
        fontSize: '7px',
        fontFamily: FONT,
        color: colorHex,
      },
    ).setOrigin(0.5, 0.5).setScrollFactor(0);

    // ── Level display ──
    const levelText = this.scene.add.text(
      cx,
      cy - CARD_H / 2 + 48,
      'LV 0',
      {
        fontSize: '14px',
        fontFamily: FONT,
        color: colorHex,
        stroke: '#000000',
        strokeThickness: 3,
      },
    ).setOrigin(0.5, 0.5).setScrollFactor(0);

    // ── Current title ──
    const titleText = this.scene.add.text(
      cx,
      cy - CARD_H / 2 + 78,
      'Inactivo',
      {
        fontSize: '6px',
        fontFamily: FONT,
        color: colorHex,
      },
    ).setOrigin(0.5, 0.5).setScrollFactor(0);

    // ── XP bar background ──
    const barY = cy - CARD_H / 2 + 106;
    const barBack = this.scene.add.rectangle(
      cx,
      barY,
      barW,
      6,
      0x222233,
      1,
    ).setOrigin(0.5, 0.5).setScrollFactor(0);

    // ── XP bar segment overlay — 1px dividers every 10% ──
    const segGfx = this.scene.add.graphics().setScrollFactor(0);
    segGfx.lineStyle(1, 0x0d0d14, 0.55);
    const segLeft = cx - barW / 2;
    for (let s = 1; s < 10; s++) {
      const sx = segLeft + Math.floor((s / 10) * barW);
      segGfx.lineBetween(sx, barY - 3, sx, barY + 3);
    }

    // ── XP bar fill (starts at left edge) ──
    const barFill = this.scene.add.rectangle(
      cx - barW / 2 + 1,
      barY,
      2,
      6,
      SKILL_COLORS[skillId],
      1,
    ).setOrigin(0, 0.5).setScrollFactor(0);

    // ── XP text ──
    const xpText = this.scene.add.text(
      cx,
      barY + 14,
      '0 / 100 XP',
      {
        fontSize: '6px',
        fontFamily: FONT,
        color: '#888899',
      },
    ).setOrigin(0.5, 0.5).setScrollFactor(0);

    // ── Milestone progress row ──
    const msLabelY = cy - CARD_H / 2 + 136;
    const msLabel = this.scene.add.text(cx, msLabelY, '', {
      fontSize: '5px',
      fontFamily: FONT,
      color: '#666677',
    }).setOrigin(0.5, 0.5).setScrollFactor(0);

    const msBarY = cy - CARD_H / 2 + 150;
    const msBarW = CARD_W - 44;
    const msBarBack = this.scene.add.rectangle(cx, msBarY, msBarW, 3, 0x1a1a28, 1)
      .setOrigin(0.5, 0.5).setScrollFactor(0);
    const msBarFill = this.scene.add.rectangle(cx - msBarW / 2, msBarY, 2, 3, 0x555566, 1)
      .setOrigin(0, 0.5).setScrollFactor(0);

    this.milestoneLabels[index] = msLabel;
    this.milestoneBarBacks[index] = msBarBack;
    this.milestoneBarFills[index] = msBarFill;

    // ── Next unlock preview ──
    const nextText = this.scene.add.text(
      cx,
      cy - CARD_H / 2 + 168,
      '',
      {
        fontSize: '5px',
        fontFamily: FONT,
        color: '#888899',
        wordWrap: { width: CARD_W - 24 },
        align: 'center',
      },
    ).setOrigin(0.5, 0.5).setScrollFactor(0);

    // Register dynamic text refs: [0]=level, [1]=title, [2]=xpText, [3]=next
    this.cardTexts[index] = [levelText, titleText, xpText, nextText];
    this.xpBarFills[index] = barFill;
    this.xpBarBacks[index] = barBack;

    const cardObjects: Phaser.GameObjects.GameObject[] = [
      gfx,
      accentStrip,
      emojiLabel,
      levelText,
      titleText,
      barBack,
      barFill,
      segGfx,
      xpText,
      msLabel,
      msBarBack,
      msBarFill,
      nextText,
    ];

    this.skillsView?.add(cardObjects);

    // Spec badge — visible when Lv3+ and no spec chosen yet
    const specBadge = this.scene.add.text(
      cx + CARD_W / 2 - 8,
      cy - CARD_H / 2 + 16,
      '⚡ SPEC',
      { fontSize: '5px', fontFamily: FONT, color: '#F5C842' },
    ).setOrigin(1, 0.5).setScrollFactor(0).setVisible(false);

    this.specBadges[index] = specBadge;
    this.skillsView?.add(specBadge);

    // Synergy badge — shown below title when this skill participates in an active synergy
    const synBadge = this.scene.add.text(
      cx,
      cy - CARD_H / 2 + 30,
      '⚡ SIN',
      { fontSize: '5px', fontFamily: FONT, color: '#39FF14', backgroundColor: '#0a1a0a', padding: { x: 3, y: 1 } },
    ).setOrigin(0.5, 0.5).setScrollFactor(0).setVisible(false);

    this.synBadges[index] = synBadge;
    this.skillsView?.add(synBadge);

    // Transparent hit area for spec selection
    const hitArea = this.scene.add.rectangle(cx, cy, CARD_W, CARD_H, 0x000000, 0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => {
      const level = getSkillSystem().getLevel(skillId);
      const spec = getSkillSystem().getSpec(skillId);
      if (level >= 3 && !spec) {
        this.openSpecModal(skillId);
      }
    });
    this.skillsView?.add(hitArea);
  }

  // ---------------------------------------------------------------------------
  // Spec modal — open/close
  // ---------------------------------------------------------------------------

  private openSpecModal(skillId: SkillId): void {
    if (this.specModalVisible) return;
    const specs = getSpecsForSkill(skillId);
    const specA = specs[0];
    const specB = specs[1];
    if (!specA || !specB) return;

    this.specModal?.destroy();

    const { width, height } = this.scene.scale;
    const mcx = width / 2;
    const mcy = height / 2;
    const MW = 600;
    const MH = 300;

    const container = this.scene.add.container(0, 0)
      .setDepth(PANEL_DEPTH + 100)
      .setScrollFactor(0);

    // Backdrop
    container.add(
      this.scene.add.rectangle(mcx, mcy, MW + 20, MH + 20, 0x000000, 0.85).setScrollFactor(0),
    );
    // Panel bg
    container.add(
      this.scene.add.rectangle(mcx, mcy, MW, MH, 0x0d0d14, 0.98).setScrollFactor(0),
    );
    // Border
    const borderGfx = this.scene.add.graphics().setScrollFactor(0);
    borderGfx.lineStyle(2, 0xf5c842, 1);
    borderGfx.strokeRoundedRect(mcx - MW / 2, mcy - MH / 2, MW, MH, 10);
    container.add(borderGfx);

    // Title
    container.add(
      this.scene.add.text(mcx, mcy - MH / 2 + 22, 'ELEGIR ESPECIALIZACION', {
        fontSize: '10px', fontFamily: FONT, color: '#F5C842', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0),
    );

    container.add(
      this.scene.add.text(mcx, mcy - MH / 2 + 42, 'Esta decision es permanente', {
        fontSize: '5px', fontFamily: FONT, color: '#666677',
      }).setOrigin(0.5).setScrollFactor(0),
    );

    // Build the two option cards
    ([specA, specB] as SpecDef[]).forEach((spec, i) => {
      const cardX = mcx - 148 + i * 296;
      const cardY = mcy + 20;
      const CW = 260;
      const CH = 170;

      const cardGfx = this.scene.add.graphics().setScrollFactor(0);
      cardGfx.fillStyle(0x131320, 1);
      cardGfx.fillRoundedRect(cardX - CW / 2, cardY - CH / 2, CW, CH, 8);
      cardGfx.lineStyle(2, parseInt(spec.color.replace('#', ''), 16), 0.8);
      cardGfx.strokeRoundedRect(cardX - CW / 2, cardY - CH / 2, CW, CH, 8);
      container.add(cardGfx);

      container.add(
        this.scene.add.text(cardX, cardY - CH / 2 + 18, spec.name, {
          fontSize: '8px', fontFamily: FONT, color: spec.color, stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0),
      );
      container.add(
        this.scene.add.text(cardX, cardY - CH / 2 + 38, spec.tagline, {
          fontSize: '5px', fontFamily: FONT, color: '#888899', wordWrap: { width: CW - 20 }, align: 'center',
        }).setOrigin(0.5).setScrollFactor(0),
      );

      // Effects list
      spec.effects.forEach((effect, ei) => {
        container.add(
          this.scene.add.text(cardX, cardY - CH / 2 + 62 + ei * 18, `> ${effect.description}`, {
            fontSize: '5px', fontFamily: FONT, color: '#B0B0C0', wordWrap: { width: CW - 24 }, align: 'center',
          }).setOrigin(0.5).setScrollFactor(0),
        );
      });

      // ELEGIR button
      const btnY = cardY + CH / 2 - 20;
      const btnBg = this.scene.add.rectangle(cardX, btnY, 120, 24, 0x1a3a1a, 1)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      btnBg.setStrokeStyle(1, 0x39ff14, 0.9);
      const btnLabel = this.scene.add.text(cardX, btnY, 'ELEGIR', {
        fontSize: '7px', fontFamily: FONT, color: '#39FF14',
      }).setOrigin(0.5).setScrollFactor(0);

      btnBg.on('pointerover', () => btnBg.setFillStyle(0x245a24, 1));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x1a3a1a, 1));
      btnBg.on('pointerdown', () => {
        // Disable immediately to prevent spam-clicks before the API responds
        btnBg.disableInteractive();
        btnLabel.setText('...');
        void getSkillSystem().chooseSpec(skillId, spec.id).then((result) => {
          if (result.success) {
            this.closeSpecModal();
            this.refresh();
            eventBus.emit(EVENTS.UI_NOTICE, { message: `SPEC: ${spec.name} elegida!`, color: spec.color });
          } else {
            btnLabel.setText('ERROR');
            // Re-enable only on error so the player can retry
            this.scene.time.delayedCall(1500, () => {
              btnLabel.setText('ELEGIR');
              btnBg.setInteractive({ useHandCursor: true });
            });
          }
        });
      });

      container.add([btnBg, btnLabel]);
    });

    // Cancel button
    const cancelBtn = this.scene.add.text(mcx, mcy + MH / 2 - 16, '[ESC] CANCELAR', {
      fontSize: '5px', fontFamily: FONT, color: '#555566',
    }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    cancelBtn.on('pointerdown', () => this.closeSpecModal());
    container.add(cancelBtn);

    // ESC key closes the modal
    const escKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    const escHandler = (): void => { this.closeSpecModal(); escKey?.removeListener('down', escHandler); };
    escKey?.on('down', escHandler);

    this.specModal = container;
    this.specModalVisible = true;
  }

  private closeSpecModal(): void {
    this.specModal?.destroy();
    this.specModal = undefined;
    this.specModalVisible = false;
  }

  // ---------------------------------------------------------------------------
  // Synergy strip — shown at the bottom of the panel
  // ---------------------------------------------------------------------------

  private buildSynergyStrip(): void {
    const { width, height } = this.scene.scale;
    const panelLeft = width  / 2 - PANEL_W / 2;
    const panelTop  = height / 2 - PANEL_H / 2;

    // Strip background
    const stripY = panelTop + PANEL_H - 52;
    const stripGfx = this.scene.add.graphics().setScrollFactor(0);
    stripGfx.fillStyle(0x0a0a10, 0.9);
    stripGfx.fillRect(panelLeft + 2, stripY, PANEL_W - 4, 48);
    stripGfx.lineStyle(1, 0xf5c842, 0.2);
    stripGfx.lineBetween(panelLeft + 16, stripY, panelLeft + PANEL_W - 16, stripY);

    const labelX = panelLeft + 16;
    const labelY = stripY + 10;
    const synergyLabel = this.scene.add.text(labelX, labelY, 'SINERGIAS:', {
      fontSize: '5px', fontFamily: FONT, color: '#F5C842',
    }).setOrigin(0, 0.5).setScrollFactor(0);

    // Placeholder rows (refreshed in refreshSynergies)
    const row1 = this.scene.add.text(labelX + 76, labelY, '—', {
      fontSize: '5px', fontFamily: FONT, color: '#444455',
    }).setOrigin(0, 0.5).setScrollFactor(0);

    const row2 = this.scene.add.text(labelX + 76, labelY + 16, '', {
      fontSize: '5px', fontFamily: FONT, color: '#444455',
    }).setOrigin(0, 0.5).setScrollFactor(0);

    const row3 = this.scene.add.text(labelX + 76 + 220, labelY, '', {
      fontSize: '5px', fontFamily: FONT, color: '#444455',
    }).setOrigin(0, 0.5).setScrollFactor(0);

    const row4 = this.scene.add.text(labelX + 76 + 220, labelY + 16, '', {
      fontSize: '5px', fontFamily: FONT, color: '#444455',
    }).setOrigin(0, 0.5).setScrollFactor(0);

    this.synergyRows = [row1, row2, row3, row4];

    // Synergy strip is always part of skillsView (only visible on skills tab)
    this.skillsView?.add([stripGfx, synergyLabel, row1, row2, row3, row4]);
  }

  private refreshSynergies(): void {
    const active = getSkillSystem().getActiveSynergies();

    // Show up to 4 synergies in a 2×2 grid
    for (let i = 0; i < 4; i++) {
      const row = this.synergyRows[i];
      if (!row) continue;
      const syn: SynergyDef | undefined = active[i];
      if (syn) {
        row.setText(`${syn.emoji} ${syn.name}`).setColor(syn.color);
      } else if (i === 0 && active.length === 0) {
        row.setText('Sube 2 skills a Lv2+ para activar sinergias').setColor('#444455');
      } else {
        row.setText('').setColor('#444455');
      }
    }
  }
}
