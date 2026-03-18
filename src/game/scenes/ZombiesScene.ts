
import Phaser from 'phaser';
import { AvatarRenderer, type AvatarConfig, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { ChatSystem } from '../systems/ChatSystem';
import { announceScene, bindSafeResetToPlaza, createBackButton, transitionToScene } from '../systems/SceneUi';
import {
  ensureFallbackRectTexture,
  getSafeAnimationDurationMs,
  hasUsableTexture,
  safeCreateSpritesheetAnimation,
  safeDestroyGameObject,
  safePlaySpriteAnimation,
  safeSceneDelayedCall,
  safeWithLiveSprite,
} from '../systems/AnimationSafety';
import { SceneControls } from '../systems/SceneControls';
import { startSceneMusic, stopSceneMusic } from '../systems/AudioManager';
import { eventBus, EVENTS } from '../config/eventBus';
import { getInventory } from '../systems/InventorySystem';
import { SAFE_PLAZA_RETURN } from '../config/constants';
import { recordDistanceDelta } from '../systems/StatsSystem';
import { supabase, isConfigured } from '../../lib/supabase';
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
const PACK_POS = { x: 1278, y: 610 } as const;
const EXIT_PAD = { x: 182, y: 878, radius: 42 } as const;
const DEPTHS_PAD = { x: 1586, y: 918, radius: 46 } as const;
const PLAYER_RETURN = { x: 1600, y: 1540 } as const;
// Arena visual bounds: (60, 120) → (1760, 1100). Player boundary = arena edge + radius.
const ARENA_MIN_X = 60;
const ARENA_MIN_Y = 120;
const ARENA_MAX_X = 1760;
const ARENA_MAX_Y = 1100;

type ZombiesSceneInitData = {
  returnScene?: string;
  returnX?: number;
  returnY?: number;
  entryLabel?: string;
  allowDepthsGate?: boolean;
  modeLabel?: string;
};

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
  assetFolder: string;
  displayLabel: string;
  isBoss: boolean;
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
  lastSpecialAt: number;
  spawnNodeId?: string;
  breachEndsAt: number;
  lastStompAt: number;
  lastAnimatedState?: ZombieAnimState;
};

type PickupKind = 'max_ammo' | 'insta_kill' | 'double_points' | 'nuke';

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
  upgraded: boolean;
}>;

type ZombieProjectile = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  body: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Ellipse;
  expiresAt: number;
};

type InteractionOption = {
  kind: 'exit' | 'door' | 'box' | 'repair' | 'upgrade' | 'depths';
  x: number;
  y: number;
  radius: number;
  label: string;
  color: number;
  sectionId?: ZombiesSectionId;
  nodeId?: string;
};

type ZombiesRemotePlayer = {
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
};

type SharedRunPlayerState = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  joinedAt: number;
  lastDamageAt: number;
};

type SharedRunPresenceMeta = {
  player_id?: string;
  username?: string;
  joined_at?: number;
};

type SharedRunZombieSnapshot = {
  id: string;
  type: ZombieType;
  assetFolder: string;
  displayLabel: string;
  isBoss: boolean;
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
  spawnNodeId?: string;
  breachInMs: number;
  attackCooldownLeftMs: number;
  specialCooldownLeftMs: number;
  stompCooldownLeftMs: number;
};

type SharedRunProjectileSnapshot = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  expiresInMs: number;
};

type SharedRunPickupSnapshot = {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
  expiresInMs: number;
};

type SharedRunSpawnNodeSnapshot = {
  id: string;
  occupiedBy?: string;
  boardHealth: number;
  lastUsedAgoMs: number;
};

type SharedRunDoorSnapshot = {
  id: ZombiesSectionId;
  unlocked: boolean;
};

type SharedRunStateSnapshot = {
  host_id: string;
  round: number;
  roundTarget: number;
  spawnedThisRound: number;
  nextSpawnInMs: number;
  roundBreakInMs: number;
  bossRoundActive: boolean;
  bossSpawnedThisRound: boolean;
  bossAlive: boolean;
  depthsUnlocked: boolean;
  points: number;
  zombieIdSeq: number;
  zombieProjectileSeq: number;
  pickupIdSeq: number;
  mysteryBoxCooldownInMs: number;
  boxRollingInMs: number;
  instaKillInMs: number;
  doublePointsInMs: number;
  players: SharedRunPlayerState[];
  doors: SharedRunDoorSnapshot[];
  spawnNodes: SharedRunSpawnNodeSnapshot[];
  zombies: SharedRunZombieSnapshot[];
  projectiles: SharedRunProjectileSnapshot[];
  pickups: SharedRunPickupSnapshot[];
};

type SharedRunShotPayload = {
  player_id: string;
  username: string;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  pellets: number;
  spread: number;
  range: number;
  damage: number;
  color: number;
};

type SharedRunInteractPayload = {
  player_id: string;
  kind: 'door' | 'repair' | 'box' | 'upgrade';
  sectionId?: ZombiesSectionId;
  nodeId?: string;
  weaponId?: ZombiesWeaponId;
  // Sender's position at the moment of interaction — avoids relying on stale sharedRunPlayers
  px?: number;
  py?: number;
};

type SharedRunWeaponGrantPayload = {
  player_id: string;
  kind: 'box' | 'upgrade' | 'notice';
  weaponId?: ZombiesWeaponId;
  ok: boolean;
  message?: string;
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
  private bossRoundActive = false;
  private bossSpawnedThisRound = false;
  private bossAlive = false;
  private depthsUnlocked = false;
  private gameOver = false;
  private currentWeapon: ZombiesWeaponId = 'pistol';
  private weaponInventory!: WeaponInventory;
  private weaponOrder: ZombiesWeaponId[] = ['pistol'];
  private lastShotAt: number = 0;
  private reloadEndsAt: number = 0;
  private lastIsMoving = false;
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastDamageAt: number = 0;
  private zombies = new Map<string, ZombieState>();
  private zombieIdSeq = 0;
  private zombieProjectileSeq = 0;
  private pickupIdSeq = 0;
  private obstacles: ObstacleRect[] = [];
  private spawnNodes = new Map<string, SpawnNode>();
  private pickups = new Map<string, PickupState>();
  private zombieProjectiles = new Map<string, ZombieProjectile>();
  private doors = new Map<ZombiesSectionId, DoorState>();
  private mysteryBoxCooldownUntil: number = 0;
  private instaKillUntil: number = 0;
  private doublePointsUntil: number = 0;
  private boxRollingUntil = 0;
  private boxLid?: Phaser.GameObjects.Rectangle;
  private boxBase?: Phaser.GameObjects.Rectangle;
  private boxGlow?: Phaser.GameObjects.Ellipse;
  private boxPreviewText?: Phaser.GameObjects.Text;
  private packPad?: Phaser.GameObjects.Rectangle;
  private packLabel?: Phaser.GameObjects.Text;
  private powerupBanner?: Phaser.GameObjects.Text;
  private audioContext?: AudioContext;
  private sceneMusic: Phaser.Sound.BaseSound | null = null;
  private lastSpawnSfxAt = 0;
  private lastStompSfxAt = 0;
  private activePrompt?: Phaser.GameObjects.Text;
  private promptGlow?: Phaser.GameObjects.Graphics;
  private roundText?: Phaser.GameObjects.Text;
  private pointsText?: Phaser.GameObjects.Text;
  private hpText?: Phaser.GameObjects.Text;
  private ammoText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;
  private inventoryText?: Phaser.GameObjects.Text;
  private noticeText?: Phaser.GameObjects.Text;
  private bossIntroText?: Phaser.GameObjects.Text;
  private controlsText?: Phaser.GameObjects.Text;
  private reticle?: Phaser.GameObjects.Graphics;
  private depthsRing?: Phaser.GameObjects.Ellipse;
  private depthsLabel?: Phaser.GameObjects.Text;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyJ!: Phaser.Input.Keyboard.Key;
  private keyK!: Phaser.Input.Keyboard.Key;
  private keyL!: Phaser.Input.Keyboard.Key;
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
  private restartPending = false;
  private controls!: SceneControls;
  private returnScene: string = 'WorldScene';
  private returnX: number = PLAYER_RETURN.x;
  private returnY: number = PLAYER_RETURN.y;
  private entryLabel: string = 'LA PLAZA';
  private allowDepthsGate = true;
  private modeLabel = 'ZOMBIES';
  private playerId = '';
  private playerUsername = '';
  private remotePlayers = new Map<string, ZombiesRemotePlayer>();
  private channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
  private chatSystem?: ChatSystem;
  private lastPosSent = 0;
  private cleanupFns: Array<() => void> = [];
  private sharedRunPlayers = new Map<string, SharedRunPlayerState>();
  private sharedRunHostId: string | null = null;
  private lastSharedSnapshotSentAt = 0;
  private sharedResetPending = false;

  constructor(sceneKey = 'ZombiesScene') {
    super({ key: sceneKey });
  }

  init(data?: ZombiesSceneInitData) {
    this.returnScene = data?.returnScene ?? 'WorldScene';
    this.returnX = typeof data?.returnX === 'number' ? data.returnX : PLAYER_RETURN.x;
    this.returnY = typeof data?.returnY === 'number' ? data.returnY : PLAYER_RETURN.y;
    this.entryLabel = data?.entryLabel ?? 'LA PLAZA';
    this.allowDepthsGate = data?.allowDepthsGate ?? true;
    this.modeLabel = data?.modeLabel ?? 'ZOMBIES';
  }

  create() {
    this.input.enabled = true;
    // transitionToScene() disables keyboard input during fades; ensure it is re-enabled
    // when entering ZombiesScene so movement/interactions work reliably.
    if (this.input.keyboard) {
      this.input.keyboard.enabled = true;
    }
    this.controls = new SceneControls(this);
    announceScene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    this.playerId = this.getOrCreatePlayerId();
    this.playerUsername = this.getOrCreateUsername();
    this.initSharedRunPlayerState();
    this.avatarConfig = loadStoredAvatarConfig();
    this.chatSystem = new ChatSystem(this);
    this.weaponInventory = this.createWeaponInventory();
    this.applyArmsDelaerLoadout();
    this.weaponOrder = ['pistol', ...(['shotgun', 'smg', 'rifle', 'deagle', 'cannon', 'raygun'] as ZombiesWeaponId[]).filter(id => this.weaponInventory[id].owned)];
    this.currentWeapon = this.weaponOrder[this.weaponOrder.length - 1];
    this.points = ZOMBIES_POINTS.start;
    this.hp = ZOMBIES_PLAYER.maxHp;
    this.round = 0;
    this.roundTarget = 0;
    this.spawnedThisRound = 0;
    this.nextSpawnAt = 0;
    this.roundBreakUntil = 0;
    this.bossRoundActive = false;
    this.bossSpawnedThisRound = false;
    this.bossAlive = false;
    this.depthsUnlocked = false;
    this.gameOver = false;
    this.zombies.clear();
    this.zombieIdSeq = 0;
    this.zombieProjectiles.clear();
    this.zombieProjectileSeq = 0;
    this.pickups.clear();
    this.pickupIdSeq = 0;
    this.obstacles = [];
    this.spawnNodes.clear();
    this.doors.clear();
    this.mysteryBoxCooldownUntil = 0;
    this.instaKillUntil = 0;
    this.doublePointsUntil = 0;
    this.boxRollingUntil = 0;
    this.lastSpawnSfxAt = 0;
    this.lastStompSfxAt = 0;
    this.lastShotAt = 0;
    this.reloadEndsAt = 0;
    this.lastMoveDx = 0;
    this.lastMoveDy = 0;
    this.lastDamageAt = 0;
    this.restartPending = false;
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
    bindSafeResetToPlaza(this, () => {
      transitionToScene(this, 'WorldScene', {
        returnX: SAFE_PLAZA_RETURN.X,
        returnY: SAFE_PLAZA_RETURN.Y,
      });
    });

    createBackButton(this, () => this.requestExit(), 'SALIR');
    this.cameras.main.startFollow(this.player.getContainer(), true, 0.12, 0.12);
    this.cameras.main.setZoom(1);
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(240, 0, 0, 0);

    this.sceneMusic = startSceneMusic(this, 'zombies_dark', 0.45);
    this.setupRealtime();
    this.setupChatBridge();
    this.beginRound();
  }

  private createWeaponInventory(): WeaponInventory {
    return {
      pistol:  { owned: true,  ammoInMag: ZOMBIES_WEAPONS.pistol.magazineSize,  reserveAmmo: ZOMBIES_WEAPONS.pistol.reserveAmmo,  upgraded: false },
      shotgun: { owned: false, ammoInMag: 0, reserveAmmo: 0, upgraded: false },
      smg:     { owned: false, ammoInMag: 0, reserveAmmo: 0, upgraded: false },
      rifle:   { owned: false, ammoInMag: 0, reserveAmmo: 0, upgraded: false },
      deagle:  { owned: false, ammoInMag: 0, reserveAmmo: 0, upgraded: false },
      cannon:  { owned: false, ammoInMag: 0, reserveAmmo: 0, upgraded: false },
      raygun:  { owned: false, ammoInMag: 0, reserveAmmo: 0, upgraded: false },
    };
  }

  // Maps catalog utility items to zombies starting weapons
  private applyArmsDelaerLoadout() {
    const owned = getInventory().owned;
    const grants: Array<[string, ZombiesWeaponId]> = [
      ['UTIL-GUN-SHOT-01',   'shotgun'],
      ['UTIL-GUN-SMG-01',    'smg'],
      ['UTIL-GUN-RIFL-01',   'rifle'],
      ['UTIL-GUN-DEAGLE-01', 'deagle'],
      ['UTIL-GUN-CANNON-01', 'cannon'],
      ['UTIL-GUN-GOLD-01',   'raygun'],
    ];
    for (const [itemId, weaponId] of grants) {
      if (owned.includes(itemId)) {
        const stats = ZOMBIES_WEAPONS[weaponId];
        this.weaponInventory[weaponId] = {
          owned: true,
          ammoInMag: stats.magazineSize,
          reserveAmmo: stats.reserveAmmo,
          upgraded: false,
        };
      }
    }
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
      safeCreateSpritesheetAnimation(
        this,
        `zs_${folder}_spawn`,
        `zombie_${folder}_spawn`,
        frameRates.spawn,
        0,
      );
    }

    for (const state of ['idle', 'walk', 'attack', 'hurt', 'death'] as const) {
      safeCreateSpritesheetAnimation(this, `zs_boss_${state}`, `zombie_boss_${state}`, frameRates[state], repeats[state]);
    }
    safeCreateSpritesheetAnimation(this, 'zs_boss_spawn', 'zombie_boss_spawn', frameRates.spawn, 0);
  }

  private getZombieFallbackTexture(type: ZombieType) {
    return type === 'brute' ? 'zombie_fallback_large' : 'zombie_fallback_small';
  }

  private getZombieTextureKey(type: ZombieType, state: Exclude<ZombieAnimState, 'spawn'>) {
    const folder = ZOMBIE_TYPES[type].folder;
    return `zombie_${folder}_${state}`;
  }

  private getZombieVisualCandidates(zombie: ZombieState, state: ZombieAnimState) {
    const baseFolder = zombie.assetFolder;
    const perState = {
      spawn: ['spawn', 'walk', 'attack', 'idle'],
      death: ['death', 'hurt', 'idle'],
      hurt: ['hurt', 'walk', 'idle'],
      attack: ['attack', 'walk', 'idle'],
      walk: ['walk', 'idle'],
      idle: ['idle', 'walk'],
    } satisfies Record<ZombieAnimState, string[]>;

    return perState[state].map((candidateState) => ({
      animationKey: `zs_${baseFolder}_${candidateState}`,
      textureKey: `zombie_${baseFolder}_${candidateState}`,
    }));
  }

  private playZombieStateVisual(zombie: ZombieState, state: ZombieAnimState) {
    const fallbackTexture = zombie.isBoss ? 'zombie_fallback_boss' : this.getZombieFallbackTexture(zombie.type);
    const candidates = this.getZombieVisualCandidates(zombie, state);

    for (const candidate of candidates) {
      if (this.anims.exists(candidate.animationKey) || hasUsableTexture(this, candidate.textureKey)) {
        safePlaySpriteAnimation(
          this,
          zombie.body,
          candidate.animationKey,
          candidate.textureKey,
          fallbackTexture,
          state === 'death' ? false : true,
        );
        zombie.lastAnimatedState = state;
        return;
      }
    }

    safePlaySpriteAnimation(this, zombie.body, '', fallbackTexture, fallbackTexture, false);
    zombie.lastAnimatedState = state;
  }

  private safeDestroyZombieVisual(zombie: ZombieState) {
    safeDestroyGameObject(zombie.container);
    safeDestroyGameObject(zombie.shadow);
    safeDestroyGameObject(zombie.hpBg);
    safeDestroyGameObject(zombie.hpFill);
    safeDestroyGameObject(zombie.label);
  }

  private getSpawnSectionsForRound() {
    const unlocked = this.getUnlockedSections();
    const available = new Set<ZombiesSectionId>(['start']);
    if (this.round >= 3) available.add('yard');
    if (this.round >= 6) available.add('workshop');
    if (this.round >= 9) available.add('street');
    if (this.bossRoundActive) {
      available.add('workshop');
      available.add('street');
    }
    const unlockedIds = new Set(unlocked.map((section) => section.id));
    const sections = unlocked.filter((section) => available.has(section.id) && unlockedIds.has(section.id));
    return sections.length ? sections : unlocked.filter((section) => section.id === 'start');
  }

  private getSectionSpawnWeight(sectionId: ZombiesSectionId) {
    if (this.bossRoundActive) {
      if (sectionId === 'street') return 5;
      if (sectionId === 'workshop') return 4;
      if (sectionId === 'yard') return 2;
      return 1;
    }
    if (this.round < 3) return sectionId === 'start' ? 5 : 0;
    if (this.round < 6) return sectionId === 'yard' ? 4 : sectionId === 'start' ? 2 : 0;
    if (this.round < 9) return sectionId === 'workshop' ? 4 : sectionId === 'yard' ? 3 : sectionId === 'start' ? 1 : 0;
    return sectionId === 'street' ? 5 : sectionId === 'workshop' ? 3 : sectionId === 'yard' ? 2 : 1;
  }

  private ensureAudioContext() {
    if (this.audioContext) return this.audioContext;
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return undefined;
      this.audioContext = new AudioCtor();
      return this.audioContext;
    } catch {
      return undefined;
    }
  }

  private playZombiesSfx(kind: 'round_start' | 'boss_round' | 'spawn' | 'stomp' | 'breach') {
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      const settings = {
        round_start: { freq: 520, freq2: 720, duration: 0.12, volume: 0.018, type: 'square' as OscillatorType },
        boss_round: { freq: 220, freq2: 140, duration: 0.22, volume: 0.03, type: 'sawtooth' as OscillatorType },
        spawn: { freq: 180, freq2: 140, duration: 0.08, volume: 0.012, type: 'triangle' as OscillatorType },
        stomp: { freq: 90, freq2: 70, duration: 0.06, volume: 0.014, type: 'square' as OscillatorType },
        breach: { freq: 150, freq2: 110, duration: 0.12, volume: 0.02, type: 'sawtooth' as OscillatorType },
      }[kind];

      osc.type = settings.type;
      osc.frequency.setValueAtTime(settings.freq, now);
      osc.frequency.exponentialRampToValueAtTime(settings.freq2, now + settings.duration);
      gain.gain.setValueAtTime(settings.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);
      osc.start(now);
      osc.stop(now + settings.duration);
    } catch {
      // Audio is intentionally best-effort only.
    }
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
    this.drawDepthsPad();
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

  private drawDepthsPad() {
    this.depthsRing = this.add.ellipse(DEPTHS_PAD.x, DEPTHS_PAD.y, DEPTHS_PAD.radius * 2.4, DEPTHS_PAD.radius * 1.3, 0xB05CFF, 0.05).setDepth(15);
    this.depthsRing.setStrokeStyle(2, 0xB05CFF, 0.2);
    this.tweens.add({
      targets: this.depthsRing,
      alpha: { from: 0.05, to: 0.18 },
      scaleX: 1.06,
      scaleY: 1.08,
      yoyo: true,
      repeat: -1,
      duration: 980,
      ease: 'Sine.easeInOut',
    });
    this.depthsLabel = this.add.text(DEPTHS_PAD.x, DEPTHS_PAD.y - 58, 'DEPTHS LOCKED', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#9B7BBF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);
    this.updateDepthsAccessVisual();
  }

  private updateDepthsAccessVisual() {
    if (!this.depthsRing || !this.depthsLabel) return;
    const open = this.allowDepthsGate && this.depthsUnlocked;
    this.depthsRing.setFillStyle(open ? 0xFF6EA8 : 0xB05CFF, open ? 0.12 : 0.05);
    this.depthsRing.setStrokeStyle(2, open ? 0xFF6EA8 : 0xB05CFF, open ? 0.58 : 0.2);
    this.depthsLabel.setText(open ? 'BASEMENT DEPTHS' : 'DEPTHS LOCKED');
    this.depthsLabel.setColor(open ? '#FF9DC8' : '#9B7BBF');
    this.depthsRing.setVisible(this.allowDepthsGate);
    this.depthsLabel.setVisible(this.allowDepthsGate);
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

  private isSharedCoopEnabled() {
    return this.scene.key === 'BasementZombiesScene';
  }

  private isSharedRunHost() {
    return this.isSharedCoopEnabled() && this.sharedRunHostId === this.playerId;
  }

  private initSharedRunPlayerState() {
    if (!this.isSharedCoopEnabled()) return;
    this.sharedRunPlayers.set(this.playerId, {
      player_id: this.playerId,
      username: this.playerUsername,
      x: this.px,
      y: this.py,
      hp: this.hp,
      alive: true,
      joinedAt: Date.now(),
      lastDamageAt: 0,
    });
  }

  private syncLocalSharedPlayerState() {
    if (!this.isSharedCoopEnabled()) return;
    const current = this.sharedRunPlayers.get(this.playerId);
    this.sharedRunPlayers.set(this.playerId, {
      player_id: this.playerId,
      username: this.playerUsername,
      x: this.px,
      y: this.py,
      hp: current?.hp ?? this.hp,
      alive: current?.alive ?? !this.gameOver,
      joinedAt: current?.joinedAt ?? Date.now(),
      lastDamageAt: current?.lastDamageAt ?? 0,
    });
  }

  private applySharedPlayerStateToLocal() {
    if (!this.isSharedCoopEnabled()) return;
    const local = this.sharedRunPlayers.get(this.playerId);
    if (!local) return;
    this.hp = local.hp;
    this.gameOver = !local.alive;
  }

  private setupPlayer() {
    this.player = new AvatarRenderer(this, this.px, this.py, this.avatarConfig);
    this.player.setDepth(60);
    this.playerName = this.add.text(this.px, this.py - 44, this.playerUsername, {
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
    this.keyI = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyJ = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keyK = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
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
      this.ensureAudioContext();
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

    this.powerupBanner = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, 132, '', {
      fontSize: '11px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 5,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1200).setAlpha(0);

    this.bossIntroText = this.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT / 2, '', {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6A6A',
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1300).setAlpha(0);

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
    this.boxGlow = this.add.ellipse(BOX_POS.x, BOX_POS.y + 30, 116, 38, 0xff7cce, 0.08).setDepth(20);
    this.boxGlow.setStrokeStyle(1, 0xFF7CCE, 0.24);
    this.boxLid = this.add.rectangle(BOX_POS.x, BOX_POS.y - 8, 88, 30, 0x6F2B78, 1).setDepth(22);
    this.boxLid.setStrokeStyle(2, 0xFF7CCE, 0.72);
    this.boxBase = this.add.rectangle(BOX_POS.x, BOX_POS.y + 18, 96, 42, 0x31183E, 1).setDepth(21);
    this.boxBase.setStrokeStyle(2, 0xF5C842, 0.55);
    this.tweens.add({
      targets: [this.boxLid, this.boxBase, this.boxGlow],
      scaleX: { from: 0.99, to: 1.02 },
      scaleY: { from: 0.99, to: 1.02 },
      alpha: { from: 0.82, to: 1 },
      yoyo: true,
      repeat: -1,
      duration: 850,
      ease: 'Sine.easeInOut',
    });
    this.boxPreviewText = this.add.text(BOX_POS.x, BOX_POS.y + 60, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFD36A',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setDepth(23).setAlpha(0);

    this.packPad = this.add.rectangle(PACK_POS.x, PACK_POS.y + 8, 92, 64, 0x1b3142, 0.92).setDepth(21);
    this.packPad.setStrokeStyle(2, 0x46B3FF, 0.72);
    this.packLabel = this.add.text(PACK_POS.x, PACK_POS.y - 26, 'PACK-A-PUNCH', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#7CC9FF',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setDepth(22);
    this.add.text(PACK_POS.x, PACK_POS.y + 38, 'POWER YOUR GUN', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B7D8FF',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5).setDepth(22);
  }

  private renderHud() {
    const weapon = this.getWeaponStats(this.currentWeapon);
    const ammo = this.weaponInventory[this.currentWeapon];
    const doubleSeconds = this.doublePointsUntil > this.time.now
      ? Math.ceil((this.doublePointsUntil - this.time.now) / 1000)
      : 0;
    const instaSeconds = this.instaKillUntil > this.time.now
      ? Math.ceil((this.instaKillUntil - this.time.now) / 1000)
      : 0;
    const timedBuffs = [
      doubleSeconds > 0 ? `2X PTS ${doubleSeconds}s` : '',
      instaSeconds > 0 ? `INSTA KILL ${instaSeconds}s` : '',
    ].filter(Boolean).join('  ');
    const roundState = this.roundBreakUntil > this.time.now
      ? `INTER ${Math.ceil((this.roundBreakUntil - this.time.now) / 1000)}s`
      : this.nextSpawnAt > this.time.now && this.spawnedThisRound === 0
        ? `WAVE ${Math.ceil((this.nextSpawnAt - this.time.now) / 1000)}s`
        : this.boxRollingUntil > this.time.now
          ? 'BOX GIRANDO'
          : this.reloadEndsAt > this.time.now
            ? 'RECARGANDO'
            : 'EN PIE';
    this.roundText?.setText(`ROUND ${this.round}`);
    this.pointsText?.setText(`PTS ${this.points}`);
    this.hpText?.setText(`HP ${Math.max(0, Math.round(this.hp))}`);
    this.ammoText?.setText(`${weapon.displayLabel}\n${ammo.ammoInMag}/${ammo.reserveAmmo}`);
    this.statusText?.setText([
      this.gameOver ? 'GAME OVER' : timedBuffs || roundState,
      `ZOMBIES ${this.countAliveZombies()}/${this.roundTarget}`,
      `SPAWN ${this.spawnedThisRound}`,
      this.allowDepthsGate && this.depthsUnlocked ? 'DEPTHS OPEN' : '',
      this.bossAlive ? 'BOSS ACTIVE' : this.bossRoundActive && !this.bossSpawnedThisRound ? 'BOSS INCOMING' : '',
    ].filter(Boolean).join('\n'));
    this.inventoryText?.setText(`ARMAS ${this.weaponOrder.map((id) => {
      const label = this.getWeaponStats(id).displayLabel;
      return id === this.currentWeapon ? `[${label}]` : label;
    }).join('  ')}`);

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

  private showPowerupBanner(text: string, color = '#FFFFFF') {
    if (!this.powerupBanner) return;
    this.powerupBanner.setText(text);
    this.powerupBanner.setColor(color);
    this.powerupBanner.setAlpha(1);
    this.powerupBanner.setScale(1.15);
    this.tweens.killTweensOf(this.powerupBanner);
    this.tweens.add({
      targets: this.powerupBanner,
      alpha: { from: 1, to: 0 },
      scaleX: 1,
      scaleY: 1,
      duration: 1800,
      ease: 'Sine.easeOut',
    });
  }

  private beginRound() {
    this.round += 1;
    this.roundTarget = getRoundZombieCount(this.round);
    this.spawnedThisRound = 0;
    this.nextSpawnAt = this.time.now + getRoundWarmupMs(this.round);
    this.roundBreakUntil = 0;
    this.bossRoundActive = this.isBossRound(this.round);
    this.bossSpawnedThisRound = false;
    this.bossAlive = false;
    this.showNotice(this.bossRoundActive ? `BOSS ROUND ${this.round}` : `ROUND ${this.round}`, this.bossRoundActive ? '#FF6A6A' : '#FFB36A');
    if (this.bossRoundActive) {
      this.triggerBossRoundIntro(`BOSS ROUND ${this.round}\nSURVIVE THE HUNT`);
    }
    if (!this.bossRoundActive) {
      this.playZombiesSfx('round_start');
    }
    this.updateDepthsAccessVisual();
    this.renderHud();
    if (this.isSharedRunHost()) {
      this.lastSharedSnapshotSentAt = 0;
    }
  }

  private isBossRound(round: number) {
    return round >= 10 && round % 10 === 0;
  }

  update(_time: number, delta: number) {
    if (this.controls.isActionJustDown('back')) {
      this.requestExit();
      return;
    }

    if (this.gameOver && !this.isSharedCoopEnabled()) {
      if (this.controls.isActionJustDown('interact')) {
        this.restartRun();
      }
      this.updatePromptHud({ kind: 'exit', x: EXIT_PAD.x, y: EXIT_PAD.y, radius: EXIT_PAD.radius, label: 'INTERACT REINICIAR  |  BACK SALIR', color: 0xFF6A6A });
      this.renderHud();
      return;
    }

    if (!this.gameOver) {
      this.handleMovement();
      this.handleCombatInput();
      this.handleContextInteraction();
    }

    if (!this.isSharedCoopEnabled() || this.isSharedRunHost()) {
      this.handleRoundFlow();
      this.updateZombies(delta);
      this.updateZombieProjectiles(delta);
      this.updatePickups();
      this.maybeBroadcastSharedSnapshot();
    }

    this.updatePromptHud(this.getNearbyInteraction());
    this.syncPosition();
    this.updateRemotePlayers();
    this.applySharedPlayerStateToLocal();
    this.player.update(this.lastIsMoving, this.input.activePointer.worldX - this.px, this.lastMoveDy);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(Math.floor(this.py / 10));
    this.playerName.setPosition(this.px, this.py - 44);
    this.chatSystem?.updatePosition('__player__', this.px, this.py);
    this.chatSystem?.update();
    this.renderHud();
  }

  private handleMovement() {
    let { dx, dy } = this.controls.readMovement(true);

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
    }

    const speed = ZOMBIES_PLAYER.speed * (this.reloadEndsAt > this.time.now ? 0.78 : 1);
    const nextX = this.px + dx * speed * this.game.loop.delta / 1000;
    const nextY = this.py + dy * speed * this.game.loop.delta / 1000;
    const prevX = this.px;
    const prevY = this.py;
    const moved = this.tryMovePlayer(nextX, nextY);
    if (moved) {
      const dist = Math.hypot(this.px - prevX, this.py - prevY);
      if (dist > 0.5) recordDistanceDelta(dist);
    }
    this.lastIsMoving = moved;
    this.lastMoveDx = moved ? dx : 0;
    this.lastMoveDy = moved ? dy : 0;
    this.syncLocalSharedPlayerState();
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
    if (this.boxRollingUntil > this.time.now) return;

    if (this.controls.isActionDown('shoot')) {
      this.tryShoot(this.input.activePointer.worldX, this.input.activePointer.worldY);
    }

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
        this.showNotice(`ARMADO ${this.getWeaponStats(weaponId).displayLabel}`, '#7CC9FF');
      }
    }
  }

  private tryShoot(targetX: number, targetY: number) {
    if (this.gameOver) return;
    if (this.reloadEndsAt > this.time.now) return;
    if (this.boxRollingUntil > this.time.now) return;

    const weapon = this.getWeaponStats(this.currentWeapon);
    const ammo = this.weaponInventory[this.currentWeapon];
    if (this.time.now - this.lastShotAt < weapon.fireDelayMs) return;
    if (ammo.ammoInMag <= 0) {
      this.tryReload();
      return;
    }

    ammo.ammoInMag -= 1;
    this.lastShotAt = this.time.now;
    this.player.playShoot();
    this.fireShotBurst(this.playerId, this.playerUsername, this.px, this.py, targetX, targetY, weapon, !this.isSharedCoopEnabled() || this.isSharedRunHost());
    if (this.isSharedCoopEnabled()) {
      this.broadcastSharedShot({
        player_id: this.playerId,
        username: this.playerUsername,
        originX: this.px,
        originY: this.py,
        targetX,
        targetY,
        pellets: weapon.pellets,
        spread: weapon.spread,
        range: weapon.range,
        damage: weapon.damage,
        color: weapon.color,
      });
    }

    if (ammo.ammoInMag <= 0 && ammo.reserveAmmo > 0) {
      this.time.delayedCall(140, () => this.tryReload());
    }
  }

  private tryReload() {
    const ammo = this.weaponInventory[this.currentWeapon];
    const weapon = this.getWeaponStats(this.currentWeapon);
    if (this.reloadEndsAt > this.time.now) return;
    if (ammo.reserveAmmo <= 0 || ammo.ammoInMag >= weapon.magazineSize) return;

    const reloadingWeaponId = this.currentWeapon;
    this.reloadEndsAt = this.time.now + weapon.reloadMs;
    this.showNotice(`RECARGANDO ${weapon.displayLabel}`, '#9EFFB7');
    this.time.delayedCall(weapon.reloadMs, () => {
      const currentAmmo = this.weaponInventory[reloadingWeaponId];
      const currentWeapon = this.getWeaponStats(reloadingWeaponId);
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
    this.showNotice(`ARMADO ${this.getWeaponStats(next).displayLabel}`, '#7CC9FF');
  }

  private fireShotBurst(
    shooterId: string,
    _username: string,
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weapon: {
      pellets: number;
      spread: number;
      range: number;
      damage: number;
      color: number;
    },
    applyDamage: boolean,
  ) {
    const baseAngle = Phaser.Math.Angle.Between(originX, originY, targetX, targetY);
    for (let i = 0; i < weapon.pellets; i += 1) {
      const angle = baseAngle + Phaser.Math.FloatBetween(-weapon.spread, weapon.spread);
      const hit = this.findZombieTargetFrom(originX, originY, angle, weapon.range);
      const endX = hit ? hit.x : originX + Math.cos(angle) * weapon.range;
      const endY = hit ? hit.y : originY + Math.sin(angle) * weapon.range;
      this.drawShotFxFrom(originX, originY, endX, endY, weapon.color);
      if (applyDamage && hit) {
        this.damageZombie(hit, weapon.damage);
      }
    }
  }

  private drawShotFxFrom(originX: number, originY: number, endX: number, endY: number, color: number) {
    type TracerCfg = { width: number; alpha: number; dur: number; flashR: number; glow: boolean };
    const cfgMap: Partial<Record<ZombiesWeaponId, TracerCfg>> = {
      pistol:  { width: 1.5, alpha: 0.75, dur: 80,  flashR: 7,  glow: false },
      smg:     { width: 1,   alpha: 0.6,  dur: 50,  flashR: 6,  glow: false },
      shotgun: { width: 2.5, alpha: 0.65, dur: 100, flashR: 11, glow: false },
      rifle:   { width: 1,   alpha: 0.9,  dur: 120, flashR: 7,  glow: false },
      deagle:  { width: 2,   alpha: 0.8,  dur: 100, flashR: 9,  glow: false },
      cannon:  { width: 4,   alpha: 0.7,  dur: 130, flashR: 14, glow: false },
      raygun:  { width: 2.5, alpha: 1.0,  dur: 180, flashR: 10, glow: true  },
    };
    const tc: TracerCfg = cfgMap[this.currentWeapon] ?? { width: 2, alpha: 0.9, dur: 90, flashR: 8, glow: false };

    if (tc.glow) {
      const glow = this.add.line(0, 0, originX, originY - 8, endX, endY, color, 0.25)
        .setOrigin(0, 0).setDepth(159).setLineWidth(tc.width * 4, tc.width * 4);
      this.tweens.add({ targets: glow, alpha: 0, duration: tc.dur * 0.6, onComplete: () => glow.destroy() });
    }
    const tracer = this.add.line(0, 0, originX, originY - 8, endX, endY, color, tc.alpha).setOrigin(0, 0).setDepth(160);
    tracer.setLineWidth(tc.width, tc.width);
    const flash = this.add.circle(originX, originY - 10, tc.flashR, color, 0.85).setDepth(170);
    this.tweens.add({ targets: tracer, alpha: 0, duration: tc.dur, onComplete: () => tracer.destroy() });
    this.tweens.add({ targets: flash, alpha: 0, scale: 2.0, duration: tc.dur * 1.2, onComplete: () => flash.destroy() });
  }

  private findZombieTargetFrom(originX: number, originY: number, angle: number, maxRange: number) {
    let best: ZombieState | null = null;
    let bestAlong = Number.POSITIVE_INFINITY;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const zombie of this.zombies.values()) {
      if (!zombie.alive) continue;
      const dx = zombie.x - originX;
      const dy = zombie.y - originY;
      const along = dx * cos + dy * sin;
      if (along <= 0 || along > maxRange) continue;
      const perp = Math.abs(-sin * dx + cos * dy);
      if (perp > zombie.radius + 10) continue;
      if (this.isLineBlocked(originX, originY, zombie.x, zombie.y)) continue;
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

    const aliveZombies = this.countAliveZombies();

    if (this.bossRoundActive && !this.bossSpawnedThisRound && !this.bossAlive && aliveZombies === 0) {
      const spawnedBoss = this.spawnBossZombie();
      if (spawnedBoss) {
        this.bossSpawnedThisRound = true;
        this.bossAlive = true;
      }
      return;
    }

    if (
      !this.depthsUnlocked
      && this.allowDepthsGate
      && this.bossRoundActive
      && this.bossSpawnedThisRound
      && !this.bossAlive
      && aliveZombies === 0
      && this.zombieProjectiles.size === 0
    ) {
      this.depthsUnlocked = true;
      this.updateDepthsAccessVisual();
      this.showNotice('DEPTHS UNLOCKED', '#FF9DC8');
    }

    if (aliveZombies === 0 && !this.bossAlive && this.zombieProjectiles.size === 0 && this.roundBreakUntil === 0) {
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

  private getPointsMultiplier() {
    return this.doublePointsUntil > this.time.now ? 2 : 1;
  }

  private getWeaponState(weaponId: ZombiesWeaponId) {
    return this.weaponInventory[weaponId];
  }

  private getWeaponStats(weaponId: ZombiesWeaponId) {
    const base = ZOMBIES_WEAPONS[weaponId];
    const state = this.getWeaponState(weaponId);
    if (!state.upgraded) {
      return {
        ...base,
        displayLabel: base.label,
      };
    }

    return {
      ...base,
      damage: Math.round(base.damage * (weaponId === 'raygun' ? 1.45 : 1.7)),
      fireDelayMs: Math.max(
        weaponId === 'smg' ? 70 : 90,
        Math.round(base.fireDelayMs * 0.78),
      ),
      magazineSize: Math.round(base.magazineSize * (weaponId === 'shotgun' ? 1.6 : 1.5)),
      reserveAmmo: Math.round(base.reserveAmmo * 1.35),
      reloadMs: Math.max(800, Math.round(base.reloadMs * 0.8)),
      displayLabel: `${base.label}*`,
    };
  }

  private getPackCost(weaponId: ZombiesWeaponId) {
    return 5000;
  }

  private pickZombieType(): ZombieType {
    const eligible = getEligibleZombieTypes(this.round);
    const roll = Phaser.Math.Between(0, 99);
    if (this.bossRoundActive) {
      if (roll > 62) return 'brute';
      if (roll > 28) return 'runner';
      return 'walker';
    }
    if (this.round >= 6 && roll > 78) return 'brute';
    if (this.round >= 3 && roll > 52) return 'runner';
    return eligible.some((z) => z.type === 'walker') ? 'walker' : eligible[0].type;
  }

  private getUnlockedSections() {
    return ZOMBIES_SECTIONS.filter((section) => section.unlockedByDefault || this.doors.get(section.id)?.unlocked);
  }

  private getAvailableSpawnNodes() {
    const directedSectionIds = new Set(this.getSpawnSectionsForRound().map((section) => section.id));
    const nodes = [...this.spawnNodes.values()].filter((node) => !node.occupiedBy && directedSectionIds.has(node.sectionId));
    const distant = nodes.filter((node) => Phaser.Math.Distance.Between(this.px, this.py, node.x, node.y) >= 240);
    const pool = distant.length ? distant : nodes;
    return pool.sort((a, b) => {
      const weightDiff = this.getSectionSpawnWeight(b.sectionId) - this.getSectionSpawnWeight(a.sectionId);
      if (weightDiff !== 0) return weightDiff;
      if (a.boardHealth !== b.boardHealth) return a.boardHealth - b.boardHealth;
      return a.lastUsedAt - b.lastUsedAt;
    });
  }

  private showBossIntro(text: string) {
    if (!this.bossIntroText) return;
    this.bossIntroText.setText(text);
    this.bossIntroText.setAlpha(1);
    this.bossIntroText.setScale(0.86);
    this.tweens.killTweensOf(this.bossIntroText);
    this.tweens.add({
      targets: this.bossIntroText,
      scaleX: 1,
      scaleY: 1,
      alpha: { from: 1, to: 0 },
      duration: 1800,
      ease: 'Sine.easeOut',
    });
  }

  private triggerBossRoundIntro(text: string) {
    this.showBossIntro(text);
    this.showNotice('BOSS INCOMING', '#FF6A6A');
    this.cameras.main.flash(180, 120, 20, 20, false);
    this.cameras.main.shake(160, 0.0032);
    this.playZombiesSfx('boss_round');
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
    return this.spawnConfiguredZombie(node, {
      type,
      assetFolder: config.folder,
      displayLabel: config.label,
      hp: getZombieHpForRound(config.baseHp, this.round),
      speed: getZombieSpeedForRound(config.speed, this.round),
      damage: config.damage,
      attackRange: config.attackRange,
      attackCooldownMs: config.attackCooldownMs,
      hitReward: config.hitReward,
      killReward: config.killReward,
      radius: type === 'brute' ? 22 : type === 'runner' ? 15 : 18,
      breachMs: getZombieBreachMs(this.round, type),
      isBoss: false,
      noticeColor: '#FF8B3D',
    });
  }

  private spawnBossZombie() {
    const preferred = this.getAvailableSpawnNodes().filter((node) => node.sectionId === 'street' || node.sectionId === 'workshop');
    const candidates = preferred.length ? preferred : this.getAvailableSpawnNodes();
    if (!candidates.length) return false;
    const node = Phaser.Utils.Array.GetRandom(candidates);
    const hp = Math.round(getZombieHpForRound(420, this.round) * 1.35);
    const spawned = this.spawnConfiguredZombie(node, {
      type: 'brute',
      assetFolder: 'boss',
      displayLabel: 'BOSS',
      hp,
      speed: getZombieSpeedForRound(0.55, this.round),
      damage: 32,
      attackRange: 36,
      attackCooldownMs: 900,
      hitReward: 25,
      killReward: 420,
      radius: 28,
      breachMs: Math.max(700, getZombieBreachMs(this.round, 'brute') + 500),
      isBoss: true,
      noticeColor: '#FF3344',
    });
    if (spawned) {
      this.triggerBossRoundIntro('BOSS BREACHED\nTAKE COVER');
    }
    return spawned;
  }

  private createZombieEntity(config: {
    id: string;
    type: ZombieType;
    assetFolder: string;
    displayLabel: string;
    hp: number;
    maxHp: number;
    speed: number;
    damage: number;
    attackRange: number;
    attackCooldownMs: number;
    hitReward: number;
    killReward: number;
    radius: number;
    isBoss: boolean;
    x: number;
    y: number;
    phase: number;
    alive: boolean;
    spawnNodeId?: string;
    breachEndsAt: number;
    lastAttackAt: number;
    lastSpecialAt: number;
    lastStompAt: number;
    state: ZombieAnimState;
  }) {
    const shadow = this.add.ellipse(config.x, config.y + config.radius + 8, config.radius + 14, 14, 0x000000, 0.28);
    const fallbackTexture = config.isBoss ? 'zombie_fallback_boss' : this.getZombieFallbackTexture(config.type);
    const idleTexture = `zombie_${config.assetFolder}_idle`;
    const body = this.add.sprite(0, 0, this.textures.exists(idleTexture) ? idleTexture : fallbackTexture, 0);
    body.setOrigin(0.5, 0.7);
    body.setScale(config.isBoss ? 1.18 : config.type === 'brute' ? 1.15 : config.type === 'runner' ? 0.95 : 1);
    const hpBg = this.add.rectangle(0, -config.radius - 14, config.radius * 2, 4, 0x000000, 0.9);
    const hpFill = this.add.rectangle(-config.radius, -config.radius - 14, config.radius * 2, 4, 0x39FF14, 0.95).setOrigin(0, 0.5);
    const label = this.add.text(0, -config.radius - 26, config.displayLabel, {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: config.isBoss ? '#FF6A6A' : '#F5C842',
    }).setOrigin(0.5);

    const container = this.add.container(config.x, config.y, [body, hpBg, hpFill, label]);
    shadow.setDepth(29);
    container.setDepth(30);

    const zombie: ZombieState = {
      id: config.id,
      type: config.type,
      assetFolder: config.assetFolder,
      displayLabel: config.displayLabel,
      isBoss: config.isBoss,
      container,
      body,
      label,
      hpBg,
      hpFill,
      shadow,
      x: config.x,
      y: config.y,
      hp: config.hp,
      maxHp: config.maxHp,
      speed: config.speed,
      damage: config.damage,
      attackRange: config.attackRange,
      attackCooldownMs: config.attackCooldownMs,
      hitReward: config.hitReward,
      killReward: config.killReward,
      radius: config.radius,
      state: config.state,
      phase: config.phase,
      alive: config.alive,
      lastAttackAt: config.lastAttackAt,
      lastSpecialAt: config.lastSpecialAt,
      spawnNodeId: config.spawnNodeId,
      breachEndsAt: config.breachEndsAt,
      lastStompAt: config.lastStompAt,
      lastAnimatedState: undefined,
    };

    this.renderZombieHp(zombie);
    this.setZombieState(zombie, zombie.state);
    return zombie;
  }

  private spawnConfiguredZombie(
    node: SpawnNode,
    config: {
      type: ZombieType;
      assetFolder: string;
      displayLabel: string;
      hp: number;
      speed: number;
      damage: number;
      attackRange: number;
      attackCooldownMs: number;
      hitReward: number;
      killReward: number;
      radius: number;
      breachMs: number;
      isBoss: boolean;
      noticeColor: string;
    },
  ) {
    const zombie = this.createZombieEntity({
      id: `z_${this.zombieIdSeq += 1}`,
      type: config.type,
      assetFolder: config.assetFolder,
      displayLabel: config.displayLabel,
      hp: config.hp,
      maxHp: config.hp,
      speed: config.speed,
      damage: config.damage,
      attackRange: config.attackRange,
      attackCooldownMs: config.attackCooldownMs,
      hitReward: config.hitReward,
      killReward: config.killReward,
      radius: config.radius,
      isBoss: config.isBoss,
      x: node.x,
      y: node.y,
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      alive: true,
      spawnNodeId: node.id,
      breachEndsAt: this.time.now + config.breachMs,
      lastAttackAt: 0,
      lastSpecialAt: 0,
      lastStompAt: this.time.now,
      state: 'walk',
    });

    node.occupiedBy = zombie.id;
    node.lastUsedAt = this.time.now;
    this.refreshSpawnNodeVisual(node, 0, true);
    this.zombies.set(zombie.id, zombie);
    this.showNotice(`BREACH ${config.displayLabel}`, config.noticeColor);
    this.playZombiesSfx('spawn');
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
            if (this.time.now - this.lastStompSfxAt > 180) {
              this.lastStompSfxAt = this.time.now;
              this.playZombiesSfx('stomp');
            }
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
          this.playZombiesSfx('breach');
          this.releaseSpawnNode(zombie, false);
        }
        continue;
      }

      const target = this.getZombieTargetPlayer(zombie.x, zombie.y);
      if (!target) continue;
      const dx = target.x - zombie.x;
      const dy = target.y - zombie.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      if (dist > zombie.attackRange + 2) {
        const bossCanBurst = zombie.isBoss
          && dist >= 180
          && dist <= 460
          && !this.isLineBlocked(zombie.x, zombie.y, target.x, target.y);
        const canShoot = zombie.assetFolder === 'shooter'
          && dist >= 160
          && dist <= 340
          && !this.isLineBlocked(zombie.x, zombie.y, target.x, target.y);
        if (bossCanBurst) {
          zombie.state = 'attack';
          const lateral = Math.sin(this.time.now / 280 + zombie.phase) * 0.2;
          const driftX = zombie.x + (-ny * lateral) * zombie.speed * 30 * dt;
          const driftY = zombie.y + (nx * lateral) * zombie.speed * 30 * dt;
          if (!this.isBlocked(driftX, zombie.y, zombie.radius)) zombie.x = driftX;
          if (!this.isBlocked(zombie.x, driftY, zombie.radius)) zombie.y = driftY;
          if (this.time.now - zombie.lastAttackAt >= zombie.attackCooldownMs) {
            zombie.lastAttackAt = this.time.now;
            this.spawnBossProjectileBurst(zombie);
          }
        } else if (canShoot) {
          zombie.state = 'attack';
          const lateral = Math.sin(this.time.now / 360 + zombie.phase) * 0.3;
          const orbitX = zombie.x + (-ny * lateral) * zombie.speed * 42 * dt;
          const orbitY = zombie.y + (nx * lateral) * zombie.speed * 42 * dt;
          if (!this.isBlocked(orbitX, zombie.y, zombie.radius)) zombie.x = orbitX;
          if (!this.isBlocked(zombie.x, orbitY, zombie.radius)) zombie.y = orbitY;
          if (this.time.now - zombie.lastAttackAt >= zombie.attackCooldownMs) {
            zombie.lastAttackAt = this.time.now;
            this.spawnZombieProjectile(zombie);
          }
        } else {
          const lateral = Math.sin(this.time.now / 320 + zombie.phase) * (zombie.type === 'runner' ? 0.42 : zombie.type === 'brute' ? 0.08 : 0.22);
          const moveX = (nx - ny * lateral) * zombie.speed * 60 * dt;
          const moveY = (ny + nx * lateral) * zombie.speed * 60 * dt;
          const nextX = zombie.x + moveX;
          const nextY = zombie.y + moveY;
          if (!this.isBlocked(nextX, zombie.y, zombie.radius)) zombie.x = nextX;
          if (!this.isBlocked(zombie.x, nextY, zombie.radius)) zombie.y = nextY;
          zombie.state = 'walk';
        }
      } else {
        zombie.state = 'attack';
        if (zombie.isBoss && this.time.now - zombie.lastSpecialAt >= 1500) {
          zombie.lastSpecialAt = this.time.now;
          this.performBossSlam(zombie);
        } else if (this.time.now - zombie.lastAttackAt >= zombie.attackCooldownMs) {
          zombie.lastAttackAt = this.time.now;
          this.applyDamageToPlayer(target.player_id, zombie.damage);
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

  private spawnZombieProjectile(
    zombie: ZombieState,
    angle = (() => {
      const target = this.getZombieTargetPlayer(zombie.x, zombie.y);
      return Phaser.Math.Angle.Between(zombie.x, zombie.y - 10, target?.x ?? this.px, (target?.y ?? this.py) - 6);
    })(),
    speed = zombie.isBoss ? 260 : 220,
    radius = zombie.isBoss ? 7 : 5,
    damage = zombie.isBoss ? Math.round(zombie.damage * 0.8) : Math.max(8, Math.round(zombie.damage * 0.7)),
  ) {
    const projectile = this.createZombieProjectileEntity({
      id: `zp_${++this.zombieProjectileSeq}`,
      x: zombie.x,
      y: zombie.y - 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      radius,
      expiresAt: this.time.now + 2400,
    });
    this.zombieProjectiles.set(projectile.id, projectile);
  }

  private createZombieProjectileEntity(snapshot: Omit<ZombieProjectile, 'body' | 'glow'>) {
    const glowColor = snapshot.radius >= 7 ? 0xFF5C7A : 0x9BFF4F;
    const glow = this.add.ellipse(snapshot.x, snapshot.y, snapshot.radius * 4.5, snapshot.radius * 2.8, glowColor, 0.18).setDepth(154);
    glow.setStrokeStyle(1, glowColor, 0.45);
    const body = this.add.circle(snapshot.x, snapshot.y, snapshot.radius, glowColor, 0.92).setDepth(155);
    return {
      ...snapshot,
      body,
      glow,
    };
  }

  private spawnBossProjectileBurst(zombie: ZombieState) {
    const target = this.getZombieTargetPlayer(zombie.x, zombie.y);
    const baseAngle = Phaser.Math.Angle.Between(zombie.x, zombie.y - 10, target?.x ?? this.px, (target?.y ?? this.py) - 6);
    for (const offset of [-0.22, 0, 0.22]) {
      this.spawnZombieProjectile(zombie, baseAngle + offset, 285, 7, Math.max(14, Math.round(zombie.damage * 0.72)));
    }
    this.cameras.main.shake(70, 0.0016);
  }

  private performBossSlam(zombie: ZombieState) {
    const shock = this.add.circle(zombie.x, zombie.y, zombie.radius + 12, 0xFF5C7A, 0.18).setDepth(150);
    this.tweens.add({
      targets: shock,
      alpha: 0,
      scale: 2.3,
      duration: 220,
      ease: 'Sine.easeOut',
      onComplete: () => shock.destroy(),
    });
    this.cameras.main.shake(110, 0.0024);
    for (const player of this.getAliveSharedTargets()) {
      if (Phaser.Math.Distance.Between(zombie.x, zombie.y, player.x, player.y) <= zombie.attackRange + 34) {
        this.applyDamageToPlayer(player.player_id, Math.round(zombie.damage * 1.2));
      }
    }
  }

  private updateZombieProjectiles(delta: number) {
    const dt = delta / 1000;
    for (const projectile of [...this.zombieProjectiles.values()]) {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.body.setPosition(projectile.x, projectile.y);
      projectile.glow.setPosition(projectile.x, projectile.y);

      if (
        projectile.x < 0
        || projectile.y < 0
        || projectile.x > ZOMBIES_WORLD.WIDTH
        || projectile.y > ZOMBIES_WORLD.HEIGHT
        || this.time.now >= projectile.expiresAt
        || this.isBlocked(projectile.x, projectile.y, projectile.radius)
      ) {
        this.destroyZombieProjectile(projectile.id);
        continue;
      }

      const targetPlayer = this.getProjectileHitTarget(projectile);
      if (targetPlayer) {
        this.applyDamageToPlayer(targetPlayer.player_id, projectile.damage);
        this.destroyZombieProjectile(projectile.id);
      }
    }
  }

  private destroyZombieProjectile(id: string) {
    const projectile = this.zombieProjectiles.get(id);
    if (!projectile) return;
    projectile.body.destroy();
    projectile.glow.destroy();
    this.zombieProjectiles.delete(id);
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
      safeSceneDelayedCall(this, 650, () => {
        if (!node.occupiedBy) {
          this.refreshSpawnNodeVisual(node, 0, false);
        }
      }, 'releaseSpawnNode reset');
    }
  }

  private renderZombieHp(zombie: ZombieState) {
    if (!zombie.hpFill?.scene || zombie.hpFill.active === false) return;
    const progress = Phaser.Math.Clamp(zombie.hp / zombie.maxHp, 0, 1);
    zombie.hpFill.width = zombie.radius * 2 * progress;
    zombie.hpFill.setFillStyle(progress > 0.45 ? 0x39FF14 : progress > 0.2 ? 0xF5C842 : 0xFF5E5E, 0.95);
  }

  private getAliveSharedTargets() {
    if (!this.isSharedCoopEnabled()) {
      return [{
        player_id: this.playerId,
        username: this.playerUsername,
        x: this.px,
        y: this.py,
        hp: this.hp,
        alive: !this.gameOver,
        joinedAt: Date.now(),
        lastDamageAt: this.lastDamageAt,
      }];
    }
    return [...this.sharedRunPlayers.values()].filter((player) => player.alive);
  }

  private getZombieTargetPlayer(zombieX: number, zombieY: number) {
    const alivePlayers = this.getAliveSharedTargets();
    if (!alivePlayers.length) return null;
    let best = alivePlayers[0];
    let bestDist = Phaser.Math.Distance.Between(zombieX, zombieY, best.x, best.y);
    for (const player of alivePlayers.slice(1)) {
      const nextDist = Phaser.Math.Distance.Between(zombieX, zombieY, player.x, player.y);
      if (nextDist < bestDist) {
        best = player;
        bestDist = nextDist;
      }
    }
    return best;
  }

  private getProjectileHitTarget(projectile: ZombieProjectile) {
    return this.getAliveSharedTargets().find((player) =>
      Phaser.Math.Distance.Between(projectile.x, projectile.y, player.x, player.y) <= projectile.radius + ZOMBIES_PLAYER.radius
    ) ?? null;
  }

  private applyDamageToPlayer(playerId: string, amount: number) {
    if (!this.isSharedCoopEnabled()) {
      this.applyPlayerDamage(amount);
      return;
    }
    const player = this.sharedRunPlayers.get(playerId);
    if (!player || !player.alive) return;
    if (this.time.now - player.lastDamageAt < 320) return;
    player.lastDamageAt = this.time.now;
    player.hp = Math.max(0, player.hp - amount);
    if (player.hp <= 0) {
      player.alive = false;
    }
    if (playerId === this.playerId) {
      this.hp = player.hp;
      if (player.hp > 0) {
        this.player.playHurt();
        this.showFloatingText(`-${amount}`, this.px, this.py - 52, '#FF6A6A');
        this.cameras.main.shake(90, 0.0028);
      } else {
        this.gameOver = true;
        this.reloadEndsAt = 0;
        this.boxRollingUntil = 0;
        this.lastIsMoving = false;
        this.lastMoveDx = 0;
        this.player.playDeath();
        this.showNotice('CAISTE - EL TEAM SIGUE', '#FF6A6A');
      }
    }
    this.sharedRunPlayers.set(playerId, player);
    if (this.isSharedRunHost()) {
      this.lastSharedSnapshotSentAt = 0;
      this.maybeScheduleSharedReset();
    }
  }

  private isZombieRenderable(zombie: ZombieState) {
    return !!zombie.body?.scene
      && zombie.body.active !== false
      && !!zombie.body.texture
      && !!zombie.body.anims
      && !!zombie.container?.scene
      && zombie.container.active !== false
      && !!zombie.shadow?.scene
      && zombie.shadow.active !== false
      && !!zombie.label?.scene
      && zombie.label.active !== false;
  }

  private getZombieDeathDurationMs(zombie: ZombieState) {
    const fallbackMs = zombie.isBoss ? 780 : 420;
    const candidates = this.getZombieVisualCandidates(zombie, 'death');
    for (const candidate of candidates) {
      const duration = getSafeAnimationDurationMs(this, candidate.animationKey, 0);
      if (duration > 0) return Math.max(fallbackMs, duration);
    }
    return fallbackMs;
  }

  private setZombieState(zombie: ZombieState, state: ZombieAnimState) {
    if (!this.isZombieRenderable(zombie)) return;
    zombie.state = state;
    const bob = state === 'walk'
      ? Math.sin(this.time.now / 110 + zombie.phase) * 2.4
      : state === 'attack'
        ? Math.sin(this.time.now / 60 + zombie.phase) * 1.6
        : state === 'spawn'
          ? Math.sin(this.time.now / 70 + zombie.phase) * 1.2
          : 0;
    safeWithLiveSprite(zombie.body, (body) => {
      body.setY(bob);
      body.setScale(
        state === 'hurt'
          ? 1.06
          : state === 'attack'
            ? 1.04
            : state === 'spawn'
              ? 1.02
              : 1,
      );
      body.setFlipX(this.px < zombie.x);
    }, `setZombieState:${zombie.displayLabel}:${state}`);
    if (zombie.label?.scene && zombie.label.active !== false) {
      zombie.label.setAlpha(state === 'death' ? 0 : 1);
    }

    if (zombie.lastAnimatedState !== state) {
      this.playZombieStateVisual(zombie, state);
    }
  }

  private damageZombie(zombie: ZombieState, damage: number) {
    if (!zombie.alive) return;
    const appliedDamage = this.instaKillUntil > this.time.now ? zombie.hp : damage;
    const pointMultiplier = this.getPointsMultiplier();
    const hitReward = zombie.hitReward * pointMultiplier;
    zombie.hp -= appliedDamage;
    zombie.state = 'hurt';
    this.points += hitReward;
    this.showFloatingText(`+${hitReward}`, zombie.x, zombie.y - 18, pointMultiplier > 1 ? '#FFB36A' : '#F5C842');
    if (zombie.hp > 0) return;

    this.setZombieState(zombie, 'death');
    zombie.alive = false;
    this.releaseSpawnNode(zombie, true);
    if (zombie.isBoss) {
      this.bossAlive = false;
      this.playZombiesSfx('boss_round');
      this.showNotice('BOSS DOWN', '#FF9DC8');
    }
    const killReward = zombie.killReward * pointMultiplier;
    this.points += killReward;
    eventBus.emit(EVENTS.STATS_ZOMBIE_KILL);
    if (zombie.shadow?.scene && zombie.shadow.active !== false) {
      zombie.shadow.setAlpha(0.18);
    }
    this.updateDepthsAccessVisual();
    this.showFloatingText(`+${killReward} ${zombie.displayLabel}`, zombie.x, zombie.y - 34, pointMultiplier > 1 ? '#FFD36A' : '#9EFFB7');
    this.tryDropPickup(zombie.x, zombie.y);
    const burst = this.add.circle(zombie.x, zombie.y - 8, zombie.radius + 8, 0xFF6A6A, 0.26).setDepth(80);
    this.tweens.add({ targets: burst, alpha: 0, scale: 1.9, duration: 220, onComplete: () => burst.destroy() });
    if (this.isSharedRunHost()) {
      this.lastSharedSnapshotSentAt = 0;
    }
    safeSceneDelayedCall(this, this.getZombieDeathDurationMs(zombie), () => {
      this.safeDestroyZombieVisual(zombie);
      this.zombies.delete(zombie.id);
      if (this.isSharedRunHost()) {
        this.lastSharedSnapshotSentAt = 0;
      }
    }, `zombie-death-cleanup:${zombie.id}`);
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
    this.player.playHurt();
    this.showFloatingText(`-${amount}`, this.px, this.py - 52, '#FF6A6A');
    this.cameras.main.shake(90, 0.0028);
    if (this.hp > 0) return;

    this.gameOver = true;
    this.reloadEndsAt = 0;
    this.boxRollingUntil = 0;
    this.lastIsMoving = false;
    this.lastMoveDx = 0;
    this.player.playDeath();
    eventBus.emit(EVENTS.STATS_PVP_RESULT, { won: false }); // reuse death event for zombie death
    this.showNotice('GAME OVER - SPACE REINICIAR', '#FF6A6A');
  }

  private restartRun() {
    if (this.restartPending) return;
    this.restartPending = true;
    this.input.enabled = false;
    try {
      this.player.clearActionState();
    } catch (error) {
      console.error('[Waspi] Failed to clear player animation state before zombies restart.', error);
    }
    this.cameras.main.stopFollow();
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.scene.restart({
      returnScene: this.returnScene,
      returnX: this.returnX,
      returnY: this.returnY,
      entryLabel: this.entryLabel,
      allowDepthsGate: this.allowDepthsGate,
      modeLabel: this.modeLabel,
    });
  }

  private handleContextInteraction() {
    if (!this.controls.isActionJustDown('interact')) return;
    const option = this.getNearbyInteraction();
    if (!option) return;

    if (option.kind === 'exit') {
      this.requestExit();
      return;
    }
    if (option.kind === 'door' && option.sectionId) {
      if (this.isSharedCoopEnabled() && !this.isSharedRunHost()) {
        this.broadcastSharedInteract({ player_id: this.playerId, kind: 'door', sectionId: option.sectionId, px: this.px, py: this.py });
        return;
      }
      this.tryUnlockDoor(option.sectionId);
      return;
    }
    if (option.kind === 'box') {
      if (this.isSharedCoopEnabled() && !this.isSharedRunHost()) {
        this.broadcastSharedInteract({ player_id: this.playerId, kind: 'box', px: this.px, py: this.py });
        return;
      }
      this.tryRollMysteryBox();
      return;
    }
    if (option.kind === 'upgrade') {
      if (this.isSharedCoopEnabled() && !this.isSharedRunHost()) {
        this.broadcastSharedInteract({ player_id: this.playerId, kind: 'upgrade', weaponId: this.currentWeapon, px: this.px, py: this.py });
        return;
      }
      this.tryUpgradeCurrentWeapon();
      return;
    }
    if (option.kind === 'depths') {
      this.enterBasementDepths();
      return;
    }

    if (option.kind === 'repair' && option.nodeId) {
      if (this.isSharedCoopEnabled() && !this.isSharedRunHost()) {
        this.broadcastSharedInteract({ player_id: this.playerId, kind: 'repair', nodeId: option.nodeId });
        return;
      }
      this.tryRepairBarricade(option.nodeId);
    }
  }

  private getNearbyInteraction(): InteractionOption | null {
    const options: InteractionOption[] = [];

    if (Phaser.Math.Distance.Between(this.px, this.py, EXIT_PAD.x, EXIT_PAD.y) <= EXIT_PAD.radius + 24) {
      options.push({ kind: 'exit', x: EXIT_PAD.x, y: EXIT_PAD.y, radius: EXIT_PAD.radius + 18, label: `E VOLVER A ${this.entryLabel}`, color: 0x39FF14 });
    }

    const boxRadius = 74;
    if (Phaser.Math.Distance.Between(this.px, this.py, BOX_POS.x, BOX_POS.y) <= boxRadius) {
      const cooldown = Math.max(0, Math.ceil((this.mysteryBoxCooldownUntil - this.time.now) / 1000));
      options.push({
        kind: 'box',
        x: BOX_POS.x,
        y: BOX_POS.y + 8,
        radius: 56,
        label: this.boxRollingUntil > this.time.now
          ? 'BOX GIRANDO...'
          : cooldown > 0
            ? `BOX RECARGA ${cooldown}s`
            : `E MYSTERY BOX ${ZOMBIES_POINTS.mysteryBoxCost} PTS`,
        color: 0xFF7CCE,
      });
    }

    const workshopUnlocked = this.doors.get('workshop')?.unlocked ?? false;
    if (workshopUnlocked && Phaser.Math.Distance.Between(this.px, this.py, PACK_POS.x, PACK_POS.y) <= 76) {
      const weaponState = this.weaponInventory[this.currentWeapon];
      const weaponStats = this.getWeaponStats(this.currentWeapon);
      options.push({
        kind: 'upgrade',
        x: PACK_POS.x,
        y: PACK_POS.y,
        radius: 58,
        label: weaponState.upgraded
          ? `${weaponStats.displayLabel} AL MAX`
          : `E PACK ${weaponStats.displayLabel} ${this.getPackCost(this.currentWeapon)} PTS`,
        color: 0x46B3FF,
      });
    }

    const depthsOpen = this.allowDepthsGate && this.depthsUnlocked;
    if (depthsOpen && Phaser.Math.Distance.Between(this.px, this.py, DEPTHS_PAD.x, DEPTHS_PAD.y) <= DEPTHS_PAD.radius + 34) {
      options.push({
        kind: 'depths',
        x: DEPTHS_PAD.x,
        y: DEPTHS_PAD.y,
        radius: DEPTHS_PAD.radius + 18,
        label: 'E BAJAR AL BASEMENT',
        color: 0xFF6EA8,
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
    if (this.isSharedRunHost()) {
      this.lastSharedSnapshotSentAt = 0;
    }
  }

  private tryRollMysteryBox() {
    if (this.boxRollingUntil > this.time.now) {
      this.showNotice('LA BOX ESTA GIRANDO', '#FF7CCE');
      return;
    }
    if (this.time.now < this.mysteryBoxCooldownUntil) {
      this.showNotice('LA BOX RECARGA', '#FF7CCE');
      return;
    }
    if (this.points < ZOMBIES_POINTS.mysteryBoxCost) {
      this.showNotice('NO ALCANZAN LOS PTS', '#FF6A6A');
      return;
    }

    this.points -= ZOMBIES_POINTS.mysteryBoxCost;
    this.mysteryBoxCooldownUntil = this.time.now + 3200;
    this.boxRollingUntil = this.time.now + 1400;
    if (this.boxLid) {
      this.tweens.killTweensOf(this.boxLid);
      this.tweens.add({
        targets: this.boxLid,
        y: BOX_POS.y - 26,
        angle: -7,
        duration: 160,
        ease: 'Back.Out',
      });
    }
    if (this.boxGlow) {
      this.tweens.killTweensOf(this.boxGlow);
      this.tweens.add({
        targets: this.boxGlow,
        alpha: { from: 0.14, to: 0.32 },
        scaleX: { from: 1, to: 1.16 },
        scaleY: { from: 1, to: 1.16 },
        yoyo: true,
        repeat: 6,
        duration: 110,
        ease: 'Sine.easeInOut',
      });
    }
    this.boxPreviewText?.setAlpha(1);
    this.boxPreviewText?.setColor('#FFD36A');
    this.boxPreviewText?.setText('ROLLING...');
    const weaponId = this.rollMysteryWeapon();
    const previewPool = Object.values(ZOMBIES_WEAPONS).filter((weapon) => weapon.mysteryWeight > 0);
    const steps = 9;
    for (let i = 0; i < steps; i += 1) {
      this.time.delayedCall(90 + i * 90, () => {
        if (!this.boxPreviewText || this.boxRollingUntil <= this.time.now) return;
        const preview = i === steps - 1 ? ZOMBIES_WEAPONS[weaponId] : Phaser.Utils.Array.GetRandom(previewPool);
        this.boxPreviewText.setText(preview.label);
        this.boxPreviewText.setColor(i === steps - 1 ? '#9EFFB7' : '#FFD36A');
      });
    }
    this.time.delayedCall(1450, () => {
      this.boxRollingUntil = 0;
      const ammo = this.weaponInventory[weaponId];
      const config = this.getWeaponStats(weaponId);
      const firstTime = !ammo.owned;
      ammo.owned = true;
      ammo.ammoInMag = config.magazineSize;
      ammo.reserveAmmo = Math.max(ammo.reserveAmmo, config.reserveAmmo);
      if (!this.weaponOrder.includes(weaponId)) {
        this.weaponOrder.push(weaponId);
      }
      this.currentWeapon = weaponId;
      if (this.boxPreviewText) {
        this.boxPreviewText.setText(config.displayLabel);
        this.tweens.add({
          targets: this.boxPreviewText,
          alpha: { from: 1, to: 0 },
          duration: 800,
          ease: 'Sine.easeOut',
        });
      }
      if (this.boxLid) {
        this.tweens.add({
          targets: this.boxLid,
          y: BOX_POS.y - 8,
          angle: 0,
          duration: 180,
          ease: 'Sine.easeOut',
        });
      }
      if (this.boxGlow) {
        this.tweens.add({
          targets: this.boxGlow,
          alpha: { from: this.boxGlow.alpha, to: 0.08 },
          scaleX: 1,
          scaleY: 1,
          duration: 220,
          ease: 'Sine.easeOut',
        });
      }
      this.showNotice(firstTime ? `BOX: ${config.displayLabel}` : `BOX REFILL ${config.displayLabel}`, '#FF7CCE');
      if (this.isSharedRunHost()) {
        this.lastSharedSnapshotSentAt = 0;
      }
    });
  }

  private tryUpgradeCurrentWeapon() {
    const ammo = this.weaponInventory[this.currentWeapon];
    if (!ammo.owned) {
      this.showNotice('NO TENES ESA ARMA', '#FF6A6A');
      return;
    }
    if (ammo.upgraded) {
      this.showNotice('ARMA YA POTENCIADA', '#7CC9FF');
      return;
    }
    const cost = this.getPackCost(this.currentWeapon);
    if (this.points < cost) {
      this.showNotice('NO ALCANZAN LOS PTS', '#FF6A6A');
      return;
    }

    this.points -= cost;
    ammo.upgraded = true;
    const upgraded = this.getWeaponStats(this.currentWeapon);
    ammo.ammoInMag = upgraded.magazineSize;
    ammo.reserveAmmo = Math.max(ammo.reserveAmmo, upgraded.reserveAmmo);
    this.showNotice(`PACKED ${upgraded.displayLabel}`, '#46B3FF');
    this.cameras.main.flash(120, 30, 120, 255, false);
    if (this.isSharedRunHost()) {
      this.lastSharedSnapshotSentAt = 0;
    }
  }

  private tryRepairBarricade(nodeId: string) {
    const node = this.spawnNodes.get(nodeId);
    if (!node || node.occupiedBy || node.boardHealth >= node.maxBoards) return;

    node.boardHealth += 1;
    this.points += 20;
    this.refreshSpawnNodeVisual(node, 0, false);
    const repairedIndex = Phaser.Math.Clamp(node.boardHealth - 1, 0, node.planks.length - 1);
    const repairedPlank = node.planks[repairedIndex];
    repairedPlank.setVisible(true);
    repairedPlank.setScale(0.42, 0.42);
    repairedPlank.setAlpha(0.18);
    repairedPlank.setAngle(Phaser.Math.Between(-18, 18));
    this.tweens.add({
      targets: repairedPlank,
      scaleX: 1,
      scaleY: 1,
      alpha: 0.94,
      angle: 0,
      duration: 180,
      ease: 'Back.Out',
    });
    const repairFx = this.add.rectangle(node.x, node.y - 4, 42, 52, 0x46B3FF, 0.12).setDepth(19);
    this.tweens.add({
      targets: repairFx,
      alpha: 0,
      scaleX: 1.08,
      scaleY: 1.04,
      duration: 150,
      onComplete: () => repairFx.destroy(),
    });
    const sparks = Array.from({ length: 4 }, () => this.add.rectangle(node.x, node.y - 4, 5, 3, 0x9edbff, 0.9).setDepth(20));
    sparks.forEach((spark, index) => {
      this.tweens.add({
        targets: spark,
        x: node.x + Phaser.Math.Between(-18, 18),
        y: node.y - 18 + Phaser.Math.Between(-10, 10),
        alpha: 0,
        duration: 180 + index * 30,
        ease: 'Sine.easeOut',
        onComplete: () => spark.destroy(),
      });
    });
    for (const plank of node.planks) {
      if (plank.visible) {
        plank.setScale(1.06);
        this.tweens.add({
          targets: plank,
          scaleX: 1,
          scaleY: 1,
          duration: 140,
          ease: 'Back.Out',
        });
      }
    }
    this.showFloatingText('+20 REPAIR', node.x, node.y - 30, '#46B3FF');
    this.showNotice('BARRICADE REPAIRED', '#7CC9FF');
    if (this.isSharedRunHost()) {
      this.lastSharedSnapshotSentAt = 0;
    }
  }

  private tryDropPickup(x: number, y: number) {
    if (this.pickups.size >= 2) return;
    const dropRoll = Phaser.Math.FloatBetween(0, 1);
    let kind: PickupKind | null = null;
    if (dropRoll <= 0.035) kind = 'max_ammo';
    else if (dropRoll <= 0.052) kind = 'insta_kill';
    else if (dropRoll <= 0.07) kind = 'double_points';
    else if (dropRoll <= 0.08) kind = 'nuke';
    if (!kind) return;

    const glowColor = kind === 'max_ammo'
      ? 0x46B3FF
      : kind === 'insta_kill'
        ? 0xFF3344
        : kind === 'double_points'
          ? 0xF5C842
          : 0x9BFF4F;
    const labelColor = kind === 'max_ammo'
      ? '#7CC9FF'
      : kind === 'insta_kill'
        ? '#FF6A6A'
        : kind === 'double_points'
          ? '#FFD36A'
          : '#C9FF89';
    const labelText = kind === 'max_ammo'
      ? 'MAX AMMO'
      : kind === 'insta_kill'
        ? 'INSTA-KILL'
        : kind === 'double_points'
          ? 'DOUBLE PTS'
          : 'NUKE';
    const id = `pickup_${++this.pickupIdSeq}`;
    this.pickups.set(id, this.createPickupEntity({
      id,
      kind,
      x,
      y,
      expiresAt: this.time.now + 12000,
    }, glowColor, labelColor, labelText));
  }

  private createPickupEntity(
    snapshot: Omit<PickupState, 'glow' | 'body' | 'label'>,
    glowColor: number,
    labelColor: string,
    labelText: string,
  ) {
    const glow = this.add.ellipse(snapshot.x, snapshot.y + 6, 52, 20, glowColor, 0.12).setDepth(90);
    glow.setStrokeStyle(1, glowColor, 0.45);
    const body = this.add.rectangle(snapshot.x, snapshot.y - 8, 24, 24, glowColor, 0.8).setDepth(91);
    body.setStrokeStyle(2, 0xffffff, 0.7);
    const label = this.add.text(snapshot.x, snapshot.y - 32, labelText, {
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

    return {
      ...snapshot,
      glow,
      body,
      label,
    };
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

      const collector = this.getAliveSharedTargets().find((player) =>
        Phaser.Math.Distance.Between(player.x, player.y, pickup.x, pickup.y) <= 34
      );
      if (collector) {
        this.collectPickup(pickup);
      }
    }
  }

  private collectPickup(pickup: PickupState) {
    if (pickup.kind === 'max_ammo') {
      for (const weaponId of this.weaponOrder) {
        const weapon = this.getWeaponStats(weaponId);
        const ammo = this.weaponInventory[weaponId];
        ammo.ammoInMag = weapon.magazineSize;
        ammo.reserveAmmo = Math.max(ammo.reserveAmmo, weapon.reserveAmmo);
      }
      if (this.isSharedRunHost()) {
        this.broadcastSharedMaxAmmo();
      }
      this.showNotice('MAX AMMO', '#46B3FF');
    } else if (pickup.kind === 'insta_kill') {
      this.instaKillUntil = this.time.now + 12000;
      this.showNotice('INSTA-KILL', '#FF6A6A');
      this.showPowerupBanner('INSTA KILL', '#FF6A6A');
    } else if (pickup.kind === 'double_points') {
      this.doublePointsUntil = this.time.now + 15000;
      this.showNotice('DOUBLE POINTS', '#F5C842');
      this.showPowerupBanner('DOUBLE POINTS', '#F5C842');
    } else if (pickup.kind === 'nuke') {
      this.triggerNuke();
      this.showNotice('NUKE', '#9BFF4F');
    }

    const pickupLabel = pickup.kind === 'max_ammo'
      ? 'MAX AMMO'
      : pickup.kind === 'insta_kill'
        ? 'INSTA-KILL'
        : pickup.kind === 'double_points'
          ? 'DOUBLE PTS'
          : 'NUKE';
    const pickupColor = pickup.kind === 'max_ammo'
      ? '#7CC9FF'
      : pickup.kind === 'insta_kill'
        ? '#FF6A6A'
        : pickup.kind === 'double_points'
          ? '#FFD36A'
          : '#C9FF89';
    this.showFloatingText(pickupLabel, pickup.x, pickup.y - 26, pickupColor);
    this.destroyPickup(pickup.id);
  }

  private triggerNuke() {
    const livingZombies = [...this.zombies.values()].filter((zombie) => zombie.alive);
    for (const zombie of livingZombies) {
      this.damageZombie(zombie, zombie.hp + 9999);
    }
    this.cameras.main.flash(180, 180, 255, 180, false);
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
    if (x - radius < ARENA_MIN_X || y - radius < ARENA_MIN_Y || x + radius > ARENA_MAX_X || y + radius > ARENA_MAX_Y) {
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
    // UX: exiting the main ZombiesScene should always take the player
    // back to the plaza in WorldScene, not bounce through BasementScene.
    if (this.scene.key === 'ZombiesScene') {
      transitionToScene(this, 'WorldScene', {
        returnX: SAFE_PLAZA_RETURN.X,
        returnY: SAFE_PLAZA_RETURN.Y,
      });
      return;
    }

    transitionToScene(this, this.returnScene, {
      returnX: this.returnX,
      returnY: this.returnY,
    });
  }

  private enterBasementDepths() {
    transitionToScene(this, 'BasementZombiesScene', {
      returnScene: this.returnScene,
      returnX: this.returnX,
      returnY: this.returnY,
      entryLabel: this.entryLabel,
      allowDepthsGate: false,
      modeLabel: 'BASEMENT DEPTHS',
    });
  }

  private setupRealtime() {
    if (!supabase || !isConfigured) return;

    this.channel = supabase.channel(`waspi-room-${this.scene.key.toLowerCase()}`, {
      config: {
        broadcast: { self: false },
        presence: this.isSharedCoopEnabled() ? { key: this.playerId } : undefined,
      },
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        this.handleSharedPresenceSync();
      })
      .on('broadcast', { event: 'player:join' }, ({ payload }) => {
        this.handleRemoteState(payload);
      })
      .on('broadcast', { event: 'player:move' }, ({ payload }) => {
        this.handleRemoteState(payload);
      })
      .on('broadcast', { event: 'player:leave' }, ({ payload }) => {
        this.handleRemoteLeave(payload);
      })
      .on('broadcast', { event: 'shared:snapshot' }, ({ payload }) => {
        this.handleSharedSnapshot(payload);
      })
      .on('broadcast', { event: 'shared:shot' }, ({ payload }) => {
        this.handleSharedShot(payload);
      })
      .on('broadcast', { event: 'shared:interact' }, ({ payload }) => {
        this.handleSharedInteractRequest(payload);
      })
      .on('broadcast', { event: 'shared:weapon' }, ({ payload }) => {
        this.handleSharedWeaponGrant(payload);
      })
      .on('broadcast', { event: 'shared:max_ammo' }, () => {
        this.applyMaxAmmoToLocalLoadout();
      })
      .on('broadcast', { event: 'shared:reset' }, () => {
        this.restartRun();
      })
      .subscribe(() => {
        if (this.isSharedCoopEnabled()) {
          this.channel?.track({
            player_id: this.playerId,
            username: this.playerUsername,
            joined_at: Date.now(),
          }).catch(() => undefined);
        }
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
        avatar: this.avatarConfig,
      },
    });
  }

  private syncPosition() {
    if (!this.channel) return;
    const now = Date.now();
    if (now - this.lastPosSent < 66) return;
    this.lastPosSent = now;
    this.syncLocalSharedPlayerState();
    this.broadcastSelfState('player:move');
  }

  private handleSharedPresenceSync() {
    if (!this.isSharedCoopEnabled() || !this.channel) return;
    const presence = this.channel.presenceState();
    const players = new Map<string, SharedRunPlayerState>();

    for (const entries of Object.values(presence) as SharedRunPresenceMeta[][]) {
      for (const entry of entries) {
        const playerId = typeof entry.player_id === 'string' ? entry.player_id : '';
        if (!playerId) continue;
        const existing = this.sharedRunPlayers.get(playerId);
        players.set(playerId, {
          player_id: playerId,
          username: typeof entry.username === 'string' && entry.username.trim() ? entry.username.trim() : existing?.username ?? 'waspi_guest',
          x: existing?.x ?? this.px,
          y: existing?.y ?? this.py,
          hp: existing?.hp ?? ZOMBIES_PLAYER.maxHp,
          alive: existing?.alive ?? true,
          joinedAt: typeof entry.joined_at === 'number' && Number.isFinite(entry.joined_at) ? entry.joined_at : existing?.joinedAt ?? Date.now(),
          lastDamageAt: existing?.lastDamageAt ?? 0,
        });
      }
    }

    this.sharedRunPlayers = players;
    const nextHost = [...players.values()]
      .sort((a, b) => (a.joinedAt - b.joinedAt) || a.player_id.localeCompare(b.player_id))[0]?.player_id ?? null;
    this.sharedRunHostId = nextHost;
    if (this.isSharedRunHost()) {
      this.lastSharedSnapshotSentAt = 0;
    }
  }

  private maybeBroadcastSharedSnapshot(force = false) {
    if (!this.isSharedRunHost() || !this.channel) return;
    if (!force && this.time.now - this.lastSharedSnapshotSentAt < 110) return;
    this.lastSharedSnapshotSentAt = this.time.now;
    this.channel.send({
      type: 'broadcast',
      event: 'shared:snapshot',
      payload: this.buildSharedSnapshot(),
    });
  }

  private buildSharedSnapshot(): SharedRunStateSnapshot {
    return {
      host_id: this.playerId,
      round: this.round,
      roundTarget: this.roundTarget,
      spawnedThisRound: this.spawnedThisRound,
      nextSpawnInMs: Math.max(0, this.nextSpawnAt - this.time.now),
      roundBreakInMs: Math.max(0, this.roundBreakUntil - this.time.now),
      bossRoundActive: this.bossRoundActive,
      bossSpawnedThisRound: this.bossSpawnedThisRound,
      bossAlive: this.bossAlive,
      depthsUnlocked: this.depthsUnlocked,
      points: this.points,
      zombieIdSeq: this.zombieIdSeq,
      zombieProjectileSeq: this.zombieProjectileSeq,
      pickupIdSeq: this.pickupIdSeq,
      mysteryBoxCooldownInMs: Math.max(0, this.mysteryBoxCooldownUntil - this.time.now),
      boxRollingInMs: Math.max(0, this.boxRollingUntil - this.time.now),
      instaKillInMs: Math.max(0, this.instaKillUntil - this.time.now),
      doublePointsInMs: Math.max(0, this.doublePointsUntil - this.time.now),
      players: [...this.sharedRunPlayers.values()].map((player) => ({
        ...player,
        x: player.player_id === this.playerId ? this.px : player.x,
        y: player.player_id === this.playerId ? this.py : player.y,
      })),
      doors: [...this.doors.values()].map((door) => ({ id: door.id, unlocked: door.unlocked })),
      spawnNodes: [...this.spawnNodes.values()].map((node) => ({
        id: node.id,
        occupiedBy: node.occupiedBy,
        boardHealth: node.boardHealth,
        lastUsedAgoMs: Math.max(0, this.time.now - node.lastUsedAt),
      })),
      zombies: [...this.zombies.values()].map((zombie) => ({
        id: zombie.id,
        type: zombie.type,
        assetFolder: zombie.assetFolder,
        displayLabel: zombie.displayLabel,
        isBoss: zombie.isBoss,
        x: zombie.x,
        y: zombie.y,
        hp: zombie.hp,
        maxHp: zombie.maxHp,
        speed: zombie.speed,
        damage: zombie.damage,
        attackRange: zombie.attackRange,
        attackCooldownMs: zombie.attackCooldownMs,
        hitReward: zombie.hitReward,
        killReward: zombie.killReward,
        radius: zombie.radius,
        state: zombie.state,
        phase: zombie.phase,
        alive: zombie.alive,
        spawnNodeId: zombie.spawnNodeId,
        breachInMs: Math.max(0, zombie.breachEndsAt - this.time.now),
        attackCooldownLeftMs: Math.max(0, zombie.attackCooldownMs - (this.time.now - zombie.lastAttackAt)),
        specialCooldownLeftMs: Math.max(0, 1500 - (this.time.now - zombie.lastSpecialAt)),
        stompCooldownLeftMs: Math.max(0, 220 - (this.time.now - zombie.lastStompAt)),
      })),
      projectiles: [...this.zombieProjectiles.values()].map((projectile) => ({
        id: projectile.id,
        x: projectile.x,
        y: projectile.y,
        vx: projectile.vx,
        vy: projectile.vy,
        damage: projectile.damage,
        radius: projectile.radius,
        expiresInMs: Math.max(0, projectile.expiresAt - this.time.now),
      })),
      pickups: [...this.pickups.values()].map((pickup) => ({
        id: pickup.id,
        kind: pickup.kind,
        x: pickup.x,
        y: pickup.y,
        expiresInMs: Math.max(0, pickup.expiresAt - this.time.now),
      })),
    };
  }

  private handleSharedSnapshot(payload: unknown) {
    if (!this.isSharedCoopEnabled() || this.isSharedRunHost()) return;
    if (!payload || typeof payload !== 'object') return;
    const snapshot = payload as SharedRunStateSnapshot;
    if (!snapshot.host_id) return;
    this.sharedRunHostId = snapshot.host_id;
    this.round = snapshot.round;
    this.roundTarget = snapshot.roundTarget;
    this.spawnedThisRound = snapshot.spawnedThisRound;
    this.nextSpawnAt = this.time.now + Math.max(0, snapshot.nextSpawnInMs);
    this.roundBreakUntil = this.time.now + Math.max(0, snapshot.roundBreakInMs);
    this.bossRoundActive = snapshot.bossRoundActive;
    this.bossSpawnedThisRound = snapshot.bossSpawnedThisRound;
    this.bossAlive = snapshot.bossAlive;
    this.depthsUnlocked = snapshot.depthsUnlocked;
    this.points = snapshot.points;
    this.zombieIdSeq = snapshot.zombieIdSeq;
    this.zombieProjectileSeq = snapshot.zombieProjectileSeq;
    this.pickupIdSeq = snapshot.pickupIdSeq;
    this.mysteryBoxCooldownUntil = this.time.now + Math.max(0, snapshot.mysteryBoxCooldownInMs);
    this.boxRollingUntil = this.time.now + Math.max(0, snapshot.boxRollingInMs);
    this.instaKillUntil = this.time.now + Math.max(0, snapshot.instaKillInMs);
    this.doublePointsUntil = this.time.now + Math.max(0, snapshot.doublePointsInMs);

    this.sharedRunPlayers = new Map(snapshot.players.map((player) => ([
      player.player_id,
      {
        ...player,
        lastDamageAt: player.lastDamageAt ?? 0,
      },
    ])));
    this.applySharedDoors(snapshot.doors);
    this.applySharedSpawnNodes(snapshot.spawnNodes);
    this.applySharedZombies(snapshot.zombies);
    this.applySharedProjectiles(snapshot.projectiles);
    this.applySharedPickups(snapshot.pickups);
    this.applySharedPlayerStateToLocal();
  }

  private applySharedDoors(doors: SharedRunDoorSnapshot[]) {
    const doorStates = new Map(doors.map((door) => [door.id, door.unlocked]));
    for (const door of this.doors.values()) {
      const unlocked = doorStates.get(door.id) ?? false;
      door.unlocked = unlocked;
      if (unlocked) {
        door.panel.setFillStyle(0x1A3525, 0.88);
        door.panel.setStrokeStyle(2, 0x39FF14, 0.72);
        door.label.setText('ABIERTO');
        door.label.setColor('#9EFFB7');
        door.costText.setText('ACCESO');
        door.costText.setColor('#39FF14');
        door.rect = undefined;
      }
    }
    this.updateDepthsAccessVisual();
  }

  private applySharedSpawnNodes(nodes: SharedRunSpawnNodeSnapshot[]) {
    const nextNodes = new Map(nodes.map((node) => [node.id, node]));
    for (const node of this.spawnNodes.values()) {
      const snapshot = nextNodes.get(node.id);
      if (!snapshot) continue;
      node.occupiedBy = snapshot.occupiedBy;
      node.boardHealth = snapshot.boardHealth;
      node.lastUsedAt = this.time.now - snapshot.lastUsedAgoMs;
      this.refreshSpawnNodeVisual(node, 0, Boolean(snapshot.occupiedBy));
    }
  }

  private applySharedZombies(zombies: SharedRunZombieSnapshot[]) {
    const seen = new Set<string>();
    for (const snapshot of zombies) {
      seen.add(snapshot.id);
      let zombie = this.zombies.get(snapshot.id);
      if (!zombie) {
        zombie = this.createZombieEntity({
          id: snapshot.id,
          type: snapshot.type,
          assetFolder: snapshot.assetFolder,
          displayLabel: snapshot.displayLabel,
          hp: snapshot.hp,
          maxHp: snapshot.maxHp,
          speed: snapshot.speed,
          damage: snapshot.damage,
          attackRange: snapshot.attackRange,
          attackCooldownMs: snapshot.attackCooldownMs,
          hitReward: snapshot.hitReward,
          killReward: snapshot.killReward,
          radius: snapshot.radius,
          isBoss: snapshot.isBoss,
          x: snapshot.x,
          y: snapshot.y,
          phase: snapshot.phase,
          alive: snapshot.alive,
          spawnNodeId: snapshot.spawnNodeId,
          breachEndsAt: this.time.now + snapshot.breachInMs,
          lastAttackAt: this.time.now - Math.max(0, snapshot.attackCooldownMs - snapshot.attackCooldownLeftMs),
          lastSpecialAt: this.time.now - Math.max(0, 1500 - snapshot.specialCooldownLeftMs),
          lastStompAt: this.time.now - Math.max(0, 220 - snapshot.stompCooldownLeftMs),
          state: snapshot.state,
        });
        this.zombies.set(snapshot.id, zombie);
      }
      zombie.type = snapshot.type;
      zombie.assetFolder = snapshot.assetFolder;
      zombie.displayLabel = snapshot.displayLabel;
      zombie.isBoss = snapshot.isBoss;
      zombie.x = snapshot.x;
      zombie.y = snapshot.y;
      zombie.hp = snapshot.hp;
      zombie.maxHp = snapshot.maxHp;
      zombie.speed = snapshot.speed;
      zombie.damage = snapshot.damage;
      zombie.attackRange = snapshot.attackRange;
      zombie.attackCooldownMs = snapshot.attackCooldownMs;
      zombie.hitReward = snapshot.hitReward;
      zombie.killReward = snapshot.killReward;
      zombie.radius = snapshot.radius;
      zombie.state = snapshot.state;
      zombie.phase = snapshot.phase;
      zombie.alive = snapshot.alive;
      zombie.spawnNodeId = snapshot.spawnNodeId;
      zombie.breachEndsAt = this.time.now + snapshot.breachInMs;
      zombie.lastAttackAt = this.time.now - Math.max(0, snapshot.attackCooldownMs - snapshot.attackCooldownLeftMs);
      zombie.lastSpecialAt = this.time.now - Math.max(0, 1500 - snapshot.specialCooldownLeftMs);
      zombie.lastStompAt = this.time.now - Math.max(0, 220 - snapshot.stompCooldownLeftMs);
      zombie.container.setPosition(zombie.x, zombie.y);
      zombie.shadow.setPosition(zombie.x, zombie.y + zombie.radius + 8);
      zombie.container.setDepth(Math.floor(zombie.y / 10));
      zombie.shadow.setDepth(zombie.container.depth - 1);
      this.renderZombieHp(zombie);
      this.setZombieState(zombie, zombie.state);
    }

    for (const zombie of [...this.zombies.values()]) {
      if (seen.has(zombie.id)) continue;
      this.safeDestroyZombieVisual(zombie);
      this.zombies.delete(zombie.id);
    }
  }

  private applySharedProjectiles(projectiles: SharedRunProjectileSnapshot[]) {
    const seen = new Set<string>();
    for (const snapshot of projectiles) {
      seen.add(snapshot.id);
      let projectile = this.zombieProjectiles.get(snapshot.id);
      if (!projectile) {
        projectile = this.createZombieProjectileEntity({
          id: snapshot.id,
          x: snapshot.x,
          y: snapshot.y,
          vx: snapshot.vx,
          vy: snapshot.vy,
          damage: snapshot.damage,
          radius: snapshot.radius,
          expiresAt: this.time.now + snapshot.expiresInMs,
        });
        this.zombieProjectiles.set(snapshot.id, projectile);
      }
      projectile.x = snapshot.x;
      projectile.y = snapshot.y;
      projectile.vx = snapshot.vx;
      projectile.vy = snapshot.vy;
      projectile.damage = snapshot.damage;
      projectile.radius = snapshot.radius;
      projectile.expiresAt = this.time.now + snapshot.expiresInMs;
      projectile.body.setPosition(projectile.x, projectile.y);
      projectile.glow.setPosition(projectile.x, projectile.y);
    }

    for (const projectile of [...this.zombieProjectiles.values()]) {
      if (seen.has(projectile.id)) continue;
      this.destroyZombieProjectile(projectile.id);
    }
  }

  private applySharedPickups(pickups: SharedRunPickupSnapshot[]) {
    const seen = new Set<string>();
    for (const snapshot of pickups) {
      seen.add(snapshot.id);
      let pickup = this.pickups.get(snapshot.id);
      const glowColor = snapshot.kind === 'max_ammo'
        ? 0x46B3FF
        : snapshot.kind === 'insta_kill'
          ? 0xFF3344
          : snapshot.kind === 'double_points'
            ? 0xF5C842
            : 0x9BFF4F;
      const labelColor = snapshot.kind === 'max_ammo'
        ? '#7CC9FF'
        : snapshot.kind === 'insta_kill'
          ? '#FF6A6A'
          : snapshot.kind === 'double_points'
            ? '#FFD36A'
            : '#C9FF89';
      const labelText = snapshot.kind === 'max_ammo'
        ? 'MAX AMMO'
        : snapshot.kind === 'insta_kill'
          ? 'INSTA-KILL'
          : snapshot.kind === 'double_points'
            ? 'DOUBLE PTS'
            : 'NUKE';
      if (!pickup) {
        pickup = this.createPickupEntity({
          id: snapshot.id,
          kind: snapshot.kind,
          x: snapshot.x,
          y: snapshot.y,
          expiresAt: this.time.now + snapshot.expiresInMs,
        }, glowColor, labelColor, labelText);
        this.pickups.set(snapshot.id, pickup);
      }
      pickup.x = snapshot.x;
      pickup.y = snapshot.y;
      pickup.expiresAt = this.time.now + snapshot.expiresInMs;
      pickup.body.setPosition(pickup.x, pickup.y - 8);
      pickup.label.setPosition(pickup.x, pickup.y - 32);
      pickup.glow.setPosition(pickup.x, pickup.y + 6);
    }

    for (const pickup of [...this.pickups.values()]) {
      if (seen.has(pickup.id)) continue;
      this.destroyPickup(pickup.id);
    }
  }

  private broadcastSharedShot(payload: SharedRunShotPayload) {
    if (!this.isSharedCoopEnabled() || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'shared:shot',
      payload,
    });
  }

  private handleSharedShot(payload: unknown) {
    if (!this.isSharedCoopEnabled() || !payload || typeof payload !== 'object') return;
    const shot = payload as SharedRunShotPayload;
    if (!shot.player_id || shot.player_id === this.playerId) return;
    this.fireShotBurst(
      shot.player_id,
      shot.username,
      shot.originX,
      shot.originY,
      shot.targetX,
      shot.targetY,
      shot,
      this.isSharedRunHost(),
    );
  }

  private broadcastSharedInteract(payload: SharedRunInteractPayload) {
    if (!this.isSharedCoopEnabled() || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'shared:interact',
      payload,
    });
  }

  private handleSharedInteractRequest(payload: unknown) {
    if (!this.isSharedRunHost() || !payload || typeof payload !== 'object') return;
    const request = payload as SharedRunInteractPayload;
    const actor = this.sharedRunPlayers.get(request.player_id);
    if (!actor || !actor.alive) return;

    // Prefer position from payload (fresh) over stored position (up to 66ms stale)
    const ax = request.px ?? actor.x;
    const ay = request.py ?? actor.y;

    if (request.kind === 'door' && request.sectionId) {
      const door = this.doors.get(request.sectionId);
      if (!door?.rect || door.unlocked) return;
      const expandedDoor = new Phaser.Geom.Rectangle(door.rect.x - 35, door.rect.y - 35, door.rect.width + 70, door.rect.height + 70);
      if (!Phaser.Geom.Rectangle.Contains(expandedDoor, ax, ay)) return;
      this.tryUnlockDoor(request.sectionId);
      this.lastSharedSnapshotSentAt = 0;
      return;
    }

    if (request.kind === 'repair' && request.nodeId) {
      const node = this.spawnNodes.get(request.nodeId);
      if (!node || Phaser.Math.Distance.Between(ax, ay, node.x, node.y) > 78) return;
      this.tryRepairBarricade(request.nodeId);
      this.lastSharedSnapshotSentAt = 0;
      return;
    }

    if (request.kind === 'box') {
      if (Phaser.Math.Distance.Between(ax, ay, BOX_POS.x, BOX_POS.y) > 74) return;
      this.rollSharedMysteryBoxForPlayer(request.player_id);
      return;
    }

    if (request.kind === 'upgrade' && request.weaponId) {
      if (Phaser.Math.Distance.Between(ax, ay, PACK_POS.x, PACK_POS.y) > 76) return;
      this.upgradeSharedWeaponForPlayer(request.player_id, request.weaponId);
    }
  }

  private rollSharedMysteryBoxForPlayer(playerId: string) {
    if (this.boxRollingUntil > this.time.now) {
      this.broadcastSharedWeaponGrant({ player_id: playerId, kind: 'notice', ok: false, message: 'LA BOX ESTA GIRANDO' });
      return;
    }
    if (this.time.now < this.mysteryBoxCooldownUntil) {
      this.broadcastSharedWeaponGrant({ player_id: playerId, kind: 'notice', ok: false, message: 'LA BOX RECARGA' });
      return;
    }
    if (this.points < ZOMBIES_POINTS.mysteryBoxCost) {
      this.broadcastSharedWeaponGrant({ player_id: playerId, kind: 'notice', ok: false, message: 'NO ALCANZAN LOS PTS' });
      return;
    }

    this.points -= ZOMBIES_POINTS.mysteryBoxCost;
    this.mysteryBoxCooldownUntil = this.time.now + 3200;
    this.boxRollingUntil = this.time.now + 1400;
    const weaponId = this.rollMysteryWeapon();
    this.lastSharedSnapshotSentAt = 0;
    this.time.delayedCall(1450, () => {
      this.boxRollingUntil = 0;
      const grant: SharedRunWeaponGrantPayload = {
        player_id: playerId,
        kind: 'box',
        weaponId,
        ok: true,
        message: `BOX: ${ZOMBIES_WEAPONS[weaponId].label}`,
      };
      this.broadcastSharedWeaponGrant(grant);
      if (playerId === this.playerId) {
        this.applySharedWeaponGrant(grant);
      }
      this.lastSharedSnapshotSentAt = 0;
    });
  }

  private upgradeSharedWeaponForPlayer(playerId: string, weaponId: ZombiesWeaponId) {
    const cost = this.getPackCost(weaponId);
    if (this.points < cost) {
      this.broadcastSharedWeaponGrant({ player_id: playerId, kind: 'notice', ok: false, message: 'NO ALCANZAN LOS PTS' });
      return;
    }
    this.points -= cost;
    const grant: SharedRunWeaponGrantPayload = {
      player_id: playerId,
      kind: 'upgrade',
      weaponId,
      ok: true,
      message: `PACKED ${ZOMBIES_WEAPONS[weaponId].label}`,
    };
    this.broadcastSharedWeaponGrant(grant);
    if (playerId === this.playerId) {
      this.applySharedWeaponGrant(grant);
    }
    this.lastSharedSnapshotSentAt = 0;
  }

  private broadcastSharedWeaponGrant(payload: SharedRunWeaponGrantPayload) {
    if (!this.isSharedCoopEnabled() || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'shared:weapon',
      payload,
    });
  }

  private handleSharedWeaponGrant(payload: unknown) {
    if (!payload || typeof payload !== 'object') return;
    this.applySharedWeaponGrant(payload as SharedRunWeaponGrantPayload);
  }

  private applySharedWeaponGrant(payload: SharedRunWeaponGrantPayload) {
    if (payload.player_id !== this.playerId) return;
    if (!payload.ok) {
      if (payload.message) this.showNotice(payload.message, '#FF6A6A');
      return;
    }

    if (payload.kind === 'box' && payload.weaponId) {
      const ammo = this.weaponInventory[payload.weaponId];
      const config = this.getWeaponStats(payload.weaponId);
      ammo.owned = true;
      ammo.ammoInMag = config.magazineSize;
      ammo.reserveAmmo = Math.max(ammo.reserveAmmo, config.reserveAmmo);
      if (!this.weaponOrder.includes(payload.weaponId)) {
        this.weaponOrder.push(payload.weaponId);
      }
      this.currentWeapon = payload.weaponId;
    } else if (payload.kind === 'upgrade' && payload.weaponId) {
      const ammo = this.weaponInventory[payload.weaponId];
      ammo.upgraded = true;
      const upgraded = this.getWeaponStats(payload.weaponId);
      ammo.ammoInMag = upgraded.magazineSize;
      ammo.reserveAmmo = Math.max(ammo.reserveAmmo, upgraded.reserveAmmo);
      this.currentWeapon = payload.weaponId;
    }

    if (payload.message) {
      this.showNotice(payload.message, payload.kind === 'upgrade' ? '#46B3FF' : '#FF7CCE');
    }
  }

  private broadcastSharedMaxAmmo() {
    if (!this.isSharedCoopEnabled() || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'shared:max_ammo',
      payload: { host_id: this.playerId },
    });
  }

  private applyMaxAmmoToLocalLoadout() {
    for (const weaponId of this.weaponOrder) {
      const weapon = this.getWeaponStats(weaponId);
      const ammo = this.weaponInventory[weaponId];
      ammo.ammoInMag = weapon.magazineSize;
      ammo.reserveAmmo = Math.max(ammo.reserveAmmo, weapon.reserveAmmo);
    }
  }

  private maybeScheduleSharedReset() {
    if (!this.isSharedRunHost() || this.sharedResetPending) return;
    if ([...this.sharedRunPlayers.values()].some((player) => player.alive)) return;
    this.sharedResetPending = true;
    this.showNotice('TEAM WIPE - REINICIANDO', '#FF6A6A');
    this.time.delayedCall(2200, () => {
      this.sharedResetPending = false;
      this.channel?.send({
        type: 'broadcast',
        event: 'shared:reset',
        payload: { host_id: this.playerId },
      });
      this.restartRun();
    });
  }

  private updateRemotePlayers() {
    for (const [playerId, remote] of this.remotePlayers.entries()) {
      remote.x = Phaser.Math.Linear(remote.x, remote.targetX, 0.18);
      remote.y = Phaser.Math.Linear(remote.y, remote.targetY, 0.18);
      remote.avatar.update(remote.isMoving, remote.moveDx, remote.moveDy);
      remote.avatar.setPosition(remote.x, remote.y);
      remote.avatar.setDepth(Math.floor(remote.y / 10));
      remote.nameplate.setPosition(remote.x, remote.y - 44);
      const shared = this.sharedRunPlayers.get(playerId);
      const alive = shared?.alive ?? true;
      remote.avatar.getContainer().setAlpha(alive ? 1 : 0.45);
      remote.nameplate.setAlpha(alive ? 1 : 0.6);
    }
  }

  private handleRemoteState(payload: unknown) {
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
    if (this.isSharedCoopEnabled()) {
      const current = this.sharedRunPlayers.get(next.player_id);
      this.sharedRunPlayers.set(next.player_id, {
        player_id: next.player_id,
        username: next.username,
        x: next.x,
        y: next.y,
        hp: current?.hp ?? ZOMBIES_PLAYER.maxHp,
        alive: current?.alive ?? true,
        joinedAt: current?.joinedAt ?? Date.now(),
        lastDamageAt: current?.lastDamageAt ?? 0,
      });
    }
  }

  private handleRemoteLeave(payload: unknown) {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    if (!playerId) return;
    const remote = this.remotePlayers.get(playerId);
    if (!remote) return;
    remote.avatar.destroy();
    remote.nameplate.destroy();
    this.remotePlayers.delete(playerId);
    this.sharedRunPlayers.delete(playerId);
    if (this.isSharedRunHost()) {
      this.lastSharedSnapshotSentAt = 0;
      this.maybeScheduleSharedReset();
    }
  }

  private spawnRemotePlayer(playerId: string, username: string, x: number, y: number, avatarConfig: AvatarConfig) {
    const avatar = new AvatarRenderer(this, x, y, avatarConfig);
    avatar.setDepth(Math.floor(y / 10));
    const nameplate = this.add.text(x, y - 44, username, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#88AAFF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(100);

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
    });
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
      dir: this.readNumberField(payload, 'dir', 'dx') ?? 0,
      dy: this.readNumberField(payload, 'dy') ?? 0,
      moving: this.readBooleanField(payload, 'moving', 'isMoving') ?? false,
      avatar,
    };
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

  private setupChatBridge() {
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
  }

  private handleShutdown() {
    this.restartPending = false;
    try {
      this.player?.clearActionState?.();
    } catch {
      // Scene is shutting down; ignore avatar cleanup failures.
    }
    if (this.pointerDownHandler) {
      this.input.off('pointerdown', this.pointerDownHandler);
      this.pointerDownHandler = undefined;
    }
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'player:leave',
        payload: { player_id: this.playerId },
      });
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.remotePlayers.forEach((remote) => {
      remote.avatar.destroy();
      remote.nameplate.destroy();
    });
    this.remotePlayers.clear();
    this.chatSystem?.destroy();
    this.chatSystem = undefined;
    this.cleanupFns.forEach((cleanup) => cleanup());
    this.cleanupFns = [];
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = undefined;
    }
    stopSceneMusic(this, this.sceneMusic);
    this.sceneMusic = null;
  }
}




