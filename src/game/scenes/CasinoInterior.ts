import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { BUILDINGS, SAFE_PLAZA_RETURN, ZONES } from '../config/constants';
import { announceScene, bindSafeResetToPlaza, createBackButton, showSceneTitle, transitionToWorldScene } from '../systems/SceneUi';
import { InteriorRoom } from '../systems/InteriorRoom';
import { eventBus, EVENTS } from '../config/eventBus';
import { SceneControls } from '../systems/SceneControls';
import { worldExitFromSceneData } from '../systems/worldReturnSpawn';

type StationId = 'slots' | 'roulette' | 'blackjack' | 'poker';
interface Station { id: StationId; label: string; cx: number; cy: number; triggerR: number; color: number; }
type CasinoOverlayMode = 'slots' | 'roulette' | 'blackjack' | 'poker' | null;

export class CasinoInterior extends Phaser.Scene {
  private static readonly RETURN_X = BUILDINGS.CASINO.x + BUILDINGS.CASINO.w / 2;
  private static readonly RETURN_Y = ZONES.SOUTH_SIDEWALK_Y + 26;

  private player!: AvatarRenderer;
  private inTransition = false;
  private px = 0;
  private py = 0;
  private room?: InteriorRoom;
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastIsMoving = false;
  private controls!: SceneControls;
  private stations: Station[] = [];
  private stationHints = new Map<StationId, Phaser.GameObjects.Container>();
  private stationHighlights = new Map<StationId, Phaser.GameObjects.Graphics>();
  private nearbyStation: StationId | null = null;
  private toastText?: Phaser.GameObjects.Text;
  private toastTween?: Phaser.Tweens.Tween;
  private roomX = 0;
  private roomY = 0;
  private roomW = 680;
  private roomH = 400;
  private overlayMode: CasinoOverlayMode = null;
  private casinoVisuals: Phaser.GameObjects.GameObject[] = [];
  private casinoTweens: Phaser.Tweens.Tween[] = [];
  private rouletteWheelTween?: Phaser.Tweens.Tween;
  private worldExitX!: number;
  private worldExitY!: number;

  constructor() { super({ key: 'CasinoInterior' }); }

  init(data: Record<string, unknown> = {}) {
    this.inTransition = false;
    const w = worldExitFromSceneData(data, CasinoInterior.RETURN_X, CasinoInterior.RETURN_Y);
    this.worldExitX = w.x;
    this.worldExitY = w.y;
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);
    showSceneTitle(this, 'CASINO', 0xB74DFF);
    this.input.enabled = true;
    // transitionToScene() disables keyboard input during fades; ensure it is re-enabled
    // when entering the interior so controls don't freeze after re-entry.
    if (this.input.keyboard) {
      this.input.keyboard.enabled = true;
    }
    this.controls = new SceneControls(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.inTransition = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });
    bindSafeResetToPlaza(this, () => {
      transitionToWorldScene(this, SAFE_PLAZA_RETURN.X, SAFE_PLAZA_RETURN.Y);
    });

    const unsubCasinoClose = eventBus.on(EVENTS.CASINO_CLOSE, () => {
      if (!this.scene?.isActive('CasinoInterior')) return;
      this.overlayMode = null;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
      this.updateStationProximity();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => unsubCasinoClose());

    this.roomW = 680;
    this.roomH = 400;
    this.roomX = (width - this.roomW) / 2;
    this.roomY = (height - this.roomH) / 2;
    const roomX = this.roomX;
    const roomY = this.roomY;
    const roomR = roomX + this.roomW;
    const roomB = roomY + this.roomH;
    const cx = width / 2;
    const GOLD = 0xf5c842;
    const GREEN = 0x0d4a1c;

    const bg = this.add.graphics();
    bg.fillStyle(0x020008);
    bg.fillRect(0, 0, width, height);

    // ── Marquesina de puntos parpadeantes en bordes de la sala ────
    try {
      const marqueeColors = [0xF5C842, 0xFF3A3A, 0xF5C842, 0xFFFFFF, 0xF5C842, 0xFF3A3A];
      const marqueeDots: Phaser.GameObjects.Graphics[] = [];
      const marqueeSpacing = 24;
      // Top edge
      for (let mx2 = (width - this.roomW) / 2; mx2 <= (width + this.roomW) / 2; mx2 += marqueeSpacing) {
        const dot = this.add.graphics().setDepth(2);
        const col = marqueeColors[Math.floor(mx2 / marqueeSpacing) % marqueeColors.length];
        dot.fillStyle(col, 0.9);
        dot.fillCircle(mx2, (height - this.roomH) / 2 + 4, 3);
        dot.fillStyle(col, 0.15);
        dot.fillCircle(mx2, (height - this.roomH) / 2 + 4, 6);
        marqueeDots.push(dot);
      }
      // Bottom edge
      for (let mx2 = (width - this.roomW) / 2; mx2 <= (width + this.roomW) / 2; mx2 += marqueeSpacing) {
        const dot = this.add.graphics().setDepth(2);
        const col = marqueeColors[Math.floor(mx2 / marqueeSpacing) % marqueeColors.length];
        dot.fillStyle(col, 0.9);
        dot.fillCircle(mx2, (height + this.roomH) / 2 - 4, 3);
        dot.fillStyle(col, 0.15);
        dot.fillCircle(mx2, (height + this.roomH) / 2 - 4, 6);
        marqueeDots.push(dot);
      }
      // Left + right edges
      for (let my2 = (height - this.roomH) / 2 + marqueeSpacing; my2 < (height + this.roomH) / 2 - marqueeSpacing; my2 += marqueeSpacing) {
        const dotL = this.add.graphics().setDepth(2);
        const dotR = this.add.graphics().setDepth(2);
        const col = marqueeColors[Math.floor(my2 / marqueeSpacing) % marqueeColors.length];
        dotL.fillStyle(col, 0.9); dotL.fillCircle((width - this.roomW) / 2 + 4, my2, 3);
        dotL.fillStyle(col, 0.15); dotL.fillCircle((width - this.roomW) / 2 + 4, my2, 6);
        dotR.fillStyle(col, 0.9); dotR.fillCircle((width + this.roomW) / 2 - 4, my2, 3);
        dotR.fillStyle(col, 0.15); dotR.fillCircle((width + this.roomW) / 2 - 4, my2, 6);
        marqueeDots.push(dotL, dotR);
      }
      // Animate marquee in wave pattern
      marqueeDots.forEach((dot, di) => {
        this.tweens.add({
          targets: dot,
          alpha: { from: 0.2, to: 1 },
          duration: 300,
          yoyo: true,
          repeat: -1,
          delay: (di * 60) % 900,
          ease: 'Stepped',
          easeParams: [2],
        });
      });
    } catch (e) { console.error('[CasinoInterior] marquee lights failed', e); }

    const room = this.add.graphics();
    room.fillStyle(0x0c0820);
    room.fillRect(roomX, roomY, this.roomW, this.roomH);
    room.fillStyle(0x080614);
    room.fillRect(roomX, roomY, this.roomW, 90);
    room.lineStyle(1, 0x1a0e30, 0.8);
    room.lineBetween(roomX, roomY + 90, roomR, roomY + 90);
    for (let wx = roomX + 20; wx < roomR; wx += 20) { room.lineStyle(1, 0x0c0a1e, 0.5); room.lineBetween(wx, roomY, wx, roomY + 90); }
    room.lineStyle(1, 0x110820, 0.35);
    for (let wy = roomY + 95; wy < roomB - 90; wy += 18) room.lineBetween(roomX, wy, roomR, wy);
    room.fillStyle(GREEN);
    room.fillRect(roomX, roomB - 90, this.roomW, 90);
    for (let fy = roomB - 90; fy < roomB; fy += 10) { room.lineStyle(1, 0x0a3c16, 0.55); room.lineBetween(roomX, fy, roomR, fy); }
    room.lineStyle(1, GOLD, 0.18);
    room.lineBetween(roomX, roomB - 90, roomR, roomB - 90);
    room.lineStyle(1, GOLD, 0.1);
    room.strokeRect(roomX - 3, roomY - 3, this.roomW + 6, this.roomH + 6);
    room.lineStyle(2, GOLD, 0.72);
    room.strokeRect(roomX, roomY, this.roomW, this.roomH);
    const cornerLength = 18;
    [[roomX, roomY], [roomR, roomY], [roomX, roomB], [roomR, roomB]].forEach(([bx, by], index) => {
      room.lineStyle(2, GOLD, 1);
      const sx = index % 2 === 0 ? 1 : -1;
      const sy = index < 2 ? 1 : -1;
      room.lineBetween(bx, by, bx + sx * cornerLength, by);
      room.lineBetween(bx, by, bx, by + sy * cornerLength);
    });

    const chandelier = this.add.graphics();
    chandelier.lineStyle(1, 0x8a7a30, 0.8);
    chandelier.lineBetween(cx, roomY, cx, roomY + 24);
    chandelier.fillStyle(0x6a5a20);
    chandelier.fillRect(cx - 22, roomY + 24, 44, 12);
    chandelier.lineStyle(1, GOLD, 0.7);
    chandelier.strokeRect(cx - 22, roomY + 24, 44, 12);
    [-18, -9, 0, 9, 18].forEach((ox) => {
      chandelier.lineStyle(1, 0x8a7a30, 0.6);
      chandelier.lineBetween(cx + ox, roomY + 36, cx + ox, roomY + 46);
      chandelier.fillStyle(GOLD, 0.85);
      chandelier.fillCircle(cx + ox, roomY + 48, 3);
    });
    chandelier.fillStyle(GOLD, 0.05);
    chandelier.fillTriangle(cx - 28, roomY + 48, cx + 28, roomY + 48, cx, roomY + 110);
    [cx - 240, cx + 240].forEach((lx) => {
      chandelier.lineStyle(1, 0x3a3030, 0.5);
      chandelier.lineBetween(lx, roomY, lx, roomY + 14);
      chandelier.fillStyle(0x1e1616);
      chandelier.fillRect(lx - 7, roomY + 14, 14, 8);
      chandelier.lineStyle(1, GOLD, 0.35);
      chandelier.strokeRect(lx - 7, roomY + 14, 14, 8);
      chandelier.fillStyle(GOLD, 0.04);
      chandelier.fillTriangle(lx - 9, roomY + 22, lx + 9, roomY + 22, lx, roomY + 66);
    });

    [roomX + 22, roomR - 22].forEach((sx, side) => {
      const suitPairs = side === 0 ? ['S', 'H'] : ['D', 'C'];
      const suitColors = side === 0 ? ['#dddddd', '#ff4444'] : ['#ff4444', '#dddddd'];
      suitPairs.forEach((suit, i) => {
        this.add.text(sx, roomY + 26 + i * 40, suit, { fontSize: '18px', fontFamily: 'serif', color: suitColors[i] }).setOrigin(0.5).setDepth(1).setAlpha(0.12);
      });
    });

    const signW = 180; const signH = 30; const signX = cx - signW / 2; const signY = roomY + 18;
    const signBg = this.add.graphics();
    signBg.fillStyle(0x060412); signBg.fillRect(signX, signY, signW, signH); signBg.lineStyle(2, GOLD, 0.95); signBg.strokeRect(signX, signY, signW, signH); signBg.fillStyle(GOLD, 0.1); signBg.fillRect(signX - 5, signY - 3, signW + 10, signH + 6);
    const neonSign = this.add.text(cx, signY + signH / 2, 'CASINO', { fontSize: '12px', fontFamily: '"Press Start 2P", monospace', color: '#F5C842', stroke: '#000000', strokeThickness: 2 }).setOrigin(0.5).setDepth(5);
    this.tweens.add({ targets: [neonSign, signBg], alpha: { from: 1, to: 0.5 }, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.stations = [
      { id: 'slots', label: 'SLOTS', cx: roomX + 110, cy: roomY + 240, triggerR: 70, color: 0xF5C842 },
      { id: 'roulette', label: 'RULETA', cx: roomX + 280, cy: roomY + 260, triggerR: 75, color: 0xFF3A3A },
      { id: 'blackjack', label: 'BLACKJACK', cx: roomX + 460, cy: roomY + 260, triggerR: 75, color: 0x22CC88 },
      { id: 'poker', label: 'POKER', cx, cy: roomY + 170, triggerR: 85, color: 0x8B5CF6 },
    ];

    this.drawSlots(roomX, roomY, GOLD);
    this.drawRoulette(roomX + 280, roomY + 260, GOLD);
    this.drawBlackjack(roomX + 460, roomY + 260, GOLD);
    this.drawPokerTable(cx, roomY + 170, GOLD);

    // ── Glow ambiental bajo la mesa de poker ──────────────────────
    try {
      const pokerGlow = this.add.graphics().setDepth(1);
      pokerGlow.fillStyle(0x0d4a1c, 0.18);
      pokerGlow.fillEllipse(cx, roomY + 170, 260, 120);
      pokerGlow.fillStyle(GOLD, 0.04);
      pokerGlow.fillEllipse(cx, roomY + 170, 240, 100);
      this.tweens.add({
        targets: pokerGlow,
        alpha: { from: 0.7, to: 1 },
        duration: 3000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } catch (e) { console.error('[CasinoInterior] poker glow failed', e); }

    // ── Fichas / chips decorativos ────────────────────────────────
    try {
      const chipData = [
        { x: cx - 80, y: roomY + 340, col: 0xF5C842 },
        { x: cx - 60, y: roomY + 348, col: 0xFF3A3A },
        { x: cx + 70, y: roomY + 338, col: 0x4444ff },
        { x: cx + 90, y: roomY + 345, col: 0xF5C842 },
        { x: roomX + 90, y: roomY + 340, col: 0x22CC88 },
        { x: roomX + 104, y: roomY + 348, col: 0xFF3A3A },
        { x: roomX + this.roomW - 90, y: roomY + 340, col: 0xF5C842 },
        { x: roomX + this.roomW - 106, y: roomY + 348, col: 0x8B5CF6 },
      ];
      const chipG = this.add.graphics().setDepth(2);
      chipData.forEach(({ x, y, col }) => {
        chipG.lineStyle(2, col, 0.85);
        chipG.strokeCircle(x, y, 7);
        chipG.lineStyle(1, col, 0.4);
        chipG.strokeCircle(x, y, 5);
        chipG.fillStyle(col, 0.2);
        chipG.fillCircle(x, y, 7);
        chipG.lineStyle(1, col, 0.7);
        for (let ca = 0; ca < 360; ca += 45) {
          const rad = Phaser.Math.DegToRad(ca);
          chipG.lineBetween(
            x + Math.cos(rad) * 4, y + Math.sin(rad) * 4,
            x + Math.cos(rad) * 6, y + Math.sin(rad) * 6,
          );
        }
      });
    } catch (e) { console.error('[CasinoInterior] chips failed', e); }

    this.stations.forEach((station) => {
      const hint = this.createStationHint(station.label, station.color);
      hint.setPosition(station.cx, station.cy - 70);
      hint.setVisible(false);
      this.stationHints.set(station.id, hint);
      const highlight = this.add.graphics();
      highlight.setDepth(9);
      this.stationHighlights.set(station.id, highlight);
    });

    this.toastText = this.add.text(cx, roomY + this.roomH / 2, '', { fontSize: '10px', fontFamily: '"Press Start 2P", monospace', color: '#F5C842', backgroundColor: '#000000', padding: { x: 14, y: 8 } }).setOrigin(0.5).setDepth(40).setAlpha(0);

    this.px = cx;
    this.py = roomB - 80;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(10);

    this.room = new InteriorRoom(this, {
      roomKey: 'waspi-room-casino',
      getPosition: () => ({ x: this.px, y: this.py }),
      getMovement: () => ({ dx: this.lastMoveDx, dy: this.lastMoveDy, isMoving: this.lastIsMoving }),
      getAvatarConfig: () => loadStoredAvatarConfig(),
      onRemoteClick: (playerId, username) => eventBus.emit(EVENTS.PLAYER_ACTIONS_OPEN, { playerId, username }),
    });
    this.room.start();

    this.add.text(cx, roomB + 16, 'VOLVER / BACK PARA SALIR', { fontSize: '7px', fontFamily: '"Silkscreen", monospace', color: '#2a1a40' }).setOrigin(0.5);
    createBackButton(this, () => { if (this.overlayMode) { this.closeOverlay(); return; } this.exitToWorld(); });
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private clearCasinoVisuals() {
    for (const obj of this.casinoVisuals) {
      if (obj && (obj as Phaser.GameObjects.GameObject).active) (obj as Phaser.GameObjects.GameObject).destroy();
    }
    this.casinoVisuals = [];
    for (const tw of this.casinoTweens) { tw.stop(); }
    this.casinoTweens = [];
    this.rouletteWheelTween?.stop();
    this.rouletteWheelTween = undefined;
  }

  private addV<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.casinoVisuals.push(obj);
    return obj;
  }

  private drawSlots(roomX: number, roomY: number, gold: number) {
    const g = this.add.graphics();
    const purple = 0x8b5cf6;
    const machines = [{ mx: roomX + 62 }, { mx: roomX + 112 }, { mx: roomX + 162 }];
    this.add.text(roomX + 112, roomY + 108, 'SLOTS', { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#F5C842' }).setOrigin(0.5).setDepth(3);
    machines.forEach(({ mx }) => {
      const my = roomY + 118; const mw = 38; const mh = 88;
      g.fillStyle(0x1a0a30); g.fillRect(mx, my, mw, mh); g.lineStyle(2, gold, 0.7); g.strokeRect(mx, my, mw, mh); g.fillStyle(purple, 0.8); g.fillRect(mx + 2, my + 2, mw - 4, 8);
      g.fillStyle(0x060210); g.fillRect(mx + 4, my + 14, mw - 8, 32); g.lineStyle(1, gold, 0.45); g.strokeRect(mx + 4, my + 14, mw - 8, 32);
      g.lineStyle(1, gold, 0.25); g.lineBetween(mx + 4 + (mw - 8) / 3, my + 14, mx + 4 + (mw - 8) / 3, my + 46); g.lineBetween(mx + 4 + ((mw - 8) * 2) / 3, my + 14, mx + 4 + ((mw - 8) * 2) / 3, my + 46);
      this.add.text(mx + mw / 2, my + 30, '7', { fontSize: '14px', fontFamily: '"Press Start 2P", monospace', color: '#F5C842' }).setOrigin(0.5).setDepth(3);
      g.fillStyle(0x000000); g.fillRect(mx + mw / 2 - 6, my + 54, 12, 4); g.lineStyle(1, gold, 0.4); g.strokeRect(mx + mw / 2 - 6, my + 54, 12, 4);
      g.lineStyle(2, 0xaa8820, 0.9); g.lineBetween(mx + mw - 2, my + 38, mx + mw + 10, my + 30); g.fillStyle(0xaa8820); g.fillCircle(mx + mw + 10, my + 28, 4);
      g.fillStyle(0x120820); g.fillRect(mx - 2, my + mh, mw + 4, 8);
    });
  }

  private drawRoulette(tcx: number, tcy: number, gold: number) {
    const g = this.add.graphics(); const tw = 150; const th = 70;
    g.fillStyle(0x0d4a1c); g.fillEllipse(tcx, tcy, tw, th); g.lineStyle(2, gold, 0.65); g.strokeEllipse(tcx, tcy, tw, th); g.fillStyle(0x0e5a22, 0.6); g.fillEllipse(tcx, tcy - 4, tw - 20, th - 20);
    g.fillStyle(0x0a0a0a); g.fillCircle(tcx, tcy - 4, 22); g.lineStyle(2, gold, 0.8); g.strokeCircle(tcx, tcy - 4, 22);
    for (let angle = 0; angle < 360; angle += 30) { const rad = Phaser.Math.DegToRad(angle); g.lineStyle(1, gold, 0.3); g.lineBetween(tcx, tcy - 4, tcx + Math.cos(rad) * 20, tcy - 4 + Math.sin(rad) * 20); }
    g.fillStyle(gold); g.fillCircle(tcx, tcy - 4, 3);
    this.add.text(tcx, tcy + th / 2 + 12, 'RULETA', { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#FF3A3A' }).setOrigin(0.5).setDepth(3);
    const gridX = tcx - 36;
    for (let n = 0; n < 4; n += 1) { g.fillStyle(n % 2 === 0 ? 0x880000 : 0x0a0a0a, 0.7); g.fillRect(gridX + n * 18, tcy + 18, 16, 10); g.lineStyle(1, gold, 0.3); g.strokeRect(gridX + n * 18, tcy + 18, 16, 10); }
    g.fillStyle(0x006600, 0.7); g.fillRect(gridX + 72, tcy + 18, 16, 10); g.lineStyle(1, gold, 0.3); g.strokeRect(gridX + 72, tcy + 18, 16, 10);
  }

  private drawBlackjack(tcx: number, tcy: number, gold: number) {
    const g = this.add.graphics(); const tw = 150; const th = 70;
    g.fillStyle(0x0d4a1c); g.fillEllipse(tcx, tcy, tw, th); g.lineStyle(2, gold, 0.65); g.strokeEllipse(tcx, tcy, tw, th); g.fillStyle(0x0e5a22, 0.6); g.fillEllipse(tcx, tcy - 4, tw - 20, th - 20);
    this.add.text(tcx, tcy - 6, 'BJ', { fontSize: '10px', fontFamily: '"Press Start 2P", monospace', color: '#F5C842' }).setOrigin(0.5).setDepth(2).setAlpha(0.35);
    [-24, -8, 8, 24].forEach((ox, index) => { g.fillStyle(index === 0 ? 0x111111 : 0xffffff, 0.85); g.fillRect(tcx + ox - 7, tcy - 30, 14, 20); g.lineStyle(1, 0x333333, 0.5); g.strokeRect(tcx + ox - 7, tcy - 30, 14, 20); });
    [-16, 0, 16].forEach((ox) => { g.fillStyle(0xffffff, 0.7); g.fillRect(tcx + ox - 7, tcy + 18, 14, 18); g.lineStyle(1, 0x333333, 0.4); g.strokeRect(tcx + ox - 7, tcy + 18, 14, 18); });
    this.add.text(tcx, tcy + th / 2 + 12, 'BLACKJACK', { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#22CC88' }).setOrigin(0.5).setDepth(3);
  }

  private drawPokerTable(tcx: number, tcy: number, gold: number) {
    const g = this.add.graphics(); const tw = 220; const th = 90;
    g.fillStyle(0x3a2a10); g.fillEllipse(tcx, tcy, tw + 12, th + 12); g.lineStyle(2, gold, 0.6); g.strokeEllipse(tcx, tcy, tw + 12, th + 12); g.fillStyle(0x0d4a1c); g.fillEllipse(tcx, tcy, tw, th); g.lineStyle(1, 0x1a6030, 0.5); g.strokeEllipse(tcx, tcy, tw - 14, th - 14);
    [-40, -20, 0, 20, 40].forEach((ox) => { g.fillStyle(0xffffff, 0.75); g.fillRect(tcx + ox - 7, tcy - 10, 14, 20); g.lineStyle(1, 0x333333, 0.4); g.strokeRect(tcx + ox - 7, tcy - 10, 14, 20); });
    g.fillStyle(0xF5C842, 0.8); g.fillCircle(tcx, tcy + 14, 6); g.fillStyle(0xFF3A3A, 0.8); g.fillCircle(tcx + 8, tcy + 16, 5); g.fillStyle(0x4444ff, 0.8); g.fillCircle(tcx - 8, tcy + 16, 5);
    const seats = [{ angle: -90 }, { angle: -30 }, { angle: 30 }, { angle: 90 }, { angle: 150 }, { angle: 210 }];
    seats.forEach(({ angle }) => { const rad = Phaser.Math.DegToRad(angle); const sx = tcx + Math.cos(rad) * (tw / 2 + 16); const sy = tcy + Math.sin(rad) * (th / 2 + 14); g.fillStyle(0x2a1a40); g.fillCircle(sx, sy, 8); g.lineStyle(1, gold, 0.45); g.strokeCircle(sx, sy, 8); });
    this.add.text(tcx, tcy + th / 2 + 20, 'POKER TABLE', { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#8B5CF6' }).setOrigin(0.5).setDepth(3);
  }

  private createStationHint(label: string, color: number): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.82); g.fillRect(-64, -14, 128, 28); g.lineStyle(1, color, 0.9); g.strokeRect(-64, -14, 128, 28);
    const txt = this.add.text(0, 0, `[INTERACT] ${label}`, { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: `#${color.toString(16).padStart(6, '0')}` }).setOrigin(0.5);
    const c = this.add.container(0, 0, [g, txt]); c.setDepth(15); return c;
  }

  private showToast(message: string) {
    if (!this.toastText) return;
    this.toastTween?.stop();
    this.toastText.setText(message);
    this.toastText.setAlpha(1);
    this.toastTween = this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1600, duration: 400, ease: 'Sine.easeIn' });
  }

  update(_time: number, delta: number) {
    if (this.inTransition) return;
    if (this.overlayMode) {
      this.room?.update();
      return;
    }
    this.handleMovement(delta);
    this.room?.update();
    this.updateStationProximity();
    if (this.controls.isActionJustDown('back')) { this.exitToWorld(); return; }
    if (this.controls.isActionJustDown('interact') && this.nearbyStation) this.activateStation(this.nearbyStation);
  }

  private activateStation(stationId: StationId) {
    if (stationId === 'slots') { this.openSlots(); return; }
    if (stationId === 'roulette') { this.openRoulette(); return; }
    if (stationId === 'blackjack') { this.openBlackjack(); return; }
    if (stationId === 'poker') { this.openPoker(); return; }
  }

  private openSlots() {
    this.overlayMode = 'slots';
    this.hideStationUi();
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    eventBus.emit(EVENTS.CASINO_OPEN, { game: 'slots' });
  }

  private openRoulette() {
    this.overlayMode = 'roulette';
    this.hideStationUi();
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    eventBus.emit(EVENTS.CASINO_OPEN, { game: 'roulette' });
  }

  private openBlackjack() {
    this.overlayMode = 'blackjack';
    this.hideStationUi();
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    eventBus.emit(EVENTS.CASINO_OPEN, { game: 'blackjack' });
  }

  private openPoker() {
    this.overlayMode = 'poker';
    this.hideStationUi();
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    eventBus.emit(EVENTS.CASINO_OPEN, { game: 'poker' });
  }

  private closeOverlay() {
    this.clearCasinoVisuals();
    this.overlayMode = null;
    this.input.enabled = true;
    if (this.input.keyboard) this.input.keyboard.enabled = true;
    eventBus.emit(EVENTS.CASINO_CLOSE);
    this.updateStationProximity();
  }
  private updateStationProximity() {
    if (this.overlayMode) { this.hideStationUi(); return; }
    let nearest: StationId | null = null;
    let nearestDist = Infinity;
    for (const station of this.stations) {
      const dx = this.px - station.cx; const dy = this.py - station.cy; const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < station.triggerR && dist < nearestDist) { nearest = station.id; nearestDist = dist; }
    }
    if (nearest !== this.nearbyStation) {
      if (this.nearbyStation) this.stationHints.get(this.nearbyStation)?.setVisible(false);
      if (nearest) this.stationHints.get(nearest)?.setVisible(true);
      this.nearbyStation = nearest;
    }
    this.stationHighlights.forEach((graphic, id) => {
      graphic.clear();
      const station = this.stations.find((entry) => entry.id === id);
      if (!station) return;
      if (id === nearest) {
        graphic.lineStyle(2, station.color, 0.9); graphic.strokeCircle(station.cx, station.cy, station.triggerR - 8);
        graphic.lineStyle(1, 0xf5c842, 0.22); graphic.strokeCircle(station.cx, station.cy, station.triggerR - 2);
      }
    });
  }

  private hideStationUi() {
    this.stationHints.forEach((hint) => hint.setVisible(false));
    this.stationHighlights.forEach((graphic) => graphic.clear());
    this.nearbyStation = null;
  }

  private handleMovement(delta: number) {
    const movement = this.controls.readMovementStep(delta, 180, true);
    const rX = (this.scale.width - this.roomW) / 2 + 20;
    const rY = (this.scale.height - this.roomH) / 2 + 20;
    this.px = Phaser.Math.Clamp(this.px + movement.stepX, rX, rX + this.roomW - 40);
    this.py = Phaser.Math.Clamp(this.py + movement.stepY, rY + 80, rY + this.roomH - 10);
    this.player.update(movement.dx !== 0 || movement.dy !== 0, movement.dx, movement.dy);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
    this.lastMoveDx = movement.dx; this.lastMoveDy = movement.dy; this.lastIsMoving = movement.dx !== 0 || movement.dy !== 0;
  }

  private exitToWorld() {
    if (this.inTransition) return;
    if (this.overlayMode) {
      this.closeOverlay();
    }
    const ok = transitionToWorldScene(this, this.worldExitX, this.worldExitY);
    if (ok) this.inTransition = true;
  }

  private handleSceneShutdown() {
    try {
      this.clearCasinoVisuals();
    } catch (e) { console.error('[CasinoInterior] clearCasinoVisuals shutdown failed', e); }

    try {
      this.hideStationUi();
    } catch (e) { console.error('[CasinoInterior] hideStationUi shutdown failed', e); }

    try {
      this.toastTween?.stop();
      this.toastTween = undefined;
      this.toastText?.destroy();
      this.toastText = undefined;
    } catch (e) { console.error('[CasinoInterior] toast cleanup failed', e); }

    try {
      eventBus.emit(EVENTS.CASINO_CLOSE);
    } catch (e) { console.error('[CasinoInterior] CASINO_CLOSE emit failed', e); }

    this.overlayMode = null;
    this.input.enabled = true;
    if (this.input.keyboard) this.input.keyboard.enabled = true;

    this.room?.shutdown();
    this.room = undefined;
  }
}
