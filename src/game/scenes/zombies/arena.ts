import Phaser from 'phaser';

export type ZombiesArenaSectionId = 'start' | 'yard' | 'workshop' | 'street';

export interface ZombiesArenaSectionLayout {
  id: ZombiesArenaSectionId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  unlockedByDefault?: boolean;
  doorX?: number;
  doorY?: number;
  doorW?: number;
  doorH?: number;
  spawnPoints: Array<{ x: number; y: number }>;
}

export function getZombiesArenaSectionById(
  sections: ZombiesArenaSectionLayout[],
  sectionId: ZombiesArenaSectionId,
) {
  return sections.find((section) => section.id === sectionId) ?? null;
}

export function getZombiesArenaSectionDoorBounds(section: ZombiesArenaSectionLayout) {
  if (
    typeof section.doorX !== 'number'
    || typeof section.doorY !== 'number'
    || typeof section.doorW !== 'number'
    || typeof section.doorH !== 'number'
  ) {
    return null;
  }

  return new Phaser.Geom.Rectangle(section.doorX, section.doorY, section.doorW, section.doorH);
}

export function getZombiesArenaSectionSpawnPoints(section: ZombiesArenaSectionLayout) {
  return section.spawnPoints.map((spawn) => ({ ...spawn }));
}

export interface ZombiesArenaPad {
  x: number;
  y: number;
  radius: number;
}

export interface ZombiesArenaBuildResult {
  arenaBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  wallThickness: {
    top: number;
    bottom: number;
    side: number;
  };
  sections: ZombiesArenaSectionLayout[];
  exitPad: ZombiesArenaPad;
  depthsPad: ZombiesArenaPad;
}

export interface ZombiesArenaDoorVisual {
  panel: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  costText: Phaser.GameObjects.Text;
}

export interface ZombiesArenaSpawnVisual {
  frame: Phaser.GameObjects.Rectangle;
  glass: Phaser.GameObjects.Rectangle;
  planks: Phaser.GameObjects.Rectangle[];
  warning: Phaser.GameObjects.Text;
  pulse: Phaser.GameObjects.Ellipse;
}

export interface ZombiesArenaObstacleVisual {
  rect: Phaser.Geom.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  outline: Phaser.GameObjects.Rectangle;
}

export interface ZombiesArenaBuildOptions {
  sections: ZombiesArenaSectionLayout[];
  arenaBounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  wallThickness?: {
    top: number;
    bottom: number;
    side: number;
  };
  exitPad?: ZombiesArenaPad;
  depthsPad?: ZombiesArenaPad;
}

export const ZOMBIES_ARENA_DEFAULT_BOUNDS = {
  minX: 60,
  minY: 120,
  maxX: 1760,
  maxY: 1100,
} as const;

export const ZOMBIES_ARENA_DEFAULT_WALLS = {
  top: 22,
  bottom: 22,
  side: 40,
} as const;

export const ZOMBIES_ARENA_DEFAULT_EXIT_PAD = {
  x: 182,
  y: 878,
  radius: 42,
} as const;

export const ZOMBIES_ARENA_DEFAULT_DEPTHS_PAD = {
  x: 1586,
  y: 918,
  radius: 46,
} as const;

export const ZOMBIES_ARENA_DEFAULT_SECTIONS: ZombiesArenaSectionLayout[] = [
  {
    id: 'start',
    label: 'START',
    x: 120,
    y: 470,
    w: 560,
    h: 460,
    unlockedByDefault: true,
    doorX: 685,
    doorY: 590,
    doorW: 25,
    doorH: 110,
    spawnPoints: [
      { x: 110, y: 575 },
      { x: 210, y: 640 },
      { x: 330, y: 770 },
    ],
  },
  {
    id: 'yard',
    label: 'YARD',
    x: 710,
    y: 420,
    w: 400,
    h: 430,
    doorX: 1110,
    doorY: 560,
    doorW: 20,
    doorH: 110,
    spawnPoints: [
      { x: 760, y: 500 },
      { x: 900, y: 580 },
      { x: 970, y: 650 },
    ],
  },
  {
    id: 'workshop',
    label: 'WORKSHOP',
    x: 1130,
    y: 380,
    w: 520,
    h: 470,
    doorX: 880,
    doorY: 770,
    doorW: 120,
    doorH: 30,
    spawnPoints: [
      { x: 1240, y: 510 },
      { x: 1380, y: 560 },
      { x: 1540, y: 420 },
    ],
  },
  {
    id: 'street',
    label: 'STREET',
    x: 710,
    y: 820,
    w: 1000,
    h: 262,
    spawnPoints: [
      { x: 880, y: 860 },
      { x: 1260, y: 860 },
      { x: 1540, y: 860 },
    ],
  },
];

export function buildZombiesArenaLayout(
  scene: Phaser.Scene,
  options: ZombiesArenaBuildOptions,
): ZombiesArenaBuildResult {
  const arenaBounds = options.arenaBounds ?? ZOMBIES_ARENA_DEFAULT_BOUNDS;
  const wallThickness = options.wallThickness ?? ZOMBIES_ARENA_DEFAULT_WALLS;
  const exitPad = options.exitPad ?? ZOMBIES_ARENA_DEFAULT_EXIT_PAD;
  const depthsPad = options.depthsPad ?? ZOMBIES_ARENA_DEFAULT_DEPTHS_PAD;
  const sections = options.sections;

  const bg = scene.add.graphics().setDepth(0).setName('arena-bg');
  bg.fillStyle(0x020406, 1);
  bg.fillRect(0, 0, arenaBounds.maxX + 20, arenaBounds.maxY + 20);

  const floorBase = scene.add.graphics().setDepth(1).setName('arena-floor');
  floorBase.fillStyle(0x0D1318, 1);
  floorBase.fillRect(
    arenaBounds.minX,
    arenaBounds.minY,
    arenaBounds.maxX - arenaBounds.minX,
    arenaBounds.maxY - arenaBounds.minY,
  );

  floorBase.lineStyle(1, 0x111A22, 0.25);
  for (let x = arenaBounds.minX; x <= arenaBounds.maxX; x += 32) {
    floorBase.lineBetween(x, arenaBounds.minY, x, arenaBounds.maxY);
  }
  for (let y = arenaBounds.minY; y <= arenaBounds.maxY; y += 32) {
    floorBase.lineBetween(arenaBounds.minX, y, arenaBounds.maxX, y);
  }

  const sectionFloor = scene.add.graphics().setDepth(2).setName('section-floors');
  const sectionStyle: Record<ZombiesArenaSectionId, { color: number; grid: number; gridColor: number }> = {
    start: { color: 0x131C26, grid: 16, gridColor: 0x0D1520 },
    yard: { color: 0x111B12, grid: 24, gridColor: 0x0C1710 },
    workshop: { color: 0x141618, grid: 12, gridColor: 0x0F1214 },
    street: { color: 0x0F0F17, grid: 28, gridColor: 0x0A0B12 },
  };
  for (const section of sections) {
    const style = sectionStyle[section.id];
    sectionFloor.fillStyle(style.color, 1);
    sectionFloor.fillRect(section.x, section.y, section.w, section.h);
    sectionFloor.lineStyle(1, style.gridColor, 1);
    for (let gx = section.x; gx <= section.x + section.w; gx += style.grid) {
      sectionFloor.lineBetween(gx, section.y, gx, section.y + section.h);
    }
    for (let gy = section.y; gy <= section.y + section.h; gy += style.grid) {
      sectionFloor.lineBetween(section.x, gy, section.x + section.w, gy);
    }
    sectionFloor.lineStyle(2, 0x1E2A36, 0.9);
    sectionFloor.strokeRect(section.x, section.y, section.w, section.h);
  }

  const walls = scene.add.graphics().setDepth(8).setName('perimeter-walls');
  drawPerimeterWalls(scene, walls, arenaBounds, wallThickness);

  const dividers = scene.add.graphics().setDepth(9).setName('divider-walls');
  drawSectionDividers(scene, dividers, sections);

  const lights = scene.add.graphics().setDepth(4).setName('lighting');
  drawAmbientPools(lights);

  const exitRing = scene.add.circle(exitPad.x, exitPad.y, exitPad.radius, 0x39FF14, 0.08).setDepth(15);
  exitRing.setStrokeStyle(2, 0x39FF14, 0.45);
  scene.tweens.add({
    targets: exitRing,
    alpha: { from: 0.08, to: 0.22 },
    scale: { from: 0.96, to: 1.04 },
    yoyo: true,
    repeat: -1,
    duration: 950,
    ease: 'Sine.easeInOut',
  });
  scene.add.text(exitPad.x, exitPad.y - 56, 'EXIT', {
    fontSize: '10px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#9EFFB7',
  }).setOrigin(0.5).setDepth(20);

  scene.add.text(depthsPad.x, depthsPad.y - 58, 'DEPTHS LOCKED', {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#9B7BBF',
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(20);

  for (const section of sections) {
    scene.add.text(section.x + 24, section.y + 24, section.label, {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: section.unlockedByDefault ? '#7CC9FF' : '#62798F',
    }).setDepth(40);
  }

  return {
    arenaBounds,
    wallThickness,
    sections,
    exitPad,
    depthsPad,
  };
}

export function createZombiesArenaDoorVisual(
  scene: Phaser.Scene,
  section: ZombiesArenaSectionLayout,
): ZombiesArenaDoorVisual | null {
  if (
    typeof section.doorX !== 'number'
    || typeof section.doorY !== 'number'
    || typeof section.doorW !== 'number'
    || typeof section.doorH !== 'number'
  ) {
    return null;
  }

  const panel = scene.add
    .rectangle(section.doorX + section.doorW / 2, section.doorY + section.doorH / 2, section.doorW, section.doorH, 0x4A231F, 1)
    .setDepth(24);
  panel.setStrokeStyle(2, 0xD97C5F, 0.85);

  const label = scene.add.text(section.doorX + section.doorW / 2, section.doorY + 16, section.label, {
    fontSize: '7px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#FFB8A6',
  }).setOrigin(0.5).setDepth(25);

  const costText = scene.add.text(section.doorX + section.doorW / 2, section.doorY + section.doorH - 12, '50 PTS', {
    fontSize: '6px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#FFD39C',
  }).setOrigin(0.5).setDepth(25);

  return { panel, label, costText };
}

export function createZombiesSpawnVisual(
  scene: Phaser.Scene,
  spawn: { x: number; y: number },
): ZombiesArenaSpawnVisual {
  const pulse = scene.add.ellipse(spawn.x, spawn.y + 12, 56, 22, 0xFF6A6A, 0.06).setDepth(14);
  pulse.setStrokeStyle(1, 0xFF6A6A, 0.22);
  const frame = scene.add.rectangle(spawn.x, spawn.y - 4, 42, 52, 0x0f1419, 0.86).setDepth(15);
  frame.setStrokeStyle(2, 0x6C7A89, 0.6);
  const glass = scene.add.rectangle(spawn.x, spawn.y - 4, 34, 40, 0x203444, 0.55).setDepth(16);
  const planks = [-12, 0, 12].map((offsetY) =>
    scene.add.rectangle(spawn.x, spawn.y + offsetY - 4, 38, 6, 0x7A4A21, 0.94).setDepth(17),
  );
  const warning = scene.add.text(spawn.x, spawn.y - 42, 'BARRICADE', {
    fontSize: '6px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#B7C6D5',
  }).setOrigin(0.5).setDepth(18);

  return { frame, glass, planks, warning, pulse };
}

export function createZombiesObstacleVisual(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  fillColor: number,
  strokeColor: number,
): ZombiesArenaObstacleVisual {
  const rect = new Phaser.Geom.Rectangle(x, y, w, h);
  const fill = scene.add.rectangle(x + w / 2, y + h / 2, w, h, fillColor, 1).setDepth(12);
  const outline = scene.add.rectangle(x + w / 2, y + h / 2, w, h)
    .setDepth(13)
    .setStrokeStyle(2, strokeColor, 0.5);
  return { rect, fill, outline };
}

export function addZombiesWallCollider(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
): ZombiesArenaObstacleVisual {
  const rect = new Phaser.Geom.Rectangle(x, y, w, h);
  const fill = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0).setDepth(0);
  const outline = scene.add.rectangle(x + w / 2, y + h / 2, w, h).setDepth(0).setAlpha(0);
  return { rect, fill, outline };
}

function drawPerimeterWalls(
  scene: Phaser.Scene,
  gfx: Phaser.GameObjects.Graphics,
  arenaBounds: ZombiesArenaBuildResult['arenaBounds'],
  wallThickness: ZombiesArenaBuildResult['wallThickness'],
) {
  const drawThickWall = (wx: number, wy: number, ww: number, wh: number) => {
    gfx.fillStyle(0x181D26, 1);
    gfx.fillRect(wx, wy, ww, wh);
    gfx.fillStyle(0x252C3A, 0.8);
    if (wh > ww) {
      gfx.fillRect(wx + ww - 4, wy, 4, wh);
    } else {
      gfx.fillRect(wx, wy + wh - 4, ww, 4);
    }
    gfx.lineStyle(1, 0x0F1420, 0.7);
    if (wh > ww) {
      for (let by = wy + 8; by < wy + wh; by += 10) {
        gfx.lineBetween(wx, by, wx + ww, by);
      }
    } else {
      for (let bx = wx + 8; bx < wx + ww; bx += 10) {
        gfx.lineBetween(bx, wy, bx, wy + wh);
      }
    }
    gfx.lineStyle(2, 0x0A0E16, 1);
    gfx.strokeRect(wx, wy, ww, wh);
  };

  const VW = wallThickness.side;
  const VH = wallThickness.top;
  drawThickWall(arenaBounds.minX, arenaBounds.minY, arenaBounds.maxX - arenaBounds.minX, VH);
  drawThickWall(arenaBounds.minX, arenaBounds.maxY - VH, arenaBounds.maxX - arenaBounds.minX, VH);
  drawThickWall(arenaBounds.minX, arenaBounds.minY, VW, arenaBounds.maxY - arenaBounds.minY);
  drawThickWall(arenaBounds.maxX - VW, arenaBounds.minY, VW, arenaBounds.maxY - arenaBounds.minY);

  gfx.fillStyle(0x1E2534, 1);
  gfx.lineStyle(1, 0x303A4A, 0.9);
  for (const [cx, cy] of [
    [arenaBounds.minX, arenaBounds.minY],
    [arenaBounds.maxX - VW - 4, arenaBounds.minY],
    [arenaBounds.minX, arenaBounds.maxY - VH - 4],
    [arenaBounds.maxX - VW - 4, arenaBounds.maxY - VH - 4],
  ] as [number, number][]) {
    gfx.fillRect(cx, cy, VW + 4, VH + 4);
    gfx.strokeRect(cx, cy, VW + 4, VH + 4);
  }
}

function drawSectionDividers(scene: Phaser.Scene, gfx: Phaser.GameObjects.Graphics, sections: ZombiesArenaSectionLayout[]) {
  const start = sections.find((section) => section.id === 'start');
  const yard = sections.find((section) => section.id === 'yard');
  const workshop = sections.find((section) => section.id === 'workshop');
  if (!start || !yard || !workshop) return;

  const drawDivSeg = (dx: number, dy: number, dw: number, dh: number) => {
    gfx.fillStyle(0x181D26, 1);
    gfx.fillRect(dx, dy, dw, dh);
    gfx.fillStyle(0x252C3A, 0.65);
    if (dh > dw) gfx.fillRect(dx + dw - 3, dy, 3, dh);
    else gfx.fillRect(dx, dy + dh - 3, dw, 3);
    gfx.lineStyle(1, 0x0F1420, 0.55);
    if (dh > dw) {
      for (let by = dy + 5; by < dy + dh; by += 10) gfx.lineBetween(dx, by, dx + dw, by);
    } else {
      for (let bx = dx + 5; bx < dx + dw; bx += 10) gfx.lineBetween(bx, dy, bx, dy + dh);
    }
    gfx.lineStyle(1, 0x0A0E16, 1);
    gfx.strokeRect(dx, dy, dw, dh);
  };

  const drawDoorFrame = (fx: number, fy: number, fw: number, fh: number) => {
    gfx.lineStyle(2, 0xF5C842, 0.42);
    gfx.strokeRect(fx - 2, fy - 2, fw + 4, fh + 4);
  };

  drawDivSeg(685, 420, 25, 170);
  drawDivSeg(685, 700, 25, 240);
  drawDoorFrame(start.doorX!, start.doorY!, start.doorW!, start.doorH!);

  drawDivSeg(1110, 380, 20, 180);
  drawDivSeg(1110, 670, 20, 100);
  drawDoorFrame(yard.doorX!, yard.doorY!, yard.doorW!, yard.doorH!);

  drawDivSeg(700, 770, 180, 30);
  drawDivSeg(1000, 770, 650, 30);
  drawDoorFrame(workshop.doorX!, workshop.doorY!, workshop.doorW!, workshop.doorH!);
}

function drawAmbientPools(gfx: Phaser.GameObjects.Graphics) {
  for (const lp of [
    { x: 400, y: 700, c: 0xFFCC66 },
    { x: 900, y: 580, c: 0xFFCC66 },
    { x: 1380, y: 560, c: 0x66AAFF },
    { x: 1100, y: 940, c: 0xFF6622 },
  ] as Array<{ x: number; y: number; c: number }>) {
    gfx.fillStyle(lp.c, 0.042);
    gfx.fillCircle(lp.x, lp.y, 180);
    gfx.fillStyle(lp.c, 0.022);
    gfx.fillCircle(lp.x, lp.y, 320);
  }
}
