import Phaser from 'phaser';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DialogChoice {
  label: string;
  next: DialogNode;
}

export interface DialogNode {
  lines: string[];
  choices?: DialogChoice[];
  /** Called when the node ends with no choices (terminal node). */
  onComplete?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPEWRITER_DELAY = 22;
const BOX_W = 560;
const CHOICE_LINE_H = 22;
const TEXT_AREA_H = 72;
const BOX_PADDING = 14;
const GOLD = '#F5C842';
const WHITE = '#FFFFFF';
const DIM = '#888888';

// ─── BranchedDialog ──────────────────────────────────────────────────────────

/**
 * Typewriter-style dialog with branching choices.
 * - Call start(rootNode) to begin.
 * - Call advance() on SPACE/interact to skip typewriter or go to next line.
 * - Call update() every frame so choice navigation (↑↓) works.
 */
export class BranchedDialog {
  private scene: Phaser.Scene;
  private active = false;
  private choiceMode = false;

  // current node state
  private currentNode: DialogNode | null = null;
  private lineIndex = 0;
  private charIndex = 0;
  private timer?: Phaser.Time.TimerEvent;

  // game objects
  private container: Phaser.GameObjects.Container | null = null;
  private bgGraphics?: Phaser.GameObjects.Graphics;
  private speakerText?: Phaser.GameObjects.Text;
  private dialogText?: Phaser.GameObjects.Text;
  private choiceObjs: Phaser.GameObjects.Text[] = [];
  private cursorObj?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;

  // choice navigation
  private selectedChoice = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  isActive(): boolean { return this.active; }
  isInChoiceMode(): boolean { return this.choiceMode; }

  // ─── Public API ────────────────────────────────────────────────────────────

  start(rootNode: DialogNode): void {
    this.destroy();
    this.active = true;
    this.choiceMode = false;
    this.selectedChoice = 0;
    this._loadNode(rootNode);
  }

  /**
   * Called on SPACE/interact press.
   * - During typewriter: completes the current line instantly.
   * - After line finishes: advances to next line, or enters choice mode.
   * - During choice mode: confirms selected choice.
   */
  advance(): void {
    if (!this.active) return;

    if (this.choiceMode) {
      this._confirmChoice();
      return;
    }

    const node = this.currentNode!;
    const fullLine = node.lines[this.lineIndex];

    // Skip typewriter — show full line immediately
    if (this.charIndex < fullLine.length) {
      this._stopTimer();
      this.charIndex = fullLine.length;
      this.dialogText?.setText(fullLine);
      return;
    }

    // Next line
    if (this.lineIndex + 1 < node.lines.length) {
      this._stopTimer();
      this.lineIndex++;
      this.charIndex = 0;
      this._typeNextChar();
      return;
    }

    // All lines done — choices or terminal
    if (node.choices?.length) {
      this._enterChoiceMode();
    } else {
      const cb = node.onComplete;
      this.destroy();
      cb?.();
    }
  }

  // No per-frame update needed — navigation is event-driven via _grabKeys()

  destroy(): void {
    this._stopTimer();
    this.container?.destroy(true);
    this.container = null;
    this.bgGraphics = undefined;
    this.speakerText = undefined;
    this.dialogText = undefined;
    this.hintText = undefined;
    this.choiceObjs = [];
    this.cursorObj = undefined;
    this.active = false;
    this.choiceMode = false;
    this.currentNode = null;
    this._releaseKeys();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _loadNode(node: DialogNode): void {
    this.currentNode = node;
    this.lineIndex = 0;
    this.charIndex = 0;
    this.choiceMode = false;
    this.selectedChoice = 0;
    this._buildUI();
    this._typeNextChar();
  }

  private _buildUI(): void {
    // Clean up previous container if any
    this.container?.destroy(true);

    const cam = this.scene.cameras.main;
    const cx = cam.width / 2;
    const boxX = cx - BOX_W / 2;

    // For text-only mode, box height is TEXT_AREA_H + speaker + padding
    const boxH = BOX_PADDING * 2 + 18 + 4 + TEXT_AREA_H; // ~118px
    const boxY = cam.height - boxH - 16;

    const container = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(10500);
    this.container = container;

    // Background
    const bg = this.scene.add.graphics().setScrollFactor(0);
    bg.fillStyle(0x000000, 0.88);
    bg.fillRoundedRect(boxX, boxY, BOX_W, boxH, 10);
    bg.lineStyle(2, 0xF5C842, 0.8);
    bg.strokeRoundedRect(boxX, boxY, BOX_W, boxH, 10);
    this.bgGraphics = bg;
    container.add(bg);

    // Speaker name
    const speaker = this.scene.add.text(boxX + BOX_PADDING, boxY + BOX_PADDING, 'COTTENKS', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: GOLD,
    }).setScrollFactor(0);
    this.speakerText = speaker;
    container.add(speaker);

    // Dialog text
    const textY = boxY + BOX_PADDING + 18 + 6;
    const dialogText = this.scene.add.text(boxX + BOX_PADDING, textY, '', {
      fontSize: '11px',
      fontFamily: '"Silkscreen", monospace',
      color: WHITE,
      wordWrap: { width: BOX_W - BOX_PADDING * 2, useAdvancedWrap: true },
    }).setScrollFactor(0);
    this.dialogText = dialogText;
    container.add(dialogText);

    // Hint "SPACE continuar"
    const hint = this.scene.add.text(boxX + BOX_W - BOX_PADDING, boxY + boxH - BOX_PADDING, '[SPACE]', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: DIM,
    }).setOrigin(1, 1).setScrollFactor(0);
    this.hintText = hint;
    container.add(hint);
  }

  private _enterChoiceMode(): void {
    this.choiceMode = true;
    this.selectedChoice = 0;
    this._grabKeys();
    this._rebuildForChoices();
  }

  private _rebuildForChoices(): void {
    const choices = this.currentNode?.choices ?? [];
    if (!choices.length) return;

    const cam = this.scene.cameras.main;
    const cx = cam.width / 2;
    const boxX = cx - BOX_W / 2;

    const choicesH = choices.length * CHOICE_LINE_H + BOX_PADDING;
    const separatorH = 10;
    const speakerH = 18 + 4;
    const boxH = BOX_PADDING * 2 + speakerH + TEXT_AREA_H + separatorH + choicesH;
    const boxY = cam.height - boxH - 16;

    // Redraw background to fit choices
    this.bgGraphics?.clear();
    this.bgGraphics?.fillStyle(0x000000, 0.92);
    this.bgGraphics?.fillRoundedRect(boxX, boxY, BOX_W, boxH, 10);
    this.bgGraphics?.lineStyle(2, 0xF5C842, 0.8);
    this.bgGraphics?.strokeRoundedRect(boxX, boxY, BOX_W, boxH, 10);

    // Reposition existing text elements
    this.speakerText?.setPosition(boxX + BOX_PADDING, boxY + BOX_PADDING);
    this.dialogText?.setPosition(boxX + BOX_PADDING, boxY + BOX_PADDING + speakerH + 6);

    // Separator line
    const sepY = boxY + BOX_PADDING + speakerH + TEXT_AREA_H + 8;
    const sep = this.scene.add.graphics().setScrollFactor(0);
    sep.lineStyle(1, 0xF5C842, 0.3);
    sep.beginPath();
    sep.moveTo(boxX + BOX_PADDING, sepY);
    sep.lineTo(boxX + BOX_W - BOX_PADDING, sepY);
    sep.strokePath();
    this.container?.add(sep);

    // Hide hint while showing choices
    this.hintText?.setAlpha(0);

    // Build choice text objects
    this.choiceObjs.forEach(t => t.destroy());
    this.choiceObjs = [];
    this.cursorObj?.destroy();

    const choiceStartY = sepY + 8;
    const CURSOR_X = boxX + BOX_PADDING;
    const LABEL_X = boxX + BOX_PADDING + 16;

    // Cursor ▶
    const cursor = this.scene.add.text(CURSOR_X, choiceStartY, '▶', {
      fontSize: '10px',
      fontFamily: '"Silkscreen", monospace',
      color: GOLD,
    }).setScrollFactor(0);
    this.cursorObj = cursor;
    this.container?.add(cursor);

    // Choice labels
    choices.forEach((choice, i) => {
      const t = this.scene.add.text(LABEL_X, choiceStartY + i * CHOICE_LINE_H, choice.label, {
        fontSize: '10px',
        fontFamily: '"Silkscreen", monospace',
        color: i === 0 ? WHITE : DIM,
      }).setScrollFactor(0);
      this.choiceObjs.push(t);
      this.container?.add(t);
    });

    // Nav hint
    const navHint = this.scene.add.text(boxX + BOX_W - BOX_PADDING, boxY + boxH - BOX_PADDING, '[↑↓] mover  [SPACE] elegir', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: DIM,
    }).setOrigin(1, 1).setScrollFactor(0);
    this.container?.add(navHint);
  }

  private _renderChoices(): void {
    const choices = this.currentNode?.choices ?? [];
    choices.forEach((_, i) => {
      this.choiceObjs[i]?.setColor(i === this.selectedChoice ? WHITE : DIM);
    });
    const startY = this.choiceObjs[0]?.y ?? 0;
    this.cursorObj?.setY(startY + this.selectedChoice * CHOICE_LINE_H);
  }

  private _confirmChoice(): void {
    const choices = this.currentNode?.choices ?? [];
    const chosen = choices[this.selectedChoice];
    if (!chosen) return;
    this._releaseKeys();
    this._loadNode(chosen.next);
  }

  private _typeNextChar(): void {
    if (!this.currentNode) return;
    const fullLine = this.currentNode.lines[this.lineIndex];
    this._stopTimer();
    this.timer = this.scene.time.addEvent({
      delay: TYPEWRITER_DELAY,
      loop: true,
      callback: () => {
        if (!this.currentNode) return;
        const next = this.charIndex + 1;
        if (next >= fullLine.length) {
          this.charIndex = fullLine.length;
          this.dialogText?.setText(fullLine);
          this._stopTimer();
          return;
        }
        this.charIndex = next;
        this.dialogText?.setText(fullLine.slice(0, next));
      },
    });
  }

  private _stopTimer(): void {
    if (this.timer) {
      this.timer.remove(false);
      this.timer = undefined;
    }
  }

  // Event handlers stored as arrow fns so we can remove the exact same reference
  private readonly _onUp = () => {
    if (!this.choiceMode) return;
    const n = this.currentNode?.choices?.length ?? 0;
    if (!n) return;
    this.selectedChoice = (this.selectedChoice - 1 + n) % n;
    this._renderChoices();
  };

  private readonly _onDown = () => {
    if (!this.choiceMode) return;
    const n = this.currentNode?.choices?.length ?? 0;
    if (!n) return;
    this.selectedChoice = (this.selectedChoice + 1) % n;
    this._renderChoices();
  };

  private _grabKeys(): void {
    // Use keyboard events — never addKey/removeKey so WASD movement is untouched
    this.scene.input.keyboard?.on('keydown-UP', this._onUp, this);
    this.scene.input.keyboard?.on('keydown-DOWN', this._onDown, this);
  }

  private _releaseKeys(): void {
    this.scene.input.keyboard?.off('keydown-UP', this._onUp, this);
    this.scene.input.keyboard?.off('keydown-DOWN', this._onDown, this);
  }
}
