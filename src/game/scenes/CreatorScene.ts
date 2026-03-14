import Phaser from 'phaser';
import {
  AvatarRenderer,
  AvatarConfig,
  HairStyle,
  loadStoredAvatarConfig,
  saveStoredAvatarConfig,
} from '../systems/AvatarRenderer';
import { COLORS } from '../config/constants';
import { announceScene, transitionToScene } from '../systems/SceneUi';

const USERNAME_KEY = 'waspi_username';
type CreatorControl = 'seed' | 'bodyColor' | 'eyeColor' | 'hairColor' | 'hairStyle' | 'pp' | 'tt' | 'save';
type SeedId = 'procedural' | 'gengar' | 'buho' | 'piplup' | 'chacha';

export class CreatorScene extends Phaser.Scene {
  private preview!: AvatarRenderer;
  private selectedSeed: SeedId = 'procedural';
  private seedButtons: Array<{ id: SeedId; rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = [];
  private seedStatusText?: Phaser.GameObjects.Text;
  private config: Required<AvatarConfig>;
  private styleButtons: Array<{ style: HairStyle; rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = [];
  private ppDots: Phaser.GameObjects.Rectangle[] = [];
  private ttDots: Phaser.GameObjects.Rectangle[] = [];
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
  private readonly bodyColorOptions = [0xF5D5A4, 0xE6B98A, 0xD89B73, 0xBF7B4E, 0x9B5A3A, 0x7A412A];
  private readonly eyeColorOptions = [0x222222, 0x3B82F6, 0x22C55E, 0xA855F7, 0xDC2626, 0xFACC15];
  private readonly hairColorOptions = [0x1F130A, 0x8B5A2B, 0xF97316, 0xEF4444, 0xFFFFFF, 0xEC4899];
  private readonly seedOptions: SeedId[] = ['procedural', 'gengar', 'buho', 'piplup', 'chacha'];
  private readonly hairStyleOptions: HairStyle[] = ['SPI', 'FLA', 'MOH', 'X'];

  constructor() {
    super({ key: 'CreatorScene' });
    this.config = {
      avatarKind: 'procedural',
      bodyColor: COLORS.SKIN_LIGHT,
      hairColor: COLORS.HAIR_BROWN,
      eyeColor: 0x2244CC,
      topColor: COLORS.BODY_BLUE,
      bottomColor: COLORS.LEGS_DARK,
      hairStyle: 'SPI',
      pp: 2,
      tt: 2,
      smoke: false,
      equipTop: '',
      equipBottom: '',
    };
  }

  create() {
    const { width, height } = this.scale;
    this.input.enabled = true;
    const storedConfig = loadStoredAvatarConfig();
    this.config = { ...storedConfig };
    this.selectedSeed = storedConfig.avatarKind;
    announceScene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);

    this.cameras.main.setBackgroundColor('#05050A');
    const bg = this.add.graphics().setDepth(-1);
    bg.fillStyle(0x05050a, 1);
    bg.fillRect(0, 0, width, height);
    bg.fillStyle(0x0b0b18, 1);
    bg.fillRect(32, 54, width - 64, height - 96);
    bg.lineStyle(2, 0x2a2236, 0.9);
    bg.strokeRect(32, 54, width - 64, height - 96);
    bg.lineStyle(1, 0x141424, 0.4);
    for (let x = 44; x < width - 44; x += 28) {
      bg.lineBetween(x, 126, x, height - 66);
    }
    for (let y = 126; y < height - 66; y += 24) {
      bg.lineBetween(44, y, width - 44, y);
    }

    const leftCard = { x: 56, y: 140, w: 254, h: 298 };
    const identityCard = { x: 338, y: 140, w: 406, h: 114 };
    const customCard = { x: 338, y: 270, w: 406, h: 214 };
    const confirmCard = { x: 248, y: 506, w: 304, h: 58 };

    this.drawCard(leftCard.x, leftCard.y, leftCard.w, leftCard.h, 0x3a3344);
    this.drawCard(identityCard.x, identityCard.y, identityCard.w, identityCard.h, 0x2b3347);
    this.drawCard(customCard.x, customCard.y, customCard.w, customCard.h, 0x2d2f46);
    this.drawCard(confirmCard.x, confirmCard.y, confirmCard.w, confirmCard.h, 0x4a3a12);

    this.add.text(width / 2, 86, 'WASPI WORLD', {
      fontSize: '28px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(width / 2, 118, 'BASE | IDENTIDAD | CUSTOM', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#7F8495',
    }).setOrigin(0.5);

    const sectionStyle = {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#7F8495',
    };
    const labelStyle = {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#888888',
    };

    const seedLabel = this.add.text(leftCard.x + 18, leftCard.y + 18, 'BASE / SEED', sectionStyle).setOrigin(0, 0);
    this.controlLabels.set('seed', seedLabel);

    const previewFrame = this.add.graphics();
    previewFrame.fillStyle(0x030308, 1);
    previewFrame.fillRoundedRect(leftCard.x + 28, leftCard.y + 38, leftCard.w - 56, 152, 14);
    previewFrame.lineStyle(2, 0xF5C842, 0.22);
    previewFrame.strokeRoundedRect(leftCard.x + 28, leftCard.y + 38, leftCard.w - 56, 152, 14);

    this.previewX = leftCard.x + leftCard.w / 2;
    this.previewY = leftCard.y + 154;
    this.preview = new AvatarRenderer(this, this.previewX, this.previewY, {
      ...this.config,
      avatarKind: this.selectedSeed,
    });

    this.seedStatusText = this.add.text(leftCard.x + leftCard.w / 2, leftCard.y + 206, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    const seeds: Array<{ id: SeedId; label: string }> = [
      { id: 'procedural', label: 'PROC' },
      { id: 'gengar', label: 'GEN' },
      { id: 'buho', label: 'BUH' },
      { id: 'piplup', label: 'PIP' },
      { id: 'chacha', label: 'CHA' },
    ];

    const seedBaseX = leftCard.x + 64;
    const seedBaseY = leftCard.y + 246;
    const seedGapX = 64;
    const seedGapY = 34;
    seeds.forEach((seed, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = seedBaseX + col * seedGapX;
      const y = seedBaseY + row * seedGapY;
      const rect = this.add.rectangle(x, y, 54, 24, 0x111111, 1)
        .setStrokeStyle(1, 0x333333, 1)
        .setInteractive({ useHandCursor: true });
      const text = this.add.text(x, y, seed.label, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#CCCCCC',
      }).setOrigin(0.5);
      rect.on('pointerdown', () => {
        this.selectedSeed = seed.id;
        this.refreshSeedButtons();
        this.refreshPreview();
      });
      this.seedButtons.push({ id: seed.id, rect, text });
    });

    this.add.text(identityCard.x + 18, identityCard.y + 18, 'IDENTIDAD', sectionStyle).setOrigin(0, 0);
    this.add.text(identityCard.x + 18, identityCard.y + 42, 'NOMBRE', labelStyle).setOrigin(0, 0.5);
    this.add.text(identityCard.x + 18, identityCard.y + 86, 'SEED ACTIVO', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(0, 0.5);

    const storedName = (typeof window !== 'undefined' ? window.localStorage.getItem(USERNAME_KEY) : null) ?? '';
    const defaultName = storedName || `WASPI_${Math.floor(Math.random() * 999)}`;

    const inputEl = document.createElement('input');
    inputEl.value = defaultName;
    inputEl.maxLength = 18;
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.style.width = '280px';
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
    inputEl.name = 'waspi-username';
    inputEl.id = 'waspi-username';
    this.usernameInput = this.add.dom(identityCard.x + 206, identityCard.y + 62, inputEl);
    this.usernameInputElement = inputEl;

    this.add.text(customCard.x + 18, customCard.y + 18, 'CUSTOM', sectionStyle).setOrigin(0, 0);

    let rowY = customCard.y + 52;
    const labelX = customCard.x + 18;
    const swatchStartX = customCard.x + 154;

    const makeColorRow = (control: CreatorControl, label: string, colors: number[], onPick: (color: number) => void) => {
      const labelText = this.add.text(labelX, rowY, label, labelStyle).setOrigin(0, 0.5);
      this.controlLabels.set(control, labelText);
      colors.forEach((color, index) => {
        const x = swatchStartX + index * 26;
        const rect = this.add.rectangle(x, rowY, 20, 20, color)
          .setStrokeStyle(1, 0x222222, 1)
          .setInteractive({ useHandCursor: true });
        rect.on('pointerdown', () => {
          onPick(color);
          this.refreshPreview();
        });
      });
      rowY += 34;
    };

    makeColorRow('bodyColor', 'CUERPO', this.bodyColorOptions, (color) => { this.config.bodyColor = color; });
    makeColorRow('eyeColor', 'OJOS', this.eyeColorOptions, (color) => { this.config.eyeColor = color; });
    makeColorRow('hairColor', 'PELO', this.hairColorOptions, (color) => { this.config.hairColor = color; });

    const styleLabel = this.add.text(labelX, rowY, 'ESTILO', labelStyle).setOrigin(0, 0.5);
    this.controlLabels.set('hairStyle', styleLabel);
    this.hairStyleOptions.forEach((style, index) => {
      const x = swatchStartX + index * 44;
      const btn = this.add.rectangle(x, rowY, 34, 24, 0x111111, 1)
        .setStrokeStyle(1, 0x333333, 1)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, rowY, style, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#CCCCCC',
      }).setOrigin(0.5);
      btn.on('pointerdown', () => {
        this.config.hairStyle = style;
        this.refreshStyleButtons();
        this.refreshPreview();
      });
      this.styleButtons.push({ style, rect: btn, text: txt });
    });

    rowY += 42;

    const makeSlider = (
      control: 'pp' | 'tt',
      label: 'PP' | 'TT',
      getValue: () => number,
      setValue: (next: number) => void,
    ) => {
      const labelText = this.add.text(labelX, rowY, label, labelStyle).setOrigin(0, 0.5);
      this.controlLabels.set(control, labelText);

      const minusX = swatchStartX - 28;
      const plusX = swatchStartX + 160;
      const centerX = swatchStartX + 64;

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
        const dot = this.add.rectangle(x, rowY, 10, 10, 0x111111, 1)
          .setStrokeStyle(1, i === getValue() ? 0xF5C842 : 0x333333, 1)
          .setInteractive({ useHandCursor: true });
        dot.on('pointerdown', () => {
          setValue(i);
          this.refreshSliders();
          this.refreshPreview();
        });
        dots.push(dot);
      }

      minus.on('pointerdown', () => {
        setValue(Math.max(0, getValue() - 1));
        this.refreshSliders();
        this.refreshPreview();
      });
      plus.on('pointerdown', () => {
        setValue(Math.min(10, getValue() + 1));
        this.refreshSliders();
        this.refreshPreview();
      });

      return dots;
    };

    this.ppDots = makeSlider('pp', 'PP', () => this.config.pp, (next) => { this.config.pp = next; });
    rowY += 30;
    this.ttDots = makeSlider('tt', 'TT', () => this.config.tt, (next) => { this.config.tt = next; });

    const btnX = confirmCard.x + confirmCard.w / 2;
    const btnY = confirmCard.y + 28;
    const btn = this.add.rectangle(btnX, btnY, 170, 36, 0xF5C842, 1)
      .setInteractive({ useHandCursor: true });
    this.add.text(btnX, btnY, 'ENTRAR', {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#111111',
    }).setOrigin(0.5);
    const saveLabel = this.add.text(confirmCard.x + confirmCard.w - 14, confirmCard.y + 12, 'ENTER GUARDAR', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(1, 0);
    this.controlLabels.set('save', saveLabel);
    btn.on('pointerdown', () => {
      this.commitAndEnter();
    });

    this.add.text(width / 2, height - 24, 'ARRIBA/ABAJO SECCION | IZQ/DER CAMBIA | ENTER GUARDAR', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(0.5);

    this.keyUp = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keyDown = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keyLeft = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyRight = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.keyEnter = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.refreshSeedButtons();
    this.refreshStyleButtons();
    this.refreshSliders();
    this.refreshControlHighlights();

    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update() {
    if (this.isUsernameFocused()) return;

    if (Phaser.Input.Keyboard.JustDown(this.keyUp)) {
      this.activeControlIndex = Phaser.Math.Wrap(this.activeControlIndex - 1, 0, this.controlOrder.length);
      this.refreshControlHighlights();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyDown)) {
      this.activeControlIndex = Phaser.Math.Wrap(this.activeControlIndex + 1, 0, this.controlOrder.length);
      this.refreshControlHighlights();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyLeft)) {
      this.adjustActiveControl(-1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyRight)) {
      this.adjustActiveControl(1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyEnter)) {
      this.activateActiveControl();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.commitAndEnter();
    }
  }

  private drawCard(x: number, y: number, w: number, h: number, accent: number) {
    const card = this.add.graphics();
    card.fillStyle(0x080811, 0.98);
    card.fillRoundedRect(x, y, w, h, 16);
    card.lineStyle(2, accent, 0.95);
    card.strokeRoundedRect(x, y, w, h, 16);
    card.lineStyle(1, 0xF5C842, 0.18);
    card.strokeRoundedRect(x + 6, y + 6, w - 12, h - 12, 12);
  }

  private refreshStyleButtons() {
    for (const button of this.styleButtons) {
      const active = button.style === this.config.hairStyle;
      button.rect.setFillStyle(active ? 0x2f2410 : 0x111111, 1);
      button.rect.setStrokeStyle(1, active ? 0xF5C842 : 0x333333, 1);
      button.text.setColor(active ? '#F5C842' : '#CCCCCC');
    }
  }

  private refreshSliders() {
    this.ppDots.forEach((dot, index) => dot.setStrokeStyle(1, index === this.config.pp ? 0xF5C842 : 0x333333, 1));
    this.ttDots.forEach((dot, index) => dot.setStrokeStyle(1, index === this.config.tt ? 0xF5C842 : 0x333333, 1));
  }

  private refreshPreview() {
    this.preview.destroy();
    this.preview = new AvatarRenderer(this, this.previewX, this.previewY, {
      ...this.config,
      avatarKind: this.selectedSeed,
    });
    this.refreshSeedStatus();
  }

  private handleSceneShutdown() {
    this.usernameInput?.destroy();
  }

  private refreshSeedButtons() {
    for (const button of this.seedButtons) {
      const active = button.id === this.selectedSeed;
      button.rect.setFillStyle(active ? 0x20180b : 0x111111, 1);
      button.rect.setStrokeStyle(1, active ? 0xF5C842 : 0x333333, 1);
      button.text.setColor(active ? '#F5C842' : '#CCCCCC');
    }
    this.refreshSeedStatus();
  }

  private refreshSeedStatus() {
    if (!this.seedStatusText) return;
    this.seedStatusText.setText(`SEED ACTIVO: ${this.getSeedLabel(this.selectedSeed)}`);
  }

  private refreshControlHighlights() {
    const activeControl = this.controlOrder[this.activeControlIndex];
    for (const [control, label] of this.controlLabels.entries()) {
      const active = control === activeControl;
      label.setColor(active ? '#F5C842' : '#888888');
      if (control === 'save' && !active) {
        label.setColor('#666666');
      }
    }
  }

  private adjustActiveControl(direction: -1 | 1) {
    switch (this.controlOrder[this.activeControlIndex]) {
      case 'seed':
        this.selectedSeed = this.cycleInList(this.seedOptions, this.selectedSeed, direction);
        this.refreshSeedButtons();
        this.refreshPreview();
        break;
      case 'bodyColor':
        this.config.bodyColor = this.cycleInList(this.bodyColorOptions, this.config.bodyColor, direction);
        this.refreshPreview();
        break;
      case 'eyeColor':
        this.config.eyeColor = this.cycleInList(this.eyeColorOptions, this.config.eyeColor, direction);
        this.refreshPreview();
        break;
      case 'hairColor':
        this.config.hairColor = this.cycleInList(this.hairColorOptions, this.config.hairColor, direction);
        this.refreshPreview();
        break;
      case 'hairStyle':
        this.config.hairStyle = this.cycleInList(this.hairStyleOptions, this.config.hairStyle, direction);
        this.refreshStyleButtons();
        this.refreshPreview();
        break;
      case 'pp':
        this.config.pp = Phaser.Math.Clamp(this.config.pp + direction, 0, 10);
        this.refreshSliders();
        this.refreshPreview();
        break;
      case 'tt':
        this.config.tt = Phaser.Math.Clamp(this.config.tt + direction, 0, 10);
        this.refreshSliders();
        this.refreshPreview();
        break;
      default:
        break;
    }
  }

  private activateActiveControl() {
    if (this.controlOrder[this.activeControlIndex] === 'save') {
      this.commitAndEnter();
      return;
    }
    if (this.controlOrder[this.activeControlIndex] === 'seed') {
      this.adjustActiveControl(1);
    }
  }

  private commitAndEnter() {
    if (typeof window !== 'undefined') {
      const name = (this.usernameInputElement?.value || '').trim();
      if (name) window.localStorage.setItem(USERNAME_KEY, name);
      saveStoredAvatarConfig({
        ...this.config,
        avatarKind: this.selectedSeed,
      });
    }
    transitionToScene(this, 'WorldScene');
  }

  private cycleInList<T>(values: T[], current: T, direction: -1 | 1) {
    const index = values.indexOf(current);
    const nextIndex = Phaser.Math.Wrap((index >= 0 ? index : 0) + direction, 0, values.length);
    return values[nextIndex];
  }

  private getSeedLabel(seed: SeedId) {
    switch (seed) {
      case 'procedural':
        return 'PROC';
      case 'gengar':
        return 'GEN';
      case 'buho':
        return 'BUH';
      case 'piplup':
        return 'PIP';
      case 'chacha':
        return 'CHA';
      default:
        return 'PROC';
    }
  }

  private isUsernameFocused() {
    if (typeof document === 'undefined' || !this.usernameInputElement) return false;
    return document.activeElement === this.usernameInputElement;
  }
}
