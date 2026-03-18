import Phaser from 'phaser';
import { AvatarRenderer, AvatarConfig, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { BUILDINGS, SAFE_PLAZA_RETURN, ZONES } from '../config/constants';
import { CATALOG } from '../config/catalog';
import { announceScene, bindSafeResetToPlaza, createBackButton, showSceneTitle, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { ChatSystem } from '../systems/ChatSystem';
import { DialogSystem } from '../systems/DialogSystem';
import { SceneControls } from '../systems/SceneControls';
import { supabase, isConfigured } from '../../lib/supabase';
import { startSceneMusic, stopSceneMusic } from '../systems/AudioManager';
import { createScrollArea } from '../systems/ScrollArea';

type StoreRemotePlayer = {
  avatar: AvatarRenderer;
  nameplate: Phaser.GameObjects.Text;
  username: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  moveDx: number;
  moveDy: number;
  isMoving: boolean;
  avatarConfig: AvatarConfig;
};

export class StoreInterior extends Phaser.Scene {
  private static readonly RETURN_X = BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2;
  private static readonly RETURN_Y = ZONES.SOUTH_SIDEWALK_Y + 26;
  private player!: AvatarRenderer;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
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
  private selectedItemId = '';
  private dialog!: DialogSystem;
  private vendorX = 0;
  private vendorY = 0;
  private shopOverlayOpen = false;
  private cleanupFns: Array<() => void> = [];
  private playerId = '';
  private playerUsername = '';
  private localNameplate?: Phaser.GameObjects.Text;
  private remotePlayers = new Map<string, StoreRemotePlayer>();
  private channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
  private chatSystem?: ChatSystem;
  private lastPosSent = 0;
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastIsMoving = false;
  private controls!: SceneControls;
  private sceneMusic: Phaser.Sound.BaseSound | null = null;

  constructor() {
    super({ key: 'StoreInterior' });
  }

  init() {
    this.inTransition = false;
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);
    showSceneTitle(this, 'WASPI STORE', 0xF5C842);
    this.input.enabled = true;
    this.controls = new SceneControls(this);
    this.playerId = this.getOrCreatePlayerId();
    this.playerUsername = this.getOrCreateUsername();
    this.dialog = new DialogSystem(this);
    this.chatSystem = new ChatSystem(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.cleanupFns.push(eventBus.on(EVENTS.SHOP_OPEN, () => { this.shopOverlayOpen = true; }));
    this.cleanupFns.push(eventBus.on(EVENTS.SHOP_CLOSE, () => { this.shopOverlayOpen = false; }));
    this.cleanupFns.push(eventBus.on(EVENTS.CHAT_RECEIVED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const playerId = this.readStringField(payload, 'playerId', 'player_id');
      const message = this.readStringField(payload, 'message');
      if (!playerId || !message) return;
      if (playerId === this.playerId) {
        this.chatSystem?.showBubble('__player__', message, this.px, this.py, true);
        return;
      }
      const remote = this.remotePlayers.get(playerId);
      if (!remote) return;
      this.chatSystem?.showBubble(playerId, message, remote.x, remote.y, false);
    }));
    this.cleanupFns.push(bindSafeResetToPlaza(this, () => {
      transitionToScene(this, 'WorldScene', {
        returnX: SAFE_PLAZA_RETURN.X,
        returnY: SAFE_PLAZA_RETURN.Y,
      });
    }));

    // ── Room dimensions ────────────────────────────────────────────
    const roomW = 640;
    const roomH = 400;
    const roomX = (width - roomW) / 2;   // 80
    const roomY = (height - roomH) / 2;  // 100
    const roomR = roomX + roomW;          // 720
    const roomB = roomY + roomH;          // 500

    const GOLD   = 0xF5C842;
    const NEON   = 0x39FF14;
    const DARK   = 0x080810;
    const ROOM   = 0x0d0d1a;
    const FLOOR  = 0x0f0f1e;

    // ── BG + global grid ──────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(DARK);
    bg.fillRect(0, 0, width, height);

    // Faint global grid
    bg.lineStyle(1, 0x1a1a2e, 0.25);
    for (let gx = 0; gx < width; gx += 40) bg.lineBetween(gx, 0, gx, height);
    for (let gy = 0; gy < height; gy += 40) bg.lineBetween(0, gy, width, gy);

    // ── Dorado dot pattern (muy tenue) sobre el fondo ─────────────
    try {
      const dotPat = this.add.graphics().setDepth(0);
      dotPat.fillStyle(GOLD, 0.06);
      for (let dpx = 20; dpx < width; dpx += 40) {
        for (let dpy = 20; dpy < height; dpy += 40) {
          dotPat.fillRect(dpx - 1, dpy - 1, 2, 2);
        }
      }
    } catch (e) { console.error('[StoreInterior] dot pattern failed', e); }

    // ── Room fill ─────────────────────────────────────────────────
    const room = this.add.graphics();

    // Outer ambient glow
    room.fillStyle(GOLD, 0.03);
    room.fillRect(roomX - 6, roomY - 6, roomW + 12, roomH + 12);

    // Room bg
    room.fillStyle(ROOM);
    room.fillRect(roomX, roomY, roomW, roomH);

    // Wall grid lines (very faint)
    room.lineStyle(1, 0x15152a, 0.8);
    for (let wx = roomX + 20; wx < roomR; wx += 40) room.lineBetween(wx, roomY, wx, roomB - 90);
    for (let wy = roomY + 30; wy < roomB - 90; wy += 30) room.lineBetween(roomX, wy, roomR, wy);

    // Floor zone (bottom 90px)
    room.fillStyle(FLOOR);
    room.fillRect(roomX, roomB - 90, roomW, 90);

    // Checkerboard floor tiles
    const ts = 18;
    for (let ty = 0; ty < 5; ty++) {
      for (let tx = 0; tx < Math.floor(roomW / ts); tx++) {
        if ((tx + ty) % 2 === 0) {
          room.fillStyle(0x131328, 1);
          room.fillRect(roomX + tx * ts, roomB - 90 + ty * ts, ts, ts);
        }
      }
    }

    // Floor divider
    room.lineStyle(1, GOLD, 0.2);
    room.lineBetween(roomX, roomB - 90, roomR, roomB - 90);

    // Room border (double-line)
    room.lineStyle(1, GOLD, 0.12);
    room.strokeRect(roomX - 2, roomY - 2, roomW + 4, roomH + 4);
    room.lineStyle(2, GOLD, 0.75);
    room.strokeRect(roomX, roomY, roomW, roomH);

    // Corner L-brackets
    const bLen = 16;
    room.lineStyle(2, GOLD, 1);
    // TL
    room.lineBetween(roomX, roomY, roomX + bLen, roomY);
    room.lineBetween(roomX, roomY, roomX, roomY + bLen);
    // TR
    room.lineBetween(roomR, roomY, roomR - bLen, roomY);
    room.lineBetween(roomR, roomY, roomR, roomY + bLen);
    // BL
    room.lineBetween(roomX, roomB, roomX + bLen, roomB);
    room.lineBetween(roomX, roomB, roomX, roomB - bLen);
    // BR
    room.lineBetween(roomR, roomB, roomR - bLen, roomB);
    room.lineBetween(roomR, roomB, roomR, roomB - bLen);

    // ── Header strip ──────────────────────────────────────────────
    const hdr = this.add.graphics();
    hdr.fillStyle(0x09091a);
    hdr.fillRect(roomX, roomY, roomW, 62);
    hdr.lineStyle(1, GOLD, 0.2);
    hdr.lineBetween(roomX, roomY + 62, roomR, roomY + 62);

    // Scanline accent over header
    for (let sl = roomY + 2; sl < roomY + 62; sl += 4) {
      hdr.lineStyle(1, 0x000000, 0.25);
      hdr.lineBetween(roomX, sl, roomR, sl);
    }

    // Left header: title
    this.add.text(roomX + 16, roomY + 18, 'WASPI', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.add.text(roomX + 16, roomY + 42, 'STORE', {
      fontSize: '10px',
      fontFamily: '"Silkscreen", monospace',
      color: '#888899',
    });

    // Right header: category badge
    const badgeG = this.add.graphics();
    badgeG.fillStyle(GOLD, 0.1);
    badgeG.fillRect(roomX + 230, roomY + 14, 280, 18);
    badgeG.lineStyle(1, GOLD, 0.4);
    badgeG.strokeRect(roomX + 230, roomY + 14, 280, 18);
    this.add.text(roomX + 230 + 140, roomY + 23, '★ ROPA FÍSICA — PAGO EN ARS', {
      fontSize: '6px',
      fontFamily: '"Silkscreen", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    // "THE DROP" sub-badge
    const dropG = this.add.graphics();
    dropG.fillStyle(NEON, 0.08);
    dropG.fillRect(roomX + 230, roomY + 36, 100, 14);
    dropG.lineStyle(1, NEON, 0.3);
    dropG.strokeRect(roomX + 230, roomY + 36, 100, 14);
    this.add.text(roomX + 280, roomY + 43, '▸ TEMPORADA 01', {
      fontSize: '5px',
      fontFamily: '"Silkscreen", monospace',
      color: '#39FF14',
    }).setOrigin(0.5);

    // ── Left column: decorative shelves ──────────────────────────
    const shelfX = roomX + 12;
    const shelfW = 148;

    // Separator line
    const sepG = this.add.graphics();
    sepG.lineStyle(1, 0x1f1f38, 1);
    sepG.lineBetween(roomX + shelfW + 20, roomY + 62, roomX + shelfW + 20, roomB - 90);

    // Shelf 1 — Color swatches display
    const sh1 = this.add.graphics();
    sh1.fillStyle(0x171730);
    sh1.fillRect(shelfX, roomY + 72, shelfW, 42);
    sh1.lineStyle(1, 0x2a2a50, 1);
    sh1.strokeRect(shelfX, roomY + 72, shelfW, 42);
    // Shelf bracket (pixel-art style)
    sh1.lineStyle(2, 0x2a2a50, 1);
    sh1.lineBetween(shelfX, roomY + 113, shelfX + 8, roomY + 123);
    sh1.lineBetween(shelfX + shelfW, roomY + 113, shelfX + shelfW - 8, roomY + 123);
    // Color swatches on shelf
    const shelfColors = [0x1A1A1A, 0xE8E8E8, 0xD94444, 0x1A1A1A, 0x556B2F];
    shelfColors.forEach((col, i) => {
      sh1.fillStyle(col, 0.9);
      sh1.fillRect(shelfX + 6 + i * 26, roomY + 79, 18, 24);
      sh1.lineStyle(1, 0x000000, 0.4);
      sh1.strokeRect(shelfX + 6 + i * 26, roomY + 79, 18, 24);
    });
    this.add.text(shelfX + shelfW / 2, roomY + 120, 'COLORES', {
      fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: '#444466',
    }).setOrigin(0.5);

    // Shelf 2 — Hanging rack
    const sh2 = this.add.graphics();
    sh2.fillStyle(0x171730);
    sh2.fillRect(shelfX, roomY + 140, shelfW, 50);
    sh2.lineStyle(1, 0x2a2a50, 1);
    sh2.strokeRect(shelfX, roomY + 140, shelfW, 50);
    // Rack bar
    sh2.lineStyle(2, GOLD, 0.35);
    sh2.lineBetween(shelfX + 10, roomY + 150, shelfX + shelfW - 10, roomY + 150);
    // Hangers + garments
    const hangColors = [0x222222, 0xD94444, 0x555555, 0x556B2F];
    hangColors.forEach((col, i) => {
      const hx = shelfX + 16 + i * 30;
      sh2.lineStyle(1, 0x888888, 0.6);
      sh2.lineBetween(hx + 6, roomY + 150, hx + 10, roomY + 160);
      sh2.fillStyle(col, 0.8);
      sh2.fillRect(hx, roomY + 160, 20, 18);
      sh2.lineStyle(1, 0x000000, 0.3);
      sh2.strokeRect(hx, roomY + 160, 20, 18);
    });
    this.add.text(shelfX + shelfW / 2, roomY + 197, 'DROP PICKS', {
      fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: '#444466',
    }).setOrigin(0.5);

    // Shelf 3 — NEW ARRIVALS
    const sh3 = this.add.graphics();
    sh3.fillStyle(0x171730);
    sh3.fillRect(shelfX, roomY + 212, shelfW, 46);
    sh3.lineStyle(1, GOLD, 0.3);
    sh3.strokeRect(shelfX, roomY + 212, shelfW, 46);
    sh3.fillStyle(GOLD, 0.07);
    sh3.fillRect(shelfX + 3, roomY + 215, shelfW - 6, 40);
    this.add.text(shelfX + shelfW / 2, roomY + 228, '★ NEW DROP ★', {
      fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#F5C842',
    }).setOrigin(0.5);
    this.add.text(shelfX + shelfW / 2, roomY + 244, 'TEMPORADA 01', {
      fontSize: '5px', fontFamily: '"Silkscreen", monospace', color: '#666688',
    }).setOrigin(0.5);

    // ── Vendor NPC (pixel-art character) ─────────────────────────
    const vx = roomX + 100;
    const vy = roomY + 286;
    this.vendorX = vx;
    this.vendorY = vy;

    // Focal light glow behind vendor
    try {
      const focalGlow = this.add.graphics().setDepth(2);
      focalGlow.fillStyle(GOLD, 0.07);
      focalGlow.fillEllipse(vx, vy + 10, 110, 90);
      focalGlow.fillStyle(GOLD, 0.04);
      focalGlow.fillEllipse(vx, vy - 10, 80, 120);
      // Animated pulse
      this.tweens.add({
        targets: focalGlow,
        alpha: { from: 0.7, to: 1 },
        duration: 2200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } catch (e) { console.error('[StoreInterior] focal glow failed', e); }

    const npc = this.add.graphics();

    // Shadow ellipse
    npc.fillStyle(0x000000, 0.28);
    npc.fillEllipse(vx, vy + 56, 34, 10);

    // Spotlight under vendor
    npc.fillStyle(GOLD, 0.05);
    npc.fillEllipse(vx, vy + 50, 64, 20);

    // Legs
    npc.fillStyle(0x0a0a22);
    npc.fillRect(vx - 12, vy + 38, 10, 18);
    npc.fillRect(vx + 2, vy + 38, 10, 18);
    // Shoes
    npc.fillStyle(0xf0f0f0);
    npc.fillRect(vx - 14, vy + 54, 13, 5);
    npc.fillRect(vx + 1, vy + 54, 13, 5);

    // Body — dark hoodie
    npc.fillStyle(0x14082e);
    npc.fillRect(vx - 15, vy + 14, 30, 26);
    // Hoodie front pocket
    npc.fillStyle(0x0d0520);
    npc.fillRect(vx - 8, vy + 26, 16, 12);
    // Arm left
    npc.fillStyle(0x14082e);
    npc.fillRect(vx - 22, vy + 16, 8, 20);
    // Arm right
    npc.fillRect(vx + 14, vy + 16, 8, 20);
    // Hands
    npc.fillStyle(0xc9845a);
    npc.fillRect(vx - 22, vy + 34, 8, 6);
    npc.fillRect(vx + 14, vy + 34, 8, 6);
    // Neck
    npc.fillStyle(0xc9845a);
    npc.fillRect(vx - 4, vy + 10, 8, 6);
    // Head
    npc.fillRect(vx - 11, vy - 4, 22, 18);
    // Eyes
    npc.fillStyle(0x111111);
    npc.fillRect(vx - 6, vy + 2, 4, 4);
    npc.fillRect(vx + 2, vy + 2, 4, 4);
    // Cap brim
    npc.fillStyle(GOLD);
    npc.fillRect(vx - 13, vy - 4, 26, 5);
    // Cap crown
    npc.fillRect(vx - 9, vy - 13, 18, 10);
    // Cap logo dot
    npc.fillStyle(0x0a0520);
    npc.fillRect(vx - 2, vy - 12, 4, 4);
    npc.setDepth(8);

    // Vendor name tag
    this.add.text(vx, vy - 20, 'WASPI BOY', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9);

    // ── Mostrador del vendedor ────────────────────────────────────
    try {
      const counterG = this.add.graphics().setDepth(3);
      const ctrX = vx - 44;
      const ctrY = vy + 58;
      const ctrW = 88;
      const ctrH = 18;
      // Depth face
      counterG.fillStyle(0x0a0016, 1);
      counterG.fillRect(ctrX, ctrY + ctrH, ctrW, 7);
      // Counter surface
      counterG.fillStyle(0x1a0e38, 1);
      counterG.fillRect(ctrX, ctrY, ctrW, ctrH);
      counterG.lineStyle(1, GOLD, 0.6);
      counterG.strokeRect(ctrX, ctrY, ctrW, ctrH);
      // Top edge highlight
      counterG.lineStyle(1, GOLD, 0.9);
      counterG.lineBetween(ctrX, ctrY, ctrX + ctrW, ctrY);
      // Small items on counter
      counterG.fillStyle(GOLD, 0.55);
      counterG.fillRect(ctrX + 8, ctrY - 8, 10, 8);  // folded item
      counterG.lineStyle(1, 0x000000, 0.3);
      counterG.strokeRect(ctrX + 8, ctrY - 8, 10, 8);
      counterG.fillStyle(0xffffff, 0.35);
      counterG.fillRect(ctrX + 24, ctrY - 6, 6, 6);   // small card/receipt
      counterG.fillStyle(NEON, 0.5);
      counterG.fillRect(ctrX + ctrW - 20, ctrY - 7, 14, 7);  // small bag
      counterG.lineStyle(1, 0x000000, 0.25);
      counterG.strokeRect(ctrX + ctrW - 20, ctrY - 7, 14, 7);
    } catch (e) { console.error('[StoreInterior] counter failed', e); }

    // SPACE prompt badge
    const spaceG = this.add.graphics();
    spaceG.fillStyle(0x000000, 0.85);
    spaceG.fillRoundedRect(vx - 40, vy + 68, 80, 16, 3);
    spaceG.lineStyle(1, GOLD, 0.45);
    spaceG.strokeRoundedRect(vx - 40, vy + 68, 80, 16, 3);
    spaceG.setDepth(9);
    this.add.text(vx, vy + 76, '[ SPACE ] HABLAR', {
      fontSize: '5px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5).setDepth(10);

    // Pulse tween on SPACE badge
    this.tweens.add({
      targets: spaceG,
      alpha: { from: 0.6, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ── Extra wall shelves (right wall, behind product list area) ─
    try {
      const rshelfG = this.add.graphics().setDepth(1);
      const rsX = roomR - 20;  // right wall
      const shelfStartY = roomY + 72;
      const shelfCount = 4;
      const shelfSpacing = 52;
      for (let si = 0; si < shelfCount; si++) {
        const sy = shelfStartY + si * shelfSpacing;
        const sw = 16;
        const sd = 48;
        // Shelf bracket protruding from right wall
        rshelfG.fillStyle(0x17173a, 1);
        rshelfG.fillRect(rsX - sw, sy, sw, 5);
        rshelfG.lineStyle(1, GOLD, 0.25);
        rshelfG.strokeRect(rsX - sw, sy, sw, 5);
        // Items stacked on shelf (small rectangles)
        const stackColors = [0x1a1a1a, 0xD94444, 0x556B2F, 0xE8E8E8, 0x222266];
        for (let ii = 0; ii < 3; ii++) {
          rshelfG.fillStyle(stackColors[(si * 3 + ii) % stackColors.length], 0.6);
          rshelfG.fillRect(rsX - sw + ii * 5, sy - 8 - ii * 2, 4, 8 + ii * 2);
          rshelfG.lineStyle(1, 0x000000, 0.2);
          rshelfG.strokeRect(rsX - sw + ii * 5, sy - 8 - ii * 2, 4, 8 + ii * 2);
        }
      }
    } catch (e) { console.error('[StoreInterior] right wall shelves failed', e); }

    // ── Product list ─────────────────────────────────────────────
    const listCX  = roomX + 460;  // center x of cards
    const cardW   = 390;
    const cardH   = 36;
    const cardGap = 6;
    let   cardY   = roomY + 90;

    const items = CATALOG.filter((item) => typeof item.priceArs === 'number');

    // Column headers
    this.add.text(listCX - cardW / 2 + 50, cardY - 14, 'PRENDA', {
      fontSize: '6px', fontFamily: '"Silkscreen", monospace', color: '#444466',
    }).setOrigin(0, 0.5);
    this.add.text(listCX + 110, cardY - 14, 'TALLES', {
      fontSize: '6px', fontFamily: '"Silkscreen", monospace', color: '#444466',
    }).setOrigin(0.5, 0.5);
    this.add.text(listCX + cardW / 2 - 6, cardY - 14, 'PRECIO', {
      fontSize: '6px', fontFamily: '"Silkscreen", monospace', color: '#444466',
    }).setOrigin(1, 0.5);

    // Divider
    const divG = this.add.graphics();
    divG.lineStyle(1, 0x222240, 1);
    divG.lineBetween(listCX - cardW / 2, cardY - 6, listCX + cardW / 2, cardY - 6);

    // Scrollable card list (future-proof when items grow)
    const listLeft = listCX - cardW / 2;
    const viewportY = roomY + 72; // below header strip
    const viewportH = (roomB - 90) - viewportY - 10; // above floor zone
    const scrollArea = createScrollArea(this, {
      x: listLeft,
      y: viewportY,
      w: cardW,
      h: viewportH,
      step: 34,
      scrollbar: { depth: 50, insetRight: 10, insetY: 10, thumbColor: GOLD, thumbAlpha: 0.5, trackAlpha: 0.06 },
    });

    items.forEach((item) => {
      const cy = cardY;
      const cleft = listLeft;

      // Card background
      const cardBg = this.add.graphics();
      const drawCard = (hover: boolean) => {
        cardBg.clear();
        if (hover) {
          cardBg.fillStyle(0x111128, 1);
          cardBg.fillRect(cleft, cy - cardH / 2, cardW, cardH);
          cardBg.lineStyle(1, GOLD, 0.7);
          cardBg.strokeRect(cleft, cy - cardH / 2, cardW, cardH);
        } else {
          cardBg.fillStyle(0x0b0b1c, 1);
          cardBg.fillRect(cleft, cy - cardH / 2, cardW, cardH);
          cardBg.lineStyle(1, 0x1e1e38, 1);
          cardBg.strokeRect(cleft, cy - cardH / 2, cardW, cardH);
        }
        // Left color accent bar
        cardBg.fillStyle(item.color ?? 0x444444, hover ? 1 : 0.7);
        cardBg.fillRect(cleft, cy - cardH / 2, 4, cardH);
      };
      drawCard(false);
      scrollArea.content.add(cardBg);

      // Color swatch
      const swG = this.add.graphics();
      swG.fillStyle(item.color ?? 0x444444, 1);
      swG.fillRect(cleft + 14, cy - 12, 22, 22);
      swG.lineStyle(1, 0x000000, 0.5);
      swG.strokeRect(cleft + 14, cy - 12, 22, 22);
      scrollArea.content.add(swG);

      // LIMITED badge
      if (item.isLimited) {
        const limG = this.add.graphics();
        limG.fillStyle(0xD94444, 0.9);
        limG.fillRect(cleft + 14, cy - 12, 22, 8);
        const limText = this.add.text(cleft + 25, cy - 8, 'LTD', {
          fontSize: '4px', fontFamily: '"Press Start 2P", monospace', color: '#ffffff',
        }).setOrigin(0.5);
        scrollArea.content.add(limG);
        scrollArea.content.add(limText);
      }

      // Item name
      const label = this.add.text(cleft + 46, cy - 8, item.name, {
        fontSize: '7px',
        fontFamily: '"Silkscreen", monospace',
        color: '#FFFFFF',
      }).setOrigin(0, 0.5);
      scrollArea.content.add(label);

      // Sizes
      const sizesLeft = this.add.text(cleft + 46, cy + 8, (item.sizes ?? []).join(' · '), {
        fontSize: '6px',
        fontFamily: '"Silkscreen", monospace',
        color: '#444466',
      }).setOrigin(0, 0.5);
      scrollArea.content.add(sizesLeft);

      // Sizes chips (centered around listCX+110)
      const sizesStr = (item.sizes ?? []).join(' · ');
      const sizesMid = this.add.text(listCX + 110, cy, sizesStr, {
        fontSize: '6px',
        fontFamily: '"Silkscreen", monospace',
        color: '#666688',
      }).setOrigin(0.5);
      scrollArea.content.add(sizesMid);

      // Price
      const price = this.add.text(listCX + cardW / 2 - 22, cy, `$${item.priceArs?.toLocaleString('es-AR')}`, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#F5C842',
      }).setOrigin(1, 0.5);
      scrollArea.content.add(price);

      // Arrow CTA
      const arrow = this.add.text(listCX + cardW / 2 - 6, cy, '►', {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#39FF14',
      }).setOrigin(0.5);
      scrollArea.content.add(arrow);

      // Hit area
      const hit = this.add.rectangle(listCX, cy, cardW, cardH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      scrollArea.content.add(hit);

      const openShop = () => {
        if (this.shopOverlayOpen) return;
        this.selectedItemId = item.id;
        eventBus.emit(EVENTS.SHOP_OPEN, { tab: 'products', itemId: item.id, source: 'store_interior' });
        this.flashMessage(width / 2, roomB - 30, '▸ SHOP ABIERTO', '#39FF14');
      };

      hit.on('pointerdown', openShop);
      hit.on('pointerover', () => {
        drawCard(true);
        label.setColor('#F5C842');
        arrow.setColor('#F5C842');
      });
      hit.on('pointerout', () => {
        drawCard(false);
        label.setColor('#FFFFFF');
        arrow.setColor('#39FF14');
      });

      cardY += cardH + cardGap;
    });

    // ── Footer hint ────────────────────────────────────────────────
    this.add.text(width / 2, roomB + 18, 'ACERCATE AL VENDEDOR Y APRETÁ SPACE  •  ESC = SALIR', {
      fontSize: '6px',
      fontFamily: '"Silkscreen", monospace',
      color: '#333355',
    }).setOrigin(0.5);

    // ── Player ─────────────────────────────────────────────────────
    this.px = width / 2 + 80;
    this.py = roomB - 60;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(10);
    this.localNameplate = this.add.text(this.px, this.py - 44, this.playerUsername, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(20);

    createBackButton(this, () => this.exitToWorld());

    // ── Staggered entry animation ─────────────────────────────────
    // Groups: room bg → shelves/vendor → product list → footer
    // (using alpha tweens on depth layers via cameras.main)
    // Simple camera fade covers the entry feel
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // ── Inputs ─────────────────────────────────────────────────────
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyI = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyJ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keyK = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.sceneMusic = startSceneMusic(this, 'store_upbeat', 0.38);
    this.setupRealtime();
  }

  private flashMessage(x: number, y: number, msg: string, color: string) {
    const text = this.add.text(x, y, msg, {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9999);
    this.tweens.add({
      targets: text,
      alpha: { from: 1, to: 0 },
      y: y - 14,
      duration: 800,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  update(_time?: number, delta = 16.6) {
    if (this.inTransition) return;
    this.syncPosition();
    this.updateRemotePlayers();
    this.chatSystem?.updatePosition('__player__', this.px, this.py);
    this.chatSystem?.update();

    if (this.shopOverlayOpen) {
      if (this.controls.isActionJustDown('back')) {
        this.shopOverlayOpen = false;
        eventBus.emit(EVENTS.SHOP_CLOSE);
      }
      return;
    }

    if (!this.dialog.isActive()) {
      this.handleMovement(delta);
    }

    if (this.controls.isActionJustDown('back')) {
      if (this.dialog.isActive()) {
        this.dialog.clear();
        return;
      }
      this.exitToWorld();
      return;
    }

    if (this.controls.isActionJustDown('interact')) {
      if (this.dialog.isActive()) {
        this.dialog.advance();
      } else {
        this.tryStartVendorDialog();
      }
    }
  }

  private exitToWorld() {
    if (this.inTransition) return;
    this.dialog.clear();
    this.shopOverlayOpen = false;
    eventBus.emit(EVENTS.SHOP_CLOSE);
    this.inTransition = true;
    transitionToScene(this, 'WorldScene', {
      returnX: StoreInterior.RETURN_X,
      returnY: StoreInterior.RETURN_Y,
    });
  }

  private tryStartVendorDialog() {
    if (this.shopOverlayOpen) return;

    const dx = this.px - this.vendorX;
    const dy = this.py - this.vendorY;
    const distSq = dx * dx + dy * dy;
    if (distSq > 160 * 160) return;

    const lines = [
      'Vendedor: Bienvenido a WASPI STORE.',
      'Todo lo que compres aca llega a tu casa y a tu Waspi.',
      'Elegi una prenda y abrimos el checkout con Stripe.',
    ];

    this.dialog.start(lines, {}, () => {
      const first = CATALOG.find((item) => typeof item.priceArs === 'number');
      const itemId = first?.id ?? undefined;
      if (itemId) {
        this.selectedItemId = itemId;
      }
      eventBus.emit(EVENTS.SHOP_OPEN, {
        tab: 'products',
        itemId,
        source: 'store_interior',
      });
      this.flashMessage(this.scale.width / 2, this.scale.height - 40, '▸ SHOP ABIERTO', '#39FF14');
    });
  }

  private handleMovement(delta: number) {
    const { dx, dy, stepX, stepY } = this.controls.readMovementStep(delta, 180, true);

    const { width, height } = this.scale;
    const roomW = 640;
    const roomH = 400;
    const roomX = (width - roomW) / 2 + 20;
    const roomY = (height - roomH) / 2 + 20;

    this.px = Phaser.Math.Clamp(this.px + stepX, roomX, roomX + roomW - 40);
    this.py = Phaser.Math.Clamp(this.py + stepY, roomY + 40, roomY + roomH - 10);

    this.player.update(dx !== 0 || dy !== 0, dx, dy);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
    this.localNameplate?.setPosition(this.px, this.py - 44);
    this.chatSystem?.updatePosition('__player__', this.px, this.py);
    this.lastMoveDx = dx;
    this.lastMoveDy = dy;
    this.lastIsMoving = dx !== 0 || dy !== 0;
  }

  private handleSceneShutdown() {
    try {
      if (this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'player:leave',
          payload: { player_id: this.playerId },
        });
        this.channel.unsubscribe();
        this.channel = null;
      }
    } catch (e) { console.error('[StoreInterior] channel cleanup failed', e); }

    try {
      this.remotePlayers.forEach((player) => {
        player.avatar?.destroy?.();
        player.nameplate?.destroy?.();
      });
      this.remotePlayers.clear();
    } catch (e) { console.error('[StoreInterior] remotePlayers cleanup failed', e); }

    try {
      this.chatSystem?.destroy();
      this.chatSystem = undefined;
    } catch (e) { console.error('[StoreInterior] chatSystem cleanup failed', e); }

    try {
      eventBus.emit(EVENTS.SHOP_CLOSE);
    } catch (e) { console.error('[StoreInterior] SHOP_CLOSE emit failed', e); }

    try {
      this.cleanupFns.forEach((cleanup) => cleanup());
      this.cleanupFns = [];
    } catch (e) { console.error('[StoreInterior] cleanupFns failed', e); }

    try {
      stopSceneMusic(this, this.sceneMusic);
      this.sceneMusic = null;
    } catch (e) { console.error('[StoreInterior] sceneMusic cleanup failed', e); }
  }

  private setupRealtime() {
    if (!supabase || !isConfigured) return;

    this.channel = supabase.channel('waspi-room-store', {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'player:move' }, ({ payload }) => {
        this.handleRemoteMove(payload);
      })
      .on('broadcast', { event: 'player:join' }, ({ payload }) => {
        this.handleRemoteJoin(payload);
      })
      .on('broadcast', { event: 'player:leave' }, ({ payload }) => {
        this.handleRemoteLeave(payload);
      })
      .subscribe(() => {
        this.broadcastSelfState('player:join');
      });
  }

  private broadcastSelfState(event: 'player:join' | 'player:move') {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event,
      payload: {
        player_id: this.playerId,
        username: this.playerUsername,
        x: Math.round(this.px),
        y: Math.round(this.py),
        dir: this.lastMoveDx,
        dy: this.lastMoveDy,
        moving: this.lastIsMoving,
        avatar: loadStoredAvatarConfig(),
      },
    });
  }

  private syncPosition() {
    if (!this.channel) return;
    const now = Date.now();
    if (now - this.lastPosSent < 66) return;
    this.lastPosSent = now;
    this.broadcastSelfState('player:move');
  }

  private updateRemotePlayers() {
    for (const [playerId, remote] of this.remotePlayers.entries()) {
      remote.x = Phaser.Math.Linear(remote.x, remote.targetX, 0.18);
      remote.y = Phaser.Math.Linear(remote.y, remote.targetY, 0.18);
      remote.avatar.update(remote.isMoving, remote.moveDx, remote.moveDy);
      remote.avatar.setPosition(remote.x, remote.y);
      remote.avatar.setDepth(10 + Math.floor(remote.y / 10));
      remote.nameplate.setPosition(remote.x, remote.y - 44);
      this.chatSystem?.updatePosition(playerId, remote.x, remote.y);
    }
  }

  private handleRemoteJoin(payload: unknown) {
    const next = this.parseRemoteState(payload);
    if (!next || next.player_id === this.playerId) return;
    if (!this.remotePlayers.has(next.player_id)) {
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, next.avatar ?? {});
      return;
    }
    const remote = this.remotePlayers.get(next.player_id)!;
    remote.targetX = next.x;
    remote.targetY = next.y;
    remote.username = next.username;
    remote.nameplate.setText(next.username);
  }

  private handleRemoteMove(payload: unknown) {
    const next = this.parseRemoteState(payload);
    if (!next || next.player_id === this.playerId) return;
    if (!this.remotePlayers.has(next.player_id)) {
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, next.avatar ?? {});
    }
    const remote = this.remotePlayers.get(next.player_id)!;
    remote.targetX = next.x;
    remote.targetY = next.y;
    remote.moveDx = next.dir ?? 0;
    remote.moveDy = next.dy ?? 0;
    remote.isMoving = next.moving ?? false;
    remote.username = next.username;
    remote.nameplate.setText(next.username);
  }

  private handleRemoteLeave(payload: unknown) {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    if (!playerId) return;
    const remote = this.remotePlayers.get(playerId);
    if (!remote) return;
    remote.avatar.destroy();
    remote.nameplate.destroy();
    this.remotePlayers.delete(playerId);
    this.chatSystem?.clearBubble(playerId);
  }

  private spawnRemotePlayer(playerId: string, username: string, x: number, y: number, avatarConfig: AvatarConfig) {
    const avatar = new AvatarRenderer(this, x, y, avatarConfig);
    avatar.setDepth(10 + Math.floor(y / 10));
    const nameplate = this.add.text(x, y - 44, username, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#88AAFF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(20);

    this.remotePlayers.set(playerId, {
      avatar,
      nameplate,
      username,
      x,
      y,
      targetX: x,
      targetY: y,
      moveDx: 0,
      moveDy: 0,
      isMoving: false,
      avatarConfig,
    });
  }

  private getOrCreatePlayerId() {
    if (typeof window === 'undefined') return crypto.randomUUID();
    const key = 'waspi_session_id';
    const stored = window.sessionStorage.getItem(key);
    if (stored) return stored;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(key, id);
    return id;
  }

  private getOrCreateUsername() {
    if (typeof window === 'undefined') return 'waspi_guest';
    const stored = window.localStorage.getItem('waspi_username');
    if (stored) return stored;
    return 'waspi_guest';
  }

  private readStringField(payload: unknown, ...keys: string[]) {
    if (!payload || typeof payload !== 'object') return null;
    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  private readNumberField(payload: unknown, ...keys: string[]) {
    if (!payload || typeof payload !== 'object') return null;
    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
  }

  private readBooleanField(payload: unknown, ...keys: string[]) {
    if (!payload || typeof payload !== 'object') return null;
    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'boolean') return value;
    }
    return null;
  }

  private parseRemoteState(payload: unknown) {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    const username = this.readStringField(payload, 'username') ?? 'waspi_guest';
    const x = this.readNumberField(payload, 'x');
    const y = this.readNumberField(payload, 'y');
    if (!playerId || x === null || y === null) return null;
    const avatar = payload && typeof payload === 'object' && 'avatar' in payload && payload.avatar && typeof payload.avatar === 'object'
      ? payload.avatar as AvatarConfig
      : undefined;
    return {
      player_id: playerId,
      username,
      x,
      y,
      dir: this.readNumberField(payload, 'dir', 'dx'),
      dy: this.readNumberField(payload, 'dy'),
      moving: this.readBooleanField(payload, 'moving', 'isMoving'),
      avatar,
    };
  }
}
