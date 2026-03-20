import Phaser from 'phaser';
import { announceScene, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { addTenks } from '../systems/TenksSystem';

// ─── Types ────────────────────────────────────────────────────────────────────

type GameState = 'idle' | 'playing' | 'dead' | 'gameover';

interface PipePair {
  topPipe: Phaser.GameObjects.Rectangle;
  botPipe: Phaser.GameObjects.Rectangle;
  x: number;
  gapTop: number;    // y where top pipe ends
  gapBottom: number; // y where bottom pipe starts
  scored: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const W = 800;
const H = 600;
const BIRD_X = 200;
const GROUND_Y = 560;
const PIPE_WIDTH = 52;
const PIPE_SPAWN_INTERVAL = 220; // px of scroll between pipes
const BASE_SPEED = 200;
const MAX_SPEED = 380;
const BASE_GAP = 165;
const MIN_GAP = 130;
const GAP_Y_MIN = 100;
const GAP_Y_MAX = 460;
const MAX_GAP_VARIANCE = 180;

const FONT = '"Press Start 2P", monospace';
const COL_BG = 0x0e0e14;
const COL_GOLD = '#F5C842';
const COL_GREEN = '#39FF14';
const COL_GREEN_N = 0x39ff14;
const COL_PIPE_FILL = 0x1a1a2e;

// ─── TENKS reward table ────────────────────────────────────────────────────────

function calcTenks(score: number): number {
  if (score >= 100) return 600;
  if (score >= 50) return 300;
  if (score >= 25) return 150;
  if (score >= 10) return 75;
  return 30;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class FlappyWaspiScene extends Phaser.Scene {
  // State
  private gameState: GameState = 'idle';
  private score = 0;
  private bestScore = 0;
  private canRetry = false;
  private inTransition = false;
  private shuttingDown = false;

  // Bird
  private bird!: Phaser.GameObjects.Rectangle;
  private birdBody!: Phaser.Physics.Arcade.Body;
  private birdAngle = 0;

  // Pipes
  private pipePairs: PipePair[] = [];
  private pipeSpeed = BASE_SPEED;
  private scrollDistance = 0;
  private lastPipeScroll = 0;
  private lastGapCenterY = 280;

  // Input
  private keySpace!: Phaser.Input.Keyboard.Key;
  private pointerDown = false;

  // UI
  private idleGroup!: Phaser.GameObjects.Group;
  private gameoverGroup!: Phaser.GameObjects.Group;

  // Best score persistence
  private readonly BEST_KEY = 'flappywaspi_best_v1';

  constructor() {
    super({ key: 'FlappyWaspiScene' });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  init(): void {
    this.shuttingDown = false;
    this.gameState = 'idle';
    this.score = 0;
    this.canRetry = false;
    this.inTransition = false;
    this.pipePairs = [];
    this.pipeSpeed = BASE_SPEED;
    this.scrollDistance = 0;
    this.lastPipeScroll = 0;
    this.lastGapCenterY = 280;
    this.birdAngle = 0;
    this.pointerDown = false;
    // Load best score
    const stored = parseInt(localStorage.getItem(this.BEST_KEY) ?? '0', 10);
    this.bestScore = Number.isFinite(stored) ? stored : 0;
  }

  create(): void {
    this.shuttingDown = false;
    this.inTransition = false;
    this.input.enabled = true;
    announceScene(this);

    eventBus.emit(EVENTS.FLAPPY_SCENE_ACTIVE, true);
    this.buildBackground();
    this.buildBird();
    this.buildUI();
    this.buildInput();
    this.showIdleScreen();

    // WAKE: restart game cleanly
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.shuttingDown = false;
      this.inTransition = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
      this.resetGame();
      this.showIdleScreen();
    });

    // SHUTDOWN: cleanup
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  update(_time: number, delta: number): void {
    if (this.shuttingDown) return;
    if (this.gameState === 'playing') {
      this.updatePlaying(delta);
    } else if (this.gameState === 'dead') {
      // Bird falls after death — physics still ticking
      this.rotateBirdByVelocity();
    }
    this.pointerDown = false;
  }

  // ─── Background ─────────────────────────────────────────────────────────────

  private buildBackground(): void {
    const gfx = this.add.graphics().setDepth(0);

    // Sky gradient (approximated with two rects)
    gfx.fillStyle(COL_BG, 1);
    gfx.fillRect(0, 0, W, H);
    // Slight gradient feel — slightly lighter strip at bottom of sky
    gfx.fillStyle(0x1a1a2e, 0.5);
    gfx.fillRect(0, H * 0.4, W, H * 0.6);

    // Stars
    gfx.fillStyle(0xffffff, 0.6);
    const starPositions: Array<[number, number, number]> = [
      [60, 40, 1.5], [120, 20, 1], [250, 55, 2], [380, 15, 1.5],
      [480, 70, 1], [540, 30, 2], [630, 45, 1.5], [720, 20, 1],
      [760, 60, 2], [40, 80, 1], [330, 80, 1.5], [680, 80, 1],
      [155, 95, 2], [590, 95, 1], [720, 100, 1.5],
    ];
    for (const [sx, sy, sr] of starPositions) {
      gfx.fillCircle(sx, sy, sr);
    }

    // City skyline silhouette at y=480
    const buildings: Array<[number, number, number]> = [
      [0, 100, 60], [55, 140, 55], [105, 80, 45], [145, 120, 50],
      [190, 90, 40], [225, 160, 60], [280, 70, 35], [310, 130, 55],
      [360, 110, 40], [395, 80, 35], [425, 150, 65], [485, 100, 50],
      [530, 120, 60], [585, 90, 40], [620, 140, 55], [670, 80, 35],
      [700, 110, 50], [745, 130, 60],
    ];
    gfx.fillStyle(0x0a0a14, 1);
    for (const [bx, bh, bw] of buildings) {
      gfx.fillRect(bx, 480 - bh, bw, bh);
    }

    // Ground bar
    gfx.fillStyle(0x1e1e2e, 1);
    gfx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    // Green border line on top of ground
    gfx.lineStyle(2, COL_GREEN_N, 1);
    gfx.beginPath();
    gfx.moveTo(0, GROUND_Y);
    gfx.lineTo(W, GROUND_Y);
    gfx.strokePath();
  }

  // ─── Bird ───────────────────────────────────────────────────────────────────

  private buildBird(): void {
    this.bird = this.add.rectangle(BIRD_X, H / 2, 24, 24, 0xF5C842).setDepth(10);
    this.physics.add.existing(this.bird);
    this.birdBody = this.bird.body as Phaser.Physics.Arcade.Body;
    this.birdBody.setGravityY(1100);
    this.birdBody.setCollideWorldBounds(false);
    this.birdBody.setCircle(9, 3, 3);
    // Disable physics until game starts
    this.birdBody.setVelocity(0, 0);
    this.birdBody.setGravityY(0);
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private buildInput(): void {
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.input.on('pointerdown', () => {
      this.pointerDown = true;
      this.handleFlap();
    });
  }

  private handleFlap(): void {
    if (this.inTransition || this.shuttingDown) return;

    if (this.gameState === 'idle') {
      this.startGame();
      this.flap();
    } else if (this.gameState === 'playing') {
      this.flap();
    } else if (this.gameState === 'gameover' && this.canRetry) {
      this.retryGame();
    }
  }

  private flap(): void {
    if (this.shuttingDown) return;
    this.birdBody.setVelocityY(-400);
    this.bird.angle = -20;
    this.birdAngle = -20;
  }

  // ─── Game flow ──────────────────────────────────────────────────────────────

  private startGame(): void {
    if (this.shuttingDown) return;
    this.gameState = 'playing';
    // Re-enable gravity on bird
    this.birdBody.setGravityY(1100);
    // Hide idle screen
    this.hideIdleScreen();
  }

  private retryGame(): void {
    if (this.shuttingDown) return;
    this.canRetry = false;
    this.hideGameoverScreen();
    this.resetGame();
    this.showIdleScreen();
  }

  private resetGame(): void {
    if (this.shuttingDown) return;
    this.gameState = 'idle';
    this.score = 0;
    this.scrollDistance = 0;
    this.lastPipeScroll = 0;
    this.pipeSpeed = BASE_SPEED;
    this.lastGapCenterY = 280;
    this.birdAngle = 0;

    // Clear pipes
    for (const pair of this.pipePairs) {
      pair.topPipe.destroy();
      pair.botPipe.destroy();
    }
    this.pipePairs = [];

    // Reset bird
    this.bird.setPosition(BIRD_X, H / 2);
    this.bird.angle = 0;
    this.bird.setAlpha(1);
    this.bird.setFillStyle(0xF5C842);
    this.birdBody.reset(BIRD_X, H / 2);
    this.birdBody.setVelocity(0, 0);
    this.birdBody.setGravityY(0);
    this.birdBody.allowGravity = true;

    eventBus.emit(EVENTS.FLAPPY_HUD_UPDATE, { score: 0, highScore: this.bestScore });

    // Kill any running tweens on bird/ui
    this.tweens.killTweensOf(this.bird);
  }

  // ─── Update loop ────────────────────────────────────────────────────────────

  private updatePlaying(delta: number): void {
    if (this.shuttingDown) return;
    // Input
    const spaceJustDown = Phaser.Input.Keyboard.JustDown(this.keySpace);
    if (spaceJustDown || this.pointerDown) {
      this.flap();
    }

    // Scroll pipes
    const pixelsMoved = this.pipeSpeed * delta / 1000;
    this.scrollDistance += pixelsMoved;

    // Spawn new pipe pair
    if (this.scrollDistance - this.lastPipeScroll >= PIPE_SPAWN_INTERVAL) {
      this.lastPipeScroll = this.scrollDistance;
      this.spawnPipePair();
    }

    // Move & cull pipes
    for (let i = this.pipePairs.length - 1; i >= 0; i--) {
      const pair = this.pipePairs[i];
      pair.x -= pixelsMoved;
      pair.topPipe.x = pair.x;
      pair.botPipe.x = pair.x;

      // Destroy off-screen
      if (pair.x < -60) {
        pair.topPipe.destroy();
        pair.botPipe.destroy();
        this.pipePairs.splice(i, 1);
        continue;
      }

      // Score detection: bird passed center of pipe
      if (!pair.scored && this.bird.x > pair.x) {
        pair.scored = true;
        this.incrementScore();
      }
    }

    // Rotate bird based on velocity
    this.rotateBirdByVelocity();

    // Ceiling / ground death
    if (this.bird.y < 0) {
      this.killBird();
      return;
    }
    if (this.bird.y > GROUND_Y - 12) {
      this.killBird();
      return;
    }

    // Pipe collision
    const birdCircle = new Phaser.Geom.Circle(this.bird.x, this.bird.y, 9);
    for (const pair of this.pipePairs) {
      const topRect = new Phaser.Geom.Rectangle(pair.x - 26, 0, PIPE_WIDTH, pair.gapTop);
      const botRect = new Phaser.Geom.Rectangle(pair.x - 26, pair.gapBottom, PIPE_WIDTH, H);
      if (
        Phaser.Geom.Intersects.CircleToRectangle(birdCircle, topRect) ||
        Phaser.Geom.Intersects.CircleToRectangle(birdCircle, botRect)
      ) {
        this.killBird();
        return;
      }
    }
  }

  private rotateBirdByVelocity(): void {
    if (this.gameState !== 'playing' && this.gameState !== 'dead') return;
    const vy = this.birdBody.velocity.y;
    // Map velocity: -400 → -20deg, +600 → +75deg
    const targetAngle = Phaser.Math.Clamp(vy * 0.1, -20, 75);
    this.birdAngle = Phaser.Math.Linear(this.birdAngle, targetAngle, 0.15);
    this.bird.angle = this.birdAngle;
  }

  // ─── Pipes ──────────────────────────────────────────────────────────────────

  private spawnPipePair(): void {
    if (this.shuttingDown) return;
    const currentGap = Math.max(MIN_GAP, BASE_GAP - Math.floor(this.score / 10) * 5);

    // Constrain gap center to not vary too much from last
    const minCenter = Math.max(GAP_Y_MIN + currentGap / 2, this.lastGapCenterY - MAX_GAP_VARIANCE);
    const maxCenter = Math.min(GAP_Y_MAX - currentGap / 2, this.lastGapCenterY + MAX_GAP_VARIANCE);
    const gapCenter = Phaser.Math.Between(Math.round(minCenter), Math.round(maxCenter));
    this.lastGapCenterY = gapCenter;

    const gapTop = gapCenter - currentGap / 2;
    const gapBottom = gapCenter + currentGap / 2;

    // Top pipe: covers 0 → gapTop
    const topH = gapTop;
    const topPipe = this.add.rectangle(
      W + PIPE_WIDTH / 2,
      topH / 2,
      PIPE_WIDTH,
      topH,
      COL_PIPE_FILL
    ).setDepth(5).setStrokeStyle(2, COL_GREEN_N);

    // Bottom pipe: covers gapBottom → H
    const botH = H - gapBottom;
    const botPipe = this.add.rectangle(
      W + PIPE_WIDTH / 2,
      gapBottom + botH / 2,
      PIPE_WIDTH,
      botH,
      COL_PIPE_FILL
    ).setDepth(5).setStrokeStyle(2, COL_GREEN_N);

    this.pipePairs.push({
      topPipe,
      botPipe,
      x: W + PIPE_WIDTH / 2,
      gapTop,
      gapBottom,
      scored: false,
    });
  }

  // ─── Score ──────────────────────────────────────────────────────────────────

  private incrementScore(): void {
    if (this.shuttingDown) return;
    this.score++;
    eventBus.emit(EVENTS.FLAPPY_HUD_UPDATE, { score: this.score, highScore: this.bestScore });

    // Speed up every 10 points
    if (this.score % 10 === 0) {
      this.pipeSpeed = Math.min(MAX_SPEED, BASE_SPEED + (Math.floor(this.score / 10) * 10));
    }

    // Floating "+1" text
    const label = this.add.text(this.bird.x + 20, this.bird.y, '+1', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COL_GOLD,
    }).setDepth(50);

    this.tweens.add({
      targets: label,
      y: label.y - 40,
      alpha: 0,
      duration: 400,
      ease: 'Power1',
      onComplete: () => {
        if (label.active) label.destroy();
      },
    });
  }

  // ─── Death ──────────────────────────────────────────────────────────────────

  private killBird(): void {
    if (this.gameState === 'dead' || this.gameState === 'gameover' || this.shuttingDown) return;
    this.gameState = 'dead';

    // Disable gravity / freeze horizontal
    this.birdBody.setGravityY(0);
    this.birdBody.setVelocityX(0);
    // Let vertical velocity remain so bird falls

    // Screen flash
    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 1).setDepth(200);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 50,
      onComplete: () => {
        if (flash.active) flash.destroy();
      },
    });

    // Camera shake
    this.cameras.main.shake(200, 0.01);

    // Rotate bird to +90 and let it fall
    this.birdBody.setGravityY(1100);
    this.tweens.add({
      targets: this.bird,
      angle: 90,
      duration: 200,
      ease: 'Power2',
    });

    // After 500ms → game over
    this.time.delayedCall(500, () => {
      if (!this.isSceneAlive()) return;
      this.gameState = 'gameover';
      this.birdBody.setVelocity(0, 0);
      this.birdBody.setGravityY(0);

      const isNewBest = this.score > this.bestScore;
      if (isNewBest) {
        this.bestScore = this.score;
        localStorage.setItem(this.BEST_KEY, String(this.bestScore));
      }

      const tenksBase = calcTenks(this.score);
      const tenksBonus = isNewBest ? 100 : 0;
      const tenksTotal = tenksBase + tenksBonus;
      addTenks(tenksTotal, `flappy_waspi_score_${this.score}`);
      eventBus.emit(EVENTS.UI_NOTICE, `+${tenksTotal} TENKS — Flappy Waspi`);
      eventBus.emit(EVENTS.FLAPPY_GAME_OVER, { score: this.score, highScore: this.bestScore });

      this.showGameoverScreen(isNewBest, tenksTotal);
    });
  }

  // ─── UI: Score display ───────────────────────────────────────────────────────

  private buildUI(): void {
    this.idleGroup = this.add.group();
    this.gameoverGroup = this.add.group();
  }

  // ─── UI: Idle screen ────────────────────────────────────────────────────────

  private showIdleScreen(): void {
    if (this.shuttingDown) return;
    this.hideGameoverScreen();
    eventBus.emit(EVENTS.FLAPPY_HUD_UPDATE, { score: 0, highScore: this.bestScore });
  }

  private hideIdleScreen(): void {
    this.idleGroup.clear(true, true);
  }

  // ─── UI: Game over screen ────────────────────────────────────────────────────

  private showGameoverScreen(_isNewBest: boolean, _tenksTotal: number): void {
    if (!this.isSceneAlive()) return;
    this.hideIdleScreen();

    // Retry button
    const retryBg = this.add.rectangle(W / 2, 390, 160, 36, 0x1a3a1a)
      .setStrokeStyle(2, COL_GREEN_N)
      .setDepth(110)
      .setInteractive({ useHandCursor: true });

    const retryText = this.add.text(W / 2, 390, 'RETRY', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COL_GREEN,
    }).setOrigin(0.5).setDepth(111).setInteractive({ useHandCursor: true });

    // Exit button
    const exitBg = this.add.rectangle(W / 2, 440, 160, 36, 0x2a2a2a)
      .setStrokeStyle(2, 0x888888)
      .setDepth(110)
      .setInteractive({ useHandCursor: true });

    const exitText = this.add.text(W / 2, 440, 'EXIT', {
      fontSize: '12px',
      fontFamily: FONT,
      color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(111).setInteractive({ useHandCursor: true });

    // Retry logic (with 500ms lock)
    this.time.delayedCall(500, () => {
      if (!this.isSceneAlive()) return;
      this.canRetry = true;
    });

    const doRetry = () => {
      if (!this.canRetry) return;
      this.retryGame();
    };

    const doExit = () => {
      if (this.inTransition || this.shuttingDown) return;
      this.inTransition = true;
      this.input.enabled = false;
      if (this.input.keyboard) this.input.keyboard.enabled = false;
      transitionToScene(this, 'ArcadeInterior', {});
    };

    retryBg.on('pointerdown', doRetry);
    retryText.on('pointerdown', doRetry);
    exitBg.on('pointerdown', doExit);
    exitText.on('pointerdown', doExit);

    // SPACE key to retry (after lock)
    const spaceHandler = () => {
      if (this.gameState !== 'gameover') return;
      if (!this.canRetry) return;
      doRetry();
    };

    this.keySpace.on('down', spaceHandler);

    this.gameoverGroup.addMultiple([retryBg, retryText, exitBg, exitText]);
  }

  private hideGameoverScreen(): void {
    this.canRetry = false;
    this.gameoverGroup.clear(true, true);
    this.keySpace?.removeAllListeners('down');
  }

  private handleShutdown(): void {
    this.shuttingDown = true;
    this.inTransition = true;
    this.canRetry = false;
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.input.off('pointerdown');
    this.keySpace?.removeAllListeners('down');
    eventBus.emit(EVENTS.FLAPPY_SCENE_ACTIVE, false);
  }

  private isSceneAlive(): boolean {
    return !this.shuttingDown && this.scene.isActive('FlappyWaspiScene');
  }
}
