import Phaser from 'phaser';
import { getShootTargetWorld } from '../../systems/shootingAim';
import { ZOMBIES_PLAYER, ZOMBIES_WORLD, type ZombiesWeaponId } from '../../config/zombies';
import type { ProgressionState } from '../../systems/ProgressionSystem';
import { ZOMBIES_MUZZLE_FORWARD, ZOMBIES_MUZZLE_UP } from './constants';

export type ZombiesCombatWeaponStats = {
  color: number;
  damage: number;
  displayLabel: string;
  fireDelayMs: number;
  magazineSize: number;
  pellets: number;
  range: number;
  reloadMs: number;
  reserveAmmo: number;
  spread: number;
};

export type ZombiesCombatWeaponInventoryEntry = {
  ammoInMag: number;
  owned: boolean;
  reserveAmmo: number;
  upgraded: boolean;
};

export type ZombiesCombatProjectile = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  body: Phaser.GameObjects.Arc | Phaser.GameObjects.Ellipse;
  glow: Phaser.GameObjects.Ellipse;
  expiresAt: number;
};

export type ZombiesCombatZombie = {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldownMs: number;
  hitReward: number;
  killReward: number;
  displayLabel: string;
  alive: boolean;
  isBoss: boolean;
  state: string;
  spawnNodeId?: string;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  hpFill: Phaser.GameObjects.Rectangle;
};

export type ZombiesCombatSharedTarget = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  joinedAt: number;
  lastDamageAt: number;
};

export type ZombiesCombatScene = Phaser.Scene & {
  playerId: string;
  playerUsername: string;
  px: number;
  py: number;
  hp: number;
  points: number;
  round: number;
  killCount: number;
  playerLevel: number;
  gameOver: boolean;
  boxRollingUntil: number;
  reloadEndsAt: number;
  lastShotAt: number;
  lastDamageAt: number;
  lastIsMoving: boolean;
  lastMoveDx: number;
  lastMoveDy: number;
  furiaActive: boolean;
  furiaUntil: number;
  instaKillUntil: number;
  progression: ProgressionState;
  currentWeapon: ZombiesWeaponId;
  weaponOrder: ZombiesWeaponId[];
  weaponInventory: Record<ZombiesWeaponId, ZombiesCombatWeaponInventoryEntry>;
  zombies: Map<string, ZombiesCombatZombie>;
  zombieProjectiles: Map<string, ZombiesCombatProjectile>;
  zombieProjectileSeq: number;
  input: Phaser.Input.InputPlugin;
  time: Phaser.Time.Clock;
  tweens: Phaser.Tweens.TweenManager;
  cameras: Phaser.Cameras.Scene2D.CameraManager;
  player: {
    playDeath: () => void;
    playHurt: () => void;
    playShoot: () => void;
  };
  isSharedCoopEnabled: () => boolean;
  isSharedRunHost: () => boolean;
  maybeScheduleSharedReset: () => void;
  broadcastSharedShot: (payload: unknown) => void;
  applyDamageToPlayer: (playerId: string, amount: number) => void;
  applyZombieDamage: (zombie: ZombiesCombatZombie, damage: number) => void;
  getZombieTargetPlayer: (zombieX: number, zombieY: number) => ZombiesCombatSharedTarget | null;
  getWeaponStats: (weaponId: ZombiesWeaponId) => ZombiesCombatWeaponStats;
  getZombieDeathDurationMs: (zombie: ZombiesCombatZombie) => number;
  getPointsMultiplier: () => number;
  getAliveSharedTargets: () => ZombiesCombatSharedTarget[];
  isBlocked: (x: number, y: number, radius: number) => boolean;
  isLineBlocked: (x1: number, y1: number, x2: number, y2: number) => boolean;
  playZombiesSfx: (kind: 'boss_round' | 'round_start' | 'spawn' | 'stomp' | 'breach') => void;
  releaseSpawnNode: (zombie: ZombiesCombatZombie, resetBoards: boolean) => void;
  renderHud: () => void;
  setZombieState: (zombie: ZombiesCombatZombie, state: string) => void;
  safeDestroyZombieVisual: (zombie: ZombiesCombatZombie) => void;
  showNotice: (text: string, color?: string) => void;
  updateDepthsAccessVisual: () => void;
};

export function getZombiesAimAngle(scene: Pick<ZombiesCombatScene, 'input' | 'cameras' | 'px' | 'py' | 'lastMoveDx' | 'lastMoveDy'>): number {
  const pointer = scene.input.activePointer;
  const worldPoint = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
  const distance = Phaser.Math.Distance.Between(scene.px, scene.py, worldPoint.x, worldPoint.y);
  if (distance > 14) return Phaser.Math.Angle.Between(scene.px, scene.py, worldPoint.x, worldPoint.y);
  if (Math.abs(scene.lastMoveDx) + Math.abs(scene.lastMoveDy) > 0.04) {
    return Math.atan2(scene.lastMoveDy, scene.lastMoveDx);
  }
  return -Math.PI / 2;
}

export function tryShoot(scene: ZombiesCombatScene) {
  if (scene.gameOver) return false;
  if (scene.reloadEndsAt > scene.time.now) return false;
  if (scene.boxRollingUntil > scene.time.now) return false;

  const weapon = scene.getWeaponStats(scene.currentWeapon);
  const ammo = scene.weaponInventory[scene.currentWeapon];
  if (scene.time.now - scene.lastShotAt < weapon.fireDelayMs) return false;
  if (ammo.ammoInMag <= 0) {
    return 'reload_needed';
  }

  ammo.ammoInMag -= 1;
  scene.lastShotAt = scene.time.now;
  scene.player.playShoot();

  const aim = getZombiesAimAngle(scene);
  const { x: targetX, y: targetY } = getShootTargetWorld(scene, scene.px, scene.py, aim);
  const baseAngle = Phaser.Math.Angle.Between(scene.px, scene.py, targetX, targetY);
  const originX = scene.px + Math.cos(baseAngle) * ZOMBIES_MUZZLE_FORWARD;
  const originY = scene.py - ZOMBIES_MUZZLE_UP + Math.sin(baseAngle) * (ZOMBIES_MUZZLE_FORWARD * 0.35);

  fireShotBurst(scene, scene.playerId, scene.playerUsername, originX, originY, targetX, targetY, weapon, !scene.isSharedCoopEnabled() || scene.isSharedRunHost());

  if (scene.isSharedCoopEnabled()) {
    scene.broadcastSharedShot({
      player_id: scene.playerId,
      username: scene.playerUsername,
      originX,
      originY,
      targetX,
      targetY,
      pellets: weapon.pellets,
      spread: weapon.spread,
      range: weapon.range,
      damage: weapon.damage,
      color: weapon.color,
    });
  }

  if (ammo.ammoInMag <= 0 && ammo.reserveAmmo > 0) {
    scene.time.delayedCall(140, () => {
      void tryReload(scene);
    });
  }

  return true;
}

export function tryReload(scene: ZombiesCombatScene) {
  const ammo = scene.weaponInventory[scene.currentWeapon];
  const weapon = scene.getWeaponStats(scene.currentWeapon);
  if (scene.reloadEndsAt > scene.time.now) return false;
  if (ammo.reserveAmmo <= 0 || ammo.ammoInMag >= weapon.magazineSize) return false;

  const reloadingWeaponId = scene.currentWeapon;
  scene.reloadEndsAt = scene.time.now + weapon.reloadMs;
  scene.showNotice(`RECARGANDO ${weapon.displayLabel}`, '#9EFFB7');
  scene.time.delayedCall(weapon.reloadMs, () => {
    const currentAmmo = scene.weaponInventory[reloadingWeaponId];
    const currentWeapon = scene.getWeaponStats(reloadingWeaponId);
    const needed = currentWeapon.magazineSize - currentAmmo.ammoInMag;
    const moved = Math.min(needed, currentAmmo.reserveAmmo);
    currentAmmo.ammoInMag += moved;
    currentAmmo.reserveAmmo -= moved;
    scene.reloadEndsAt = 0;
    scene.renderHud();
  });
  return true;
}

export function fireShotBurst(
  scene: ZombiesCombatScene,
  shooterId: string,
  username: string,
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  weapon: Pick<ZombiesCombatWeaponStats, 'pellets' | 'spread' | 'range' | 'damage' | 'color'>,
  applyDamage: boolean,
) {
  void shooterId;
  void username;
  const baseAngle = Phaser.Math.Angle.Between(originX, originY, targetX, targetY);
  for (let i = 0; i < weapon.pellets; i += 1) {
    const angle = baseAngle + Phaser.Math.FloatBetween(-weapon.spread, weapon.spread);
    const hit = findZombieTargetFrom(scene, originX, originY, angle, weapon.range);
    const endX = hit ? hit.x : originX + Math.cos(angle) * weapon.range;
    const endY = hit ? hit.y : originY + Math.sin(angle) * weapon.range;
    drawShotFxFrom(scene, originX, originY, endX, endY, weapon.color);
    if (applyDamage && hit) {
      scene.applyZombieDamage(hit, weapon.damage);
    }
  }
}

export function drawShotFxFrom(scene: ZombiesCombatScene, originX: number, originY: number, endX: number, endY: number, color: number) {
  type TracerCfg = { width: number; alpha: number; dur: number; flashR: number; glow: boolean };
  const cfgMap: Partial<Record<ZombiesWeaponId, TracerCfg>> = {
    pistol: { width: 1.5, alpha: 0.75, dur: 80, flashR: 7, glow: false },
    smg: { width: 1, alpha: 0.6, dur: 50, flashR: 6, glow: false },
    shotgun: { width: 2.5, alpha: 0.65, dur: 100, flashR: 11, glow: false },
    rifle: { width: 1, alpha: 0.9, dur: 120, flashR: 7, glow: false },
    deagle: { width: 2, alpha: 0.8, dur: 100, flashR: 9, glow: false },
    cannon: { width: 4, alpha: 0.7, dur: 130, flashR: 14, glow: false },
    raygun: { width: 2.5, alpha: 1, dur: 180, flashR: 10, glow: true },
  };
  const tracerCfg = cfgMap[scene.currentWeapon] ?? { width: 2, alpha: 0.9, dur: 90, flashR: 8, glow: false };

  if (tracerCfg.glow) {
    const glow = scene.add.line(0, 0, originX, originY, endX, endY, color, 0.25)
      .setOrigin(0, 0)
      .setDepth(159)
      .setLineWidth(tracerCfg.width * 4, tracerCfg.width * 4);
    scene.tweens.add({ targets: glow, alpha: 0, duration: tracerCfg.dur * 0.6, onComplete: () => glow.destroy() });
  }

  const tracer = scene.add.line(0, 0, originX, originY, endX, endY, color, tracerCfg.alpha)
    .setOrigin(0, 0)
    .setDepth(160);
  tracer.setLineWidth(tracerCfg.width, tracerCfg.width);
  const flash = scene.add.circle(originX, originY, tracerCfg.flashR, color, 0.85).setDepth(170);
  scene.tweens.add({ targets: tracer, alpha: 0, duration: tracerCfg.dur, onComplete: () => tracer.destroy() });
  scene.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: tracerCfg.dur * 1.2, onComplete: () => flash.destroy() });
}

export function findZombieTargetFrom(scene: ZombiesCombatScene, originX: number, originY: number, angle: number, maxRange: number) {
  let best: ZombiesCombatZombie | null = null;
  let bestAlong = Number.POSITIVE_INFINITY;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  for (const zombie of scene.zombies.values()) {
    if (!zombie.alive) continue;
    const dx = zombie.x - originX;
    const dy = zombie.y - originY;
    const along = dx * cos + dy * sin;
    if (along <= 0 || along > maxRange) continue;
    const perp = Math.abs(-sin * dx + cos * dy);
    if (perp > zombie.radius + 10) continue;
    if (scene.isLineBlocked(originX, originY, zombie.x, zombie.y)) continue;
    if (along < bestAlong) {
      best = zombie;
      bestAlong = along;
    }
  }

  return best;
}

export function spawnZombieProjectile(
  scene: ZombiesCombatScene,
  zombie: Pick<ZombiesCombatZombie, 'x' | 'y' | 'damage' | 'isBoss'>,
  angle = (() => {
    const target = scene.getZombieTargetPlayer(zombie.x, zombie.y);
    return Phaser.Math.Angle.Between(zombie.x, zombie.y - 10, target?.x ?? scene.px, (target?.y ?? scene.py) - 6);
  })(),
  speed = zombie.isBoss ? 260 : 220,
  radius = zombie.isBoss ? 7 : 5,
  damage = zombie.isBoss ? Math.round(zombie.damage * 0.8) : Math.max(8, Math.round(zombie.damage * 0.7)),
) {
  const projectile = createZombieProjectileEntity(scene, {
    id: `zp_${++scene.zombieProjectileSeq}`,
    x: zombie.x,
    y: zombie.y - 10,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    radius,
    expiresAt: scene.time.now + 2400,
  });
  scene.zombieProjectiles.set(projectile.id, projectile);
  return projectile;
}

export function createZombieProjectileEntity(
  scene: Phaser.Scene,
  snapshot: Omit<ZombiesCombatProjectile, 'body' | 'glow'>,
): ZombiesCombatProjectile {
  const glowColor = snapshot.radius >= 7 ? 0xFF5C7A : 0x9BFF4F;
  const glow = scene.add.ellipse(snapshot.x, snapshot.y, snapshot.radius * 4.5, snapshot.radius * 2.8, glowColor, 0.18).setDepth(154);
  glow.setStrokeStyle(1, glowColor, 0.45);
  const body = scene.add.circle(snapshot.x, snapshot.y, snapshot.radius, glowColor, 0.92).setDepth(155);
  return { ...snapshot, body, glow };
}

export function spawnBossProjectileBurst(scene: ZombiesCombatScene, zombie: Pick<ZombiesCombatZombie, 'x' | 'y' | 'damage' | 'isBoss'>) {
  const target = scene.getZombieTargetPlayer(zombie.x, zombie.y);
  const baseAngle = Phaser.Math.Angle.Between(zombie.x, zombie.y - 10, target?.x ?? scene.px, (target?.y ?? scene.py) - 6);
  for (const offset of [-0.22, 0, 0.22]) {
    spawnZombieProjectile(scene, zombie, baseAngle + offset, 285, 7, Math.max(14, Math.round(zombie.damage * 0.72)));
  }
  scene.cameras.main.shake(70, 0.0016);
}

export function updateZombieProjectiles(scene: ZombiesCombatScene, delta: number) {
  const dt = delta / 1000;
  for (const projectile of [...scene.zombieProjectiles.values()]) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.body.setPosition(projectile.x, projectile.y);
    projectile.glow.setPosition(projectile.x, projectile.y);

    if (
      projectile.x < 0
      || projectile.y < 0
      || projectile.x > ZOMBIES_WORLD.WIDTH
      || projectile.y > ZOMBIES_WORLD.HEIGHT
      || scene.time.now >= projectile.expiresAt
      || scene.isBlocked(projectile.x, projectile.y, projectile.radius)
    ) {
      destroyZombieProjectile(scene, projectile.id);
      continue;
    }

    const targetPlayer = getProjectileHitTarget(scene, projectile);
    if (targetPlayer) {
      scene.applyDamageToPlayer(targetPlayer.player_id, projectile.damage);
      destroyZombieProjectile(scene, projectile.id);
    }
  }
}

export function destroyZombieProjectile(scene: Pick<ZombiesCombatScene, 'zombieProjectiles'>, id: string) {
  const projectile = scene.zombieProjectiles.get(id);
  if (!projectile) return;
  projectile.body.destroy();
  projectile.glow.destroy();
  scene.zombieProjectiles.delete(id);
}

export function renderZombieHp(zombie: Pick<ZombiesCombatZombie, 'hp' | 'maxHp' | 'radius' | 'hpFill'>) {
  if (!zombie.hpFill?.scene || zombie.hpFill.active === false) return;
  const progress = Phaser.Math.Clamp(zombie.hp / zombie.maxHp, 0, 1);
  zombie.hpFill.width = zombie.radius * 2 * progress;
  zombie.hpFill.setFillStyle(progress > 0.45 ? 0x39FF14 : progress > 0.2 ? 0xF5C842 : 0xFF5E5E, 0.95);
}

export function getAliveSharedTargets(scene: Pick<ZombiesCombatScene, 'isSharedCoopEnabled' | 'playerId' | 'playerUsername' | 'px' | 'py' | 'hp' | 'gameOver' | 'lastDamageAt'> & { sharedRunPlayers?: Map<string, ZombiesCombatSharedTarget> }) {
  if (!scene.isSharedCoopEnabled()) {
    return [{
      player_id: scene.playerId,
      username: scene.playerUsername,
      x: scene.px,
      y: scene.py,
      hp: scene.hp,
      alive: !scene.gameOver,
      joinedAt: Date.now(),
      lastDamageAt: scene.lastDamageAt,
    }];
  }
  return [...(scene.sharedRunPlayers?.values() ?? [])].filter((player) => player.alive);
}

export function getZombieTargetPlayer(scene: ZombiesCombatScene, zombieX: number, zombieY: number) {
  const alivePlayers = scene.getAliveSharedTargets();
  if (!alivePlayers.length) return null;
  let best = alivePlayers[0];
  let bestDist = Phaser.Math.Distance.Between(zombieX, zombieY, best.x, best.y);
  for (const player of alivePlayers.slice(1)) {
    const nextDist = Phaser.Math.Distance.Between(zombieX, zombieY, player.x, player.y);
    if (nextDist < bestDist) {
      best = player;
      bestDist = nextDist;
    }
  }
  return best;
}

export function getProjectileHitTarget(scene: Pick<ZombiesCombatScene, 'getAliveSharedTargets'>, projectile: Pick<ZombiesCombatProjectile, 'x' | 'y' | 'radius'>) {
  return scene.getAliveSharedTargets().find((player) =>
    Phaser.Math.Distance.Between(projectile.x, projectile.y, player.x, player.y) <= projectile.radius + ZOMBIES_PLAYER.radius
  ) ?? null;
}
