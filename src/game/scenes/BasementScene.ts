import Phaser from 'phaser';
import { BUILDINGS, SAFE_PLAZA_RETURN } from '../config/constants';
import { announceScene, bindSafeResetToPlaza, createBackButton, transitionToScene } from '../systems/SceneUi';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCENE_W = 2400;
const SCENE_H = 1800;

const WALL_OUTER  = 24;   // px — outer perimeter walls
const WALL_INNER  = 16;   // px — room dividers

// Depth layers (mirrors WorldScene conventions)
const DEPTH_FLOOR     = 0;
const DEPTH_FURNITURE = 10;
const DEPTH_WALLS     = 20;

// Colours
const C_BG           = 0x0E0E14;
const C_WALL_OUTER   = 0x0A0A12;
const C_WALL_INNER   = 0x111118;
const C_GOLD         = 0xF5C842;
const C_TAN          = 0xC8A96E;

// Room floor colours
const C_FLOOR_LIVING  = 0x1A1A2A;
const C_FLOOR_KITCHEN = 0x161620;
const C_FLOOR_BEDROOM = 0x14141E;
const C_FLOOR_BATH    = 0x111118;
const C_FLOOR_OWL     = 0x0D0D18;

// ─── Player spawn & zombie spawns (exported for game logic) ───────────────────

export const BASEMENT_PLAYER_SPAWN = { x: 160, y: 660 };
export const BASEMENT_ZOMBIES_ENTRY = { x: 1540, y: 1410 };
const BASEMENT_RETURN = {
  x: BUILDINGS.HOUSE.x + BUILDINGS.HOUSE.w / 2,
  y: BUILDINGS.HOUSE.y + BUILDINGS.HOUSE.h + 26,
};

export const ZOMBIE_SPAWNS: Array<{ x: number; y: number; archetype: 'rusher' | 'shooter' | 'tank' | 'boss' }> = [
  { x: 400,  y: 700,  archetype: 'rusher'  },
  { x: 650,  y: 550,  archetype: 'rusher'  },
  { x: 980,  y: 450,  archetype: 'shooter' },
  { x: 1100, y: 300,  archetype: 'shooter' },
  { x: 1200, y: 120,  archetype: 'tank'    },
  { x: 1500, y: 1250, archetype: 'boss'    }, // owl room boss
];

// ─── Room boundary data (also used for minimap ghost rects) ───────────────────

interface RoomBounds {
  key: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ROOMS: RoomBounds[] = [
  { key: 'living',  label: 'LIVING ROOM', x: 140,  y: 200,  w: 900,  h: 1000 },
  { key: 'kitchen', label: 'KITCHEN',     x: 900,  y: 140,  w: 500,  h: 700  },
  { key: 'bedroom', label: 'BEDROOM',     x: 1060, y: 40,   w: 600,  h: 500  },
  { key: 'bath',    label: 'BATHROOM',    x: 1360, y: 40,   w: 280,  h: 240  },
  { key: 'owl',     label: 'OWL ROOM',    x: 1300, y: 1000, w: 500,  h: 500  },
];

// ─── Scene ────────────────────────────────────────────────────────────────────

export class BasementScene extends Phaser.Scene {
  /** Invisible rectangles used for collision — populated in setupCollisions(). */
  public wallBodies: Phaser.GameObjects.Rectangle[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private interactionText?: Phaser.GameObjects.Text;
  private interactionGlow?: Phaser.GameObjects.Ellipse;

  constructor() {
    super({ key: 'BasementScene' });
  }

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  create() {
    announceScene(this);
    bindSafeResetToPlaza(this, () => {
      transitionToScene(this, 'WorldScene', {
        returnX: SAFE_PLAZA_RETURN.X,
        returnY: SAFE_PLAZA_RETURN.Y,
      });
    });
    this.cameras.main.setBackgroundColor('#0E0E14');
    this.cameras.main.setBounds(0, 0, SCENE_W, SCENE_H);
    this.cameras.main.setZoom(0.94);
    this.cameras.main.centerOn(BASEMENT_PLAYER_SPAWN.x + 220, BASEMENT_PLAYER_SPAWN.y - 120);

    this.drawFloors();
    this.drawStaircase();
    this.drawFurniture();
    this.drawWalls();
    this.drawMinimapBounds();
    this.drawRoomLabels();
    this.setupCollisions();
    this.drawSceneChrome();

    createBackButton(this, () => this.exitToWorld());
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    const speed = 520 * (delta / 1000);
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.keyA.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.keyD.isDown) dx += 1;
    if (this.cursors.up.isDown || this.keyW.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.keyS.isDown) dy += 1;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    if (dx !== 0 || dy !== 0) {
      const cam = this.cameras.main;
      cam.scrollX = Phaser.Math.Clamp(cam.scrollX + dx * speed, 0, SCENE_W - cam.width / cam.zoom);
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY + dy * speed, 0, SCENE_H - cam.height / cam.zoom);
    }

    this.updateInteractionUi();

    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.enterZombieDepths();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.exitToWorld();
    }
  }

  private exitToWorld() {
    transitionToScene(this, 'WorldScene', {
      returnX: BASEMENT_RETURN.x,
      returnY: BASEMENT_RETURN.y,
    });
  }

  private enterZombieDepths() {
    transitionToScene(this, 'ZombiesScene', {
      returnScene: 'BasementScene',
      returnX: BASEMENT_ZOMBIES_ENTRY.x,
      returnY: BASEMENT_ZOMBIES_ENTRY.y,
      entryLabel: 'BASEMENT',
    });
  }

  // ---------------------------------------------------------------------------
  // Floors
  // ---------------------------------------------------------------------------

  private drawFloors() {
    const g = this.add.graphics().setDepth(DEPTH_FLOOR);

    // ── Outer background fill ──
    g.fillStyle(C_BG, 1);
    g.fillRect(0, 0, SCENE_W, SCENE_H);

    // ── Subtle noise / grid overlay on entire scene ──
    g.lineStyle(1, 0x13131F, 0.35);
    for (let x = 0; x < SCENE_W; x += 32) {
      g.lineBetween(x, 0, x, SCENE_H);
    }
    for (let y = 0; y < SCENE_H; y += 32) {
      g.lineBetween(0, y, SCENE_W, y);
    }

    // ── Room floors ──
    const floorColors: Record<string, number> = {
      living:  C_FLOOR_LIVING,
      kitchen: C_FLOOR_KITCHEN,
      bedroom: C_FLOOR_BEDROOM,
      bath:    C_FLOOR_BATH,
      owl:     C_FLOOR_OWL,
    };

    for (const room of ROOMS) {
      const col = floorColors[room.key] ?? C_BG;
      g.fillStyle(col, 1);
      g.fillRect(room.x, room.y, room.w, room.h);

      // Tile texture — subtle 16px grid
      g.lineStyle(1, 0x000000, 0.18);
      for (let x = room.x; x < room.x + room.w; x += 16) {
        g.lineBetween(x, room.y, x, room.y + room.h);
      }
      for (let y = room.y; y < room.y + room.h; y += 16) {
        g.lineBetween(room.x, y, room.x + room.w, y);
      }

      // Room border stroke
      g.lineStyle(2, 0x000000, 0.5);
      g.strokeRect(room.x, room.y, room.w, room.h);
    }

    // ── Bathroom darker tile pattern ──
    const bath = ROOMS.find(r => r.key === 'bath')!;
    g.fillStyle(0x0E0E16, 0.45);
    for (let x = bath.x; x < bath.x + bath.w; x += 24) {
      for (let y = bath.y; y < bath.y + bath.h; y += 24) {
        if (((x - bath.x) / 24 + (y - bath.y) / 24) % 2 === 0) {
          g.fillRect(x, y, 24, 24);
        }
      }
    }

    // ── Owl room — ambient glow from below ──
    const owlG = this.add.graphics().setDepth(DEPTH_FLOOR + 1);
    const owl = ROOMS.find(r => r.key === 'owl')!;
    owlG.fillStyle(0x1A003A, 0.30);
    owlG.fillRect(owl.x + 80, owl.y + 80, owl.w - 160, owl.h - 160);

    // ── Yellow bar counter between kitchen and living room (visual separator) ──
    g.fillStyle(C_GOLD, 1);
    g.fillRect(140, 200, 1200, 20);
  }

  // ---------------------------------------------------------------------------
  // Staircase (left wall, x=0..120, y=80..700)
  // ---------------------------------------------------------------------------

  private drawStaircase() {
    const g = this.add.graphics().setDepth(DEPTH_FURNITURE);

    // Staircase shaft background
    g.fillStyle(0x080810, 1);
    g.fillRect(0, 80, 120, 620);
    g.lineStyle(2, 0x1A1A2A, 0.9);
    g.strokeRect(0, 80, 120, 620);

    // 8 steps — alternating gold (#F5C842) and tan (#C8A96E)
    const stepCount = 8;
    const stairTop   = 100;
    const stairH     = 560;
    const stepH      = Math.floor(stairH / stepCount);  // ~70 px each

    for (let i = 0; i < stepCount; i++) {
      const stepY  = stairTop + i * stepH;
      const isGold = i % 2 === 0;

      // Step tread
      g.fillStyle(isGold ? C_GOLD : C_TAN, 1);
      g.fillRect(8, stepY, 104, stepH - 4);

      // Riser shadow (gives 3-D depth)
      g.fillStyle(0x000000, 0.30);
      g.fillRect(8, stepY + stepH - 6, 104, 4);

      // Nosing highlight
      g.fillStyle(0xFFFFFF, 0.08);
      g.fillRect(8, stepY, 104, 3);
    }

    // Handrail
    g.lineStyle(3, 0x7A6040, 0.9);
    g.lineBetween(6, stairTop, 6, stairTop + stairH);
    g.lineStyle(3, 0x7A6040, 0.9);
    g.lineBetween(114, stairTop, 114, stairTop + stairH);

    // Entry platform at bottom of stairs (x=120, y=680)
    g.fillStyle(C_FLOOR_LIVING, 1);
    g.fillRect(120, 640, 40, 60);
    g.lineStyle(2, C_GOLD, 0.45);
    g.strokeRect(120, 640, 40, 60);

    // Entry label arrow pointing right
    this.add.text(80, 660, '▶', {
      fontSize: '14px',
      color: '#F5C842',
    }).setOrigin(0.5).setDepth(DEPTH_FURNITURE + 1).setAlpha(0.6);
  }

  // ---------------------------------------------------------------------------
  // Furniture
  // ---------------------------------------------------------------------------

  private drawFurniture() {
    const g = this.add.graphics().setDepth(DEPTH_FURNITURE);

    // ══════════════════════════════════════════════════════
    // LIVING ROOM furniture
    // ══════════════════════════════════════════════════════

    // Sofa_1 — horizontal sofa facing right
    this.addFurniture(g, 220, 380, 200, 80, 0x3D2B1F, 'sofa');
    // Sofa_2
    this.addFurniture(g, 460, 380, 200, 80, 0x3D2B1F, 'sofa');
    // Sofa_3
    this.addFurniture(g, 700, 380, 200, 80, 0x3D2B1F, 'sofa');

    // Coffee Table
    this.addFurniture(g, 350, 500, 260, 120, 0x5C3D1E, 'table');

    // Single Couch 1
    this.addFurniture(g, 220, 600, 100, 100, 0x3D2B1F, 'couch');
    // Single Couch 2
    this.addFurniture(g, 370, 600, 100, 100, 0x3D2B1F, 'couch');

    // Large dining table at bottom of living room
    this.addFurniture(g, 200, 900, 480, 160, 0x5C3D1E, 'table');

    // ══════════════════════════════════════════════════════
    // KITCHEN furniture
    // ══════════════════════════════════════════════════════

    // Counter (top of kitchen)
    g.fillStyle(0x2A2A3A, 1);
    g.fillRect(920, 180, 460, 120);
    // Counter lighter trim / edge
    g.fillStyle(0x3A3A4C, 1);
    g.fillRect(920, 180, 460, 10);    // top edge
    g.fillRect(920, 180, 10, 120);    // left edge
    g.lineStyle(1, 0x5A5A7A, 0.5);
    g.strokeRect(920, 180, 460, 120);

    // Kitchen island
    g.fillStyle(0x2A2A3A, 1);
    g.fillRect(960, 360, 280, 160);
    g.fillStyle(0x3A3A4C, 0.6);
    g.fillRect(960, 360, 280, 8);
    g.lineStyle(1, 0x4A4A6A, 0.55);
    g.strokeRect(960, 360, 280, 160);
    // Island stools hint
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0x1E1E30, 0.8);
      g.fillCircle(990 + i * 90, 540, 14);
    }

    // Stove / appliance
    g.fillStyle(0x111118, 1);
    g.fillRect(1060, 560, 140, 100);
    g.lineStyle(1, 0x333344, 0.7);
    g.strokeRect(1060, 560, 140, 100);
    // Burners
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        g.lineStyle(2, 0x555566, 0.8);
        g.strokeCircle(1090 + c * 60, 590 + r * 40, 16);
      }
    }

    // ══════════════════════════════════════════════════════
    // BEDROOM furniture
    // ══════════════════════════════════════════════════════

    // Bed — headboard is darker
    g.fillStyle(0x4A3060, 1);
    g.fillRect(1080, 60, 260, 200);
    // Headboard
    g.fillStyle(0x2A1A40, 1);
    g.fillRect(1080, 60, 260, 40);
    g.lineStyle(1, 0x7A5090, 0.6);
    g.strokeRect(1080, 60, 260, 200);
    // Pillow hints
    g.fillStyle(0xCCAADD, 0.25);
    g.fillRect(1095, 110, 80, 50);
    g.fillRect(1245, 110, 80, 50);

    // Nightstand
    this.addFurniture(g, 1360, 80, 100, 80, 0x3D2B1F, 'table');

    // Wardrobe
    g.fillStyle(0x2A1F14, 1);
    g.fillRect(1480, 60, 160, 120);
    g.lineStyle(1, 0x4A3024, 0.8);
    g.strokeRect(1480, 60, 160, 120);
    // Wardrobe door lines
    g.lineStyle(1, 0x3C2A1A, 0.9);
    g.lineBetween(1560, 60, 1560, 180);  // centre split
    g.lineStyle(1, 0xAA8866, 0.3);
    g.fillCircle(1548, 120, 5);           // left knob
    g.fillCircle(1572, 120, 5);           // right knob

    // ══════════════════════════════════════════════════════
    // BATHROOM furniture
    // ══════════════════════════════════════════════════════

    // Toilet
    g.fillStyle(0xCCCCCC, 1);
    g.fillRect(1480, 60, 70, 90);
    g.fillStyle(0xAAAAAA, 1);
    g.fillRect(1480, 60, 70, 20);    // tank
    g.lineStyle(1, 0x888888, 0.7);
    g.strokeRect(1480, 60, 70, 90);

    // Bathtub
    g.fillStyle(0xAAAAACC, 1);
    g.fillRect(1380, 160, 200, 100);
    g.fillStyle(0x8888AA, 0.30);
    g.fillRect(1390, 170, 180, 80);  // water
    g.lineStyle(1, 0x9999BB, 0.7);
    g.strokeRect(1380, 160, 200, 100);

    // ══════════════════════════════════════════════════════
    // OWL ROOM — decorative owl symbol (graphics primitive)
    // ══════════════════════════════════════════════════════
    this.drawOwlSymbol();

    // ══════════════════════════════════════════════════════
    // Boss spawn indicator in owl room
    // ══════════════════════════════════════════════════════
    const bossSpawn = ZOMBIE_SPAWNS.find(s => s.archetype === 'boss')!;
    const bossGlow = this.add.ellipse(bossSpawn.x, bossSpawn.y + 16, 90, 30, 0x3DD6FF, 0.07)
      .setDepth(DEPTH_FLOOR + 2);
    bossGlow.setStrokeStyle(1, 0x3DD6FF, 0.22);
    this.tweens.add({
      targets: bossGlow,
      alpha: { from: 0.07, to: 0.22 },
      scale: { from: 0.95, to: 1.05 },
      yoyo: true,
      repeat: -1,
      duration: 1100,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * Draws the owl symbol (two circles for eyes, beak triangle, wing arcs)
   * using pure Phaser Graphics primitives.
   */
  private drawOwlSymbol() {
    const owl = ROOMS.find(r => r.key === 'owl')!;
    const cx  = owl.x + owl.w / 2;
    const cy  = owl.y + owl.h / 2 - 20;

    const g = this.add.graphics().setDepth(DEPTH_FURNITURE + 1);

    // Outer body silhouette
    g.fillStyle(0x220033, 0.6);
    g.fillEllipse(cx, cy + 20, 120, 150);

    // Wings (arcs on each side)
    g.lineStyle(3, 0x9922CC, 0.55);
    g.strokeEllipse(cx - 70, cy + 30, 80, 120);
    g.strokeEllipse(cx + 70, cy + 30, 80, 120);

    // Head circle
    g.lineStyle(2, 0xAA44FF, 0.7);
    g.strokeCircle(cx, cy - 20, 40);

    // Left eye
    g.fillStyle(0xF5C842, 0.90);
    g.fillCircle(cx - 14, cy - 22, 10);
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 14, cy - 22, 5);
    g.fillStyle(0xFFFFFF, 0.6);
    g.fillCircle(cx - 11, cy - 25, 2);

    // Right eye
    g.fillStyle(0xF5C842, 0.90);
    g.fillCircle(cx + 14, cy - 22, 10);
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx + 14, cy - 22, 5);
    g.fillStyle(0xFFFFFF, 0.6);
    g.fillCircle(cx + 17, cy - 25, 2);

    // Beak (small diamond)
    g.fillStyle(0xC8A96E, 1);
    g.fillTriangle(cx - 8, cy - 10, cx + 8, cy - 10, cx, cy);

    // Ear tufts
    g.fillStyle(0x220033, 0.8);
    g.fillTriangle(cx - 20, cy - 54, cx - 32, cy - 70, cx - 8, cy - 58);
    g.fillTriangle(cx + 20, cy - 54, cx + 32, cy - 70, cx + 8, cy - 58);
    g.lineStyle(1, 0xAA44FF, 0.6);
    g.strokeTriangle(cx - 20, cy - 54, cx - 32, cy - 70, cx - 8, cy - 58);
    g.strokeTriangle(cx + 20, cy - 54, cx + 32, cy - 70, cx + 8, cy - 58);

    // Pulsing ring around entire symbol
    const ring = this.add.circle(cx, cy, 85, 0x6600AA, 0)
      .setDepth(DEPTH_FURNITURE)
      .setStrokeStyle(2, 0x9922CC, 0.35);
    this.tweens.add({
      targets: ring,
      alpha: { from: 0.0, to: 0.45 },
      scale: { from: 0.90, to: 1.12 },
      yoyo: true,
      repeat: -1,
      duration: 1400,
      ease: 'Sine.easeInOut',
    });

    this.add.text(cx, cy + 110, 'OWL ROOM', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#9922CC',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH_FURNITURE + 2).setAlpha(0.7);
  }

  // ---------------------------------------------------------------------------
  // Walls
  // ---------------------------------------------------------------------------

  private drawWalls() {
    const g = this.add.graphics().setDepth(DEPTH_WALLS);

    // ── Outer perimeter ──────────────────────────────────
    g.fillStyle(C_WALL_OUTER, 1);
    // Top wall
    g.fillRect(0, 0, SCENE_W, WALL_OUTER);
    // Bottom wall
    g.fillRect(0, SCENE_H - WALL_OUTER, SCENE_W, WALL_OUTER);
    // Left wall (full height — staircase is inside it)
    g.fillRect(0, 0, WALL_OUTER, SCENE_H);
    // Right wall
    g.fillRect(SCENE_W - WALL_OUTER, 0, WALL_OUTER, SCENE_H);

    // Outer wall stroke
    g.lineStyle(2, 0x222230, 0.9);
    g.strokeRect(0, 0, SCENE_W, SCENE_H);

    // ── Internal room dividers ────────────────────────────
    g.fillStyle(C_WALL_INNER, 1);

    // Staircase right wall (x=120, full stair height 80-700, with doorway at bottom ~620-740)
    this.drawWallSegment(g, 120, 80, WALL_INNER, 540);          // y=80..620
    // doorway gap 620..740
    this.drawWallSegment(g, 120, 740, WALL_INNER, SCENE_H - 740);

    // ── Living room / Kitchen divider ──
    // Vertical wall at x=900, y=200..900 — doorway at y=440..560
    this.drawWallSegment(g, 900, 200, WALL_INNER, 240);          // y=200..440
    // doorway 440..560
    this.drawWallSegment(g, 900, 560, WALL_INNER, 340);          // y=560..900

    // ── Kitchen / Bedroom divider ──
    // Horizontal wall at y=140, x=900..1660 — doorway at x=1060..1180
    this.drawWallSegment(g, 900,  140, 160,        WALL_INNER);  // x=900..1060
    // doorway 1060..1180
    this.drawWallSegment(g, 1180, 140, 480,        WALL_INNER);  // x=1180..1660

    // ── Bedroom / Bathroom divider ──
    // Vertical wall at x=1360, y=40..280 — doorway at y=100..220
    this.drawWallSegment(g, 1360, 40,  WALL_INNER, 60);          // y=40..100
    // doorway 100..220
    this.drawWallSegment(g, 1360, 220, WALL_INNER, 60);          // y=220..280
    // Bathroom bottom wall (y=280, x=1360..1640)
    this.drawWallSegment(g, 1360, 280, 280,        WALL_INNER);

    // ── Kitchen bottom wall (y=840, x=900..1400) ──
    // doorway at x=1200..1320 to connect living→kitchen corridor south
    this.drawWallSegment(g, 900,  840, 300,        WALL_INNER);  // x=900..1200
    // doorway 1200..1320
    this.drawWallSegment(g, 1320, 840, 80,         WALL_INNER);  // x=1320..1400

    // ── Living room bottom wall (y=1200, x=140..1040) ──
    // doorway at x=500..620 toward owl room corridor
    this.drawWallSegment(g, 140,  1200, 360,       WALL_INNER);  // x=140..500
    // doorway 500..620
    this.drawWallSegment(g, 620,  1200, 420,       WALL_INNER);  // x=620..1040

    // ── Owl room north wall (y=1000, x=1300..1800) ──
    // doorway at x=1420..1540
    this.drawWallSegment(g, 1300, 1000, 120,       WALL_INNER);  // x=1300..1420
    // doorway 1420..1540
    this.drawWallSegment(g, 1540, 1000, 260,       WALL_INNER);  // x=1540..1800

    // ── Owl room left wall (x=1300, y=1000..1500) ──
    this.drawWallSegment(g, 1300, 1000, WALL_INNER, 500);

    // ── Owl room right wall (x=1800, y=1000..1500) ──
    this.drawWallSegment(g, 1800, 1000, WALL_INNER, 500);

    // ── Owl room bottom wall (y=1500, x=1300..1800) ──
    this.drawWallSegment(g, 1300, 1500, 500,       WALL_INNER);

    // Stroke all inner walls for definition
    g.lineStyle(1, 0x1C1C28, 0.9);
    g.strokeRect(0, 0, SCENE_W, SCENE_H);
  }

  /**
   * Draws a single wall segment (filled rect) at world coords.
   * x, y = top-left corner; w, h = dimensions.
   */
  private drawWallSegment(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    g.fillRect(x, y, w, h);
    g.lineStyle(1, 0x1C1C28, 0.7);
    g.strokeRect(x, y, w, h);
  }

  // ---------------------------------------------------------------------------
  // Minimap ghost bounds (alpha=0, invisible — for dev / future minimap)
  // ---------------------------------------------------------------------------

  private drawMinimapBounds() {
    for (const room of ROOMS) {
      this.add.rectangle(
        room.x + room.w / 2,
        room.y + room.h / 2,
        room.w,
        room.h,
        0xFFFFFF,
        0,  // fully transparent — purely logical boundary
      ).setDepth(DEPTH_FLOOR - 1).setName(`minimap_${room.key}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Room label text (Press Start 2P, low alpha — dev reference)
  // ---------------------------------------------------------------------------

  private drawRoomLabels() {
    const labelStyle = {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    };

    for (const room of ROOMS) {
      const cx = room.x + room.w / 2;
      const cy = room.y + 18;
      this.add.text(cx, cy, room.label, labelStyle)
        .setOrigin(0.5)
        .setAlpha(0.25)   // dev reference — low visibility in game
        .setDepth(DEPTH_WALLS + 5);
    }

    // Staircase label
    this.add.text(60, 390, 'STAIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C8A96E',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0.3).setDepth(DEPTH_WALLS + 5).setAngle(-90);
  }

  // ---------------------------------------------------------------------------
  // Collision bodies
  // ---------------------------------------------------------------------------

  private setupCollisions() {
    // Each wall segment becomes an invisible rectangle that game logic
    // can use with arcade physics or manual overlap checks.
    // Mirrors the pattern used in ZombiesScene's buildObstacles().

    const wallDefs: Array<[number, number, number, number]> = [
      // [x, y, w, h]

      // Outer perimeter
      [0,             0,             SCENE_W,       WALL_OUTER  ],  // top
      [0,             SCENE_H - WALL_OUTER, SCENE_W, WALL_OUTER ],  // bottom
      [0,             0,             WALL_OUTER,    SCENE_H     ],  // left
      [SCENE_W - WALL_OUTER, 0,     WALL_OUTER,    SCENE_H     ],  // right

      // Staircase right wall segments
      [120, 80,   WALL_INNER, 540],
      [120, 740,  WALL_INNER, SCENE_H - 740],

      // Living / Kitchen divider
      [900, 200,  WALL_INNER, 240],
      [900, 560,  WALL_INNER, 340],

      // Kitchen / Bedroom horizontal divider
      [900,  140, 160,  WALL_INNER],
      [1180, 140, 480,  WALL_INNER],

      // Bedroom / Bathroom vertical divider
      [1360, 40,  WALL_INNER, 60],
      [1360, 220, WALL_INNER, 60],
      [1360, 280, 280,  WALL_INNER],

      // Kitchen bottom
      [900,  840, 300,  WALL_INNER],
      [1320, 840, 80,   WALL_INNER],

      // Living room bottom
      [140,  1200, 360, WALL_INNER],
      [620,  1200, 420, WALL_INNER],

      // Owl room walls
      [1300, 1000, 120,  WALL_INNER],
      [1540, 1000, 260,  WALL_INNER],
      [1300, 1000, WALL_INNER, 500],
      [1800, 1000, WALL_INNER, 500],
      [1300, 1500, 500,  WALL_INNER],
    ];

    for (const [x, y, w, h] of wallDefs) {
      const body = this.add.rectangle(
        x + w / 2,
        y + h / 2,
        w,
        h,
        0x000000,
        0,  // invisible
      ).setDepth(DEPTH_WALLS + 1);
      this.wallBodies.push(body);
    }
  }

  private drawSceneChrome() {
    this.add.text(this.cameras.main.width / 2, 26, 'STAIRWAYS TO BASEMENT', {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12000);

    this.add.text(this.cameras.main.width / 2, 48, 'WASD / FLECHAS EXPLORAR  |  SPACE BAJAR  |  ESC VOLVER', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C8A96E',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12000);

    this.add.text(this.cameras.main.width / 2, 68, 'EL NIVEL ZOMBIES REAL ESTA ABAJO', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF9DC8',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12000);

    const marker = this.add.circle(BASEMENT_PLAYER_SPAWN.x, BASEMENT_PLAYER_SPAWN.y, 18, 0xF5C842, 0.12).setDepth(DEPTH_FURNITURE + 3);
    marker.setStrokeStyle(2, 0xF5C842, 0.55);
    this.tweens.add({
      targets: marker,
      alpha: { from: 0.12, to: 0.35 },
      scale: { from: 1, to: 1.25 },
      yoyo: true,
      repeat: -1,
      duration: 900,
      ease: 'Sine.easeInOut',
    });

    this.add.text(BASEMENT_PLAYER_SPAWN.x + 74, BASEMENT_PLAYER_SPAWN.y - 8, 'ENTRADA', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_FURNITURE + 4);

    const descentGlow = this.add.ellipse(BASEMENT_ZOMBIES_ENTRY.x, BASEMENT_ZOMBIES_ENTRY.y + 18, 134, 56, 0xFF6EA8, 0.08)
      .setDepth(DEPTH_FURNITURE + 2)
      .setStrokeStyle(2, 0xFF6EA8, 0.42);
    this.tweens.add({
      targets: descentGlow,
      alpha: { from: 0.08, to: 0.24 },
      scaleX: 1.05,
      scaleY: 1.12,
      yoyo: true,
      repeat: -1,
      duration: 960,
      ease: 'Sine.easeInOut',
    });

    const guide = this.add.graphics().setDepth(DEPTH_FURNITURE + 3);
    guide.fillStyle(0x090811, 1);
    guide.fillRoundedRect(BASEMENT_ZOMBIES_ENTRY.x - 82, BASEMENT_ZOMBIES_ENTRY.y - 40, 164, 88, 10);
    guide.lineStyle(2, 0xFF6EA8, 0.85);
    guide.strokeRoundedRect(BASEMENT_ZOMBIES_ENTRY.x - 82, BASEMENT_ZOMBIES_ENTRY.y - 40, 164, 88, 10);
    guide.fillStyle(0x1e1323, 1);
    for (let i = 0; i < 5; i += 1) {
      guide.fillRect(BASEMENT_ZOMBIES_ENTRY.x - 36 + i * 8, BASEMENT_ZOMBIES_ENTRY.y - 8 + i * 11, 72 - i * 16, 7);
    }
    guide.lineStyle(2, 0x9E89B4, 0.85);
    guide.lineBetween(BASEMENT_ZOMBIES_ENTRY.x - 58, BASEMENT_ZOMBIES_ENTRY.y + 34, BASEMENT_ZOMBIES_ENTRY.x - 20, BASEMENT_ZOMBIES_ENTRY.y - 14);
    guide.lineBetween(BASEMENT_ZOMBIES_ENTRY.x + 58, BASEMENT_ZOMBIES_ENTRY.y + 34, BASEMENT_ZOMBIES_ENTRY.x + 20, BASEMENT_ZOMBIES_ENTRY.y - 14);

    this.add.text(BASEMENT_ZOMBIES_ENTRY.x, BASEMENT_ZOMBIES_ENTRY.y - 68, 'LOWER ACCESS', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF9DC8',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_FURNITURE + 4);

    this.add.text(BASEMENT_ZOMBIES_ENTRY.x, BASEMENT_ZOMBIES_ENTRY.y + 66, 'DESCENSO', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_FURNITURE + 4);
  }

  private isNearZombieAccess() {
    const cam = this.cameras.main;
    return Phaser.Math.Distance.Between(cam.midPoint.x, cam.midPoint.y, BASEMENT_ZOMBIES_ENTRY.x, BASEMENT_ZOMBIES_ENTRY.y) <= 170;
  }

  private updateInteractionUi() {
    if (!this.interactionText) {
      this.interactionText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height - 36, '', {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#FF9DC8',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(12001).setVisible(false);
    }
    if (!this.interactionGlow) {
      this.interactionGlow = this.add.ellipse(this.cameras.main.width / 2, this.cameras.main.height - 40, 360, 28, 0xFF6EA8, 0.12)
        .setScrollFactor(0)
        .setDepth(12000)
        .setVisible(false);
    }

    const near = this.isNearZombieAccess();
    this.interactionText.setVisible(true);
    this.interactionGlow.setVisible(true);
    this.interactionGlow.setFillStyle(0xFF6EA8, near ? 0.18 : 0.08);
    this.interactionText.setColor(near ? '#FF9DC8' : '#D8A8FF');
    this.interactionText.setText(near
      ? 'SPACE BAJAR AL NIVEL ZOMBIES'
      : 'SPACE ENTRAR AL NIVEL ZOMBIES');
  }

  private addFurniture(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    kind: 'sofa' | 'table' | 'couch',
  ) {
    g.fillStyle(color, 1);
    g.fillRect(x, y, w, h);

    // Top-edge highlight
    const lighterCol = Phaser.Display.Color.IntegerToColor(color);
    lighterCol.lighten(18);
    g.fillStyle(lighterCol.color, 0.55);
    g.fillRect(x, y, w, 6);

    // Right/bottom shadow edge
    g.fillStyle(0x000000, 0.25);
    g.fillRect(x,     y + h - 4, w, 4);
    g.fillRect(x + w - 4, y, 4, h);

    // Stroke
    g.lineStyle(1, 0x000000, 0.5);
    g.strokeRect(x, y, w, h);

    // Kind-specific detail
    if (kind === 'sofa') {
      // Cushion dividers
      const cushionCount = Math.max(1, Math.floor(w / 70));
      const cw = Math.floor(w / cushionCount);
      g.lineStyle(1, 0x000000, 0.35);
      for (let i = 1; i < cushionCount; i++) {
        g.lineBetween(x + i * cw, y + 4, x + i * cw, y + h - 4);
      }
      // Backrest stripe
      g.fillStyle(0x000000, 0.15);
      g.fillRect(x, y, w, 12);
    }

    if (kind === 'table') {
      // Wood grain lines
      g.lineStyle(1, 0x000000, 0.12);
      for (let lx = x + 10; lx < x + w - 10; lx += 16) {
        g.lineBetween(lx, y + 4, lx, y + h - 4);
      }
    }

    if (kind === 'couch') {
      // Single square cushion
      g.lineStyle(1, 0x000000, 0.25);
      g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    }
  }
}

