
import Phaser from 'phaser';
import { AvatarRenderer, type AvatarConfig, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { announceScene, createBackButton, transitionToScene } from '../systems/SceneUi';
import { ensureFallbackRectTexture, safeCreateSpritesheetAnimation, safePlaySpriteAnimation } from '../systems/AnimationSafety';
import {
  ZOMBIES_PLAYER,
  ZOMBIES_POINTS,
  ZOMBIES_SECTIONS,
  ZOMBIES_VIEWPORT,
  ZOMBIES_WEAPONS,
  ZOMBIES_WORLD,
  ZOMBIE_TYPES,
  getEligibleZombieTypes,
  getRoundConcurrentCap,
  getRoundWarmupMs,
  getRoundZombieCount,
  getSpawnDelayForRound,
  getZombieBreachMs,
  getZombieHpForRound,
  getZombieSpeedForRound,
  type ZombieType,
  type ZombiesSectionId,
  type ZombiesWeaponId,
} from '../config/zombies';

const BOX_POS = { x: 435, y: 698 } as const;
const EXIT_PAD = { x: 182, y: 878, radius: 42 } as const;
const PLAYER_RETURN = { x: 1600, y: 1540 } as const;
const WALL_THICKNESS = 36;

type DoorState = {
  id: ZombiesSectionId;
  unlocked: boolean;
  cost: number;
  rect?: Phaser.Geom.Rectangle;
  panel: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  costText: Phaser.GameObjects.Text;
};

type ObstacleRect = {
  rect: Phaser.Geom.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  outline: Phaser.GameObjects.Rectangle;
};

type ZombieAnimState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death' | 'spawn';

type SpawnNode = {
  id: string;
  sectionId: ZombiesSectionId;
  x: number;
  y: number;
  frame: Phaser.GameObjects.Rectangle;
  glass: Phaser.GameObjects.Rectangle;
  planks: Phaser.GameObjects.Rectangle[];
  warning: Phaser.GameObjects.Text;
  pulse: Phaser.GameObjects.Ellipse;
  occupiedBy?: string;
  lastUsedAt: number;
  boardHealth: number;
  maxBoards: number;
};

type ZombieState = {
  id: string;
  type: ZombieType;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  shadow: Phaser.GameObjects.Ellipse;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldownMs: number;
  hitReward: number;
  killReward: number;
  radius: number;
  state: ZombieAnimState;
  phase: number;
  alive: boolean;
  lastAttackAt: number;
  spawnNodeId?: string;
  breachEndsAt: number;
  lastStompAt: number;
  lastAnimatedState?: ZombieAnimState;
};

type PickupKind = 'max_ammo' | 'insta_kill';

type PickupState = {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
  glow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  expiresAt: number;
};

type WeaponInventory = Record<ZombiesWeaponId, {
  owned: boolean;
  ammoInMag: number;
  reserveAmmo: number;
}>;

type InteractionOption = {
  kind: 'exit' | 'door' | 'box' | 'repair';
  x: number;
  y: number;
  radius: number;
  label: string;
  color: number;
  sectionId?: ZombiesSectionId;
  nodeId?: string;
};

export class ZombiesScene extends Phaser.Scene {
  private avatarConfig: AvatarConfig = {};
  private player!: AvatarRenderer;
  private playerName!: Phaser.GameObjects.Text;
  private px: number = ZOMBIES_PLAYER.startX;
  private py: number = ZOMBIES_PLAYER.startY;
  private hp: number = ZOMBIES_PLAYER.maxHp;
  private points: number = ZOMBIES_POINTS.start;
  private round: number = 0;
  private roundTarget: number = 0;
  private spawnedThisRound: number = 0;
  private nextSpawnAt: number = 0;
  private roundBreakUntil: number = 0;
  private gameOver = false;
  private currentWeapon: ZombiesWeaponId = 'pistol';
  private weaponInventory!: WeaponInventory;
  private weaponOrder: ZombiesWeaponId[] = ['pistol'];
  private lastShotAt: number = 0;
  private reloadEndsAt: number = 0;
  private lastIsMoving = false;
  private lastDamageAt: number = 0;
  private zombies = new Map<string, ZombieState>();
  private zombieIdSeq = 0;
  private pickupIdSeq = 0;
  private obstacles: ObstacleRect[] = [];
  private spawnNodes = new Map<string, SpawnNode>();
  private pickups = new Map<string, PickupState>();
  private doors = new Map<ZombiesSectionId, DoorState>();
  private mysteryBoxCooldownUntil: number = 0;
  private instaKillUntil: number = 0;
  private activePrompt?: Phaser.GameObjects.Text;
  private promptGlow?: Phaser.GameObjects.Graphics;
  private roundText?: Phaser.GameObjects.Text;
  private pointsText?: Phaser.GameObjects.Text;
  private hpText?: Phaser.GameObjects.Text;
  private ammoText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;
  private inventoryText?: Phaser.GameObjects.Text;
  private noticeText?: Phaser.GameObjects.Text;
  private controlsText?: Phaser.GameObjects.Text;
  private reticle?: Phaser.GameObjects.Graphics;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyOne!: Phaser.Input.Keyboard.Key;
  private keyTwo!: Phaser.Input.Keyboard.Key;
  private keyThree!: Phaser.Input.Keyboard.Key;
  private keyFour!: Phaser.Input.Keyboard.Key;
  private keyFive!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private pointerDownHandler?: (pointer: Phaser.Input.Pointer) => void;

  constructor() {
    super({ key: 'ZombiesScene' });
  }

  create() {
    this.input.enabled = true;
    announceScene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    this.avatarConfig = loadStoredAvatarConfig();
    this.weaponInventory = this.createWeaponInventory();
    this.weaponOrder = ['pistol'];
    this.currentWeapon = 'pistol';
    this.points = ZOMBIES_POINTS.start;
    this.hp = ZOMBIES_PLAYER.maxHp;
    this.round = 0;
    this.roundTarget = 0;
    this.spawnedThisRound = 0;
    this.nextSpawnAt = 0;
    this.roundBreakUntil = 0;
    this.gameOver = false;
    this.zombies.clear();
    this.zombieIdSeq = 0;
    this.pickups.clear();
    this.pickupIdSeq = 0;
    this.obstacles = [];
    this.spawnNodes.clear();
    this.doors.clear();
    this.mysteryBoxCooldownUntil = 0;
    this.instaKillUntil = 0;
    this.lastShotAt = 0;
    this.reloadEndsAt = 0;
    this.lastDamageAt = 0;
    this.px = ZOMBIES_PLAYER.startX;
    this.py = ZOMBIES_PLAYER.startY;

    this.cameras.main.setBounds(0, 0, ZOMBIES_WORLD.WIDTH, ZOMBIES_WORLD.HEIGHT);
    this.physics.world.setBounds(0, 0, ZOMBIES_WORLD.WIDTH, ZOMBIES_WORLD.HEIGHT);

    this.buildArena();
    this.setupZombieAnimations();
    this.setupPlayer();
    this.setupInput();
    this.setupHud();
    this.setupDoors();
    this.setupMysteryBox();

    createBackButton(this, () => this.requestExit(), 'SALIR');
    this.cameras.main.startFollow(this.player.getContainer(), true, 0.12, 0.12);
    this.cameras.main.setZoom(1);
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(240, 0, 0, 0);

    this.beginRound();
  }

  private createWeaponInventory(): WeaponInventory {
    return {
      pistol: { owned: true, ammoInMag: ZOMBIES_WEAPONS.pistol.magazineSize, reserveAmmo: ZOMBIES_WEAPONS.pistol.reserveAmmo },
      shotgun: { owned: false, ammoInMag: 0, reserveAmmo: 0 },
      smg: { owned: false, ammoInMag: 0, reserveAmmo: 0 },
      rifle: { owned: false, ammoInMag: 0, reserveAmmo: 0 },
      raygun: { owned: false, ammoInMag: 0, reserveAmmo: 0 },
    };
  }

  private setupZombieAnimations() {
    ensureFallbackRectTexture(this, 'zombie_fallback_small', 64, 64, 0x6b7f59);
    ensureFallbackRectTexture(this, 'zombie_fallback_large', 96, 96, 0x7558a3);
    ensureFallbackRectTexture(this, 'zombie_fallback_boss', 128, 128, 0x8b3344);

    const frameRates: Record<ZombieAnimState, number> = {
      idle: 6,
      walk: 10,
      attack: 12,
      hurt: 10,
      death: 10,
      spawn: 8,
    };
    const repeats: Record<Exclude<ZombieAnimState, 'spawn'>, number> = {
      idle: -1,
      walk: -1,
      attack: -1,
      hurt: 0,
      death: 0,
    };

    for (const config of Object.values(ZOMBIE_TYPES)) {
      const folder = config.folder;
      const animStates: ZombieAnimState[] = ['idle', 'walk', 'attack', 'hurt', 'death'];
      for (const state of animStates) {
        safeCreateSpritesheetAnimation(
          this,
          `zs_${folder}_${state}`,
          `zombie_${folder}_${state}`,
          frameRates[state],
          repeats[state as Exclude<ZombieAnimState, 'spawn'>],
        );
      }
    }

    for (const state of ['idle', 'walk', 'attack', 'hurt', 'death'] as const) {
      safeCreateSpritesheetAnimation(this, `zs_boss_${state}`, `zombie_boss_${state}`, frameRates[state], repeats[state]);
    }
  }

  private getZombieFallbackTexture(type: ZombieType) {
    return type === 'brute' ? 'zombie_fallback_large' : 'zombie_fallback_small';
  }

  private getZombieTextureKey(type: ZombieType, state: Exclude<ZombieAnimState, 'spawn'>) {
    const folder = ZOMBIE_TYPES[type].folder;
    return `zombie_${folder}_${state}`;
  }

  private buildArena() {
    const g = this.add.graphics();
    g.fillStyle(0x05070a, 1);
    g.fillRect(0, 0, ZOMBIES_WORLD.WIDTH, ZOMBIES_WORLD.HEIGHT);

    g.fillStyle(0x10171f, 1);
    g.fillRoundedRect(60, 120, 1700, 980, 28);
    g.lineStyle(3, 0x26384a, 0.85);
    g.strokeRoundedRect(60, 120, 1700, 980, 28);

    for (const section of ZOMBIES_SECTIONS) {
      const baseColor = section.unlockedByDefault ? 0x15202a : 0x0f1419;
      g.fillStyle(baseColor, 1);
      g.fillRoundedRect(section.x, section.y, section.w, section.h, 26);
      g.lineStyle(2, section.unlockedByDefault ? 0x395774 : 0x273340, 0.8);
      g.strokeRoundedRect(section.x, section.y, section.w, section.h, 26);
      this.add.text(section.x + 24, section.y + 24, section.label, {
        fontSize: '10px',
        fontFamily: '"Press Start 2P", monospace',
        color: section.unlockedByDefault ? '#7CC9FF' : '#62798F',
      }).setDepth(40);
    }

    g.fillStyle(0x1f1710, 1);
    g.fillRect(120, 602, 990, 76);
    g.fillStyle(0x322314, 1);
    g.fillRect(120, 620, 990, 18);
    for (let x = 140; x < 1080; x += 56) {
      g.fillStyle(0x614126, 0.9);
      g.fillRect(x, 627, 26, 4);
    }

    this.add.text(BOX_POS.x, BOX_POS.y - 72, 'MYSTERY BOX', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF7CCE',
    }).setOrigin(0.5).setDepth(50);

    const exitRing = this.add.circle(EXIT_PAD.x, EXIT_PAD.y, EXIT_PAD.radius, 0x39FF14, 0.08).setDepth(15);
    exitRing.setStrokeStyle(2, 0x39FF14, 0.45);
    this.tweens.add({
      targets: exitRing,
      alpha: { from: 0.08, to: 0.22 },
      scale: { from: 0.96, to: 1.04 },
      yoyo: true,
      repeat: -1,
      duration: 950,
      ease: 'Sine.easeInOut',
    });
    this.add.text(EXIT_PAD.x, EXIT_PAD.y - 56, 'EXIT', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#9EFFB7',
    }).setOrigin(0.5).setDepth(20);

    this.drawExitPad();
    this.buildObstacles();
    this.buildSpawnNodes();
  }

  private drawExitPad() {
    const g = this.add.graphics().setDepth(16);
    g.lineStyle(2, 0x8CF7AA, 0.7);
    g.strokeCircle(EXIT_PAD.x, EXIT_PAD.y, EXIT_PAD.radius);
    g.lineBetween(EXIT_PAD.x - 20, EXIT_PAD.y, EXIT_PAD.x + 20, EXIT_PAD.y);
    g.lineBetween(EXIT_PAD.x, EXIT_PAD.y - 20, EXIT_PAD.x, EXIT_PAD.y + 20);
  }

  private buildObstacles() {
    const rects = [
      new Phaser.Geom.Rectangle(322, 804, 116, 52),
      new Phaser.Geom.Rectangle(540, 544, 124, 60),
      new Phaser.Geom.Rectangle(822, 822, 146, 54),
      new Phaser.Geom.Rectangle(870, 512, 74, 152),
      new Phaser.Geom.Rectangle(1232, 506, 138, 58),
      new Phaser.Geom.Rectangle(1400, 842, 136, 54),
      new Phaser.Geom.Rectangle(1310, 666, 80, 160),
      new Phaser.Geom.Rectangle(980, 942, 210, 38),
    ];

    for (const rect of rects) {
      const fill = this.add.rectangle(rect.centerX, rect.centerY, rect.width, rect.height, 0x263341, 1).setDepth(12);
      const outline = this.add.rectangle(rect.centerX, rect.centerY, rect.width, rect.height)
        .setDepth(13)
        .setStrokeStyle(2, 0x7AB7FF, 0.38);
      this.obstacles.push({ rect, fill, outline });
    }
  }

  private buildSpawnNodes() {
    let index = 0;
    for (const section of ZOMBIES_SECTIONS) {
      for (const spawn of section.spawnPoints) {
        index += 1;
        const pulse = this.add.ellipse(spawn.x, spawn.y + 12, 56, 22, 0xFF6A6A, 0.06).setDepth(14);
        pulse.setStrokeStyle(1, 0xFF6A6A, 0.22);
        const frame = this.add.rectangle(spawn.x, spawn.y - 4, 42, 52, 0x0f1419, 0.86).setDepth(15);
        frame.setStrokeStyle(2, 0x6C7A89, 0.6);
        const glass = this.add.rectangle(spawn.x, spawn.y - 4, 34, 40, 0x203444, 0.55).setDepth(16);
        const planks = [-12, 0, 12].map((offsetY) =>
          this.add.rectangle(spawn.x, spawn.y + offsetY - 4, 38, 6, 0x7A4A21, 0.94).setDepth(17),
        );
        const warning = this.add.text(spawn.x, spawn.y - 42, 'BARRICADE', {
          fontSize: '6px',
          fontFamily: '"Press Start 2P", monospace',
          color: '#B7C6D5',
        }).setOrigin(0.5).setDepth(18);

        const node: SpawnNode = {
          id: `spawn_${index}`,
          sectionId: section.id,
          x: spawn.x,
          y: spawn.y,
          frame,
          glass,
          planks,
          warning,
          pulse,
          lastUsedAt: -9999,
          boardHealth: 3,
          maxBoards: 3,
        };
        this.spawnNodes.set(node.id, node);
        this.refreshSpawnNodeVisual(node, 0, false);
      }
    }
  }

  private refreshSpawnNodeVisual(node: SpawnNode, progress: number, occupied: boolean) {
    const clamped = Phaser.Math.Clamp(progress, 0, 1);
    const intactBoards = Phaser.Math.Clamp(node.boardHealth, 0, node.maxBoards);
    const stagedBreaks = Math.floor(clamped * intactBoards);
    node.pulse.setFillStyle(occupied ? 0xFF6A6A : 0x46B3FF, occupied ? 0.12 : 0.04);
    node.pulse.setStrokeStyle(1, occupied ? 0xFF6A6A : 0x46B3FF, occupied ? 0.42 : 0.18);
    node.frame.setStrokeStyle(2, occupied ? 0xFF8B3D : 0x6C7A89, occupied ? 0.9 : 0.6);
    node.glass.setFillStyle(
      occupied ? 0x4B2416 : intactBoards > 0 ? 0x203444 : 0x1a1a1a,
      occupied ? 0.42 : intactBoards > 0 ? 0.55 : 0.2,
    );
    node.warning.setText(occupied ? 'BREACHING' : intactBoards > 0 ? `BOARDS ${intactBoards}` : 'OPEN');
    node.warning.setColor(occupied ? '#FFB36A' : intactBoards > 0 ? '#B7C6D5' : '#FF6A6A');

    node.planks.forEach((plank, index) => {
      const shouldExist = index < intactBoards;
      const breakingNow = occupied && index >= intactBoards - stagedBreaks && index < intactBoards;
      plank.setVisible(shouldExist && !breakingNow);
      plank.setAlpha(occupied ? 0.96 : 0.72);
      plank.setAngle(occupied ? Math.sin(this.time.now / 90 + index) * 1.5 : 0);
    });
  }

  private setupPlayer() {
    this.player = new AvatarRenderer(this, this.px, this.py, this.avatarConfig);
    this.player.setDepth(60);
    this.playerName = this.add.text(this.px, this.py - 44, 'WASPI', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(70);
  }

  private setupInput() {
    const keyboard = this.input.keyboard!;
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyE = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyQ = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyR = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyOne = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.keyTwo = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.keyThree = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.keyFour = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
    this.keyFive = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
    this.keyEsc = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.pointerDownHandler = (pointer: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      this.tryShoot(pointer.worldX, pointer.worldY);
    };
    this.input.on('pointerdown', this.pointerDownHandler);
  }

  private setupHud() {
    this.roundText = this.add.text(18, 18, '', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setScrollFactor(0).setDepth(1000);

    this.pointsText = this.add.text(18, 42, '', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#9EFFB7',
    }).setScrollFactor(0).setDepth(1000);

    this.hpText = this.add.text(18, 66, '', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6A6A',
    }).setScrollFactor(0).setDepth(1000);

    this.ammoText = this.add.text(ZOMBIES_VIEWPORT.WIDTH - 18, ZOMBIES_VIEWPORT.HEIGHT - 48, '', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFFFFF',
      align: 'right',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(1000);

    this.statusText = this.add.text(ZOMBIES_VIEWPORT.WIDTH - 18, 18, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#7CC9FF',
      align: 'right',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(1000);

    this.inventoryText = this.add.text(18, ZOMBIES_VIEWPORT.HEIGHT - 70, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setScrollFactor(0).setDepth(1000);

    this.controlsText = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT - 16, 'WASD MOVER  |  CLICK DISPARA  |  R RECARGA  |  Q CAMBIA  |  E INTERACTUA', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#8594A6',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1000);

    this.noticeText = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, 86, '', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1200).setAlpha(0);

    this.activePrompt = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT - 38, '', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1200).setAlpha(0);

    this.promptGlow = this.add.graphics().setScrollFactor(0).setDepth(1190);
    this.reticle = this.add.graphics().setScrollFactor(0).setDepth(1100);
    this.renderHud();
  }

  private setupDoors() {
    for (const section of ZOMBIES_SECTIONS) {
      if (section.unlockedByDefault) continue;
      const panel = this.add.rectangle(section.doorX! + section.doorW! / 2, section.doorY! + section.doorH! / 2, section.doorW!, section.doorH!, 0x4A231F, 1).setDepth(24);
      const label = this.add.text(panel.x, panel.y - 24, section.label, {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#FFB36A',
      }).setOrigin(0.5).setDepth(25);
      const costText = this.add.text(panel.x, panel.y + 18, `${section.unlockCost} PTS`, {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#F5C842',
      }).setOrigin(0.5).setDepth(25);
      this.doors.set(section.id, {
        id: section.id,
        unlocked: false,
        cost: section.unlockCost ?? 0,
        rect: new Phaser.Geom.Rectangle(section.doorX!, section.doorY!, section.doorW!, section.doorH!),
        panel,
        label,
        costText,
      });
    }
  }

  private setupMysteryBox() {
    const lid = this.add.rectangle(BOX_POS.x, BOX_POS.y - 8, 88, 30, 0x6F2B78, 1).setDepth(22);
    lid.setStrokeStyle(2, 0xFF7CCE, 0.72);
    const base = this.add.rectangle(BOX_POS.x, BOX_POS.y + 18, 96, 42, 0x31183E, 1).setDepth(21);
    base.setStrokeStyle(2, 0xF5C842, 0.55);
    this.tweens.add({
      targets: [lid, base],
      scaleX: { from: 0.99, to: 1.02 },
      scaleY: { from: 0.99, to: 1.02 },
      alpha: { from: 0.92, to: 1 },
      yoyo: true,
      repeat: -1,
      duration: 850,
      ease: 'Sine.easeInOut',
    });
  }

  private renderHud() {
    const weapon = ZOMBIES_WEAPONS[this.currentWeapon];
    const ammo = this.weaponInventory[this.currentWeapon];
    this.roundText?.setText(`ROUND ${this.round}`);
    this.pointsText?.setText(`PTS ${this.points}`);
    this.hpText?.setText(`HP ${Math.max(0, Math.round(this.hp))}`);
    this.ammoText?.setText(`${weapon.label}\n${ammo.ammoInMag}/${ammo.reserveAmmo}`);
    this.statusText?.setText([
      this.gameOver ? 'GAME OVER' : this.instaKillUntil > this.time.now ? `INSTA ${Math.ceil((this.instaKillUntil - this.time.now) / 1000)}s` : this.reloadEndsAt > this.time.now ? 'RECARGANDO' : 'EN PIE',
      `ZOMBIES ${this.countAliveZombies()}/${this.roundTarget}`,
      `SPAWN ${this.spawnedThisRound}`,
    ].join('\n'));
    this.inventoryText?.setText(`ARMAS ${this.weaponOrder.map((id) => id === this.currentWeapon ? `[${ZOMBIES_WEAPONS[id].label}]` : ZOMBIES_WEAPONS[id].label).join('  ')}`);

    if (this.reticle) {
      this.reticle.clear();
      const pointer = this.input.activePointer;
      this.reticle.lineStyle(1, 0xFFFFFF, 0.75);
      this.reticle.strokeCircle(pointer.x, pointer.y, 8);
      this.reticle.lineBetween(pointer.x - 12, pointer.y, pointer.x + 12, pointer.y);
      this.reticle.lineBetween(pointer.x, pointer.y - 12, pointer.x, pointer.y + 12);
    }
  }

  private showNotice(text: string, color = '#F5C842') {
    if (!this.noticeText) return;
    this.noticeText.setText(text);
    this.noticeText.setColor(color);
    this.noticeText.setAlpha(1);
    this.noticeText.setScale(0.94);
    this.tweens.killTweensOf(this.noticeText);
    this.tweens.add({
      targets: this.noticeText,
      scaleX: 1,
      scaleY: 1,
      alpha: { from: 1, to: 0 },
      duration: 1600,
      ease: 'Sine.easeOut',
    });
  }

  private beginRound() {
    this.round += 1;
    this.roundTarget = getRoundZombieCount(this.round);
    this.spawnedThisRound = 0;
    this.nextSpawnAt = this.time.now + getRoundWarmupMs(this.round);
    this.roundBreakUntil = 0;
    this.showNotice(`ROUND ${this.round}`, '#FFB36A');
    this.renderHud();
  }

  update(_time: number, delta: number) {
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.requestExit();
      return;
    }

    if (this.gameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
        this.scene.restart();
      }
      this.updatePromptHud({ kind: 'exit', x: EXIT_PAD.x, y: EXIT_PAD.y, radius: EXIT_PAD.radius, label: 'SPACE REINICIAR  |  ESC SALIR', color: 0xFF6A6A });
      this.renderHud();
      return;
    }

    this.handleMovement();
    this.handleCombatInput();
    this.handleRoundFlow();
    this.updateZombies(delta);
    this.updatePickups();
    this.handleContextInteraction();
    this.updatePromptHud(this.getNearbyInteraction());
    this.player.update(this.lastIsMoving, this.input.activePointer.worldX - this.px);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(Math.floor(this.py / 10));
    this.playerName.setPosition(this.px, this.py - 44);
    this.renderHud();
  }

  private handleMovement() {
    let dx = 0;
    let dy = 0;
    if (this.keyA.isDown) dx -= 1;
    if (this.keyD.isDown) dx += 1;
    if (this.keyW.isDown) dy -= 1;
    if (this.keyS.isDown) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
    }

    const speed = ZOMBIES_PLAYER.speed * (this.reloadEndsAt > this.time.now ? 0.78 : 1);
    const nextX = this.px + dx * speed * this.game.loop.delta / 1000;
    const nextY = this.py + dy * speed * this.game.loop.delta / 1000;
    const moved = this.tryMovePlayer(nextX, nextY);
    this.lastIsMoving = moved;
  }

  private tryMovePlayer(nextX: number, nextY: number) {
    const radius = ZOMBIES_PLAYER.radius;
    let moved = false;
    if (!this.isBlocked(nextX, this.py, radius)) {
      this.px = nextX;
      moved = true;
    }
    if (!this.isBlocked(this.px, nextY, radius)) {
      this.py = nextY;
      moved = true;
    }
    return moved;
  }

  private handleCombatInput() {
    if (this.reloadEndsAt > this.time.now) return;

    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      this.cycleWeapon();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
      this.tryReload();
    }

    const directKeys: Array<[Phaser.Input.Keyboard.Key, ZombiesWeaponId]> = [
      [this.keyOne, 'pistol'],
      [this.keyTwo, 'shotgun'],
      [this.keyThree, 'smg'],
      [this.keyFour, 'rifle'],
      [this.keyFive, 'raygun'],
    ];
    for (const [key, weaponId] of directKeys) {
      if (Phaser.Input.Keyboard.JustDown(key) && this.weaponInventory[weaponId].owned) {
        this.currentWeapon = weaponId;
        this.showNotice(`ARMADO ${ZOMBIES_WEAPONS[weaponId].label}`, '#7CC9FF');
      }
    }
  }

  private tryShoot(targetX: number, targetY: number) {
    if (this.gameOver) return;
    if (this.reloadEndsAt > this.time.now) return;

    const weapon = ZOMBIES_WEAPONS[this.currentWeapon];
    const ammo = this.weaponInventory[this.currentWeapon];
    if (this.time.now - this.lastShotAt < weapon.fireDelayMs) return;
    if (ammo.ammoInMag <= 0) {
      this.tryReload();
      return;
    }

    ammo.ammoInMag -= 1;
    this.lastShotAt = this.time.now;
    const baseAngle = Phaser.Math.Angle.Between(this.px, this.py, targetX, targetY);

    for (let i = 0; i < weapon.pellets; i += 1) {
      const angle = baseAngle + Phaser.Math.FloatBetween(-weapon.spread, weapon.spread);
      const hit = this.findZombieTarget(angle, weapon.range);
      const endX = hit ? hit.x : this.px + Math.cos(angle) * weapon.range;
      const endY = hit ? hit.y : this.py + Math.sin(angle) * weapon.range;
      this.drawShotFx(endX, endY, weapon.color);
      if (hit) {
        this.damageZombie(hit, weapon.damage);
      }
    }

    if (ammo.ammoInMag <= 0 && ammo.reserveAmmo > 0) {
      this.time.delayedCall(140, () => this.tryReload());
    }
  }

  private tryReload() {
    const ammo = this.weaponInventory[this.currentWeapon];
    const weapon = ZOMBIES_WEAPONS[this.currentWeapon];
    if (this.reloadEndsAt > this.time.now) return;
    if (ammo.reserveAmmo <= 0 || ammo.ammoInMag >= weapon.magazineSize) return;

    const reloadingWeaponId = this.currentWeapon;
    this.reloadEndsAt = this.time.now + weapon.reloadMs;
    this.showNotice(`RECARGANDO ${weapon.label}`, '#9EFFB7');
    this.time.delayedCall(weapon.reloadMs, () => {
      const currentAmmo = this.weaponInventory[reloadingWeaponId];
      const currentWeapon = ZOMBIES_WEAPONS[reloadingWeaponId];
      const needed = currentWeapon.magazineSize - currentAmmo.ammoInMag;
      const moved = Math.min(needed, currentAmmo.reserveAmmo);
      currentAmmo.ammoInMag += moved;
      currentAmmo.reserveAmmo -= moved;
      this.reloadEndsAt = 0;
      this.renderHud();
    });
  }

  private cycleWeapon() {
    const available = this.weaponOrder.filter((id) => this.weaponInventory[id].owned);
    if (available.length <= 1) return;
    const index = available.indexOf(this.currentWeapon);
    const next = available[(index + 1) % available.length];
    this.currentWeapon = next;
    this.showNotice(`ARMADO ${ZOMBIES_WEAPONS[next].label}`, '#7CC9FF');
  }

  private drawShotFx(endX: number, endY: number, color: number) {
    const tracer = this.add.line(0, 0, this.px, this.py - 8, endX, endY, color, 0.9).setOrigin(0, 0).setDepth(160);
    tracer.setLineWidth(2, 2);
    const flash = this.add.circle(this.px, this.py - 10, 8, color, 0.8).setDepth(170);
    this.tweens.add({ targets: tracer, alpha: 0, duration: 90, onComplete: () => tracer.destroy() });
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.9, duration: 110, onComplete: () => flash.destroy() });
  }

  private findZombieTarget(angle: number, maxRange: number) {
    let best: ZombieState | null = null;
    let bestAlong = Number.POSITIVE_INFINITY;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const zombie of this.zombies.values()) {
      if (!zombie.alive) continue;
      const dx = zombie.x - this.px;
      const dy = zombie.y - this.py;
      const along = dx * cos + dy * sin;
      if (along <= 0 || along > maxRange) continue;
      const perp = Math.abs(-sin * dx + cos * dy);
      if (perp > zombie.radius + 10) continue;
      if (this.isLineBlocked(this.px, this.py, zombie.x, zombie.y)) continue;
      if (along < bestAlong) {
        best = zombie;
        bestAlong = along;
      }
    }

    return best;
  }

  private handleRoundFlow() {
    const concurrentCap = getRoundConcurrentCap(this.round);
    if (this.spawnedThisRound < this.roundTarget) {
      if (this.time.now >= this.nextSpawnAt && this.countAliveZombies() < concurrentCap) {
        const spawned = this.spawnZombie();
        if (spawned) {
          this.spawnedThisRound += 1;
          this.nextSpawnAt = this.time.now + getSpawnDelayForRound(this.round) + Phaser.Math.Between(-60, 90);
        } else {
          this.nextSpawnAt = this.time.now + 180;
        }
      }
      return;
    }

    if (this.countAliveZombies() === 0 && this.roundBreakUntil === 0) {
      this.roundBreakUntil = this.time.now + ZOMBIES_POINTS.roundBreakMs;
      this.showNotice(`LIMPIASTE LA RONDA ${this.round}`, '#9EFFB7');
    }

    if (this.roundBreakUntil !== 0 && this.time.now >= this.roundBreakUntil) {
      this.beginRound();
    }
  }

  private countAliveZombies() {
    let alive = 0;
    for (const zombie of this.zombies.values()) {
      if (zombie.alive) alive += 1;
    }
    return alive;
  }

  private pickZombieType(): ZombieType {
    const eligible = getEligibleZombieTypes(this.round);
    const roll = Phaser.Math.Between(0, 99);
    if (this.round >= 6 && roll > 78) return 'brute';
    if (this.round >= 3 && roll > 52) return 'runner';
    return eligible.some((z) => z.type === 'walker') ? 'walker' : eligible[0].type;
  }

  private getUnlockedSections() {
    return ZOMBIES_SECTIONS.filter((section) => section.unlockedByDefault || this.doors.get(section.id)?.unlocked);
  }

  private getAvailableSpawnNodes() {
    const unlockedSectionIds = new Set(this.getUnlockedSections().map((section) => section.id));
    const nodes = [...this.spawnNodes.values()].filter((node) => !node.occupiedBy && unlockedSectionIds.has(node.sectionId));
    const distant = nodes.filter((node) => Phaser.Math.Distance.Between(this.px, this.py, node.x, node.y) >= 240);
    const pool = distant.length ? distant : nodes;
    return pool.sort((a, b) => {
      if (a.boardHealth !== b.boardHealth) return a.boardHealth - b.boardHealth;
      return a.lastUsedAt - b.lastUsedAt;
    });
  }

  private spawnZombie() {
    const candidates = this.getAvailableSpawnNodes();
    if (!candidates.length) return false;

    const shortestAge = candidates[0]?.lastUsedAt ?? 0;
    const freshestAllowed = shortestAge + 1600;
    const filtered = candidates.filter((node) => node.lastUsedAt <= freshestAllowed);
    const node = Phaser.Utils.Array.GetRandom(filtered.length ? filtered : candidates);
    const type = this.pickZombieType();
    const config = ZOMBIE_TYPES[type];
    const hp = getZombieHpForRound(config.baseHp, this.round);
    const speed = getZombieSpeedForRound(config.speed, this.round);
    const radius = type === 'brute' ? 22 : type === 'runner' ? 15 : 18;
    const breachMs = getZombieBreachMs(this.round, type);

    const shadow = this.add.ellipse(node.x, node.y + radius + 8, radius + 14, 14, 0x000000, 0.28);
    const fallbackTexture = this.getZombieFallbackTexture(type);
    const idleTexture = this.getZombieTextureKey(type, 'idle');
    const body = this.add.sprite(0, 0, this.textures.exists(idleTexture) ? idleTexture : fallbackTexture, 0);
    body.setOrigin(0.5, 0.7);
    body.setScale(type === 'brute' ? 1.15 : type === 'runner' ? 0.95 : 1);
    const hpBg = this.add.rectangle(0, -radius - 14, radius * 2, 4, 0x000000, 0.9);
    const hpFill = this.add.rectangle(-radius, -radius - 14, radius * 2, 4, 0x39FF14, 0.95).setOrigin(0, 0.5);
    const label = this.add.text(0, -radius - 26, config.label, {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    const container = this.add.container(node.x, node.y, [body, hpBg, hpFill, label]);
    shadow.setDepth(29);
    container.setDepth(30);

    const zombie: ZombieState = {
      id: `z_${this.zombieIdSeq += 1}`,
      type,
      container,
      body,
      label,
      hpBg,
      hpFill,
      shadow,
      x: node.x,
      y: node.y,
      hp,
      maxHp: hp,
      speed,
      damage: config.damage,
      attackRange: config.attackRange,
      attackCooldownMs: config.attackCooldownMs,
      hitReward: config.hitReward,
      killReward: config.killReward,
      radius,
      state: 'walk',
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      alive: true,
      lastAttackAt: 0,
      spawnNodeId: node.id,
      breachEndsAt: this.time.now + breachMs,
      lastStompAt: this.time.now,
      lastAnimatedState: undefined,
    };

    node.occupiedBy = zombie.id;
    node.lastUsedAt = this.time.now;
    this.refreshSpawnNodeVisual(node, 0, true);
    this.zombies.set(zombie.id, zombie);
    this.showNotice(`BREACH ${config.label}`, '#FF8B3D');
    return true;
  }

  private updateZombies(delta: number) {
    const dt = delta / 1000;
    for (const zombie of this.zombies.values()) {
      if (!zombie.alive) continue;
      if (zombie.spawnNodeId) {
        const node = this.spawnNodes.get(zombie.spawnNodeId);
        if (node) {
          if (this.time.now - zombie.lastStompAt >= 220) {
            zombie.lastStompAt = this.time.now;
            this.refreshSpawnNodeVisual(node, Phaser.Math.Clamp(1 - (zombie.breachEndsAt - this.time.now) / getZombieBreachMs(this.round, zombie.type), 0, 1), true);
            const stompFx = this.add.rectangle(node.x, node.y - 4, 42, 52, 0xFF8B3D, 0.16).setDepth(19);
            this.tweens.add({
              targets: stompFx,
              alpha: 0,
              scaleX: 1.06,
              scaleY: 1.04,
              duration: 120,
              onComplete: () => stompFx.destroy(),
            });
          }
          zombie.container.setPosition(node.x, node.y + Math.sin(this.time.now / 90 + zombie.phase) * 2);
          zombie.shadow.setPosition(node.x, node.y + zombie.radius + 8);
        }
        this.setZombieState(zombie, 'spawn');
        this.renderZombieHp(zombie);
        if (this.time.now >= zombie.breachEndsAt) {
          if (node) {
            node.boardHealth = 0;
          }
          this.releaseSpawnNode(zombie, false);
        }
        continue;
      }

      const dx = this.px - zombie.x;
      const dy = this.py - zombie.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      if (dist > zombie.attackRange + 2) {
        const lateral = Math.sin(this.time.now / 320 + zombie.phase) * (zombie.type === 'runner' ? 0.42 : zombie.type === 'brute' ? 0.08 : 0.22);
        const moveX = (nx - ny * lateral) * zombie.speed * 60 * dt;
        const moveY = (ny + nx * lateral) * zombie.speed * 60 * dt;
        const nextX = zombie.x + moveX;
        const nextY = zombie.y + moveY;
        if (!this.isBlocked(nextX, zombie.y, zombie.radius)) zombie.x = nextX;
        if (!this.isBlocked(zombie.x, nextY, zombie.radius)) zombie.y = nextY;
        zombie.state = 'walk';
      } else {
        zombie.state = 'attack';
        if (this.time.now - zombie.lastAttackAt >= zombie.attackCooldownMs) {
          zombie.lastAttackAt = this.time.now;
          this.applyPlayerDamage(zombie.damage);
        }
      }

      zombie.container.setPosition(zombie.x, zombie.y);
      zombie.shadow.setPosition(zombie.x, zombie.y + zombie.radius + 8);
      zombie.container.setDepth(Math.floor(zombie.y / 10));
      zombie.shadow.setDepth(zombie.container.depth - 1);
      this.renderZombieHp(zombie);
      this.setZombieState(zombie, zombie.state);
    }
  }

  private releaseSpawnNode(zombie: ZombieState, resetBoards: boolean) {
    if (!zombie.spawnNodeId) return;
    const node = this.spawnNodes.get(zombie.spawnNodeId);
    zombie.spawnNodeId = undefined;
    if (!node) return;

    node.occupiedBy = undefined;
    if (resetBoards) {
      this.refreshSpawnNodeVisual(node, 0, false);
    } else {
      this.refreshSpawnNodeVisual(node, 1, false);
      this.time.delayedCall(650, () => {
        if (!node.occupiedBy) {
          this.refreshSpawnNodeVisual(node, 0, false);
        }
      });
    }
  }

  private renderZombieHp(zombie: ZombieState) {
    const progress = Phaser.Math.Clamp(zombie.hp / zombie.maxHp, 0, 1);
    zombie.hpFill.width = zombie.radius * 2 * progress;
    zombie.hpFill.setFillStyle(progress > 0.45 ? 0x39FF14 : progress > 0.2 ? 0xF5C842 : 0xFF5E5E, 0.95);
  }

  private setZombieState(zombie: ZombieState, state: ZombieAnimState) {
    zombie.state = state;
    const bob = state === 'walk'
      ? Math.sin(this.time.now / 110 + zombie.phase) * 2.4
      : state === 'attack'
        ? Math.sin(this.time.now / 60 + zombie.phase) * 1.6
        : state === 'spawn'
          ? Math.sin(this.time.now / 70 + zombie.phase) * 1.2
          : 0;
    zombie.body.setY(bob);
    zombie.label.setAlpha(state === 'death' ? 0 : 1);
    zombie.body.setScale(
      state === 'hurt'
        ? 1.06
        : state === 'attack'
          ? 1.04
          : state === 'spawn'
            ? 1.02
            : 1,
    );
    zombie.body.setFlipX(this.px < zombie.x);

    const animState = state === 'spawn' ? 'attack' : state;
    if (zombie.lastAnimatedState !== animState) {
      const textureKey = this.getZombieTextureKey(zombie.type, animState);
      const fallbackTexture = this.getZombieFallbackTexture(zombie.type);
      safePlaySpriteAnimation(
        this,
        zombie.body,
        `zs_${ZOMBIE_TYPES[zombie.type].folder}_${animState}`,
        textureKey,
        fallbackTexture,
      );
      zombie.lastAnimatedState = animState;
    }
  }

  private damageZombie(zombie: ZombieState, damage: number) {
    if (!zombie.alive) return;
    const appliedDamage = this.instaKillUntil > this.time.now ? zombie.hp : damage;
    zombie.hp -= appliedDamage;
    zombie.state = 'hurt';
    this.points += zombie.hitReward;
    this.showFloatingText(`+${zombie.hitReward}`, zombie.x, zombie.y - 18, '#F5C842');
    if (zombie.hp > 0) return;

    zombie.alive = false;
    this.releaseSpawnNode(zombie, true);
    this.points += zombie.killReward;
    zombie.container.setAlpha(0);
    zombie.shadow.setAlpha(0);
    this.showFloatingText(`+${zombie.killReward} ${ZOMBIE_TYPES[zombie.type].label}`, zombie.x, zombie.y - 34, '#9EFFB7');
    this.tryDropPickup(zombie.x, zombie.y);
    const burst = this.add.circle(zombie.x, zombie.y - 8, zombie.radius + 8, 0xFF6A6A, 0.26).setDepth(80);
    this.tweens.add({ targets: burst, alpha: 0, scale: 1.9, duration: 220, onComplete: () => burst.destroy() });
    this.time.delayedCall(180, () => {
      zombie.container.destroy();
      zombie.shadow.destroy();
      this.zombies.delete(zombie.id);
    });
  }

  private showFloatingText(text: string, x: number, y: number, color: string) {
    const label = this.add.text(x, y, text, {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(300);
    this.tweens.add({
      targets: label,
      y: y - 24,
      alpha: 0,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private applyPlayerDamage(amount: number) {
    if (this.time.now - this.lastDamageAt < 320) return;
    this.lastDamageAt = this.time.now;
    this.hp = Math.max(0, this.hp - amount);
    this.showFloatingText(`-${amount}`, this.px, this.py - 52, '#FF6A6A');
    this.cameras.main.shake(90, 0.0028);
    if (this.hp > 0) return;

    this.gameOver = true;
    this.showNotice('GAME OVER - SPACE REINICIAR', '#FF6A6A');
  }

  private handleContextInteraction() {
    if (!Phaser.Input.Keyboard.JustDown(this.keyE)) return;
    const option = this.getNearbyInteraction();
    if (!option) return;

    if (option.kind === 'exit') {
      this.requestExit();
      return;
    }
    if (option.kind === 'door' && option.sectionId) {
      this.tryUnlockDoor(option.sectionId);
      return;
    }
    if (option.kind === 'box') {
      this.tryRollMysteryBox();
      return;
    }
    if (option.kind === 'repair' && option.nodeId) {
      this.tryRepairBarricade(option.nodeId);
    }
  }

  private getNearbyInteraction(): InteractionOption | null {
    const options: InteractionOption[] = [];

    if (Phaser.Math.Distance.Between(this.px, this.py, EXIT_PAD.x, EXIT_PAD.y) <= EXIT_PAD.radius + 24) {
      options.push({ kind: 'exit', x: EXIT_PAD.x, y: EXIT_PAD.y, radius: EXIT_PAD.radius + 18, label: 'E VOLVER A LA PLAZA', color: 0x39FF14 });
    }

    const boxRadius = 74;
    if (Phaser.Math.Distance.Between(this.px, this.py, BOX_POS.x, BOX_POS.y) <= boxRadius) {
      const cooldown = Math.max(0, Math.ceil((this.mysteryBoxCooldownUntil - this.time.now) / 1000));
      options.push({
        kind: 'box',
        x: BOX_POS.x,
        y: BOX_POS.y + 8,
        radius: 56,
        label: cooldown > 0 ? `BOX RECARGA ${cooldown}s` : `E MYSTERY BOX ${ZOMBIES_POINTS.mysteryBoxCost} PTS`,
        color: 0xFF7CCE,
      });
    }

    for (const [sectionId, door] of this.doors.entries()) {
      if (door.unlocked || !door.rect) continue;
      const expandedDoor = new Phaser.Geom.Rectangle(door.rect.x - 35, door.rect.y - 35, door.rect.width + 70, door.rect.height + 70);
      const nearDoor = Phaser.Geom.Rectangle.Contains(expandedDoor, this.px, this.py);
      if (!nearDoor) continue;
      options.push({
        kind: 'door',
        x: door.panel.x,
        y: door.panel.y,
        radius: Math.max(door.panel.width, door.panel.height) / 2,
        label: `E ABRIR ${ZOMBIES_SECTIONS.find((section) => section.id === sectionId)?.label} ${door.cost} PTS`,
        color: 0xF5C842,
        sectionId,
      });
    }

    for (const node of this.spawnNodes.values()) {
      if (node.occupiedBy || node.boardHealth >= node.maxBoards) continue;
      const distance = Phaser.Math.Distance.Between(this.px, this.py, node.x, node.y);
      if (distance > 78) continue;
      options.push({
        kind: 'repair',
        x: node.x,
        y: node.y,
        radius: 44,
        label: `E REPAIR BARRICADE +20 PTS`,
        color: 0x46B3FF,
        nodeId: node.id,
      });
    }

    if (!options.length) return null;
    return options.sort((a, b) => Phaser.Math.Distance.Between(this.px, this.py, a.x, a.y) - Phaser.Math.Distance.Between(this.px, this.py, b.x, b.y))[0];
  }

  private updatePromptHud(option: InteractionOption | null) {
    if (!this.activePrompt || !this.promptGlow) return;
    this.promptGlow.clear();
    if (!option) {
      this.activePrompt.setAlpha(0);
      return;
    }

    const screen = this.cameras.main.worldView;
    const screenX = option.x - screen.x;
    const screenY = option.y - screen.y;
    const pulse = 0.18 + ((Math.sin(this.time.now / 180) + 1) * 0.1);
    this.promptGlow.lineStyle(2, option.color, 0.85);
    this.promptGlow.strokeCircle(screenX, screenY, option.radius);
    this.promptGlow.fillStyle(option.color, pulse);
    this.promptGlow.fillCircle(screenX, screenY, option.radius - 6);
    const color = Phaser.Display.Color.IntegerToColor(option.color);
    this.activePrompt.setText(option.label);
    this.activePrompt.setColor(`rgb(${color.red}, ${color.green}, ${color.blue})`);
    this.activePrompt.setAlpha(1);
  }

  private tryUnlockDoor(doorId: ZombiesSectionId) {
    const door = this.doors.get(doorId);
    if (!door || door.unlocked) return;
    if (this.points < door.cost) {
      this.showNotice('NO ALCANZA EL PUNTAJE', '#FF6A6A');
      return;
    }

    this.points -= door.cost;
    door.unlocked = true;
    door.panel.setFillStyle(0x1A3525, 0.88);
    door.panel.setStrokeStyle(2, 0x39FF14, 0.72);
    door.label.setText('ABIERTO');
    door.label.setColor('#9EFFB7');
    door.costText.setText('ACCESO');
    door.costText.setColor('#39FF14');
    door.rect = undefined;
    this.showNotice(`ABRISTE ${ZOMBIES_SECTIONS.find((section) => section.id === doorId)?.label}`, '#9EFFB7');
  }

  private tryRollMysteryBox() {
    if (this.time.now < this.mysteryBoxCooldownUntil) {
      this.showNotice('LA BOX ESTA GIRANDO', '#FF7CCE');
      return;
    }
    if (this.points < ZOMBIES_POINTS.mysteryBoxCost) {
      this.showNotice('NO ALCANZAN LOS PTS', '#FF6A6A');
      return;
    }

    this.points -= ZOMBIES_POINTS.mysteryBoxCost;
    this.mysteryBoxCooldownUntil = this.time.now + 2200;
    const weaponId = this.rollMysteryWeapon();
    const ammo = this.weaponInventory[weaponId];
    const config = ZOMBIES_WEAPONS[weaponId];
    const firstTime = !ammo.owned;
    ammo.owned = true;
    ammo.ammoInMag = config.magazineSize;
    ammo.reserveAmmo = Math.max(ammo.reserveAmmo, config.reserveAmmo);
    if (!this.weaponOrder.includes(weaponId)) {
      this.weaponOrder.push(weaponId);
    }
    this.currentWeapon = weaponId;
    this.showNotice(firstTime ? `BOX: ${config.label}` : `BOX REFILL ${config.label}`, '#FF7CCE');
  }

  private tryRepairBarricade(nodeId: string) {
    const node = this.spawnNodes.get(nodeId);
    if (!node || node.occupiedBy || node.boardHealth >= node.maxBoards) return;

    node.boardHealth += 1;
    this.points += 20;
    this.refreshSpawnNodeVisual(node, 0, false);
    this.showFloatingText('+20 REPAIR', node.x, node.y - 30, '#46B3FF');
    this.showNotice('BARRICADE REPAIRED', '#7CC9FF');
  }

  private tryDropPickup(x: number, y: number) {
    if (this.pickups.size >= 2) return;
    const dropRoll = Phaser.Math.FloatBetween(0, 1);
    let kind: PickupKind | null = null;
    if (dropRoll <= 0.035) kind = 'max_ammo';
    else if (dropRoll <= 0.055) kind = 'insta_kill';
    if (!kind) return;

    const glowColor = kind === 'max_ammo' ? 0x46B3FF : 0xFF3344;
    const labelColor = kind === 'max_ammo' ? '#7CC9FF' : '#FF6A6A';
    const labelText = kind === 'max_ammo' ? 'MAX AMMO' : 'INSTA-KILL';
    const id = `pickup_${++this.pickupIdSeq}`;
    const glow = this.add.ellipse(x, y + 6, 52, 20, glowColor, 0.12).setDepth(90);
    glow.setStrokeStyle(1, glowColor, 0.45);
    const body = this.add.rectangle(x, y - 8, 24, 24, glowColor, 0.8).setDepth(91);
    body.setStrokeStyle(2, 0xffffff, 0.7);
    const label = this.add.text(x, y - 32, labelText, {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: labelColor,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(92);

    this.tweens.add({
      targets: [glow, body],
      alpha: { from: 0.82, to: 1 },
      scaleX: { from: 0.96, to: 1.05 },
      scaleY: { from: 0.96, to: 1.05 },
      yoyo: true,
      repeat: -1,
      duration: 620,
      ease: 'Sine.easeInOut',
    });

    this.pickups.set(id, {
      id,
      kind,
      x,
      y,
      glow,
      body,
      label,
      expiresAt: this.time.now + 12000,
    });
  }

  private updatePickups() {
    for (const pickup of [...this.pickups.values()]) {
      const pulse = Math.sin(this.time.now / 140 + pickup.x * 0.01) * 3;
      pickup.body.setY(pickup.y - 8 + pulse);
      pickup.label.setY(pickup.y - 32 + pulse * 0.5);
      pickup.glow.setY(pickup.y + 6);

      if (this.time.now >= pickup.expiresAt) {
        this.destroyPickup(pickup.id);
        continue;
      }

      if (Phaser.Math.Distance.Between(this.px, this.py, pickup.x, pickup.y) <= 34) {
        this.collectPickup(pickup);
      }
    }
  }

  private collectPickup(pickup: PickupState) {
    if (pickup.kind === 'max_ammo') {
      for (const weaponId of this.weaponOrder) {
        const weapon = ZOMBIES_WEAPONS[weaponId];
        const ammo = this.weaponInventory[weaponId];
        ammo.ammoInMag = weapon.magazineSize;
        ammo.reserveAmmo = Math.max(ammo.reserveAmmo, weapon.reserveAmmo);
      }
      this.showNotice('MAX AMMO', '#46B3FF');
    } else if (pickup.kind === 'insta_kill') {
      this.instaKillUntil = this.time.now + 12000;
      this.showNotice('INSTA-KILL', '#FF6A6A');
    }

    this.showFloatingText(pickup.kind === 'max_ammo' ? 'MAX AMMO' : 'INSTA-KILL', pickup.x, pickup.y - 26, pickup.kind === 'max_ammo' ? '#7CC9FF' : '#FF6A6A');
    this.destroyPickup(pickup.id);
  }

  private destroyPickup(id: string) {
    const pickup = this.pickups.get(id);
    if (!pickup) return;
    pickup.glow.destroy();
    pickup.body.destroy();
    pickup.label.destroy();
    this.pickups.delete(id);
  }

  private rollMysteryWeapon(): ZombiesWeaponId {
    const pool = Object.values(ZOMBIES_WEAPONS).filter((weapon) => weapon.mysteryWeight > 0);
    const total = pool.reduce((sum, weapon) => sum + weapon.mysteryWeight, 0);
    let roll = Phaser.Math.Between(1, total);
    for (const weapon of pool) {
      roll -= weapon.mysteryWeight;
      if (roll <= 0) return weapon.id;
    }
    return 'shotgun';
  }

  private isBlocked(x: number, y: number, radius: number) {
    if (x - radius < WALL_THICKNESS || y - radius < WALL_THICKNESS || x + radius > ZOMBIES_WORLD.WIDTH - WALL_THICKNESS || y + radius > ZOMBIES_WORLD.HEIGHT - WALL_THICKNESS) {
      return true;
    }

    const circleRectOverlap = (rect: Phaser.Geom.Rectangle) => {
      const closestX = Phaser.Math.Clamp(x, rect.left, rect.right);
      const closestY = Phaser.Math.Clamp(y, rect.top, rect.bottom);
      const dx = x - closestX;
      const dy = y - closestY;
      return (dx * dx + dy * dy) < radius * radius;
    };

    for (const obstacle of this.obstacles) {
      if (circleRectOverlap(obstacle.rect)) return true;
    }
    for (const door of this.doors.values()) {
      if (!door.unlocked && door.rect && circleRectOverlap(door.rect)) return true;
    }
    return false;
  }

  private isLineBlocked(x1: number, y1: number, x2: number, y2: number) {
    const line = new Phaser.Geom.Line(x1, y1, x2, y2);
    const edgesFor = (rect: Phaser.Geom.Rectangle) => ([
      new Phaser.Geom.Line(rect.left, rect.top, rect.right, rect.top),
      new Phaser.Geom.Line(rect.right, rect.top, rect.right, rect.bottom),
      new Phaser.Geom.Line(rect.right, rect.bottom, rect.left, rect.bottom),
      new Phaser.Geom.Line(rect.left, rect.bottom, rect.left, rect.top),
    ]);

    const testRect = (rect: Phaser.Geom.Rectangle) => {
      if (Phaser.Geom.Rectangle.Contains(rect, x1, y1) || Phaser.Geom.Rectangle.Contains(rect, x2, y2)) return false;
      return edgesFor(rect).some((edge) => Phaser.Geom.Intersects.LineToLine(line, edge));
    };

    for (const obstacle of this.obstacles) {
      if (testRect(obstacle.rect)) return true;
    }
    for (const door of this.doors.values()) {
      if (!door.unlocked && door.rect && testRect(door.rect)) return true;
    }
    return false;
  }

  private requestExit() {
    transitionToScene(this, 'WorldScene', {
      returnX: PLAYER_RETURN.x,
      returnY: PLAYER_RETURN.y,
    });
  }

  private handleShutdown() {
    if (this.pointerDownHandler) {
      this.input.off('pointerdown', this.pointerDownHandler);
      this.pointerDownHandler = undefined;
    }
  }
}




