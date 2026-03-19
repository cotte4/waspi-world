import Phaser from 'phaser';

// ─── Emote catalogue ────────────────────────────────────────────────────────

export type EmoteId = 'wave' | 'dance' | 'laugh' | 'thumbsup' | 'heart';

export const EMOTES: Record<EmoteId, { emoji: string; label: string }> = {
  wave:     { emoji: '👋', label: 'SALUDAR' },
  dance:    { emoji: '💃', label: 'BAILAR' },
  laugh:    { emoji: '😂', label: 'REIR' },
  thumbsup: { emoji: '👍', label: 'OK' },
  heart:    { emoji: '❤️', label: 'AMOR' },
};

export const EMOTE_IDS = Object.keys(EMOTES) as EmoteId[];

const BUBBLE_DURATION_MS = 3000;
const FADE_DURATION_MS   = 400;

// ─── Bubble rendering ───────────────────────────────────────────────────────

/**
 * Shows a floating emoji bubble above a Phaser game-object position.
 *
 * Rules:
 * - Uses `scene.add.text` (Phaser-managed), NOT `window.setTimeout`.
 * - `tween.onComplete` has a `.active` guard (Rule 8).
 * - `scene.time.delayedCall` is used for the fade start so the timer is
 *   automatically cancelled on SHUTDOWN (Rule 4 / safeSceneDelayedCall pattern).
 */
export function showEmoteBubble(
  scene: Phaser.Scene,
  x: number,
  y: number,
  emoteId: EmoteId,
): void {
  const { emoji } = EMOTES[emoteId];

  const label = scene.add.text(x, y - 52, emoji, {
    fontSize: '22px',
    fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
    stroke: '#000000',
    strokeThickness: 2,
  }).setOrigin(0.5, 1).setDepth(130).setAlpha(1);

  // Float up gently
  scene.tweens.add({
    targets: label,
    y: label.y - 14,
    duration: BUBBLE_DURATION_MS,
    ease: 'Sine.easeOut',
  });

  // After BUBBLE_DURATION_MS — fade out then destroy
  scene.time.delayedCall(BUBBLE_DURATION_MS, () => {
    if (!label.active) return;
    scene.tweens.add({
      targets: label,
      alpha: 0,
      duration: FADE_DURATION_MS,
      onComplete: () => {
        if (label.active) label.destroy();
      },
    });
  });
}

// ─── EmotePanel ─────────────────────────────────────────────────────────────

const PANEL_TIMEOUT_MS  = 4000;
const PANEL_BTN_W       = 130;
const PANEL_BTN_H       = 28;
const PANEL_GAP         = 4;
const PANEL_PAD         = 10;
const PANEL_TOTAL_H     = PANEL_PAD * 2 + EMOTE_IDS.length * (PANEL_BTN_H + PANEL_GAP) - PANEL_GAP;
const PANEL_TOTAL_W     = PANEL_BTN_W + PANEL_PAD * 2;

/** Callback fired when the user picks an emote (or null on dismiss). */
export type EmotePickCallback = (id: EmoteId | null) => void;

/**
 * Inline emote picker panel.
 *
 * Lifecycle:
 *  - `open()` builds the panel near the player.
 *  - `close()` destroys it.
 *  - Auto-closes after PANEL_TIMEOUT_MS of inactivity.
 *  - Destroyed via `destroy()` on SHUTDOWN.
 */
export class EmotePanel {
  private scene: Phaser.Scene;
  private onPick: EmotePickCallback;
  private container?: Phaser.GameObjects.Container;
  private autoCloseTimer?: Phaser.Time.TimerEvent;
  private open_ = false;

  constructor(scene: Phaser.Scene, onPick: EmotePickCallback) {
    this.scene = scene;
    this.onPick = onPick;
  }

  get isOpen(): boolean { return this.open_; }

  toggle(anchorX: number, anchorY: number): void {
    if (this.open_) {
      this.close(null);
    } else {
      this.open(anchorX, anchorY);
    }
  }

  private open(anchorX: number, anchorY: number): void {
    if (this.open_) return;
    this.open_ = true;

    // Position: anchor near player, clamped to camera viewport
    const cam  = this.scene.cameras.main;
    const rawX = anchorX - PANEL_TOTAL_W / 2;
    const rawY = anchorY - PANEL_TOTAL_H - 60;
    const panX = Phaser.Math.Clamp(rawX - cam.scrollX, 8, cam.width  - PANEL_TOTAL_W - 8) + cam.scrollX;
    const panY = Phaser.Math.Clamp(rawY - cam.scrollY, 8, cam.height - PANEL_TOTAL_H - 8) + cam.scrollY;

    const objects: Phaser.GameObjects.GameObject[] = [];

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0E0E14, 0.94);
    bg.fillRoundedRect(0, 0, PANEL_TOTAL_W, PANEL_TOTAL_H, 8);
    bg.lineStyle(1.5, 0xF5C842, 0.7);
    bg.strokeRoundedRect(0, 0, PANEL_TOTAL_W, PANEL_TOTAL_H, 8);
    objects.push(bg);

    // Title
    const title = this.scene.add.text(PANEL_TOTAL_W / 2, PANEL_PAD - 2, 'EMOTE  [G]', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5, 0);
    objects.push(title);

    // Buttons
    EMOTE_IDS.forEach((id, idx) => {
      const { emoji, label } = EMOTES[id];
      const btnX = PANEL_PAD;
      const btnY = PANEL_PAD + 14 + idx * (PANEL_BTN_H + PANEL_GAP);

      const btnBg = this.scene.add.graphics();
      btnBg.fillStyle(0x1a1a2e, 0.9);
      btnBg.fillRoundedRect(0, 0, PANEL_BTN_W, PANEL_BTN_H, 5);
      btnBg.setPosition(btnX, btnY);
      objects.push(btnBg);

      const numLabel = this.scene.add.text(btnX + 10, btnY + PANEL_BTN_H / 2, `[${idx + 1}]`, {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#888888',
      }).setOrigin(0, 0.5);
      objects.push(numLabel);

      const emojiText = this.scene.add.text(btnX + 30, btnY + PANEL_BTN_H / 2, emoji, {
        fontSize: '14px',
        fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
      }).setOrigin(0, 0.5);
      objects.push(emojiText);

      const labelText = this.scene.add.text(btnX + 52, btnY + PANEL_BTN_H / 2, label, {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#FFFFFF',
      }).setOrigin(0, 0.5);
      objects.push(labelText);

      // Hover zone (invisible rectangle as hit area)
      const hitZone = this.scene.add.rectangle(
        btnX + PANEL_BTN_W / 2,
        btnY + PANEL_BTN_H / 2,
        PANEL_BTN_W,
        PANEL_BTN_H,
      ).setInteractive({ useHandCursor: true });
      hitZone.on('pointerover', () => {
        btnBg.clear();
        btnBg.fillStyle(0x2a2a50, 0.95);
        btnBg.fillRoundedRect(0, 0, PANEL_BTN_W, PANEL_BTN_H, 5);
      });
      hitZone.on('pointerout', () => {
        btnBg.clear();
        btnBg.fillStyle(0x1a1a2e, 0.9);
        btnBg.fillRoundedRect(0, 0, PANEL_BTN_W, PANEL_BTN_H, 5);
      });
      hitZone.on('pointerdown', () => {
        this.close(id);
      });
      objects.push(hitZone);
    });

    this.container = this.scene.add.container(panX, panY, objects);
    this.container.setDepth(200);
    // Fix: setScrollFactor(0) makes the panel stay fixed in screen coords — but
    // we've manually positioned it in world-coords aligned to camera so we keep
    // scrollFactor 1 (default) so it follows the world properly.

    // Auto-close timer (Phaser-managed → cancelled on SHUTDOWN)
    this.autoCloseTimer = this.scene.time.delayedCall(PANEL_TIMEOUT_MS, () => {
      if (this.open_) this.close(null);
    });
  }

  close(picked: EmoteId | null): void {
    if (!this.open_) return;
    this.open_ = false;

    this.autoCloseTimer?.remove();
    this.autoCloseTimer = undefined;

    if (this.container?.active) {
      this.container.destroy(true);
    }
    this.container = undefined;

    this.onPick(picked);
  }

  /** Handle number key presses [1-5] while the panel is open */
  handleNumberKey(num: 1 | 2 | 3 | 4 | 5): void {
    if (!this.open_) return;
    const id = EMOTE_IDS[num - 1];
    if (id) this.close(id);
  }

  /** Called from SHUTDOWN to clean up without firing onPick */
  destroy(): void {
    this.autoCloseTimer?.remove();
    this.autoCloseTimer = undefined;
    if (this.container?.active) this.container.destroy(true);
    this.container = undefined;
    this.open_ = false;
  }
}
