import Phaser from 'phaser';
import type { AvatarConfig } from '../../systems/AvatarRenderer';
import { ZOMBIES_PLAYER, ZOMBIES_POINTS, ZOMBIES_WEAPONS, type ZombieType, type ZombiesSectionId, type ZombiesWeaponId } from '../../config/zombies';

const BOX_POS = { x: 435, y: 698 } as const;
const PACK_POS = { x: 1278, y: 610 } as const;

export type SharedRunPlayerState = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  joinedAt: number;
  lastDamageAt: number;
};

export type SharedRunPresenceMeta = {
  player_id?: string;
  username?: string;
  joined_at?: number;
};

export type SharedRunZombieSnapshot = {
  id: string;
  type: ZombieType;
  assetFolder: string;
  displayLabel: string;
  isBoss: boolean;
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
  state: string;
  phase: number;
  alive: boolean;
  spawnNodeId?: string;
  breachInMs: number;
  attackCooldownLeftMs: number;
  specialCooldownLeftMs: number;
  stompCooldownLeftMs: number;
};

export type SharedRunProjectileSnapshot = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  expiresInMs: number;
};

export type SharedRunPickupSnapshot = {
  id: string;
  kind: 'max_ammo' | 'insta_kill' | 'double_points' | 'nuke';
  x: number;
  y: number;
  expiresInMs: number;
};

export type SharedRunSpawnNodeSnapshot = {
  id: string;
  occupiedBy?: string;
  boardHealth: number;
  lastUsedAgoMs: number;
};

export type SharedRunDoorSnapshot = {
  id: ZombiesSectionId;
  unlocked: boolean;
};

export type SharedRunStateSnapshot = {
  host_id: string;
  round: number;
  roundTarget: number;
  spawnedThisRound: number;
  nextSpawnInMs: number;
  roundBreakInMs: number;
  bossRoundActive: boolean;
  bossSpawnedThisRound: boolean;
  bossAlive: boolean;
  depthsUnlocked: boolean;
  points: number;
  zombieIdSeq: number;
  zombieProjectileSeq: number;
  pickupIdSeq: number;
  mysteryBoxCooldownInMs: number;
  boxRollingInMs: number;
  instaKillInMs: number;
  doublePointsInMs: number;
  players: SharedRunPlayerState[];
  doors: SharedRunDoorSnapshot[];
  spawnNodes: SharedRunSpawnNodeSnapshot[];
  zombies: SharedRunZombieSnapshot[];
  projectiles: SharedRunProjectileSnapshot[];
  pickups: SharedRunPickupSnapshot[];
};

export type SharedRunShotPayload = {
  player_id: string;
  username: string;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  weaponId: ZombiesWeaponId;
  damage: number;
  pellets: number;
  range: number;
  spreadDeg: number;
};

export type SharedRunInteractPayload = {
  player_id: string;
  kind: 'door' | 'repair' | 'box' | 'upgrade';
  sectionId?: ZombiesSectionId;
  nodeId?: string;
  weaponId?: ZombiesWeaponId;
  px?: number;
  py?: number;
};

export type SharedRunWeaponGrantPayload = {
  player_id: string;
  kind: 'box' | 'upgrade' | 'notice';
  weaponId?: ZombiesWeaponId;
  ok: boolean;
  message?: string;
};

type SharedRunWeaponInventoryEntry = {
  ammoInMag: number;
  owned: boolean;
  reserveAmmo: number;
  upgraded: boolean;
};

type SharedRunRemoteState = {
  avatar?: AvatarConfig;
  dir?: number;
  dy?: number;
  moving?: boolean;
  player_id: string;
  username: string;
  x: number;
  y: number;
};

type SharedRunRemotePlayer = {
  avatar: {
    destroy: () => void;
    getContainer: () => Phaser.GameObjects.Container;
    setDepth: (depth: number) => void;
    setPosition: (x: number, y: number) => void;
    update: (moving: boolean, dx: number, dy: number) => void;
  };
  isMoving: boolean;
  moveDx: number;
  moveDy: number;
  nameplate: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  username: string;
  x: number;
  y: number;
};

type SharedRunDoorState = {
  id: ZombiesSectionId;
  unlocked: boolean;
  rect?: Phaser.Geom.Rectangle;
  panel: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  costText: Phaser.GameObjects.Text;
};

type SharedRunSpawnNode = {
  id: string;
  x: number;
  y: number;
  occupiedBy?: string;
  boardHealth: number;
  lastUsedAt: number;
};

type SharedRunZombieEntity = {
  id: string;
  type: ZombieType;
  assetFolder: string;
  displayLabel: string;
  isBoss: boolean;
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
  state: string;
  phase: number;
  alive: boolean;
  spawnNodeId?: string;
  breachEndsAt: number;
  lastAttackAt: number;
  lastSpecialAt: number;
  lastStompAt: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
};

type SharedRunProjectileEntity = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  expiresAt: number;
  body: Phaser.GameObjects.Arc | Phaser.GameObjects.Ellipse;
  glow: Phaser.GameObjects.Ellipse;
};

type SharedRunPickupEntity = {
  id: string;
  kind: SharedRunPickupSnapshot['kind'];
  x: number;
  y: number;
  expiresAt: number;
  body: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
};

export type SharedRunScene = Phaser.Scene & {
  playerId: string;
  playerUsername: string;
  px: number;
  py: number;
  hp: number;
  gameOver: boolean;
  round: number;
  roundTarget: number;
  spawnedThisRound: number;
  nextSpawnAt: number;
  roundBreakUntil: number;
  bossRoundActive: boolean;
  bossSpawnedThisRound: boolean;
  bossAlive: boolean;
  depthsUnlocked: boolean;
  points: number;
  zombieIdSeq: number;
  zombieProjectileSeq: number;
  pickupIdSeq: number;
  mysteryBoxCooldownUntil: number;
  boxRollingUntil: number;
  instaKillUntil: number;
  doublePointsUntil: number;
  currentWeapon: ZombiesWeaponId;
  weaponOrder: ZombiesWeaponId[];
  weaponInventory: Record<ZombiesWeaponId, SharedRunWeaponInventoryEntry>;
  sharedRunPlayers: Map<string, SharedRunPlayerState>;
  sharedRunHostId: string | null;
  lastSharedSnapshotSentAt: number;
  sharedResetPending: boolean;
  remotePlayers: Map<string, SharedRunRemotePlayer>;
  doors: Map<ZombiesSectionId, SharedRunDoorState>;
  spawnNodes: Map<string, SharedRunSpawnNode>;
  zombies: Map<string, SharedRunZombieEntity>;
  zombieProjectiles: Map<string, SharedRunProjectileEntity>;
  pickups: Map<string, SharedRunPickupEntity>;
  channel: {
    send: (payload: { type: 'broadcast'; event: string; payload: unknown }) => void | Promise<unknown>;
    presenceState: () => Record<string, SharedRunPresenceMeta[]>;
    track: (payload: SharedRunPresenceMeta) => Promise<unknown>;
  } | null;
  time: Phaser.Time.Clock;
  isSharedCoopEnabled: () => boolean;
  createPickupEntity: (
    snapshot: { id: string; kind: SharedRunPickupSnapshot['kind']; x: number; y: number; expiresAt: number },
    glowColor: number,
    labelColor: string,
    labelText: string,
  ) => SharedRunPickupEntity;
  createZombieEntity: (snapshot: Omit<SharedRunZombieEntity, 'container' | 'shadow'>) => SharedRunZombieEntity;
  createZombieProjectileEntity: (snapshot: Omit<SharedRunProjectileEntity, 'body' | 'glow'>) => SharedRunProjectileEntity;
  destroyPickup: (pickupId: string) => void;
  destroyZombieProjectile: (projectileId: string) => void;
  fireShotBurst: (
    playerId: string,
    username: string,
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weapon: SharedRunShotPayload,
    authoritative: boolean,
  ) => void;
  getPackCost: (weaponId: ZombiesWeaponId) => number;
  getWeaponStats: (weaponId: ZombiesWeaponId) => { label?: string; displayLabel: string; magazineSize: number; reserveAmmo: number };
  refreshSpawnNodeVisual: (node: SharedRunSpawnNode, progress: number, occupied: boolean) => void;
  renderZombieHp: (zombie: SharedRunZombieEntity) => void;
  restartRun: () => void;
  rollMysteryWeapon: () => ZombiesWeaponId;
  safeDestroyZombieVisual: (zombie: SharedRunZombieEntity) => void;
  setZombieState: (zombie: SharedRunZombieEntity, state: string) => void;
  showNotice: (text: string, color?: string) => void;
  spawnRemotePlayer: (playerId: string, username: string, x: number, y: number, avatarConfig: AvatarConfig) => void;
  updateDepthsAccessVisual: () => void;
};

export function isSharedRunHost(scene: Pick<SharedRunScene, 'isSharedCoopEnabled' | 'playerId' | 'sharedRunHostId'>) {
  return scene.isSharedCoopEnabled() && scene.sharedRunHostId === scene.playerId;
}

export function initSharedRunPlayerState(scene: SharedRunScene) {
  if (!scene.isSharedCoopEnabled()) return;
  scene.sharedRunPlayers.set(scene.playerId, {
    player_id: scene.playerId,
    username: scene.playerUsername,
    x: scene.px,
    y: scene.py,
    hp: scene.hp,
    alive: !scene.gameOver,
    joinedAt: Date.now(),
    lastDamageAt: 0,
  });
}

export function syncLocalSharedPlayerState(scene: SharedRunScene) {
  if (!scene.isSharedCoopEnabled()) return;
  const current = scene.sharedRunPlayers.get(scene.playerId);
  scene.sharedRunPlayers.set(scene.playerId, {
    player_id: scene.playerId,
    username: scene.playerUsername,
    x: scene.px,
    y: scene.py,
    hp: scene.hp,
    alive: !scene.gameOver,
    joinedAt: current?.joinedAt ?? Date.now(),
    lastDamageAt: current?.lastDamageAt ?? 0,
  });
}

export function applySharedPlayerStateToLocal(scene: SharedRunScene) {
  if (!scene.isSharedCoopEnabled()) return;
  const local = scene.sharedRunPlayers.get(scene.playerId);
  if (!local) return;
  scene.hp = local.hp;
  scene.gameOver = !local.alive;
}

export function handleSharedPresenceSync(scene: SharedRunScene) {
  if (!scene.isSharedCoopEnabled() || !scene.channel) return;
  const presence = scene.channel.presenceState();
  const players = new Map<string, SharedRunPlayerState>();

  for (const entries of Object.values(presence) as SharedRunPresenceMeta[][]) {
    for (const entry of entries) {
      const playerId = typeof entry.player_id === 'string' ? entry.player_id : '';
      if (!playerId) continue;
      const existing = scene.sharedRunPlayers.get(playerId);
      players.set(playerId, {
        player_id: playerId,
        username: typeof entry.username === 'string' && entry.username.trim() ? entry.username.trim() : existing?.username ?? 'waspi_guest',
        x: existing?.x ?? scene.px,
        y: existing?.y ?? scene.py,
        hp: existing?.hp ?? ZOMBIES_PLAYER.maxHp,
        alive: existing?.alive ?? true,
        joinedAt: typeof entry.joined_at === 'number' && Number.isFinite(entry.joined_at) ? entry.joined_at : existing?.joinedAt ?? Date.now(),
        lastDamageAt: existing?.lastDamageAt ?? 0,
      });
    }
  }

  scene.sharedRunPlayers = players;
  scene.sharedRunHostId = [...players.values()]
    .sort((a, b) => (a.joinedAt - b.joinedAt) || a.player_id.localeCompare(b.player_id))[0]?.player_id ?? null;

  if (isSharedRunHost(scene)) {
    scene.lastSharedSnapshotSentAt = 0;
  }
}

export function buildSharedRunSnapshot(scene: SharedRunScene): SharedRunStateSnapshot {
  return {
    host_id: scene.playerId,
    round: scene.round,
    roundTarget: scene.roundTarget,
    spawnedThisRound: scene.spawnedThisRound,
    nextSpawnInMs: Math.max(0, scene.nextSpawnAt - scene.time.now),
    roundBreakInMs: Math.max(0, scene.roundBreakUntil - scene.time.now),
    bossRoundActive: scene.bossRoundActive,
    bossSpawnedThisRound: scene.bossSpawnedThisRound,
    bossAlive: scene.bossAlive,
    depthsUnlocked: scene.depthsUnlocked,
    points: scene.points,
    zombieIdSeq: scene.zombieIdSeq,
    zombieProjectileSeq: scene.zombieProjectileSeq,
    pickupIdSeq: scene.pickupIdSeq,
    mysteryBoxCooldownInMs: Math.max(0, scene.mysteryBoxCooldownUntil - scene.time.now),
    boxRollingInMs: Math.max(0, scene.boxRollingUntil - scene.time.now),
    instaKillInMs: Math.max(0, scene.instaKillUntil - scene.time.now),
    doublePointsInMs: Math.max(0, scene.doublePointsUntil - scene.time.now),
    players: [...scene.sharedRunPlayers.values()].map((player) => ({
      ...player,
      x: player.player_id === scene.playerId ? scene.px : player.x,
      y: player.player_id === scene.playerId ? scene.py : player.y,
    })),
    doors: [...scene.doors.values()].map((door) => ({ id: door.id, unlocked: door.unlocked })),
    spawnNodes: [...scene.spawnNodes.values()].map((node) => ({
      id: node.id,
      occupiedBy: node.occupiedBy,
      boardHealth: node.boardHealth,
      lastUsedAgoMs: Math.max(0, scene.time.now - node.lastUsedAt),
    })),
    zombies: [...scene.zombies.values()].map((zombie) => ({
      id: zombie.id,
      type: zombie.type,
      assetFolder: zombie.assetFolder,
      displayLabel: zombie.displayLabel,
      isBoss: zombie.isBoss,
      x: zombie.x,
      y: zombie.y,
      hp: zombie.hp,
      maxHp: zombie.maxHp,
      speed: zombie.speed,
      damage: zombie.damage,
      attackRange: zombie.attackRange,
      attackCooldownMs: zombie.attackCooldownMs,
      hitReward: zombie.hitReward,
      killReward: zombie.killReward,
      radius: zombie.radius,
      state: zombie.state,
      phase: zombie.phase,
      alive: zombie.alive,
      spawnNodeId: zombie.spawnNodeId,
      breachInMs: Math.max(0, zombie.breachEndsAt - scene.time.now),
      attackCooldownLeftMs: Math.max(0, zombie.attackCooldownMs - (scene.time.now - zombie.lastAttackAt)),
      specialCooldownLeftMs: Math.max(0, 1500 - (scene.time.now - zombie.lastSpecialAt)),
      stompCooldownLeftMs: Math.max(0, 220 - (scene.time.now - zombie.lastStompAt)),
    })),
    projectiles: [...scene.zombieProjectiles.values()].map((projectile) => ({
      id: projectile.id,
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      damage: projectile.damage,
      radius: projectile.radius,
      expiresInMs: Math.max(0, projectile.expiresAt - scene.time.now),
    })),
    pickups: [...scene.pickups.values()].map((pickup) => ({
      id: pickup.id,
      kind: pickup.kind,
      x: pickup.x,
      y: pickup.y,
      expiresInMs: Math.max(0, pickup.expiresAt - scene.time.now),
    })),
  };
}

export function maybeBroadcastSharedSnapshot(scene: SharedRunScene, force = false) {
  if (!isSharedRunHost(scene) || !scene.channel) return;
  if (!force && scene.time.now - scene.lastSharedSnapshotSentAt < 110) return;
  scene.lastSharedSnapshotSentAt = scene.time.now;
  scene.channel.send({
    type: 'broadcast',
    event: 'shared:snapshot',
    payload: buildSharedRunSnapshot(scene),
  });
}

export function applySharedDoors(scene: SharedRunScene, doors: SharedRunDoorSnapshot[]) {
  const doorStates = new Map(doors.map((door) => [door.id, door.unlocked]));
  for (const door of scene.doors.values()) {
    const unlocked = doorStates.get(door.id) ?? false;
    door.unlocked = unlocked;
    if (!unlocked) continue;
    door.panel.setFillStyle(0x1A3525, 0.88);
    door.panel.setStrokeStyle(2, 0x39FF14, 0.72);
    door.label.setText('ABIERTO');
    door.label.setColor('#9EFFB7');
    door.costText.setText('ACCESO');
    door.costText.setColor('#39FF14');
    door.rect = undefined;
  }
  scene.updateDepthsAccessVisual();
}

export function applySharedSpawnNodes(scene: SharedRunScene, nodes: SharedRunSpawnNodeSnapshot[]) {
  const nextNodes = new Map(nodes.map((node) => [node.id, node]));
  for (const node of scene.spawnNodes.values()) {
    const snapshot = nextNodes.get(node.id);
    if (!snapshot) continue;
    node.occupiedBy = snapshot.occupiedBy;
    node.boardHealth = snapshot.boardHealth;
    node.lastUsedAt = scene.time.now - snapshot.lastUsedAgoMs;
    scene.refreshSpawnNodeVisual(node, 0, Boolean(snapshot.occupiedBy));
  }
}

export function applySharedZombies(scene: SharedRunScene, zombies: SharedRunZombieSnapshot[]) {
  const seen = new Set<string>();
  for (const snapshot of zombies) {
    seen.add(snapshot.id);
    let zombie = scene.zombies.get(snapshot.id);
    if (!zombie) {
      zombie = scene.createZombieEntity({
        id: snapshot.id,
        type: snapshot.type,
        assetFolder: snapshot.assetFolder,
        displayLabel: snapshot.displayLabel,
        hp: snapshot.hp,
        maxHp: snapshot.maxHp,
        speed: snapshot.speed,
        damage: snapshot.damage,
        attackRange: snapshot.attackRange,
        attackCooldownMs: snapshot.attackCooldownMs,
        hitReward: snapshot.hitReward,
        killReward: snapshot.killReward,
        radius: snapshot.radius,
        isBoss: snapshot.isBoss,
        x: snapshot.x,
        y: snapshot.y,
        phase: snapshot.phase,
        alive: snapshot.alive,
        spawnNodeId: snapshot.spawnNodeId,
        breachEndsAt: scene.time.now + snapshot.breachInMs,
        lastAttackAt: scene.time.now - Math.max(0, snapshot.attackCooldownMs - snapshot.attackCooldownLeftMs),
        lastSpecialAt: scene.time.now - Math.max(0, 1500 - snapshot.specialCooldownLeftMs),
        lastStompAt: scene.time.now - Math.max(0, 220 - snapshot.stompCooldownLeftMs),
        state: snapshot.state,
      });
      scene.zombies.set(snapshot.id, zombie);
    }
    zombie.type = snapshot.type;
    zombie.assetFolder = snapshot.assetFolder;
    zombie.displayLabel = snapshot.displayLabel;
    zombie.isBoss = snapshot.isBoss;
    zombie.x = snapshot.x;
    zombie.y = snapshot.y;
    zombie.hp = snapshot.hp;
    zombie.maxHp = snapshot.maxHp;
    zombie.speed = snapshot.speed;
    zombie.damage = snapshot.damage;
    zombie.attackRange = snapshot.attackRange;
    zombie.attackCooldownMs = snapshot.attackCooldownMs;
    zombie.hitReward = snapshot.hitReward;
    zombie.killReward = snapshot.killReward;
    zombie.radius = snapshot.radius;
    zombie.state = snapshot.state;
    zombie.phase = snapshot.phase;
    zombie.alive = snapshot.alive;
    zombie.spawnNodeId = snapshot.spawnNodeId;
    zombie.breachEndsAt = scene.time.now + snapshot.breachInMs;
    zombie.lastAttackAt = scene.time.now - Math.max(0, snapshot.attackCooldownMs - snapshot.attackCooldownLeftMs);
    zombie.lastSpecialAt = scene.time.now - Math.max(0, 1500 - snapshot.specialCooldownLeftMs);
    zombie.lastStompAt = scene.time.now - Math.max(0, 220 - snapshot.stompCooldownLeftMs);
    zombie.container.setPosition(zombie.x, zombie.y);
    zombie.shadow.setPosition(zombie.x, zombie.y + zombie.radius + 8);
    zombie.container.setDepth(Math.floor(zombie.y / 10));
    zombie.shadow.setDepth(zombie.container.depth - 1);
    scene.renderZombieHp(zombie);
    scene.setZombieState(zombie, zombie.state);
  }

  for (const zombie of [...scene.zombies.values()]) {
    if (seen.has(zombie.id)) continue;
    scene.safeDestroyZombieVisual(zombie);
    scene.zombies.delete(zombie.id);
  }
}

export function applySharedProjectiles(scene: SharedRunScene, projectiles: SharedRunProjectileSnapshot[]) {
  const seen = new Set<string>();
  for (const snapshot of projectiles) {
    seen.add(snapshot.id);
    let projectile = scene.zombieProjectiles.get(snapshot.id);
    if (!projectile) {
      projectile = scene.createZombieProjectileEntity({
        id: snapshot.id,
        x: snapshot.x,
        y: snapshot.y,
        vx: snapshot.vx,
        vy: snapshot.vy,
        damage: snapshot.damage,
        radius: snapshot.radius,
        expiresAt: scene.time.now + snapshot.expiresInMs,
      });
      scene.zombieProjectiles.set(snapshot.id, projectile);
    }
    projectile.x = snapshot.x;
    projectile.y = snapshot.y;
    projectile.vx = snapshot.vx;
    projectile.vy = snapshot.vy;
    projectile.damage = snapshot.damage;
    projectile.radius = snapshot.radius;
    projectile.expiresAt = scene.time.now + snapshot.expiresInMs;
    projectile.body.setPosition(projectile.x, projectile.y);
    projectile.glow.setPosition(projectile.x, projectile.y);
  }

  for (const projectile of [...scene.zombieProjectiles.values()]) {
    if (seen.has(projectile.id)) continue;
    scene.destroyZombieProjectile(projectile.id);
  }
}

function getSharedPickupVisual(kind: SharedRunPickupSnapshot['kind']) {
  if (kind === 'max_ammo') return { glowColor: 0x46B3FF, labelColor: '#7CC9FF', labelText: 'MAX AMMO' };
  if (kind === 'insta_kill') return { glowColor: 0xFF3344, labelColor: '#FF6A6A', labelText: 'INSTA-KILL' };
  if (kind === 'double_points') return { glowColor: 0xF5C842, labelColor: '#FFD36A', labelText: 'DOUBLE PTS' };
  return { glowColor: 0x9BFF4F, labelColor: '#C9FF89', labelText: 'NUKE' };
}

export function applySharedPickups(scene: SharedRunScene, pickups: SharedRunPickupSnapshot[]) {
  const seen = new Set<string>();
  for (const snapshot of pickups) {
    seen.add(snapshot.id);
    let pickup = scene.pickups.get(snapshot.id);
    const { glowColor, labelColor, labelText } = getSharedPickupVisual(snapshot.kind);
    if (!pickup) {
      pickup = scene.createPickupEntity({
        id: snapshot.id,
        kind: snapshot.kind,
        x: snapshot.x,
        y: snapshot.y,
        expiresAt: scene.time.now + snapshot.expiresInMs,
      }, glowColor, labelColor, labelText);
      scene.pickups.set(snapshot.id, pickup);
    }
    pickup.x = snapshot.x;
    pickup.y = snapshot.y;
    pickup.expiresAt = scene.time.now + snapshot.expiresInMs;
    pickup.body.setPosition(pickup.x, pickup.y - 8);
    pickup.label.setPosition(pickup.x, pickup.y - 32);
    pickup.glow.setPosition(pickup.x, pickup.y + 6);
  }

  for (const pickup of [...scene.pickups.values()]) {
    if (seen.has(pickup.id)) continue;
    scene.destroyPickup(pickup.id);
  }
}

export function handleSharedSnapshot(scene: SharedRunScene, payload: unknown) {
  if (!scene.isSharedCoopEnabled() || isSharedRunHost(scene)) return;
  if (!payload || typeof payload !== 'object') return;
  const snapshot = payload as SharedRunStateSnapshot;
  if (!snapshot.host_id) return;

  scene.sharedRunHostId = snapshot.host_id;
  scene.round = snapshot.round;
  scene.roundTarget = snapshot.roundTarget;
  scene.spawnedThisRound = snapshot.spawnedThisRound;
  scene.nextSpawnAt = scene.time.now + Math.max(0, snapshot.nextSpawnInMs);
  scene.roundBreakUntil = scene.time.now + Math.max(0, snapshot.roundBreakInMs);
  scene.bossRoundActive = snapshot.bossRoundActive;
  scene.bossSpawnedThisRound = snapshot.bossSpawnedThisRound;
  scene.bossAlive = snapshot.bossAlive;
  scene.depthsUnlocked = snapshot.depthsUnlocked;
  scene.points = snapshot.points;
  scene.zombieIdSeq = snapshot.zombieIdSeq;
  scene.zombieProjectileSeq = snapshot.zombieProjectileSeq;
  scene.pickupIdSeq = snapshot.pickupIdSeq;
  scene.mysteryBoxCooldownUntil = scene.time.now + Math.max(0, snapshot.mysteryBoxCooldownInMs);
  scene.boxRollingUntil = scene.time.now + Math.max(0, snapshot.boxRollingInMs);
  scene.instaKillUntil = scene.time.now + Math.max(0, snapshot.instaKillInMs);
  scene.doublePointsUntil = scene.time.now + Math.max(0, snapshot.doublePointsInMs);

  scene.sharedRunPlayers = new Map(snapshot.players.map((player) => ([
    player.player_id,
    { ...player, lastDamageAt: player.lastDamageAt ?? 0 },
  ])));
  applySharedDoors(scene, snapshot.doors);
  applySharedSpawnNodes(scene, snapshot.spawnNodes);
  applySharedZombies(scene, snapshot.zombies);
  applySharedProjectiles(scene, snapshot.projectiles);
  applySharedPickups(scene, snapshot.pickups);
  applySharedPlayerStateToLocal(scene);
}

export function broadcastSharedShot(scene: SharedRunScene, payload: SharedRunShotPayload) {
  if (!scene.isSharedCoopEnabled() || !scene.channel) return;
  scene.channel.send({
    type: 'broadcast',
    event: 'shared:shot',
    payload,
  });
}

export function handleSharedShot(scene: SharedRunScene, payload: unknown) {
  if (!scene.isSharedCoopEnabled() || !payload || typeof payload !== 'object') return;
  const shot = payload as SharedRunShotPayload;
  if (!shot.player_id || shot.player_id === scene.playerId) return;
  scene.fireShotBurst(
    shot.player_id,
    shot.username,
    shot.originX,
    shot.originY,
    shot.targetX,
    shot.targetY,
    shot,
    isSharedRunHost(scene),
  );
}

export function broadcastSharedInteract(scene: SharedRunScene, payload: SharedRunInteractPayload) {
  if (!scene.isSharedCoopEnabled() || !scene.channel) return;
  scene.channel.send({
    type: 'broadcast',
    event: 'shared:interact',
    payload,
  });
}

export function handleSharedInteractRequest(scene: SharedRunScene, payload: unknown) {
  if (!isSharedRunHost(scene) || !payload || typeof payload !== 'object') return null;
  const request = payload as SharedRunInteractPayload;
  const actor = scene.sharedRunPlayers.get(request.player_id);
  if (!actor || !actor.alive) return null;

  const ax = request.px ?? actor.x;
  const ay = request.py ?? actor.y;

  if (request.kind === 'door' && request.sectionId) {
    const door = scene.doors.get(request.sectionId);
    if (!door?.rect || door.unlocked) return null;
    const expandedDoor = new Phaser.Geom.Rectangle(door.rect.x - 35, door.rect.y - 35, door.rect.width + 70, door.rect.height + 70);
    return Phaser.Geom.Rectangle.Contains(expandedDoor, ax, ay) ? request : null;
  }

  if (request.kind === 'repair' && request.nodeId) {
    const node = scene.spawnNodes.get(request.nodeId);
    return node && Phaser.Math.Distance.Between(ax, ay, node.x, node.y) <= 78 ? request : null;
  }

  if (request.kind === 'box') {
    return Phaser.Math.Distance.Between(ax, ay, BOX_POS.x, BOX_POS.y) <= 74 ? request : null;
  }

  if (request.kind === 'upgrade' && request.weaponId) {
    return Phaser.Math.Distance.Between(ax, ay, PACK_POS.x, PACK_POS.y) <= 76 ? request : null;
  }

  return null;
}

export function broadcastSharedWeaponGrant(scene: SharedRunScene, payload: SharedRunWeaponGrantPayload) {
  if (!scene.isSharedCoopEnabled() || !scene.channel) return;
  scene.channel.send({
    type: 'broadcast',
    event: 'shared:weapon',
    payload,
  });
}

export function handleSharedWeaponGrant(scene: SharedRunScene, payload: unknown) {
  if (!payload || typeof payload !== 'object') return;
  applySharedWeaponGrant(scene, payload as SharedRunWeaponGrantPayload);
}

export function applySharedWeaponGrant(scene: SharedRunScene, payload: SharedRunWeaponGrantPayload) {
  if (payload.player_id !== scene.playerId) return;

  if (!payload.ok) {
    if (payload.message) scene.showNotice(payload.message, '#FF6A6A');
    return;
  }

  if (payload.kind === 'box' && payload.weaponId) {
    const ammo = scene.weaponInventory[payload.weaponId];
    const config = scene.getWeaponStats(payload.weaponId);
    ammo.owned = true;
    ammo.ammoInMag = config.magazineSize;
    ammo.reserveAmmo = Math.max(ammo.reserveAmmo, config.reserveAmmo);
    if (!scene.weaponOrder.includes(payload.weaponId)) {
      scene.weaponOrder.push(payload.weaponId);
    }
    scene.currentWeapon = payload.weaponId;
  } else if (payload.kind === 'upgrade' && payload.weaponId) {
    const ammo = scene.weaponInventory[payload.weaponId];
    ammo.upgraded = true;
    const upgraded = scene.getWeaponStats(payload.weaponId);
    ammo.ammoInMag = upgraded.magazineSize;
    ammo.reserveAmmo = Math.max(ammo.reserveAmmo, upgraded.reserveAmmo);
    scene.currentWeapon = payload.weaponId;
  }

  if (payload.message) {
    scene.showNotice(payload.message, payload.kind === 'upgrade' ? '#46B3FF' : '#FF7CCE');
  }
}

export function rollSharedMysteryBoxGrant(scene: SharedRunScene, playerId: string): SharedRunWeaponGrantPayload | null {
  if (scene.boxRollingUntil > scene.time.now) {
    return { player_id: playerId, kind: 'notice', ok: false, message: 'LA BOX ESTA GIRANDO' };
  }
  if (scene.time.now < scene.mysteryBoxCooldownUntil) {
    return { player_id: playerId, kind: 'notice', ok: false, message: 'LA BOX RECARGA' };
  }
  if (scene.points < ZOMBIES_POINTS.mysteryBoxCost) {
    return { player_id: playerId, kind: 'notice', ok: false, message: 'NO ALCANZAN LOS PTS' };
  }

  scene.points -= ZOMBIES_POINTS.mysteryBoxCost;
  scene.mysteryBoxCooldownUntil = scene.time.now + 3200;
  scene.boxRollingUntil = scene.time.now + 1400;
  scene.lastSharedSnapshotSentAt = 0;
  const weaponId = scene.rollMysteryWeapon();

  return {
    player_id: playerId,
    kind: 'box',
    weaponId,
    ok: true,
    message: `BOX: ${ZOMBIES_WEAPONS[weaponId].label}`,
  };
}

export function buildSharedUpgradeGrant(scene: SharedRunScene, playerId: string, weaponId: ZombiesWeaponId): SharedRunWeaponGrantPayload {
  const cost = scene.getPackCost(weaponId);
  if (scene.points < cost) {
    return { player_id: playerId, kind: 'notice', ok: false, message: 'NO ALCANZAN LOS PTS' };
  }
  scene.points -= cost;
  scene.lastSharedSnapshotSentAt = 0;
  return {
    player_id: playerId,
    kind: 'upgrade',
    weaponId,
    ok: true,
    message: `PACKED ${ZOMBIES_WEAPONS[weaponId].label}`,
  };
}

export function broadcastSharedMaxAmmo(scene: SharedRunScene) {
  if (!scene.isSharedCoopEnabled() || !scene.channel) return;
  scene.channel.send({
    type: 'broadcast',
    event: 'shared:max_ammo',
    payload: { host_id: scene.playerId },
  });
}

export function applyMaxAmmoToLocalLoadout(scene: SharedRunScene) {
  for (const weaponId of scene.weaponOrder) {
    const weapon = scene.getWeaponStats(weaponId);
    const ammo = scene.weaponInventory[weaponId];
    ammo.ammoInMag = weapon.magazineSize;
    ammo.reserveAmmo = Math.max(ammo.reserveAmmo, weapon.reserveAmmo);
  }
}

export function maybeScheduleSharedReset(scene: SharedRunScene) {
  if (!isSharedRunHost(scene) || scene.sharedResetPending) return;
  if ([...scene.sharedRunPlayers.values()].some((player) => player.alive)) return;
  scene.sharedResetPending = true;
  scene.showNotice('TEAM WIPE - REINICIANDO', '#FF6A6A');
  scene.time.delayedCall(2200, () => {
    scene.sharedResetPending = false;
    scene.channel?.send({
      type: 'broadcast',
      event: 'shared:reset',
      payload: { host_id: scene.playerId },
    });
    scene.restartRun();
  });
}

export function updateSharedRemotePlayers(scene: SharedRunScene) {
  for (const [playerId, remote] of scene.remotePlayers.entries()) {
    remote.x = Phaser.Math.Linear(remote.x, remote.targetX, 0.18);
    remote.y = Phaser.Math.Linear(remote.y, remote.targetY, 0.18);
    remote.avatar.update(remote.isMoving, remote.moveDx, remote.moveDy);
    remote.avatar.setPosition(remote.x, remote.y);
    remote.avatar.setDepth(Math.floor(remote.y / 10));
    remote.nameplate.setPosition(remote.x, remote.y - 44);
    const shared = scene.sharedRunPlayers.get(playerId);
    const alive = shared?.alive ?? true;
    remote.avatar.getContainer().setAlpha(alive ? 1 : 0.45);
    remote.nameplate.setAlpha(alive ? 1 : 0.6);
  }
}

export function applyRemoteSharedState(scene: SharedRunScene, next: SharedRunRemoteState) {
  if (next.player_id === scene.playerId) return;
  if (!scene.remotePlayers.has(next.player_id) && next.avatar) {
    scene.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, next.avatar);
  }

  const remote = scene.remotePlayers.get(next.player_id);
  if (!remote) return;
  remote.targetX = next.x;
  remote.targetY = next.y;
  remote.moveDx = next.dir ?? 0;
  remote.moveDy = next.dy ?? 0;
  remote.isMoving = next.moving ?? false;
  remote.username = next.username;
  remote.nameplate.setText(next.username);

  if (scene.isSharedCoopEnabled()) {
    const current = scene.sharedRunPlayers.get(next.player_id);
    scene.sharedRunPlayers.set(next.player_id, {
      player_id: next.player_id,
      username: next.username,
      x: next.x,
      y: next.y,
      hp: current?.hp ?? ZOMBIES_PLAYER.maxHp,
      alive: current?.alive ?? true,
      joinedAt: current?.joinedAt ?? Date.now(),
      lastDamageAt: current?.lastDamageAt ?? 0,
    });
  }
}

export function handleSharedRemoteLeave(scene: SharedRunScene, playerId: string) {
  const remote = scene.remotePlayers.get(playerId);
  if (!remote) return;
  remote.avatar.destroy();
  remote.nameplate.destroy();
  scene.remotePlayers.delete(playerId);
  scene.sharedRunPlayers.delete(playerId);
  if (isSharedRunHost(scene)) {
    scene.lastSharedSnapshotSentAt = 0;
    maybeScheduleSharedReset(scene);
  }
}
