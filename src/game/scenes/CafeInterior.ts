import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { BUILDINGS, SAFE_PLAZA_RETURN, ZONES } from '../config/constants';
import { announceScene, bindSafeResetToPlaza, createBackButton, showSceneTitle, transitionToScene } from '../systems/SceneUi';
import { InteriorRoom } from '../systems/InteriorRoom';
import { eventBus, EVENTS } from '../config/eventBus';
import { SceneControls } from '../systems/SceneControls';
import { safeSceneDelayedCall } from '../systems/AnimationSafety';

export class CafeInterior extends Phaser.Scene {
  private static readonly RETURN_X = BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2;
  private static readonly RETURN_Y = ZONES.SOUTH_SIDEWALK_Y + 26;
  private player!: AvatarRenderer;
  private keySpace!: Phaser.Input.Keyboard.Key;
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
  private room?: InteriorRoom;
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastIsMoving = false;
  private controls!: SceneControls;

  constructor() {
    super({ key: 'CafeInterior' });
  }

  init() {
    this.inTransition = false;
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);
    showSceneTitle(this, 'CAFÉ', 0xFF8B3D);
    this.input.enabled = true;
    this.controls = new SceneControls(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.inTransition = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });
    bindSafeResetToPlaza(this, () => {
      transitionToScene(this, 'WorldScene', {
        returnX: SAFE_PLAZA_RETURN.X,
        returnY: SAFE_PLAZA_RETURN.Y,
      });
    });
    // ── Canvas background ─────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1209);  // paleta cálida oscura
    bg.fillRect(0, 0, width, height);
    // Warm vignette overlay (darker corners)
    try {
      const vigG = this.add.graphics().setDepth(0);
      vigG.fillStyle(0x0a0604, 0.55);
      vigG.fillRect(0, 0, 60, height);
      vigG.fillRect(width - 60, 0, 60, height);
      vigG.fillRect(0, 0, width, 40);
      vigG.fillRect(0, height - 40, width, 40);
    } catch (e) { console.error('[CafeInterior] vignette failed', e); }

    const roomW = 640;
    const roomH = 360;
    const roomX = (width - roomW) / 2;   // 80
    const roomY = (height - roomH) / 2;  // 120
    const roomR = roomX + roomW;          // 720
    const roomB = roomY + roomH;          // 480
    const cx    = width / 2;             // 400
    const ORANGE = 0xFF6B00;
    const AMBER  = 0xffaa44;

    // ── Room base ────────────────────────────────────────────
    const room = this.add.graphics();
    // Main floor fill
    room.fillStyle(0x1a0c0c);
    room.fillRect(roomX, roomY, roomW, roomH);
    // Back wall (top 92px) — darker panel
    room.fillStyle(0x110808);
    room.fillRect(roomX, roomY, roomW, 92);
    room.lineStyle(1, 0x2a1010, 0.7);
    room.lineBetween(roomX, roomY + 92, roomR, roomY + 92);
    // Vertical wall paneling lines
    for (let wx = roomX + 18; wx < roomR; wx += 18) {
      room.lineStyle(1, 0x1a0c0c, 0.55);
      room.lineBetween(wx, roomY, wx, roomY + 92);
    }
    // Floor zone (bottom 92px) — wood planks
    room.fillStyle(0x180e0a);
    room.fillRect(roomX, roomB - 92, roomW, 92);
    for (let ply = roomB - 92; ply < roomB; ply += 14) {
      room.lineStyle(1, 0x110905, 0.65);
      room.lineBetween(roomX, ply, roomR, ply);
    }
    // Plank end joints (offset per row)
    for (let row = 0; row < 6; row++) {
      const plyBase = roomB - 92 + row * 14;
      const off = (row % 2 === 0) ? 80 : 200;
      [off, off + 200, off + 400].forEach((jx) => {
        if (roomX + jx < roomR) {
          room.lineStyle(1, 0x110905, 0.45);
          room.lineBetween(roomX + jx, plyBase, roomX + jx, plyBase + 14);
        }
      });
    }
    room.lineStyle(1, ORANGE, 0.14);
    room.lineBetween(roomX, roomB - 92, roomR, roomB - 92);

    // ── Room border ──────────────────────────────────────────
    room.lineStyle(1, ORANGE, 0.08);
    room.strokeRect(roomX - 3, roomY - 3, roomW + 6, roomH + 6);
    room.lineStyle(2, ORANGE, 0.65);
    room.strokeRect(roomX, roomY, roomW, roomH);
    // Corner L-brackets
    const bL = 16;
    [[roomX, roomY],[roomR, roomY],[roomX, roomB],[roomR, roomB]].forEach(([bx, by], i) => {
      room.lineStyle(2, ORANGE, 1);
      const sx = i % 2 === 0 ? 1 : -1;
      const sy = i < 2 ? 1 : -1;
      room.lineBetween(bx, by, bx + sx * bL, by);
      room.lineBetween(bx, by, bx, by + sy * bL);
    });

    // ── Pendant ceiling lights ───────────────────────────────
    const pendantG = this.add.graphics();
    [cx - 190, cx, cx + 190].forEach((px) => {
      pendantG.lineStyle(1, 0x3a3030, 0.7);
      pendantG.lineBetween(px, roomY, px, roomY + 20);
      pendantG.fillStyle(0x1e1616);
      pendantG.fillRect(px - 9, roomY + 20, 18, 10);
      pendantG.lineStyle(1, 0x4a3a3a, 0.6);
      pendantG.strokeRect(px - 9, roomY + 20, 18, 10);
      pendantG.fillStyle(AMBER, 0.07);
      pendantG.fillTriangle(px - 10, roomY + 30, px + 10, roomY + 30, px, roomY + 82);
    });

    // ── Back wall shelves ────────────────────────────────────
    const shelfG = this.add.graphics();
    const bottleColors = [0x884400, 0x44aa22, 0x2244aa, 0x993300, 0xaaaa44, 0x226644];
    const drawShelfSide = (startX: number, shelfWidth: number) => {
      // Shelf plank 1
      shelfG.fillStyle(0x2e1610);
      shelfG.fillRect(startX, roomY + 44, shelfWidth, 6);
      shelfG.lineStyle(1, 0x4a2218, 0.8);
      shelfG.strokeRect(startX, roomY + 44, shelfWidth, 6);
      // Bottles on shelf 1
      bottleColors.forEach((col, i) => {
        const bx = startX + 6 + i * Math.floor(shelfWidth / 7);
        shelfG.fillStyle(col, 0.82);
        shelfG.fillRect(bx, roomY + 24, 9, 20);
        shelfG.fillRect(bx + 2, roomY + 18, 5, 7);
        shelfG.lineStyle(1, 0x000000, 0.25);
        shelfG.strokeRect(bx, roomY + 24, 9, 20);
      });
      // Shelf plank 2
      shelfG.fillStyle(0x2e1610);
      shelfG.fillRect(startX, roomY + 74, shelfWidth, 6);
      shelfG.lineStyle(1, 0x4a2218, 0.8);
      shelfG.strokeRect(startX, roomY + 74, shelfWidth, 6);
      // Cups on shelf 2
      for (let ci = 0; ci < 5; ci++) {
        const cxx = startX + 6 + ci * Math.floor(shelfWidth / 5.5);
        shelfG.fillStyle(0xcccccc, 0.65);
        shelfG.fillRect(cxx, roomY + 60, 12, 14);
        shelfG.lineStyle(1, 0x888888, 0.45);
        shelfG.strokeRect(cxx, roomY + 60, 12, 14);
      }
    };
    drawShelfSide(roomX + 10, 200);
    drawShelfSide(roomR - 210, 200);

    // ── Neon CAFÉ sign (back wall center) ────────────────────
    const signW = 148, signH = 28;
    const signX = cx - signW / 2, signY = roomY + 26;
    const signG = this.add.graphics();
    signG.fillStyle(0x0c0604);
    signG.fillRect(signX, signY, signW, signH);
    signG.lineStyle(2, ORANGE, 0.9);
    signG.strokeRect(signX, signY, signW, signH);
    signG.fillStyle(ORANGE, 0.1);
    signG.fillRect(signX - 5, signY - 3, signW + 10, signH + 6);
    const neonSign = this.add.text(cx, signY + signH / 2, '★  CAFÉ  ★', {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6B00',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(5);
    this.tweens.add({
      targets: [neonSign, signG],
      alpha: { from: 1, to: 0.6 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ── Bar counter ──────────────────────────────────────────
    const barG = this.add.graphics();
    const barX = roomX + 44, barY = roomY + 98, barW = roomW - 88, barH = 44;
    // Front depth face
    barG.fillStyle(0x180c06);
    barG.fillRect(barX, barY + barH, barW, 10);
    // Counter body
    barG.fillStyle(0x2c1808);
    barG.fillRect(barX, barY, barW, barH);
    barG.lineStyle(1, 0x4a2a14, 0.9);
    barG.strokeRect(barX, barY, barW, barH);
    // Top surface highlight
    barG.fillStyle(0x3a1e0a);
    barG.fillRect(barX, barY, barW, 8);
    barG.lineStyle(1, 0x6a3a1a, 0.6);
    barG.lineBetween(barX, barY + 8, barX + barW, barY + 8);
    // Brass rail top edge
    barG.lineStyle(2, ORANGE, 0.3);
    barG.lineBetween(barX, barY, barX + barW, barY);
    // Bar top items
    [
      { bx: barX + 18, type: 'cup' }, { bx: barX + 44, type: 'cup' },
      { bx: barX + 88, type: 'bottle', col: 0x884400 },
      { bx: barX + 108, type: 'bottle', col: 0x226644 },
      { bx: barX + barW - 120, type: 'bottle', col: 0xaa4422 },
      { bx: barX + barW - 56, type: 'cup' }, { bx: barX + barW - 30, type: 'cup' },
    ].forEach(({ bx, type, col }) => {
      if (type === 'cup') {
        barG.fillStyle(0xcccccc, 0.75);
        barG.fillRect(bx, barY - 12, 10, 12);
        barG.lineStyle(1, 0x888888, 0.45);
        barG.strokeRect(bx, barY - 12, 10, 12);
      } else {
        barG.fillStyle((col as number) ?? 0x884400, 0.85);
        barG.fillRect(bx, barY - 20, 8, 20);
        barG.fillRect(bx + 2, barY - 26, 4, 7);
      }
    });
    // Bar stools (front of bar)
    [barX + 64, barX + 180, barX + barW - 180, barX + barW - 64].forEach((sx) => {
      barG.lineStyle(1, 0x3a1e0a, 0.8);
      barG.lineBetween(sx + 8, barY + barH + 10, sx + 8, barY + barH + 30);
      barG.fillStyle(0x3a1e0a);
      barG.fillRect(sx, barY + barH + 10, 16, 6);
      barG.lineStyle(1, 0x5a2e14, 0.6);
      barG.strokeRect(sx, barY + barH + 10, 16, 6);
    });

    // ── Tables ───────────────────────────────────────────────
    const tableG = this.add.graphics();
    [
      { tx: roomX + 148, ty: roomY + 210 },
      { tx: roomX + 340, ty: roomY + 232 },
      { tx: roomX + 524, ty: roomY + 210 },
    ].forEach(({ tx, ty }) => {
      const tw = 62, th = 34;
      // Chair top
      tableG.fillStyle(0x1e1208);
      tableG.fillRect(tx - 12, ty - 20, 28, 7);
      tableG.lineStyle(1, 0x3a2010, 0.5);
      tableG.strokeRect(tx - 12, ty - 20, 28, 7);
      // Chair bottom
      tableG.fillStyle(0x1e1208);
      tableG.fillRect(tx - 12, ty + th + 4, 28, 7);
      tableG.lineStyle(1, 0x3a2010, 0.5);
      tableG.strokeRect(tx - 12, ty + th + 4, 28, 7);
      // Table surface
      tableG.fillStyle(0x2a1408);
      tableG.fillRect(tx - tw / 2, ty, tw, th);
      tableG.lineStyle(1, 0x4a2218, 0.8);
      tableG.strokeRect(tx - tw / 2, ty, tw, th);
      // Top highlight
      tableG.fillStyle(0x381c0a);
      tableG.fillRect(tx - tw / 2, ty, tw, 5);
      // Candle glow
      tableG.fillStyle(AMBER, 0.65);
      tableG.fillRect(tx - 3, ty + th / 2 + 4, 6, 10);
      tableG.fillStyle(AMBER, 0.22);
      tableG.fillEllipse(tx, ty + th / 2, 22, 14);
    });

    // ── Partículas de vapor/humo (círculos alpha bajo que flotan) ─
    try {
      // Steam sources: cups on bar top + candles on tables
      const steamSources = [
        { sx: barX + 23, sy: barY - 14 },
        { sx: barX + 49, sy: barY - 14 },
        { sx: barX + barW - 51, sy: barY - 14 },
        { sx: barX + barW - 25, sy: barY - 14 },
        { sx: roomX + 148, sy: roomY + 210 + 17 - 8 },
        { sx: roomX + 340, sy: roomY + 232 + 17 - 8 },
        { sx: roomX + 524, sy: roomY + 210 + 17 - 8 },
      ];
      steamSources.forEach(({ sx, sy }) => {
        // Create multiple steam puffs per source, staggered
        for (let pi = 0; pi < 3; pi++) {
          const steamCirc = this.add.graphics().setDepth(6);
          const radius = 4 + Math.random() * 4;
          steamCirc.fillStyle(AMBER, 0.08 + Math.random() * 0.06);
          steamCirc.fillCircle(0, 0, radius);
          steamCirc.setPosition(sx + (Math.random() - 0.5) * 6, sy);
          steamCirc.setAlpha(0);
          steamCirc.setScale(0.5);
          const delay = pi * 700 + Math.random() * 400;
          // Float up and fade out, loop
          const animateSteam = () => {
            if (!steamCirc.active) return;
            steamCirc.setPosition(sx + (Math.random() - 0.5) * 8, sy);
            steamCirc.setAlpha(0);
            steamCirc.setScale(0.5);
            this.tweens.add({
              targets: steamCirc,
              y: steamCirc.y - 22 - Math.random() * 14,
              alpha: { from: 0, to: 0.55 },
              scale: { from: 0.5, to: 1.4 },
              duration: 900,
              ease: 'Sine.easeOut',
              onComplete: () => {
                if (!steamCirc.active) return;
                this.tweens.add({
                  targets: steamCirc,
                  alpha: 0,
                  scale: 2,
                  duration: 700,
                  ease: 'Sine.easeIn',
                  onComplete: () => {
                    safeSceneDelayedCall(this, 300 + Math.random() * 600, animateSteam);
                  },
                });
              },
            });
          };
          safeSceneDelayedCall(this, delay, animateSteam);
        }
      });
    } catch (e) { console.error('[CafeInterior] steam particles failed', e); }

    // ── Player avatar ────────────────────────────────────────
    this.px = width / 2;
    this.py = roomB - 80;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(10);
    this.room = new InteriorRoom(this, {
      roomKey: 'waspi-room-cafe',
      getPosition: () => ({ x: this.px, y: this.py }),
      getMovement: () => ({ dx: this.lastMoveDx, dy: this.lastMoveDy, isMoving: this.lastIsMoving }),
      getAvatarConfig: () => loadStoredAvatarConfig(),
      onRemoteClick: (playerId, username) => {
        eventBus.emit(EVENTS.PLAYER_ACTIONS_OPEN, { playerId, username });
      },
    });
    this.room.start();

    // ── UI ───────────────────────────────────────────────────
    this.add.text(cx, roomB + 16, 'ESC  ·  SALIR', {
      fontSize: '7px',
      fontFamily: '"Silkscreen", monospace',
      color: '#442211',
    }).setOrigin(0.5);
    createBackButton(this, () => this.exitToWorld());

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
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
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update(_time?: number, delta = 16.6) {
    if (this.inTransition) return;
    this.handleMovement(delta);
    this.room?.update();
    if (this.controls.isActionJustDown('back')) {
      this.exitToWorld();
    }
  }

  private exitToWorld() {
    if (this.inTransition) return;
    this.inTransition = true;
    transitionToScene(this, 'WorldScene', {
      returnX: CafeInterior.RETURN_X,
      returnY: CafeInterior.RETURN_Y,
    });
  }

  private handleMovement(delta: number) {
    const { dx, dy, stepX, stepY } = this.controls.readMovementStep(delta, 180);

    const { width, height } = this.scale;
    const roomW = 640;
    const roomH = 360;
    const roomX = (width - roomW) / 2 + 20;
    const roomY = (height - roomH) / 2 + 20;

    this.px = Phaser.Math.Clamp(this.px + stepX, roomX, roomX + roomW - 40);
    this.py = Phaser.Math.Clamp(this.py + stepY, roomY + 40, roomY + roomH - 10);

    this.player.update(dx !== 0 || dy !== 0, dx, dy);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
    this.lastMoveDx = dx;
    this.lastMoveDy = dy;
    this.lastIsMoving = dx !== 0 || dy !== 0;
  }

  private handleSceneShutdown() {
    this.room?.shutdown();
    this.room = undefined;
  }
}
