'use client';

import { useEffect, useRef } from 'react';

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    let game: unknown = null;

    const init = async () => {
      const Phaser = (await import('phaser')).default;
      const { BootScene } = await import('@/src/game/scenes/BootScene');
      const { WorldScene } = await import('@/src/game/scenes/WorldScene');
      const { VIEWPORT } = await import('@/src/game/config/constants');

      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: VIEWPORT.WIDTH,
        height: VIEWPORT.HEIGHT,
        backgroundColor: '#0E0E14',
        parent: containerRef.current!,
        physics: {
          default: 'arcade',
          arcade: { debug: false },
        },
        scene: [BootScene, WorldScene],
        render: {
          antialias: false,
          pixelArt: false,
        },
      });

      gameRef.current = game;
    };

    init();

    return () => {
      if (game) {
        (game as { destroy: (v: boolean) => void }).destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: 800, height: 600, display: 'block' }}
    />
  );
}
