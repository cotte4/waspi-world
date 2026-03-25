import Phaser from 'phaser';
import { addTenks, applyTenksBalanceFromServer } from '../systems/TenksSystem';
import { eventBus, EVENTS } from '../config/eventBus';
import { announceScene, transitionToScene } from '../systems/SceneUi';
import { SceneControls } from '../systems/SceneControls';
import { getAuthHeaders } from '../systems/authHelper';

type DartsPhase = 'aiming' | 'result' | 'done' | 'exiting';

const TOTAL_DARTS = 9;
const BOARD_RADIUS = 160;

function createRunId() {
  return `darts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class DartsMinigame extends Phaser.Scene {
  private phase: DartsPhase = 'aiming';
  private shuttingDown = false;
  private score = 0;
  private thrown = 0;
  private bullseyes = 0;
  private cursorAngle = 0;
  private cursorRadius = 40;
  private cursorDir = 1;
  private resultTimerMs = 0;
  private isFinished = false;
  private currentRunId = createRunId();

  private boardX = 0;
  private boardY = 0;

  private boardG!: Phaser.GameObjects.Graphics;
  private cursor!: Phaser.GameObjects.Arc;
  private footer!: Phaser.GameObjects.Text;
  private resultLabel!: Phaser.GameObjects.Text;
  private rewardLabel!: Phaser.GameObjects.Text;
  private controls!: SceneControls;

  constructor() {
    super({ key: 'DartsMinigame' });
  }

  init() {
    this.shuttingDown = false;
    this.isFinished = false;
    this.phase = 'aiming';
    this.score = 0;
    this.thrown = 0;
    this.bullseyes = 0;
    this.currentRunId = createRunId();
  }

  create() {
    this.cameras.main.setBackgroundColor('#0E0E14');
    const { width, height } = this.scale;
    this.boardX = width / 2;
    this.boardY = height / 2 + 24;
    this.controls = new SceneControls(this);
    announceScene(this);
    this.input.enabled = true;
    eventBus.emit(EVENTS.DARTS_SCENE_ACTIVE, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.shuttingDown = false;
      this.isFinished = false;
      this.phase = 'aiming';
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });

    this.add.rectangle(0, 0, width, height, 0x0E0E14, 1).setOrigin(0);

    const wall = this.add.graphics();
    wall.lineStyle(1, 0x2a1a0a, 0.35);
    for (let wx = this.boardX - 220; wx < this.boardX + 220; wx += 12) {
      wall.lineBetween(wx, this.boardY - 200, wx, this.boardY + 200);
    }

    const boardGlow = this.add.graphics();
    boardGlow.fillStyle(0xf5c842, 0.06);
    boardGlow.fillCircle(this.boardX, this.boardY, 210);
    boardGlow.fillStyle(0x333340, 0.18);
    boardGlow.fillCircle(this.boardX, this.boardY, 175);

    this.add.text(width / 2, 48, 'DARDOS', {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.boardG = this.add.graphics();
    this.drawBoard();
    this.cursor = this.add.circle(this.boardX, this.boardY, 6, 0xF5C842, 1).setStrokeStyle(2, 0x000000, 0.45);
    this.footer = this.add.text(width / 2, height - 24, 'SPACE/CLICK TIRAR - ESC SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#7a7a94',
    }).setOrigin(0.5);
    this.resultLabel = this.add.text(width / 2, height - 74, '', {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setAlpha(0);

    this.rewardLabel = this.add.text(width / 2, height - 52, '', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
      shadow: { offsetX: 0, offsetY: 0, color: '#F5C842', blur: 8, fill: true },
    }).setOrigin(0.5).setAlpha(0);

    this.input.on('pointerdown', this.throwDart, this);
    this.refreshHud();
  }

  update(_time: number, delta: number) {
    if (this.isFinished || this.shuttingDown) return;
    if (this.controls.isActionJustDown('back')) {
      this.finishAndExit(0);
      return;
    }
    if (this.controls.isActionJustDown('interact')) {
      this.throwDart();
    }

    if (this.phase === 'aiming') {
      this.cursorAngle += delta * 0.0024 * this.cursorDir;
      this.cursorRadius += delta * 0.03 * this.cursorDir;
      if (this.cursorRadius > 146 || this.cursorRadius < 18) this.cursorDir *= -1;
      const wobble = Math.sin(this.time.now * 0.004) * 14;
      const x = this.boardX + Math.cos(this.cursorAngle) * (this.cursorRadius + wobble);
      const y = this.boardY + Math.sin(this.cursorAngle) * (this.cursorRadius - wobble * 0.6);
      this.cursor.setPosition(x, y);
      return;
    }

    this.resultTimerMs -= delta;
    if (this.resultTimerMs <= 0) {
      if (this.phase === 'done') {
        this.finishAndExit(this.computeReward());
      } else {
        this.phase = 'aiming';
        if (this.resultLabel.active) this.resultLabel.setAlpha(0);
        if (this.rewardLabel.active) this.rewardLabel.setAlpha(0);
      }
    }
  }

  private drawBoard() {
    this.boardG.clear();
    this.boardG.fillStyle(0x0f0f16, 1);
    this.boardG.fillCircle(this.boardX, this.boardY, BOARD_RADIUS);
    this.boardG.lineStyle(3, 0xF5C842, 0.9);
    this.boardG.strokeCircle(this.boardX, this.boardY, BOARD_RADIUS);

    for (let i = 0; i < 20; i += 1) {
      const a0 = -Math.PI / 2 + (i * Math.PI * 2) / 20;
      const a1 = -Math.PI / 2 + ((i + 1) * Math.PI * 2) / 20;
      const sectionColor = i % 2 === 0 ? 0x3a1818 : 0x182838;
      this.boardG.fillStyle(sectionColor, 1);
      this.boardG.slice(this.boardX, this.boardY, 140, a0, a1, false);
      this.boardG.fillPath();
      this.boardG.lineStyle(1, 0x111111, 0.65);
      this.boardG.lineBetween(this.boardX, this.boardY, this.boardX + Math.cos(a0) * 140, this.boardY + Math.sin(a0) * 140);

      const labelNum = ((i + 1) * 7) % 20 + 1;
      const tx = this.boardX + Math.cos((a0 + a1) / 2) * 154;
      const ty = this.boardY + Math.sin((a0 + a1) / 2) * 154;
      this.add.text(tx, ty, String(labelNum), {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#f0f0f0',
      }).setOrigin(0.5);
    }

    this.boardG.lineStyle(10, 0xE83030, 0.9);
    this.boardG.strokeCircle(this.boardX, this.boardY, 150); // double
    this.boardG.lineStyle(8, 0x30C030, 0.9);
    this.boardG.strokeCircle(this.boardX, this.boardY, 104); // triple
    this.boardG.fillStyle(0x39FF14, 0.95);
    this.boardG.fillCircle(this.boardX, this.boardY, 26); // bull
    this.boardG.fillStyle(0xF5C842, 1);
    this.boardG.fillCircle(this.boardX, this.boardY, 14); // bullseye
  }

  private throwDart() {
    if (this.isFinished || this.shuttingDown) return;
    if (this.phase === 'done') {
      this.finishAndExit(this.computeReward());
      return;
    }
    if (this.phase !== 'aiming') return;
    this.phase = 'result';
    this.thrown += 1;
    const x = this.cursor.x;
    const y = this.cursor.y;
    const score = this.scoreDart(x, y);
    this.score += score;
    if (score === 50) {
      this.bullseyes += 1;
      eventBus.emit(EVENTS.DARTS_BULLSEYE, { score: this.score, thrown: this.thrown });
    }
    eventBus.emit(EVENTS.DARTS_SCORE, { score: this.score, thrown: this.thrown, dartScore: score });

    const dart = this.add.rectangle(this.boardX, this.scale.height - 64, 28, 4, 0xd0d0d0, 1);
    dart.setRotation(Phaser.Math.Angle.Between(this.boardX, this.scale.height - 64, x, y));
    this.tweens.add({
      targets: dart,
      x,
      y,
      duration: 200,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (!this.isSceneAlive() || !dart.active) return;
        dart.setScale(0.72);
      },
    });

    if (this.resultLabel.active) {
      this.resultLabel.setAlpha(1);
      this.resultLabel.setText(score > 0 ? `+${score}` : 'MISS');
      this.resultLabel.setColor(score > 0 ? '#F5C842' : '#FF006E');
    }
    this.resultTimerMs = 460;
    this.refreshHud();
    if (this.thrown >= TOTAL_DARTS) {
      this.phase = 'done';
      const reward = this.computeReward();
      if (this.resultLabel.active) {
        this.resultLabel.setText(`FINAL ${this.score}`);
        this.resultLabel.setColor('#39FF14');
      }
      if (this.rewardLabel.active) {
        this.rewardLabel.setText(`+${reward} TENKS`);
        this.rewardLabel.setAlpha(1);
      }
      if (this.textures.exists('icon_coin')) {
        const coinX = this.scale.width / 2 + this.resultLabel.width / 2 + 12;
        const coinImg = this.add.image(coinX, this.scale.height - 74, 'icon_coin')
          .setDisplaySize(14, 14).setDepth(200).setAlpha(0);
        this.tweens.add({
          targets: coinImg,
          alpha: 1,
          duration: 200,
          onComplete: () => {
            if (!this.isSceneAlive() || !coinImg.active) return;
          },
        });
      }
      this.resultTimerMs = 1600;
      if (this.footer.active) {
        this.footer.setText('CLICK / SPACE PARA SALIR');
        this.footer.setColor('#F5C842');
      }
    }
  }

  private scoreDart(x: number, y: number) {
    const dx = x - this.boardX;
    const dy = y - this.boardY;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > BOARD_RADIUS) return 0;
    if (r <= 14) return 50;
    if (r <= 26) return 25;

    const angle = Phaser.Math.Angle.Normalize(Math.atan2(dy, dx) + Math.PI / 2);
    const sectionIndex = Math.floor((angle / (Math.PI * 2)) * 20);
    const base = ((sectionIndex + 1) * 7) % 20 + 1;
    const multiplier = r >= 145 ? 2 : r >= 98 && r <= 110 ? 3 : 1;
    return base * multiplier;
  }

  private computeReward() {
    let reward = 30;
    if (this.score > 200) reward = 250;
    else if (this.score >= 151) reward = 200;
    else if (this.score >= 101) reward = 130;
    else if (this.score >= 51) reward = 70;
    reward += this.bullseyes * 40;
    return Math.min(450, reward);
  }

  private refreshHud() {
    const round = Math.min(3, Math.floor(this.thrown / 3) + 1);
    const dartsInRound = this.thrown % 3;
    eventBus.emit(EVENTS.DARTS_HUD_UPDATE, {
      score: this.score,
      turn: this.thrown,
      round,
      dartsInRound,
      bullseyes: this.bullseyes,
    });
  }

  private finishAndExit(reward: number) {
    if (this.isFinished) return;
    this.isFinished = true;
    this.phase = 'exiting';
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    void this.grantReward(reward);
    eventBus.emit(EVENTS.DARTS_RESULT, {
      score: this.score,
      bullseyes: this.bullseyes,
      tenksEarned: reward,
    });
    transitionToScene(this, 'ArcadeInterior', {
      dartsCooldownMs: 1200,
      basketCooldownMs: 1200,
      penaltyCooldownMs: 1200,
      dartsReward: {
        score: this.score,
        bullseyes: this.bullseyes,
        tenksEarned: reward,
      },
    });
  }

  private async grantReward(reward: number) {
    if (reward <= 0) return;

    const authH = await getAuthHeaders();
    if (!authH.Authorization) {
      addTenks(reward, 'darts_reward');
      return;
    }

    try {
      const res = await fetch('/api/minigames/reward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authH,
        },
        body: JSON.stringify({
          game: 'darts',
          score: this.score,
          bullseyes: this.bullseyes,
          runId: this.currentRunId,
        }),
      });

      if (!res.ok) {
        eventBus.emit(EVENTS.UI_NOTICE, 'No pude guardar la recompensa de dardos.');
        return;
      }

      const json = await res.json().catch(() => null) as { newBalance?: number } | null;
      if (typeof json?.newBalance === 'number') {
        applyTenksBalanceFromServer(json.newBalance, 'darts_reward_server');
      }
    } catch {
      eventBus.emit(EVENTS.UI_NOTICE, 'No pude guardar la recompensa de dardos.');
    }
  }

  private handleShutdown() {
    this.shuttingDown = true;
    this.isFinished = true;
    this.phase = 'exiting';
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    this.tweens.killAll();
    this.time.removeAllEvents();
    eventBus.emit(EVENTS.DARTS_SCENE_ACTIVE, false);
    this.input.off('pointerdown', this.throwDart, this);
  }

  private isSceneAlive(): boolean {
    return !this.shuttingDown && this.scene.isActive('DartsMinigame');
  }
}
