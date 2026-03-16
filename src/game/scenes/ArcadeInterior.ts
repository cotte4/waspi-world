import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { BUILDINGS, COLORS, SAFE_PLAZA_RETURN, WORLD, ZONES } from '../config/constants';
import { eventBus, EVENTS } from '../config/eventBus';
import { loadAudioSettings, type AudioSettings } from '../systems/AudioSettings';
import { announceScene, bindSafeResetToPlaza, createBackButton, showSceneTitle, transitionToScene } from '../systems/SceneUi';
import { InteriorRoom } from '../systems/InteriorRoom';
import { SceneControls } from '../systems/SceneControls';

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
  private controls!: SceneControls;

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
    this.controls = new SceneControls(this);
    announceScene(this);
    showSceneTitle(this, 'ARCADE', 0xFF006E);
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
    const roomW = 700;
    const roomH = 400;
    const roomX = (width - roomW) / 2;
    const roomY = (height - roomH) / 2;
    this.roomBounds = new Phaser.Geom.Rectangle(roomX + 28, roomY + 60, roomW - 56, roomH - 84);

    const g = this.add.graphics();
    g.fillStyle(0x050511);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    // ── Fondo de circuito neon rosa (líneas tenues) ───────────────
    try {
      const circuitG = this.add.graphics().setDepth(0);
      const PINK = 0xFF006E;
      circuitG.lineStyle(1, PINK, 0.06);
      // Horizontal traces
      for (let cy2 = 30; cy2 < height; cy2 += 48) {
        circuitG.lineBetween(0, cy2, width, cy2);
      }
      // Vertical traces
      for (let cx2 = 30; cx2 < width; cx2 += 64) {
        circuitG.lineBetween(cx2, 0, cx2, height);
      }
      // Corner junction dots
      circuitG.fillStyle(PINK, 0.12);
      for (let jx = 30; jx < width; jx += 64) {
        for (let jy = 30; jy < height; jy += 48) {
          circuitG.fillRect(jx - 1, jy - 1, 3, 3);
        }
      }
      // A few L-shaped traces for circuit feel
      const traces = [
        { x1: 60, y1: 78, x2: 60, y2: 126, x3: 124, y3: 126 },
        { x1: width - 60, y1: 78, x2: width - 60, y2: 126, x3: width - 124, y3: 126 },
        { x1: 60, y1: height - 78, x2: 60, y2: height - 126, x3: 124, y3: height - 126 },
        { x1: width - 60, y1: height - 78, x2: width - 60, y2: height - 126, x3: width - 124, y3: height - 126 },
      ];
      circuitG.lineStyle(1, PINK, 0.18);
      traces.forEach(({ x1, y1, x2, y2, x3, y3 }) => {
        circuitG.lineBetween(x1, y1, x2, y2);
        circuitG.lineBetween(x2, y2, x3, y3);
        circuitG.fillStyle(PINK, 0.35);
        circuitG.fillRect(x2 - 2, y2 - 2, 4, 4);
      });
    } catch (e) { console.error('[ArcadeInterior] circuit lines failed', e); }

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

    // ── Máquinas arcade decorativas en paredes laterales ─────────
    try {
      const propMachineG = this.add.graphics().setDepth(2);
      const PINK_HEX = 0xFF006E;
      const NBLUE = 0x46B3FF;
      // Left wall machines (2 props)
      const leftProps = [
        { mx: roomX + 10, color: PINK_HEX, label: 'FIGHT' },
        { mx: roomX + 10, color: NBLUE, label: 'RACE' },
      ];
      leftProps.forEach(({ mx, color, label }, pi) => {
        const my = roomY + 80 + pi * 116;
        const mw = 36; const mh = 80;
        propMachineG.fillStyle(0x09091a, 1);
        propMachineG.fillRect(mx, my, mw, mh);
        propMachineG.lineStyle(2, color, 0.55);
        propMachineG.strokeRect(mx, my, mw, mh);
        // CRT screen
        propMachineG.fillStyle(color === PINK_HEX ? 0x1a0014 : 0x001020, 1);
        propMachineG.fillRect(mx + 4, my + 8, mw - 8, 28);
        propMachineG.lineStyle(1, color, 0.7);
        propMachineG.strokeRect(mx + 4, my + 8, mw - 8, 28);
        // CRT scan lines
        propMachineG.lineStyle(1, 0x000000, 0.4);
        for (let sl = my + 12; sl < my + 36; sl += 4) {
          propMachineG.lineBetween(mx + 4, sl, mx + mw - 4, sl);
        }
        // Glowing screen content (just colored rect)
        propMachineG.fillStyle(color, 0.25);
        propMachineG.fillRect(mx + 5, my + 9, mw - 10, 26);
        // Controls panel
        propMachineG.fillStyle(0x141428, 1);
        propMachineG.fillRect(mx + 2, my + 40, mw - 4, 20);
        propMachineG.fillStyle(color, 0.8);
        propMachineG.fillCircle(mx + 10, my + 52, 4);
        propMachineG.fillStyle(0xFF3A3A, 0.8);
        propMachineG.fillCircle(mx + 22, my + 48, 3);
        propMachineG.fillStyle(0xFFFF00, 0.8);
        propMachineG.fillCircle(mx + 28, my + 54, 3);
        // Base
        propMachineG.fillStyle(0x07070f, 1);
        propMachineG.fillRect(mx - 2, my + mh, mw + 4, 8);
        // Label above
        this.add.text(mx + mw / 2, my - 10, label, {
          fontSize: '5px',
          fontFamily: '"Press Start 2P", monospace',
          color: `#${color.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5).setDepth(3);
      });

      // Right wall machines (2 props)
      const rightProps = [
        { mx: roomX + roomW - 46, color: 0x39FF14, label: 'SHOOT' },
        { mx: roomX + roomW - 46, color: 0xF5C842, label: 'DANCE' },
      ];
      rightProps.forEach(({ mx, color, label }, pi) => {
        const my = roomY + 80 + pi * 116;
        const mw = 36; const mh = 80;
        propMachineG.fillStyle(0x09091a, 1);
        propMachineG.fillRect(mx, my, mw, mh);
        propMachineG.lineStyle(2, color, 0.55);
        propMachineG.strokeRect(mx, my, mw, mh);
        propMachineG.fillStyle(color === 0x39FF14 ? 0x001400 : 0x1a1400, 1);
        propMachineG.fillRect(mx + 4, my + 8, mw - 8, 28);
        propMachineG.lineStyle(1, color, 0.7);
        propMachineG.strokeRect(mx + 4, my + 8, mw - 8, 28);
        propMachineG.lineStyle(1, 0x000000, 0.4);
        for (let sl = my + 12; sl < my + 36; sl += 4) {
          propMachineG.lineBetween(mx + 4, sl, mx + mw - 4, sl);
        }
        propMachineG.fillStyle(color, 0.22);
        propMachineG.fillRect(mx + 5, my + 9, mw - 10, 26);
        propMachineG.fillStyle(0x141428, 1);
        propMachineG.fillRect(mx + 2, my + 40, mw - 4, 20);
        propMachineG.fillStyle(color, 0.8);
        propMachineG.fillCircle(mx + 10, my + 52, 4);
        propMachineG.fillStyle(0xFF3A3A, 0.8);
        propMachineG.fillCircle(mx + 22, my + 48, 3);
        propMachineG.fillStyle(0x4444ff, 0.8);
        propMachineG.fillCircle(mx + 28, my + 54, 3);
        propMachineG.fillStyle(0x07070f, 1);
        propMachineG.fillRect(mx - 2, my + mh, mw + 4, 8);
        this.add.text(mx + mw / 2, my - 10, label, {
          fontSize: '5px',
          fontFamily: '"Press Start 2P", monospace',
          color: `#${color.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5).setDepth(3);
      });
    } catch (e) { console.error('[ArcadeInterior] prop machines failed', e); }

    // ── Luces intermitentes en el techo ──────────────────────────
    try {
      const blinkColors = [0xFF006E, 0x46B3FF, 0x39FF14, 0xF5C842, 0xFF006E, 0x46B3FF];
      blinkColors.forEach((col, bi) => {
        const bx = roomX + 80 + bi * 100;
        const by = roomY + 12;
        const bulb = this.add.graphics().setDepth(2);
        bulb.fillStyle(col, 0.9);
        bulb.fillCircle(bx, by, 4);
        bulb.fillStyle(col, 0.18);
        bulb.fillCircle(bx, by, 10);
        // Individual staggered blink tweens
        this.tweens.add({
          targets: bulb,
          alpha: { from: 0.2, to: 1 },
          duration: 400 + bi * 180,
          yoyo: true,
          repeat: -1,
          ease: 'Stepped',
          easeParams: [2],
          delay: bi * 120,
        });
      });
    } catch (e) { console.error('[ArcadeInterior] blink lights failed', e); }

    // ── Cartel de juegos disponibles ──────────────────────────────
    try {
      const signData = [
        { label: 'BASKET', color: 0x46B3FF },
        { label: 'PENALES', color: 0xF5C842 },
      ];
      signData.forEach(({ label, color }, si) => {
        const sx = roomX + 80 + si * 160;
        const sy = roomY + 26;
        const sw = 96; const sh = 18;
        const sgnG = this.add.graphics().setDepth(3);
        sgnG.fillStyle(0x050511, 1);
        sgnG.fillRect(sx - sw / 2, sy, sw, sh);
        sgnG.lineStyle(2, color, 0.8);
        sgnG.strokeRect(sx - sw / 2, sy, sw, sh);
        sgnG.fillStyle(color, 0.08);
        sgnG.fillRect(sx - sw / 2 + 1, sy + 1, sw - 2, sh - 2);
        this.add.text(sx, sy + sh / 2, label, {
          fontSize: '6px',
          fontFamily: '"Press Start 2P", monospace',
          color: `#${color.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5).setDepth(4);
        // Blink the frame
        this.tweens.add({
          targets: sgnG,
          alpha: { from: 0.7, to: 1 },
          duration: 1200 + si * 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      });
    } catch (e) { console.error('[ArcadeInterior] game signs failed', e); }

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

    if (this.controls.isActionJustDown('back')) {
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
    let { dx, dy } = this.controls.readMovement();

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
    try {
      this.room?.shutdown();
      this.room = undefined;
    } catch (e) { console.error('[ArcadeInterior] room shutdown failed', e); }

    try {
      if (this.unlockMusicHandler) {
        this.sound.off(Phaser.Sound.Events.UNLOCKED, this.unlockMusicHandler);
        this.unlockMusicHandler = undefined;
      }
    } catch (e) { console.error('[ArcadeInterior] unlockMusicHandler cleanup failed', e); }

    try {
      this.audioSettingsCleanup?.();
      this.audioSettingsCleanup = undefined;
    } catch (e) { console.error('[ArcadeInterior] audioSettingsCleanup failed', e); }

    try {
      this.stopArcadeMusic();
    } catch (e) { console.error('[ArcadeInterior] stopArcadeMusic failed', e); }
  }
}
