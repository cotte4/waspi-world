import Phaser from 'phaser';
import { AvatarRenderer, AvatarConfig, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { ChatSystem } from '../systems/ChatSystem';
import { WORLD, PLAYER, COLORS, ZONES, BUILDINGS, CHAT } from '../config/constants';
import { eventBus, EVENTS } from '../config/eventBus';
import { supabase, isConfigured } from '../../lib/supabase';
import { initTenks } from '../systems/TenksSystem';
import { getEquippedColors, hasUtilityEquipped } from '../systems/InventorySystem';
import { announceScene } from '../systems/SceneUi';

interface RemotePlayer {
  avatar: AvatarRenderer;
  nameplate: Phaser.GameObjects.Text;
  username: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  isMoving: boolean;
  moveDx: number;
  avatarConfig: AvatarConfig;
  hitbox: HitboxArc;
}

type HitboxArc = Phaser.GameObjects.Arc & { body: Phaser.Physics.Arcade.Body };
type ArcadeObject = Phaser.GameObjects.GameObject & { destroy: () => void };
type PositionedArcadeObject = Phaser.GameObjects.GameObject & { x: number; y: number };
type EquippedPayload = { top?: string; bottom?: string };
type RemoteMoveEvent = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  dir: number;
  moving: boolean;
};
type RemoteChatEvent = {
  player_id: string;
  username: string;
  message: string;
  x: number;
  y: number;
};
type RemoteStateEvent = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  avatar?: AvatarConfig;
  equipped?: EquippedPayload;
};
type RemoteHitEvent = {
  target_id: string;
  source_id: string;
  dmg: number;
};

const REMOTE_CHAT_MIN_MS = 1000;
const REMOTE_MOVE_MIN_MS = 50;
const REMOTE_HIT_MIN_MS = 120;
const MAX_REMOTE_CHAT_DISTANCE = 420;

export class WorldScene extends Phaser.Scene {
  // Player
  private px: number = PLAYER.SPAWN_X;
  private py: number = PLAYER.SPAWN_Y;
  private playerId = '';
  private playerUsername = '';
  private playerAvatar!: AvatarRenderer;
  private playerNameplate!: Phaser.GameObjects.Text;
  private playerBody!: Phaser.GameObjects.Rectangle; // invisible — camera target

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private inputBlocked = false; // true when chat input is focused

  // Mobile touch controls
  private isTouch = false;
  private touchMoveActive = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchDx = 0; // -1..1
  private touchDy = 0; // -1..1
  private joyBase?: Phaser.GameObjects.Arc;
  private joyKnob?: Phaser.GameObjects.Arc;
  private btnA?: Phaser.GameObjects.Rectangle;
  private btnAText?: Phaser.GameObjects.Text;

  // Chat
  private chatSystem!: ChatSystem;
  private lastChatSent = 0;

  // Interaction
  private keySpace!: Phaser.Input.Keyboard.Key;
  private inTransition = false;

  // Multiplayer
  private remotePlayers = new Map<string, RemotePlayer>();
  private lastPosSent = 0;
  private channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
  private bridgeCleanupFns: Array<() => void> = [];
  private lastMoveDx = 0;
  private lastIsMoving = false;

  // Combat / HP
  private hp = 100;
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private gunEnabled = false;
  private keyF!: Phaser.Input.Keyboard.Key;
  private bullets!: Phaser.Physics.Arcade.Group;
  private playerHitbox!: HitboxArc;

  // Training zone (PVE + PVP)
  private inTraining = false;
  private trainingBanner?: Phaser.GameObjects.Text;
  private pvpEnabled = true;
  private pveEnabled = true;
  private dummies!: Phaser.Physics.Arcade.Group;
  private mutedPlayerIds = new Set<string>();
  private remoteMoveTimes = new Map<string, number>();
  private remoteChatTimes = new Map<string, number>();
  private remoteHitTimes = new Map<string, number>();

  // Football cosmetic
  private ballEnabled = false;
  private football?: Phaser.GameObjects.Arc;
  private footballTick = 0;

  constructor() {
    super({ key: 'WorldScene' });
  }

  init() {
    this.inTransition = false;
  }

  create() {
    announceScene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);

    // Generate player ID and username
    this.playerId = this.getOrCreatePlayerId();
    this.playerUsername = this.getOrCreateUsername();
    this.loadMutedPlayers();

    // Init TENKS balance (local-only for ahora)
    initTenks(5000);

    // Draw world layers
    this.drawBackground();
    this.drawPlaza();
    this.drawBuildings();
    this.drawStreet();
    this.drawLampPosts();
    this.drawVignette();

    // Multiplayer status indicator (tiny debug text)
    const statusText = this.add.text(8, 8, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#5555AA',
    }).setScrollFactor(0).setDepth(9999);

    // Invisible camera target
    this.playerBody = this.add.rectangle(this.px, this.py, 2, 2, 0x000000, 0).setDepth(0);
    // Physics hitbox for PVP/PVE detection
    this.playerHitbox = this.createHitbox(this.px, this.py);

    // Player avatar
    this.playerAvatar = new AvatarRenderer(this, this.px, this.py, this.getCurrentAvatarConfig());
    this.playerAvatar.setDepth(50);

    // Player nameplate
    this.playerNameplate = this.add.text(this.px, this.py - 46, this.playerUsername, {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(120);

    // Draw house name
    this.drawHouse();

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyF = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);

    // Touch controls (mobile)
    this.setupTouchControls();

    // Camera
    this.cameras.main.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    this.cameras.main.startFollow(this.playerBody, true, 0.1, 0.1);
    this.cameras.main.setZoom(1);

    // Chat system
    this.chatSystem = new ChatSystem(this);

    // Bridge events from React
    this.setupReactBridge();

    // Supabase Realtime
    const mode = this.setupRealtime();
    statusText.setText(mode === 'multiplayer' ? 'MULTI: ONLINE' : 'MULTI: SOLO MODE');

    // Notify React that player is ready
    eventBus.emit(EVENTS.PLAYER_INFO, {
      playerId: this.playerId,
      username: this.playerUsername,
    });

    // Ambient NPC
    this.spawnAmbientNPCs();

    // HP/Combat/Utilities
    this.setupHpHud();
    this.setupCombat();
    this.refreshUtilitiesFromInventory();

    // Training arena
    this.setupTrainingZone();
  }

  private setupTrainingZone() {
    // Dummies group already created in setupCombat

    // Visual arena (in plaza)
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(0x000000, 0.10);
    g.fillRoundedRect(ZONES.TRAINING_X, ZONES.TRAINING_Y, ZONES.TRAINING_W, ZONES.TRAINING_H, 12);
    g.lineStyle(2, 0x39FF14, 0.35);
    g.strokeRoundedRect(ZONES.TRAINING_X, ZONES.TRAINING_Y, ZONES.TRAINING_W, ZONES.TRAINING_H, 12);
    this.add.text(
      ZONES.TRAINING_X + ZONES.TRAINING_W / 2,
      ZONES.TRAINING_Y - 14,
      'TRAINING',
      { fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: '#39FF14' }
    ).setOrigin(0.5).setDepth(3);

    this.trainingBanner = this.add.text(400, 560, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#39FF14',
      stroke: '#000000',
      strokeThickness: 4,
    }).setScrollFactor(0).setDepth(10001).setOrigin(0.5);

    // Spawn a few local dummies (PVE)
    const dummyPositions = [
      { x: ZONES.TRAINING_X + 150, y: ZONES.TRAINING_Y + 150 },
      { x: ZONES.TRAINING_X + 360, y: ZONES.TRAINING_Y + 220 },
      { x: ZONES.TRAINING_X + 560, y: ZONES.TRAINING_Y + 140 },
    ];
    dummyPositions.forEach((p) => {
      const d = this.add.circle(p.x, p.y, 16, 0xFF4444, 0.35);
      d.setDepth(30);
      this.physics.add.existing(d);
      const body = d.body as Phaser.Physics.Arcade.Body;
      body.setCircle(16);
      body.setImmovable(true);
      this.dummies.add(d);
    });
  }

  private setupHpHud() {
    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(9999);
    this.hpText = this.add.text(8, 28, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6666',
    }).setScrollFactor(0).setDepth(9999);
    this.renderHpHud();
  }

  private renderHpHud() {
    const w = 120;
    const h = 8;
    const x = 8;
    const y = 44;
    const pct = Phaser.Math.Clamp(this.hp / 100, 0, 1);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.55);
    this.hpBar.fillRoundedRect(x, y, w, h, 2);
    this.hpBar.fillStyle(0xFF4444, 0.85);
    this.hpBar.fillRoundedRect(x + 1, y + 1, Math.max(0, (w - 2) * pct), h - 2, 2);
    this.hpBar.lineStyle(1, 0xFFFFFF, 0.12);
    this.hpBar.strokeRoundedRect(x, y, w, h, 2);
    this.hpText.setText(`HP ${this.hp}`);
  }

  private setupCombat() {
    this.dummies = this.physics.add.group({ allowGravity: false, immovable: true });
    this.bullets = this.physics.add.group({
      allowGravity: false,
      collideWorldBounds: true,
      maxSize: 32,
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.gunEnabled) return;
      if (this.inputBlocked) return;
      this.shootAt(p.worldX, p.worldY);
    });

    // PVE: bullets vs dummies (training only)
    this.physics.add.overlap(this.bullets, this.dummies, (bObj, dObj) => {
      if (!this.inTraining || !this.pveEnabled) return;
      this.destroyArcadeObject(bObj);
      const dummy = dObj as PositionedArcadeObject;
      const flash = this.add.circle(dummy.x, dummy.y, 18, 0xFF4444, 0.22);
      flash.setDepth(5000);
      this.tweens.add({ targets: flash, alpha: 0, scale: 1.6, duration: 180, onComplete: () => flash.destroy() });
    });
  }

  private shootAt(wx: number, wy: number) {
    const ang = Phaser.Math.Angle.Between(this.px, this.py, wx, wy);
    const speed = 620;

    // Muzzle flash
    const flash = this.add.circle(this.px + Math.cos(ang) * 14, this.py + Math.sin(ang) * 14, 7, 0xF5C842, 0.95);
    flash.setDepth(2100);
    this.tweens.add({
      targets: flash,
      alpha: { from: 0.95, to: 0 },
      scale: { from: 1, to: 1.8 },
      duration: 120,
      onComplete: () => flash.destroy(),
    });

    // Subtle recoil on hands/weapon
    const recoilX = Math.cos(ang) * -2;
    const recoilY = Math.sin(ang) * -2;
    const container = this.playerAvatar.getContainer();
    this.tweens.add({
      targets: container,
      x: container.x + recoilX,
      y: container.y + recoilY,
      yoyo: true,
      duration: 80,
      ease: 'Sine.easeOut',
    });

    // Bullet
    const b = this.add.rectangle(this.px, this.py, 10, 3, 0xF5C842, 1);
    this.physics.add.existing(b);
    const body = b.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(10, 3);
    body.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
    b.setRotation(ang);
    b.setDepth(2000);
    this.bullets.add(b);
    this.time.delayedCall(900, () => this.destroyArcadeObject(b));
  }

  private refreshUtilitiesFromInventory() {
    this.gunEnabled = hasUtilityEquipped('UTIL-GUN-01');
    this.ballEnabled = hasUtilityEquipped('UTIL-BALL-01');

    if (this.ballEnabled && !this.football) {
      this.football = this.add.arc(this.px + 18, this.py - 6, 7, 0, 360, false, 0xFFFFFF);
      this.football.setStrokeStyle(2, 0x111111, 0.6);
      this.football.setDepth(160);
    }
    if (!this.ballEnabled && this.football) {
      this.football.destroy();
      this.football = undefined;
    }
  }

  // ─── World Drawing ───────────────────────────────────────────────────────────

  private drawBackground() {
    const g = this.add.graphics().setDepth(-10);
    g.fillStyle(COLORS.BG);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    // Stars (random dots in sky area)
    g.fillStyle(0xFFFFFF, 0.6);
    const seed = 42;
    for (let i = 0; i < 200; i++) {
      const sx = ((seed * (i * 137 + 1)) % WORLD.WIDTH);
      const sy = ((seed * (i * 97 + 3)) % 600);
      g.fillCircle(sx, sy, Math.random() < 0.2 ? 1.5 : 1);
    }
  }

  private drawStreet() {
    const g = this.add.graphics().setDepth(1);

    // North sidewalk base
    g.fillStyle(COLORS.SIDEWALK);
    g.fillRect(0, ZONES.NORTH_SIDEWALK_Y, WORLD.WIDTH, ZONES.NORTH_SIDEWALK_H);

    // Street base
    g.fillStyle(COLORS.STREET);
    g.fillRect(0, ZONES.STREET_Y, WORLD.WIDTH, ZONES.STREET_H);

    // Faux tile / pattern para que el asfalto no sea un plano liso
    g.lineStyle(1, 0x191922, 0.45);
    const tileSize = 32;
    for (let x = 0; x < WORLD.WIDTH; x += tileSize) {
      g.lineBetween(x, ZONES.STREET_Y, x, ZONES.STREET_Y + ZONES.STREET_H);
    }
    for (let y = ZONES.STREET_Y; y <= ZONES.STREET_Y + ZONES.STREET_H; y += tileSize) {
      g.lineBetween(0, y, WORLD.WIDTH, y);
    }

    // Center dashes
    const dashY = ZONES.STREET_Y + ZONES.STREET_H / 2;
    g.fillStyle(0xFFFFFF, 0.12);
    for (let dx = 0; dx < WORLD.WIDTH; dx += 90) {
      g.fillRect(dx, dashY - 2, 42, 3);
    }

    // South sidewalk base
    g.fillStyle(COLORS.SIDEWALK);
    g.fillRect(0, ZONES.SOUTH_SIDEWALK_Y, WORLD.WIDTH, ZONES.SOUTH_SIDEWALK_H);

    // Textura sutil en veredas
    g.lineStyle(1, 0x20202C, 0.35);
    for (let x = 0; x < WORLD.WIDTH; x += tileSize * 2) {
      g.lineBetween(x, ZONES.NORTH_SIDEWALK_Y, x, ZONES.NORTH_SIDEWALK_Y + ZONES.NORTH_SIDEWALK_H);
      g.lineBetween(x, ZONES.SOUTH_SIDEWALK_Y, x, ZONES.SOUTH_SIDEWALK_Y + ZONES.SOUTH_SIDEWALK_H);
    }

    // Curb lines
    g.lineStyle(2, 0x262636, 0.9);
    g.strokeRect(0, ZONES.NORTH_SIDEWALK_Y, WORLD.WIDTH, ZONES.NORTH_SIDEWALK_H);
    g.strokeRect(0, ZONES.SOUTH_SIDEWALK_Y, WORLD.WIDTH, ZONES.SOUTH_SIDEWALK_H);
  }

  private drawPlaza() {
    const g = this.add.graphics().setDepth(0);

    // Grass area
    g.fillStyle(COLORS.GRASS);
    g.fillRect(0, ZONES.PLAZA_Y, WORLD.WIDTH, WORLD.HEIGHT - ZONES.PLAZA_Y);

    // Plaza stone area
    g.fillStyle(0x101018);
    const px = 1100;
    const py = ZONES.PLAZA_Y + 50;
    const pw = 1000;
    const ph = 600;
    g.fillRect(px, py, pw, ph);

    // Sutil patrón cuadriculado en la plaza
    g.lineStyle(1, 0x1A1A24, 0.45);
    const tile = 32;
    for (let x = px; x < px + pw; x += tile) {
      g.lineBetween(x, py, x, py + ph);
    }
    for (let y = py; y <= py + ph; y += tile) {
      g.lineBetween(px, y, px + pw, y);
    }

    // Fountain
    const fx = 1600, fy = ZONES.PLAZA_Y + 300;
    g.fillStyle(COLORS.FOUNTAIN);
    g.fillCircle(fx, fy, 80);
    g.fillStyle(0x0A1520);
    g.fillCircle(fx, fy, 60);
    g.fillStyle(0x2255AA, 0.7);
    g.fillCircle(fx, fy, 45);
    g.fillStyle(0x88CCFF, 0.5);
    g.fillCircle(fx, fy, 15); // water center

    // Fountain border
    g.lineStyle(3, 0x334455, 0.9);
    g.strokeCircle(fx, fy, 80);

    // Bench near fountain
    this.drawBench(g, 1450, fy + 110);
    this.drawBench(g, 1750, fy + 110);
    this.drawBench(g, fx - 120, fy - 20);
    this.drawBench(g, fx + 120, fy - 20);

    // Plaza text
    this.add.text(fx, ZONES.PLAZA_Y + 20, 'PLAZA', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#334455',
    }).setOrigin(0.5).setDepth(2);
  }

  private drawVignette() {
    // Keep a subtle edge vignette so the world stays readable on all displays.
    const { width, height } = this.cameras.main;
    const vignette = this.add.graphics().setDepth(9999);
    const centerX = width / 2;
    const centerY = height / 2;

    const radius = Math.max(width, height) * 1.08;
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const alpha = Phaser.Math.Linear(0.0, 0.18, t);
      vignette.fillStyle(0x000000, alpha);
      vignette.fillCircle(centerX, centerY, radius * (0.55 + t * 0.45));
    }

    vignette.setScrollFactor(0);
  }

  private drawBench(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x3A2A1A);
    g.fillRect(x - 25, y, 50, 8);
    g.fillRect(x - 22, y + 8, 8, 10);
    g.fillRect(x + 14, y + 8, 8, 10);
  }

  private drawBuildings() {
    // ARCADE
    this.drawArcadeBuilding();
    // WASPI STORE
    this.drawStoreBuilding();
    // CAFÉ
    this.drawCafeBuilding();
  }

  private drawArcadeBuilding() {
    const { x, y, w, h } = BUILDINGS.ARCADE;
    const g = this.add.graphics().setDepth(2);

    // Main facade
    g.fillStyle(COLORS.BUILDING_ARCADE);
    g.fillRect(x, y, w, h);

    // Roof overhang
    g.fillStyle(COLORS.ROOF_DARK);
    g.fillRect(x - 8, y, w + 16, 30);

    // Windows (glowing blue)
    const winPositions = [[x+40,y+80],[x+120,y+80],[x+200,y+80],[x+280,y+80],[x+40,y+180],[x+120,y+180],[x+200,y+180],[x+280,y+180]];
    winPositions.forEach(([wx, wy]) => {
      g.fillStyle(COLORS.WINDOW_COOL, 0.15);
      g.fillRect(wx, wy, 55, 65);
      g.lineStyle(1.5, COLORS.NEON_BLUE, 0.7);
      g.strokeRect(wx, wy, 55, 65);
    });

    // Entrance
    g.fillStyle(0x050510);
    g.fillRect(x + w/2 - 35, y + h - 80, 70, 80);
    g.lineStyle(2, COLORS.NEON_BLUE, 0.9);
    g.strokeRect(x + w/2 - 35, y + h - 80, 70, 80);

    // ARCADE neon sign
    const signText = this.add.text(x + w/2, y + 40, 'ARCADE', {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF006E',
      stroke: '#FF006E',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3);

    // Glow flicker tween
    this.tweens.add({
      targets: signText,
      alpha: { from: 1, to: 0.7 },
      duration: 800 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Screen glow on facade
    g.fillStyle(COLORS.NEON_PINK, 0.05);
    g.fillRect(x, y, w, h);

    // Column separators
    g.lineStyle(1, 0x1A1A30, 0.9);
    for (let cx = x + 100; cx < x + w; cx += 100) {
      g.lineBetween(cx, y, cx, y + h);
    }
  }

  private drawStoreBuilding() {
    const { x, y, w, h } = BUILDINGS.STORE;
    const g = this.add.graphics().setDepth(2);

    // Main facade (slightly lighter)
    g.fillStyle(COLORS.BUILDING_STORE);
    g.fillRect(x, y, w, h);

    // Gold accent stripe
    g.fillStyle(COLORS.GOLD, 0.15);
    g.fillRect(x, y, w, 8);
    g.fillRect(x, y + h - 100, w, 6);

    // Roof
    g.fillStyle(COLORS.ROOF_DARK);
    g.fillRect(x - 10, y, w + 20, 35);

    // Large display windows
    g.fillStyle(COLORS.WINDOW_COOL, 0.08);
    g.fillRect(x + 40, y + 100, 180, 220);
    g.fillRect(x + w - 220, y + 100, 180, 220);
    g.lineStyle(2, COLORS.GOLD, 0.5);
    g.strokeRect(x + 40, y + 100, 180, 220);
    g.strokeRect(x + w - 220, y + 100, 180, 220);

    // Mannequin shapes inside windows (simple outlines)
    g.lineStyle(1, COLORS.GOLD, 0.4);
    // Left window mannequin
    g.strokeCircle(x + 130, y + 140, 15);
    g.strokeRect(x + 118, y + 155, 24, 40);
    // Right window mannequin
    g.strokeCircle(x + w - 130, y + 140, 15);
    g.strokeRect(x + w - 142, y + 155, 24, 40);

    // Main entrance (double door)
    g.fillStyle(0x050510);
    g.fillRect(x + w/2 - 50, y + h - 90, 100, 90);
    g.lineStyle(2, COLORS.GOLD, 0.9);
    g.strokeRect(x + w/2 - 50, y + h - 90, 100, 90);
    // Door handle
    g.fillStyle(COLORS.GOLD);
    g.fillCircle(x + w/2 - 10, y + h - 45, 3);
    g.fillCircle(x + w/2 + 10, y + h - 45, 3);

    // WASPI neon sign
    const waspi = this.add.text(x + w/2, y + 55, 'WASPI', {
      fontSize: '28px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#F5C842',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3);

    this.add.text(x + w/2, y + 85, 'S T O R E', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5).setDepth(3);

    // Gold glow pulse
    this.tweens.add({
      targets: waspi,
      alpha: { from: 1, to: 0.85 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Gold ambient glow
    g.fillStyle(COLORS.GOLD, 0.03);
    g.fillRect(x, y, w, h);
  }

  private drawCafeBuilding() {
    const { x, y, w, h } = BUILDINGS.CAFE;
    const g = this.add.graphics().setDepth(2);

    // Facade (warm)
    g.fillStyle(COLORS.BUILDING_CAFE);
    g.fillRect(x, y, w, h);

    // Roof
    g.fillStyle(COLORS.ROOF_DARK);
    g.fillRect(x - 8, y, w + 16, 32);

    // Warm windows
    const cWins = [[x+50,y+90],[x+160,y+90],[x+270,y+90],[x+100,y+220],[x+220,y+220]];
    cWins.forEach(([wx, wy]) => {
      g.fillStyle(COLORS.WINDOW_WARM, 0.18);
      g.fillRect(wx, wy, 60, 70);
      g.lineStyle(1.5, COLORS.NEON_ORANGE, 0.6);
      g.strokeRect(wx, wy, 60, 70);
    });

    // Entrance
    g.fillStyle(0x080400);
    g.fillRect(x + w/2 - 30, y + h - 75, 60, 75);
    g.lineStyle(2, COLORS.NEON_ORANGE, 0.9);
    g.strokeRect(x + w/2 - 30, y + h - 75, 60, 75);

    // CAFÉ sign
    const cafeSign = this.add.text(x + w/2, y + 48, 'CAFÉ', {
      fontSize: '20px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6B00',
      stroke: '#FF6B00',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3);

    this.tweens.add({
      targets: cafeSign,
      alpha: { from: 1, to: 0.75 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Warm ambient
    g.fillStyle(COLORS.NEON_ORANGE, 0.03);
    g.fillRect(x, y, w, h);
  }

  private drawHouse() {
    const { x, y, w, h } = BUILDINGS.HOUSE;
    const g = this.add.graphics().setDepth(2);

    g.fillStyle(COLORS.BUILDING_HOUSE);
    g.fillRect(x, y, w, h);

    // Roof
    g.fillStyle(COLORS.ROOF_DARK);
    g.fillRect(x - 5, y, w + 10, 20);

    // Windows
    [[x + 60, y + 30], [x + w - 110, y + 30]].forEach(([wx, wy]) => {
      g.fillStyle(COLORS.WINDOW_WARM, 0.2);
      g.fillRect(wx, wy, 50, 55);
      g.lineStyle(1.5, 0x886633, 0.7);
      g.strokeRect(wx, wy, 50, 55);
    });

    // Door
    g.fillStyle(0x050508);
    g.fillRect(x + w/2 - 20, y + h - 60, 40, 60);
    g.lineStyle(2, 0x443322, 0.8);
    g.strokeRect(x + w/2 - 20, y + h - 60, 40, 60);
    g.fillStyle(0x886633);
    g.fillCircle(x + w/2 + 8, y + h - 30, 3);

    // Label
    this.add.text(x + w/2, y + 10, 'TU CASA', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#334455',
    }).setOrigin(0.5).setDepth(3);
  }

  private drawLampPosts() {
    const g = this.add.graphics().setDepth(3);
    const postY = ZONES.NORTH_SIDEWALK_Y + 5;
    const postH = 120;

    for (let lx = 200; lx < WORLD.WIDTH; lx += 320) {
      // Post
      g.lineStyle(3, 0x333344);
      g.lineBetween(lx, postY, lx, postY - postH);

      // Top bar
      g.lineBetween(lx, postY - postH, lx + 20, postY - postH - 15);

      // Lamp housing
      g.fillStyle(0x2A2A3A);
      g.fillRect(lx + 10, postY - postH - 22, 22, 12);

      // Glow circle
      g.fillStyle(0xFFEEAA, 0.15);
      g.fillCircle(lx + 21, postY - postH - 16, 35);

      g.fillStyle(0xFFEEAA, 0.25);
      g.fillCircle(lx + 21, postY - postH - 16, 20);

      // Light bulb
      g.fillStyle(0xFFFFAA);
      g.fillCircle(lx + 21, postY - postH - 16, 5);

      // South sidewalk lamps too
      const southY = ZONES.SOUTH_SIDEWALK_Y + 55;
      g.lineStyle(3, 0x333344);
      g.lineBetween(lx + 160, southY, lx + 160, southY - 100);
      g.lineBetween(lx + 160, southY - 100, lx + 180, southY - 115);
      g.fillStyle(0x2A2A3A);
      g.fillRect(lx + 170, southY - 122, 18, 10);
      g.fillStyle(0xFFEEAA, 0.12);
      g.fillCircle(lx + 179, southY - 117, 28);
      g.fillStyle(0xFFFFAA);
      g.fillCircle(lx + 179, southY - 117, 4);
    }
  }

  private spawnAmbientNPCs() {
    // Non-interactive decorative NPCs that wander
    const npcConfigs: AvatarConfig[] = [
      { bodyColor: 0xD4A574, hairColor: 0x1A0A00, topColor: 0x553322, bottomColor: 0x221122 },
      { bodyColor: 0xE8C49A, hairColor: 0x000000, topColor: 0x222255, bottomColor: 0x111133 },
      { bodyColor: 0xC17A4A, hairColor: 0x220000, topColor: 0x334422, bottomColor: 0x1A2211 },
    ];

    const npcPositions = [
      { x: 600, y: 750 }, { x: 2000, y: 720 }, { x: 1000, y: 780 },
    ];

    npcPositions.forEach((pos, i) => {
      const cfg = npcConfigs[i % npcConfigs.length];
      const npc = new AvatarRenderer(this, pos.x, pos.y, cfg);
      npc.setDepth(40);

      // Simple wander tween
      const range = 80 + Math.random() * 60;
      this.tweens.add({
        targets: npc.getContainer(),
        x: pos.x + (Math.random() > 0.5 ? range : -range),
        duration: 3000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => npc.update(true, 0),
      });
    });
  }

  // ─── Player & Input ──────────────────────────────────────────────────────────

  private handleMovement(delta: number) {
    if (this.inputBlocked) {
      this.lastIsMoving = false;
      this.lastMoveDx = 0;
      return;
    }

    const speed = PLAYER.SPEED * (delta / 1000);
    let dx = 0, dy = 0;

    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const up = this.cursors.up.isDown || this.keyW.isDown;
    const down = this.cursors.down.isDown || this.keyS.isDown;

    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;

    // Touch fallback if no keyboard input
    if (dx === 0 && dy === 0 && this.isTouch) {
      dx = this.touchDx;
      dy = this.touchDy;
    }

    // Normalize diagonal
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

    const isMoving = dx !== 0 || dy !== 0;
    this.lastIsMoving = isMoving;
    this.lastMoveDx = dx;
    const newX = Phaser.Math.Clamp(this.px + dx * speed, 20, WORLD.WIDTH - 20);
    const newY = Phaser.Math.Clamp(this.py + dy * speed, 20, WORLD.HEIGHT - 20);

    // Simple building collision: can't enter building zone unless near a door
    const inBuildingZone = newY < ZONES.BUILDING_BOTTOM && newY > ZONES.BUILDING_TOP;

    const finalX = newX;
    let finalY = newY;

    if (inBuildingZone) {
      // Check if near a door entrance (within 60px of door center)
      const doors = [
        BUILDINGS.ARCADE.x + BUILDINGS.ARCADE.w / 2,
        BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2,
        BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2,
      ];
      const nearDoor = doors.some(doorX => Math.abs(newX - doorX) < 60);

      if (!nearDoor) {
        // Allow horizontal movement but clamp vertical
        finalY = Math.max(this.py, ZONES.BUILDING_BOTTOM);
      }
    }

    this.px = finalX;
    this.py = finalY;

    this.playerAvatar.update(isMoving, dx);
    this.playerAvatar.setPosition(this.px, this.py);
    this.playerAvatar.setDepth(Math.floor(this.py / 10));

    this.playerBody.setPosition(this.px, this.py);
    this.playerNameplate.setPosition(this.px, this.py - 46);
    this.chatSystem.updatePosition('__player__', this.px, this.py);
  }

  private setupTouchControls() {
    // Basic heuristic
    this.isTouch = this.sys.game.device.input.touch;
    if (!this.isTouch) return;

    const cam = this.cameras.main;
    const { width, height } = cam;

    // Joystick visuals (bottom-left)
    const baseX = 90;
    const baseY = height - 90;
    this.joyBase = this.add.circle(baseX, baseY, 44, 0x000000, 0.22)
      .setScrollFactor(0)
      .setDepth(9999)
      .setVisible(true);
    this.joyBase.setStrokeStyle(2, 0xFFFFFF, 0.08);

    this.joyKnob = this.add.circle(baseX, baseY, 18, 0xF5C842, 0.35)
      .setScrollFactor(0)
      .setDepth(10000)
      .setVisible(true);
    this.joyKnob.setStrokeStyle(2, 0x000000, 0.18);

    // Interact button (bottom-right)
    const ax = width - 90;
    const ay = height - 90;
    this.btnA = this.add.rectangle(ax, ay, 64, 64, 0x000000, 0.25)
      .setScrollFactor(0)
      .setDepth(9999)
      .setInteractive({ useHandCursor: true });
    this.btnA.setStrokeStyle(2, 0xFFFFFF, 0.08);
    this.btnAText = this.add.text(ax, ay, 'A', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10000);

    this.btnA.on('pointerdown', () => {
      if (this.inTransition) return;
      // Trigger same interaction as SPACE
      this.handleInteraction();
    });

    // Pointer-based joystick (left half of screen)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.inputBlocked) return;
      // only start joystick if in left half and lower area, and not on A button
      if (p.x > width * 0.55) return;
      if (p.y < height * 0.35) return;
      this.touchMoveActive = true;
      this.touchStartX = p.x;
      this.touchStartY = p.y;
      if (this.joyBase && this.joyKnob) {
        this.joyBase.setPosition(p.x, p.y);
        this.joyKnob.setPosition(p.x, p.y);
        this.joyBase.setAlpha(0.28);
        this.joyKnob.setAlpha(0.45);
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.touchMoveActive) return;
      const dx = p.x - this.touchStartX;
      const dy = p.y - this.touchStartY;
      const max = 44;
      const len = Math.min(max, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx);
      const nx = (len / max) * Math.cos(ang);
      const ny = (len / max) * Math.sin(ang);
      this.touchDx = Phaser.Math.Clamp(nx, -1, 1);
      this.touchDy = Phaser.Math.Clamp(ny, -1, 1);
      if (this.joyKnob) {
        this.joyKnob.setPosition(this.touchStartX + this.touchDx * max, this.touchStartY + this.touchDy * max);
      }
    });

    const endTouch = () => {
      this.touchMoveActive = false;
      this.touchDx = 0;
      this.touchDy = 0;
      if (this.joyBase && this.joyKnob) {
        // snap back to default corner
        this.joyBase.setPosition(baseX, baseY);
        this.joyKnob.setPosition(baseX, baseY);
        this.joyBase.setAlpha(0.22);
        this.joyKnob.setAlpha(0.35);
      }
    };
    this.input.on('pointerup', endTouch);
    this.input.on('pointerupoutside', endTouch);
  }

  // ─── Realtime / Multiplayer ──────────────────────────────────────────────────

  private setupRealtime(): 'multiplayer' | 'solo' {
    if (!supabase || !isConfigured) {
      console.log('[Waspi] Supabase not configured — solo mode');
      return 'solo';
    }

    this.channel = supabase.channel('waspi-world', {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'player:move' }, ({ payload }) => {
        this.handleRemoteMove(payload);
      })
      .on('broadcast', { event: 'player:chat' }, ({ payload }) => {
        this.handleRemoteChat(payload);
      })
      .on('broadcast', { event: 'player:join' }, ({ payload }) => {
        this.handleRemoteJoin(payload);
      })
      .on('broadcast', { event: 'player:leave' }, ({ payload }) => {
        this.handleRemoteLeave(payload);
      })
      .on('broadcast', { event: 'player:update' }, ({ payload }) => {
        this.handleRemoteUpdate(payload);
      })
      .on('broadcast', { event: 'player:hit' }, ({ payload }) => {
        this.handleHit(payload);
      })
      .subscribe(() => {
        this.broadcastSelfState('player:join');
      });
    return 'multiplayer';
  }

  private handleHit(payload: unknown) {
    const next = this.parseRemoteHit(payload);
    if (!next || next.target_id !== this.playerId) return;
    if (!this.allowRemoteEvent(this.remoteHitTimes, next.source_id, REMOTE_HIT_MIN_MS)) return;
    if (!this.inTraining || !this.pvpEnabled) return;
    const dmg = Math.max(1, Math.min(40, Math.floor(next.dmg ?? 10)));
    this.hp = Math.max(0, this.hp - dmg);
    this.renderHpHud();

    // hit feedback
    const flash = this.add.rectangle(400, 300, 800, 600, 0xFF0000, 0.08)
      .setScrollFactor(0)
      .setDepth(20000);
    this.tweens.add({ targets: flash, alpha: 0, duration: 140, onComplete: () => flash.destroy() });

    if (this.hp <= 0) {
      this.hp = 100;
      this.renderHpHud();
      // respawn at house spawn
      this.px = PLAYER.SPAWN_X;
      this.py = PLAYER.SPAWN_Y;
      this.playerBody.setPosition(this.px, this.py);
      this.playerAvatar.setPosition(this.px, this.py);
      this.playerNameplate.setPosition(this.px, this.py - 46);
    }
  }

  private handleRemoteJoin(payload: unknown) {
    const next = this.parseRemoteState(payload);
    if (!next || next.player_id === this.playerId) return;
    const cfg = next.avatar ?? {};

    if (!this.remotePlayers.has(next.player_id)) {
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, cfg);
      if (next.equipped) {
        this.applyRemoteEquipped(next.player_id, next.equipped);
      }
      this.broadcastSelfState('player:join');
      return;
    }

    const rp = this.remotePlayers.get(next.player_id)!;
    rp.username = next.username;
    rp.nameplate.setText(next.username);
    rp.targetX = next.x;
    rp.targetY = next.y;
    if (next.avatar) {
      rp.avatarConfig = { ...rp.avatarConfig, ...cfg };
      const depth = rp.avatar.getContainer().depth;
      rp.avatar.destroy();
      rp.avatar = new AvatarRenderer(this, rp.x, rp.y, rp.avatarConfig);
      rp.avatar.setDepth(depth);
    }
    if (next.equipped) {
      this.applyRemoteEquipped(next.player_id, next.equipped);
    }
  }

  private handleRemoteLeave(payload: unknown) {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    if (!playerId) return;
    const rp = this.remotePlayers.get(playerId);
    if (rp) {
      rp.avatar.destroy();
      rp.nameplate.destroy();
      this.remotePlayers.delete(playerId);
      this.chatSystem.clearBubble(playerId);
    }
  }

  private handleRemoteMove(payload: unknown) {
    const next = this.parseRemoteMove(payload);
    if (!next || next.player_id === this.playerId) return;
    if (!this.allowRemoteEvent(this.remoteMoveTimes, next.player_id, REMOTE_MOVE_MIN_MS)) return;

    if (!this.remotePlayers.has(next.player_id)) {
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, {});
    }
    const rp = this.remotePlayers.get(next.player_id)!;
    rp.targetX = next.x;
    rp.targetY = next.y;
    rp.username = next.username;
    rp.nameplate.setText(next.username);
    rp.isMoving = next.moving;
    rp.moveDx = next.dir;
  }

  private handleRemoteChat(payload: unknown) {
    const next = this.parseRemoteChat(payload);
    if (!next || next.player_id === this.playerId) return;
    if (this.mutedPlayerIds.has(next.player_id)) return;
    if (!this.allowRemoteEvent(this.remoteChatTimes, next.player_id, REMOTE_CHAT_MIN_MS)) return;
    if (Phaser.Math.Distance.Between(this.px, this.py, next.x, next.y) > MAX_REMOTE_CHAT_DISTANCE) return;

    // Ensure remote player exists
    if (!this.remotePlayers.has(next.player_id)) {
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, {});
    }

    this.chatSystem.showBubble(next.player_id, next.message, next.x, next.y, false);

    // Notify React chat log
    eventBus.emit(EVENTS.CHAT_RECEIVED, {
      playerId: next.player_id,
      username: next.username,
      message: next.message,
      isMe: false,
    });
  }

  private spawnRemotePlayer(id: string, username: string, x: number, y: number, cfg: AvatarConfig) {
    const avatar = new AvatarRenderer(this, x, y, cfg);
    avatar.setDepth(40);

    const nameplate = this.add.text(x, y - 46, username, {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#88AAFF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(120);

    // Hitbox for PVP targeting
    const hitbox = this.createHitbox(x, y);

    // Shooter-side: if my bullet hits remote hitbox, send hit event
    this.physics.add.overlap(this.bullets, hitbox, (bObj) => {
      if (!this.inTraining || !this.pvpEnabled) return;
      this.destroyArcadeObject(bObj);
      this.channel?.send({
        type: 'broadcast',
        event: 'player:hit',
        payload: { target_id: id, source_id: this.playerId, dmg: 10 },
      });
    });

    this.remotePlayers.set(id, {
      avatar,
      nameplate,
      username,
      x,
      y,
      targetX: x,
      targetY: y,
      isMoving: false,
      moveDx: 0,
      avatarConfig: cfg,
      hitbox,
    });

    nameplate.setInteractive({ useHandCursor: true });
    nameplate.on('pointerdown', () => {
      eventBus.emit(EVENTS.PLAYER_ACTIONS_OPEN, { playerId: id, username });
    });
  }

  private handleRemoteUpdate(payload: unknown) {
    const next = this.parseRemoteState(payload);
    if (!next || next.player_id === this.playerId) return;
    const rp = this.remotePlayers.get(next.player_id);
    if (!rp) return;

    rp.username = next.username;
    rp.nameplate.setText(next.username);
    rp.targetX = next.x;
    rp.targetY = next.y;

    if (next.avatar) {
      rp.avatarConfig = { ...rp.avatarConfig, ...next.avatar };
      // rebuild avatar visuals
      const x = rp.x;
      const y = rp.y;
      const depth = rp.avatar.getContainer().depth;
      rp.avatar.destroy();
      rp.avatar = new AvatarRenderer(this, x, y, rp.avatarConfig);
      rp.avatar.setDepth(depth);
    }

    if (next.equipped) {
      this.applyRemoteEquipped(next.player_id, next.equipped);
    }
  }

  private applyRemoteEquipped(playerId: string, equipped: { top?: string; bottom?: string }) {
    const rp = this.remotePlayers.get(playerId);
    if (!rp) return;
    // Just store ids in config; colors will be resolved client-side by catalog getter
    rp.avatarConfig = {
      ...rp.avatarConfig,
      equipTop: equipped.top,
      equipBottom: equipped.bottom,
    };
    // If you want, we can resolve to colors here later.
  }

  private createHitbox(x: number, y: number): HitboxArc {
    const hitbox = this.add.circle(x, y, 16, 0x000000, 0) as HitboxArc;
    this.physics.add.existing(hitbox);
    hitbox.body.setCircle(16);
    hitbox.body.setImmovable(true);
    hitbox.body.setAllowGravity(false);
    return hitbox;
  }

  private destroyArcadeObject(obj: unknown) {
    if (!obj || typeof obj !== 'object') return;

    if ('gameObject' in obj && obj.gameObject && typeof obj.gameObject === 'object') {
      (obj.gameObject as ArcadeObject).destroy();
      return;
    }
    if ('destroy' in obj && typeof obj.destroy === 'function') {
      (obj as ArcadeObject).destroy();
    }
  }

  private syncPosition() {
    const now = Date.now();
    if (now - this.lastPosSent < 66) return; // ~15Hz
    this.lastPosSent = now;

    this.channel?.send({
      type: 'broadcast',
      event: 'player:move',
      payload: {
        player_id: this.playerId,
        username: this.playerUsername,
        x: Math.round(this.px),
        y: Math.round(this.py),
        dir: this.lastMoveDx,
        moving: this.lastIsMoving,
      },
    });
  }

  // ─── Chat Bridge (React ↔ Phaser) ───────────────────────────────────────────

  private setupReactBridge() {
    this.bridgeCleanupFns.push(eventBus.on(EVENTS.CHAT_SEND, async (message: unknown) => {
      if (typeof message !== 'string') return;
      const trimmed = message.trim();
      if (!trimmed) return;

      const now = Date.now();
      if (now - this.lastChatSent < CHAT.RATE_LIMIT_MS) return;
      this.lastChatSent = now;

      const moderated = await this.moderateChat(trimmed);
      if (!moderated) return;

      // Show bubble on own player
      this.chatSystem.showBubble('__player__', moderated, this.px, this.py, true);

      // Broadcast to others
      this.channel?.send({
        type: 'broadcast',
        event: 'player:chat',
        payload: {
          player_id: this.playerId,
          username: this.playerUsername,
          message: moderated,
          x: Math.round(this.px),
          y: Math.round(this.py),
        },
      });

      // Notify React log
      eventBus.emit(EVENTS.CHAT_RECEIVED, {
        playerId: this.playerId,
        username: this.playerUsername,
        message: moderated,
        isMe: true,
      });
    }));

    this.bridgeCleanupFns.push(eventBus.on(EVENTS.CHAT_INPUT_FOCUS, () => { this.inputBlocked = true; }));
    this.bridgeCleanupFns.push(eventBus.on(EVENTS.CHAT_INPUT_BLUR, () => { this.inputBlocked = false; }));
    this.bridgeCleanupFns.push(eventBus.on(EVENTS.PLAYER_ACTION_MUTE, (payload: unknown) => {
      const playerId = (payload as { playerId?: string } | null)?.playerId;
      if (!playerId) return;
      this.mutedPlayerIds.add(playerId);
      this.chatSystem.clearBubble(playerId);
    }));
    this.bridgeCleanupFns.push(eventBus.on(EVENTS.PLAYER_ACTION_REPORT, () => {}));

    // Apply avatar partial updates (e.g. smoke on/off) and persist in localStorage
    this.bridgeCleanupFns.push(eventBus.on(EVENTS.AVATAR_SET, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;

      const next = {
        ...loadStoredAvatarConfig(),
        ...(payload as AvatarConfig),
      };
      this.rebuildLocalAvatar(next);
      this.refreshUtilitiesFromInventory();

      // Broadcast avatar update so other players see smoke/clothing changes
      this.broadcastSelfState('player:update');
    }));

    // Open creator from inventory
    this.bridgeCleanupFns.push(eventBus.on(EVENTS.OPEN_CREATOR, () => {
      if (this.inTransition) return;
      this.transitionToScene('CreatorScene');
    }));
  }

  private async moderateChat(message: string) {
    if (!supabase || !isConfigured) return message;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return message;

    const res = await fetch('/api/chat/moderate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        zone: this.scene.key,
        x: Math.round(this.px),
        y: Math.round(this.py),
      }),
    }).catch(() => null);

    if (!res?.ok) return null;
    const json = await res.json().catch(() => null) as { message?: string } | null;
    return json?.message?.trim() || null;
  }

  private loadMutedPlayers() {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('waspi_player_state');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { mutedPlayers?: string[] };
      this.mutedPlayerIds = new Set(parsed.mutedPlayers ?? []);
    } catch {
      this.mutedPlayerIds = new Set();
    }
  }

  private getCurrentAvatarConfig() {
    const cfg = loadStoredAvatarConfig();
    const equipped = getEquippedColors();
    return {
      ...cfg,
      topColor: equipped.topColor ?? cfg.topColor,
      bottomColor: equipped.bottomColor ?? cfg.bottomColor,
    } as AvatarConfig;
  }

  private getEquippedIds() {
    if (typeof window === 'undefined') return {};
    const invRaw = window.localStorage.getItem('waspi_inventory_v1');
    if (!invRaw) return {};
    try {
      return (JSON.parse(invRaw) as { equipped?: { top?: string; bottom?: string } }).equipped ?? {};
    } catch {
      return {};
    }
  }

  private rebuildLocalAvatar(nextConfig: AvatarConfig) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('waspi_avatar_config', JSON.stringify(nextConfig));
    }
    const x = this.px;
    const y = this.py;
    const depth = this.playerAvatar.getContainer().depth;
    this.playerAvatar.destroy();
    this.playerAvatar = new AvatarRenderer(this, x, y, {
      ...this.getCurrentAvatarConfig(),
      ...nextConfig,
    });
    this.playerAvatar.setDepth(depth);
  }

  private broadcastSelfState(event: 'player:join' | 'player:update') {
    if (!this.channel) return;
    const cfg = this.getCurrentAvatarConfig();
    const payload = {
      player_id: this.playerId,
      username: this.playerUsername,
      x: this.px,
      y: this.py,
      avatar: cfg,
      equipped: this.getEquippedIds(),
      topColor: cfg.topColor,
      bottomColor: cfg.bottomColor,
    };
    this.channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private getOrCreatePlayerId(): string {
    if (typeof window === 'undefined') return crypto.randomUUID();

    // Use per-tab session ID so each browser tab is a distinct player,
    // even si comparten localStorage.
    const key = 'waspi_session_id';
    const stored = window.sessionStorage.getItem(key);
    if (stored) return stored;

    const id = crypto.randomUUID();
    window.sessionStorage.setItem(key, id);
    return id;
  }

  private getOrCreateUsername(): string {
    if (typeof window === 'undefined') return 'waspi_guest';
    const stored = localStorage.getItem('waspi_username');
    if (stored) return stored;
    const adjectives = ['NEON', 'DARK', 'WILD', 'COOL', 'DOPE', 'EPIC', 'HYPE', 'SICK'];
    const nouns = ['WASPI', 'RIDER', 'GHOST', 'WOLF', 'BLADE', 'STORM', 'FIRE', 'BYTE'];
    const username = `${adjectives[Math.floor(Math.random() * adjectives.length)]}_${nouns[Math.floor(Math.random() * nouns.length)]}_${Math.floor(Math.random() * 999)}`;
    localStorage.setItem('waspi_username', username);
    return username;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    this.handleMovement(delta);
    this.syncPosition();
    this.chatSystem.update();

    this.handleInteraction();

    // Gun shoot with keyboard
    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keyF) && !this.inputBlocked) {
      const p = this.input.activePointer;
      this.shootAt(p.worldX, p.worldY);
    }

    // Football follow animation
    if (this.football && this.ballEnabled) {
      this.footballTick += delta;
      const t = this.footballTick / 220;
      const ox = Math.cos(t) * 18;
      const oy = Math.sin(t * 1.3) * 8;
      this.football.setPosition(this.px + ox, this.py - 10 + oy);
      this.football.setRotation(t * 0.5);
      this.football.setDepth(Math.floor((this.py - 10 + oy) / 10) + 30);
    }

    // Update combat hitbox follow
    this.playerHitbox.setPosition(this.px, this.py);

    // Training zone enter/exit
    const nowInTraining =
      this.px >= ZONES.TRAINING_X &&
      this.px <= ZONES.TRAINING_X + ZONES.TRAINING_W &&
      this.py >= ZONES.TRAINING_Y &&
      this.py <= ZONES.TRAINING_Y + ZONES.TRAINING_H;
    if (nowInTraining !== this.inTraining) {
      this.inTraining = nowInTraining;
      if (this.trainingBanner) {
        this.trainingBanner.setText(this.inTraining ? 'TRAINING: PVP + PVE' : '');
      }
    }

    // Interpolate remote players
    for (const [playerId, rp] of this.remotePlayers) {
      rp.x = Phaser.Math.Linear(rp.x, rp.targetX, 0.18);
      rp.y = Phaser.Math.Linear(rp.y, rp.targetY, 0.18);
      const deltaX = rp.targetX - rp.x;
      const deltaY = rp.targetY - rp.y;
      const isMoving = rp.isMoving || Math.abs(deltaX) > 0.8 || Math.abs(deltaY) > 0.8;
      const visualDx = Math.abs(deltaX) > 0.1 ? deltaX : rp.moveDx;
      rp.avatar.update(isMoving, visualDx);
      rp.avatar.setPosition(rp.x, rp.y);
      rp.avatar.setDepth(Math.floor(rp.y / 10));
      rp.nameplate.setPosition(rp.x, rp.y - 46);
      this.chatSystem.updatePosition(playerId, rp.x, rp.y);
      rp.hitbox.setPosition(rp.x, rp.y);
    }
  }

  // ─── Interaction ───────────────────────────────────────────────────────────────

  private handleInteraction() {
    if (this.inTransition) return;
    if (!Phaser.Input.Keyboard.JustDown(this.keySpace)) return;

    // Check proximity to each building door (horizontal distance threshold)
    const arcadeDoorX = BUILDINGS.ARCADE.x + BUILDINGS.ARCADE.w / 2;
    const storeDoorX = BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2;
    const cafeDoorX = BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2;

    const nearArcade = Math.abs(this.px - arcadeDoorX) < 60 && this.py < ZONES.BUILDING_BOTTOM;
    const nearStore = Math.abs(this.px - storeDoorX) < 60 && this.py < ZONES.BUILDING_BOTTOM;
    const nearCafe = Math.abs(this.px - cafeDoorX) < 60 && this.py < ZONES.BUILDING_BOTTOM;

    if (nearArcade) {
      this.transitionToScene('ArcadeInterior');
    } else if (nearStore) {
      this.transitionToScene('StoreInterior');
    } else if (nearCafe) {
      this.transitionToScene('CafeInterior');
    }
  }

  private transitionToScene(targetKey: string) {
    this.inTransition = true;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(targetKey);
    });
  }

  private handleSceneShutdown() {
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'player:leave',
        payload: { player_id: this.playerId },
      });
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.chatSystem?.destroy();
    this.bridgeCleanupFns.forEach((cleanup) => cleanup());
    this.bridgeCleanupFns = [];
  }

  private allowRemoteEvent(cache: Map<string, number>, playerId: string, minMs: number) {
    const now = Date.now();
    const last = cache.get(playerId) ?? 0;
    if (now - last < minMs) return false;
    cache.set(playerId, now);
    return true;
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

  private parseRemoteMove(payload: unknown): RemoteMoveEvent | null {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    const username = this.readStringField(payload, 'username') ?? 'waspi_guest';
    const x = this.readNumberField(payload, 'x');
    const y = this.readNumberField(payload, 'y');
    if (!playerId || x === null || y === null) return null;
    return {
      player_id: playerId,
      username,
      x,
      y,
      dir: this.readNumberField(payload, 'dir', 'dx') ?? 0,
      moving: this.readBooleanField(payload, 'moving', 'isMoving') ?? false,
    };
  }

  private parseRemoteChat(payload: unknown): RemoteChatEvent | null {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    const username = this.readStringField(payload, 'username') ?? 'waspi_guest';
    const message = this.readStringField(payload, 'message');
    const x = this.readNumberField(payload, 'x');
    const y = this.readNumberField(payload, 'y');
    if (!playerId || !message || x === null || y === null) return null;
    return {
      player_id: playerId,
      username,
      message: message.slice(0, CHAT.MAX_CHARS),
      x,
      y,
    };
  }

  private parseRemoteState(payload: unknown): RemoteStateEvent | null {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    const username = this.readStringField(payload, 'username') ?? 'waspi_guest';
    const x = this.readNumberField(payload, 'x');
    const y = this.readNumberField(payload, 'y');
    if (!playerId || x === null || y === null) return null;
    const avatar = payload && typeof payload === 'object' && 'avatar' in payload && payload.avatar && typeof payload.avatar === 'object'
      ? payload.avatar as AvatarConfig
      : undefined;
    const equippedRaw = payload && typeof payload === 'object' && 'equipped' in payload ? payload.equipped : null;
    const equipped = equippedRaw && typeof equippedRaw === 'object'
      ? {
          top: typeof (equippedRaw as Record<string, unknown>).top === 'string' ? (equippedRaw as Record<string, string>).top : undefined,
          bottom: typeof (equippedRaw as Record<string, unknown>).bottom === 'string' ? (equippedRaw as Record<string, string>).bottom : undefined,
        }
      : undefined;
    return {
      player_id: playerId,
      username,
      x,
      y,
      avatar,
      equipped,
    };
  }

  private parseRemoteHit(payload: unknown): RemoteHitEvent | null {
    const targetId = this.readStringField(payload, 'target_id', 'targetId');
    const sourceId = this.readStringField(payload, 'source_id', 'sourceId');
    const dmg = this.readNumberField(payload, 'dmg');
    if (!targetId || !sourceId || dmg === null) return null;
    return {
      target_id: targetId,
      source_id: sourceId,
      dmg,
    };
  }
}

