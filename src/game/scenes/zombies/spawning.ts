import Phaser from 'phaser';
import { ZOMBIE_TYPES, ZOMBIES_POINTS, ZOMBIES_WEAPONS, getEligibleZombieTypes, getRoundConcurrentCap, getRoundWarmupMs, getRoundZombieCount, getSpawnDelayForRound, getZombieBreachMs, getZombieHpForRound, getZombieSpeedForRound, type ZombieType, type ZombiesSectionId, type ZombiesWeaponId } from '../../config/zombies';
import { getSkillSystem } from '../../systems/SkillSystem';

export type ZombiesSpawningWeaponState = {
  ammoInMag: number;
  owned: boolean;
  reserveAmmo: number;
  upgraded: boolean;
};

export type ZombiesSpawningSpawnNode = {
  id: string;
  sectionId: ZombiesSectionId;
  x: number;
  y: number;
  occupiedBy?: string;
  boardHealth: number;
  lastUsedAt: number;
};

export type ZombiesSpawningZombieEntity = {
  id: string;
  type: ZombieType;
  assetFolder: string;
  displayLabel: string;
  isBoss: boolean;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  shadow: Phaser.GameObjects.Ellipse;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldownMs: number;
  hitReward: number;
  killReward: number;
  radius: number;
  phase: number;
  alive: boolean;
  spawnNodeId?: string;
  breachEndsAt: number;
  lastAttackAt: number;
  lastSpecialAt: number;
  lastStompAt: number;
  state: string;
};

export type ZombiesSpawningSceneLike = Phaser.Scene & {
  round: number;
  roundTarget: number;
  spawnedThisRound: number;
  nextSpawnAt: number;
  roundBreakUntil: number;
  bossRoundActive: boolean;
  bossSpawnedThisRound: boolean;
  bossAlive: boolean;
  depthsUnlocked: boolean;
  allowDepthsGate: boolean;
  lastSharedSnapshotSentAt: number;
  runStartedAt: number;
  playerLevel: number;
  points: number;
  gameOver: boolean;
  px: number;
  py: number;
  playerId: string;
  playerUsername: string;
  currentWeapon: ZombiesWeaponId;
  weaponOrder: ZombiesWeaponId[];
  weaponInventory: Record<ZombiesWeaponId, ZombiesSpawningWeaponState>;
  spawnNodes: Map<string, ZombiesSpawningSpawnNode>;
  zombies: Map<string, ZombiesSpawningZombieEntity>;
  zombieIdSeq: number;
  zombieProjectileSeq: number;
  pickupIdSeq: number;
  time: Phaser.Time.Clock;
  tweens: Phaser.Tweens.TweenManager;
  cameras: Phaser.Cameras.Scene2D.CameraManager;
  add: Phaser.GameObjects.GameObjectFactory;
  textures: Phaser.Textures.TextureManager;
  isSharedRunHost: () => boolean;
  playZombiesSfx: (kind: 'round_start' | 'boss_round' | 'spawn' | 'stomp' | 'breach') => void;
  showNotice: (text: string, color: string) => void;
  updateDepthsAccessVisual: () => void;
  renderHud: () => void;
  maybeShowSpecModal: (spec: string, level: number) => void;
  getWeaponStats: (weaponId: ZombiesWeaponId) => ZombiesSpawningWeaponStats;
  getUnlockedSections: () => Array<{ id: ZombiesSectionId }>;
  getSpawnSectionsForRound: () => Array<{ id: ZombiesSectionId }>;
  getSectionSpawnWeight: (sectionId: ZombiesSectionId) => number;
  refreshSpawnNodeVisual: (node: ZombiesSpawningSpawnNode, progress: number, occupied: boolean) => void;
  getZombieFallbackTexture: (type: ZombieType) => string;
  renderZombieHp: (zombie: ZombiesSpawningZombieEntity) => void;
  setZombieState: (zombie: ZombiesSpawningZombieEntity, state: string) => void;
  getZombieVisualCandidates?: (zombie: ZombiesSpawningZombieEntity, state: string) => Array<{ animationKey: string }>;
};

export type ZombiesSpawningWeaponStats = {
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

export type ZombiesSpawningZombieConfig = {
  type: ZombieType;
  assetFolder: string;
  displayLabel: string;
  hp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldownMs: number;
  hitReward: number;
  killReward: number;
  radius: number;
  breachMs: number;
  isBoss: boolean;
  noticeColor: string;
};

export function isZombiesBossRound(round: number) {
  return round >= 10 && round % 10 === 0;
}

export function getZombiesRunElapsedMinutes(scene: Pick<ZombiesSpawningSceneLike, 'runStartedAt' | 'time'>) {
  if (scene.runStartedAt <= 0) return 0;
  return Math.max(0, (scene.time.now - scene.runStartedAt) / 60000);
}

export function getZombiesPressureTier(scene: Pick<ZombiesSpawningSceneLike, 'runStartedAt' | 'time'>) {
  return Math.min(8, Math.floor(getZombiesRunElapsedMinutes(scene) / 3.5));
}

export function getZombiesScaledRoundTarget(scene: Pick<ZombiesSpawningSceneLike, 'runStartedAt' | 'time'>, round: number) {
  const base = getRoundZombieCount(round);
  const pressure = getZombiesPressureTier(scene);
  return Math.min(96, base + Math.floor(round * 1.4) + pressure * 4 + Math.floor(round * pressure * 0.35));
}

export function getZombiesScaledSpawnDelayMs(scene: Pick<ZombiesSpawningSceneLike, 'runStartedAt' | 'time'>, round: number) {
  const pressure = getZombiesPressureTier(scene);
  return Math.max(120, getSpawnDelayForRound(round) - pressure * 55 - round * 6);
}

export function getZombiesScaledRoundWarmupMs(scene: Pick<ZombiesSpawningSceneLike, 'runStartedAt' | 'time'>, round: number) {
  const pressure = getZombiesPressureTier(scene);
  return Math.max(650, getRoundWarmupMs(round) - pressure * 120);
}

export function getZombiesScaledConcurrentCap(scene: Pick<ZombiesSpawningSceneLike, 'runStartedAt' | 'time'>, round: number) {
  const pressure = getZombiesPressureTier(scene);
  return Math.min(36, getRoundConcurrentCap(round) + Math.floor(round / 4) + pressure);
}

export function countAliveZombies(scene: Pick<ZombiesSpawningSceneLike, 'zombies'>) {
  let alive = 0;
  for (const zombie of scene.zombies.values()) {
    if (zombie.alive) alive += 1;
  }
  return alive;
}

export function getZombiesPointsMultiplier(scene: Pick<ZombiesSpawningSceneLike, 'time'> & { doublePointsUntil: number }) {
  return scene.doublePointsUntil > scene.time.now ? 2 : 1;
}

export function getZombiesWeaponState(scene: Pick<ZombiesSpawningSceneLike, 'weaponInventory'>, weaponId: ZombiesWeaponId) {
  return scene.weaponInventory[weaponId];
}

export function getZombiesWeaponStats(scene: Pick<ZombiesSpawningSceneLike, 'playerLevel' | 'weaponInventory' | 'getWeaponStats'>, weaponId: ZombiesWeaponId) {
  const base = ZOMBIES_WEAPONS[weaponId];
  const state = getZombiesWeaponState(scene, weaponId);

  const stats = state.upgraded
    ? {
        ...base,
        damage: Math.round(base.damage * (weaponId === 'raygun' ? 1.45 : 1.7)),
        fireDelayMs: Math.max(
          weaponId === 'smg' ? 70 : 90,
          Math.round(base.fireDelayMs * 0.78),
        ),
        magazineSize: Math.round(base.magazineSize * (weaponId === 'shotgun' ? 1.6 : 1.5)),
        reserveAmmo: Math.round(base.reserveAmmo * 1.35),
        reloadMs: Math.max(800, Math.round(base.reloadMs * 0.8)),
        displayLabel: `${base.label}*`,
      }
    : { ...base, displayLabel: base.label };

  if (scene.playerLevel <= 1) return stats;

  const lvl = scene.playerLevel - 1;
  const dmgMult = 1 + lvl * 0.05;
  const delayMult = Math.max(0.55, 1 - lvl * 0.03);
  return {
    ...stats,
    damage: Math.round(stats.damage * dmgMult),
    fireDelayMs: Math.max(
      weaponId === 'smg' ? 60 : 80,
      Math.round(stats.fireDelayMs * delayMult),
    ),
  };
}

export function getZombiesPackCost(_scene: ZombiesSpawningSceneLike, _weaponId: ZombiesWeaponId) {
  void _scene;
  void _weaponId;
  return 5000;
}

export function pickZombiesType(scene: Pick<ZombiesSpawningSceneLike, 'round' | 'bossRoundActive'>): ZombieType {
  const eligible = getEligibleZombieTypes(scene.round);
  const roll = Phaser.Math.Between(0, 99);
  if (scene.bossRoundActive) {
    if (roll > 62) return 'brute';
    if (roll > 28) return 'runner';
    return 'walker';
  }
  if (scene.round >= 6 && roll > 78) return 'brute';
  if (scene.round >= 3 && roll > 52) return 'runner';
  return eligible.some((z) => z.type === 'walker') ? 'walker' : eligible[0].type;
}

export function getZombiesUnlockedSections(scene: Pick<ZombiesSpawningSceneLike, 'getUnlockedSections'>) {
  return scene.getUnlockedSections();
}

export function getZombiesSpawnSectionsForRound(scene: Pick<ZombiesSpawningSceneLike, 'round' | 'bossRoundActive' | 'getUnlockedSections'>) {
  const unlocked = getZombiesUnlockedSections(scene);
  const available = new Set<ZombiesSectionId>(['start']);
  if (scene.round >= 3) available.add('yard');
  if (scene.round >= 6) available.add('workshop');
  if (scene.round >= 9) available.add('street');
  if (scene.bossRoundActive) {
    available.add('workshop');
    available.add('street');
  }
  const unlockedIds = new Set(unlocked.map((section) => section.id));
  const sections = unlocked.filter((section) => available.has(section.id) && unlockedIds.has(section.id));
  return sections.length ? sections : unlocked.filter((section) => section.id === 'start');
}

export function getZombiesSectionSpawnWeight(scene: Pick<ZombiesSpawningSceneLike, 'round' | 'bossRoundActive'>, sectionId: ZombiesSectionId) {
  if (scene.bossRoundActive) {
    if (sectionId === 'street') return 5;
    if (sectionId === 'workshop') return 4;
    if (sectionId === 'yard') return 2;
    return 1;
  }
  if (scene.round < 3) return sectionId === 'start' ? 5 : 0;
  if (scene.round < 6) return sectionId === 'yard' ? 4 : sectionId === 'start' ? 2 : 0;
  if (scene.round < 9) return sectionId === 'workshop' ? 4 : sectionId === 'yard' ? 3 : sectionId === 'start' ? 1 : 0;
  return sectionId === 'street' ? 5 : sectionId === 'workshop' ? 3 : sectionId === 'yard' ? 2 : 1;
}

export function getZombiesAvailableSpawnNodes(scene: Pick<ZombiesSpawningSceneLike, 'px' | 'py' | 'spawnNodes' | 'getSpawnSectionsForRound' | 'getSectionSpawnWeight'>) {
  const directedSectionIds = new Set(scene.getSpawnSectionsForRound().map((section) => section.id));
  const nodes = [...scene.spawnNodes.values()].filter((node) => !node.occupiedBy && directedSectionIds.has(node.sectionId));
  const distant = nodes.filter((node) => Phaser.Math.Distance.Between(scene.px, scene.py, node.x, node.y) >= 240);
  const pool = distant.length ? distant : nodes;
  return pool.sort((a, b) => {
    const weightDiff = scene.getSectionSpawnWeight(b.sectionId) - scene.getSectionSpawnWeight(a.sectionId);
    if (weightDiff !== 0) return weightDiff;
    if (a.boardHealth !== b.boardHealth) return a.boardHealth - b.boardHealth;
    return a.lastUsedAt - b.lastUsedAt;
  });
}

export function beginZombiesRound(scene: ZombiesSpawningSceneLike) {
  scene.round += 1;
  scene.roundTarget = getZombiesScaledRoundTarget(scene, scene.round);
  scene.spawnedThisRound = 0;
  scene.nextSpawnAt = scene.time.now + getZombiesScaledRoundWarmupMs(scene, scene.round);
  scene.roundBreakUntil = 0;
  scene.bossRoundActive = isZombiesBossRound(scene.round);
  scene.bossSpawnedThisRound = false;
  scene.bossAlive = false;
  scene.showNotice(scene.bossRoundActive ? `BOSS ROUND ${scene.round}` : `ROUND ${scene.round}`, scene.bossRoundActive ? '#FF6A6A' : '#FFB36A');
  if (scene.bossRoundActive) {
    triggerZombiesBossRoundIntro(scene, `BOSS ROUND ${scene.round}\nSURVIVE THE HUNT`);
  }
  if (!scene.bossRoundActive) {
    scene.playZombiesSfx('round_start');
  }
  scene.updateDepthsAccessVisual();
  scene.renderHud();
  if (scene.isSharedRunHost()) {
    scene.lastSharedSnapshotSentAt = 0;
  }
}

export function handleZombiesRoundFlow(scene: ZombiesSpawningSceneLike) {
  const concurrentCap = getZombiesScaledConcurrentCap(scene, scene.round);
  if (scene.spawnedThisRound < scene.roundTarget) {
    if (scene.time.now >= scene.nextSpawnAt && countAliveZombies(scene) < concurrentCap) {
      const spawned = spawnZombiesZombie(scene);
      if (spawned) {
        scene.spawnedThisRound += 1;
        scene.nextSpawnAt = scene.time.now + getZombiesScaledSpawnDelayMs(scene, scene.round) + Phaser.Math.Between(-60, 90);
      } else {
        scene.nextSpawnAt = scene.time.now + 180;
      }
    }
    return;
  }

  const aliveZombies = countAliveZombies(scene);

  if (scene.bossRoundActive && !scene.bossSpawnedThisRound && !scene.bossAlive && aliveZombies === 0) {
    const spawnedBoss = spawnZombiesBossZombie(scene);
    if (spawnedBoss) {
      scene.bossSpawnedThisRound = true;
      scene.bossAlive = true;
    }
    return;
  }

  if (
    !scene.depthsUnlocked
    && scene.allowDepthsGate
    && scene.bossRoundActive
    && scene.bossSpawnedThisRound
    && !scene.bossAlive
    && aliveZombies === 0
  ) {
    scene.depthsUnlocked = true;
    scene.updateDepthsAccessVisual();
    scene.showNotice('DEPTHS UNLOCKED', '#FF9DC8');
  }

  if (aliveZombies === 0 && !scene.bossAlive && scene.roundBreakUntil === 0) {
    scene.roundBreakUntil = scene.time.now + ZOMBIES_POINTS.roundBreakMs;
    scene.showNotice(`LIMPIASTE LA RONDA ${scene.round}`, '#9EFFB7');
    void getSkillSystem().addXp('gym', 10, 'wave_clear').then((r) => {
      if (!scene.scene?.isActive('ZombiesScene')) return;
      if (r.leveled_up) scene.maybeShowSpecModal('gym', r.new_level);
    });
  }

  if (scene.roundBreakUntil !== 0 && scene.time.now >= scene.roundBreakUntil) {
    beginZombiesRound(scene);
  }
}

export function showZombiesBossIntro(scene: ZombiesSpawningSceneLike, text: string) {
  const bossIntroText = (scene as { bossIntroText?: Phaser.GameObjects.Text | null }).bossIntroText;
  if (!bossIntroText) return;
  bossIntroText.setText(text);
  bossIntroText.setAlpha(1);
  bossIntroText.setScale(0.86);
  scene.tweens.killTweensOf(bossIntroText);
  scene.tweens.add({
    targets: bossIntroText,
    scaleX: 1,
    scaleY: 1,
    alpha: { from: 1, to: 0 },
    duration: 1800,
    ease: 'Sine.easeOut',
  });
}

export function triggerZombiesBossRoundIntro(scene: ZombiesSpawningSceneLike, text: string) {
  showZombiesBossIntro(scene, text);
  scene.showNotice('BOSS INCOMING', '#FF6A6A');
  scene.cameras.main.flash(180, 120, 20, 20, false);
  scene.cameras.main.shake(160, 0.0032);
  scene.playZombiesSfx('boss_round');
}

export function spawnZombiesZombie(scene: ZombiesSpawningSceneLike) {
  const candidates = getZombiesAvailableSpawnNodes(scene);
  if (!candidates.length) return false;

  const shortestAge = candidates[0]?.lastUsedAt ?? 0;
  const freshestAllowed = shortestAge + 1600;
  const filtered = candidates.filter((node) => node.lastUsedAt <= freshestAllowed);
  const node = Phaser.Utils.Array.GetRandom(filtered.length ? filtered : candidates);
  const type = pickZombiesType(scene);
  const config = ZOMBIE_TYPES[type];
  return spawnConfiguredZombiesZombie(scene, node, {
    type,
    assetFolder: config.folder,
    displayLabel: config.label,
    hp: getZombieHpForRound(config.baseHp, scene.round),
    speed: getZombieSpeedForRound(config.speed, scene.round),
    damage: config.damage,
    attackRange: config.attackRange,
    attackCooldownMs: config.attackCooldownMs,
    hitReward: config.hitReward,
    killReward: config.killReward,
    radius: type === 'brute' ? 22 : type === 'runner' ? 15 : 18,
    breachMs: getZombieBreachMs(scene.round, type),
    isBoss: false,
    noticeColor: '#FF8B3D',
  });
}

export function spawnZombiesBossZombie(scene: ZombiesSpawningSceneLike) {
  const preferred = getZombiesAvailableSpawnNodes(scene).filter((node) => node.sectionId === 'street' || node.sectionId === 'workshop');
  const candidates = preferred.length ? preferred : getZombiesAvailableSpawnNodes(scene);
  if (!candidates.length) return false;
  const node = Phaser.Utils.Array.GetRandom(candidates);
  const hp = Math.round(getZombieHpForRound(420, scene.round) * 1.35);
  const spawned = spawnConfiguredZombiesZombie(scene, node, {
    type: 'brute',
    assetFolder: 'boss',
    displayLabel: 'BOSS',
    hp,
    speed: getZombieSpeedForRound(0.55, scene.round),
    damage: 42,
    attackRange: 42,
    attackCooldownMs: 760,
    hitReward: 25,
    killReward: 420,
    radius: 28,
    breachMs: Math.max(700, getZombieBreachMs(scene.round, 'brute') + 500),
    isBoss: true,
    noticeColor: '#FF3344',
  });
  if (spawned) {
    triggerZombiesBossRoundIntro(scene, 'BOSS BREACHED\nTAKE COVER');
  }
  return spawned;
}

export function createZombiesZombieEntity(scene: ZombiesSpawningSceneLike, config: {
  id: string;
  type: ZombieType;
  assetFolder: string;
  displayLabel: string;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldownMs: number;
  hitReward: number;
  killReward: number;
  radius: number;
  isBoss: boolean;
  x: number;
  y: number;
  phase: number;
  alive: boolean;
  spawnNodeId?: string;
  breachEndsAt: number;
  lastAttackAt: number;
  lastSpecialAt: number;
  lastStompAt: number;
  state: string;
}) {
  const shadow = scene.add.ellipse(config.x, config.y + config.radius + 8, config.radius + 14, 14, 0x000000, 0.28);
  const fallbackTexture = config.isBoss ? 'zombie_fallback_boss' : scene.getZombieFallbackTexture(config.type);
  const idleTexture = `zombie_${config.assetFolder}_idle`;
  const body = scene.add.sprite(0, 0, scene.textures.exists(idleTexture) ? idleTexture : fallbackTexture, 0);
  body.setOrigin(0.5, 0.7);
  body.setScale(config.isBoss ? 1.18 : config.type === 'brute' ? 1.15 : config.type === 'runner' ? 0.95 : 1);
  const hpBg = scene.add.rectangle(0, -config.radius - 14, config.radius * 2, 4, 0x000000, 0.9);
  const hpFill = scene.add.rectangle(-config.radius, -config.radius - 14, config.radius * 2, 4, 0x39FF14, 0.95).setOrigin(0, 0.5);
  const label = scene.add.text(0, -config.radius - 26, config.displayLabel, {
    fontSize: '6px',
    fontFamily: '"Press Start 2P", monospace',
    color: config.isBoss ? '#FF6A6A' : '#F5C842',
  }).setOrigin(0.5);

  const container = scene.add.container(config.x, config.y, [body, hpBg, hpFill, label]);
  shadow.setDepth(29);
  container.setDepth(30);

  const zombie: ZombiesSpawningZombieEntity = {
    id: config.id,
    type: config.type,
    assetFolder: config.assetFolder,
    displayLabel: config.displayLabel,
    isBoss: config.isBoss,
    container,
    body,
    label,
    hpBg,
    hpFill,
    shadow,
    x: config.x,
    y: config.y,
    hp: config.hp,
    maxHp: config.maxHp,
    speed: config.speed,
    damage: config.damage,
    attackRange: config.attackRange,
    attackCooldownMs: config.attackCooldownMs,
    hitReward: config.hitReward,
    killReward: config.killReward,
    radius: config.radius,
    phase: config.phase,
    alive: config.alive,
    spawnNodeId: config.spawnNodeId,
    breachEndsAt: config.breachEndsAt,
    lastAttackAt: config.lastAttackAt,
    lastSpecialAt: config.lastSpecialAt,
    lastStompAt: config.lastStompAt,
    state: config.state,
  };

  scene.renderZombieHp(zombie);
  scene.setZombieState(zombie, zombie.state);
  return zombie;
}

export function spawnConfiguredZombiesZombie(scene: ZombiesSpawningSceneLike, node: ZombiesSpawningSpawnNode, config: ZombiesSpawningZombieConfig) {
  const zombie = createZombiesZombieEntity(scene, {
    id: `z_${scene.zombieIdSeq += 1}`,
    type: config.type,
    assetFolder: config.assetFolder,
    displayLabel: config.displayLabel,
    hp: config.hp,
    maxHp: config.hp,
    speed: config.speed,
    damage: config.damage,
    attackRange: config.attackRange,
    attackCooldownMs: config.attackCooldownMs,
    hitReward: config.hitReward,
    killReward: config.killReward,
    radius: config.radius,
    isBoss: config.isBoss,
    x: node.x,
    y: node.y,
    phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
    alive: true,
    spawnNodeId: node.id,
    breachEndsAt: scene.time.now + config.breachMs,
    lastAttackAt: 0,
    lastSpecialAt: 0,
    lastStompAt: scene.time.now,
    state: 'walk',
  });

  node.occupiedBy = zombie.id;
  node.lastUsedAt = scene.time.now;
  scene.refreshSpawnNodeVisual(node, 0, true);
  scene.zombies.set(zombie.id, zombie);
  scene.showNotice(`BREACH ${config.displayLabel}`, config.noticeColor);
  scene.playZombiesSfx('spawn');
  return true;
}

export function releaseZombiesSpawnNode(scene: Pick<ZombiesSpawningSceneLike, 'time' | 'refreshSpawnNodeVisual'>, node: ZombiesSpawningSpawnNode, resetBoards: boolean) {
  node.occupiedBy = undefined;
  if (resetBoards) {
    scene.refreshSpawnNodeVisual(node, 0, false);
    return;
  }

  scene.refreshSpawnNodeVisual(node, 1, false);
  scene.time.delayedCall(650, () => {
    if (!node.occupiedBy) {
      scene.refreshSpawnNodeVisual(node, 0, false);
    }
  });
}
