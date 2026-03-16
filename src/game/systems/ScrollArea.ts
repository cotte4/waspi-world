import Phaser from 'phaser';

export type ScrollArea = {
  content: Phaser.GameObjects.Container;
  /** Scroll offset (negative = down). */
  setScrollY: (y: number) => void;
  /** Current scroll offset. */
  getScrollY: () => number;
  destroy: () => void;
};

export function createScrollArea(
  scene: Phaser.Scene,
  input: {
    /** Viewport in screen coords (ScrollFactor 0 UI). */
    x: number;
    y: number;
    w: number;
    h: number;
    /** Optional: mount UI (track/thumb) into this container. Defaults to scene root. */
    mount?: Phaser.GameObjects.Container;
    /** How much to scroll per wheel tick. */
    step?: number;
    /** Track/Thumb style. */
    scrollbar?: {
      trackColor?: number;
      trackAlpha?: number;
      thumbColor?: number;
      thumbAlpha?: number;
      width?: number;
      insetRight?: number;
      insetY?: number;
      depth?: number;
    };
  }
): ScrollArea {
  const mount = input.mount ?? null;
  const step = input.step ?? 34;
  const trackColor = input.scrollbar?.trackColor ?? 0xffffff;
  const trackAlpha = input.scrollbar?.trackAlpha ?? 0.08;
  const thumbColor = input.scrollbar?.thumbColor ?? 0xF5C842;
  const thumbAlpha = input.scrollbar?.thumbAlpha ?? 0.45;
  const sbWidth = input.scrollbar?.width ?? 6;
  const insetRight = input.scrollbar?.insetRight ?? 16;
  const insetY = input.scrollbar?.insetY ?? 10;
  const depth = input.scrollbar?.depth ?? 1;

  const maskG = scene.add.graphics().setScrollFactor(0);
  maskG.fillStyle(0xffffff, 1);
  maskG.fillRect(input.x, input.y, input.w, input.h);
  const mask = maskG.createGeometryMask();
  maskG.setVisible(false);

  const content = scene.add.container(0, 0).setScrollFactor(0);
  content.setMask(mask);

  const trackH = Math.max(12, input.h - insetY * 2);
  const trackX = input.x + input.w - insetRight;
  const trackY = input.y + insetY;

  const track = scene.add.rectangle(trackX, trackY + trackH / 2, sbWidth, trackH, trackColor, trackAlpha)
    .setScrollFactor(0)
    .setDepth(depth)
    .setVisible(false);
  const thumb = scene.add.rectangle(trackX, trackY + 10, sbWidth, 18, thumbColor, thumbAlpha)
    .setScrollFactor(0)
    .setDepth(depth + 1)
    .setVisible(false);

  if (mount) {
    mount.add(content);
    mount.add(track);
    mount.add(thumb);
  }

  const computeMaxScroll = () => {
    const bounds = content.getBounds();
    const contentHeight = Math.max(0, bounds.height);
    return Math.max(0, contentHeight - input.h);
  };

  const updateScrollbar = () => {
    const maxScroll = computeMaxScroll();
    if (maxScroll <= 0) {
      track.setVisible(false);
      thumb.setVisible(false);
      content.y = 0;
      return;
    }

    const bounds = content.getBounds();
    const contentHeight = Math.max(1, bounds.height);
    const thumbH = Math.max(18, Math.round(trackH * (input.h / Math.max(input.h, contentHeight))));
    thumb.setSize(sbWidth, thumbH);

    const t = -content.y / maxScroll;
    const thumbTravel = trackH - thumbH;
    thumb.setY(trackY + (thumbH / 2) + t * Math.max(0, thumbTravel));
    track.setVisible(true);
    thumb.setVisible(true);
  };

  const setScrollY = (y: number) => {
    const maxScroll = computeMaxScroll();
    content.y = Phaser.Math.Clamp(y, -maxScroll, 0);
    updateScrollbar();
  };

  // Wheel handler (only while hovering viewport).
  const wheelHandler = (_pointer: Phaser.Input.Pointer, _go: unknown, _dx: number, dy: number) => {
    const p = scene.input.activePointer;
    if (p.x < input.x || p.x > input.x + input.w || p.y < input.y || p.y > input.y + input.h) return;
    const next = content.y - Math.sign(dy) * step;
    setScrollY(next);
  };
  scene.input.on('wheel', wheelHandler);

  const destroy = () => {
    try { scene.input.off('wheel', wheelHandler); } catch { /* noop */ }
    try { maskG.destroy(); } catch { /* noop */ }
    try { track.destroy(); } catch { /* noop */ }
    try { thumb.destroy(); } catch { /* noop */ }
    try { content.destroy(true); } catch { /* noop */ }
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);

  // Ensure correct initial visibility once items are added.
  scene.time.delayedCall(0, () => updateScrollbar());

  return {
    content,
    setScrollY,
    getScrollY: () => content.y,
    destroy,
  };
}

