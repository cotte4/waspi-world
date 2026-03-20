import Phaser from 'phaser';
import {
  AvatarRenderer,
  AvatarConfig,
  HairStyle,
  loadStoredAvatarConfig,
  saveStoredAvatarConfig,
} from '../systems/AvatarRenderer';
import { COLORS, PLAYER } from '../config/constants';
import { announceScene, transitionToWorldScene } from '../systems/SceneUi';
import { worldExitFromSceneData } from '../systems/worldReturnSpawn';
import { SceneControls } from '../systems/SceneControls';

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
    this.config = {
      avatarKind:  'procedural',
      bodyColor:   COLORS.SKIN_LIGHT,
      hairColor:   COLORS.HAIR_BROWN,
      eyeColor:    0x2244CC,
      topColor:    COLORS.BODY_BLUE,
      bottomColor: COLORS.LEGS_DARK,
      hairStyle:   'SPI',
      pp: 2, tt: 2,
      smoke: false,
      equipTop: '', equipBottom: '',
    };
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

    // Ultra-subtle gold grid
    bg.lineStyle(1, 0xF5C842, 0.03);
    for (let gx = 0; gx < width; gx += 28)  bg.lineBetween(gx, 0, gx, height);
    for (let gy = 0; gy < height; gy += 24) bg.lineBetween(0, gy, width, gy);

    // Faint diamond decorations
    this.drawDiamond(bg, Math.round(width * 0.06),  Math.round(height * 0.5),  80, 0xF5C842, 0.04);
    this.drawDiamond(bg, Math.round(width * 0.90),  Math.round(height * 0.22), 56, 0xF5C842, 0.04);
    this.drawDiamond(bg, Math.round(width * 0.76),  Math.round(height * 0.88), 46, 0xF5C842, 0.04);

    // ── HEADER ────────────────────────────────────────────────────
    this.add.text(width / 2, 28, 'WASPI WORLD', {
      fontSize: '26px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(width / 2, 64, 'CHARACTER  SELECT', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#5A6080',
    }).setOrigin(0.5);

    // Blinking cursor after title
    const blink = this.add.text(width / 2 + 98, 64, '█', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0, 0.5);
    this.tweens.add({ targets: blink, alpha: 0, duration: 500, yoyo: true, repeat: -1 });

    // ── LAYOUT ───────────────────────────────────────────────────
    const COL1 = { x: 16,  y: 100, w: 236, h: 420 };
    const COL2 = { x: 264, y: 100, w: 240, h: 420 };
    const COL3 = { x: 516, y: 100, w: 268, h: 420 };
    const CTA  = { x: 16,  y: 530, w: width - 32, h: 46 };

    // Column background cards
    const c1 = this.drawCard(COL1.x, COL1.y, COL1.w, COL1.h, 0x2A2040);
    const c2 = this.drawCard(COL2.x, COL2.y, COL2.w, COL2.h, 0x1E2840);
    const c3 = this.drawCard(COL3.x, COL3.y, COL3.w, COL3.h, 0x1A2830);
    const c4 = this.drawCard(CTA.x,  CTA.y,  CTA.w,  CTA.h,  0x4a3a12);

    // ── COL 1: CHARACTER STAGE ────────────────────────────────────
    const seedLabel = this.add.text(COL1.x + 14, COL1.y + 14, '◈ PERSONAJE', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0, 0);
    this.controlLabels.set('seed', seedLabel);

    // Preview frame dimensions
    const PFX = COL1.x + 18;
    const PFY = COL1.y + 36;
    const PFW = COL1.w - 36;
    const PFH = 218;

    // WASPI watermark
    this.add.text(PFX + PFW / 2, PFY + PFH / 2, 'WASPI', {
      fontSize: '50px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5).setAlpha(0.04).setAngle(-10).setDepth(1);

    // Soft radial glow behind avatar
    const glow = this.add.graphics().setDepth(2);
    glow.fillStyle(0xF5C842, 0.07);
    glow.fillCircle(PFX + PFW / 2, PFY + PFH / 2, 68);

    // Preview background
    const prevBg = this.add.graphics().setDepth(2);
    prevBg.fillStyle(0x030308, 1);
    prevBg.fillRect(PFX, PFY, PFW, PFH);

    // Scanline overlay on preview
    const scans = this.add.graphics().setDepth(4);
    for (let sy = PFY; sy < PFY + PFH; sy += 3) {
      scans.lineStyle(1, 0x000000, 0.07);
      scans.lineBetween(PFX, sy, PFX + PFW, sy);
    }

    // L-shaped corner brackets
    this.drawCornerBrackets(PFX, PFY, PFW, PFH, 16, 0xF5C842, 0.9);

    // Avatar — centered in preview frame
    this.previewX = PFX + PFW / 2;
    this.previewY = PFY + PFH / 2 + 12;
    this.preview = new AvatarRenderer(this, this.previewX, this.previewY, {
      ...this.config,
      avatarKind: this.selectedSeed,
    });
    this.preview.setDepth(3); // must be > prevBg (2) and < scans (4)

    // Seed status pill
    this.seedStatusText = this.add.text(COL1.x + COL1.w / 2, PFY + PFH + 14, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#111111',
      backgroundColor: '#F5C842',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(5);

    // Name input — bottom of col1
    const storedName = (typeof window !== 'undefined' ? window.localStorage.getItem(USERNAME_KEY) : null) ?? '';
    const defaultName = storedName || `WASPI_${Math.floor(Math.random() * 999)}`;

    const inputEl = document.createElement('input');
    inputEl.value        = defaultName;
    inputEl.maxLength    = 18;
    inputEl.autocomplete = 'off';
    inputEl.spellcheck   = false;
    Object.assign(inputEl.style, {
      width:        '192px',
      padding:      '7px 10px',
      background:   'rgba(0,0,0,0.85)',
      border:       'none',
      borderBottom: '2px solid rgba(245,200,66,0.55)',
      color:        '#FFFFFF',
      outline:      'none',
      fontFamily:   '"Silkscreen", monospace',
      fontSize:     '14px',
      textAlign:    'center',
      letterSpacing:'2px',
    });
    inputEl.addEventListener('input', () => {
      const cleaned = inputEl.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 18);
      if (cleaned !== inputEl.value) inputEl.value = cleaned;
    });
    inputEl.name = 'waspi-username';
    inputEl.id   = 'waspi-username';
    this.usernameInput = this.add.dom(COL1.x + COL1.w / 2, PFY + PFH + 52, inputEl);
    this.usernameInputElement = inputEl;

    // ── COL 2: SEED PICKER ────────────────────────────────────────
    this.add.text(COL2.x + COL2.w / 2, COL2.y + 14, '◄  TIPO  ►', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#5A6080',
    }).setOrigin(0.5, 0);

    const seeds: Array<{ id: SeedId; label: string }> = [
      { id: 'procedural', label: 'PROC' },
      { id: 'gengar',     label: 'GEN'  },
      { id: 'buho',       label: 'BUH'  },
      { id: 'piplup',     label: 'PIP'  },
      { id: 'chacha',     label: 'CHA'  },
      { id: 'trap_a',     label: 'TRA'  },
      { id: 'trap_b',     label: 'TRB'  },
      { id: 'trap_c',     label: 'TRC'  },
      { id: 'trap_d',     label: 'TRD'  },
    ];

    const CARD_W = 62, CARD_H = 52, CARD_GAP = 8;
    const gridTotalW = 3 * CARD_W + 2 * CARD_GAP;
    const gridX0 = COL2.x + Math.floor((COL2.w - gridTotalW) / 2) + CARD_W / 2;
    const gridY0 = COL2.y + 44 + CARD_H / 2;

    seeds.forEach((seed, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const cx = gridX0 + col * (CARD_W + CARD_GAP);
      const cy = gridY0 + row * (CARD_H + CARD_GAP);

      const rect = this.add.rectangle(cx, cy, CARD_W, CARD_H, 0x0D0D16, 1)
        .setStrokeStyle(1, 0x2A2A3A, 1)
        .setInteractive({ useHandCursor: true });

      // Colored dot indicator
      const dotColor = SEED_DOT_COLORS[seed.id] ?? 0x888888;
      this.add.circle(cx - CARD_W / 2 + 8, cy - CARD_H / 2 + 8, 3, dotColor, 0.9).setDepth(6);

      const text = this.add.text(cx, cy + 4, seed.label, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#AAAAAA',
      }).setOrigin(0.5).setDepth(6);

      rect.on('pointerover', () => {
        if (this.selectedSeed !== seed.id) rect.setFillStyle(0x17172A, 1);
      });
      rect.on('pointerout', () => {
        if (this.selectedSeed !== seed.id) rect.setFillStyle(0x0D0D16, 1);
      });
      rect.on('pointerdown', () => {
        this.selectedSeed = seed.id;
        this.refreshSeedButtons();
        this.refreshPreview();
      });
      this.seedButtons.push({ id: seed.id, rect, text });
    });

    // ── COL 3: CUSTOMIZATION ─────────────────────────────────────
    const labelStyleSilk = {
      fontSize: '8px',
      fontFamily: '"Silkscreen", monospace',
      color: '#5A6080',
    };

    this.add.text(COL3.x + 14, COL3.y + 14, 'CUSTOM', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0, 0);

    let rowY = COL3.y + 44;
    const labelX3    = COL3.x + 14;
    const swatchX0   = COL3.x + 96;
    const SWATCH_SZ  = 26;
    const SWATCH_GAP = 30;

    const makeColorRow = (
      control: CreatorControl,
      label: string,
      colors: number[],
      getColor: () => number,
      onPick: (color: number) => void,
    ) => {
      const labelText = this.add.text(labelX3, rowY, label, labelStyleSilk).setOrigin(0, 0.5);
      this.controlLabels.set(control, labelText);

      const rings: Phaser.GameObjects.Rectangle[] = [];
      colors.forEach((color, idx) => {
        const sx = swatchX0 + idx * SWATCH_GAP;
        const ring = this.add.rectangle(sx, rowY, SWATCH_SZ + 6, SWATCH_SZ + 6, 0x000000, 0)
          .setStrokeStyle(2, 0xFFFFFF, color === getColor() ? 1 : 0);
        this.add.rectangle(sx, rowY, SWATCH_SZ, SWATCH_SZ, color)
          .setStrokeStyle(1, 0x111111, 1)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => { onPick(color); this.refreshPreview(); this.refreshSwatchRings(); });
        rings.push(ring);
      });
      this.swatchRings.set(control, rings);
      rowY += 40;
    };

    makeColorRow('bodyColor', 'CUERPO', this.bodyColorOptions, () => this.config.bodyColor, (c) => { this.config.bodyColor = c; });
    makeColorRow('eyeColor',  'OJOS',   this.eyeColorOptions,  () => this.config.eyeColor,  (c) => { this.config.eyeColor  = c; });
    makeColorRow('hairColor', 'PELO',   this.hairColorOptions,  () => this.config.hairColor,  (c) => { this.config.hairColor  = c; });

    // Style buttons
    const styleLabel = this.add.text(labelX3, rowY, 'ESTILO', labelStyleSilk).setOrigin(0, 0.5);
    this.controlLabels.set('hairStyle', styleLabel);

    const STYLE_W = 52, STYLE_H = 28, STYLE_GAP = 6;
    this.hairStyleOptions.forEach((style, index) => {
      const sx = swatchX0 + index * (STYLE_W + STYLE_GAP) + STYLE_W / 2;
      const btn = this.add.rectangle(sx, rowY, STYLE_W, STYLE_H, 0x111111, 1)
        .setStrokeStyle(1, 0x333333, 1)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(sx, rowY, style, {
        fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: '#CCCCCC',
      }).setOrigin(0.5);
      btn.on('pointerdown', () => { this.config.hairStyle = style; this.refreshStyleButtons(); this.refreshPreview(); });
      this.styleButtons.push({ style, rect: btn, text: txt });
    });
    rowY += 46;

    // Bar sliders for PP / TT
    const MINUS_X  = swatchX0 - 14;
    const BAR_X    = swatchX0 + 4;
    const PLUS_X   = BAR_X + this.SLIDER_W + 14;
    const labelStylePsb = { fontSize: '8px', fontFamily: '"Silkscreen", monospace', color: '#5A6080' };

    const makeBarSlider = (
      control: 'pp' | 'tt',
      label: string,
      getValue: () => number,
      setValue: (n: number) => void,
    ) => {
      const lbl = this.add.text(labelX3, rowY, label, labelStylePsb).setOrigin(0, 0.5);
      this.controlLabels.set(control, lbl);

      const minus = this.add.rectangle(MINUS_X, rowY, 20, 20, 0x111111, 1)
        .setStrokeStyle(1, 0x2A2A3A).setInteractive({ useHandCursor: true });
      this.add.text(MINUS_X, rowY + 1, '−', { fontSize: '10px', fontFamily: '"Press Start 2P", monospace', color: '#666666' }).setOrigin(0.5);

      const plus = this.add.rectangle(PLUS_X, rowY, 20, 20, 0x111111, 1)
        .setStrokeStyle(1, 0x2A2A3A).setInteractive({ useHandCursor: true });
      this.add.text(PLUS_X, rowY + 1, '+', { fontSize: '10px', fontFamily: '"Press Start 2P", monospace', color: '#666666' }).setOrigin(0.5);

      // Track background
      const trackBg = this.add.graphics();
      trackBg.fillStyle(0x1A1A2E, 1);
      trackBg.fillRect(BAR_X, rowY - 2, this.SLIDER_W, 4);

      // Filled portion + indicator (redrawn on refresh)
      const barFill = this.add.graphics();
      const indicator = this.add.arc(BAR_X, rowY, 7, 0, 360, false, 0xF5C842, 1).setDepth(5);

      // Click bar to set value
      this.add.rectangle(BAR_X + this.SLIDER_W / 2, rowY, this.SLIDER_W, 22, 0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (ptr: Phaser.Input.Pointer) => {
          const rel = Phaser.Math.Clamp(ptr.x - BAR_X, 0, this.SLIDER_W);
          setValue(Math.round((rel / this.SLIDER_W) * 10));
          this.refreshSliders(); this.refreshPreview();
        });

      minus.on('pointerdown', () => { setValue(Math.max(0,  getValue() - 1)); this.refreshSliders(); this.refreshPreview(); });
      plus.on('pointerdown',  () => { setValue(Math.min(10, getValue() + 1)); this.refreshSliders(); this.refreshPreview(); });

      if (control === 'pp') {
        this.ppBarGfx = barFill; this.ppIndicator = indicator;
        this.ppBarX = BAR_X; this.ppBarY = rowY;
      } else {
        this.ttBarGfx = barFill; this.ttIndicator = indicator;
        this.ttBarX = BAR_X; this.ttBarY = rowY;
      }
      rowY += 36;
    };

    makeBarSlider('pp', 'PP', () => this.config.pp, (n) => { this.config.pp = n; });
    makeBarSlider('tt', 'TT', () => this.config.tt, (n) => { this.config.tt = n; });

    // ── CTA ───────────────────────────────────────────────────────
    const ctaCX = CTA.x + CTA.w / 2;
    const ctaCY = CTA.y + CTA.h / 2;

    const ctaBtn = this.add.rectangle(ctaCX, ctaCY, CTA.w - 4, CTA.h - 4, 0xF5C842, 1)
      .setInteractive({ useHandCursor: true });
    const ctaTxt = this.add.text(ctaCX, ctaCY, 'ENTRAR AL MUNDO  ►', {
      fontSize: '13px', fontFamily: '"Press Start 2P", monospace', color: '#111111',
    }).setOrigin(0.5).setDepth(6);

    // Scanline sweep on hover
    const sweep = this.add.rectangle(CTA.x - 80, ctaCY, 60, CTA.h - 6, 0xFFFFFF, 0.14).setDepth(7);
    let sweepTween: Phaser.Tweens.Tween | null = null;
    ctaBtn.on('pointerover', () => {
      sweep.setX(CTA.x - 80);
      sweepTween = this.tweens.add({ targets: sweep, x: CTA.x + CTA.w + 80, duration: 480, ease: 'Sine.easeIn' });
    });
    ctaBtn.on('pointerout', () => sweepTween?.stop());
    ctaBtn.on('pointerdown', () => {
      this.tweens.add({ targets: [ctaBtn, ctaTxt], scaleX: 0.97, scaleY: 0.97, duration: 80, yoyo: true });
      this.time.delayedCall(120, () => this.commitAndEnter());
    });

    const saveLabel = this.add.text(CTA.x + CTA.w - 10, CTA.y + 5, 'ENTER GUARDAR', {
      fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#5A4A1A',
    }).setOrigin(1, 0);
    this.controlLabels.set('save', saveLabel);

    // Bottom hint
    this.add.text(width / 2, height - 14, '↑↓ SECCIÓN   ←→ CAMBIA   ENTER GUARDAR', {
      fontSize: '6px', fontFamily: '"Press Start 2P", monospace', color: '#2E2E44',
    }).setOrigin(0.5);

    // ── KEYBOARD ──────────────────────────────────────────────────
    this.keyUp    = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keyDown  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keyLeft  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyRight = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.keyEnter = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.keyEsc   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    // ── STAGGERED ENTRY ───────────────────────────────────────────
    // Set all cards to alpha 0 then fade each in
    [c1, c2, c3, c4].forEach(c => c.setAlpha(0));
    this.tweens.add({ targets: c1, alpha: 1, duration: 220, delay: 0   });
    this.tweens.add({ targets: c2, alpha: 1, duration: 220, delay: 100 });
    this.tweens.add({ targets: c3, alpha: 1, duration: 220, delay: 200 });
    this.tweens.add({ targets: c4, alpha: 1, duration: 220, delay: 300 });

    this.cameras.main.fadeIn(350, 0, 0, 0);

    // ── INIT REFRESH ──────────────────────────────────────────────
    this.refreshSeedButtons();
    this.refreshStyleButtons();
    this.refreshSliders();
    this.refreshSwatchRings();
    this.refreshControlHighlights();
  }

  // ─────────────────────────────────────────────────────────────────
  update() {
    if (this.isUsernameFocused()) return;

    if (Phaser.Input.Keyboard.JustDown(this.keyUp) || this.controls.isMovementDirectionJustDown('up')) {
      this.activeControlIndex = Phaser.Math.Wrap(this.activeControlIndex - 1, 0, this.controlOrder.length);
      this.refreshControlHighlights();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyDown) || this.controls.isMovementDirectionJustDown('down')) {
      this.activeControlIndex = Phaser.Math.Wrap(this.activeControlIndex + 1, 0, this.controlOrder.length);
      this.refreshControlHighlights();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyLeft) || this.controls.isMovementDirectionJustDown('left')) this.adjustActiveControl(-1);
    if (Phaser.Input.Keyboard.JustDown(this.keyRight) || this.controls.isMovementDirectionJustDown('right')) this.adjustActiveControl(1);
    if (Phaser.Input.Keyboard.JustDown(this.keyEnter) || this.controls.isActionJustDown('interact')) this.activateActiveControl();
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) || this.controls.isActionJustDown('back')) this.commitAndEnter();
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

