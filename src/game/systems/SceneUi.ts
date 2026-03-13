import Phaser from 'phaser';
import { eventBus, EVENTS } from '../config/eventBus';

export function announceScene(scene: Phaser.Scene) {
  eventBus.emit(EVENTS.SCENE_CHANGED, scene.scene.key);
}

export function createBackButton(scene: Phaser.Scene, onClick: () => void, label = 'VOLVER') {
  const bg = scene.add.rectangle(62, 28, 96, 30, 0x000000, 0.72)
    .setScrollFactor(0)
    .setDepth(12000)
    .setStrokeStyle(1, 0xF5C842, 0.55)
    .setInteractive({ useHandCursor: true });

  const text = scene.add.text(62, 28, `< ${label}`, {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#F5C842',
  })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(12001);

  bg.on('pointerdown', onClick);
  text.setInteractive({ useHandCursor: true });
  text.on('pointerdown', onClick);

  return { bg, text };
}
