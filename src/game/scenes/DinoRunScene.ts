import Phaser from 'phaser';
import { announceScene, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { addTenks } from '../systems/TenksSystem';

type GameState = 'idle' | 'playing' | 'dead' | 'gameover';

interface PooledObstacle {
  obj: Phaser.GameObjects.Rectangle;
  hitbox: Phaser.Geom.Rectangle;
  type: 'ground' | 'aerial';
  active: boolean;
}

type ObstacleVariant = 'small' | 'medium' | 'tall' | 'group';

const GROUND_Y = 480;
const RUNNER_X = 140;
const BASE_SPEED = 300;
const MAX_SPEED = 900;
const SPEED_INCREMENT = 15;
const POOL_SIZE = 10;
const MIN_GAP = 300;

export default class DinoRunScene extends Phaser.Scene {
  private runner!: Phaser.GameObjects.Rectangle;
  private runnerBody!: Phaser.Physics.Arcade.Body;
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;

  private gameState: GameState = 'idle';
  private isOnGround: boolean = true;
  private isDucking: boolean = false;

  private gameSpeed: number = BASE_SPEED;
  private distanceTraveled: number = 0;
  private score: number = 0;
  private bestScore: number = 0;
  private easter404Used: boolean = false;
  private inTransition: boolean = false;

  private obstaclePool: PooledObstacle[] = [];
  private lastObstacleX: number = 0;
  private spawnTimer: number = 0;
  private spawnCooldown: number = 1000;

  private scoreText!: Phaser.GameObjects.Text;
  private hiScoreText!: Phaser.GameObjects.Text;
  private idleText!: Phaser.GameObjects.Text;
  private gameOverContainer!: Phaser.GameObjects.Container;
  private gameOverText!: Phaser.GameObjects.Text;
  private gameOverScoreText!: Phaser.GameObjects.Text;
  private newRecordText!: Phaser.GameObjects.Text;
  private tenksText!: Phaser.GameObjects.Text;
  private retryText!: Phaser.GameObjects.Text;
  private exitBtn!: Phaser.GameObjects.Rectangle;
  private exitBtnText!: Phaser.GameObjects.Text;
  private blinkTimer!: Phaser.Time.TimerEvent;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;

  private dashOffset: number = 0;
  private groundDashGraphics!: Phaser.GameObjects.Graphics;
  private milestoneFlashActive: boolean = false;

  private tenksEarned: number = 0;

  constructor() {
    super({ key: 'DinoRunScene', physics: { arcade: { gravity: { x: 0, y: 0 }, debug: false } } });
  }

  init(): void {
    this.gameState = 'idle';
    this.isOnGround = true;
    this.isDucking = false;
    this.gameSpeed = BASE_SPEED;
    this.distanceTraveled = 0;
    this.score = 0;
    this.easter404Used = false;
    this.inTransition = false;
    this.spawnTimer = 0;
    this.spawnCooldown = 1000;
    this.lastObstacleX = 0;
    this.tenksEarned = 0;
    this.bestScore = parseInt(localStorage.getItem('waspi_dino_best') ?? '0');
  }

  create(): void {
    this.inTransition = false;
    this.input.enabled = true;
    announceScene(this);

    this.bestScore = parseInt(localStorage.getItem('waspi_dino_best') ?? '0');

    this.createBackground();
    this.createGround();
    this.createRunner();
    this.createObstaclePool();
    this.createUI();
    this.createInputs();

    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.inTransition = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
      this.resetGame();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupScene();
    });

    this.scale.on('resize', this.handleResize, this);
  }

  private createBackground(): void {
    this.backgroundGraphics = this.add.graphics();
    this.drawBackground();
  }

  private drawBackground(): void {
    const g = this.backgroundGraphics;
    g.clear();

    // Dark sky
    g.fillStyle(0x0e0e14);
    g.fillRect(0, 0, 800, 600);

    // Building silhouettes
    const buildings = [
      { x: 50, w: 80, h: 100 },
      { x: 160, w: 60, h: 140 },
      { x: 250, w: 100, h: 80 },
      { x: 390, w: 70, h: 120 },
      { x: 500, w: 90, h: 90 },
      { x: 620, w: 55, h: 150 },
      { x: 700, w: 80, h: 110 },
    ];
    g.fillStyle(0x111122);
    for (const b of buildings) {
      g.fillRect(b.x, GROUND_Y - b.h, b.w, b.h);
    }

    // Stars
    g.fillStyle(0xffffff);
    const starPositions = [
      [30, 40], [90, 80], [150, 30], [220, 60], [310, 20], [400, 55],
      [470, 35], [540, 70], [610, 25], [680, 60], [750, 40], [800, 80],
      [60, 120], [180, 100], [340, 130], [450, 90], [580, 115], [720, 95],
      [20, 200], [110, 180], [260, 220], [380, 170], [510, 210], [650, 185],
      [770, 200], [135, 250], [300, 280], [480, 260], [630, 300], [760, 270],
    ];
    for (const [sx, sy] of starPositions) {
      g.fillCircle(sx, sy, 1);
    }
    g.setAlpha(0.4);

    // WASPI neon sign
    const waspiText = this.add.text(600, 360, 'WASPI', {
      fontFamily: '"Press Start 2P"',
      fontSize: '32px',
      color: '#F5C842',
    }).setAlpha(0.08).setOrigin(0.5);
    // Add tint to background
    waspiText.setDepth(1);
  }

  private createGround(): void {
    this.groundGraphics = this.add.graphics();
    this.groundDashGraphics = this.add.graphics();
    this.drawGroundLine();
  }

  private drawGroundLine(): void {
    this.groundGraphics.clear();
    this.groundGraphics.lineStyle(2, 0x39ff14);
    this.groundGraphics.beginPath();
    this.groundGraphics.moveTo(0, GROUND_Y);
    this.groundGraphics.lineTo(800, GROUND_Y);
    this.groundGraphics.strokePath();
    this.groundGraphics.setDepth(2);
  }

  private updateGroundDashes(delta: number): void {
    this.dashOffset = (this.dashOffset + (this.gameSpeed * delta / 1000)) % 40;
    const g = this.groundDashGraphics;
    g.clear();
    g.lineStyle(1, 0x39ff14, 0.3);
    let startX = -(this.dashOffset % 40);
    while (startX < 800) {
      g.beginPath();
      g.moveTo(startX, GROUND_Y + 4);
      g.lineTo(startX + 20, GROUND_Y + 4);
      g.strokePath();
      startX += 40;
    }
    g.setDepth(2);
  }

  private createRunner(): void {
    this.runner = this.add.rectangle(RUNNER_X, GROUND_Y - 16, 24, 32, 0x39ff14);
    this.runner.setDepth(5);
    this.physics.add.existing(this.runner);
    this.runnerBody = this.runner.body as Phaser.Physics.Arcade.Body;
    this.runnerBody.setGravityY(1800);
    this.runnerBody.setAllowGravity(true);
    this.runnerBody.setCollideWorldBounds(false);
  }

  private createObstaclePool(): void {
    this.obstaclePool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const obj = this.add.rectangle(-100, -100, 24, 32, 0xff006e);
      obj.setVisible(false);
      obj.setDepth(4);
      this.obstaclePool.push({
        obj,
        hitbox: new Phaser.Geom.Rectangle(-100, -100, 16, 24),
        type: 'ground',
        active: false,
      });
    }
  }

  private getObstacle(): PooledObstacle | null {
    for (const obs of this.obstaclePool) {
      if (!obs.active) return obs;
    }
    return null;
  }

  private returnObstacle(obs: PooledObstacle): void {
    obs.obj.setVisible(false);
    obs.obj.setPosition(-100, -100);
    obs.hitbox.setPosition(-100, -100);
    obs.active = false;
  }

  private spawnObstacle(): void {
    const obs = this.getObstacle();
    if (!obs) return;

    const useAerial = this.score >= 200 && Math.random() < 0.25;

    if (useAerial) {
      obs.type = 'aerial';
      const altitudes: number[] = [GROUND_Y - 64, GROUND_Y - 128];
      const altitude = altitudes[Math.floor(Math.random() * altitudes.length)];
      obs.obj.setSize(28, 16);
      obs.obj.setFillStyle(0xff006e);
      obs.obj.setPosition(820, altitude);
      obs.obj.setVisible(true);
      obs.hitbox.setTo(820 - 11, altitude - 5, 22, 10);
    } else {
      obs.type = 'ground';
      const variant = this.pickObstacleVariant();
      const { w, h, color } = this.getVariantDimensions(variant);
      obs.obj.setSize(w, h);
      obs.obj.setFillStyle(color);
      const obsY = GROUND_Y - h / 2;
      obs.obj.setPosition(820, obsY);
      obs.obj.setVisible(true);
      obs.hitbox.setTo(820 - (w / 2 - 4), obsY - (h / 2 - 4), w - 8, h - 8);
    }

    obs.active = true;
    this.lastObstacleX = 820;
  }

  private pickObstacleVariant(): ObstacleVariant {
    const r = Math.random();
    if (r < 0.4) return 'small';
    if (r < 0.7) return 'medium';
    if (r < 0.9) return 'tall';
    return 'group';
  }

  private getVariantDimensions(variant: ObstacleVariant): { w: number; h: number; color: number } {
    switch (variant) {
      case 'small': return { w: 24, h: 32, color: 0xff006e };
      case 'medium': return { w: 48, h: 32, color: 0xff006e };
      case 'tall': return { w: 24, h: 48, color: 0xb026ff };
      case 'group': return { w: 72, h: 32, color: 0xb026ff };
    }
  }

  private createUI(): void {
    // Score display top right
    this.hiScoreText = this.add.text(780, 16, `HI ${String(this.bestScore).padStart(5, '0')}`, {
      fontFamily: '"Press Start 2P"',
      fontSize: '10px',
      color: '#888888',
    }).setOrigin(1, 0).setDepth(10);

    this.scoreText = this.add.text(780, 32, String(this.score).padStart(5, '0'), {
      fontFamily: '"Press Start 2P"',
      fontSize: '10px',
      color: '#ffffff',
    }).setOrigin(1, 0).setDepth(10);

    // Idle screen text
    this.idleText = this.add.text(400, 300, 'PRESS SPACE TO RUN', {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#F5C842',
    }).setOrigin(0.5).setDepth(10);

    this.blinkTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.gameState === 'idle' || this.gameState === 'gameover') {
          this.idleText.setVisible(!this.idleText.visible);
        }
      },
    });

    // Game over container (hidden initially)
    this.gameOverContainer = this.add.container(400, 260).setDepth(20).setVisible(false);

    const goBackground = this.add.rectangle(0, 0, 480, 260, 0x0e0e14, 0.92);
    goBackground.setStrokeStyle(2, 0xff006e);

    this.gameOverText = this.add.text(0, -100, 'GAME OVER', {
      fontFamily: '"Press Start 2P"',
      fontSize: '22px',
      color: '#FF006E',
    }).setOrigin(0.5);

    this.gameOverScoreText = this.add.text(0, -55, '00000', {
      fontFamily: '"Press Start 2P"',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.newRecordText = this.add.text(0, -15, 'NEW RECORD!', {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#F5C842',
    }).setOrigin(0.5).setVisible(false);

    this.tenksText = this.add.text(0, 20, '+0 TENKS', {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#46B3FF',
    }).setOrigin(0.5);

    this.retryText = this.add.text(0, 70, 'PRESS SPACE TO RETRY', {
      fontFamily: '"Press Start 2P"',
      fontSize: '9px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.exitBtn = this.add.rectangle(0, 105, 140, 30, 0x1a1a2e).setInteractive({ useHandCursor: true });
    this.exitBtn.setStrokeStyle(2, 0xf5c842);
    this.exitBtnText = this.add.text(0, 105, 'EXIT', {
      fontFamily: '"Press Start 2P"',
      fontSize: '10px',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.exitBtn.on('pointerover', () => this.exitBtn.setFillStyle(0x2a2a3e));
    this.exitBtn.on('pointerout', () => this.exitBtn.setFillStyle(0x1a1a2e));
    this.exitBtn.on('pointerdown', () => this.exitScene());

    this.gameOverContainer.add([
      goBackground,
      this.gameOverText,
      this.gameOverScoreText,
      this.newRecordText,
      this.tenksText,
      this.retryText,
      this.exitBtn,
      this.exitBtnText,
    ]);
  }

  private createInputs(): void {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    // Touch input
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.gameState === 'idle') {
        this.startGame();
        return;
      }
      if (this.gameState === 'gameover') return;
      if (this.gameState === 'playing') {
        this.triggerJump();
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      if (this.gameState === 'playing' && pointer.velocity.y > 100) {
        this.triggerDuck();
      }
    });
  }

  private triggerJump(): void {
    if (!this.isOnGround) return;
    this.runnerBody.setVelocityY(-550);
    this.isOnGround = false;
    if (this.isDucking) this.standUp();
    console.log('SFX: jump');
  }

  private triggerDuck(): void {
    if (!this.isOnGround) {
      // Fast fall in air
      this.runnerBody.setGravityY(4500);
      return;
    }
    if (this.isDucking) return;
    this.isDucking = true;
    this.runner.setSize(32, 16);
    this.runner.setY(GROUND_Y - 8);
  }

  private standUp(): void {
    if (!this.isDucking) return;
    this.isDucking = false;
    this.runner.setSize(24, 32);
    this.runner.setY(GROUND_Y - 16);
  }

  private startGame(): void {
    this.gameState = 'playing';
    this.idleText.setVisible(false);
    this.spawnTimer = 0;
    this.spawnCooldown = 1000;
    this.triggerJump();
  }

  update(time: number, delta: number): void {
    if (this.gameState === 'idle') {
      this.handleIdleInput();
      return;
    }
    if (this.gameState === 'dead' || this.gameState === 'gameover') return;
    if (this.gameState !== 'playing') return;

    this.handleInput();
    this.updateRunner(delta);
    this.updateObstacles(delta);
    this.updateScore(delta);
    this.updateGroundDashes(delta);
    this.checkCollisions();
  }

  private handleIdleInput(): void {
    if (
      Phaser.Input.Keyboard.JustDown(this.keySpace) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keyW)
    ) {
      this.startGame();
    }
  }

  private handleInput(): void {
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.keySpace) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keyW);

    const duckPressed =
      this.cursors.down.isDown || this.keyS.isDown;

    if (jumpPressed) {
      this.triggerJump();
    }

    if (duckPressed) {
      this.triggerDuck();
    } else if (!duckPressed && this.isDucking && this.isOnGround) {
      this.standUp();
    }
  }

  private updateRunner(delta: number): void {
    // Landing detection
    if (!this.isOnGround && this.runnerBody.velocity.y >= 0) {
      const landingY = this.isDucking ? GROUND_Y - 8 : GROUND_Y - 16;
      if (this.runner.y >= landingY) {
        this.runner.setY(landingY);
        this.runnerBody.setVelocityY(0);
        this.runnerBody.setGravityY(1800);
        this.isOnGround = true;
        console.log('SFX: land');
      }
    }
  }

  private updateObstacles(delta: number): void {
    // Spawn logic
    this.spawnTimer += delta;
    if (this.spawnTimer >= this.spawnCooldown && this.gameState === 'playing') {
      const minGap = this.gameSpeed > 600 ? 200 : MIN_GAP;
      const rightmostX = this.getRightmostObstacleX();
      if (rightmostX < 800 - minGap) {
        this.spawnObstacle();
        this.spawnTimer = 0;
        // Vary next cooldown based on speed
        const baseInterval = Math.max(600, 1200 - this.gameSpeed);
        this.spawnCooldown = baseInterval + Math.random() * 400;
      }
    }

    // Move obstacles
    for (const obs of this.obstaclePool) {
      if (!obs.active) continue;
      const moveAmount = this.gameSpeed * delta / 1000;
      obs.obj.x -= moveAmount;
      obs.hitbox.x -= moveAmount;

      // Return off-screen obstacles
      if (obs.obj.x < -100) {
        this.returnObstacle(obs);
      }
    }
  }

  private getRightmostObstacleX(): number {
    let max = 0;
    for (const obs of this.obstaclePool) {
      if (obs.active && obs.obj.x > max) max = obs.obj.x;
    }
    return max;
  }

  private updateScore(delta: number): void {
    this.distanceTraveled += this.gameSpeed * delta / 1000;
    const newScore = Math.floor(this.distanceTraveled / 10);
    const prevScore = this.score;
    this.score = newScore;

    // Update speed
    this.gameSpeed = Math.min(MAX_SPEED, BASE_SPEED + Math.floor(this.score / 100) * SPEED_INCREMENT);

    // Milestone flash every 100 points
    const prevMilestone = Math.floor(prevScore / 100);
    const newMilestone = Math.floor(this.score / 100);
    if (newMilestone > prevMilestone && !this.milestoneFlashActive) {
      this.milestoneFlash();
      console.log('SFX: milestone_100');
    }

    // 404 easter egg
    if (this.score === 404 && !this.easter404Used) {
      this.easter404Used = true;
      console.log('SFX: easter_egg_404');
      this.show404Easter();
    }

    // Update score display
    this.scoreText.setText(String(this.score).padStart(5, '0'));
    if (this.score > this.bestScore) {
      this.hiScoreText.setText(`HI ${String(this.score).padStart(5, '0')}`);
    }
  }

  private milestoneFlash(): void {
    this.milestoneFlashActive = true;
    this.cameras.main.flash(80, 255, 255, 255, true);
    window.setTimeout(() => {
      if (!this.scene?.isActive('DinoRunScene')) return;
      this.milestoneFlashActive = false;
    }, 200);
  }

  private show404Easter(): void {
    const floatText = this.add.text(400, 320, '404 BONUS!', {
      fontFamily: '"Press Start 2P"',
      fontSize: '18px',
      color: '#F5C842',
    }).setOrigin(0.5).setDepth(15);

    this.tweens.add({
      targets: floatText,
      y: 220,
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => { if (floatText.active) floatText.destroy(); },
    });
  }

  private checkCollisions(): void {
    const runnerHitbox = this.isDucking
      ? new Phaser.Geom.Rectangle(this.runner.x - 12, this.runner.y - 12, 24, 12)
      : new Phaser.Geom.Rectangle(this.runner.x - 10, this.runner.y - 28, 20, 28);

    for (const obs of this.obstaclePool) {
      if (!obs.active) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(runnerHitbox, obs.hitbox)) {
        this.killRunner();
        return;
      }
    }
  }

  private killRunner(): void {
    if (this.gameState === 'dead' || this.gameState === 'gameover') return;
    this.gameState = 'dead';
    console.log('SFX: death_dino');

    // Stop runner physics
    this.runnerBody.setVelocityY(0);
    this.runnerBody.setGravityY(0);

    // Camera shake
    this.cameras.main.shake(80, 0.008);

    // Flicker animation
    this.tweens.add({
      targets: this.runner,
      alpha: { from: 1, to: 0.3 },
      duration: 80,
      yoyo: true,
      repeat: 2,
      ease: 'Linear',
    });

    // Transition to gameover after 500ms
    window.setTimeout(() => {
      if (!this.scene?.isActive('DinoRunScene')) return;
      this.showGameOver();
    }, 500);
  }

  private calculateTenks(): number {
    let tenks = 0;
    if (this.score >= 1000) tenks = 500;
    else if (this.score >= 500) tenks = 300;
    else if (this.score >= 300) tenks = 150;
    else if (this.score >= 100) tenks = 75;
    else tenks = 25;

    if (this.score > this.bestScore) tenks += 100;
    if (this.easter404Used) tenks += 404;

    return tenks;
  }

  private showGameOver(): void {
    if (!this.scene?.isActive('DinoRunScene')) return;

    this.gameState = 'gameover';
    this.tenksEarned = this.calculateTenks();

    const isNewBest = this.score > this.bestScore;
    if (isNewBest) {
      this.bestScore = this.score;
      localStorage.setItem('waspi_dino_best', String(this.bestScore));
      this.hiScoreText.setText(`HI ${String(this.bestScore).padStart(5, '0')}`);
    }

    addTenks(this.tenksEarned, 'dino_run_score');
    eventBus.emit(EVENTS.UI_NOTICE, `+${this.tenksEarned} TENKS earned!`);

    // Setup game over screen
    this.gameOverScoreText.setText(String(this.score).padStart(5, '0'));
    this.newRecordText.setVisible(isNewBest);
    this.tenksText.setText(`+${this.tenksEarned} TENKS`);
    this.gameOverContainer.setVisible(true);

    // Count-up animation for TENKS
    let displayed = 0;
    const target = this.tenksEarned;
    const countUp = this.time.addEvent({
      delay: 30,
      repeat: 30,
      callback: () => {
        if (!this.tenksText.active) {
          countUp.destroy();
          return;
        }
        displayed = Math.min(target, displayed + Math.ceil(target / 30));
        this.tenksText.setText(`+${displayed} TENKS`);
      },
    });

    // Idle/retry prompt text
    this.idleText.setText('PRESS SPACE TO RETRY').setVisible(true);

    // Space to retry
    if (this.input.keyboard) {
      const retryFn = () => {
        if (this.gameState !== 'gameover') return;
        if (this.input.keyboard) {
          this.input.keyboard.off('keydown-SPACE', retryFn);
        }
        this.resetGame();
        this.startGame();
      };
      this.input.keyboard.on('keydown-SPACE', retryFn);
    }
  }

  resetGame(): void {
    // Return all obstacles
    for (const obs of this.obstaclePool) {
      this.returnObstacle(obs);
    }

    // Reset runner
    this.runner.setAlpha(1);
    this.runner.setSize(24, 32);
    this.runner.setPosition(RUNNER_X, GROUND_Y - 16);
    this.runnerBody.setVelocityY(0);
    this.runnerBody.setVelocityX(0);
    this.runnerBody.setGravityY(1800);

    // Reset game state
    this.gameState = 'idle';
    this.isOnGround = true;
    this.isDucking = false;
    this.gameSpeed = BASE_SPEED;
    this.distanceTraveled = 0;
    this.score = 0;
    this.easter404Used = false;
    this.spawnTimer = 0;
    this.spawnCooldown = 1000;
    this.milestoneFlashActive = false;
    this.tenksEarned = 0;

    // Reset UI
    this.scoreText.setText('00000');
    this.hiScoreText.setText(`HI ${String(this.bestScore).padStart(5, '0')}`);
    this.gameOverContainer.setVisible(false);
    this.idleText.setText('PRESS SPACE TO RUN').setVisible(true);
    this.dashOffset = 0;
  }

  private exitScene(): void {
    if (this.inTransition) return;
    this.inTransition = true;
    transitionToScene(this, 'ArcadeInterior', {});
  }

  private handleResize(): void {
    // No-op: canvas is fixed 800x600
  }

  private cleanupScene(): void {
    this.scale.off('resize', this.handleResize, this);
    if (this.blinkTimer) this.blinkTimer.destroy();
  }
}
