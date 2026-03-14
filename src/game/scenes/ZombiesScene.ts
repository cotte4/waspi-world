import Phaser from 'phaser';
import { eventBus, EVENTS } from '../config/eventBus';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { announceScene, createBackButton, transitionToScene } from '../systems/SceneUi';
import {
  DEFAULT_ZOMBIES_MAP_ID,
  getBossZombieForMap,
  getNextZombieMapId,
  getZombieMapConfig,
  getZombieTypeConfig,
  loadZombiesMapUnlocks,
  getEligibleZombieTypes,
  getRoundConcurrentCap,
  getRoundZombieCount,
  getSpawnDelayForRound,
  getZombieHpForRound,
  getZombieSpeedForRound,
  isBossRound,
  unlockZombiesMap,
  type ArenaObstacleConfig,
  type SectionConfig,
  type ZombiesMapId,
  type ZombiesMapUnlocks,
  type ZombiesMapConfig,
  type ZombieConfig,
  type ZombieType,
  type ZombiesSectionId,
  type ZombiesWeaponConfig,
  type ZombiesWeaponId,
  ZOMBIES_PLAYER,
  ZOMBIES_POINTS,
  ZOMBIES_VIEWPORT,
  ZOMBIES_WEAPONS,
  ZOMBIES_WORLD,
} from '../config/zombies';

type ZombiesBody = Phaser.GameObjects.Arc & { body: Phaser.Physics.Arcade.Body };

type DoorState = {
  config: SectionConfig;
  unlocked: boolean;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

type ObstacleRect = ArenaObstacleConfig;

type ZombieAnimState = 'spawn' | 'walk' | 'attack' | 'hurt' | 'death';

type ZombieState = {
  id: string;
  type: ZombieType;
  config: ZombieConfig;
  body: ZombiesBody;
  hpBar: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  alive: boolean;
  state: ZombieAnimState;
  nextStateAt: number;
  lastAttackAt: number;
  deathAt: number;
  attackCooldownMs: number;
  finalPhaseTriggered: boolean;
  fuseAt: number;
};

type WeaponInventory = {
  owned: boolean;
  magazine: number;
  reserve: number;
};

type InteractionOption =
  | { kind: 'door'; doorId: ZombiesSectionId; label: string; x: number; y: number; color: string }
  | { kind: 'box'; label: string; x: number; y: number; color: string }
  | { kind: 'exit'; label: string; x: number; y: number; color: string };

const BOX_POS = { x: 445, y: 585 };
const EXIT_PAD = { x: 192, y: 560, w: 76, h: 76 };
const PLAYER_RETURN = { returnX: 920, returnY: 1000 };
const WALL_THICKNESS = 42;

export class ZombiesScene extends Phaser.Scene {
  private px: number = ZOMBIES_PLAYER.startX;
  private py: number = ZOMBIES_PLAYER.startY;
  private playerAvatar!: AvatarRenderer;
  private playerBody!: Phaser.GameObjects.Rectangle;
  private playerName!: Phaser.GameObjects.Text;
  private hp: number = ZOMBIES_PLAYER.maxHp;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyOne!: Phaser.Input.Keyboard.Key;
  private keyTwo!: Phaser.Input.Keyboard.Key;

  private currentWeapon: ZombiesWeaponId = 'pistol';
  private weaponInventory: Record<ZombiesWeaponId, WeaponInventory> = {
    pistol: { owned: true, magazine: ZOMBIES_WEAPONS.pistol.magazineSize, reserve: ZOMBIES_WEAPONS.pistol.reserveAmmo },
    shotgun: { owned: false, magazine: 0, reserve: 0 },
    smg: { owned: false, magazine: 0, reserve: 0 },
    rifle: { owned: false, magazine: 0, reserve: 0 },
    raygun: { owned: false, magazine: 0, reserve: 0 },
  };
  private lastShotAt = 0;
  private reloadingUntil = 0;

  private round = 0;
  private points = ZOMBIES_POINTS.start;
  private zombiesToSpawn = 0;
  private zombiesSpawned = 0;
  private nextSpawnAt = 0;
  private inRound = false;
  private betweenRoundsUntil = 0;
  private gameOver = false;
  private mapCompleted = false;
  private currentMapId: ZombiesMapId = DEFAULT_ZOMBIES_MAP_ID;
  private currentMap!: ZombiesMapConfig;
  private unlockedMaps: ZombiesMapUnlocks = loadZombiesMapUnlocks();
  private showMapSelectOnCreate = true;
  private mapSelectOpen = false;
  private mapSelectHud?: Phaser.GameObjects.Container;

  private zombies = new Map<string, ZombieState>();
  private spawnSerial = 0;
  private obstacles: ObstacleRect[] = [];
  private doors = new Map<ZombiesSectionId, DoorState>();

  private roundHud?: Phaser.GameObjects.Text;
  private weaponHud?: Phaser.GameObjects.Text;
  private hpHud?: Phaser.GameObjects.Text;
  private promptHud?: Phaser.GameObjects.Text;
  private noticeHud?: Phaser.GameObjects.Text;
  private bossPhaseHud?: Phaser.GameObjects.Text;
  private interactionGlow?: Phaser.GameObjects.Graphics;
  private boxHint?: Phaser.GameObjects.Text;

  private mysteryRollingUntil = 0;

  constructor() {
    super({ key: 'ZombiesScene' });
  }

  init(data?: { mapId?: ZombiesMapId }) {
    this.unlockedMaps = loadZombiesMapUnlocks();
    this.showMapSelectOnCreate = !data?.mapId;
    const requestedMapId = data?.mapId ?? DEFAULT_ZOMBIES_MAP_ID;
    this.currentMapId = this.unlockedMaps[requestedMapId] ? requestedMapId : DEFAULT_ZOMBIES_MAP_ID;
    this.currentMap = getZombieMapConfig(this.currentMapId);
  }

  private resetRunState() {
    this.px = ZOMBIES_PLAYER.startX;
    this.py = ZOMBIES_PLAYER.startY;
    this.hp = ZOMBIES_PLAYER.maxHp;
    this.currentWeapon = 'pistol';
    this.weaponInventory = {
      pistol: { owned: true, magazine: ZOMBIES_WEAPONS.pistol.magazineSize, reserve: ZOMBIES_WEAPONS.pistol.reserveAmmo },
      shotgun: { owned: false, magazine: 0, reserve: 0 },
      smg: { owned: false, magazine: 0, reserve: 0 },
      rifle: { owned: false, magazine: 0, reserve: 0 },
      raygun: { owned: false, magazine: 0, reserve: 0 },
    };
    this.lastShotAt = 0;
    this.reloadingUntil = 0;
    this.round = 0;
    this.points = ZOMBIES_POINTS.start;
    this.zombiesToSpawn = 0;
    this.zombiesSpawned = 0;
    this.nextSpawnAt = 0;
    this.inRound = false;
    this.betweenRoundsUntil = 0;
    this.gameOver = false;
    this.mapCompleted = false;
    this.zombies.clear();
    this.spawnSerial = 0;
    this.obstacles = [];
    this.doors.clear();
    this.mysteryRollingUntil = 0;
    this.mapSelectOpen = false;
    this.mapSelectHud?.destroy();
    this.mapSelectHud = undefined;
  }

  create() {
    this.resetRunState();
    this.unlockedMaps = loadZombiesMapUnlocks();
    if (!this.currentMap || !this.unlockedMaps[this.currentMapId]) {
      this.currentMapId = DEFAULT_ZOMBIES_MAP_ID;
      this.currentMap = getZombieMapConfig(this.currentMapId);
    }
    announceScene(this);
    this.input.enabled = true;
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(220, 0, 0, 0);

    this.buildArena();
    this.setupPlayer();
    this.setupInput();
    this.setupHud();
    this.setupDoors();
    this.setupMysteryBox();

    this.cameras.main.setBounds(0, 0, ZOMBIES_WORLD.WIDTH, ZOMBIES_WORLD.HEIGHT);
    this.cameras.main.startFollow(this.playerBody, true, 0.08, 0.08);

    createBackButton(this, () => {
      if (this.inRound && !this.gameOver && !this.mapCompleted) return;
      transitionToScene(this, 'WorldScene', PLAYER_RETURN);
    }, 'PLAZA');

    if (this.showMapSelectOnCreate && this.unlockedMaps.map2) {
      this.showMapSelection();
    } else {
      this.beginRound(1);
    }
  }

  private buildArena() {
    const bg = this.add.graphics().setDepth(-20);
    bg.fillStyle(0x0A0A0F, 1);
    bg.fillRect(0, 0, ZOMBIES_WORLD.WIDTH, ZOMBIES_WORLD.HEIGHT);
    bg.fillStyle(0x14141C, 1);
    bg.fillRect(70, 330, 1600, 770);
    bg.lineStyle(2, 0x3A3A48, 0.6);
    bg.strokeRect(70, 330, 1600, 770);

    for (const section of this.currentMap.sections) {
      bg.fillStyle(section.unlockedByDefault ? 0x161A22 : 0x111116, 0.95);
      bg.fillRect(section.x, section.y, section.w, section.h);
      bg.lineStyle(2, section.unlockedByDefault ? 0x4E6C8D : 0x5B2C2C, 0.5);
      bg.strokeRect(section.x, section.y, section.w, section.h);
      this.add.text(section.x + 16, section.y + 14, section.label, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: section.unlockedByDefault ? '#7DA6D8' : '#AA6666',
      }).setDepth(2);
    }

    this.add.text(950, 120, this.currentMap.label, {
      fontSize: '20px',
      fontFamily: '"Press Start 2P", monospace',
      color: this.currentMap.titleColor,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12000);

    this.add.text(950, 156, this.currentMap.subtitle, {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#8892A0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12000);

    this.drawExitPad();
    this.buildObstacles();
  }

  private drawExitPad() {
    const pad = this.add.graphics().setDepth(2);
    pad.fillStyle(0x101A22, 0.95);
    pad.fillRoundedRect(EXIT_PAD.x, EXIT_PAD.y, EXIT_PAD.w, EXIT_PAD.h, 12);
    pad.lineStyle(2, 0x46B3FF, 0.75);
    pad.strokeRoundedRect(EXIT_PAD.x, EXIT_PAD.y, EXIT_PAD.w, EXIT_PAD.h, 12);
    this.add.text(EXIT_PAD.x + EXIT_PAD.w / 2, EXIT_PAD.y + 16, 'EXIT', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
    }).setOrigin(0.5).setDepth(3);
    this.add.text(EXIT_PAD.x + EXIT_PAD.w / 2, EXIT_PAD.y + 40, 'SPACE', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C0D6F7',
    }).setOrigin(0.5).setDepth(3);
  }

  private buildObstacles() {
    const g = this.add.graphics().setDepth(4);
    for (const obstacle of this.currentMap.obstacles) {
      g.fillStyle(obstacle.color, 1);
      g.fillRoundedRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h, 8);
      g.lineStyle(2, 0x000000, 0.35);
      g.strokeRoundedRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h, 8);
      this.obstacles.push(obstacle);
    }

    this.obstacles.push(
      { x: 70, y: 330, w: 1600, h: WALL_THICKNESS, color: 0 },
      { x: 70, y: 1100 - WALL_THICKNESS, w: 1600, h: WALL_THICKNESS, color: 0 },
      { x: 70, y: 330, w: WALL_THICKNESS, h: 770, color: 0 },
      { x: 1670 - WALL_THICKNESS, y: 330, w: WALL_THICKNESS, h: 770, color: 0 },
    );
  }

  private setupPlayer() {
    const cfg = loadStoredAvatarConfig();
    this.playerAvatar = new AvatarRenderer(this, this.px, this.py, cfg);
    this.playerAvatar.setDepth(30);
    this.playerName = this.add.text(this.px, this.py - 46, 'WASPI', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(40);
    this.playerBody = this.add.rectangle(this.px, this.py, 2, 2, 0x000000, 0).setDepth(0);
  }

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyF = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyR = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyQ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyOne = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.keyTwo = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
  }

  private setupHud() {
    this.roundHud = this.add.text(14, 58, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      lineSpacing: 6,
    }).setScrollFactor(0).setDepth(12000);
    this.weaponHud = this.add.text(14, 108, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
      lineSpacing: 5,
    }).setScrollFactor(0).setDepth(12000);
    this.hpHud = this.add.text(14, 152, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF8B8B',
    }).setScrollFactor(0).setDepth(12000);
    this.promptHud = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT - 34, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C5CBD8',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12000).setAlpha(0);
    this.noticeHud = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, 86, '', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#39FF14',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12001).setAlpha(0);
    this.bossPhaseHud = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, 118, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF44AA',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12002).setAlpha(0);
    this.interactionGlow = this.add.graphics().setDepth(11990);
    this.renderHud();
  }

  private setupDoors() {
    for (const section of this.currentMap.sections) {
      if (!section.unlockCost || !section.doorX || !section.doorY || !section.doorW || !section.doorH) continue;
      const unlocked = section.unlockedByDefault;
      const frame = this.add.rectangle(
        section.doorX + section.doorW / 2,
        section.doorY + section.doorH / 2,
        section.doorW,
        section.doorH,
        unlocked ? 0x163822 : 0x351515,
        0.9,
      ).setDepth(6).setStrokeStyle(2, unlocked ? 0x39FF14 : 0xFF6666, 0.7);
      const label = this.add.text(section.doorX + section.doorW / 2, section.doorY - 14, unlocked ? 'OPEN' : `${section.unlockCost} PTS`, {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: unlocked ? '#39FF14' : '#FF8B8B',
      }).setOrigin(0.5).setDepth(7);
      this.doors.set(section.id, { config: section, unlocked, frame, label });
      if (!unlocked) {
        this.obstacles.push({
          x: section.doorX,
          y: section.doorY,
          w: section.doorW,
          h: section.doorH,
          color: 0,
        });
      }
    }
  }

  private setupMysteryBox() {
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(0x2C1B36, 1);
    g.fillRoundedRect(BOX_POS.x - 40, BOX_POS.y - 26, 80, 52, 8);
    g.lineStyle(2, 0xFF44AA, 0.8);
    g.strokeRoundedRect(BOX_POS.x - 40, BOX_POS.y - 26, 80, 52, 8);
    g.fillStyle(0xF5C842, 0.9);
    g.fillRect(BOX_POS.x - 10, BOX_POS.y - 6, 20, 12);
    this.boxHint = this.add.text(BOX_POS.x, BOX_POS.y - 38, 'MYSTERY BOX', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF44AA',
    }).setOrigin(0.5).setDepth(6);
  }

  private renderHud() {
    const weapon = ZOMBIES_WEAPONS[this.currentWeapon];
    const ammo = this.weaponInventory[this.currentWeapon];
    const remaining = this.zombiesToSpawn - this.zombiesSpawned + this.countAliveZombies();
    const activeBoss = Array.from(this.zombies.values()).find((zombie) => zombie.type === 'boss' && zombie.alive) ?? null;
    const statusLine = this.mapCompleted
      ? this.currentMapId === 'map1' && this.unlockedMaps.map2 ? 'MAPA COMPLETO | 2 MAPA 2' : 'MAPA COMPLETO'
      : isBossRound(this.round) && this.inRound
        ? activeBoss?.finalPhaseTriggered
          ? `FASE FINAL | ${activeBoss.config.finalPhaseLabel ?? 'ENRAGE'}`
          : activeBoss
            ? 'BOSS EN ARENA'
            : `LIMPIA REFUERZOS ${Math.max(0, remaining)}`
        : `RESTAN ${Math.max(0, remaining)}`;
    this.roundHud?.setText([
      isBossRound(this.round) ? `RONDA ${this.round} BOSS` : `RONDA ${this.round}`,
      `PTS ${this.points}`,
      statusLine,
    ]);
    this.roundHud?.setColor(
      activeBoss?.finalPhaseTriggered
        ? (this.currentMapId === 'map2' ? '#FFD24A' : '#FF44AA')
        : '#F5C842',
    );
    this.weaponHud?.setText([
      `ARMA ${weapon.label}`,
      `BALAS ${ammo.magazine}/${ammo.reserve}`,
      this.reloadingUntil > this.time.now ? 'RECARGANDO...' : 'F/CLICK DISPARA  Q CAMBIA  R RECARGA',
    ]);
    this.hpHud?.setText(`HP ${this.hp}`);
    if (activeBoss?.finalPhaseTriggered) {
      this.bossPhaseHud?.setText(`${activeBoss.config.label} ${activeBoss.config.finalPhaseLabel ?? 'ENRAGE'}`);
      this.bossPhaseHud?.setColor(this.currentMapId === 'map2' ? '#FFD24A' : '#FF44AA');
      this.bossPhaseHud?.setAlpha(1);
    } else {
      this.bossPhaseHud?.setAlpha(0);
    }
  }

  private showNotice(message: string, color = '#39FF14') {
    if (!this.noticeHud) return;
    this.noticeHud.setText(message);
    this.noticeHud.setColor(color);
    this.noticeHud.setAlpha(1);
    this.tweens.killTweensOf(this.noticeHud);
    this.tweens.add({
      targets: this.noticeHud,
      alpha: { from: 1, to: 0 },
      y: { from: 86, to: 72 },
      duration: 1100,
      ease: 'Sine.easeOut',
      onComplete: () => this.noticeHud?.setY(86),
    });
  }

  private showMapSelection() {
    this.mapSelectOpen = true;
    const panel = this.add.rectangle(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT / 2, 420, 180, 0x05070B, 0.92)
      .setScrollFactor(0)
      .setDepth(13000)
      .setStrokeStyle(2, 0x3DD6FF, 0.75);
    const title = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT / 2 - 52, 'SELECCIONA MAPA', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(13001);
    const map1 = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT / 2 - 6, '1  MAPA 1 BUNKER', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(13001);
    const map2 = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT / 2 + 30, '2  MAPA 2 QUARANTINE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: this.unlockedMaps.map2 ? '#3DD6FF' : '#666666',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(13001);
    const hint = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT / 2 + 68, '1 O SPACE ARRANCA | 2 CAMBIA DE MAPA', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C0D6F7',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(13001);
    this.mapSelectHud = this.add.container(0, 0, [panel, title, map1, map2, hint]).setDepth(13000);
  }

  private hideMapSelection() {
    this.mapSelectOpen = false;
    this.mapSelectHud?.destroy(true);
    this.mapSelectHud = undefined;
  }

  private handleMapSelectionInput() {
    if (!this.mapSelectOpen) return;
    if (Phaser.Input.Keyboard.JustDown(this.keyTwo) && this.unlockedMaps.map2) {
      this.scene.restart({ mapId: 'map2' });
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyOne) || Phaser.Input.Keyboard.JustDown(this.cursors.space!)) {
      this.hideMapSelection();
      this.beginRound(1);
    }
  }

  private handleCompletedMapInput() {
    if (!this.mapCompleted) return;
    if (this.currentMapId === 'map1' && this.unlockedMaps.map2 && Phaser.Input.Keyboard.JustDown(this.keyTwo)) {
      this.scene.restart({ mapId: 'map2' });
    }
  }

  private beginRound(round: number) {
    this.round = round;
    this.inRound = true;
    this.zombiesToSpawn = getRoundZombieCount(round);
    this.zombiesSpawned = 0;
    this.nextSpawnAt = this.time.now + (isBossRound(round) ? 1800 : 900);
    const bossLabel = isBossRound(round) ? getBossZombieForMap(this.currentMapId).label : null;
    this.showNotice(
      bossLabel ? `RONDA ${round} | ${bossLabel}` : `RONDA ${round}`,
      bossLabel ? (this.currentMapId === 'map2' ? '#FF6B3D' : '#FF44AA') : '#F5C842',
    );
    this.renderHud();
  }

  update(_time: number, delta: number) {
    if (this.mapSelectOpen) {
      this.handleMapSelectionInput();
      return;
    }

    if (this.gameOver) {
      this.updatePromptHud({ kind: 'exit', label: 'SPACE SALIR A PLAZA', x: EXIT_PAD.x + EXIT_PAD.w / 2, y: EXIT_PAD.y, color: '#46B3FF' });
      if (Phaser.Input.Keyboard.JustDown(this.cursors.space!)) {
        transitionToScene(this, 'WorldScene', PLAYER_RETURN);
      }
      return;
    }

    this.handleMovement(delta);
    this.handleCombatInput();
    this.handleRoundFlow();
    this.updateZombies(delta);
    this.handleContextInteraction();
    this.handleCompletedMapInput();
    this.playerBody.setPosition(this.px, this.py);
    this.playerAvatar.setPosition(this.px, this.py);
    this.playerAvatar.setDepth(Math.floor(this.py / 10));
    this.playerName.setPosition(this.px, this.py - 46);
    this.renderHud();
  }

  private handleMovement(delta: number) {
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
    const nextX = Phaser.Math.Clamp(this.px + dx * ZOMBIES_PLAYER.speed * (delta / 1000), 90, ZOMBIES_WORLD.WIDTH - 90);
    const nextY = Phaser.Math.Clamp(this.py + dy * ZOMBIES_PLAYER.speed * (delta / 1000), 360, ZOMBIES_WORLD.HEIGHT - 110);

    const moved = this.tryMovePlayer(nextX, nextY);
    this.playerAvatar.update(moved, dx);
  }

  private tryMovePlayer(nextX: number, nextY: number) {
    const fromX = this.px;
    const fromY = this.py;
    if (!this.isBlocked(nextX, fromY, ZOMBIES_PLAYER.radius)) {
      this.px = nextX;
    }
    if (!this.isBlocked(this.px, nextY, ZOMBIES_PLAYER.radius)) {
      this.py = nextY;
    }
    return Math.abs(this.px - fromX) > 0.2 || Math.abs(this.py - fromY) > 0.2;
  }

  private handleCombatInput() {
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      this.cycleWeapon();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
      this.tryReload();
    }

    const pointer = this.input.activePointer;
    if ((this.keyF.isDown || pointer.isDown) && this.time.now >= this.reloadingUntil) {
      this.tryShoot(pointer.worldX, pointer.worldY);
    }
  }

  private tryShoot(targetX: number, targetY: number) {
    const weapon = ZOMBIES_WEAPONS[this.currentWeapon];
    const ammo = this.weaponInventory[this.currentWeapon];
    if (this.time.now - this.lastShotAt < weapon.fireDelayMs) return;
    if (ammo.magazine <= 0) {
      this.tryReload();
      return;
    }

    this.lastShotAt = this.time.now;
    ammo.magazine -= 1;
    const baseAngle = Phaser.Math.Angle.Between(this.px, this.py, targetX, targetY);

    for (let i = 0; i < weapon.pellets; i += 1) {
      const angle = baseAngle + Phaser.Math.FloatBetween(-weapon.spread, weapon.spread);
      const hit = this.findZombieTarget(angle, weapon.range);
      this.drawShotFx(angle, weapon.color);
      if (!hit) continue;
      this.damageZombie(hit, weapon.damage);
    }

    this.cameras.main.shake(weapon.id === 'shotgun' ? 55 : 28, weapon.id === 'shotgun' ? 0.0024 : 0.0011, false);
    if (ammo.magazine <= 0 && ammo.reserve > 0) {
      this.tryReload();
    }
  }

  private tryReload() {
    const weapon = ZOMBIES_WEAPONS[this.currentWeapon];
    const ammo = this.weaponInventory[this.currentWeapon];
    if (this.time.now < this.reloadingUntil) return;
    if (ammo.magazine >= weapon.magazineSize) return;
    if (ammo.reserve <= 0) return;
    this.reloadingUntil = this.time.now + weapon.reloadMs;
    this.showNotice(`RECARGANDO ${weapon.label}`, '#46B3FF');
    this.time.delayedCall(weapon.reloadMs, () => {
      const needed = weapon.magazineSize - ammo.magazine;
      const moved = Math.min(needed, ammo.reserve);
      ammo.magazine += moved;
      ammo.reserve -= moved;
      this.reloadingUntil = 0;
      this.renderHud();
    });
  }

  private cycleWeapon() {
    const owned = (Object.keys(this.weaponInventory) as ZombiesWeaponId[]).filter((id) => this.weaponInventory[id].owned);
    const currentIndex = owned.indexOf(this.currentWeapon);
    this.currentWeapon = owned[(currentIndex + 1) % owned.length] ?? 'pistol';
    this.showNotice(`ARMA ${ZOMBIES_WEAPONS[this.currentWeapon].label}`, '#F5C842');
  }

  private drawShotFx(angle: number, color: number) {
    const flash = this.add.circle(this.px + Math.cos(angle) * 16, this.py + Math.sin(angle) * 16, 6, color, 0.95).setDepth(70);
    const tracer = this.add.line(0, 0, this.px, this.py, this.px + Math.cos(angle) * 28, this.py + Math.sin(angle) * 28, color, 0.55)
      .setLineWidth(3, 3)
      .setDepth(69);

    this.tweens.add({
      targets: [flash, tracer],
      alpha: { from: 0.95, to: 0 },
      duration: 90,
      onComplete: () => {
        flash.destroy();
        tracer.destroy();
      },
    });
  }

  private isBlocked(x: number, y: number, radius: number): boolean {
    for (const obs of this.obstacles) {
      if (
        x + radius > obs.x && x - radius < obs.x + obs.w &&
        y + radius > obs.y && y - radius < obs.y + obs.h
      ) return true;
    }
    return false;
  }

  private countAliveZombies(): number {
    let n = 0;
    for (const z of this.zombies.values()) {
      if (z.alive) n++;
    }
    return n;
  }

  private createZombie(config: ZombieConfig, spawnPt: { x: number; y: number }) {
    const id = `z${this.spawnSerial++}`;
    const radius =
      config.type === 'boss' ? this.currentMapId === 'map2' ? 30 : 26
      : config.type === 'brute' ? 16
      : config.type === 'exploder' ? 14
      : config.type === 'runner' ? 10
      : 13;
    const hp = getZombieHpForRound(config.baseHp, this.round);
    const speed = getZombieSpeedForRound(config.speed, this.round) * ZOMBIES_PLAYER.speed * 0.72;
    const body = this.add.circle(spawnPt.x, spawnPt.y, radius, config.tint, 0.92) as ZombiesBody;
    body.setDepth(20);
    const hpBar = this.add.graphics().setDepth(25);
    const label = this.add.text(spawnPt.x, spawnPt.y - radius - 8, config.label, {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFFFFF',
    }).setOrigin(0.5).setDepth(26);
    const zombie: ZombieState = {
      id,
      type: config.type,
      config,
      body,
      hpBar,
      label,
      hp,
      maxHp: hp,
      damage: config.damage,
      speed,
      alive: true,
      state: 'spawn',
      nextStateAt: this.time.now + 350,
      lastAttackAt: 0,
      deathAt: 0,
      attackCooldownMs: config.attackCooldownMs,
      finalPhaseTriggered: false,
      fuseAt: 0,
    };
    this.zombies.set(id, zombie);
    this.zombiesSpawned++;
    this.updateZombieHpBar(zombie);
    if (config.type === 'boss') {
      this.cameras.main.shake(220, 0.004, false);
      this.showNotice(`${config.label} ENTRANDO`, this.currentMapId === 'map2' ? '#FF6B3D' : '#3DD6FF');
    } else if (config.type === 'exploder') {
      zombie.body.setStrokeStyle(2, 0xFFF07A, 0.75);
    }
    this.tweens.add({
      targets: body,
      alpha: { from: 0, to: 0.92 },
      scaleX: { from: 0.4, to: 1 },
      scaleY: { from: 0.4, to: 1 },
      duration: 300,
      ease: 'Back.easeOut',
    });
    return zombie;
  }

  private explodeZombie(zombie: ZombieState, rewardPlayer: boolean) {
    if (!this.zombies.has(zombie.id)) return;
    zombie.alive = false;
    zombie.state = 'death';
    zombie.deathAt = this.time.now;
    zombie.body.disableInteractive?.();
    const radius = zombie.config.explosionRadius ?? (zombie.type === 'boss' ? 110 : 72);
    const explosionDamage = zombie.damage;
    const distToPlayer = Phaser.Math.Distance.Between(zombie.body.x, zombie.body.y, this.px, this.py);
    if (distToPlayer <= radius + ZOMBIES_PLAYER.radius) {
      const falloff = Phaser.Math.Clamp(1 - distToPlayer / (radius + ZOMBIES_PLAYER.radius), 0.22, 1);
      this.applyPlayerDamage(Math.max(6, Math.round(explosionDamage * falloff)));
    }
    const flash = this.add.circle(zombie.body.x, zombie.body.y, 18, zombie.config.finalPhaseTint ?? zombie.config.tint, 0.35).setDepth(90);
    flash.setStrokeStyle(4, 0xFFF7BF, 0.9);
    this.tweens.add({
      targets: flash,
      scale: radius / 18,
      alpha: { from: 0.35, to: 0 },
      duration: zombie.type === 'boss' ? 420 : 280,
      ease: 'Sine.easeOut',
      onComplete: () => flash.destroy(),
    });
    this.cameras.main.shake(zombie.type === 'boss' ? 280 : 150, zombie.type === 'boss' ? 0.006 : 0.0036, false);
    if (rewardPlayer) {
      this.points += zombie.config.killReward;
      this.showNotice(`+${zombie.config.killReward} PTS`, zombie.type === 'boss' ? '#39FF14' : '#FF8B3D');
      eventBus.emit(EVENTS.STATS_ZOMBIE_KILL);
    }
    this.tweens.add({
      targets: [zombie.body, zombie.label],
      alpha: { from: zombie.body.alpha, to: 0 },
      duration: 180,
      onComplete: () => {
        zombie.body.destroy();
        zombie.hpBar.destroy();
        zombie.label.destroy();
        this.zombies.delete(zombie.id);
      },
    });
  }

  private triggerBossFinalPhase(zombie: ZombieState) {
    zombie.finalPhaseTriggered = true;
    zombie.damage = Math.round(zombie.damage * (zombie.config.finalPhaseDamageMultiplier ?? 1.2));
    zombie.speed *= zombie.config.finalPhaseSpeedMultiplier ?? 1.2;
    zombie.attackCooldownMs = Math.max(
      280,
      Math.round(zombie.attackCooldownMs * (zombie.config.finalPhaseCooldownMultiplier ?? 0.8)),
    );
    zombie.body.setFillStyle(zombie.config.finalPhaseTint ?? zombie.config.tint);
    zombie.body.setScale(1.14);
    zombie.label.setText(zombie.config.finalPhaseLabel ?? `${zombie.config.label} P2`);
    this.showNotice(
      `${zombie.config.label} ${zombie.config.finalPhaseLabel ?? 'ENRAGE'}`,
      zombie.config.finalPhaseTint ? `#${zombie.config.finalPhaseTint.toString(16).padStart(6, '0')}` : '#FF44AA',
    );
    this.bossPhaseHud?.setText(`${zombie.config.label} ${zombie.config.finalPhaseLabel ?? 'ENRAGE'}`);
    this.bossPhaseHud?.setColor(
      zombie.config.finalPhaseTint ? `#${zombie.config.finalPhaseTint.toString(16).padStart(6, '0')}` : '#FF44AA',
    );
    this.bossPhaseHud?.setAlpha(1);
    const siren = this.add.rectangle(
      ZOMBIES_VIEWPORT.WIDTH / 2,
      ZOMBIES_VIEWPORT.HEIGHT / 2,
      ZOMBIES_VIEWPORT.WIDTH,
      ZOMBIES_VIEWPORT.HEIGHT,
      zombie.config.finalPhaseTint ?? zombie.config.tint,
      0.12,
    ).setScrollFactor(0).setDepth(11999);
    this.tweens.add({
      targets: siren,
      alpha: { from: 0.2, to: 0 },
      duration: 220,
      repeat: 2,
      yoyo: true,
      onComplete: () => siren.destroy(),
    });

    const pulseRadius = this.currentMapId === 'map2' ? 120 : 90;
    const distToPlayer = Phaser.Math.Distance.Between(zombie.body.x, zombie.body.y, this.px, this.py);
    if (distToPlayer <= pulseRadius + ZOMBIES_PLAYER.radius) {
      this.applyPlayerDamage(Math.max(8, Math.round(zombie.damage * 0.38)));
    }
    const pulse = this.add.circle(zombie.body.x, zombie.body.y, 18, zombie.config.finalPhaseTint ?? zombie.config.tint, 0.28).setDepth(95);
    pulse.setStrokeStyle(3, 0xFFF7BF, 0.85);
    this.tweens.add({
      targets: pulse,
      scale: pulseRadius / 18,
      alpha: { from: 0.28, to: 0 },
      duration: 260,
      ease: 'Sine.easeOut',
      onComplete: () => pulse.destroy(),
    });

    if (this.currentMapId === 'map2') {
      const exploderConfig = getZombieTypeConfig('exploder', 'map2');
      const offsets = [
        { x: -112, y: -44 },
        { x: 112, y: -44 },
      ];
      for (const offset of offsets) {
        const spawnX = Phaser.Math.Clamp(zombie.body.x + offset.x, 110, ZOMBIES_WORLD.WIDTH - 110);
        const spawnY = Phaser.Math.Clamp(zombie.body.y + offset.y, 380, ZOMBIES_WORLD.HEIGHT - 120);
        this.createZombie(exploderConfig, { x: spawnX, y: spawnY });
      }
    }
  }

  private findZombieTarget(angle: number, range: number): ZombieState | null {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let closest: ZombieState | null = null;
    let closestDist = range;
    for (const zombie of this.zombies.values()) {
      if (!zombie.alive) continue;
      const zx = zombie.body.x - this.px;
      const zy = zombie.body.y - this.py;
      const dot = zx * dx + zy * dy;
      if (dot < 0 || dot > closestDist) continue;
      const perpX = zx - dx * dot;
      const perpY = zy - dy * dot;
      const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
      if (perpDist < zombie.config.attackRange + 4) {
        closest = zombie;
        closestDist = dot;
      }
    }
    return closest;
  }

  private damageZombie(zombie: ZombieState, damage: number) {
    zombie.hp -= damage;
    zombie.state = 'hurt';
    zombie.nextStateAt = this.time.now + 120;
    this.points += zombie.config.hitReward;
    zombie.body.setFillStyle(0xFF4444);
    this.time.delayedCall(100, () => {
      if (zombie.alive) zombie.body.setFillStyle(
        zombie.finalPhaseTriggered ? zombie.config.finalPhaseTint ?? zombie.config.tint : zombie.config.tint,
      );
    });
    if (
      zombie.type === 'boss' &&
      !zombie.finalPhaseTriggered &&
      zombie.config.finalPhaseThreshold !== undefined &&
      zombie.hp > 0 &&
      zombie.hp / zombie.maxHp <= zombie.config.finalPhaseThreshold
    ) {
      this.triggerBossFinalPhase(zombie);
    }
    if (zombie.hp <= 0) {
      if (zombie.type === 'exploder' && zombie.config.explodesOnDeath) {
        this.explodeZombie(zombie, true);
        return;
      }
      zombie.alive = false;
      zombie.state = 'death';
      zombie.deathAt = this.time.now;
      this.points += zombie.config.killReward;
      this.showNotice(`+${zombie.config.killReward} PTS`);
      eventBus.emit(EVENTS.STATS_ZOMBIE_KILL);
      this.tweens.add({
        targets: zombie.body,
        scaleX: 0,
        scaleY: 0,
        alpha: 0,
        duration: 320,
        onComplete: () => {
          zombie.body.destroy();
          zombie.hpBar.destroy();
          zombie.label.destroy();
          this.zombies.delete(zombie.id);
        },
      });
    }
  }

  private applyPlayerDamage(amount: number) {
    this.hp = Math.max(0, this.hp - amount);
    this.cameras.main.shake(180, 0.0032, false);
    if (this.hp <= 0) {
      this.hp = 0;
      this.gameOver = true;
      this.showNotice('GAME OVER', '#FF4444');
    }
  }

  private spawnZombie() {
    const config = isBossRound(this.round)
      ? getBossZombieForMap(this.currentMapId)
      : (() => {
          const eligible = getEligibleZombieTypes(this.round, this.currentMapId);
          return eligible[Math.floor(Math.random() * eligible.length)];
        })();
    const unlockedSections = this.currentMap.sections.filter((s) => {
      const door = this.doors.get(s.id);
      return !door || door.unlocked;
    });
    const section = unlockedSections[Math.floor(Math.random() * unlockedSections.length)];
    const spawnPt = section.spawnPoints[Math.floor(Math.random() * section.spawnPoints.length)];
    this.createZombie(config, spawnPt);
  }

  private updateZombieHpBar(zombie: ZombieState) {
    const bw = zombie.type === 'boss' ? 52 : 28;
    const bh = 4;
    const bx = zombie.body.x - bw / 2;
    const by = zombie.body.y - zombie.body.radius - 6;
    const pct = Math.max(0, zombie.hp / zombie.maxHp);
    zombie.hpBar.clear();
    zombie.hpBar.fillStyle(0x330000, 0.8);
    zombie.hpBar.fillRect(bx, by, bw, bh);
    const hpColor = zombie.type === 'boss'
      ? zombie.finalPhaseTriggered
        ? (this.currentMapId === 'map2' ? 0xFFD24A : 0xFF44AA)
        : zombie.config.tint
      : zombie.type === 'exploder'
        ? 0xFF8B3D
        : 0xFF3030;
    zombie.hpBar.fillStyle(hpColor, 1);
    zombie.hpBar.fillRect(bx, by, bw * pct, bh);
  }

  private updateZombies(delta: number) {
    for (const zombie of this.zombies.values()) {
      if (!zombie.alive) continue;
      if (zombie.state === 'spawn' && this.time.now < zombie.nextStateAt) continue;
      if (zombie.state === 'spawn') zombie.state = 'walk';
      const dx = this.px - zombie.body.x;
      const dy = this.py - zombie.body.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (zombie.type === 'exploder') {
        if (dist < zombie.config.attackRange + ZOMBIES_PLAYER.radius && zombie.fuseAt === 0) {
          zombie.state = 'attack';
          zombie.fuseAt = this.time.now + (zombie.config.explosionFuseMs ?? 650);
          zombie.label.setText('BOOM');
          zombie.body.setFillStyle(0xFFF07A);
          if (dist < 160) {
            this.showNotice('VOLATILE ARMED', '#FF8B3D');
          }
        }
        if (zombie.fuseAt > 0) {
          const pulse = Math.sin(this.time.now / 45) > 0 ? 0xFFF07A : zombie.config.tint;
          zombie.body.setFillStyle(pulse);
          if (this.time.now >= zombie.fuseAt) {
            this.explodeZombie(zombie, false);
            continue;
          }
        }
      }
      if (dist < zombie.config.attackRange + ZOMBIES_PLAYER.radius) {
        zombie.state = 'attack';
        if (zombie.type !== 'exploder' && this.time.now - zombie.lastAttackAt >= zombie.attackCooldownMs) {
          zombie.lastAttackAt = this.time.now;
          this.applyPlayerDamage(zombie.damage);
        }
      } else {
        zombie.state = 'walk';
        const speed = zombie.speed * (zombie.type === 'exploder' && zombie.fuseAt > 0 ? 1.18 : 1) * (delta / 1000);
        const ndx = dx / Math.max(dist, 0.001);
        const ndy = dy / Math.max(dist, 0.001);
        zombie.body.setPosition(zombie.body.x + ndx * speed, zombie.body.y + ndy * speed);
      }
      zombie.label.setPosition(zombie.body.x, zombie.body.y - zombie.body.radius - 8);
      this.updateZombieHpBar(zombie);
    }
  }

  private handleRoundFlow() {
    const now = this.time.now;
    if (!this.inRound) {
      if (!this.mapCompleted && now >= this.betweenRoundsUntil) this.beginRound(this.round + 1);
      return;
    }
    const concurrentCap = getRoundConcurrentCap(this.round);
    const alive = this.countAliveZombies();
    const spawnDelay = getSpawnDelayForRound(this.round);
    if (this.zombiesSpawned < this.zombiesToSpawn && alive < concurrentCap && now >= this.nextSpawnAt) {
      this.spawnZombie();
      this.nextSpawnAt = now + spawnDelay;
    }
    if (this.zombiesSpawned >= this.zombiesToSpawn && alive === 0) {
      this.inRound = false;
      if (isBossRound(this.round)) {
        this.mapCompleted = true;
        this.betweenRoundsUntil = Number.POSITIVE_INFINITY;
        const nextMapId = getNextZombieMapId(this.currentMapId);
        let unlockedMessage = `${this.currentMap.label} COMPLETO`;
        if (nextMapId) {
          const wasUnlocked = this.unlockedMaps[nextMapId];
          this.unlockedMaps = unlockZombiesMap(nextMapId);
          if (!wasUnlocked && this.unlockedMaps[nextMapId]) {
            unlockedMessage = `${this.currentMap.label} COMPLETO | ${getZombieMapConfig(nextMapId).label} DESBLOQUEADO`;
          }
        }
        this.showNotice(`${getBossZombieForMap(this.currentMapId).label} DOWN | ${unlockedMessage}`, '#39FF14');
      } else {
        this.betweenRoundsUntil = now + ZOMBIES_POINTS.roundBreakMs;
        this.showNotice(`RONDA ${this.round} COMPLETA`, '#F5C842');
      }
    }
  }

  private getNearbyInteraction(): InteractionOption | null {
    const threshold = 72;
    const epCx = EXIT_PAD.x + EXIT_PAD.w / 2;
    const epCy = EXIT_PAD.y + EXIT_PAD.h / 2;
    if (Math.abs(this.px - epCx) < threshold && Math.abs(this.py - epCy) < threshold) {
      return { kind: 'exit', label: 'SPACE SALIR', x: epCx, y: EXIT_PAD.y, color: '#46B3FF' };
    }
    if (Math.abs(this.px - BOX_POS.x) < threshold && Math.abs(this.py - BOX_POS.y) < threshold) {
      return { kind: 'box', label: `SPACE MYSTERY BOX (${ZOMBIES_POINTS.mysteryBoxCost} PTS)`, x: BOX_POS.x, y: BOX_POS.y, color: '#FF44AA' };
    }
    for (const [, door] of this.doors) {
      if (door.unlocked) continue;
      const cx = door.config.doorX! + door.config.doorW! / 2;
      const cy = door.config.doorY! + door.config.doorH! / 2;
      if (Math.abs(this.px - cx) < threshold && Math.abs(this.py - cy) < threshold) {
        return { kind: 'door', doorId: door.config.id, label: `SPACE ABRIR (${door.config.unlockCost} PTS)`, x: cx, y: cy, color: '#FF8B8B' };
      }
    }
    return null;
  }

  private handleContextInteraction() {
    const option = this.getNearbyInteraction();
    this.updatePromptHud(option);
    if (!option || !Phaser.Input.Keyboard.JustDown(this.cursors.space!)) return;
    if (option.kind === 'exit') {
      if (!this.inRound || this.gameOver || this.mapCompleted) {
        transitionToScene(this, 'WorldScene', PLAYER_RETURN);
      } else {
        this.showNotice('TERMINA LA RONDA PARA SALIR', '#FF8B8B');
      }
    } else if (option.kind === 'door') {
      const door = this.doors.get(option.doorId)!;
      if (this.points >= door.config.unlockCost!) {
        this.points -= door.config.unlockCost!;
        door.unlocked = true;
        door.frame.setFillStyle(0x163822, 0.9).setStrokeStyle(2, 0x39FF14, 0.7);
        door.label.setText('OPEN').setColor('#39FF14');
        const di = this.obstacles.findIndex((o) => o.x === door.config.doorX && o.y === door.config.doorY);
        if (di >= 0) this.obstacles.splice(di, 1);
        this.showNotice(`${door.config.label} DESBLOQUEADA`, '#39FF14');
      } else {
        this.showNotice('PUNTOS INSUFICIENTES', '#FF8B8B');
      }
    } else if (option.kind === 'box') {
      this.tryMysteryBox();
    }
  }

  private tryMysteryBox() {
    if (this.points < ZOMBIES_POINTS.mysteryBoxCost) { this.showNotice('PUNTOS INSUFICIENTES', '#FF8B8B'); return; }
    if (this.mysteryRollingUntil > this.time.now) return;
    const eligibleWeapons = (Object.values(ZOMBIES_WEAPONS) as ZombiesWeaponConfig[]).filter(
      (w) => w.mysteryWeight > 0 && !this.weaponInventory[w.id].owned,
    );
    if (eligibleWeapons.length === 0) { this.showNotice('YA TIENES TODO', '#F5C842'); return; }
    this.points -= ZOMBIES_POINTS.mysteryBoxCost;
    this.mysteryRollingUntil = this.time.now + 2000;
    const totalWeight = eligibleWeapons.reduce((s, w) => s + w.mysteryWeight, 0);
    let roll = Math.random() * totalWeight;
    let selected = eligibleWeapons[0];
    for (const w of eligibleWeapons) { roll -= w.mysteryWeight; if (roll <= 0) { selected = w; break; } }
    this.showNotice('ROLLING...', '#FF44AA');
    this.time.delayedCall(2000, () => {
      this.weaponInventory[selected.id] = { owned: true, magazine: selected.magazineSize, reserve: selected.reserveAmmo };
      this.currentWeapon = selected.id;
      this.showNotice(`OBTUVISTE ${selected.label}!`, '#FF44AA');
      this.mysteryRollingUntil = 0;
    });
  }

  private updatePromptHud(option: InteractionOption | null) {
    if (!this.promptHud) return;
    if (!option) {
      this.tweens.killTweensOf(this.promptHud);
      this.promptHud.setAlpha(0);
      this.interactionGlow?.clear();
      return;
    }
    this.promptHud.setText(option.label);
    this.promptHud.setColor(option.color);
    this.promptHud.setAlpha(1);
  }
}
