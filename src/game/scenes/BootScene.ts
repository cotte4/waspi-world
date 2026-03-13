import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    const { width, height } = this.scale;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x0E0E14);

    // Title
    const title = this.add.text(width / 2, height / 2 - 60, 'WASPI WORLD', {
      fontSize: '28px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height / 2 - 20, 'Open World - Chat Social - Streetwear', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#888888',
    }).setOrigin(0.5);

    // Loading bar background
    this.add.rectangle(width / 2, height / 2 + 30, 320, 18, 0x1A1A2E);
    const bar = this.add.rectangle(width / 2 - 160, height / 2 + 30, 0, 14, 0xF5C842).setOrigin(0, 0.5);

    const status = this.add.text(width / 2, height / 2 + 60, 'CARGANDO...', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#555555',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      scale: { from: 0.98, to: 1.02 },
      alpha: { from: 0.9, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: subtitle,
      alpha: { from: 0.45, to: 0.85 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: status,
      alpha: { from: 0.5, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.load.on('progress', (v: number) => {
      bar.setSize(320 * v, 14);
      bar.setAlpha(0.72 + v * 0.28);
    });

    this.load.on('complete', () => {
      status.setText('LISTO!');
    });

    this.load.on('loaderror', (file: unknown) => {
      console.log('[Waspi] Asset load error', file);
    });

    // Seed sprites (drop files into public/assets/seeds/)
    // If they don't exist, CreatorScene will fall back to procedural preview.
    this.load.image('seed_gengar', '/assets/seeds/gengar.png');
    this.load.image('seed_buho', '/assets/seeds/buho.png');
    this.load.image('seed_piplup', '/assets/seeds/piplup.png');
    this.load.audio('arcade_theme', '/assets/audio/arcade-theme.mp3');
  }

  create() {
    this.scene.start('CreatorScene');
  }
}

