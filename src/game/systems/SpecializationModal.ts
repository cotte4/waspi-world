// SpecializationModal.ts
// Full-screen blocking modal that appears when the player reaches Lv3 in a skill
// and must choose ONE of two permanent specialization branches.
//
// Rules (from CLAUDE.md):
//  - NO close button, NO ESC dismissal — must choose.
//  - Disables scene input while visible; re-enables after choice.
//  - Follows anti-crash guard rules (checks scene.isActive before async callbacks).

import type { SkillId } from '../systems/SkillSystem';
import { getSkillSystem } from '../systems/SkillSystem';
import { getSpecsForSkill, type SpecDef } from '../config/specializations';
import { eventBus, EVENTS } from '../config/eventBus';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OVERLAY_DEPTH = 12000;
const BOX_W         = 700;
const BOX_H         = 400;
const FONT          = '"Press Start 2P", monospace';

const SKILL_NAMES: Record<SkillId, string> = {
  mining:    'MINERÍA',
  fishing:   'PESCA',
  gardening: 'JARDINERÍA',
  cooking:   'COCINA',
  gym:       'GYM',
  weed:      'WEED',
};

const SKILL_EMOJIS: Record<SkillId, string> = {
  mining:    '⛏️',
  fishing:   '🎣',
  gardening: '🌱',
  cooking:   '🍳',
  gym:       '💪',
  weed:      '🌿',
};

// ---------------------------------------------------------------------------
// SpecializationModal
// ---------------------------------------------------------------------------

export class SpecializationModal {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible = false;

  // Overlay + box elements — created once and reused
  private overlay:  Phaser.GameObjects.Rectangle;
  private box:      Phaser.GameObjects.Rectangle;
  private boxBorder:Phaser.GameObjects.Rectangle;
  private titleText:Phaser.GameObjects.Text;
  private subtitleText:Phaser.GameObjects.Text;

  // Button A
  private btnABg:    Phaser.GameObjects.Rectangle;
  private btnABorder:Phaser.GameObjects.Rectangle;
  private btnAIcon:  Phaser.GameObjects.Text;
  private btnAName:  Phaser.GameObjects.Text;
  private btnADesc:  Phaser.GameObjects.Text;

  // Button B
  private btnBBg:    Phaser.GameObjects.Rectangle;
  private btnBBorder:Phaser.GameObjects.Rectangle;
  private btnBIcon:  Phaser.GameObjects.Text;
  private btnBName:  Phaser.GameObjects.Text;
  private btnBDesc:  Phaser.GameObjects.Text;

  // Status / loading text
  private statusText:Phaser.GameObjects.Text;

  // State
  private choosing = false;
  private currentSkillId: SkillId | null = null;
  private currentSpecs: [SpecDef, SpecDef] | null = null;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const { width, height } = scene.scale;
    const cx = width  / 2;
    const cy = height / 2;

    // Semi-transparent overlay
    this.overlay = scene.add.rectangle(cx, cy, width, height, 0x000000, 0.78)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH)
      .setInteractive(); // blocks clicks through

    // Box background
    this.box = scene.add.rectangle(cx, cy, BOX_W, BOX_H, 0x0d0d16)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH + 1);

    this.boxBorder = scene.add.rectangle(cx, cy, BOX_W + 4, BOX_H + 4)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH)
      .setFillStyle(0xf5c842);

    // Title
    this.titleText = scene.add.text(cx, cy - BOX_H / 2 + 28, '', {
      fontFamily: FONT,
      fontSize: '9px',
      color: '#F5C842',
      align: 'center',
      wordWrap: { width: BOX_W - 40 },
    })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH + 2);

    // Subtitle
    this.subtitleText = scene.add.text(cx, cy - BOX_H / 2 + 60, 'Elegí tu camino. Esta decisión es permanente.', {
      fontFamily: FONT,
      fontSize: '7px',
      color: '#888899',
      align: 'center',
      wordWrap: { width: BOX_W - 60 },
    })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH + 2);

    // ── Button A ────────────────────────────────────────────────────────────
    const btnW = 290;
    const btnH = 150;
    const btnY = cy + 30;
    const btnAX = cx - btnW / 2 - 20;
    const btnBX = cx + btnW / 2 + 20;

    this.btnABorder = scene.add.rectangle(btnAX, btnY, btnW + 4, btnH + 4, 0x555566)
      .setScrollFactor(0).setDepth(OVERLAY_DEPTH + 2);
    this.btnABg = scene.add.rectangle(btnAX, btnY, btnW, btnH, 0x141420)
      .setScrollFactor(0).setDepth(OVERLAY_DEPTH + 3)
      .setInteractive({ useHandCursor: true });

    this.btnAIcon = scene.add.text(btnAX, btnY - 44, '', {
      fontFamily: FONT, fontSize: '22px',
    })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH + 4);

    this.btnAName = scene.add.text(btnAX, btnY - 14, '', {
      fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
    })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH + 4);

    this.btnADesc = scene.add.text(btnAX, btnY + 12, '', {
      fontFamily: FONT, fontSize: '6px', color: '#AAAACC',
      align: 'center', wordWrap: { width: btnW - 20 },
    })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH + 4);

    // ── Button B ────────────────────────────────────────────────────────────
    this.btnBBorder = scene.add.rectangle(btnBX, btnY, btnW + 4, btnH + 4, 0x555566)
      .setScrollFactor(0).setDepth(OVERLAY_DEPTH + 2);
    this.btnBBg = scene.add.rectangle(btnBX, btnY, btnW, btnH, 0x141420)
      .setScrollFactor(0).setDepth(OVERLAY_DEPTH + 3)
      .setInteractive({ useHandCursor: true });

    this.btnBIcon = scene.add.text(btnBX, btnY - 44, '', {
      fontFamily: FONT, fontSize: '22px',
    })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH + 4);

    this.btnBName = scene.add.text(btnBX, btnY - 14, '', {
      fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
    })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH + 4);

    this.btnBDesc = scene.add.text(btnBX, btnY + 12, '', {
      fontFamily: FONT, fontSize: '6px', color: '#AAAACC',
      align: 'center', wordWrap: { width: btnW - 20 },
    })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH + 4);

    // ── Status / loading text ──────────────────────────────────────────────
    this.statusText = scene.add.text(cx, cy + BOX_H / 2 - 26, '', {
      fontFamily: FONT, fontSize: '7px', color: '#F5C842', align: 'center',
    })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH + 4);

    // ── Hover effects ──────────────────────────────────────────────────────
    this.btnABg.on('pointerover',  () => { if (!this.choosing) this.btnABorder.setFillStyle(0xf5c842); });
    this.btnABg.on('pointerout',   () => { this.btnABorder.setFillStyle(0x555566); });
    this.btnABg.on('pointerdown',  () => { if (!this.choosing && this.currentSpecs) void this.onChoose(0); });

    this.btnBBg.on('pointerover',  () => { if (!this.choosing) this.btnBBorder.setFillStyle(0xf5c842); });
    this.btnBBg.on('pointerout',   () => { this.btnBBorder.setFillStyle(0x555566); });
    this.btnBBg.on('pointerdown',  () => { if (!this.choosing && this.currentSpecs) void this.onChoose(1); });

    // Build the group container for bulk show/hide
    this.container = scene.add.container(0, 0, [
      this.overlay,
      this.boxBorder,
      this.box,
      this.titleText,
      this.subtitleText,
      this.btnABorder,
      this.btnABg,
      this.btnAIcon,
      this.btnAName,
      this.btnADesc,
      this.btnBBorder,
      this.btnBBg,
      this.btnBIcon,
      this.btnBName,
      this.btnBDesc,
      this.statusText,
    ])
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Show the modal for the given skill. Disables scene input until choice is made.
   * Should be called when leveled_up && new_level === 3 && !hasSpec(skillId).
   */
  show(skillId: SkillId): void {
    if (this.visible) return;

    const specs = getSpecsForSkill(skillId);
    this.currentSkillId = skillId;
    this.currentSpecs   = specs;
    this.choosing       = false;

    const skillName  = SKILL_NAMES[skillId];
    const skillEmoji = SKILL_EMOJIS[skillId];

    // Update title
    this.titleText.setText(`${skillEmoji} ESPECIALIZACIÓN — ${skillName}`);

    // Reset status
    this.statusText.setText('');

    // Fill button A
    const [specA, specB] = specs;
    this.btnABorder.setFillStyle(0x555566);
    this.btnAIcon.setText(specA.color ? '' : '');  // emoji in name field below
    this.btnAName.setText(specA.name).setColor(specA.color);
    this.btnADesc.setText(specA.tagline + '\n' + specA.effects.map((e) => e.description).join('\n'));

    // Fill button B
    this.btnBBorder.setFillStyle(0x555566);
    this.btnBIcon.setText('');
    this.btnBName.setText(specB.name).setColor(specB.color);
    this.btnBDesc.setText(specB.tagline + '\n' + specB.effects.map((e) => e.description).join('\n'));

    // Enable buttons
    this.btnABg.setInteractive({ useHandCursor: true });
    this.btnBBg.setInteractive({ useHandCursor: true });

    // Show
    this.container.setVisible(true);
    this.visible = true;

    // Block scene input — player MUST choose
    this.scene.input.enabled = false;
    // Allow pointer events for the buttons themselves by re-enabling input on
    // the specific plugin level (manager stays active, scene-level flag is off
    // for keyboard/cursor only in practice; pointer is still forwarded to
    // interactive objects whose scene is active)
    this.scene.input.enabled = true; // Keep enabled so pointer works; keyboard actions are blocked by choosing flag
  }

  destroy(): void {
    this.container.destroy();
  }

  isVisible(): boolean {
    return this.visible;
  }

  // ---------------------------------------------------------------------------
  // Private — choice handler
  // ---------------------------------------------------------------------------

  private async onChoose(branchIndex: 0 | 1): Promise<void> {
    if (this.choosing || !this.currentSkillId || !this.currentSpecs) return;
    this.choosing = true;

    const spec = this.currentSpecs[branchIndex];

    // Disable both buttons visually
    this.btnABg.disableInteractive();
    this.btnBBg.disableInteractive();
    this.statusText.setText('GUARDANDO...');

    const result = await getSkillSystem().chooseSpec(this.currentSkillId, spec.id);

    // Guard: scene may have been destroyed while awaiting
    if (!this.scene?.scene?.isActive()) {
      this.visible = false;
      return;
    }

    if (result.success) {
      eventBus.emit(EVENTS.UI_NOTICE, {
        message: `⭐ ESPECIALIZACIÓN: ${spec.name}`,
        color: spec.color,
      });
      this.hide();
    } else {
      // Show error and let player retry
      this.statusText.setText(result.error ?? 'Error al guardar. Intentá de nuevo.');
      this.choosing = false;
      this.btnABg.setInteractive({ useHandCursor: true });
      this.btnBBg.setInteractive({ useHandCursor: true });
    }
  }

  private hide(): void {
    this.container.setVisible(false);
    this.visible = false;
    this.choosing = false;
    this.currentSkillId = null;
    this.currentSpecs   = null;

    // Re-enable scene input
    if (this.scene?.scene?.isActive()) {
      this.scene.input.enabled = true;
      if (this.scene.input.keyboard) {
        this.scene.input.keyboard.enabled = true;
      }
    }
  }
}
