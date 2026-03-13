import Phaser from 'phaser';

type DialogLine = string;

export interface DialogOptions {
  x?: number;
  y?: number;
  width?: number;
}

interface ActiveDialog {
  container: Phaser.GameObjects.Container;
  textObj: Phaser.GameObjects.BitmapText | Phaser.GameObjects.Text;
  lines: DialogLine[];
  lineIndex: number;
  charIndex: number;
  done: () => void;
}

/**
 * Simple typewriter-style dialog box for scriptados NPCs (PRD §8.3).
 * Blocking: mientras haya diálogo activo, la escena puede pausar input de movimiento.
 */
export class DialogSystem {
  private scene: Phaser.Scene;
  private active: ActiveDialog | null = null;
  private timer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  isActive() {
    return this.active !== null;
  }

  start(lines: DialogLine[], opts: DialogOptions = {}, onComplete?: () => void) {
    if (!lines.length) return;
    this.clear();

    const cam = this.scene.cameras.main;
    const width = opts.width ?? 520;
    const x = opts.x ?? (cam.width / 2);
    const y = opts.y ?? (cam.height - 110);

    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(10000);
    g.fillStyle(0x000000, 0.82);
    g.fillRoundedRect(x - width / 2, y - 40, width, 80, 10);
    g.lineStyle(2, 0xf5c842, 0.6);
    g.strokeRoundedRect(x - width / 2, y - 40, width, 80, 10);

    const text = this.scene.add.text(x - width / 2 + 16, y - 28, '', {
      fontSize: '11px',
      fontFamily: '"Silkscreen", monospace',
      color: '#FFFFFF',
      wordWrap: { width: width - 32, useAdvancedWrap: true },
    }).setScrollFactor(0).setDepth(10001);

    const container = this.scene.add.container(0, 0, [g, text]).setScrollFactor(0).setDepth(10000);

    this.active = {
      container,
      textObj: text,
      lines,
      lineIndex: 0,
      charIndex: 0,
      done: onComplete ?? (() => {}),
    };

    this.typeNextChar();
  }

  /** Avanza el diálogo cuando el jugador presiona SPACE o A. */
  advance() {
    if (!this.active) return;
    const { lines, lineIndex, charIndex, textObj } = this.active;
    const fullLine = lines[lineIndex];

    // Si aún no se mostró toda la línea, completa instantáneamente
    if (charIndex < fullLine.length) {
      this.stopTimer();
      this.active.charIndex = fullLine.length;
      textObj.setText(fullLine);
      return;
    }

    // Siguiente línea
    if (lineIndex + 1 < lines.length) {
      this.stopTimer();
      this.active.lineIndex += 1;
      this.active.charIndex = 0;
      this.typeNextChar();
      return;
    }

    // Fin del diálogo
    const done = this.active.done;
    this.clear();
    done();
  }

  clear() {
    if (!this.active) return;
    this.stopTimer();
    this.active.container.destroy(true);
    this.active = null;
  }

  destroy() {
    this.clear();
  }

  private typeNextChar() {
    if (!this.active) return;
    const { lines, lineIndex, textObj } = this.active;
    const fullLine = lines[lineIndex];

    this.stopTimer();
    this.timer = this.scene.time.addEvent({
      delay: 22,
      loop: true,
      callback: () => {
        if (!this.active) return;
        const cur = this.active;
        const nextIndex = cur.charIndex + 1;
        if (nextIndex >= fullLine.length) {
          cur.charIndex = fullLine.length;
          textObj.setText(fullLine);
          this.stopTimer();
          return;
        }
        cur.charIndex = nextIndex;
        textObj.setText(fullLine.slice(0, nextIndex));
      },
    });
  }

  private stopTimer() {
    if (this.timer) {
      this.timer.remove(false);
      this.timer = undefined;
    }
  }
}

