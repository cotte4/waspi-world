// WorldMapPanel.ts
// Full-screen overlay showing the world zone layout, zone lock states,
// and the player's current skill levels with XP bars.
// Toggle with M key (or ESC to close). Fixed to camera via setScrollFactor(0).

import { getSkillSystem, type SkillId } from './SkillSystem';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_DEPTH = 9500; // above MasteryPanel (9300)
const FONT        = '"Press Start 2P", monospace';
const GOLD        = 0xf5c842;
const GOLD_HEX    = '#F5C842';
const BG_COLOR    = 0x000000;
const BG_ALPHA    = 0.88;
const PANEL_W     = 760;
const PANEL_H     = 540;

// XP thresholds per level (mirrors server-side config)
const XP_PER_LEVEL = [0, 100, 300, 700, 1500, 3000];

// ---------------------------------------------------------------------------
// Zone definitions
// ---------------------------------------------------------------------------

type ZoneStatus = 'unlocked' | 'locked';

type ZoneDef = {
  key: string;
  label: string;
  emoji: string;
  color: number;
  colorHex: string;
  status: ZoneStatus;
  lockLabel?: string; // shown when locked
};

// Lock states are evaluated at build time using current skill levels.
function buildZoneDefs(): ZoneDef[] {
  const skills = getSkillSystem();
  const miningLv  = skills.getLevel('mining');
  const fishingLv = skills.getLevel('fishing');
  const gardenLv  = skills.getLevel('gardening');

  return [
    {
      key: 'casa',
      label: 'TU CASA',
      emoji: '🏠',
      color: 0x2a2a44,
      colorHex: '#2A2A44',
      status: 'unlocked',
    },
    {
      key: 'plaza',
      label: 'PLAZA',
      emoji: '🏙️',
      color: 0x1a2a1a,
      colorHex: '#1A2A1A',
      status: 'unlocked',
    },
    {
      key: 'arcade',
      label: 'ARCADE',
      emoji: '🕹️',
      color: 0x14142a,
      colorHex: '#14142A',
      status: 'unlocked',
    },
    {
      key: 'cafe',
      label: 'CAFÉ',
      emoji: '☕',
      color: 0x1a0e0a,
      colorHex: '#1A0E0A',
      status: 'unlocked',
    },
    {
      key: 'gym',
      label: 'GYM',
      emoji: '💪',
      color: 0x1a0a0a,
      colorHex: '#1A0A0A',
      status: 'unlocked',
    },
    {
      key: 'store',
      label: 'TIENDA',
      emoji: '👟',
      color: 0x181820,
      colorHex: '#181820',
      status: 'unlocked',
    },
    {
      key: 'vecindad',
      label: 'VECINDAD',
      emoji: '🏘️',
      color: 0x0f2414,
      colorHex: '#0F2414',
      status: 'unlocked',
    },
    {
      key: 'bosque',
      label: 'BOSQUE',
      emoji: '🌲',
      color: 0x102010,
      colorHex: '#102010',
      status: 'unlocked',
    },
    {
      key: 'cueva',
      label: 'CUEVA',
      emoji: '⛏️',
      color: miningLv >= 5 ? 0x3a2a10 : 0x1a1a1a,
      colorHex: miningLv >= 5 ? '#3A2A10' : '#1A1A1A',
      status: miningLv >= 5 ? 'unlocked' : 'locked',
      lockLabel: 'Minería Lv5',
    },
    {
      key: 'deep_fishing',
      label: 'PESCA PROFUNDA',
      emoji: '🎣',
      color: fishingLv >= 3 ? 0x0a1a2a : 0x1a1a1a,
      colorHex: fishingLv >= 3 ? '#0A1A2A' : '#1A1A1A',
      status: fishingLv >= 3 ? 'unlocked' : 'locked',
      lockLabel: 'Pesca Lv3',
    },
    {
      key: 'jardin',
      label: 'JARDÍN COMUNAL',
      emoji: '🌿',
      color: gardenLv >= 5 ? 0x0f1e0f : 0x1a1a1a,
      colorHex: gardenLv >= 5 ? '#0F1E0F' : '#1A1A1A',
      status: gardenLv >= 5 ? 'unlocked' : 'locked',
      lockLabel: 'Jardinería Lv5',
    },
  ];
}

// ---------------------------------------------------------------------------
// Skill sidebar config
// ---------------------------------------------------------------------------

const SKILL_IDS: SkillId[] = ['mining', 'fishing', 'gardening', 'cooking', 'gym', 'weed'];

const SKILL_LABELS: Record<SkillId, string> = {
  mining:    'MINER',
  fishing:   'PESCA',
  gardening: 'JARDÍN',
  cooking:   'COCINA',
  gym:       'GYM',
  weed:      'CULTIVO',
};

const SKILL_COLORS_HEX: Record<SkillId, string> = {
  mining:    '#C8A45A',
  fishing:   '#4A9ECC',
  gardening: '#6FC86A',
  cooking:   '#FF7043',
  gym:       '#EF5350',
  weed:      '#66BB6A',
};

const SKILL_COLORS: Record<SkillId, number> = {
  mining:    0xc8a45a,
  fishing:   0x4a9ecc,
  gardening: 0x6fc86a,
  cooking:   0xff7043,
  gym:       0xef5350,
  weed:      0x66bb6a,
};

// ---------------------------------------------------------------------------
// WorldMapPanel
// ---------------------------------------------------------------------------

export class WorldMapPanel {
  private readonly scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible = false;

  // ESC key — registered once, cleaned up on destroy
  private keyEsc?: Phaser.Input.Keyboard.Key;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.container = scene.add.container(0, 0)
      .setDepth(PANEL_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);

    if (scene.input.keyboard) {
      this.keyEsc = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.keyEsc.on('down', () => { if (this.visible) this.hide(); });
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
    this.keyEsc?.destroy();
    this.container.destroy();
  }

  // ---------------------------------------------------------------------------
  // Private — build full panel (called each open so data is always fresh)
  // ---------------------------------------------------------------------------

  private build(): void {
    this.container.removeAll(true);

    const { width, height } = this.scene.scale;
    const cx = width  / 2;
    const cy = height / 2;
    const panelLeft = cx - PANEL_W / 2;
    const panelTop  = cy - PANEL_H / 2;

    // ── Dim overlay ──────────────────────────────────────────────────────────
    this.container.add(
      this.scene.add
        .rectangle(cx, cy, width, height, BG_COLOR, BG_ALPHA)
        .setScrollFactor(0),
    );

    // ── Panel background ─────────────────────────────────────────────────────
    const panelBg = this.scene.add.graphics().setScrollFactor(0);
    panelBg.fillStyle(0x0e0e14, 0.97);
    panelBg.fillRoundedRect(panelLeft, panelTop, PANEL_W, PANEL_H, 10);
    panelBg.lineStyle(2, GOLD, 1);
    panelBg.strokeRoundedRect(panelLeft, panelTop, PANEL_W, PANEL_H, 10);
    this.container.add(panelBg);

    // ── Title ─────────────────────────────────────────────────────────────────
    this.container.add(
      this.scene.add.text(cx - 60, panelTop + 16, 'MAPA DEL MUNDO', {
        fontSize: '10px',
        fontFamily: FONT,
        color: GOLD_HEX,
      }).setScrollFactor(0).setOrigin(0.5, 0),
    );

    // ── ESC hint ─────────────────────────────────────────────────────────────
    this.container.add(
      this.scene.add.text(panelLeft + PANEL_W - 8, panelTop + 16, '[ESC/M]', {
        fontSize: '7px',
        fontFamily: FONT,
        color: '#666688',
      }).setScrollFactor(0).setOrigin(1, 0),
    );

    // ── Divider line ─────────────────────────────────────────────────────────
    const divLine = this.scene.add.graphics().setScrollFactor(0);
    divLine.lineStyle(1, GOLD, 0.4);
    divLine.lineBetween(panelLeft + 12, panelTop + 38, panelLeft + PANEL_W - 12, panelTop + 38);
    this.container.add(divLine);

    // ── Layout area: left zone map, right skill sidebar ────────────────────
    const MAP_AREA_W  = 490;
    const SIDE_AREA_W = PANEL_W - MAP_AREA_W - 12;
    const CONTENT_TOP = panelTop + 46;

    this.buildZoneMap(panelLeft + 6, CONTENT_TOP, MAP_AREA_W, PANEL_H - 54);
    this.buildSkillSidebar(panelLeft + MAP_AREA_W + 10, CONTENT_TOP, SIDE_AREA_W, PANEL_H - 54);
  }

  // ---------------------------------------------------------------------------
  // Zone map layout
  // ---------------------------------------------------------------------------

  private buildZoneMap(x: number, y: number, w: number, h: number): void {
    const zones   = buildZoneDefs();
    const zoneMap = new Map(zones.map((z) => [z.key, z]));

    // Grid layout: each zone box
    const BOX_W = 112;
    const BOX_H = 42;
    const GAP_X = 8;
    const GAP_Y = 8;

    // Layout positions: [key, col, row]
    // col/row are 0-indexed in a logical grid
    type ZonePos = [string, number, number];
    const layout: ZonePos[] = [
      ['bosque',       0, 0],
      ['cueva',        1, 0],
      ['deep_fishing', 2, 0],
      ['jardin',       3, 0],
      ['vecindad',     0, 1],
      ['casa',         1, 1],
      ['plaza',        2, 1],
      ['arcade',       0, 2],
      ['cafe',         1, 2],
      ['gym',          2, 2],
      ['store',        3, 2],
    ];

    // Arrow connectors (from → to): drawn behind boxes
    const arrows: Array<[string, string, 'down' | 'right']> = [
      ['bosque',   'vecindad', 'down'],
      ['vecindad', 'plaza',    'right'],
      ['casa',     'plaza',    'right'],
    ];

    // Compute pixel position for each zone key
    const posFor = (key: string): { cx: number; cy: number } | undefined => {
      const entry = layout.find(([k]) => k === key);
      if (!entry) return undefined;
      const [, col, row] = entry;
      return {
        cx: x + col * (BOX_W + GAP_X) + BOX_W / 2,
        cy: y + 10 + row * (BOX_H + GAP_Y + 8) + BOX_H / 2,
      };
    };

    // Draw arrows first (behind boxes)
    const arrowG = this.scene.add.graphics().setScrollFactor(0);
    arrowG.lineStyle(1, 0x444466, 0.7);

    for (const [fromKey, toKey, dir] of arrows) {
      const from = posFor(fromKey);
      const to   = posFor(toKey);
      if (!from || !to) continue;

      if (dir === 'down') {
        const startY = from.cy + BOX_H / 2;
        const endY   = to.cy   - BOX_H / 2;
        arrowG.lineBetween(from.cx, startY, from.cx, endY);
        // arrowhead
        arrowG.lineBetween(from.cx, endY, from.cx - 4, endY - 6);
        arrowG.lineBetween(from.cx, endY, from.cx + 4, endY - 6);
      } else {
        const startX = from.cx + BOX_W / 2;
        const endX   = to.cx   - BOX_W / 2;
        arrowG.lineBetween(startX, from.cy, endX, from.cy);
        arrowG.lineBetween(endX, from.cy, endX - 6, from.cy - 4);
        arrowG.lineBetween(endX, from.cy, endX - 6, from.cy + 4);
      }
    }

    this.container.add(arrowG);

    // Draw zone boxes
    for (const [key, col, row] of layout) {
      const zone = zoneMap.get(key);
      if (!zone) continue;

      const bx = x + col * (BOX_W + GAP_X);
      const by = y + 10 + row * (BOX_H + GAP_Y + 8);

      const isLocked = zone.status === 'locked';

      const bg = this.scene.add.graphics().setScrollFactor(0);
      bg.fillStyle(zone.color, isLocked ? 0.5 : 0.9);
      bg.fillRoundedRect(bx, by, BOX_W, BOX_H, 4);
      bg.lineStyle(1, isLocked ? 0x444444 : GOLD, isLocked ? 0.3 : 0.6);
      bg.strokeRoundedRect(bx, by, BOX_W, BOX_H, 4);
      this.container.add(bg);

      // Emoji + label
      this.container.add(
        this.scene.add.text(bx + BOX_W / 2, by + 8, `${zone.emoji} ${zone.label}`, {
          fontSize: '6px',
          fontFamily: FONT,
          color: isLocked ? '#666666' : '#ffffff',
        }).setScrollFactor(0).setOrigin(0.5, 0),
      );

      if (isLocked && zone.lockLabel) {
        this.container.add(
          this.scene.add.text(bx + BOX_W / 2, by + BOX_H - 10, `🔒 ${zone.lockLabel}`, {
            fontSize: '5px',
            fontFamily: FONT,
            color: '#ff4444',
          }).setScrollFactor(0).setOrigin(0.5, 0),
        );
      } else {
        this.container.add(
          this.scene.add.text(bx + BOX_W / 2, by + BOX_H - 10, 'DESBLOQUEADA', {
            fontSize: '5px',
            fontFamily: FONT,
            color: '#39ff14',
          }).setScrollFactor(0).setOrigin(0.5, 0),
        );
      }
    }

    // Section label
    this.container.add(
      this.scene.add.text(x + w / 2, y - 2, 'ZONAS', {
        fontSize: '7px',
        fontFamily: FONT,
        color: '#888899',
      }).setScrollFactor(0).setOrigin(0.5, 0),
    );

    // Unused h param lint suppression — used for reference
    void h;
  }

  // ---------------------------------------------------------------------------
  // Skill sidebar
  // ---------------------------------------------------------------------------

  private buildSkillSidebar(x: number, y: number, w: number, _h: number): void {
    const skills = getSkillSystem();

    // Divider
    const sideDiv = this.scene.add.graphics().setScrollFactor(0);
    sideDiv.lineStyle(1, GOLD, 0.3);
    sideDiv.lineBetween(x - 4, y, x - 4, y + _h - 10);
    this.container.add(sideDiv);

    // Header
    this.container.add(
      this.scene.add.text(x + w / 2, y - 2, 'SKILLS', {
        fontSize: '7px',
        fontFamily: FONT,
        color: '#888899',
      }).setScrollFactor(0).setOrigin(0.5, 0),
    );

    const ROW_H      = 68;
    const BAR_W      = w - 14;
    const BAR_H      = 6;

    SKILL_IDS.forEach((skillId, i) => {
      const level = skills.getLevel(skillId);
      const xp    = skills.getXp(skillId);
      const row_y = y + 14 + i * ROW_H;

      const colorHex = SKILL_COLORS_HEX[skillId];
      const colorNum = SKILL_COLORS[skillId];

      // Row background
      const rowBg = this.scene.add.graphics().setScrollFactor(0);
      rowBg.fillStyle(0x111122, 0.6);
      rowBg.fillRoundedRect(x + 2, row_y, w - 6, ROW_H - 4, 3);
      this.container.add(rowBg);

      // Skill name + level badge
      this.container.add(
        this.scene.add.text(x + 8, row_y + 6, SKILL_LABELS[skillId], {
          fontSize: '6px',
          fontFamily: FONT,
          color: colorHex,
        }).setScrollFactor(0),
      );

      this.container.add(
        this.scene.add.text(x + w - 10, row_y + 6, `Lv${level}`, {
          fontSize: '6px',
          fontFamily: FONT,
          color: GOLD_HEX,
        }).setScrollFactor(0).setOrigin(1, 0),
      );

      // Title
      const title = skills.getTitle(skillId);
      this.container.add(
        this.scene.add.text(x + 8, row_y + 20, title, {
          fontSize: '5px',
          fontFamily: FONT,
          color: '#888899',
        }).setScrollFactor(0),
      );

      // XP bar
      const barX = x + 8;
      const barY = row_y + 36;

      // XP to next level
      const xpAtLevel  = XP_PER_LEVEL[Math.min(level,     XP_PER_LEVEL.length - 1)] ?? 0;
      const xpNextLv   = XP_PER_LEVEL[Math.min(level + 1, XP_PER_LEVEL.length - 1)] ?? xpAtLevel;
      const xpProgress = level >= 5 ? 1 : (xpNextLv > xpAtLevel
        ? Math.min(1, (xp - xpAtLevel) / (xpNextLv - xpAtLevel))
        : 1);

      const barBg = this.scene.add.graphics().setScrollFactor(0);
      barBg.fillStyle(0x222233, 1);
      barBg.fillRoundedRect(barX, barY, BAR_W, BAR_H, 2);
      this.container.add(barBg);

      const fillW = Math.max(4, Math.floor(BAR_W * xpProgress));
      const barFill = this.scene.add.graphics().setScrollFactor(0);
      barFill.fillStyle(colorNum, 0.85);
      barFill.fillRoundedRect(barX, barY, fillW, BAR_H, 2);
      this.container.add(barFill);

      // XP label
      const xpLabel = level >= 5
        ? 'MAX'
        : `${xp} / ${xpNextLv} XP`;
      this.container.add(
        this.scene.add.text(barX + BAR_W / 2, barY + BAR_H + 3, xpLabel, {
          fontSize: '5px',
          fontFamily: FONT,
          color: '#666688',
        }).setScrollFactor(0).setOrigin(0.5, 0),
      );
    });
  }
}
