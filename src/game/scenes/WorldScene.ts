import Phaser from 'phaser';
import { AvatarRenderer, AvatarConfig, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { ChatSystem } from '../systems/ChatSystem';
import { WORLD, PLAYER, COLORS, ZONES, BUILDINGS, CHAT } from '../config/constants';
import { eventBus, EVENTS } from '../config/eventBus';
import { supabase, isConfigured } from '../../lib/supabase';
import { addTenks, initTenks } from '../systems/TenksSystem';
import { getEquippedColors, hasUtilityEquipped } from '../systems/InventorySystem';
import { loadAudioSettings, type AudioSettings } from '../systems/AudioSettings';
import { loadHudSettings, type HudSettings } from '../systems/HudSettings';
import { addXpToProgression, loadProgressionState, saveProgressionState, type ProgressionState } from '../systems/ProgressionSystem';
import { loadCombatStats, saveCombatStats, type CombatStats } from '../systems/CombatStats';
import { ensureFallbackRectTexture, safeCreateSpritesheetAnimation, safePlaySpriteAnimation, safeSetSpriteTexture } from '../systems/AnimationSafety';
import { announceScene } from '../systems/SceneUi';
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
  weapon?: WeaponMode;
  aimAngle: number;
  avatarConfig: AvatarConfig;
  hitbox: HitboxArc;
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
  moving: boolean;
  weapon?: WeaponMode;
  aim?: number;
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
};
type RemoteHitEvent = {
  target_id: string;
  source_id: string;
  dmg: number;
};

type WeaponMode = 'pistol' | 'shotgun';
type EnemyArchetype = 'rusher' | 'shooter' | 'tank' | 'boss';

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
};

const REMOTE_CHAT_MIN_MS = 1000;
const REMOTE_MOVE_MIN_MS = 50;
const REMOTE_HIT_MIN_MS = 120;
const MAX_REMOTE_CHAT_DISTANCE = 2600;
const LOCAL_HIT_COOLDOWN_MS = 180;
const DUMMY_RESPAWN_MS = 1800;
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
    idleTexture: 'weapon_glock_idle',
    idleAnim: 'weapon-glock-idle',
    shootAnim: 'weapon-glock-shoot',
  },
  shotgun: {
    label: 'SHOTGUN',
    pellets: 3,
    spread: 0.15,
    speed: 610,
    damage: 16,
    cooldownMs: 320,
    color: 0xFF8B3D,
    knockback: 34,
    idleTexture: 'weapon_shotgun_idle',
    idleAnim: 'weapon-shotgun-idle',
    shootAnim: 'weapon-shotgun-shoot',
  },
};
const ENEMY_PROFILES: Record<EnemyArchetype, EnemyProfile> = {
  rusher: {
    label: 'RUSH',
    tint: 0xFF5E5E,
    maxHp: 34,
    radius: 16,
    xpReward: 2,
    tenksReward: 1,
    speed: 2.45,
    preferredDistance: 48,
    strafe: 0.35,
    contactDamage: 12,
    rangedDamage: 0,
    shotCooldownMs: 999999,
  },
  shooter: {
    label: 'SHOT',
    tint: 0xFF8B3D,
    maxHp: 40,
    radius: 18,
    xpReward: 3,
    tenksReward: 2,
    speed: 1.7,
    preferredDistance: 150,
    strafe: 1.2,
    contactDamage: 8,
    rangedDamage: 9,
    shotCooldownMs: 850,
  },
  tank: {
    label: 'TANK',
    tint: 0xB74DFF,
    maxHp: 72,
    radius: 22,
    xpReward: 5,
    tenksReward: 3,
    speed: 1.1,
    preferredDistance: 78,
    strafe: 0.18,
    contactDamage: 18,
    rangedDamage: 0,
    shotCooldownMs: 999999,
  },
  boss: {
    label: 'BOSS',
    tint: 0x3DD6FF,
    maxHp: 220,
    radius: 28,
    xpReward: 12,
    tenksReward: 5,
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
  private keyE!: Phaser.Input.Keyboard.Key;
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
  private gunEnabled = true;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyOne!: Phaser.Input.Keyboard.Key;
  private keyTwo!: Phaser.Input.Keyboard.Key;
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
  private hudSettings: HudSettings = loadHudSettings();
  private audioSettingsCleanup?: () => void;
  private worldPointerShootHandler?: (p: Phaser.Input.Pointer) => void;
  private touchPointerDownHandler?: (p: Phaser.Input.Pointer) => void;
  private touchPointerMoveHandler?: (p: Phaser.Input.Pointer) => void;
  private touchPointerEndHandler?: () => void;

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

  constructor() {
    super({ key: 'WorldScene' });
  }

  init(data?: { returnX?: number; returnY?: number }) {
    this.inTransition = false;
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
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyF = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyQ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyOne = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.keyTwo = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);

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

    // HP/Combat/Utilities
    this.runBootStep('hp hud', () => this.setupHpHud());
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

    // Zombie sprite animations
    this.runBootStep('zombie anims', () => registerZombieAnims(this));

    // Training arena
    this.runBootStep('training zone', () => this.setupTrainingZone());
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

    this.trainingHud = this.add.text(8, 58, 'TRAINING KOs 0', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#39FF14',
    }).setScrollFactor(0).setDepth(9999);

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

  private ensureWeaponAnimations() {
    ensureFallbackRectTexture(this, WEAPON_FALLBACK_TEXTURE, 24, 8, 0xF5C842, 0x1A1A1A);
    const animations = [
      { key: 'weapon-glock-idle', texture: 'weapon_glock_idle', frameRate: 8, repeat: -1 },
      { key: 'weapon-glock-shoot', texture: 'weapon_glock_shoot', frameRate: 18, repeat: 0 },
      { key: 'weapon-shotgun-idle', texture: 'weapon_shotgun_idle', frameRate: 8, repeat: -1 },
      { key: 'weapon-shotgun-shoot', texture: 'weapon_shotgun_shoot', frameRate: 18, repeat: 0 },
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
    this.gunSprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (animation: Phaser.Animations.Animation) => {
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
      rp.gunSprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (animation: Phaser.Animations.Animation) => {
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
    sprite.setPosition(x + offsetX, y + offsetY);
    sprite.setRotation(safeAngle);
    sprite.setFlipY(safeAngle > Math.PI / 2 || safeAngle < -Math.PI / 2);
    sprite.setDepth(depth);
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

  private switchWeapon(nextWeapon?: WeaponMode) {
    if (!this.gunEnabled) return;
    if (nextWeapon) {
      this.currentWeapon = nextWeapon;
    } else {
      this.currentWeapon = this.currentWeapon === 'pistol' ? 'shotgun' : 'pistol';
    }
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
      this.combatHud.setColor(this.currentWeapon === 'shotgun' ? '#FF8B3D' : '#F5C842');
      this.combatHud.setText([
        `WEAPON ${weapon.label} | Q / 1 / 2`,
        'F / CLICK DISPARA | R1 S2 T3 B5',
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
        `LVL ${this.progression.level}/11 | XP ${this.progression.xp}`,
        `KOs ${this.progression.kills} | NEXT ${nextLabel}`,
      ]);
    });
  }

  private applyHudVisibility() {
    const visible = this.hudSettings.showArenaHud;
    this.trainingHud?.setVisible(visible);
    this.combatHud?.setVisible(visible);
    this.progressionHud?.setVisible(visible);
    this.weaponHud?.setVisible(visible && this.gunEnabled);
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
    const nameplateOffset = state.archetype === 'boss' ? -76 : state.archetype === 'tank' ? -58 : -42;
    state.nameplate.setPosition(dummy.x, dummy.y + nameplateOffset);
    state.sprite?.setPosition(dummy.x, dummy.y);
    state.hpBar.clear();
    if (!state.alive) return;

    const width = state.archetype === 'tank' ? 52 : 42;
    const height = 5;
    const pct = Phaser.Math.Clamp(state.hp / state.maxHp, 0, 1);
    state.hpBar.fillStyle(0x000000, 0.55);
    state.hpBar.fillRoundedRect(dummy.x - width / 2, dummy.y - 24, width, height, 2);
    state.hpBar.fillStyle(state.archetype === 'tank' ? 0xB74DFF : state.archetype === 'shooter' ? 0xFF8B3D : 0x39FF14, 0.85);
    state.hpBar.fillRoundedRect(dummy.x - width / 2 + 1, dummy.y - 23, (width - 2) * pct, height - 2, 2);
  }

  private damageDummy(dummy: CombatDummy, damage: number, knockback: number) {
    const state = this.dummyStates.get(dummy);
    if (!state || !state.alive) return;

    this.ensureAudioReady();
    this.playCombatTone(state.isBoss ? 220 : 260, 0.045, 'triangle', 0.05);
    state.hp = Math.max(0, state.hp - damage);
    const pushAngle = Phaser.Math.Angle.Between(this.px, this.py, dummy.x, dummy.y);
    dummy.setPosition(
      Phaser.Math.Clamp(dummy.x + Math.cos(pushAngle) * knockback, ZONES.TRAINING_X + 26, ZONES.TRAINING_X + ZONES.TRAINING_W - 26),
      Phaser.Math.Clamp(dummy.y + Math.sin(pushAngle) * knockback, ZONES.TRAINING_Y + 26, ZONES.TRAINING_Y + ZONES.TRAINING_H - 26),
    );
    const flash = this.add.circle(dummy.x, dummy.y, 20, 0xFF4444, 0.24);
    flash.setDepth(5000);
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.8, duration: 180, onComplete: () => flash.destroy() });

    const hitNumber = this.add.text(dummy.x, dummy.y - 8, `-${damage}`, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(5001);
    this.tweens.add({
      targets: hitNumber,
      y: dummy.y - 28,
      alpha: { from: 1, to: 0 },
      duration: 420,
      ease: 'Sine.easeOut',
      onComplete: () => hitNumber.destroy(),
    });

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
    if (this.trainingHud) {
      this.trainingHud.setText(`TRAINING KOs ${this.trainingScore}`);
    }
    const previousLevel = this.progression.level;
    this.progression = addXpToProgression(this.progression, state.xpReward);
    saveProgressionState(this.progression);
    this.renderProgressionHud();
    eventBus.emit(EVENTS.PLAYER_PROGRESSION, this.progression);
    addTenks(state.tenksReward, `training_${state.archetype}`);
    if (state.isBoss) {
      this.showArenaNotice(`BOSS DOWN +${state.xpReward} XP +${state.tenksReward} TENKS`, '#39FF14');
    } else {
      this.showArenaNotice(`+${state.xpReward} XP +${state.tenksReward} TENKS ${state.label}`, '#F5C842');
    }
    if (this.progression.level > previousLevel) {
      this.showArenaNotice(`LEVEL UP ${this.progression.level}/11`, '#46B3FF');
      this.playCombatTone(260, 0.2, 'square', 0.06);
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
      onComplete: () => burst.destroy(),
    });

    for (let i = 0; i < 6; i++) {
      const shard = this.add.circle(dummy.x, dummy.y, Phaser.Math.Between(2, 4), state.tint, 0.9).setDepth(5000);
      const angle = (Math.PI * 2 * i) / 6 + Phaser.Math.FloatBetween(-0.25, 0.25);
      const dist = Phaser.Math.Between(20, 44);
      this.tweens.add({
        targets: shard,
        x: dummy.x + Math.cos(angle) * dist,
        y: dummy.y + Math.sin(angle) * dist,
        alpha: { from: 0.9, to: 0 },
        scale: { from: 1, to: 0.4 },
        duration: 380,
        ease: 'Quad.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
    this.renderBossHud();
  }

  private updateDummies() {
    for (const [dummy, state] of this.dummyStates) {
      if (!state.alive) {
        if (this.time.now < state.respawnAt) continue;
        state.alive = true;
        state.hp = state.maxHp;
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
          onComplete: () => ring.destroy(),
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

        if (distToPlayer < dummy.radius + 20 && this.time.now - this.lastDamageAt > LOCAL_HIT_COOLDOWN_MS) {
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

    this.time.delayedCall(1400, () => this.destroyArcadeObject(bullet));
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
    this.hp = Math.max(0, this.hp - dmg);
    this.renderHpHud();
    this.playCombatTone(90, 0.08, 'triangle', 0.045);

    const flash = this.add.rectangle(400, 300, 800, 600, 0xFF0000, 0.08)
      .setScrollFactor(0)
      .setDepth(20000);
    this.tweens.add({ targets: flash, alpha: 0, duration: 140, onComplete: () => flash.destroy() });

    const pushAngle = Phaser.Math.Angle.Between(sourceX, sourceY, this.px, this.py);
    this.px += Math.cos(pushAngle) * 20;
    this.py += Math.sin(pushAngle) * 20;
    this.px = Phaser.Math.Clamp(this.px, 20, WORLD.WIDTH - 20);
    this.py = Phaser.Math.Clamp(this.py, 20, WORLD.HEIGHT - 20);
    this.playerBody.setPosition(this.px, this.py);
    this.playerAvatar.setPosition(this.px, this.py);
    this.playerNameplate.setPosition(this.px, this.py - 46);

    if (this.hp > 0) return;

    this.combatStats = { ...this.combatStats, deaths: this.combatStats.deaths + 1 };
    saveCombatStats(this.combatStats);
    eventBus.emit(EVENTS.PLAYER_COMBAT_STATS, this.combatStats);
    this.hp = 100;
    this.renderHpHud();
    this.px = PLAZA_RESPAWN_X;
    this.py = PLAZA_RESPAWN_Y;
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
  }

  private setupCombat() {
    this.dummies = this.physics.add.group({ allowGravity: false, immovable: true });
    this.bullets = this.physics.add.group({
      allowGravity: false,
      collideWorldBounds: true,
      maxSize: 32,
    });
    this.enemyBullets = this.physics.add.group({
      allowGravity: false,
      collideWorldBounds: true,
      maxSize: 48,
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
    if (this.gunSprite) {
      safePlaySpriteAnimation(this, this.gunSprite, weapon.shootAnim, weapon.idleTexture, WEAPON_FALLBACK_TEXTURE, true);
    }
    this.broadcastSelfState('player:update');
    this.ensureAudioReady();
    this.playCombatTone(
      this.currentWeapon === 'shotgun' ? 120 : 220,
      this.currentWeapon === 'shotgun' ? 0.11 : 0.07,
      this.currentWeapon === 'shotgun' ? 'sawtooth' : 'square',
      this.currentWeapon === 'shotgun' ? 0.05 : 0.035,
    );

    const ang = Phaser.Math.Angle.Between(this.px, this.py, wx, wy);

    // Muzzle flash
    const flash = this.add.circle(this.px + Math.cos(ang) * 14, this.py + Math.sin(ang) * 14, this.currentWeapon === 'shotgun' ? 10 : 7, weapon.color, 0.95);
    flash.setDepth(2100);
    this.tweens.add({
      targets: flash,
      alpha: { from: 0.95, to: 0 },
      scale: { from: 1, to: this.currentWeapon === 'shotgun' ? 2.4 : 1.8 },
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
      duration: this.currentWeapon === 'shotgun' ? 110 : 80,
      ease: 'Sine.easeOut',
    });

    for (let i = 0; i < weapon.pellets; i++) {
      const spreadOffset = weapon.pellets === 1 ? Phaser.Math.FloatBetween(-weapon.spread, weapon.spread) : Phaser.Math.FloatBetween(-weapon.spread, weapon.spread);
      const shotAngle = ang + spreadOffset;
      const b = this.add.rectangle(this.px, this.py, this.currentWeapon === 'shotgun' ? 8 : 10, this.currentWeapon === 'shotgun' ? 3 : 3, weapon.color, 1) as ShotBullet;
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

      const tracer = this.add.line(
        0,
        0,
        this.px,
        this.py,
        this.px + Math.cos(shotAngle) * (this.currentWeapon === 'shotgun' ? 24 : 18),
        this.py + Math.sin(shotAngle) * (this.currentWeapon === 'shotgun' ? 24 : 18),
        weapon.color,
        this.currentWeapon === 'shotgun' ? 0.55 : 0.4,
      ).setLineWidth(this.currentWeapon === 'shotgun' ? 3 : 2, this.currentWeapon === 'shotgun' ? 3 : 2).setDepth(1999);
      this.tweens.add({
        targets: tracer,
        alpha: { from: tracer.alpha, to: 0 },
        duration: this.currentWeapon === 'shotgun' ? 90 : 70,
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
    this.channel?.send({
      type: 'broadcast',
      event: 'player:hit',
      payload: { target_id: bestRemote, source_id: this.playerId, dmg: weapon.damage },
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

    // Future plaza anchors
    this.drawConstructionSite(820, ZONES.PLAZA_Y + 190, 280, 210, 'CASINO', '#FF4466');
    this.drawConstructionSite(2220, ZONES.PLAZA_Y + 190, 280, 210, 'GUN SHOP', '#46B3FF');

    // Down-plaza gateway to the dedicated zombies district.
    g.fillStyle(0x120c0f, 1);
    g.fillRoundedRect(1500, ZONES.PLAZA_Y + 620, 200, 92, 16);
    g.lineStyle(3, 0xff6ea8, 0.78);
    g.strokeRoundedRect(1500, ZONES.PLAZA_Y + 620, 200, 92, 16);
    g.fillStyle(0x2a111d, 1);
    g.fillRect(1588, ZONES.PLAZA_Y + 588, 24, 124);
    g.fillRect(1518, ZONES.PLAZA_Y + 640, 20, 52);
    g.fillRect(1662, ZONES.PLAZA_Y + 640, 20, 52);

    this.add.text(1600, ZONES.PLAZA_Y + 648, 'ZOMBIES', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF90C2',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    this.add.text(1600, ZONES.PLAZA_Y + 684, 'SPACE ENTRAR', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFD3E4',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

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
      return;
    }

    this.vecindadHud.setText(text);
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

  private drawConstructionSite(x: number, y: number, w: number, h: number, label: string, accentHex: string) {
    const g = this.add.graphics().setDepth(1.4);
    const accent = Number(`0x${accentHex.replace('#', '')}`);

    // Site slab
    g.fillStyle(0x18161f, 0.95);
    g.fillRoundedRect(x, y, w, h, 16);
    g.lineStyle(3, 0x3b3544, 0.9);
    g.strokeRoundedRect(x, y, w, h, 16);

    // Excavation / unfinished footprint
    g.fillStyle(0x23202b, 1);
    g.fillRoundedRect(x + 22, y + 34, w - 44, h - 62, 10);
    g.lineStyle(2, 0x4d4658, 0.8);
    g.strokeRoundedRect(x + 22, y + 34, w - 44, h - 62, 10);

    // Metal frame
    g.lineStyle(4, 0x8a8f9d, 0.85);
    g.strokeRect(x + 58, y + 54, w - 116, h - 106);
    g.lineBetween(x + 58, y + 54, x + 88, y + 26);
    g.lineBetween(x + w - 58, y + 54, x + w - 88, y + 26);
    g.lineBetween(x + 58, y + h - 52, x + 88, y + h - 24);
    g.lineBetween(x + w - 58, y + h - 52, x + w - 88, y + h - 24);

    // Safety stripes
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(x + 28, y + h - 42, w - 56, 18, 8);
    for (let i = 0; i < 12; i++) {
      const sx = x + 36 + i * 18;
      g.fillStyle(i % 2 === 0 ? 0xF5C842 : 0x111111, 0.95);
      g.fillRect(sx, y + h - 40, 12, 14);
    }

    // Crane-ish silhouette
    g.fillStyle(0x5d6778, 1);
    g.fillRect(x + w - 46, y - 26, 10, 124);
    g.fillRect(x + w - 92, y - 20, 72, 8);
    g.fillRect(x + w - 80, y - 8, 8, 46);
    g.fillStyle(accent, 0.85);
    g.fillRect(x + w - 112, y - 28, 96, 12);

    // Signboard
    g.fillStyle(0x2b2016, 1);
    g.fillRoundedRect(x + 44, y - 34, 156, 36, 8);
    g.lineStyle(2, accent, 0.85);
    g.strokeRoundedRect(x + 44, y - 34, 156, 36, 8);

    this.add.text(x + 122, y - 16, label, {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: accentHex,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    this.add.text(x + w / 2, y + h / 2 + 12, 'UNDER CONSTRUCTION', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C5CBD8',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    this.add.text(x + w / 2, y + h / 2 + 36, 'COMING SOON', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#888EA0',
    }).setOrigin(0.5).setDepth(2);
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
      .on('broadcast', { event: 'vecindad:update' }, ({ payload }) => {
        this.handleRemoteVecindadUpdate(payload);
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
    if (this.time.now - this.lastDamageAt < LOCAL_HIT_COOLDOWN_MS) return;
    this.lastDamageAt = this.time.now;
    const dmg = Math.max(1, Math.min(40, Math.floor(next.dmg ?? 10)));
    const source = this.remotePlayers.get(next.source_id);
    this.applyLocalDamage(dmg, source?.x ?? this.px - 1, source?.y ?? this.py);
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
  }

  private handleRemoteMove(payload: unknown) {
    const next = this.parseRemoteMove(payload);
    if (!next || next.player_id === this.playerId) return;
    if (!this.allowRemoteEvent(this.remoteMoveTimes, next.player_id, REMOTE_MOVE_MIN_MS)) return;

    if (!this.remotePlayers.has(next.player_id)) {
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, {}, next.weapon, next.aim);
    }
    const rp = this.remotePlayers.get(next.player_id)!;
    rp.targetX = next.x;
    rp.targetY = next.y;
    rp.username = next.username;
    rp.nameplate.setText(next.username);
    rp.isMoving = next.moving;
    rp.moveDx = next.dir;
    if (next.weapon) {
      rp.weapon = next.weapon;
    }
    if (typeof next.aim === 'number' && Number.isFinite(next.aim)) {
      rp.aimAngle = next.aim;
    } else if (Math.abs(next.dir) > 0.05) {
      rp.aimAngle = next.dir < 0 ? Math.PI : 0;
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
      this.channel?.send({
        type: 'broadcast',
        event: 'player:hit',
        payload: { target_id: id, source_id: this.playerId, dmg: bullet.damage ?? WEAPON_STATS[this.currentWeapon].damage },
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
      weapon,
      aimAngle: Number.isFinite(aimAngle) ? aimAngle : 0,
      avatarConfig: cfg,
      hitbox,
    };
    this.remotePlayers.set(id, remotePlayer);
    this.ensureRemoteWeaponSprite(remotePlayer);
    this.updateRemoteWeaponSprite(remotePlayer);
    this.emitPresence();

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
      };
    } catch {
      this.vecindadState = {
        ownedParcelId: undefined,
        buildStage: 0,
        materials: 0,
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
      weapon: this.currentWeapon,
      aim: this.weaponAimAngle,
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
    this.runFrameStep('training combat', () => this.updateDummies());
    this.runFrameStep('interaction highlight', () => this.updateInteractionHighlight());
    this.handleInteraction();

    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      this.switchWeapon();
    }
    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keyOne)) {
      this.switchWeapon('pistol');
    }
    if (this.gunEnabled && Phaser.Input.Keyboard.JustDown(this.keyTwo)) {
      this.switchWeapon('shotgun');
    }

    // Gun shoot with keyboard
    if (this.gunEnabled && this.keyF.isDown && !this.inputBlocked) {
      const p = this.input.activePointer;
      this.shootAt(p.worldX, p.worldY);
    }
    if (this.gunEnabled && !this.isTouch && this.input.activePointer.isDown && !this.inputBlocked) {
      this.shootAt(this.input.activePointer.worldX, this.input.activePointer.worldY);
    }

    this.runFrameStep('weapon visuals', () => this.updateWeaponSpritePosition());

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
        this.showArenaNotice('TRAINING HOT ZONE', '#39FF14');
      }
    }

    // Interpolate remote players
    this.runFrameStep('remote players', () => {
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
        this.updateRemoteWeaponSprite(rp);
        this.chatSystem.updatePosition(playerId, rp.x, rp.y);
        this.syncHitboxPosition(rp.hitbox, rp.x, rp.y);
      }
    });
  }

  // ─── Interaction ───────────────────────────────────────────────────────────────

  private getInteractionTarget(): InteractionTarget | null {
    const arcadeDoorX = BUILDINGS.ARCADE.x + BUILDINGS.ARCADE.w / 2;
    const storeDoorX = BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2;
    const cafeDoorX = BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2;
    const nearVecindad = this.px < 220 && this.py > ZONES.SOUTH_SIDEWALK_Y - 30 && this.py < ZONES.PLAZA_Y + 120;
    const nearPvpBooth = this.px >= 900 && this.px <= 1080 && this.py >= ZONES.PLAZA_Y + 420 && this.py <= ZONES.PLAZA_Y + 550;
    const nearZombies = this.px >= 1490 && this.px <= 1710 && this.py >= ZONES.PLAZA_Y + 600 && this.py <= ZONES.PLAZA_Y + 740;
    const nearArcade = Math.abs(this.px - arcadeDoorX) < 60 && this.py < ZONES.BUILDING_BOTTOM;
    const nearStore = Math.abs(this.px - storeDoorX) < 60 && this.py < ZONES.BUILDING_BOTTOM;
    const nearCafe = Math.abs(this.px - cafeDoorX) < 60 && this.py < ZONES.BUILDING_BOTTOM;

    if (nearVecindad) {
      return { x: 120, y: ZONES.PLAZA_Y + 40, w: 140, h: 80, label: 'SPACE ENTRAR VECINDAD', color: 0xF5C842, sceneKey: 'VecindadScene' };
    }
    if (nearZombies) {
      return { x: 1600, y: ZONES.PLAZA_Y + 666, w: 220, h: 120, label: 'SPACE ENTRAR ZOMBIES', color: 0xFF6EA8, sceneKey: 'ZombiesScene' };
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
    this.interactionHint.setPosition(target.x, target.y - target.h / 2 - 10);
    this.interactionHint.setAlpha(1);
  }

  private handleInteraction() {
    if (this.inTransition) return;
    if (!Phaser.Input.Keyboard.JustDown(this.keySpace)) return;

    const target = this.getInteractionTarget();
    if (target?.sceneKey) {
      this.transitionToScene(target.sceneKey);
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
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      void this.audioCtx.close();
    }
    this.audioCtx = undefined;
    this.audioUnlocked = false;
    this.interactionHighlight?.destroy();
    this.interactionHighlight = undefined;
    this.interactionHint?.destroy();
    this.interactionHint = undefined;
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
      moving: this.readBooleanField(payload, 'moving', 'isMoving') ?? false,
      weapon: weaponRaw === 'shotgun' ? 'shotgun' : weaponRaw === 'pistol' ? 'pistol' : undefined,
      aim: this.readNumberField(payload, 'aim') ?? undefined,
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






