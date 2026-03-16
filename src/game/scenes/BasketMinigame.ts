import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { initTenks } from '../systems/TenksSystem';
import { announceScene, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { supabase, isConfigured } from '../../lib/supabase';
import { calculateBasketReward, calculateBasketShotReward } from '../../lib/basketRewards';
import { SceneControls } from '../systems/SceneControls';

type BasketPhase = 'aiming' | 'flying' | 'result' | 'done' | 'exiting';

const ROUND_MS = 30000;
const SHOT_COOLDOWN_MS = 420;

export class BasketMinigame extends Phaser.Scene {
  private phase: BasketPhase = 'aiming';
  private isFinished = false;
  private roundTimerMs = ROUND_MS;
  private resultTimerMs = 0;
  private cooldownMs = 0;
  private score = 0;
  private shotsTaken = 0;
  private streak = 0;
  private currentPower = 0.5;
  private powerDir = 1;
  private currentAngle = -88;
  private angleDir = 1;
  private hoopOffset = 0;
  private hoopDir = 1;
  private lastResult = '';
  private lastResultColor = '#FFFFFF';
  private grantedRewardTenks = 0;
  private rewardPending = false;
  private rewardResolved = false;
  private rewardStatus: 'granted' | 'pending' | 'local' = 'local';
  private rewardRunId = '';
  private rewardRunPromise: Promise<void> | null = null;

  private countdownActive = false;

  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private hud!: Phaser.GameObjects.Text;
  private footer!: Phaser.GameObjects.Text;
  private resultLabel!: Phaser.GameObjects.Text;
  private powerBar!: Phaser.GameObjects.Rectangle;
  private angleNeedle!: Phaser.GameObjects.Line;
  private arcGuide!: Phaser.GameObjects.Graphics;
  private hoop!: Phaser.GameObjects.Container;
  private hoopRim!: Phaser.GameObjects.Rectangle;
  private hoopNet!: Phaser.GameObjects.Graphics;
  private hoopBoard!: Phaser.GameObjects.Rectangle;
  private ball!: Phaser.GameObjects.Arc;
  private shadow!: Phaser.GameObjects.Ellipse;
  private scoreText!: Phaser.GameObjects.Text;
  private timerBarBg!: Phaser.GameObjects.Rectangle;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private controls!: SceneControls;
  private shooterAvatar?: AvatarRenderer;

  private hoopBaseX = 0;
  private readonly hoopY = 212;
  private ballStartX = 0;
  private ballStartY = 0;
  private shooterX = 0;
  private shooterY = 0;

  constructor() {
    super({ key: 'BasketMinigame' });
  }

  private resetSceneState() {
    this.phase = 'aiming';
    this.isFinished = false;
    this.countdownActive = false;
    this.roundTimerMs = ROUND_MS;
    this.resultTimerMs = 0;
    this.cooldownMs = 0;
    this.score = 0;
    this.shotsTaken = 0;
    this.streak = 0;
    this.currentPower = 0.5;
    this.powerDir = 1;
    this.currentAngle = -88;
    this.angleDir = 1;
    this.hoopOffset = 0;
    this.hoopDir = 1;
    this.lastResult = '';
    this.lastResultColor = '#FFFFFF';
    this.grantedRewardTenks = 0;
    this.rewardPending = false;
    this.rewardResolved = false;
    this.rewardStatus = 'local';
    this.rewardRunId = '';
    this.rewardRunPromise = null;
  }

  create() {
    const { width, height } = this.scale;
    this.resetSceneState();
    this.input.enabled = true;
    this.controls = new SceneControls(this);
    announceScene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    const hoopBaseX = width / 2 + 150;
    this.hoopBaseX = hoopBaseX;
    this.shooterX = width / 2 - 206;
    this.shooterY = height - 106;
    this.ballStartX = this.shooterX + 14;
    this.ballStartY = this.shooterY - 8;

    this.cameras.main.setBackgroundColor('#0d1020');

    const g = this.add.graphics();
    g.fillGradientStyle(0x16203f, 0x16203f, 0x0a0d18, 0x0a0d18, 1);
    g.fillRect(0, 0, width, height);

    g.fillStyle(0x4f2a14, 1);
    g.fillRect(0, height - 160, width, 160);
    g.fillStyle(0x6f3d1f, 0.45);
    for (let i = 0; i < 10; i++) {
      g.fillRect(i * 80, height - 160, 4, 160);
    }

    g.lineStyle(4, 0xf3d49b, 0.38);
    g.strokeCircle(width / 2 - 60, height - 60, 58);
    g.lineBetween(width / 2 - 60, height - 118, width / 2 - 60, height - 2);

    this.add.text(width / 2, 54, 'BASKET', {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(width / 2, 86, 'CALIBRA ANGULO Y POTENCIA. EMBOCA PARA GANAR TENKS.', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#A0A0B4',
    }).setOrigin(0.5);

    this.hud = this.add.text(18, 18, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFFFFF',
      lineSpacing: 6,
    });

    this.footer = this.add.text(width / 2, height - 28, 'SPACE O CLICK PARA TIRAR - ESC SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#777777',
    }).setOrigin(0.5);

    this.add.text(120, 136, 'POTENCIA', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#bbbbbb',
    }).setOrigin(0.5);
    this.add.rectangle(120, 166, 120, 16, 0x121212, 1).setStrokeStyle(1, 0x4a4a4a, 1);
    this.powerBar = this.add.rectangle(62, 166, 0, 10, 0x39ff14, 1).setOrigin(0, 0.5);

    this.add.text(120, 210, 'ANGULO', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#bbbbbb',
    }).setOrigin(0.5);
    this.add.circle(120, 255, 34, 0x0d0d17, 1).setStrokeStyle(1, 0x4a4a4a, 1);
    this.angleNeedle = this.add.line(120, 255, 0, 0, 0, -28, 0x46b3ff, 1)
      .setLineWidth(4, 4)
      .setOrigin(0.5, 1);

    this.arcGuide = this.add.graphics();

    this.hoop = this.add.container(hoopBaseX, this.hoopY);
    this.hoopBoard = this.add.rectangle(34, -62, 14, 88, 0xdbe7ff, 1).setStrokeStyle(2, 0x0d1530, 1);
    this.hoopRim = this.add.rectangle(0, 0, 74, 7, 0xff6b00, 1).setStrokeStyle(2, 0x000000, 0.35);
    this.hoopNet = this.add.graphics();
    this.redrawNet(0);
    this.hoop.add([this.hoopBoard, this.hoopRim, this.hoopNet]);

    this.shooterAvatar = new AvatarRenderer(this, this.shooterX, this.shooterY, loadStoredAvatarConfig());
    this.shooterAvatar.setDepth(50);

    this.shadow = this.add.ellipse(this.ballStartX, this.ballStartY + 16, 26, 10, 0x000000, 0.28);
    this.ball = this.add.circle(this.ballStartX, this.ballStartY, 11, 0xf2872f, 1).setStrokeStyle(2, 0x5b2e0a, 1);

    // Score text — larger with neon stroke
    this.scoreText = this.add.text(width - 16, 16, '', {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#46B3FF',
      strokeThickness: 3,
      align: 'right',
      lineSpacing: 8,
    }).setOrigin(1, 0);

    // Timer bar — below HUD
    const timerBarW = width - 36;
    this.timerBarBg = this.add.rectangle(18, height - 16, timerBarW, 8, 0x111111, 1)
      .setStrokeStyle(1, 0x333344, 1)
      .setOrigin(0, 0.5);
    this.timerBar = this.add.rectangle(18, height - 16, timerBarW, 8, 0x46B3FF, 1)
      .setOrigin(0, 0.5);

    this.resultLabel = this.add.text(width / 2, 334, '', {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.input.on('pointerdown', this.handleShootInput, this);
    this.refreshHud();
    this.refreshScorePanel();
    this.redrawAimGuide();
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(220, 0, 0, 0);
    void this.prepareRewardRun();
    this.runCountdown();
  }

  private runCountdown() {
    this.countdownActive = true;
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const steps = ['3', '2', '1', 'GO!'];
    const colors = ['#F5C842', '#F5C842', '#39FF14', '#46B3FF'];
    let idx = 0;

    const showNext = () => {
      if (idx >= steps.length) {
        this.countdownActive = false;
        return;
      }
      const label = this.add.text(cx, cy, steps[idx], {
        fontSize: idx === steps.length - 1 ? '28px' : '36px',
        fontFamily: '"Press Start 2P", monospace',
        color: colors[idx],
        stroke: '#000000',
        strokeThickness: 5,
      }).setOrigin(0.5).setAlpha(0).setDepth(14000).setScrollFactor(0);

      this.tweens.add({
        targets: label,
        alpha: { from: 0, to: 1 },
        scaleX: { from: 1.6, to: 1 },
        scaleY: { from: 1.6, to: 1 },
        duration: 180,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.time.delayedCall(idx === steps.length - 1 ? 320 : 600, () => {
            this.tweens.add({
              targets: label,
              alpha: 0,
              scaleX: 0.7,
              scaleY: 0.7,
              duration: 180,
              ease: 'Sine.easeIn',
              onComplete: () => {
                label.destroy();
                idx += 1;
                showNext();
              },
            });
          });
        },
      });
    };

    showNext();
  }

  update(_time: number, delta: number) {
    if (this.isFinished) return;
    if (this.countdownActive) return;

    if (this.controls.isActionJustDown('back')) {
      this.finishAndExit();
      return;
    }

    if (this.phase !== 'done' && this.phase !== 'exiting') {
      this.roundTimerMs = Math.max(0, this.roundTimerMs - delta);
      // Update timer bar width
      const timerBarW = this.scale.width - 36;
      this.timerBar.width = timerBarW * (this.roundTimerMs / ROUND_MS);
      // Color shifts red as time runs low
      const pct = this.roundTimerMs / ROUND_MS;
      if (pct < 0.25) {
        this.timerBar.fillColor = 0xFF006E;
      } else if (pct < 0.5) {
        this.timerBar.fillColor = 0xF5C842;
      } else {
        this.timerBar.fillColor = 0x46B3FF;
      }
      if (this.roundTimerMs === 0 && this.phase !== 'flying' && this.phase !== 'result') {
        this.enterDoneState();
        return;
      }
    }

    if (this.controls.isActionJustDown('interact')) {
      this.handleShootInput();
    }

    this.cooldownMs = Math.max(0, this.cooldownMs - delta);
    if (this.phase !== 'flying') {
      this.updateHoopMotion(delta);
    }

    if (this.phase === 'aiming') {
      this.updateMeters(delta);
      this.redrawAimGuide();
      return;
    }

    if (this.phase === 'result') {
      this.resultTimerMs -= delta;
      if (this.resultTimerMs <= 0) {
        if (this.roundTimerMs <= 0) {
          this.enterDoneState();
        } else {
          this.resetForNextShot();
        }
      }
      return;
    }

    if (this.phase === 'done') {
      if (this.rewardPending) return;
      this.resultTimerMs -= delta;
      if (this.resultTimerMs <= 0) {
        this.finishAndExit();
      }
    }
  }

  private updateMeters(delta: number) {
    this.currentPower += this.powerDir * (delta * 0.00095);
    if (this.currentPower >= 1) {
      this.currentPower = 1;
      this.powerDir = -1;
    }
    if (this.currentPower <= 0.22) {
      this.currentPower = 0.22;
      this.powerDir = 1;
    }

    this.currentAngle += this.angleDir * (delta * 0.05);
    if (this.currentAngle >= -58) {
      this.currentAngle = -58;
      this.angleDir = -1;
    }
    if (this.currentAngle <= -128) {
      this.currentAngle = -128;
      this.angleDir = 1;
    }

    this.powerBar.width = 116 * this.currentPower;
    this.powerBar.fillColor = this.currentPower > 0.82 ? 0xff6b00 : this.currentPower > 0.55 ? 0xf5c842 : 0x39ff14;
    this.angleNeedle.setRotation(Phaser.Math.DegToRad(this.currentAngle + 90));
  }

  private updateHoopMotion(delta: number) {
    const swingRange = this.score >= 6 ? 84 : this.score >= 3 ? 58 : 36;
    this.hoopOffset += this.hoopDir * (delta * 0.06);
    if (this.hoopOffset >= swingRange) {
      this.hoopOffset = swingRange;
      this.hoopDir = -1;
    }
    if (this.hoopOffset <= -swingRange) {
      this.hoopOffset = -swingRange;
      this.hoopDir = 1;
    }
    this.hoop.setX(this.hoopBaseX + this.hoopOffset);
  }

  private redrawAimGuide() {
    this.arcGuide.clear();
    if (this.phase !== 'aiming') return;

    const start = new Phaser.Math.Vector2(this.ballStartX, this.ballStartY);
    const apex = new Phaser.Math.Vector2(
      Phaser.Math.Linear(this.ballStartX, this.hoop.x, 0.48),
      this.ballStartY - (140 + this.currentPower * 120),
    );
    const end = new Phaser.Math.Vector2(
      this.hoop.x + Phaser.Math.Clamp((this.currentAngle + 90) * 1.6, -52, 52),
      this.hoopY - 2,
    );

    this.arcGuide.lineStyle(2, 0x46b3ff, 0.58);
    for (let i = 0; i < 18; i++) {
      if (i % 2 === 1) continue;
      const t0 = i / 18;
      const t1 = (i + 1) / 18;
      const p0 = this.getQuadraticPoint(t0, start, apex, end);
      const p1 = this.getQuadraticPoint(t1, start, apex, end);
      this.arcGuide.lineBetween(p0.x, p0.y, p1.x, p1.y);
    }
  }

  private getQuadraticPoint(
    t: number,
    start: Phaser.Math.Vector2,
    control: Phaser.Math.Vector2,
    end: Phaser.Math.Vector2,
  ) {
    const inv = 1 - t;
    return new Phaser.Math.Vector2(
      inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
      inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
    );
  }

  private handleShootInput() {
    if (this.phase !== 'aiming' || this.cooldownMs > 0 || this.isFinished) return;
    this.takeShot();
  }

  private takeShot() {
    this.phase = 'flying';
    this.cooldownMs = SHOT_COOLDOWN_MS;
    this.shooterAvatar?.playShoot();
    this.shotsTaken += 1;
    this.refreshHud();
    this.resultLabel.setAlpha(0);
    this.arcGuide.clear();

    const rimX = this.hoop.x;
    const idealPower = Phaser.Math.Clamp(0.58 + (Math.abs(this.hoopOffset) / 220) * 0.2, 0.54, 0.84);
    const idealAngle = Phaser.Math.Clamp(-90 + (this.hoopOffset / 96) * 12, -112, -68);
    const powerError = Math.abs(this.currentPower - idealPower);
    const angleError = Math.abs(this.currentAngle - idealAngle);
    const pressure = Phaser.Math.Clamp(this.streak * 0.015, 0, 0.07);
    const makeWindow = 0.18 - pressure;
    const likelyMake = powerError < makeWindow && angleError < 12;
    const likelyRim = !likelyMake && powerError < makeWindow + 0.1 && angleError < 18;

    const endX = likelyMake
      ? rimX + Phaser.Math.Between(-7, 7)
      : rimX + Phaser.Math.Between(likelyRim ? -26 : -64, likelyRim ? 26 : 64);
    const endY = likelyMake
      ? this.hoopY + Phaser.Math.Between(34, 56)
      : this.hoopY + Phaser.Math.Between(8, 74);
    const apexY = this.ballStartY - (150 + this.currentPower * 170);

    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(this.ballStartX, this.ballStartY),
      new Phaser.Math.Vector2(Phaser.Math.Linear(this.ballStartX, endX, 0.48), apexY),
      new Phaser.Math.Vector2(endX, endY),
    );
    const follower = { t: 0 };

    this.tweens.add({
      targets: follower,
      t: 1,
      duration: 520,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const point = curve.getPoint(follower.t);
        this.ball.setPosition(point.x, point.y);
        this.ball.setScale(1 - follower.t * 0.28);
        this.shadow.setPosition(
          Phaser.Math.Linear(this.ballStartX, rimX, follower.t),
          this.ballStartY + 16 - follower.t * 8,
        );
        this.shadow.setScale(1 - follower.t * 0.18, 1 - follower.t * 0.18);
      },
      onComplete: () => {
        const outcome = this.evaluateShotOutcome(curve, rimX);
        this.resolveShot(outcome.isMake, outcome.isRim);
      },
    });
  }

  private evaluateShotOutcome(curve: Phaser.Curves.QuadraticBezier, rimX: number) {
    const samples = 42;
    const innerRimHalfWidth = 25;
    const rimHalfWidth = 36;
    let crossedFromAbove = false;
    let crossedInRimWindow = false;
    let nearRim = false;
    let prevPoint = curve.getPoint(0);
    let peakY = prevPoint.y;

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const point = curve.getPoint(t);
      const dy = point.y - prevPoint.y;
      const xWithinInnerRim = Math.abs(point.x - rimX) <= innerRimHalfWidth;
      const xNearRim = Math.abs(point.x - rimX) <= rimHalfWidth;
      const crossedHoopLine = prevPoint.y < this.hoopY && point.y >= this.hoopY;
      if (xNearRim) nearRim = true;
      if (crossedHoopLine && xWithinInnerRim && dy > 0) {
        crossedFromAbove = true;
      }
      if (crossedHoopLine && xNearRim) {
        crossedInRimWindow = true;
      }
      if (point.y < peakY) peakY = point.y;
      prevPoint = point;
    }

    const startedAboveRim = peakY < this.hoopY - 16;
    const isMake = crossedFromAbove && startedAboveRim;
    const isRim = !isMake && (crossedInRimWindow || nearRim);
    return { isMake, isRim };
  }

  private resolveShot(isMake: boolean, isRim: boolean) {
    if (isMake) {
      this.score += 1;
      this.streak += 1;
      const shotReward = calculateBasketShotReward(this.streak);
      this.grantedRewardTenks += shotReward;
      this.lastResult = this.streak >= 3 ? 'HEAT CHECK!' : 'SWISH!';
      this.lastResultColor = '#39FF14';
      this.animateNet(true);
      this.spawnScoreFlash();
      console.log('SFX: basket_score');
      // Score punch-scale animation
      this.tweens.add({
        targets: this.scoreText,
        scaleX: 1.4,
        scaleY: 1.4,
        duration: 80,
        ease: 'Sine.easeOut',
        yoyo: true,
        onComplete: () => {
          this.tweens.add({
            targets: this.scoreText,
            scaleX: 1,
            scaleY: 1,
            duration: 120,
            ease: 'Back.easeOut',
          });
        },
      });
      this.showFloatingLabel(`+${shotReward} TENKS`, '#F5C842');
    } else if (isRim) {
      this.streak = 0;
      this.lastResult = 'ARO!';
      this.lastResultColor = '#F5C842';
      this.animateNet(false);
    } else {
      this.streak = 0;
      this.lastResult = 'MISS!';
      this.lastResultColor = '#FF6B6B';
      this.animateNet(false);
    }

    this.refreshScorePanel();
    this.resultLabel.setText(this.lastResult);
    this.resultLabel.setColor(this.lastResultColor);
    this.resultLabel.setAlpha(1);
    this.resultLabel.setY(334);
    this.tweens.add({
      targets: this.resultLabel,
      y: 320,
      alpha: { from: 1, to: 0.2 },
      duration: 680,
      ease: 'Sine.easeOut',
    });

    this.phase = 'result';
    this.resultTimerMs = 460;
    this.refreshHud();
  }

  private spawnScoreFlash() {
    const flash = this.add.rectangle(this.hoop.x, this.hoopY + 10, 86, 66, 0xF5C842, 0.25)
      .setDepth(12000)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.3,
      duration: 180,
      ease: 'Sine.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  private showFloatingLabel(text: string, color: string) {
    const cx = this.scale.width / 2;
    const label = this.add.text(cx, 290, text, {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setDepth(13000).setScrollFactor(0);

    this.tweens.add({
      targets: label,
      alpha: 1,
      y: 270,
      duration: 180,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.time.delayedCall(240, () => {
          this.tweens.add({
            targets: label,
            alpha: 0,
            y: 250,
            duration: 380,
            ease: 'Sine.easeIn',
            onComplete: () => label.destroy(),
          });
        });
      },
    });
  }

  private animateNet(made: boolean) {
    this.redrawNet(made ? 8 : 3);
    this.tweens.addCounter({
      from: made ? 8 : 3,
      to: 0,
      duration: made ? 320 : 180,
      ease: 'Sine.easeOut',
      onUpdate: tween => {
        this.redrawNet(tween.getValue() ?? 0);
      },
    });
  }

  private redrawNet(drop: number) {
    this.hoopNet.clear();
    this.hoopNet.lineStyle(2, 0xdce6ff, 0.75);
    for (let i = -30; i <= 30; i += 15) {
      this.hoopNet.lineBetween(i, 2, i * 0.6, 32 + drop);
    }
    for (let y = 10; y <= 30; y += 10) {
      this.hoopNet.lineBetween(-28 + y * 0.12, y + drop * 0.35, 28 - y * 0.12, y + drop * 0.35);
    }
  }

  private resetForNextShot() {
    this.phase = 'aiming';
    this.ball.setPosition(this.ballStartX, this.ballStartY);
    this.ball.setScale(1);
    this.shadow.setPosition(this.ballStartX, this.ballStartY + 16);
    this.shadow.setScale(1, 1);
    this.currentPower = Phaser.Math.FloatBetween(0.28, 0.48);
    this.currentAngle = Phaser.Math.FloatBetween(-104, -78);
    this.redrawAimGuide();
  }

  private enterDoneState() {
    if (this.phase === 'done' || this.phase === 'exiting') return;
    this.phase = 'done';
    this.grantedRewardTenks = Math.max(this.grantedRewardTenks, calculateBasketReward(this.score));
    eventBus.emit(EVENTS.STATS_BASKET_GAME, {
      score: this.score,
      shots: this.shotsTaken,
      makes: this.score, // each scored basket = 1 make
    });
    this.resultLabel.setAlpha(1);
    this.resultLabel.setY(322);
    this.resultLabel.setText(this.grantedRewardTenks > 0 ? `+${this.grantedRewardTenks} TENKS` : 'SIN PREMIO');
    this.resultLabel.setColor(this.grantedRewardTenks > 0 ? '#39FF14' : '#F5C842');
    this.footer.setText(this.grantedRewardTenks > 0 ? 'GUARDANDO PREMIO...' : 'VOLVIENDO AL ARCADE...');
    this.footer.setColor(this.grantedRewardTenks > 0 ? '#46B3FF' : '#888888');
    this.rewardPending = this.grantedRewardTenks > 0;
    void this.resolveReward();
    this.resultTimerMs = 1650;
  }

  private refreshHud() {
    const remaining = Math.ceil(this.roundTimerMs / 1000);
    this.hud.setText([
      `TIEMPO ${remaining}s`,
      `TIROS ${this.shotsTaken}`,
      `PUNTAJE ${this.score}`,
    ]);
  }

  private refreshScorePanel() {
    this.scoreText.setText([
      `ANOTADOS ${this.score}`,
      `RACHA ${this.streak}`,
    ]);
  }

  private finishAndExit() {
    if (this.isFinished) return;
    if (this.rewardPending) return;
    this.isFinished = true;
    this.phase = 'exiting';
    transitionToScene(this, 'ArcadeInterior', {
      basketCooldownMs: 1200,
      basketReward: {
        score: this.score,
        shots: this.shotsTaken,
        tenksEarned: this.grantedRewardTenks,
        status: this.rewardStatus,
      },
    });
  }

  private async getAuthToken() {
    if (!supabase || !isConfigured) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  private async prepareRewardRun() {
    if (this.rewardRunId) return;
    if (this.rewardRunPromise) {
      await this.rewardRunPromise;
      return;
    }

    this.rewardRunPromise = (async () => {
      const token = await this.getAuthToken();
      if (!token) return;

      const res = await fetch('/api/minigames/basket/start', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => null);

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

  private async resolveReward() {
    if (this.rewardResolved) return;
    if (this.grantedRewardTenks <= 0) {
      this.rewardResolved = true;
      this.rewardPending = false;
      this.rewardStatus = 'granted';
      this.footer.setText('VOLVIENDO AL ARCADE...');
      this.footer.setColor('#888888');
      return;
    }

    const token = await this.getAuthToken();
    if (!token) {
      this.rewardStatus = 'pending';
      this.rewardResolved = true;
      this.rewardPending = false;
      this.grantedRewardTenks = 0;
      this.resultLabel.setText('PREMIO PENDIENTE');
      this.resultLabel.setColor('#FFB36A');
      this.footer.setText('INICIA SESION PARA ACREDITAR EL PREMIO.');
      this.footer.setColor('#FFB36A');
      return;
    }

    await this.prepareRewardRun();
    if (!this.rewardRunId) {
      this.rewardStatus = 'pending';
      this.rewardResolved = true;
      this.rewardPending = false;
      this.grantedRewardTenks = 0;
      this.resultLabel.setText('PREMIO PENDIENTE');
      this.resultLabel.setColor('#FFB36A');
      this.footer.setText('NO PUDIMOS RESERVAR LA PARTIDA. PROBA OTRA VEZ.');
      this.footer.setColor('#FFB36A');
      return;
    }

    const res = await fetch('/api/minigames/basket/reward', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        score: this.score,
        shots: this.shotsTaken,
        runId: this.rewardRunId,
      }),
    }).catch(() => null);

    if (!res?.ok) {
      this.rewardStatus = 'pending';
      this.rewardResolved = true;
      this.rewardPending = false;
      this.grantedRewardTenks = 0;
      this.resultLabel.setText('PREMIO PENDIENTE');
      this.resultLabel.setColor('#FFB36A');
      this.footer.setText('VOLVE A ENTRAR LUEGO. EL PREMIO NO SE CERRO.');
      this.footer.setColor('#FFB36A');
      return;
    }

    const json = await res.json().catch(() => null) as { tenksEarned?: number; player?: { tenks?: number } } | null;
    if (typeof json?.player?.tenks === 'number') {
      initTenks(json.player.tenks, { preferStored: false });
    }
    this.grantedRewardTenks = typeof json?.tenksEarned === 'number' ? json.tenksEarned : this.grantedRewardTenks;
    eventBus.emit(EVENTS.UI_NOTICE, `Basket +${this.grantedRewardTenks} TENKS`);
    this.rewardStatus = 'granted';
    this.rewardResolved = true;
    this.rewardPending = false;
    this.footer.setText('VOLVIENDO AL ARCADE CON PREMIO...');
    this.footer.setColor('#39FF14');
  }

  private handleShutdown() {
    this.input.off('pointerdown', this.handleShootInput, this);
    this.shooterAvatar?.destroy();
    this.shooterAvatar = undefined;
  }
}
