import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { SAFE_PLAZA_RETURN, WORLD_EXITS } from '../config/constants';
import { announceScene, bindSafeResetToPlaza, createBackButton, showSceneTitle, transitionToWorldScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { SceneControls } from '../systems/SceneControls';
import { safeSceneDelayedCall } from '../systems/AnimationSafety';
import { getSkillSystem } from '../systems/SkillSystem';
import { showQualityBanner } from '../systems/QualityBanner';
import { worldExitFromSceneData } from '../systems/worldReturnSpawn';

// ── Return coordinates in WorldScene ────────────────────────────────────────
// GYM is in the plaza zone; player exits to the front of the building.
const GYM_RETURN_X = WORLD_EXITS.GYM.x;
const GYM_RETURN_Y = WORLD_EXITS.GYM.y;

// ── Minigame constants ────────────────────────────────────────────────────────
const BAG_XP          = 5;
const BENCH_XP        = 8;
const BAG_COOLDOWN_MS = 8_000;
const BENCH_COOLDOWN_MS = 12_000;
const BAG_MAX_HITS    = 6;   // per session
const BENCH_MAX_REPS  = 4;   // per session
const BAG_TIMEOUT_MS  = 4_000;
const BENCH_FILL_MS   = 2_500; // time to fill bar when holding E
const BENCH_DRAIN_RATE = 0.55; // bar drain per ms when NOT holding E (fast drain)

type BagPhase = 'idle' | 'active' | 'cooldown';
type BenchPhase = 'idle' | 'active' | 'cooldown';

const COMBO_KEYS = ['E', 'W', 'D', 'Q', 'R'] as const;
type ComboKey = (typeof COMBO_KEYS)[number];

export class GymInterior extends Phaser.Scene {
  // ── Movement ────────────────────────────────────────────────────────────────
  private px = 400;
  private py = 480;
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastIsMoving = false;
  private player!: AvatarRenderer;
  private controls!: SceneControls;
  private inTransition = false;
  private worldExitX!: number;
  private worldExitY!: number;

  // ── Graphics references ──────────────────────────────────────────────────────
  private bagGfx!: Phaser.GameObjects.Graphics;
  private benchBarGfx!: Phaser.GameObjects.Graphics;

  // ── Boxing bag state ─────────────────────────────────────────────────────────
  private bagPhase: BagPhase = 'idle';
  private bagSequence: ComboKey[] = [];
  private bagSeqIndex = 0;
  private bagTimeoutTimer?: Phaser.Time.TimerEvent;
  private bagCooldownUntil = 0;
  private bagHits = 0; // session cap
  private bagComboStartAt = 0; // timestamp when combo started (for speed quality)

  // ── Streak state ──────────────────────────────────────────────────────────────
  private streak = 0; // consecutive perfect completions (bag or bench)
  private static readonly STREAK_LABELS: Record<number, string> = {
    3: 'RACHA 🔥',
    5: 'EN LLAMAS 🔥🔥',
    7: 'IMPARABLE ⚡',
  };

  // ── Bench press state ────────────────────────────────────────────────────────
  private benchPhase: BenchPhase = 'idle';
  private benchProgress = 0; // 0-1
  private benchCooldownUntil = 0;
  private benchReps = 0; // session cap
  private keyEDown = false; // tracks hold state

  // ── Keyboard keys ────────────────────────────────────────────────────────────
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyW_!: Phaser.Input.Keyboard.Key;
  private keyD_!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'GymInterior' });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  init(data: Record<string, unknown> = {}) {
    this.inTransition = false;
    const w = worldExitFromSceneData(data, GYM_RETURN_X, GYM_RETURN_Y);
    this.worldExitX = w.x;
    this.worldExitY = w.y;
    this.bagPhase = 'idle';
    this.bagSeqIndex = 0;
    this.bagSequence = [];
    this.bagCooldownUntil = 0;
    this.bagHits = 0;
    this.bagComboStartAt = 0;
    this.benchPhase = 'idle';
    this.benchProgress = 0;
    this.benchCooldownUntil = 0;
    this.benchReps = 0;
    this.keyEDown = false;
    this.streak = 0;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;

    announceScene(this);
    showSceneTitle(this, 'GYM', 0xFF2222);
    this.input.enabled = true;
    eventBus.emit(EVENTS.GYM_SCENE_ACTIVE, true);

    this.controls = new SceneControls(this);

    // WAKE: reset inTransition + re-enable input (defensive)
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.inTransition = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });

    // SHUTDOWN: cleanup
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    bindSafeResetToPlaza(this, () => {
      transitionToWorldScene(this, SAFE_PLAZA_RETURN.X, SAFE_PLAZA_RETURN.Y);
    });

    // ── Draw room ───────────────────────────────────────────────────────────────
    this.drawBackground(W, H);
    this.drawNeonSign(cx);
    this.drawLighting(W);

    // ── Boxing bag (left side) ───────────────────────────────────────────────────
    this.bagGfx = this.add.graphics().setDepth(4);
    this.drawBoxingBag(this.bagGfx, 220, 280, false);

    // ── Weight bench (right side) ────────────────────────────────────────────────
    this.drawWeightBench(560, 340);
    this.benchBarGfx = this.add.graphics().setDepth(6);

    // ── Player avatar ───────────────────────────────────────────────────────────
    this.px = cx;
    this.py = 480;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(10);

    // ── Keyboard ─────────────────────────────────────────────────────────────────
    this.keyE   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyW_  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyD_  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyQ   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyR   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // ── Exit UI ──────────────────────────────────────────────────────────────────
    this.add.text(cx, H - 18, 'ESC  ·  SALIR', {
      fontSize: '7px', fontFamily: '"Silkscreen", monospace', color: '#554455',
    }).setOrigin(0.5);
    createBackButton(this, () => this.exitToWorld());

    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    if (this.inTransition) return;

    this.handleMovement(delta);
    this.updateProximityPrompts();
    this.updateBagMinigame();
    this.updateBenchMinigame(delta);

    if (this.controls.isActionJustDown('back') || Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.exitToWorld();
    }
  }

  // ── Exit ─────────────────────────────────────────────────────────────────────

  private exitToWorld() {
    if (this.inTransition) return;
    const ok = transitionToWorldScene(this, this.worldExitX, this.worldExitY);
    if (ok) this.inTransition = true;
  }

  // ── Movement ──────────────────────────────────────────────────────────────────

  private handleMovement(delta: number) {
    const W = this.scale.width;
    const H = this.scale.height;
    const { dx, dy, stepX, stepY } = this.controls.readMovementStep(delta, 180);

    const minX = 60;
    const maxX = W - 60;
    const minY = 200;
    const maxY = H - 80;

    this.px = Phaser.Math.Clamp(this.px + stepX, minX, maxX);
    this.py = Phaser.Math.Clamp(this.py + stepY, minY, maxY);

    this.player.update(dx !== 0 || dy !== 0, dx, dy);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
    this.lastMoveDx = dx;
    this.lastMoveDy = dy;
    this.lastIsMoving = dx !== 0 || dy !== 0;
  }

  // ── Proximity prompts ─────────────────────────────────────────────────────────

  private updateProximityPrompts() {
    const nearBag   = Phaser.Math.Distance.Between(this.px, this.py, 220, 320) < 100;
    const nearBench = Phaser.Math.Distance.Between(this.px, this.py, 560, 370) < 100;

    let bagPrompt = '';
    if (this.bagPhase === 'idle' && nearBag) {
      bagPrompt = this.bagHits >= BAG_MAX_HITS ? 'AGOTADO' : '[E] GOLPEAR BOLSA';
    } else if (this.bagPhase === 'cooldown' && nearBag) {
      const remaining = Math.ceil((this.bagCooldownUntil - this.time.now) / 1000);
      bagPrompt = `COOLDOWN ${remaining}s`;
    }

    let benchPrompt = '';
    if (this.benchPhase === 'idle' && nearBench) {
      benchPrompt = this.benchReps >= BENCH_MAX_REPS ? 'AGOTADO' : '[E] LEVANTAR PESAS';
    } else if (this.benchPhase === 'cooldown' && nearBench) {
      const remaining = Math.ceil((this.benchCooldownUntil - this.time.now) / 1000);
      benchPrompt = `COOLDOWN ${remaining}s`;
    } else if (this.benchPhase === 'active') {
      benchPrompt = `MANTÉN [E]  ${Math.floor(this.benchProgress * 100)}%`;
    }

    const bagComboDisplay = this.bagPhase === 'active'
      ? this.bagSequence.map((k, i) => {
          if (i < this.bagSeqIndex) return '✓';
          if (i === this.bagSeqIndex) return `[${k}]`;
          return k;
        }).join(' ')
      : '';

    this.emitHud(bagPrompt, bagComboDisplay, benchPrompt, '', '');
  }

  private emitHud(bagPrompt: string, bagComboDisplay: string, benchPrompt: string, feedbackMsg: string, feedbackColor: string) {
    eventBus.emit(EVENTS.GYM_HUD_UPDATE, {
      bagPhase: this.bagPhase,
      bagPrompt,
      bagComboDisplay,
      benchPhase: this.benchPhase,
      benchPrompt,
      benchProgress: this.benchProgress,
      feedbackMsg,
      feedbackColor,
      gymLevel: getSkillSystem().getLevel('gym'),
    });
  }

  // ── Boxing bag minigame ───────────────────────────────────────────────────────

  private updateBagMinigame() {
    const nearBag = Phaser.Math.Distance.Between(this.px, this.py, 220, 320) < 100;

    if (this.bagPhase === 'idle' && nearBag && this.bagHits < BAG_MAX_HITS) {
      if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
        this.startBagCombo();
      }
    }

    if (this.bagPhase === 'cooldown' && this.time.now >= this.bagCooldownUntil) {
      this.bagPhase = 'idle';
    }

    if (this.bagPhase === 'active') {
      this.checkComboInput();
    }
  }

  private startBagCombo() {
    this.bagPhase = 'active';
    this.bagSequence = this.generateCombo(5);
    this.bagSeqIndex = 0;
    this.bagComboStartAt = this.time.now;
    this.renderComboDisplay();

    // Timeout: if not completed within 4s, fail silently
    this.bagTimeoutTimer = this.time.delayedCall(BAG_TIMEOUT_MS, () => {
      if (this.bagPhase === 'active') {
        this.failCombo();
      }
    });
  }

  private generateCombo(length: number): ComboKey[] {
    const seq: ComboKey[] = [];
    for (let i = 0; i < length; i++) {
      seq.push(COMBO_KEYS[Math.floor(Math.random() * COMBO_KEYS.length)]);
    }
    return seq;
  }

  private renderComboDisplay() {
    // Combo display is now handled by emitHud via updateProximityPrompts
  }

  private checkComboInput() {
    const expected = this.bagSequence[this.bagSeqIndex];
    let pressed: ComboKey | null = null;

    if (Phaser.Input.Keyboard.JustDown(this.keyE))   pressed = 'E';
    else if (Phaser.Input.Keyboard.JustDown(this.keyW_)) pressed = 'W';
    else if (Phaser.Input.Keyboard.JustDown(this.keyD_)) pressed = 'D';
    else if (Phaser.Input.Keyboard.JustDown(this.keyQ))  pressed = 'Q';
    else if (Phaser.Input.Keyboard.JustDown(this.keyR))  pressed = 'R';

    if (pressed === null) return;

    if (pressed === expected) {
      // Hit! Animate bag swing
      this.animateBagHit();
      this.bagSeqIndex++;
      this.renderComboDisplay();

      if (this.bagSeqIndex >= this.bagSequence.length) {
        this.completeBagCombo();
      }
    } else {
      // Wrong key — restart sequence from beginning
      this.bagSeqIndex = 0;
      this.renderComboDisplay();
      this.emitHud('', '', '', 'FALLO — REINICIANDO', '#FF4444');
    }
  }

  private completeBagCombo() {
    this.bagTimeoutTimer?.remove();
    this.bagPhase = 'cooldown';
    this.bagCooldownUntil = this.time.now + BAG_COOLDOWN_MS;
    this.bagHits++;
    this.streak++;

    // Speed quality: faster combo = better tier (passed to server as source hint via timing)
    const elapsed = this.time.now - this.bagComboStartAt;
    // We don't change the server source, but fast completion (< 2s) earns a client-side
    // speed bonus shown visually. The server rolls quality independently.

    this.cameras.main.flash(180, 255, 50, 50, true);

    // Streak XP multiplier (client-side): x1.0 → x1.3 → x1.6 → x2.0
    const streakMult = this.streak >= 7 ? 2.0 : this.streak >= 5 ? 1.6 : this.streak >= 3 ? 1.3 : 1.0;
    // Spec multiplier: gym_athlete → +20% XP
    const specMult   = getSkillSystem().getSpec('gym') === 'gym_athlete' ? 1.2 : 1.0;
    const speedBonus = elapsed < 2000 ? 3 : elapsed < 3000 ? 1 : 0; // fast combo bonus
    const baseXp     = Math.round((BAG_XP + speedBonus) * streakMult * specMult);

    void getSkillSystem().rollQuality('gym', 'gym_session').then((qr) => {
      if (!this.scene?.isActive('GymInterior')) return;

      const totalXp = Math.min(baseXp + qr.xp_bonus, 50);
      showQualityBanner(this, qr, 220, 220);

      const streakLabel = GymInterior.STREAK_LABELS[
        this.streak >= 7 ? 7 : this.streak >= 5 ? 5 : this.streak >= 3 ? 3 : 0
      ] ?? '';

      this.emitHud('', '', '', `+${totalXp} XP GYM${streakLabel ? `  ${streakLabel}` : ''}`, '#FF6644');

      void getSkillSystem().addXp('gym', totalXp, 'boxing_bag_combo').then((result) => {
        if (!this.scene?.isActive('GymInterior')) return;
        if (result.leveled_up) {
          safeSceneDelayedCall(this, 400, () => {
            this.emitHud('', '', '', `¡NIVEL ${result.new_level} GYM!`, '#F5C842');
            eventBus.emit(EVENTS.UI_NOTICE, { message: `💪 GYM nivel ${result.new_level}!`, color: '#F5C842' });
          });
        }
      });
    });
  }

  private failCombo() {
    this.bagPhase = 'idle';
    this.bagTimeoutTimer?.remove();
    this.streak = 0; // reset streak on timeout/fail
    // No XP, no feedback — fail silently as spec says
  }

  private animateBagHit() {
    if (!this.bagGfx.active) return;
    // Kill any running tween and reset x before adding a new one,
    // so spam hits don't accumulate x offset and drift the bag off-screen.
    this.tweens.killTweensOf(this.bagGfx);
    this.bagGfx.x = 0;
    this.tweens.add({
      targets: this.bagGfx,
      x: 14,
      duration: 80,
      ease: 'Power2',
      yoyo: true,
    });
  }

  // ── Weight bench minigame ─────────────────────────────────────────────────────

  private updateBenchMinigame(delta: number) {
    const nearBench = Phaser.Math.Distance.Between(this.px, this.py, 560, 370) < 100;

    if (this.benchPhase === 'cooldown' && this.time.now >= this.benchCooldownUntil) {
      this.benchPhase = 'idle';
      this.benchBarGfx.clear();
    }

    if (this.benchPhase === 'idle' && nearBench && this.benchReps < BENCH_MAX_REPS) {
      if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
        this.benchPhase = 'active';
        this.benchProgress = 0;
        this.keyEDown = true;
      }
    }

    if (this.benchPhase === 'active') {
      const eIsDown = this.keyE.isDown;

      if (eIsDown) {
        // Fill bar: goes from 0 to 1 over BENCH_FILL_MS
        this.benchProgress = Math.min(1, this.benchProgress + delta / BENCH_FILL_MS);
      } else {
        // Drain fast
        this.benchProgress = Math.max(0, this.benchProgress - (delta * BENCH_DRAIN_RATE) / 1000);
      }

      this.keyEDown = eIsDown;
      this.drawBenchBar(this.benchProgress);

      if (this.benchProgress >= 1) {
        this.completeBenchRep();
      }
    }
  }

  private completeBenchRep() {
    this.benchPhase = 'cooldown';
    this.benchCooldownUntil = this.time.now + BENCH_COOLDOWN_MS;
    this.benchReps++;
    this.benchProgress = 0;
    this.streak++;
    this.drawBenchBar(0);

    const streakMult = this.streak >= 7 ? 2.0 : this.streak >= 5 ? 1.6 : this.streak >= 3 ? 1.3 : 1.0;
    const specMult   = getSkillSystem().getSpec('gym') === 'gym_athlete' ? 1.2 : 1.0;
    const baseXp     = Math.round(BENCH_XP * streakMult * specMult);

    void getSkillSystem().rollQuality('gym', 'gym_session').then((qr) => {
      if (!this.scene?.isActive('GymInterior')) return;

      const totalXp = Math.min(baseXp + qr.xp_bonus, 50);
      showQualityBanner(this, qr, 560, 260);

      const streakLabel = GymInterior.STREAK_LABELS[
        this.streak >= 7 ? 7 : this.streak >= 5 ? 5 : this.streak >= 3 ? 3 : 0
      ] ?? '';

      this.emitHud('', '', '', `+${totalXp} XP GYM${streakLabel ? `  ${streakLabel}` : ''}`, '#44AAFF');

      void getSkillSystem().addXp('gym', totalXp, 'bench_press_rep').then((result) => {
        if (!this.scene?.isActive('GymInterior')) return;
        if (result.leveled_up) {
          safeSceneDelayedCall(this, 400, () => {
            this.emitHud('', '', '', `¡NIVEL ${result.new_level} GYM!`, '#F5C842');
            eventBus.emit(EVENTS.UI_NOTICE, { message: `💪 GYM nivel ${result.new_level}!`, color: '#F5C842' });
          });
        }
      });
    });
  }

  // ── Visual helpers ────────────────────────────────────────────────────────────

  private drawBenchBar(progress: number) {
    if (!this.benchBarGfx.active) return;
    this.benchBarGfx.clear();
    const bx = 480, by = 395, bw = 160, bh = 14;
    // Background
    this.benchBarGfx.fillStyle(0x111111, 0.85);
    this.benchBarGfx.fillRect(bx, by, bw, bh);
    this.benchBarGfx.lineStyle(1, 0x44AAFF, 0.7);
    this.benchBarGfx.strokeRect(bx, by, bw, bh);
    // Fill
    if (progress > 0) {
      const fillColor = progress >= 1 ? 0x00FF88 : 0x44AAFF;
      this.benchBarGfx.fillStyle(fillColor, 0.9);
      this.benchBarGfx.fillRect(bx + 1, by + 1, Math.floor((bw - 2) * progress), bh - 2);
    }
    // Segment dividers at 25%, 50%, 75%
    this.benchBarGfx.lineStyle(1, 0x0d1020, 0.7);
    for (let seg = 1; seg <= 3; seg++) {
      const sx = bx + Math.floor(bw * seg * 0.25);
      this.benchBarGfx.lineBetween(sx, by + 1, sx, by + bh - 1);
    }
  }

  // ── Draw: background ──────────────────────────────────────────────────────────

  private drawBackground(W: number, H: number) {
    const bg = this.add.graphics().setDepth(0);
    // Floor
    bg.fillStyle(0x1a1418, 1);
    bg.fillRect(0, 0, W, H);
    // Back wall top area
    bg.fillStyle(0x0f0f16, 1);
    bg.fillRect(0, 0, W, 90);
    // Wall/floor border
    bg.lineStyle(2, 0x330011, 0.7);
    bg.lineBetween(0, 90, W, 90);
    // Floor stripe at bottom
    bg.fillStyle(0x130d10, 1);
    bg.fillRect(0, H - 100, W, 100);
    bg.lineStyle(1, 0x220014, 0.6);
    bg.lineBetween(0, H - 100, W, H - 100);
    // Subtle floor grid lines
    for (let gy = 140; gy < H - 100; gy += 40) {
      bg.lineStyle(1, 0x1e1420, 0.5);
      bg.lineBetween(0, gy, W, gy);
    }
    for (let gx = 80; gx < W; gx += 80) {
      bg.lineStyle(1, 0x1e1420, 0.3);
      bg.lineBetween(gx, 90, gx, H - 100);
    }
    // Vignette corners
    const vig = this.add.graphics().setDepth(1);
    vig.fillStyle(0x080008, 0.55);
    vig.fillRect(0, 0, 55, H);
    vig.fillRect(W - 55, 0, 55, H);
    vig.fillRect(0, 0, W, 38);
    vig.fillRect(0, H - 38, W, 38);

    // Ambient glow around boxing bag station
    bg.fillStyle(0xff2222, 0.05);
    bg.fillCircle(220, 280, 90);
    // Ambient glow around bench station
    bg.fillStyle(0x2244ff, 0.04);
    bg.fillCircle(560, 340, 80);

    // Motivational wall text
    const wallTexts = ['NO PAIN', 'NO GAIN', 'WASPI FIT'];
    wallTexts.forEach((t, i) => {
      this.add.text(120 + i * 220, 55, t, {
        fontSize: '7px', fontFamily: '"Press Start 2P", monospace',
        color: '#330011', stroke: '#000', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(2).setAlpha(0.55);
    });
  }

  // ── Draw: GYM neon sign ───────────────────────────────────────────────────────

  private drawNeonSign(cx: number) {
    const signW = 110, signH = 28;
    const signX = cx - signW / 2, signY = 18;
    const g = this.add.graphics().setDepth(3);
    g.fillStyle(0x0a0006);
    g.fillRect(signX, signY, signW, signH);
    g.lineStyle(2, 0xFF2222, 0.9);
    g.strokeRect(signX, signY, signW, signH);
    g.fillStyle(0xFF2222, 0.08);
    g.fillRect(signX - 4, signY - 3, signW + 8, signH + 6);

    const neonText = this.add.text(cx, signY + signH / 2, '★  GYM  ★', {
      fontSize: '11px', fontFamily: '"Press Start 2P", monospace',
      color: '#FF2222', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(4);

    this.tweens.add({
      targets: [neonText, g],
      alpha: { from: 1, to: 0.55 },
      duration: 1400,
      yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── Draw: ceiling lighting ────────────────────────────────────────────────────

  private drawLighting(W: number) {
    const g = this.add.graphics().setDepth(2);
    // Spot cones over bag (left) and bench (right)
    [220, 560].forEach((lx) => {
      // Cable
      g.lineStyle(1, 0x2a2030, 0.7);
      g.lineBetween(lx, 0, lx, 95);
      // Lamp body
      g.fillStyle(0x1e1a26);
      g.fillRect(lx - 10, 91, 20, 12);
      g.lineStyle(1, 0x4a3a5a, 0.6);
      g.strokeRect(lx - 10, 91, 20, 12);
      // Light cone (downward triangle, faint)
      g.fillStyle(0xFF2222, 0.04);
      g.fillTriangle(lx - 12, 103, lx + 12, 103, lx, 260);
    });
    // Small ambient strip top
    g.lineStyle(2, 0x550022, 0.22);
    g.lineBetween(0, 1, W, 1);
  }

  // ── Draw: boxing bag ──────────────────────────────────────────────────────────

  private drawBoxingBag(g: Phaser.GameObjects.Graphics, bx: number, by: number, active: boolean) {
    g.clear();
    // Chain (2 links from ceiling)
    g.lineStyle(2, 0x3a3040, 0.85);
    g.lineBetween(bx, 100, bx, by - 60);
    // Chain links
    for (let cy2 = 108; cy2 < by - 60; cy2 += 14) {
      g.lineStyle(1, 0x4a4060, 0.7);
      g.strokeEllipse(bx, cy2, 10, 6);
    }
    // Hook
    g.fillStyle(0x5a5070);
    g.fillRect(bx - 4, by - 64, 8, 8);

    // Bag body (ellipse-like rect with rounded corners approximated by rects)
    const bagW = 36, bagH = 80;
    const bagColor = active ? 0x8B1515 : 0x6B0E0E;
    // Main bag
    g.fillStyle(bagColor, 1);
    g.fillRect(bx - bagW / 2, by - bagH / 2, bagW, bagH);
    // Rounded top/bottom approximation
    g.fillStyle(bagColor, 1);
    g.fillEllipse(bx, by - bagH / 2 + 6, bagW, 14);
    g.fillEllipse(bx, by + bagH / 2 - 6, bagW, 14);
    // Highlight strip
    g.fillStyle(0xAA2020, 0.5);
    g.fillRect(bx - bagW / 2 + 4, by - bagH / 2 + 8, 6, bagH - 16);
    // Strap lines (horizontal bands)
    g.lineStyle(2, 0x3a0808, 0.7);
    g.lineBetween(bx - bagW / 2, by - bagH / 4, bx + bagW / 2, by - bagH / 4);
    g.lineBetween(bx - bagW / 2, by,             bx + bagW / 2, by);
    g.lineBetween(bx - bagW / 2, by + bagH / 4,  bx + bagW / 2, by + bagH / 4);
    // Outline
    g.lineStyle(1, 0xFF2222, 0.3);
    g.strokeRect(bx - bagW / 2, by - bagH / 2, bagW, bagH);

    // Label under bag
    // (label is handled by promptBag text object)
  }

  // ── Draw: weight bench ─────────────────────────────────────────────────────────

  private drawWeightBench(bx: number, by: number) {
    const g = this.add.graphics().setDepth(4);

    // Bench legs
    g.fillStyle(0x1a1a2a);
    [[bx - 48, by + 28], [bx + 48, by + 28]].forEach(([lx, ly]) => {
      g.fillRect(lx - 4, ly, 8, 28);
    });
    g.fillStyle(0x1a1a2a);
    [[bx - 48, by + 28], [bx + 48, by + 28]].forEach(([lx, ly]) => {
      g.lineStyle(1, 0x2a2a3a, 0.7);
      g.strokeRect(lx - 4, ly, 8, 28);
    });

    // Bench pad
    g.fillStyle(0x2a2030);
    g.fillRect(bx - 52, by + 4, 104, 26);
    g.lineStyle(1, 0x4a3a5a, 0.8);
    g.strokeRect(bx - 52, by + 4, 104, 26);
    // Pad top highlight
    g.fillStyle(0x3a3048);
    g.fillRect(bx - 52, by + 4, 104, 7);
    g.lineStyle(1, 0x5a4a70, 0.4);
    g.lineBetween(bx - 52, by + 11, bx + 52, by + 11);
    // Pad seam
    g.lineStyle(1, 0x1a1228, 0.6);
    g.lineBetween(bx, by + 4, bx, by + 30);

    // Barbell (horizontal bar)
    const barbY = by - 18;
    g.fillStyle(0x444466);
    g.fillRect(bx - 80, barbY - 4, 160, 8);
    g.lineStyle(1, 0x6666AA, 0.5);
    g.strokeRect(bx - 80, barbY - 4, 160, 8);
    // Bar shine
    g.fillStyle(0x8888CC, 0.3);
    g.fillRect(bx - 78, barbY - 3, 156, 3);

    // Weight plates (left side)
    const plateDefs = [
      { px: bx - 82, pw: 14, ph: 32, col: 0x3a2244 },
      { px: bx - 96, pw: 10, ph: 26, col: 0x2a1a34 },
    ];
    plateDefs.forEach(({ px, pw, ph, col }) => {
      g.fillStyle(col, 1);
      g.fillRect(px - pw, barbY - ph / 2, pw, ph);
      g.lineStyle(1, 0x5a3a70, 0.6);
      g.strokeRect(px - pw, barbY - ph / 2, pw, ph);
    });
    // Weight plates (right side — mirrored)
    plateDefs.forEach(({ px, pw, ph, col }) => {
      const mirrorX = bx + (bx - px);
      g.fillStyle(col, 1);
      g.fillRect(mirrorX, barbY - ph / 2, pw, ph);
      g.lineStyle(1, 0x5a3a70, 0.6);
      g.strokeRect(mirrorX, barbY - ph / 2, pw, ph);
    });

    // Rack uprights
    g.fillStyle(0x1a1a2a);
    [[bx - 44, by - 48], [bx + 44, by - 48]].forEach(([ux, uy]) => {
      g.fillRect(ux - 4, uy, 8, 52);
      g.lineStyle(1, 0x3a3a5a, 0.6);
      g.strokeRect(ux - 4, uy, 8, 52);
      // Fork/hook
      g.fillStyle(0x3a3a5a);
      g.fillRect(ux - 6, uy, 12, 8);
    });
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────────

  private handleShutdown() {
    this.bagTimeoutTimer?.remove();
    this.bagTimeoutTimer = undefined;
    eventBus.emit(EVENTS.GYM_SCENE_ACTIVE, false);
  }
}
