import Phaser from 'phaser';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { announceScene, bindSafeResetToPlaza, createBackButton, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { InteriorRoom } from '../systems/InteriorRoom';
import { SceneControls } from '../systems/SceneControls';
import { SAFE_PLAZA_RETURN } from '../config/constants';
import {
  getHouseInteriorStage,
  getNextVecindadBuildCost,
  MAX_VECINDAD_STAGE,
  normalizeVecindadBuildStage,
  type SharedParcelState,
  type VecindadParcelConfig,
  VECINDAD_MAP,
  VECINDAD_PARCELS,
} from '../../lib/vecindad';
import type { VecindadState } from '../../lib/playerState';
import { supabase } from '../../lib/supabase';
import { getTenksBalance } from '../systems/TenksSystem';

type ParcelVisual = {
  title: Phaser.GameObjects.Text;
  owner: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
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

type ForestMob = {
  id: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  targetX: number;
  targetY: number;
  speed: number;
  body: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
};

type VecindadSceneData = {
  returnX?: number;
  returnY?: number;
};

type SeedType = 'basica' | 'indica' | 'sativa' | 'purple_haze' | 'og_kush';

type FarmPlant = {
  slotIndex: number;
  seedType: SeedType;
  plantedAt: number;
  wateredAt?: number;
  waterCount: number;
};

type FarmActionRequest =
  | { action: 'farm_unlock' }
  | { action: 'farm_plant'; slotIndex: number; seedType: SeedType }
  | { action: 'farm_water'; slotIndex: number }
  | { action: 'farm_harvest'; slotIndex: number };

const FARM_UNLOCK_COST = 11000;
const FARM_SLOTS = 6;
const FARM_SEEDS: Array<{
  type: SeedType;
  label: string;
  cost: number;
  growthMs: number;
  rewardBase: number;
}> = [
  { type: 'basica', label: 'BASICA', cost: 200, growthMs: 30 * 60 * 1000, rewardBase: 280 },
  { type: 'indica', label: 'INDICA', cost: 350, growthMs: 60 * 60 * 1000, rewardBase: 480 },
  { type: 'sativa', label: 'SATIVA', cost: 500, growthMs: 2 * 60 * 60 * 1000, rewardBase: 800 },
  { type: 'purple_haze', label: 'PURPLE HAZE', cost: 800, growthMs: 3 * 60 * 60 * 1000, rewardBase: 1440 },
  { type: 'og_kush', label: 'OG KUSH', cost: 1200, growthMs: 5 * 60 * 60 * 1000, rewardBase: 2400 },
];

export class VecindadScene extends Phaser.Scene {
  private static readonly MOVE_SPEED = 145;
  private static readonly SPRINT_MULTIPLIER = 1.55;
  private static readonly FOREST_BOUNDS = {
    x: 140,
    y: 128,
    w: 2520,
    h: 360,
  } as const;
  private static readonly FOREST_MOB_AGGRO_RANGE = 220;
  private static readonly FOREST_MOB_BLOCK_RADIUS = 92;
  private player!: AvatarRenderer;
  private room?: InteriorRoom;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyJ!: Phaser.Input.Keyboard.Key;
  private keyK!: Phaser.Input.Keyboard.Key;
  private keyL!: Phaser.Input.Keyboard.Key;
  private shiftKey?: Phaser.Input.Keyboard.Key;
  private inTransition = false;
  private px: number = VECINDAD_MAP.SPAWN_X;
  private py: number = VECINDAD_MAP.SPAWN_Y;
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastIsMoving = false;
  private vecindadState: VecindadState = {
    ownedParcelId: undefined,
    buildStage: 0,
    materials: 0,
    cannabisFarmUnlocked: false,
    farmPlants: [],
  };
  private sharedParcels = new Map<string, SharedParcelState>();
  private parcelVisuals = new Map<string, ParcelVisual>();
  private materialNodes: MaterialNode[] = [];
  private forestMobs: ForestMob[] = [];
  private lastForestHitAt = 0;
  private promptText?: Phaser.GameObjects.Text;
  private hudText?: Phaser.GameObjects.Text;
  private farmHintText?: Phaser.GameObjects.Text;
  private farmOpen = false;
  private selectedFarmSlot = 0;
  private selectedSeedIndex = 0;
  private farmOverlay?: Phaser.GameObjects.Container;
  private farmSlots: Phaser.GameObjects.Rectangle[] = [];
  private farmSlotLabels: Phaser.GameObjects.Text[] = [];
  private farmSlotHitboxes: Phaser.Geom.Rectangle[] = [];
  private farmButtonHitboxes: Array<{ id: 'seed' | 'plant' | 'water' | 'harvest' | 'exit'; rect: Phaser.Geom.Rectangle }> = [];
  private farmInfoText?: Phaser.GameObjects.Text;
  private farmActionText?: Phaser.GameObjects.Text;
  private bridgeCleanupFns: Array<() => void> = [];
  private controls!: SceneControls;
  private realtimeChannel: RealtimeChannel | null = null;
  private parcelRefreshTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    super({ key: 'VecindadScene' });
  }

  init(data?: VecindadSceneData) {
    this.inTransition = false;
    this.px = data?.returnX ?? VECINDAD_MAP.SPAWN_X;
    this.py = data?.returnY ?? VECINDAD_MAP.SPAWN_Y;
  }

  create() {
    announceScene(this);
    this.input.enabled = true;
    this.controls = new SceneControls(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.loadVecindadState();

    this.drawDistrict();
    this.setupMaterialNodes();
    this.setupForestMobs();
    this.drawParcels();
    this.createPlayer();
    this.setupUi();
    this.createFarmOverlay();
    this.setupBridge();
    void this.loadSharedParcels();
    this.subscribeToParcelChanges();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyI = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyJ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keyK = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.bridgeCleanupFns.push(bindSafeResetToPlaza(this, () => {
      transitionToScene(this, 'WorldScene', {
        returnX: SAFE_PLAZA_RETURN.X,
        returnY: SAFE_PLAZA_RETURN.Y,
      });
    }));

    createBackButton(this, () => this.leaveToWorld(), 'PLAZA');

    this.cameras.main.setBounds(0, 0, VECINDAD_MAP.WIDTH, VECINDAD_MAP.HEIGHT);
    this.cameras.main.startFollow(this.player.getContainer(), true, 0.1, 0.1);
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(240, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    if (this.inTransition) return;
    if (this.farmOpen) {
      this.updateFarmOverlay();
      if (Phaser.Input.Keyboard.JustDown(this.keySpace)) this.closeFarmOverlay();
      if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.handleFarmPrimaryAction();
      return;
    }
    this.handleMovement(delta);
    this.room?.update();
    this.updateForestMobs(delta);
    this.updateMaterialNodes();
    this.updatePrompt();

    if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.handlePrimaryAction();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.handleSecondaryAction();
    }
  }

  private drawDistrict() {
    const g = this.add.graphics();
    g.fillStyle(0x0b1a0b, 1);
    g.fillRect(0, 0, VECINDAD_MAP.WIDTH, VECINDAD_MAP.HEIGHT);

    g.fillStyle(0x0a130a, 0.8);
    g.fillRect(0, 0, VECINDAD_MAP.WIDTH, 180);

    const forest = VecindadScene.FOREST_BOUNDS;
    g.fillStyle(0x0f2a11, 0.98);
    g.fillRoundedRect(forest.x, forest.y, forest.w, forest.h, 36);
    g.lineStyle(4, 0x315a2f, 0.88);
    g.strokeRoundedRect(forest.x, forest.y, forest.w, forest.h, 36);
    this.drawForestCanopy(g, forest.x, forest.y, forest.w, forest.h);

    g.fillStyle(0x203318, 0.95);
    g.fillRoundedRect(1040, 430, 720, 76, 24);
    g.lineStyle(2, 0x47663a, 0.7);
    for (let x = 1080; x < 1710; x += 38) {
      g.lineBetween(x, 468, x + 18, 468);
    }

    g.fillStyle(0x1a2b14, 1);
    g.fillRoundedRect(60, 60, VECINDAD_MAP.WIDTH - 120, VECINDAD_MAP.HEIGHT - 120, 28);
    g.lineStyle(4, 0x32512a, 0.9);
    g.strokeRoundedRect(60, 60, VECINDAD_MAP.WIDTH - 120, VECINDAD_MAP.HEIGHT - 120, 28);

    g.fillStyle(0x3d2d1d, 0.96);
    g.fillRoundedRect(120, 880, VECINDAD_MAP.WIDTH - 240, 160, 22);
    g.fillRoundedRect(835, 140, 170, VECINDAD_MAP.HEIGHT - 280, 22);
    g.fillRoundedRect(1725, 140, 170, VECINDAD_MAP.HEIGHT - 280, 22);

    g.lineStyle(2, 0x5b4632, 0.8);
    for (let x = 180; x < VECINDAD_MAP.WIDTH - 180; x += 46) {
      g.lineBetween(x, 960, x + 22, 960);
    }
    for (let y = 190; y < VECINDAD_MAP.HEIGHT - 150; y += 44) {
      g.lineBetween(920, y, 920, y + 18);
      g.lineBetween(1810, y, 1810, y + 18);
    }

    g.fillStyle(0x2a1a10, 1);
    g.fillRect(100, 850, 24, 220);
    g.fillRect(184, 850, 24, 220);
    g.fillStyle(0x5f4024, 1);
    g.fillRoundedRect(70, 794, 170, 64, 10);
    g.lineStyle(3, 0xf5c842, 0.8);
    g.strokeRoundedRect(70, 794, 170, 64, 10);

    g.fillStyle(0x233424, 0.9);
    g.fillRoundedRect(1160, 860, 480, 200, 20);
    g.lineStyle(3, 0x4f7752, 0.75);
    g.strokeRoundedRect(1160, 860, 480, 200, 20);
    g.fillStyle(0x172217, 0.9);
    g.fillCircle(1400, 960, 62);
    g.lineStyle(2, 0x335039, 0.8);
    g.strokeCircle(1400, 960, 62);
    for (let ring = 1; ring <= 3; ring += 1) {
      g.lineStyle(1, 0x45634b, 0.45);
      g.strokeCircle(1400, 960, 62 + ring * 20);
    }
    this.drawDistrictLights(g);

    this.add.text(155, 822, 'LA VECINDAD', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(155, 848, 'SPACE SALIR A PLAZA', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B6C19C',
    }).setOrigin(0.5);

    this.add.text(VECINDAD_MAP.WIDTH / 2, 112, 'BARRIO DE PARCELAS | COMPRA | FARMEA | CONSTRUYE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C9D8B7',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add.text(VECINDAD_MAP.WIDTH / 2, 165, 'BOSQUE NORTE = RECOLECCION DE MATERIALES', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#8DE17A',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add.text(VECINDAD_MAP.WIDTH / 2, 194, 'SUBI POR EL CAMINO CENTRAL Y LEVANTA CACHES', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B6C19C',
    }).setOrigin(0.5);

    g.fillStyle(0x132113, 0.95);
    g.fillRoundedRect(1200, 820, 400, 116, 14);
    g.lineStyle(3, 0x5da081, 0.7);
    g.strokeRoundedRect(1200, 820, 400, 116, 14);
    this.add.text(1400, 850, 'GUIA DEL BARRIO', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add.text(1400, 890, '1 COMPRA LOTE | 2 FARMEA MATS | 3 CONSTRUYE', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C9D8B7',
    }).setOrigin(0.5);
  }

  private drawForestCanopy(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    g.lineStyle(1, 0x1f3f1f, 0.35);
    for (let gy = y + 24; gy <= y + h - 24; gy += 26) {
      g.lineBetween(x + 24, gy, x + w - 24, gy);
    }
    for (let gx = x + 24; gx <= x + w - 24; gx += 28) {
      g.lineBetween(gx, y + 24, gx, y + h - 24);
    }

    const trees = [
      { x: 320, y: 220, r: 28 },
      { x: 520, y: 300, r: 30 },
      { x: 760, y: 210, r: 34 },
      { x: 970, y: 315, r: 30 },
      { x: 1250, y: 240, r: 32 },
      { x: 1520, y: 300, r: 30 },
      { x: 1770, y: 220, r: 32 },
      { x: 2010, y: 310, r: 30 },
      { x: 2260, y: 230, r: 30 },
      { x: 2470, y: 300, r: 28 },
    ];

    trees.forEach((tree) => {
      g.fillStyle(0x5e3f22, 0.95);
      g.fillRoundedRect(tree.x - 6, tree.y + 18, 12, 26, 4);
      g.fillStyle(0x2c5a2e, 0.95);
      g.fillCircle(tree.x, tree.y, tree.r);
      g.fillStyle(0x3a7d3e, 0.35);
      g.fillCircle(tree.x - 6, tree.y - 6, Math.max(12, tree.r * 0.58));
    });
  }

  private drawDistrictLights(g: Phaser.GameObjects.Graphics) {
    const lights = [
      { x: 1090, y: 960 },
      { x: 1400, y: 770 },
      { x: 1400, y: 1150 },
      { x: 1710, y: 960 },
    ];
    lights.forEach((light) => {
      g.fillStyle(0x2a1a10, 1);
      g.fillRect(light.x - 3, light.y - 26, 6, 42);
      g.fillStyle(0xf5c842, 0.92);
      g.fillCircle(light.x, light.y - 34, 5);
      g.fillStyle(0xf5c842, 0.12);
      g.fillCircle(light.x, light.y - 34, 28);
    });
  }

  private createPlayer() {
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(50);
    this.room = new InteriorRoom(this, {
      roomKey: 'waspi-room-vecindad',
      getPosition: () => ({ x: this.px, y: this.py }),
      getMovement: () => ({ dx: this.lastMoveDx, dy: this.lastMoveDy, isMoving: this.lastIsMoving }),
      getAvatarConfig: () => loadStoredAvatarConfig(),
      onRemoteClick: (playerId, username) => {
        eventBus.emit(EVENTS.PLAYER_ACTIONS_OPEN, { playerId, username });
      },
      remoteColor: '#C8F0A8',
      localColor: '#F5C842',
      depthBase: 40,
      nameplateOffsetY: 46,
    });
    this.room.start();
  }

  private setupUi() {
    this.promptText = this.add.text(this.scale.width / 2, this.scale.height - 26, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    this.hudText = this.add.text(16, 76, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B9FF9E',
      stroke: '#000000',
      strokeThickness: 3,
      lineSpacing: 6,
    }).setScrollFactor(0).setDepth(1000);

    this.renderHud();
  }

  private setupBridge() {
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
          ? ((payload as Record<string, unknown>).farmPlants as FarmPlant[])
          : [],
      };
      this.refreshParcelVisuals();
    }));

    this.bridgeCleanupFns.push(eventBus.on(EVENTS.VECINDAD_SHARED_STATE_CHANGED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const parcels = Array.isArray((payload as { parcels?: unknown[] }).parcels)
        ? (payload as { parcels: SharedParcelState[] }).parcels
        : [];
      this.applySharedParcels(parcels);
    }));
  }

  private async loadSharedParcels() {
    const res = await fetch('/api/vecindad').catch(() => null);
    if (!res?.ok) return;
    const json = await res.json().catch(() => null) as { parcels?: SharedParcelState[] } | null;
    if (!json?.parcels) return;
    this.applySharedParcels(json.parcels);
    eventBus.emit(EVENTS.VECINDAD_SHARED_STATE_CHANGED, { parcels: json.parcels });
  }

  private applySharedParcels(parcels: SharedParcelState[]) {
    this.sharedParcels.clear();
    parcels.forEach((parcel) => {
      this.sharedParcels.set(parcel.parcelId, parcel);
    });
    this.refreshParcelVisuals();
  }

  private subscribeToParcelChanges() {
    if (!supabase) return;
    this.realtimeChannel = supabase
      .channel('vecindad-parcels-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vecindad_parcels' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          this.handleParcelRealtimeEvent(payload);
        },
      )
      .subscribe();
  }

  private handleParcelRealtimeEvent(payload: RealtimePostgresChangesPayload<Record<string, unknown>>) {
    if (payload.eventType === 'DELETE') {
      const parcelId = String((payload.old as Record<string, unknown>).parcel_id ?? '');
      if (parcelId) {
        this.sharedParcels.delete(parcelId);
        this.scheduleParcelRefresh();
      }
      return;
    }

    const row = payload.new as Record<string, unknown>;
    const parcelId = String(row.parcel_id ?? '');
    const ownerId = String(row.owner_id ?? '');
    if (!parcelId || !ownerId) return;

    this.sharedParcels.set(parcelId, {
      parcelId,
      ownerId,
      ownerUsername: String(row.owner_username ?? 'player'),
      buildStage: normalizeVecindadBuildStage(typeof row.build_stage === 'number' ? row.build_stage : 0),
    });
    this.scheduleParcelRefresh();
  }

  private scheduleParcelRefresh() {
    if (this.parcelRefreshTimeout) {
      clearTimeout(this.parcelRefreshTimeout);
    }
    this.parcelRefreshTimeout = setTimeout(() => {
      this.parcelRefreshTimeout = undefined;
      this.refreshParcelVisuals();
    }, 200);
  }

  private drawParcels() {
    const g = this.add.graphics().setDepth(1);
    VECINDAD_PARCELS.forEach((parcel) => {
      this.drawParcelBase(g, parcel);
    });
    this.refreshParcelVisuals();
  }

  private drawParcelBase(g: Phaser.GameObjects.Graphics, parcel: VecindadParcelConfig) {
    g.fillStyle(0x182715, 1);
    g.fillRoundedRect(parcel.x, parcel.y, parcel.w, parcel.h, 18);
    g.lineStyle(3, 0x506842, 0.95);
    g.strokeRoundedRect(parcel.x, parcel.y, parcel.w, parcel.h, 18);

    g.fillStyle(0x111111, 0.7);
    g.fillRoundedRect(parcel.x + 26, parcel.y + parcel.h - 74, parcel.w - 52, 44, 10);

    const title = this.add.text(parcel.x + 22, parcel.y + 18, `PARCELA ${parcel.id}`, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setDepth(2);

    const owner = this.add.text(parcel.x + parcel.w / 2, parcel.y + 52, 'DISPONIBLE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#E6E1C8',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    const badge = this.add.text(parcel.x + parcel.w - 18, parcel.y + 18, `${parcel.cost}T`, {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(1, 0).setDepth(2);

    const hint = this.add.text(parcel.x + parcel.w / 2, parcel.y + parcel.h - 50, 'COMPRA Y CONSTRUYE', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#A2B59C',
    }).setOrigin(0.5).setDepth(2);

    const structure = this.add.graphics().setDepth(2.5);
    this.parcelVisuals.set(parcel.id, { title, owner, badge, hint, structure });
  }

  private refreshParcelVisuals() {
    for (const parcel of VECINDAD_PARCELS) {
      const visual = this.parcelVisuals.get(parcel.id);
      if (!visual) continue;
      const shared = this.sharedParcels.get(parcel.id);
      const mine = this.vecindadState.ownedParcelId === parcel.id;
      const stage = mine ? this.vecindadState.buildStage : shared?.buildStage ?? 0;

      if (mine) {
        visual.owner.setText(stage > 0 ? 'TU CASA' : 'TU TERRENO');
        visual.owner.setColor('#39FF14');
        visual.badge.setText(stage > 0 ? `STAGE ${stage}` : 'LOTE');
        visual.badge.setColor('#39FF14');
        visual.hint.setText(stage > 0 ? 'E CONSTRUIR | SPACE ENTRAR' : 'E LEVANTAR BASE');
        visual.hint.setColor('#B9FF9E');
      } else if (shared) {
        visual.owner.setText(shared.ownerUsername.toUpperCase());
        visual.owner.setColor('#46B3FF');
        visual.badge.setText(shared.buildStage > 0 ? `STAGE ${shared.buildStage}` : 'LOTE');
        visual.badge.setColor('#46B3FF');
        visual.hint.setText(shared.buildStage > 0 ? 'SPACE VISITAR CASA' : 'TERRENO RESERVADO');
        visual.hint.setColor(shared.buildStage > 0 ? '#9EDCFF' : '#9EB09A');
      } else if (this.vecindadState.ownedParcelId) {
        visual.owner.setText('OCUPA TU PARCELA');
        visual.owner.setColor('#FFB36A');
        visual.badge.setText(`${parcel.cost}T`);
        visual.badge.setColor('#F5C842');
        visual.hint.setText('YA TENES OTRA PARCELA');
        visual.hint.setColor('#FFB36A');
      } else {
        visual.owner.setText('FOR SALE');
        visual.owner.setColor('#E6E1C8');
        visual.badge.setText(`${parcel.cost}T`);
        visual.badge.setColor('#F5C842');
        visual.hint.setText('E COMPRAR PARCELA');
        visual.hint.setColor('#A2B59C');
      }

      this.drawParcelStructure(parcel, visual.structure, Math.max(0, stage), mine, Boolean(shared));
    }

    this.renderHud();
    if (this.farmOpen) this.refreshFarmOverlay();
  }

  private drawParcelStructure(
    parcel: VecindadParcelConfig,
    graphics: Phaser.GameObjects.Graphics,
    buildStage: number,
    mine: boolean,
    occupied: boolean,
  ) {
    graphics.clear();

    if (buildStage <= 0) {
      graphics.fillStyle(mine ? 0x304623 : occupied ? 0x243648 : 0x2a2a32, 0.82);
      graphics.fillRoundedRect(parcel.x + 92, parcel.y + 86, parcel.w - 184, parcel.h - 126, 12);
      graphics.lineStyle(2, mine ? 0x7fb86d : occupied ? 0x6aa5d6 : 0x44445a, 0.85);
      graphics.strokeRoundedRect(parcel.x + 92, parcel.y + 86, parcel.w - 184, parcel.h - 126, 12);
      graphics.lineStyle(2, 0xb28b57, 0.85);
      graphics.lineBetween(parcel.x + 110, parcel.y + 104, parcel.x + parcel.w - 110, parcel.y + 104);
      graphics.lineBetween(parcel.x + 110, parcel.y + parcel.h - 56, parcel.x + parcel.w - 110, parcel.y + parcel.h - 56);
      graphics.fillStyle(0xf5c842, 0.9);
      graphics.fillRect(parcel.x + parcel.w / 2 - 30, parcel.y + parcel.h / 2 - 10, 60, 20);
      return;
    }

    const houseX = parcel.x + 78;
    const houseY = parcel.y + 52;
    const houseW = parcel.w - 156;
    const houseH = parcel.h - 96;

    graphics.fillStyle(mine ? 0x7c5e39 : 0x695136, 1);
    graphics.fillRoundedRect(houseX, houseY + 36, houseW, houseH - 36, 12);
    graphics.lineStyle(3, 0x2c1a0c, 0.9);
    graphics.strokeRoundedRect(houseX, houseY + 36, houseW, houseH - 36, 12);

    graphics.fillStyle(0x3b2418, 1);
    graphics.fillTriangle(houseX - 18, houseY + 36, houseX + houseW / 2, houseY - 12, houseX + houseW + 18, houseY + 36);

    graphics.fillStyle(0x1f1610, 1);
    graphics.fillRoundedRect(houseX + houseW / 2 - 22, houseY + houseH - 12, 44, 48, 8);

    if (buildStage >= 2) {
      graphics.fillStyle(0x88ccff, 0.95);
      graphics.fillRect(houseX + 22, houseY + 58, 30, 24);
      graphics.fillRect(houseX + houseW - 52, houseY + 58, 30, 24);
    }
    if (buildStage >= 3) {
      graphics.fillStyle(0xf5c842, 0.9);
      graphics.fillRect(houseX + houseW / 2 - 28, houseY - 20, 56, 6);
      graphics.fillStyle(0x324c1e, 1);
      graphics.fillCircle(houseX + 28, houseY + houseH + 6, 14);
      graphics.fillCircle(houseX + houseW - 28, houseY + houseH + 6, 14);
    }
    if (buildStage >= 4) {
      graphics.fillStyle(0xc7c7d6, 0.95);
      graphics.fillRect(houseX + houseW + 10, houseY + 10, 10, 66);
      graphics.fillStyle(0xff8b3d, 0.95);
      graphics.fillTriangle(houseX + houseW + 20, houseY + 10, houseX + houseW + 58, houseY + 26, houseX + houseW + 20, houseY + 42);
    }

    graphics.fillStyle(0x111111, 0.65);
    graphics.fillRoundedRect(houseX + 12, houseY + houseH - 34, houseW - 24, 18, 8);

    if (mine && buildStage > 0) {
      const farmX = parcel.x + parcel.w - 74;
      const farmY = parcel.y + parcel.h - 62;
      graphics.fillStyle(this.vecindadState.cannabisFarmUnlocked ? 0x1d3c1d : 0x2a2a2a, 0.95);
      graphics.fillRoundedRect(farmX - 50, farmY - 26, 100, 44, 8);
      graphics.lineStyle(2, this.vecindadState.cannabisFarmUnlocked ? 0x39FF14 : 0x888888, 0.85);
      graphics.strokeRoundedRect(farmX - 50, farmY - 26, 100, 44, 8);
      graphics.fillStyle(this.vecindadState.cannabisFarmUnlocked ? 0x39FF14 : 0xF5C842, 0.8);
      graphics.fillCircle(farmX - 34, farmY - 6, 5);
    }
  }

  private setupMaterialNodes() {
    const defs = [
      { x: 360, y: 250, value: 3 },
      { x: 590, y: 328, value: 4 },
      { x: 860, y: 245, value: 3 },
      { x: 1150, y: 320, value: 5 },
      { x: 1450, y: 252, value: 3 },
      { x: 1730, y: 326, value: 4 },
      { x: 2030, y: 255, value: 3 },
      { x: 2320, y: 320, value: 5 },
    ];

    defs.forEach((def, index) => {
      const crate = this.add.rectangle(def.x, def.y, 38, 28, 0x8b5a2b, 1)
        .setStrokeStyle(2, 0x3c2412, 1)
        .setDepth(2.6);
      const band = this.add.rectangle(def.x, def.y, 42, 6, 0xf5c842, 0.8).setDepth(2.7);
      const label = this.add.text(def.x, def.y - 26, `+${def.value}`, {
        fontSize: '6px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#8DE17A',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2.8);

      this.materialNodes.push({
        id: `cache_${index + 1}`,
        x: def.x,
        y: def.y,
        value: def.value,
        available: true,
        respawnAt: 0,
        crate,
        band,
        label,
      });
    });
  }

  private setupForestMobs() {
    if (this.forestMobs.length) return;
    const defs = [
      { x: 460, y: 210, speed: 48 },
      { x: 760, y: 338, speed: 52 },
      { x: 1100, y: 220, speed: 50 },
      { x: 1460, y: 332, speed: 54 },
      { x: 1820, y: 214, speed: 49 },
      { x: 2210, y: 336, speed: 53 },
    ];

    defs.forEach((def, index) => {
      const body = this.add.ellipse(def.x, def.y, 26, 18, 0x8d1f2d, 0.95)
        .setStrokeStyle(2, 0x2b0c12, 0.95)
        .setDepth(3.1);
      const label = this.add.text(def.x, def.y - 20, 'MOB', {
        fontSize: '6px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#FF8D8D',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(3.2);
      this.forestMobs.push({
        id: `forest_mob_${index + 1}`,
        x: def.x,
        y: def.y,
        homeX: def.x,
        homeY: def.y,
        targetX: def.x,
        targetY: def.y,
        speed: def.speed,
        body,
        label,
      });
    });
  }

  private updateForestMobs(delta: number) {
    const forest = VecindadScene.FOREST_BOUNDS;
    const now = this.time.now;
    const dt = Math.max(0.001, delta / 1000);

    for (const mob of this.forestMobs) {
      const distToPlayer = Phaser.Math.Distance.Between(mob.x, mob.y, this.px, this.py);
      if (distToPlayer <= VecindadScene.FOREST_MOB_AGGRO_RANGE) {
        mob.targetX = this.px;
        mob.targetY = this.py;
      } else if (Phaser.Math.Distance.Between(mob.x, mob.y, mob.targetX, mob.targetY) < 18) {
        mob.targetX = Phaser.Math.Clamp(mob.homeX + Phaser.Math.Between(-120, 120), forest.x + 24, forest.x + forest.w - 24);
        mob.targetY = Phaser.Math.Clamp(mob.homeY + Phaser.Math.Between(-92, 92), forest.y + 24, forest.y + forest.h - 24);
      }

      const angle = Phaser.Math.Angle.Between(mob.x, mob.y, mob.targetX, mob.targetY);
      mob.x = Phaser.Math.Clamp(mob.x + Math.cos(angle) * mob.speed * dt, forest.x + 18, forest.x + forest.w - 18);
      mob.y = Phaser.Math.Clamp(mob.y + Math.sin(angle) * mob.speed * dt, forest.y + 18, forest.y + forest.h - 18);

      mob.body.setPosition(mob.x, mob.y);
      mob.body.setDepth(3 + Math.floor(mob.y / 400));
      mob.label.setPosition(mob.x, mob.y - 20);

      if (distToPlayer < 26 && now - this.lastForestHitAt > 1200) {
        this.lastForestHitAt = now;
        const knockAngle = Phaser.Math.Angle.Between(mob.x, mob.y, this.px, this.py);
        this.px = Phaser.Math.Clamp(this.px + Math.cos(knockAngle) * 40, 84, VECINDAD_MAP.WIDTH - 84);
        this.py = Phaser.Math.Clamp(this.py + Math.sin(knockAngle) * 40, 84, VECINDAD_MAP.HEIGHT - 84);
        this.player.setPosition(this.px, this.py);
        this.player.setDepth(50 + Math.floor(this.py / 10));

        const lost = Math.min(2, this.vecindadState.materials);
        if (lost > 0) {
          const nextState: VecindadState = {
            ...this.vecindadState,
            materials: this.vecindadState.materials - lost,
          };
          this.vecindadState = nextState;
          this.refreshParcelVisuals();
          eventBus.emit(EVENTS.VECINDAD_UPDATE_REQUEST, {
            vecindad: nextState,
            notice: `Un mob te golpeo: -${lost} materiales`,
          });
        } else {
          eventBus.emit(EVENTS.UI_NOTICE, { msg: 'Un mob te golpeo en el bosque.', color: '#FF8D8D' });
        }
      }
    }
  }

  private renderHud() {
    if (!this.hudText) return;
    const stage = normalizeVecindadBuildStage(this.vecindadState.buildStage);
    const nextCost = getNextVecindadBuildCost(stage);
    const mats = this.vecindadState.materials;

    // Progress bar (text-based, 10 chars wide)
    let progressBar = '';
    if (stage < MAX_VECINDAD_STAGE) {
      const filled = Math.min(Math.floor((mats / nextCost) * 10), 10);
      progressBar = '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + ']';
    } else {
      progressBar = '[██████████]';
    }

    const matsLine = stage >= MAX_VECINDAD_STAGE
      ? `MATS ${mats} (MAX)`
      : `MATS ${mats} / ${nextCost} → STAGE ${stage + 1}`;

    const objective = !this.vecindadState.ownedParcelId
      ? 'OBJETIVO COMPRA UNA PARCELA'
      : stage <= 0
        ? `OBJETIVO FARMEA EN BOSQUE Y LEVANTA BASE ${nextCost} MATS`
        : stage >= MAX_VECINDAD_STAGE
          ? 'OBJETIVO CASA COMPLETA'
          : `OBJETIVO STAGE ${stage + 1} ${nextCost} MATS EN BOSQUE`;
    const farmLine = this.vecindadState.cannabisFarmUnlocked
      ? `FARM ON | PLANTAS ${(this.vecindadState.farmPlants ?? []).length}/${FARM_SLOTS}`
      : 'FARM LOCKED';

    this.hudText.setText([
      'LA VECINDAD',
      this.vecindadState.ownedParcelId ? `PARCELA ${this.vecindadState.ownedParcelId}` : 'SIN PARCELA',
      matsLine,
      progressBar,
      `STAGE ${stage}/${MAX_VECINDAD_STAGE}${stage >= MAX_VECINDAD_STAGE ? ' MAX' : ''}`,
      farmLine,
      objective,
    ]);
  }

  private updateMaterialNodes() {
    const now = this.time.now;
    for (const node of this.materialNodes) {
      if (node.available || now < node.respawnAt) continue;
      node.available = true;
      node.crate.setVisible(true);
      node.band.setVisible(true);
      node.label.setVisible(true);
      eventBus.emit(EVENTS.UI_NOTICE, {
        msg: `+${node.value} materiales disponibles en Bosque Norte`,
        color: '#46B3FF',
      });
    }
  }

  private getNearbyMaterialNode() {
    return this.materialNodes.find((node) =>
      node.available && Phaser.Math.Distance.Between(this.px, this.py, node.x, node.y) < 56
    );
  }

  private isNodeContested(node: MaterialNode) {
    return this.forestMobs.some((mob) =>
      Phaser.Math.Distance.Between(mob.x, mob.y, node.x, node.y) < VecindadScene.FOREST_MOB_BLOCK_RADIUS
    );
  }

  private updatePrompt() {
    if (!this.promptText) return;

    if (this.isNearExitGate()) {
      this.promptText.setText('SPACE VOLVER A PLAZA');
      this.promptText.setColor('#F5C842');
      return;
    }

    const material = this.getNearbyMaterialNode();
    if (material) {
      if (this.isNodeContested(material)) {
        this.promptText.setText('MOBS CERCA: ALEJALOS PARA RECOGER');
        this.promptText.setColor('#FF8D8D');
      } else {
        this.promptText.setText(`E RECOGER CACHE DEL BOSQUE +${material.value} MATS`);
        this.promptText.setColor('#B9FF9E');
      }
      return;
    }

    if (this.isNearOwnedFarmSpot()) {
      if (!this.vecindadState.cannabisFarmUnlocked) {
        this.promptText.setText(`E DESBLOQUEAR CANNABIS FARM ${FARM_UNLOCK_COST} TENKS`);
        this.promptText.setColor('#F5C842');
      } else {
        this.promptText.setText('E ABRIR CANNABIS FARM | SPACE CERRAR');
        this.promptText.setColor('#39FF14');
      }
      return;
    }

    const parcel = this.getNearbyParcel();
    if (!parcel) {
      this.promptText.setText('');
      return;
    }

    const shared = this.sharedParcels.get(parcel.id);
    const mine = this.vecindadState.ownedParcelId === parcel.id;
    const stage = mine ? this.vecindadState.buildStage : shared?.buildStage ?? 0;

    if (mine) {
      const nextCost = getNextVecindadBuildCost(stage);
      if (this.isNearHouseDoor(parcel) && stage > 0) {
        this.promptText.setText('SPACE ENTRAR A TU CASA');
        this.promptText.setColor('#39FF14');
        return;
      }
      if (stage >= MAX_VECINDAD_STAGE) {
        this.promptText.setText('TU CASA ESTA COMPLETA');
        this.promptText.setColor('#39FF14');
        return;
      }
      this.promptText.setText(stage <= 0
        ? `E LEVANTAR CASA - ${nextCost} MATS`
        : `E CONSTRUIR STAGE ${stage + 1} - ${nextCost} MATS`);
      this.promptText.setColor('#39FF14');
      return;
    }

    if (shared) {
      if (this.isNearHouseDoor(parcel) && shared.buildStage > 0) {
        this.promptText.setText(`SPACE VISITAR CASA DE ${shared.ownerUsername.toUpperCase()}`);
        this.promptText.setColor('#46B3FF');
        return;
      }
      this.promptText.setText(shared.buildStage > 0
        ? `PARCELA ${parcel.id} OCUPADA POR ${shared.ownerUsername.toUpperCase()}`
        : `TERRENO DE ${shared.ownerUsername.toUpperCase()} AUN EN OBRA`);
      this.promptText.setColor('#46B3FF');
      return;
    }

    if (this.vecindadState.ownedParcelId) {
      this.promptText.setText('YA TENES OTRA PARCELA EN LA VECINDAD');
      this.promptText.setColor('#FFB36A');
      return;
    }

    this.promptText.setText(`E COMPRAR PARCELA ${parcel.id} - ${parcel.cost} TENKS`);
    this.promptText.setColor('#F5C842');
  }

  private handlePrimaryAction() {
    if (this.isNearOwnedFarmSpot()) {
      this.handleFarmPrimaryAction();
      return;
    }

    const material = this.getNearbyMaterialNode();
    if (material) {
      if (this.isNodeContested(material)) {
        eventBus.emit(EVENTS.UI_NOTICE, { msg: 'Hay mobs vigilando ese cache.', color: '#FF8D8D' });
        return;
      }
      this.collectMaterial(material);
      return;
    }

    const parcel = this.getNearbyParcel();
    if (!parcel) return;

    if (!this.vecindadState.ownedParcelId && !this.sharedParcels.has(parcel.id)) {
      eventBus.emit(EVENTS.PARCEL_BUY_REQUEST, { parcelId: parcel.id, cost: parcel.cost });
      return;
    }

    if (this.vecindadState.ownedParcelId === parcel.id) {
      this.buildOwnedParcel();
    }
  }

  private handleSecondaryAction() {
    if (this.farmOpen) {
      this.closeFarmOverlay();
      return;
    }

    if (this.isNearExitGate()) {
      this.leaveToWorld();
      return;
    }

    const parcel = this.getNearbyParcel();
    if (!parcel || !this.isNearHouseDoor(parcel)) return;

    const shared = this.sharedParcels.get(parcel.id);
    const mine = this.vecindadState.ownedParcelId === parcel.id;
    const stage = mine
      ? normalizeVecindadBuildStage(this.vecindadState.buildStage)
      : normalizeVecindadBuildStage(shared?.buildStage ?? 0);
    if (stage <= 0) return;

    const ownerName = mine ? 'TU CASA' : `CASA DE ${shared?.ownerUsername?.toUpperCase() ?? 'VECINO'}`;
    this.inTransition = true;
    this.cameras.main.fadeOut(240, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('HouseInterior', {
        returnScene: 'VecindadScene',
        roomKey: `waspi-room-house-${parcel.id}`,
        houseLabel: ownerName,
        buildStage: getHouseInteriorStage(stage),
        returnX: parcel.x + parcel.w / 2,
        returnY: parcel.y + parcel.h - 28,
      });
    });
  }

  private getOwnedParcel() {
    if (!this.vecindadState.ownedParcelId) return null;
    return VECINDAD_PARCELS.find((parcel) => parcel.id === this.vecindadState.ownedParcelId) ?? null;
  }

  private getOwnedFarmSpot() {
    const ownedParcel = this.getOwnedParcel();
    if (!ownedParcel) return null;
    if (normalizeVecindadBuildStage(this.vecindadState.buildStage) <= 0) return null;
    return {
      x: ownedParcel.x + ownedParcel.w - 74,
      y: ownedParcel.y + ownedParcel.h - 44,
    };
  }

  private isNearOwnedFarmSpot() {
    const spot = this.getOwnedFarmSpot();
    if (!spot) return false;
    return Phaser.Math.Distance.Between(this.px, this.py, spot.x, spot.y) < 76;
  }

  private createFarmOverlay() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const container = this.add.container(0, 0).setDepth(3000).setScrollFactor(0).setVisible(false);
    const bg = this.add.rectangle(cx, cy, width, height, 0x000000, 0.72).setScrollFactor(0);
    const panel = this.add.rectangle(cx, cy, 560, 340, 0x111318, 0.98).setStrokeStyle(2, 0x39FF14, 0.7).setScrollFactor(0);
    const title = this.add.text(cx, cy - 144, 'CANNABIS FARM', {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#39FF14',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0);

    this.farmInfoText = this.add.text(cx, cy - 114, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5).setScrollFactor(0);

    this.farmActionText = this.add.text(cx, cy + 122, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B9FF9E',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5).setScrollFactor(0);

    const slotStartX = cx - 150;
    const slotStartY = cy - 72;
    const slotW = 96;
    const slotH = 56;
    for (let i = 0; i < FARM_SLOTS; i += 1) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = slotStartX + col * 150;
      const y = slotStartY + row * 92;
      const rect = this.add.rectangle(x, y, slotW, slotH, 0x2b2018, 0.98)
        .setStrokeStyle(2, 0x5b4632, 0.9)
        .setScrollFactor(0);
      const label = this.add.text(x, y, 'VACIO', {
        fontSize: '6px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#A2B59C',
        align: 'center',
      }).setOrigin(0.5).setScrollFactor(0);
      this.farmSlots.push(rect);
      this.farmSlotLabels.push(label);
      this.farmSlotHitboxes.push(new Phaser.Geom.Rectangle(x - slotW / 2, y - slotH / 2, slotW, slotH));
      container.add([rect, label]);
    }

    const buttons = [
      { id: 'seed' as const, label: 'SEMILLA', x: cx - 208, y: cy + 66, color: 0x46B3FF },
      { id: 'plant' as const, label: 'PLANTAR', x: cx - 88, y: cy + 66, color: 0x39FF14 },
      { id: 'water' as const, label: 'REGAR', x: cx + 32, y: cy + 66, color: 0x46B3FF },
      { id: 'harvest' as const, label: 'COSECHAR', x: cx + 152, y: cy + 66, color: 0xF5C842 },
      { id: 'exit' as const, label: 'SALIR', x: cx + 242, y: cy - 144, color: 0xFF006E },
    ];
    buttons.forEach((btn) => {
      const w = btn.id === 'exit' ? 72 : 104;
      const h = 24;
      const shape = this.add.rectangle(btn.x, btn.y, w, h, 0x1a1f2a, 0.95)
        .setStrokeStyle(2, btn.color, 0.8)
        .setScrollFactor(0);
      const txt = this.add.text(btn.x, btn.y, btn.label, {
        fontSize: '6px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#FFFFFF',
      }).setOrigin(0.5).setScrollFactor(0);
      this.farmButtonHitboxes.push({ id: btn.id, rect: new Phaser.Geom.Rectangle(btn.x - w / 2, btn.y - h / 2, w, h) });
      container.add([shape, txt]);
    });

    container.add([bg, panel, title, this.farmInfoText, this.farmActionText]);
    this.farmOverlay = container;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.farmOpen) return;
      const sx = pointer.x;
      const sy = pointer.y;
      for (let i = 0; i < this.farmSlotHitboxes.length; i += 1) {
        if (this.farmSlotHitboxes[i].contains(sx, sy)) {
          this.selectedFarmSlot = i;
          this.refreshFarmOverlay();
          return;
        }
      }
      const hit = this.farmButtonHitboxes.find((button) => button.rect.contains(sx, sy));
      if (!hit) return;
      if (hit.id === 'seed') {
        this.selectedSeedIndex = (this.selectedSeedIndex + 1) % FARM_SEEDS.length;
        this.refreshFarmOverlay();
      } else if (hit.id === 'plant') {
        this.plantInSelectedSlot();
      } else if (hit.id === 'water') {
        this.waterSelectedSlot();
      } else if (hit.id === 'harvest') {
        this.harvestSelectedSlot();
      } else if (hit.id === 'exit') {
        this.closeFarmOverlay();
      }
    });
  }

  private openFarmOverlay() {
    if (!this.farmOverlay) return;
    this.farmOpen = true;
    this.farmOverlay.setVisible(true);
    this.refreshFarmOverlay();
  }

  private closeFarmOverlay() {
    this.farmOpen = false;
    this.farmOverlay?.setVisible(false);
  }

  private updateFarmOverlay() {
    if (this.controls.isMovementDirectionJustDown('left')) {
      this.selectedFarmSlot = (this.selectedFarmSlot + FARM_SLOTS - 1) % FARM_SLOTS;
      this.refreshFarmOverlay();
    } else if (this.controls.isMovementDirectionJustDown('right')) {
      this.selectedFarmSlot = (this.selectedFarmSlot + 1) % FARM_SLOTS;
      this.refreshFarmOverlay();
    } else if (this.controls.isMovementDirectionJustDown('up')) {
      this.selectedSeedIndex = (this.selectedSeedIndex + FARM_SEEDS.length - 1) % FARM_SEEDS.length;
      this.refreshFarmOverlay();
    } else if (this.controls.isMovementDirectionJustDown('down')) {
      this.selectedSeedIndex = (this.selectedSeedIndex + 1) % FARM_SEEDS.length;
      this.refreshFarmOverlay();
    }
  }

  private handleFarmPrimaryAction() {
    if (!this.vecindadState.ownedParcelId) {
      eventBus.emit(EVENTS.UI_NOTICE, 'Primero necesitas comprar una parcela.');
      return;
    }
    if (!this.vecindadState.cannabisFarmUnlocked) {
      this.requestFarmAction({ action: 'farm_unlock' });
      return;
    }
    if (!this.farmOpen) this.openFarmOverlay();
    else this.plantInSelectedSlot();
  }

  private requestFarmAction(payload: FarmActionRequest) {
    eventBus.emit(EVENTS.FARM_ACTION_REQUEST, payload);
  }

  private getFarmPlants(): FarmPlant[] {
    return (this.vecindadState.farmPlants ?? []) as FarmPlant[];
  }

  private setFarmPlants(plants: FarmPlant[], notice?: string) {
    this.vecindadState = {
      ...this.vecindadState,
      farmPlants: plants,
    };
    eventBus.emit(EVENTS.VECINDAD_UPDATE_REQUEST, {
      vecindad: this.vecindadState,
      notice,
    });
    this.refreshFarmOverlay();
  }

  private getPlantBySlot(slotIndex: number) {
    return this.getFarmPlants().find((plant) => plant.slotIndex === slotIndex);
  }

  private getSeedConfig(seedType: SeedType) {
    return FARM_SEEDS.find((seed) => seed.type === seedType) ?? FARM_SEEDS[0];
  }

  private getPlantStage(plant: FarmPlant) {
    const config = this.getSeedConfig(plant.seedType);
    const elapsed = Date.now() - plant.plantedAt;
    const ratio = elapsed / config.growthMs;
    const effectiveRatio = plant.waterCount >= 1 ? ratio : ratio * 0.5;
    if (effectiveRatio < 0.25) return 'sprout';
    if (effectiveRatio < 0.5) return 'seedling';
    if (effectiveRatio < 1) return 'growing';
    return 'flowering';
  }

  private getPlantRemainingMs(plant: FarmPlant) {
    const config = this.getSeedConfig(plant.seedType);
    const elapsed = Date.now() - plant.plantedAt;
    const ratio = elapsed / config.growthMs;
    const effectiveRatio = plant.waterCount >= 1 ? ratio : ratio * 0.5;
    if (effectiveRatio >= 1) return 0;
    const ratioNeeded = 1 - effectiveRatio;
    return Math.max(0, Math.floor(ratioNeeded * config.growthMs));
  }

  private formatMs(ms: number) {
    if (ms <= 0) return 'LISTA';
    const minutes = Math.ceil(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `${hours}h ${rem}m`;
  }

  private refreshFarmOverlay() {
    if (!this.farmOverlay || !this.farmInfoText || !this.farmActionText) return;
    const plants = this.getFarmPlants();
    const selectedSeed = FARM_SEEDS[this.selectedSeedIndex];
    for (let i = 0; i < this.farmSlots.length; i += 1) {
      const slotRect = this.farmSlots[i];
      const label = this.farmSlotLabels[i];
      const plant = plants.find((entry) => entry.slotIndex === i);
      const selected = this.selectedFarmSlot === i;
      slotRect.setStrokeStyle(2, selected ? 0xF5C842 : 0x5b4632, 0.95);
      if (!plant) {
        slotRect.setFillStyle(0x2b2018, 0.98);
        label.setText(`SLOT ${i + 1}\nVACIO`).setColor('#A2B59C');
      } else {
        const stage = this.getPlantStage(plant);
        const timeLeft = this.formatMs(this.getPlantRemainingMs(plant));
        const stageColor = stage === 'flowering' ? '#39FF14' : stage === 'growing' ? '#B9FF9E' : '#46B3FF';
        slotRect.setFillStyle(stage === 'flowering' ? 0x1d3f20 : 0x23331f, 0.98);
        label.setText(`${this.getSeedConfig(plant.seedType).label}\n${stage.toUpperCase()} ${timeLeft}`).setColor(stageColor);
      }
    }

    const selectedPlant = this.getPlantBySlot(this.selectedFarmSlot);
    const selectedStage = selectedPlant ? this.getPlantStage(selectedPlant) : 'empty';
    this.farmInfoText.setText([
      `TENKS ${getTenksBalance()} | SLOT ${this.selectedFarmSlot + 1}/${FARM_SLOTS}`,
      `SEMILLA ${selectedSeed.label} COSTO ${selectedSeed.cost}T`,
    ]);
    this.farmActionText.setText([
      `ESTADO ${selectedStage.toUpperCase()} | PLANTAS ${plants.length}/${FARM_SLOTS}`,
      '< > SLOT   ^ v SEMILLA   E ACCION PRIMARIA   SPACE SALIR',
    ]);
  }

  private plantInSelectedSlot() {
    const plants = this.getFarmPlants();
    if (plants.some((plant) => plant.slotIndex === this.selectedFarmSlot)) {
      eventBus.emit(EVENTS.UI_NOTICE, 'Ese slot ya tiene una planta.');
      return;
    }
    const seed = FARM_SEEDS[this.selectedSeedIndex];
    this.requestFarmAction({
      action: 'farm_plant',
      slotIndex: this.selectedFarmSlot,
      seedType: seed.type,
    });
  }

  private waterSelectedSlot() {
    const plants = this.getFarmPlants();
    const plant = plants.find((entry) => entry.slotIndex === this.selectedFarmSlot);
    if (!plant) {
      eventBus.emit(EVENTS.UI_NOTICE, 'No hay planta en ese slot.');
      return;
    }
    const stage = this.getPlantStage(plant);
    if (stage === 'flowering') {
      eventBus.emit(EVENTS.UI_NOTICE, 'Ya esta lista para cosechar.');
      return;
    }
    this.requestFarmAction({
      action: 'farm_water',
      slotIndex: this.selectedFarmSlot,
    });
  }

  private harvestSelectedSlot() {
    const plants = this.getFarmPlants();
    const plant = plants.find((entry) => entry.slotIndex === this.selectedFarmSlot);
    if (!plant) {
      eventBus.emit(EVENTS.UI_NOTICE, 'No hay planta para cosechar.');
      return;
    }
    const stage = this.getPlantStage(plant);
    if (stage !== 'flowering') {
      eventBus.emit(EVENTS.UI_NOTICE, 'Aun no esta lista para cosecha.');
      return;
    }
    this.requestFarmAction({
      action: 'farm_harvest',
      slotIndex: this.selectedFarmSlot,
    });
  }

  private collectMaterial(node: MaterialNode) {
    node.available = false;
    // Slight respawn variance keeps routes dynamic and avoids robotic loops.
    node.respawnAt = this.time.now + Phaser.Math.Between(18000, 26000);
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
      notice: `Cache del bosque +${node.value} materiales`,
    });
  }

  private buildOwnedParcel() {
    if (!this.vecindadState.ownedParcelId) return;
    const currentStage = normalizeVecindadBuildStage(this.vecindadState.buildStage);
    if (currentStage >= MAX_VECINDAD_STAGE) {
      eventBus.emit(EVENTS.UI_NOTICE, 'Tu casa ya esta al maximo.');
      return;
    }

    const cost = getNextVecindadBuildCost(currentStage);
    if (this.vecindadState.materials < cost) {
      eventBus.emit(EVENTS.UI_NOTICE, `Necesitas ${cost} materiales para seguir construyendo.`);
      return;
    }

    eventBus.emit(EVENTS.PARCEL_BUILD_REQUEST);
  }

  private getNearbyParcel() {
    let best: VecindadParcelConfig | undefined;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const parcel of VECINDAD_PARCELS) {
      const insideRange =
        this.px >= parcel.x - 34 &&
        this.px <= parcel.x + parcel.w + 34 &&
        this.py >= parcel.y - 34 &&
        this.py <= parcel.y + parcel.h + 34;
      if (!insideRange) continue;

      const centerX = parcel.x + parcel.w / 2;
      const centerY = parcel.y + parcel.h / 2;
      const dist = Phaser.Math.Distance.Between(this.px, this.py, centerX, centerY);
      if (dist < bestDist) {
        bestDist = dist;
        best = parcel;
      }
    }

    return best;
  }

  private isNearHouseDoor(parcel: VecindadParcelConfig) {
    const doorX = parcel.x + parcel.w / 2;
    const doorY = parcel.y + parcel.h - 18;
    return Phaser.Math.Distance.Between(this.px, this.py, doorX, doorY) < 74;
  }

  private isNearExitGate() {
    return this.px < 240 && this.py > 790 && this.py < 1110;
  }

  private leaveToWorld() {
    if (this.inTransition) return;
    this.inTransition = true;
    transitionToScene(this, 'WorldScene', {
      returnX: VECINDAD_MAP.RETURN_WORLD_X,
      returnY: VECINDAD_MAP.RETURN_WORLD_Y,
    }, 240);
  }

  private handleMovement(delta: number) {
    const isSprinting = !!this.shiftKey?.isDown;
    const effectiveSpeed = VecindadScene.MOVE_SPEED * (isSprinting ? VecindadScene.SPRINT_MULTIPLIER : 1);
    const speed = (effectiveSpeed * delta) / 1000;
    let { dx, dy } = this.controls.readMovement(true);
    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    this.px = Phaser.Math.Clamp(this.px + dx * speed, 84, VECINDAD_MAP.WIDTH - 84);
    this.py = Phaser.Math.Clamp(this.py + dy * speed, 84, VECINDAD_MAP.HEIGHT - 84);

    this.player.update(dx !== 0 || dy !== 0, dx, dy);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(50 + Math.floor(this.py / 10));
    this.lastMoveDx = dx;
    this.lastMoveDy = dy;
    this.lastIsMoving = dx !== 0 || dy !== 0;
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
        cannabisFarmUnlocked: Boolean(parsed.vecindad?.cannabisFarmUnlocked),
        farmPlants: Array.isArray(parsed.vecindad?.farmPlants)
          ? parsed.vecindad.farmPlants.filter((entry): entry is FarmPlant =>
              Boolean(entry)
              && typeof entry === 'object'
              && typeof (entry as FarmPlant).slotIndex === 'number'
              && typeof (entry as FarmPlant).seedType === 'string'
              && typeof (entry as FarmPlant).plantedAt === 'number'
              && typeof (entry as FarmPlant).waterCount === 'number'
            )
          : [],
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

  private handleSceneShutdown() {
    if (this.parcelRefreshTimeout) {
      clearTimeout(this.parcelRefreshTimeout);
      this.parcelRefreshTimeout = undefined;
    }

    try {
      void this.realtimeChannel?.unsubscribe();
      this.realtimeChannel = null;
    } catch (e) { console.error('[VecindadScene] realtimeChannel cleanup failed', e); }

    try {
      this.room?.shutdown();
      this.room = undefined;
    } catch (e) { console.error('[VecindadScene] room shutdown failed', e); }

    try {
      this.bridgeCleanupFns.forEach((cleanup) => cleanup());
      this.bridgeCleanupFns = [];
    } catch (e) { console.error('[VecindadScene] bridgeCleanupFns failed', e); }
  }
}
