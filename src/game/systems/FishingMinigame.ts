// FishingMinigame.ts
// Overlay minigame: cast → wait → react to SPACE on bite.
// Integrate by instantiating from any Phaser scene; await play().

import Phaser from 'phaser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MinigameResult = 'miss' | 'ok' | 'good' | 'perfect';

// ---------------------------------------------------------------------------
// Layout / timing constants
// ---------------------------------------------------------------------------

const PANEL_W      = 480;
const PANEL_H      = 210;
const DEPTH        = 9500;
const WAIT_MIN     = 2000;
const WAIT_MAX     = 5500;
const REACT_WINDOW = 1200;

const BG_COLOR     = 0x0e0e14;
const BORDER_COLOR = 0x4a9ecc;
const WATER_COLORS = [0x1a2e3e, 0x1e3548, 0x162838];
const FLOAT_COLOR  = 0xff6b35;
const LINE_COLOR   = 0x888888;
const GOLD_HEX     = '#F5C842';
const WHITE_HEX    = '#FFFFFF';
const FONT_MAIN    = '"Press Start 2P", monospace';
const FONT_SMALL   = '"Silkscreen", monospace';

// Auto-mode result weights  [miss, ok, good, perfect]
const AUTO_WEIGHTS: [MinigameResult, number][] = [
  ['miss',    0.45],
  ['ok',      0.35],
  ['good',    0.15],
  ['perfect', 0.05],
];

// ---------------------------------------------------------------------------
// FishingMinigame
// ---------------------------------------------------------------------------

export class FishingMinigame {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private floatCircle: Phaser.GameObjects.Arc | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private hintText: Phaser.GameObjects.Text | null = null;
  private bobTween: Phaser.Tweens.Tween | null = null;
  private spaceKey: Phaser.Input.Keyboard.Key | null = null;
  private phase: 'wait' | 'bite' | 'done' = 'wait';
  private biteStartMs = 0;
  private resolvePlay: ((result: MinigameResult) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  play(autoMode = false): Promise<MinigameResult> {
    return new Promise<MinigameResult>((resolve) => {
      this.resolvePlay = resolve;
      this._buildPanel();
      this._startWaitPhase(autoMode);
    });
  }

  destroy(): void {
    this._cleanup();
  }

  // -------------------------------------------------------------------------
  // Panel construction
  // -------------------------------------------------------------------------

  private _buildPanel(): void {
    const cam = this.scene.cameras.main;
    const cx   = cam.width  / 2;
    const cy   = cam.height / 2;

    // --- background + border ---
    const bg = this.scene.add.graphics();
    bg.fillStyle(BG_COLOR, 0.92);
    bg.fillRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 10);
    bg.lineStyle(2, BORDER_COLOR, 1);
    bg.strokeRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 10);

    // --- title ---
    const title = this.scene.add.text(0, -PANEL_H / 2 + 18, '🎣 PESCANDO...', {
      fontSize: '10px',
      fontFamily: FONT_MAIN,
      color: GOLD_HEX,
    }).setOrigin(0.5, 0);

    // --- water strips (3 horizontal rects as wave simulation) ---
    const waterGraphics = this.scene.add.graphics();
    const waterY = -12;  // vertical center of water area
    const waterW = PANEL_W - 60;
    const strips = [
      { yOff: -10, h: 5, color: WATER_COLORS[0] },
      { yOff:   0, h: 4, color: WATER_COLORS[1] },
      { yOff:  10, h: 5, color: WATER_COLORS[2] },
    ];
    for (const s of strips) {
      waterGraphics.fillStyle(s.color, 1);
      waterGraphics.fillRect(-waterW / 2, waterY + s.yOff, waterW, s.h);
    }

    // --- depth gradient below water strips ---
    const depthGfx = this.scene.add.graphics();
    depthGfx.fillStyle(0x0d2233, 0.35);
    depthGfx.fillRect(-waterW / 2, waterY + 14, waterW, 28);

    // --- float glow (static decorative ring behind the float) ---
    const floatX = 20;
    const floatY = waterY - 2;
    const floatGlow = this.scene.add.arc(floatX, floatY, 12, 0, 360, false, 0xff6b35);
    floatGlow.setAlpha(0.22);

    // --- float circle ---
    const floatCircle = this.scene.add.arc(floatX, floatY, 7, 0, 360, false, FLOAT_COLOR);

    // --- fishing line from top-left corner to float ---
    const lineGraphics = this.scene.add.graphics();
    lineGraphics.lineStyle(2, 0xaaaaaa, 1);
    lineGraphics.beginPath();
    lineGraphics.moveTo(-PANEL_W / 2 + 30, -PANEL_H / 2 + 10);
    lineGraphics.lineTo(floatX, floatY - 7);
    lineGraphics.strokePath();

    // --- status text ---
    const statusText = this.scene.add.text(0, PANEL_H / 2 - 48, 'Espera el pique...', {
      fontSize: '9px',
      fontFamily: FONT_SMALL,
      color: '#C8E8FF',
    }).setOrigin(0.5, 0.5);

    // --- header separator ---
    const headerSep = this.scene.add.graphics();
    headerSep.lineStyle(1, 0xf5c842, 0.25);
    headerSep.lineBetween(-PANEL_W / 2 + 20, -PANEL_H / 2 + 34, PANEL_W / 2 - 20, -PANEL_H / 2 + 34);

    // --- atmospheric bubbles ---
    const bubblesGfx = this.scene.add.graphics();
    const bubblePositions: [number, number][] = [[-60, waterY + 8], [-20, waterY + 18], [30, waterY + 5], [70, waterY + 14], [-40, waterY + 22]];
    bubblePositions.forEach(([bx, by]) => {
      bubblesGfx.fillStyle(0x4a9ecc, 0.25);
      bubblesGfx.fillCircle(bx, by, 3);
    });

    // --- hint text (hidden until bite) ---
    const hintText = this.scene.add.text(0, PANEL_H / 2 - 28, '[ESPACIO] Halar', {
      fontSize: '9px',
      fontFamily: FONT_SMALL,
      color: GOLD_HEX,
    }).setOrigin(0.5, 0.5).setAlpha(0);

    // --- assemble container ---
    const container = this.scene.add.container(cx, cy, [
      bg,
      title,
      headerSep,
      waterGraphics,
      depthGfx,
      bubblesGfx,
      lineGraphics,
      floatGlow,
      floatCircle,
      statusText,
      hintText,
    ]);
    container.setScrollFactor(0).setDepth(DEPTH);

    this.container   = container;
    this.floatCircle = floatCircle;
    this.statusText  = statusText;
    this.hintText    = hintText;

    // --- fade in ---
    container.setAlpha(0);
    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Linear',
    });
  }

  // -------------------------------------------------------------------------
  // Phase: WAIT
  // -------------------------------------------------------------------------

  private _startWaitPhase(autoMode: boolean): void {
    this.phase = 'wait';

    // Slow bob tween on the float circle
    if (this.floatCircle) {
      this.bobTween = this.scene.tweens.add({
        targets: this.floatCircle,
        y: `+=${4}`,
        duration: 800,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }

    // Register SPACE listener — early press = miss
    this._registerSpaceKey(() => {
      if (this.phase === 'wait') {
        this._resolve('miss');
      }
    });

    const waitMs = autoMode
      ? 500
      : Phaser.Math.Between(WAIT_MIN, WAIT_MAX);

    this.scene.time.delayedCall(waitMs, () => {
      if (this.phase !== 'wait') return;
      if (autoMode) {
        this._startBitePhaseAuto();
      } else {
        this._startBitePhase();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Phase: BITE (interactive)
  // -------------------------------------------------------------------------

  private _startBitePhase(): void {
    this.phase = 'bite';
    this.biteStartMs = this.scene.time.now;

    this._triggerBiteVisuals();

    // Update SPACE listener for reaction scoring
    this._removeSpaceKey();
    this._registerSpaceKey(() => {
      if (this.phase !== 'bite') return;
      const elapsed = this.scene.time.now - this.biteStartMs;
      let result: MinigameResult;
      if (elapsed <= 300) {
        result = 'perfect';
      } else if (elapsed <= 600) {
        result = 'good';
      } else {
        result = 'ok';
      }
      this._resolve(result);
    });

    // Timeout → miss
    this.scene.time.delayedCall(REACT_WINDOW, () => {
      if (this.phase !== 'bite') return;
      // Float rises back
      if (this.floatCircle) {
        this.scene.tweens.add({
          targets: this.floatCircle,
          y: `-=${16}`,
          duration: 200,
          ease: 'Sine.easeOut',
        });
      }
      this._resolve('miss');
    });
  }

  // -------------------------------------------------------------------------
  // Phase: BITE (auto mode)
  // -------------------------------------------------------------------------

  private _startBitePhaseAuto(): void {
    this.phase = 'bite';

    this._triggerBiteVisuals();

    const result = this._pickAutoResult();
    // Small delay so the visual registers before resolving
    this.scene.time.delayedCall(300, () => {
      this._resolve(result);
    });
  }

  // -------------------------------------------------------------------------
  // Bite visuals (shared)
  // -------------------------------------------------------------------------

  private _triggerBiteVisuals(): void {
    this.bobTween?.stop();
    this.bobTween = null;

    if (this.floatCircle) {
      this.scene.tweens.add({
        targets: this.floatCircle,
        y: `+=${16}`,
        duration: 120,
        ease: 'Cubic.easeIn',
      });
    }

    if (this.statusText) {
      this.statusText.setText('¡PIQUE!');
      this.statusText.setColor(GOLD_HEX);
      // Blinking effect
      this.scene.tweens.add({
        targets: this.statusText,
        alpha: 0,
        duration: 200,
        ease: 'Linear',
        yoyo: true,
        repeat: -1,
      });
    }

    if (this.hintText) {
      this.hintText.setAlpha(1);
    }
  }

  // -------------------------------------------------------------------------
  // Resolve
  // -------------------------------------------------------------------------

  private _resolve(result: MinigameResult): void {
    if (this.phase === 'done') return;
    this.phase = 'done';

    this._cleanup();

    if (this.resolvePlay) {
      const cb = this.resolvePlay;
      this.resolvePlay = null;
      cb(result);
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  private _cleanup(): void {
    this._removeSpaceKey();
    this.bobTween?.stop();
    this.bobTween = null;

    if (this.container) {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: 200,
        ease: 'Linear',
        onComplete: () => {
          this.container?.destroy();
          this.container   = null;
          this.floatCircle = null;
          this.statusText  = null;
          this.hintText    = null;
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Input helpers
  // -------------------------------------------------------------------------

  private _registerSpaceKey(callback: () => void): void {
    if (!this.scene.input.keyboard) return;
    this.spaceKey = this.scene.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );
    const listener = () => {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey!)) {
        callback();
      }
    };
    // Store handler on the key object so we can remove it later
    (this.spaceKey as Phaser.Input.Keyboard.Key & { _fishHandler?: () => void })
      ._fishHandler = listener;
    this.scene.input.keyboard.on('keydown-SPACE', listener);
  }

  private _removeSpaceKey(): void {
    if (!this.scene.input.keyboard || !this.spaceKey) return;
    const key = this.spaceKey as Phaser.Input.Keyboard.Key & { _fishHandler?: () => void };
    if (key._fishHandler) {
      this.scene.input.keyboard.off('keydown-SPACE', key._fishHandler);
      key._fishHandler = undefined;
    }
    this.scene.input.keyboard.removeKey(this.spaceKey);
    this.spaceKey = null;
  }

  // -------------------------------------------------------------------------
  // Auto-mode result picker
  // -------------------------------------------------------------------------

  private _pickAutoResult(): MinigameResult {
    const roll = Math.random();
    let cumulative = 0;
    for (const [result, weight] of AUTO_WEIGHTS) {
      cumulative += weight;
      if (roll < cumulative) return result;
    }
    return 'miss';
  }
}
