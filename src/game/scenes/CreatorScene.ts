import Phaser from 'phaser';
import { AvatarRenderer, AvatarConfig, HairStyle } from '../systems/AvatarRenderer';
import { COLORS } from '../config/constants';

const STORAGE_KEY = 'waspi_avatar_config';
const USERNAME_KEY = 'waspi_username';

export class CreatorScene extends Phaser.Scene {
  private preview!: AvatarRenderer;
  private seedSprite?: Phaser.GameObjects.Image;
  private selectedSeed: 'procedural' | 'gengar' | 'buho' = 'procedural';
  private seedButtons: Array<{ id: 'procedural' | 'gengar' | 'buho'; rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = [];
  private config: Required<AvatarConfig>;
  private styleButtons: Array<{ style: HairStyle; rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = [];
  private ppDots: Phaser.GameObjects.Rectangle[] = [];
  private ttDots: Phaser.GameObjects.Rectangle[] = [];
  private usernameInput?: Phaser.GameObjects.DOMElement;

  constructor() {
    super({ key: 'CreatorScene' });
    this.config = {
      bodyColor: COLORS.SKIN_LIGHT,
      hairColor: COLORS.HAIR_BROWN,
      eyeColor: 0x2244CC,
      topColor: COLORS.BODY_BLUE,
      bottomColor: COLORS.LEGS_DARK,
      hairStyle: 'SPI',
      pp: 2,
      tt: 2,
      smoke: false,
    };
  }

  create() {
    const { width, height } = this.scale;

    // Background
    this.cameras.main.setBackgroundColor('#05050A');

    // Title
    this.add.text(width / 2, 80, 'WASPI WORLD', {
      fontSize: '28px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(width / 2, 120, 'CREA TU WASPI', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#888888',
    }).setOrigin(0.5);

    // Preview panel
    const panelW = 160;
    const panelH = 160;
    const panelX = width / 2;
    const panelY = 210;
    const g = this.add.graphics();
    g.fillStyle(0x050508);
    g.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 8);
    g.lineStyle(2, 0x222233, 1);
    g.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 8);

    // Seed selector
    this.add.text(width / 2, 146, 'SEED', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(0.5);

    const seeds: Array<{ id: 'procedural' | 'gengar' | 'buho'; label: string }> = [
      { id: 'procedural', label: 'PROC' },
      { id: 'gengar', label: 'GEN' },
      { id: 'buho', label: 'BUH' },
    ];
    seeds.forEach((s, i) => {
      const x = width / 2 - 60 + i * 60;
      const y = 170;
      const rect = this.add.rectangle(x, y, 46, 22, 0x111111, 1)
        .setStrokeStyle(1, s.id === this.selectedSeed ? 0xF5C842 : 0x333333, 1)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, y, s.label, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: s.id === this.selectedSeed ? '#F5C842' : '#CCCCCC',
      }).setOrigin(0.5);
      rect.on('pointerdown', () => {
        this.selectedSeed = s.id;
        this.refreshSeedButtons();
        this.refreshPreview();
      });
      this.seedButtons.push({ id: s.id, rect, text: txt });
    });

    // Avatar preview (no walk animation)
    this.preview = new AvatarRenderer(this, panelX, panelY + 20, this.config);
    this.refreshSliders();

    // Name input
    const storedName = (typeof window !== 'undefined' ? window.localStorage.getItem(USERNAME_KEY) : null) ?? '';
    const defaultName = storedName || `WASPI_${Math.floor(Math.random() * 999)}`;

    this.add.text(width / 2, 295, 'NOMBRE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#888888',
    }).setOrigin(0.5);

    const inputEl = document.createElement('input');
    inputEl.value = defaultName;
    inputEl.maxLength = 18;
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.style.width = '240px';
    inputEl.style.padding = '10px 12px';
    inputEl.style.background = 'rgba(0,0,0,0.65)';
    inputEl.style.border = '1px solid rgba(245,200,66,0.35)';
    inputEl.style.color = '#FFFFFF';
    inputEl.style.outline = 'none';
    inputEl.style.fontFamily = '"Silkscreen", monospace';
    inputEl.style.fontSize = '16px';
    inputEl.style.textAlign = 'center';
    inputEl.style.letterSpacing = '1px';

    inputEl.addEventListener('input', () => {
      const cleaned = inputEl.value
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '')
        .slice(0, 18);
      if (cleaned !== inputEl.value) inputEl.value = cleaned;
    });

    this.usernameInput = this.add.dom(width / 2, 325, inputEl);

    let rowY = 370;

    const labelStyle = {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#888888',
    };

    const makeRow = (label: string, colors: number[], onPick: (c: number) => void) => {
      this.add.text(width / 2 - 190, rowY, label, labelStyle).setOrigin(0, 0.5);
      const startX = width / 2 - 100;
      colors.forEach((c, i) => {
        const x = startX + i * 26;
        const rect = this.add.rectangle(x, rowY, 20, 20, c)
          .setStrokeStyle(1, 0x222222, 1)
          .setInteractive({ useHandCursor: true });
        rect.on('pointerdown', () => {
          onPick(c);
          this.refreshPreview();
        });
      });
      rowY += 32;
    };

    // Colors similar to screenshot
    makeRow('CUERPO', [
      0xF5D5A4, 0xE6B98A, 0xD89B73, 0xBF7B4E, 0x9B5A3A, 0x7A412A,
    ], c => { this.config.bodyColor = c; });

    makeRow('OJOS', [
      0x222222, 0x3B82F6, 0x22C55E, 0xA855F7, 0xDC2626, 0xFACC15,
    ], c => { this.config.eyeColor = c; });

    makeRow('PELO', [
      0x1F130A, 0x8B5A2B, 0xF97316, 0xEF4444, 0xFFFFFF, 0xEC4899,
    ], c => { this.config.hairColor = c; });

    // Estilo buttons (haircuts)
    this.add.text(width / 2 - 190, rowY, 'ESTILO', labelStyle).setOrigin(0, 0.5);
    const styles: HairStyle[] = ['SPI', 'FLA', 'MOH', 'X'];
    styles.forEach((s, i) => {
      const x = width / 2 - 40 + i * 40;
      const btn = this.add.rectangle(x, rowY, 30, 22, 0x111111, 1)
        .setStrokeStyle(1, s === this.config.hairStyle ? 0xF5C842 : 0x333333, 1)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, rowY, s, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: s === this.config.hairStyle ? '#F5C842' : '#CCCCCC',
      }).setOrigin(0.5);
      btn.on('pointerdown', () => {
        this.config.hairStyle = s;
        this.refreshStyleButtons();
        this.refreshPreview();
      });
      this.styleButtons.push({ style: s, rect: btn, text: txt });
    });

    rowY += 40;

    // PP / TT sliders (discrete 0..10) — extreme
    // NOTE: use getters so +/- always use current value (not captured initial)
    const makeSlider = (
      label: 'PP' | 'TT',
      getValue: () => number,
      setValue: (next: number) => void
    ) => {
      this.add.text(width / 2 - 190, rowY, label, labelStyle).setOrigin(0, 0.5);

      const minusX = width / 2 - 80;
      const plusX = width / 2 + 100;
      const centerX = width / 2 + 10;

      const minus = this.add.rectangle(minusX, rowY, 22, 18, 0x111111, 1)
        .setStrokeStyle(1, 0x333333, 1)
        .setInteractive({ useHandCursor: true });
      this.add.text(minusX, rowY + 1, '-', {
        fontSize: '10px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#CCCCCC',
      }).setOrigin(0.5);

      const plus = this.add.rectangle(plusX, rowY, 22, 18, 0x111111, 1)
        .setStrokeStyle(1, 0x333333, 1)
        .setInteractive({ useHandCursor: true });
      this.add.text(plusX, rowY + 1, '+', {
        fontSize: '10px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#CCCCCC',
      }).setOrigin(0.5);

      const dots: Phaser.GameObjects.Rectangle[] = [];
      for (let i = 0; i <= 10; i++) {
        const x = centerX + i * 14 - 70;
        const r = this.add.rectangle(x, rowY, 10, 10, 0x111111, 1)
          .setStrokeStyle(1, i === getValue() ? 0xF5C842 : 0x333333, 1)
          .setInteractive({ useHandCursor: true });
        r.on('pointerdown', () => {
          setValue(i);
          this.refreshSliders();
          this.refreshPreview();
        });
        dots.push(r);
      }

      minus.on('pointerdown', () => {
        const cur = getValue();
        setValue(Math.max(0, cur - 1));
        this.refreshSliders();
        this.refreshPreview();
      });
      plus.on('pointerdown', () => {
        const cur = getValue();
        setValue(Math.min(10, cur + 1));
        this.refreshSliders();
        this.refreshPreview();
      });

      return dots;
    };

    this.ppDots = makeSlider('PP', () => this.config.pp, (next) => { this.config.pp = next; });
    rowY += 28;
    this.ttDots = makeSlider('TT', () => this.config.tt, (next) => { this.config.tt = next; });

    rowY += 34;

    // ENTRAR button
    const btnW = 160;
    const btnH = 36;
    const btnY = rowY + 24;
    const btn = this.add.rectangle(width / 2, btnY, btnW, btnH, 0xF5C842, 1)
      .setInteractive({ useHandCursor: true });
    this.add.text(width / 2, btnY, 'ENTRAR', {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#111111',
    }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      if (typeof window !== 'undefined') {
        const name = (inputEl.value || '').trim();
        if (name) window.localStorage.setItem(USERNAME_KEY, name);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      }
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('WorldScene');
      });
    });

    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private refreshStyleButtons() {
    for (const b of this.styleButtons) {
      const active = b.style === this.config.hairStyle;
      b.rect.setStrokeStyle(1, active ? 0xF5C842 : 0x333333, 1);
      b.text.setColor(active ? '#F5C842' : '#CCCCCC');
    }
  }

  private refreshSliders() {
    this.ppDots.forEach((d, i) => d.setStrokeStyle(1, i === this.config.pp ? 0xF5C842 : 0x333333, 1));
    this.ttDots.forEach((d, i) => d.setStrokeStyle(1, i === this.config.tt ? 0xF5C842 : 0x333333, 1));
  }

  private refreshPreview() {
    // Clear both preview types
    this.preview.destroy();
    this.seedSprite?.destroy();
    this.seedSprite = undefined;

    const { width } = this.scale;
    const panelY = 210;

    if (this.selectedSeed !== 'procedural') {
      const key = this.selectedSeed === 'gengar' ? 'seed_gengar' : 'seed_buho';
      if (this.textures.exists(key)) {
        const tex = this.textures.get(key);
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
        // Chroma-key remove green into a new runtime texture
        const outKey = `${key}_ck`;
        if (!this.textures.exists(outKey)) {
          this.createChromaKeyTexture(key, outKey, 26);
        }
        this.seedSprite = this.add.image(width / 2, panelY + 20, outKey);
        // Fit into the panel nicely
        const src = this.textures.get(outKey).getSourceImage() as any;
        const w = src?.width ?? 1;
        const h = src?.height ?? 1;
        const maxSize = 120;
        const scale = Math.min(maxSize / w, maxSize / h);
        this.seedSprite.setScale(scale);
        return;
      }
    }

    // Fallback: procedural
    this.preview = new AvatarRenderer(this, width / 2, panelY + 20, this.config);
  }

  shutdown() {
    this.usernameInput?.destroy();
  }

  private refreshSeedButtons() {
    for (const b of this.seedButtons) {
      const active = b.id === this.selectedSeed;
      b.rect.setStrokeStyle(1, active ? 0xF5C842 : 0x333333, 1);
      b.text.setColor(active ? '#F5C842' : '#CCCCCC');
    }
  }

  private createChromaKeyTexture(sourceKey: string, outKey: string, tolerance: number) {
    const src = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const w = (src as any).width as number;
    const h = (src as any).height as number;
    const canvas = (typeof document !== 'undefined')
      ? document.createElement('canvas')
      : null;
    if (!canvas) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(src as any, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    // key out bright green backgrounds (robust)
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const isGreen =
        g > 140 &&
        (g - r) > (110 - tolerance) &&
        (g - b) > (110 - tolerance) &&
        r < 140 &&
        b < 140;
      if (isGreen) d[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
    this.textures
      .addCanvas(outKey, canvas as HTMLCanvasElement)
      .setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

