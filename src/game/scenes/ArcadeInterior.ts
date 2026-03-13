import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { COLORS, WORLD } from '../config/constants';
import { announceScene, createBackButton } from '../systems/SceneUi';

export class ArcadeInterior extends Phaser.Scene {
  private player!: AvatarRenderer;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private inTransition = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private px = 0;
  private py = 0;
  private penaltyMachineZone = new Phaser.Geom.Rectangle();
  private rewardMessage = '';
  private rewardColor = '#39FF14';

  constructor() {
    super({ key: 'ArcadeInterior' });
  }

  init(data: { penaltyReward?: { won?: boolean; goals?: number } } = {}) {
    if (data.penaltyReward?.won) {
      this.rewardMessage = `PREMIO LISTO � ${data.penaltyReward.goals ?? 0} GOLES`;
      this.rewardColor = '#39FF14';
      return;
    }
    if (typeof data.penaltyReward?.won === 'boolean') {
      this.rewardMessage = `PENALES � ${data.penaltyReward.goals ?? 0} GOLES`;
      this.rewardColor = '#F5C842';
      return;
    }
    this.rewardMessage = '';
    this.rewardColor = '#39FF14';
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);

    const g = this.add.graphics();
    g.fillStyle(0x050511);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    const roomW = 640;
    const roomH = 380;
    const roomX = (width - roomW) / 2;
    const roomY = (height - roomH) / 2;

    g.fillStyle(0x0f1022);
    g.fillRect(roomX, roomY, roomW, roomH);
    g.lineStyle(3, COLORS.NEON_PINK, 0.6);
    g.strokeRect(roomX, roomY, roomW, roomH);

    g.lineStyle(1, 0x18183a, 0.35);
    for (let x = roomX; x <= roomX + roomW; x += 28) {
      g.lineBetween(x, roomY + 120, x, roomY + roomH);
    }
    for (let y = roomY + 120; y <= roomY + roomH; y += 24) {
      g.lineBetween(roomX, y, roomX + roomW, y);
    }

    const machinePositions = [roomX + 80, roomX + 200, roomX + 320, roomX + 440, roomX + 560];
    machinePositions.forEach((mx, index) => {
      g.fillStyle(0x05051a);
      g.fillRect(mx - 22, roomY + 70, 44, 96);
      g.fillStyle(0x111144);
      g.fillRect(mx - 20, roomY + 76, 40, 32);
      g.fillStyle(index === 2 ? COLORS.GOLD : COLORS.NEON_BLUE, 0.82);
      g.fillRect(mx - 18, roomY + 80, 36, 24);
      g.fillStyle(0x191932);
      g.fillRect(mx - 20, roomY + 112, 40, 18);

      if (index === 2) {
        this.penaltyMachineZone = new Phaser.Geom.Rectangle(mx - 28, roomY + 62, 56, 108);
        this.add.text(mx, roomY + 52, 'PENALES', {
          fontSize: '7px',
          fontFamily: '"Press Start 2P", monospace',
          color: '#F5C842',
        }).setOrigin(0.5);
      }
    });

    const floor = this.add.rectangle(width / 2, roomY + roomH - 60, roomW - 60, 80, 0x060611, 0.95);
    floor.setStrokeStyle(2, 0x000000, 0.7);

    this.px = width / 2;
    this.py = roomY + roomH - 80;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(10);

    this.add.text(width / 2, roomY + 24, 'ARCADE', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF006E',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + 52, 'TOCA LA MAQUINA CENTRAL PARA JUGAR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);
    createBackButton(this, () => this.exitToWorld());

    this.add.text(width / 2, roomY + roomH + 24, 'TOCA LA MAQUINA � ESC SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(0.5);

    if (this.rewardMessage) {
      this.flashMessage(width / 2, roomY + roomH + 48, this.rewardMessage, this.rewardColor);
    }

    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update() {
    if (this.inTransition) return;
    this.handleMovement();
    this.tryStartPenalty();

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.exitToWorld();
    }
  }

  private exitToWorld() {
    if (this.inTransition) return;
    this.inTransition = true;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('WorldScene');
    });
  }

  private handleMovement() {
    const speed = 180 / 60;
    let dx = 0;
    let dy = 0;

    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const up = this.cursors.up.isDown || this.keyW.isDown;
    const down = this.cursors.down.isDown || this.keyS.isDown;

    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    const { width, height } = this.scale;
    const roomW = 640;
    const roomH = 380;
    const roomX = (width - roomW) / 2 + 20;
    const roomY = (height - roomH) / 2 + 20;

    this.px = Phaser.Math.Clamp(this.px + dx * speed * 16.6, roomX, roomX + roomW - 40);
    this.py = Phaser.Math.Clamp(this.py + dy * speed * 16.6, roomY + 40, roomY + roomH - 10);

    this.player.update(dx !== 0 || dy !== 0, dx);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
  }

  private tryStartPenalty() {
    if (!this.penaltyMachineZone.contains(this.px, this.py)) return;

    this.inTransition = true;
    this.flashMessage(this.scale.width / 2, this.scale.height / 2 + 40, 'ENTRANDO A PENALES', '#39FF14');
    this.time.delayedCall(180, () => {
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('PenaltyMinigame');
      });
    });
  }

  private flashMessage(x: number, y: number, message: string, color: string) {
    const text = this.add.text(x, y, message, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9999);

    this.tweens.add({
      targets: text,
      alpha: { from: 1, to: 0 },
      y: y - 8,
      duration: 1000,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
  }
}
