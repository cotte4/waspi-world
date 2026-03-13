import Phaser from 'phaser';
import { addTenks } from '../systems/TenksSystem';

export class PenaltyMinigame extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Rectangle;
  private marker!: Phaser.GameObjects.Rectangle;
  private dir = 1;
  private speed = 220;
  private isFinished = false;

  constructor() {
    super({ key: 'PenaltyMinigame' });
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor('#05050A');

    this.add.text(width / 2, height / 2 - 120, 'PENALES', {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 100, 'SPACE PARA PATEAR\nESC PARA SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#777777',
      align: 'center',
    }).setOrigin(0.5);

    const barWidth = 320;
    const barY = height / 2 + 10;

    this.add.rectangle(width / 2, barY, barWidth, 10, 0x222233);

    // Sweet spot
    const sweetW = 80;
    this.add.rectangle(width / 2, barY, sweetW, 14)
      .setStrokeStyle(2, 0x39FF14, 0.9);

    // Moving marker
    this.marker = this.add.rectangle(width / 2 - barWidth / 2, barY, 6, 22, 0xF5C842);

    this.input.keyboard!.on('keydown-SPACE', () => {
      if (this.isFinished) return;
      this.handleShot(width / 2, sweetW);
    });

    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.isFinished) return;
      this.end(false, 'ESCAPED');
    });

    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    if (this.isFinished) return;
    const { width } = this.scale;
    const barWidth = 320;
    const left = width / 2 - barWidth / 2;
    const right = width / 2 + barWidth / 2;

    this.marker.x += (this.speed * this.dir * delta) / 1000;
    if (this.marker.x <= left) {
      this.marker.x = left;
      this.dir = 1;
    } else if (this.marker.x >= right) {
      this.marker.x = right;
      this.dir = -1;
    }
  }

  private handleShot(centerX: number, sweetW: number) {
    const dx = Math.abs(this.marker.x - centerX);
    const halfSweet = sweetW / 2;

    const isGoal = dx <= halfSweet;
    this.end(isGoal, isGoal ? '+300 TENKS' : 'ATAJADO');
  }

  private end(success: boolean, message: string) {
    this.isFinished = true;

    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2 - 40, message, {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: success ? '#39FF14' : '#FF4444',
    }).setOrigin(0.5);

    if (success) {
      addTenks(300, 'penalty_win');
    }

    this.time.delayedCall(1200, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('ArcadeInterior');
      });
    });
  }
}

