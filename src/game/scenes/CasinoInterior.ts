import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { BUILDINGS, SAFE_PLAZA_RETURN, ZONES } from '../config/constants';
import { announceScene, bindSafeResetToPlaza, createBackButton, transitionToScene } from '../systems/SceneUi';
import { InteriorRoom } from '../systems/InteriorRoom';
import { eventBus, EVENTS } from '../config/eventBus';
import { SceneControls } from '../systems/SceneControls';
import { addTenks, getTenksBalance, spendTenks } from '../systems/TenksSystem';
import { safeSceneDelayedCall } from '../systems/AnimationSafety';

type StationId = 'slots' | 'roulette' | 'blackjack' | 'poker';
interface Station { id: StationId; label: string; cx: number; cy: number; triggerR: number; color: number; }
type CasinoOverlayMode = 'slots' | 'blackjack' | null;
type BlackjackPhase = 'bet' | 'player' | 'dealer' | 'result';
interface SlotsState { betIndex: number; reels: string[]; resultText: string; spinning: boolean; spinToken: number; }
interface BlackjackState { phase: BlackjackPhase; betIndex: number; playerCards: number[]; dealerCards: number[]; dealerHidden: boolean; actionIndex: number; resultText: string; currentBet: number; deck: number[]; settled: boolean; handToken: number; }

const SLOT_BETS = [100, 250, 500, 1000] as const;
const BLACKJACK_BETS = [100, 250, 500, 1000] as const;
const SLOT_SYMBOLS = ['7', 'BAR', 'WASP', 'STAR', 'BELL'] as const;
const BLACKJACK_ACTIONS = ['HIT', 'STAND'] as const;

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
  private overlayBg?: Phaser.GameObjects.Graphics;
  private overlayFrame?: Phaser.GameObjects.Graphics;
  private overlayTitle?: Phaser.GameObjects.Text;
  private overlayBody?: Phaser.GameObjects.Text;
  private overlayFooter?: Phaser.GameObjects.Text;
  private overlayAccent?: Phaser.GameObjects.Text;
  private slotsState: SlotsState = { betIndex: 0, reels: ['7', '7', '7'], resultText: 'ELEGI UNA APUESTA Y GIRA.', spinning: false, spinToken: 0 };
  private blackjackState: BlackjackState = { phase: 'bet', betIndex: 0, playerCards: [], dealerCards: [], dealerHidden: true, actionIndex: 0, resultText: 'ELEGI UNA APUESTA Y REPARTE.', currentBet: 0, deck: [], settled: false, handToken: 0 };

  constructor() { super({ key: 'CasinoInterior' }); }

  create() {
    const { width, height } = this.scale;
    announceScene(this);
    this.input.enabled = true;
    this.controls = new SceneControls(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    bindSafeResetToPlaza(this, () => {
      transitionToScene(this, 'WorldScene', { returnX: SAFE_PLAZA_RETURN.X, returnY: SAFE_PLAZA_RETURN.Y });
    });

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
    this.buildOverlayUi(cx, roomY + this.roomH / 2);

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

  private buildOverlayUi(cx: number, cy: number) {
    this.overlayBg = this.add.graphics().setDepth(30).setVisible(false);
    this.overlayFrame = this.add.graphics().setDepth(31).setVisible(false);
    this.overlayAccent = this.add.text(cx, cy - 92, '', { fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: '#F5C842' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.overlayTitle = this.add.text(cx, cy - 62, '', { fontSize: '12px', fontFamily: '"Press Start 2P", monospace', color: '#ffffff', align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.overlayBody = this.add.text(cx, cy, '', { fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: '#dcd6ff', align: 'center', lineSpacing: 8, wordWrap: { width: 420 } }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.overlayFooter = this.add.text(cx, cy + 92, '', { fontSize: '7px', fontFamily: '"Press Start 2P", monospace', color: '#F5C842', align: 'center' }).setOrigin(0.5).setDepth(32).setVisible(false);
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
      this.handleOverlayInput();
      if (this.controls.isActionJustDown('back')) this.closeOverlay();
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
    if (stationId === 'blackjack') { this.openBlackjack(); return; }
    this.showToast('ESTA MESA LLEGA DESPUES.');
  }

  private openSlots() {
    this.overlayMode = 'slots';
    this.slotsState = { betIndex: 0, reels: ['7', '7', '7'], resultText: 'ELEGI UNA APUESTA Y GIRA.', spinning: false, spinToken: this.slotsState.spinToken };
    this.setOverlayVisible(true);
    this.redrawOverlay();
    this.hideStationUi();
  }

  private openBlackjack() {
    this.overlayMode = 'blackjack';
    this.blackjackState = { phase: 'bet', betIndex: 0, playerCards: [], dealerCards: [], dealerHidden: true, actionIndex: 0, resultText: 'ELEGI UNA APUESTA Y REPARTE.', currentBet: 0, deck: [], settled: false, handToken: this.blackjackState.handToken + 1 };
    this.setOverlayVisible(true);
    this.redrawOverlay();
    this.hideStationUi();
  }

  private closeOverlay() {
    if (this.overlayMode === 'slots' && this.slotsState.spinning) {
      this.slotsState.spinToken += 1;
      this.slotsState.spinning = false;
    }
    if (this.overlayMode === 'blackjack') {
      this.blackjackState.handToken += 1;
    }
    this.overlayMode = null;
    this.setOverlayVisible(false);
    this.updateStationProximity();
  }

  private setOverlayVisible(visible: boolean) {
    this.overlayBg?.setVisible(visible); this.overlayFrame?.setVisible(visible); this.overlayTitle?.setVisible(visible); this.overlayBody?.setVisible(visible); this.overlayFooter?.setVisible(visible); this.overlayAccent?.setVisible(visible);
    if (!visible) { this.overlayBg?.clear(); this.overlayFrame?.clear(); }
  }

  private redrawOverlay() {
    if (!this.overlayMode || !this.overlayBg || !this.overlayFrame || !this.overlayTitle || !this.overlayBody || !this.overlayFooter || !this.overlayAccent) return;
    const cx = this.scale.width / 2; const cy = this.roomY + this.roomH / 2; const panelW = 500; const panelH = 230; const panelX = cx - panelW / 2; const panelY = cy - panelH / 2; const accentColor = this.overlayMode === 'slots' ? 0xF5C842 : 0x22CC88;
    this.overlayBg.clear(); this.overlayBg.fillStyle(0x000000, 0.78); this.overlayBg.fillRect(0, 0, this.scale.width, this.scale.height); this.overlayBg.fillStyle(0x0a0716, 0.96); this.overlayBg.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    this.overlayFrame.clear(); this.overlayFrame.lineStyle(2, accentColor, 0.95); this.overlayFrame.strokeRoundedRect(panelX, panelY, panelW, panelH, 12); this.overlayFrame.lineStyle(1, 0xF5C842, 0.2); this.overlayFrame.strokeRoundedRect(panelX + 6, panelY + 6, panelW - 12, panelH - 12, 10);
    if (this.overlayMode === 'slots') { this.renderSlotsOverlay(); return; }
    this.renderBlackjackOverlay();
  }
  private handleOverlayInput() {
    if (this.overlayMode === 'slots') { this.handleSlotsInput(); return; }
    if (this.overlayMode === 'blackjack') this.handleBlackjackInput();
  }

  private handleSlotsInput() {
    if (this.slotsState.spinning) return;
    if (this.controls.isMovementDirectionJustDown('left')) { this.slotsState.betIndex = (this.slotsState.betIndex + SLOT_BETS.length - 1) % SLOT_BETS.length; this.redrawOverlay(); }
    if (this.controls.isMovementDirectionJustDown('right')) { this.slotsState.betIndex = (this.slotsState.betIndex + 1) % SLOT_BETS.length; this.redrawOverlay(); }
    if (this.controls.isActionJustDown('interact')) this.startSlotsSpin();
  }

  private startSlotsSpin() {
    const bet = SLOT_BETS[this.slotsState.betIndex];
    if (!spendTenks(bet, 'casino_slots_bet')) {
      this.slotsState.resultText = 'NO TENES TENKS SUFICIENTES.';
      this.redrawOverlay();
      this.showToast('NO ALCANZA PARA GIRAR.');
      return;
    }
    const finalReels = [this.randomSlotSymbol(), this.randomSlotSymbol(), this.randomSlotSymbol()];
    this.slotsState.spinning = true;
    this.slotsState.resultText = 'GIRANDO...';
    const token = this.slotsState.spinToken + 1;
    this.slotsState.spinToken = token;
    this.redrawOverlay();
    const totalTicks = 12;
    for (let tick = 0; tick < totalTicks; tick += 1) {
      safeSceneDelayedCall(this, 80 * tick, () => {
        if (this.overlayMode !== 'slots' || this.slotsState.spinToken !== token) return;
        this.slotsState.reels = tick === totalTicks - 1 ? finalReels : [this.randomSlotSymbol(), this.randomSlotSymbol(), this.randomSlotSymbol()];
        if (tick === totalTicks - 1) this.finishSlotsSpin(finalReels, bet);
        else this.redrawOverlay();
      }, 'casino slots spin');
    }
  }

  private finishSlotsSpin(reels: string[], bet: number) {
    const counts = new Map<string, number>();
    reels.forEach((symbol) => counts.set(symbol, (counts.get(symbol) ?? 0) + 1));
    const maxCount = Math.max(...counts.values());
    let payout = 0;
    let resultText = 'MALA SUERTE. OTRA MAS.';
    if (maxCount === 3 && reels[0] === '7') { payout = bet * 8; resultText = `TRIPLE 7! COBRAS ${payout} TENKS.`; }
    else if (maxCount === 3) { payout = bet * 5; resultText = `TRIPLE MATCH! COBRAS ${payout} TENKS.`; }
    else if (maxCount === 2) { payout = bet * 2; resultText = `PAREJA! COBRAS ${payout} TENKS.`; }
    if (payout > 0) { addTenks(payout, 'casino_slots_payout'); this.showToast(`+${payout} TENKS`); }
    else this.showToast('SIN PAGO');
    this.slotsState.spinning = false;
    this.slotsState.resultText = resultText;
    this.redrawOverlay();
  }

  private renderSlotsOverlay() {
    if (!this.overlayTitle || !this.overlayBody || !this.overlayFooter || !this.overlayAccent) return;
    const balance = getTenksBalance();
    const bet = SLOT_BETS[this.slotsState.betIndex];
    const betLine = SLOT_BETS.map((value, index) => (index === this.slotsState.betIndex ? `[${value}]` : `${value}`)).join('  ');
    const reelsLine = this.slotsState.reels.map((symbol) => `[ ${symbol.padEnd(4, ' ')} ]`).join('   ');
    this.overlayAccent.setText(`SALDO ${balance} TENKS`);
    this.overlayTitle.setText('SLOTS');
    this.overlayBody.setText([reelsLine, '', `APUESTA: ${bet} TENKS`, betLine, '', this.slotsState.resultText, '', 'TRIPLE 7 x8  |  TRIPLE x5  |  PAREJA x2'].join('\n'));
    this.overlayFooter.setText(this.slotsState.spinning ? 'ESPERA EL GIRO...' : '< > CAMBIA APUESTA   |   INTERACT GIRA   |   BACK CIERRA');
  }

  private handleBlackjackInput() {
    if (this.blackjackState.phase === 'dealer') return;
    if (this.blackjackState.phase === 'bet') {
      if (this.controls.isMovementDirectionJustDown('left')) { this.blackjackState.betIndex = (this.blackjackState.betIndex + BLACKJACK_BETS.length - 1) % BLACKJACK_BETS.length; this.redrawOverlay(); }
      if (this.controls.isMovementDirectionJustDown('right')) { this.blackjackState.betIndex = (this.blackjackState.betIndex + 1) % BLACKJACK_BETS.length; this.redrawOverlay(); }
      if (this.controls.isActionJustDown('interact')) this.startBlackjackHand();
      return;
    }
    if (this.blackjackState.phase === 'player') {
      if (this.controls.isMovementDirectionJustDown('left') || this.controls.isMovementDirectionJustDown('up')) { this.blackjackState.actionIndex = 0; this.redrawOverlay(); }
      if (this.controls.isMovementDirectionJustDown('right') || this.controls.isMovementDirectionJustDown('down')) { this.blackjackState.actionIndex = 1; this.redrawOverlay(); }
      if (this.controls.isActionJustDown('interact')) {
        if (this.blackjackState.actionIndex === 0) this.blackjackHit(); else this.blackjackStand();
      }
      return;
    }
    if (this.blackjackState.phase === 'result' && this.controls.isActionJustDown('interact')) this.openBlackjack();
  }

  private startBlackjackHand() {
    const bet = BLACKJACK_BETS[this.blackjackState.betIndex];
    if (!spendTenks(bet, 'casino_blackjack_bet')) {
      this.blackjackState.resultText = 'NO TENES TENKS SUFICIENTES.';
      this.redrawOverlay();
      this.showToast('NO ALCANZA PARA JUGAR.');
      return;
    }
    const handToken = this.blackjackState.handToken + 1;
    this.blackjackState.phase = 'player';
    this.blackjackState.currentBet = bet;
    this.blackjackState.deck = this.createBlackjackDeck();
    this.blackjackState.playerCards = [this.drawBlackjackCard(), this.drawBlackjackCard()];
    this.blackjackState.dealerCards = [this.drawBlackjackCard(), this.drawBlackjackCard()];
    this.blackjackState.dealerHidden = true;
    this.blackjackState.actionIndex = 0;
    this.blackjackState.settled = false;
    this.blackjackState.handToken = handToken;
    this.blackjackState.resultText = 'TU MANO. HIT O STAND.';
    const playerTotal = this.getHandTotal(this.blackjackState.playerCards);
    const dealerTotal = this.getHandTotal(this.blackjackState.dealerCards);
    if (playerTotal === 21 || dealerTotal === 21) { this.blackjackState.dealerHidden = false; this.resolveBlackjack(true); return; }
    this.redrawOverlay();
  }

  private blackjackHit() {
    this.blackjackState.playerCards.push(this.drawBlackjackCard());
    const total = this.getHandTotal(this.blackjackState.playerCards);
    if (total > 21) {
      this.blackjackState.dealerHidden = false;
      this.blackjackState.settled = true;
      this.blackjackState.phase = 'result';
      this.blackjackState.resultText = 'TE PASASTE. LA CASA GANA.';
      this.showToast('PERDISTE LA MANO');
      this.redrawOverlay();
      return;
    }
    this.blackjackState.resultText = 'TU MANO. HIT O STAND.';
    this.redrawOverlay();
  }

  private blackjackStand() {
    this.blackjackState.phase = 'dealer';
    this.blackjackState.dealerHidden = false;
    this.blackjackState.resultText = 'LA CASA JUEGA...';
    this.redrawOverlay();
    this.dealerDrawStep(this.blackjackState.handToken);
  }

  private dealerDrawStep(handToken: number) {
    safeSceneDelayedCall(this, 320, () => {
      if (this.overlayMode !== 'blackjack' || this.blackjackState.phase !== 'dealer' || this.blackjackState.handToken !== handToken) return;
      if (this.getHandTotal(this.blackjackState.dealerCards) < 17) {
        this.blackjackState.dealerCards.push(this.drawBlackjackCard());
        this.redrawOverlay();
        this.dealerDrawStep(handToken);
        return;
      }
      this.resolveBlackjack(false);
    }, 'casino blackjack dealer step');
  }
  private resolveBlackjack(fromInitialDeal: boolean) {
    if (this.blackjackState.settled && !fromInitialDeal) return;
    const bet = this.blackjackState.currentBet || BLACKJACK_BETS[this.blackjackState.betIndex];
    const playerTotal = this.getHandTotal(this.blackjackState.playerCards);
    const dealerTotal = this.getHandTotal(this.blackjackState.dealerCards);
    const playerBlackjack = this.blackjackState.playerCards.length === 2 && playerTotal === 21;
    const dealerBlackjack = this.blackjackState.dealerCards.length === 2 && dealerTotal === 21;
    let payout = 0;
    let resultText = '';
    if (playerTotal > 21) resultText = 'TE PASASTE. LA CASA GANA.';
    else if (dealerTotal > 21) { payout = bet * 2; resultText = `LA CASA SE PASO. COBRAS ${payout} TENKS.`; }
    else if (playerBlackjack && !dealerBlackjack) { payout = bet * 3; resultText = `BLACKJACK! COBRAS ${payout} TENKS.`; }
    else if (dealerBlackjack && !playerBlackjack) resultText = 'BLACKJACK DE LA CASA.';
    else if (playerTotal > dealerTotal) { payout = bet * 2; resultText = `GANASTE. COBRAS ${payout} TENKS.`; }
    else if (playerTotal < dealerTotal) resultText = 'LA CASA GANA.';
    else { payout = bet; resultText = `EMPATE. TE DEVUELVEN ${payout} TENKS.`; }
    if (fromInitialDeal && playerBlackjack && dealerBlackjack) { payout = bet; resultText = `DOBLE BLACKJACK. EMPATE, ${bet} TENKS DEVUELTOS.`; }
    if (payout > 0) { addTenks(payout, 'casino_blackjack_payout'); this.showToast(`+${payout} TENKS`); }
    else this.showToast(resultText);
    this.blackjackState.settled = true;
    this.blackjackState.phase = 'result';
    this.blackjackState.dealerHidden = false;
    this.blackjackState.resultText = resultText;
    this.redrawOverlay();
  }

  private renderBlackjackOverlay() {
    if (!this.overlayTitle || !this.overlayBody || !this.overlayFooter || !this.overlayAccent) return;
    const balance = getTenksBalance();
    const bet = BLACKJACK_BETS[this.blackjackState.betIndex];
    const betLine = BLACKJACK_BETS.map((value, index) => (index === this.blackjackState.betIndex ? `[${value}]` : `${value}`)).join('  ');
    const dealerCards = this.blackjackState.dealerCards.map((card, index) => this.blackjackState.dealerHidden && index === 1 ? '??' : this.formatCard(card)).join('  ');
    const playerCards = this.blackjackState.playerCards.map((card) => this.formatCard(card)).join('  ');
    const playerTotal = this.getHandTotal(this.blackjackState.playerCards);
    const dealerVisibleTotal = this.blackjackState.dealerHidden ? this.getHandTotal(this.blackjackState.dealerCards.slice(0, 1)) : this.getHandTotal(this.blackjackState.dealerCards);
    const actionLine = BLACKJACK_ACTIONS.map((label, index) => (index === this.blackjackState.actionIndex ? `[${label}]` : label)).join('   ');
    this.overlayAccent.setText(`SALDO ${balance} TENKS`);
    this.overlayTitle.setText('BLACKJACK');
    this.overlayBody.setText([
      `DEALER: ${dealerCards || '--'}   (${dealerVisibleTotal || 0})`,
      '',
      `JUGADOR: ${playerCards || '--'}   (${playerTotal || 0})`,
      '',
      `APUESTA: ${bet} TENKS`,
      this.blackjackState.phase === 'bet' ? betLine : actionLine,
      '',
      this.blackjackState.resultText,
    ].join('\n'));
    let footer = 'BACK CIERRA';
    if (this.blackjackState.phase === 'bet') footer = '< > CAMBIA APUESTA   |   INTERACT REPARTE   |   BACK CIERRA';
    else if (this.blackjackState.phase === 'player') footer = '< > ELIGE ACCION   |   INTERACT CONFIRMA   |   BACK CIERRA';
    else if (this.blackjackState.phase === 'dealer') footer = 'LA CASA ESTA JUGANDO...';
    else if (this.blackjackState.phase === 'result') footer = 'INTERACT JUGAR OTRA   |   BACK CIERRA';
    this.overlayFooter.setText(footer);
  }

  private randomSlotSymbol() { return Phaser.Utils.Array.GetRandom([...SLOT_SYMBOLS]); }
  private createBlackjackDeck() {
    const deck: number[] = [];
    for (let suit = 0; suit < 4; suit += 1) {
      for (let rank = 1; rank <= 13; rank += 1) deck.push(rank);
    }
    return Phaser.Utils.Array.Shuffle(deck);
  }

  private drawBlackjackCard() {
    if (this.blackjackState.deck.length === 0) {
      this.blackjackState.deck = this.createBlackjackDeck();
    }
    return this.blackjackState.deck.pop() ?? Phaser.Math.Between(1, 13);
  }

  private formatCard(card: number) { if (card === 1) return 'A'; if (card === 11) return 'J'; if (card === 12) return 'Q'; if (card === 13) return 'K'; return String(card); }

  private getHandTotal(cards: number[]) {
    let total = 0; let aces = 0;
    cards.forEach((card) => {
      if (card === 1) { aces += 1; total += 11; }
      else if (card >= 10) total += 10;
      else total += card;
    });
    while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
    return total;
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
    this.inTransition = true;
    transitionToScene(this, 'WorldScene', { returnX: CasinoInterior.RETURN_X, returnY: CasinoInterior.RETURN_Y });
  }

  private handleSceneShutdown() {
    this.room?.shutdown();
    this.room = undefined;
  }
}
