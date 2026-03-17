// MiningMinigame.ts
// Timing bar minigame overlay for the mining skill interaction.
// Player presses SPACE to stop a bouncing cursor on a colored zone.
// Returns a Promise<MinigameResult> resolved on input or auto-mode timeout.

import Phaser from 'phaser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MinigameResult = 'miss' | 'ok' | 'good' | 'perfect';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PANEL_W = 560;
const PANEL_H = 160;
const BAR_W = 420;
const BAR_H = 28;
const CURSOR_W = 4;
const CURSOR_H = BAR_H + 16;
const DEPTH = 9500;
const CURSOR_SPEED_BASE = 240; // px/s

// Zone widths must sum to BAR_W (420)
// MISS: 75×2=150 | OK: 60×2=120 | GOOD: 45×2=90 | PERFECT: 60 → total 420
const ZONE_MISS = 75;
const ZONE_OK = 60;
const ZONE_GOOD = 45;
const ZONE_PERFECT = 60;

interface Zone {
  label: MinigameResult;
  color: number;
  start: number; // relative to bar left (0)
  end: number;
}

function buildZones(): Zone[] {
  // Symmetric layout: MISS | OK | GOOD | PERFECT | GOOD | OK | MISS
  const zones: Zone[] = [];
  let x = 0;

  const push = (label: MinigameResult, color: number, width: number): void => {
    zones.push({ label, color, start: x, end: x + width });
    x += width;
  };

  push('miss',    0xcc3333, ZONE_MISS);
  push('ok',      0xc8a45a, ZONE_OK);
  push('good',    0x4caf50, ZONE_GOOD);
  push('perfect', 0xf5c842, ZONE_PERFECT);
  push('good',    0x4caf50, ZONE_GOOD);
  push('ok',      0xc8a45a, ZONE_OK);
  push('miss',    0xcc3333, ZONE_MISS);

  return zones;
}

// ---------------------------------------------------------------------------
// Auto-mode random zone picker
// Weights: MISS 40%, OK 35%, GOOD 20%, PERFECT 5%
// ---------------------------------------------------------------------------

function pickAutoZoneIndex(zones: Zone[]): number {
  const roll = Phaser.Math.Between(1, 100);
  if (roll <= 40) {
    // MISS — pick left or right miss zone
    return Phaser.Math.Between(0, 1) === 0 ? 0 : 6;
  } else if (roll <= 75) {
    // OK — pick left or right ok zone
    return Phaser.Math.Between(0, 1) === 0 ? 1 : 5;
  } else if (roll <= 95) {
    // GOOD — pick left or right good zone
    return Phaser.Math.Between(0, 1) === 0 ? 2 : 4;
  } else {
    // PERFECT
    return 3;
  }
}

// Returns a cursor x position (relative to bar left) that lands inside a zone
function randomXInZone(zone: Zone): number {
  return Phaser.Math.Between(zone.start + 2, zone.end - 2);
}

// ---------------------------------------------------------------------------
// MiningMinigame
// ---------------------------------------------------------------------------

export class MiningMinigame {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private cursorObj: Phaser.GameObjects.Rectangle | null = null;
  private cursorTween: Phaser.Tweens.Tween | null = null;
  private spaceKey: Phaser.Input.Keyboard.Key | null = null;
  private resolvePromise: ((result: MinigameResult) => void) | null = null;
  private resolved = false;
  private zones: Zone[];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.zones = buildZones();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  play(autoMode = false): Promise<MinigameResult> {
    return new Promise<MinigameResult>((resolve) => {
      this.resolvePromise = resolve;
      this.resolved = false;
      this._buildPanel(autoMode);
      this._startCursorAnimation();

      if (autoMode) {
        this._scheduleAutoResolve();
      } else {
        this._listenForSpace();
      }
    });
  }

  destroy(): void {
    this._cleanup();
  }

  // -------------------------------------------------------------------------
  // Panel construction
  // -------------------------------------------------------------------------

  private _buildPanel(autoMode: boolean): void {
    const cam = this.scene.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    const objects: Phaser.GameObjects.GameObject[] = [];

    // Background panel
    const bg = this.scene.add.rectangle(0, 0, PANEL_W, PANEL_H, 0x0e0e14)
      .setAlpha(0.92)
      .setStrokeStyle(2, 0xf5c842);
    objects.push(bg);

    // Title
    const title = autoMode
      ? '\u26CF MODO AUTO'
      : '\u26CF GOLPEA EN EL MOMENTO CORRECTO';

    const titleText = this.scene.add.text(0, -(PANEL_H / 2) + 18, title, {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5, 0.5);
    objects.push(titleText);

    // Bar background (dark)
    const barBg = this.scene.add.rectangle(0, 8, BAR_W, BAR_H, 0x222222)
      .setOrigin(0.5, 0.5);
    objects.push(barBg);

    // Colored zones
    const barLeft = -BAR_W / 2;
    for (const zone of this.zones) {
      const zoneW = zone.end - zone.start;
      const zoneX = barLeft + zone.start + zoneW / 2;
      const zoneRect = this.scene.add.rectangle(zoneX, 8, zoneW, BAR_H, zone.color)
        .setOrigin(0.5, 0.5)
        .setAlpha(0.75);
      objects.push(zoneRect);
    }

    // Zone labels (small text inside each zone)
    const zoneLabelStyle = {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#000000',
    };
    for (const zone of this.zones) {
      const zoneW = zone.end - zone.start;
      if (zoneW < 30) continue; // skip if too narrow
      const zoneX = barLeft + zone.start + zoneW / 2;
      const zLabel = this.scene.add.text(zoneX, 8, zone.label.toUpperCase(), zoneLabelStyle)
        .setOrigin(0.5, 0.5);
      objects.push(zLabel);
    }

    // Cursor (will be moved in animation)
    const cursor = this.scene.add.rectangle(barLeft, 8, CURSOR_W, CURSOR_H, 0xffffff)
      .setOrigin(0.5, 0.5)
      .setDepth(1);
    objects.push(cursor);
    this.cursorObj = cursor;

    // Hint text
    if (!autoMode) {
      const hint = this.scene.add.text(0, PANEL_H / 2 - 20, '[ESPACIO] Golpear', {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#aaaaaa',
      }).setOrigin(0.5, 0.5);
      objects.push(hint);
    }

    // Assemble container centered on screen
    const container = this.scene.add.container(cx, cy, objects)
      .setScrollFactor(0)
      .setDepth(DEPTH);
    this.container = container;
  }

  // -------------------------------------------------------------------------
  // Cursor animation (bouncing tween)
  // -------------------------------------------------------------------------

  private _startCursorAnimation(): void {
    if (!this.cursorObj) return;

    const barLeft = -BAR_W / 2;
    const barRight = BAR_W / 2;
    const duration = (BAR_W / CURSOR_SPEED_BASE) * 1000;

    // Start at left edge
    this.cursorObj.setX(barLeft);

    this.cursorTween = this.scene.tweens.add({
      targets: this.cursorObj,
      x: { from: barLeft, to: barRight },
      duration,
      ease: 'Linear',
      yoyo: true,
      repeat: -1,
    });
  }

  // -------------------------------------------------------------------------
  // Input listener (normal mode)
  // -------------------------------------------------------------------------

  private _listenForSpace(): void {
    if (!this.scene.input.keyboard) return;

    this.spaceKey = this.scene.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    const onDown = (): void => {
      if (this.resolved) return;
      this._resolveWithCursorPosition();
    };

    this.spaceKey.once('down', onDown);
  }

  // -------------------------------------------------------------------------
  // Auto-mode resolver
  // -------------------------------------------------------------------------

  private _scheduleAutoResolve(): void {
    this.scene.time.delayedCall(500, () => {
      if (this.resolved) return;

      const zoneIndex = pickAutoZoneIndex(this.zones);
      const zone = this.zones[zoneIndex];
      const targetX = randomXInZone(zone);

      // Snap cursor visually to the picked position
      if (this.cursorObj && this.cursorTween) {
        this.cursorTween.stop();
        const barLeft = -BAR_W / 2;
        this.cursorObj.setX(barLeft + targetX);
      }

      this._finish(zone.label);
    });
  }

  // -------------------------------------------------------------------------
  // Result calculation
  // -------------------------------------------------------------------------

  private _resolveWithCursorPosition(): void {
    if (!this.cursorObj) {
      this._finish('miss');
      return;
    }

    const barLeft = -BAR_W / 2;
    // cursorObj.x is relative to container origin which is bar center area
    const relX = this.cursorObj.x - barLeft;
    const result = this._mapPositionToResult(relX);
    this._finish(result);
  }

  private _mapPositionToResult(relX: number): MinigameResult {
    for (const zone of this.zones) {
      if (relX >= zone.start && relX < zone.end) {
        return zone.label;
      }
    }
    // Out of bounds → miss
    return 'miss';
  }

  // -------------------------------------------------------------------------
  // Finish & cleanup
  // -------------------------------------------------------------------------

  private _finish(result: MinigameResult): void {
    if (this.resolved) return;
    this.resolved = true;

    const resolve = this.resolvePromise;
    this._cleanup();
    if (resolve) resolve(result);
  }

  private _cleanup(): void {
    if (this.cursorTween) {
      this.cursorTween.stop();
      this.cursorTween = null;
    }
    if (this.spaceKey) {
      this.spaceKey.removeAllListeners();
      this.scene.input.keyboard?.removeKey(this.spaceKey);
      this.spaceKey = null;
    }
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
    }
    this.cursorObj = null;
    this.resolvePromise = null;
  }
}
