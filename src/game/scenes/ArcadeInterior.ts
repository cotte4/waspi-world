import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { BUILDINGS, COLORS, SAFE_PLAZA_RETURN, WORLD, ZONES } from '../config/constants';
import { eventBus, EVENTS } from '../config/eventBus';
import { loadAudioSettings, type AudioSettings } from '../systems/AudioSettings';
import { announceScene, bindSafeResetToPlaza, createBackButton, transitionToScene } from '../systems/SceneUi';
import { InteriorRoom } from '../systems/InteriorRoom';
import { isActionJustDown, loadControlSettings, readMovementVector, type ControlSettings } from '../systems/ControlSettings';

interface ArcadePenaltyReward {
  won?: boolean;
  goals?: number;
  shots?: number;
}

interface ArcadeBasketReward {
  score?: number;
  shots?: number;
  tenksEarned?: number;
  status?: 'granted' | 'pending' | 'local';
}

interface ArcadeInteriorData {
  basketReward?: ArcadeBasketReward;
  penaltyReward?: ArcadePenaltyReward;
  basketCooldownMs?: number;
  penaltyCooldownMs?: number;
}

export class ArcadeInterior extends Phaser.Scene {
  private static readonly RETURN_X = BUILDINGS.ARCADE.x + BUILDINGS.ARCADE.w / 2;
  private static readonly RETURN_Y = ZONES.SOUTH_SIDEWALK_Y + 26;
  private player!: AvatarRenderer;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private inTransition = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyJ!: Phaser.Input.Keyboard.Key;
  private keyK!: Phaser.Input.Keyboard.Key;
  private keyL!: Phaser.Input.Keyboard.Key;
  private px = 0;
  private py = 0;
  private basketMachineZone = new Phaser.Geom.Rectangle();
  private penaltyMachineZone = new Phaser.Geom.Rectangle();
  private wasInsideBasketZone = false;
  private wasInsidePenaltyZone = false;
  private basketCooldownMs = 0;
  private penaltyCooldownMs = 0;
  private rewardMessage = '';
  private rewardColor = '#39FF14';
  private rewardDetail = '';
  private roomBounds = new Phaser.Geom.Rectangle();
  private machineHint?: Phaser.GameObjects.Text;
  private basketGlowPad?: Phaser.GameObjects.Ellipse;
  private glowPad?: Phaser.GameObjects.Ellipse;
  private arcadeMusic?: Phaser.Sound.BaseSound;
  private unlockMusicHandler?: () => void;
  private audioSettings: AudioSettings = loadAudioSettings();
  private audioSettingsCleanup?: () => void;
  private room?: InteriorRoom;
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastIsMoving = false;
  private controlSettings: ControlSettings = loadControlSettings();

  constructor() {
    super({ key: 'ArcadeInterior' });
  }

  init(data: ArcadeInteriorData = {}) {
    this.inTransition = false;
    this.wasInsideBasketZone = false;
    this.wasInsidePenaltyZone = false;
    this.lastMoveDx = 0;
    this.lastMoveDy = 0;
    this.lastIsMoving = false;
    this.basketCooldownMs = data.basketCooldownMs ?? 0;
    this.penaltyCooldownMs = data.penaltyCooldownMs ?? 0;
    const basketReward = data.basketReward;
    const reward = data.penaltyReward;

    if (basketReward) {
      if (basketReward.status === 'pending') {
        this.rewardMessage = 'BASKET PENDIENTE';
        this.rewardDetail = `${basketReward.score ?? 0} PTS / ${basketReward.shots ?? 0} TIROS`;
        this.rewardColor = '#FFB36A';
        return;
      }

      this.rewardMessage = basketReward.tenksEarned && basketReward.tenksEarned > 0 ? 'BASKET COBRADO' : 'BASKET TERMINADO';
      this.rewardDetail = `${basketReward.score ?? 0} PTS / ${basketReward.shots ?? 0} TIROS${basketReward.tenksEarned ? ` / +${basketReward.tenksEarned} TENKS` : ''}`;
      this.rewardColor = basketReward.tenksEarned && basketReward.tenksEarned > 0 ? '#39FF14' : '#46B3FF';
      return;
    }

    if (reward?.won) {
      this.rewardMessage = 'PREMIO LISTO';
      this.rewardDetail = `${reward.goals ?? 0} GOLES / ${reward.shots ?? 5} TIROS`;
      this.rewardColor = '#39FF14';
      return;
    }

    if (typeof reward?.won === 'boolean') {
      this.rewardMessage = 'PENALES TERMINADOS';
      this.rewardDetail = `${reward.goals ?? 0} GOLES / ${reward.shots ?? 5} TIROS`;
      this.rewardColor = '#F5C842';
      return;
    }

    this.rewardMessage = '';
    this.rewardDetail = '';
    this.rewardColor = '#39FF14';
  }

  create() {
    const { width, height } = this.scale;
    this.inTransition = false;
    this.input.enabled = true;
    announceScene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    bindSafeResetToPlaza(this, () => {
      transitionToScene(this, 'WorldScene', {
        returnX: SAFE_PLAZA_RETURN.X,
        returnY: SAFE_PLAZA_RETURN.Y,
      });
    });
    this.audioSettingsCleanup = eventBus.on(EVENTS.AUDIO_SETTINGS_CHANGED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const next = payload as Partial<AudioSettings>;
      this.audioSettings = {
        musicEnabled: next.musicEnabled ?? this.audioSettings.musicEnabled,
        sfxEnabled: next.sfxEnabled ?? this.audioSettings.sfxEnabled,
      };
      this.applyMusicSettings();
    });
    const offControls = eventBus.on(EVENTS.CONTROL_SETTINGS_CHANGED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      this.controlSettings = {
        ...this.controlSettings,
        ...(payload as Partial<ControlSettings>),
      };
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offControls);

    const roomW = 700;
    const roomH = 400;
    const roomX = (width - roomW) / 2;
    const roomY = (height - roomH) / 2;
    this.roomBounds = new Phaser.Geom.Rectangle(roomX + 28, roomY + 60, roomW - 56, roomH - 84);

    const g = this.add.graphics();
    g.fillStyle(0x050511);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    g.fillGradientStyle(0x111127, 0x111127, 0x090914, 0x090914, 1);
    g.fillRoundedRect(roomX, roomY, roomW, roomH, 18);
    g.lineStyle(3, COLORS.NEON_PINK, 0.7);
    g.strokeRoundedRect(roomX, roomY, roomW, roomH, 18);

    g.fillStyle(0x070712, 0.95);
    g.fillRoundedRect(roomX + 24, roomY + 52, roomW - 48, roomH - 78, 12);

    g.lineStyle(1, 0x1d2144, 0.45);
    for (let x = roomX + 36; x <= roomX + roomW - 36; x += 28) {
      g.lineBetween(x, roomY + 122, x, roomY + roomH - 20);
    }
    for (let y = roomY + 122; y <= roomY + roomH - 20; y += 24) {
      g.lineBetween(roomX + 36, y, roomX + roomW - 36, y);
    }

    g.fillStyle(0x090917, 0.98);
    g.fillRoundedRect(roomX + 22, roomY + roomH - 110, roomW - 44, 70, 18);
    g.lineStyle(2, 0x000000, 0.45);
    g.strokeRoundedRect(roomX + 22, roomY + roomH - 110, roomW - 44, 70, 18);

    const machinePositions = [roomX + 92, roomX + 226, roomX + 350, roomX + 474, roomX + 608];
    const machineLabels = ['RACER', 'BASKET', 'PENALES', 'DJ', 'ZOMBIS'];

    machinePositions.forEach((mx, index) => {
      const isPenaltyMachine = index === 2;
      const accent = isPenaltyMachine ? COLORS.GOLD : COLORS.NEON_BLUE;

      g.fillStyle(0x07071a, 1);
      g.fillRoundedRect(mx - 28, roomY + 64, 56, 112, 10);
      g.lineStyle(2, accent, isPenaltyMachine ? 0.75 : 0.32);
      g.strokeRoundedRect(mx - 28, roomY + 64, 56, 112, 10);

      g.fillStyle(isPenaltyMachine ? 0x2d2410 : 0x0d1238, 1);
      g.fillRoundedRect(mx - 21, roomY + 76, 42, 36, 6);

      g.fillStyle(accent, isPenaltyMachine ? 0.88 : 0.62);
      g.fillRect(mx - 17, roomY + 82, 34, 22);

      g.fillStyle(0x16172c, 1);
      g.fillRect(mx - 18, roomY + 118, 36, 16);
      g.fillStyle(0x050505, 1);
      g.fillRect(mx - 14, roomY + 142, 28, 14);

      this.add.text(mx, roomY + 48, machineLabels[index], {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: isPenaltyMachine ? '#F5C842' : '#6A8BFF',
      }).setOrigin(0.5);

      if (index === 1) {
        this.basketMachineZone = new Phaser.Geom.Rectangle(mx - 36, roomY + 56, 72, 122);
        this.basketGlowPad = this.add.ellipse(mx, roomY + 192, 94, 24, 0x46b3ff, 0.12)
          .setStrokeStyle(1, 0x46b3ff, 0.35)
          .setDepth(1);
      } else if (isPenaltyMachine) {
        this.penaltyMachineZone = new Phaser.Geom.Rectangle(mx - 36, roomY + 56, 72, 122);
        this.glowPad = this.add.ellipse(mx, roomY + 192, 94, 24, 0xF5C842, 0.12)
          .setStrokeStyle(1, 0xF5C842, 0.35)
          .setDepth(1);
      } else {
        this.add.text(mx, roomY + 190, 'SOON', {
          fontSize: '6px',
          fontFamily: '"Press Start 2P", monospace',
          color: '#585C78',
        }).setOrigin(0.5);
      }
    });

    this.add.text(width / 2, roomY + 30, 'ARCADE', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF006E',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + 54, 'PISA BASKET O PENALES PARA JUGAR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#A0A0B4',
    }).setOrigin(0.5);

    this.machineHint = this.add.text(width / 2, roomY + roomH + 24, 'ESC SALIR DEL ARCADE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(0.5);

    createBackButton(this, () => this.exitToWorld());

    this.px = width / 2;
    this.py = roomY + roomH - 82;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(10);
    this.room = new InteriorRoom(this, {
      roomKey: 'waspi-room-arcade',
      getPosition: () => ({ x: this.px, y: this.py }),
      getMovement: () => ({ dx: this.lastMoveDx, dy: this.lastMoveDy, isMoving: this.lastIsMoving }),
      getAvatarConfig: () => loadStoredAvatarConfig(),
      onRemoteClick: (playerId, username) => {
        eventBus.emit(EVENTS.PLAYER_ACTIONS_OPEN, { playerId, username });
      },
    });
    this.room.start();

    if (this.rewardMessage) {
      this.flashMessage(width / 2, roomY + roomH + 46, this.rewardMessage, this.rewardColor, this.rewardDetail);
    }

    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyI = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyJ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keyK = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.applyMusicSettings();
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    if (this.inTransition) return;

    if (this.basketCooldownMs > 0) {
      this.basketCooldownMs = Math.max(0, this.basketCooldownMs - delta);
    }

    if (this.penaltyCooldownMs > 0) {
      this.penaltyCooldownMs = Math.max(0, this.penaltyCooldownMs - delta);
    }

    this.handleMovement(delta);
    this.updateMachineState();
    this.room?.update();

    if (isActionJustDown(this, this.controlSettings, 'back')) {
      this.exitToWorld();
    }
  }

  private updateMachineState() {
    const inBasketZone = this.basketMachineZone.contains(this.px, this.py);
    const inPenaltyZone = this.penaltyMachineZone.contains(this.px, this.py);

    if (this.basketGlowPad) {
      const pulse = 0.1 + Math.abs(Math.sin(this.time.now / 320)) * 0.08;
      this.basketGlowPad.setAlpha(inBasketZone ? 0.28 : pulse);
    }

    if (this.glowPad) {
      const pulse = 0.1 + Math.abs(Math.sin(this.time.now / 280)) * 0.08;
      this.glowPad.setAlpha(inPenaltyZone ? 0.28 : pulse);
    }

    if (this.machineHint) {
      if (this.basketCooldownMs > 0 && inBasketZone) {
        this.machineHint.setText('BASKET RECARGANDO...');
        this.machineHint.setColor('#888888');
      } else if (inBasketZone) {
        this.machineHint.setText('BASKET LISTO');
        this.machineHint.setColor('#46B3FF');
      } else if (this.penaltyCooldownMs > 0 && inPenaltyZone) {
        this.machineHint.setText('CABINA RECARGANDO...');
        this.machineHint.setColor('#888888');
      } else if (inPenaltyZone) {
        this.machineHint.setText('PENALES LISTOS');
        this.machineHint.setColor('#F5C842');
      } else {
        this.machineHint.setText('ESC SALIR DEL ARCADE');
        this.machineHint.setColor('#666666');
      }
    }

    if (inBasketZone && !this.wasInsideBasketZone && this.basketCooldownMs <= 0) {
      this.startBasket();
    }

    if (inPenaltyZone && !this.wasInsidePenaltyZone && this.penaltyCooldownMs <= 0) {
      this.startPenalty();
    }

    this.wasInsideBasketZone = inBasketZone;
    this.wasInsidePenaltyZone = inPenaltyZone;
  }

  private startBasket() {
    if (this.inTransition) return;
    this.inTransition = true;
    this.flashMessage(this.scale.width / 2, this.scale.height / 2 + 52, 'ENTRANDO A BASKET', '#46B3FF');
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('BasketMinigame');
    });
  }

  private startPenalty() {
    if (this.inTransition) return;
    this.inTransition = true;
    this.flashMessage(this.scale.width / 2, this.scale.height / 2 + 52, 'ENTRANDO A PENALES', '#39FF14');
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('PenaltyMinigame');
    });
  }

  private exitToWorld() {
    if (this.inTransition) return;
    this.inTransition = true;
    this.stopArcadeMusic();
    transitionToScene(this, 'WorldScene', {
      returnX: ArcadeInterior.RETURN_X,
      returnY: ArcadeInterior.RETURN_Y,
    });
  }

  private handleMovement(delta: number) {
    const speed = (185 * delta) / 1000;
    let { dx, dy } = readMovementVector({
      scene: this,
      settings: this.controlSettings,
    });

    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    this.px = Phaser.Math.Clamp(this.px + dx * speed, this.roomBounds.left, this.roomBounds.right);
    this.py = Phaser.Math.Clamp(this.py + dy * speed, this.roomBounds.top, this.roomBounds.bottom);

    this.player.update(dx !== 0 || dy !== 0, dx, dy);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
    this.lastMoveDx = dx;
    this.lastMoveDy = dy;
    this.lastIsMoving = dx !== 0 || dy !== 0;
  }

  private flashMessage(x: number, y: number, message: string, color: string, detail = '') {
    const lines = detail ? [message, detail] : [message];
    const text = this.add.text(x, y, lines, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      align: 'center',
      stroke: '#000000',
      strokeThickness: 3,
      lineSpacing: 8,
    }).setOrigin(0.5).setDepth(9999);

    this.tweens.add({
      targets: text,
      alpha: { from: 1, to: 0 },
      y: y - 10,
      duration: 1200,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private startArcadeMusic() {
    if (!this.audioSettings.musicEnabled) return;
    if (!this.cache.audio.exists('arcade_theme') || this.arcadeMusic) return;

    this.arcadeMusic = this.sound.add('arcade_theme', {
      loop: true,
      volume: 0,
    });

    const fadeIn = () => {
      if (!this.arcadeMusic || this.arcadeMusic.isPlaying) return;
      this.arcadeMusic.play();
      this.tweens.add({
        targets: this.arcadeMusic,
        volume: 0.42,
        duration: 700,
        ease: 'Sine.easeOut',
      });
    };

    if (this.sound.locked) {
      this.unlockMusicHandler = () => {
        this.unlockMusicHandler = undefined;
        fadeIn();
      };
      this.sound.once(Phaser.Sound.Events.UNLOCKED, this.unlockMusicHandler);
      return;
    }

    fadeIn();
  }

  private applyMusicSettings() {
    if (!this.audioSettings.musicEnabled) {
      if (this.unlockMusicHandler) {
        this.sound.off(Phaser.Sound.Events.UNLOCKED, this.unlockMusicHandler);
        this.unlockMusicHandler = undefined;
      }
      this.stopArcadeMusic();
      return;
    }
    this.startArcadeMusic();
  }

  private stopArcadeMusic() {
    if (!this.arcadeMusic) return;
    const sound = this.arcadeMusic;
    this.arcadeMusic = undefined;
    this.tweens.add({
      targets: sound,
      volume: 0,
      duration: 250,
      ease: 'Sine.easeIn',
      onComplete: () => {
        sound.stop();
        sound.destroy();
      },
    });
  }

  private handleSceneShutdown() {
    this.room?.shutdown();
    this.room = undefined;
    if (this.unlockMusicHandler) {
      this.sound.off(Phaser.Sound.Events.UNLOCKED, this.unlockMusicHandler);
      this.unlockMusicHandler = undefined;
    }
    this.audioSettingsCleanup?.();
    this.audioSettingsCleanup = undefined;
    this.stopArcadeMusic();
  }
}
