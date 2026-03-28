// QualityBanner.ts
// Shared utility: spawns a floating quality-tier banner in any Phaser scene.
// Call showQualityBanner() right after a quality roll resolves.

import type { QualityRollResult } from './SkillSystem';

// Tier → pixel border color (matches qualityTiers.ts QUALITY_COLORS)
const BORDER_COLOR: Record<string, number> = {
  basic:     0x666677,
  normal:    0xB0B0C0,
  good:      0x4A9ECC,
  excellent: 0x9B59B6,
  legendary: 0xF5C842,
};

// Only tiers above 'normal' show a glow ring so basic/normal don't distract
const GLOW_TIERS = new Set(['good', 'excellent', 'legendary']);

/**
 * Shows a floating quality banner at (x, y) in the given scene.
 * The banner rises and fades out automatically.
 *
 * @param scene    - Any active Phaser.Scene
 * @param result   - QualityRollResult from SkillSystem.rollQuality()
 * @param x        - World x position (defaults to scene center)
 * @param y        - World y position
 * @param depth    - Render depth (default 200)
 */
export function showQualityBanner(
  scene: Phaser.Scene,
  result: QualityRollResult,
  x?: number,
  y?: number,
  depth = 200,
): void {
  if (!scene?.scene?.isActive()) return;

  const cx = x ?? scene.scale.width / 2;
  const cy = y ?? scene.scale.height * 0.38;
  const borderColor = BORDER_COLOR[result.quality] ?? 0xB0B0C0;
  const cssColor    = result.color;
  const label       = result.label;
  const xpBonus     = result.xp_bonus;

  // ── Main label ────────────────────────────────────────────────────────────
  const text = scene.add.text(cx, cy, label, {
    fontFamily: '"Press Start 2P", monospace',
    fontSize:   result.quality === 'legendary' ? '13px' : '10px',
    color:      cssColor,
    stroke:     '#000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(depth).setAlpha(0);

  // ── XP bonus line (only if > 0) ───────────────────────────────────────────
  let xpText: Phaser.GameObjects.Text | null = null;
  if (xpBonus > 0) {
    xpText = scene.add.text(cx, cy + 14, `+${xpBonus} XP BONUS`, {
      fontFamily: 'Silkscreen, monospace',
      fontSize:   '7px',
      color:      cssColor,
    }).setAlpha(0.85).setOrigin(0.5).setDepth(depth).setAlpha(0);
  }

  // ── Glow ring for high tiers ──────────────────────────────────────────────
  let glow: Phaser.GameObjects.Graphics | null = null;
  if (GLOW_TIERS.has(result.quality)) {
    glow = scene.add.graphics().setDepth(depth - 1).setAlpha(0);
    glow.lineStyle(2, borderColor, 0.55);
    glow.strokeCircle(cx, cy + 4, result.quality === 'legendary' ? 38 : 30);
  }

  // ── Legendary screen flash ────────────────────────────────────────────────
  if (result.quality === 'legendary') {
    scene.cameras.main.flash(220, 245, 200, 66, true);
  }

  // ── Animate in → hold → float up and fade ────────────────────────────────
  const targets = [text, xpText, glow].filter(Boolean) as Phaser.GameObjects.GameObject[];

  scene.tweens.add({
    targets,
    alpha:    { from: 0, to: 1 },
    duration: 180,
    ease:     'Power2',
    onComplete: () => {
      if (!scene?.scene?.isActive()) return;
      scene.tweens.add({
        targets,
        y:        `-=${result.quality === 'legendary' ? 40 : 28}`,
        alpha:    0,
        duration: result.quality === 'legendary' ? 1400 : 900,
        delay:    300,
        ease:     'Power1',
        onComplete: () => {
          targets.forEach((t) => {
            if ((t as { active?: boolean }).active) t.destroy();
          });
        },
      });
    },
  });
}
