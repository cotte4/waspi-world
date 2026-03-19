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
      const { CreatorScene } = await import('@/src/game/scenes/CreatorScene');
      const { WorldScene } = await import('@/src/game/scenes/WorldScene');
      const { StoreInterior } = await import('@/src/game/scenes/StoreInterior');
      const { GunShopInterior } = await import('@/src/game/scenes/GunShopInterior');
      const { ArcadeInterior } = await import('@/src/game/scenes/ArcadeInterior');
      const { CafeInterior } = await import('@/src/game/scenes/CafeInterior');
      const { CasinoInterior } = await import('@/src/game/scenes/CasinoInterior');
      const { HouseInterior } = await import('@/src/game/scenes/HouseInterior');
      const { VecindadScene } = await import('@/src/game/scenes/VecindadScene');
      const { PenaltyMinigame } = await import('@/src/game/scenes/PenaltyMinigame');
      const { BasketMinigame } = await import('@/src/game/scenes/BasketMinigame');
      const { DartsMinigame } = await import('@/src/game/scenes/DartsMinigame');
      const { PvpArenaScene } = await import('@/src/game/scenes/PvpArenaScene');
      const { ZombiesScene } = await import('@/src/game/scenes/ZombiesScene');
      const { BasementScene } = await import('@/src/game/scenes/BasementScene');
      const { BasementZombiesScene } = await import('@/src/game/scenes/BasementZombiesScene');
      const { BosqueMaterialesScene } = await import('@/src/game/scenes/BosqueMaterialesScene');
      const { CaveScene } = await import('@/src/game/scenes/CaveScene');
      const { GymInterior } = await import('@/src/game/scenes/GymInterior');
      const { VIEWPORT } = await import('@/src/game/config/constants');

      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: VIEWPORT.WIDTH,
        height: VIEWPORT.HEIGHT,
        backgroundColor: '#0E0E14',
        parent: containerRef.current!,
        dom: {
          createContainer: true,
        },
        physics: {
          default: 'arcade',
          arcade: { debug: false },
        },
        scene: [BootScene, CreatorScene, WorldScene, VecindadScene, StoreInterior, GunShopInterior, ArcadeInterior, CafeInterior, CasinoInterior, HouseInterior, PenaltyMinigame, BasketMinigame, DartsMinigame, PvpArenaScene, ZombiesScene, BasementScene, BasementZombiesScene, BosqueMaterialesScene, CaveScene, GymInterior],
        render: {
          antialias: false,
          pixelArt: true,
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

