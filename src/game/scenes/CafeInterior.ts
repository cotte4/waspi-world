import Phaser from 'phaser';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { BUILDINGS, COLORS, WORLD, ZONES } from '../config/constants';
import { announceScene, createBackButton } from '../systems/SceneUi';
import { InteriorRoom } from '../systems/InteriorRoom';
import { eventBus, EVENTS } from '../config/eventBus';

export class CafeInterior extends Phaser.Scene {
  private static readonly RETURN_X = BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2;
  private static readonly RETURN_Y = ZONES.SOUTH_SIDEWALK_Y + 26;
  private player!: AvatarRenderer;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private inTransition = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private px = 0;
  private py = 0;
  private room?: InteriorRoom;
  private lastMoveDx = 0;
  private lastIsMoving = false;

  constructor() {
    super({ key: 'CafeInterior' });
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);

    const g = this.add.graphics();
    g.fillStyle(0x0d0505);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    const roomW = 640;
    const roomH = 360;
    const roomX = (width - roomW) / 2;
    const roomY = (height - roomH) / 2;

    g.fillStyle(0x1a0c0c);
    g.fillRect(roomX, roomY, roomW, roomH);
    g.lineStyle(3, COLORS.NEON_ORANGE, 0.55);
    g.strokeRect(roomX, roomY, roomW, roomH);

    // Simple bar counter
    g.fillStyle(0x2A1510);
    g.fillRect(roomX + 60, roomY + 90, roomW - 120, 40);

    // Tables
    const tableCenters = [
      { x: roomX + 160, y: roomY + 210 },
      { x: roomX + 320, y: roomY + 240 },
      { x: roomX + 480, y: roomY + 210 },
    ];
    tableCenters.forEach(({ x, y }) => {
      g.fillStyle(0x1F1410);
      g.fillCircle(x, y, 20);
    });

    // Floor warm glow
    const floor = this.add.rectangle(width / 2, roomY + roomH - 60, roomW - 80, 80, 0x1A0C08, 0.95);
    floor.setStrokeStyle(2, 0x000000, 0.7);

    // Player avatar
    this.px = width / 2;
    this.py = roomY + roomH - 80;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(10);
    this.room = new InteriorRoom(this, {
      roomKey: 'waspi-room-cafe',
      getPosition: () => ({ x: this.px, y: this.py }),
      getMovement: () => ({ dx: this.lastMoveDx, isMoving: this.lastIsMoving }),
      getAvatarConfig: () => loadStoredAvatarConfig(),
      onRemoteClick: (playerId, username) => {
        eventBus.emit(EVENTS.PLAYER_ACTIONS_OPEN, { playerId, username });
      },
    });
    this.room.start();

    // Title
    this.add.text(width / 2, roomY + 24, 'CAFÉ', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6B00',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + 52, 'ESPAClO SOCIAL COMING SOON', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#BBBBBB',
    }).setOrigin(0.5);
    createBackButton(this, () => this.exitToWorld());

    // Exit hint
    this.add.text(width / 2, roomY + roomH + 24, 'ESC PARA SALIR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#777777',
    }).setOrigin(0.5);

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update() {
    if (this.inTransition) return;
    this.handleMovement();
    this.room?.update();
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.exitToWorld();
    }
  }

  private exitToWorld() {
    if (this.inTransition) return;
    this.inTransition = true;
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('WorldScene', {
        returnX: CafeInterior.RETURN_X,
        returnY: CafeInterior.RETURN_Y,
      });
    });
  }

  private handleMovement() {
    const speed = 180 / 60;
    let dx = 0;
    let dy = 0;

    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const up = this.cursors.up.isDown || this.keyW.isDown;
    const down = this.cursors.down.isDown || this.keyS.isDown;

    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;

    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

    const { width, height } = this.scale;
    const roomW = 640;
    const roomH = 360;
    const roomX = (width - roomW) / 2 + 20;
    const roomY = (height - roomH) / 2 + 20;

    this.px = Phaser.Math.Clamp(this.px + dx * speed * 16.6, roomX, roomX + roomW - 40);
    this.py = Phaser.Math.Clamp(this.py + dy * speed * 16.6, roomY + 40, roomY + roomH - 10);

    this.player.update(dx !== 0 || dy !== 0, dx);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
    this.lastMoveDx = dx;
    this.lastIsMoving = dx !== 0 || dy !== 0;
  }

  private handleSceneShutdown() {
    this.room?.shutdown();
    this.room = undefined;
  }
}
