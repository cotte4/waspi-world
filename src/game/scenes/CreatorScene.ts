import Phaser from 'phaser';
import {
  AvatarRenderer,
  AvatarConfig,
  HairStyle,
  DEFAULT_AVATAR_CONFIG,
  loadStoredAvatarConfig,
  saveStoredAvatarConfig,
} from '../systems/AvatarRenderer';
import { COLORS, PLAYER } from '../config/constants';
import { announceScene, transitionToWorldScene } from '../systems/SceneUi';
import { worldExitFromSceneData } from '../systems/worldReturnSpawn';
import { SceneControls } from '../systems/SceneControls';
import { eventBus, EVENTS } from '../config/eventBus';

const USERNAME_KEY = 'waspi_username';
type CreatorControl = 'seed' | 'bodyColor' | 'eyeColor' | 'hairColor' | 'hairStyle' | 'pp' | 'tt' | 'save';
type SeedId = 'procedural' | 'gengar' | 'buho' | 'piplup' | 'chacha' | 'trap_a' | 'trap_b' | 'trap_c' | 'trap_d';

const SEED_DOT_COLORS: Record<SeedId, number> = {
  procedural: 0x888888,
  gengar:     0xA855F7,
  buho:       0x22C55E,
  piplup:     0x3B82F6,
  chacha:     0xEC4899,
  trap_a:     0xF5C842,
  trap_b:     0xF5C842,
  trap_c:     0xF5C842,
  trap_d:     0xF5C842,
};

export class CreatorScene extends Phaser.Scene {
  private preview!: AvatarRenderer;
  private selectedSeed: SeedId = 'procedural';
  private seedButtons: Array<{ id: SeedId; rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = [];
  private seedStatusText?: Phaser.GameObjects.Text;
  private config: Required<AvatarConfig>;
  private styleButtons: Array<{ style: HairStyle; rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = [];

  // Bar sliders
  private ppDots: Phaser.GameObjects.Rectangle[] = []; // kept for compat
  private ttDots: Phaser.GameObjects.Rectangle[] = []; // kept for compat
  private ppBarGfx?: Phaser.GameObjects.Graphics;
  private ttBarGfx?: Phaser.GameObjects.Graphics;
  private ppIndicator?: Phaser.GameObjects.Arc;
  private ttIndicator?: Phaser.GameObjects.Arc;
  private ppBarX = 0; private ppBarY = 0;
  private ttBarX = 0; private ttBarY = 0;
  private readonly SLIDER_W = 132;

  // Swatch selection rings
  private swatchRings = new Map<CreatorControl, Phaser.GameObjects.Rectangle[]>();

  private usernameInput?: Phaser.GameObjects.DOMElement;
  private usernameInputElement?: HTMLInputElement;
  private previewX = 0;
  private previewY = 0;

  private keyUp!: Phaser.Input.Keyboard.Key;
  private keyDown!: Phaser.Input.Keyboard.Key;
  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyEnter!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  private controlOrder: CreatorControl[] = ['seed', 'bodyColor', 'eyeColor', 'hairColor', 'hairStyle', 'pp', 'tt', 'save'];
  private activeControlIndex = 0;
  private controlLabels = new Map<CreatorControl, Phaser.GameObjects.Text>();
  private controls!: SceneControls;

  private readonly bodyColorOptions = [0xF5D5A4, 0xE6B98A, 0xD89B73, 0xBF7B4E, 0x9B5A3A, 0x7A412A];
  private readonly eyeColorOptions  = [0x222222, 0x3B82F6, 0x22C55E, 0xA855F7, 0xDC2626, 0xFACC15];
  private readonly hairColorOptions  = [0x1F130A, 0x8B5A2B, 0xF97316, 0xEF4444, 0xFFFFFF, 0xEC4899];
  private readonly seedOptions: SeedId[] = ['procedural', 'gengar', 'buho', 'piplup', 'chacha', 'trap_a', 'trap_b', 'trap_c', 'trap_d'];
  private readonly hairStyleOptions: HairStyle[] = ['SPI', 'FLA', 'MOH', 'X'];
  private worldExitX: number = PLAYER.SPAWN_X;
  private worldExitY: number = PLAYER.SPAWN_Y;

  constructor() {
    super({ key: 'CreatorScene' });
    this.config = { ...DEFAULT_AVATAR_CONFIG };
  }

  init(data?: Record<string, unknown>) {
    const w = worldExitFromSceneData(data, PLAYER.SPAWN_X, PLAYER.SPAWN_Y);
    this.worldExitX = w.x;
    this.worldExitY = w.y;
  }

  // ─────────────────────────────────────────────────────────────────
  create() {
    const { width, height } = this.scale;
    this.input.enabled = true;
    this.controls = new SceneControls(this);
    const storedConfig = loadStoredAvatarConfig();
    this.config = { ...storedConfig };
    this.selectedSeed = storedConfig.avatarKind;
    announceScene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });

    // ── BACKGROUND ────────────────────────────────────────────────
    this.cameras.main.setBackgroundColor('#05050A');
    const bg = this.add.graphics().setDepth(-2);
    bg.fillStyle(0x05050a, 1);
    bg.fillRect(0, 0, width, height);
    bg.lineStyle(1, 0xF5C842, 0.03);
    for (let gx = 0; gx < width; gx += 28)  bg.lineBetween(gx, 0, gx, height);
    for (let gy = 0; gy < height; gy += 24) bg.lineBetween(0, gy, width, gy);
    this.drawDiamond(bg, Math.round(width * 0.06),  Math.round(height * 0.5),  80, 0xF5C842, 0.04);
    this.drawDiamond(bg, Math.round(width * 0.90),  Math.round(height * 0.22), 56, 0xF5C842, 0.04);
    this.drawDiamond(bg, Math.round(width * 0.76),  Math.round(height * 0.88), 46, 0xF5C842, 0.04);

    // ── AVATAR PREVIEW — centered (React overlay covers sides) ─────
    this.previewX = Math.round(width / 2);
    this.previewY = Math.round(height * 0.44);

    // Soft radial glow
    const glow = this.add.graphics().setDepth(2);
    glow.fillStyle(0xF5C842, 0.07);
    glow.fillCircle(this.previewX, this.previewY, 80);

    // Watermark
    this.add.text(this.previewX, this.previewY, 'WASPI', {
      fontSize: '60px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5).setAlpha(0.03).setAngle(-8).setDepth(1);

    // Avatar
    this.preview = new AvatarRenderer(this, this.previewX, this.previewY, {
      ...this.config,
      avatarKind: this.selectedSeed,
    });
    this.preview.setDepth(3);

    // Seed status pill — below avatar
    this.seedStatusText = this.add.text(this.previewX, this.previewY + 120, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#111111',
      backgroundColor: '#F5C842',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(5);
    this.refreshSeedStatus();

    // ── KEYBOARD — ESC exits ───────────────────────────────────────
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // ── EVENTBUS — React overlay drives config ─────────────────────
    const unsubConfig = eventBus.on(EVENTS.CREATOR_CONFIG_CHANGED, (payload: unknown) => {
      const p = payload as Partial<AvatarConfig>;
      if (p.avatarKind !== undefined) this.selectedSeed = p.avatarKind;
      this.config = { ...this.config, ...p };
      this.refreshPreview();
    });
    const unsubCommit = eventBus.on(EVENTS.CREATOR_COMMIT, (payload: unknown) => {
      const p = (payload ?? {}) as { username?: string };
      if (p.username && typeof window !== 'undefined') {
        window.localStorage.setItem(USERNAME_KEY, p.username);
      }
      this.commitAndEnter();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubConfig();
      unsubCommit();
    });

    // Emit initial config so React overlay can pre-fill its state
    eventBus.emit(EVENTS.CREATOR_READY, { config: { ...this.config, avatarKind: this.selectedSeed } });

    this.cameras.main.fadeIn(350, 0, 0, 0);
  }

  // ─────────────────────────────────────────────────────────────────
  update() {
    // Drive avatar animation (aura particles, etc.) in the preview
    if (this.preview?.active) this.preview.update(false, 0, 0);
    // React overlay handles all UI — only ESC exits to world
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) || this.controls.isActionJustDown('back')) {
      this.commitAndEnter();
    }
  }

  // ── DRAW HELPERS ──────────────────────────────────────────────────
  private drawCard(x: number, y: number, w: number, h: number, accent: number): Phaser.GameObjects.Graphics {
    const card = this.add.graphics();
    card.fillStyle(0x070710, 0.97);
    card.fillRoundedRect(x, y, w, h, 14);
    card.lineStyle(2, accent, 0.9);
    card.strokeRoundedRect(x, y, w, h, 14);
    card.lineStyle(1, 0xF5C842, 0.1);
    card.strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, 10);
    return card;
  }

  private drawCornerBrackets(
    x: number, y: number, w: number, h: number,
    size: number, color: number, alpha: number,
  ) {
    const g = this.add.graphics().setDepth(3);
    g.lineStyle(2, color, alpha);
    // Top-left
    g.beginPath(); g.moveTo(x, y + size); g.lineTo(x, y); g.lineTo(x + size, y); g.strokePath();
    // Top-right
    g.beginPath(); g.moveTo(x + w - size, y); g.lineTo(x + w, y); g.lineTo(x + w, y + size); g.strokePath();
    // Bottom-left
    g.beginPath(); g.moveTo(x, y + h - size); g.lineTo(x, y + h); g.lineTo(x + size, y + h); g.strokePath();
    // Bottom-right
    g.beginPath(); g.moveTo(x + w - size, y + h); g.lineTo(x + w, y + h); g.lineTo(x + w, y + h - size); g.strokePath();
  }

  private drawDiamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number, color: number, alpha: number) {
    g.lineStyle(1, color, alpha);
    g.beginPath();
    g.moveTo(cx, cy - size);
    g.lineTo(cx + size, cy);
    g.lineTo(cx, cy + size);
    g.lineTo(cx - size, cy);
    g.closePath();
    g.strokePath();
  }

  // ── REFRESH METHODS ───────────────────────────────────────────────
  private refreshStyleButtons() {
    for (const button of this.styleButtons) {
      const active = button.style === this.config.hairStyle;
      button.rect.setFillStyle(active ? 0x2f2410 : 0x111111, 1);
      button.rect.setStrokeStyle(active ? 2 : 1, active ? 0xF5C842 : 0x2A2A3A, 1);
      button.text.setColor(active ? '#F5C842' : '#888888');
    }
  }

  private refreshSliders() {
    const drawBar = (
      gfx: Phaser.GameObjects.Graphics | undefined,
      indicator: Phaser.GameObjects.Arc | undefined,
      bx: number, by: number, value: number,
    ) => {
      if (!gfx || !indicator) return;
      gfx.clear();
      const fillW = (value / 10) * this.SLIDER_W;
      if (fillW > 0) {
        gfx.fillStyle(0xF5C842, 1);
        gfx.fillRect(bx, by - 2, fillW, 4);
      }
      indicator.setX(bx + (value / 10) * this.SLIDER_W);
    };
    drawBar(this.ppBarGfx, this.ppIndicator, this.ppBarX, this.ppBarY, this.config.pp);
    drawBar(this.ttBarGfx, this.ttIndicator, this.ttBarX, this.ttBarY, this.config.tt);
  }

  private refreshSwatchRings() {
    const entries: [CreatorControl, number[], number][] = [
      ['bodyColor', this.bodyColorOptions, this.bodyColorOptions.indexOf(this.config.bodyColor)],
      ['eyeColor',  this.eyeColorOptions,  this.eyeColorOptions.indexOf(this.config.eyeColor)],
      ['hairColor', this.hairColorOptions,  this.hairColorOptions.indexOf(this.config.hairColor)],
    ];
    for (const [control, , idx] of entries) {
      const rings = this.swatchRings.get(control);
      rings?.forEach((ring, i) => ring.setStrokeStyle(2, 0xFFFFFF, i === idx ? 1 : 0));
    }
  }

  private refreshPreview() {
    this.preview.destroy();
    this.preview = new AvatarRenderer(this, this.previewX, this.previewY, {
      ...this.config,
      avatarKind: this.selectedSeed,
    });
    this.preview.setDepth(3);
    this.refreshSeedStatus();
    this.refreshSwatchRings();
  }

  private handleSceneShutdown() {
    this.usernameInput?.destroy();
  }

  private refreshSeedButtons() {
    for (const button of this.seedButtons) {
      const active = button.id === this.selectedSeed;
      button.rect.setFillStyle(active ? 0x1A140A : 0x0D0D16, 1);
      button.rect.setStrokeStyle(active ? 2 : 1, active ? 0xF5C842 : 0x2A2A3A, 1);
      button.text.setColor(active ? '#F5C842' : '#888888');
    }
    this.refreshSeedStatus();
  }

  private refreshSeedStatus() {
    if (!this.seedStatusText) return;
    this.seedStatusText.setText(`● ${this.getSeedLabel(this.selectedSeed)}`);
  }

  private refreshControlHighlights() {
    const activeControl = this.controlOrder[this.activeControlIndex];
    for (const [control, label] of this.controlLabels.entries()) {
      const active = control === activeControl;
      label.setColor(active ? '#F5C842' : (control === 'save' ? '#5A4A1A' : '#5A6080'));
    }
  }

  // ── GAME LOGIC (preserved exactly) ────────────────────────────────
  private adjustActiveControl(direction: -1 | 1) {
    switch (this.controlOrder[this.activeControlIndex]) {
      case 'seed':
        this.selectedSeed = this.cycleInList(this.seedOptions, this.selectedSeed, direction);
        this.refreshSeedButtons(); this.refreshPreview(); break;
      case 'bodyColor':
        this.config.bodyColor = this.cycleInList(this.bodyColorOptions, this.config.bodyColor, direction);
        this.refreshPreview(); break;
      case 'eyeColor':
        this.config.eyeColor = this.cycleInList(this.eyeColorOptions, this.config.eyeColor, direction);
        this.refreshPreview(); break;
      case 'hairColor':
        this.config.hairColor = this.cycleInList(this.hairColorOptions, this.config.hairColor, direction);
        this.refreshPreview(); break;
      case 'hairStyle':
        this.config.hairStyle = this.cycleInList(this.hairStyleOptions, this.config.hairStyle, direction);
        this.refreshStyleButtons(); this.refreshPreview(); break;
      case 'pp':
        this.config.pp = Phaser.Math.Clamp(this.config.pp + direction, 0, 10);
        this.refreshSliders(); this.refreshPreview(); break;
      case 'tt':
        this.config.tt = Phaser.Math.Clamp(this.config.tt + direction, 0, 10);
        this.refreshSliders(); this.refreshPreview(); break;
    }
  }

  private activateActiveControl() {
    if (this.controlOrder[this.activeControlIndex] === 'save') { this.commitAndEnter(); return; }
    if (this.controlOrder[this.activeControlIndex] === 'seed') this.adjustActiveControl(1);
  }

  private commitAndEnter() {
    if (typeof window !== 'undefined') {
      const name = (this.usernameInputElement?.value || '').trim();
      if (name) window.localStorage.setItem(USERNAME_KEY, name);
      saveStoredAvatarConfig({ ...this.config, avatarKind: this.selectedSeed });
    }
    transitionToWorldScene(this, this.worldExitX, this.worldExitY);
  }

  private cycleInList<T>(values: T[], current: T, direction: -1 | 1) {
    const index = values.indexOf(current);
    const nextIndex = Phaser.Math.Wrap((index >= 0 ? index : 0) + direction, 0, values.length);
    return values[nextIndex];
  }

  private getSeedLabel(seed: SeedId) {
    const labels: Record<SeedId, string> = {
      procedural: 'PROC', gengar: 'GEN', buho: 'BUH', piplup: 'PIP',
      chacha: 'CHA', trap_a: 'TRA', trap_b: 'TRB', trap_c: 'TRC', trap_d: 'TRD',
    };
    return labels[seed] ?? 'PROC';
  }

  private isUsernameFocused() {
    if (typeof document === 'undefined' || !this.usernameInputElement) return false;
    return document.activeElement === this.usernameInputElement;
  }
}

