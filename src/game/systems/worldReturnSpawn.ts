const REG_KEY = 'waspi.worldReturnSpawn';

export function rememberWorldSpawn(game: Phaser.Game, x: number, y: number): void {
  game.registry.set(REG_KEY, { x, y });
}

export function peekWorldReturnSpawn(game: Phaser.Game): { x: number; y: number } | null {
  const c = game.registry.get(REG_KEY) as { x?: unknown; y?: unknown } | undefined;
  if (
    c &&
    typeof c.x === 'number' &&
    typeof c.y === 'number' &&
    Number.isFinite(c.x) &&
    Number.isFinite(c.y)
  ) {
    return { x: c.x, y: c.y };
  }
  return null;
}

/** Salida al mundo desde escenas que reciben coords en `init` (tiendas, sótano, creator, PvP, etc.). */
export function worldExitFromSceneData(
  data: Record<string, unknown> | undefined,
  fallbackX: number,
  fallbackY: number,
): { x: number; y: number } {
  const dx = data?.returnX;
  const dy = data?.returnY;
  if (
    typeof dx === 'number' &&
    typeof dy === 'number' &&
    Number.isFinite(dx) &&
    Number.isFinite(dy)
  ) {
    return { x: dx, y: dy };
  }
  return { x: fallbackX, y: fallbackY };
}

/**
 * Arcade: al volver de un minijuego no hay returnX/Y en data; se usa el último spawn
 * guardado al entrar desde el mundo (registry).
 */
export function resolveArcadeWorldExit(
  game: Phaser.Game,
  data: Record<string, unknown> | undefined,
  fallbackX: number,
  fallbackY: number,
): { x: number; y: number } {
  const dx = data?.returnX;
  const dy = data?.returnY;
  if (
    typeof dx === 'number' &&
    typeof dy === 'number' &&
    Number.isFinite(dx) &&
    Number.isFinite(dy)
  ) {
    rememberWorldSpawn(game, dx, dy);
    return { x: dx, y: dy };
  }
  const cached = peekWorldReturnSpawn(game);
  if (cached) return cached;
  return { x: fallbackX, y: fallbackY };
}
