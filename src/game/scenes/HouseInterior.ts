import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { SAFE_PLAZA_RETURN, WORLD } from '../config/constants';
import { announceScene, bindSafeResetToPlaza, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { InteriorRoom } from '../systems/InteriorRoom';
import { SceneControls } from '../systems/SceneControls';

type HouseInteriorData = {
  returnScene?: string;
  roomKey?: string;
  houseLabel?: string;
  buildStage?: number;
  returnX?: number;
  returnY?: number;
};

type RoomLayout = {
  roomX: number;
  roomY: number;
  roomW: number;
  roomH: number;
};

type StagePalette = {
  outside: number;
  wall: number;
  frame: number;
  floor: number;
  floorLine: number;
  windowFrame: number;
  windowGlow: number;
  accent: number;
  glow: number;
  bedBase: number;
  bedTop: number;
  rug: number;
  furniture: number;
};

export class HouseInterior extends Phaser.Scene {
  private player!: AvatarRenderer;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private inTransition = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyJ!: Phaser.Input.Keyboard.Key;
  private keyK!: Phaser.Input.Keyboard.Key;
  private keyL!: Phaser.Input.Keyboard.Key;
  private px = 0;
  private py = 0;
  private mirrorRect!: Phaser.Geom.Rectangle;
  private wardrobeRect!: Phaser.Geom.Rectangle;
  private room?: InteriorRoom;
  private lastMoveDx = 0;
  private lastMoveDy = 0;
  private lastIsMoving = false;
  private returnScene = 'WorldScene';
  private roomKey = 'waspi-room-house';
  private houseLabel = 'TU CASA';
  private buildStage = 1;
  private returnX?: number;
  private returnY?: number;
  private layout!: RoomLayout;
  private controls!: SceneControls;

  constructor() {
    super({ key: 'HouseInterior' });
  }

  init(data?: HouseInteriorData) {
    this.returnScene = data?.returnScene ?? 'WorldScene';
    this.roomKey = data?.roomKey ?? 'waspi-room-house';
    this.houseLabel = data?.houseLabel ?? 'TU CASA';
    this.buildStage = Phaser.Math.Clamp(data?.buildStage ?? 1, 1, 4);
    this.returnX = data?.returnX;
    this.returnY = data?.returnY;
    this.inTransition = false;
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);
    this.input.enabled = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);

    this.layout = {
      roomW: 620,
      roomH: 390,
      roomX: (width - 620) / 2,
      roomY: (height - 390) / 2,
    };

    this.drawInterior();

    this.px = width / 2;
    this.py = this.layout.roomY + this.layout.roomH - 82;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(10);
    this.room = new InteriorRoom(this, {
      roomKey: this.roomKey,
      getPosition: () => ({ x: this.px, y: this.py }),
      getMovement: () => ({ dx: this.lastMoveDx, dy: this.lastMoveDy, isMoving: this.lastIsMoving }),
      getAvatarConfig: () => loadStoredAvatarConfig(),
      onRemoteClick: (playerId, username) => {
        eventBus.emit(EVENTS.PLAYER_ACTIONS_OPEN, { playerId, username });
      },
      remoteColor: '#CCCCFF',
    });
    this.room.start();

    this.add.text(width / 2, this.layout.roomY + 24, this.houseLabel, {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#CCCCFF',
    }).setOrigin(0.5);

    this.add.text(width / 2, this.layout.roomY + 50, `STAGE ${this.buildStage} CASA`, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: this.buildStage >= 4 ? '#F5C842' : '#A6B7FF',
    }).setOrigin(0.5);

    this.add.text(width / 2, this.layout.roomY + 68, 'ESPEJO = CREATOR | ARMARIO = INVENTARIO', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    this.add.text(width / 2, this.layout.roomY + this.layout.roomH + 24, 'WASD MOVER | SPACE INTERACTUAR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#777777',
    }).setOrigin(0.5);

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyI = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyJ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keyK = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.controls = new SceneControls(this);
    bindSafeResetToPlaza(this, () => {
      transitionToScene(this, 'WorldScene', {
        returnX: SAFE_PLAZA_RETURN.X,
        returnY: SAFE_PLAZA_RETURN.Y,
      });
    });
  }

  update(_time?: number, delta = 16.6) {
    if (this.inTransition) return;
    this.handleMovement(delta);
    this.room?.update();
    if (this.controls.isActionJustDown('interact')) {
      this.handleInteraction();
      return;
    }
    if (this.controls.isActionJustDown('back')) {
      this.inTransition = true;
      transitionToScene(this, this.returnScene, {
        returnX: this.returnX,
        returnY: this.returnY,
      });
    }
  }

  private handleMovement(delta: number) {
    const { dx, dy, stepX, stepY } = this.controls.readMovementStep(delta, 180);

    this.px = Phaser.Math.Clamp(this.px + stepX, this.layout.roomX + 24, this.layout.roomX + this.layout.roomW - 24);
    this.py = Phaser.Math.Clamp(this.py + stepY, this.layout.roomY + 84, this.layout.roomY + this.layout.roomH - 12);

    this.player.update(dx !== 0 || dy !== 0, dx, dy);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
    this.lastMoveDx = dx;
    this.lastMoveDy = dy;
    this.lastIsMoving = dx !== 0 || dy !== 0;
  }

  private handleInteraction() {
    const nearDoor = this.py > this.layout.roomY + this.layout.roomH - 30;

    const point = new Phaser.Geom.Point(this.px, this.py);
    const nearMirror = Phaser.Geom.Rectangle.ContainsPoint(this.mirrorRect, point);
    const nearWardrobe = Phaser.Geom.Rectangle.ContainsPoint(this.wardrobeRect, point);

    if (nearMirror) {
      eventBus.emit(EVENTS.OPEN_CREATOR);
      return;
    }

    if (nearWardrobe) {
      eventBus.emit(EVENTS.INVENTORY_TOGGLE);
      return;
    }

    if (nearDoor) {
      this.inTransition = true;
      transitionToScene(this, this.returnScene, {
        returnX: this.returnX,
        returnY: this.returnY,
      });
    }
  }

  private drawInterior() {
    const palette = this.getStagePalette();
    const { roomX, roomY, roomW, roomH } = this.layout;
    const g = this.add.graphics();

    g.fillStyle(palette.outside, 1);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    g.fillStyle(palette.wall, 1);
    g.fillRoundedRect(roomX, roomY, roomW, roomH, 22);
    g.lineStyle(4, palette.frame, 0.95);
    g.strokeRoundedRect(roomX, roomY, roomW, roomH, 22);

    g.fillStyle(palette.floor, 1);
    g.fillRoundedRect(roomX + 22, roomY + 122, roomW - 44, roomH - 144, 14);
    g.lineStyle(2, palette.floorLine, 0.6);
    for (let x = roomX + 44; x < roomX + roomW - 40; x += 34) {
      g.lineBetween(x, roomY + 144, x, roomY + roomH - 26);
    }

    this.drawWindows(g, palette);
    this.drawDoor(g, palette);
    this.drawMirror(g, palette);
    this.drawWardrobe(g, palette);
    this.drawStageFurniture(g, palette);

    const floorGlow = this.add.rectangle(roomX + roomW / 2, roomY + roomH - 54, roomW - 120, 92, palette.glow, 0.2 + this.buildStage * 0.05);
    floorGlow.setStrokeStyle(2, palette.frame, 0.35);
    floorGlow.setDepth(0.5);

    if (this.buildStage >= 3) {
      const accent = this.add.rectangle(roomX + roomW / 2, roomY + 108, roomW - 110, 6, palette.accent, 0.65);
      accent.setDepth(1);
    }

    if (this.buildStage >= 4) {
      const neon = this.add.rectangle(roomX + roomW - 118, roomY + 54, 120, 18, palette.accent, 0.2);
      neon.setStrokeStyle(2, palette.accent, 0.85);
      neon.setDepth(1);
      this.add.text(roomX + roomW - 118, roomY + 54, 'HOME SWEET', {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#FFF6BA',
      }).setOrigin(0.5).setDepth(2);
    }
  }

  private getStagePalette(): StagePalette {
    const palettes: StagePalette[] = [
      {
        outside: 0x09090f,
        wall: 0x24202b,
        frame: 0x5b4a39,
        floor: 0x3b2c21,
        floorLine: 0x4b3828,
        windowFrame: 0x6f4d2d,
        windowGlow: 0x826f54,
        accent: 0x9f8150,
        glow: 0x18120d,
        bedBase: 0x4e3d32,
        bedTop: 0x726050,
        rug: 0x4f3329,
        furniture: 0x6f5032,
      },
      {
        outside: 0x080b12,
        wall: 0x262b3b,
        frame: 0x62708f,
        floor: 0x35465b,
        floorLine: 0x42556f,
        windowFrame: 0x5f7aa1,
        windowGlow: 0x7faee6,
        accent: 0xb5d4ff,
        glow: 0x111a25,
        bedBase: 0x52637c,
        bedTop: 0x90a5c7,
        rug: 0x384d68,
        furniture: 0x61718f,
      },
      {
        outside: 0x07110d,
        wall: 0x1f352c,
        frame: 0x5da081,
        floor: 0x2a4e43,
        floorLine: 0x33635a,
        windowFrame: 0x67b49e,
        windowGlow: 0xa3f0dd,
        accent: 0xbaf76d,
        glow: 0x0f211b,
        bedBase: 0x446b5d,
        bedTop: 0x88c3af,
        rug: 0x24483f,
        furniture: 0x4d826e,
      },
      {
        outside: 0x080812,
        wall: 0x2d2240,
        frame: 0xd4b55f,
        floor: 0x2a2541,
        floorLine: 0x3f3961,
        windowFrame: 0xc6a64d,
        windowGlow: 0xffe08a,
        accent: 0xf5c842,
        glow: 0x171227,
        bedBase: 0x6b4e88,
        bedTop: 0xb79ce6,
        rug: 0x4a3569,
        furniture: 0x8061a9,
      },
    ];

    return palettes[this.buildStage - 1];
  }

  private drawWindows(g: Phaser.GameObjects.Graphics, palette: StagePalette) {
    const { roomX, roomY, roomW } = this.layout;
    const leftWindowX = roomX + 56;
    const rightWindowX = roomX + roomW - 144;
    const windowY = roomY + 50;

    [leftWindowX, rightWindowX].forEach((windowX) => {
      g.fillStyle(palette.windowFrame, 1);
      g.fillRoundedRect(windowX, windowY, 88, 74, 8);
      g.fillStyle(palette.windowGlow, 0.34 + this.buildStage * 0.09);
      g.fillRoundedRect(windowX + 7, windowY + 7, 74, 60, 6);
      g.lineStyle(2, palette.frame, 0.45);
      g.lineBetween(windowX + 44, windowY + 7, windowX + 44, windowY + 67);
      g.lineBetween(windowX + 7, windowY + 37, windowX + 81, windowY + 37);
    });
  }

  private drawDoor(g: Phaser.GameObjects.Graphics, palette: StagePalette) {
    const { roomX, roomY, roomW, roomH } = this.layout;
    const doorW = 86;
    const doorH = 132;
    const doorX = roomX + roomW / 2 - doorW / 2;
    const doorY = roomY + roomH - doorH;

    g.fillStyle(0x2c1e14, 1);
    g.fillRoundedRect(doorX, doorY, doorW, doorH, 10);
    g.lineStyle(3, palette.frame, 0.6);
    g.strokeRoundedRect(doorX, doorY, doorW, doorH, 10);
    g.fillStyle(palette.accent, 0.9);
    g.fillCircle(doorX + doorW - 16, doorY + 68, 4);
  }

  private drawMirror(g: Phaser.GameObjects.Graphics, palette: StagePalette) {
    const { roomX, roomY, roomW } = this.layout;
    const mirrorX = roomX + roomW / 2 - 42;
    const mirrorY = roomY + 78;

    g.fillStyle(palette.frame, 1);
    g.fillRoundedRect(mirrorX, mirrorY, 84, 124, 10);
    g.fillStyle(0x8cc9ff, 0.26 + this.buildStage * 0.05);
    g.fillRoundedRect(mirrorX + 6, mirrorY + 6, 72, 112, 8);
    this.mirrorRect = new Phaser.Geom.Rectangle(mirrorX, mirrorY, 84, 124);
  }

  private drawWardrobe(g: Phaser.GameObjects.Graphics, palette: StagePalette) {
    const { roomX, roomY, roomW } = this.layout;
    const wardrobeX = roomX + roomW - 128;
    const wardrobeY = roomY + 108;

    g.fillStyle(palette.furniture, 1);
    g.fillRoundedRect(wardrobeX, wardrobeY, 92, 150, 10);
    g.lineStyle(2, palette.frame, 0.5);
    g.strokeRoundedRect(wardrobeX, wardrobeY, 92, 150, 10);
    g.fillStyle(palette.accent, 0.7);
    g.fillCircle(wardrobeX + 24, wardrobeY + 74, 3);
    g.fillCircle(wardrobeX + 68, wardrobeY + 74, 3);
    this.wardrobeRect = new Phaser.Geom.Rectangle(wardrobeX, wardrobeY, 92, 150);
  }

  private drawStageFurniture(g: Phaser.GameObjects.Graphics, palette: StagePalette) {
    switch (this.buildStage) {
      case 1:
        this.drawStageOneFurniture(g, palette);
        break;
      case 2:
        this.drawStageTwoFurniture(g, palette);
        break;
      case 3:
        this.drawStageThreeFurniture(g, palette);
        break;
      default:
        this.drawStageFourFurniture(g, palette);
        break;
    }
  }

  private drawBed(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, palette: StagePalette) {
    g.fillStyle(palette.bedBase, 1);
    g.fillRoundedRect(x, y, w, h, 8);
    g.fillStyle(palette.bedTop, 1);
    g.fillRoundedRect(x + 4, y + 4, w - 8, h * 0.45, 6);
    g.fillStyle(0xe8e0c8, 0.75);
    g.fillRoundedRect(x + 10, y + 9, Math.max(24, w * 0.22), 12, 4);
  }

  private drawStageOneFurniture(g: Phaser.GameObjects.Graphics, palette: StagePalette) {
    const { roomX, roomY, roomW } = this.layout;
    this.drawBed(g, roomX + 44, roomY + 150, 148, 56, palette);

    g.fillStyle(palette.rug, 1);
    g.fillRoundedRect(roomX + 58, roomY + 244, 170, 44, 10);

    g.fillStyle(0x8a693f, 1);
    g.fillRoundedRect(roomX + 56, roomY + 104, 56, 34, 6);
    g.fillStyle(0xb28b57, 1);
    g.fillRect(roomX + 64, roomY + 114, 40, 4);

    g.fillStyle(0xe4cf9c, 0.55);
    g.fillCircle(roomX + roomW / 2, roomY + 100, 13);
  }

  private drawStageTwoFurniture(g: Phaser.GameObjects.Graphics, palette: StagePalette) {
    const { roomX, roomY } = this.layout;
    this.drawBed(g, roomX + 42, roomY + 142, 166, 66, palette);

    g.fillStyle(palette.rug, 1);
    g.fillRoundedRect(roomX + 52, roomY + 238, 198, 58, 14);

    g.fillStyle(palette.furniture, 1);
    g.fillRoundedRect(roomX + 230, roomY + 156, 74, 44, 8);
    g.fillRoundedRect(roomX + 244, roomY + 210, 46, 54, 8);

    g.fillStyle(palette.accent, 0.9);
    g.fillCircle(roomX + 267, roomY + 178, 8);
    g.fillStyle(0xdfe8ff, 0.85);
    g.fillRect(roomX + 252, roomY + 220, 30, 28);
  }

  private drawStageThreeFurniture(g: Phaser.GameObjects.Graphics, palette: StagePalette) {
    const { roomX, roomY } = this.layout;
    this.drawBed(g, roomX + 40, roomY + 140, 176, 70, palette);

    g.fillStyle(palette.rug, 1);
    g.fillRoundedRect(roomX + 54, roomY + 240, 210, 62, 16);

    g.fillStyle(palette.furniture, 1);
    g.fillRoundedRect(roomX + 232, roomY + 154, 98, 58, 10);
    g.fillRoundedRect(roomX + 246, roomY + 214, 70, 42, 10);
    g.fillRoundedRect(roomX + 72, roomY + 112, 54, 30, 6);

    g.fillStyle(0x9be6bf, 1);
    g.fillCircle(roomX + 100, roomY + 122, 10);
    g.fillStyle(0x4f8f58, 1);
    g.fillRect(roomX + 96, roomY + 122, 8, 18);

    g.fillStyle(0xf0f8df, 0.75);
    g.fillRoundedRect(roomX + 250, roomY + 166, 60, 16, 6);
  }

  private drawStageFourFurniture(g: Phaser.GameObjects.Graphics, palette: StagePalette) {
    const { roomX, roomY } = this.layout;
    this.drawBed(g, roomX + 40, roomY + 136, 184, 74, palette);

    g.fillStyle(palette.rug, 1);
    g.fillRoundedRect(roomX + 48, roomY + 238, 224, 72, 18);

    g.fillStyle(palette.furniture, 1);
    g.fillRoundedRect(roomX + 232, roomY + 148, 112, 64, 12);
    g.fillRoundedRect(roomX + 236, roomY + 224, 108, 34, 10);
    g.fillRoundedRect(roomX + 62, roomY + 108, 78, 34, 8);
    g.fillRoundedRect(roomX + 368, roomY + 144, 84, 124, 10);

    g.fillStyle(palette.accent, 0.7);
    g.fillRect(roomX + 374, roomY + 154, 72, 10);
    g.fillRect(roomX + 374, roomY + 188, 72, 10);
    g.fillRect(roomX + 374, roomY + 222, 72, 10);

    g.fillStyle(0xfff2b0, 0.9);
    g.fillCircle(roomX + 100, roomY + 125, 10);
    g.fillRect(roomX + 97, roomY + 126, 6, 16);
  }

  private handleSceneShutdown() {
    this.room?.shutdown();
    this.room = undefined;
  }
}
