// EventBanner.ts
// HUD banner fixed to the bottom-right corner of the screen.
// Shows the active global event that ends soonest (urgency-first).
// Rebuilt on every refresh() call; invisible when no events are active.

import { getEventSystem } from './EventSystem';
import type { GlobalEvent } from './EventSystem';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeLeft(endAt: string): string {
  const diffMs = new Date(endAt).getTime() - Date.now();
  if (diffMs <= 0) return 'TERMINADO';
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

function pickSoonestEvent(events: GlobalEvent[]): GlobalEvent | null {
  if (events.length === 0) return null;
  return events.reduce((prev, cur) =>
    new Date(cur.end_at).getTime() < new Date(prev.end_at).getTime() ? cur : prev,
  );
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const BANNER_W = 260;
const BANNER_H = 52;
const PAD_X = 10;
const PAD_Y = 8;
const MARGIN_RIGHT = 12;
const MARGIN_BOTTOM = 12;
const DEPTH = 9250;

// ---------------------------------------------------------------------------
// EventBanner
// ---------------------------------------------------------------------------

export class EventBanner {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private timerEvent: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(DEPTH);
    this.container.setVisible(false);
    this.refresh();
  }

  // -------------------------------------------------------------------------
  // refresh — rebuilds the banner with current active events
  // -------------------------------------------------------------------------

  refresh(): void {
    // Destroy previous children
    this.container.removeAll(true);

    const active = getEventSystem().getActiveEvents();
    const ev = pickSoonestEvent(active);

    if (!ev) {
      this.container.setVisible(false);
      return;
    }

    this.container.setVisible(true);

    const { width, height } = this.scene.scale;
    const x = width - BANNER_W - MARGIN_RIGHT;
    const y = height - BANNER_H - MARGIN_BOTTOM;
    this.container.setPosition(x, y);

    // Background rect
    const bg = this.scene.add.rectangle(
      BANNER_W / 2,
      BANNER_H / 2,
      BANNER_W,
      BANNER_H,
      0x0e0e14,
      0.85,
    );
    bg.setStrokeStyle(1.5, Phaser.Display.Color.HexStringToColor(ev.color).color, 1);
    this.container.add(bg);

    // Row 1: icon + name + time left
    const timeStr = formatTimeLeft(ev.end_at);
    const nameText = this.scene.add.text(
      PAD_X + 18,
      PAD_Y,
      `${ev.icon} ${ev.name}`,
      {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '9px',
        color: ev.color,
        resolution: 2,
      },
    );
    nameText.setOrigin(0, 0);
    this.container.add(nameText);

    const timeText = this.scene.add.text(
      BANNER_W - PAD_X,
      PAD_Y,
      `[${timeStr}]`,
      {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '9px',
        color: ev.color,
        resolution: 2,
      },
    );
    timeText.setOrigin(1, 0);
    this.container.add(timeText);

    // Row 2: description
    const descText = this.scene.add.text(
      PAD_X,
      PAD_Y + 20,
      ev.description,
      {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#888899',
        resolution: 2,
        wordWrap: { width: BANNER_W - PAD_X * 2 },
      },
    );
    descText.setOrigin(0, 0);
    this.container.add(descText);
  }

  // -------------------------------------------------------------------------
  // startAutoRefresh — rebuilds every 60 seconds
  // -------------------------------------------------------------------------

  startAutoRefresh(): void {
    if (this.timerEvent) {
      this.timerEvent.remove(false);
    }
    this.timerEvent = this.scene.time.addEvent({
      delay: 60_000,
      loop: true,
      callback: () => this.refresh(),
    });
  }

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  destroy(): void {
    if (this.timerEvent) {
      this.timerEvent.remove(false);
      this.timerEvent = null;
    }
    this.container.removeAll(true);
    this.container.destroy();
  }
}
