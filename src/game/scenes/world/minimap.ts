import Phaser from 'phaser';

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type MinimapBuildingDef = {
  rect: Rect;
  color: number;
};

export type MinimapLayout = {
  width: number;
  height: number;
  worldWidth: number;
  worldHeight: number;
  marginRight?: number;
  marginTop?: number;
};

export type MinimapStyle = {
  backgroundColor?: number;
  backgroundAlpha?: number;
  borderColor?: number;
  borderAlpha?: number;
  playerDotColor?: number;
  remoteDotColor?: number;
  titleColor?: string;
  titleLabel?: string;
  titleDepth?: number;
  graphicsDepth?: number;
  playerDotDepth?: number;
  remoteDotDepth?: number;
};

export type MinimapState = {
  px: number;
  py: number;
  remotePlayers: Map<string, { x: number; y: number }>;
  visible: boolean;
};

export type MinimapRefs = {
  graphics?: Phaser.GameObjects.Graphics;
  playerDot?: Phaser.GameObjects.Arc;
  remoteDots: Map<string, Phaser.GameObjects.Arc>;
  container?: Phaser.GameObjects.Container;
  title?: Phaser.GameObjects.Text;
};

export type MinimapSetupOptions = {
  layout: MinimapLayout;
  buildings: MinimapBuildingDef[];
  style?: MinimapStyle;
  visible?: boolean;
};

export type MinimapRenderContext = {
  scene: Phaser.Scene;
  refs: MinimapRefs;
  state: MinimapState;
  layout: MinimapLayout;
};

export type MinimapLifecycle = {
  refs: MinimapRefs;
  destroy: () => void;
};

function resolveLayout(layout: MinimapLayout) {
  return {
    width: layout.width,
    height: layout.height,
    marginRight: layout.marginRight ?? 10,
    marginTop: layout.marginTop ?? 10,
  };
}

function resolveStyle(style?: MinimapStyle) {
  return {
    backgroundColor: style?.backgroundColor ?? 0x000000,
    backgroundAlpha: style?.backgroundAlpha ?? 0.72,
    borderColor: style?.borderColor ?? 0x46B3FF,
    borderAlpha: style?.borderAlpha ?? 0.6,
    playerDotColor: style?.playerDotColor ?? 0xF5C842,
    remoteDotColor: style?.remoteDotColor ?? 0x46B3FF,
    titleColor: style?.titleColor ?? '#46B3FF',
    titleLabel: style?.titleLabel ?? 'MAP',
    titleDepth: style?.titleDepth ?? 9994,
    graphicsDepth: style?.graphicsDepth ?? 9990,
    playerDotDepth: style?.playerDotDepth ?? 9993,
    remoteDotDepth: style?.remoteDotDepth ?? 9992,
  };
}

export function createMinimapGraphics(
  scene: Phaser.Scene,
  layout: MinimapLayout,
  style?: MinimapStyle,
) {
  const resolvedLayout = resolveLayout(layout);
  const resolvedStyle = resolveStyle(style);
  const originX = scene.scale.width - resolvedLayout.marginRight - resolvedLayout.width;
  const originY = resolvedLayout.marginTop;
  const graphics = scene.add.graphics().setScrollFactor(0).setDepth(resolvedStyle.graphicsDepth);
  graphics.fillStyle(resolvedStyle.backgroundColor, resolvedStyle.backgroundAlpha);
  graphics.fillRect(originX, originY, resolvedLayout.width, resolvedLayout.height);
  graphics.lineStyle(1.5, resolvedStyle.borderColor, resolvedStyle.borderAlpha);
  graphics.strokeRect(originX, originY, resolvedLayout.width, resolvedLayout.height);
  return graphics;
}

export function createMinimapTitle(
  scene: Phaser.Scene,
  layout: MinimapLayout,
  style?: MinimapStyle,
) {
  const resolvedLayout = resolveLayout(layout);
  const resolvedStyle = resolveStyle(style);
  const originX = scene.scale.width - resolvedLayout.marginRight - resolvedLayout.width;
  const originY = resolvedLayout.marginTop;
  return scene.add.text(originX + resolvedLayout.width / 2, originY + 3, resolvedStyle.titleLabel, {
    fontSize: '5px',
    fontFamily: '"Press Start 2P", monospace',
    color: resolvedStyle.titleColor,
  }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(resolvedStyle.titleDepth);
}

export function createMinimapPlayerDot(
  scene: Phaser.Scene,
  layout: MinimapLayout,
  style?: MinimapStyle,
) {
  const resolvedLayout = resolveLayout(layout);
  const resolvedStyle = resolveStyle(style);
  const originX = scene.scale.width - resolvedLayout.marginRight - resolvedLayout.width;
  const originY = resolvedLayout.marginTop;
  return scene.add.circle(originX, originY, 2.5, resolvedStyle.playerDotColor, 1)
    .setScrollFactor(0)
    .setDepth(resolvedStyle.playerDotDepth) as Phaser.GameObjects.Arc;
}

export function createMinimapRemoteDot(
  scene: Phaser.Scene,
  layout: MinimapLayout,
  style?: MinimapStyle,
) {
  const resolvedLayout = resolveLayout(layout);
  const resolvedStyle = resolveStyle(style);
  const originX = scene.scale.width - resolvedLayout.marginRight - resolvedLayout.width;
  const originY = resolvedLayout.marginTop;
  return scene.add.circle(originX, originY, 2, resolvedStyle.remoteDotColor, 1)
    .setScrollFactor(0)
    .setDepth(resolvedStyle.remoteDotDepth) as Phaser.GameObjects.Arc;
}

export function setupMinimap(
  scene: Phaser.Scene,
  options: MinimapSetupOptions,
  refs: MinimapRefs = { remoteDots: new Map<string, Phaser.GameObjects.Arc>() },
) {
  const graphics = createMinimapGraphics(scene, options.layout, options.style);
  drawMinimapBuildings(graphics, scene, options.layout, options.buildings);
  const playerDot = createMinimapPlayerDot(scene, options.layout, options.style);
  const title = createMinimapTitle(scene, options.layout, options.style);
  const container = scene.add.container(0, 0, [graphics, playerDot, title]).setScrollFactor(0).setDepth(resolveStyle(options.style).graphicsDepth);

  refs.graphics = graphics;
  refs.playerDot = playerDot;
  refs.title = title;
  refs.container = container;

  const visible = options.visible ?? true;
  container.setVisible(visible);
  title.setVisible(visible);

  return refs;
}

export function setupMinimapLifecycle(
  scene: Phaser.Scene,
  options: MinimapSetupOptions,
  refs: MinimapRefs = { remoteDots: new Map<string, Phaser.GameObjects.Arc>() },
): MinimapLifecycle {
  setupMinimap(scene, options, refs);

  const destroy = () => destroyMinimap(refs);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);

  return { refs, destroy };
}

export function updateMinimapVisibility(refs: MinimapRefs, visible: boolean) {
  refs.container?.setVisible(visible);
  refs.title?.setVisible(visible);
  refs.playerDot?.setVisible(visible);
  refs.graphics?.setVisible(visible);
  for (const dot of refs.remoteDots.values()) {
    dot.setVisible(visible);
  }
}

export function renderMinimap({
  scene,
  refs,
  state,
  layout,
}: MinimapRenderContext) {
  if (!refs.container || !refs.playerDot) return;
  if (!state.visible) return;
  if (!refs.container.visible) return;

  const resolvedLayout = resolveLayout(layout);
  const originX = scene.scale.width - resolvedLayout.marginRight - resolvedLayout.width;
  const originY = resolvedLayout.marginTop;
  const scaleX = resolvedLayout.width / layout.worldWidth;
  const scaleY = resolvedLayout.height / layout.worldHeight;

  refs.playerDot.setPosition(
    originX + state.px * scaleX,
    originY + state.py * scaleY,
  );

  const activeIds = new Set<string>();
  for (const [playerId, player] of state.remotePlayers) {
    activeIds.add(playerId);
    let dot = refs.remoteDots.get(playerId);
    if (!dot || !dot.active) {
      dot = createMinimapRemoteDot(scene, layout);
      refs.remoteDots.set(playerId, dot);
    }
    dot.setPosition(
      originX + player.x * scaleX,
      originY + player.y * scaleY,
    );
    dot.setVisible(refs.container.visible);
  }

  for (const [playerId, dot] of refs.remoteDots) {
    if (!activeIds.has(playerId)) {
      dot.destroy();
      refs.remoteDots.delete(playerId);
    }
  }
}

export function drawMinimapBuildings(
  graphics: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  layout: MinimapLayout,
  buildings: MinimapBuildingDef[],
) {
  const resolvedLayout = resolveLayout(layout);
  const originX = scene.scale.width - resolvedLayout.marginRight - resolvedLayout.width;
  const originY = resolvedLayout.marginTop;
  const scaleX = resolvedLayout.width / layout.worldWidth;
  const scaleY = resolvedLayout.height / layout.worldHeight;

  for (const { rect, color } of buildings) {
    graphics.fillStyle(color, 0.55);
    graphics.fillRect(
      originX + rect.x * scaleX,
      originY + rect.y * scaleY,
      rect.w * scaleX,
      rect.h * scaleY,
    );
  }
}

export function destroyMinimap(refs: MinimapRefs) {
  for (const dot of refs.remoteDots.values()) {
    dot.destroy();
  }
  refs.remoteDots.clear();
  refs.playerDot?.destroy();
  refs.title?.destroy();
  refs.graphics?.destroy();
  refs.container?.destroy(true);
  refs.playerDot = undefined;
  refs.title = undefined;
  refs.graphics = undefined;
  refs.container = undefined;
}
