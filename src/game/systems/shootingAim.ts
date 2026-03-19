import Phaser from 'phaser';

const AIM_MIN_DIST = 14;
const FALLBACK_RANGE = 520;

/**
 * Punto en mundo hacia donde apunta el disparo.
 * Usa `camera.getWorldPoint` (más fiable que `pointer.worldX/Y` con cámara que sigue / DOM).
 * Si el cursor está encima del jugador (distancia &lt; umbral), usa `fallbackAngle` para no disparar
 * hacia (0,0) o un punto arbitrario.
 */
export function getShootTargetWorld(
  scene: Phaser.Scene,
  originX: number,
  originY: number,
  fallbackAngle: number,
): { x: number; y: number } {
  const cam = scene.cameras.main;
  const p = scene.input.activePointer;
  if (!p) {
    return {
      x: originX + Math.cos(fallbackAngle) * FALLBACK_RANGE,
      y: originY + Math.sin(fallbackAngle) * FALLBACK_RANGE,
    };
  }
  const wp = cam.getWorldPoint(p.x, p.y);
  const dist = Phaser.Math.Distance.Between(originX, originY, wp.x, wp.y);
  if (dist < AIM_MIN_DIST) {
    return {
      x: originX + Math.cos(fallbackAngle) * FALLBACK_RANGE,
      y: originY + Math.sin(fallbackAngle) * FALLBACK_RANGE,
    };
  }
  return { x: wp.x, y: wp.y };
}
