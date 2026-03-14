import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { announceScene, bindSafeResetToPlaza, createBackButton, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { InteriorRoom } from '../systems/InteriorRoom';
import { loadControlSettings, readMovementVector, type ControlSettings } from '../systems/ControlSettings';
import { SAFE_PLAZA_RETURN } from '../config/constants';
import {
  getBuildCost,
  MAX_VECINDAD_STAGE,
  type SharedParcelState,
  type VecindadParcelConfig,
  VECINDAD_MAP,
  VECINDAD_PARCELS,
} from '../../lib/vecindad';
import type { VecindadState } from '../../lib/playerState';

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

type VecindadSceneData = {
  returnX?: number;
  returnY?: number;
};

export class VecindadScene extends Phaser.Scene {
  private static readonly MOVE_SPEED = 145;
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
  };
  private sharedParcels = new Map<string, SharedParcelState>();
  private parcelVisuals = new Map<string, ParcelVisual>();
  private materialNodes: MaterialNode[] = [];
  private promptText?: Phaser.GameObjects.Text;
  private hudText?: Phaser.GameObjects.Text;
  private bridgeCleanupFns: Array<() => void> = [];
  private controlSettings: ControlSettings = loadControlSettings();

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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.loadVecindadState();

    this.drawDistrict();
    this.setupMaterialNodes();
    this.drawParcels();
    this.createPlayer();
    this.setupUi();
    this.setupBridge();
    void this.loadSharedParcels();

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
    this.bridgeCleanupFns.push(eventBus.on(EVENTS.CONTROL_SETTINGS_CHANGED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      this.controlSettings = {
        ...this.controlSettings,
        ...(payload as Partial<ControlSettings>),
      };
    }));
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
    this.handleMovement(delta);
    this.room?.update();
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
  }

  private setupMaterialNodes() {
    const defs = [
      { x: 640, y: 960 },
      { x: 760, y: 960 },
      { x: 880, y: 960 },
      { x: 1920, y: 960 },
      { x: 2040, y: 960 },
      { x: 2160, y: 960 },
    ];

    defs.forEach((def, index) => {
      const crate = this.add.rectangle(def.x, def.y, 38, 28, 0x8b5a2b, 1)
        .setStrokeStyle(2, 0x3c2412, 1)
        .setDepth(2.6);
      const band = this.add.rectangle(def.x, def.y, 42, 6, 0xf5c842, 0.8).setDepth(2.7);
      const label = this.add.text(def.x, def.y - 26, '+MAT', {
        fontSize: '6px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#B9FF9E',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2.8);

      this.materialNodes.push({
        id: `cache_${index + 1}`,
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

  private renderHud() {
    if (!this.hudText) return;
    const stage = Math.max(0, this.vecindadState.buildStage);
    const nextCost = stage >= MAX_VECINDAD_STAGE ? 0 : getBuildCost(stage);
    const objective = !this.vecindadState.ownedParcelId
      ? 'OBJETIVO COMPRA UNA PARCELA'
      : stage <= 0
        ? `OBJETIVO LEVANTAR BASE ${nextCost} MATS`
        : stage >= MAX_VECINDAD_STAGE
          ? 'OBJETIVO CASA COMPLETA'
          : `OBJETIVO STAGE ${stage + 1} ${nextCost} MATS`;

    this.hudText.setText([
      'LA VECINDAD',
      this.vecindadState.ownedParcelId ? `PARCELA ${this.vecindadState.ownedParcelId}` : 'SIN PARCELA',
      `MATS ${this.vecindadState.materials}`,
      `STAGE ${stage}/${MAX_VECINDAD_STAGE}${stage >= MAX_VECINDAD_STAGE ? ' MAX' : ` NEXT ${nextCost}`}`,
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
    }
  }

  private getNearbyMaterialNode() {
    return this.materialNodes.find((node) =>
      node.available && Phaser.Math.Distance.Between(this.px, this.py, node.x, node.y) < 56
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
      this.promptText.setText(`E RECOGER TU CACHE +${material.value} MATS`);
      this.promptText.setColor('#B9FF9E');
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
      const nextCost = stage >= MAX_VECINDAD_STAGE ? 0 : getBuildCost(stage);
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
    const material = this.getNearbyMaterialNode();
    if (material) {
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
    if (this.isNearExitGate()) {
      this.leaveToWorld();
      return;
    }

    const parcel = this.getNearbyParcel();
    if (!parcel || !this.isNearHouseDoor(parcel)) return;

    const shared = this.sharedParcels.get(parcel.id);
    const mine = this.vecindadState.ownedParcelId === parcel.id;
    const stage = mine ? this.vecindadState.buildStage : shared?.buildStage ?? 0;
    if (stage <= 0) return;

    const ownerName = mine ? 'TU CASA' : `CASA DE ${shared?.ownerUsername?.toUpperCase() ?? 'VECINO'}`;
    this.inTransition = true;
    this.cameras.main.fadeOut(240, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('HouseInterior', {
        returnScene: 'VecindadScene',
        roomKey: `waspi-room-house-${parcel.id}`,
        houseLabel: ownerName,
        buildStage: Math.max(1, stage),
        returnX: parcel.x + parcel.w / 2,
        returnY: parcel.y + parcel.h - 28,
      });
    });
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
    const currentStage = this.vecindadState.buildStage;
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
    const speed = (VecindadScene.MOVE_SPEED * delta) / 1000;
    let { dx, dy } = readMovementVector({
      scene: this,
      settings: this.controlSettings,
      includeJoystick: true,
    });
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
      };
    } catch {
      this.vecindadState = {
        ownedParcelId: undefined,
        buildStage: 0,
        materials: 0,
      };
    }
  }

  private handleSceneShutdown() {
    this.room?.shutdown();
    this.room = undefined;
    this.bridgeCleanupFns.forEach((cleanup) => cleanup());
    this.bridgeCleanupFns = [];
  }
}
