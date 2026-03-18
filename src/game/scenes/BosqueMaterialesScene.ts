import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { announceScene, createBackButton, transitionToScene } from '../systems/SceneUi';
import { SceneControls } from '../systems/SceneControls';
import { eventBus, EVENTS } from '../config/eventBus';
import { SAFE_PLAZA_RETURN } from '../config/constants';
import { getSkillSystem } from '../systems/SkillSystem';
import { getContractSystem } from '../systems/ContractSystem';
import { MiningMinigame } from '../systems/MiningMinigame';
import { getMasterySystem } from '../systems/MasterySystem';
import { getEventSystem } from '../systems/EventSystem';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 1600;
const H = 1200;
const MOVE_SPEED = 140;
const SPRINT_MULT = 1.55;
const MOB_AGGRO_RANGE = 200;
const MOB_DAMAGE_COOLDOWN_MS = 900;
const MATERIAL_COLLECT_RANGE = 52;
const MATERIAL_RESPAWN_MS = 18_000;
const CAVE_INTERACT_RANGE = 110;

const ENTRY_X = 800;
const ENTRY_Y = 1080;
const RETURN_VECINDAD_X = 1400;
const RETURN_VECINDAD_Y = 200;

// ─── Tree layout (trunk center x/y, canopy radius) ────────────────────────────
const TREES: Array<{ x: number; y: number; r: number }> = [
  // Left edge
  { x: 70,  y: 130, r: 34 }, { x: 100, y: 340, r: 30 }, { x: 80,  y: 560, r: 32 },
  { x: 90,  y: 780, r: 28 }, { x: 75,  y: 990, r: 30 },
  // Right edge (cave side — sparse)
  { x: 1530, y: 300, r: 30 }, { x: 1520, y: 520, r: 28 }, { x: 1540, y: 740, r: 32 },
  { x: 1510, y: 960, r: 30 },
  // Top edge (away from cave)
  { x: 200, y: 80,  r: 32 }, { x: 430, y: 70,  r: 28 }, { x: 680, y: 85,  r: 30 },
  { x: 900, y: 75,  r: 28 }, { x: 1060, y: 90, r: 30 },
  // Mid-left cluster
  { x: 240, y: 420, r: 34 }, { x: 180, y: 640, r: 30 }, { x: 310, y: 730, r: 28 },
  { x: 220, y: 900, r: 32 },
  // Mid cluster
  { x: 560, y: 280, r: 30 }, { x: 740, y: 200, r: 28 }, { x: 640, y: 460, r: 26 },
  { x: 860, y: 380, r: 30 }, { x: 980, y: 260, r: 28 }, { x: 1050, y: 450, r: 30 },
  { x: 780, y: 760, r: 28 }, { x: 950, y: 820, r: 30 }, { x: 620, y: 870, r: 26 },
  { x: 470, y: 980, r: 28 }, { x: 720, y: 1020, r: 26 },
  // Upper-right (away from cave clearing)
  { x: 1200, y: 200, r: 28 }, { x: 1130, y: 350, r: 30 }, { x: 1260, y: 500, r: 28 },
  { x: 1150, y: 650, r: 30 }, { x: 1300, y: 750, r: 26 }, { x: 1200, y: 900, r: 28 },
];

// ─── Material node positions ───────────────────────────────────────────────────
const MATERIAL_DEFS: Array<{ x: number; y: number }> = [
  // Clearing 1 (centre-west)
  { x: 350, y: 530 }, { x: 420, y: 580 }, { x: 290, y: 620 },
  // Clearing 2 (centre)
  { x: 800, y: 620 }, { x: 870, y: 670 }, { x: 750, y: 700 }, { x: 840, y: 750 },
  // Near pond
  { x: 340, y: 280 }, { x: 400, y: 330 },
  // South path
  { x: 650, y: 980 }, { x: 900, y: 1050 },
];

// ─── Mob definitions ──────────────────────────────────────────────────────────
const MOB_DEFS: Array<{ x: number; y: number; speed: number }> = [
  { x: 480,  y: 430, speed: 52 },
  { x: 1000, y: 370, speed: 60 },
  { x: 690,  y: 760, speed: 48 },
  { x: 1100, y: 700, speed: 55 },
  { x: 380,  y: 820, speed: 50 },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type MaterialNode = {
  id: string;
  x: number; y: number;
  available: boolean;
  respawnAt: number;
  body: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

type Mob = {
  id: string;
  x: number; y: number;
  homeX: number; homeY: number;
  targetX: number; targetY: number;
  speed: number;
  body: Phaser.GameObjects.Ellipse;
  eyes: Phaser.GameObjects.Graphics;
};

type BosqueSceneData = {
  returnX?: number;
  returnY?: number;
};

// ─── Scene ────────────────────────────────────────────────────────────────────
export class BosqueMaterialesScene extends Phaser.Scene {
  private player!: AvatarRenderer;
  private controls!: SceneControls;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private shiftKey?: Phaser.Input.Keyboard.Key;

  private px = ENTRY_X;
  private py = ENTRY_Y;
  private lastDx = 0;
  private lastDy = 0;
  private lastMoving = false;
  private inTransition = false;
  private lastMobHitAt = 0;

  private treeColliders: Phaser.Geom.Rectangle[] = [];
  private materialNodes: MaterialNode[] = [];
  private mobs: Mob[] = [];

  private promptText?: Phaser.GameObjects.Text;
  private hudText?: Phaser.GameObjects.Text;
  private autoHud?: Phaser.GameObjects.Text;
  private collectedTotal = 0;
  private minigameActive = false;
  private activeMiningMinigame: MiningMinigame | null = null;
  private bridgeCleanupFns: Array<() => void> = [];

  constructor() {
    super({ key: 'BosqueMaterialesScene' });
  }

  init(data?: BosqueSceneData) {
    this.inTransition = false;
    this.px = data?.returnX ?? ENTRY_X;
    this.py = data?.returnY ?? ENTRY_Y;
  }

  create() {
    this.input.enabled = true;
    announceScene(this);
    this.controls = new SceneControls(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.drawBackground();
    this.drawPond();
    this.drawPaths();
    this.drawTrees();
    this.drawCave();
    this.drawLighting();
    this.drawEntryMarker();
    this.setupMaterialNodes();
    this.setupMobs();
    this.createPlayer();
    this.setupUi();
    this.setupInput();

    createBackButton(this, () => this.leaveToVecindad(), 'VECINDAD');
    this.bridgeCleanupFns.push(
      eventBus.on(EVENTS.SAFE_RESET_TO_PLAZA, () => {
        transitionToScene(this, 'WorldScene', {
          returnX: SAFE_PLAZA_RETURN.X,
          returnY: SAFE_PLAZA_RETURN.Y,
        });
      }),
    );

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.startFollow(this.player.getContainer(), true, 0.1, 0.1);
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    if (this.inTransition) return;
    this.handleMovement(delta);
    this.updateMobs(delta);
    this.updateMaterialNodes();
    this.updatePrompt();
    this.checkExitTrigger();
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.handleInteract();
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private drawBackground() {
    const g = this.add.graphics().setName('bg-layer').setDepth(0);

    // Deep forest base
    g.fillStyle(0x090e09, 1);
    g.fillRect(0, 0, W, H);

    // Ground — varied green patches
    g.fillStyle(0x101810, 1);
    g.fillRect(0, 0, W, H);

    // Subtle ground texture grid
    g.lineStyle(1, 0x131f11, 0.4);
    for (let x = 0; x < W; x += 40) g.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 40) g.lineBetween(0, y, W, y);

    // Grass variation patches
    const patches = [
      { x: 300, y: 500, w: 200, h: 140 },
      { x: 750, y: 580, w: 220, h: 160 },
      { x: 500, y: 900, w: 180, h: 120 },
      { x: 1050, y: 600, w: 200, h: 150 },
    ];
    patches.forEach((p) => {
      g.fillStyle(0x152012, 0.6);
      g.fillRoundedRect(p.x, p.y, p.w, p.h, 28);
    });

    // Boundary wall (dense trees/fog on edges)
    g.fillStyle(0x060c06, 0.85);
    g.fillRect(0, 0, 40, H);       // left wall
    g.fillRect(W - 40, 0, 40, H); // right wall
    g.fillRect(0, 0, W, 40);       // top wall
  }

  private drawPond() {
    const g = this.add.graphics().setName('pond-layer').setDepth(0.5);
    const cx = 260; const cy = 280;

    // Outer glow
    g.fillStyle(0x0a1e2e, 0.5);
    g.fillEllipse(cx, cy, 280, 200);

    // Pond body
    g.fillStyle(0x0d2235, 1);
    g.fillEllipse(cx, cy, 240, 168);
    g.lineStyle(2, 0x184a6a, 0.8);
    g.strokeEllipse(cx, cy, 240, 168);

    // Ripple rings
    for (let i = 1; i <= 3; i++) {
      g.lineStyle(1, 0x1d5e88, 0.3 - i * 0.08);
      g.strokeEllipse(cx, cy, 240 - i * 30, 168 - i * 22);
    }

    // Lily pads
    const lilies = [{ x: cx - 50, y: cy - 20 }, { x: cx + 40, y: cy + 18 }, { x: cx - 10, y: cy + 30 }];
    lilies.forEach((l) => {
      g.fillStyle(0x1e4a1e, 0.9);
      g.fillEllipse(l.x, l.y, 22, 16);
      g.lineStyle(1, 0x2a6e2a, 0.7);
      g.strokeEllipse(l.x, l.y, 22, 16);
    });

    this.add.text(cx, cy - 112, 'ESTANQUE', {
      fontSize: '6px', fontFamily: '"Press Start 2P", monospace',
      color: '#4a9abd', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(1).setAlpha(0.7);

    // Collision rect for pond
    this.treeColliders.push(new Phaser.Geom.Rectangle(cx - 120, cy - 84, 240, 168));
  }

  private drawPaths() {
    const g = this.add.graphics().setName('path-layer').setDepth(0.3);
    g.lineStyle(28, 0x1e1610, 1);

    // Main path: entry (bottom-centre) → centre clearing → pond fork → cave fork
    const mainPath = [
      { x: 800, y: 1150 }, { x: 790, y: 1000 }, { x: 760, y: 870 },
      { x: 720, y: 750 },  { x: 680, y: 620 },  { x: 600, y: 520 },
      { x: 490, y: 430 },  { x: 380, y: 340 },  { x: 320, y: 260 },
    ];
    for (let i = 1; i < mainPath.length; i++) {
      g.lineBetween(mainPath[i - 1].x, mainPath[i - 1].y, mainPath[i].x, mainPath[i].y);
    }

    // East fork → cave
    const cavePath = [
      { x: 600, y: 520 }, { x: 720, y: 440 }, { x: 900, y: 360 },
      { x: 1080, y: 280 }, { x: 1250, y: 220 }, { x: 1380, y: 180 },
    ];
    for (let i = 1; i < cavePath.length; i++) {
      g.lineBetween(cavePath[i - 1].x, cavePath[i - 1].y, cavePath[i].x, cavePath[i].y);
    }

    // Path edge highlight
    g.lineStyle(2, 0x2a2018, 0.5);
    for (let i = 1; i < mainPath.length; i++) {
      g.lineBetween(mainPath[i - 1].x - 16, mainPath[i - 1].y, mainPath[i].x - 16, mainPath[i].y);
    }
  }

  private drawTrees() {
    const g = this.add.graphics().setName('tree-layer').setDepth(1);

    TREES.forEach((tree) => {
      const { x, y, r } = tree;

      // Trunk
      g.fillStyle(0x3d2410, 1);
      g.fillRoundedRect(x - 7, y + r * 0.4, 14, r * 0.9, 3);
      g.lineStyle(1, 0x5a3718, 0.6);
      g.strokeRoundedRect(x - 7, y + r * 0.4, 14, r * 0.9, 3);

      // Root spread
      g.fillStyle(0x2d1b0c, 0.4);
      g.fillEllipse(x, y + r * 0.85, r * 1.2, r * 0.5);

      // Canopy — outer dark
      g.fillStyle(0x162c10, 1);
      g.fillCircle(x, y, r);

      // Canopy — mid green
      g.fillStyle(0x214d18, 0.8);
      g.fillCircle(x - 3, y - 3, r * 0.78);

      // Canopy — highlight top
      g.fillStyle(0x35721f, 0.5);
      g.fillCircle(x - 6, y - 7, r * 0.48);

      // Edge outline
      g.lineStyle(1, 0x1e4014, 0.6);
      g.strokeCircle(x, y, r);

      // Collision rect for trunk
      this.treeColliders.push(new Phaser.Geom.Rectangle(x - 10, y - 4, 20, r + 8));
    });
  }

  private drawCave() {
    const g = this.add.graphics().setName('cave-layer').setDepth(1.5);

    // Rocky wall behind cave
    g.fillStyle(0x1a1a22, 1);
    g.fillRoundedRect(1280, 30, 300, 200, 18);
    g.lineStyle(3, 0x2e2e3e, 0.9);
    g.strokeRoundedRect(1280, 30, 300, 200, 18);

    // Rock texture cracks
    g.lineStyle(1, 0x141420, 0.7);
    g.lineBetween(1310, 50, 1360, 120);
    g.lineBetween(1460, 60, 1500, 140);
    g.lineBetween(1340, 100, 1380, 170);

    // Cave mouth (dark void)
    g.fillStyle(0x04040a, 1);
    g.fillEllipse(1430, 110, 120, 90);
    g.lineStyle(2, 0x0e0e1a, 1);
    g.strokeEllipse(1430, 110, 120, 90);

    // Cave inner darkness gradient
    g.fillStyle(0x000008, 0.7);
    g.fillEllipse(1430, 108, 90, 68);

    // Boulder LEFT — massive
    g.fillStyle(0x2c2c36, 1);
    g.fillEllipse(1370, 180, 110, 88);
    g.fillStyle(0x383844, 0.8);
    g.fillEllipse(1358, 168, 70, 52);
    g.lineStyle(2, 0x484858, 0.7);
    g.strokeEllipse(1370, 180, 110, 88);
    // Cracks
    g.lineStyle(1, 0x1e1e28, 0.9);
    g.lineBetween(1360, 165, 1345, 195);
    g.lineBetween(1380, 170, 1395, 198);

    // Boulder RIGHT — massive
    g.fillStyle(0x282832, 1);
    g.fillEllipse(1490, 175, 120, 94);
    g.fillStyle(0x363642, 0.8);
    g.fillEllipse(1502, 162, 74, 56);
    g.lineStyle(2, 0x464656, 0.7);
    g.strokeEllipse(1490, 175, 120, 94);
    g.lineStyle(1, 0x1c1c26, 0.9);
    g.lineBetween(1480, 165, 1468, 192);
    g.lineBetween(1505, 168, 1518, 196);

    // Moss on boulders
    g.fillStyle(0x1e3a1a, 0.4);
    g.fillEllipse(1350, 158, 40, 18);
    g.fillEllipse(1510, 155, 38, 16);

    // "???" sign above cave
    this.add.text(1430, 40, '? ? ?', {
      fontSize: '10px', fontFamily: '"Press Start 2P", monospace',
      color: '#6a6a8a', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(2).setAlpha(0.8);

    this.add.text(1430, 210, 'ENTRADA BLOQUEADA', {
      fontSize: '5px', fontFamily: '"Press Start 2P", monospace',
      color: '#555568', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    // Collision: boulder left + right + wall
    this.treeColliders.push(new Phaser.Geom.Rectangle(1310, 136, 115, 90));
    this.treeColliders.push(new Phaser.Geom.Rectangle(1430, 128, 125, 96));
    this.treeColliders.push(new Phaser.Geom.Rectangle(1280, 30, 300, 110));
  }

  private drawLighting() {
    const g = this.add.graphics().setName('light-layer').setDepth(0.8);

    // Clearing 1 — warm dappled light
    g.fillStyle(0x90e060, 0.04);
    g.fillEllipse(390, 560, 320, 200);

    // Clearing 2 — centre
    g.fillStyle(0x88d858, 0.05);
    g.fillEllipse(820, 670, 360, 220);

    // Pond shimmer
    g.fillStyle(0x40a8e0, 0.06);
    g.fillEllipse(260, 280, 260, 180);

    // Cave glow (eerie purple)
    g.fillStyle(0x3a2060, 0.08);
    g.fillEllipse(1430, 200, 300, 200);

    // Entry light from south
    g.fillStyle(0x60e040, 0.05);
    g.fillRect(600, 1000, 400, 180);

    // Animated foliage shimmer (tween)
    const shimmer = this.add.graphics().setDepth(0.9);
    this.tweens.add({
      targets: shimmer,
      alpha: { from: 0, to: 1 },
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        shimmer.clear();
        shimmer.fillStyle(0x70d840, 0.025);
        shimmer.fillEllipse(820, 670, 340, 200);
      },
    });
  }

  private drawEntryMarker() {
    const g = this.add.graphics().setDepth(0.6);

    // South exit path marker
    g.fillStyle(0xf5c842, 0.12);
    g.fillRect(680, 1130, 240, 60);
    g.lineStyle(2, 0xf5c842, 0.4);
    g.strokeRect(680, 1130, 240, 60);

    this.add.text(800, 1155, '↓ VECINDAD', {
      fontSize: '7px', fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(1).setAlpha(0.8);
  }

  // ─── Material Nodes ───────────────────────────────────────────────────────

  private setupMaterialNodes() {
    MATERIAL_DEFS.forEach((def, i) => {
      const glow = this.add.rectangle(def.x, def.y, 22, 22, 0xf5c842, 0.18).setDepth(2);
      const body = this.add.rectangle(def.x, def.y, 14, 14, 0xf5c842, 0.9).setDepth(2.1);
      const label = this.add.text(def.x, def.y - 16, 'MAT', {
        fontSize: '5px', fontFamily: '"Press Start 2P", monospace',
        color: '#F5C842', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(2.2);

      this.tweens.add({
        targets: [glow, body],
        scaleX: { from: 0.85, to: 1.1 },
        scaleY: { from: 0.85, to: 1.1 },
        alpha: { from: 0.7, to: 1 },
        duration: 900 + i * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      this.materialNodes.push({
        id: `mat_${i}`,
        x: def.x, y: def.y,
        available: true,
        respawnAt: 0,
        body, glow, label,
      });
    });
  }

  // ─── Mobs ─────────────────────────────────────────────────────────────────

  private setupMobs() {
    MOB_DEFS.forEach((def, i) => {
      const body = this.add.ellipse(def.x, def.y, 32, 28, 0x5a3a1a, 1).setDepth(3);
      body.setStrokeStyle(2, 0x8a6030, 1);

      const eyes = this.add.graphics().setDepth(3.1);
      eyes.fillStyle(0xff2020, 1);
      eyes.fillCircle(def.x - 6, def.y - 4, 3);
      eyes.fillCircle(def.x + 6, def.y - 4, 3);

      this.mobs.push({
        id: `mob_${i}`,
        x: def.x, y: def.y,
        homeX: def.x, homeY: def.y,
        targetX: def.x, targetY: def.y,
        speed: def.speed,
        body, eyes,
      });
    });
  }

  // ─── Player ───────────────────────────────────────────────────────────────

  private createPlayer() {
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(50);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  private setupUi() {
    this.promptText = this.add.text(this.scale.width / 2, this.scale.height - 26, '', {
      fontSize: '8px', fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842', stroke: '#000000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    this.hudText = this.add.text(16, 76, `MATS: 0`, {
      fontSize: '8px', fontFamily: '"Press Start 2P", monospace',
      color: '#B9FF9E', stroke: '#000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(1000);

    this.add.text(this.scale.width / 2, 14, 'BOSQUE DE MATERIALES', {
      fontSize: '9px', fontFamily: '"Press Start 2P", monospace',
      color: '#6FC86A', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    // Auto-mode label: shown when mining skill >= 4
    const isAutoMode = getSkillSystem().getLevel('mining') >= 4;
    this.autoHud = this.add.text(this.scale.width - 12, 76, '⚙ AUTO', {
      fontSize: '7px', fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842', stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(1000).setVisible(isAutoMode);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  // ─── Movement ─────────────────────────────────────────────────────────────

  private handleMovement(delta: number) {
    if (this.minigameActive) return;
    const dt = delta / 1000;
    const sprint = this.shiftKey?.isDown ? SPRINT_MULT : 1;
    const sys = getSkillSystem();
    const speedPct = sys.getPassiveBuffTotal('speed') + sys.getSynergyBuff('speed');
    const speed = MOVE_SPEED * (1 + speedPct / 100) * sprint;

    let dx = 0; let dy = 0;
    if (this.keyA.isDown || this.cursors.left.isDown)  dx -= 1;
    if (this.keyD.isDown || this.cursors.right.isDown) dx += 1;
    if (this.keyW.isDown || this.cursors.up.isDown)    dy -= 1;
    if (this.keyS.isDown || this.cursors.down.isDown)  dy += 1;

    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

    const nx = Phaser.Math.Clamp(this.px + dx * speed * dt, 40, W - 40);
    const ny = Phaser.Math.Clamp(this.py + dy * speed * dt, 40, H - 40);

    if (!this.collidesAt(nx, this.py)) this.px = nx;
    if (!this.collidesAt(this.px, ny)) this.py = ny;

    const isMoving = dx !== 0 || dy !== 0;
    this.player.update(isMoving, dx, dy);
    this.player.setPosition(this.px, this.py);
    this.lastDx = dx; this.lastDy = dy; this.lastMoving = isMoving;
  }

  private collidesAt(x: number, y: number): boolean {
    const r = 14;
    const pr = new Phaser.Geom.Rectangle(x - r, y - r, r * 2, r * 2);
    return this.treeColliders.some((c) => Phaser.Geom.Rectangle.Overlaps(pr, c));
  }

  // ─── Mob Updates ──────────────────────────────────────────────────────────

  private updateMobs(delta: number) {
    const dt = Math.max(0.001, delta / 1000);
    const now = this.time.now;

    for (const mob of this.mobs) {
      const dist = Phaser.Math.Distance.Between(mob.x, mob.y, this.px, this.py);

      // Aggro
      if (dist <= MOB_AGGRO_RANGE) {
        mob.targetX = this.px; mob.targetY = this.py;
      } else if (Phaser.Math.Distance.Between(mob.x, mob.y, mob.targetX, mob.targetY) < 16) {
        mob.targetX = Phaser.Math.Clamp(mob.homeX + Phaser.Math.Between(-130, 130), 60, W - 60);
        mob.targetY = Phaser.Math.Clamp(mob.homeY + Phaser.Math.Between(-100, 100), 60, H - 60);
      }

      const angle = Phaser.Math.Angle.Between(mob.x, mob.y, mob.targetX, mob.targetY);
      mob.x = Phaser.Math.Clamp(mob.x + Math.cos(angle) * mob.speed * dt, 60, W - 60);
      mob.y = Phaser.Math.Clamp(mob.y + Math.sin(angle) * mob.speed * dt, 60, H - 60);

      mob.body.setPosition(mob.x, mob.y);
      mob.eyes.clear();
      mob.eyes.fillStyle(0xff2020, 1);
      mob.eyes.fillCircle(mob.x - 6, mob.y - 4, 3);
      mob.eyes.fillCircle(mob.x + 6, mob.y - 4, 3);

      // Damage
      if (dist < 28 && now - this.lastMobHitAt > MOB_DAMAGE_COOLDOWN_MS) {
        this.lastMobHitAt = now;
        this.cameras.main.shake(180, 0.007);
        eventBus.emit(EVENTS.UI_NOTICE, { message: '-10 HP', color: '#FF4444' });
      }
    }
  }

  // ─── Material Nodes ───────────────────────────────────────────────────────

  private updateMaterialNodes() {
    const now = this.time.now;
    for (const node of this.materialNodes) {
      if (!node.available && now >= node.respawnAt) {
        node.available = true;
        node.body.setVisible(true);
        node.glow.setVisible(true);
        node.label.setVisible(true);
      }
    }
  }

  private handleInteract() {
    if (this.minigameActive) return;

    // Cave check
    if (Phaser.Math.Distance.Between(this.px, this.py, 1430, 175) < CAVE_INTERACT_RANGE) {
      this.showPrompt('LAS PIEDRAS NO SE MUEVEN...');
      return;
    }

    // Nearest material node
    let nearest: MaterialNode | null = null;
    let nearestDist = MATERIAL_COLLECT_RANGE;
    for (const node of this.materialNodes) {
      if (!node.available) continue;
      const d = Phaser.Math.Distance.Between(this.px, this.py, node.x, node.y);
      if (d < nearestDist) { nearest = node; nearestDist = d; }
    }
    if (!nearest) return;

    nearest.available = false;
    nearest.respawnAt = this.time.now + MATERIAL_RESPAWN_MS;
    nearest.body.setVisible(false);
    nearest.glow.setVisible(false);
    nearest.label.setVisible(false);
    this.collectedTotal++;
    this.hudText?.setText(`MATS: ${this.collectedTotal}`);

    this.minigameActive = true;

    void (async () => {
      try {
        const sys = getSkillSystem();
        const miningLevel = sys.getLevel('mining');
        const isAutoMode = miningLevel >= 4;

        // Show auto HUD if applicable
        this.autoHud?.setVisible(isAutoMode);

        let minigameBonus = 0;
        let isAuto = isAutoMode;

        if (!isAutoMode) {
          const minigame = new MiningMinigame(this);
          this.activeMiningMinigame = minigame;
          const result = await minigame.play(false);
          minigame.destroy();
          this.activeMiningMinigame = null;
          isAuto = result === 'miss';
          minigameBonus = result === 'perfect' ? 5 : result === 'good' ? 3 : 0;
        }

        // Roll quality server-side
        const qr = await sys.rollQuality('mining', 'node_collect', isAuto);

        // Track for contracts
        void getContractSystem().trackAction('node_collect', 'mining', qr.quality);

        // Quality feedback
        this.showPrompt(`+1 MATERIAL [${qr.label}]`);
        if (this.hudText) {
          this.hudText.setText(`MATS: ${this.collectedTotal}`).setColor(qr.color);
          this.time.delayedCall(1600, () => this.hudText?.setColor('#B9FF9E'));
        }

        // XP: base + quality bonus + minigame bonus × event multiplier
        const eventMult = getEventSystem().getXpMultiplier('mining');
        const xpTotal = Math.round((10 + qr.xp_bonus + minigameBonus) * eventMult);
        const xpResult = await sys.addXp('mining', xpTotal, 'node_collect');
        if (xpResult.leveled_up) {
          eventBus.emit(EVENTS.UI_NOTICE, { message: `⛏️ MINERÍA LVL ${xpResult.new_level}!`, color: '#F5C842' });
          this.autoHud?.setVisible(sys.getLevel('mining') >= 4);
        }
        // Earn mastery MP if at Lv5
        if (sys.getLevel('mining') >= 5) {
          void getMasterySystem().earnMp('mining');
        }

        // Legendary flash
        if (qr.quality === 'legendary') {
          this.cameras.main.flash(400, 245, 200, 66, false);
          eventBus.emit(EVENTS.UI_NOTICE, { message: '✨ MATERIAL LEGENDARIO!', color: '#F5C842' });
        }
      } finally {
        // Always reset the flag so future interactions aren't blocked
        this.minigameActive = false;
        this.activeMiningMinigame = null;
      }
    })();
  }

  // ─── Prompt & HUD ─────────────────────────────────────────────────────────

  private updatePrompt() {
    let hint = '';
    const dist2cave = Phaser.Math.Distance.Between(this.px, this.py, 1430, 175);
    if (dist2cave < CAVE_INTERACT_RANGE) {
      hint = '[E] EXAMINAR CUEVA';
    } else {
      for (const node of this.materialNodes) {
        if (!node.available) continue;
        const d = Phaser.Math.Distance.Between(this.px, this.py, node.x, node.y);
        if (d < MATERIAL_COLLECT_RANGE) { hint = '[E] RECOLECTAR MATERIAL'; break; }
      }
    }
    if (this.py > 1100) hint = hint || '↓ SALIR AL VECINDAD';
    this.promptText?.setText(hint);
  }

  private showPrompt(msg: string) {
    this.promptText?.setText(msg);
    this.time.delayedCall(1800, () => this.promptText?.setText(''));
  }

  // ─── Exit ─────────────────────────────────────────────────────────────────

  private checkExitTrigger() {
    if (this.py > H - 50) this.leaveToVecindad();
  }

  private leaveToVecindad() {
    if (this.inTransition) return;
    this.inTransition = true;
    transitionToScene(this, 'VecindadScene', {
      returnX: RETURN_VECINDAD_X,
      returnY: RETURN_VECINDAD_Y,
    });
  }

  // ─── Shutdown ─────────────────────────────────────────────────────────────

  private onShutdown() {
    // Destroy any active minigame so its SPACE key listener doesn't leak
    if (this.activeMiningMinigame) {
      this.activeMiningMinigame.destroy();
      this.activeMiningMinigame = null;
    }
    this.minigameActive = false;
    this.bridgeCleanupFns.forEach((fn) => fn());
    this.bridgeCleanupFns = [];
    this.controls.destroy();
    this.mobs.forEach((m) => { m.eyes.destroy(); });
  }
}
