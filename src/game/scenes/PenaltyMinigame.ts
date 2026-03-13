import Phaser from 'phaser';
import { addTenks } from '../systems/TenksSystem';
import { announceScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';

export class PenaltyMinigame extends Phaser.Scene {
  private isFinished = false;
  private shotsLeft = 5;
  private goals = 0;

  private aimX = 0;
  private aimDir = 1;
  private aimSpeed = 1.35;

  private power = 0;
  private powerDir = 1;
  private powerSpeed = 1.8;

  private phase: 'aim' | 'power' | 'anim' | 'done' = 'aim';

  private goalie!: Phaser.GameObjects.Rectangle;
  private ball!: Phaser.GameObjects.Arc;
  private aimMarker!: Phaser.GameObjects.Rectangle;
  private powerMarker!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Text;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'PenaltyMinigame' });
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);

    this.cameras.main.setBackgroundColor('#05050A');

    this.add.text(width / 2, 70, 'PENALES', {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(width / 2, 110, 'AIM + POWER - 5 TIROS', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#888888',
    }).setOrigin(0.5);

    this.add.text(width / 2, height - 40, 'SPACE CONFIRMAR - ESC SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#777777',
      align: 'center',
    }).setOrigin(0.5);

    const goalW = 420;
    const goalH = 170;
    const goalX = width / 2;
    const goalY = 200;

    const g = this.add.graphics();
    g.lineStyle(3, 0xDDDDDD, 0.65);
    g.strokeRect(goalX - goalW / 2, goalY - goalH / 2, goalW, goalH);
    g.lineStyle(1, 0xDDDDDD, 0.25);
    for (let i = 1; i < 7; i++) {
      const x = goalX - goalW / 2 + (goalW * i) / 7;
      g.lineBetween(x, goalY - goalH / 2, x, goalY + goalH / 2);
    }
    for (let i = 1; i < 4; i++) {
      const y = goalY - goalH / 2 + (goalH * i) / 4;
      g.lineBetween(goalX - goalW / 2, y, goalX + goalW / 2, y);
    }

    this.goalie = this.add.rectangle(goalX, goalY + 30, 36, 18, 0x88AAFF, 1);

    this.ball = this.add.circle(goalX, height - 120, 10, 0xFFFFFF, 1);
    this.ball.setStrokeStyle(2, 0x111111, 0.5);

    this.hud = this.add.text(14, 14, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFFFFF',
    });
    this.refreshHud();

    const aimBarY = goalY + goalH / 2 + 40;
    this.add.rectangle(goalX, aimBarY, goalW, 10, 0x222233);
    this.aimMarker = this.add.rectangle(goalX - goalW / 2, aimBarY, 6, 22, 0xF5C842);

    const powerBarX = goalX + goalW / 2 + 70;
    const powerBarH = 180;
    this.add.rectangle(powerBarX, goalY + 10, 10, powerBarH, 0x222233);
    this.powerMarker = this.add.rectangle(powerBarX, goalY + powerBarH / 2, 22, 6, 0x39FF14);

    this.add.text(goalX, aimBarY - 20, 'AIM', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(0.5);
    this.add.text(powerBarX, goalY - powerBarH / 2 - 18, 'PWR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(0.5);

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    if (this.isFinished) return;

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.finishAndExit(false);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.handleSpace(this.scale.width / 2, 200, 420, 170);
    }

    if (this.phase !== 'done') {
      this.goalie.x += (Math.sin(this.time.now / 420) * 0.35) * (delta / 16.6) * 5;
      this.goalie.x = Phaser.Math.Clamp(this.goalie.x, 220, this.scale.width - 220);
    }

    if (this.phase === 'aim') {
      this.aimX += (this.aimDir * this.aimSpeed * delta) / 1000;
      if (this.aimX >= 1) {
        this.aimX = 1;
        this.aimDir = -1;
      }
      if (this.aimX <= -1) {
        this.aimX = -1;
        this.aimDir = 1;
      }
      const goalX = this.scale.width / 2;
      const aimBarY = 200 + 170 / 2 + 40;
      this.aimMarker.setPosition(goalX + this.aimX * (420 / 2), aimBarY);
    } else if (this.phase === 'power') {
      this.power += (this.powerDir * this.powerSpeed * delta) / 1000;
      if (this.power >= 1) {
        this.power = 1;
        this.powerDir = -1;
      }
      if (this.power <= 0) {
        this.power = 0;
        this.powerDir = 1;
      }
      const goalX = this.scale.width / 2;
      const powerBarX = goalX + 420 / 2 + 70;
      const top = 200 + 10 - 180 / 2;
      const y = top + (1 - this.power) * 180;
      this.powerMarker.setPosition(powerBarX, y);
    }
  }

  private handleSpace(goalX: number, goalY: number, goalW: number, goalH: number) {
    if (this.phase === 'aim') {
      this.phase = 'power';
      return;
    }
    if (this.phase === 'power') {
      this.phase = 'anim';
      this.takeShot(goalX, goalY, goalW, goalH);
    }
  }

  private takeShot(goalX: number, goalY: number, goalW: number, goalH: number) {
    const tx = goalX + this.aimX * (goalW / 2 - 30);
    const ty = goalY + goalH / 2 - (this.power * (goalH - 20));

    const dive = Phaser.Math.RND.pick([-1, 0, 1]);
    const goalieTargetX = goalX + dive * (goalW / 4);
    const goalieTargetY = goalY + Phaser.Math.Between(20, 80);

    this.tweens.add({
      targets: this.goalie,
      x: goalieTargetX,
      y: goalieTargetY,
      duration: 260,
      ease: 'Sine.easeOut',
      yoyo: true,
    });

    const dist = Phaser.Math.Distance.Between(tx, ty, goalieTargetX, goalieTargetY);
    const saved = dist < 60;

    const startX = this.ball.x;
    const startY = this.ball.y;
    this.tweens.add({
      targets: this.ball,
      x: tx,
      y: ty,
      duration: 320,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.onShotResult(!saved);
        this.ball.setPosition(startX, startY);
      },
    });
  }

  private onShotResult(isGoal: boolean) {
    this.shotsLeft -= 1;
    if (isGoal) this.goals += 1;
    this.refreshHud();

    const { width } = this.scale;
    const msg = isGoal ? 'GOL' : 'ATAJADO';
    const text = this.add.text(width / 2, 420, msg, {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: isGoal ? '#39FF14' : '#FF4444',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: text,
      alpha: { from: 1, to: 0 },
      y: 400,
      duration: 650,
      onComplete: () => text.destroy(),
    });

    if (this.shotsLeft <= 0) {
      this.phase = 'done';
      const won = this.goals >= 3;
      if (won) addTenks(300, 'penalty_win');
      this.time.delayedCall(900, () => this.finishAndExit(won));
      return;
    }

    this.phase = 'aim';
  }

  private refreshHud() {
    this.hud.setText(`TIROS ${this.shotsLeft}  -  GOLES ${this.goals}`);
  }

  private finishAndExit(won: boolean) {
    eventBus.emit(EVENTS.PENALTY_RESULT, {
      won,
      goals: this.goals,
      shots: 5 - this.shotsLeft,
    });
    this.isFinished = true;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('ArcadeInterior', {
        penaltyReward: {
          won,
          goals: this.goals,
        },
      });
    });
  }
}
