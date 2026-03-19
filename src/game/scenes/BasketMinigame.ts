import Phaser from 'phaser';
import { initTenks } from '../systems/TenksSystem';
import { announceScene, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { supabase, isConfigured } from '../../lib/supabase';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

type BasketPhase = 'aiming' | 'flying' | 'result' | 'done' | 'exiting';

const TOTAL_SHOTS = 10;
const HOOP_X = 530;
const HOOP_Y = 190;
const BALL_START_X = 180;
const BALL_START_Y = 430;
const GRAVITY = 900;
const MAX_FORCE = 150; // max drag distance (px)
const VEL_FACTOR = 5.5;
const MAX_VEL_X = 600;
const MIN_VEL_Y = -650; // most upward allowed

export class BasketMinigame extends Phaser.Scene {
  // Game state
  private phase: BasketPhase = 'aiming';
  private isFinished = false;
  private totalScore = 0;
  private shotsTaken = 0; // 0-indexed current shot (0 = first shot in progress)
  private makesCount = 0; // how many goals scored
  private streak = 0;
  private goalScoredThisShot = false;
  private touchedRimThisShot = false;

  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  // Reward
  private grantedRewardTenks = 0;
  private rewardPending = false;
  private rewardResolved = false;
  private rewardStatus: 'granted' | 'pending' | 'local' = 'local';
  private rewardRunId = '';
  private rewardRunPromise: Promise<void> | null = null;

  // Timers
  private resultTimerMs = 0;
  private postGameTimerMs = 0;

  // Physics objects
  private ball!: Phaser.GameObjects.Arc;
  private rimLeft!: Phaser.GameObjects.Arc;
  private rimRight!: Phaser.GameObjects.Arc;
  private backboard!: Phaser.GameObjects.Rectangle;
  private netSensor!: Phaser.GameObjects.Rectangle;

  // Visual objects
  private shadow!: Phaser.GameObjects.Ellipse;
  private aimGuide!: Phaser.GameObjects.Graphics;
  private netGraphics!: Phaser.GameObjects.Graphics;
  private shotText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private resultLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BasketMinigame' });
  }

  init() {
    this.isFinished = false;
    this.phase = 'aiming';
    this.totalScore = 0;
    this.shotsTaken = 0;
    this.makesCount = 0;
    this.streak = 0;
    this.goalScoredThisShot = false;
    this.touchedRimThisShot = false;
    this.isDragging = false;
    this.grantedRewardTenks = 0;
    this.rewardPending = false;
    this.rewardResolved = false;
    this.rewardStatus = 'local';
    this.rewardRunId = '';
    this.rewardRunPromise = null;
    this.resultTimerMs = 0;
    this.postGameTimerMs = 0;
  }

  create() {
    this.input.enabled = true;
    announceScene(this);

    // Set arcade gravity
    this.physics.world.gravity.y = GRAVITY;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.isFinished = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });

    this.buildBackground();
    this.buildHoop();
    this.buildBall();
    this.buildHud();
    this.buildInputListeners();

    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(200, 0, 0, 0);

    void this.prepareRewardRun();
    this.refreshHud();
  }

  // ── Background & court ──────────────────────────────────────────────────

  private buildBackground() {
    const { width, height } = this.scale;

    // Dark BG gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0e0e14, 0x0e0e14, 0x141420, 0x141420, 1);
    bg.fillRect(0, 0, width, height);

    // Court floor
    bg.fillStyle(0x4f2a14, 1);
    bg.fillRect(0, height - 140, width, 140);
    bg.fillStyle(0x6f3d1f, 0.3);
    for (let i = 0; i < 12; i++) {
      bg.fillRect(i * 70, height - 140, 3, 140);
    }

    // Court line — three-point arc approximation
    bg.lineStyle(3, 0xf3d49b, 0.25);
    bg.strokeCircle(BALL_START_X, height - 20, 130);

    // Floor line
    bg.lineStyle(2, 0xf3d49b, 0.18);
    bg.lineBetween(0, height - 140, width, height - 140);

    // Spotlight glow
    const glow = this.add.graphics();
    glow.fillStyle(0xffffff, 0.03);
    glow.fillEllipse(BALL_START_X, height - 80, 300, 120);

    // Title
    this.add.text(width / 2, 30, 'BASKET', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5).setDepth(10);
  }

  // ── Hoop construction ───────────────────────────────────────────────────

  private buildHoop() {
    // Backboard (static physics)
    this.backboard = this.add.rectangle(HOOP_X + 80, HOOP_Y - 50, 14, 80, 0xdbe7ff, 1)
      .setStrokeStyle(2, 0x0d1530, 1)
      .setDepth(5);
    this.physics.add.existing(this.backboard, true);

    // Left rim (static physics)
    this.rimLeft = this.add.circle(HOOP_X - 38, HOOP_Y, 7, 0xff6b00, 1)
      .setStrokeStyle(2, 0x3a1a00, 1)
      .setDepth(5);
    this.physics.add.existing(this.rimLeft, true);

    // Right rim (static physics)
    this.rimRight = this.add.circle(HOOP_X + 38, HOOP_Y, 7, 0xff6b00, 1)
      .setStrokeStyle(2, 0x3a1a00, 1)
      .setDepth(5);
    this.physics.add.existing(this.rimRight, true);

    // Rim connector (visual only)
    const rimBar = this.add.graphics().setDepth(4);
    rimBar.lineStyle(5, 0xff6b00, 1);
    rimBar.lineBetween(HOOP_X - 38, HOOP_Y, HOOP_X + 38, HOOP_Y);

    // Net sensor — overlap only (no isSensor in Arcade, use overlap instead of collider)
    this.netSensor = this.add.rectangle(HOOP_X, HOOP_Y + 8, 68, 12, 0x000000, 0)
      .setDepth(6);
    this.physics.add.existing(this.netSensor, true);

    // Net graphic (decorative)
    this.netGraphics = this.add.graphics().setDepth(4);
    this.drawNet(0);

    // Backboard border glow
    const boardGlow = this.add.graphics().setDepth(3);
    boardGlow.lineStyle(1, 0xdbe7ff, 0.15);
    boardGlow.strokeRect(HOOP_X + 73, HOOP_Y - 90, 28, 90);
  }

  private drawNet(drop: number) {
    this.netGraphics.clear();
    this.netGraphics.lineStyle(1, 0xdce6ff, 0.7);
    const left = HOOP_X - 34;
    const right = HOOP_X + 34;
    const top = HOOP_Y + 4;
    const segments = 5;
    const step = (right - left) / segments;
    for (let i = 0; i <= segments; i++) {
      const nx = left + i * step;
      this.netGraphics.lineBetween(nx, top, nx * 0.3 + HOOP_X * 0.7, top + 28 + drop);
    }
    for (let y = 0; y <= 2; y++) {
      const ty = top + y * 12 + drop * (y / 2);
      const shrink = y * 4;
      this.netGraphics.lineBetween(left + shrink, ty, right - shrink, ty);
    }
  }

  // ── Ball construction ───────────────────────────────────────────────────

  private buildBall() {
    this.shadow = this.add.ellipse(BALL_START_X, BALL_START_Y + 18, 26, 10, 0x000000, 0.28)
      .setDepth(7);

    this.ball = this.add.circle(BALL_START_X, BALL_START_Y, 11, 0xf2872f, 1)
      .setStrokeStyle(2, 0x5b2e0a, 1)
      .setDepth(20);

    // Add arcade physics to the ball
    this.physics.add.existing(this.ball);
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    ballBody.setBounce(0.45, 0.35);
    ballBody.setCircle(11);
    ballBody.setCollideWorldBounds(false);
    // Disable gravity until shot
    ballBody.setAllowGravity(false);
    ballBody.setVelocity(0, 0);

    // Ball vs rims (with sound)
    this.physics.add.collider(this.ball, this.rimLeft, () => {
      this.touchedRimThisShot = true;
      this.cameras.main.shake(60, 0.003);
      console.log('SFX: rim_bounce');
    });
    this.physics.add.collider(this.ball, this.rimRight, () => {
      this.touchedRimThisShot = true;
      this.cameras.main.shake(60, 0.003);
      console.log('SFX: rim_bounce');
    });
    this.physics.add.collider(this.ball, this.backboard, () => {
      console.log('SFX: rim_bounce');
    });

    // Goal overlap
    this.physics.add.overlap(this.ball, this.netSensor, () => {
      this.onGoal();
    }, undefined, this);

    // Aim guide
    this.aimGuide = this.add.graphics().setDepth(15);
  }

  // ── HUD ─────────────────────────────────────────────────────────────────

  private buildHud() {
    const { width, height } = this.scale;

    // Top-left panel
    const hudBg = this.add.graphics().setDepth(99);
    hudBg.fillStyle(0x000000, 0.5);
    hudBg.fillRoundedRect(10, 10, 160, 60, 4);

    this.shotText = this.add.text(20, 20, 'TIRO 0/10', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFFFFF',
    }).setDepth(100);

    this.streakText = this.add.text(20, 40, 'RACHA 0', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setDepth(100);

    // Top-right score panel
    const scoreBg = this.add.graphics().setDepth(99);
    scoreBg.fillStyle(0x000000, 0.5);
    scoreBg.fillRoundedRect(width - 150, 10, 140, 60, 4);

    this.scoreText = this.add.text(width - 20, 20, 'SCORE: 0', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      align: 'right',
    }).setOrigin(1, 0).setDepth(100);

    // Bottom hint
    this.hintText = this.add.text(width / 2, height - 22, 'ARROJA - DRAG & SUELTA  |  ESC SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#555566',
    }).setOrigin(0.5).setDepth(100);

    // Result label (center screen)
    this.resultLabel = this.add.text(width / 2, 300, '', {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setDepth(200);
  }

  private refreshHud() {
    const currentShot = Math.min(this.shotsTaken + 1, TOTAL_SHOTS);
    this.shotText.setText(`TIRO ${currentShot}/10`);
    this.streakText.setText(`RACHA ${this.streak}`);
    this.scoreText.setText(`SCORE: ${this.totalScore}`);
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private buildInputListeners() {
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    const escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    escKey?.on('down', () => {
      this.rewardPending = false;
      this.finishAndExit();
    });
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.phase !== 'aiming' || this.isFinished) return;

    const dx = pointer.x - this.ball.x;
    const dy = pointer.y - this.ball.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= 40) {
      this.isDragging = true;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.isDragging || this.phase !== 'aiming') return;
    this.drawAimGuide(pointer.x, pointer.y);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (!this.isDragging || this.phase !== 'aiming' || this.isFinished) return;
    this.isDragging = false;
    this.aimGuide.clear();

    const rawDx = this.dragStartX - pointer.x;
    const rawDy = this.dragStartY - pointer.y;
    const dragDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

    // Must be mostly upward (rawDy > 0 means drag was downward which launches upward)
    if (rawDy < 20) {
      // Not an upward shot — ignore
      return;
    }

    // Cap drag distance
    const clampedDist = Math.min(dragDist, MAX_FORCE);
    const scale = dragDist > 0 ? clampedDist / dragDist : 1;

    const vx = Phaser.Math.Clamp(rawDx * VEL_FACTOR * scale, -MAX_VEL_X, MAX_VEL_X);
    // vy: drag downward (rawDy > 0) launches ball upward (negative vy)
    const vy = Math.max(-(rawDy * VEL_FACTOR * scale), MIN_VEL_Y);

    this.launchBall(vx, vy);
  }

  // ── Aim guide ───────────────────────────────────────────────────────────

  private drawAimGuide(pointerX: number, pointerY: number) {
    this.aimGuide.clear();
    if (this.phase !== 'aiming') return;

    const rawDx = this.dragStartX - pointerX;
    const rawDy = this.dragStartY - pointerY;
    const dragDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

    if (rawDy < 10 || dragDist < 5) return; // not upward, skip

    const clampedDist = Math.min(dragDist, MAX_FORCE);
    const scale = dragDist > 0 ? clampedDist / dragDist : 1;

    const vx = rawDx * VEL_FACTOR * scale;
    const rawVy = -(rawDy * VEL_FACTOR * scale);
    const vy = Math.max(rawVy, MIN_VEL_Y);

    const bx = this.ball.x;
    const by = this.ball.y;

    this.aimGuide.fillStyle(0x46B3FF, 0.7);
    for (let i = 1; i <= 8; i++) {
      const t = i * 0.05;
      const px = bx + vx * t;
      const py = by + vy * t + 0.5 * GRAVITY * t * t;
      const alpha = 1 - (i / 9) * 0.7;
      const radius = 3 - (i / 9) * 1.5;
      this.aimGuide.fillStyle(0x46B3FF, alpha);
      this.aimGuide.fillCircle(px, py, radius);
    }
  }

  // ── Ball launch ─────────────────────────────────────────────────────────

  private launchBall(vx: number, vy: number) {
    if (this.phase !== 'aiming') return;
    this.phase = 'flying';
    this.goalScoredThisShot = false;
    this.touchedRimThisShot = false;

    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    ballBody.setAllowGravity(true);
    ballBody.setVelocity(vx, vy);

    this.refreshHud();
  }

  // ── Goal detection ──────────────────────────────────────────────────────

  private onGoal() {
    if (this.phase !== 'flying') return;
    if (this.goalScoredThisShot) return;

    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    // Ball must be moving downward (falling through hoop)
    if (ballBody.velocity.y < 30) return;

    this.goalScoredThisShot = true;
    const isSwish = !this.touchedRimThisShot;
    this.scoreGoal(isSwish);
  }

  private scoreGoal(isSwish: boolean) {
    this.streak += 1;
    this.makesCount += 1;

    const basePoints = isSwish ? 150 : 100;
    let multiplier = 1.0;
    let label = isSwish ? 'SWISH! +150' : '+100';

    if (this.streak === 2) {
      multiplier = 1.5;
      label = isSwish ? 'SWISH x1.5!' : 'RACHA x1.5!';
    } else if (this.streak === 3) {
      multiplier = 2.0;
      label = isSwish ? 'SWISH x2!' : 'RACHA x2!';
    } else if (this.streak >= 4) {
      multiplier = 3.0;
      label = 'ON FIRE 🔥';
    }

    const points = Math.round(basePoints * multiplier);
    this.totalScore += points;

    // Visual effects
    this.cameras.main.shake(100, 0.005);

    // Slow motion
    this.time.timeScale = 0.3;
    this.tweens.timeScale = 0.3;
    this.physics.world.timeScale = 1 / 0.3; // physics runs at normal speed
    window.setTimeout(() => {
      if (!this.scene.isActive('BasketMinigame')) return;
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
      this.physics.world.timeScale = 1;
    }, 200);

    // Gold particle burst at hoop
    this.spawnGoalBurst();

    // Animate net
    this.animateNet(true);

    // Floating label
    this.showFloatingText(label, '#F5C842', HOOP_X, HOOP_Y - 30);
    this.showFloatingText(`+${points}pts`, '#39FF14', HOOP_X, HOOP_Y - 10);

    console.log('SFX: basket_score');

    this.refreshHud();
    this.showResultLabel(label, '#39FF14');

    // After slow-mo resolves, set result phase
    this.resultTimerMs = 900;
    this.phase = 'result';
  }

  private onMiss() {
    this.streak = 0;
    console.log('SFX: miss');
    this.animateNet(false);
    this.refreshHud();
    this.showResultLabel('MISS!', '#FF006E');
    this.resultTimerMs = 600;
    this.phase = 'result';
  }

  // ── Visual helpers ──────────────────────────────────────────────────────

  private spawnGoalBurst() {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      const px = HOOP_X + (Math.random() - 0.5) * 60;
      const py = HOOP_Y + 10;
      const particle = this.add.circle(px, py, 3 + Math.random() * 3, 0xF5C842, 1)
        .setDepth(300)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: particle,
        x: px + Math.cos(angle) * speed,
        y: py + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 400 + Math.random() * 200,
        ease: 'Sine.easeOut',
        onComplete: () => { if (particle.active) particle.destroy(); },
      });
    }
  }

  private showFloatingText(text: string, color: string, x: number, startY: number) {
    const label = this.add.text(x, startY, text, {
      fontSize: '13px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setDepth(400).setScrollFactor(0);

    this.tweens.add({
      targets: label,
      alpha: 1,
      y: startY - 20,
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        window.setTimeout(() => {
          if (!this.scene.isActive('BasketMinigame')) return;
          if (!label.active) return;
          this.tweens.add({
            targets: label,
            alpha: 0,
            y: startY - 50,
            duration: 380,
            ease: 'Sine.easeIn',
            onComplete: () => { if (label.active) label.destroy(); },
          });
        }, 300);
      },
    });
  }

  private showFloatingTenks(amount: number, x: number, startY: number) {
    const hasCoin = this.textures.exists('icon_coin');
    const textStr = `+${amount}`;
    const label = this.add.text(hasCoin ? x + 12 : x, startY, textStr, {
      fontSize: '13px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(hasCoin ? 0 : 0.5, 0.5).setAlpha(0).setDepth(401).setScrollFactor(0);
    const coin = hasCoin
      ? this.add.image(x - label.width / 2, startY, 'icon_coin').setDisplaySize(16, 16).setOrigin(0.5).setAlpha(0).setDepth(401).setScrollFactor(0)
      : null;

    const targets: Phaser.GameObjects.GameObject[] = coin ? [label, coin] : [label];
    this.tweens.add({
      targets,
      alpha: 1,
      y: startY - 20,
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        window.setTimeout(() => {
          if (!this.scene.isActive('BasketMinigame')) return;
          if (!label.active) return;
          this.tweens.add({
            targets,
            alpha: 0,
            y: startY - 50,
            duration: 380,
            ease: 'Sine.easeIn',
            onComplete: () => {
              if (label.active) label.destroy();
              if (coin?.active) coin.destroy();
            },
          });
        }, 300);
      },
    });
  }

  private showResultLabel(text: string, color: string) {
    const { width } = this.scale;
    this.resultLabel.setText(text).setColor(color).setAlpha(1).setX(width / 2).setY(310);
    this.tweens.add({
      targets: this.resultLabel,
      y: 295,
      alpha: 0,
      duration: 700,
      ease: 'Sine.easeOut',
    });
  }

  private animateNet(made: boolean) {
    const drop = made ? 10 : 4;
    this.drawNet(drop);
    this.tweens.addCounter({
      from: drop,
      to: 0,
      duration: made ? 350 : 180,
      ease: 'Sine.easeOut',
      onUpdate: tween => {
        this.drawNet(tween.getValue() ?? 0);
      },
    });
  }

  // ── Shot flow ───────────────────────────────────────────────────────────

  private resetForNextShot() {
    // Mark shot as completed
    this.shotsTaken += 1;

    if (this.shotsTaken >= TOTAL_SHOTS) {
      this.enterDoneState();
      return;
    }

    // Reset ball for next shot
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    ballBody.setAllowGravity(false);
    ballBody.setVelocity(0, 0);
    ballBody.setAcceleration(0, 0);

    const jitter = Phaser.Math.Between(-50, 50);
    const newX = Phaser.Math.Clamp(BALL_START_X + jitter, 80, 280);
    this.ball.setPosition(newX, BALL_START_Y);
    this.ball.setScale(1);

    this.shadow.setPosition(newX, BALL_START_Y + 18);
    this.shadow.setScale(1, 1);

    this.goalScoredThisShot = false;
    this.touchedRimThisShot = false;
    this.isDragging = false;

    this.phase = 'aiming';
    this.refreshHud();
  }

  private enterDoneState() {
    if (this.phase === 'done' || this.phase === 'exiting') return;
    this.phase = 'done';

    // Stop ball
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    ballBody.setAllowGravity(false);
    ballBody.setVelocity(0, 0);

    // Calculate TENKS reward
    const makes = this.makesCount;
    let tenksReward = this.calculateTenksReward();
    if (makes === TOTAL_SHOTS) {
      tenksReward += 1000; // perfect game bonus
    }
    this.grantedRewardTenks = tenksReward;

    eventBus.emit(EVENTS.STATS_BASKET_GAME, {
      score: this.totalScore,
      shots: this.shotsTaken,
      makes,
    });

    const { width } = this.scale;
    this.showFloatingTenks(tenksReward, width / 2, 250);

    const finalLabel = this.add.text(width / 2, 200, [
      `FINAL: ${this.totalScore} PTS`,
      makes === TOTAL_SHOTS ? 'PARTIDA PERFECTA!' : `${makes}/${TOTAL_SHOTS} CANASTAS`,
    ], {
      fontSize: '13px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
      lineSpacing: 10,
    }).setOrigin(0.5).setAlpha(0).setDepth(300);

    this.tweens.add({
      targets: finalLabel,
      alpha: 1,
      y: 195,
      duration: 300,
      ease: 'Back.easeOut',
    });

    this.hintText.setText('GUARDANDO RESULTADO...');
    this.hintText.setColor('#46B3FF');

    this.rewardPending = tenksReward > 0;
    void this.resolveReward();
    this.postGameTimerMs = 2000;

    // Safety: unblock after 10s if reward hangs
    if (this.rewardPending) {
      window.setTimeout(() => {
        if (!this.rewardPending || this.isFinished) return;
        if (!this.scene.isActive('BasketMinigame')) return;
        if (!this.hintText.active) return;
        this.rewardPending = false;
        this.hintText.setText('NO SE PUDO GUARDAR. VOLVIENDO...');
        this.hintText.setColor('#FF006E');
      }, 10000);
    }
  }

  private calculateTenksReward(): number {
    const pts = this.totalScore;
    if (pts <= 300) return 75;
    if (pts <= 600) return 150;
    if (pts <= 900) return 250;
    if (pts <= 1200) return 400;
    return 600;
  }

  // ── Update loop ─────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    if (this.isFinished) return;

    // Shadow follows ball horizontally on court
    if (this.phase === 'flying') {
      const shadowY = BALL_START_Y + 18;
      const ballX = this.ball.x;
      const heightRatio = Phaser.Math.Clamp(1 - (BALL_START_Y - this.ball.y) / 300, 0.2, 1);
      this.shadow.setPosition(ballX, shadowY);
      this.shadow.setScale(heightRatio, heightRatio * 0.4);

      // Check out of bounds
      if (
        this.ball.y > 640 ||
        this.ball.x < -60 ||
        this.ball.x > 860
      ) {
        if (!this.goalScoredThisShot) {
          this.onMiss();
        }
      }
    }

    // Result phase: wait then go next
    if (this.phase === 'result') {
      this.resultTimerMs -= delta;
      if (this.resultTimerMs <= 0) {
        this.resetForNextShot();
      }
      return;
    }

    // Done phase: wait then exit
    if (this.phase === 'done') {
      if (this.rewardPending) return;
      this.postGameTimerMs -= delta;
      if (this.postGameTimerMs <= 0) {
        this.finishAndExit();
      }
      return;
    }
  }

  private finishAndExit() {
    if (this.isFinished) return;
    if (this.rewardPending) return;
    this.isFinished = true;
    this.phase = 'exiting';
    transitionToScene(this, 'ArcadeInterior', {
      basketCooldownMs: 1200,
      basketReward: {
        score: this.totalScore,
        shots: this.shotsTaken,
        tenksEarned: this.grantedRewardTenks,
        status: this.rewardStatus,
      },
    });
  }

  // ── Server reward ───────────────────────────────────────────────────────

  private async getAuthToken(): Promise<string | null> {
    if (!supabase || !isConfigured) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  private async prepareRewardRun(): Promise<void> {
    if (this.rewardRunId) return;
    if (this.rewardRunPromise) {
      await this.rewardRunPromise;
      return;
    }

    this.rewardRunPromise = (async () => {
      const token = await this.getAuthToken();
      if (!token) return;

      const res = await fetchWithTimeout(
        '/api/minigames/basket/start',
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
        6000,
      ).catch(() => null);

      if (!res?.ok) return;
      const json = await res.json().catch(() => null) as { runId?: string } | null;
      if (typeof json?.runId === 'string') {
        this.rewardRunId = json.runId;
      }
    })();

    try {
      await this.rewardRunPromise;
    } finally {
      this.rewardRunPromise = null;
    }
  }

  private async resolveReward(): Promise<void> {
    if (this.rewardResolved) return;

    if (this.grantedRewardTenks <= 0) {
      this.rewardResolved = true;
      this.rewardPending = false;
      this.rewardStatus = 'granted';
      if (this.hintText.active) {
        this.hintText.setText('VOLVIENDO AL ARCADE...');
        this.hintText.setColor('#888888');
      }
      return;
    }

    const token = await this.getAuthToken();
    if (!token) {
      this.rewardStatus = 'pending';
      this.rewardResolved = true;
      this.rewardPending = false;
      this.grantedRewardTenks = 0;
      if (this.hintText.active) {
        this.hintText.setText('INICIA SESION PARA ACREDITAR EL PREMIO.');
        this.hintText.setColor('#FFB36A');
      }
      return;
    }

    await this.prepareRewardRun();
    if (!this.rewardRunId) {
      this.rewardStatus = 'pending';
      this.rewardResolved = true;
      this.rewardPending = false;
      this.grantedRewardTenks = 0;
      if (this.hintText.active) {
        this.hintText.setText('NO PUDIMOS RESERVAR LA PARTIDA. PROBA OTRA VEZ.');
        this.hintText.setColor('#FFB36A');
      }
      return;
    }

    const res = await fetchWithTimeout(
      '/api/minigames/basket/reward',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          score: this.totalScore,
          shots: this.shotsTaken,
          runId: this.rewardRunId,
        }),
      },
      8000,
    ).catch(() => null);

    if (!res?.ok) {
      this.rewardStatus = 'pending';
      this.rewardResolved = true;
      this.rewardPending = false;
      this.grantedRewardTenks = 0;
      if (this.hintText.active) {
        this.hintText.setText('VOLVE A ENTRAR LUEGO. EL PREMIO NO SE CERRO.');
        this.hintText.setColor('#FFB36A');
      }
      return;
    }

    const json = await res.json().catch(() => null) as {
      tenksEarned?: number;
      player?: { tenks?: number };
    } | null;

    if (typeof json?.player?.tenks === 'number') {
      initTenks(json.player.tenks, { preferStored: false });
    }
    if (typeof json?.tenksEarned === 'number') {
      this.grantedRewardTenks = json.tenksEarned;
    }

    eventBus.emit(EVENTS.UI_NOTICE, `Basket +${this.grantedRewardTenks} TENKS`);
    this.rewardStatus = 'granted';
    this.rewardResolved = true;
    this.rewardPending = false;

    if (this.hintText.active) {
      this.hintText.setText('VOLVIENDO AL ARCADE CON PREMIO...');
      this.hintText.setColor('#39FF14');
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  private handleShutdown() {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
  }
}
