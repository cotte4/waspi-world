// FishCompendiumPanel.ts
// Overlay panel ("ACUARIO") that shows the player's fish collection progress.
// Toggle with key F near the fishing dock/pond in VecindadScene.
// Architecture mirrors QuestPanel / ContractPanel.

import Phaser from 'phaser';
import { FISH_SPECIES } from '../config/fishSpecies';
import type { FishSpecies } from '../config/fishSpecies';
import { getAuthHeaders } from './authHelper';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PANEL_DEPTH = 9400;
const PANEL_W     = 540;
const PANEL_H     = 480;
const FONT        = '"Press Start 2P", monospace';
const FONT_SMALL  = '"Silkscreen", monospace';
const BG_COLOR    = 0x0d0d14;
const BORDER_COLOR = 0x4a9ecc;   // fishing blue
const GOLD_HEX    = '#F5C842';
const BLUE_HEX    = '#4A9ECC';
const GREY_HEX    = '#444455';

const CELL_W      = 112;
const CELL_H      = 78;
const CELL_COLS   = 4;
const GRID_PAD_X  = 24;
const GRID_PAD_Y  = 78;   // top padding inside panel before grid starts

// ---------------------------------------------------------------------------
// FishCollectionEntry — shape returned by GET /api/fishing/collection
// ---------------------------------------------------------------------------

interface FishCollectionEntry {
  fish_id: string;
  caught_at: string;
  quality: string | null;
  size: number | null;
}

// ---------------------------------------------------------------------------
// FishCompendiumPanel
// ---------------------------------------------------------------------------

export class FishCompendiumPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible = false;

  // Dynamic elements rebuilt on each show()
  private cellElements: Phaser.GameObjects.GameObject[] = [];
  private counterText?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setDepth(PANEL_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);

    this._buildSkeleton();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  show(): void {
    this.container.setVisible(true);
    this.visible = true;
    // Async load + refresh grid; guard against panel being closed before response
    void this._loadAndRefresh();
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
  // Skeleton — built once in constructor
  // ---------------------------------------------------------------------------

  private _buildSkeleton(): void {
    const { width, height } = this.scene.scale;
    const pcx = width / 2;
    const pcy = height / 2;

    // Full-screen dimmer
    const dim = this.scene.add
      .rectangle(pcx, pcy, width, height, 0x000000, 0.78)
      .setScrollFactor(0);

    // Panel background
    const panelBg = this.scene.add
      .rectangle(pcx, pcy, PANEL_W, PANEL_H, BG_COLOR, 0.98)
      .setScrollFactor(0);

    // Blue border
    const borderGfx = this.scene.add.graphics().setScrollFactor(0);
    borderGfx.lineStyle(2, BORDER_COLOR, 1);
    borderGfx.strokeRoundedRect(
      pcx - PANEL_W / 2,
      pcy - PANEL_H / 2,
      PANEL_W,
      PANEL_H,
      10,
    );

    // Title
    this.scene.add
      .text(pcx - PANEL_W / 2 + 18, pcy - PANEL_H / 2 + 20, '🐟 ACUARIO', {
        fontSize: '9px',
        fontFamily: FONT,
        color: GOLD_HEX,
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);

    // Counter text — updated on refresh
    this.counterText = this.scene.add
      .text(pcx + PANEL_W / 2 - 18, pcy - PANEL_H / 2 + 20, '?/12 ESPECIES', {
        fontSize: '7px',
        fontFamily: FONT,
        color: BLUE_HEX,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0);

    // Separator
    const sepY = pcy - PANEL_H / 2 + 38;
    const sepGfx = this.scene.add.graphics().setScrollFactor(0);
    sepGfx.lineStyle(1, BORDER_COLOR, 0.4);
    sepGfx.lineBetween(
      pcx - PANEL_W / 2 + 16,
      sepY,
      pcx + PANEL_W / 2 - 16,
      sepY,
    );

    // Footer hint
    this.scene.add
      .text(pcx + PANEL_W / 2 - 14, pcy + PANEL_H / 2 - 12, '[F] CERRAR', {
        fontSize: '5px',
        fontFamily: FONT,
        color: GREY_HEX,
      })
      .setOrigin(1, 1)
      .setScrollFactor(0);

    this.container.add([dim, panelBg, borderGfx, sepGfx, this.counterText]);
  }

  // ---------------------------------------------------------------------------
  // Load collection then refresh grid
  // ---------------------------------------------------------------------------

  private async _loadAndRefresh(): Promise<void> {
    let caught = new Set<string>();

    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/fishing/collection', { headers: authH });
      if (res.ok) {
        const data = (await res.json()) as { collection: FishCollectionEntry[] };
        caught = new Set(data.collection.map((e) => e.fish_id));
      }
    } catch (err) {
      console.warn('[FishCompendiumPanel] Failed to load collection:', err);
    }

    // Guard: panel may have been hidden/destroyed while awaiting
    if (!this.visible) return;
    if (!this.container.active) return;

    this._rebuildGrid(caught);
  }

  // ---------------------------------------------------------------------------
  // Grid rebuild — called after collection loads
  // ---------------------------------------------------------------------------

  private _rebuildGrid(caught: Set<string>): void {
    // Destroy previous cell elements
    for (const obj of this.cellElements) {
      const go = obj as Phaser.GameObjects.GameObject & { active?: boolean };
      if (go.active !== false) obj.destroy();
    }
    this.cellElements = [];

    const { width, height } = this.scene.scale;
    const pcx = width / 2;
    const pcy = height / 2;
    const panelLeft = pcx - PANEL_W / 2;
    const panelTop  = pcy - PANEL_H / 2;

    const totalCaught = FISH_SPECIES.filter((f) => caught.has(f.id)).length;
    if (this.counterText?.active) {
      this.counterText.setText(`${totalCaught}/12 ESPECIES`);
      this.counterText.setColor(totalCaught === 12 ? '#39FF14' : BLUE_HEX);
    }

    FISH_SPECIES.forEach((species, index) => {
      const col = index % CELL_COLS;
      const row = Math.floor(index / CELL_COLS);

      const cellX = panelLeft + GRID_PAD_X + col * (CELL_W + 4);
      const cellY = panelTop  + GRID_PAD_Y + row * (CELL_H + 4);

      const isCaught = caught.has(species.id);
      const elements = this._buildCell(species, cellX, cellY, isCaught);
      this.cellElements.push(...elements);
      this.container.add(elements);
    });
  }

  // ---------------------------------------------------------------------------
  // Single cell builder
  // ---------------------------------------------------------------------------

  private _buildCell(
    species: FishSpecies,
    x: number,
    y: number,
    isCaught: boolean,
  ): Phaser.GameObjects.GameObject[] {
    const els: Phaser.GameObjects.GameObject[] = [];
    const rarityColors: Record<string, number> = {
      common:    0x555566,
      uncommon:  0x4a9ecc,
      rare:      0xa855f7,
      legendary: 0xf5c842,
    };
    const borderColor = isCaught ? rarityColors[species.rarity] : 0x222233;

    // Cell background
    const bg = this.scene.add.graphics().setScrollFactor(0);
    bg.fillStyle(isCaught ? 0x0f1a2a : 0x0a0a14, 1);
    bg.fillRoundedRect(x, y, CELL_W, CELL_H, 5);
    bg.lineStyle(1, borderColor, isCaught ? 0.8 : 0.3);
    bg.strokeRoundedRect(x, y, CELL_W, CELL_H, 5);
    els.push(bg);

    if (isCaught) {
      // Emoji (large)
      const emoji = this.scene.add
        .text(x + CELL_W / 2, y + 24, species.emoji, {
          fontSize: '22px',
          fontFamily: FONT_SMALL,
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      els.push(emoji);

      // Name
      const name = this.scene.add
        .text(x + CELL_W / 2, y + 48, species.name, {
          fontSize: '5px',
          fontFamily: FONT,
          color: GOLD_HEX,
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      els.push(name);

      // Rarity badge
      const rarityHex: Record<string, string> = {
        common:    '#888899',
        uncommon:  '#4A9ECC',
        rare:      '#A855F7',
        legendary: '#F5C842',
      };
      const badge = this.scene.add
        .text(x + CELL_W / 2, y + 63, species.rarity.toUpperCase(), {
          fontSize: '4px',
          fontFamily: FONT,
          color: rarityHex[species.rarity] ?? '#888899',
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      els.push(badge);
    } else {
      // Unknown: silhouette placeholder
      const silhouette = this.scene.add
        .text(x + CELL_W / 2, y + 24, '?', {
          fontSize: '22px',
          fontFamily: FONT,
          color: '#1a1a2a',
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      els.push(silhouette);

      const unknown = this.scene.add
        .text(x + CELL_W / 2, y + 52, '???', {
          fontSize: '6px',
          fontFamily: FONT,
          color: '#222233',
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      els.push(unknown);
    }

    return els;
  }
}
