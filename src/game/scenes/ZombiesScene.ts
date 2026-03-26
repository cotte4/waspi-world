
import Phaser from 'phaser';
import { AvatarRenderer, type AvatarConfig, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { ChatSystem } from '../systems/ChatSystem';
import { announceScene, bindSafeResetToPlaza, createBackButton, transitionToWorldScene } from '../systems/SceneUi';
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
import type { AudioSettings } from '../systems/AudioSettings';
import { startSceneMusic, stopSceneMusic } from '../systems/AudioManager';
import { eventBus, EVENTS } from '../config/eventBus';
import { getInventory } from '../systems/InventorySystem';
import { SAFE_PLAZA_RETURN } from '../config/constants';
import { SpecializationModal } from '../systems/SpecializationModal';
import type { SkillId } from '../systems/SkillSystem';
import { getSkillSystem } from '../systems/SkillSystem';
import { getQuestSystem } from '../systems/QuestSystem';
import {
  loadProgressionState,
  addXpToProgression,
  saveProgressionState,
  syncXpToServer,
  type ProgressionState,
} from '../systems/ProgressionSystem';
import { supabase, isConfigured } from '../../lib/supabase';
import { preferSupabaseHttpBroadcast } from '../../lib/supabaseRealtime';
import {
  ZOMBIES_PLAYER,
  ZOMBIES_POINTS,
  ZOMBIES_SECTIONS,
  ZOMBIES_WEAPONS,
  ZOMBIES_WORLD,
  ZOMBIE_TYPES,
  getZombieBreachMs,
  type ZombieType,
  type ZombiesSectionId,
  type ZombiesWeaponId,
} from '../config/zombies';
import {
  applyZombiesRealtimeSharedSnapshotAdapterState,
  broadcastRealtimeSelfState,
  broadcastZombiesRealtimeSharedInteract,
  broadcastZombiesRealtimeSharedShot,
  broadcastZombiesRealtimeSharedWeaponGrant,
  connectZombiesRealtimeChannel,
  createZombiesRealtimeSharedSnapshotAdapter,
  handleRealtimeRemoteLeave,
  handleRealtimeRemoteState,
  type ZombiesRealtimeChannel,
  handleZombiesRealtimeSharedInteractRequest,
  handleZombiesRealtimeSharedReset,
  handleZombiesRealtimeSharedShot,
  handleZombiesRealtimeSharedSnapshot,
  handleZombiesRealtimeSharedWeaponGrant,
  maybeBroadcastZombiesRealtimeSharedSnapshot,
  scheduleZombiesRealtimeSharedReset,
  syncRealtimePosition,
  syncZombiesRealtimePresenceState,
  teardownZombiesRealtimeSession,
  stepZombiesRealtimeFrame,
} from './zombies/realtime';
import {
  applyZombiesPickupRuntimeState,
  applySharedMaxAmmoToZombiesLoadout,
  createZombiesPickupRuntimeState,
  createZombiesPickupSceneAdapter,
  type ZombiesPickupRuntimeState,
  runAndSyncZombiesPickupCycle,
  runZombiesPickupDropCycle,
  syncZombiesPickupRuntimeState,
} from './zombies/pickups';
import {
  ZOMBIES_BOX_POS as BOX_POS,
  ZOMBIES_DEPTHS_PAD as DEPTHS_PAD,
  ZOMBIES_EXIT_PAD as EXIT_PAD,
  ZOMBIES_PACK_POS as PACK_POS,
  ZOMBIES_PLAYER_RETURN as PLAYER_RETURN,
} from './zombies/constants';
import {
  addZombiesWallCollider,
  createZombiesArenaDoorVisual,
  createZombiesObstacleVisual,
  createZombiesSpawnVisual,
  getZombiesArenaSectionById,
  getZombiesArenaSectionDoorBounds,
  getZombiesArenaSectionSpawnPoints,
} from './zombies/arena';
import {
  createZombiesHud,
  renderZombiesHud,
  showZombiesBossIntro,
  showZombiesNotice,
  showZombiesPowerupBanner,
  updateZombiesFuriaHud,
  updateZombiesPromptHud,
} from './zombies/hud';
import {
  beginZombiesRound,
  countAliveZombies as countAliveSpawningZombies,
  getZombiesAvailableSpawnNodes,
  getZombiesPackCost,
  getZombiesPointsMultiplier,
  getZombiesPressureTier,
  getZombiesScaledConcurrentCap,
  getZombiesScaledRoundTarget,
  getZombiesScaledRoundWarmupMs,
  getZombiesScaledSpawnDelayMs,
  getZombiesWeaponState,
  getZombiesWeaponStats,
  handleZombiesRoundFlow,
  isZombiesBossRound,
  pickZombiesType,
  releaseZombiesSpawnNode,
  spawnZombiesBossZombie,
  spawnZombiesZombie,
} from './zombies/spawning';
import {
  cleanupZombiesInput,
  enterZombiesBasementDepths,
  getNearbyZombiesInteraction,
  getZombiesAimAngle as getPlayerZombiesAimAngle,
  handleZombiesCombatInput,
  handleZombiesContextInteraction,
  handleZombiesMovement,
  requestZombiesExit,
  setupZombiesInput,
  setupZombiesPlayer,
  tryActivateZombiesFuria,
  tryMoveZombiesPlayer,
  tryShootZombies,
} from './zombies/player';
import {
  drawShotFxFrom as drawZombiesShotFxFrom,
  findZombieTargetFrom as findZombiesTargetFrom,
  fireShotBurst as fireZombiesShotBurst,
  tryReload as tryReloadZombiesCombat,
  type ZombiesCombatZombie,
} from './zombies/combat';
// Arena visual bounds: (60, 120) → (1760, 1100). Player boundary = arena edge + radius.
const ARENA_MIN_X = 60;
const ARENA_MIN_Y = 120;
const ARENA_MAX_X = 1760;
const ARENA_MAX_Y = 1100;
/** Grosor del muro visual (debe coincidir con buildArena). Colisión = interior útil. */
const WALL_TOP_H = 22;
const WALL_BOTTOM_H = 22;
const WALL_SIDE_W = 40;
const PLAY_MIN_X = ARENA_MIN_X + WALL_SIDE_W;
const PLAY_MAX_X = ARENA_MAX_X - WALL_SIDE_W;
const PLAY_MIN_Y = ARENA_MIN_Y + WALL_TOP_H;
const PLAY_MAX_Y = ARENA_MAX_Y - WALL_BOTTOM_H;

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
  private runStartedAt = 0;
  private depthsUnlocked = false;
  private gameOver = false;
  private playerLevel = 1;
  private progression!: ProgressionState;
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
  private killCount = 0;
  private noticeText?: Phaser.GameObjects.Text;
  private bossIntroText?: Phaser.GameObjects.Text;
  private reticle?: Phaser.GameObjects.Graphics;
  private depthsRing?: Phaser.GameObjects.Ellipse;
  private depthsLabel?: Phaser.GameObjects.Text;
  // Gym Lv4 — Furia ability
  private furiaActive = false;
  private furiaUntil = 0;
  private furiaCooldownUntil = 0;
  private furiaHudText?: Phaser.GameObjects.Text;
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
  private keyF!: Phaser.Input.Keyboard.Key;
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
  private specModal?: SpecializationModal;
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
    eventBus.emit(EVENTS.ZOMBIES_SCENE_ACTIVE, true);
    this.specModal = new SpecializationModal(this);
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
    this.progression = loadProgressionState();
    this.playerLevel = this.progression.level;
    this.round = 0;
    this.roundTarget = 0;
    this.spawnedThisRound = 0;
    this.nextSpawnAt = 0;
    this.roundBreakUntil = 0;
    this.bossRoundActive = false;
    this.bossSpawnedThisRound = false;
    this.bossAlive = false;
    this.runStartedAt = this.time.now;
    this.depthsUnlocked = false;
    this.gameOver = false;
    this.killCount = 0;
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
      transitionToWorldScene(this, SAFE_PLAZA_RETURN.X, SAFE_PLAZA_RETURN.Y);
    });

    createBackButton(this, () => this.requestExit(), 'SALIR');
    this.cameras.main.startFollow(this.player.getContainer(), true, 0.12, 0.12);
    this.cameras.main.setZoom(1);
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(240, 0, 0, 0);

    this.sceneMusic = startSceneMusic(this, 'zombies_dark', 0.45);
    this.cleanupFns.push(eventBus.on(EVENTS.AUDIO_SETTINGS_CHANGED, (payload: unknown) => {
      if (!this.scene.isActive(this.scene.key)) return;
      if (!payload || typeof payload !== 'object') return;
      const next = payload as Partial<AudioSettings>;
      const musicOn = next.musicEnabled;
      if (typeof musicOn !== 'boolean') return;
      if (musicOn) {
        if (!this.sceneMusic) {
          this.sceneMusic = startSceneMusic(this, 'zombies_dark', 0.45);
        }
      } else {
        stopSceneMusic(this, this.sceneMusic);
        this.sceneMusic = null;
      }
    }));
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
    // ─── 1. VOID BACKGROUND ────────────────────────────────────────────────
    const bg = this.add.graphics().setDepth(0).setName('arena-bg');
    bg.fillStyle(0x020406, 1);
    bg.fillRect(0, 0, ZOMBIES_WORLD.WIDTH, ZOMBIES_WORLD.HEIGHT);

    // ─── 2. ARENA BASE FLOOR ───────────────────────────────────────────────
    const floorBase = this.add.graphics().setDepth(1).setName('arena-floor');
    floorBase.fillStyle(0x0D1318, 1);
    floorBase.fillRect(ARENA_MIN_X, ARENA_MIN_Y,
      ARENA_MAX_X - ARENA_MIN_X, ARENA_MAX_Y - ARENA_MIN_Y);
    // 32px grid overlay on full floor
    floorBase.lineStyle(1, 0x111A22, 0.25);
    for (let x = ARENA_MIN_X; x <= ARENA_MAX_X; x += 32) {
      floorBase.lineBetween(x, ARENA_MIN_Y, x, ARENA_MAX_Y);
    }
    for (let y = ARENA_MIN_Y; y <= ARENA_MAX_Y; y += 32) {
      floorBase.lineBetween(ARENA_MIN_X, y, ARENA_MAX_X, y);
    }

    // ─── 3. SECTION FLOORS (distinct tile patterns per zone) ───────────────
    const sFloor = this.add.graphics().setDepth(2).setName('section-floors');
    const sFloorData: { [k: string]: { color: number; grid: number; gridColor: number } } = {
      start:    { color: 0x131C26, grid: 16, gridColor: 0x0D1520 },
      yard:     { color: 0x111B12, grid: 24, gridColor: 0x0C1710 },
      workshop: { color: 0x141618, grid: 12, gridColor: 0x0F1214 },
      street:   { color: 0x0F0F17, grid: 28, gridColor: 0x0A0B12 },
    };
    for (const section of ZOMBIES_SECTIONS) {
      const st = sFloorData[section.id] ?? sFloorData['start'];
      sFloor.fillStyle(st.color, 1);
      sFloor.fillRect(section.x, section.y, section.w, section.h);
      // Tile grid lines
      sFloor.lineStyle(1, st.gridColor, 1);
      for (let gx = section.x; gx <= section.x + section.w; gx += st.grid) {
        sFloor.lineBetween(gx, section.y, gx, section.y + section.h);
      }
      for (let gy = section.y; gy <= section.y + section.h; gy += st.grid) {
        sFloor.lineBetween(section.x, gy, section.x + section.w, gy);
      }
      // Room border
      sFloor.lineStyle(2, 0x1E2A36, 0.9);
      sFloor.strokeRect(section.x, section.y, section.w, section.h);
    }

    // ─── 4. FLOOR DECOR (blood, scorch, puddles) ───────────────────────────
    const decor = this.add.graphics().setDepth(3).setName('floor-decor');
    // Blood pools
    decor.fillStyle(0x1E0008, 0.7);
    for (const s of [
      { x: 300, y: 680, rx: 26, ry: 12 }, { x: 440, y: 820, rx: 20, ry: 9 },
      { x: 578, y: 534, rx: 16, ry: 7 },  { x: 212, y: 772, rx: 14, ry: 6 },
      { x: 352, y: 908, rx: 18, ry: 8 },  { x: 510, y: 718, rx: 12, ry: 5 },
      { x: 842, y: 522, rx: 16, ry: 7 },  { x: 962, y: 692, rx: 22, ry: 10 },
      { x: 1238, y: 492, rx: 17, ry: 7 }, { x: 1498, y: 634, rx: 20, ry: 9 },
      { x: 902, y: 908, rx: 28, ry: 11 }, { x: 1198, y: 962, rx: 18, ry: 7 },
      { x: 1428, y: 878, rx: 22, ry: 9 },
    ] as Array<{ x: number; y: number; rx: number; ry: number }>) {
      decor.fillEllipse(s.x, s.y, s.rx * 2, s.ry * 2);
    }
    // Scorch marks
    decor.fillStyle(0x040408, 0.58);
    for (const s of [
      { x: 380, y: 758, r: 30 }, { x: 538, y: 898, r: 22 },
      { x: 802, y: 472, r: 26 }, { x: 1058, y: 702, r: 20 },
      { x: 1338, y: 528, r: 24 }, { x: 1108, y: 882, r: 32 },
      { x: 858, y: 962, r: 18 },
    ] as Array<{ x: number; y: number; r: number }>) {
      decor.fillCircle(s.x, s.y, s.r);
    }
    // Dark puddles (oil / water)
    decor.fillStyle(0x07111C, 0.55);
    decor.fillEllipse(462, 598, 48, 18);
    decor.fillEllipse(908, 742, 38, 14);
    decor.fillEllipse(1378, 462, 42, 16);
    decor.fillEllipse(1018, 922, 52, 18);

    // ─── 5. PERIMETER WALLS (visual) ───────────────────────────────────────
    const wallGfx = this.add.graphics().setDepth(8).setName('perimeter-walls');
    const drawThickWall = (wx: number, wy: number, ww: number, wh: number) => {
      // Base stone
      wallGfx.fillStyle(0x181D26, 1);
      wallGfx.fillRect(wx, wy, ww, wh);
      // Interior edge highlight
      wallGfx.fillStyle(0x252C3A, 0.8);
      if (wh > ww) {
        wallGfx.fillRect(wx + ww - 4, wy, 4, wh); // right highlight (inner face)
      } else {
        wallGfx.fillRect(wx, wy + wh - 4, ww, 4); // bottom highlight (inner face)
      }
      // Brick pattern lines
      wallGfx.lineStyle(1, 0x0F1420, 0.7);
      if (wh > ww) {
        for (let by = wy + 8; by < wy + wh; by += 10) {
          wallGfx.lineBetween(wx, by, wx + ww, by);
        }
      } else {
        for (let bx = wx + 8; bx < wx + ww; bx += 10) {
          wallGfx.lineBetween(bx, wy, bx, wy + wh);
        }
      }
      // Outer border
      wallGfx.lineStyle(2, 0x0A0E16, 1);
      wallGfx.strokeRect(wx, wy, ww, wh);
    };
    const VW = 40; // visual wall thickness
    const VH = 22; // horizontal wall height
    drawThickWall(ARENA_MIN_X, ARENA_MIN_Y, ARENA_MAX_X - ARENA_MIN_X, VH); // top
    drawThickWall(ARENA_MIN_X, ARENA_MAX_Y - VH, ARENA_MAX_X - ARENA_MIN_X, VH); // bottom
    drawThickWall(ARENA_MIN_X, ARENA_MIN_Y, VW, ARENA_MAX_Y - ARENA_MIN_Y); // left
    drawThickWall(ARENA_MAX_X - VW, ARENA_MIN_Y, VW, ARENA_MAX_Y - ARENA_MIN_Y); // right
    // Corner reinforcements
    wallGfx.fillStyle(0x1E2534, 1);
    wallGfx.lineStyle(1, 0x303A4A, 0.9);
    for (const [cx, cy] of [
      [ARENA_MIN_X, ARENA_MIN_Y],
      [ARENA_MAX_X - VW - 4, ARENA_MIN_Y],
      [ARENA_MIN_X, ARENA_MAX_Y - VH - 4],
      [ARENA_MAX_X - VW - 4, ARENA_MAX_Y - VH - 4],
    ] as [number, number][]) {
      wallGfx.fillRect(cx, cy, VW + 4, VH + 4);
      wallGfx.strokeRect(cx, cy, VW + 4, VH + 4);
    }

    // ─── 6. SECTION DIVIDER WALLS + DOOR FRAMES ────────────────────────────
    const divGfx = this.add.graphics().setDepth(9).setName('divider-walls');
    const drawDivSeg = (dx: number, dy: number, dw: number, dh: number) => {
      divGfx.fillStyle(0x181D26, 1);
      divGfx.fillRect(dx, dy, dw, dh);
      divGfx.fillStyle(0x252C3A, 0.65);
      if (dh > dw) divGfx.fillRect(dx + dw - 3, dy, 3, dh);
      else divGfx.fillRect(dx, dy + dh - 3, dw, 3);
      divGfx.lineStyle(1, 0x0F1420, 0.55);
      if (dh > dw) {
        for (let by = dy + 5; by < dy + dh; by += 10) divGfx.lineBetween(dx, by, dx + dw, by);
      } else {
        for (let bx = dx + 5; bx < dx + dw; bx += 10) divGfx.lineBetween(bx, dy, bx, dy + dh);
      }
      divGfx.lineStyle(1, 0x0A0E16, 1);
      divGfx.strokeRect(dx, dy, dw, dh);
    };
    const drawDoorFrame = (fx: number, fy: number, fw: number, fh: number) => {
      divGfx.lineStyle(2, 0xF5C842, 0.42);
      divGfx.strokeRect(fx - 2, fy - 2, fw + 4, fh + 4);
    };
    // START → YARD  (vertical x≈685, door gap y=590-700)
    drawDivSeg(685, 420, 25, 170);
    drawDivSeg(685, 700, 25, 240);
    drawDoorFrame(685, 590, 25, 110);
    // YARD → WORKSHOP  (vertical x≈1110, door gap y=560-670)
    drawDivSeg(1110, 380, 20, 180);
    drawDivSeg(1110, 670, 20, 100);
    drawDoorFrame(1110, 560, 20, 110);
    // YARD+WORKSHOP → STREET  (horizontal y≈770, door gap x=880-1000)
    drawDivSeg(700, 770, 180, 30);
    drawDivSeg(1000, 770, 650, 30);
    drawDoorFrame(880, 770, 120, 30);

    // ─── 7. AMBIENT LIGHT POOLS ────────────────────────────────────────────
    const light = this.add.graphics().setDepth(4).setName('lighting');
    for (const lp of [
      { x: 400, y: 700, c: 0xFFCC66 },  // start room
      { x: 900, y: 580, c: 0xFFCC66 },  // yard
      { x: 1380, y: 560, c: 0x66AAFF }, // workshop (industrial cool)
      { x: 1100, y: 940, c: 0xFF6622 }, // street (fire glow)
    ] as Array<{ x: number; y: number; c: number }>) {
      light.fillStyle(lp.c, 0.042);
      light.fillCircle(lp.x, lp.y, 180);
      light.fillStyle(lp.c, 0.022);
      light.fillCircle(lp.x, lp.y, 320);
    }

    // ─── 8. MYSTERY BOX LABEL ──────────────────────────────────────────────
    this.add.text(BOX_POS.x, BOX_POS.y - 72, 'MYSTERY BOX', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF7CCE',
    }).setOrigin(0.5).setDepth(50);

    // ─── 9. EXIT PAD ───────────────────────────────────────────────────────
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

    // ─── 10. SECTION LABELS ────────────────────────────────────────────────
    for (const section of ZOMBIES_SECTIONS) {
      this.add.text(section.x + 24, section.y + 24, section.label, {
        fontSize: '10px',
        fontFamily: '"Press Start 2P", monospace',
        color: section.unlockedByDefault ? '#7CC9FF' : '#62798F',
      }).setDepth(40);
    }

    // ─── 11. OBSTACLES + SPAWN NODES ───────────────────────────────────────
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

  // ─── OBSTACLE HELPERS ────────────────────────────────────────────────────
  private addObstacle(rx: number, ry: number, rw: number, rh: number, fillColor: number, strokeColor: number) {
    this.obstacles.push(createZombiesObstacleVisual(this, rx, ry, rw, rh, fillColor, strokeColor));
  }

  private addWallCollider(rx: number, ry: number, rw: number, rh: number) {
    this.obstacles.push(addZombiesWallCollider(this, rx, ry, rw, rh));
  }

  private buildObstacles() {
    // ─── 1. PERIMETER WALL COLLIDERS (18px invisible, matches buildArena 40px visual walls) ─
    // Left wall — right edge at x=78 so spawn at x=110 (dx=32 > radius=18) is safe
    this.addWallCollider(60, 120, 18, 980);
    // Right wall
    this.addWallCollider(1742, 120, 18, 980);
    // Top wall
    this.addWallCollider(60, 120, 1700, 18);
    // Bottom wall
    this.addWallCollider(60, 1082, 1700, 18);

    // ─── 2. SECTION DIVIDER COLLIDERS ─────────────────────────────────────────
    // START → YARD divider (x=685), door gap y=590-700
    this.addWallCollider(685, 138, 25, 452);   // above door (extends from top wall down to door)
    this.addWallCollider(685, 700, 25, 382);   // below door — extends all way to bottom perimeter (y=1082)

    // YARD → WORKSHOP divider (x=1110), door gap y=560-670
    this.addWallCollider(1110, 138, 20, 422);  // above door (extends from top wall down to door)
    this.addWallCollider(1110, 670, 20, 100);  // below door

    // STREET horizontal divider (y=770), door gap x=880-1000
    this.addWallCollider(700, 770, 180, 30);   // left of door
    this.addWallCollider(1000, 770, 742, 30);  // right of door — extends to right perimeter (x=1742)

    // STREET right-side seal — closes gap between STREET divider and right perimeter wall
    this.addWallCollider(1650, 800, 92, 282);  // x=1650→1742, y=800→1082

    // ─── TOP CAPS — cierra la zona vacía sobre cada sección ───────────────────
    // Impide que el jugador suba por encima del área jugable de cada room.
    // START ROOM: section.x=120, y=470, w=560 → tope en y=465
    this.addWallCollider(ARENA_MIN_X + 40, 465, 645, 15);  // cubre x=100→745
    // YARD: section.x=710, y=420, w=400 → tope en y=415
    this.addWallCollider(710, 415, 400, 15);
    // WORKSHOP: section.x=1130, y=380, w=520 → tope en y=375
    this.addWallCollider(1130, 375, 520, 15);
    // STREET: no necesita tope — la pared horizontal en y=770 ya lo cubre

    // ─── 3. START ROOM obstacles (crates + barrels) ──────────────────────────
    // wooden crates cluster — left side, away from spawn at (110,575)
    this.addObstacle(200, 540, 52, 44, 0x2E1F0E, 0x8B5E2A);  // crate 1
    this.addObstacle(260, 540, 52, 44, 0x2E1F0E, 0x8B5E2A);  // crate 2
    this.addObstacle(200, 590, 52, 44, 0x2E1F0E, 0x7A5020);  // crate 3
    // metal barrels near bottom-left
    this.addObstacle(310, 820, 36, 44, 0x1E2830, 0x4A7A9B);  // barrel 1
    this.addObstacle(354, 820, 36, 44, 0x1E2830, 0x4A7A9B);  // barrel 2
    this.addObstacle(332, 870, 36, 44, 0x1A2428, 0x3A6070);  // barrel 3
    // small crate stack
    this.addObstacle(530, 550, 44, 38, 0x2E1F0E, 0x8B5E2A);
    this.addObstacle(530, 594, 44, 38, 0x251A0C, 0x7A5020);

    // ─── 4. YARD obstacles (rubble + burnt car) ───────────────────────────────
    // rubble pile 1
    this.addObstacle(750, 460, 68, 36, 0x2A2520, 0x6B5E4A);
    this.addObstacle(760, 500, 50, 28, 0x252018, 0x5A4E38);
    // rubble pile 2
    this.addObstacle(960, 540, 56, 32, 0x2A2520, 0x6B5E4A);
    this.addObstacle(968, 574, 44, 22, 0x221C14, 0x4E4230);
    // burnt car body (large)
    this.addObstacle(820, 490, 120, 58, 0x1A1208, 0x5C3A12);  // car body
    this.addObstacle(826, 552, 108, 18, 0x120E06, 0x3E2808);  // car undercarriage

    // ─── 5. WORKSHOP obstacles (machinery + workbench) ───────────────────────
    // large machine block — back-left
    this.addObstacle(1160, 400, 90, 70, 0x0E1820, 0x2A4A6A);
    this.addObstacle(1256, 400, 60, 70, 0x0C1418, 0x1E3A50);
    // workbench — center
    this.addObstacle(1240, 510, 140, 36, 0x1E1408, 0x6B4A20);
    this.addObstacle(1248, 548, 124, 12, 0x14100A, 0x4A3018);  // shelf under bench
    // equipment rack — right
    this.addObstacle(1540, 420, 40, 120, 0x0E1820, 0x2A4A6A);
    this.addObstacle(1584, 440, 40, 80, 0x0C1418, 0x1E3A50);
    // generator / tank
    this.addObstacle(1340, 660, 60, 48, 0x141C20, 0x3A5A6A);

    // ─── 6. BURNT STREET obstacles (destroyed cars + concrete blocks) ─────────
    // concrete barrier left
    this.addObstacle(730, 820, 70, 30, 0x1E1E22, 0x484850);
    this.addObstacle(730, 854, 70, 20, 0x18181C, 0x383840);
    // destroyed car 1
    this.addObstacle(880, 810, 130, 50, 0x120C08, 0x3E2818);
    this.addObstacle(888, 864, 114, 16, 0x0E0A06, 0x2A1C10);
    // concrete barrier mid
    this.addObstacle(1100, 825, 60, 28, 0x1E1E22, 0x484850);
    // destroyed car 2
    this.addObstacle(1260, 808, 130, 52, 0x120C08, 0x3E2818);
    this.addObstacle(1268, 862, 114, 16, 0x0E0A06, 0x2A1C10);
    // large concrete block far right
    this.addObstacle(1540, 820, 80, 36, 0x1E1E22, 0x484850);
    this.addObstacle(1540, 858, 80, 22, 0x18181C, 0x383840);
  }

  private buildSpawnNodes() {
    let index = 0;
    for (const section of ZOMBIES_SECTIONS) {
      for (const spawn of getZombiesArenaSectionSpawnPoints(section)) {
        index += 1;
        const { frame, glass, planks, warning, pulse } = createZombiesSpawnVisual(this, spawn);

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
    setupZombiesPlayer(this as unknown as Parameters<typeof setupZombiesPlayer>[0]);
  }

  private setupInput() {
    setupZombiesInput(this as unknown as Parameters<typeof setupZombiesInput>[0]);
  }

  private setupHud() {
    createZombiesHud(this as unknown as Parameters<typeof createZombiesHud>[0]);
    this.renderHud();
  }

  private setupDoors() {
    for (const section of ZOMBIES_SECTIONS) {
      if (section.unlockedByDefault) continue;
      const layoutSection = getZombiesArenaSectionById(ZOMBIES_SECTIONS, section.id);
      if (!layoutSection) continue;
      const rect = getZombiesArenaSectionDoorBounds(layoutSection);
      const visual = createZombiesArenaDoorVisual(this, layoutSection);
      if (!rect || !visual) continue;
      const { panel, label, costText } = visual;
      costText.setText(`${section.unlockCost} PTS`);
      this.doors.set(section.id, {
        id: section.id,
        unlocked: false,
        cost: section.unlockCost ?? 0,
        rect,
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
    renderZombiesHud(this as unknown as Parameters<typeof renderZombiesHud>[0]);
  }

  private showNotice(text: string, color = '#F5C842') {
    showZombiesNotice(this as unknown as Parameters<typeof showZombiesNotice>[0], text, color);
  }

  private showPowerupBanner(text: string, color = '#FFFFFF') {
    showZombiesPowerupBanner(this as unknown as Parameters<typeof showZombiesPowerupBanner>[0], text, color);
  }

  private beginRound() {
    beginZombiesRound(this as unknown as Parameters<typeof beginZombiesRound>[0]);
  }

  private isBossRound(round: number) {
    return isZombiesBossRound(round);
  }

  private getRunElapsedMinutes() {
    if (this.runStartedAt <= 0) return 0;
    return Math.max(0, (this.time.now - this.runStartedAt) / 60000);
  }

  private getPressureTier() {
    return getZombiesPressureTier(this as unknown as Parameters<typeof getZombiesPressureTier>[0]);
  }

  private getScaledRoundTarget(round: number) {
    return getZombiesScaledRoundTarget(this as unknown as Parameters<typeof getZombiesScaledRoundTarget>[0], round);
  }

  private getScaledSpawnDelayMs(round: number) {
    return getZombiesScaledSpawnDelayMs(this as unknown as Parameters<typeof getZombiesScaledSpawnDelayMs>[0], round);
  }

  private getScaledRoundWarmupMs(round: number) {
    return getZombiesScaledRoundWarmupMs(this as unknown as Parameters<typeof getZombiesScaledRoundWarmupMs>[0], round);
  }

  private getScaledConcurrentCap(round: number) {
    return getZombiesScaledConcurrentCap(this as unknown as Parameters<typeof getZombiesScaledConcurrentCap>[0], round);
  }

  private createPickupRuntimeState(): ZombiesPickupRuntimeState {
    return createZombiesPickupRuntimeState({
      doublePointsUntil: this.doublePointsUntil,
      instaKillUntil: this.instaKillUntil,
      pickupIdSeq: this.pickupIdSeq,
    });
  }

  private syncPickupRuntimeState(runtimeState: ZombiesPickupRuntimeState) {
    const target = {
      doublePointsUntil: this.doublePointsUntil,
      instaKillUntil: this.instaKillUntil,
      pickupIdSeq: this.pickupIdSeq,
    };
    applyZombiesPickupRuntimeState(target, runtimeState);
    this.doublePointsUntil = target.doublePointsUntil;
    this.instaKillUntil = target.instaKillUntil;
    this.pickupIdSeq = target.pickupIdSeq;
  }

  private scheduleSharedReset() {
    const scene = {
      channel: this.channel,
      isSharedRunHost: () => this.isSharedRunHost(),
      playerId: this.playerId,
      restartRun: () => this.restartRun(),
      sharedRunPlayers: this.sharedRunPlayers,
      showNotice: (text: string, color: string) => this.showNotice(text, color),
      time: this.time,
    };

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const resetBridge = {
      ...scene,
      get sharedResetPending() {
        return self.sharedResetPending;
      },
      set sharedResetPending(value: boolean) {
        self.sharedResetPending = value;
      },
    };
    return scheduleZombiesRealtimeSharedReset(resetBridge);
  }

  private createPickupSceneContext() {
    return createZombiesPickupSceneAdapter({
      add: this.add,
      doublePointsUntil: this.doublePointsUntil,
      instaKillUntil: this.instaKillUntil,
      pickupIdSeq: this.pickupIdSeq,
      pickups: this.pickups,
      time: this.time,
      tweens: this.tweens,
      weaponInventory: this.weaponInventory,
      weaponOrder: this.weaponOrder,
    }, {
      broadcastSharedMaxAmmo: () => {
        this.channel?.send({
          type: 'broadcast',
          event: 'shared:max_ammo',
          payload: { host_id: this.playerId },
        });
      },
      getAliveSharedTargets: () => this.getAliveSharedTargets(),
      getWeaponStats: (weaponId: ZombiesWeaponId) => this.getWeaponStats(weaponId),
      isSharedRunHost: () => this.isSharedRunHost(),
      showFloatingText: (text: string, x: number, y: number, color: string) => this.showFloatingText(text, x, y, color),
      showNotice: (text: string, color: string) => this.showNotice(text, color),
      showPowerupBanner: (text: string, color: string) => this.showPowerupBanner(text, color),
      triggerNuke: () => this.triggerNuke(),
    });
  }

  private createRealtimeSharedSnapshotScene() {
    return createZombiesRealtimeSharedSnapshotAdapter({
      add: this.add,
      bossAlive: this.bossAlive,
      bossRoundActive: this.bossRoundActive,
      bossSpawnedThisRound: this.bossSpawnedThisRound,
      boxRollingUntil: this.boxRollingUntil,
      depthsUnlocked: this.depthsUnlocked,
      doors: this.doors,
      doublePointsUntil: this.doublePointsUntil,
      instaKillUntil: this.instaKillUntil,
      mysteryBoxCooldownUntil: this.mysteryBoxCooldownUntil,
      nextSpawnAt: this.nextSpawnAt,
      pickupIdSeq: this.pickupIdSeq,
      pickups: this.pickups,
      points: this.points,
      round: this.round,
      roundBreakUntil: this.roundBreakUntil,
      roundTarget: this.roundTarget,
      sharedRunHostId: this.sharedRunHostId ?? null,
      sharedRunPlayers: this.sharedRunPlayers,
      spawnNodes: this.spawnNodes,
      spawnedThisRound: this.spawnedThisRound,
      time: this.time,
      tweens: this.tweens,
      zombieIdSeq: this.zombieIdSeq,
      zombieProjectileSeq: this.zombieProjectileSeq,
      zombieProjectiles: this.zombieProjectiles,
      zombies: this.zombies,
    }, {
      applySharedPlayerStateToLocal: () => this.applySharedPlayerStateToLocal(),
      createZombieEntity: (snapshot: unknown) => this.createZombieEntity(snapshot as Parameters<typeof this.createZombieEntity>[0]),
      createZombieProjectileEntity: (snapshot) => this.createZombieProjectileEntity(snapshot),
      destroyZombieProjectile: (id: string) => this.destroyZombieProjectile(id),
      isSharedCoopEnabled: () => this.isSharedCoopEnabled(),
      isSharedRunHost: () => this.isSharedRunHost(),
      refreshSpawnNodeVisual: (node: unknown, healthDelta: number, occupied: boolean) =>
        this.refreshSpawnNodeVisual(node as Parameters<typeof this.refreshSpawnNodeVisual>[0], healthDelta, occupied),
      renderZombieHp: (zombie: unknown) => this.renderZombieHp(zombie as Parameters<typeof this.renderZombieHp>[0]),
      safeDestroyZombieVisual: (zombie: unknown) => this.safeDestroyZombieVisual(zombie as Parameters<typeof this.safeDestroyZombieVisual>[0]),
      setZombieState: (zombie: unknown, state: unknown) =>
        this.setZombieState(zombie as Parameters<typeof this.setZombieState>[0], state as Parameters<typeof this.setZombieState>[1]),
      updateDepthsAccessVisual: () => this.updateDepthsAccessVisual(),
    });
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
      this.handleHpRegen(delta);
    }

    if (!this.isSharedCoopEnabled() || this.isSharedRunHost()) {
      this.handleRoundFlow();
      this.updateZombies(delta);
      this.updateZombieProjectiles(delta);
      const pickupScene = this.createPickupSceneContext();
      const pickupRuntimeState = this.createPickupRuntimeState();
      runAndSyncZombiesPickupCycle(
        pickupRuntimeState,
        pickupScene,
      );
      this.syncPickupRuntimeState(pickupRuntimeState);
      const broadcastedSnapshot = maybeBroadcastZombiesRealtimeSharedSnapshot({
        bossAlive: this.bossAlive,
        bossRoundActive: this.bossRoundActive,
        bossSpawnedThisRound: this.bossSpawnedThisRound,
        boxRollingUntil: this.boxRollingUntil,
        channel: this.channel,
        doors: this.doors,
        doublePointsUntil: this.doublePointsUntil,
        depthsUnlocked: this.depthsUnlocked,
        instaKillUntil: this.instaKillUntil,
        isSharedRunHost: () => this.isSharedRunHost(),
        lastSharedSnapshotSentAt: this.lastSharedSnapshotSentAt,
        mysteryBoxCooldownUntil: this.mysteryBoxCooldownUntil,
        nextSpawnAt: this.nextSpawnAt,
        pickupIdSeq: this.pickupIdSeq,
        pickups: this.pickups,
        playerId: this.playerId,
        points: this.points,
        px: this.px,
        py: this.py,
        round: this.round,
        roundBreakUntil: this.roundBreakUntil,
        roundTarget: this.roundTarget,
        sharedRunPlayers: this.sharedRunPlayers,
        spawnNodes: this.spawnNodes,
        spawnedThisRound: this.spawnedThisRound,
        time: this.time,
        zombieIdSeq: this.zombieIdSeq,
        zombieProjectileSeq: this.zombieProjectileSeq,
        zombieProjectiles: this.zombieProjectiles,
        zombies: this.zombies,
      });
      if (broadcastedSnapshot) {
        this.lastSharedSnapshotSentAt = this.time.now;
      }
    }

    this.updatePromptHud(this.getNearbyInteraction());
    const realtimeFrame = {
      avatarConfig: this.avatarConfig,
      channel: this.channel,
      gameOver: this.gameOver,
      hp: this.hp,
      isSharedCoopEnabled: () => this.isSharedCoopEnabled(),
      lastIsMoving: this.lastIsMoving,
      lastMoveDx: this.lastMoveDx,
      lastMoveDy: this.lastMoveDy,
      lastPosSent: this.lastPosSent,
      playerId: this.playerId,
      playerUsername: this.playerUsername,
      px: this.px,
      py: this.py,
      remotePlayers: this.remotePlayers,
      sharedRunPlayers: this.sharedRunPlayers,
      syncLocalSharedPlayerState: () => this.syncLocalSharedPlayerState(),
    };
    stepZombiesRealtimeFrame(realtimeFrame);
    this.lastPosSent = realtimeFrame.lastPosSent;
    this.hp = realtimeFrame.hp;
    this.gameOver = realtimeFrame.gameOver;
    this.player.update(this.lastIsMoving, this.input.activePointer.worldX - this.px, this.lastMoveDy);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(Math.floor(this.py / 10));
    this.playerName.setPosition(this.px, this.py - 44);
    this.chatSystem?.updatePosition('__player__', this.px, this.py);
    this.chatSystem?.update();
    this.updateFuria();
    this.renderHud();
  }

  private handleMovement() {
    handleZombiesMovement(this as unknown as Parameters<typeof handleZombiesMovement>[0]);
  }

  private tryMovePlayer(nextX: number, nextY: number) {
    return tryMoveZombiesPlayer(
      this as unknown as Parameters<typeof tryMoveZombiesPlayer>[0],
      nextX,
      nextY,
    );
  }

  private handleCombatInput() {
    handleZombiesCombatInput(this as unknown as Parameters<typeof handleZombiesCombatInput>[0]);
  }

  private getZombiesAimAngle(): number {
    return getPlayerZombiesAimAngle(
      this as unknown as Parameters<typeof getPlayerZombiesAimAngle>[0],
    );
  }

  private tryShoot() {
    tryShootZombies(this as unknown as Parameters<typeof tryShootZombies>[0]);
  }

  private tryReload() {
    void tryReloadZombiesCombat(
      this as unknown as Parameters<typeof tryReloadZombiesCombat>[0],
    );
  }

  private cycleWeapon() {
    const available = this.weaponOrder.filter((id) => this.weaponInventory[id].owned);
    if (available.length <= 1) return;
    const index = available.indexOf(this.currentWeapon);
    const next = available[(index + 1) % available.length];
    this.currentWeapon = next;
    this.showNotice(`ARMADO ${this.getWeaponStats(next).displayLabel}`, '#7CC9FF');
  }

  // ── Gym Lv4 — Furia ability ────────────────────────────────────────────────
  private static readonly FURIA_DURATION_MS  = 10_000;
  private static readonly FURIA_COOLDOWN_MS  = 180_000; // 3 minutes

  private tryActivateFuria() {
    tryActivateZombiesFuria(
      this as unknown as Parameters<typeof tryActivateZombiesFuria>[0],
    );
  }

  private updateFuria() {
    updateZombiesFuriaHud(this as unknown as Parameters<typeof updateZombiesFuriaHud>[0]);
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
    fireZombiesShotBurst(
      this as unknown as Parameters<typeof fireZombiesShotBurst>[0],
      shooterId,
      _username,
      originX,
      originY,
      targetX,
      targetY,
      weapon,
      applyDamage,
    );
  }

  private drawShotFxFrom(originX: number, originY: number, endX: number, endY: number, color: number) {
    drawZombiesShotFxFrom(
      this as unknown as Parameters<typeof drawZombiesShotFxFrom>[0],
      originX,
      originY,
      endX,
      endY,
      color,
    );
  }

  private findZombieTargetFrom(originX: number, originY: number, angle: number, maxRange: number) {
    return findZombiesTargetFrom(
      this as unknown as Parameters<typeof findZombiesTargetFrom>[0],
      originX,
      originY,
      angle,
      maxRange,
    ) as ZombieState | null;
  }

  private handleRoundFlow() {
    handleZombiesRoundFlow(this as unknown as Parameters<typeof handleZombiesRoundFlow>[0]);
  }

  private countAliveZombies() {
    return countAliveSpawningZombies(this as unknown as Parameters<typeof countAliveSpawningZombies>[0]);
  }

  private getPointsMultiplier() {
    return getZombiesPointsMultiplier(this as unknown as Parameters<typeof getZombiesPointsMultiplier>[0]);
  }

  private getWeaponState(weaponId: ZombiesWeaponId) {
    return getZombiesWeaponState(this as unknown as Parameters<typeof getZombiesWeaponState>[0], weaponId);
  }

  private getWeaponStats(weaponId: ZombiesWeaponId) {
    return getZombiesWeaponStats(this as unknown as Parameters<typeof getZombiesWeaponStats>[0], weaponId);
  }

  private getPackCost(weaponId: ZombiesWeaponId) {
    return getZombiesPackCost(this as unknown as Parameters<typeof getZombiesPackCost>[0], weaponId);
  }

  private pickZombieType(): ZombieType {
    return pickZombiesType(this as unknown as Parameters<typeof pickZombiesType>[0]);
  }

  private getUnlockedSections() {
    return ZOMBIES_SECTIONS.filter((section) => section.unlockedByDefault || this.doors.get(section.id)?.unlocked);
  }

  private getAvailableSpawnNodes() {
    return getZombiesAvailableSpawnNodes(this as unknown as Parameters<typeof getZombiesAvailableSpawnNodes>[0]);
  }

  private showBossIntro(text: string) {
    showZombiesBossIntro(this as unknown as Parameters<typeof showZombiesBossIntro>[0], text);
  }

  private triggerBossRoundIntro(text: string) {
    this.showBossIntro(text);
    this.showNotice('BOSS INCOMING', '#FF6A6A');
    this.cameras.main.flash(180, 120, 20, 20, false);
    this.cameras.main.shake(160, 0.0032);
    this.playZombiesSfx('boss_round');
  }

  private spawnZombie() {
    return spawnZombiesZombie(this as unknown as Parameters<typeof spawnZombiesZombie>[0]);
  }

  private spawnBossZombie() {
    return spawnZombiesBossZombie(this as unknown as Parameters<typeof spawnZombiesBossZombie>[0]);
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
    const activeZombies: ZombieState[] = [];
    for (const zombie of this.zombies.values()) {
      if (!zombie.alive) continue;
      activeZombies.push(zombie);
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
      const moveMultiplier = this.getZombieMoveMultiplier(zombie);

      if (dist > zombie.attackRange + 2) {
        if (zombie.isBoss && this.time.now - zombie.lastSpecialAt >= 2200) {
          zombie.lastSpecialAt = this.time.now;
          if (dist > 150) this.performBossRush(zombie, target, dist, nx, ny);
          else this.performBossNova(zombie);
        }
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
          const driftX = zombie.x + (-ny * lateral) * zombie.speed * 30 * dt * moveMultiplier;
          const driftY = zombie.y + (nx * lateral) * zombie.speed * 30 * dt * moveMultiplier;
          if (!this.isBlocked(driftX, zombie.y, zombie.radius)) zombie.x = driftX;
          if (!this.isBlocked(zombie.x, driftY, zombie.radius)) zombie.y = driftY;
          if (this.time.now - zombie.lastAttackAt >= zombie.attackCooldownMs) {
            zombie.lastAttackAt = this.time.now;
            this.spawnBossProjectileBurst(zombie);
          }
        } else if (canShoot) {
          zombie.state = 'attack';
          const lateral = Math.sin(this.time.now / 360 + zombie.phase) * 0.3;
          const orbitX = zombie.x + (-ny * lateral) * zombie.speed * 42 * dt * moveMultiplier;
          const orbitY = zombie.y + (nx * lateral) * zombie.speed * 42 * dt * moveMultiplier;
          if (!this.isBlocked(orbitX, zombie.y, zombie.radius)) zombie.x = orbitX;
          if (!this.isBlocked(zombie.x, orbitY, zombie.radius)) zombie.y = orbitY;
          if (this.time.now - zombie.lastAttackAt >= zombie.attackCooldownMs) {
            zombie.lastAttackAt = this.time.now;
            this.spawnZombieProjectile(zombie);
          }
        } else {
          const lateral = Math.sin(this.time.now / 320 + zombie.phase) * (zombie.type === 'runner' ? 0.42 : zombie.type === 'brute' ? 0.08 : 0.22);
          const moveX = (nx - ny * lateral) * zombie.speed * 60 * dt * moveMultiplier;
          const moveY = (ny + nx * lateral) * zombie.speed * 60 * dt * moveMultiplier;
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

    this.resolveZombieCrowding(activeZombies);
  }

  private getZombieMoveMultiplier(zombie: ZombieState) {
    if (!zombie.isBoss) return 1;
    const hpRatio = zombie.maxHp > 0 ? zombie.hp / zombie.maxHp : 1;
    if (hpRatio <= 0.3) return 3.2;
    if (hpRatio <= 0.6) return 2.5;
    return 1.7;
  }

  private performBossRush(
    zombie: ZombieState,
    target: SharedRunPlayerState,
    distance: number,
    nx: number,
    ny: number,
  ) {
    const rushDistance = Phaser.Math.Clamp(distance * 0.5, 96, 180);
    let landedX = zombie.x;
    let landedY = zombie.y;

    for (const ratio of [1, 0.8, 0.6, 0.4]) {
      const tryX = zombie.x + nx * rushDistance * ratio;
      const tryY = zombie.y + ny * rushDistance * ratio;
      if (this.isBlocked(tryX, tryY, zombie.radius)) continue;
      landedX = tryX;
      landedY = tryY;
      break;
    }

    const trail = this.add.circle(zombie.x, zombie.y, zombie.radius + 18, 0xFF6A6A, 0.16).setDepth(149);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      scale: 1.7,
      duration: 220,
      ease: 'Sine.easeOut',
      onComplete: () => trail.destroy(),
    });

    zombie.x = landedX;
    zombie.y = landedY;
    zombie.state = 'attack';
    this.cameras.main.shake(90, 0.0024);
    this.spawnBossProjectileBurst(zombie);

    if (Phaser.Math.Distance.Between(zombie.x, zombie.y, target.x, target.y) <= zombie.attackRange + 52) {
      zombie.lastAttackAt = this.time.now;
      this.applyDamageToPlayer(target.player_id, Math.round(zombie.damage * 1.45));
    }
  }

  private performBossNova(zombie: ZombieState) {
    const shock = this.add.circle(zombie.x, zombie.y, zombie.radius + 16, 0xFF4D7A, 0.18).setDepth(150);
    this.tweens.add({
      targets: shock,
      alpha: 0,
      scale: 2.8,
      duration: 260,
      ease: 'Sine.easeOut',
      onComplete: () => shock.destroy(),
    });
    for (let i = 0; i < 8; i += 1) {
      this.spawnZombieProjectile(
        zombie,
        (Math.PI * 2 * i) / 8,
        300,
        7,
        Math.max(16, Math.round(zombie.damage * 0.78)),
      );
    }
    this.cameras.main.shake(110, 0.0028);
  }

  private resolveZombieCrowding(zombies: ZombieState[]) {
    for (let i = 0; i < zombies.length; i += 1) {
      const a = zombies[i];
      if (!a.alive || a.spawnNodeId) continue;

      for (let j = i + 1; j < zombies.length; j += 1) {
        const b = zombies[j];
        if (!b.alive || b.spawnNodeId) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius + 6;
        const distSq = dx * dx + dy * dy;
        if (distSq <= 0 || distSq >= minDist * minDist) continue;

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const push = (minDist - dist) * 0.5;
        const nextAX = a.x - nx * push;
        const nextAY = a.y - ny * push;
        const nextBX = b.x + nx * push;
        const nextBY = b.y + ny * push;

        if (!this.isBlocked(nextAX, a.y, a.radius)) a.x = nextAX;
        if (!this.isBlocked(a.x, nextAY, a.radius)) a.y = nextAY;
        if (!this.isBlocked(nextBX, b.y, b.radius)) b.x = nextBX;
        if (!this.isBlocked(b.x, nextBY, b.radius)) b.y = nextBY;
      }
    }

    for (const zombie of zombies) {
      if (!zombie.alive || zombie.spawnNodeId) continue;
      zombie.container.setPosition(zombie.x, zombie.y);
      zombie.shadow.setPosition(zombie.x, zombie.y + zombie.radius + 8);
      zombie.container.setDepth(Math.floor(zombie.y / 10));
      zombie.shadow.setDepth(zombie.container.depth - 1);
      this.renderZombieHp(zombie);
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
    releaseZombiesSpawnNode(this as unknown as Parameters<typeof releaseZombiesSpawnNode>[0], node, resetBoards);
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
      this.scheduleSharedReset();
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

  applyZombieDamage(zombie: ZombiesCombatZombie, damage: number) {
    this.damageZombie(zombie as unknown as ZombieState, damage);
  }

  private damageZombie(zombie: ZombieState, damage: number) {
    if (!zombie.alive) return;
    const furiaBonusMult = getSkillSystem().getSpec('gym') === 'gym_fighter' ? 1.8 : 1.3;
    const furiaMult = this.furiaActive && this.time.now < this.furiaUntil ? furiaBonusMult : 1.0;
    const appliedDamage = this.instaKillUntil > this.time.now ? zombie.hp : Math.round(damage * furiaMult);
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
    this.killCount += 1;
    const xpGained = zombie.isBoss ? 25 : zombie.killReward >= 120 ? 12 : zombie.killReward >= 70 ? 7 : 5;
    const prevLevel = this.progression.level;
    this.progression = addXpToProgression(this.progression, xpGained);
    saveProgressionState(this.progression);
    this.playerLevel = this.progression.level;
    syncXpToServer(xpGained);
    if (this.progression.level > prevLevel) {
      this.showNotice(`¡NIVEL ${this.progression.level}! ARMAS +${((this.progression.level - 1) * 5).toFixed(0)}% DMG`, '#F5C842');
    }
    eventBus.emit(EVENTS.STATS_ZOMBIE_KILL);
    void getSkillSystem().addXp('gym', zombie.isBoss ? 10 : 3, 'zombie_kill').then((r) => {
      if (!this.scene?.isActive('ZombiesScene')) return;
      if (r.leveled_up) this.maybeShowSpecModal('gym', r.new_level);
    });
    // Track for daily quests (fire-and-forget)
    void getQuestSystem().trackAction('zombie_kill', 'gym');
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

  /** Slow passive HP regen: 1.5 HP/sec, starts 6s after last damage received. */
  private handleHpRegen(delta: number) {
    if (this.hp <= 0 || this.hp >= ZOMBIES_PLAYER.maxHp) return;
    if (this.time.now - this.lastDamageAt < 6000) return;
    this.hp = Math.min(ZOMBIES_PLAYER.maxHp, this.hp + 1.5 * (delta / 1000));
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
    eventBus.emit(EVENTS.ZOMBIES_GAME_OVER, { score: this.points, kills: this.killCount, wave: this.round });
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
    handleZombiesContextInteraction(
      this as unknown as Parameters<typeof handleZombiesContextInteraction>[0],
    );
  }

  private getNearbyInteraction(): InteractionOption | null {
    return getNearbyZombiesInteraction(
      this as unknown as Parameters<typeof getNearbyZombiesInteraction>[0],
    ) as InteractionOption | null;
  }

  private updatePromptHud(option: InteractionOption | null) {
    updateZombiesPromptHud(
      this as unknown as Parameters<typeof updateZombiesPromptHud>[0],
      option as unknown as Parameters<typeof updateZombiesPromptHud>[1],
    );
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
    const pickupScene = this.createPickupSceneContext();
    const pickupRuntimeState = this.createPickupRuntimeState();
    runZombiesPickupDropCycle(
      pickupScene,
      { x, y },
    );
    syncZombiesPickupRuntimeState(
      pickupRuntimeState,
      pickupScene,
    );
    this.syncPickupRuntimeState(pickupRuntimeState);
  }

  private triggerNuke() {
    const livingZombies = [...this.zombies.values()].filter((zombie) => zombie.alive);
    for (const zombie of livingZombies) {
      this.damageZombie(zombie, zombie.hp + 9999);
    }
    this.cameras.main.flash(180, 180, 255, 180, false);
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
    if (x - radius < PLAY_MIN_X || y - radius < PLAY_MIN_Y || x + radius > PLAY_MAX_X || y + radius > PLAY_MAX_Y) {
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
    requestZombiesExit(
      this as unknown as Parameters<typeof requestZombiesExit>[0],
    );
  }

  private enterBasementDepths() {
    enterZombiesBasementDepths(
      this as unknown as Parameters<typeof enterZombiesBasementDepths>[0],
    );
  }

  private setupRealtime() {
    if (!supabase || !isConfigured) return;

    this.channel = preferSupabaseHttpBroadcast(supabase.channel(`waspi-room-${this.scene.key.toLowerCase()}`, {
      config: {
        broadcast: { self: false },
        presence: this.isSharedCoopEnabled() ? { key: this.playerId } : undefined,
      },
    }));

    const realtimeChannel = this.channel as unknown as ZombiesRealtimeChannel;

    connectZombiesRealtimeChannel({
      avatarConfig: this.avatarConfig,
      channel: this.channel,
      isSharedCoopEnabled: () => this.isSharedCoopEnabled(),
      lastIsMoving: this.lastIsMoving,
      lastMoveDx: this.lastMoveDx,
      lastMoveDy: this.lastMoveDy,
      playerId: this.playerId,
      playerUsername: this.playerUsername,
      px: this.px,
      py: this.py,
    }, realtimeChannel, {
      onPresenceSync: () => this.handleSharedPresenceSync(),
      onRemoteLeave: (payload) => {
        const playerId = this.readStringField(payload, 'player_id', 'playerId');
        if (!playerId) return;
        handleRealtimeRemoteLeave({
          isSharedRunHost: () => this.isSharedRunHost(),
          lastSharedSnapshotSentAt: this.lastSharedSnapshotSentAt,
          maybeScheduleSharedReset: () => { this.scheduleSharedReset(); },
          remotePlayers: this.remotePlayers,
          sharedRunPlayers: this.sharedRunPlayers,
        }, playerId);
        this.lastSharedSnapshotSentAt = 0;
      },
      onRemoteState: (payload) => this.handleRemoteState(payload),
      onSharedInteract: (payload) => {
        handleZombiesRealtimeSharedInteractRequest({
          channel: this.channel,
          doors: this.doors,
          isSharedCoopEnabled: () => this.isSharedCoopEnabled(),
          isSharedRunHost: () => this.isSharedRunHost(),
          lastSharedSnapshotSentAt: this.lastSharedSnapshotSentAt,
          playerId: this.playerId,
          px: this.px,
          py: this.py,
          rollSharedMysteryBoxForPlayer: (playerId: string) => this.rollSharedMysteryBoxForPlayer(playerId),
          sharedRunPlayers: this.sharedRunPlayers,
          spawnNodes: this.spawnNodes,
          tryRepairBarricade: (nodeId: string) => this.tryRepairBarricade(nodeId),
          tryUnlockDoor: (sectionId: string) => this.tryUnlockDoor(sectionId as ZombiesSectionId),
          upgradeSharedWeaponForPlayer: (playerId: string, weaponId: string) =>
            this.upgradeSharedWeaponForPlayer(playerId, weaponId as ZombiesWeaponId),
        }, payload);
      },
      onSharedMaxAmmo: () => applySharedMaxAmmoToZombiesLoadout({
        getWeaponStats: (weaponId: ZombiesWeaponId) => this.getWeaponStats(weaponId),
        weaponInventory: this.weaponInventory,
        weaponOrder: this.weaponOrder,
      }),
      onSharedReset: () => {
        handleZombiesRealtimeSharedReset({
          restartRun: () => this.restartRun(),
        });
      },
      onSharedShot: (payload) => {
        handleZombiesRealtimeSharedShot({
          channel: this.channel,
          fireShotBurst: (
            playerId,
            username,
            originX,
            originY,
            targetX,
            targetY,
            weapon,
            isHost,
          ) => this.fireShotBurst(playerId, username, originX, originY, targetX, targetY, weapon as SharedRunShotPayload, isHost),
          isSharedCoopEnabled: () => this.isSharedCoopEnabled(),
          isSharedRunHost: () => this.isSharedRunHost(),
          playerId: this.playerId,
          playerUsername: this.playerUsername,
          px: this.px,
          py: this.py,
        }, payload);
      },
      onSharedSnapshot: (payload) => this.handleSharedSnapshot(payload),
      onSharedWeapon: (payload) => {
        handleZombiesRealtimeSharedWeaponGrant({
          channel: this.channel,
          currentWeapon: this.currentWeapon,
          getWeaponStats: (weaponId: string) => this.getWeaponStats(weaponId as ZombiesWeaponId),
          isSharedCoopEnabled: () => this.isSharedCoopEnabled(),
          playerId: this.playerId,
          showNotice: (text: string, color: string) => this.showNotice(text, color),
          weaponInventory: this.weaponInventory,
          weaponOrder: this.weaponOrder,
        }, payload);
      },
    });
  }

  private broadcastSelfState(event: 'player:join' | 'player:move') {
    broadcastRealtimeSelfState(this as unknown as Parameters<typeof broadcastRealtimeSelfState>[0], event);
  }

  private syncPosition() {
    syncRealtimePosition(this as unknown as Parameters<typeof syncRealtimePosition>[0]);
  }

  private handleSharedPresenceSync() {
    if (!this.isSharedCoopEnabled() || !this.channel) return;
    syncZombiesRealtimePresenceState(
      this as unknown as Parameters<typeof syncZombiesRealtimePresenceState>[0],
      this.channel.presenceState() as Record<string, SharedRunPresenceMeta[]>,
    );
  }

  private handleSharedSnapshot(payload: unknown) {
    const realtimeSnapshotScene = this.createRealtimeSharedSnapshotScene();

    const handled = handleZombiesRealtimeSharedSnapshot(
      realtimeSnapshotScene,
      payload,
    );
    if (!handled) return;
    applyZombiesRealtimeSharedSnapshotAdapterState(
      this as unknown as Parameters<typeof applyZombiesRealtimeSharedSnapshotAdapterState>[0],
      realtimeSnapshotScene,
    );
  }

  private broadcastSharedShot(payload: SharedRunShotPayload) {
    broadcastZombiesRealtimeSharedShot(this as unknown as Parameters<typeof broadcastZombiesRealtimeSharedShot>[0], payload);
  }

  private broadcastSharedInteract(payload: SharedRunInteractPayload) {
    broadcastZombiesRealtimeSharedInteract(this as unknown as Parameters<typeof broadcastZombiesRealtimeSharedInteract>[0], payload);
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
    broadcastZombiesRealtimeSharedWeaponGrant(this as unknown as Parameters<typeof broadcastZombiesRealtimeSharedWeaponGrant>[0], payload);
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
    handleRealtimeRemoteState({
      isSharedCoopEnabled: () => this.isSharedCoopEnabled(),
      playerId: this.playerId,
      readBooleanField: (nextPayload: unknown, ...keys: string[]) => this.readBooleanField(nextPayload, ...keys),
      readNumberField: (nextPayload: unknown, ...keys: string[]) => this.readNumberField(nextPayload, ...keys),
      readStringField: (nextPayload: unknown, ...keys: string[]) => this.readStringField(nextPayload, ...keys),
      remotePlayers: this.remotePlayers,
      sharedRunPlayers: this.sharedRunPlayers,
      spawnRemotePlayer: (playerId: string, username: string, x: number, y: number, avatarConfig: AvatarConfig) =>
        this.spawnRemotePlayer(playerId, username, x, y, avatarConfig),
    }, payload);
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

  /** Shows the specialization modal if the player just hit Lv3 and hasn't chosen a spec yet. */
  private maybeShowSpecModal(skillId: SkillId, newLevel: number): void {
    if (newLevel !== 3) return;
    if (!this.scene?.isActive('ZombiesScene')) return;
    const sys = getSkillSystem();
    if (!sys.hasSpec(skillId) && this.specModal && !this.specModal.isVisible()) {
      this.specModal.show(skillId);
    }
  }

  private handleShutdown() {
    eventBus.emit(EVENTS.ZOMBIES_SCENE_ACTIVE, false);
    this.restartPending = false;
    try {
      this.player?.clearActionState?.();
    } catch {
      // Scene is shutting down; ignore avatar cleanup failures.
    }
    cleanupZombiesInput(this as unknown as Parameters<typeof cleanupZombiesInput>[0]);
    const realtimeSession = {
      channel: this.channel,
      playerId: this.playerId,
      remotePlayers: this.remotePlayers,
    };
    teardownZombiesRealtimeSession(realtimeSession);
    this.channel = realtimeSession.channel;
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
    this.specModal?.destroy();
    this.specModal = undefined;
  }
}




