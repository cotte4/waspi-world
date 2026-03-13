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
    this.add.text(width / 2, height / 2 - 60, 'WASPI WORLD', {
      fontSize: '28px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 20, 'Open World · Chat Social · Streetwear', {
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

    this.load.on('progress', (v: number) => {
      bar.setSize(320 * v, 14);
    });

    this.load.on('complete', () => {
      status.setText('LISTO!');
    });
  }

  create() {
    this.scene.start('CreatorScene');
  }
}
