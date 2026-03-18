import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { BUILDINGS, SAFE_PLAZA_RETURN, ZONES } from '../config/constants';
import { announceScene, bindSafeResetToPlaza, createBackButton, showSceneTitle, transitionToScene } from '../systems/SceneUi';
import { InteriorRoom } from '../systems/InteriorRoom';
import { eventBus, EVENTS } from '../config/eventBus';
import { SceneControls } from '../systems/SceneControls';
import { addTenks, getTenksBalance, spendTenks } from '../systems/TenksSystem';
import { safeSceneDelayedCall } from '../systems/AnimationSafety';

type StationId = 'slots' | 'roulette' | 'blackjack' | 'poker';
interface Station { id: StationId; label: string; cx: number; cy: number; triggerR: number; color: number; }
type CasinoOverlayMode = 'slots' | 'roulette' | 'blackjack' | 'poker' | null;
type BlackjackPhase = 'bet' | 'player' | 'dealer' | 'result';
type RouletteBetKind = 'red' | 'black' | 'even' | 'odd' | 'lucky7';
interface SlotsState { betIndex: number; reels: string[]; resultText: string; spinning: boolean; spinToken: number; }
interface BlackjackState { phase: BlackjackPhase; betIndex: number; playerCards: number[]; dealerCards: number[]; dealerHidden: boolean; actionIndex: number; resultText: string; currentBet: number; deck: number[]; settled: boolean; handToken: number; }
interface RouletteState { betIndex: number; optionIndex: number; resultText: string; spinning: boolean; spinToken: number; lastNumber: number | null; lastColor: 'red' | 'black' | 'green' | null; }
interface RouletteBetOption { id: RouletteBetKind; label: string; payout: number; color: string; }
interface PokerResult {
  label: string;
  rank: number;
  tiebreak: number[];
}
type HoldemPhase = 'ante' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
interface HoldemState { phase: HoldemPhase; anteIndex: number; playerHole: number[]; cpuHole: number[]; community: number[]; pot: number; playerPaid: number; deck: number[]; resultText: string; actionIndex: number; cpuLastAction: string; handToken: number; }

const SLOT_BETS = [50, 100, 250, 500] as const;
const ROULETTE_BETS = [100, 250, 500, 1000] as const;
const BLACKJACK_BETS = [100, 250, 500, 1000] as const;
const HOLDEM_ANTES = [100, 250, 500, 1000] as const;
const SLOT_SYMBOLS = ['7', 'BAR', 'WASP', 'STAR', 'BELL'] as const;
const ROULETTE_OPTIONS: RouletteBetOption[] = [
  { id: 'red', label: 'ROJO', payout: 2, color: '#FF5A5A' },
  { id: 'black', label: 'NEGRO', payout: 2, color: '#DDDDDD' },
  { id: 'even', label: 'PAR', payout: 2, color: '#4FD1C5' },
  { id: 'odd', label: 'IMPAR', payout: 2, color: '#F5C842' },
  { id: 'lucky7', label: 'NUM 7', payout: 12, color: '#B794F4' },
];
const ROULETTE_RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

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
  private rouletteState: RouletteState = { betIndex: 0, optionIndex: 0, resultText: 'ELEGI UNA APUESTA Y DALE AL GIRO.', spinning: false, spinToken: 0, lastNumber: null, lastColor: null };
  private blackjackState: BlackjackState = { phase: 'bet', betIndex: 0, playerCards: [], dealerCards: [], dealerHidden: true, actionIndex: 0, resultText: 'ELEGI UNA APUESTA Y REPARTE.', currentBet: 0, deck: [], settled: false, handToken: 0 };
  private holdemState: HoldemState = { phase: 'ante', anteIndex: 1, playerHole: [], cpuHole: [], community: [], pot: 0, playerPaid: 0, deck: [], resultText: 'ELEGÍ TU ANTE Y REPARTÍ.', actionIndex: 1, cpuLastAction: '', handToken: 0 };
  private casinoVisuals: Phaser.GameObjects.GameObject[] = [];
  private casinoTweens: Phaser.Tweens.Tween[] = [];
  private rouletteWheelTween?: Phaser.Tweens.Tween;

  constructor() { super({ key: 'CasinoInterior' }); }

  init() {
    this.inTransition = false;
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
    if (stationId === 'roulette') { this.openRoulette(); return; }
    if (stationId === 'blackjack') { this.openBlackjack(); return; }
    if (stationId === 'poker') { this.openPoker(); return; }
  }

  private openSlots() {
    this.overlayMode = 'slots';
    this.slotsState = { betIndex: 0, reels: ['7', '7', '7'], resultText: 'ELEGI UNA APUESTA Y GIRA.', spinning: false, spinToken: this.slotsState.spinToken };
    this.setOverlayVisible(true);
    this.redrawOverlay();
    this.hideStationUi();
  }

  private openRoulette() {
    this.overlayMode = 'roulette';
    this.rouletteState = {
      betIndex: this.rouletteState.betIndex,
      optionIndex: this.rouletteState.optionIndex,
      resultText: 'ELEGI APUESTA, TIPO Y GIRA.',
      spinning: false,
      spinToken: this.rouletteState.spinToken,
      lastNumber: this.rouletteState.lastNumber,
      lastColor: this.rouletteState.lastColor,
    };
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

  private openPoker() {
    this.overlayMode = 'poker';
    this.holdemState = { phase: 'ante', anteIndex: this.holdemState.anteIndex, playerHole: [], cpuHole: [], community: [], pot: 0, playerPaid: 0, deck: [], resultText: 'ELEGÍ TU ANTE Y REPARTÍ.', actionIndex: 1, cpuLastAction: '', handToken: this.holdemState.handToken };
    this.setOverlayVisible(true);
    this.redrawOverlay();
    this.hideStationUi();
  }

  private closeOverlay() {
    if (this.overlayMode === 'slots' && this.slotsState.spinning) {
      this.slotsState.spinToken += 1;
      this.slotsState.spinning = false;
    }
    if (this.overlayMode === 'roulette' && this.rouletteState.spinning) {
      this.rouletteState.spinToken += 1;
      this.rouletteState.spinning = false;
    }
    if (this.overlayMode === 'blackjack') {
      this.blackjackState.handToken += 1;
    }
    this.clearCasinoVisuals();
    this.overlayMode = null;
    this.setOverlayVisible(false);
    this.updateStationProximity();
  }

  private setOverlayVisible(visible: boolean) {
    this.overlayBg?.setVisible(visible); this.overlayFrame?.setVisible(visible); this.overlayTitle?.setVisible(visible); this.overlayBody?.setVisible(visible); this.overlayFooter?.setVisible(visible); this.overlayAccent?.setVisible(visible);
    if (!visible) { this.overlayBg?.clear(); this.overlayFrame?.clear(); this.clearCasinoVisuals(); }
  }

  private redrawOverlay() {
    if (!this.overlayMode || !this.overlayBg || !this.overlayFrame || !this.overlayTitle || !this.overlayBody || !this.overlayFooter || !this.overlayAccent) return;
    this.clearCasinoVisuals();
    const cx = this.scale.width / 2; const cy = this.roomY + this.roomH / 2; const panelW = 500;
    const panelH = this.overlayMode === 'poker' ? 360 : this.overlayMode === 'roulette' ? 270 : 230;
    const panelX = cx - panelW / 2; const panelY = cy - panelH / 2;
    const accentColor = this.overlayMode === 'slots' ? 0xF5C842 : this.overlayMode === 'roulette' ? 0xFF5A5A : this.overlayMode === 'poker' ? 0x8B5CF6 : 0x22CC88;
    this.overlayBg.clear(); this.overlayBg.fillStyle(0x000000, 0.78); this.overlayBg.fillRect(0, 0, this.scale.width, this.scale.height); this.overlayBg.fillStyle(0x0a0716, 0.96); this.overlayBg.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    this.overlayFrame.clear(); this.overlayFrame.lineStyle(2, accentColor, 0.95); this.overlayFrame.strokeRoundedRect(panelX, panelY, panelW, panelH, 12); this.overlayFrame.lineStyle(1, 0xF5C842, 0.2); this.overlayFrame.strokeRoundedRect(panelX + 6, panelY + 6, panelW - 12, panelH - 12, 10);
    if (this.overlayMode === 'slots') { this.renderSlotsOverlay(); return; }
    if (this.overlayMode === 'roulette') { this.renderRouletteOverlay(); return; }
    if (this.overlayMode === 'poker') { this.renderPokerOverlay(); return; }
    this.renderBlackjackOverlay();
  }
  private handleOverlayInput() {
    if (this.overlayMode === 'slots') { this.handleSlotsInput(); return; }
    if (this.overlayMode === 'roulette') { this.handleRouletteInput(); return; }
    if (this.overlayMode === 'poker') { this.handlePokerInput(); return; }
    if (this.overlayMode === 'blackjack') this.handleBlackjackInput();
  }

  private handleSlotsInput() {
    if (this.slotsState.spinning) return;
    if (this.controls.isMovementDirectionJustDown('left')) { this.slotsState.betIndex = (this.slotsState.betIndex + SLOT_BETS.length - 1) % SLOT_BETS.length; this.redrawOverlay(); }
    if (this.controls.isMovementDirectionJustDown('right')) { this.slotsState.betIndex = (this.slotsState.betIndex + 1) % SLOT_BETS.length; this.redrawOverlay(); }
    if (this.controls.isActionJustDown('interact')) this.startSlotsSpin();
  }

  private handleRouletteInput() {
    if (this.rouletteState.spinning) return;
    if (this.controls.isMovementDirectionJustDown('left')) { this.rouletteState.betIndex = (this.rouletteState.betIndex + ROULETTE_BETS.length - 1) % ROULETTE_BETS.length; this.redrawOverlay(); }
    if (this.controls.isMovementDirectionJustDown('right')) { this.rouletteState.betIndex = (this.rouletteState.betIndex + 1) % ROULETTE_BETS.length; this.redrawOverlay(); }
    if (this.controls.isMovementDirectionJustDown('up')) { this.rouletteState.optionIndex = (this.rouletteState.optionIndex + ROULETTE_OPTIONS.length - 1) % ROULETTE_OPTIONS.length; this.redrawOverlay(); }
    if (this.controls.isMovementDirectionJustDown('down')) { this.rouletteState.optionIndex = (this.rouletteState.optionIndex + 1) % ROULETTE_OPTIONS.length; this.redrawOverlay(); }
    if (this.controls.isActionJustDown('interact')) this.startRouletteSpin();
  }

  private startSlotsSpin() {
    const bet = SLOT_BETS[this.slotsState.betIndex];
    if (!spendTenks(bet, 'casino_slots_bet')) {
      this.slotsState.resultText = 'NO TENES TENKS SUFICIENTES.';
      this.redrawOverlay();
      this.showToast('NO ALCANZA PARA GIRAR.');
      return;
    }
    const slotOutcome = this.rollSlotsOutcome();
    const finalReels = slotOutcome.reels;
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
        if (tick === totalTicks - 1) this.finishSlotsSpin(slotOutcome, bet);
        else this.redrawOverlay();
      }, 'casino slots spin');
    }
  }

  private finishSlotsSpin(outcome: { reels: string[]; payoutMultiplier: number; label: string }, bet: number) {
    const payout = Math.round(bet * outcome.payoutMultiplier);
    const resultText = payout > 0
      ? `${outcome.label} COBRAS ${payout} TENKS.`
      : 'MALA SUERTE. OTRA MAS.';
    if (payout > 0) {
      addTenks(payout, 'casino_slots_payout');
      this.showToast(`+${payout} TENKS`);
      if (outcome.payoutMultiplier >= 5) {
        console.log('SFX: slots_jackpot');
        this.cameras.main.shake(180, 0.004);
      }
    } else {
      this.showToast('SIN PAGO');
    }
    this.slotsState.spinning = false;
    this.slotsState.resultText = resultText;
    this.redrawOverlay();
  }

  private rollSlotsOutcome() {
    const roll = Phaser.Math.Between(1, 1000) / 10;
    if (roll <= 2) {
      const symbol = Phaser.Math.RND.pick(['7', 'WASP']);
      return { reels: [symbol, symbol, symbol], payoutMultiplier: 8, label: 'JACKPOT!' };
    }
    if (roll <= 7) {
      const symbol = this.randomSlotSymbol();
      return { reels: [symbol, symbol, symbol], payoutMultiplier: 4, label: 'TRIPLE MATCH!' };
    }
    if (roll <= 17) {
      const symbol = this.randomSlotSymbol();
      const special = Phaser.Math.RND.pick(['7', 'STAR']);
      return { reels: [symbol, symbol, special], payoutMultiplier: 2.5, label: 'CASI JACKPOT!' };
    }
    if (roll <= 40) {
      const symbol = this.randomSlotSymbol();
      const other = this.randomSlotSymbol();
      return { reels: [symbol, symbol, other], payoutMultiplier: 1.25, label: 'PAREJA!' };
    }
    return { reels: this.buildLosingReels(), payoutMultiplier: 0, label: 'NADA' };
  }

  private buildLosingReels() {
    const symbols = Phaser.Utils.Array.Shuffle([...SLOT_SYMBOLS]);
    return [symbols[0], symbols[1], symbols[2]];
  }

  private startRouletteSpin() {
    const bet = ROULETTE_BETS[this.rouletteState.betIndex];
    if (!spendTenks(bet, 'casino_roulette_bet')) {
      this.rouletteState.resultText = 'NO TENES TENKS SUFICIENTES.';
      this.redrawOverlay();
      this.showToast('NO ALCANZA PARA GIRAR.');
      return;
    }
    const winningNumber = Phaser.Math.Between(0, 36);
    this.rouletteState.spinning = true;
    this.rouletteState.resultText = 'LA BOLA ESTA GIRANDO...';
    const token = this.rouletteState.spinToken + 1;
    this.rouletteState.spinToken = token;
    this.redrawOverlay();
    const totalTicks = 14;
    for (let tick = 0; tick < totalTicks; tick += 1) {
      safeSceneDelayedCall(this, 90 * tick, () => {
        if (this.overlayMode !== 'roulette' || this.rouletteState.spinToken !== token) return;
        const number = tick === totalTicks - 1 ? winningNumber : Phaser.Math.Between(0, 36);
        this.rouletteState.lastNumber = number;
        this.rouletteState.lastColor = this.getRouletteColor(number);
        if (tick === totalTicks - 1) this.finishRouletteSpin(number, bet);
        else this.redrawOverlay();
      }, 'casino roulette spin');
    }
  }

  private finishRouletteSpin(number: number, bet: number) {
    const option = ROULETTE_OPTIONS[this.rouletteState.optionIndex];
    const color = this.getRouletteColor(number);
    const isEven = number !== 0 && number % 2 === 0;
    const won = (option.id === 'red' && color === 'red')
      || (option.id === 'black' && color === 'black')
      || (option.id === 'even' && isEven)
      || (option.id === 'odd' && number !== 0 && !isEven)
      || (option.id === 'lucky7' && number === 7);
    const payout = won ? bet * option.payout : 0;
    if (payout > 0) {
      addTenks(payout, 'casino_roulette_payout');
      this.showToast(`+${payout} TENKS`);
      this.rouletteState.resultText = `SALIO ${number} ${color.toUpperCase()}. GANASTE ${payout} TENKS.`;
    } else {
      this.showToast('LA CASA GANA');
      this.rouletteState.resultText = `SALIO ${number} ${color.toUpperCase()}. NO COBRAS ESTA.`;
    }
    this.rouletteState.spinning = false;
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
    this.overlayBody.setText([reelsLine, '', `APUESTA: ${bet} TENKS`, betLine, '', this.slotsState.resultText, '', 'JACKPOT x8 | TRIPLE x4 | CASI x2.5 | PAREJA x1.25'].join('\n'));
    this.overlayFooter.setText(this.slotsState.spinning ? 'ESPERA EL GIRO...' : '< > CAMBIA APUESTA   |   INTERACT GIRA   |   BACK CIERRA');
  }

  private renderRouletteOverlay() {
    if (!this.overlayTitle || !this.overlayBody || !this.overlayFooter || !this.overlayAccent) return;
    const cx = this.scale.width / 2;
    const cy = this.roomY + this.roomH / 2;
    const balance = getTenksBalance();
    const { spinning, lastNumber, lastColor, betIndex, optionIndex, resultText } = this.rouletteState;
    this.overlayAccent.setPosition(cx, cy - 112).setText(`SALDO: ${balance} T`).setVisible(true);
    this.overlayTitle.setPosition(cx, cy - 95).setText('RULETA').setVisible(true);
    this.overlayBody.setVisible(false);

    // --- Wheel (left side) ---
    const WHEEL_NUMBERS = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
    const wCX = cx - 130; const wCY = cy - 20; const wR = 62;
    const wheelG = this.addV(this.add.graphics().setDepth(33));

    // Outer wood ring
    wheelG.fillStyle(0x3a2008); wheelG.fillCircle(wCX, wCY, wR + 9);
    wheelG.lineStyle(2, 0xF5C842, 0.9); wheelG.strokeCircle(wCX, wCY, wR + 9);

    // Number pockets
    const nCount = WHEEL_NUMBERS.length;
    WHEEL_NUMBERS.forEach((num, idx) => {
      const a0 = (idx / nCount) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((idx + 1) / nCount) * Math.PI * 2 - Math.PI / 2;
      const isWin = lastNumber === num && lastNumber !== null && !spinning;
      const col = isWin ? 0xF5C842 : num === 0 ? 0x007700 : ROULETTE_RED_NUMBERS.has(num) ? 0xAA1111 : 0x111111;
      wheelG.fillStyle(col); wheelG.slice(wCX, wCY, wR, a0, a1, false); wheelG.fillPath();
      // Thin divider
      wheelG.lineStyle(1, 0x000000, 0.5); wheelG.slice(wCX, wCY, wR, a0, a1, false); wheelG.strokePath();
    });

    // Inner felt circle
    wheelG.fillStyle(0x0d4a1c); wheelG.fillCircle(wCX, wCY, wR * 0.40);
    wheelG.lineStyle(2, 0xF5C842, 0.6); wheelG.strokeCircle(wCX, wCY, wR * 0.40);

    // Number in center
    const numStr = lastNumber !== null ? String(lastNumber) : '?';
    const numColor = lastNumber === null ? '#2a4a2a' : lastColor === 'red' ? '#FF5A5A' : lastColor === 'green' ? '#22CC88' : '#DDDDDD';
    this.addV(this.add.text(wCX, wCY, numStr, { fontSize: numStr.length > 1 ? '14px' : '18px', fontFamily: '"Press Start 2P", monospace', color: numColor }).setOrigin(0.5).setDepth(35));

    // Ball (Phaser Arc — can be tweened)
    const ballAngle = lastNumber !== null && !spinning
      ? (WHEEL_NUMBERS.indexOf(lastNumber) / nCount) * Math.PI * 2 - Math.PI / 2
      : -Math.PI / 2;
    const ballR = wR * 0.82;
    const ball = this.addV(this.add.arc(
      wCX + Math.cos(ballAngle) * ballR,
      wCY + Math.sin(ballAngle) * ballR,
      4, 0, 360, false, 0xfafafa
    ).setDepth(36));

    if (spinning) {
      const ballData = { theta: -Math.PI / 2 };
      this.rouletteWheelTween = this.tweens.add({
        targets: ballData, theta: ballData.theta + Math.PI * 10,
        duration: 1500, ease: 'Sine.easeOut',
        onUpdate: () => {
          ball.setPosition(wCX + Math.cos(ballData.theta) * ballR, wCY + Math.sin(ballData.theta) * ballR);
        },
      });
      this.casinoTweens.push(this.rouletteWheelTween);
    }

    // Wheel label below
    this.addV(this.add.text(wCX, wCY + wR + 16, spinning ? 'GIRANDO...' : (lastNumber !== null ? `${lastNumber} — ${(lastColor ?? '').toUpperCase()}` : 'ELEGÍ Y GIRA'), {
      fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: spinning ? '#F5C842' : numColor, align: 'center',
    }).setOrigin(0.5).setDepth(34));

    // --- Right panel controls ---
    const rx = cx + 20; // right section start x

    // Bet type pills (^ v to navigate)
    this.addV(this.add.text(rx, cy - 68, 'TIPO DE APUESTA', { fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: '#666666' }).setDepth(34));
    ROULETTE_OPTIONS.forEach((opt, idx) => {
      const py = cy - 54 + idx * 22;
      const sel = idx === optionIndex;
      const pillColor = parseInt(opt.color.replace('#', ''), 16);
      const bg = this.addV(this.add.graphics().setDepth(34));
      bg.fillStyle(sel ? pillColor : 0x111111, sel ? 0.85 : 0.6);
      bg.fillRoundedRect(rx, py - 8, 170, 18, 4);
      if (sel) { bg.lineStyle(1, 0xF5C842, 0.9); bg.strokeRoundedRect(rx, py - 8, 170, 18, 4); }
      this.addV(this.add.text(rx + 8, py, `${opt.label}  ×${opt.payout}`, { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: sel ? '#ffffff' : '#555555' }).setOrigin(0, 0.5).setDepth(35));
      if (sel) this.addV(this.add.text(rx - 10, py, '▶', { fontSize: '7px', color: '#F5C842' }).setOrigin(1, 0.5).setDepth(35));
    });

    // Bet amount chips
    const betChipY = cy + 60;
    this.addV(this.add.text(rx, betChipY - 16, 'APUESTA', { fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: '#666666' }).setDepth(34));
    ROULETTE_BETS.forEach((bv, idx) => {
      const bx = rx + idx * 44;
      const sel = idx === betIndex;
      const bg = this.addV(this.add.graphics().setDepth(34));
      bg.fillStyle(sel ? 0xFF3A3A : 0x1a0e0e, sel ? 1 : 0.8); bg.fillCircle(bx + 16, betChipY + 4, 16);
      if (sel) { bg.lineStyle(2, 0xF5C842, 0.9); bg.strokeCircle(bx + 16, betChipY + 4, 16); }
      this.addV(this.add.text(bx + 16, betChipY + 4, String(bv), { fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: sel ? '#ffffff' : '#555555' }).setOrigin(0.5).setDepth(35));
    });

    // Result text
    this.addV(this.add.text(cx, cy + 100, resultText, { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#F5C842', align: 'center', wordWrap: { width: 460 } }).setOrigin(0.5).setDepth(34));

    // Footer
    this.overlayFooter.setPosition(cx, cy + 118).setText(
      spinning ? 'ESPERÁ EL RESULTADO...' : '^ v  TIPO   |   < >  APUESTA   |   INTERACT  GIRA   |   BACK  CIERRA'
    ).setVisible(true);
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
    const cx = this.scale.width / 2;
    const cy = this.roomY + this.roomH / 2;
    const balance = getTenksBalance();
    const bet = BLACKJACK_BETS[this.blackjackState.betIndex];
    const playerTotal = this.getHandTotal(this.blackjackState.playerCards);
    const dealerVisibleTotal = this.blackjackState.dealerHidden ? this.getHandTotal(this.blackjackState.dealerCards.slice(0, 1)) : this.getHandTotal(this.blackjackState.dealerCards);
    this.overlayAccent.setPosition(cx + 170, cy - 94).setText(`TENKS: ${balance}`).setVisible(true);
    this.overlayTitle.setPosition(cx - 160, cy - 94).setText('BLACKJACK').setVisible(true);
    this.overlayBody.setVisible(false);

    const table = this.addV(this.add.graphics().setDepth(33));
    table.fillStyle(0x1a5c2a, 1);
    table.fillRoundedRect(cx - 210, cy - 80, 420, 180, 20);
    table.lineStyle(3, 0x0e0e14, 0.9);
    table.strokeRoundedRect(cx - 210, cy - 80, 420, 180, 20);
    table.lineStyle(2, 0xF5C842, 0.35);
    table.strokeRoundedRect(cx - 204, cy - 74, 408, 168, 18);
    for (let y = cy - 72; y <= cy + 88; y += 8) {
      table.lineStyle(1, 0x174f24, 0.22);
      table.lineBetween(cx - 198, y, cx + 198, y);
    }

    this.addV(this.add.text(cx, cy - 64, `DEALER (${this.blackjackState.dealerHidden ? '??' : dealerVisibleTotal})`, {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#f0f0f0',
    }).setOrigin(0.5).setDepth(35));

    this.blackjackState.dealerCards.forEach((card, index) => {
      const x = cx - 54 + index * 42;
      const y = cy - 48;
      const hidden = this.blackjackState.dealerHidden && index === 1;
      this.drawBlackjackCardVisual(x, y, card, hidden, index);
    });

    this.addV(this.add.text(cx, cy + 32, `TU MANO (${playerTotal || 0})`, {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(35));

    this.blackjackState.playerCards.forEach((card, index) => {
      const x = cx - 54 + index * 42;
      const y = cy + 46;
      this.drawBlackjackCardVisual(x, y, card, false, index);
    });

    this.addV(this.add.text(cx, cy + 8, `APUESTA: ${this.blackjackState.currentBet || bet} TENKS`, {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5).setDepth(35));

    if (this.blackjackState.phase === 'bet') {
      BLACKJACK_BETS.forEach((value, index) => {
        const bx = cx - 126 + index * 84;
        const active = index === this.blackjackState.betIndex;
        const chip = this.addV(this.add.graphics().setDepth(35));
        chip.fillStyle(active ? 0x46B3FF : 0x1a1a26, active ? 1 : 0.8);
        chip.fillRoundedRect(bx, cy + 104, 72, 20, 5);
        if (active) {
          chip.lineStyle(2, 0xF5C842, 1);
          chip.strokeRoundedRect(bx, cy + 104, 72, 20, 5);
        }
        this.addV(this.add.text(bx + 36, cy + 114, String(value), {
          fontSize: '7px',
          fontFamily: '"Press Start 2P", monospace',
          color: active ? '#ffffff' : '#8888aa',
        }).setOrigin(0.5).setDepth(36));
      });
    } else if (this.blackjackState.phase === 'player') {
      const buttons = [
        { label: 'HIT', color: 0x39FF14, text: '#000000' },
        { label: 'STAND', color: 0xF5C842, text: '#000000' },
      ];
      buttons.forEach((button, index) => {
        const bx = cx - 90 + index * 110;
        const active = index === this.blackjackState.actionIndex;
        const btn = this.addV(this.add.graphics().setDepth(35));
        btn.fillStyle(active ? button.color : 0x1a1a26, active ? 1 : 0.82);
        btn.fillRoundedRect(bx, cy + 104, 90, 22, 6);
        if (active) {
          btn.lineStyle(2, 0xffffff, 0.85);
          btn.strokeRoundedRect(bx, cy + 104, 90, 22, 6);
        }
        this.addV(this.add.text(bx + 45, cy + 115, button.label, {
          fontSize: '7px',
          fontFamily: '"Press Start 2P", monospace',
          color: active ? button.text : '#8888aa',
        }).setOrigin(0.5).setDepth(36));
      });
    }

    const resultColor = this.blackjackState.resultText.includes('BLACKJACK')
      ? '#F5C842'
      : this.blackjackState.resultText.includes('GANASTE') || this.blackjackState.resultText.includes('COBRAS')
        ? '#39FF14'
        : this.blackjackState.resultText.includes('EMPATE')
          ? '#46B3FF'
          : '#FF006E';
    this.addV(this.add.text(cx, cy + 138, this.blackjackState.resultText, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: resultColor,
      align: 'center',
      wordWrap: { width: 460 },
    }).setOrigin(0.5).setDepth(35));

    let footer = 'BACK CIERRA';
    if (this.blackjackState.phase === 'bet') footer = '< > CAMBIA APUESTA   |   INTERACT REPARTE   |   BACK CIERRA';
    else if (this.blackjackState.phase === 'player') footer = '< > ELIGE ACCION   |   INTERACT CONFIRMA   |   BACK CIERRA';
    else if (this.blackjackState.phase === 'dealer') footer = 'LA CASA ESTA JUGANDO...';
    else if (this.blackjackState.phase === 'result') footer = 'INTERACT JUGAR OTRA   |   BACK CIERRA';
    this.overlayFooter.setText(footer);
  }

  private drawBlackjackCardVisual(x: number, y: number, card: number, hidden: boolean, visualIndex: number) {
    const g = this.addV(this.add.graphics().setDepth(35));
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(x + 2, y + 2, 36, 50, 5);
    if (hidden) {
      g.fillStyle(0x0E0E14, 1);
      g.fillRoundedRect(x, y, 36, 50, 5);
      g.lineStyle(2, 0xF5C842, 0.8);
      g.strokeRoundedRect(x, y, 36, 50, 5);
      g.lineStyle(1, 0x2f2f40, 0.8);
      for (let i = -6; i < 36; i += 6) {
        g.lineBetween(x + i, y + 2, x + i + 16, y + 48);
      }
      return;
    }
    const rank = this.formatCard(card);
    const suits = ['♠', '♥', '♦', '♣'];
    const suit = suits[(card + visualIndex) % suits.length];
    const isRed = suit === '♥' || suit === '♦';
    const suitColor = isRed ? '#FF006E' : '#111111';
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(x, y, 36, 50, 5);
    g.lineStyle(1, 0xc7c7cf, 1);
    g.strokeRoundedRect(x, y, 36, 50, 5);
    this.addV(this.add.text(x + 4, y + 4, `${rank}${suit}`, {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: suitColor,
    }).setDepth(36));
    this.addV(this.add.text(x + 32, y + 46, `${rank}${suit}`, {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: suitColor,
    }).setOrigin(1, 1).setDepth(36));
  }

  private handlePokerInput() {
    const { phase } = this.holdemState;
    if (phase === 'ante') {
      if (this.controls.isMovementDirectionJustDown('left')) { this.holdemState.anteIndex = (this.holdemState.anteIndex + HOLDEM_ANTES.length - 1) % HOLDEM_ANTES.length; this.redrawOverlay(); }
      if (this.controls.isMovementDirectionJustDown('right')) { this.holdemState.anteIndex = (this.holdemState.anteIndex + 1) % HOLDEM_ANTES.length; this.redrawOverlay(); }
      if (this.controls.isActionJustDown('interact')) this.startHoldemHand();
      return;
    }
    if (phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river') {
      if (this.controls.isMovementDirectionJustDown('left')) { this.holdemState.actionIndex = (this.holdemState.actionIndex + 2) % 3; this.redrawOverlay(); }
      if (this.controls.isMovementDirectionJustDown('right')) { this.holdemState.actionIndex = (this.holdemState.actionIndex + 1) % 3; this.redrawOverlay(); }
      if (this.controls.isActionJustDown('interact')) {
        const actions: Array<'fold' | 'check' | 'raise'> = ['fold', 'check', 'raise'];
        this.holdemPlayerAction(actions[this.holdemState.actionIndex]);
      }
      return;
    }
    if (phase === 'showdown' && this.controls.isActionJustDown('interact')) this.openPoker();
  }

  private startHoldemHand() {
    const ante = HOLDEM_ANTES[this.holdemState.anteIndex];
    if (!spendTenks(ante, 'casino_holdem_ante')) {
      this.holdemState.resultText = 'NO TENÉS TENKS SUFICIENTES.';
      this.redrawOverlay();
      this.showToast('SIN TENKS PARA EL ANTE');
      return;
    }
    const deck = this.createPokerDeck();
    const playerHole = [deck.pop()!, deck.pop()!];
    const cpuHole = [deck.pop()!, deck.pop()!];
    this.holdemState = { ...this.holdemState, phase: 'preflop', playerHole, cpuHole, community: [], pot: ante * 2, playerPaid: ante, deck, resultText: 'TU TURNO — ELEGÍ UNA ACCIÓN.', actionIndex: 1, cpuLastAction: 'ENTRA', handToken: this.holdemState.handToken + 1 };
    this.redrawOverlay();
  }

  private holdemPlayerAction(action: 'fold' | 'check' | 'raise') {
    if (action === 'fold') {
      this.holdemState.phase = 'showdown';
      this.holdemState.resultText = `TE FUISTE. PERDÉS ${this.holdemState.playerPaid} TENKS.`;
      this.holdemState.cpuLastAction = 'GANA';
      this.showToast('FOLD');
      this.redrawOverlay();
      return;
    }
    if (action === 'raise') {
      const ante = HOLDEM_ANTES[this.holdemState.anteIndex];
      if (!spendTenks(ante, 'casino_holdem_raise')) {
        this.holdemState.resultText = 'NO TENÉS TENKS PARA SUBIR.';
        this.redrawOverlay();
        return;
      }
      this.holdemState.playerPaid += ante;
      this.holdemState.pot += ante * 2;
      const cpuFolds = this.cpuDecideOnRaise();
      this.holdemState.cpuLastAction = cpuFolds ? 'FOLD' : 'CALL';
      if (cpuFolds) {
        addTenks(this.holdemState.pot, 'casino_holdem_win');
        this.holdemState.phase = 'showdown';
        this.holdemState.resultText = `CPU FOLDEA. GANÁS ${this.holdemState.pot} TENKS!`;
        this.showToast(`+${this.holdemState.pot} TENKS`);
        this.redrawOverlay();
        return;
      }
    } else {
      this.holdemState.cpuLastAction = 'CHECK';
    }
    this.advanceHoldemPhase();
  }

  private cpuDecideOnRaise(): boolean {
    const { cpuHole, community, phase } = this.holdemState;
    const strength = this.bestAvailableHand(cpuHole, community);
    const weakHand = strength.rank <= 1;
    const bluff = Phaser.Math.Between(1, 100) <= 12;
    if (phase === 'river') return weakHand && !bluff;
    return weakHand && Phaser.Math.Between(0, 100) < 45 && !bluff;
  }

  private advanceHoldemPhase() {
    const { phase, deck } = this.holdemState;
    if (phase === 'preflop') {
      this.holdemState.community = [deck.pop()!, deck.pop()!, deck.pop()!];
      this.holdemState.phase = 'flop';
      this.holdemState.resultText = 'FLOP — ELEGÍ UNA ACCIÓN.';
    } else if (phase === 'flop') {
      this.holdemState.community.push(deck.pop()!);
      this.holdemState.phase = 'turn';
      this.holdemState.resultText = 'TURN — SEGUÍ JUGANDO.';
    } else if (phase === 'turn') {
      this.holdemState.community.push(deck.pop()!);
      this.holdemState.phase = 'river';
      this.holdemState.resultText = 'RIVER — ÚLTIMA RONDA.';
    } else if (phase === 'river') {
      this.resolveShowdown();
      return;
    }
    this.holdemState.actionIndex = 1;
    this.redrawOverlay();
  }

  private resolveShowdown() {
    const { playerHole, cpuHole, community, pot, playerPaid } = this.holdemState;
    const playerBest = this.bestAvailableHand(playerHole, community);
    const cpuBest = this.bestAvailableHand(cpuHole, community);
    const cmp = this.comparePokerResults(playerBest, cpuBest);
    this.holdemState.phase = 'showdown';
    if (cmp > 0) {
      addTenks(pot, 'casino_holdem_win');
      this.holdemState.resultText = `GANASTE CON ${playerBest.label}! +${pot} TENKS`;
      this.showToast(`+${pot} TENKS`);
    } else if (cmp < 0) {
      this.holdemState.resultText = `CPU GANA CON ${cpuBest.label}. PERDÉS ${playerPaid} T.`;
      this.showToast('LA CASA GANA');
    } else {
      addTenks(playerPaid, 'casino_holdem_tie');
      this.holdemState.resultText = `EMPATE. TE DEVUELVEN ${playerPaid} TENKS.`;
      this.showToast('EMPATE');
    }
    this.redrawOverlay();
  }

  private bestAvailableHand(hole: number[], community: number[]): PokerResult {
    const all = [...hole, ...community];
    if (all.length < 2) return { label: 'SIN CARTAS', rank: 0, tiebreak: [0] };
    if (all.length < 5) {
      const ranks = all.map((card) => this.pokerRankValue(card));
      const high = [...ranks].sort((a, b) => b - a);
      return { label: 'CARTA ALTA', rank: 0, tiebreak: high };
    }

    if (all.length === 5) return this.evaluatePokerHand(all);

    let best: PokerResult = { label: 'CARTA ALTA', rank: 0, tiebreak: [0] };
    for (let i = 0; i < all.length - 1; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const hand5 = all.filter((_, k) => k !== i && k !== j);
        if (hand5.length !== 5) continue;
        const res = this.evaluatePokerHand(hand5);
        if (this.comparePokerResults(res, best) > 0) best = res;
      }
    }
    return best;
  }

  // ─── Reusable card drawing helper ───────────────────────────────────────
  private drawCard(x: number, y: number, card: number | null, faceDown: boolean, border: 'none' | 'gold' | 'purple' | 'green' = 'none', w = 40, h = 57) {
    const g = this.addV(this.add.graphics().setDepth(33));
    g.fillStyle(0x000000, 0.3); g.fillRoundedRect(x + 2, y + 2, w, h, 4);
    if (faceDown || card === null) {
      g.fillStyle(0x1a0a40); g.fillRoundedRect(x, y, w, h, 4);
      g.lineStyle(1, 0x3a2a60, 0.8); g.strokeRoundedRect(x, y, w, h, 4);
      g.lineStyle(1, 0x2a1a50, 0.4);
      for (let lx = x + 5; lx < x + w - 3; lx += 5) g.lineBetween(lx, y + 3, lx, y + h - 3);
      return;
    }
    const rank = ((card - 1) % 13) + 1;
    const suitIdx = Math.floor((card - 1) / 13);
    const rl = rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
    const ss = ['♠', '♥', '♦', '♣'][suitIdx] ?? '♠';
    const isRed = suitIdx === 1 || suitIdx === 2;
    const tc = isRed ? '#c0392b' : '#111111';
    g.fillStyle(0xfaf8f2); g.fillRoundedRect(x, y, w, h, 4);
    if (border === 'gold') { g.lineStyle(2, 0xF5C842, 1); }
    else if (border === 'purple') { g.lineStyle(2, 0x8B5CF6, 1); }
    else if (border === 'green') { g.lineStyle(2, 0x22CC88, 1); }
    else { g.lineStyle(1, 0xc8c4b8, 1); }
    g.strokeRoundedRect(x, y, w, h, 4);
    this.addV(this.add.text(x + 4, y + 3, rl, { fontSize: '7px', fontFamily: '"Press Start 2P", monospace', color: tc }).setDepth(34));
    this.addV(this.add.text(x + 4, y + 14, ss, { fontSize: '7px', fontFamily: 'serif', color: tc }).setDepth(34));
    this.addV(this.add.text(x + w / 2, y + h / 2 - 1, ss, { fontSize: '18px', fontFamily: 'serif', color: tc }).setOrigin(0.5).setDepth(34));
    this.addV(this.add.text(x + w - 4, y + h - 3, rl, { fontSize: '7px', fontFamily: '"Press Start 2P", monospace', color: tc }).setOrigin(1, 1).setDepth(34));
  }

  private renderPokerOverlay() {
    if (!this.overlayTitle || !this.overlayBody || !this.overlayFooter || !this.overlayAccent) return;
    const cx = this.scale.width / 2;
    const cy = this.roomY + this.roomH / 2;
    const balance = getTenksBalance();
    const { phase, anteIndex, playerHole, cpuHole, community, pot, resultText, actionIndex, cpuLastAction } = this.holdemState;

    // ── Header ──
    this.overlayAccent.setPosition(cx + 180, cy - 162).setText(`SALDO: ${balance} T`).setVisible(true);
    this.overlayTitle.setPosition(cx - 150, cy - 162).setText('POKER').setVisible(true);
    this.overlayBody.setVisible(false);

    // Pot display
    this.addV(this.add.text(cx, cy - 162, `POT: ${pot} T`, { fontSize: '9px', fontFamily: '"Press Start 2P", monospace', color: 0xF5C842 < 1 ? '#F5C842' : '#F5C842', align: 'center' }).setOrigin(0.5).setDepth(34));

    // Phase strip
    const phases: HoldemPhase[] = ['ante', 'preflop', 'flop', 'turn', 'river', 'showdown'];
    const phaseLabels = ['ANTE', 'PRE-FLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'];
    const stripG = this.addV(this.add.graphics().setDepth(33));
    const stripY = cy - 146; const stripW = 460; const stripX = cx - stripW / 2;
    stripG.fillStyle(0x060410, 0.8); stripG.fillRoundedRect(stripX, stripY, stripW, 14, 3);
    phases.forEach((ph, idx) => {
      const pw = stripW / phases.length; const px = stripX + idx * pw;
      const isCur = ph === phase;
      if (isCur) { stripG.fillStyle(0x8B5CF6, 0.9); stripG.fillRoundedRect(px + 1, stripY + 1, pw - 2, 12, 2); }
      this.addV(this.add.text(px + pw / 2, stripY + 7, phaseLabels[idx], { fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: isCur ? '#ffffff' : '#444444' }).setOrigin(0.5).setDepth(35));
    });

    // ── Felt table area ──
    const feltG = this.addV(this.add.graphics().setDepth(32));
    feltG.fillStyle(0x0b3d1f, 0.9); feltG.fillRoundedRect(cx - 230, cy - 130, 460, 250, 8);
    feltG.lineStyle(1, 0x1a6a35, 0.5); feltG.strokeRoundedRect(cx - 230, cy - 130, 460, 250, 8);

    const CW = 40; const CH = 57; const CGAP = 8;

    // ── CPU section ──
    const cpuLabelY = cy - 120;
    this.addV(this.add.text(cx, cpuLabelY, `CPU  ${cpuLastAction ? `— ${cpuLastAction}` : ''}`, { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#888888', align: 'center' }).setOrigin(0.5).setDepth(34));
    const cpuCardsX = cx - (CW + CGAP / 2);
    const cpuCardsY = cy - 110;
    const atShowdown = phase === 'showdown';
    this.drawCard(cpuCardsX, cpuCardsY, cpuHole[0] ?? null, !atShowdown, atShowdown ? 'purple' : 'none', CW, CH);
    this.drawCard(cpuCardsX + CW + CGAP, cpuCardsY, cpuHole[1] ?? null, !atShowdown, atShowdown ? 'purple' : 'none', CW, CH);
    if (atShowdown && cpuHole.length === 2) {
      const cpuBest = this.bestAvailableHand(cpuHole, community);
      this.addV(this.add.text(cx, cpuCardsY + CH + 8, cpuBest.label, { fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: '#9B6CF6', align: 'center' }).setOrigin(0.5).setDepth(34));
    }

    // ── Community cards ──
    const commLabelY = cy - 50;
    this.addV(this.add.text(cx, commLabelY, 'COMUNIDAD', { fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: '#2a5a3a' }).setOrigin(0.5).setDepth(34));
    const commTotalW = 5 * CW + 4 * CGAP;
    const commX = cx - commTotalW / 2;
    const commY = cy - 38;
    for (let i = 0; i < 5; i++) {
      const cx5 = commX + i * (CW + CGAP);
      this.drawCard(cx5, commY, community[i] ?? null, false, 'none', CW, CH);
    }

    // ── Player section ──
    const plLabelY = cy + 44;
    const playerBest = phase !== 'ante' && playerHole.length === 2 ? this.bestAvailableHand(playerHole, community) : null;
    this.addV(this.add.text(cx - (CW + CGAP / 2) - 10, plLabelY, 'TU MANO', { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#22CC88' }).setOrigin(0, 0.5).setDepth(34));
    if (playerBest) this.addV(this.add.text(cx + CW + 20, plLabelY, playerBest.label, { fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: '#22CC88' }).setOrigin(0, 0.5).setDepth(34));
    const plCardsX = cx - (CW + CGAP / 2);
    const plCardsY = cy + 54;
    const winnerBorder: 'gold' | 'green' | 'none' = phase === 'showdown'
      ? (playerBest && this.comparePokerResults(playerBest, this.bestAvailableHand(cpuHole, community)) > 0 ? 'gold' : 'none')
      : 'none';
    this.drawCard(plCardsX, plCardsY, playerHole[0] ?? null, false, winnerBorder, CW, CH);
    this.drawCard(plCardsX + CW + CGAP, plCardsY, playerHole[1] ?? null, false, winnerBorder, CW, CH);

    // ── Result text ──
    const resultColor = phase === 'showdown' ? (resultText.includes('GANASTE') ? '#22CC88' : resultText.includes('EMPATE') ? '#F5C842' : '#FF5A5A') : '#F5C842';
    this.addV(this.add.text(cx, cy + 142, resultText, { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: resultColor, align: 'center', wordWrap: { width: 450 } }).setOrigin(0.5).setDepth(34));

    // ── Action selector (only during active phases) ──
    if (phase === 'ante') {
      this.addV(this.add.text(cx, cy + 114, 'ANTE', { fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: '#555555' }).setOrigin(0.5).setDepth(34));
      HOLDEM_ANTES.forEach((av, idx) => {
        const bx = cx - 90 + idx * 50;
        const sel = idx === anteIndex;
        const bg = this.addV(this.add.graphics().setDepth(34));
        bg.fillStyle(sel ? 0x8B5CF6 : 0x1a0e2e, sel ? 1 : 0.8); bg.fillRoundedRect(bx - 20, cy + 122, 40, 18, 3);
        if (sel) { bg.lineStyle(1, 0xF5C842, 0.8); bg.strokeRoundedRect(bx - 20, cy + 122, 40, 18, 3); }
        this.addV(this.add.text(bx, cy + 131, String(av), { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: sel ? '#ffffff' : '#666666' }).setOrigin(0.5).setDepth(35));
      });
    } else if (phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river') {
      const actions = ['FOLD', 'PASAR', `SUBIR +${HOLDEM_ANTES[anteIndex]}T`];
      const actionColors = ['#FF5A5A', '#22CC88', '#F5C842'];
      const actionBgColors = [0x4a0808, 0x083020, 0x4a3808];
      const totalAW = 330; const aStartX = cx - totalAW / 2;
      actions.forEach((label, idx) => {
        const aw = idx === 2 ? 130 : 90; const ax = aStartX + (idx === 0 ? 0 : idx === 1 ? 100 : 200);
        const sel = idx === actionIndex;
        const bg = this.addV(this.add.graphics().setDepth(34));
        bg.fillStyle(sel ? actionBgColors[idx] : 0x0a0a0a, sel ? 1 : 0.8); bg.fillRoundedRect(ax, cy + 114, aw, 22, 4);
        if (sel) { bg.lineStyle(2, parseInt(actionColors[idx].replace('#', ''), 16), 0.9); bg.strokeRoundedRect(ax, cy + 114, aw, 22, 4); }
        this.addV(this.add.text(ax + aw / 2, cy + 125, label, { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: sel ? actionColors[idx] : '#444444' }).setOrigin(0.5).setDepth(35));
      });
    }

    // ── Footer ──
    let footer = 'INTERACT  JUGAR OTRA   |   BACK  CIERRA';
    if (phase === 'ante') footer = '< >  ANTE   |   INTERACT  REPARTIR   |   BACK  CIERRA';
    else if (phase !== 'showdown') footer = '< >  ACCIÓN   |   INTERACT  CONFIRMA   |   BACK  CIERRA';
    this.overlayFooter.setPosition(cx, cy + 164).setText(footer).setVisible(true);
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

  private getRouletteColor(number: number) {
    if (number === 0) return 'green';
    return ROULETTE_RED_NUMBERS.has(number) ? 'red' : 'black';
  }

  private createPokerDeck() {
    const deck: number[] = [];
    for (let suit = 0; suit < 4; suit += 1) {
      for (let rank = 1; rank <= 13; rank += 1) deck.push(suit * 13 + rank);
    }
    return Phaser.Utils.Array.Shuffle(deck);
  }

  private drawPokerCard() {
    if (this.holdemState.deck.length === 0) this.holdemState.deck = this.createPokerDeck();
    return this.holdemState.deck.pop() ?? 1;
  }

  private evaluatePokerHand(cards: number[]): PokerResult {
    const ranks = cards.map((card) => this.pokerRankValue(card));
    const suits = cards.map((card) => Math.floor((card - 1) / 13));
    const counts = new Map<number, number>();
    ranks.forEach((rank) => counts.set(rank, (counts.get(rank) ?? 0) + 1));
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
    const normalized = [...uniqueRanks].sort((a, b) => a - b);
    const isFlush = suits.every((suit) => suit === suits[0]);
    const straightHigh = this.getStraightHighCard(normalized);

    const grouped = [...counts.entries()]
      .map(([rank, count]) => ({ rank, count }))
      .sort((a, b) => (b.count - a.count) || (b.rank - a.rank));

    if (isFlush && straightHigh === 14) return { label: 'ESCALERA REAL', rank: 9, tiebreak: [14] };
    if (isFlush && straightHigh > 0) return { label: 'ESCALERA COLOR', rank: 8, tiebreak: [straightHigh] };
    if (grouped[0].count === 4) return { label: 'POKER', rank: 7, tiebreak: [grouped[0].rank, grouped[1].rank] };
    if (grouped[0].count === 3 && grouped[1].count === 2) return { label: 'FULL HOUSE', rank: 6, tiebreak: [grouped[0].rank, grouped[1].rank] };
    if (isFlush) return { label: 'COLOR', rank: 5, tiebreak: [...ranks].sort((a, b) => b - a) };
    if (straightHigh > 0) return { label: 'ESCALERA', rank: 4, tiebreak: [straightHigh] };
    if (grouped[0].count === 3) {
      const kickers = grouped.filter((g) => g.count === 1).map((g) => g.rank).sort((a, b) => b - a);
      return { label: 'TRIO', rank: 3, tiebreak: [grouped[0].rank, ...kickers] };
    }
    if (grouped[0].count === 2 && grouped[1].count === 2) {
      const pairRanks = grouped.filter((g) => g.count === 2).map((g) => g.rank).sort((a, b) => b - a);
      const kicker = grouped.find((g) => g.count === 1)?.rank ?? 0;
      return { label: 'DOBLE PAREJA', rank: 2, tiebreak: [pairRanks[0], pairRanks[1], kicker] };
    }
    if (grouped[0].count === 2) {
      const kickers = grouped.filter((g) => g.count === 1).map((g) => g.rank).sort((a, b) => b - a);
      return { label: 'PAR', rank: 1, tiebreak: [grouped[0].rank, ...kickers] };
    }
    return { label: 'CARTA ALTA', rank: 0, tiebreak: [...ranks].sort((a, b) => b - a) };
  }

  private pokerRankValue(card: number) {
    const rank = ((card - 1) % 13) + 1;
    return rank === 1 ? 14 : rank;
  }

  private getStraightHighCard(sortedUniqueRanks: number[]) {
    if (sortedUniqueRanks.length !== 5) return 0;
    const isRegular = sortedUniqueRanks[4] - sortedUniqueRanks[0] === 4;
    if (isRegular) return sortedUniqueRanks[4];
    const wheel = sortedUniqueRanks.join(',') === '2,3,4,5,14';
    return wheel ? 5 : 0;
  }

  private comparePokerResults(a: PokerResult, b: PokerResult) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const maxLen = Math.max(a.tiebreak.length, b.tiebreak.length);
    for (let i = 0; i < maxLen; i += 1) {
      const av = a.tiebreak[i] ?? 0;
      const bv = b.tiebreak[i] ?? 0;
      if (av !== bv) return av - bv;
    }
    return 0;
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
