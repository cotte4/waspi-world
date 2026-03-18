// MasteryPanel.ts
// In-game overlay panel for viewing and unlocking mastery nodes.
// Toggle with the M key. Built with Phaser GameObjects (no DOM).
// Fixed to camera via setScrollFactor(0).

import { getMasterySystem } from './MasterySystem';
import type { MasteryNodeDef } from './MasterySystem';
import { MASTERY_TREES } from '../config/masteryTrees';
import type { SkillId } from './SkillSystem';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_DEPTH = 9300;
const PANEL_W     = 700;
const PANEL_H     = 500;

const BG_COLOR     = 0x0e0e14;
const BORDER_COLOR = 0xf5c842;

const FONT = '"Press Start 2P", monospace';

const ALL_SKILL_IDS: SkillId[] = [
  'mining',
  'fishing',
  'gardening',
  'cooking',
  'gym',
  'weed',
];

const SKILL_LABELS: Record<SkillId, string> = {
  mining:    'MINERÍA',
  fishing:   'PESCA',
  gardening: 'JARDINERÍA',
  cooking:   'COCINA',
  gym:       'GYM',
  weed:      'CULTIVO',
};

const SKILL_COLORS: Record<SkillId, number> = {
  mining:    0xc8a45a,
  fishing:   0x4a9ecc,
  gardening: 0x6fc86a,
  cooking:   0xff7043,
  gym:       0xef5350,
  weed:      0x66bb6a,
};

const SKILL_COLORS_HEX: Record<SkillId, string> = {
  mining:    '#C8A45A',
  fishing:   '#4A9ECC',
  gardening: '#6FC86A',
  cooking:   '#FF7043',
  gym:       '#EF5350',
  weed:      '#66BB6A',
};

// Node visual dimensions
const NODE_W = 130;
const NODE_H = 44;

// ---------------------------------------------------------------------------
// Helper — get mastery nodes for a skill
// ---------------------------------------------------------------------------

function getTreeForSkill(skillId: SkillId): MasteryNodeDef[] {
  const tree = MASTERY_TREES.find((t) => t.skillId === skillId);
  if (!tree) return [];
  // masteryTrees uses its own MasteryNodeDef shape — map to MasterySystem's shape
  return tree.nodes.map((n) => ({
    id: n.id,
    skill_id: n.skillId,
    tier: n.tier,
    name: n.name,
    description: n.description,
    mp_cost: n.cost,
    requires: n.requires,
    effect: n.effect,
  }));
}

// ---------------------------------------------------------------------------
// MasteryPanel
// ---------------------------------------------------------------------------

export class MasteryPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible = false;
  private currentSkillIndex = 0;

  // Dynamic build elements (torn down and rebuilt on each show/unlock)
  private treeContainer?: Phaser.GameObjects.Container;
  private selectedNodeId: string | null = null;

  // Keyboard cursors
  private keyM?: Phaser.Input.Keyboard.Key;
  private keyLeft?: Phaser.Input.Keyboard.Key;
  private keyRight?: Phaser.Input.Keyboard.Key;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.container = scene.add.container(0, 0)
      .setDepth(PANEL_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);

    // Register keyboard shortcuts
    if (scene.input.keyboard) {
      this.keyM     = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
      this.keyLeft  = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
      this.keyRight = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);

      this.keyM.on('down', () => this.toggle());
      this.keyLeft.on('down', () => {
        if (this.visible) {
          this.currentSkillIndex = (this.currentSkillIndex - 1 + ALL_SKILL_IDS.length) % ALL_SKILL_IDS.length;
          this.selectedNodeId = null;
          this.build();
        }
      });
      this.keyRight.on('down', () => {
        if (this.visible) {
          this.currentSkillIndex = (this.currentSkillIndex + 1) % ALL_SKILL_IDS.length;
          this.selectedNodeId = null;
          this.build();
        }
      });
    }
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

  destroy(): void {
    this.treeContainer?.destroy();
    this.container.destroy();
    this.keyM?.destroy();
    this.keyLeft?.destroy();
    this.keyRight?.destroy();
  }

  // ---------------------------------------------------------------------------
  // Private — build (full redraw)
  // ---------------------------------------------------------------------------

  private build(): void {
    // Destroy previous dynamic tree layer
    this.treeContainer?.destroy();
    this.container.removeAll(false);

    const { width, height } = this.scene.scale;
    const cx = width  / 2;
    const cy = height / 2;
    const panelLeft = cx - PANEL_W / 2;
    const panelTop  = cy - PANEL_H / 2;

    // ── Dim overlay ──
    this.container.add(
      this.scene.add.rectangle(cx, cy, width, height, 0x000000, 0.75).setScrollFactor(0),
    );

    // ── Panel background ──
    this.container.add(
      this.scene.add.rectangle(cx, cy, PANEL_W, PANEL_H, BG_COLOR, 0.97).setScrollFactor(0),
    );

    // ── Panel border ──
    const borderGfx = this.scene.add.graphics().setScrollFactor(0);
    borderGfx.lineStyle(2, BORDER_COLOR, 1);
    borderGfx.strokeRoundedRect(panelLeft, panelTop, PANEL_W, PANEL_H, 10);
    this.container.add(borderGfx);

    // ── Title row ──
    this.container.add(
      this.scene.add.text(cx, panelTop + 22, 'MAESTRÍA', {
        fontSize: '11px',
        fontFamily: FONT,
        color: '#F5C842',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5, 0.5).setScrollFactor(0),
    );

    this.container.add(
      this.scene.add.text(cx + PANEL_W / 2 - 12, panelTop + 22, '[M] CERRAR', {
        fontSize: '5px',
        fontFamily: FONT,
        color: '#555566',
      }).setOrigin(1, 0.5).setScrollFactor(0),
    );

    // ── Skill navigator ──
    this.buildSkillNavigator(panelLeft, panelTop, cx);

    // ── Tree area ──
    this.buildTree(panelLeft, panelTop, cx, cy);

    // ── Description + unlock zone ──
    this.buildDescriptionZone(panelLeft, panelTop, cx);
  }

  // ---------------------------------------------------------------------------
  // Skill navigator row
  // ---------------------------------------------------------------------------

  private buildSkillNavigator(panelLeft: number, panelTop: number, cx: number): void {
    const skillId = ALL_SKILL_IDS[this.currentSkillIndex] as SkillId;
    const mp      = getMasterySystem().getMp(skillId);
    const unlocked = getMasterySystem().getUnlocked(skillId);
    const nodes    = getTreeForSkill(skillId);
    const unlockedCount = nodes.filter((n) => unlocked.has(n.id)).length;
    const totalCount    = nodes.length;
    const colorHex = SKILL_COLORS_HEX[skillId];

    const navY = panelTop + 52;

    // Left arrow button
    const leftBtn = this.scene.add.text(panelLeft + 24, navY, '◄', {
      fontSize: '10px', fontFamily: FONT, color: '#888899',
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    leftBtn.on('pointerdown', () => {
      this.currentSkillIndex = (this.currentSkillIndex - 1 + ALL_SKILL_IDS.length) % ALL_SKILL_IDS.length;
      this.selectedNodeId = null;
      this.build();
    });
    leftBtn.on('pointerover', () => leftBtn.setColor('#F5C842'));
    leftBtn.on('pointerout', () => leftBtn.setColor('#888899'));
    this.container.add(leftBtn);

    // Right arrow button
    const rightBtn = this.scene.add.text(panelLeft + PANEL_W - 24, navY, '►', {
      fontSize: '10px', fontFamily: FONT, color: '#888899',
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    rightBtn.on('pointerdown', () => {
      this.currentSkillIndex = (this.currentSkillIndex + 1) % ALL_SKILL_IDS.length;
      this.selectedNodeId = null;
      this.build();
    });
    rightBtn.on('pointerover', () => rightBtn.setColor('#F5C842'));
    rightBtn.on('pointerout', () => rightBtn.setColor('#888899'));
    this.container.add(rightBtn);

    // Skill name
    this.container.add(
      this.scene.add.text(cx, navY, SKILL_LABELS[skillId], {
        fontSize: '9px', fontFamily: FONT, color: colorHex, stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setScrollFactor(0),
    );

    // MP display
    this.container.add(
      this.scene.add.text(cx + 120, navY, `MP: ${mp}`, {
        fontSize: '7px', fontFamily: FONT, color: '#F5C842',
      }).setOrigin(0, 0.5).setScrollFactor(0),
    );

    // Nodes counter
    this.container.add(
      this.scene.add.text(cx - 120, navY, `[${unlockedCount}/${totalCount > 0 ? totalCount : 5}]`, {
        fontSize: '7px', fontFamily: FONT, color: '#888899',
      }).setOrigin(1, 0.5).setScrollFactor(0),
    );

    // Divider
    const divGfx = this.scene.add.graphics().setScrollFactor(0);
    divGfx.lineStyle(1, 0x333344, 1);
    divGfx.lineBetween(panelLeft + 16, navY + 18, panelLeft + PANEL_W - 16, navY + 18);
    this.container.add(divGfx);
  }

  // ---------------------------------------------------------------------------
  // Tree layout
  // ---------------------------------------------------------------------------

  private buildTree(
    panelLeft: number,
    panelTop: number,
    cx: number,
    _cy: number,
  ): void {
    const skillId  = ALL_SKILL_IDS[this.currentSkillIndex] as SkillId;
    const nodes    = getTreeForSkill(skillId);
    const unlocked = getMasterySystem().getUnlocked(skillId);
    const mp       = getMasterySystem().getMp(skillId);
    const color    = SKILL_COLORS[skillId];

    // Tree starts just below navigator row
    const treeOriginY = panelTop + 92;

    // Position map: tier → y offset from treeOriginY
    const TIER_Y: Record<number, number> = { 1: 0, 2: 80, 3: 160 };

    // Compute X positions per node
    // Tier 1 → centered; Tier 2 → ±150; Tier 3 → same X as parent Tier 2
    const nodePositions = new Map<string, { x: number; y: number }>();

    for (const node of nodes) {
      const y = treeOriginY + (TIER_Y[node.tier] ?? 0);
      let x: number;
      if (node.tier === 1) {
        x = cx;
      } else if (node.tier === 2) {
        // Determine index among tier2 siblings
        const tier2Nodes = nodes.filter((n) => n.tier === 2);
        const idx = tier2Nodes.indexOf(node);
        x = cx + (idx === 0 ? -150 : 150);
      } else {
        // Tier 3 — inherit X from its tier2 parent
        const parentId = node.requires[0];
        if (parentId) {
          const parentPos = nodePositions.get(parentId);
          x = parentPos ? parentPos.x : cx;
        } else {
          x = cx;
        }
      }
      nodePositions.set(node.id, { x, y });
    }

    // Draw connector lines first (behind nodes)
    const lineGfx = this.scene.add.graphics().setScrollFactor(0);
    lineGfx.lineStyle(1, 0x333344, 1);
    for (const node of nodes) {
      for (const reqId of node.requires) {
        const from = nodePositions.get(reqId);
        const to   = nodePositions.get(node.id);
        if (from && to) {
          lineGfx.lineBetween(from.x, from.y + NODE_H / 2, to.x, to.y - NODE_H / 2);
        }
      }
    }
    this.container.add(lineGfx);

    // Draw each node
    for (const node of nodes) {
      const pos = nodePositions.get(node.id);
      if (!pos) continue;

      const isUnlocked   = unlocked.has(node.id);
      const prereqsMet   = node.requires.every((r) => unlocked.has(r));
      const isAvailable  = prereqsMet && !isUnlocked && mp >= node.mp_cost;
      const isSelected   = this.selectedNodeId === node.id;

      // Visual state
      let bgColor: number;
      let borderColor: number;
      let borderAlpha: number;
      let textColor: string;

      if (isUnlocked) {
        bgColor     = color;
        borderColor = color;
        borderAlpha = 1;
        textColor   = '#FFFFFF';
      } else if (isAvailable) {
        bgColor     = 0x2a2a3a;
        borderColor = BORDER_COLOR;
        borderAlpha = 1;
        textColor   = '#EEEEEE';
      } else {
        bgColor     = 0x111118;
        borderColor = 0x333344;
        borderAlpha = 0.8;
        textColor   = '#555566';
      }

      const nodeGfx = this.scene.add.graphics().setScrollFactor(0);
      nodeGfx.fillStyle(bgColor, isUnlocked ? 0.85 : 0.95);
      nodeGfx.fillRoundedRect(pos.x - NODE_W / 2, pos.y - NODE_H / 2, NODE_W, NODE_H, 6);
      nodeGfx.lineStyle(isSelected ? 2 : 1, isSelected ? BORDER_COLOR : borderColor, isSelected ? 1 : borderAlpha);
      nodeGfx.strokeRoundedRect(pos.x - NODE_W / 2, pos.y - NODE_H / 2, NODE_W, NODE_H, 6);

      // Unlock checkmark for unlocked nodes
      const nameLabel = isUnlocked ? `${node.name} ✓` : node.name;

      const nodeNameText = this.scene.add.text(pos.x, pos.y - 6, nameLabel, {
        fontSize: '5px', fontFamily: FONT, color: textColor,
        wordWrap: { width: NODE_W - 12 }, align: 'center',
      }).setOrigin(0.5, 0.5).setScrollFactor(0);

      const tierLabel = this.scene.add.text(pos.x, pos.y + 9, `T${node.tier}`, {
        fontSize: '4px', fontFamily: FONT,
        color: isUnlocked ? 'rgba(255,255,255,0.5)' : '#444455',
      }).setOrigin(0.5, 0.5).setScrollFactor(0);

      // Transparent hit area for selection
      const hitArea = this.scene.add.rectangle(pos.x, pos.y, NODE_W, NODE_H, 0x000000, 0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: !isUnlocked });

      hitArea.on('pointerdown', () => {
        this.selectedNodeId = this.selectedNodeId === node.id ? null : node.id;
        this.build();
      });
      hitArea.on('pointerover', () => {
        if (!isUnlocked) nodeGfx.lineStyle(2, BORDER_COLOR, 0.6);
      });
      hitArea.on('pointerout', () => {
        nodeGfx.lineStyle(isSelected ? 2 : 1, isSelected ? BORDER_COLOR : borderColor, isSelected ? 1 : borderAlpha);
      });

      this.container.add([nodeGfx, nodeNameText, tierLabel, hitArea]);
    }
  }

  // ---------------------------------------------------------------------------
  // Description + unlock zone (bottom 100px of panel)
  // ---------------------------------------------------------------------------

  private buildDescriptionZone(
    panelLeft: number,
    panelTop: number,
    cx: number,
  ): void {
    const skillId  = ALL_SKILL_IDS[this.currentSkillIndex] as SkillId;
    const nodes    = getTreeForSkill(skillId);
    const unlocked = getMasterySystem().getUnlocked(skillId);
    const mp       = getMasterySystem().getMp(skillId);

    const zoneTop = panelTop + PANEL_H - 100;

    // Divider
    const divGfx = this.scene.add.graphics().setScrollFactor(0);
    divGfx.lineStyle(1, 0x222233, 1);
    divGfx.lineBetween(panelLeft + 16, zoneTop, panelLeft + PANEL_W - 16, zoneTop);
    this.container.add(divGfx);

    if (!this.selectedNodeId) {
      // No node selected — hint text
      this.container.add(
        this.scene.add.text(cx, zoneTop + 40, 'Selecciona un nodo para ver detalles', {
          fontSize: '6px', fontFamily: FONT, color: '#444455',
        }).setOrigin(0.5, 0.5).setScrollFactor(0),
      );
      return;
    }

    const selectedNode = nodes.find((n) => n.id === this.selectedNodeId);
    if (!selectedNode) return;

    const isUnlocked  = unlocked.has(selectedNode.id);
    const prereqsMet  = selectedNode.requires.every((r) => unlocked.has(r));
    const canUnlock   = prereqsMet && !isUnlocked && mp >= selectedNode.mp_cost;

    // Node name
    this.container.add(
      this.scene.add.text(cx, zoneTop + 18, `[${selectedNode.name}]`, {
        fontSize: '7px', fontFamily: FONT, color: '#F5C842',
      }).setOrigin(0.5, 0.5).setScrollFactor(0),
    );

    // Description
    this.container.add(
      this.scene.add.text(cx, zoneTop + 40, `"${selectedNode.description}"`, {
        fontSize: '5px', fontFamily: FONT, color: '#B0B0C0',
        wordWrap: { width: PANEL_W - 200 }, align: 'center',
      }).setOrigin(0.5, 0.5).setScrollFactor(0),
    );

    // UNLOCK button — only shown when the node is actually available
    if (canUnlock) {
      const btnX = cx + PANEL_W / 2 - 100;
      const btnY = zoneTop + 35;
      const btnW = 160;
      const btnH = 30;

      const btnBg = this.scene.add.rectangle(btnX, btnY, btnW, btnH, 0x1a2a1a, 1)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      btnBg.setStrokeStyle(1, 0x39ff14, 0.9);

      const btnLabel = this.scene.add.text(btnX, btnY, `DESBLOQUEAR — ${selectedNode.mp_cost} MP`, {
        fontSize: '5px', fontFamily: FONT, color: '#39FF14',
      }).setOrigin(0.5, 0.5).setScrollFactor(0);

      btnBg.on('pointerover', () => btnBg.setFillStyle(0x245a24, 1));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x1a2a1a, 1));
      btnBg.on('pointerdown', () => {
        // Disable immediately to prevent double-spend on double-click
        btnBg.disableInteractive();
        btnLabel.setText('...');
        void getMasterySystem().unlockNode(skillId, selectedNode.id).then((result) => {
          if (result.success) {
            btnLabel.setText('¡DESBLOQUEADO!');
            this.scene.time.delayedCall(1500, () => {
              this.selectedNodeId = null;
              this.build();
            });
          } else {
            btnLabel.setText(result.error ?? 'ERROR');
            this.scene.time.delayedCall(2000, () => {
              // Re-enable the button only on failure so the player can retry
              btnBg.setInteractive({ useHandCursor: true });
              btnLabel.setText(`DESBLOQUEAR — ${selectedNode.mp_cost} MP`);
            });
          }
        });
      });

      this.container.add([btnBg, btnLabel]);
    } else if (isUnlocked) {
      this.container.add(
        this.scene.add.text(cx + PANEL_W / 2 - 100, zoneTop + 35, '✓ DESBLOQUEADO', {
          fontSize: '6px', fontFamily: FONT, color: '#39FF14',
        }).setOrigin(0.5, 0.5).setScrollFactor(0),
      );
    } else if (!prereqsMet) {
      this.container.add(
        this.scene.add.text(cx + PANEL_W / 2 - 100, zoneTop + 35, 'Prerrequisito pendiente', {
          fontSize: '5px', fontFamily: FONT, color: '#555566',
        }).setOrigin(0.5, 0.5).setScrollFactor(0),
      );
    } else {
      // prereqs met but not enough MP
      this.container.add(
        this.scene.add.text(cx + PANEL_W / 2 - 100, zoneTop + 35, `MP insuficientes (costo: ${selectedNode.mp_cost})`, {
          fontSize: '5px', fontFamily: FONT, color: '#555566',
        }).setOrigin(0.5, 0.5).setScrollFactor(0),
      );
    }
  }
}
