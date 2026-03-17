import Phaser from 'phaser';
import { AvatarRenderer, AvatarConfig, type AvatarAction, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { ChatSystem } from '../systems/ChatSystem';
import { WORLD, PLAYER, COLORS, ZONES, BUILDINGS, CHAT, SAFE_PLAZA_RETURN } from '../config/constants';
import { eventBus, EVENTS } from '../config/eventBus';
import { supabase, isConfigured } from '../../lib/supabase';
import { addTenks, initTenks, getTenksBalance } from '../systems/TenksSystem';
import { ensureItemEquipped, getEquippedColors, hasUtilityEquipped, ownItem, getInventory, replaceInventory } from '../systems/InventorySystem';
import { DialogSystem } from '../systems/DialogSystem';
import { BranchedDialog, type DialogNode } from '../systems/BranchedDialog';
import { CATALOG, getItem } from '../config/catalog';
import { loadAudioSettings, type AudioSettings } from '../systems/AudioSettings';
import { startSceneMusic, stopSceneMusic } from '../systems/AudioManager';
import { loadHudSettings, type HudSettings } from '../systems/HudSettings';
import { addXpToProgression, getMaxProgressionLevel, loadProgressionState, saveProgressionState, type ProgressionState } from '../systems/ProgressionSystem';
import { loadCombatStats, saveCombatStats, type CombatStats } from '../systems/CombatStats';
import { createScrollArea } from '../systems/ScrollArea';
import {
  ensureFallbackRectTexture,
  isLiveGameObject,
  safeBindAnimationComplete,
  safeCreateSpritesheetAnimation,
  safeDestroyGameObject,
  safePlaySpriteAnimation,
  safeSceneDelayedCall,
  safeSetSpriteTexture,
  safeWithLiveSprite,
} from '../systems/AnimationSafety';
import { announceScene, bindSafeResetToPlaza } from '../systems/SceneUi';
import { SceneControls } from '../systems/SceneControls';
import { getVoiceChat, destroyVoiceChat } from '../systems/voiceChatInstance';
import { recordDistanceDelta, recordNpcTalk } from '../systems/StatsSystem';
import type { VecindadState } from '../../lib/playerState';
import { getBuildCost, MAX_VECINDAD_STAGE, type SharedParcelState, type VecindadParcelConfig, VECINDAD_PARCELS } from '../../lib/vecindad';
import { EnemySprite, registerZombieAnims, type ZombieType } from '../systems/EnemySprite';

interface RemotePlayer {
  avatar: AvatarRenderer;
  nameplate: Phaser.GameObjects.Text;
  gunSprite?: Phaser.GameObjects.Sprite;
  username: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  isMoving: boolean;
  moveDx: number;
  moveDy: number;
  weapon?: WeaponMode;
  aimAngle: number;
  avatarConfig: AvatarConfig;
  hitbox: HitboxArc;
  lastVx?: number;
  lastVy?: number;
  lastMoveTime?: number;
}

type HitboxArc = Phaser.GameObjects.Arc & { body: Phaser.Physics.Arcade.Body };
type ArcadeObject = Phaser.GameObjects.GameObject & { destroy: () => void };
type CombatDummy = Phaser.GameObjects.Arc & { body: Phaser.Physics.Arcade.Body };
type EquippedPayload = { top?: string; bottom?: string };
type ShotBullet = Phaser.GameObjects.Rectangle & { damage?: number; knockback?: number; resolvedHit?: boolean };
type RemoteMoveEvent = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  dir: number;
  dy: number;
  moving: boolean;
  weapon?: WeaponMode;
  aim?: number;
  action?: AvatarAction;
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
  weapon?: WeaponMode;
  aim?: number;
  action?: AvatarAction;
};
type RemoteHitEvent = {
  target_id: string;
  source_id: string;
  dmg: number;
  kx?: number;
  ky?: number;
};

type WeaponMode = 'pistol' | 'shotgun' | 'smg' | 'rifle' | 'deagle' | 'cannon' | 'raygun';
type EnemyArchetype = 'rusher' | 'shooter' | 'tank' | 'boss';
/** Shape of each entry in the Supabase Presence state for voice chat. */
type PresenceVoice = { voice_peer_id?: string; [key: string]: unknown };

type WeaponStats = {
  label: string;
  pellets: number;
  spread: number;
  speed: number;
  damage: number;
  cooldownMs: number;
  color: number;
  knockback: number;
  idleTexture: string;
  idleAnim: string;
  shootAnim: string;
};

type EnemyProfile = {
  label: string;
  tint: number;
  maxHp: number;
  radius: number;
  xpReward: number;
  tenksReward: number;
  speed: number;
  preferredDistance: number;
  strafe: number;
  contactDamage: number;
  rangedDamage: number;
  shotCooldownMs: number;
  respawnMs?: number;
};

type DummyState = {
  label: string;
  archetype: EnemyArchetype;
  nameplate: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
  sprite?: EnemySprite;
  hp: number;
  maxHp: number;
  originX: number;
  originY: number;
  phase: number;
  respawnAt: number;
  alive: boolean;
  tint: number;
  lastShotAt: number;
  lastHurtAt: number;   // timestamp of last damage received (for hurt flash)
  hpBarShowUntil: number; // hp bar only visible after being hit
  speed: number;
  preferredDistance: number;
  strafe: number;
  contactDamage: number;
  rangedDamage: number;
  shotCooldownMs: number;
  respawnMs: number;
  isBoss: boolean;
  xpReward: number;
  tenksReward: number;
  radius: number;
};

type ParcelVisual = {
  title: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text;
  structure: Phaser.GameObjects.Graphics;
};

type MaterialNode = {
  id: string;
  x: number;
  y: number;
  value: number;
  available: boolean;
  respawnAt: number;
  crate: Phaser.GameObjects.Rectangle;
  band: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

type InteractionTarget = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: number;
  sceneKey?: string;
  npcKey?: string;
};

const REMOTE_CHAT_MIN_MS = 1000;
const REMOTE_MOVE_MIN_MS = 100;
const REMOTE_HIT_MIN_MS = 120;
const MAX_REMOTE_CHAT_DISTANCE = 2600;
const LOCAL_HIT_COOLDOWN_MS = 180;
const DUMMY_RESPAWN_MS = 1800;
const TRAINING_SURVIVAL_STEP_MS = 11000;
const TRAINING_SURVIVAL_STEP_BONUS = 0.5;
const TRAINING_SURVIVAL_MAX_MULTIPLIER = 11;
const PLAZA_RESPAWN_X = 980;
const PLAZA_RESPAWN_Y = ZONES.PLAZA_Y + 72;
const WEAPON_STATS: Record<WeaponMode, WeaponStats> = {
  pistol: {
    label: 'PISTOL',
    pellets: 1,
    spread: 0.02,
    speed: 760,
    damage: 18,
    cooldownMs: 120,
    color: 0xF5C842,
    knockback: 18,
    idleTexture: 'weapon_pistol_idle',
    idleAnim: 'weapon-pistol-idle',
    shootAnim: 'weapon-pistol-shoot',
  },
  smg: {
    label: 'BUZZ SMG',
    pellets: 1,
    spread: 0.14,
    speed: 680,
    damage: 7,
    cooldownMs: 55,
    color: 0x00E5FF,
    knockback: 8,
    idleTexture: 'weapon_smg_idle',
    idleAnim: 'weapon-smg-idle',
    shootAnim: 'weapon-smg-shoot',
  },
  shotgun: {
    label: 'SHOTGUN',
    pellets: 3,
    spread: 0.15,
    speed: 610,
    damage: 16,
    cooldownMs: 320,
    color: 0xFF6E00,
    knockback: 34,
    idleTexture: 'weapon_shotgun_idle',
    idleAnim: 'weapon-shotgun-idle',
    shootAnim: 'weapon-shotgun-shoot',
  },
  rifle: {
    label: 'RANGER',
    pellets: 1,
    spread: 0.03,
    speed: 820,
    damage: 24,
    cooldownMs: 200,
    color: 0x4685FF,
    knockback: 18,
    idleTexture: 'weapon_rifle_idle',
    idleAnim: 'weapon-rifle-idle',
    shootAnim: 'weapon-rifle-shoot',
  },
  deagle: {
    label: 'DEAGLE',
    pellets: 1,
    spread: 0.01,
    speed: 920,
    damage: 36,
    cooldownMs: 400,
    color: 0xFF006E,
    knockback: 48,
    idleTexture: 'weapon_deagle_idle',
    idleAnim: 'weapon-deagle-idle',
    shootAnim: 'weapon-deagle-shoot',
  },
  cannon: {
    label: 'CANNON',
    pellets: 5,
    spread: 0.22,
    speed: 480,
    damage: 22,
    cooldownMs: 650,
    color: 0xF5C842,
    knockback: 70,
    idleTexture: 'weapon_cannon_idle',
    idleAnim: 'weapon-cannon-idle',
    shootAnim: 'weapon-cannon-shoot',
  },
  raygun: {
    label: 'RAY-X',
    pellets: 1,
    spread: 0.01,
    speed: 980,
    damage: 72,
    cooldownMs: 300,
    color: 0xB026FF,
    knockback: 24,
    idleTexture: 'weapon_raygun_idle',
    idleAnim: 'weapon-raygun-idle',
    shootAnim: 'weapon-raygun-shoot',
  },
};
const ENEMY_PROFILES: Record<EnemyArchetype, EnemyProfile> = {
  rusher: {
    label: '▲ RUSH',
    tint: 0xFF5E5E,
    maxHp: 34,
    radius: 16,
    xpReward: 3,
    tenksReward: 1,
    speed: 2.45,
    preferredDistance: 48,
    strafe: 0.35,
    contactDamage: 12,
    rangedDamage: 0,
    shotCooldownMs: 999999,
  },
  shooter: {
    label: '◆ SHOT',
    tint: 0xFF8B3D,
    maxHp: 40,
    radius: 18,
    xpReward: 5,
    tenksReward: 2,
    speed: 1.7,
    preferredDistance: 150,
    strafe: 1.2,
    contactDamage: 8,
    rangedDamage: 9,
    shotCooldownMs: 850,
  },
  tank: {
    label: '■ TANK',
    tint: 0xB74DFF,
    maxHp: 72,
    radius: 22,
    xpReward: 9,
    tenksReward: 3,
    speed: 1.1,
    preferredDistance: 78,
    strafe: 0.18,
    contactDamage: 18,
    rangedDamage: 0,
    shotCooldownMs: 999999,
  },
  boss: {
    label: '★ BOSS',
    tint: 0x3DD6FF,
    maxHp: 220,
    radius: 28,
    xpReward: 20,
    tenksReward: 4,
    speed: 1.45,
    preferredDistance: 180,
    strafe: 0.95,
    contactDamage: 24,
    rangedDamage: 14,
    shotCooldownMs: 620,
    respawnMs: 5000,
  },
};
const WEAPON_FALLBACK_TEXTURE = 'weapon_fallback_rect';

export class WorldScene extends Phaser.Scene {
  private static readonly GUN_SHOP_BOUNDS = {
    x: 2100,
    y: ZONES.PLAZA_Y + 190,
    w: 280,
    h: 210,
  } as const;

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
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyJ!: Phaser.Input.Keyboard.Key;
  private keyK!: Phaser.Input.Keyboard.Key;
  private keyL!: Phaser.Input.Keyboard.Key;
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
  private keyE!: Phaser.Input.Keyboard.Key;
  private inTransition = false;

  // Voice Chat
  private voiceMuteBtn?: Phaser.GameObjects.Text;
  private voiceStatusText?: Phaser.GameObjects.Text;
  private voicePromptObjects: Phaser.GameObjects.GameObject[] = [];
  private isActivatingVoice = false;
  private voiceFrameCount = 0;
  // Speaking indicators (world-space circles above avatars)
  private speakingIndicators = new Map<string, Phaser.GameObjects.Arc>();
  private localSpeakingIndicator?: Phaser.GameObjects.Arc;

  // Multiplayer
  private remotePlayers = new Map<string, RemotePlayer>();
  private lastPosSent = 0;
  private lastBroadcastX = 0;
  private lastBroadcastY = 0;
  private channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
  private bridgeCleanupFns: Array<() => void> = [];
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastIsMoving = false;

  // Combat / HP
  private hp = 100;
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private gunEnabled = true;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyOne!: Phaser.Input.Keyboard.Key;
  private keyTwo!: Phaser.Input.Keyboard.Key;
  private keyThree!: Phaser.Input.Keyboard.Key;
  private keyFour!: Phaser.Input.Keyboard.Key;
  private keyFive!: Phaser.Input.Keyboard.Key;
  private keySix!: Phaser.Input.Keyboard.Key;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private playerHitbox!: HitboxArc;
  private lastShotAt = 0;
  private lastDamageAt = 0;
  private trainingScore = 0;
  private trainingHud?: Phaser.GameObjects.Text;
  private combatHud?: Phaser.GameObjects.Text;
  private progressionHud?: Phaser.GameObjects.Text;
  private weaponHud?: Phaser.GameObjects.Text;
  // HUD visual upgrades
  private xpBar?: Phaser.GameObjects.Graphics;
  private levelBadgeBg?: Phaser.GameObjects.Rectangle;
  private levelBadgeText?: Phaser.GameObjects.Text;
  private weaponCooldownBar?: Phaser.GameObjects.Graphics;
  private hpDamagedAt = -9999; // timestamp for HP bar border flash
  private gunSprite?: Phaser.GameObjects.Sprite;
  private dummyStates = new Map<CombatDummy, DummyState>();
  private currentWeapon: WeaponMode = 'pistol';
  private weaponAimAngle = 0;
  private bossDummy?: CombatDummy;
  private bossHud?: Phaser.GameObjects.Container;
  private bossBar?: Phaser.GameObjects.Graphics;
  private bossName?: Phaser.GameObjects.Text;
  private arenaNotice?: Phaser.GameObjects.Text;
  private audioCtx?: AudioContext;
  private audioUnlocked = false;
  private audioSettings: AudioSettings = loadAudioSettings();
  private sceneMusic: Phaser.Sound.BaseSound | null = null;
  private hudSettings: HudSettings = loadHudSettings();
  private controls!: SceneControls;
  private audioSettingsCleanup?: () => void;
  private worldPointerShootHandler?: (p: Phaser.Input.Pointer) => void;
  private touchPointerDownHandler?: (p: Phaser.Input.Pointer) => void;
  private touchPointerMoveHandler?: (p: Phaser.Input.Pointer) => void;
  private touchPointerEndHandler?: () => void;

  // Training zone (PVE + PVP)
  private inTraining = false;
  private trainingBanner?: Phaser.GameObjects.Text;
  private trainingSurvivalStartAt = 0;
  private trainingHudLastRefreshAt = 0;
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
  private progression: ProgressionState = loadProgressionState();
  private combatStats: CombatStats = loadCombatStats();
  private vecindadState: VecindadState = {
    ownedParcelId: undefined,
    buildStage: 0,
    materials: 0,
  };
  private sharedParcelState = new Map<string, SharedParcelState>();
  private parcelVisuals = new Map<string, ParcelVisual>();
  private parcelPrompt?: Phaser.GameObjects.Text;
  private materialNodes: MaterialNode[] = [];
  private vecindadHud?: Phaser.GameObjects.Text;
  private interactionHint?: Phaser.GameObjects.Text;
  private interactionHighlight?: Phaser.GameObjects.Graphics;
  private runtimeFailures = new Set<string>();

  // Gun Dealer NPC
  private gunDealerAvatar: AvatarRenderer | null = null;
  private gunShopPanel: Phaser.GameObjects.Container | null = null;
  private gunDealerDialog: DialogSystem | null = null;
  private gunShopOpen = false;

  // COTTENKS NPC
  private cottenksDialog: BranchedDialog | null = null;
  private cottenksQuestMarker?: Phaser.GameObjects.Text;

  // Sprint
  private shiftKey?: Phaser.Input.Keyboard.Key;

  // Camara del Tiempo
  private inCamara = false;
  private camaraTimer = 0;       // ms accumulated inside
  private camaraTickMs = 20000;  // earn every 20s
  private camaraTenksPerTick = 6;
  private camaraHud?: Phaser.GameObjects.Text;

  // Minimap
  private minimapGraphics?: Phaser.GameObjects.Graphics;
  private minimapPlayerDot?: Phaser.GameObjects.Arc;
  private minimapRemoteDots = new Map<string, Phaser.GameObjects.Arc>();
  private minimapContainer?: Phaser.GameObjects.Container;
  private minimapTitle?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'WorldScene' });
  }

  init(data?: { returnX?: number; returnY?: number }) {
    this.inTransition = false;
    this.inputBlocked = false;
    this.px = data?.returnX ?? PLAYER.SPAWN_X;
    this.py = data?.returnY ?? PLAYER.SPAWN_Y;
    this.runtimeFailures.clear();
  }

  private runBootStep(label: string, fn: () => void) {
    try {
      fn();
    } catch (error) {
      console.error(`[Waspi][WorldScene] Boot step failed: ${label}`, error);
    }
  }

  private runFrameStep(label: string, fn: () => void) {
    try {
      fn();
    } catch (error) {
      if (!this.runtimeFailures.has(label)) {
        this.runtimeFailures.add(label);
        console.error(`[Waspi][WorldScene] Runtime step failed: ${label}`, error);
        eventBus.emit(EVENTS.UI_NOTICE, `Problema temporal en ${label}.`);
      }
    }
  }

  private safeSetupRealtime(): 'multiplayer' | 'solo' {
    try {
      return this.setupRealtime();
    } catch (error) {
      console.error('[Waspi][WorldScene] Boot step failed: realtime', error);
      return 'solo';
    }
  }

  private createSafeAvatarRenderer(x: number, y: number, config: AvatarConfig, label: string) {
    try {
      return new AvatarRenderer(this, x, y, config);
    } catch (error) {
      console.error(`[Waspi][WorldScene] Avatar rebuild failed: ${label}`, error);
      return new AvatarRenderer(this, x, y, {
        ...config,
        avatarKind: 'procedural',
      });
    }
  }

  private recreateCombatHud() {
    this.combatHud?.destroy();
    this.combatHud = this.add.text(8, 74, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      lineSpacing: 5,
    }).setScrollFactor(0).setDepth(9999);
  }

  private recreateProgressionHud() {
    this.progressionHud?.destroy();
    this.progressionHud = this.add.text(8, 116, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
      lineSpacing: 5,
    }).setScrollFactor(0).setDepth(9999);
  }

  private guardHudRender(label: string, recreate: () => void, render: () => void) {
    try {
      render();
    } catch (error) {
      console.error(`[Waspi][WorldScene] HUD render failed: ${label}`, error);
      recreate();
      try {
        render();
      } catch (retryError) {
        console.error(`[Waspi][WorldScene] HUD render retry failed: ${label}`, retryError);
      }
    }
  }

  create() {
    announceScene(this);
    this.input.enabled = true;
    this.controls = new SceneControls(this);
    this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);

    // Generate player ID and username
    this.playerId = this.getOrCreatePlayerId();
    this.playerUsername = this.getOrCreateUsername();
    this.loadMutedPlayers();
    this.loadVecindadState();

    // Init TENKS balance (local-only for ahora)
    initTenks(5000);

    // Draw world layers
    this.drawBackground();
    this.drawPlaza();
    this.drawBuildings();
    this.drawStreet();
    this.drawLampPosts();
    this.drawCamaraDelTiempo();
    this.drawVignette();
    this.runBootStep('ambient particles', () => this.setupAmbientParticles());

    // CAMARA DEL TIEMPO hud (hidden by default)
    this.camaraHud = this.add.text(0, 0, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B388FF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0).setDepth(9500).setAlpha(0);

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
    this.playerAvatar = this.createSafeAvatarRenderer(this.px, this.py, this.getCurrentAvatarConfig(), 'local-player');
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
    this.keyI = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyJ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keyK = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyF = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyQ     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyOne   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.keyTwo   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.keyThree = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.keyFour  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
    this.keyFive  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
    this.keySix   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SIX);

    // Touch controls (mobile)
    this.setupTouchControls();

    // Camera
    this.cameras.main.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    this.cameras.main.startFollow(this.playerBody, true, 0.1, 0.1);
    this.cameras.main.setZoom(1);
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(220, 0, 0, 0);

    // Chat system
    this.chatSystem = new ChatSystem(this);
    this.setupInteractionUi();

    // Bridge events from React
    this.runBootStep('react bridge', () => this.setupReactBridge());

    // Supabase Realtime
    const mode = this.safeSetupRealtime();
    statusText.setText(mode === 'multiplayer' ? 'MULTI: ONLINE' : 'MULTI: SOLO MODE');

    // Notify React that player is ready
    eventBus.emit(EVENTS.PLAYER_INFO, {
      playerId: this.playerId,
      username: this.playerUsername,
    });
    eventBus.emit(EVENTS.PLAYER_COMBAT_STATS, this.combatStats);
    eventBus.emit(EVENTS.PLAYER_PROGRESSION, this.progression);
    this.emitPresence();

    // Ambient NPC
    this.runBootStep('ambient npcs', () => this.spawnAmbientNPCs());
    // Dealer now lives inside GunShopInterior.
    this.runBootStep('cottenks npc', () => this.spawnCottenksNPC());

    // HP/Combat/Utilities
    this.runBootStep('hp hud', () => this.setupHpHud());
    this.runBootStep('voice hud', () => this.setupVoiceHud());
    this.runBootStep('combat', () => this.setupCombat());
    this.runBootStep('weapon system', () => this.setupWeaponSystem());
    this.runBootStep('utility refresh', () => this.refreshUtilitiesFromInventory());
    this.audioSettingsCleanup = eventBus.on(EVENTS.AUDIO_SETTINGS_CHANGED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const next = payload as Partial<AudioSettings>;
      this.audioSettings = {
        musicEnabled: next.musicEnabled ?? this.audioSettings.musicEnabled,
        sfxEnabled: next.sfxEnabled ?? this.audioSettings.sfxEnabled,
      };
    });
    this.bridgeCleanupFns.push(eventBus.on(EVENTS.HUD_SETTINGS_CHANGED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const next = payload as Partial<HudSettings>;
      this.hudSettings = {
        ...this.hudSettings,
        ...next,
      };
      this.applyHudVisibility();
    }));
    this.bridgeCleanupFns.push(bindSafeResetToPlaza(this, () => this.safeResetToPlaza()));

    // Zombie sprite animations
    this.runBootStep('zombie anims', () => registerZombieAnims(this));

    // Training arena
    this.runBootStep('training zone', () => this.setupTrainingZone());

    // Minimap
    this.runBootStep('minimap', () => this.setupMinimap());

    // Scene music
    this.sceneMusic = startSceneMusic(this, 'world_ambient', 0.35);
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

    this.trainingHud = this.add.text(8, 58, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#39FF14',
    }).setScrollFactor(0).setDepth(9999);
    this.renderTrainingHud();

    this.arenaNotice = this.add.text(this.scale.width / 2, 88, '', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#3DD6FF',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10002).setAlpha(0);

    this.combatHud = this.add.text(8, 74, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      lineSpacing: 5,
    }).setScrollFactor(0).setDepth(9999);
    this.renderCombatHud();
    this.progressionHud = this.add.text(8, 116, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
      lineSpacing: 5,
    }).setScrollFactor(0).setDepth(9999);
    this.renderProgressionHud();
    this.applyHudVisibility();

    this.setupBossHud();

    // Spawn a few local dummies (PVE)
    const dummyPositions: Array<{ x: number; y: number; archetype: EnemyArchetype }> = [
      { x: ZONES.TRAINING_X + 150, y: ZONES.TRAINING_Y + 150, archetype: 'rusher' },
      { x: ZONES.TRAINING_X + 360, y: ZONES.TRAINING_Y + 220, archetype: 'shooter' },
      { x: ZONES.TRAINING_X + 560, y: ZONES.TRAINING_Y + 140, archetype: 'tank' },
      { x: ZONES.TRAINING_X + 720, y: ZONES.TRAINING_Y + 250, archetype: 'shooter' },
      { x: ZONES.TRAINING_X + 810, y: ZONES.TRAINING_Y + 120, archetype: 'rusher' },
      { x: ZONES.TRAINING_X + ZONES.TRAINING_W - 110, y: ZONES.TRAINING_Y + 90, archetype: 'boss' },
    ];
    dummyPositions.forEach((p, index) => this.spawnTrainingDummy(p.x, p.y, index, p.archetype));
  }

  private setupInteractionUi() {
    this.interactionHighlight?.destroy();
    this.interactionHint?.destroy();
    this.interactionHighlight = this.add.graphics().setDepth(3100);
    this.interactionHint = this.add.text(0, 0, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(3101).setAlpha(0);
  }

  private setupHpHud() {
    // Level badge — small pill in the top-left corner
    this.levelBadgeBg = this.add.rectangle(8 + 52, 12, 108, 14, 0x0A0A12, 0.88)
      .setScrollFactor(0)
      .setDepth(9998)
      .setStrokeStyle(1, 0xF5C842, 0.55)
      .setOrigin(0, 0.5);
    this.levelBadgeText = this.add.text(12, 12, '', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setScrollFactor(0).setDepth(9999).setOrigin(0, 0.5);

    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(9999);
    this.hpText = this.add.text(8, 28, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6666',
    }).setScrollFactor(0).setDepth(9999);

    // XP bar — thin, below the HP bar
    this.xpBar = this.add.graphics().setScrollFactor(0).setDepth(9998);

    this.renderHpHud();
  }

  // ─── Voice Chat HUD ─────────────────────────────────────────────────────────

  private setupVoiceHud() {
    const camH = this.cameras.main.height;
    // Y offset: 118px above bottom keeps buttons above the React chat overlay
    const BY = camH - 118;

    // Single mic toggle button
    this.voiceMuteBtn = this.add.text(10, BY, '[MIC]', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      backgroundColor: '#0A0A14',
      padding: { x: 5, y: 3 },
      color: '#9999BB',
    }).setScrollFactor(0).setDepth(9999).setInteractive({ useHandCursor: true });

    // Small status text for errors/peer count
    this.voiceStatusText = this.add.text(10, BY + 18, '', {
      fontSize: '6px',
      fontFamily: 'Silkscreen, monospace',
      color: '#7777AA',
    }).setScrollFactor(0).setDepth(9999);

    // Local speaking indicator (world space, follows player avatar)
    this.localSpeakingIndicator = this.add.arc(
      this.px, this.py - 54, 5, 0, 360, false, 0x39FF14, 0,
    ).setDepth(200);

    // ── Button handler ────────────────────────────────────────────────────────

    this.voiceMuteBtn.on('pointerdown', async () => {
      const vc = getVoiceChat();
      if (!vc.connected) {
        const pref = this.getVoicePref();
        const granted = await this.isMicGranted();
        if (pref === 'on' && granted) {
          await this.activateVoice();
        } else {
          this.showVoicePrompt();
        }
      } else {
        const muted = vc.toggleMute();
        this.voiceMuteBtn?.setText(muted ? '[MUTED]' : '[MIC ON]')
          .setStyle({ color: muted ? '#FF006E' : '#39FF14' });
      }
    });

    // ── React settings bridge ─────────────────────────────────────────────────

    const unsubMic = eventBus.on(EVENTS.VOICE_MIC_CHANGED, (deviceId: unknown) => {
      const vc = getVoiceChat();
      if (!vc.connected || typeof deviceId !== 'string') return;
      vc.switchMic(deviceId).catch((e) => console.warn('[VoiceChat] Mic switch failed:', e));
    });

    const unsubDisable = eventBus.on(EVENTS.VOICE_DISABLE, () => {
      void this.disableVoice();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubMic();
      unsubDisable();
    });
  }

  // ─── Voice onboarding ─────────────────────────────────────────────────────

  private getVoicePref(): 'on' | 'off' | null {
    try {
      const v = localStorage.getItem('waspi_voice_pref');
      if (v === 'on' || v === 'off') return v;
    } catch { /* noop */ }
    return null;
  }

  private setVoicePref(pref: 'on' | 'off') {
    try { localStorage.setItem('waspi_voice_pref', pref); } catch { /* noop */ }
  }

  private getPreferredMicDeviceId(): string | null {
    try {
      const value = localStorage.getItem('waspi_voice_mic_device_id');
      return value || null;
    } catch {
      return null;
    }
  }

  private clearPreferredMicDeviceId() {
    try {
      localStorage.removeItem('waspi_voice_mic_device_id');
    } catch {
      // noop
    }
  }

  private async isMicGranted(): Promise<boolean> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state === 'granted';
    } catch {
      return false;
    }
  }

  private async getMicPermissionState(): Promise<PermissionState | 'unknown'> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state;
    } catch {
      return 'unknown';
    }
  }

  private hasDoneMicGrantReload(): boolean {
    try {
      return localStorage.getItem('waspi_voice_mic_grant_reload_done') === '1';
    } catch {
      return true;
    }
  }

  private markMicGrantReloadDone() {
    try {
      localStorage.setItem('waspi_voice_mic_grant_reload_done', '1');
    } catch {
      // noop
    }
  }

  /**
   * Auto-init voice on startup if the user previously chose "on"
   * AND the browser already has mic permission (no prompt needed).
   */
  private async tryAutoInitVoice() {
    if (this.getVoicePref() !== 'on') return;
    try {
      if (!await this.isMicGranted()) return;
      await this.activateVoice();
    } catch {
      // Silent failure — user can manually activate via button
    }
  }

  /**
   * Shows the pre-prompt dialog asking the user if they want voice chat.
   * Only calls getUserMedia AFTER the user explicitly accepts.
   */
  private showVoicePrompt() {
    if (this.voicePromptObjects.length > 0) return;

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const panelW = 290;
    const panelH = 116;
    const px = (camW - panelW) / 2;
    const py = (camH - panelH) / 2;
    const D = 10001;

    const bg = this.add.rectangle(px, py, panelW, panelH, 0x0A0A14, 0.96)
      .setStrokeStyle(1, 0x46B3FF, 0.7)
      .setOrigin(0, 0)
      .setScrollFactor(0).setDepth(D);

    const title = this.add.text(px + 12, py + 10, 'VOICE CHAT', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
    }).setScrollFactor(0).setDepth(D);

    const desc = this.add.text(px + 12, py + 30, [
      'Vas a escuchar a otros jugadores',
      'cuando esten cerca. Audio P2P directo.',
    ], {
      fontSize: '6px',
      fontFamily: 'Silkscreen, monospace',
      color: '#AAAACC',
      lineSpacing: 4,
    }).setScrollFactor(0).setDepth(D);

    const btnActivar = this.add.text(px + 12, py + 78, '[ACTIVAR]', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#39FF14',
      backgroundColor: '#0E1A0E',
      padding: { x: 5, y: 3 },
    }).setScrollFactor(0).setDepth(D).setInteractive({ useHandCursor: true });

    const btnSinVoz = this.add.text(px + 130, py + 78, '[SIN VOZ]', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#888888',
      backgroundColor: '#0E0E14',
      padding: { x: 5, y: 3 },
    }).setScrollFactor(0).setDepth(D).setInteractive({ useHandCursor: true });

    btnActivar.on('pointerover', () => btnActivar.setStyle({ color: '#FFFFFF' }));
    btnActivar.on('pointerout', () => btnActivar.setStyle({ color: '#39FF14' }));
    btnActivar.on('pointerdown', async () => {
      this.closeVoicePrompt();
      this.setVoicePref('on');
      await this.activateVoice();
    });

    btnSinVoz.on('pointerover', () => btnSinVoz.setStyle({ color: '#FF006E' }));
    btnSinVoz.on('pointerout', () => btnSinVoz.setStyle({ color: '#888888' }));
    btnSinVoz.on('pointerdown', () => {
      this.closeVoicePrompt();
      this.setVoicePref('off');
    });

    this.voicePromptObjects = [bg, title, desc, btnActivar, btnSinVoz];
  }

  private closeVoicePrompt() {
    this.voicePromptObjects.forEach((o) => o.destroy());
    this.voicePromptObjects = [];
  }

  /**
   * Core voice activation: init PeerJS + mic, publish to Presence,
   * then immediately call all peers already in the room.
   * Separated so it can be called from prompt, auto-init, and button.
   */
  private async activateVoice() {
    // Guard: prevent concurrent init calls (double-click, race with auto-init)
    if (this.isActivatingVoice) return;
    const vc = getVoiceChat();
    if (vc.connected) return;
    this.isActivatingVoice = true;
    try {
      const micStateBefore = await this.getMicPermissionState();
      const preferredMicId = this.getPreferredMicDeviceId();
      this.voiceMuteBtn?.setText('[MIC ...]').setStyle({ color: '#F5C842' });
      try {
        await vc.init(this.playerId, preferredMicId ?? undefined);
      } catch (err) {
        const name = (err as DOMException)?.name;
        // Selected mic can become stale (unplugged/renamed). Retry with default.
        if (preferredMicId && (name === 'NotFoundError' || name === 'OverconstrainedError')) {
          this.clearPreferredMicDeviceId();
          await vc.init(this.playerId);
        } else {
          throw err;
        }
      }

      // Publish peer ID via Presence — auto-cleans on disconnect
      await this.channel?.track({ player_id: this.playerId, voice_peer_id: vc.peerId });

      // Timing fix: explicitly call all voice-enabled peers already in the room
      // (presence.sync might have fired before vc was ready)
      this.connectToVoicePeersInRoom();

      this.voiceMuteBtn?.setText('[MIC ON]').setStyle({ color: '#39FF14' });
      this.voiceStatusText?.setText('').setStyle({ color: '#39FF14' });

      // UX: first successful permission grant gets a one-time reload so voice
      // starts from a clean state on fresh page load.
      if (micStateBefore === 'prompt' && !this.hasDoneMicGrantReload()) {
        this.markMicGrantReloadDone();
        window.location.reload();
        return;
      }
    } catch (err) {
      const name = (err as DOMException)?.name;
      let label = '[NO MIC]';
      let hint = 'Revisá la configuracion del browser';
      if (name === 'NotAllowedError') {
        label = '[DENEGADO]';
        hint = 'Habilitá el mic en el candado de la URL';
      } else if (name === 'NotFoundError') {
        label = '[SIN MIC]';
        hint = 'No se encontro microfono conectado';
      } else if (name === 'NotReadableError') {
        label = '[MIC EN USO]';
        hint = 'Otra app esta usando el microfono';
      }
      console.warn('[VoiceChat] Mic init failed:', err);
      this.voiceMuteBtn?.setText(label).setStyle({ color: '#FF006E' });
      this.voiceStatusText?.setText(hint).setStyle({ color: '#FF6666' });
      // Clear the hint after 4 seconds
      this.time.delayedCall(4000, () => {
        this.voiceStatusText?.setText('').setStyle({ color: '#7777AA' });
      });
    } finally {
      this.isActivatingVoice = false;
    }
  }

  /**
   * Timing fix: called right after voice init + channel.track().
   * Iterates current presence state and calls anyone with voice_peer_id.
   * Guards against the case where presence.sync fired before vc was ready.
   */
  private connectToVoicePeersInRoom() {
    const vc = getVoiceChat();
    if (!vc.connected) return;
    const state = this.channel?.presenceState<PresenceVoice>() ?? {};
    for (const presences of Object.values(state)) {
      for (const p of presences) {
        if (p.voice_peer_id && p.voice_peer_id !== vc.peerId) {
          vc.callPeer(p.voice_peer_id);
        }
      }
    }
  }

  private async disableVoice() {
    this.closeVoicePrompt();
    const vc = getVoiceChat();
    if (!vc.connected) return;
    this.setVoicePref('off');
    // Remove voice_peer_id from presence (keep player presence alive)
    await this.channel?.track({ player_id: this.playerId });
    // destroyVoiceChat() nulls the singleton so next activation starts fresh
    destroyVoiceChat();
    this.voiceMuteBtn?.setText('[MIC]').setStyle({ color: '#9999BB' });
    this.voiceStatusText?.setText('').setStyle({ color: '#7777AA' });
    this.localSpeakingIndicator?.setAlpha(0);
    for (const [, arc] of this.speakingIndicators) arc.setAlpha(0);
  }

  // ─── Voice Presence handlers ─────────────────────────────────────────────────

  /**
   * Fires on subscribe and any time the presence state changes in full.
   * Connect to every peer that already has voice enabled.
   */
  private handleVoicePresenceSync() {
    const vc = getVoiceChat();
    if (!vc.connected) return;
    const state = this.channel?.presenceState<PresenceVoice>() ?? {};
    for (const presences of Object.values(state)) {
      for (const p of presences) {
        if (p.voice_peer_id && p.voice_peer_id !== vc.peerId) {
          vc.callPeer(p.voice_peer_id);
        }
      }
    }
  }

  /**
   * Fires when a peer enters the channel and has a voice_peer_id tracked.
   */
  private handleVoicePresenceJoin(newPresences: PresenceVoice[]) {
    const vc = getVoiceChat();
    if (!vc.connected) return;
    for (const p of newPresences) {
      if (p.voice_peer_id && p.voice_peer_id !== vc.peerId) {
        vc.callPeer(p.voice_peer_id);
      }
    }
  }

  /**
   * Fires when a peer leaves the channel (tab closed, disconnect, etc.).
   * Supabase handles this automatically — no manual cleanup needed from the leaving peer.
   */
  private handleVoicePresenceLeave(leftPresences: PresenceVoice[]) {
    const vc = getVoiceChat();
    if (!vc.connected) return;
    for (const p of leftPresences) {
      if (p.voice_peer_id) vc.disconnectPeer(p.voice_peer_id);
    }
  }

  private renderHpHud() {
    const w = 140;
    const h = 9;
    const x = 8;
    const y = 40;
    const pct = Phaser.Math.Clamp(this.hp / 100, 0, 1);

    // HP bar background + fill
    this.hpBar.clear();
    this.hpBar.fillStyle(0x050508, 0.78);
    this.hpBar.fillRoundedRect(x, y, w, h, 3);

    // Fill color: green when healthy, yellow when hurt, red when critical
    const fillColor = pct > 0.5 ? 0xFF3333 : pct > 0.25 ? 0xFF6B1A : 0xFF1111;
    this.hpBar.fillStyle(fillColor, 0.9);
    this.hpBar.fillRoundedRect(x + 1, y + 1, Math.max(0, (w - 2) * pct), h - 2, 2);

    // Neon border: flashes red on damage, otherwise gold
    const isDamageFlash = this.time && (this.time.now - this.hpDamagedAt < 220);
    const borderColor = isDamageFlash ? 0xFF3333 : 0xF5C842;
    const borderAlpha = isDamageFlash ? 0.95 : 0.7;
    this.hpBar.lineStyle(2, borderColor, borderAlpha);
    this.hpBar.strokeRoundedRect(x, y, w, h, 3);

    this.hpText.setText(`HP ${this.hp}`);
    this.hpText.setPosition(x, y - 13);

    // Sync level badge
    if (this.levelBadgeText) {
      const lvl = this.progression?.level ?? 1;
      const maxLvl = getMaxProgressionLevel();
      this.levelBadgeText.setText(`LVL ${lvl}/${maxLvl}`);
    }

    // Render XP bar (thin bar below HP)
    this.renderXpBar();
  }

  private renderXpBar() {
    if (!this.xpBar) return;
    const w = 140;
    const h = 4;
    const x = 8;
    const y = 52; // just below HP bar
    const prog = this.progression;
    const pct = prog.nextLevelAt === null
      ? 1
      : Phaser.Math.Clamp(prog.xp / prog.nextLevelAt, 0, 1);

    this.xpBar.clear();
    this.xpBar.fillStyle(0x050508, 0.6);
    this.xpBar.fillRoundedRect(x, y, w, h, 2);
    this.xpBar.fillStyle(0x46B3FF, 0.8);
    this.xpBar.fillRoundedRect(x + 1, y + 1, Math.max(0, (w - 2) * pct), h - 2, 1);
    this.xpBar.lineStyle(1, 0x46B3FF, 0.3);
    this.xpBar.strokeRoundedRect(x, y, w, h, 2);
  }

  private ensureWeaponAnimations() {
    ensureFallbackRectTexture(this, WEAPON_FALLBACK_TEXTURE, 24, 8, 0xF5C842, 0x1A1A1A);
    const animations = [
      { key: 'weapon-pistol-idle',   texture: 'weapon_pistol_idle',   frameRate: 8,  repeat: -1 },
      { key: 'weapon-pistol-shoot',  texture: 'weapon_pistol_shoot',  frameRate: 18, repeat: 0 },
      { key: 'weapon-smg-idle',      texture: 'weapon_smg_idle',      frameRate: 8,  repeat: -1 },
      { key: 'weapon-smg-shoot',     texture: 'weapon_smg_shoot',     frameRate: 24, repeat: 0 },
      { key: 'weapon-shotgun-idle',  texture: 'weapon_shotgun_idle',  frameRate: 8,  repeat: -1 },
      { key: 'weapon-shotgun-shoot', texture: 'weapon_shotgun_shoot', frameRate: 18, repeat: 0 },
      { key: 'weapon-rifle-idle',    texture: 'weapon_rifle_idle',    frameRate: 8,  repeat: -1 },
      { key: 'weapon-rifle-shoot',   texture: 'weapon_rifle_shoot',   frameRate: 18, repeat: 0 },
      { key: 'weapon-deagle-idle',   texture: 'weapon_deagle_idle',   frameRate: 8,  repeat: -1 },
      { key: 'weapon-deagle-shoot',  texture: 'weapon_deagle_shoot',  frameRate: 14, repeat: 0 },
      { key: 'weapon-cannon-idle',   texture: 'weapon_cannon_idle',   frameRate: 8,  repeat: -1 },
      { key: 'weapon-cannon-shoot',  texture: 'weapon_cannon_shoot',  frameRate: 12, repeat: 0 },
      { key: 'weapon-raygun-idle',   texture: 'weapon_raygun_idle',   frameRate: 8,  repeat: -1 },
      { key: 'weapon-raygun-shoot',  texture: 'weapon_raygun_shoot',  frameRate: 14, repeat: 0 },
    ] as const;

    for (const animation of animations) {
      safeCreateSpritesheetAnimation(this, animation.key, animation.texture, animation.frameRate, animation.repeat);
    }
  }

  private setupWeaponSystem() {
    this.ensureWeaponAnimations();
    const weapon = WEAPON_STATS[this.currentWeapon];
    const initialTexture = this.textures.exists(weapon.idleTexture) ? weapon.idleTexture : WEAPON_FALLBACK_TEXTURE;
    this.gunSprite = this.add.sprite(this.px, this.py - 8, initialTexture, 0)
      .setDepth(2050)
      .setVisible(false)
      .setOrigin(0.26, 0.62)
      .setScale(0.72);
    safeBindAnimationComplete(this, this.gunSprite, (animation: Phaser.Animations.Animation) => {
      const weapon = WEAPON_STATS[this.currentWeapon];
      if (animation.key === weapon.shootAnim) {
        if (this.gunSprite) {
          safePlaySpriteAnimation(this, this.gunSprite, weapon.idleAnim, weapon.idleTexture, WEAPON_FALLBACK_TEXTURE, true);
        }
      }
    });

    this.weaponHud = this.add.text(8, this.scale.height - 42, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setScrollFactor(0).setDepth(9999);

    // Weapon cooldown bar — thin bar below weapon text, refills as cooldown expires
    this.weaponCooldownBar = this.add.graphics().setScrollFactor(0).setDepth(9998);

    this.syncWeaponVisual();
  }

  private syncWeaponVisual() {
    if (!this.gunSprite || !this.weaponHud) return;
    const weapon = WEAPON_STATS[this.currentWeapon];
    const shouldShow = this.gunEnabled;

    this.gunSprite.setVisible(shouldShow);
    this.weaponHud.setVisible(shouldShow && this.hudSettings.showArenaHud);

    if (!shouldShow) {
      this.weaponHud.setText('');
      this.gunSprite.stop();
      return;
    }

    if (this.gunSprite.texture.key !== weapon.idleTexture) {
      safeSetSpriteTexture(this, this.gunSprite, weapon.idleTexture, WEAPON_FALLBACK_TEXTURE);
    }
    if (!this.gunSprite.anims.isPlaying || this.gunSprite.anims.currentAnim?.key !== weapon.idleAnim) {
      safePlaySpriteAnimation(this, this.gunSprite, weapon.idleAnim, weapon.idleTexture, WEAPON_FALLBACK_TEXTURE, true);
    }
    this.weaponHud.setColor(this.currentWeapon === 'shotgun' ? '#FF8B3D' : '#F5C842');
    this.weaponHud.setText(`ARMA ${weapon.label} | Q CAMBIA`);
    this.updateWeaponSpritePosition();
  }

  private renderWeaponCooldownBar() {
    if (!this.weaponCooldownBar || !this.gunEnabled) {
      this.weaponCooldownBar?.clear();
      return;
    }
    const weapon = WEAPON_STATS[this.currentWeapon];
    const elapsed = this.time.now - this.lastShotAt;
    const pct = Phaser.Math.Clamp(elapsed / weapon.cooldownMs, 0, 1);
    const w = 140;
    const h = 3;
    const x = 8;
    const y = this.scale.height - 28;
    const weaponColor = weapon.color;

    this.weaponCooldownBar.clear();
    this.weaponCooldownBar.fillStyle(0x050508, 0.6);
    this.weaponCooldownBar.fillRoundedRect(x, y, w, h, 1);
    // Fill with weapon color — full when ready, shorter when cooling down
    if (pct > 0) {
      this.weaponCooldownBar.fillStyle(weaponColor, pct >= 1 ? 0.9 : 0.55);
      this.weaponCooldownBar.fillRoundedRect(x + 1, y, Math.max(0, (w - 2) * pct), h, 1);
    }
    // Glow border when fully ready
    this.weaponCooldownBar.lineStyle(1, weaponColor, pct >= 1 ? 0.5 : 0.15);
    this.weaponCooldownBar.strokeRoundedRect(x, y, w, h, 1);
    this.weaponCooldownBar.setVisible(this.hudSettings.showArenaHud);
  }

  private updateWeaponSpritePosition() {
    if (!this.gunSprite) return;
    if (!this.gunEnabled) {
      this.gunSprite.setVisible(false);
      return;
    }

    const pointer = this.input.activePointer;
    if (pointer) {
      const dx = pointer.worldX - this.px;
      const dy = pointer.worldY - this.py;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.weaponAimAngle = Phaser.Math.Angle.Between(this.px, this.py, pointer.worldX, pointer.worldY);
      }
    }

    if (!Number.isFinite(this.weaponAimAngle)) {
      this.weaponAimAngle = 0;
    }

    this.positionWeaponSprite(this.gunSprite, this.px, this.py, this.weaponAimAngle, 2100 + Math.floor(this.py / 10));
  }

  private ensureRemoteWeaponSprite(rp: RemotePlayer) {
    const weapon = WEAPON_STATS[rp.weapon ?? 'pistol'];
    if (!rp.gunSprite || rp.gunSprite.scene !== this) {
      const initialTexture = this.textures.exists(weapon.idleTexture) ? weapon.idleTexture : WEAPON_FALLBACK_TEXTURE;
      rp.gunSprite = this.add.sprite(rp.x, rp.y - 8, initialTexture, 0)
        .setDepth(2100 + Math.floor(rp.y / 10))
        .setVisible(this.gunEnabled)
        .setOrigin(0.26, 0.62)
        .setScale(0.72);
      safeBindAnimationComplete(this, rp.gunSprite, (animation: Phaser.Animations.Animation) => {
        const currentWeapon = WEAPON_STATS[rp.weapon ?? 'pistol'];
        if (animation.key === currentWeapon.shootAnim) {
          if (rp.gunSprite) {
            safePlaySpriteAnimation(this, rp.gunSprite, currentWeapon.idleAnim, currentWeapon.idleTexture, WEAPON_FALLBACK_TEXTURE, true);
          }
        }
      });
    }

    if (rp.gunSprite.texture.key !== weapon.idleTexture) {
      safeSetSpriteTexture(this, rp.gunSprite, weapon.idleTexture, WEAPON_FALLBACK_TEXTURE);
    }
    if (!rp.gunSprite.anims.isPlaying || rp.gunSprite.anims.currentAnim?.key !== weapon.idleAnim) {
      safePlaySpriteAnimation(this, rp.gunSprite, weapon.idleAnim, weapon.idleTexture, WEAPON_FALLBACK_TEXTURE, true);
    }
  }

  private positionWeaponSprite(sprite: Phaser.GameObjects.Sprite, x: number, y: number, angle: number, depth: number) {
    const safeAngle = Number.isFinite(angle) ? angle : 0;
    const offsetX = Math.cos(safeAngle) * 16;
    const offsetY = Math.sin(safeAngle) * 10 - 8;
    safeWithLiveSprite(sprite, (liveSprite) => {
      liveSprite.setPosition(x + offsetX, y + offsetY);
      liveSprite.setRotation(safeAngle);
      liveSprite.setFlipY(safeAngle > Math.PI / 2 || safeAngle < -Math.PI / 2);
      liveSprite.setDepth(depth);
    }, 'positionWeaponSprite');
  }

  private updateRemoteWeaponSprite(rp: RemotePlayer) {
    if (!this.gunEnabled) {
      rp.gunSprite?.setVisible(false);
      return;
    }
    this.ensureRemoteWeaponSprite(rp);
    if (!rp.gunSprite) return;
    rp.gunSprite.setVisible(true);
    this.positionWeaponSprite(rp.gunSprite, rp.x, rp.y, rp.aimAngle, 2100 + Math.floor(rp.y / 10));
  }

  private static readonly WEAPON_CYCLE: WeaponMode[] = ['pistol', 'smg', 'shotgun', 'rifle', 'deagle', 'cannon', 'raygun'];

  private hasWeaponUnlocked(weapon: WeaponMode): boolean {
    const owned = getInventory().owned;
    switch (weapon) {
      case 'pistol':  return true;
      // Weapon unlocks must depend on ownership, not current utility equip state.
      // Otherwise a purchased gun can appear "blocked" if utility toggles drift.
      case 'smg':     return owned.includes('UTIL-GUN-SMG-01');
      case 'shotgun': return owned.includes('UTIL-GUN-SHOT-01');
      case 'rifle':   return owned.includes('UTIL-GUN-RIFL-01');
      case 'raygun':  return owned.includes('UTIL-GUN-GOLD-01');
      case 'deagle':  return owned.includes('UTIL-GUN-DEAGLE-01');
      case 'cannon':  return owned.includes('UTIL-GUN-CANNON-01');
    }
  }

  private switchWeapon(nextWeapon?: WeaponMode) {
    if (!this.gunEnabled) return;
    let target: WeaponMode;
    if (nextWeapon) {
      target = nextWeapon;
    } else {
      // Q cycles to the next unlocked weapon
      const cycle = WorldScene.WEAPON_CYCLE;
      const cur = cycle.indexOf(this.currentWeapon);
      let found = false;
      for (let i = 1; i <= cycle.length; i++) {
        const candidate = cycle[(cur + i) % cycle.length];
        if (this.hasWeaponUnlocked(candidate)) { target = candidate; found = true; break; }
      }
      if (!found) return;
    }
    if (!this.hasWeaponUnlocked(target!)) {
      eventBus.emit(EVENTS.UI_NOTICE, { msg: `Comprá ${WEAPON_STATS[target!].label} en Arms Dealer para desbloquear.`, color: '#46B3FF' });
      return;
    }
    this.currentWeapon = target!;
    this.syncWeaponVisual();
    this.renderCombatHud();
    this.broadcastSelfState('player:update');
  }

  private renderCombatHud() {
    this.guardHudRender('combat', () => this.recreateCombatHud(), () => {
      if (!this.combatHud) {
        this.recreateCombatHud();
      }
      if (!this.combatHud) return;
      if (!this.gunEnabled) {
        this.combatHud.setText([
          'WEAPON OFFLINE',
          'ACTIVA GUN EN INVENTARIO',
        ]);
        this.combatHud.setColor('#888888');
        return;
      }
      const weapon = WEAPON_STATS[this.currentWeapon];
      const weaponColor = '#' + weapon.color.toString(16).padStart(6, '0');
      this.combatHud.setColor(weaponColor);
      this.combatHud.setText([
        `WEAPON ${weapon.label} | Q CICLA / 1-6`,
        'F / CLICK DISPARA',
      ]);
    });
  }

  private renderProgressionHud() {
    this.guardHudRender('progression', () => this.recreateProgressionHud(), () => {
      if (!this.progressionHud) {
        this.recreateProgressionHud();
      }
      if (!this.progressionHud) return;
      const nextLabel = this.progression.nextLevelAt === null
        ? 'MAX'
        : `${this.progression.nextLevelAt - this.progression.xp} XP`;

      this.progressionHud.setText([
        `LVL ${this.progression.level}/${getMaxProgressionLevel()} | XP ${this.progression.xp}`,
        `KOs ${this.progression.kills} | NEXT ${nextLabel}`,
      ]);
      // Sync XP bar and level badge whenever progression changes
      this.renderXpBar();
      if (this.levelBadgeText) {
        this.levelBadgeText.setText(`LVL ${this.progression.level}/${getMaxProgressionLevel()}`);
      }
    });
  }

  private applyHudVisibility() {
    const visible = this.hudSettings.showArenaHud;
    this.trainingHud?.setVisible(visible);
    this.combatHud?.setVisible(visible);
    this.progressionHud?.setVisible(visible);
    this.weaponHud?.setVisible(visible && this.gunEnabled);
    // HP/XP/level badge always visible (not gated by arena HUD toggle)
    this.hpBar?.setVisible(true);
    this.hpText?.setVisible(true);
    this.xpBar?.setVisible(true);
    this.levelBadgeBg?.setVisible(true);
    this.levelBadgeText?.setVisible(true);
    this.weaponCooldownBar?.setVisible(visible && this.gunEnabled);
    // Minimap follows arena HUD toggle
    this.minimapContainer?.setVisible(visible);
    this.minimapTitle?.setVisible(visible);
  }

  private getEnemyNameColor(archetype: EnemyArchetype) {
    if (archetype === 'boss') return '#3DD6FF';
    if (archetype === 'tank') return '#D8A8FF';
    if (archetype === 'shooter') return '#FFC38D';
    return '#FF8B8B';
  }

  private setupBossHud() {
    const x = this.scale.width / 2;
    const y = 26;
    const frame = this.add.rectangle(x, y, 320, 26, 0x000000, 0.66)
      .setScrollFactor(0)
      .setDepth(10003)
      .setStrokeStyle(1, 0x3DD6FF, 0.55);
    this.bossBar = this.add.graphics().setScrollFactor(0).setDepth(10004);
    this.bossName = this.add.text(x, y - 1, 'PLAZA BOSS', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#3DD6FF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10005);

    this.bossHud = this.add.container(0, 0, [frame, this.bossBar, this.bossName]);
    this.bossHud.setVisible(false);
  }

  private renderBossHud() {
    if (!this.bossHud || !this.bossBar || !this.bossName || !this.bossDummy) return;
    const state = this.dummyStates.get(this.bossDummy);
    if (!state) {
      this.bossHud.setVisible(false);
      return;
    }

    this.bossHud.setVisible(this.inTraining && state.alive);
    this.bossBar.clear();
    if (!this.inTraining || !state.alive) return;

    const width = 292;
    const height = 10;
    const x = this.scale.width / 2 - width / 2;
    const y = 22;
    const pct = Phaser.Math.Clamp(state.hp / state.maxHp, 0, 1);
    this.bossName.setText(`PLAZA BOSS ${state.hp}/${state.maxHp}`);
    this.bossBar.fillStyle(0x09131A, 0.85);
    this.bossBar.fillRoundedRect(x, y, width, height, 3);
    this.bossBar.fillStyle(0x3DD6FF, 0.88);
    this.bossBar.fillRoundedRect(x + 1, y + 1, (width - 2) * pct, height - 2, 3);
  }

  private showArenaNotice(message: string, color = '#3DD6FF') {
    if (!this.arenaNotice) return;
    this.arenaNotice.setText(message);
    this.arenaNotice.setColor(color);
    this.arenaNotice.setAlpha(1);
    this.arenaNotice.setY(88);
    this.tweens.killTweensOf(this.arenaNotice);
    this.tweens.add({
      targets: this.arenaNotice,
      alpha: { from: 1, to: 0 },
      y: 70,
      duration: 1400,
      ease: 'Sine.easeOut',
    });
  }

  private spawnTrainingDummy(x: number, y: number, index: number, archetype: EnemyArchetype) {
    const profile = ENEMY_PROFILES[archetype];
    const label = `${profile.label}_${index + 1}`;
    // Physics arc — invisible, used only for collision detection
    const dummy = this.add.circle(x, y, profile.radius, profile.tint, 0) as CombatDummy;
    dummy.setDepth(30);
    this.physics.add.existing(dummy);
    dummy.body.setCircle(profile.radius);
    dummy.body.setImmovable(true);
    dummy.body.setAllowGravity(false);
    this.dummies.add(dummy);

    // Zombie sprite — visual layer
    const zombieSprite = new EnemySprite(this, x, y, archetype as ZombieType);

    const nameplateY = archetype === 'boss' ? y - 76 : archetype === 'tank' ? y - 58 : y - 42;
    const nameplate = this.add.text(x, nameplateY, label, {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: this.getEnemyNameColor(archetype),
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(32);

    const hpBar = this.add.graphics().setDepth(31);
    const state: DummyState = {
      label,
      archetype,
      nameplate,
      hpBar,
      sprite: zombieSprite,
      hp: profile.maxHp,
      maxHp: profile.maxHp,
      originX: x,
      originY: y,
      phase: index * 1.4,
      respawnAt: 0,
      alive: true,
      tint: profile.tint,
      lastShotAt: 0,
      lastHurtAt: -9999,
      hpBarShowUntil: -9999,
      speed: profile.speed,
      preferredDistance: profile.preferredDistance,
      strafe: profile.strafe,
      contactDamage: profile.contactDamage,
      rangedDamage: profile.rangedDamage,
      shotCooldownMs: profile.shotCooldownMs,
      respawnMs: profile.respawnMs ?? DUMMY_RESPAWN_MS,
      isBoss: archetype === 'boss',
      xpReward: profile.xpReward,
      tenksReward: profile.tenksReward,
      radius: profile.radius,
    };
    this.dummyStates.set(dummy, state);
    if (archetype === 'boss') {
      this.bossDummy = dummy;
      this.showArenaNotice('PLAZA BOSS ONLINE', '#3DD6FF');
    }
    this.renderDummyState(dummy, state);
    this.renderBossHud();
  }

  private renderDummyState(dummy: CombatDummy, state: DummyState) {
    if (!isLiveGameObject(dummy) || !state.nameplate?.scene || !state.hpBar?.scene) return;

    // Clear graphics
    try { state.hpBar.clear(); } catch { return; }

    if (!state.alive) {
      state.nameplate.setPosition(dummy.x, dummy.y - 42);
      state.sprite?.setPosition(dummy.x, dummy.y);
      return;
    }

    // Idle bob — each enemy offset by phase so they don't sync
    const bob = Math.sin(this.time.now / 280 + state.phase) * 2.5;
    const cx = dummy.x;
    const cy = dummy.y + bob;
    const r = state.radius;

    const nameplateOffset = state.archetype === 'boss' ? -76 : state.archetype === 'tank' ? -58 : -42;
    state.nameplate.setPosition(cx, cy + nameplateOffset);
    state.sprite?.setPosition(cx, cy);

    const now = this.time.now;

    // ── HP bar — only visible after being hit ────────────────────────────────
    if (now < state.hpBarShowUntil) {
      const width = state.archetype === 'boss' ? 56 : state.archetype === 'tank' ? 52 : 42;
      const height = 5;
      const pct = Phaser.Math.Clamp(state.hp / state.maxHp, 0, 1);
      const barColor = state.archetype === 'tank' ? 0xB74DFF : state.archetype === 'shooter' ? 0xFF8B3D : state.archetype === 'boss' ? 0x3DD6FF : 0x39FF14;
      const barY = cy - r - 10;
      state.hpBar.fillStyle(0x000000, 0.65);
      state.hpBar.fillRoundedRect(cx - width / 2, barY, width, height, 2);
      state.hpBar.fillStyle(barColor, 0.9);
      state.hpBar.fillRoundedRect(cx - width / 2 + 1, barY + 1, Math.max(0, (width - 2) * pct), height - 2, 1);
      // Gold border
      state.hpBar.lineStyle(1, 0xF5C842, 0.35);
      state.hpBar.strokeRoundedRect(cx - width / 2, barY, width, height, 2);
    }
  }

  private damageDummy(dummy: CombatDummy, damage: number, knockback: number) {
    const state = this.dummyStates.get(dummy);
    if (!state || !state.alive || !isLiveGameObject(dummy) || !dummy.body) return;

    this.ensureAudioReady();
    this.playCombatTone(state.isBoss ? 220 : 260, 0.045, 'triangle', 0.05);
    state.hp = Math.max(0, state.hp - damage);
    // Trigger hurt flash and make HP bar visible for 2.5s
    state.lastHurtAt = this.time.now;
    state.hpBarShowUntil = this.time.now + 2500;
    const pushAngle = Phaser.Math.Angle.Between(this.px, this.py, dummy.x, dummy.y);
    try {
      dummy.setPosition(
        Phaser.Math.Clamp(dummy.x + Math.cos(pushAngle) * knockback, ZONES.TRAINING_X + 26, ZONES.TRAINING_X + ZONES.TRAINING_W - 26),
        Phaser.Math.Clamp(dummy.y + Math.sin(pushAngle) * knockback, ZONES.TRAINING_Y + 26, ZONES.TRAINING_Y + ZONES.TRAINING_H - 26),
      );
    } catch (error) {
      console.error('[Waspi] Failed to reposition combat dummy safely.', error);
      return;
    }
    const flash = this.add.circle(dummy.x, dummy.y, 20, 0xFF4444, 0.24);
    flash.setDepth(5000);
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.8, duration: 180, onComplete: () => safeDestroyGameObject(flash) });

    // Floating damage number — color by weapon, size by damage magnitude
    const dmgColor = this.currentWeapon === 'shotgun'
      ? '#FF8B3D'
      : this.currentWeapon === 'rifle'
        ? '#4685FF'
        : this.currentWeapon === 'smg'
          ? '#00E5FF'
          : this.currentWeapon === 'cannon'
            ? '#F5C842'
            : this.currentWeapon === 'deagle'
              ? '#FF006E'
              : this.currentWeapon === 'raygun'
                ? '#B026FF'
                : '#39FF14'; // pistol / fallback → green
    const dmgFontSize = damage >= 30 ? '10px' : damage >= 15 ? '9px' : '8px';
    const hitNumber = this.add.text(dummy.x, dummy.y - 8, `-${damage}`, {
      fontSize: dmgFontSize,
      fontFamily: '"Press Start 2P", monospace',
      color: dmgColor,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(5001);
    this.tweens.add({
      targets: hitNumber,
      y: dummy.y - 28,
      alpha: { from: 1, to: 0 },
      duration: 420,
      ease: 'Sine.easeOut',
      onComplete: () => safeDestroyGameObject(hitNumber),
    });

    // Critical hit label for high damage
    if (damage >= 30) {
      try {
        const critText = this.add.text(dummy.x, dummy.y - 22, 'CRIT!', {
          fontSize: '9px',
          fontFamily: '"Press Start 2P", monospace',
          color: '#FF3333',
          stroke: '#000000',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(5002);
        this.tweens.add({
          targets: critText,
          y: dummy.y - 46,
          alpha: { from: 1, to: 0 },
          scale: { from: 1.1, to: 0.9 },
          duration: 560,
          ease: 'Sine.easeOut',
          onComplete: () => safeDestroyGameObject(critText),
        });
      } catch (e) {
        console.error('[Waspi] CRIT text failed', e);
      }
    }

    state.sprite?.setState('hurt');
    this.renderDummyState(dummy, state);
    this.renderBossHud();
    if (state.hp > 0) return;

    state.alive = false;
    state.respawnAt = this.time.now + state.respawnMs;
    state.hp = 0;
    dummy.setAlpha(0);
    dummy.body.enable = false;
    state.sprite?.setState('death');
    state.nameplate.setText('DOWN');
    state.nameplate.setColor('#888888');
    this.playCombatTone(state.isBoss ? 120 : 160, 0.16, 'sawtooth', 0.06);
    this.trainingScore += 1;
    this.combatStats = { ...this.combatStats, kills: this.combatStats.kills + 1 };
    saveCombatStats(this.combatStats);
    eventBus.emit(EVENTS.PLAYER_COMBAT_STATS, this.combatStats);
    eventBus.emit(EVENTS.STATS_ZOMBIE_KILL);
    if (this.trainingHud) {
      this.trainingHud.setText(`TRAINING KOs ${this.trainingScore}`);
    }
    const previousLevel = this.progression.level;
    this.progression = addXpToProgression(this.progression, state.xpReward);
    saveProgressionState(this.progression);
    this.renderProgressionHud();
    eventBus.emit(EVENTS.PLAYER_PROGRESSION, this.progression);
    const tenksReward = this.getScaledTrainingTenksReward(state.tenksReward);
    const multiplier = this.getTrainingTenksMultiplier();
    addTenks(tenksReward, `training_${state.archetype}`);
    if (state.isBoss) {
      this.showArenaNotice(`BOSS DOWN +${state.xpReward} XP +${tenksReward} TENKS x${multiplier.toFixed(1)}`, '#39FF14');
    } else {
      this.showArenaNotice(`+${state.xpReward} XP +${tenksReward} TENKS x${multiplier.toFixed(1)} ${state.label}`, '#F5C842');
    }
    this.renderTrainingHud();

    // Pulse progressionHud on TENKS gain
    if (this.progressionHud) {
      this.tweens.killTweensOf(this.progressionHud);
      this.tweens.add({
        targets: this.progressionHud,
        scaleX: { from: 1.18, to: 1 },
        scaleY: { from: 1.18, to: 1 },
        duration: 220,
        ease: 'Back.easeOut',
      });
    }

    if (this.progression.level > previousLevel) {
      this.showArenaNotice(`LEVEL UP ${this.progression.level}/${getMaxProgressionLevel()}`, '#46B3FF');
      this.playCombatTone(260, 0.2, 'square', 0.06);
      // Level-up celebration: blue camera flash + particle burst at player
      this.cameras.main.flash(300, 70, 179, 255, false);
      for (let i = 0; i < 16; i++) {
        const star = this.add.circle(this.px, this.py, Phaser.Math.Between(2, 5), 0x46B3FF, 1).setDepth(5001);
        const angle = (Math.PI * 2 * i) / 16;
        const dist = Phaser.Math.Between(28, 64);
        this.tweens.add({
          targets: star,
          x: this.px + Math.cos(angle) * dist,
          y: this.py + Math.sin(angle) * dist,
          alpha: { from: 1, to: 0 },
          scale: { from: 1, to: 0.2 },
          duration: 500,
          ease: 'Quad.easeOut',
          onComplete: () => safeDestroyGameObject(star),
        });
      }
    }

    const burst = this.add.text(dummy.x, dummy.y - 18, 'KO', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#39FF14',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(5002);
    this.tweens.add({
      targets: burst,
      y: dummy.y - 38,
      alpha: { from: 1, to: 0 },
      scale: { from: 1, to: 1.3 },
      duration: 520,
      ease: 'Sine.easeOut',
      onComplete: () => safeDestroyGameObject(burst),
    });

    // Shockwave ring
    const ring = this.add.circle(dummy.x, dummy.y, 8, 0xFFFFFF, 0).setDepth(4999);
    ring.setStrokeStyle(2, state.tint, 0.8);
    this.tweens.add({
      targets: ring,
      scaleX: 5,
      scaleY: 5,
      alpha: { from: 0.8, to: 0 },
      duration: 340,
      ease: 'Sine.easeOut',
      onComplete: () => safeDestroyGameObject(ring),
    });

    // 12 shards burst
    for (let i = 0; i < 12; i++) {
      const shard = this.add.circle(dummy.x, dummy.y, Phaser.Math.Between(2, 4), state.tint, 0.9).setDepth(5000);
      const angle = (Math.PI * 2 * i) / 12 + Phaser.Math.FloatBetween(-0.15, 0.15);
      const dist = Phaser.Math.Between(18, 52);
      this.tweens.add({
        targets: shard,
        x: dummy.x + Math.cos(angle) * dist,
        y: dummy.y + Math.sin(angle) * dist,
        alpha: { from: 0.9, to: 0 },
        scale: { from: 1, to: 0.3 },
        duration: Phaser.Math.Between(320, 480),
        ease: 'Quad.easeOut',
        onComplete: () => safeDestroyGameObject(shard),
      });
    }
    this.renderBossHud();
  }

  private updateDummies() {
    for (const [dummy, state] of this.dummyStates) {
      if (!isLiveGameObject(dummy) || !dummy.body) continue;
      if (!state.alive) {
        if (this.time.now < state.respawnAt) continue;
        state.alive = true;
        state.hp = state.maxHp;
        state.lastHurtAt = -9999;
        state.hpBarShowUntil = -9999;
        dummy.body.enable = true;
        dummy.setAlpha(0);
        state.sprite?.revive();
        state.nameplate.setText(state.label);
        state.nameplate.setColor(this.getEnemyNameColor(state.archetype));
        state.lastShotAt = this.time.now + Phaser.Math.Between(180, 520);
        const ring = this.add.circle(dummy.x, dummy.y, 10, state.tint, 0).setDepth(4999);
        ring.setStrokeStyle(2, state.tint, 0.8);
        this.tweens.add({
          targets: ring,
          scale: { from: 1, to: 3.4 },
          alpha: { from: 0.8, to: 0 },
          duration: 420,
          ease: 'Sine.easeOut',
          onComplete: () => safeDestroyGameObject(ring),
        });
        if (state.isBoss) {
          this.showArenaNotice('BOSS RESPAWN', '#3DD6FF');
          this.playCombatTone(180, 0.18, 'square', 0.05);
        }
      }

      state.phase += 0.018;
      let targetX = state.originX + Math.cos(state.phase) * 18;
      let targetY = state.originY + Math.sin(state.phase * 1.3) * 10;

      const distToPlayer = Phaser.Math.Distance.Between(dummy.x, dummy.y, this.px, this.py);
      const aggroRange = state.isBoss ? 420 : 280;
      if (this.inTraining && distToPlayer < aggroRange) {
        const angleToPlayer = Phaser.Math.Angle.Between(dummy.x, dummy.y, this.px, this.py);
        const approachMultiplier = state.isBoss ? 1.15 : 1;
        const approach = distToPlayer > state.preferredDistance + 36
          ? state.speed * approachMultiplier
          : distToPlayer < Math.max(40, state.preferredDistance - 30)
            ? -state.speed * 0.9
            : state.speed * 0.25;
        const strafe = distToPlayer < 220 ? Math.sin(this.time.now / (state.isBoss ? 120 : 180) + state.phase) * state.strafe : 0;
        const moveX = Math.cos(angleToPlayer) * approach + Math.cos(angleToPlayer + Math.PI / 2) * strafe;
        const moveY = Math.sin(angleToPlayer) * approach + Math.sin(angleToPlayer + Math.PI / 2) * strafe;
        targetX = dummy.x + moveX;
        targetY = dummy.y + moveY;

        if (distToPlayer < state.radius + 20 && this.time.now - this.lastDamageAt > LOCAL_HIT_COOLDOWN_MS) {
          this.applyLocalDamage(state.contactDamage, dummy.x, dummy.y);
          state.sprite?.setState('attack');
        }

        if (
          state.rangedDamage > 0 &&
          distToPlayer >= 90 &&
          distToPlayer < (state.isBoss ? 420 : 320) &&
          this.time.now - state.lastShotAt > state.shotCooldownMs
        ) {
          state.lastShotAt = this.time.now + Phaser.Math.Between(0, 160);
          if (state.isBoss) {
            for (const offset of [-0.18, 0, 0.18]) {
              this.fireEnemyBullet(dummy.x, dummy.y, this.px, this.py, state.tint, state.rangedDamage, offset);
            }
            this.playCombatTone(150, 0.12, 'sawtooth', 0.04);
          } else {
            this.fireEnemyBullet(dummy.x, dummy.y, this.px, this.py, state.tint, state.rangedDamage, 0);
          }
        }
      }

      targetX = Phaser.Math.Clamp(targetX, ZONES.TRAINING_X + 26, ZONES.TRAINING_X + ZONES.TRAINING_W - 26);
      targetY = Phaser.Math.Clamp(targetY, ZONES.TRAINING_Y + 26, ZONES.TRAINING_Y + ZONES.TRAINING_H - 26);

      // Drive zombie sprite animation based on movement
      const dx = targetX - dummy.x;
      const dy = targetY - dummy.y;
      const isMoving = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
      if (state.sprite) {
        state.sprite.setState(isMoving ? 'walk' : 'idle');
        // Flip sprite to face movement direction
        if (Math.abs(dx) > 0.2) state.sprite.setFlipX(dx < 0);
      }

      dummy.setPosition(targetX, targetY);
      this.renderDummyState(dummy, state);
    }
    this.renderBossHud();
  }

  private fireEnemyBullet(fromX: number, fromY: number, targetX: number, targetY: number, color: number, damage: number, angleOffset: number) {
    const baseAngle = Phaser.Math.Angle.Between(fromX, fromY, targetX, targetY);
    const angle = baseAngle + angleOffset + Phaser.Math.FloatBetween(-0.08, 0.08);
    const bullet = this.add.circle(fromX, fromY, 5, color, 0.95) as Phaser.GameObjects.Arc & {
      damage?: number;
      sourceX?: number;
      sourceY?: number;
    };
    bullet.damage = damage;
    bullet.sourceX = fromX;
    bullet.sourceY = fromY;
    bullet.setDepth(1900);
    bullet.setStrokeStyle(2, 0x000000, 0.28);
    this.physics.add.existing(bullet);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCircle(5);
    body.setVelocity(Math.cos(angle) * 260, Math.sin(angle) * 260);
    this.enemyBullets.add(bullet);

    const tracer = this.add.line(0, 0, fromX, fromY, fromX + Math.cos(angle) * 16, fromY + Math.sin(angle) * 16, color, 0.45)
      .setLineWidth(2, 2)
      .setDepth(1899);
    this.tweens.add({
      targets: tracer,
      alpha: { from: 0.45, to: 0 },
      duration: 90,
      onComplete: () => tracer.destroy(),
    });

    safeSceneDelayedCall(this, 1400, () => this.destroyArcadeObject(bullet), 'enemy bullet cleanup');
  }

  private ensureAudioReady() {
    if (typeof window === 'undefined') return;
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    this.audioUnlocked = this.audioCtx.state === 'running';
  }

  private playCombatTone(freq: number, duration: number, type: OscillatorType, gainValue: number) {
    if (!this.audioSettings.sfxEnabled) return;
    this.ensureAudioReady();
    if (!this.audioCtx || !this.audioUnlocked) return;

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.55), now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private applyLocalDamage(dmg: number, sourceX: number, sourceY: number) {
    this.lastDamageAt = this.time.now;
    this.hpDamagedAt = this.time.now; // triggers HP bar border flash
    this.hp = Math.max(0, this.hp - dmg);
    this.renderHpHud();
    this.playCombatTone(90, 0.08, 'triangle', 0.045);

    this.cameras.main.shake(90, 0.006, false);

    // Red vignette overlay
    const flash = this.add.rectangle(400, 300, 800, 600, 0xFF0000, 0.22)
      .setScrollFactor(0)
      .setDepth(20000);
    this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });

    // Avatar flash ring — white burst at player position
    const avatarFlash = this.add.circle(this.px, this.py, 18, 0xFFFFFF, 0.6).setDepth(2099);
    this.tweens.add({
      targets: avatarFlash,
      alpha: 0,
      scaleX: 2.2,
      scaleY: 2.2,
      duration: 180,
      ease: 'Sine.easeOut',
      onComplete: () => avatarFlash.destroy(),
    });

    // Hit tint flash — tint all container children red briefly
    try {
      const avatarContainer = this.playerAvatar.getContainer();
      if (avatarContainer?.active) {
        type Tintable = { setTint?: (c: number) => void; clearTint?: () => void };
        avatarContainer.each((child: Phaser.GameObjects.GameObject) => {
          try {
            (child as unknown as Tintable).setTint?.(0xFF3333);
          } catch (_e) { /* child may not support setTint */ }
        });
        this.time.delayedCall(100, () => {
          try {
            if (avatarContainer.active) {
              avatarContainer.each((child: Phaser.GameObjects.GameObject) => {
                try {
                  (child as unknown as Tintable).clearTint?.();
                } catch (_e) { /* ignore */ }
              });
            }
          } catch (_e) { /* ignore */ }
        });
      }
    } catch (_e) {
      console.error('[Waspi] Avatar hit tint failed', _e);
    }

    const pushAngle = Phaser.Math.Angle.Between(sourceX, sourceY, this.px, this.py);
    this.px += Math.cos(pushAngle) * 20;
    this.py += Math.sin(pushAngle) * 20;
    this.px = Phaser.Math.Clamp(this.px, 20, WORLD.WIDTH - 20);
    this.py = Phaser.Math.Clamp(this.py, 20, WORLD.HEIGHT - 20);
    this.playerBody.setPosition(this.px, this.py);
    this.playerAvatar.setPosition(this.px, this.py);
    this.playerNameplate.setPosition(this.px, this.py - 46);

    if (this.hp > 0) {
      this.playerAvatar.playHurt();
      this.broadcastSelfState('player:update', 'hurt');
      return;
    }

    this.combatStats = { ...this.combatStats, deaths: this.combatStats.deaths + 1 };
    saveCombatStats(this.combatStats);
    eventBus.emit(EVENTS.PLAYER_COMBAT_STATS, this.combatStats);
    eventBus.emit(EVENTS.STATS_PVP_RESULT, { won: false });
    this.playerAvatar.playDeath();
    this.broadcastSelfState('player:update', 'death');
    this.hp = 100;
    this.renderHpHud();
    this.px = PLAZA_RESPAWN_X;
    this.py = PLAZA_RESPAWN_Y;
    this.playerAvatar.clearActionState();
    this.playerBody.setPosition(this.px, this.py);
    this.playerAvatar.setPosition(this.px, this.py);
    this.playerNameplate.setPosition(this.px, this.py - 46);
    this.chatSystem.updatePosition('__player__', this.px, this.py);
    this.cameras.main.flash(180, 255, 255, 255, false);
    this.playCombatTone(140, 0.2, 'square', 0.05);

    const respawnText = this.add.text(this.px, this.py - 54, 'RESPAWN PLAZA', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10020);
    this.tweens.add({
      targets: respawnText,
      y: this.py - 74,
      alpha: { from: 1, to: 0 },
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => respawnText.destroy(),
    });
    this.broadcastSelfState('player:update');
  }

  private setupCombat() {
    this.dummies = this.physics.add.group({ allowGravity: false, immovable: true });
    this.bullets = this.physics.add.group({
      allowGravity: false,
      collideWorldBounds: true,
      maxSize: 64,
    });
    this.enemyBullets = this.physics.add.group({
      allowGravity: false,
      collideWorldBounds: true,
      maxSize: 80,
    });

    this.worldPointerShootHandler = (p: Phaser.Input.Pointer) => {
      if (!this.gunEnabled) return;
      if (this.inputBlocked) return;
      this.shootAt(p.worldX, p.worldY);
    };
    this.input.on('pointerdown', this.worldPointerShootHandler);

    // PVE: bullets vs dummies (training only)
    this.physics.add.overlap(this.bullets, this.dummies, (bObj, dObj) => {
      if (!this.inTraining || !this.pveEnabled) return;
      const bullet = bObj as ShotBullet;
      if (bullet.resolvedHit) return;
      bullet.resolvedHit = true;
      this.destroyArcadeObject(bObj);
      this.damageDummy(dObj as CombatDummy, bullet.damage ?? WEAPON_STATS[this.currentWeapon].damage, bullet.knockback ?? 12);
    });

    this.physics.add.overlap(this.enemyBullets, this.playerHitbox, (bObj) => {
      if (!this.inTraining || !this.pveEnabled) return;
      const bullet = bObj as Phaser.GameObjects.Arc & { damage?: number; sourceX?: number; sourceY?: number };
      this.destroyArcadeObject(bullet);
      this.applyLocalDamage(
        Math.max(4, Math.floor(bullet.damage ?? 8)),
        bullet.sourceX ?? this.px - 1,
        bullet.sourceY ?? this.py,
      );
    });
  }

  private shootAt(wx: number, wy: number) {
    const now = this.time.now;
    const weapon = WEAPON_STATS[this.currentWeapon];
    if (now - this.lastShotAt < weapon.cooldownMs) return;
    this.lastShotAt = now;
    this.weaponAimAngle = Phaser.Math.Angle.Between(this.px, this.py, wx, wy);
    this.playerAvatar.playShoot();
    if (this.gunSprite) {
      safePlaySpriteAnimation(this, this.gunSprite, weapon.shootAnim, weapon.idleTexture, WEAPON_FALLBACK_TEXTURE, true);
    }
    this.broadcastSelfState('player:update', 'shoot');
    this.ensureAudioReady();
    this.playCombatTone(
      this.currentWeapon === 'shotgun' ? 120 : 220,
      this.currentWeapon === 'shotgun' ? 0.11 : 0.07,
      this.currentWeapon === 'shotgun' ? 'sawtooth' : 'square',
      this.currentWeapon === 'shotgun' ? 0.05 : 0.035,
    );

    const ang = Phaser.Math.Angle.Between(this.px, this.py, wx, wy);

    // Muzzle flash — colored outer ring expanding
    const muzzleX = this.px + Math.cos(ang) * 14;
    const muzzleY = this.py + Math.sin(ang) * 14;
    const flash = this.add.circle(muzzleX, muzzleY, this.currentWeapon === 'shotgun' ? 10 : 7, weapon.color, 0.95);
    flash.setDepth(2100);
    this.tweens.add({
      targets: flash,
      alpha: { from: 0.95, to: 0 },
      scale: { from: 1, to: this.currentWeapon === 'shotgun' ? 2.4 : 1.8 },
      duration: 120,
      onComplete: () => flash.destroy(),
    });
    // Muzzle flash — inner white/yellow bright spot, alpha 0→1→0 over ~80ms
    try {
      const innerFlash = this.add.circle(muzzleX, muzzleY, this.currentWeapon === 'shotgun' ? 5 : 4, 0xFFFAB0, 0);
      innerFlash.setDepth(2101);
      this.tweens.add({
        targets: innerFlash,
        alpha: { from: 0, to: 1 },
        duration: 20,
        yoyo: true,
        hold: 40,
        onComplete: () => innerFlash.destroy(),
      });
    } catch (_e) {
      console.error('[Waspi] Inner muzzle flash failed', _e);
    }

    // Subtle recoil on hands/weapon — duration synced to weapon cooldown (cap 150ms)
    const recoilX = Math.cos(ang) * -2;
    const recoilY = Math.sin(ang) * -2;
    const container = this.playerAvatar.getContainer();
    const recoilDuration = Math.min(weapon.cooldownMs, 150);
    this.tweens.add({
      targets: container,
      x: container.x + recoilX,
      y: container.y + recoilY,
      yoyo: true,
      duration: recoilDuration,
      ease: 'Sine.easeOut',
    });

    // Per-weapon tracer config
    const tracerCfg: Record<WeaponMode, { len: number; width: number; alpha: number; dur: number; glow: boolean }> = {
      pistol:  { len: 48,  width: 1.5, alpha: 0.7, dur: 80,  glow: false },
      smg:     { len: 28,  width: 1,   alpha: 0.6, dur: 50,  glow: false },
      shotgun: { len: 22,  width: 2.5, alpha: 0.6, dur: 100, glow: false },
      rifle:   { len: 90,  width: 1,   alpha: 0.85, dur: 110, glow: false },
      deagle:  { len: 60,  width: 2,   alpha: 0.8, dur: 100, glow: false },
      cannon:  { len: 36,  width: 4,   alpha: 0.7, dur: 130, glow: false },
      raygun:  { len: 110, width: 2.5, alpha: 1.0, dur: 180, glow: true  },
    };
    const tc = tracerCfg[this.currentWeapon];

    for (let i = 0; i < weapon.pellets; i++) {
      const spreadOffset = Phaser.Math.FloatBetween(-weapon.spread, weapon.spread);
      const shotAngle = ang + spreadOffset;

      // Bullet starts at muzzle position
      const b = this.add.rectangle(muzzleX, muzzleY, this.currentWeapon === 'cannon' ? 7 : this.currentWeapon === 'shotgun' ? 6 : 10, this.currentWeapon === 'cannon' ? 7 : 3, weapon.color, 1) as ShotBullet;
      b.damage = weapon.damage;
      b.knockback = weapon.knockback;
      this.physics.add.existing(b);
      const body = b.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setSize(10, 3);
      body.setVelocity(Math.cos(shotAngle) * weapon.speed, Math.sin(shotAngle) * weapon.speed);
      b.setRotation(shotAngle);
      b.setDepth(2000);
      this.bullets.add(b);

      // Tracer from muzzle outward
      const tx2 = muzzleX + Math.cos(shotAngle) * tc.len;
      const ty2 = muzzleY + Math.sin(shotAngle) * tc.len;
      const tracer = this.add.line(0, 0, muzzleX, muzzleY, tx2, ty2, weapon.color, tc.alpha)
        .setLineWidth(tc.width, tc.width).setDepth(1999);

      // Raygun: add glow layer (wider, dimmer line underneath)
      if (tc.glow) {
        const glow = this.add.line(0, 0, muzzleX, muzzleY, tx2, ty2, weapon.color, 0.3)
          .setLineWidth(tc.width * 4, tc.width * 4).setDepth(1998);
        this.tweens.add({ targets: glow, alpha: 0, duration: tc.dur * 0.6, onComplete: () => glow.destroy() });
      }

      this.tweens.add({
        targets: tracer,
        alpha: { from: tc.alpha, to: 0 },
        duration: tc.dur,
        onComplete: () => tracer.destroy(),
      });

      this.resolveImmediateShot(shotAngle, weapon, b);

      this.time.delayedCall(this.currentWeapon === 'shotgun' ? 420 : 900, () => this.destroyArcadeObject(b));
    }

    this.cameras.main.shake(this.currentWeapon === 'shotgun' ? 70 : 40, this.currentWeapon === 'shotgun' ? 0.0024 : 0.0012, false);

    this.renderCombatHud();
  }

  private resolveImmediateShot(angle: number, weapon: WeaponStats, bullet: ShotBullet) {
    const maxRange = this.currentWeapon === 'shotgun' ? 280 : 430;
    const bestDummy = this.findImmediateDummyTarget(angle, maxRange);
    if (bestDummy) {
      bullet.resolvedHit = true;
      this.damageDummy(bestDummy, weapon.damage, weapon.knockback);
      this.destroyArcadeObject(bullet);
      return;
    }

    if (!this.inTraining || !this.pvpEnabled) return;
    const bestRemote = this.findImmediateRemoteTarget(angle, maxRange);
    if (!bestRemote) return;

    bullet.resolvedHit = true;
    const remoteForKnockback = this.remotePlayers.get(bestRemote);
    const hitAngle = remoteForKnockback
      ? Phaser.Math.Angle.Between(this.px, this.py, remoteForKnockback.x, remoteForKnockback.y)
      : angle;
    this.channel?.send({
      type: 'broadcast',
      event: 'player:hit',
      payload: {
        target_id: bestRemote,
        source_id: this.playerId,
        dmg: weapon.damage,
        kx: Math.cos(hitAngle) * weapon.knockback * 0.5,
        ky: Math.sin(hitAngle) * weapon.knockback * 0.5,
      },
    });
    this.destroyArcadeObject(bullet);
  }

  private findImmediateDummyTarget(angle: number, maxRange: number) {
    if (!this.inTraining || !this.pveEnabled) return null;

    let bestDummy: CombatDummy | null = null;
    let bestForward = Number.POSITIVE_INFINITY;

    for (const [dummy, state] of this.dummyStates.entries()) {
      if (!state.alive) continue;
      const forward = this.getForwardShotDistance(angle, dummy.x, dummy.y);
      if (forward === null || forward > maxRange || forward >= bestForward) continue;
      const radius = Math.max(18, dummy.displayWidth / 2 + 8);
      const lateral = this.getLateralShotDistance(angle, dummy.x, dummy.y);
      if (lateral > radius) continue;
      bestDummy = dummy;
      bestForward = forward;
    }

    return bestDummy;
  }

  private findImmediateRemoteTarget(angle: number, maxRange: number) {
    let bestPlayerId: string | null = null;
    let bestForward = Number.POSITIVE_INFINITY;

    for (const [playerId, rp] of this.remotePlayers.entries()) {
      const forward = this.getForwardShotDistance(angle, rp.x, rp.y);
      if (forward === null || forward > maxRange || forward >= bestForward) continue;
      const lateral = this.getLateralShotDistance(angle, rp.x, rp.y);
      if (lateral > 26) continue;
      bestPlayerId = playerId;
      bestForward = forward;
    }

    return bestPlayerId;
  }

  private getForwardShotDistance(angle: number, targetX: number, targetY: number) {
    const dx = targetX - this.px;
    const dy = targetY - this.py;
    const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
    return forward >= 0 ? forward : null;
  }

  private getLateralShotDistance(angle: number, targetX: number, targetY: number) {
    const dx = targetX - this.px;
    const dy = targetY - this.py;
    return Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
  }

  private refreshUtilitiesFromInventory() {
    this.gunEnabled = true;
    this.ballEnabled = hasUtilityEquipped('UTIL-BALL-01');
    // If current weapon no longer owned, revert to pistol
    if (!this.hasWeaponUnlocked(this.currentWeapon)) {
      this.currentWeapon = 'pistol';
    }
    this.renderCombatHud();
    this.syncWeaponVisual();

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
    g.fillStyle(0xF5E6A8, 0.22);
    for (let dx = 0; dx < WORLD.WIDTH; dx += 90) {
      g.fillRect(dx, dashY - 2, 42, 3);
    }

    // Crosswalks to help the street read around the venues
    const crossings = [
      BUILDINGS.ARCADE.x + BUILDINGS.ARCADE.w / 2,
      BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2,
      BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2,
      BUILDINGS.CASINO.x + BUILDINGS.CASINO.w / 2,
    ];
    g.fillStyle(0xD9DEE8, 0.18);
    crossings.forEach((centerX) => {
      for (let i = -3; i <= 3; i++) {
        g.fillRect(centerX - 38 + i * 12, ZONES.NORTH_SIDEWALK_Y + 8, 8, ZONES.SOUTH_SIDEWALK_Y - ZONES.NORTH_SIDEWALK_Y - 16);
      }
    });

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

    // Vecindad gate on the far left, leading to the dedicated barrio map.
    const vecindadGuideX = 112;
    g.fillStyle(0x2b2016, 1);
    g.fillRect(56, ZONES.SOUTH_SIDEWALK_Y - 18, 16, 114);
    g.fillRect(152, ZONES.SOUTH_SIDEWALK_Y - 18, 16, 114);
    g.fillStyle(0x5f4a34, 0.95);
    g.fillRoundedRect(34, ZONES.SOUTH_SIDEWALK_Y - 48, 156, 40, 10);
    g.lineStyle(2, COLORS.GOLD, 0.75);
    g.strokeRoundedRect(34, ZONES.SOUTH_SIDEWALK_Y - 48, 156, 40, 10);
    g.fillStyle(0x5f4a34, 0.9);
    g.fillRoundedRect(42, ZONES.SOUTH_SIDEWALK_Y + 18, 148, 42, 12);
    g.strokeRoundedRect(42, ZONES.SOUTH_SIDEWALK_Y + 18, 148, 42, 12);

    this.add.text(vecindadGuideX, ZONES.SOUTH_SIDEWALK_Y - 28, 'LA VECINDAD', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);
    this.add.text(vecindadGuideX, ZONES.SOUTH_SIDEWALK_Y + 38, 'SPACE ENTRAR', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C8D6B7',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);
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
    g.lineStyle(3, 0x25253A, 0.8);
    g.strokeRect(px, py, pw, ph);

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
    g.fillStyle(0x46B3FF, 0.08);
    g.fillCircle(fx, fy, 130);

    // Fountain border
    g.lineStyle(3, 0x334455, 0.9);
    g.strokeCircle(fx, fy, 80);

    // Bench near fountain
    this.drawBench(g, 1450, fy + 110);
    this.drawBench(g, 1750, fy + 110);
    this.drawBench(g, fx - 120, fy - 20);
    this.drawBench(g, fx + 120, fy - 20);

    // PVP bookie booth
    g.fillStyle(0x1b1107, 0.98);
    g.fillRoundedRect(900, ZONES.PLAZA_Y + 430, 180, 102, 14);
    g.lineStyle(2, 0xF5C842, 0.62);
    g.strokeRoundedRect(900, ZONES.PLAZA_Y + 430, 180, 102, 14);
    g.fillStyle(0x311d0f, 1);
    g.fillRoundedRect(920, ZONES.PLAZA_Y + 450, 140, 22, 8);
    g.fillStyle(0x6c3f1e, 1);
    g.fillRect(928, ZONES.PLAZA_Y + 474, 124, 26);
    g.fillStyle(0x140d08, 1);
    g.fillRect(980, ZONES.PLAZA_Y + 452, 20, 62);
    g.fillStyle(0xD2A46A, 1);
    g.fillCircle(992, ZONES.PLAZA_Y + 463, 10);
    g.fillStyle(0x4a2f80, 1);
    g.fillRect(982, ZONES.PLAZA_Y + 474, 20, 24);

    this.add.text(990, ZONES.PLAZA_Y + 440, 'PVP PIT', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5).setDepth(2);

    this.add.text(990, ZONES.PLAZA_Y + 518, 'SPACE APOSTAR / PELEAR', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C0C2CC',
    }).setOrigin(0.5).setDepth(2);

    // Final plaza anchor: gun shop now active
    this.drawGunShopBuilding();

    // Plaza text
    this.add.text(fx, ZONES.PLAZA_Y + 20, 'PLAZA', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#334455',
    }).setOrigin(0.5).setDepth(2);
  }

  private drawVecindad() {
    const g = this.add.graphics().setDepth(0.6);
    const x = ZONES.VECINDAD_X;
    const y = ZONES.VECINDAD_Y;
    const w = ZONES.VECINDAD_W;
    const h = ZONES.VECINDAD_H;

    // Main district ground
    g.fillStyle(0x13210f, 0.96);
    g.fillRoundedRect(x, y, w, h, 18);
    g.lineStyle(3, 0x2d4b26, 0.95);
    g.strokeRoundedRect(x, y, w, h, 18);

    // Dirt roads / circulation
    g.fillStyle(0x3e2d1d, 0.95);
    g.fillRoundedRect(x + 34, y + 84, w - 68, 72, 18);
    g.fillRoundedRect(x + 418, y + 76, 84, h - 134, 18);

    g.lineStyle(2, 0x5a4633, 0.6);
    for (let dx = x + 60; dx < x + w - 40; dx += 34) {
      g.lineBetween(dx, y + 119, dx + 14, y + 119);
    }
    for (let dy = y + 106; dy < y + h - 60; dy += 32) {
      g.lineBetween(x + 460, dy, x + 460, dy + 14);
    }

    // Link path toward the plaza so the district feels connected
    g.fillStyle(0x5f4a34, 0.9);
    g.fillRoundedRect(x + w - 80, y + 106, 210, 32, 14);
    g.fillRoundedRect(x + w - 40, y - 96, 36, 220, 16);

    // Gateway arch so the entrance reads from far away
    g.fillStyle(0x2b2016, 1);
    g.fillRect(x + w - 58, y - 84, 12, 120);
    g.fillRect(x + w - 2, y - 84, 12, 120);
    g.fillStyle(0x6a4a2b, 1);
    g.fillRoundedRect(x + w - 78, y - 112, 96, 36, 8);
    g.lineStyle(2, COLORS.GOLD, 0.75);
    g.strokeRoundedRect(x + w - 78, y - 112, 96, 36, 8);

    this.add.text(x + w - 30, y - 94, '< VECI', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    // Entry sign
    g.fillStyle(0x2b2016, 1);
    g.fillRect(x + 54, y + 18, 16, 64);
    g.fillRect(x + 194, y + 18, 16, 64);
    g.fillStyle(0x5b4028, 1);
    g.fillRoundedRect(x + 34, y + 8, 196, 52, 10);
    g.lineStyle(2, 0xF5C842, 0.75);
    g.strokeRoundedRect(x + 34, y + 8, 196, 52, 10);

    this.add.text(x + 132, y + 35, 'LA VECINDAD', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    this.add.text(x + 132, y + 62, 'PARCELAS / FUTURAS CASAS', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B5B19A',
    }).setOrigin(0.5).setDepth(2);

    VECINDAD_PARCELS.forEach((parcel, index) => {
      this.drawParcelLot(g, parcel, index === 0);
    });

    this.parcelPrompt = this.add.text(x + w / 2, y + h + 20, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setDepth(3);

    this.setupMaterialNodes();
    this.refreshParcelVisuals();
  }

  private drawParcelLot(
    g: Phaser.GameObjects.Graphics,
    parcel: VecindadParcelConfig,
    featured: boolean,
  ) {
    const { x, y, w, h, id } = parcel;
    g.fillStyle(featured ? 0x1b3020 : 0x182715, 1);
    g.fillRoundedRect(x, y, w, h, 12);
    g.lineStyle(2, featured ? 0xF5C842 : 0x506842, 0.9);
    g.strokeRoundedRect(x, y, w, h, 12);

    // Fence
    g.lineStyle(2, 0x6b4b2a, 0.9);
    for (let dx = x + 16; dx <= x + w - 16; dx += 26) {
      g.lineBetween(dx, y + 10, dx, y + 28);
      g.lineBetween(dx, y + h - 28, dx, y + h - 10);
    }
    for (let dy = y + 20; dy <= y + h - 20; dy += 24) {
      g.lineBetween(x + 10, dy, x + 28, dy);
      g.lineBetween(x + w - 28, dy, x + w - 10, dy);
    }

    // Foundation placeholder
    g.fillStyle(0x2a2a32, 0.7);
    g.fillRoundedRect(x + 76, y + 42, w - 152, h - 66, 10);
    g.lineStyle(2, 0x44445a, 0.8);
    g.strokeRoundedRect(x + 76, y + 42, w - 152, h - 66, 10);

    const labelColor = featured ? '#F5C842' : '#C8D6B7';
    const title = this.add.text(x + 18, y + 18, `PARCELA ${id}`, {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: labelColor,
    }).setDepth(2);

    const status = this.add.text(x + w / 2, y + 64, featured ? 'PRIMER LOTE' : 'FOR SALE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: featured ? '#F5C842' : '#E6E1C8',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    const detail = this.add.text(x + w / 2, y + 92, featured ? 'BUY + FARM + BUILD' : 'COMPRA Y CONSTRUYE', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: featured ? '#B9FF9E' : '#9EB09A',
    }).setOrigin(0.5).setDepth(2);

    const badge = this.add.text(x + w - 18, y + 18, `${parcel.cost}T`, {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(1, 0).setDepth(2);

    const structure = this.add.graphics().setDepth(2.2);
    this.parcelVisuals.set(id, { title, status, detail, badge, structure });
  }

  private refreshParcelVisuals() {
    for (const parcel of VECINDAD_PARCELS) {
      const visuals = this.parcelVisuals.get(parcel.id);
      if (!visuals) continue;
      const shared = this.sharedParcelState.get(parcel.id);
      const ownedByMe = this.vecindadState.ownedParcelId === parcel.id;
      const occupiedByAnother = Boolean(shared && !ownedByMe);
      const playerOwnsAnother = Boolean(this.vecindadState.ownedParcelId && !ownedByMe);
      const buildStage = ownedByMe
        ? Math.max(1, this.vecindadState.buildStage)
        : shared?.buildStage ?? 0;

      visuals.status.setText(
        ownedByMe
          ? 'TU PARCELA'
          : occupiedByAnother
            ? 'OCUPADA'
            : 'FOR SALE'
      );
      visuals.status.setColor(
        ownedByMe
          ? '#39FF14'
          : occupiedByAnother
            ? '#46B3FF'
            : '#E6E1C8'
      );
      visuals.detail.setText(
        ownedByMe
          ? `STAGE ${buildStage} / MATS ${this.vecindadState.materials}`
          : occupiedByAnother
            ? `${shared?.ownerUsername ?? 'VECINO'} · STAGE ${buildStage}`
            : playerOwnsAnother
              ? 'YA TENES OTRA PARCELA'
              : 'COMPRA Y CONSTRUYE'
      );
      visuals.detail.setColor(
        ownedByMe
          ? '#B9FF9E'
          : occupiedByAnother
            ? '#9EDCFF'
            : playerOwnsAnother
              ? '#FFB36A'
              : '#9EB09A'
      );
      visuals.badge.setText(
        ownedByMe
          ? 'OWNED'
          : occupiedByAnother
            ? `@${(shared?.ownerUsername ?? 'vecino').slice(0, 10)}`
            : `${parcel.cost}T`
      );
      visuals.badge.setColor(ownedByMe ? '#39FF14' : occupiedByAnother ? '#46B3FF' : '#F5C842');
      this.drawParcelStructure(parcel, visuals.structure, buildStage);
    }
    this.renderVecindadHud();
  }

  private drawParcelStructure(parcel: VecindadParcelConfig, graphics: Phaser.GameObjects.Graphics, buildStage: number) {
    graphics.clear();
    if (buildStage <= 0) return;

    const fx = parcel.x + parcel.w / 2;
    const fy = parcel.y + parcel.h - 22;

    graphics.fillStyle(0x3b3b45, 0.8);
    graphics.fillRoundedRect(fx - 48, fy - 14, 96, 14, 6);

    if (buildStage >= 1) {
      graphics.fillStyle(0x7a5533, 1);
      graphics.fillRoundedRect(fx - 40, fy - 50, 80, 34, 6);
      graphics.lineStyle(2, 0x2c1a0c, 0.9);
      graphics.strokeRoundedRect(fx - 40, fy - 50, 80, 34, 6);
    }

    if (buildStage >= 2) {
      graphics.fillStyle(0xb48a5a, 1);
      graphics.fillRoundedRect(fx - 44, fy - 88, 88, 40, 6);
      graphics.fillStyle(0x2f2114, 1);
      graphics.fillRect(fx - 10, fy - 62, 20, 26);
    }

    if (buildStage >= 3) {
      graphics.fillStyle(0x5d2c18, 1);
      graphics.fillTriangle(fx - 54, fy - 88, fx, fy - 126, fx + 54, fy - 88);
      graphics.lineStyle(2, 0x291308, 0.95);
      graphics.strokeTriangle(fx - 54, fy - 88, fx, fy - 126, fx + 54, fy - 88);
    }

    if (buildStage >= 4) {
      graphics.fillStyle(0x88ccff, 0.9);
      graphics.fillRect(fx - 28, fy - 78, 18, 14);
      graphics.fillRect(fx + 10, fy - 78, 18, 14);
      graphics.fillStyle(0xf5c842, 0.95);
      graphics.fillRect(fx - 30, fy - 126, 60, 6);
    }
  }

  private setupMaterialNodes() {
    if (this.materialNodes.length) return;
    const defs = [
      { x: ZONES.VECINDAD_X + 308, y: ZONES.VECINDAD_Y + 112 },
      { x: ZONES.VECINDAD_X + 602, y: ZONES.VECINDAD_Y + 112 },
      { x: ZONES.VECINDAD_X + 308, y: ZONES.VECINDAD_Y + 264 },
      { x: ZONES.VECINDAD_X + 602, y: ZONES.VECINDAD_Y + 414 },
      { x: ZONES.VECINDAD_X + 308, y: ZONES.VECINDAD_Y + 564 },
      { x: ZONES.VECINDAD_X + 602, y: ZONES.VECINDAD_Y + 714 },
    ];

    defs.forEach((def, index) => {
      const crate = this.add.rectangle(def.x, def.y, 28, 24, 0x8b5a2b, 1)
        .setStrokeStyle(2, 0x3c2412, 1)
        .setDepth(2.4);
      const band = this.add.rectangle(def.x, def.y, 32, 5, 0xf5c842, 0.8).setDepth(2.5);
      const label = this.add.text(def.x, def.y - 22, '+MAT', {
        fontSize: '6px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#B9FF9E',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2.5);

      this.materialNodes.push({
        id: `mat_${index + 1}`,
        x: def.x,
        y: def.y,
        value: 4,
        available: true,
        respawnAt: 0,
        crate,
        band,
        label,
      });
    });
  }

  private renderVecindadHud() {
    const parcel = this.vecindadState.ownedParcelId ? `PARCELA ${this.vecindadState.ownedParcelId}` : 'SIN PARCELA';
    const stage = Math.max(0, this.vecindadState.buildStage);
    const nextCost = stage >= MAX_VECINDAD_STAGE ? 0 : getBuildCost(Math.max(stage, 1));
    const text = [
      'LA VECINDAD',
      parcel,
      `MATS ${this.vecindadState.materials}`,
      `STAGE ${stage}/${MAX_VECINDAD_STAGE}${stage >= MAX_VECINDAD_STAGE ? ' MAX' : ` NEXT ${nextCost}`}`,
    ];

    if (!this.vecindadHud) {
      this.vecindadHud = this.add.text(8, 92, text, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#B9FF9E',
        lineSpacing: 6,
        stroke: '#000000',
        strokeThickness: 3,
      }).setScrollFactor(0).setDepth(9999);
      this.vecindadHud.setVisible(this.isInsideVecindadDistrict());
      return;
    }

    this.vecindadHud.setText(text);
    this.vecindadHud.setVisible(this.isInsideVecindadDistrict());
  }

  private isInsideVecindadDistrict() {
    return this.px >= ZONES.VECINDAD_X
      && this.px <= ZONES.VECINDAD_X + ZONES.VECINDAD_W
      && this.py >= ZONES.VECINDAD_Y
      && this.py <= ZONES.VECINDAD_Y + ZONES.VECINDAD_H;
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

  private drawGunShopBuilding() {
    const { x, y, w, h } = WorldScene.GUN_SHOP_BOUNDS;
    const g = this.add.graphics().setDepth(1.4);
    const accentHex = '#46B3FF';
    const accent = Number(`0x${accentHex.replace('#', '')}`);

    // Outer slab
    g.fillStyle(0x101425, 0.95);
    g.fillRoundedRect(x, y, w, h, 16);
    g.lineStyle(3, 0x2b3755, 0.95);
    g.strokeRoundedRect(x, y, w, h, 16);

    // Main facade
    g.fillStyle(0x161d33, 1);
    g.fillRoundedRect(x + 18, y + 30, w - 36, h - 50, 12);
    g.lineStyle(2, 0x314674, 0.9);
    g.strokeRoundedRect(x + 18, y + 30, w - 36, h - 50, 12);

    // Neon strips
    g.fillStyle(accent, 0.75);
    g.fillRect(x + 30, y + 48, w - 60, 4);
    g.fillRect(x + 30, y + 162, w - 60, 4);

    // Window displays
    g.fillStyle(0x0a0f1d, 1);
    g.fillRoundedRect(x + 34, y + 72, 72, 76, 8);
    g.fillRoundedRect(x + w - 106, y + 72, 72, 76, 8);
    g.lineStyle(2, accent, 0.5);
    g.strokeRoundedRect(x + 34, y + 72, 72, 76, 8);
    g.strokeRoundedRect(x + w - 106, y + 72, 72, 76, 8);

    // Door
    const doorW = 58;
    const doorH = 88;
    const doorX = x + w / 2 - doorW / 2;
    const doorY = y + h - doorH - 14;
    g.fillStyle(0x090d18, 1);
    g.fillRoundedRect(doorX, doorY, doorW, doorH, 10);
    g.lineStyle(2, accent, 0.85);
    g.strokeRoundedRect(doorX, doorY, doorW, doorH, 10);
    g.fillStyle(accent, 0.9);
    g.fillRect(doorX + doorW - 10, doorY + 42, 4, 12);

    // Signboard
    g.fillStyle(0x2b2016, 1);
    g.fillRoundedRect(x + 44, y - 34, 156, 36, 8);
    g.lineStyle(2, accent, 0.85);
    g.strokeRoundedRect(x + 44, y - 34, 156, 36, 8);

    this.add.text(x + 122, y - 16, 'GUN SHOP', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: accentHex,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    this.add.text(x + w / 2, y + h / 2 + 12, 'OPEN NOW', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B8D4FF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    this.add.text(x + w / 2, y + h / 2 + 36, 'SPACE ENTRAR', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#7AA7E8',
    }).setOrigin(0.5).setDepth(2);
  }

  private getGunDealerPosition() {
    const { x, y, w, h } = WorldScene.GUN_SHOP_BOUNDS;
    return {
      x: x + w / 2,
      y: y + h - 24,
    };
  }

  private drawBuildings() {
    this.drawBuildingShadows();
    // ARCADE
    this.drawArcadeBuilding();
    // WASPI STORE
    this.drawStoreBuilding();
    // CAFÉ
    this.drawCafeBuilding();
    // CASINO
    this.drawCasinoBuilding();
    this.drawBuildingEntranceMarkers();
  }

  /** Drop shadows: dark offset rects drawn just above the ground, behind each building facade */
  private drawBuildingShadows() {
    const g = this.add.graphics().setDepth(1.5);
    const ox = 14;
    const oy = 14;
    [BUILDINGS.ARCADE, BUILDINGS.STORE, BUILDINGS.CAFE, BUILDINGS.CASINO].forEach(({ x, y, w, h }) => {
      g.fillStyle(0x000000, 0.38);
      g.fillRect(x + ox, y + oy, w, h);
    });
  }

  /** Permanent floor marker + chevron in front of each entrance — always visible, subtle */
  private drawBuildingEntranceMarkers() {
    const markerG = this.add.graphics().setDepth(1.8);
    const doors: Array<{ cx: number; floorY: number; color: number }> = [
      { cx: BUILDINGS.ARCADE.x + BUILDINGS.ARCADE.w / 2, floorY: BUILDINGS.ARCADE.y + BUILDINGS.ARCADE.h, color: 0x46B3FF },
      { cx: BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2,  floorY: BUILDINGS.STORE.y + BUILDINGS.STORE.h,  color: 0xF5C842 },
      { cx: BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2,    floorY: BUILDINGS.CAFE.y + BUILDINGS.CAFE.h,    color: 0xFF8B3D },
      { cx: BUILDINGS.CASINO.x + BUILDINGS.CASINO.w / 2, floorY: BUILDINGS.CASINO.y + BUILDINGS.CASINO.h, color: 0xF5C842 },
    ];
    doors.forEach(({ cx, floorY, color }) => {
      // Soft colored floor zone in front of door
      markerG.fillStyle(color, 0.07);
      markerG.fillRoundedRect(cx - 48, floorY + 2, 96, 34, 6);
      markerG.lineStyle(1, color, 0.22);
      markerG.strokeRoundedRect(cx - 48, floorY + 2, 96, 34, 6);
      // Small downward chevron pointing into the door
      markerG.fillStyle(color, 0.4);
      markerG.fillTriangle(cx, floorY + 30, cx - 11, floorY + 16, cx + 11, floorY + 16);
    });
  }

  private drawArcadeBuilding() {
    const { x, y, w, h } = BUILDINGS.ARCADE;
    const g = this.add.graphics().setDepth(2);
    const cx = x + w / 2;

    // ── Base facade ──────────────────────────────────────────────────────────
    g.fillStyle(0x0a0a1e);
    g.fillRect(x, y, w, h);

    // Subtle side pillar panels
    g.fillStyle(0x0d0d22);
    g.fillRect(x, y, 28, h);
    g.fillRect(x + w - 28, y, 28, h);

    // ── Roof marquee bar ─────────────────────────────────────────────────────
    g.fillStyle(0x06061a);
    g.fillRect(x - 10, y, w + 20, 36);
    // LED strip top edge (hot pink)
    g.lineStyle(3, 0xFF006E, 1);
    g.lineBetween(x - 10, y + 1, x + w + 10, y + 1);
    // LED strip bottom of marquee
    g.lineStyle(2, 0xFF006E, 0.6);
    g.lineBetween(x - 10, y + 36, x + w + 10, y + 36);

    // Marquee dot lights
    for (let lx = x; lx < x + w; lx += 18) {
      g.fillStyle(0xFF006E, 0.7);
      g.fillCircle(lx + 9, y + 6, 2);
    }

    // ── Main sign area ────────────────────────────────────────────────────────
    // Dark sign panel background
    g.fillStyle(0x04040f);
    g.fillRect(x + 50, y + 38, w - 100, 38);
    g.lineStyle(1.5, 0xFF006E, 0.4);
    g.strokeRect(x + 50, y + 38, w - 100, 38);

    // ── Arcade cabinet screen panels (3 panels) ───────────────────────────────
    const panels = [
      { px: x + 34, py: y + 90 },
      { px: x + 160, py: y + 90 },
      { px: x + 286, py: y + 90 },
    ];
    panels.forEach(({ px, py }) => {
      // Screen bezel
      g.fillStyle(0x111122);
      g.fillRoundedRect(px, py, 88, 70, 4);
      g.lineStyle(2, 0x334466, 0.9);
      g.strokeRoundedRect(px, py, 88, 70, 4);
      // Screen glow fill (cyan/blue CRT feel)
      g.fillStyle(0x001833, 0.9);
      g.fillRect(px + 4, py + 4, 80, 62);
      // Scanlines (alternating rows)
      g.lineStyle(1, 0x003366, 0.5);
      for (let sy = py + 8; sy < py + 66; sy += 6) {
        g.lineBetween(px + 4, sy, px + 84, sy);
      }
      // Pixel "game" sprite — simple cross/star pattern
      g.fillStyle(0x46b3ff, 0.9);
      g.fillRect(px + 36, py + 22, 6, 20);
      g.fillRect(px + 28, py + 28, 22, 6);
      g.fillStyle(0xff006e, 0.8);
      g.fillRect(px + 18, py + 14, 6, 6);
      g.fillRect(px + 60, py + 42, 6, 6);
      g.fillStyle(0xFFFF00, 0.7);
      g.fillRect(px + 50, py + 14, 4, 4);
    });

    // ── Entrance ──────────────────────────────────────────────────────────────
    const doorX = cx - 38;
    const doorY = y + h - 82;
    // Door frame glowing surround
    g.fillStyle(0x001a33);
    g.fillRect(doorX - 4, doorY - 4, 84, 86);
    g.lineStyle(3, 0x46b3ff, 1);
    g.strokeRect(doorX - 4, doorY - 4, 84, 86);
    // Door interior dark
    g.fillStyle(0x000008);
    g.fillRect(doorX, doorY, 76, 82);
    // Door frame inner glow line
    g.lineStyle(1, 0x46b3ff, 0.4);
    g.strokeRect(doorX + 4, doorY + 4, 68, 74);
    // Floor reflection strip at bottom of door
    g.fillStyle(0x46b3ff, 0.18);
    g.fillRect(doorX, doorY + 72, 76, 10);

    // Neon vertical tubes on entrance sides
    g.lineStyle(3, 0xFF006E, 0.9);
    g.lineBetween(doorX - 4, doorY - 4, doorX - 4, y + h);
    g.lineBetween(doorX + 80, doorY - 4, doorX + 80, y + h);
    g.lineStyle(1, 0xFF006E, 0.3);
    g.lineBetween(doorX - 8, doorY - 4, doorX - 8, y + h);
    g.lineBetween(doorX + 84, doorY - 4, doorX + 84, y + h);

    // Corner accent diamonds
    [[x + 14, y + h - 14], [x + w - 14, y + h - 14]].forEach(([dx, dy]) => {
      g.fillStyle(0xFF006E, 0.7);
      g.fillTriangle(dx, dy - 6, dx - 6, dy, dx, dy + 6);
      g.fillTriangle(dx, dy - 6, dx + 6, dy, dx, dy + 6);
    });

    // ── Animated elements ─────────────────────────────────────────────────────
    // Main ARCADE sign — layered glow effect
    const signGlow = this.add.text(cx, y + 52, 'ARCADE', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF006E',
      stroke: '#FF006E',
      strokeThickness: 8,
    }).setOrigin(0.5).setDepth(3).setAlpha(0.25);

    const signText = this.add.text(cx, y + 52, 'ARCADE', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFFFFF',
      stroke: '#FF006E',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(4);

    // Flicker: main sign
    this.tweens.add({
      targets: [signText, signGlow],
      alpha: { from: 1, to: 0.55 },
      duration: 120 + Math.random() * 80,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
      hold: 900 + Math.random() * 600,
    });

    // Sub-label "EST. WASPI"
    this.add.text(cx, y + 72, '— EST. WASPI —', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46b3ff',
    }).setOrigin(0.5).setDepth(4).setAlpha(0.7);

    // Screen glow pulse on panels (separate graphics for animation)
    const glowG = this.add.graphics().setDepth(2);
    let glowPhase = 0;
    this.time.addEvent({
      delay: 80,
      loop: true,
      callback: () => {
        glowPhase += 0.12;
        glowG.clear();
        panels.forEach(({ px, py }, i) => {
          const a = 0.06 + Math.abs(Math.sin(glowPhase + i * 1.1)) * 0.1;
          glowG.fillStyle(0x46b3ff, a);
          glowG.fillRect(px + 4, py + 4, 80, 62);
        });
      },
    });
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
    const ORANGE = COLORS.NEON_ORANGE;
    const cx = x + w / 2;

    // ── Facade base ─────────────────────────────────────────
    g.fillStyle(0x1c1008);
    g.fillRect(x, y, w, h);
    // Brick texture (horizontal courses)
    for (let by = y + 10; by < y + h; by += 10) {
      g.lineStyle(1, 0x2a1810, 0.5);
      g.lineBetween(x, by, x + w, by);
    }

    // ── Roof / cornice ───────────────────────────────────────
    g.fillStyle(COLORS.ROOF_DARK);
    g.fillRect(x - 10, y, w + 20, 26);
    g.fillStyle(0x0a0704);
    g.fillRect(x - 10, y + 24, w + 20, 5);
    g.lineStyle(2, ORANGE, 0.45);
    g.lineBetween(x - 10, y + 26, x + w + 10, y + 26);

    // ── Neon sign box (on roof strip) ───────────────────────
    const sigW = 128, sigH = 22, sigX = cx - sigW / 2, sigY = y + 3;
    g.fillStyle(0x0c0604);
    g.fillRect(sigX, sigY, sigW, sigH);
    g.lineStyle(2, ORANGE, 0.9);
    g.strokeRect(sigX, sigY, sigW, sigH);
    g.fillStyle(ORANGE, 0.08);
    g.fillRect(sigX - 4, sigY - 2, sigW + 8, sigH + 4);

    const cafeSign = this.add.text(cx, sigY + sigH / 2, '★  CAFÉ  ★', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6B00',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3);
    this.tweens.add({
      targets: cafeSign,
      alpha: { from: 1, to: 0.55 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ── Windows (upper: 3, lower: 2 flanking door) ──────────
    [[x + 24, y + 36], [x + 152, y + 36], [x + 296, y + 36]].forEach(([wx, wy]) => {
      const ww = 66, wh = 68;
      g.fillStyle(0xffaa44, 0.14);
      g.fillRect(wx, wy, ww, wh);
      g.lineStyle(2, ORANGE, 0.62);
      g.strokeRect(wx, wy, ww, wh);
      g.lineStyle(1, ORANGE, 0.22);
      g.lineBetween(wx + ww / 2, wy + 2, wx + ww / 2, wy + wh - 2);
      g.lineBetween(wx + 2, wy + wh / 2, wx + ww - 2, wy + wh / 2);
      g.fillStyle(0xff6b00, 0.06);
      g.fillRect(wx, wy, 12, wh);
      g.fillRect(wx + ww - 12, wy, 12, wh);
    });
    [[x + 24, y + 128], [x + 296, y + 128]].forEach(([wx, wy]) => {
      const ww = 66, wh = 58;
      g.fillStyle(0xffaa44, 0.12);
      g.fillRect(wx, wy, ww, wh);
      g.lineStyle(2, ORANGE, 0.52);
      g.strokeRect(wx, wy, ww, wh);
      g.lineStyle(1, ORANGE, 0.18);
      g.lineBetween(wx + ww / 2, wy + 2, wx + ww / 2, wy + wh - 2);
      g.lineBetween(wx + 2, wy + wh / 2, wx + ww - 2, wy + wh / 2);
    });

    // ── Entrance door (double) ───────────────────────────────
    const dX = cx - 34, dY = y + h - 78, dW = 68, dH = 78;
    g.fillStyle(0x060300);
    g.fillRect(dX, dY, dW, dH);
    g.lineStyle(2, ORANGE, 0.85);
    g.strokeRect(dX, dY, dW, dH);
    g.lineStyle(1, ORANGE, 0.4);
    g.lineBetween(cx, dY + 4, cx, dY + dH);
    g.fillStyle(0xffaa44, 0.08);
    g.fillRect(dX, dY, dW, 16);
    g.fillStyle(ORANGE, 0.85);
    g.fillRect(cx - 10, dY + dH / 2 - 3, 4, 7);
    g.fillRect(cx + 6, dY + dH / 2 - 3, 4, 7);
    g.fillStyle(ORANGE, 0.05);
    g.fillRect(dX - 18, dY, dW + 36, dH);

    // ── Awning over entrance ─────────────────────────────────
    const awX = cx - 50, awY = y + h - 88, awW = 100, awH = 10;
    for (let ai = 0; ai < 7; ai++) {
      g.fillStyle(ai % 2 === 0 ? 0xff6b00 : 0x1a0a04, 0.88);
      g.fillRect(awX + ai * Math.ceil(awW / 7), awY, Math.ceil(awW / 7), awH);
    }
    g.lineStyle(1, ORANGE, 0.6);
    g.strokeRect(awX, awY, awW, awH);
    for (let fi = 0; fi < 8; fi++) {
      g.lineStyle(1, ORANGE, 0.35);
      g.lineBetween(awX + 4 + fi * Math.ceil(awW / 8), awY + awH, awX + 4 + fi * Math.ceil(awW / 8), awY + awH + 5);
    }

    // ── Sidewalk menu board ──────────────────────────────────
    const mbX = cx + 50, mbY = y + h - 58;
    g.fillStyle(0x0d1a0d);
    g.fillRect(mbX, mbY, 34, 42);
    g.lineStyle(1, 0x226622, 0.65);
    g.strokeRect(mbX, mbY, 34, 42);
    g.lineStyle(1, 0x552200, 0.7);
    g.lineBetween(mbX + 5, mbY + 42, mbX + 1, mbY + 54);
    g.lineBetween(mbX + 29, mbY + 42, mbX + 33, mbY + 54);
    this.add.text(mbX + 17, mbY + 10, 'MENÚ', { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#44aa44' }).setOrigin(0.5).setDepth(3);
    this.add.text(mbX + 17, mbY + 24, 'DEL', { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#44aa44' }).setOrigin(0.5).setDepth(3);
    this.add.text(mbX + 17, mbY + 36, 'DÍA', { fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#44aa44' }).setOrigin(0.5).setDepth(3);

    // ── Warm ambient ─────────────────────────────────────────
    g.fillStyle(ORANGE, 0.022);
    g.fillRect(x, y, w, h);
  }

  private drawCasinoBuilding() {
    const { x, y, w, h } = BUILDINGS.CASINO;
    const g = this.add.graphics().setDepth(2);
    const GOLD   = COLORS.GOLD;
    const PURPLE = 0x6B21A8;
    const cx = x + w / 2;

    // ── Facade base ─────────────────────────────────────────
    g.fillStyle(COLORS.BUILDING_CASINO);
    g.fillRect(x, y, w, h);
    // Subtle vertical texture
    for (let vx = x + 14; vx < x + w; vx += 14) {
      g.lineStyle(1, 0x0e0028, 0.45);
      g.lineBetween(vx, y, vx, y + h);
    }

    // ── Roof / cornice ───────────────────────────────────────
    g.fillStyle(COLORS.ROOF_DARK);
    g.fillRect(x - 10, y, w + 20, 26);
    g.fillStyle(0x060010);
    g.fillRect(x - 10, y + 24, w + 20, 5);
    g.lineStyle(2, GOLD, 0.5);
    g.lineBetween(x - 10, y + 26, x + w + 10, y + 26);

    // ── Marquee lights along roofline ────────────────────────
    const marqueeColors = [GOLD, 0xFF3A3A, 0x22CC88, GOLD, 0x8B5CF6, 0xFF3A3A, GOLD];
    for (let mi = 0; mi < 20; mi++) {
      const lx = x + 10 + mi * (w / 20);
      const col = marqueeColors[mi % marqueeColors.length];
      g.fillStyle(col, 0.85);
      g.fillCircle(lx, y + 20, 3);
    }
    // Marquee tween (handled via separate graphics for animation)
    const marqueeG = this.add.graphics().setDepth(3);
    let marqueePhase = 0;
    this.time.addEvent({
      delay: 200,
      repeat: -1,
      callback: () => {
        marqueeG.clear();
        for (let mi = 0; mi < 20; mi++) {
          const lx = x + 10 + mi * (w / 20);
          if ((mi + marqueePhase) % 3 === 0) {
            marqueeG.fillStyle(GOLD, 0.9);
            marqueeG.fillCircle(lx, y + 20, 3.5);
          }
        }
        marqueePhase = (marqueePhase + 1) % 3;
      },
    });

    // ── Neon CASINO sign ─────────────────────────────────────
    const sigW = 148, sigH = 22, sigX = cx - sigW / 2, sigY = y + 3;
    g.fillStyle(0x060210);
    g.fillRect(sigX, sigY, sigW, sigH);
    g.lineStyle(2, GOLD, 0.95);
    g.strokeRect(sigX, sigY, sigW, sigH);
    g.fillStyle(GOLD, 0.1);
    g.fillRect(sigX - 4, sigY - 2, sigW + 8, sigH + 4);

    const casinoSign = this.add.text(cx, sigY + sigH / 2, '♠  CASINO  ♠', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3);
    // Colour-cycle tween on sign
    let signHue = 0;
    this.time.addEvent({
      delay: 120,
      repeat: -1,
      callback: () => {
        signHue = (signHue + 6) % 360;
        const hsvColor = Phaser.Display.Color.HSVToRGB(signHue / 360, 1, 1) as Phaser.Types.Display.ColorObject;
        casinoSign.setColor(Phaser.Display.Color.RGBToString(hsvColor.r, hsvColor.g, hsvColor.b));
      },
    });
    this.tweens.add({
      targets: casinoSign,
      alpha: { from: 1, to: 0.6 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ── Windows (2 upper arched, 2 lower arched) ────────────
    [[x + 30, y + 34], [x + 180, y + 34], [x + 260, y + 34], [x + 360, y + 34]].forEach(([wx, wy]) => {
      const ww = 58, wh = 64;
      g.fillStyle(PURPLE, 0.15);
      g.fillRect(wx, wy, ww, wh);
      g.lineStyle(2, PURPLE, 0.65);
      g.strokeRect(wx, wy, ww, wh);
      g.lineStyle(1, GOLD, 0.2);
      g.lineBetween(wx + ww / 2, wy + 2, wx + ww / 2, wy + wh - 2);
      g.lineBetween(wx + 2, wy + wh / 2, wx + ww - 2, wy + wh / 2);
    });
    [[x + 30, y + 122], [x + 360, y + 122]].forEach(([wx, wy]) => {
      const ww = 58, wh = 54;
      g.fillStyle(PURPLE, 0.12);
      g.fillRect(wx, wy, ww, wh);
      g.lineStyle(2, PURPLE, 0.55);
      g.strokeRect(wx, wy, ww, wh);
    });

    // ── Gold column decorations ──────────────────────────────
    [x + 20, x + w - 20].forEach((colX) => {
      g.fillStyle(0x2a1a08);
      g.fillRect(colX - 5, y + 26, 10, h - 26);
      g.lineStyle(1, GOLD, 0.55);
      g.strokeRect(colX - 5, y + 26, 10, h - 26);
      g.fillStyle(GOLD, 0.7);
      g.fillRect(colX - 7, y + 26, 14, 6);
      g.fillRect(colX - 7, y + h - 6, 14, 6);
    });

    // ── Entrance (wide double doors) ─────────────────────────
    const dX = cx - 40, dY = y + h - 82, dW = 80, dH = 82;
    g.fillStyle(0x040008);
    g.fillRect(dX, dY, dW, dH);
    g.lineStyle(2, GOLD, 0.9);
    g.strokeRect(dX, dY, dW, dH);
    g.lineStyle(1, GOLD, 0.4);
    g.lineBetween(cx, dY + 4, cx, dY + dH);
    // Arch top
    g.fillStyle(GOLD, 0.12);
    g.fillRect(dX, dY, dW, 18);
    // Door handles
    g.fillStyle(GOLD, 0.9);
    g.fillRect(cx - 12, dY + dH / 2 - 3, 4, 7);
    g.fillRect(cx + 8, dY + dH / 2 - 3, 4, 7);
    // "OPEN 24/7" mini sign above door
    this.add.text(cx, dY - 10, '★ OPEN 24/7 ★', {
      fontSize: '5px', fontFamily: '"Press Start 2P", monospace', color: '#F5C842',
    }).setOrigin(0.5).setDepth(3);
    // Glow
    g.fillStyle(GOLD, 0.04);
    g.fillRect(dX - 16, dY, dW + 32, dH);

    // ── Gold/purple awning ───────────────────────────────────
    const awX = cx - 52, awY = y + h - 94, awW = 104, awH = 12;
    for (let ai = 0; ai < 8; ai++) {
      g.fillStyle(ai % 2 === 0 ? GOLD : 0x2a0060, 0.88);
      g.fillRect(awX + ai * Math.ceil(awW / 8), awY, Math.ceil(awW / 8), awH);
    }
    g.lineStyle(1, GOLD, 0.7);
    g.strokeRect(awX, awY, awW, awH);
    for (let fi = 0; fi < 9; fi++) {
      g.lineStyle(1, GOLD, 0.4);
      g.lineBetween(awX + fi * Math.ceil(awW / 9), awY + awH, awX + fi * Math.ceil(awW / 9), awY + awH + 6);
    }

    // ── Card suit symbols on facade ──────────────────────────
    ['♠', '♥', '♣', '♦'].forEach((suit, i) => {
      this.add.text(x + 110 + i * 60, y + 152, suit, {
        fontSize: '18px', fontFamily: 'serif',
        color: i % 2 === 0 ? '#3a2a6a' : '#5a1a1a',
      }).setOrigin(0.5).setDepth(3);
    });

    // ── Warm gold ambient ────────────────────────────────────
    g.fillStyle(GOLD, 0.018);
    g.fillRect(x, y, w, h);
  }

  private drawHouse() {
    const { x, y, w, h } = BUILDINGS.HOUSE;
    const g = this.add.graphics().setDepth(2);

    g.fillStyle(0x15111c);
    g.fillRect(x, y, w, h);

    // Roof
    g.fillStyle(0x08070f);
    g.fillRect(x - 5, y, w + 10, 20);

    // Preserved concrete side walls
    [[x + 52, y + 34], [x + w - 102, y + 34]].forEach(([wx, wy]) => {
      g.fillStyle(0x251d30, 1);
      g.fillRect(wx, wy, 50, 90);
      g.lineStyle(1.5, 0x5a496e, 0.75);
      g.strokeRect(wx, wy, 50, 90);
    });

    // Central stairwell opening
    g.fillStyle(0x090811, 1);
    g.fillRoundedRect(x + w / 2 - 56, y + 42, 112, 126, 10);
    g.lineStyle(2, 0xB48BFF, 0.9);
    g.strokeRoundedRect(x + w / 2 - 56, y + 42, 112, 126, 10);

    // Entry platform
    g.fillStyle(0x1b1624, 1);
    g.fillRect(x + w / 2 - 86, y + 160, 172, 16);
    g.lineStyle(1.5, 0x3a304a, 0.8);
    g.strokeRect(x + w / 2 - 86, y + 160, 172, 16);

    // Descending steps
    g.fillStyle(0x2c2438, 1);
    for (let i = 0; i < 6; i++) {
      g.fillRect(x + w / 2 - 36 + i * 3, y + 72 + i * 13, 72 - i * 6, 8);
    }

    // Stair rails
    g.lineStyle(3, 0x6e6f88, 0.95);
    g.lineBetween(x + w / 2 - 76, y + 158, x + w / 2 - 44, y + 82);
    g.lineBetween(x + w / 2 + 76, y + 158, x + w / 2 + 44, y + 82);
    g.lineStyle(2, 0x8588a5, 0.8);
    g.lineBetween(x + w / 2 - 70, y + 142, x + w / 2 - 40, y + 92);
    g.lineBetween(x + w / 2 + 70, y + 142, x + w / 2 + 40, y + 92);

    // Security gate and threshold
    g.fillStyle(0x050508);
    g.fillRect(x + w / 2 - 28, y + h - 64, 56, 64);
    g.lineStyle(2, 0x5a496e, 0.85);
    g.strokeRect(x + w / 2 - 28, y + h - 64, 56, 64);
    g.lineStyle(1.5, 0x7b6f93, 0.55);
    for (let i = -18; i <= 18; i += 12) {
      g.lineBetween(x + w / 2 + i, y + h - 60, x + w / 2 + i, y + h - 6);
    }
    g.fillStyle(COLORS.GOLD);
    g.fillCircle(x + w / 2 + 12, y + h - 32, 3);

    // Hazard strips on platform
    g.fillStyle(0x2a2220, 1);
    g.fillRect(x + w / 2 - 90, y + 176, 180, 10);
    for (let i = 0; i < 8; i++) {
      g.fillStyle(i % 2 === 0 ? 0xF5C842 : 0x111111, 1);
      g.fillRect(x + w / 2 - 88 + i * 22, y + 177, 18, 8);
    }

    // Warning lights
    [
      [x + w / 2 - 102, y + 54],
      [x + w / 2 + 102, y + 54],
    ].forEach(([lx, ly]) => {
      g.fillStyle(0xff5577, 0.16);
      g.fillCircle(lx, ly, 22);
      g.fillStyle(0xff5577, 0.32);
      g.fillCircle(lx, ly, 12);
      g.fillStyle(0xff8899, 1);
      g.fillCircle(lx, ly, 5);
    });

    // Side signage panels
    g.fillStyle(0x0c0b11, 1);
    g.fillRoundedRect(x + 18, y + 148, 96, 32, 6);
    g.fillRoundedRect(x + w - 114, y + 148, 96, 32, 6);
    g.lineStyle(1.5, 0x4b3e60, 0.8);
    g.strokeRoundedRect(x + 18, y + 148, 96, 32, 6);
    g.strokeRoundedRect(x + w - 114, y + 148, 96, 32, 6);

    this.add.text(x + 66, y + 164, 'ACCESS', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3);

    this.add.text(x + w - 66, y + 164, 'B-01', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#D4BCFF',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3);

    this.add.text(x + w/2, y + 10, 'STAIRWAYS', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#D4BCFF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3);

    this.add.text(x + w/2, y + 32, 'TO BASEMENT', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3);
  }

  // ─── CAMARA DEL TIEMPO ───────────────────────────────────────────────────

  private drawCamaraDelTiempo() {
    const { CAMARA_X: cx, CAMARA_Y: cy, CAMARA_R: r } = ZONES;
    const g = this.add.graphics().setDepth(4);

    // Outer ring — deep purple aura
    g.lineStyle(6, 0x6a0dad, 0.35);
    g.strokeCircle(cx, cy, r + 14);

    // Floor circle
    g.fillStyle(0x0d001a, 0.92);
    g.fillCircle(cx, cy, r);

    // Inner ring
    g.lineStyle(3, 0x9c27b0, 0.8);
    g.strokeCircle(cx, cy, r);

    // Second ring
    g.lineStyle(1.5, 0xB388FF, 0.5);
    g.strokeCircle(cx, cy, r - 18);

    // Rune lines (8 spoke marks)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const inner = r - 28;
      const outer = r - 6;
      g.lineStyle(1.5, 0xB388FF, 0.4);
      g.lineBetween(
        cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner,
        cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer,
      );
    }

    // Center glow orb
    g.fillStyle(0x6a0dad, 0.6);
    g.fillCircle(cx, cy, 14);
    g.fillStyle(0xce93d8, 0.8);
    g.fillCircle(cx, cy, 7);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(cx, cy, 3);

    // Title label
    this.add.text(cx, cy - r - 20, 'CAMARA DEL TIEMPO', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B388FF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(9000);

    this.add.text(cx, cy - r - 8, 'quedate quieto y acumulá TENKS', {
      fontSize: '6px',
      fontFamily: '"Silkscreen", monospace',
      color: '#7c4dff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(9000);

    // ── Directional guide on the south sidewalk ────────────────────────────
    // Sits between the Cafe and Casino buildings so players walking east spot it.
    const signX = 2490;
    const signY = ZONES.SOUTH_SIDEWALK_Y + 40; // mid-south-sidewalk
    const sg = this.add.graphics().setDepth(4);
    // Post
    sg.fillStyle(0x3a1e6e, 1);
    sg.fillRect(signX - 2, signY - 22, 4, 50);
    // Board background
    sg.fillStyle(0x0d001a, 0.95);
    sg.fillRoundedRect(signX - 56, signY - 48, 112, 26, 6);
    sg.lineStyle(1.5, 0x7c4dff, 0.85);
    sg.strokeRoundedRect(signX - 56, signY - 48, 112, 26, 6);
    // Down arrow
    sg.fillStyle(0xb388ff, 0.9);
    sg.fillTriangle(signX - 8, signY + 30, signX + 8, signY + 30, signX, signY + 44);
    sg.fillRect(signX - 3, signY + 10, 6, 20);
    this.add.text(signX, signY - 35, 'CAMARA DEL TIEMPO', {
      fontSize: '5px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B388FF',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(9001);

    // Pulsing aura (animated graphics layer)
    const auraG = this.add.graphics().setDepth(3);
    let auraPhase = 0;
    this.time.addEvent({
      delay: 60,
      loop: true,
      callback: () => {
        auraPhase += 0.06;
        auraG.clear();
        const a = 0.06 + Math.abs(Math.sin(auraPhase)) * 0.1;
        auraG.fillStyle(0x9c27b0, a);
        auraG.fillCircle(cx, cy, r - 4);
        // Orbiting particle
        const ox = cx + Math.cos(auraPhase * 0.7) * (r - 22);
        const oy = cy + Math.sin(auraPhase * 0.7) * (r - 22);
        auraG.fillStyle(0xce93d8, 0.85);
        auraG.fillCircle(ox, oy, 3);
        // Second particle (opposite)
        const ox2 = cx + Math.cos(auraPhase * 0.7 + Math.PI) * (r - 22);
        const oy2 = cy + Math.sin(auraPhase * 0.7 + Math.PI) * (r - 22);
        auraG.fillStyle(0xce93d8, 0.6);
        auraG.fillCircle(ox2, oy2, 2);
      },
    });
  }

  private updateCamaraDelTiempo(delta: number) {
    const { CAMARA_X: cx, CAMARA_Y: cy, CAMARA_R: r } = ZONES;
    const dx = this.px - cx;
    const dy = this.py - cy;
    const inside = Math.sqrt(dx * dx + dy * dy) < r;

    if (inside !== this.inCamara) {
      this.inCamara = inside;
      if (!inside) {
        // Reset timer on exit
        this.camaraTimer = 0;
        this.camaraHud?.setAlpha(0);
      } else {
        this.showArenaNotice('CAMARA DEL TIEMPO', '#B388FF');
      }
    }

    if (!inside) return;

    this.camaraTimer += delta;
    const progress = Math.min(this.camaraTimer / this.camaraTickMs, 1);
    const secsLeft = Math.ceil((this.camaraTickMs - this.camaraTimer) / 1000);

    // Show HUD
    if (this.camaraHud) {
      const cam = this.cameras.main;
      this.camaraHud.setPosition(cam.width / 2, cam.height - 52);
      this.camaraHud.setOrigin(0.5, 1);
      this.camaraHud.setText(`⏳ TENKS en ${secsLeft}s  [${'█'.repeat(Math.floor(progress * 10))}${'░'.repeat(10 - Math.floor(progress * 10))}]`);
      this.camaraHud.setAlpha(1);
    }

    if (this.camaraTimer >= this.camaraTickMs) {
      this.camaraTimer = 0;
      addTenks(this.camaraTenksPerTick, 'camara_del_tiempo');
      this.showArenaNotice(`+${this.camaraTenksPerTick} TENKS`, '#B388FF');
    }
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

  /** Floating ambient dust/firefly particles — neon dots that drift slowly across the world */
  private setupAmbientParticles() {
    // Spread across the world in clusters near active areas
    const spawnAreas = [
      { x: 0,    y: ZONES.PLAZA_Y,  w: WORLD.WIDTH, h: WORLD.HEIGHT - ZONES.PLAZA_Y },  // lower world / plaza
      { x: 0,    y: ZONES.STREET_Y, w: WORLD.WIDTH / 2, h: 200 },                         // street left half
    ];
    const neonColors = [0x46B3FF, 0x39FF14, 0xFF006E, 0xF5C842, 0xB388FF];

    spawnAreas.forEach(({ x, y, w, h }) => {
      const count = Math.floor((w * h) / 40000); // density ~1 per 40k px²
      for (let i = 0; i < Math.min(count, 18); i++) {
        const px = x + Phaser.Math.Between(0, w);
        const py = y + Phaser.Math.Between(0, h);
        const color = neonColors[Math.floor(Math.random() * neonColors.length)];
        const r = Phaser.Math.Between(1, 2);
        const particle = this.add.circle(px, py, r, color, Phaser.Math.FloatBetween(0.08, 0.25))
          .setDepth(0.5);

        // Slow drift tween — each particle moves independently
        this.tweens.add({
          targets: particle,
          x: px + Phaser.Math.Between(-50, 50),
          y: py + Phaser.Math.Between(-35, 35),
          alpha: { from: particle.fillAlpha, to: 0 },
          duration: Phaser.Math.Between(4000, 9000),
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
          delay: Phaser.Math.Between(0, 6000),
        });
      }
    });
  }

  private spawnAmbientNPCs() {
    // Non-interactive decorative NPCs that wander
    const npcConfigs: AvatarConfig[] = [
      { bodyColor: 0xD4A574, hairColor: 0x1A0A00, topColor: 0x553322, bottomColor: 0x221122 },
      { bodyColor: 0xE8C49A, hairColor: 0x000000, topColor: 0x222255, bottomColor: 0x111133 },
      { bodyColor: 0xC17A4A, hairColor: 0x220000, topColor: 0x334422, bottomColor: 0x1A2211 },
    ];

    const npcPositions = [
      { x: 180, y: 1090 }, { x: 620, y: 1240 }, { x: 600, y: 750 }, { x: 2000, y: 720 }, { x: 1000, y: 780 },
    ];

    npcPositions.forEach((pos, i) => {
      const cfg = npcConfigs[i % npcConfigs.length];
      const npc = this.createSafeAvatarRenderer(pos.x, pos.y, cfg, `ambient-npc:${i}`);
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

  // ─── Gun Dealer NPC ──────────────────────────────────────────────────────────

  private spawnGunDealerNPC() {
    const { x, y } = this.getGunDealerPosition();
    const cfg: AvatarConfig = {
      bodyColor: 0xC17A4A,
      hairColor: 0x000000,
      topColor: 0x1a1a2e,
      bottomColor: 0x0d0d1a,
    };
    this.gunDealerAvatar = this.createSafeAvatarRenderer(x, y, cfg, 'gun-dealer');
    this.gunDealerAvatar.setDepth(Math.floor(y / 10));

    // Subtle idle sway
    this.tweens.add({
      targets: this.gunDealerAvatar.getContainer(),
      y: y + 4,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.gunDealerAvatar?.update(false, 0),
    });

    // Nameplate
    this.add.text(x, y - 52, 'ARMS DEALER', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6B35',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(9000);
  }

  private openGunDealerDialog() {
    if (this.gunShopOpen) return;
    this.inputBlocked = true;
    this.gunDealerDialog = new DialogSystem(this);
    const lines = [
      'DEALER: Psst... Buscás algo serio?',
      'DEALER: Tengo fierros de primera. Pagás en TENKS.',
      'DEALER: Nada de preguntas, nada de problemas.',
    ];
    this.gunDealerDialog.start(lines, {}, () => {
      this.gunDealerDialog = null;
      this.openGunShopPanel();
    });
  }

  // ─── COTTENKS NPC ────────────────────────────────────────────────────────

  private spawnCottenksNPC() {
    const x = 1615;
    const y = 558;

    // Nameplate (always visible regardless of texture state)
    this.add.text(x, y - 98, 'COTTENKS', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(9000);

    this.add.text(x, y - 86, 'the og', {
      fontSize: '6px',
      fontFamily: '"Silkscreen", monospace',
      color: '#AAAAAA',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(9000);

    // Quest marker — only shown until the player talks to COTTENKS for the first time
    if (typeof localStorage !== 'undefined' && !localStorage.getItem('waspi_cottenks_met')) {
      const questMarker = this.add.text(x, y - 60, '!', {
        fontSize: '18px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#F5C842',
        stroke: '#0E0E14',
        strokeThickness: 4,
      }).setOrigin(0.5).setDepth(10);

      this.tweens.add({
        targets: questMarker,
        y: y - 68,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      this.cottenksQuestMarker = questMarker;
    }

    const buildSprite = () => {
      const sprite = this.add.image(x, y, 'cottenks');
      const targetH = 90;
      const scale = sprite.height > 0 ? targetH / sprite.height : 0.2;
      sprite.setScale(scale);
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(Math.floor(y / 10));

      this.tweens.add({
        targets: sprite,
        y: y + 4,
        scaleY: scale * 0.97,
        duration: 1800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    };

    if (this.textures.exists('cottenks')) {
      buildSprite();
    } else {
      this.load.image('cottenks', '/assets/sprites/cottenks.png');
      this.load.once('complete', buildSprite);
      this.load.start();
    }
  }

  private openCottenksDialog() {
    if (this.cottenksDialog?.isActive()) return;
    this.inputBlocked = true;
    recordNpcTalk();

    // ── Terminal leaves ──────────────────────────────────────────────────────

    const dismissCottenksMarker = () => {
      if (this.cottenksQuestMarker) {
        this.cottenksQuestMarker.destroy();
        this.cottenksQuestMarker = undefined;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('waspi_cottenks_met', 'true');
      }
    };

    const endBye: DialogNode = {
      lines: ['COTTENKS: Dale, seguí tu camino. Los TENKS no se ganan parado.'],
      onComplete: () => { dismissCottenksMarker(); this.cottenksDialog = null; this.inputBlocked = false; },
    };

    const endStoreGo: DialogNode = {
      lines: ['COTTENKS: Entrá. No te arrepentís.'],
      onComplete: () => {
        dismissCottenksMarker();
        this.cottenksDialog = null;
        this.inputBlocked = false;
        // Teleport player to store door and trigger entry
        this.transitionToScene('StoreInterior');
      },
    };

    // ── Branch: ¿Cómo gano TENKS? ────────────────────────────────────────────

    const branchHowToEarn: DialogNode = {
      lines: [
        'COTTENKS: Simple: participá.',
        'COTTENKS: El Arcade paga. Las compras pagan. El chat paga.',
        'COTTENKS: El mundo te mira. Cuanto más presente estás, más TENKS ganás.',
      ],
      choices: [
        { label: 'Voy a intentarlo.', next: endBye },
      ],
    };

    // ── Branch: ¿Qué son los TENKS? ──────────────────────────────────────────

    const branchWhatAreTenks: DialogNode = {
      lines: [
        'COTTENKS: Los TENKS son la moneda del mundo WASPI.',
        'COTTENKS: No se compran con plata. Se ganan con presencia.',
        'COTTENKS: Sirven para votar drops, desbloquear zonas y conseguir descuentos.',
      ],
      choices: [
        { label: '¿Cómo consigo más?', next: branchHowToEarn },
        { label: 'Entendido.', next: endBye },
      ],
    };

    // ── Branch: ¿Qué hay en la tienda? ───────────────────────────────────────

    const branchStore: DialogNode = {
      lines: [
        'COTTENKS: La WASPI STORE. Ropa de verdad, envío a tu casa.',
        'COTTENKS: Pagás con plata real. Pero si tenés TENKS, conseguís descuento.',
        'COTTENKS: No hay excusas para no tener el look.',
      ],
      choices: [
        { label: 'Quiero entrar.', next: endStoreGo },
        { label: 'Gracias, después entro.', next: endBye },
      ],
    };

    // ── Branch: ¿Quién sos? ───────────────────────────────────────────────────

    const branchWhoAreYou: DialogNode = {
      lines: [
        'COTTENKS: El fundador. El OG. El que le dio nombre a la moneda.',
        'COTTENKS: Sin mí, no hay TENKS. Sin TENKS, no hay mundo.',
        'COTTENKS: No es ego — es historia.',
      ],
      choices: [
        { label: '¿Y para qué sirven los TENKS?', next: branchWhatAreTenks },
        { label: '¿Qué hay en esa tienda?', next: branchStore },
        { label: 'Ok, entendido.', next: endBye },
      ],
    };

    // ── Root node ────────────────────────────────────────────────────────────

    const root: DialogNode = {
      lines: [
        'COTTENKS: Ey... ey vos. Sí, vos.',
        'COTTENKS: Soy COTTENKS. Los TENKS de este mundo llevan mi nombre.',
      ],
      choices: [
        { label: '¿Quién sos vos?', next: branchWhoAreYou },
        { label: '¿Qué son los TENKS?', next: branchWhatAreTenks },
        { label: '¿Qué hay en esa tienda?', next: branchStore },
        { label: 'Nada, sigo de largo.', next: endBye },
      ],
    };

    this.cottenksDialog = new BranchedDialog(this);
    this.cottenksDialog.start(root);
  }

  private openGunShopPanel() {
    // Legacy fallback: gun shop now lives in its own interior scene.
    // If any old path still calls this method, redirect to the new scene.
    if (!this.inTransition) {
      this.transitionToScene('GunShopInterior');
    }
    return;

    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const pw = 580;
    const ph = 380;
    const px = cx - pw / 2;
    const py = cy - ph / 2;

    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(11000);
    this.gunShopPanel = container;

    // Full-screen dark overlay
    const overlay = this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.72).setScrollFactor(0);
    container.add(overlay);

    // Panel background
    const bg = this.add.graphics().setScrollFactor(0);
    bg.fillStyle(0x0d0d1a, 0.98);
    bg.fillRoundedRect(px, py, pw, ph, 12);
    bg.lineStyle(2, 0xFF6B35, 1);
    bg.strokeRoundedRect(px, py, pw, ph, 12);
    container.add(bg);

    // Title
    const title = this.add.text(cx, py + 24, 'ARMS DEALER', {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6B35',
    }).setOrigin(0.5, 0.5).setScrollFactor(0);
    container.add(title);

    // Subtitle / balance
    const balance = getTenksBalance();
    const balText = this.add.text(cx, py + 46, `TENKS: ${balance.toLocaleString('es-AR')}`, {
      fontSize: '8px',
      fontFamily: '"Silkscreen", monospace',
      color: '#F5C842',
    }).setOrigin(0.5, 0.5).setScrollFactor(0);
    container.add(balText);

    // Divider
    const div = this.add.graphics().setScrollFactor(0);
    div.lineStyle(1, 0xFF6B35, 0.4);
    div.lineBetween(px + 20, py + 60, px + pw - 20, py + 60);
    container.add(div);

    // Gun items from catalog (scrollable)
    const gunItems = CATALOG.filter(i => i.id.startsWith('UTIL-GUN'));
    const listY = py + 70;
    const listX = px;
    const listW = pw;
    const listH = ph - (listY - py) - 18; // leave a bit of bottom breathing room
    const listPad = 10;

    const scrollArea = createScrollArea(this, {
      x: listX,
      y: listY,
      w: listW,
      h: listH,
      mount: container,
      step: 34,
      scrollbar: { depth: 11001, insetRight: 16, insetY: 10 },
    });

    gunItems.forEach((item, idx) => {
      const rowY = listY + listPad + idx * 72;
      this.buildGunShopRow(scrollArea.content, px, rowY, pw, item, balText);
    });

    // Close button
    const closeBtn = this.add.text(px + pw - 16, py + 14, '✕', {
      fontSize: '14px',
      fontFamily: '"Silkscreen", monospace',
      color: '#FF4455',
    }).setOrigin(1, 0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeGunShopPanel());
    closeBtn.on('pointerover', () => closeBtn.setColor('#FF8888'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#FF4455'));
    container.add(closeBtn);

    // Also close on SPACE/ESC (next press)
    this.input.keyboard
      ?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
      ?.once('down', () => this.closeGunShopPanel());
  }

  private buildGunShopRow(
    container: Phaser.GameObjects.Container,
    panelX: number,
    rowY: number,
    panelW: number,
    item: (typeof CATALOG)[0],
    balText: Phaser.GameObjects.Text,
  ) {
    const owned = getInventory().owned.includes(item.id);
    const comingSoon = !!item.comingSoon;

    // Row bg
    const rowBg = this.add.graphics().setScrollFactor(0);
    rowBg.fillStyle(0x1a1a2e, owned ? 0.4 : comingSoon ? 0.25 : 0.7);
    rowBg.fillRoundedRect(panelX + 16, rowY, panelW - 32, 60, 6);
    rowBg.lineStyle(1, owned ? 0x39FF14 : comingSoon ? 0x666688 : 0xFF6B35, 0.5);
    rowBg.strokeRoundedRect(panelX + 16, rowY, panelW - 32, 60, 6);
    container.add(rowBg);

    // Item name
    const nameText = this.add.text(panelX + 32, rowY + 14, item.name + (item.isLimited ? ' ★' : ''), {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: comingSoon ? '#777799' : item.isLimited ? '#F5C842' : '#FFFFFF',
    }).setScrollFactor(0);
    container.add(nameText);

    // Description
    const descText = this.add.text(panelX + 32, rowY + 30, item.description ?? '', {
      fontSize: '7px',
      fontFamily: '"Silkscreen", monospace',
      color: comingSoon ? '#666688' : '#9999BB',
    }).setScrollFactor(0);
    container.add(descText);

    // Price
    const priceText = this.add.text(panelX + panelW - 160, rowY + 20, `${item.priceTenks.toLocaleString('es-AR')} T`, {
      fontSize: '9px',
      fontFamily: '"Silkscreen", monospace',
      color: comingSoon ? '#666688' : '#F5C842',
    }).setOrigin(0, 0.5).setScrollFactor(0);
    container.add(priceText);

    if (comingSoon) {
      const soonLabel = this.add.text(panelX + panelW - 50, rowY + 30, 'SOON', {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#666688',
      }).setOrigin(0.5, 0.5).setScrollFactor(0);
      container.add(soonLabel);
      return;
    }

    if (owned) {
      const ownedLabel = this.add.text(panelX + panelW - 50, rowY + 30, 'OWNED', {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#39FF14',
      }).setOrigin(0.5, 0.5).setScrollFactor(0);
      container.add(ownedLabel);
    } else {
      const buyBtn = this.add.text(panelX + panelW - 50, rowY + 30, 'COMPRAR', {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#FF6B35',
        backgroundColor: '#1a0a00',
        padding: { x: 6, y: 4 },
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

      buyBtn.on('pointerover', () => buyBtn.setColor('#FFAA77'));
      buyBtn.on('pointerout', () => buyBtn.setColor('#FF6B35'));
      buyBtn.on('pointerdown', () => {
        buyBtn.setText('...').setColor('#888888').disableInteractive();
        this.buyGunItem(item.id, item.priceTenks).then(result => {
          if (!isLiveGameObject(buyBtn)) return;
          if (result.success) {
            buyBtn.setText('✓ LISTO').setColor('#39FF14');
            rowBg.clear();
            rowBg.fillStyle(0x1a1a2e, 0.4);
            rowBg.fillRoundedRect(panelX + 16, rowY, panelW - 32, 60, 6);
            rowBg.lineStyle(1, 0x39FF14, 0.5);
            rowBg.strokeRoundedRect(panelX + 16, rowY, panelW - 32, 60, 6);
            // Update balance display
            balText.setText(`TENKS: ${getTenksBalance().toLocaleString('es-AR')}`);
          } else {
            buyBtn.setText('ERROR').setColor('#FF4455');
            eventBus.emit(EVENTS.UI_NOTICE, result.message);
            this.time.delayedCall(1500, () => {
              if (!isLiveGameObject(buyBtn)) return;
              buyBtn.setText('COMPRAR').setColor('#FF6B35').setInteractive({ useHandCursor: true });
            });
          }
        });
      });
      container.add(buyBtn);
    }
  }

  private closeGunShopPanel() {
    if (!this.gunShopOpen) return;
    this.gunShopPanel?.destroy(true);
    this.gunShopPanel = null;
    this.gunShopOpen = false;
    this.inputBlocked = false;
  }

  private async buyGunItem(itemId: string, priceTenks: number): Promise<{ success: boolean; message: string }> {
    const item = getItem(itemId);
    if (item?.comingSoon) {
      return { success: false, message: 'Ese arma todavía no está implementada.' };
    }

    const balance = getTenksBalance();
    if (balance < priceTenks) {
      return { success: false, message: `Necesitás ${priceTenks.toLocaleString('es-AR')} TENKS.` };
    }

    if (!supabase || !isConfigured) {
      // Dev/offline mode: grant + equip locally
      ownItem(itemId);
      ensureItemEquipped(itemId); // idempotent equip for utilities
      addTenks(-priceTenks, `gun_shop_${itemId.toLowerCase()}`);
      return { success: true, message: `${itemId} equipado (modo offline).` };
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      return { success: false, message: 'Tenés que estar logueado para comprar.' };
    }

    const res = await fetch('/api/shop/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ itemId }),
    }).catch(() => null);

    if (!res?.ok) {
      const err = await res?.json().catch(() => null) as { error?: string } | null;
      return { success: false, message: err?.error ?? 'Error al comprar. Intentá de nuevo.' };
    }

    const result = await res.json() as { player?: { tenks?: number; inventory?: { owned: string[]; equipped: Record<string, unknown> } }; notice?: string };

    // Sync full inventory from server if available, otherwise grant+equip locally
    if (result.player?.inventory) {
      replaceInventory(result.player.inventory as Parameters<typeof replaceInventory>[0]);
    } else {
      ownItem(itemId);
    }
    // Always equip utility items so they take effect immediately
    ensureItemEquipped(itemId); // idempotent equip for utilities
    if (typeof result.player?.tenks === 'number') {
      initTenks(result.player.tenks, { preferStored: false });
    }
    return { success: true, message: result.notice ?? `${itemId} comprado!` };
  }

  // ─── Player & Input ──────────────────────────────────────────────────────────

  private handleMovement(delta: number) {
    if (this.inputBlocked) {
      this.lastIsMoving = false;
      this.lastMoveDx = 0;
      this.lastMoveDy = 0;
      return;
    }

    const isSprinting = !!(this.shiftKey?.isDown) && !this.inputBlocked;
    const speed = PLAYER.SPEED * (isSprinting ? 2 : 1) * (delta / 1000);
    let { dx, dy } = this.controls.readMovement(true);

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
    this.lastMoveDy = dy;
    const newX = Phaser.Math.Clamp(this.px + dx * speed, 20, WORLD.WIDTH - 20);
    const newY = Phaser.Math.Clamp(this.py + dy * speed, 20, WORLD.HEIGHT - 20);

    let finalX = newX;
    let finalY = newY;

    // ── Hard north cap: nothing navigable above the building tops ─────────────
    finalY = Math.max(finalY, ZONES.BUILDING_TOP + 4);

    // ── Hard south cap: nothing navigable below training zone bottom ──────────
    const MAP_SOUTH = ZONES.TRAINING_Y + ZONES.TRAINING_H + 80;
    finalY = Math.min(finalY, MAP_SOUTH);

    // ── Building facade collision ─────────────────────────────────────────────
    // Doors are at the horizontal center of each building (±60px tolerance)
    const DOOR_TOLERANCE = 60;
    const doorXs = [
      BUILDINGS.ARCADE.x + BUILDINGS.ARCADE.w / 2,
      BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2,
      BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2,
      BUILDINGS.CASINO.x + BUILDINGS.CASINO.w / 2,
    ];

    const streetBuildings = [BUILDINGS.ARCADE, BUILDINGS.STORE, BUILDINGS.CAFE, BUILDINGS.CASINO];
    for (const b of streetBuildings) {
      const inBuildingXRange = finalX > b.x + 8 && finalX < b.x + b.w - 8;
      const facadeY = b.y + b.h; // bottom edge of building = the facade wall

      // Block walking INTO the facade (approaching from below)
      if (inBuildingXRange && finalY < facadeY && this.py >= facadeY) {
        const nearDoor = doorXs.some(doorX => Math.abs(finalX - doorX) < DOOR_TOLERANCE);
        if (!nearDoor) {
          finalY = facadeY;
        }
      }

      // Block walking through LEFT side of building
      const playerInBuildingY = finalY < facadeY && finalY > b.y;
      if (playerInBuildingY && finalX > b.x - 8 && finalX < b.x + 8) {
        finalX = this.px; // bounce back
        // Corner fix: if near top/bottom edge of building, push Y out to avoid sticky corner
        const distToTop = finalY - b.y;
        const distToBottom = facadeY - finalY;
        if (distToTop < 24) {
          finalY = b.y - 1;
        } else if (distToBottom < 24) {
          finalY = facadeY + 1;
        }
      }

      // Block walking through RIGHT side of building
      const rightEdge = b.x + b.w;
      if (playerInBuildingY && finalX > rightEdge - 8 && finalX < rightEdge + 8) {
        finalX = this.px; // bounce back
        // Corner fix: if near top/bottom edge of building, push Y out to avoid sticky corner
        const distToTop = finalY - b.y;
        const distToBottom = facadeY - finalY;
        if (distToTop < 24) {
          finalY = b.y - 1;
        } else if (distToBottom < 24) {
          finalY = facadeY + 1;
        }
      }
    }

    // ── HOUSE collision (south zone) ──────────────────────────────────────────
    {
      const b = BUILDINGS.HOUSE;
      const inX = finalX > b.x + 8 && finalX < b.x + b.w - 8;
      const inY = finalY > b.y - 8 && finalY < b.y + b.h + 8;
      if (inX && inY) {
        // Push player out of house bounds (it has no door in WorldScene)
        const overlapLeft = finalX - b.x;
        const overlapRight = (b.x + b.w) - finalX;
        if (overlapLeft < overlapRight) finalX = b.x - 8;
        else finalX = b.x + b.w + 8;
      }
    }

    const movedDist = Math.sqrt((finalX - this.px) ** 2 + (finalY - this.py) ** 2);
    if (movedDist > 0.5) recordDistanceDelta(movedDist);

    this.px = finalX;
    this.py = finalY;

    const facingDx = isMoving ? dx : (this.gunEnabled ? Math.cos(this.weaponAimAngle) : dx);
    const facingDy = isMoving ? dy : (this.gunEnabled ? Math.sin(this.weaponAimAngle) : dy);
    this.playerAvatar.update(isMoving, facingDx, facingDy);
    this.playerAvatar.setPosition(this.px, this.py);
    this.playerAvatar.setDepth(Math.floor(this.py / 10));

    this.playerBody.setPosition(this.px, this.py);
    this.playerNameplate.setPosition(this.px, this.py - 46);
    this.chatSystem.updatePosition('__player__', this.px, this.py);
  }

  private safeResetToPlaza() {
    this.inTransition = false;
    this.inputBlocked = false;
    this.hp = 100;
    this.px = SAFE_PLAZA_RETURN.X;
    this.py = SAFE_PLAZA_RETURN.Y;
    this.lastIsMoving = false;
    this.lastMoveDx = 0;
    this.lastMoveDy = 0;
    this.lastDamageAt = 0;
    this.playerAvatar.clearActionState();
    this.playerAvatar.setPosition(this.px, this.py);
    this.playerAvatar.setDepth(Math.floor(this.py / 10));
    this.playerNameplate.setPosition(this.px, this.py - 40);
    this.playerBody.setPosition(this.px, this.py);
    this.playerHitbox.setPosition(this.px, this.py);
    this.playerHitbox.body.updateFromGameObject();
    this.cameras.main.stopFollow();
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.centerOn(this.px, this.py);
    this.cameras.main.startFollow(this.playerBody, true, 0.12, 0.12);
    this.renderHpHud();
    this.showArenaNotice('VOLVISTE A LA PLAZA', '#F5C842');
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
    this.touchPointerDownHandler = (p: Phaser.Input.Pointer) => {
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
    };
    this.input.on('pointerdown', this.touchPointerDownHandler);

    this.touchPointerMoveHandler = (p: Phaser.Input.Pointer) => {
      if (!this.touchMoveActive) return;
      const dx = p.x - this.touchStartX;
      const dy = p.y - this.touchStartY;
      const max = 44;
      if (Math.hypot(dx, dy) < 8) {
        this.touchDx = 0;
        this.touchDy = 0;
        if (this.joyKnob) {
          this.joyKnob.setPosition(this.touchStartX, this.touchStartY);
        }
        return;
      }
      const len = Math.min(max, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx);
      const nx = (len / max) * Math.cos(ang);
      const ny = (len / max) * Math.sin(ang);
      this.touchDx = Phaser.Math.Clamp(nx, -1, 1);
      this.touchDy = Phaser.Math.Clamp(ny, -1, 1);
      if (this.joyKnob) {
        this.joyKnob.setPosition(this.touchStartX + this.touchDx * max, this.touchStartY + this.touchDy * max);
      }
    };
    this.input.on('pointermove', this.touchPointerMoveHandler);

    this.touchPointerEndHandler = () => {
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
    this.input.on('pointerup', this.touchPointerEndHandler);
    this.input.on('pointerupoutside', this.touchPointerEndHandler);
  }

  // ─── Realtime / Multiplayer ──────────────────────────────────────────────────

  private setupRealtime(): 'multiplayer' | 'solo' {
    if (!supabase || !isConfigured) {
      console.log('[Waspi] Supabase not configured — solo mode');
      return 'solo';
    }

    this.channel = supabase.channel('waspi-world', {
      config: {
        broadcast: { self: false },
        presence: { key: this.playerId },
      },
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
      .on('broadcast', { event: 'vecindad:update' }, ({ payload }) => {
        this.handleRemoteVecindadUpdate(payload);
      })
      .on('broadcast', { event: 'player:hit' }, ({ payload }) => {
        this.handleHit(payload);
      })
      // Voice chat — Presence: auto-cleans on disconnect, late-joiner safe
      .on('presence', { event: 'sync' }, () => {
        this.handleVoicePresenceSync();
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        this.handleVoicePresenceJoin(newPresences as PresenceVoice[]);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        this.handleVoicePresenceLeave(leftPresences as PresenceVoice[]);
      })
      .subscribe(() => {
        this.broadcastSelfState('player:join');
        // Auto-init voice here, after the channel is confirmed subscribed
        void this.tryAutoInitVoice();
      });
    return 'multiplayer';
  }

  private handleHit(payload: unknown) {
    const next = this.parseRemoteHit(payload);
    if (!next || next.target_id !== this.playerId) return;
    if (!this.allowRemoteEvent(this.remoteHitTimes, next.source_id, REMOTE_HIT_MIN_MS)) return;
    if (!this.inTraining || !this.pvpEnabled) return;
    if (this.time.now - this.lastDamageAt < LOCAL_HIT_COOLDOWN_MS) return;

    // FIX 4: Client-side distance validation — reject hits from impossibly far sources
    const MAX_HIT_DISTANCE = 600;
    const sourcePlayer = this.remotePlayers.get(next.source_id);
    if (sourcePlayer) {
      const dist = Phaser.Math.Distance.Between(sourcePlayer.x, sourcePlayer.y, this.px, this.py);
      if (dist > MAX_HIT_DISTANCE) {
        console.warn(`[Waspi] RemoteHit from ${next.source_id} rejected: distance ${dist.toFixed(0)}px exceeds max ${MAX_HIT_DISTANCE}px`);
        return;
      }
    }

    this.lastDamageAt = this.time.now;
    const dmg = Math.max(1, Math.min(40, Math.floor(next.dmg ?? 10)));
    const source = sourcePlayer;
    this.applyLocalDamage(dmg, source?.x ?? this.px - 1, source?.y ?? this.py);

    // FIX 3b: Apply PvP knockback from the hit payload
    if (next.kx !== undefined && next.ky !== undefined) {
      this.px = Phaser.Math.Clamp(this.px + next.kx, 20, WORLD.WIDTH - 20);
      this.py = Phaser.Math.Clamp(this.py + next.ky, 20, WORLD.HEIGHT - 20);
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
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, cfg, next.weapon, next.aim);
      if (next.equipped) {
        this.applyRemoteEquipped(next.player_id, next.equipped);
      }
      this.emitPresence();
      this.broadcastSelfState('player:join');
      return;
    }

    const rp = this.remotePlayers.get(next.player_id)!;
    rp.username = next.username;
    rp.nameplate.setText(next.username);
    rp.targetX = next.x;
    rp.targetY = next.y;
    if (next.weapon) {
      rp.weapon = next.weapon;
    }
    if (typeof next.aim === 'number' && Number.isFinite(next.aim)) {
      rp.aimAngle = next.aim;
    }
    if (next.avatar) {
      rp.avatarConfig = { ...rp.avatarConfig, ...cfg };
      const depth = rp.avatar.getContainer().depth;
      rp.avatar.destroy();
      rp.avatar = this.createSafeAvatarRenderer(rp.x, rp.y, rp.avatarConfig, `remote-state:${next.player_id}`);
      rp.avatar.setDepth(depth);
    }
    if (next.equipped) {
      this.applyRemoteEquipped(next.player_id, next.equipped);
    }
    this.emitPresence();
  }

  private handleRemoteLeave(payload: unknown) {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    if (!playerId) return;
    const rp = this.remotePlayers.get(playerId);
    if (rp) {
      rp.avatar.destroy();
      rp.nameplate.destroy();
      rp.gunSprite?.destroy();
      this.remotePlayers.delete(playerId);
      this.chatSystem.clearBubble(playerId);
      this.emitPresence();
    }
    // Voice chat: disconnect this peer
    getVoiceChat().disconnectPeer(`waspi-${playerId}`);
    // Destroy speaking indicator
    this.speakingIndicators.get(playerId)?.destroy();
    this.speakingIndicators.delete(playerId);
  }

  private handleRemoteMove(payload: unknown) {
    const next = this.parseRemoteMove(payload);
    if (!next || next.player_id === this.playerId) return;
    if (!this.allowRemoteEvent(this.remoteMoveTimes, next.player_id, REMOTE_MOVE_MIN_MS)) return;

    if (!this.remotePlayers.has(next.player_id)) {
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, {}, next.weapon, next.aim);
    }
    const rp = this.remotePlayers.get(next.player_id)!;
    // Track velocity for extrapolation
    const now = Date.now();
    const dt = now - (rp.lastMoveTime ?? now);
    if (dt > 0 && dt < 200) {
      rp.lastVx = (next.x - rp.targetX) / (dt / 1000);
      rp.lastVy = (next.y - rp.targetY) / (dt / 1000);
    }
    rp.lastMoveTime = now;
    rp.targetX = next.x;
    rp.targetY = next.y;
    rp.username = next.username;
    rp.nameplate.setText(next.username);
    rp.isMoving = next.moving;
    rp.moveDx = next.dir;
    rp.moveDy = next.dy;
    if (next.weapon) {
      rp.weapon = next.weapon;
    }
    if (typeof next.aim === 'number' && Number.isFinite(next.aim)) {
      rp.aimAngle = next.aim;
    } else if (Math.abs(next.dir) > 0.05) {
      rp.aimAngle = next.dir < 0 ? Math.PI : 0;
    }
    if (next.action) {
      this.playAvatarAction(rp.avatar, next.action);
    }
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

  private spawnRemotePlayer(id: string, username: string, x: number, y: number, cfg: AvatarConfig, weapon: WeaponMode = 'pistol', aimAngle = 0) {
    const avatar = this.createSafeAvatarRenderer(x, y, cfg, `remote-spawn:${id}`);
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
      const bullet = bObj as ShotBullet;
      if (bullet.resolvedHit) return;
      bullet.resolvedHit = true;
      this.destroyArcadeObject(bObj);
      const rp = this.remotePlayers.get(id);
      const hitAngle = rp
        ? Phaser.Math.Angle.Between(this.px, this.py, rp.x, rp.y)
        : 0;
      const kb = bullet.knockback ?? WEAPON_STATS[this.currentWeapon].knockback;
      this.channel?.send({
        type: 'broadcast',
        event: 'player:hit',
        payload: {
          target_id: id,
          source_id: this.playerId,
          dmg: bullet.damage ?? WEAPON_STATS[this.currentWeapon].damage,
          kx: Math.cos(hitAngle) * kb * 0.5,
          ky: Math.sin(hitAngle) * kb * 0.5,
        },
      });
    });

    const remotePlayer: RemotePlayer = {
      avatar,
      nameplate,
      username,
      x,
      y,
      targetX: x,
      targetY: y,
      isMoving: false,
      moveDx: 0,
      moveDy: 0,
      weapon,
      aimAngle: Number.isFinite(aimAngle) ? aimAngle : 0,
      avatarConfig: cfg,
      hitbox,
    };
    this.remotePlayers.set(id, remotePlayer);
    this.ensureRemoteWeaponSprite(remotePlayer);
    this.updateRemoteWeaponSprite(remotePlayer);
    this.emitPresence();

    // Voice chat: handled via Supabase Presence (handleVoicePresenceJoin/Sync)

    // Speaking indicator — small circle above nameplate, hidden until VAD fires
    const indicator = this.add.arc(x, y - 56, 5, 0, 360, false, 0x46B3FF, 0).setDepth(200);
    this.speakingIndicators.set(id, indicator);

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
    if (next.weapon) {
      rp.weapon = next.weapon;
    }
    if (typeof next.aim === 'number' && Number.isFinite(next.aim)) {
      rp.aimAngle = next.aim;
    }
    if (next.action) {
      this.playAvatarAction(rp.avatar, next.action);
    }

    if (next.avatar) {
      rp.avatarConfig = { ...rp.avatarConfig, ...next.avatar };
      // rebuild avatar visuals
      const x = rp.x;
      const y = rp.y;
      const depth = rp.avatar.getContainer().depth;
      rp.avatar.destroy();
      rp.avatar = this.createSafeAvatarRenderer(x, y, rp.avatarConfig, `remote-join:${next.player_id}`);
      rp.avatar.setDepth(depth);
    }

    if (next.equipped) {
      this.applyRemoteEquipped(next.player_id, next.equipped);
    }
    this.ensureRemoteWeaponSprite(rp);
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

  private syncHitboxPosition(hitbox: HitboxArc, x: number, y: number) {
    hitbox.setPosition(x, y);
    hitbox.body.updateFromGameObject();
    hitbox.body.setVelocity(0, 0);
  }

  private destroyArcadeObject(obj: unknown) {
    if (!obj || typeof obj !== 'object') return;

    if ('gameObject' in obj && obj.gameObject && typeof obj.gameObject === 'object') {
      safeDestroyGameObject(obj.gameObject as ArcadeObject);
      return;
    }
    if ('destroy' in obj && typeof obj.destroy === 'function') {
      safeDestroyGameObject(obj as ArcadeObject);
    }
  }

  private playAvatarAction(avatar: AvatarRenderer, action: AvatarAction) {
    if (action === 'shoot') {
      avatar.playShoot();
      return;
    }
    if (action === 'hurt') {
      avatar.playHurt();
      return;
    }
    avatar.playDeath();
  }

  private syncPosition(forceUpdate = false) {
    const now = Date.now();
    if (now - this.lastPosSent < 66) return; // ~15Hz

    // Delta encoding: skip broadcast if player hasn't moved more than 2px
    const dx = Math.abs(this.px - this.lastBroadcastX);
    const dy = Math.abs(this.py - this.lastBroadcastY);
    if (dx < 2 && dy < 2 && !forceUpdate) return;

    this.lastPosSent = now;
    this.lastBroadcastX = this.px;
    this.lastBroadcastY = this.py;

    this.channel?.send({
      type: 'broadcast',
      event: 'player:move',
      payload: {
        player_id: this.playerId,
        username: this.playerUsername,
        x: Math.round(this.px),
        y: Math.round(this.py),
        dir: this.lastMoveDx,
        dy: this.lastMoveDy,
        moving: this.lastIsMoving,
        weapon: this.currentWeapon,
        aim: this.weaponAimAngle,
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
    this.bridgeCleanupFns.push(eventBus.on(EVENTS.PARCEL_STATE_CHANGED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      this.vecindadState = {
        ownedParcelId: typeof (payload as Record<string, unknown>).ownedParcelId === 'string'
          ? (payload as Record<string, string>).ownedParcelId
          : undefined,
        buildStage: typeof (payload as Record<string, unknown>).buildStage === 'number'
          ? (payload as Record<string, number>).buildStage
          : 0,
        materials: typeof (payload as Record<string, unknown>).materials === 'number'
          ? (payload as Record<string, number>).materials
          : 0,
        cannabisFarmUnlocked: typeof (payload as Record<string, unknown>).cannabisFarmUnlocked === 'boolean'
          ? (payload as Record<string, boolean>).cannabisFarmUnlocked
          : false,
        farmPlants: Array.isArray((payload as Record<string, unknown>).farmPlants)
          ? ((payload as Record<string, unknown>).farmPlants as VecindadState['farmPlants'])
          : [],
      };
      this.refreshParcelVisuals();
    }));
    this.bridgeCleanupFns.push(eventBus.on(EVENTS.VECINDAD_SHARED_STATE_CHANGED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const parcels = Array.isArray((payload as { parcels?: unknown[] }).parcels)
        ? (payload as { parcels: SharedParcelState[] }).parcels
        : [];
      this.applySharedVecindadParcels(parcels);
      if ((payload as { broadcast?: boolean }).broadcast) {
        this.broadcastVecindadState(parcels);
      }
    }));

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

    if (!res?.ok) return this.sanitizeChatFallback(message);
    const json = await res.json().catch(() => null) as { message?: string } | null;
    return json?.message?.trim() || this.sanitizeChatFallback(message);
  }

  private sanitizeChatFallback(message: string) {
    return message
      .trim()
      .replace(/\b(boludo|pelotudo|idiota|mierda|puta|puto)\b/gi, '***')
      .slice(0, CHAT.MAX_CHARS);
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

  private loadVecindadState() {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('waspi_player_state');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { vecindad?: Partial<VecindadState> };
      this.vecindadState = {
        ownedParcelId: typeof parsed.vecindad?.ownedParcelId === 'string' ? parsed.vecindad.ownedParcelId : undefined,
        buildStage: typeof parsed.vecindad?.buildStage === 'number' ? parsed.vecindad.buildStage : 0,
        materials: typeof parsed.vecindad?.materials === 'number' ? parsed.vecindad.materials : 0,
        cannabisFarmUnlocked: typeof parsed.vecindad?.cannabisFarmUnlocked === 'boolean' ? parsed.vecindad.cannabisFarmUnlocked : false,
        farmPlants: Array.isArray(parsed.vecindad?.farmPlants) ? parsed.vecindad.farmPlants : [],
      };
    } catch {
      this.vecindadState = {
        ownedParcelId: undefined,
        buildStage: 0,
        materials: 0,
        cannabisFarmUnlocked: false,
        farmPlants: [],
      };
    }
  }

  private async loadSharedVecindadState() {
    const res = await fetch('/api/vecindad').catch(() => null);
    if (!res?.ok) return;
    const json = await res.json().catch(() => null) as { parcels?: SharedParcelState[] } | null;
    if (!json?.parcels) return;
    this.applySharedVecindadParcels(json.parcels);
  }

  private applySharedVecindadParcels(parcels: SharedParcelState[]) {
    this.sharedParcelState.clear();
    parcels.forEach((parcel) => {
      this.sharedParcelState.set(parcel.parcelId, parcel);
    });
    this.refreshParcelVisuals();
  }

  private broadcastVecindadState(parcels: SharedParcelState[]) {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'vecindad:update',
      payload: { parcels },
    });
  }

  private handleRemoteVecindadUpdate(payload: unknown) {
    if (!payload || typeof payload !== 'object') return;
    const parcels = Array.isArray((payload as { parcels?: unknown[] }).parcels)
      ? (payload as { parcels: SharedParcelState[] }).parcels
      : [];
    this.applySharedVecindadParcels(parcels);
  }

  private updateMaterialNodes() {
    const now = this.time.now;
    for (const node of this.materialNodes) {
      if (node.available || now < node.respawnAt) continue;
      node.available = true;
      node.crate.setVisible(true);
      node.band.setVisible(true);
      node.label.setVisible(true);
    }
  }

  private getNearbyMaterialNode() {
    return this.materialNodes.find((node) =>
      node.available &&
      Phaser.Math.Distance.Between(this.px, this.py, node.x, node.y) < 54
    );
  }

  private collectMaterial(node: MaterialNode) {
    node.available = false;
    node.respawnAt = this.time.now + 14000;
    node.crate.setVisible(false);
    node.band.setVisible(false);
    node.label.setVisible(false);

    const nextState: VecindadState = {
      ...this.vecindadState,
      materials: this.vecindadState.materials + node.value,
    };
    this.vecindadState = nextState;
    this.refreshParcelVisuals();
    eventBus.emit(EVENTS.VECINDAD_UPDATE_REQUEST, {
      vecindad: nextState,
      notice: `Cache personal +${node.value} materiales`,
    });
  }

  private buildOwnedParcel() {
    if (!this.vecindadState.ownedParcelId) return;
    const currentStage = Math.max(1, this.vecindadState.buildStage);
    if (currentStage >= MAX_VECINDAD_STAGE) {
      eventBus.emit(EVENTS.UI_NOTICE, 'Tu casa ya esta al maximo.');
      return;
    }

    const cost = getBuildCost(currentStage);
    if (this.vecindadState.materials < cost) {
      eventBus.emit(EVENTS.UI_NOTICE, `Necesitas ${cost} materiales para seguir construyendo.`);
      return;
    }
    eventBus.emit(EVENTS.PARCEL_BUILD_REQUEST);
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
    this.playerAvatar = this.createSafeAvatarRenderer(x, y, {
      ...this.getCurrentAvatarConfig(),
      ...nextConfig,
    }, 'local-rebuild');
    this.playerAvatar.setDepth(depth);
  }

  private broadcastSelfState(event: 'player:join' | 'player:update', action?: AvatarAction) {
    if (!this.channel) return;
    const cfg = this.getCurrentAvatarConfig();
    const payload = {
      player_id: this.playerId,
      username: this.playerUsername,
      x: this.px,
      y: this.py,
      avatar: cfg,
      equipped: this.getEquippedIds(),
      weapon: this.currentWeapon,
      aim: this.weaponAimAngle,
      action,
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
    const showVecindadOverlay = this.isInsideVecindadDistrict();
    this.vecindadHud?.setVisible(showVecindadOverlay);
    this.parcelPrompt?.setVisible(showVecindadOverlay);
    this.runFrameStep('training combat', () => this.updateDummies());
    this.runFrameStep('interaction highlight', () => this.updateInteractionHighlight());
    this.handleInteraction();
    this.updateCamaraDelTiempo(delta);
    if (this.inTraining && this.time.now - this.trainingHudLastRefreshAt >= 1000) {
      this.trainingHudLastRefreshAt = this.time.now;
      this.renderTrainingHud();
    }

    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keyQ))     { this.switchWeapon(); }
    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keyOne))   { this.switchWeapon('pistol'); }
    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keyTwo))   { this.switchWeapon('shotgun'); }
    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keyThree)) { this.switchWeapon('smg'); }
    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keyFour))  { this.switchWeapon('rifle'); }
    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keyFive))  { this.switchWeapon('deagle'); }
    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keySix))   { this.switchWeapon('cannon'); }

    // Gun shoot with keyboard
    if (this.gunEnabled && this.controls.isActionDown('shoot') && !this.inputBlocked) {
      const p = this.input.activePointer;
      this.shootAt(p.worldX, p.worldY);
    }
    if (this.gunEnabled && !this.isTouch && this.input.activePointer.isDown && !this.inputBlocked) {
      this.shootAt(this.input.activePointer.worldX, this.input.activePointer.worldY);
    }

    this.runFrameStep('weapon visuals', () => this.updateWeaponSpritePosition());
    this.runFrameStep('weapon cooldown bar', () => this.renderWeaponCooldownBar());

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
    this.syncHitboxPosition(this.playerHitbox, this.px, this.py);

    // Training zone enter/exit
    const nowInTraining =
      this.px >= ZONES.TRAINING_X &&
      this.px <= ZONES.TRAINING_X + ZONES.TRAINING_W &&
      this.py >= ZONES.TRAINING_Y &&
      this.py <= ZONES.TRAINING_Y + ZONES.TRAINING_H;
    if (nowInTraining !== this.inTraining) {
      this.inTraining = nowInTraining;
      if (this.trainingBanner) {
        this.trainingBanner.setText(this.inTraining ? 'TRAINING: PVP + PVE - F DISPARA - 1/2 CAMBIAN ARMA' : '');
      }
      if (this.inTraining) {
        this.trainingSurvivalStartAt = this.time.now;
        this.trainingHudLastRefreshAt = 0;
        // Force pvpEnabled true on zone entry — cannot be self-disabled inside training zone
        if (!this.pvpEnabled) {
          console.warn('[WorldScene] pvpEnabled was false on training zone entry — forcing true. Possible abuse attempt.');
        }
        this.pvpEnabled = true;
        this.showArenaNotice('TRAINING HOT ZONE', '#39FF14');
        // Resume dummies when entering training zone
        this.dummyStates.forEach((_state, dummy) => {
          dummy.setActive(true);
          dummy.setVisible(true);
        });
      } else {
        this.trainingSurvivalStartAt = 0;
        this.trainingHudLastRefreshAt = 0;
        this.showArenaNotice('BONO PVE RESETEADO AL SALIR', '#FF8B3D');
        // Pause dummies when leaving training zone to save CPU
        this.dummyStates.forEach((_state, dummy) => {
          dummy.setActive(false);
          dummy.setVisible(false);
        });
      }
      this.renderTrainingHud();
    }

    // Interpolate remote players
    this.runFrameStep('remote players', () => {
      for (const [playerId, rp] of this.remotePlayers) {
        // Extrapolation: if far from target and velocity is known, nudge target forward
        const dist = Phaser.Math.Distance.Between(rp.x, rp.y, rp.targetX, rp.targetY);
        if (dist > 60 && rp.lastVx !== undefined && rp.lastVy !== undefined) {
          rp.targetX += rp.lastVx * (delta / 1000);
          rp.targetY += rp.lastVy * (delta / 1000);
        }
        rp.x = Phaser.Math.Linear(rp.x, rp.targetX, 0.25);
        rp.y = Phaser.Math.Linear(rp.y, rp.targetY, 0.25);
        const deltaX = rp.targetX - rp.x;
        const deltaY = rp.targetY - rp.y;
        const isMoving = rp.isMoving || Math.abs(deltaX) > 0.8 || Math.abs(deltaY) > 0.8;
        const visualDx = Math.abs(deltaX) > 0.1 ? deltaX : (isMoving ? rp.moveDx : Math.cos(rp.aimAngle));
        const visualDy = Math.abs(deltaY) > 0.1 ? deltaY : (isMoving ? rp.moveDy : Math.sin(rp.aimAngle));
        rp.avatar.update(isMoving, visualDx, visualDy);
        rp.avatar.setPosition(rp.x, rp.y);
        rp.avatar.setDepth(Math.floor(rp.y / 10));
        rp.nameplate.setPosition(rp.x, rp.y - 46);
        this.updateRemoteWeaponSprite(rp);
        this.chatSystem.updatePosition(playerId, rp.x, rp.y);
        this.syncHitboxPosition(rp.hitbox, rp.x, rp.y);
      }
    });

    // Proximity voice chat — update every 5 frames (~12Hz)
    this.voiceFrameCount++;
    if (this.voiceFrameCount % 5 === 0) {
      const vc = getVoiceChat();
      if (vc.connected) {
        const peerPositions = new Map<string, { x: number; y: number }>();
        for (const [remoteId, rp] of this.remotePlayers) {
          peerPositions.set(`waspi-${remoteId}`, { x: rp.x, y: rp.y });
        }
        vc.updateProximityVolumes({ x: this.px, y: this.py }, peerPositions);

        // Peer count
        const count = vc.peerCount;
        this.voiceStatusText?.setText(count > 0 ? `${count}p` : '');

        // Local speaking indicator (world space, above own avatar)
        if (this.localSpeakingIndicator) {
          const level = vc.getLocalSpeakingLevel();
          const speaking = level > 0.04 && !vc.muted;
          this.localSpeakingIndicator.setPosition(this.px, this.py - 56);
          this.localSpeakingIndicator.setAlpha(speaking ? 0.85 : 0);
        }

        // Remote speaking indicators
        for (const [remoteId, rp] of this.remotePlayers) {
          const arc = this.speakingIndicators.get(remoteId);
          if (!arc) continue;
          arc.setPosition(rp.x, rp.y - 56);
          const level = vc.getSpeakingLevel(`waspi-${remoteId}`);
          arc.setAlpha(level > 0.04 ? 0.85 : 0);
        }
      } else {
        // Voice not active — hide all indicators
        this.localSpeakingIndicator?.setAlpha(0);
        for (const [, arc] of this.speakingIndicators) arc.setAlpha(0);
      }
    }

    this.runFrameStep('minimap', () => this.renderMinimap());
  }

  // ─── Interaction ───────────────────────────────────────────────────────────────

  private getInteractionTarget(): InteractionTarget | null {
    const gunShopBounds = WorldScene.GUN_SHOP_BOUNDS;
    const { x: gunDealerX, y: gunDealerY } = this.getGunDealerPosition();
    const arcadeDoorX = BUILDINGS.ARCADE.x + BUILDINGS.ARCADE.w / 2;
    const storeDoorX = BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2;
    const cafeDoorX = BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2;
    const casinoDoorX = BUILDINGS.CASINO.x + BUILDINGS.CASINO.w / 2;
    const nearCasino = Math.abs(this.px - casinoDoorX) < 60 && this.py < ZONES.BUILDING_BOTTOM;
    const nearVecindad = this.px < 220 && this.py > ZONES.SOUTH_SIDEWALK_Y - 30 && this.py < ZONES.PLAZA_Y + 120;
    const nearPvpBooth = this.px >= 900 && this.px <= 1080 && this.py >= ZONES.PLAZA_Y + 420 && this.py <= ZONES.PLAZA_Y + 550;
    const basementDoorX = BUILDINGS.HOUSE.x + BUILDINGS.HOUSE.w / 2;
    const basementDoorY = BUILDINGS.HOUSE.y + BUILDINGS.HOUSE.h - 32;
    const nearBasement = Math.abs(this.px - basementDoorX) < 90
      && this.py >= BUILDINGS.HOUSE.y + BUILDINGS.HOUSE.h - 90
      && this.py <= BUILDINGS.HOUSE.y + BUILDINGS.HOUSE.h + 70;
    const nearArcade = Math.abs(this.px - arcadeDoorX) < 60 && this.py < ZONES.BUILDING_BOTTOM;
    const nearStore = Math.abs(this.px - storeDoorX) < 60 && this.py < ZONES.BUILDING_BOTTOM;
    const nearCafe = Math.abs(this.px - cafeDoorX) < 60 && this.py < ZONES.BUILDING_BOTTOM;
    const nearGunShop = Math.abs(this.px - gunDealerX) < 92
      && this.py >= gunShopBounds.y + gunShopBounds.h - 108
      && this.py <= gunShopBounds.y + gunShopBounds.h + 52;

    if (nearVecindad) {
      return { x: 120, y: ZONES.PLAZA_Y + 40, w: 140, h: 80, label: 'SPACE ENTRAR VECINDAD', color: 0xF5C842, sceneKey: 'VecindadScene' };
    }
    if (nearBasement) {
      return { x: basementDoorX, y: basementDoorY, w: BUILDINGS.HOUSE.w + 20, h: BUILDINGS.HOUSE.h + 10, label: 'SPACE ENTRAR BASEMENT', color: 0xB48BFF, sceneKey: 'BasementScene' };
    }
    if (nearPvpBooth) {
      return { x: 990, y: ZONES.PLAZA_Y + 485, w: 180, h: 90, label: 'SPACE ENTRAR PVP PIT', color: 0xFF4DA6, sceneKey: 'PvpArenaScene' };
    }
    if (nearArcade) {
      return { x: arcadeDoorX, y: BUILDINGS.ARCADE.y + BUILDINGS.ARCADE.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR ARCADE', color: 0x46B3FF, sceneKey: 'ArcadeInterior' };
    }
    if (nearStore) {
      return { x: storeDoorX, y: BUILDINGS.STORE.y + BUILDINGS.STORE.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR SHOP', color: 0x39FF14, sceneKey: 'StoreInterior' };
    }
    if (nearCafe) {
      return { x: cafeDoorX, y: BUILDINGS.CAFE.y + BUILDINGS.CAFE.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR CAFE', color: 0xFF8B3D, sceneKey: 'CafeInterior' };
    }
    if (nearCasino) {
      return { x: casinoDoorX, y: BUILDINGS.CASINO.y + BUILDINGS.CASINO.h - 28, w: 120, h: 80, label: 'SPACE ENTRAR CASINO', color: 0xF5C842, sceneKey: 'CasinoInterior' };
    }
    if (nearGunShop) {
      return { x: gunDealerX, y: gunDealerY, w: 164, h: 76, label: 'SPACE ENTRAR GUN SHOP', color: 0x46B3FF, sceneKey: 'GunShopInterior' };
    }

    const COTTENKS_X = 1615;
    const COTTENKS_Y = 558;
    const nearCottenks = Math.abs(this.px - COTTENKS_X) < 100 && Math.abs(this.py - COTTENKS_Y) < 100;
    if (nearCottenks && !this.cottenksDialog?.isActive()) {
      return { x: COTTENKS_X, y: COTTENKS_Y - 36, w: 180, h: 70, label: 'SPACE HABLAR CON COTTENKS', color: 0xF5C842, npcKey: 'cottenks' };
    }

    return null;
  }

  private updateInteractionHighlight() {
    if (!this.interactionHighlight || !this.interactionHint) return;
    const target = this.getInteractionTarget();
    this.interactionHighlight.clear();
    if (!target) {
      this.interactionHint.setAlpha(0);
      return;
    }

    const pulse = 0.3 + ((Math.sin(this.time.now / 180) + 1) * 0.16);
    this.interactionHighlight.lineStyle(3, target.color, 0.88);
    this.interactionHighlight.strokeRoundedRect(target.x - target.w / 2, target.y - target.h / 2, target.w, target.h, 10);
    this.interactionHighlight.fillStyle(target.color, pulse * 0.2);
    this.interactionHighlight.fillRoundedRect(target.x - target.w / 2, target.y - target.h / 2, target.w, target.h, 10);

    const rgb = Phaser.Display.Color.IntegerToRGB(target.color);
    this.interactionHint.setText(target.label);
    this.interactionHint.setColor(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
    // Gentle bob: ±4px on a ~1.8s cycle
    const bobY = Math.sin(this.time.now / 280) * 4;
    this.interactionHint.setPosition(target.x, target.y - target.h / 2 - 12 + bobY);
    this.interactionHint.setAlpha(1);
  }

  private handleInteraction() {
    if (this.inTransition) return;
    if (!this.controls.isActionJustDown('interact')) return;

    // Advance gun dealer dialog if active
    if (this.gunDealerDialog?.isActive()) {
      this.gunDealerDialog.advance();
      return;
    }

    // Advance / confirm COTTENKS dialog
    if (this.cottenksDialog?.isActive()) {
      this.cottenksDialog.advance();
      return;
    }

    // Close gun shop on SPACE if open
    if (this.gunShopOpen) {
      this.closeGunShopPanel();
      return;
    }

    const target = this.getInteractionTarget();
    if (target?.sceneKey) {
      this.transitionToScene(target.sceneKey);
      return;
    }
    if (target?.npcKey === 'cottenks') {
      this.openCottenksDialog();
      return;
    }

    // Vecindad: material node collection
    const nearMaterial = this.getNearbyMaterialNode();
    if (nearMaterial) {
      this.collectMaterial(nearMaterial);
      return;
    }

    // Vecindad: parcel buy or build
    const nearParcel = this.getNearbyParcel();
    if (nearParcel) {
      if (this.vecindadState.ownedParcelId === nearParcel.id) {
        this.buildOwnedParcel();
      } else if (!this.vecindadState.ownedParcelId && !this.sharedParcelState.has(nearParcel.id)) {
        eventBus.emit(EVENTS.PARCEL_BUY_REQUEST, { parcelId: nearParcel.id, cost: nearParcel.cost });
      }
    }
  }

  private updateParcelPrompt() {
    if (!this.parcelPrompt) return;
    const materialNode = this.getNearbyMaterialNode();
    if (materialNode) {
      this.parcelPrompt.setText(`E RECOGER TU CACHE +${materialNode.value} MATS`);
      this.parcelPrompt.setColor('#B9FF9E');
      return;
    }

    const parcel = this.getNearbyParcel();
    if (!parcel) {
      this.parcelPrompt.setText('');
      return;
    }

    if (this.vecindadState.ownedParcelId === parcel.id) {
      const currentStage = Math.max(1, this.vecindadState.buildStage);
      if (currentStage >= MAX_VECINDAD_STAGE) {
        this.parcelPrompt.setText(`PARCELA ${parcel.id} COMPLETA`);
        this.parcelPrompt.setColor('#39FF14');
        return;
      }
      const cost = getBuildCost(currentStage);
      this.parcelPrompt.setText(`E CONSTRUIR STAGE ${currentStage + 1} - ${cost} MATS`);
      this.parcelPrompt.setColor('#39FF14');
      return;
    }

    const shared = this.sharedParcelState.get(parcel.id);
    if (shared) {
      this.parcelPrompt.setText(`PARCELA ${parcel.id} OCUPADA POR ${shared.ownerUsername.toUpperCase()}`);
      this.parcelPrompt.setColor('#46B3FF');
      return;
    }

    if (this.vecindadState.ownedParcelId) {
      this.parcelPrompt.setText('YA TENES UNA PARCELA EN LA VECINDAD');
      this.parcelPrompt.setColor('#FFB36A');
      return;
    }

    this.parcelPrompt.setText(`E COMPRAR PARCELA ${parcel.id} - ${parcel.cost} TENKS`);
    this.parcelPrompt.setColor('#F5C842');
  }

  private getNearbyParcel() {
    return VECINDAD_PARCELS.find((parcel) =>
      this.px >= parcel.x - 26 &&
      this.px <= parcel.x + parcel.w + 26 &&
      this.py >= parcel.y - 26 &&
      this.py <= parcel.y + parcel.h + 26
    );
  }

  private transitionToScene(targetKey: string) {
    this.inTransition = true;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(targetKey);
    });
  }

  private handleSceneShutdown() {
    // Flush any pending stat changes before leaving the scene
    import('../systems/StatsSystem').then(({ flushStatsSystem }) => {
      void flushStatsSystem();
    }).catch(() => {});

    if (this.worldPointerShootHandler) {
      this.input.off('pointerdown', this.worldPointerShootHandler);
      this.worldPointerShootHandler = undefined;
    }
    if (this.touchPointerDownHandler) {
      this.input.off('pointerdown', this.touchPointerDownHandler);
      this.touchPointerDownHandler = undefined;
    }
    if (this.touchPointerMoveHandler) {
      this.input.off('pointermove', this.touchPointerMoveHandler);
      this.touchPointerMoveHandler = undefined;
    }
    if (this.touchPointerEndHandler) {
      this.input.off('pointerup', this.touchPointerEndHandler);
      this.input.off('pointerupoutside', this.touchPointerEndHandler);
      this.touchPointerEndHandler = undefined;
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
    this.chatSystem?.destroy();
    this.bridgeCleanupFns.forEach((cleanup) => cleanup());
    this.bridgeCleanupFns = [];
    this.audioSettingsCleanup?.();
    this.audioSettingsCleanup = undefined;
    stopSceneMusic(this, this.sceneMusic);
    this.sceneMusic = null;
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      void this.audioCtx.close();
    }
    this.audioCtx = undefined;
    this.audioUnlocked = false;
    this.interactionHighlight?.destroy();
    this.interactionHighlight = undefined;
    this.interactionHint?.destroy();
    this.interactionHint = undefined;

    // Cleanup Maps to avoid memory leaks
    try {
      this.remotePlayers.forEach((rp) => {
        rp.avatar?.destroy?.();
        rp.nameplate?.destroy?.();
        rp.gunSprite?.destroy?.();
      });
      this.remotePlayers.clear();
    } catch (e) { console.error('[WorldScene] remotePlayers cleanup failed', e); }

    // Voice chat: disconnect all peers, destroy speaking indicators
    try {
      const vc = getVoiceChat();
      for (const peerId of vc.connectedPeerIds) vc.disconnectPeer(peerId);
    } catch { /* noop */ }
    try {
      this.localSpeakingIndicator?.destroy();
      this.localSpeakingIndicator = undefined;
      this.speakingIndicators.forEach((arc) => arc.destroy());
      this.speakingIndicators.clear();
      this.closeVoicePrompt();
    } catch { /* noop */ }

    try { this.dummyStates.clear(); } catch { /* noop */ }
    try { this.sharedParcelState.clear(); } catch { /* noop */ }
    try { this.parcelVisuals.clear(); } catch { /* noop */ }
    try { this.remoteMoveTimes.clear(); } catch { /* noop */ }
    try { this.remoteChatTimes.clear(); } catch { /* noop */ }
    try { this.remoteHitTimes.clear(); } catch { /* noop */ }
    try { this.mutedPlayerIds.clear(); } catch { /* noop */ }
  }

  private getTrainingSurvivalElapsedMs() {
    if (!this.inTraining || this.trainingSurvivalStartAt <= 0) return 0;
    return Math.max(0, this.time.now - this.trainingSurvivalStartAt);
  }

  private getTrainingTenksMultiplier() {
    const steps = Math.floor(this.getTrainingSurvivalElapsedMs() / TRAINING_SURVIVAL_STEP_MS);
    return Math.min(TRAINING_SURVIVAL_MAX_MULTIPLIER, 1 + (steps * TRAINING_SURVIVAL_STEP_BONUS));
  }

  private getScaledTrainingTenksReward(baseReward: number) {
    return Math.max(1, Math.round(baseReward * this.getTrainingTenksMultiplier()));
  }

  private renderTrainingHud() {
    if (!this.trainingHud) return;
    if (!this.inTraining) {
      this.trainingHud.setText(`TRAINING KOs ${this.trainingScore} | BONO TENKS x1.0 | PROX +50% EN 11s`);
      return;
    }

    const elapsedMs = this.getTrainingSurvivalElapsedMs();
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const multiplier = this.getTrainingTenksMultiplier();
    const maxed = multiplier >= TRAINING_SURVIVAL_MAX_MULTIPLIER;
    const msIntoStep = elapsedMs % TRAINING_SURVIVAL_STEP_MS;
    const nextStepMs = maxed ? 0 : (TRAINING_SURVIVAL_STEP_MS - msIntoStep);
    const nextStepSec = maxed ? 0 : Math.max(1, Math.ceil(nextStepMs / 1000));
    const nextLabel = maxed ? 'MAX' : `PROX +50% EN ${nextStepSec}s`;
    this.trainingHud.setText(`TRAINING KOs ${this.trainingScore} | BONO TENKS x${multiplier.toFixed(1)} | ${nextLabel} | ${elapsedSec}s`);
  }

  private emitPresence() {
    eventBus.emit(EVENTS.PLAYER_PRESENCE, [
      { playerId: this.playerId, username: this.playerUsername },
      ...Array.from(this.remotePlayers.entries()).map(([playerId, player]) => ({
        playerId,
        username: player.username,
      })),
    ]);
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
    const weaponRaw = this.readStringField(payload, 'weapon');
    if (!playerId || x === null || y === null) return null;
    return {
      player_id: playerId,
      username,
      x,
      y,
      dir: this.readNumberField(payload, 'dir', 'dx') ?? 0,
      dy: this.readNumberField(payload, 'dy') ?? 0,
      moving: this.readBooleanField(payload, 'moving', 'isMoving') ?? false,
      weapon: weaponRaw === 'shotgun' ? 'shotgun' : weaponRaw === 'pistol' ? 'pistol' : undefined,
      aim: this.readNumberField(payload, 'aim') ?? undefined,
      action: this.readAvatarAction(payload),
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
    const weaponRaw = this.readStringField(payload, 'weapon');
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
      weapon: weaponRaw === 'shotgun' ? 'shotgun' : weaponRaw === 'pistol' ? 'pistol' : undefined,
      aim: this.readNumberField(payload, 'aim') ?? undefined,
      action: this.readAvatarAction(payload),
    };
  }

  private readAvatarAction(payload: unknown): AvatarAction | undefined {
    const action = this.readStringField(payload, 'action');
    return action === 'shoot' || action === 'hurt' || action === 'death' ? action : undefined;
  }

  // ─── Minimap ──────────────────────────────────────────────────────────────────

  private setupMinimap() {
    const mapW = 160;
    const mapH = 100;
    const marginRight = 10;
    const marginTop = 10;
    const x = this.scale.width - marginRight - mapW;
    const y = marginTop;

    // Static background + building rects drawn once
    this.minimapGraphics = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(9990);
    this.minimapGraphics.fillStyle(0x000000, 0.72);
    this.minimapGraphics.fillRect(x, y, mapW, mapH);
    this.minimapGraphics.lineStyle(1.5, 0x46B3FF, 0.6);
    this.minimapGraphics.strokeRect(x, y, mapW, mapH);

    const scaleX = mapW / WORLD.WIDTH;
    const scaleY = mapH / WORLD.HEIGHT;

    // Buildings
    const buildingDefs: Array<{ b: { x: number; y: number; w: number; h: number }; color: number }> = [
      { b: BUILDINGS.ARCADE, color: 0x46B3FF },
      { b: BUILDINGS.STORE,  color: 0xF5C842 },
      { b: BUILDINGS.CAFE,   color: 0xFF8B3D },
      { b: BUILDINGS.CASINO, color: 0xB74DFF },
    ];
    for (const { b, color } of buildingDefs) {
      this.minimapGraphics.fillStyle(color, 0.55);
      this.minimapGraphics.fillRect(
        x + b.x * scaleX,
        y + b.y * scaleY,
        b.w * scaleX,
        b.h * scaleY,
      );
    }

    // Player dot (will be repositioned each frame)
    this.minimapPlayerDot = this.add.circle(x, y, 2.5, 0xF5C842, 1)
      .setScrollFactor(0)
      .setDepth(9993) as Phaser.GameObjects.Arc;

    // "MAP" title label
    this.minimapTitle = this.add.text(x + mapW / 2, y + 3, 'MAP', {
      fontSize: '5px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9994);

    // Container for easy show/hide (graphics & title)
    this.minimapContainer = this.add.container(0, 0, [
      this.minimapGraphics,
      this.minimapPlayerDot,
      this.minimapTitle,
    ]).setScrollFactor(0).setDepth(9990);

    // Apply initial visibility
    const visible = this.hudSettings.showArenaHud;
    this.minimapContainer.setVisible(visible);
    this.minimapTitle.setVisible(visible);
  }

  private renderMinimap() {
    if (!this.minimapContainer || !this.minimapPlayerDot) return;
    if (!this.minimapContainer.visible) return;

    const mapW = 160;
    const mapH = 100;
    const marginRight = 10;
    const marginTop = 10;
    const originX = this.scale.width - marginRight - mapW;
    const originY = marginTop;
    const scaleX = mapW / WORLD.WIDTH;
    const scaleY = mapH / WORLD.HEIGHT;

    // Update local player dot
    this.minimapPlayerDot.setPosition(
      originX + this.px * scaleX,
      originY + this.py * scaleY,
    );

    // Sync remote player dots
    const activeIds = new Set<string>();
    for (const [id, rp] of this.remotePlayers) {
      activeIds.add(id);
      let dot = this.minimapRemoteDots.get(id);
      if (!dot || !dot.active) {
        dot = this.add.circle(0, 0, 2, 0x46B3FF, 1)
          .setScrollFactor(0)
          .setDepth(9992) as Phaser.GameObjects.Arc;
        this.minimapRemoteDots.set(id, dot);
      }
      dot.setPosition(
        originX + rp.x * scaleX,
        originY + rp.y * scaleY,
      );
      dot.setVisible(this.minimapContainer.visible);
    }

    // Remove dots for players that have left
    for (const [id, dot] of this.minimapRemoteDots) {
      if (!activeIds.has(id)) {
        dot.destroy();
        this.minimapRemoteDots.delete(id);
      }
    }
  }

  private parseRemoteHit(payload: unknown): RemoteHitEvent | null {
    const targetId = this.readStringField(payload, 'target_id', 'targetId');
    const sourceId = this.readStringField(payload, 'source_id', 'sourceId');
    const dmg = this.readNumberField(payload, 'dmg');
    if (!targetId || !sourceId || dmg === null) return null;
    const kx = this.readNumberField(payload, 'kx') ?? undefined;
    const ky = this.readNumberField(payload, 'ky') ?? undefined;
    return {
      target_id: targetId,
      source_id: sourceId,
      dmg,
      kx,
      ky,
    };
  }
}






