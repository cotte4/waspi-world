export type BuildingRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WorldRenderBounds = {
  WIDTH: number;
  HEIGHT: number;
};

export type WorldRenderZones = {
  NORTH_SIDEWALK_Y: number;
  NORTH_SIDEWALK_H: number;
  STREET_Y: number;
  STREET_H: number;
  SOUTH_SIDEWALK_Y: number;
  SOUTH_SIDEWALK_H: number;
  PLAZA_Y: number;
};

export type WorldRenderBuildings = {
  ARCADE: BuildingRect;
  STORE: BuildingRect;
  CAFE: BuildingRect;
  CASINO: BuildingRect;
  GYM: BuildingRect;
};

export type WorldLampPost = {
  x: number;
  y: number;
  height?: number;
};

export type WorldRenderColors = {
  BG: number;
  SIDEWALK: number;
  STREET: number;
  GRASS: number;
  FOUNTAIN: number;
  GOLD: number;
};

type GraphicsLike = {
  setDepth(depth: number): GraphicsLike;
  setScrollFactor(x: number, y?: number): GraphicsLike;
  fillStyle(color: number, alpha?: number): GraphicsLike;
  fillRect(x: number, y: number, width: number, height: number): GraphicsLike;
  fillCircle(x: number, y: number, radius: number): GraphicsLike;
  fillRoundedRect(x: number, y: number, width: number, height: number, radius: number): GraphicsLike;
  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): GraphicsLike;
  lineStyle(width?: number, color?: number, alpha?: number): GraphicsLike;
  lineBetween(x1: number, y1: number, x2: number, y2: number): GraphicsLike;
  strokeRect(x: number, y: number, width: number, height: number): GraphicsLike;
  strokeCircle(x: number, y: number, radius: number): GraphicsLike;
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius: number): GraphicsLike;
};

type TextLike = {
  setOrigin(x: number, y?: number): TextLike;
  setDepth(depth: number): TextLike;
};

export type RenderWorldSceneLike = {
  add: {
    graphics(): GraphicsLike;
    text(
      x: number,
      y: number,
      text: string,
      style: {
        fontSize: string;
        fontFamily: string;
        color: string;
        stroke?: string;
        strokeThickness?: number;
      },
    ): TextLike;
  };
};

export type RenderWorldStaticConfig = {
  buildings: WorldRenderBuildings;
  colors: WorldRenderColors;
  world: WorldRenderBounds;
  zones: WorldRenderZones;
};

export type RenderWorldOverlayConfig = {
  width: number;
  height: number;
};

// Future WorldScene integration:
// `drawBackground()` -> `drawBackgroundLayer(this, { colors: COLORS, world: WORLD })`
export function drawBackgroundLayer(
  scene: RenderWorldSceneLike,
  { colors, world }: Pick<RenderWorldStaticConfig, 'colors' | 'world'>,
) {
  const g = scene.add.graphics().setDepth(-10);
  g.fillStyle(colors.BG);
  g.fillRect(0, 0, world.WIDTH, world.HEIGHT);

  g.fillStyle(0xffffff, 0.6);
  const seed = 42;
  for (let i = 0; i < 200; i += 1) {
    const sx = (seed * (i * 137 + 1)) % world.WIDTH;
    const sy = (seed * (i * 97 + 3)) % 600;
    const radius = i % 5 === 0 ? 1.5 : 1;
    g.fillCircle(sx, sy, radius);
  }

  return g;
}

// Future WorldScene integration:
// `drawStreet()` -> `drawStreetLayer(this, { buildings: BUILDINGS, colors: COLORS, world: WORLD, zones: ZONES })`
export function drawStreetLayer(
  scene: RenderWorldSceneLike,
  { buildings, colors, world, zones }: RenderWorldStaticConfig,
) {
  const g = scene.add.graphics().setDepth(1);

  g.fillStyle(colors.SIDEWALK);
  g.fillRect(0, zones.NORTH_SIDEWALK_Y, world.WIDTH, zones.NORTH_SIDEWALK_H);

  g.fillStyle(colors.STREET);
  g.fillRect(0, zones.STREET_Y, world.WIDTH, zones.STREET_H);

  g.lineStyle(1, 0x191922, 0.45);
  const tileSize = 32;
  for (let x = 0; x < world.WIDTH; x += tileSize) {
    g.lineBetween(x, zones.STREET_Y, x, zones.STREET_Y + zones.STREET_H);
  }
  for (let y = zones.STREET_Y; y <= zones.STREET_Y + zones.STREET_H; y += tileSize) {
    g.lineBetween(0, y, world.WIDTH, y);
  }

  const dashY = zones.STREET_Y + zones.STREET_H / 2;
  g.fillStyle(0xf5e6a8, 0.22);
  for (let dx = 0; dx < world.WIDTH; dx += 90) {
    g.fillRect(dx, dashY - 2, 42, 3);
  }

  const crossings = [
    buildings.ARCADE.x + buildings.ARCADE.w / 2,
    buildings.STORE.x + buildings.STORE.w / 2,
    buildings.CAFE.x + buildings.CAFE.w / 2,
    buildings.CASINO.x + buildings.CASINO.w / 2,
  ];
  g.fillStyle(0xd9dee8, 0.18);
  crossings.forEach((centerX) => {
    for (let i = -3; i <= 3; i += 1) {
      g.fillRect(
        centerX - 38 + i * 12,
        zones.NORTH_SIDEWALK_Y + 8,
        8,
        zones.SOUTH_SIDEWALK_Y - zones.NORTH_SIDEWALK_Y - 16,
      );
    }
  });

  g.fillStyle(colors.SIDEWALK);
  g.fillRect(0, zones.SOUTH_SIDEWALK_Y, world.WIDTH, zones.SOUTH_SIDEWALK_H);

  g.lineStyle(1, 0x20202c, 0.35);
  for (let x = 0; x < world.WIDTH; x += tileSize * 2) {
    g.lineBetween(x, zones.NORTH_SIDEWALK_Y, x, zones.NORTH_SIDEWALK_Y + zones.NORTH_SIDEWALK_H);
    g.lineBetween(x, zones.SOUTH_SIDEWALK_Y, x, zones.SOUTH_SIDEWALK_Y + zones.SOUTH_SIDEWALK_H);
  }

  g.lineStyle(2, 0x262636, 0.9);
  g.strokeRect(0, zones.NORTH_SIDEWALK_Y, world.WIDTH, zones.NORTH_SIDEWALK_H);
  g.strokeRect(0, zones.SOUTH_SIDEWALK_Y, world.WIDTH, zones.SOUTH_SIDEWALK_H);

  const vecindadGuideX = 112;
  g.fillStyle(0x2b2016, 1);
  g.fillRect(56, zones.SOUTH_SIDEWALK_Y - 18, 16, 114);
  g.fillRect(152, zones.SOUTH_SIDEWALK_Y - 18, 16, 114);
  g.fillStyle(0x5f4a34, 0.95);
  g.fillRoundedRect(34, zones.SOUTH_SIDEWALK_Y - 48, 156, 40, 10);
  g.lineStyle(2, colors.GOLD, 0.75);
  g.strokeRoundedRect(34, zones.SOUTH_SIDEWALK_Y - 48, 156, 40, 10);
  g.fillStyle(0x5f4a34, 0.9);
  g.fillRoundedRect(42, zones.SOUTH_SIDEWALK_Y + 18, 148, 42, 12);
  g.strokeRoundedRect(42, zones.SOUTH_SIDEWALK_Y + 18, 148, 42, 12);

  scene.add.text(vecindadGuideX, zones.SOUTH_SIDEWALK_Y - 28, 'LA VECINDAD', {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#F5C842',
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(2);
  scene.add.text(vecindadGuideX, zones.SOUTH_SIDEWALK_Y + 38, 'SPACE ENTRAR', {
    fontSize: '7px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#C8D6B7',
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(2);

  return g;
}

// Future WorldScene integration:
// `drawPlaza()` -> `drawPlazaLayer(this, { colors: COLORS, world: WORLD, zones: ZONES })`
export function drawPlazaLayer(
  scene: RenderWorldSceneLike,
  { colors, world, zones }: Pick<RenderWorldStaticConfig, 'colors' | 'world' | 'zones'>,
) {
  const g = scene.add.graphics().setDepth(0);

  g.fillStyle(colors.GRASS);
  g.fillRect(0, zones.PLAZA_Y, world.WIDTH, world.HEIGHT - zones.PLAZA_Y);

  const plazaX = 1100;
  const plazaY = zones.PLAZA_Y + 50;
  const plazaW = 1000;
  const plazaH = 600;
  g.fillStyle(0x101018);
  g.fillRect(plazaX, plazaY, plazaW, plazaH);
  g.lineStyle(3, 0x25253a, 0.8);
  g.strokeRect(plazaX, plazaY, plazaW, plazaH);

  g.lineStyle(1, 0x1a1a24, 0.45);
  const tile = 32;
  for (let x = plazaX; x < plazaX + plazaW; x += tile) {
    g.lineBetween(x, plazaY, x, plazaY + plazaH);
  }
  for (let y = plazaY; y <= plazaY + plazaH; y += tile) {
    g.lineBetween(plazaX, y, plazaX + plazaW, y);
  }

  const fountainX = 1600;
  const fountainY = zones.PLAZA_Y + 300;
  g.fillStyle(colors.FOUNTAIN);
  g.fillCircle(fountainX, fountainY, 80);
  g.fillStyle(0x0a1520);
  g.fillCircle(fountainX, fountainY, 60);
  g.fillStyle(0x2255aa, 0.7);
  g.fillCircle(fountainX, fountainY, 45);
  g.fillStyle(0x88ccff, 0.5);
  g.fillCircle(fountainX, fountainY, 15);
  g.fillStyle(0x46b3ff, 0.08);
  g.fillCircle(fountainX, fountainY, 130);
  g.lineStyle(3, 0x334455, 0.9);
  g.strokeCircle(fountainX, fountainY, 80);

  drawBench(g, 1450, fountainY + 110);
  drawBench(g, 1750, fountainY + 110);
  drawBench(g, fountainX - 120, fountainY - 20);
  drawBench(g, fountainX + 120, fountainY - 20);

  scene.add.text(990, zones.PLAZA_Y + 440, 'PVP PIT', {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#F5C842',
  }).setOrigin(0.5).setDepth(2);

  scene.add.text(990, zones.PLAZA_Y + 518, 'SPACE APOSTAR / PELEAR', {
    fontSize: '6px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#C0C2CC',
  }).setOrigin(0.5).setDepth(2);

  return g;
}

// Future WorldScene integration:
// call after facades are drawn, matching the current `drawBuildingEntranceMarkers()` timing.
export function drawBuildingEntranceMarkerLayer(
  scene: RenderWorldSceneLike,
  { buildings }: Pick<RenderWorldStaticConfig, 'buildings'>,
) {
  const markerG = scene.add.graphics().setDepth(1.8);
  const doors: Array<{ cx: number; floorY: number; color: number }> = [
    { cx: buildings.ARCADE.x + buildings.ARCADE.w / 2, floorY: buildings.ARCADE.y + buildings.ARCADE.h, color: 0x46b3ff },
    { cx: buildings.STORE.x + buildings.STORE.w / 2, floorY: buildings.STORE.y + buildings.STORE.h, color: 0xf5c842 },
    { cx: buildings.CAFE.x + buildings.CAFE.w / 2, floorY: buildings.CAFE.y + buildings.CAFE.h, color: 0xff8b3d },
    { cx: buildings.CASINO.x + buildings.CASINO.w / 2, floorY: buildings.CASINO.y + buildings.CASINO.h, color: 0xf5c842 },
    { cx: buildings.GYM.x + buildings.GYM.w / 2, floorY: buildings.GYM.y + buildings.GYM.h, color: 0xff2222 },
  ];

  doors.forEach(({ cx, floorY, color }) => {
    markerG.fillStyle(color, 0.07);
    markerG.fillRoundedRect(cx - 48, floorY + 2, 96, 34, 6);
    markerG.lineStyle(1, color, 0.22);
    markerG.strokeRoundedRect(cx - 48, floorY + 2, 96, 34, 6);
    markerG.fillStyle(color, 0.4);
    markerG.fillTriangle(cx, floorY + 30, cx - 11, floorY + 16, cx + 11, floorY + 16);
  });

  return markerG;
}

// Shared primitive for plaza/street furniture during extraction.
export function drawBench(graphics: GraphicsLike, x: number, y: number) {
  graphics.fillStyle(0x4f3522, 1);
  graphics.fillRoundedRect(x - 28, y - 8, 56, 10, 3);
  graphics.fillStyle(0x2b2016, 1);
  graphics.fillRect(x - 22, y + 2, 5, 16);
  graphics.fillRect(x + 17, y + 2, 5, 16);
  graphics.lineStyle(1, 0x7a5738, 0.9);
  graphics.strokeRoundedRect(x - 28, y - 8, 56, 10, 3);
}

// Shared primitive for street/plaza lighting during extraction.
export function drawLampPost(graphics: GraphicsLike, x: number, y: number, height = 64) {
  graphics.fillStyle(0x1f1f2a, 1);
  graphics.fillRect(x - 3, y - height, 6, height);
  graphics.fillStyle(0xf5c842, 0.9);
  graphics.fillCircle(x, y - height - 4, 7);
  graphics.fillStyle(0xf5c842, 0.18);
  graphics.fillCircle(x, y - height - 4, 18);
  graphics.lineStyle(2, 0x2f3140, 0.9);
  graphics.lineBetween(x - 10, y - height + 8, x + 10, y - height + 8);
}

// Future WorldScene integration:
// `drawLampPosts()` -> `drawLampPostLayer(this, lampPosts)`
export function drawLampPostLayer(
  scene: RenderWorldSceneLike,
  lampPosts: WorldLampPost[],
) {
  const g = scene.add.graphics().setDepth(1.7);
  lampPosts.forEach(({ x, y, height }) => {
    drawLampPost(g, x, y, height);
  });
  return g;
}

// Future WorldScene integration:
// `drawVignette()` -> `drawVignetteLayer(this, { width: this.cameras.main.width, height: this.cameras.main.height })`
export function drawVignetteLayer(
  scene: RenderWorldSceneLike,
  { width, height }: RenderWorldOverlayConfig,
) {
  const g = scene.add.graphics().setDepth(9999);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(width, height) * 1.08;
  const steps = 5;

  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const alpha = t * 0.18;
    g.fillStyle(0x000000, alpha);
    g.fillCircle(centerX, centerY, radius * (0.55 + t * 0.45));
  }

  return g;
}
