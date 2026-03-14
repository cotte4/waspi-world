import Phaser from 'phaser';
import { ZOMBIES_WEAPONS } from '../config/zombies';
import { ZombiesScene } from './ZombiesScene';

const DEPTHS_RETURN = { x: 1586, y: 918 } as const;
const DEPTHS_START = { x: 356, y: 812 } as const;
const DEPTHS_START_ROUND = 11;
const DEPTHS_START_POINTS = 3200;
const DEPTHS_BOX = { x: 435, y: 698 } as const;
const DEPTHS_PACK = { x: 1278, y: 610 } as const;
const DEPTHS_WINDOWS = [
  { x: 118, y: 575 },
  { x: 130, y: 825 },
  { x: 650, y: 545 },
  { x: 650, y: 865 },
  { x: 760, y: 455 },
  { x: 1010, y: 445 },
  { x: 1070, y: 720 },
  { x: 1190, y: 425 },
  { x: 1460, y: 415 },
  { x: 1580, y: 700 },
  { x: 1210, y: 900 },
  { x: 1650, y: 900 },
] as const;

type DepthDoorState = {
  id: string;
  unlocked: boolean;
  panel?: Phaser.GameObjects.Rectangle;
  label?: Phaser.GameObjects.Text;
  costText?: Phaser.GameObjects.Text;
};

type DepthObstacle = {
  rect: Phaser.Geom.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  outline: Phaser.GameObjects.Rectangle;
};

export class BasementZombiesScene extends ZombiesScene {
  constructor() {
    super('BasementZombiesScene');
  }

  override init(data?: {
    returnScene?: string;
    returnX?: number;
    returnY?: number;
    entryLabel?: string;
    allowDepthsGate?: boolean;
    modeLabel?: string;
  }) {
    super.init({
      returnScene: 'ZombiesScene',
      returnX: DEPTHS_RETURN.x,
      returnY: DEPTHS_RETURN.y,
      entryLabel: 'ZOMBIES',
      allowDepthsGate: false,
      modeLabel: 'BASEMENT DEPTHS',
      ...data,
    });
  }

  override create() {
    super.create();

    const scene = this as unknown as {
      px: number;
      py: number;
      points: number;
      round: number;
      roundTarget: number;
      spawnedThisRound: number;
      nextSpawnAt: number;
      roundBreakUntil: number;
      bossRoundActive: boolean;
      bossSpawnedThisRound: boolean;
      bossAlive: boolean;
      currentWeapon: keyof typeof ZOMBIES_WEAPONS;
      weaponOrder: Array<keyof typeof ZOMBIES_WEAPONS>;
      weaponInventory: Record<string, { owned: boolean; ammoInMag: number; reserveAmmo: number; upgraded: boolean }>;
      doors: Map<string, DepthDoorState>;
      obstacles: DepthObstacle[];
      player: { setPosition: (x: number, y: number) => void };
      playerName: Phaser.GameObjects.Text;
      cameras: Phaser.Cameras.Scene2D.CameraManager;
      renderHud: () => void;
      beginRound: () => void;
      showNotice: (text: string, color?: string) => void;
    };

    this.drawDepthsMood();
    this.drawDepthsGameplayGuides();
    this.unlockDepthDoors(scene);
    this.addDepthsObstacles(scene);
    this.boostDepthsLoadout(scene);
    this.reseedDepthsRound(scene);
  }

  private drawDepthsMood() {
    const floorGlow = this.add.rectangle(950, 625, 1710, 990, 0x150914, 0.46).setDepth(2);
    const upperGlow = this.add.ellipse(960, 210, 900, 180, 0xff4da6, 0.08).setDepth(3);
    const lowerGlow = this.add.ellipse(960, 1020, 1200, 260, 0x22d0ff, 0.06).setDepth(3);
    const title = this.add.text(950, 86, 'BASEMENT DEPTHS', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: '#FF9DD8',
      stroke: '#120713',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(70);
    const subtitle = this.add.text(950, 118, 'POST-BOSS SURVIVAL FLOOR', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '9px',
      color: '#7FD9FF',
      stroke: '#081018',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(70);

    const leftWarning = this.add.text(148, 188, 'SECTOR B', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#FFCF66',
    }).setDepth(65);
    const rightWarning = this.add.text(1538, 188, 'NO EXIT', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#FF6A6A',
    }).setDepth(65);

    this.tweens.add({
      targets: [floorGlow, upperGlow, lowerGlow],
      alpha: { from: 0.3, to: 0.55 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.tweens.add({
      targets: [title, subtitle, leftWarning, rightWarning],
      alpha: { from: 0.72, to: 1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private unlockDepthDoors(scene: {
    doors: Map<string, DepthDoorState>;
  }) {
    for (const door of scene.doors.values()) {
      door.unlocked = true;
      door.panel?.setFillStyle(0x25131e, 0.25);
      door.panel?.setStrokeStyle(2, 0xff7ccd, 0.45);
      door.label?.setText(`${door.id.toUpperCase()} OPEN`);
      door.label?.setColor('#FF9DD8');
      door.costText?.setVisible(false);
    }
  }

  private drawDepthsGameplayGuides() {
    const boxHalo = this.add.ellipse(DEPTHS_BOX.x, DEPTHS_BOX.y + 8, 160, 88, 0xff63ba, 0.08).setDepth(18);
    boxHalo.setStrokeStyle(2, 0xff63ba, 0.46);
    const boxLabel = this.add.text(DEPTHS_BOX.x, DEPTHS_BOX.y - 96, 'MYSTERY BOX LIVE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#FFB0E1',
      stroke: '#10040e',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(60);

    const packHalo = this.add.ellipse(DEPTHS_PACK.x, DEPTHS_PACK.y + 12, 188, 86, 0x58c8ff, 0.08).setDepth(18);
    packHalo.setStrokeStyle(2, 0x58c8ff, 0.46);
    const packLabel = this.add.text(DEPTHS_PACK.x, DEPTHS_PACK.y - 92, 'PACK + UPGRADE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#9edfff',
      stroke: '#071019',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(60);

    const windowsLabel = this.add.text(950, 1034, 'REPAIR WINDOWS FOR PTS', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#8fdbff',
      stroke: '#071019',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(60);

    for (const windowPos of DEPTHS_WINDOWS) {
      const pulse = this.add.ellipse(windowPos.x, windowPos.y + 12, 72, 28, 0x6bd5ff, 0.03).setDepth(13);
      pulse.setStrokeStyle(1, 0x6bd5ff, 0.18);
      this.tweens.add({
        targets: pulse,
        alpha: { from: 0.02, to: 0.09 },
        scaleX: { from: 0.96, to: 1.05 },
        scaleY: { from: 0.96, to: 1.05 },
        yoyo: true,
        repeat: -1,
        duration: 1100 + ((windowPos.x + windowPos.y) % 240),
        ease: 'Sine.easeInOut',
      });
    }

    this.tweens.add({
      targets: [boxHalo, packHalo],
      alpha: { from: 0.06, to: 0.18 },
      scaleX: { from: 0.98, to: 1.05 },
      scaleY: { from: 0.98, to: 1.05 },
      yoyo: true,
      repeat: -1,
      duration: 980,
      ease: 'Sine.easeInOut',
    });

    this.tweens.add({
      targets: [boxLabel, packLabel, windowsLabel],
      alpha: { from: 0.76, to: 1 },
      yoyo: true,
      repeat: -1,
      duration: 1200,
      ease: 'Sine.easeInOut',
    });
  }

  private addDepthsObstacles(scene: {
    obstacles: DepthObstacle[];
  }) {
    const obstacleDefs = [
      { x: 780, y: 616, w: 170, h: 52, fill: 0x201a2c, stroke: 0xff4da6 },
      { x: 1130, y: 616, w: 170, h: 52, fill: 0x201a2c, stroke: 0x46d8ff },
      { x: 957, y: 450, w: 76, h: 176, fill: 0x19131f, stroke: 0xffc14d },
      { x: 957, y: 778, w: 76, h: 176, fill: 0x19131f, stroke: 0xffc14d },
      { x: 630, y: 842, w: 112, h: 40, fill: 0x141821, stroke: 0x39ffb8 },
      { x: 1286, y: 842, w: 112, h: 40, fill: 0x141821, stroke: 0x39ffb8 },
    ] as const;

    for (const obstacle of obstacleDefs) {
      const fill = this.add.rectangle(obstacle.x, obstacle.y, obstacle.w, obstacle.h, obstacle.fill, 0.95).setDepth(16);
      const outline = this.add.rectangle(obstacle.x, obstacle.y, obstacle.w + 6, obstacle.h + 6).setDepth(15);
      outline.setStrokeStyle(2, obstacle.stroke, 0.8);
      scene.obstacles.push({
        rect: new Phaser.Geom.Rectangle(obstacle.x - obstacle.w / 2, obstacle.y - obstacle.h / 2, obstacle.w, obstacle.h),
        fill,
        outline,
      });
    }
  }

  private boostDepthsLoadout(scene: {
    points: number;
    currentWeapon: keyof typeof ZOMBIES_WEAPONS;
    weaponOrder: Array<keyof typeof ZOMBIES_WEAPONS>;
    weaponInventory: Record<string, { owned: boolean; ammoInMag: number; reserveAmmo: number; upgraded: boolean }>;
  }) {
    scene.points = Math.max(scene.points, DEPTHS_START_POINTS);

    const smg = scene.weaponInventory.smg;
    if (smg) {
      smg.owned = true;
      smg.ammoInMag = ZOMBIES_WEAPONS.smg.magazineSize;
      smg.reserveAmmo = ZOMBIES_WEAPONS.smg.reserveAmmo;
    }

    if (!scene.weaponOrder.includes('smg')) {
      scene.weaponOrder.push('smg');
    }

    scene.currentWeapon = 'smg';
  }

  private reseedDepthsRound(scene: {
    px: number;
    py: number;
    round: number;
    roundTarget: number;
    spawnedThisRound: number;
    nextSpawnAt: number;
    roundBreakUntil: number;
    bossRoundActive: boolean;
    bossSpawnedThisRound: boolean;
    bossAlive: boolean;
    player: { setPosition: (x: number, y: number) => void };
    playerName: Phaser.GameObjects.Text;
    cameras: Phaser.Cameras.Scene2D.CameraManager;
    renderHud: () => void;
    beginRound: () => void;
    showNotice: (text: string, color?: string) => void;
  }) {
    scene.px = DEPTHS_START.x;
    scene.py = DEPTHS_START.y;
    scene.player.setPosition(scene.px, scene.py);
    scene.playerName.setPosition(scene.px, scene.py - 44);
    scene.cameras.main.centerOn(scene.px, scene.py);

    scene.round = DEPTHS_START_ROUND - 1;
    scene.roundTarget = 0;
    scene.spawnedThisRound = 0;
    scene.nextSpawnAt = 0;
    scene.roundBreakUntil = 0;
    scene.bossRoundActive = false;
    scene.bossSpawnedThisRound = false;
    scene.bossAlive = false;

    scene.beginRound();
    scene.renderHud();
    scene.showNotice('BASEMENT DEPTHS', '#FF9DD8');
  }
}
