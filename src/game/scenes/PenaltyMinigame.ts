import Phaser from 'phaser';
import { addTenks } from '../systems/TenksSystem';
import { announceScene, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { SceneControls } from '../systems/SceneControls';

type PenaltyPhase = 'aiming' | 'shooting' | 'result' | 'done' | 'exiting';

export class PenaltyMinigame extends Phaser.Scene {
  private readonly maxShots = 5;
  private isFinished = false;
  private goals = 0;
  private shotsTaken = 0;
  private phase: PenaltyPhase = 'aiming';
  private aimX = 0;
  private aimDir = 1;
  private goalieTargetX = 0;
  private resultTimerMs = 0;
  private doneTimerMs = 0;
  private resultText = '';
  private resultColor = '#FFFFFF';

  private readonly goalW = 360;
  private readonly goalH = 150;
  private goalX = 0;
  private goalY = 0;
  private ballStartX = 0;
  private ballStartY = 0;

  private countdownActive = false;

  private goalie!: Phaser.GameObjects.Container;
  private ball!: Phaser.GameObjects.Arc;
  private aimMarker!: Phaser.GameObjects.Arc;
  private aimGuide!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private footer!: Phaser.GameObjects.Text;
  private resultLabel!: Phaser.GameObjects.Text;
  private summaryLabel!: Phaser.GameObjects.Text;
  private shotsBar!: Phaser.GameObjects.Graphics;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private controls!: SceneControls;

  constructor() {
    super({ key: 'PenaltyMinigame' });
  }

  private resetSceneState() {
    this.isFinished = false;
    this.countdownActive = false;
    this.goals = 0;
    this.shotsTaken = 0;
    this.phase = 'aiming';
    this.aimX = 0;
    this.aimDir = 1;
    this.goalieTargetX = 0;
    this.resultTimerMs = 0;
    this.doneTimerMs = 0;
    this.resultText = '';
    this.resultColor = '#FFFFFF';
  }

  create() {
    const { width, height } = this.scale;
    this.resetSceneState();
    this.input.enabled = true;
    this.controls = new SceneControls(this);
    announceScene(this);

    this.goalX = width / 2;
    this.goalY = 188;
    this.ballStartX = width / 2;
    this.ballStartY = height - 110;
    this.goalieTargetX = this.goalX;
    this.aimX = this.goalX;

    this.cameras.main.setBackgroundColor('#08111a');

    const g = this.add.graphics();
    g.fillGradientStyle(0x102d12, 0x102d12, 0x061408, 0x061408, 1);
    g.fillRect(0, 0, width, height);

    g.fillStyle(0x153d18, 0.95);
    g.fillRect(70, this.goalY - 20, width - 140, height - (this.goalY - 20) - 60);

    g.lineStyle(2, 0xffffff, 0.1);
    g.strokeCircle(width / 2, height - 72, 44);
    g.beginPath();
    g.moveTo(width / 2 - 100, height - 58);
    g.lineTo(width / 2 + 100, height - 58);
    g.strokePath();

    g.lineStyle(4, 0xffffff, 0.8);
    g.strokeRect(this.goalX - this.goalW / 2, this.goalY - this.goalH / 2, this.goalW, this.goalH);

    g.fillStyle(0x000000, 0.24);
    g.fillRect(this.goalX - this.goalW / 2, this.goalY - this.goalH / 2, this.goalW, this.goalH);

    g.lineStyle(1, 0xffffff, 0.14);
    for (let i = 1; i < 7; i++) {
      const x = this.goalX - this.goalW / 2 + (this.goalW * i) / 7;
      g.lineBetween(x, this.goalY - this.goalH / 2, x, this.goalY + this.goalH / 2);
    }
    for (let i = 1; i < 5; i++) {
      const y = this.goalY - this.goalH / 2 + (this.goalH * i) / 5;
      g.lineBetween(this.goalX - this.goalW / 2, y, this.goalX + this.goalW / 2, y);
    }

    this.add.text(width / 2, 56, 'PENALES', {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(width / 2, 88, 'MATA EL TIMING. 3 GOLES = PREMIO.', {
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

    this.footer = this.add.text(width / 2, height - 30, 'SPACE O CLICK PARA PATEAR - ESC SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#777777',
      align: 'center',
    }).setOrigin(0.5);

    this.aimGuide = this.add.graphics();
    this.aimMarker = this.add.circle(this.goalX, this.goalY - 18, 7, 0xF5C842, 1);
    this.aimMarker.setStrokeStyle(2, 0x000000, 0.3);

    this.goalie = this.add.container(this.goalX, this.goalY - 10);
    const body = this.add.rectangle(0, 10, 34, 28, 0xD94444, 1);
    const head = this.add.circle(0, -10, 9, 0xF5D6B8, 1);
    const gloveL = this.add.rectangle(-18, 8, 8, 8, 0xFFD2AA, 1);
    const gloveR = this.add.rectangle(18, 8, 8, 8, 0xFFD2AA, 1);
    this.goalie.add([body, head, gloveL, gloveR]);

    this.ball = this.add.circle(this.ballStartX, this.ballStartY, 10, 0xFFFFFF, 1);
    this.ball.setStrokeStyle(2, 0x111111, 0.45);

    this.resultLabel = this.add.text(width / 2, 352, '', {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    this.summaryLabel = this.add.text(width / 2, 356, '', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      align: 'center',
      lineSpacing: 8,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    // Shot progress bar (shows remaining shots as dots/pips)
    this.shotsBar = this.add.graphics().setDepth(200).setScrollFactor(0);
    this.drawShotsBar();

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.input.on('pointerdown', this.handleShootInput, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.refreshHud();
    this.redrawAimGuide();
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(220, 0, 0, 0);
    this.runCountdown();
  }

  private drawShotsBar() {
    this.shotsBar.clear();
    const cx = this.scale.width / 2;
    const y = this.scale.height - 14;
    const pipW = 18;
    const pipH = 8;
    const gap = 6;
    const total = this.maxShots;
    const startX = cx - ((pipW + gap) * total - gap) / 2;
    for (let i = 0; i < total; i++) {
      const px = startX + i * (pipW + gap);
      const taken = i < this.shotsTaken;
      const isGoal = taken && i < this.goals;
      if (taken) {
        this.shotsBar.fillStyle(isGoal ? 0x39FF14 : 0xFF006E, 1);
      } else {
        this.shotsBar.fillStyle(0x333344, 1);
      }
      this.shotsBar.fillRoundedRect(px, y - pipH / 2, pipW, pipH, 3);
      this.shotsBar.lineStyle(1, 0x666688, 0.7);
      this.shotsBar.strokeRoundedRect(px, y - pipH / 2, pipW, pipH, 3);
    }
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
      this.finishAndExit(false);
      return;
    }

    if (this.controls.isActionJustDown('interact')) {
      this.handleShootInput();
    }

    this.updateGoalieIdle();

    if (this.phase === 'aiming') {
      this.updateAim(delta);
      return;
    }

    if (this.phase === 'result') {
      this.resultTimerMs -= delta;
      if (this.resultTimerMs <= 0) {
        if (this.shotsTaken >= this.maxShots) {
          this.showFinalSummary();
        } else {
          this.resetForNextShot();
        }
      }
      return;
    }

    if (this.phase === 'done') {
      this.doneTimerMs -= delta;
      if (this.doneTimerMs <= 0) {
        this.finishAndExit(this.goals >= 3);
      }
    }
  }

  private updateGoalieIdle() {
    if (this.phase === 'shooting' || this.phase === 'exiting') return;
    this.goalie.x = this.goalX + Math.sin(this.time.now * 0.004) * 30;
    this.goalie.y = this.goalY - 10 + Math.sin(this.time.now * 0.008) * 3;
  }

  private updateAim(delta: number) {
    const leftBound = this.goalX - this.goalW / 2 + 28;
    const rightBound = this.goalX + this.goalW / 2 - 28;
    this.aimX += this.aimDir * (delta * 0.22);

    if (this.aimX >= rightBound) {
      this.aimX = rightBound;
      this.aimDir = -1;
    }
    if (this.aimX <= leftBound) {
      this.aimX = leftBound;
      this.aimDir = 1;
    }

    this.aimMarker.setPosition(this.aimX, this.goalY - 18);
    this.redrawAimGuide();
  }

  private redrawAimGuide() {
    this.aimGuide.clear();
    this.aimGuide.lineStyle(2, 0xF5C842, 0.75);
    this.aimGuide.strokeCircle(this.aimX, this.goalY - 18, 7);
    this.aimGuide.lineStyle(1, 0xF5C842, 0.35);

    const segments = 16;
    for (let i = 0; i < segments; i++) {
      if (i % 2 === 1) continue;
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const x0 = Phaser.Math.Linear(this.aimX, this.ball.x, t0);
      const y0 = Phaser.Math.Linear(this.goalY - 8, this.ball.y, t0);
      const x1 = Phaser.Math.Linear(this.aimX, this.ball.x, t1);
      const y1 = Phaser.Math.Linear(this.goalY - 8, this.ball.y, t1);
      this.aimGuide.lineBetween(x0, y0, x1, y1);
    }
  }

  private handleShootInput() {
    if (this.phase !== 'aiming' || this.isFinished) return;
    this.takeShot();
  }

  private takeShot() {
    this.phase = 'shooting';
    this.resultLabel.setAlpha(0);
    this.summaryLabel.setAlpha(0);

    const shotTargetX = this.aimX + Phaser.Math.Between(-18, 18);
    const shotTargetY = Phaser.Math.Between(this.goalY - this.goalH / 2 + 22, this.goalY + this.goalH / 2 - 22);
    const diveX = this.goalX + Phaser.Math.Between(-100, 100);

    this.tweens.add({
      targets: this.goalie,
      x: diveX,
      y: shotTargetY + 4,
      angle: Phaser.Math.Between(-18, 18),
      duration: 260,
      ease: 'Sine.easeOut',
    });

    this.tweens.add({
      targets: this.ball,
      x: shotTargetX,
      y: shotTargetY,
      scaleX: 0.72,
      scaleY: 0.72,
      duration: 280,
      ease: 'Sine.easeOut',
      onComplete: () => {
        const inGoal =
          shotTargetX > this.goalX - this.goalW / 2 + 8 &&
          shotTargetX < this.goalX + this.goalW / 2 - 8 &&
          shotTargetY > this.goalY - this.goalH / 2 + 6 &&
          shotTargetY < this.goalY + this.goalH / 2 - 6;
        const saved = Phaser.Math.Distance.Between(shotTargetX, shotTargetY, this.goalie.x, this.goalie.y) < 42;
        this.resolveShot(inGoal && !saved, inGoal, saved);
      },
    });
  }

  private resolveShot(isGoal: boolean, inGoal: boolean, saved: boolean) {
    this.shotsTaken += 1;
    if (isGoal) this.goals += 1;
    this.refreshHud();
    this.drawShotsBar();

    if (isGoal) {
      this.resultText = 'GOL!';
      this.resultColor = '#39FF14';
      this.spawnConfetti();
      this.showFloatingLabel('GOLAZO!', '#39FF14');
    } else if (!inGoal) {
      this.resultText = 'AFUERA!';
      this.resultColor = '#FF6B6B';
    } else if (saved) {
      this.resultText = 'ATAJADA!';
      this.resultColor = '#FF6B6B';
    } else {
      this.resultText = 'CASI!';
      this.resultColor = '#F5C842';
    }

    this.resultLabel.setText(this.resultText);
    this.resultLabel.setColor(this.resultColor);
    this.resultLabel.setAlpha(1);
    this.resultLabel.setY(352);

    this.tweens.add({
      targets: this.resultLabel,
      y: 338,
      alpha: { from: 1, to: 0.15 },
      duration: 700,
      ease: 'Sine.easeOut',
    });

    this.phase = 'result';
    this.resultTimerMs = 700;
  }

  private spawnConfetti() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const confettiColors = [0xF5C842, 0x39FF14, 0xFF006E, 0x46B3FF, 0xFFFFFF, 0xFF8B3D];
    const count = Phaser.Math.Between(8, 12);

    for (let i = 0; i < count; i++) {
      const color = confettiColors[i % confettiColors.length];
      const circle = this.add.circle(cx, cy, Phaser.Math.Between(4, 8), color, 1)
        .setDepth(13500)
        .setScrollFactor(0);

      const angle = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3);
      const dist = Phaser.Math.Between(80, 160);
      const targetX = cx + Math.cos(angle) * dist;
      const targetY = cy + Math.sin(angle) * dist;

      this.tweens.add({
        targets: circle,
        x: targetX,
        y: targetY,
        alpha: { from: 1, to: 0 },
        scaleX: { from: 1, to: 0.2 },
        scaleY: { from: 1, to: 0.2 },
        duration: Phaser.Math.Between(500, 800),
        ease: 'Sine.easeOut',
        onComplete: () => circle.destroy(),
      });
    }
  }

  private showFloatingLabel(text: string, color: string) {
    const cx = this.scale.width / 2;
    const label = this.add.text(cx, 310, text, {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setDepth(13000).setScrollFactor(0);

    this.tweens.add({
      targets: label,
      alpha: 1,
      y: 290,
      duration: 180,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.time.delayedCall(240, () => {
          this.tweens.add({
            targets: label,
            alpha: 0,
            y: 270,
            duration: 420,
            ease: 'Sine.easeIn',
            onComplete: () => label.destroy(),
          });
        });
      },
    });
  }

  private resetForNextShot() {
    this.phase = 'aiming';
    this.ball.setPosition(this.ballStartX, this.ballStartY);
    this.ball.setScale(1);
    this.goalie.setPosition(this.goalX, this.goalY - 10);
    this.goalie.setAngle(0);
    this.aimX = this.goalX;
    this.aimDir = Phaser.Math.RND.pick([-1, 1]);
    this.redrawAimGuide();
  }

  private showFinalSummary() {
    this.phase = 'done';
    const won = this.goals >= 3;
    if (won) {
      addTenks(300, 'penalty_win');
    }

    this.summaryLabel.setText([
      'RESULTADO FINAL',
      `${this.goals} / ${this.maxShots}`,
      won ? 'PREMIO DESBLOQUEADO' : 'SEGUI INTENTANDO',
    ]);
    this.summaryLabel.setColor(won ? '#39FF14' : '#F5C842');
    this.summaryLabel.setAlpha(1);
    this.doneTimerMs = 1700;
    this.footer.setText(won ? 'PREMIO GUARDANDO...' : 'VOLVIENDO AL ARCADE...');
    this.footer.setColor(won ? '#39FF14' : '#888888');
  }

  private refreshHud() {
    const remaining = this.maxShots - this.shotsTaken;
    this.hud.setText([
      `GOLES ${this.goals}`,
      `TIROS ${this.shotsTaken}/${this.maxShots}`,
      `RESTAN ${remaining}`,
    ]);
  }

  private finishAndExit(won: boolean) {
    if (this.isFinished) return;
    this.isFinished = true;
    this.phase = 'exiting';

    eventBus.emit(EVENTS.PENALTY_RESULT, {
      won,
      goals: this.goals,
      shots: this.shotsTaken,
    });

    transitionToScene(this, 'ArcadeInterior', {
      penaltyCooldownMs: 1200,
      penaltyReward: {
        won,
        goals: this.goals,
        shots: this.shotsTaken,
      },
    });
  }

  private handleShutdown() {
    this.input.off('pointerdown', this.handleShootInput, this);
  }
}
