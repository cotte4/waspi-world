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
import { SkillTreePanel } from '../systems/SkillTreePanel';
import { SkillShopPanel } from '../systems/SkillShopPanel';
import { getSkillSystem } from '../systems/SkillSystem';
import { getContractSystem } from '../systems/ContractSystem';
import { ContractPanel } from '../systems/ContractPanel';
import { getQuestSystem } from '../systems/QuestSystem';
import { QuestPanel } from '../systems/QuestPanel';
import { FishingMinigame } from '../systems/FishingMinigame';
import { FishCompendiumPanel } from '../systems/FishCompendiumPanel';
import { pickFishForZone } from '../config/fishSpecies';
import { getAuthHeaders } from '../systems/authHelper';
import { getMasterySystem } from '../systems/MasterySystem';
import { getEventSystem } from '../systems/EventSystem';
import { SpecializationModal } from '../systems/SpecializationModal';
import type { SkillId } from '../systems/SkillSystem';
import { getWeedDeliverySystem } from '../systems/WeedDeliverySystem';
import type { WeedNpcId, WeedOrder } from '../systems/WeedDeliverySystem';
import { WorldMapPanel } from '../systems/WorldMapPanel';
import { EmotePanel, showEmoteBubble, type EmoteId } from '../systems/EmoteSystem';

type ParcelVisual = {
  title: Phaser.GameObjects.Text;
  owner: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
  structure: Phaser.GameObjects.Graphics;
};


type VecindadSceneData = {
  returnX?: number;
  returnY?: number;
  materialsCollected?: number;
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
const WEED_SEED_TYPES = new Set<SeedType>(['basica', 'indica', 'sativa', 'purple_haze', 'og_kush']);

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
  private static readonly FISHING_SPOT      = { x: 2440, y: 1540, range: 80 };
  // Deep spot — unlocked at Fishing Lv3; better quality odds
  private static readonly FISHING_SPOT_DEEP = { x: 2440, y: 1568, range: 50 };
  // Weed Lv4 — pop-up trade stall near central plaza
  private static readonly PUESTO_SPOT = { x: 1400, y: 820, range: 72 };
  private static readonly PUESTO_DURATION_MS = 5 * 60 * 1000; // 5 min
  private static readonly PUESTO_XP_INTERVAL_MS = 60_000;     // XP/min
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
  private fishingActive = false;
  private puestoOpen = false;
  private puestoXpTimer?: Phaser.Time.TimerEvent;
  private puestoAutoCloseTimer?: Phaser.Time.TimerEvent;
  private puestoGlow?: Phaser.GameObjects.Graphics;
  private puestoTimeText?: Phaser.GameObjects.Text;
  private pendingMaterials = 0;
  private activeFishingMinigame: FishingMinigame | null = null;
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
  private skillTreePanel?: SkillTreePanel;
  private skillShopPanel?: SkillShopPanel;
  private contractPanel?: ContractPanel;
  private questPanel?: QuestPanel;
  private worldMapPanel?: WorldMapPanel;
  private keyT?: Phaser.Input.Keyboard.Key;
  private keyY?: Phaser.Input.Keyboard.Key;
  private keyC?: Phaser.Input.Keyboard.Key;
  private keyQ?: Phaser.Input.Keyboard.Key;
  private keyF?: Phaser.Input.Keyboard.Key;
  private keyG?: Phaser.Input.Keyboard.Key;
  private keyM?: Phaser.Input.Keyboard.Key;
  private emotePanel?: EmotePanel;
  private fishPanel?: FishCompendiumPanel;
  /** True while FishingMinigame is active — used by enemy systems to suppress attacks. */
  playerBusy = false;
  private specModal?: SpecializationModal;

  // ── Weed Delivery NPCs ────────────────────────────────────────────────────
  private weedNpcBubbles: Map<WeedNpcId, Phaser.GameObjects.Container> = new Map();
  private weedDeliveryDialogOpen = false;
  private weedDeliveryDialogNpcId: WeedNpcId | null = null;
  private weedDeliveryDialogBg?: Phaser.GameObjects.Rectangle;
  private weedDeliveryDialogText?: Phaser.GameObjects.Text;
  private weedDeliveryDialogHint?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'VecindadScene' });
  }

  init(data?: VecindadSceneData) {
    this.inTransition = false;
    this.px = data?.returnX ?? VECINDAD_MAP.SPAWN_X;
    this.py = data?.returnY ?? VECINDAD_MAP.SPAWN_Y;
    if (data?.materialsCollected && data.materialsCollected > 0) {
      this.pendingMaterials = data.materialsCollected;
    }
  }

  create() {
    announceScene(this);
    this.input.enabled = true;
    this.controls = new SceneControls(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.inTransition = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });
    this.loadVecindadState();

    if (this.pendingMaterials > 0) {
      this.vecindadState = {
        ...this.vecindadState,
        materials: this.vecindadState.materials + this.pendingMaterials,
      };
      eventBus.emit(EVENTS.VECINDAD_UPDATE_REQUEST, {
        vecindad: this.vecindadState,
        notice: `+${this.pendingMaterials} materiales del bosque`,
      });
      this.pendingMaterials = 0;
    }

    this.drawDistrict();
    this.drawParcels();
    this.createPlayer();
    this.setupUi();
    this.createFarmOverlay();
    this.createWeedDeliveryNpcs();
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
    this.skillTreePanel = new SkillTreePanel(this);
    this.skillShopPanel = new SkillShopPanel(this);
    this.contractPanel  = new ContractPanel(this);
    this.questPanel     = new QuestPanel(this);
    this.fishPanel      = new FishCompendiumPanel(this);
    this.specModal      = new SpecializationModal(this);
    this.worldMapPanel  = new WorldMapPanel(this);
    this.keyT = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.keyY = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Y);
    this.keyC = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyQ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyF = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyG = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.keyM = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    // Emote panel
    this.emotePanel = new EmotePanel(this, (id: EmoteId | null) => {
      if (!id) return;
      const container = this.player.getContainer();
      showEmoteBubble(this, container.x, container.y, id);
    });
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
    // Weed delivery dialog swallows E and Space while open
    if (this.weedDeliveryDialogOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
        void this.confirmWeedDelivery();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
        this.closeWeedDeliveryDialog();
      }
      return;
    }

    this.handleMovement(delta);
    this.room?.update();
    this.updatePrompt();
    this.checkForestEntry();
    this.updateWeedNpcBubbles();

    if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
      const nearNpc = this.getNearbyWeedNpc();
      if (nearNpc) {
        this.handleWeedNpcInteract(nearNpc);
        return;
      }
      this.handlePrimaryAction();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.handleSecondaryAction();
    }
    if (this.keyT && Phaser.Input.Keyboard.JustDown(this.keyT)) {
      this.skillTreePanel?.toggle();
    }
    if (this.keyY && Phaser.Input.Keyboard.JustDown(this.keyY)) {
      this.skillShopPanel?.toggle();
    }
    if (this.keyC && Phaser.Input.Keyboard.JustDown(this.keyC)) {
      this.contractPanel?.toggle();
    }
    if (this.keyQ && Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      this.questPanel?.toggle();
    }
    if (this.keyM && Phaser.Input.Keyboard.JustDown(this.keyM)) {
      this.worldMapPanel?.toggle();
    }
    if (this.keyF && Phaser.Input.Keyboard.JustDown(this.keyF)) {
      // Only open Acuario when near the fishing dock/pond
      const fs = VecindadScene.FISHING_SPOT;
      const ds = VecindadScene.FISHING_SPOT_DEEP;
      const nearPond =
        Phaser.Math.Distance.Between(this.px, this.py, fs.x, fs.y) < fs.range ||
        Phaser.Math.Distance.Between(this.px, this.py, ds.x, ds.y) < ds.range + 30;
      if (nearPond || this.fishPanel?.isVisible()) {
        this.fishPanel?.toggle();
      }
    }
    // G → emote picker
    if (this.keyG && Phaser.Input.Keyboard.JustDown(this.keyG)) {
      const container = this.player.getContainer();
      this.emotePanel?.toggle(container.x, container.y);
    }
  }

  private drawDistrict() {
    const g = this.add.graphics();
    g.fillStyle(0x0b1a0b, 1);
    g.fillRect(0, 0, VECINDAD_MAP.WIDTH, VECINDAD_MAP.HEIGHT);

    // Night gradient over the full district so lights pop.
    g.fillStyle(0x05080f, 0.32);
    g.fillRect(0, 0, VECINDAD_MAP.WIDTH, 520);
    g.fillStyle(0x06100a, 0.18);
    g.fillRect(0, 520, VECINDAD_MAP.WIDTH, 420);

    g.fillStyle(0x0a130a, 0.8);
    g.fillRect(0, 0, VECINDAD_MAP.WIDTH, 180);

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

    // Entrance strips and sign glow.
    g.fillStyle(0xf5c842, 0.08);
    g.fillRect(76, 860, 156, 12);
    g.fillRect(76, 890, 156, 12);

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
    this.drawDistrictProps(g);
    this.drawAmbientOverlays();
    this.drawFishingPond(g);
    this.drawPuestoSpot(g);

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
    // Portal gate al bosque (reemplaza el forest strip embebido)
    const portalG = this.add.graphics().setDepth(1);
    portalG.fillStyle(0x0f2a11, 0.9);
    portalG.fillRoundedRect(1300, 60, 200, 80, 12);
    portalG.lineStyle(2, 0xF5C842, 0.8);
    portalG.strokeRoundedRect(1300, 60, 200, 80, 12);
    portalG.fillStyle(0xF5C842, 0.08);
    portalG.fillRect(1302, 62, 196, 76);

    this.add.text(1400, 90, '▲ BOSQUE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    this.add.text(1400, 118, 'ENTRAR AL BOSQUE DE MATERIALES', {
      fontSize: '5px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#8DE17A',
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(2);

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

  private drawDistrictProps(g: Phaser.GameObjects.Graphics) {
    // Benches around central plaza ring.
    const benches = [
      { x: 1240, y: 1030 },
      { x: 1560, y: 1030 },
      { x: 1240, y: 890 },
      { x: 1560, y: 890 },
    ];
    benches.forEach((bench) => {
      g.fillStyle(0x4f3a25, 1);
      g.fillRoundedRect(bench.x - 34, bench.y - 8, 68, 16, 4);
      g.fillStyle(0x2f2317, 1);
      g.fillRect(bench.x - 28, bench.y + 8, 8, 10);
      g.fillRect(bench.x + 20, bench.y + 8, 8, 10);
      g.lineStyle(1, 0x7b5a3a, 0.65);
      g.strokeRoundedRect(bench.x - 34, bench.y - 8, 68, 16, 4);
    });

    // Small kiosks / neighborhood stands.
    const kiosks = [
      { x: 650, y: 920, tint: 0x46B3FF },
      { x: 2140, y: 920, tint: 0xF5C842 },
    ];
    kiosks.forEach((kiosk, i) => {
      g.fillStyle(0x1b2420, 0.96);
      g.fillRoundedRect(kiosk.x - 56, kiosk.y - 40, 112, 68, 8);
      g.lineStyle(2, kiosk.tint, 0.75);
      g.strokeRoundedRect(kiosk.x - 56, kiosk.y - 40, 112, 68, 8);
      g.fillStyle(0x0e1713, 1);
      g.fillRect(kiosk.x - 44, kiosk.y - 18, 88, 22);
      g.fillStyle(kiosk.tint, 0.22);
      g.fillRect(kiosk.x - 48, kiosk.y - 34, 96, 8);
      this.add.text(kiosk.x, kiosk.y - 28, i === 0 ? 'MERCADITO' : 'REPAIRS', {
        fontSize: '5px',
        fontFamily: '"Press Start 2P", monospace',
        color: i === 0 ? '#6FC4FF' : '#F5C842',
      }).setOrigin(0.5).setDepth(2.2);
    });

    // Decorative trash bins / posts to make the roads feel lived-in.
    const posts = [
      { x: 410, y: 960 }, { x: 930, y: 960 }, { x: 1880, y: 960 }, { x: 2360, y: 960 },
      { x: 920, y: 420 }, { x: 1810, y: 420 }, { x: 920, y: 1460 }, { x: 1810, y: 1460 },
    ];
    posts.forEach((post) => {
      g.fillStyle(0x2b2f36, 1);
      g.fillRoundedRect(post.x - 8, post.y - 10, 16, 20, 4);
      g.lineStyle(1, 0x5c6678, 0.7);
      g.strokeRoundedRect(post.x - 8, post.y - 10, 16, 20, 4);
      g.fillStyle(0x8ea4c4, 0.25);
      g.fillRect(post.x - 6, post.y - 7, 12, 3);
    });
  }

  private drawAmbientOverlays() {
    // Soft vignette on edges to focus action toward center and forest path.
    const v = this.add.graphics().setDepth(0.2);
    const cx = VECINDAD_MAP.WIDTH / 2;
    const cy = VECINDAD_MAP.HEIGHT / 2;
    const baseR = Math.max(VECINDAD_MAP.WIDTH, VECINDAD_MAP.HEIGHT) * 0.85;
    for (let i = 0; i < 5; i += 1) {
      const t = i / 4;
      v.fillStyle(0x000000, 0.03 + t * 0.08);
      v.fillCircle(cx, cy, baseR * (1.05 - t * 0.4));
    }

    // Animated light haze around central plaza.
    const haze = this.add.ellipse(1400, 960, 540, 240, 0x6CA86A, 0.08).setDepth(0.25);
    this.tweens.add({
      targets: haze,
      alpha: { from: 0.05, to: 0.12 },
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawFishingPond(g: Phaser.GameObjects.Graphics) {
    const { x, y } = VecindadScene.FISHING_SPOT;
    const ds = VecindadScene.FISHING_SPOT_DEEP;
    // Pond water
    g.fillStyle(0x0a2233, 1);
    g.fillEllipse(x, y, 180, 100);
    g.lineStyle(2, 0x1A4A6A, 0.9);
    g.strokeEllipse(x, y, 180, 100);
    // Deep zone — darker inner circle
    g.fillStyle(0x061422, 1);
    g.fillEllipse(ds.x, ds.y, 80, 44);
    g.lineStyle(1, 0x2A6A8A, 0.6);
    g.strokeEllipse(ds.x, ds.y, 80, 44);
    // Water shimmer lines
    g.lineStyle(1, 0x2A6A8A, 0.45);
    g.lineBetween(x - 55, y - 8, x + 30, y - 8);
    g.lineBetween(x - 40, y + 6, x + 55, y + 6);
    // Glow
    g.fillStyle(0x1A6A9A, 0.08);
    g.fillEllipse(x, y, 220, 130);
    // Pier
    g.fillStyle(0x5a3a1a, 1);
    g.fillRoundedRect(x - 8, y - 62, 16, 56, 4);
    g.fillRoundedRect(x - 30, y - 68, 60, 10, 4);
    // Labels
    this.add.text(x, y - 76, '🎣 PESCAR [E]', {
      fontSize: '7px', fontFamily: '"Press Start 2P", monospace',
      color: '#4A9ECC', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);
    this.add.text(ds.x, ds.y + 34, '🌊 PROFUNDO [E] LV3+', {
      fontSize: '5px', fontFamily: '"Press Start 2P", monospace',
      color: '#2A5A8A', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(2);
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
    if (!this.scene?.isActive('VecindadScene')) return;
    if (!res?.ok) return;
    const json = await res.json().catch(() => null) as { parcels?: SharedParcelState[] } | null;
    if (!this.scene?.isActive('VecindadScene')) return;
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

  private updatePrompt() {
    if (!this.promptText) return;

    if (this.isNearExitGate()) {
      this.promptText.setText('SPACE VOLVER A PLAZA');
      this.promptText.setColor('#F5C842');
      return;
    }

    const nearNpc = this.getNearbyWeedNpc();
    if (nearNpc) {
      const weedLv = getSkillSystem().getLevel('weed');
      const sys = getWeedDeliverySystem();
      if (!sys.canInteract(weedLv)) {
        this.promptText.setText('🌿 DEALER [WEED LV3 REQUERIDO]');
        this.promptText.setColor('#3a4a3a');
      } else if (sys.isOnCooldown(nearNpc)) {
        this.promptText.setText('🌿 DEALER | YA ENTREGASTE HOY');
        this.promptText.setColor('#556655');
      } else {
        this.promptText.setText('E HABLAR CON DEALER');
        this.promptText.setColor('#39FF14');
      }
      return;
    }

    if (this.isNearPuestoSpot()) {
      const weedLv = getSkillSystem().getLevel('weed');
      if (weedLv < 4) {
        this.promptText.setText('🌿 PUESTO [REQUIERE WEED LV4]');
        this.promptText.setColor('#3a4a3a');
      } else if (this.puestoOpen) {
        this.promptText.setText('E CERRAR PUESTO | SERVIENDO CLIENTES...');
        this.promptText.setColor('#39FF14');
      } else {
        this.promptText.setText('E ABRIR PUESTO (5 MIN) +XP WEED');
        this.promptText.setColor('#7bff7b');
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
    if (this.fishingActive) return;

    // Deep fishing spot (Lv3+) — check first since it sits inside the main pond range
    const ds = VecindadScene.FISHING_SPOT_DEEP;
    if (Phaser.Math.Distance.Between(this.px, this.py, ds.x, ds.y) < ds.range) {
      const fishLv = getSkillSystem().getLevel('fishing');
      const deepReq = getSkillSystem().getSpec('fishing') === 'fishing_baitmaster' ? 2 : 3;
      if (fishLv >= deepReq) {
        void this.handleFishing(true);
      } else {
        eventBus.emit(EVENTS.UI_NOTICE, { message: `🌊 REQUIERE PESCA LV${deepReq}`, color: '#2A5A8A' });
      }
      return;
    }

    // Regular fishing spot
    const fs = VecindadScene.FISHING_SPOT;
    if (Phaser.Math.Distance.Between(this.px, this.py, fs.x, fs.y) < fs.range) {
      void this.handleFishing(false);
      return;
    }

    if (this.isNearPuestoSpot()) {
      this.handlePuestoAction();
      return;
    }

    if (this.isNearOwnedFarmSpot()) {
      this.handleFarmPrimaryAction();
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
    transitionToScene(this, 'HouseInterior', {
      returnScene: 'VecindadScene',
      roomKey: `waspi-room-house-${parcel.id}`,
      houseLabel: ownerName,
      buildStage: getHouseInteriorStage(stage),
      returnX: parcel.x + parcel.w / 2,
      returnY: parcel.y + parcel.h - 28,
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

  private async handleFishing(deep = false): Promise<void> {
    this.fishingActive = true;
    // Signal to enemy systems that the player is occupied (suppress attacks)
    this.playerBusy = true;
    eventBus.emit(EVENTS.ACTIVITY_STARTED, { activity: 'fishing' });

    try {
      const sys = getSkillSystem();
      const fishingLevel = sys.getLevel('fishing');
      const isAutoMode = fishingLevel >= 4;
      const source = deep ? 'fish_catch_deep' : 'fish_catch';

      if (deep) {
        eventBus.emit(EVENTS.UI_NOTICE, { message: '🌊 Lanzado profundo...', color: '#4A9ECC' });
      }

      const minigame = new FishingMinigame(this);
      this.activeFishingMinigame = minigame;
      const result = await minigame.play(isAutoMode);
      minigame.destroy();
      this.activeFishingMinigame = null;

      if (result === 'miss') {
        eventBus.emit(EVENTS.UI_NOTICE, { message: '🎣 Se escapó...', color: '#888899' });
        return;
      }

      const isAuto = isAutoMode;
      const minigameBonus = result === 'perfect' ? 5 : result === 'good' ? 3 : 0;
      // Deep water gives a flat +6 XP bonus and uses a dedicated source for quality roll
      const deepBonus = deep ? 6 : 0;

      const qr = await sys.rollQuality('fishing', source, isAuto);
      void getContractSystem().trackAction('fish_catch', 'fishing', qr.quality);
      void getQuestSystem().trackAction('fish_catch', 'fishing');

      const label = deep ? `🌊 PROFUNDO [${qr.label}]` : `🐟 PESCADO [${qr.label}]`;
      eventBus.emit(EVENTS.UI_NOTICE, { message: label, color: qr.color });

      if (!this.scene?.isActive('VecindadScene')) return;

      // ── Fish Compendium: record catch server-side ─────────────────────────
      // Pick a species weighted by zone + rarity, POST to /api/fishing/collection.
      // XP bonus for a new species is returned by the server and shown as UI_NOTICE.
      const caughtSpecies = pickFishForZone(deep ? 'deep' : 'pond');
      void this._recordFishCatch(caughtSpecies.id, qr.quality, undefined);

      const eventMult = getEventSystem().getXpMultiplier('fishing');
      // gourmet_del_mar sinergia: +25% XP al pescar
      const gourmetMult = sys.hasSynergy('gourmet_del_mar') ? 1.25 : 1;
      const xpTotal = Math.round((12 + qr.xp_bonus + minigameBonus + deepBonus) * eventMult * gourmetMult);
      const xpResult = await sys.addXp('fishing', xpTotal, source);
      if (xpResult.leveled_up) {
        eventBus.emit(EVENTS.UI_NOTICE, { message: `🎣 PESCA LVL ${xpResult.new_level}!`, color: '#4A9ECC' });
        this.maybeShowSpecModal('fishing', xpResult.new_level);
      }
      if (sys.getLevel('fishing') >= 5) {
        void getMasterySystem().earnMp('fishing');
      }

      if (!this.scene?.isActive('VecindadScene')) return;

      if (qr.quality === 'legendary') {
        this.cameras.main.flash(400, 74, 159, 204, false);
        eventBus.emit(EVENTS.UI_NOTICE, { message: '✨ PESCA LEGENDARIA!', color: '#4A9ECC' });
      }
    } finally {
      // Always release the locks so future fishing interactions aren't blocked
      this.fishingActive = false;
      this.playerBusy = false;
      this.activeFishingMinigame = null;
      eventBus.emit(EVENTS.ACTIVITY_STOPPED, { activity: 'fishing' });
    }
  }

  /**
   * POST a fish catch to /api/fishing/collection.
   * If it's a new species, the server returns xp_bonus > 0 — show it as UI_NOTICE.
   * Guard: skip silently if the scene is no longer active when the response arrives.
   */
  private async _recordFishCatch(
    fishId: string,
    quality: string | undefined,
    size: number | undefined,
  ): Promise<void> {
    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/fishing/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ fish_id: fishId, quality: quality ?? null, size: size ?? null }),
      });

      if (!res.ok) return;

      const data = (await res.json()) as {
        is_new: boolean;
        xp_bonus: number;
        fish_name: string;
      };

      // Guard: scene may have been destroyed while the fetch was in-flight
      if (!this.scene?.isActive('VecindadScene')) return;

      if (data.is_new && data.xp_bonus > 0) {
        eventBus.emit(EVENTS.UI_NOTICE, {
          message: `🐟 NUEVO: ${data.fish_name}! +${data.xp_bonus} XP`,
          color: '#4A9ECC',
        });
      }
    } catch (err) {
      console.warn('[VecindadScene] _recordFishCatch failed:', err);
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

    // Gardening XP always; Weed XP only for cannabis seeds
    const grantPlantSkillXp = (skill: 'gardening' | 'weed') =>
      getSkillSystem()
        .addXp(skill, 5, 'farm_plant')
        .then((r) => {
          if (r.leveled_up) {
            const label = skill === 'gardening' ? '🌿 JARDINERÍA' : '🌿 WEED';
            eventBus.emit(EVENTS.UI_NOTICE, { message: `${label} LVL ${r.new_level}!`, color: '#39FF14' });
            this.maybeShowSpecModal(skill, r.new_level);
          }
        })
        .catch(() => undefined);
    void grantPlantSkillXp('gardening');
    if (WEED_SEED_TYPES.has(seed.type)) void grantPlantSkillXp('weed');
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

    // Quality roll + XP — fire and forget
    const isWeed = WEED_SEED_TYPES.has(plant.seedType);
    void (async () => {
      const sys = getSkillSystem();
      const skillId = isWeed ? 'weed' : 'gardening';

      // Roll quality server-side using the dominant skill for this plant
      const qr = await sys.rollQuality(skillId, 'farm_harvest');

      // Track harvest for contracts (gardening + weed if cannabis)
      void getContractSystem().trackAction('farm_harvest', 'gardening', qr.quality);
      if (isWeed) void getContractSystem().trackAction('farm_harvest', 'weed', qr.quality);
      // Track harvest for daily quests
      void getQuestSystem().trackAction('farm_harvest', 'gardening');
      if (isWeed) void getQuestSystem().trackAction('farm_harvest', 'weed');

      // Quality feedback
      const qualityMsg = `COSECHA [${qr.label}]`;
      eventBus.emit(EVENTS.UI_NOTICE, { message: qualityMsg, color: qr.color });

      if (qr.quality === 'legendary') {
        eventBus.emit(EVENTS.UI_NOTICE, { message: '✨ COSECHA LEGENDARIA!', color: '#F5C842' });
      }

      // XP: base 15 + quality bonus × event multiplier; gardening always, weed only if cannabis
      // huerto_propio sinergia: +30% XP de jardinería al cosechar
      const gardenEventMult = getEventSystem().getXpMultiplier('gardening');
      const huertoMult = sys.hasSynergy('huerto_propio') ? 1.3 : 1;
      const xpTotal = Math.round((15 + qr.xp_bonus) * gardenEventMult * huertoMult);
      const gardenResult = await sys.addXp('gardening', xpTotal, 'farm_harvest');
      if (gardenResult.leveled_up) {
        eventBus.emit(EVENTS.UI_NOTICE, { message: `🌿 JARDINERÍA LVL ${gardenResult.new_level}!`, color: '#39FF14' });
        this.maybeShowSpecModal('gardening', gardenResult.new_level);
      }
      if (sys.getLevel('gardening') >= 5) void getMasterySystem().earnMp('gardening');

      if (isWeed) {
        // Use the weed-specific event multiplier, not the gardening one
        const weedEventMult = getEventSystem().getXpMultiplier('weed');
        // grower spec: +25% XP on cannabis harvest
        const weedBaseXp = sys.getSpec('weed') === 'weed_grower'
          ? Math.round((15 + qr.xp_bonus) * 1.25 * weedEventMult)
          : Math.round((15 + qr.xp_bonus) * weedEventMult);
        const weedResult = await sys.addXp('weed', weedBaseXp, 'farm_harvest');
        if (weedResult.leveled_up) {
          eventBus.emit(EVENTS.UI_NOTICE, { message: `🌿 WEED LVL ${weedResult.new_level}!`, color: '#39FF14' });
          this.maybeShowSpecModal('weed', weedResult.new_level);
        }
        if (sys.getLevel('weed') >= 5) void getMasterySystem().earnMp('weed');
      }
    })();
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

  private checkForestEntry() {
    if (this.py < 155 && this.px > 1300 && this.px < 1500) {
      if (this.inTransition) return;
      this.inTransition = true;
      transitionToScene(this, 'BosqueMaterialesScene', {
        returnX: undefined,
        returnY: undefined,
      });
    }
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
    if (this.fishingActive) return;
    const isSprinting = !!this.shiftKey?.isDown;
    const sys = getSkillSystem();
    const speedPct = sys.getPassiveBuffTotal('speed') + sys.getSynergyBuff('speed');
    const effectiveSpeed = VecindadScene.MOVE_SPEED * (1 + speedPct / 100) * (isSprinting ? VecindadScene.SPRINT_MULTIPLIER : 1);
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

  // ─── Weed Lv4 Puesto ──────────────────────────────────────────────────────

  private drawPuestoSpot(g: Phaser.GameObjects.Graphics) {
    const { x, y } = VecindadScene.PUESTO_SPOT;
    // Stall frame — always visible
    g.fillStyle(0x1b2a1b, 0.92);
    g.fillRoundedRect(x - 64, y - 36, 128, 56, 8);
    g.lineStyle(2, 0x2a4a2a, 0.7);
    g.strokeRoundedRect(x - 64, y - 36, 128, 56, 8);
    g.fillStyle(0x2e3e2e, 0.6);
    g.fillRect(x - 58, y - 30, 116, 10); // awning strip
    g.lineStyle(1, 0x3a5a3a, 0.5);
    g.lineBetween(x - 58, y - 20, x + 58, y - 20);

    this.add.text(x, y - 16, '🌿 PUESTO', {
      fontSize: '6px', fontFamily: '"Press Start 2P", monospace',
      color: '#2a3e2a', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);
    this.add.text(x, y + 4, 'WEED LV4', {
      fontSize: '5px', fontFamily: '"Press Start 2P", monospace',
      color: '#223022', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(2);

    // Dynamic glow layer (hidden until open)
    this.puestoGlow = this.add.graphics().setDepth(1.8);
    this.puestoTimeText = this.add.text(x, y - 52, '', {
      fontSize: '6px', fontFamily: '"Press Start 2P", monospace',
      color: '#39FF14', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3).setScrollFactor(1);
  }

  private isNearPuestoSpot() {
    const { x, y, range } = VecindadScene.PUESTO_SPOT;
    return Phaser.Math.Distance.Between(this.px, this.py, x, y) < range;
  }

  private handlePuestoAction() {
    const weedLv = getSkillSystem().getLevel('weed');
    if (weedLv < 4) {
      eventBus.emit(EVENTS.UI_NOTICE, { message: '🌿 REQUIERE WEED LV4', color: '#2a4a2a' });
      return;
    }
    if (this.puestoOpen) {
      this.closePuesto();
    } else {
      this.openPuesto();
    }
  }

  private openPuesto() {
    this.puestoOpen = true;
    const { x, y } = VecindadScene.PUESTO_SPOT;
    // Animated glow
    this.puestoGlow?.clear();
    this.puestoGlow?.fillStyle(0x39FF14, 0.12);
    this.puestoGlow?.fillRoundedRect(x - 68, y - 40, 136, 64, 10);
    this.puestoGlow?.lineStyle(2, 0x39FF14, 0.5);
    this.puestoGlow?.strokeRoundedRect(x - 68, y - 40, 136, 64, 10);
    this.tweens.add({
      targets: this.puestoGlow,
      alpha: { from: 0.7, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Passive XP every 60s
    this.puestoXpTimer = this.time.addEvent({
      delay: VecindadScene.PUESTO_XP_INTERVAL_MS,
      loop: true,
      callback: this.grantPuestoXp,
      callbackScope: this,
    });

    // Auto-close after 5 min; track start time for countdown display
    const openedAt = Date.now();
    this.puestoAutoCloseTimer = this.time.addEvent({
      delay: VecindadScene.PUESTO_DURATION_MS,
      callback: () => this.closePuesto(),
      callbackScope: this,
    });

    // Update countdown every second
    const countdownTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (!this.puestoOpen) { countdownTimer.remove(); return; }
        const remaining = Math.max(0, VecindadScene.PUESTO_DURATION_MS - (Date.now() - openedAt));
        const mins = Math.floor(remaining / 60_000);
        const secs = Math.floor((remaining % 60_000) / 1000);
        this.puestoTimeText?.setText(`⏱ ${mins}:${secs.toString().padStart(2, '0')}`);
      },
    });
    this.puestoTimeText?.setText(`⏱ 5:00`);

    eventBus.emit(EVENTS.UI_NOTICE, { message: '🌿 PUESTO ABIERTO! +XP POR MINUTO', color: '#39FF14' });
    eventBus.emit(EVENTS.ACTIVITY_STARTED, { activity: 'weed_puesto' });
  }

  private closePuesto() {
    this.puestoOpen = false;
    if (this.puestoGlow) this.tweens.killTweensOf(this.puestoGlow);
    this.puestoGlow?.clear();
    this.puestoXpTimer?.remove();
    this.puestoXpTimer = undefined;
    this.puestoAutoCloseTimer?.remove();
    this.puestoAutoCloseTimer = undefined;
    this.puestoTimeText?.setText('');
    eventBus.emit(EVENTS.UI_NOTICE, { message: '🌿 PUESTO CERRADO', color: '#3a5a3a' });
    eventBus.emit(EVENTS.ACTIVITY_STOPPED, { activity: 'weed_puesto' });
  }

  private grantPuestoXp() {
    if (!this.scene?.isActive('VecindadScene')) return;
    const sys = getSkillSystem();
    // cepa_cruzada sinergia: base XP 8→12 (dealer: 16→20)
    const hasCepa = sys.hasSynergy('cepa_cruzada');
    const isDealer = sys.getSpec('weed') === 'weed_dealer';
    const xpAmount = isDealer ? (hasCepa ? 20 : 16) : (hasCepa ? 12 : 8);
    void sys.addXp('weed', xpAmount, 'puesto_serve').then((r) => {
      if (!this.scene?.isActive('VecindadScene')) return;
      if (r.leveled_up) {
        eventBus.emit(EVENTS.UI_NOTICE, { message: `🌿 WEED LVL ${r.new_level}!`, color: '#39FF14' });
        this.maybeShowSpecModal('weed', r.new_level);
      }
    });
  }

  /** Shows the specialization modal if the player just hit Lv3 and hasn't chosen a spec yet. */
  private maybeShowSpecModal(skillId: SkillId, newLevel: number): void {
    if (newLevel !== 3) return;
    if (!this.scene?.isActive('VecindadScene')) return;
    const sys = getSkillSystem();
    if (!sys.hasSpec(skillId) && this.specModal && !this.specModal.isVisible()) {
      this.specModal.show(skillId);
    }
  }

  private handleSceneShutdown() {
    // Destroy any active fishing minigame so its SPACE key listener doesn't leak
    if (this.activeFishingMinigame) {
      this.activeFishingMinigame.destroy();
      this.activeFishingMinigame = null;
    }
    this.fishingActive = false;
    this.playerBusy = false;

    // Puesto cleanup — timers are Phaser-managed but remove them explicitly
    if (this.puestoOpen) {
      this.puestoXpTimer?.remove();
      this.puestoXpTimer = undefined;
      this.puestoAutoCloseTimer?.remove();
      this.puestoAutoCloseTimer = undefined;
      this.puestoOpen = false;
    }

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

    this.emotePanel?.destroy();
    this.emotePanel = undefined;
    this.skillTreePanel?.destroy();
    this.skillTreePanel = undefined;
    this.contractPanel?.destroy();
    this.contractPanel = undefined;
    this.questPanel?.destroy();
    this.questPanel = undefined;
    this.fishPanel?.destroy();
    this.fishPanel = undefined;
    this.specModal?.destroy();
    this.specModal = undefined;
    this.worldMapPanel?.destroy();
    this.worldMapPanel = undefined;

    // Weed Delivery NPC cleanup
    this.closeWeedDeliveryDialog();
    this.weedNpcBubbles.forEach((container) => {
      if (container.active) container.destroy();
    });
    this.weedNpcBubbles.clear();
  }

  // ─── Weed Delivery NPCs ──────────────────────────────────────────────────

  /** NPC world positions — chosen to spread across the vecindad map. */
  private static readonly WEED_NPCS: Array<{ id: WeedNpcId; x: number; y: number; name: string }> = [
    { id: 'dealer_1', x: 490,  y: 650,  name: 'FLACO' },
    { id: 'dealer_2', x: 2080, y: 500,  name: 'TOTO' },
    { id: 'dealer_3', x: 1100, y: 1460, name: 'BETO' },
  ];

  private static readonly NPC_INTERACT_RANGE = 80;

  private createWeedDeliveryNpcs() {
    const g = this.add.graphics().setDepth(10);
    for (const npc of VecindadScene.WEED_NPCS) {
      // Draw a simple NPC body (pixel-art style)
      // Shadow
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(npc.x, npc.y + 14, 24, 8);
      // Legs
      g.fillStyle(0x1a1a24, 1);
      g.fillRect(npc.x - 7, npc.y + 2, 6, 12);
      g.fillRect(npc.x + 1, npc.y + 2, 6, 12);
      // Body
      g.fillStyle(0x1f3b5b, 1);
      g.fillRect(npc.x - 9, npc.y - 10, 18, 14);
      // Head
      g.fillStyle(0xf5d5a4, 1);
      g.fillCircle(npc.x, npc.y - 18, 9);
      // Eyes
      g.fillStyle(0x000000, 1);
      g.fillRect(npc.x - 4, npc.y - 20, 2, 2);
      g.fillRect(npc.x + 2, npc.y - 20, 2, 2);
      // Cap
      g.fillStyle(0x2a1400, 1);
      g.fillRect(npc.x - 10, npc.y - 26, 20, 5);
      g.fillRect(npc.x - 8, npc.y - 31, 16, 6);

      // Name label
      this.add.text(npc.x, npc.y - 40, npc.name, {
        fontSize: '6px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#39FF14',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(11);

      // Exclamation bubble (shown when NPC has an active order)
      const bubble = this.add.container(npc.x, npc.y - 56).setDepth(15);
      const circle = this.add.graphics();
      circle.fillStyle(0xF5C842, 1);
      circle.fillCircle(0, 0, 11);
      circle.lineStyle(2, 0x000000, 0.8);
      circle.strokeCircle(0, 0, 11);
      const excl = this.add.text(0, 0, '!', {
        fontSize: '11px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#000000',
      }).setOrigin(0.5, 0.5);
      bubble.add([circle, excl]);
      this.weedNpcBubbles.set(npc.id, bubble);

      // Animate bubble float
      this.tweens.add({
        targets: bubble,
        y: npc.y - 62,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Initial visibility pass
    this.updateWeedNpcBubbles();
  }

  private updateWeedNpcBubbles() {
    const sys = getWeedDeliverySystem();
    for (const npc of VecindadScene.WEED_NPCS) {
      const bubble = this.weedNpcBubbles.get(npc.id);
      if (!bubble || !bubble.active) continue;
      const hasOrder = !sys.isOnCooldown(npc.id);
      bubble.setVisible(hasOrder);
    }
  }

  private getNearbyWeedNpc(): WeedNpcId | null {
    for (const npc of VecindadScene.WEED_NPCS) {
      if (
        Phaser.Math.Distance.Between(this.px, this.py, npc.x, npc.y) <
        VecindadScene.NPC_INTERACT_RANGE
      ) {
        return npc.id;
      }
    }
    return null;
  }

  private handleWeedNpcInteract(npcId: WeedNpcId) {
    const sys = getWeedDeliverySystem();
    const weedLv = getSkillSystem().getLevel('weed');

    if (!sys.canInteract(weedLv)) {
      eventBus.emit(EVENTS.UI_NOTICE, {
        message: '🌿 NECESITAS WEED LV3 PARA HABLAR CON DEALERS',
        color: '#3a4a3a',
      });
      return;
    }

    if (sys.isOnCooldown(npcId)) {
      this.openWeedDeliveryDialog(npcId, null);
      return;
    }

    const order = sys.getOrder(npcId);
    if (!order) return; // shouldn't happen since not on cooldown

    this.openWeedDeliveryDialog(npcId, order);
  }

  private openWeedDeliveryDialog(npcId: WeedNpcId, order: WeedOrder | null) {
    if (this.weedDeliveryDialogOpen) return;
    this.weedDeliveryDialogOpen = true;
    this.weedDeliveryDialogNpcId = npcId;

    const npcConfig = VecindadScene.WEED_NPCS.find((n) => n.id === npcId);
    const npcName = npcConfig?.name ?? npcId.toUpperCase();
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height - 110;

    const sys = getWeedDeliverySystem();

    let bodyLines: string[];
    let hintLines: string[];

    if (!order) {
      bodyLines = [
        `${npcName}: Ya me diste hoy, flaco.`,
        'Volvé mañana con más material.',
      ];
      hintLines = ['[SPACE] CERRAR'];
    } else {
      bodyLines = [
        `${npcName}: Che, conseguime`,
        `${order.strainName} de calidad`,
        `${sys.qualityLabel(order.minQuality)} o mejor.`,
        `Te pago ${order.rewardBase} TENKS.`,
      ];
      hintLines = ['[E] ENTREGAR   [SPACE] SALIR'];
    }

    this.weedDeliveryDialogBg = this.add
      .rectangle(cx, cy, 480, 120, 0x111318, 0.96)
      .setStrokeStyle(2, 0x39FF14, 0.8)
      .setScrollFactor(0)
      .setDepth(2000);

    this.weedDeliveryDialogText = this.add
      .text(cx, cy - 22, bodyLines.join('\n'), {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#B9FF9E',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2001);

    this.weedDeliveryDialogHint = this.add
      .text(cx, cy + 44, hintLines.join('\n'), {
        fontSize: '6px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#F5C842',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2001);
  }

  private closeWeedDeliveryDialog() {
    this.weedDeliveryDialogOpen = false;
    this.weedDeliveryDialogNpcId = null;
    if (this.weedDeliveryDialogBg?.active) this.weedDeliveryDialogBg.destroy();
    if (this.weedDeliveryDialogText?.active) this.weedDeliveryDialogText.destroy();
    if (this.weedDeliveryDialogHint?.active) this.weedDeliveryDialogHint.destroy();
    this.weedDeliveryDialogBg = undefined;
    this.weedDeliveryDialogText = undefined;
    this.weedDeliveryDialogHint = undefined;
  }

  private async confirmWeedDelivery(): Promise<void> {
    const npcId = this.weedDeliveryDialogNpcId;
    if (!npcId) { this.closeWeedDeliveryDialog(); return; }

    const sys = getWeedDeliverySystem();
    const order = sys.getOrder(npcId);
    if (!order) {
      // On cooldown — just close
      this.closeWeedDeliveryDialog();
      return;
    }

    this.closeWeedDeliveryDialog();

    // Verify scene still active before API call
    if (!this.scene?.isActive('VecindadScene')) return;

    try {
      const result = await sys.deliver(npcId, order.strainName, order.minQuality);

      if (!this.scene?.isActive('VecindadScene')) return;

      // Mark delivered client-side so cooldown applies immediately
      sys.markDelivered(npcId);

      // Update bubble visibility
      const bubble = this.weedNpcBubbles.get(npcId);
      if (bubble?.active) bubble.setVisible(false);

      // Flash camera green
      this.cameras.main.flash(300, 57, 255, 20, false);

      // Emit XP notice separately so both messages appear
      eventBus.emit(EVENTS.UI_NOTICE, {
        message: `🌿 +${result.tenks_earned} TENKS +${result.xp_earned} XP WEED`,
        color: '#39FF14',
      });
    } catch (err: unknown) {
      if (!this.scene?.isActive('VecindadScene')) return;
      const msg = err instanceof Error ? err.message : 'Error de red';
      eventBus.emit(EVENTS.UI_NOTICE, { message: `🌿 ERROR: ${msg}`, color: '#FF006E' });
    }
  }
}
