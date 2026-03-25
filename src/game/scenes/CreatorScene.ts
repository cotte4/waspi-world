import Phaser from 'phaser';
import {
  AvatarRenderer,
  AvatarConfig,
  AvatarKind,
  DEFAULT_AVATAR_CONFIG,
  loadStoredAvatarConfig,
  saveStoredAvatarConfig,
} from '../systems/AvatarRenderer';
import { PLAYER } from '../config/constants';
import { announceScene, transitionToWorldScene } from '../systems/SceneUi';
import { worldExitFromSceneData } from '../systems/worldReturnSpawn';
import { SceneControls } from '../systems/SceneControls';
import { eventBus, EVENTS } from '../config/eventBus';

const USERNAME_KEY = 'waspi_username';

export class CreatorScene extends Phaser.Scene {
  private preview!: AvatarRenderer;
  private selectedSeed: AvatarKind = 'procedural';
  private seedStatusText?: Phaser.GameObjects.Text;
  private config: Required<AvatarConfig>;
  private previewX = 0;
  private previewY = 0;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private controls!: SceneControls;
  private worldExitX: number = PLAYER.SPAWN_X;
  private worldExitY: number = PLAYER.SPAWN_Y;
  private allowHairCustomization = true;

  constructor() {
    super({ key: 'CreatorScene' });
    this.config = { ...DEFAULT_AVATAR_CONFIG };
  }

  init(data?: Record<string, unknown>) {
    const w = worldExitFromSceneData(data, PLAYER.SPAWN_X, PLAYER.SPAWN_Y);
    this.worldExitX = w.x;
    this.worldExitY = w.y;
    this.allowHairCustomization = data?.allowHairCustomization !== false;
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
    eventBus.emit(EVENTS.CREATOR_READY, {
      config: { ...this.config, avatarKind: this.selectedSeed },
      allowHairCustomization: this.allowHairCustomization,
    });

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

  // ── REFRESH ───────────────────────────────────────────────────────
  private refreshPreview() {
    this.preview.destroy();
    this.preview = new AvatarRenderer(this, this.previewX, this.previewY, {
      ...this.config,
      avatarKind: this.selectedSeed,
    });
    this.preview.setDepth(3);
    this.refreshSeedStatus();
  }

  private refreshSeedStatus() {
    if (!this.seedStatusText) return;
    const labels: Record<AvatarKind, string> = {
      procedural: 'PROC', gengar: 'GEN', buho: 'BUH', piplup: 'PIP',
      chacha: 'CHA', trap_a: 'TRA', trap_b: 'TRB', trap_c: 'TRC', trap_d: 'TRD',
    };
    this.seedStatusText.setText(`● ${labels[this.selectedSeed] ?? 'PROC'}`);
  }

  private commitAndEnter() {
    if (typeof window !== 'undefined') {
      saveStoredAvatarConfig({ ...this.config, avatarKind: this.selectedSeed });
    }
    transitionToWorldScene(this, this.worldExitX, this.worldExitY);
  }
}
