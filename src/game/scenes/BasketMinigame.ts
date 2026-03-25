import Phaser from 'phaser';
import { announceScene, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { supabase, isConfigured } from '../../lib/supabase';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';

type BasketPhase = 'aiming' | 'flying' | 'result' | 'done' | 'exiting';

const TOTAL_SHOTS = 10;
const HOOP_X = 530;
const HOOP_Y = 190;
const BALL_START_X = 180;
const BALL_START_Y = 430;
const GRAVITY = 900;
const MAX_FORCE = 205; // max drag distance (px)
const VEL_FACTOR = 6.8;
const MAX_VEL_X = 780;
const MIN_VEL_Y = -840; // most upward allowed
const PLAYER_X = 150;
const PLAYER_Y = 458;
const HOOP_MOVE_RANGE = 120;
const HOOP_MOVE_SPEED = 0.0015;

export class BasketMinigame extends Phaser.Scene {
  // Game state
  private phase: BasketPhase = 'aiming';
  private isFinished = false;
  private shuttingDown = false;
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
  private pointerDownX = 0;
  private pointerDownY = 0;
  private dragFromBallAnchor = false;

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
  private rimBar!: Phaser.GameObjects.Graphics;
  private boardGlow!: Phaser.GameObjects.Graphics;
  private hintText!: Phaser.GameObjects.Text;
  private escKey?: Phaser.Input.Keyboard.Key;
  private player!: AvatarRenderer;
  private hoopX = HOOP_X;
  private hoopY = HOOP_Y;
  private hoopMoveDir = 1;
  private hoopMoveAnchorX = HOOP_X;

  constructor() {
    super({ key: 'BasketMinigame' });
  }

  init() {
    this.shuttingDown = false;
    this.isFinished = false;
    this.phase = 'aiming';
    this.totalScore = 0;
    this.shotsTaken = 0;
    this.makesCount = 0;
    this.streak = 0;
    this.goalScoredThisShot = false;
    this.touchedRimThisShot = false;
    this.isDragging = false;
    this.pointerDownX = 0;
    this.pointerDownY = 0;
    this.dragFromBallAnchor = false;
    this.grantedRewardTenks = 0;
    this.rewardPending = false;
    this.rewardResolved = false;
    this.rewardStatus = 'local';
    this.rewardRunId = '';
    this.rewardRunPromise = null;
    this.resultTimerMs = 0;
    this.postGameTimerMs = 0;
    this.hoopX = HOOP_X;
    this.hoopY = HOOP_Y;
    this.hoopMoveDir = 1;
    this.hoopMoveAnchorX = HOOP_X;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0E0E14');
    this.input.enabled = true;
    announceScene(this);

    // Set arcade gravity
    this.physics.world.gravity.y = GRAVITY;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.shuttingDown = false;
      this.isFinished = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });

    eventBus.emit(EVENTS.BASKET_SCENE_ACTIVE, true);
    this.buildBackground();
    this.buildHoop();
    this.buildPlayer();
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
    this.backboard = this.add.rectangle(this.hoopX + 80, this.hoopY - 50, 14, 80, 0xdbe7ff, 1)
      .setStrokeStyle(2, 0x0d1530, 1)
      .setDepth(5);
    this.physics.add.existing(this.backboard, true);

    // Left rim (static physics)
    this.rimLeft = this.add.circle(this.hoopX - 38, this.hoopY, 7, 0xff6b00, 1)
      .setStrokeStyle(2, 0x3a1a00, 1)
      .setDepth(5);
    this.physics.add.existing(this.rimLeft, true);

    // Right rim (static physics)
    this.rimRight = this.add.circle(this.hoopX + 38, this.hoopY, 7, 0xff6b00, 1)
      .setStrokeStyle(2, 0x3a1a00, 1)
      .setDepth(5);
    this.physics.add.existing(this.rimRight, true);

    // Rim connector (visual only)
    this.rimBar = this.add.graphics().setDepth(4);
    this.redrawHoopDecor();

    // Net sensor — overlap only (no isSensor in Arcade, use overlap instead of collider)
    this.netSensor = this.add.rectangle(this.hoopX, this.hoopY + 8, 68, 12, 0x000000, 0)
      .setDepth(6);
    this.physics.add.existing(this.netSensor, true);

    // Net graphic (decorative)
    this.netGraphics = this.add.graphics().setDepth(4);
    this.drawNet(0);

    // Backboard border glow
    this.boardGlow = this.add.graphics().setDepth(3);
    this.redrawHoopDecor();
  }

  private buildPlayer() {
    this.player = new AvatarRenderer(this, PLAYER_X, PLAYER_Y, loadStoredAvatarConfig());
    this.player.setDepth(12);
    this.player.update(false, 1, 0);
  }

  private drawNet(drop: number) {
    this.netGraphics.clear();
    this.netGraphics.lineStyle(1, 0xdce6ff, 0.7);
    const left = this.hoopX - 34;
    const right = this.hoopX + 34;
    const top = this.hoopY + 4;
    const segments = 5;
    const step = (right - left) / segments;
    for (let i = 0; i <= segments; i++) {
      const nx = left + i * step;
      this.netGraphics.lineBetween(nx, top, nx * 0.3 + this.hoopX * 0.7, top + 28 + drop);
    }
    for (let y = 0; y <= 2; y++) {
      const ty = top + y * 12 + drop * (y / 2);
      const shrink = y * 4;
      this.netGraphics.lineBetween(left + shrink, ty, right - shrink, ty);
    }
  }

  private redrawHoopDecor() {
    this.rimBar?.clear();
    this.rimBar?.lineStyle(5, 0xff6b00, 1);
    this.rimBar?.lineBetween(this.hoopX - 38, this.hoopY, this.hoopX + 38, this.hoopY);

    this.boardGlow?.clear();
    this.boardGlow?.lineStyle(1, 0xdbe7ff, 0.15);
    this.boardGlow?.strokeRect(this.hoopX + 73, this.hoopY - 90, 28, 90);
  }

  private syncStaticBody(gameObject: Phaser.GameObjects.GameObject) {
    const body = (gameObject as Phaser.GameObjects.GameObject & { body?: unknown }).body;
    if (body instanceof Phaser.Physics.Arcade.StaticBody) body.updateFromGameObject();
  }

  private updateHoopPosition(delta: number) {
    if (this.phase !== 'aiming') return;

    const drift = HOOP_MOVE_SPEED * delta * this.hoopMoveDir;
    this.hoopX += drift * HOOP_MOVE_RANGE;

    if (this.hoopX > this.hoopMoveAnchorX + HOOP_MOVE_RANGE) {
      this.hoopX = this.hoopMoveAnchorX + HOOP_MOVE_RANGE;
      this.hoopMoveDir = -1;
    } else if (this.hoopX < this.hoopMoveAnchorX - HOOP_MOVE_RANGE) {
      this.hoopX = this.hoopMoveAnchorX - HOOP_MOVE_RANGE;
      this.hoopMoveDir = 1;
    }

    this.backboard.setPosition(this.hoopX + 80, this.hoopY - 50);
    this.rimLeft.setPosition(this.hoopX - 38, this.hoopY);
    this.rimRight.setPosition(this.hoopX + 38, this.hoopY);
    this.netSensor.setPosition(this.hoopX, this.hoopY + 8);
    this.syncStaticBody(this.backboard);
    this.syncStaticBody(this.rimLeft);
    this.syncStaticBody(this.rimRight);
    this.syncStaticBody(this.netSensor);
    this.redrawHoopDecor();
    this.drawNet(0);
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

    this.hintText = this.add.text(width / 2, height - 22, 'ARROJA - ARRASTRA Y SUELTA (ABAJO O ARRIBA)  |  ESC SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#555566',
    }).setOrigin(0.5).setDepth(100);
  }

  private refreshHud() {
    const currentShot = Math.min(this.shotsTaken + 1, TOTAL_SHOTS);
    eventBus.emit(EVENTS.BASKET_HUD_UPDATE, {
      score: this.totalScore,
      streak: this.streak,
      shot: currentShot,
      totalShots: TOTAL_SHOTS,
    });
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private buildInputListeners() {
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey?.on('down', () => {
      this.rewardPending = false;
      this.finishAndExit();
    });
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.phase !== 'aiming' || this.isFinished || this.shuttingDown) return;

    this.pointerDownX = pointer.x;
    this.pointerDownY = pointer.y;
    const dx = pointer.x - this.ball.x;
    const dy = pointer.y - this.ball.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    this.isDragging = true;

    if (dist <= 90) {
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.dragFromBallAnchor = false;
      return;
    }

    this.dragStartX = this.ball.x;
    this.dragStartY = this.ball.y;
    this.dragFromBallAnchor = true;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.isDragging || this.phase !== 'aiming' || this.shuttingDown) return;
    this.drawAimGuide(pointer.x, pointer.y);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (!this.isDragging || this.phase !== 'aiming' || this.isFinished || this.shuttingDown) return;
    this.isDragging = false;
    this.aimGuide.clear();
    const startedFromBallAnchor = this.dragFromBallAnchor;
    this.dragFromBallAnchor = false;
    if (startedFromBallAnchor) {
      const moved = Phaser.Math.Distance.Between(this.pointerDownX, this.pointerDownY, pointer.x, pointer.y);
      if (moved < 18) return;
    }
    const rawDx = this.dragStartX - pointer.x;
    const rawDy = this.dragStartY - pointer.y;
    const dragDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    if (dragDist < 12) return;
    if (Math.abs(rawDy) < 10) return;
    let vx = 0;
    let vy = 0;
    if (rawDy > 0) {
      const clampedDist = Math.min(dragDist, MAX_FORCE);
      const scale = dragDist > 0 ? clampedDist / dragDist : 1;
      vx = Phaser.Math.Clamp(rawDx * VEL_FACTOR * scale, -MAX_VEL_X, MAX_VEL_X);
      vy = Math.max(-(rawDy * VEL_FACTOR * scale), MIN_VEL_Y);
    } else {
      const flickDx = pointer.x - this.dragStartX;
      const flickDy = this.dragStartY - pointer.y;
      const flickDist = Math.sqrt(flickDx * flickDx + flickDy * flickDy);
      const flickClamped = Math.min(flickDist, MAX_FORCE);
      const flickScale = flickDist > 0 ? flickClamped / flickDist : 1;
      vx = Phaser.Math.Clamp(flickDx * VEL_FACTOR * flickScale, -MAX_VEL_X, MAX_VEL_X);
      vy = Math.max(-(flickDy * VEL_FACTOR * flickScale), MIN_VEL_Y);
    }
    this.player.playShoot();
    this.launchBall(vx, vy);
  }
  // Aim guide
  private drawAimGuide(pointerX: number, pointerY: number) {
    this.aimGuide.clear();
    if (this.phase !== 'aiming') return;
    const rawDx = this.dragStartX - pointerX;
    const rawDy = this.dragStartY - pointerY;
    const dragDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    if (Math.abs(rawDy) < 10 || dragDist < 5) return;
    let vx = 0;
    let rawVy = 0;
    if (rawDy > 0) {
      const clampedDist = Math.min(dragDist, MAX_FORCE);
      const scale = dragDist > 0 ? clampedDist / dragDist : 1;
      vx = rawDx * VEL_FACTOR * scale;
      rawVy = -(rawDy * VEL_FACTOR * scale);
    } else {
      const flickDx = pointerX - this.dragStartX;
      const flickDy = this.dragStartY - pointerY;
      const flickDist = Math.sqrt(flickDx * flickDx + flickDy * flickDy);
      const flickClamped = Math.min(flickDist, MAX_FORCE);
      const flickScale = flickDist > 0 ? flickClamped / flickDist : 1;
      vx = flickDx * VEL_FACTOR * flickScale;
      rawVy = -(flickDy * VEL_FACTOR * flickScale);
    }
    vx = Phaser.Math.Clamp(vx, -MAX_VEL_X, MAX_VEL_X);
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
  // Ball launch
  private launchBall(vx: number, vy: number) {
    if (this.phase !== 'aiming' || this.shuttingDown) return;
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
    if (this.phase !== 'flying' || this.shuttingDown) return;
    if (this.goalScoredThisShot) return;

    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    // Ball must be moving downward (falling through hoop)
    if (ballBody.velocity.y < 30) return;

    this.goalScoredThisShot = true;
    const isSwish = !this.touchedRimThisShot;
    this.scoreGoal(isSwish);
  }

  private scoreGoal(isSwish: boolean) {
    if (this.shuttingDown) return;
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
    this.time.delayedCall(200, () => {
      if (!this.isSceneAlive()) return;
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
      this.physics.world.timeScale = 1;
    });

    // Gold particle burst at hoop
    this.spawnGoalBurst();

    // Animate net
    this.animateNet(true);

    // Floating label
    this.showFloatingText(label, '#F5C842', this.hoopX, this.hoopY - 30);
    this.showFloatingText(`+${points}pts`, '#39FF14', this.hoopX, this.hoopY - 10);

    console.log('SFX: basket_score');

    this.refreshHud();
    this.showResultLabel(label, '#39FF14');

    // After slow-mo resolves, set result phase
    this.resultTimerMs = 900;
    this.phase = 'result';
  }

  private onMiss() {
    if (this.shuttingDown) return;
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
      const px = this.hoopX + (Math.random() - 0.5) * 60;
      const py = this.hoopY + 10;
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
    if (!this.isSceneAlive()) return;
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
        this.time.delayedCall(300, () => {
          if (!this.isSceneAlive()) return;
          if (!label.active) return;
          this.tweens.add({
            targets: label,
            alpha: 0,
            y: startY - 50,
            duration: 380,
            ease: 'Sine.easeIn',
            onComplete: () => { if (label.active) label.destroy(); },
          });
        });
      },
    });
  }

  private showFloatingTenks(amount: number, x: number, startY: number) {
    if (!this.isSceneAlive()) return;
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
        this.time.delayedCall(300, () => {
          if (!this.isSceneAlive()) return;
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
        });
      },
    });
  }

  private showResultLabel(text: string, color: string) {
    void text;
    void color;
    // Result feedback is handled via React HUD (BasketHUD) through eventBus emissions.
  }

  private animateNet(made: boolean) {
    if (!this.isSceneAlive()) return;
    const drop = made ? 10 : 4;
    this.drawNet(drop);
    this.tweens.addCounter({
      from: drop,
      to: 0,
      duration: made ? 350 : 180,
      ease: 'Sine.easeOut',
      onUpdate: tween => {
        if (!this.isSceneAlive()) return;
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
    this.player.clearActionState();
    this.player.update(false, 1, 0);

    this.shadow.setPosition(newX, BALL_START_Y + 18);
    this.shadow.setScale(1, 1);

    this.goalScoredThisShot = false;
    this.touchedRimThisShot = false;
    this.isDragging = false;

    this.phase = 'aiming';
    this.refreshHud();
  }

  private enterDoneState() {
    if (this.phase === 'done' || this.phase === 'exiting' || this.shuttingDown) return;
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

    eventBus.emit(EVENTS.BASKET_RESULT, {
      score: this.totalScore,
      made: makes,
      attempts: TOTAL_SHOTS,
    });

    const { width } = this.scale;
    this.showFloatingTenks(tenksReward, width / 2, 250);

    if (this.hintText.active) {
      this.hintText.setText('GUARDANDO RESULTADO...');
      this.hintText.setColor('#46B3FF');
    }

    this.rewardPending = tenksReward > 0;
    void this.resolveReward();
    this.postGameTimerMs = 2000;

    // Safety: unblock after 10s if reward hangs
    if (this.rewardPending) {
      this.time.delayedCall(10000, () => {
        if (!this.rewardPending || this.isFinished) return;
        if (!this.isSceneAlive()) return;
        if (!this.hintText.active) return;
        this.rewardStatus = 'pending';
        this.grantedRewardTenks = 0;
        this.rewardResolved = true;
        this.rewardPending = false;
        this.hintText.setText('NO SE PUDO GUARDAR. VOLVIENDO...');
        this.hintText.setColor('#FF006E');
      });
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

    this.updateHoopPosition(delta);
    this.player.update(this.phase === 'aiming', 1, 0);
    this.player.setPosition(PLAYER_X, PLAYER_Y);
    this.player.setDepth(12);

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
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    transitionToScene(this, 'ArcadeInterior', {
      basketCooldownMs: 1200,
      penaltyCooldownMs: 1200,
      dartsCooldownMs: 1200,
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
    if (this.rewardResolved || this.shuttingDown) return;

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
      player?: import('@/src/lib/playerState').PlayerState;
    } | null;

    if (json?.player) {
      eventBus.emit(EVENTS.PLAYER_STATE_APPLY, json.player);
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
    this.shuttingDown = true;
    this.isFinished = true;
    this.phase = 'exiting';
    this.rewardPending = false;
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    this.tweens.killAll();
    this.time.removeAllEvents();
    eventBus.emit(EVENTS.BASKET_SCENE_ACTIVE, false);
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
    this.escKey?.off('down');
    this.escKey = undefined;
    this.player?.destroy();
  }

  private isSceneAlive(): boolean {
    return !this.shuttingDown && this.scene.isActive('BasketMinigame');
  }
}
