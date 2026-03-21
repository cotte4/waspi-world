import Phaser from 'phaser';
import { CHAT } from '../config/constants';

interface Bubble {
  container: Phaser.GameObjects.Container;
  expiresAt: number;
}

export interface ChatMessage {
  playerId: string;
  username: string;
  message: string;
  x: number;
  y: number;
  isMe?: boolean;
}

export class ChatSystem {
  private scene: Phaser.Scene;
  private bubbles = new Map<string, Bubble>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  showBubble(playerId: string, message: string, x: number, y: number, isMe = false) {
    this.clearBubble(playerId);

    const maxW = 190;
    const pad = 8;

    const text = this.scene.add.text(0, 0, message, {
      fontSize: '10px',
      fontFamily: '"Silkscreen", "Courier New", monospace',
      color: '#FFFFFF',
      wordWrap: { width: maxW - pad * 2 },
      align: 'center',
    });

    const tw = Math.min(text.width + pad * 2, maxW);
    const th = text.height + pad * 2;

    const bg = this.scene.add.graphics();

    // Bubble background
    bg.fillStyle(0x000000, 0.82);
    bg.fillRoundedRect(-tw / 2, -(th + 8), tw, th, 6);

    // Border color: gold for self, blue for others
    const borderColor = isMe ? 0xF5C842 : 0x6688FF;
    bg.lineStyle(1.5, borderColor, 0.8);
    bg.strokeRoundedRect(-tw / 2, -(th + 8), tw, th, 6);

    // Pointer triangle
    bg.fillStyle(0x000000, 0.82);
    bg.fillTriangle(-5, -8, 5, -8, 0, 0);

    text.setPosition(-text.width / 2, -(th + 8) + pad);

    const container = this.scene.add.container(x, y - 36, [bg, text]);
    container.setDepth(120);

    this.bubbles.set(playerId, {
      container,
      expiresAt: Date.now() + CHAT.BUBBLE_DURATION,
    });
  }

  clearBubble(playerId: string) {
    const b = this.bubbles.get(playerId);
    if (b) {
      if (b.container?.scene && b.container.active) {
        b.container.destroy();
      }
      this.bubbles.delete(playerId);
    }
  }

  updatePosition(playerId: string, x: number, y: number) {
    const b = this.bubbles.get(playerId);
    if (!b) return;
    if (!b.container?.scene || !b.container.active) {
      this.bubbles.delete(playerId);
      return;
    }
    b.container.setPosition(x, y - 36);
  }

  update() {
    const now = Date.now();
    for (const [id, b] of this.bubbles) {
      if (!b.container?.scene || !b.container.active) {
        this.bubbles.delete(id);
        continue;
      }
      const remaining = b.expiresAt - now;
      if (remaining <= 0) {
        this.clearBubble(id);
      } else if (remaining < 1000) {
        b.container.setAlpha(remaining / 1000);
      }
    }
  }

  destroy() {
    for (const [id] of this.bubbles) this.clearBubble(id);
  }
}
