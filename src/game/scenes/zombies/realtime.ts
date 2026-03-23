import Phaser from 'phaser';
import type { AvatarConfig } from '../../systems/AvatarRenderer';
import { eventBus, EVENTS } from '../../config/eventBus';
import { ZOMBIES_PLAYER } from '../../config/zombies';
import { syncZombiesPickupsFromSnapshots, type ZombiesPickupState } from './pickups';

export type ZombiesRealtimeRemoteState = {
  avatar?: AvatarConfig;
  dir?: number;
  dy?: number;
  moving?: boolean;
  player_id: string;
  username: string;
  x: number;
  y: number;
};

export type ZombiesRealtimeRemotePlayer = {
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

export type ZombiesRealtimeSharedPlayerState = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  joinedAt: number;
  lastDamageAt: number;
};

export type ZombiesRealtimeSharedSnapshot = {
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
  players: ZombiesRealtimeSharedPlayerState[];
  doors: Array<{ id: string; unlocked: boolean }>;
  spawnNodes: Array<{ id: string; occupiedBy?: string; boardHealth: number; lastUsedAgoMs: number }>;
  zombies: Array<{
    id: string;
    type: string;
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
  }>;
  projectiles: Array<{
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage: number;
    radius: number;
    expiresInMs: number;
  }>;
  pickups: Array<{
    id: string;
    kind: 'max_ammo' | 'insta_kill' | 'double_points' | 'nuke';
    x: number;
    y: number;
    expiresInMs: number;
  }>;
};

export type ZombiesRealtimeScene = Phaser.Scene & {
  playerId: string;
  playerUsername: string;
  px: number;
  py: number;
  lastIsMoving: boolean;
  lastMoveDx: number;
  lastMoveDy: number;
  lastPosSent: number;
  avatarConfig: AvatarConfig;
  hp: number;
  gameOver: boolean;
  cleanupFns: Array<() => void>;
  remotePlayers: Map<string, ZombiesRealtimeRemotePlayer>;
  sharedRunPlayers: Map<string, ZombiesRealtimeSharedPlayerState>;
  channel: {
    send: (payload: { type: 'broadcast'; event: string; payload: unknown }) => void | Promise<unknown>;
    unsubscribe?: () => void;
  } | null;
  chatSystem?: {
    showBubble: (id: string, message: string, x: number, y: number, isMe: boolean) => void;
  };
  isSharedCoopEnabled: () => boolean;
  isSharedRunHost: () => boolean;
  maybeScheduleSharedReset: () => void;
  readBooleanField: (payload: unknown, ...keys: string[]) => boolean | null;
  readNumberField: (payload: unknown, ...keys: string[]) => number | null;
  readStringField: (payload: unknown, ...keys: string[]) => string | null;
  spawnRemotePlayer: (playerId: string, username: string, x: number, y: number, avatarConfig: AvatarConfig) => void;
};

export type ZombiesRealtimeFrameScene = Pick<
  ZombiesRealtimeScene,
  | 'channel'
  | 'lastPosSent'
  | 'remotePlayers'
  | 'sharedRunPlayers'
  | 'isSharedCoopEnabled'
  | 'playerId'
  | 'playerUsername'
  | 'px'
  | 'py'
  | 'lastMoveDx'
  | 'lastMoveDy'
  | 'lastIsMoving'
  | 'avatarConfig'
  | 'hp'
  | 'gameOver'
> & {
  syncLocalSharedPlayerState?: () => void;
};

export type ZombiesRealtimeChannel = {
  on: (
    type: 'presence' | 'broadcast',
    filter: { event: string },
    handler: (payload: { payload?: unknown }) => void,
  ) => ZombiesRealtimeChannel;
  subscribe: (handler: () => void) => void;
  track?: (payload: { player_id: string; username: string; joined_at: number }) => Promise<unknown>;
};

export function broadcastRealtimeSelfState(
  scene: Pick<
    ZombiesRealtimeScene,
    'channel' | 'playerId' | 'playerUsername' | 'px' | 'py' | 'lastMoveDx' | 'lastMoveDy' | 'lastIsMoving' | 'avatarConfig'
  >,
  event: 'player:join' | 'player:move',
) {
  if (!scene.channel) return;
  scene.channel.send({
    type: 'broadcast',
    event,
    payload: {
      player_id: scene.playerId,
      username: scene.playerUsername,
      x: Math.round(scene.px),
      y: Math.round(scene.py),
      dir: scene.lastMoveDx,
      dy: scene.lastMoveDy,
      moving: scene.lastIsMoving,
      avatar: scene.avatarConfig,
    },
  });
}

export function buildRealtimePresencePayload(
  scene: Pick<ZombiesRealtimeScene, 'playerId' | 'playerUsername'>,
  joinedAt = Date.now(),
) {
  return {
    player_id: scene.playerId,
    username: scene.playerUsername,
    joined_at: joinedAt,
  };
}

export function buildRealtimeLeavePayload(scene: Pick<ZombiesRealtimeScene, 'playerId'>) {
  return { player_id: scene.playerId };
}

export function syncRealtimePosition(
  scene: Pick<ZombiesRealtimeScene, 'channel' | 'lastPosSent'> & {
    syncLocalSharedPlayerState?: () => void;
  } & Pick<
    ZombiesRealtimeScene,
    'playerId' | 'playerUsername' | 'px' | 'py' | 'lastMoveDx' | 'lastMoveDy' | 'lastIsMoving' | 'avatarConfig'
  >,
  nowMs = Date.now(),
) {
  if (!scene.channel) return false;
  if (nowMs - scene.lastPosSent < 66) return false;
  scene.lastPosSent = nowMs;
  scene.syncLocalSharedPlayerState?.();
  broadcastRealtimeSelfState(scene, 'player:move');
  return true;
}

export function updateRealtimeRemotePlayers(
  scene: Pick<ZombiesRealtimeScene, 'remotePlayers' | 'sharedRunPlayers'>,
) {
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

export function applyRealtimeSharedPlayerStateToLocal(
  scene: Pick<ZombiesRealtimeScene, 'playerId' | 'sharedRunPlayers' | 'isSharedCoopEnabled'> & {
    hp: number;
    gameOver: boolean;
  },
) {
  if (!scene.isSharedCoopEnabled()) return;
  const local = scene.sharedRunPlayers.get(scene.playerId);
  if (!local) return;
  scene.hp = local.hp;
  scene.gameOver = !local.alive;
}

export function stepZombiesRealtimeFrame(
  scene: ZombiesRealtimeFrameScene,
  nowMs = Date.now(),
) {
  const synced = syncRealtimePosition(scene, nowMs);
  updateRealtimeRemotePlayers(scene);
  applyRealtimeSharedPlayerStateToLocal(scene);
  return synced;
}

export function parseRealtimeRemoteState(
  scene: Pick<ZombiesRealtimeScene, 'readStringField' | 'readNumberField' | 'readBooleanField'>,
  payload: unknown,
): ZombiesRealtimeRemoteState | null {
  const playerId = scene.readStringField(payload, 'player_id', 'playerId');
  const username = scene.readStringField(payload, 'username') ?? 'waspi_guest';
  const x = scene.readNumberField(payload, 'x');
  const y = scene.readNumberField(payload, 'y');
  if (!playerId || x === null || y === null) return null;

  const avatar = payload && typeof payload === 'object' && 'avatar' in payload && payload.avatar && typeof payload.avatar === 'object'
    ? payload.avatar as AvatarConfig
    : undefined;

  return {
    player_id: playerId,
    username,
    x,
    y,
    dir: scene.readNumberField(payload, 'dir', 'dx') ?? 0,
    dy: scene.readNumberField(payload, 'dy') ?? 0,
    moving: scene.readBooleanField(payload, 'moving', 'isMoving') ?? false,
    avatar,
  };
}

export function applyRealtimeRemoteState(
  scene: Pick<ZombiesRealtimeScene, 'playerId' | 'remotePlayers' | 'isSharedCoopEnabled' | 'sharedRunPlayers' | 'spawnRemotePlayer'>,
  next: ZombiesRealtimeRemoteState,
) {
  if (next.player_id === scene.playerId) return;

  if (!scene.remotePlayers.has(next.player_id)) {
    scene.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, next.avatar ?? {});
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

export function handleRealtimeRemoteState(
  scene: Pick<
    ZombiesRealtimeScene,
    | 'playerId'
    | 'remotePlayers'
    | 'isSharedCoopEnabled'
    | 'sharedRunPlayers'
    | 'spawnRemotePlayer'
    | 'readStringField'
    | 'readNumberField'
    | 'readBooleanField'
  >,
  payload: unknown,
) {
  const next = parseRealtimeRemoteState(scene, payload);
  if (!next) return null;
  applyRealtimeRemoteState(scene, next);
  return next;
}

export type ZombiesRealtimeSharedSnapshotSource = {
  playerId: string;
  time: Phaser.Time.Clock;
  isSharedRunHost: () => boolean;
  px: number;
  py: number;
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
  sharedRunPlayers: Map<string, ZombiesRealtimeSharedPlayerState>;
  doors: Map<string, { id: string; unlocked: boolean }>;
  spawnNodes: Map<string, { id: string; occupiedBy?: string; boardHealth: number; lastUsedAt: number }>;
  zombies: Map<string, {
    id: string;
    type: string;
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
  }>;
  zombieProjectiles: Map<string, {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage: number;
    radius: number;
    expiresAt: number;
  }>;
  pickups: Map<string, {
    id: string;
    kind: ZombiesRealtimeSharedSnapshot['pickups'][number]['kind'];
    x: number;
    y: number;
    expiresAt: number;
  }>;
};

type ZombiesRealtimeSharedSnapshotStateScene = {
  isSharedCoopEnabled: () => boolean;
  isSharedRunHost: () => boolean;
  time: Phaser.Time.Clock;
  sharedRunPlayers: Map<string, ZombiesRealtimeSharedPlayerState>;
  sharedRunHostId?: string | null;
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
  applySharedPlayerStateToLocal: () => void;
};

export type ZombiesRealtimeSharedSnapshotCollectionsScene = ZombiesRealtimeSharedSnapshotStateScene & {
  add: Phaser.GameObjects.GameObjectFactory;
  doors: Map<string, {
    id: string;
    unlocked: boolean;
    panel: {
      setFillStyle: (color: number, alpha?: number) => void;
      setStrokeStyle: (lineWidth: number, color: number, alpha?: number) => void;
    };
    label: {
      setText: (text: string) => void;
      setColor: (color: string) => void;
    };
    costText: {
      setText: (text: string) => void;
      setColor: (color: string) => void;
    };
    rect?: unknown;
  }>;
  updateDepthsAccessVisual: () => void;
  spawnNodes: Map<string, {
    id: string;
    occupiedBy?: string;
    boardHealth: number;
    lastUsedAt: number;
  }>;
  refreshSpawnNodeVisual: (node: {
    id: string;
    occupiedBy?: string;
    boardHealth: number;
    lastUsedAt: number;
  }, healthDelta: number, occupied: boolean) => void;
  zombies: Map<string, {
    id: string;
    type: string;
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
    container: {
      setPosition: (x: number, y: number) => void;
      setDepth: (depth: number) => void;
      depth: number;
    };
    shadow: {
      setPosition: (x: number, y: number) => void;
      setDepth: (depth: number) => void;
    };
  }>;
  createZombieEntity: (snapshot: ZombiesRealtimeSharedSnapshot['zombies'][number] & {
    breachEndsAt: number;
    lastAttackAt: number;
    lastSpecialAt: number;
    lastStompAt: number;
  }) => ZombiesRealtimeZombieEntity;
  renderZombieHp: (zombie: ZombiesRealtimeZombieEntity) => void;
  setZombieState: (zombie: ZombiesRealtimeZombieEntity, state: string) => void;
  safeDestroyZombieVisual: (zombie: ZombiesRealtimeZombieEntity) => void;
  tweens: Phaser.Tweens.TweenManager;
  zombieProjectiles: Map<string, {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage: number;
    radius: number;
    expiresAt: number;
    body: { setPosition: (x: number, y: number) => void };
    glow: { setPosition: (x: number, y: number) => void };
  }>;
  createZombieProjectileEntity: (snapshot: {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage: number;
    radius: number;
    expiresAt: number;
  }) => ZombiesRealtimeZombieProjectileEntity;
  destroyZombieProjectile: (id: string) => void;
  pickups: Map<string, ZombiesPickupState>;
};

export type ZombiesRealtimeSharedSnapshotAdapterState = Pick<
  ZombiesRealtimeSharedSnapshotCollectionsScene,
  | 'add'
  | 'bossAlive'
  | 'bossRoundActive'
  | 'bossSpawnedThisRound'
  | 'boxRollingUntil'
  | 'depthsUnlocked'
  | 'doors'
  | 'doublePointsUntil'
  | 'instaKillUntil'
  | 'mysteryBoxCooldownUntil'
  | 'nextSpawnAt'
  | 'pickupIdSeq'
  | 'pickups'
  | 'points'
  | 'round'
  | 'roundBreakUntil'
  | 'roundTarget'
  | 'sharedRunHostId'
  | 'sharedRunPlayers'
  | 'spawnNodes'
  | 'spawnedThisRound'
  | 'time'
  | 'tweens'
  | 'zombieIdSeq'
  | 'zombieProjectileSeq'
  | 'zombieProjectiles'
  | 'zombies'
>;

export type ZombiesRealtimeSharedSnapshotAdapterBindings = Pick<
  ZombiesRealtimeSharedSnapshotCollectionsScene,
  | 'applySharedPlayerStateToLocal'
  | 'createZombieEntity'
  | 'createZombieProjectileEntity'
  | 'destroyZombieProjectile'
  | 'isSharedCoopEnabled'
  | 'isSharedRunHost'
  | 'refreshSpawnNodeVisual'
  | 'renderZombieHp'
  | 'safeDestroyZombieVisual'
  | 'setZombieState'
  | 'updateDepthsAccessVisual'
>;

type ZombiesRealtimeZombieEntity = {
  id: string;
  type: string;
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
  container: {
    setPosition: (x: number, y: number) => void;
    setDepth: (depth: number) => void;
    depth: number;
  };
  shadow: {
    setPosition: (x: number, y: number) => void;
    setDepth: (depth: number) => void;
  };
};

type ZombiesRealtimeZombieProjectileEntity = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  expiresAt: number;
  body: { setPosition: (x: number, y: number) => void };
  glow: { setPosition: (x: number, y: number) => void };
};

export function createZombiesRealtimeSharedSnapshotAdapter(
  state: ZombiesRealtimeSharedSnapshotAdapterState,
  bindings: ZombiesRealtimeSharedSnapshotAdapterBindings,
) {
  return {
    ...state,
    ...bindings,
  } as unknown as ZombiesRealtimeSharedSnapshotCollectionsScene;
}

export function buildZombiesRealtimeSharedSnapshot(
  scene: ZombiesRealtimeSharedSnapshotSource,
): ZombiesRealtimeSharedSnapshot {
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

export function broadcastZombiesRealtimeSharedSnapshot(
  scene: ZombiesRealtimeSharedSnapshotSource & {
    channel: ZombiesRealtimeScene['channel'];
  },
) {
  if (!scene.channel || !scene.isSharedRunHost()) return false;
  scene.channel.send({
    type: 'broadcast',
    event: 'shared:snapshot',
    payload: buildZombiesRealtimeSharedSnapshot(scene),
  });
  return true;
}

export function maybeBroadcastZombiesRealtimeSharedSnapshot(
  scene: ZombiesRealtimeSharedSnapshotSource & {
    channel: ZombiesRealtimeScene['channel'];
    lastSharedSnapshotSentAt: number;
  },
  options?: {
    force?: boolean;
    minIntervalMs?: number;
  },
) {
  if (!scene.isSharedRunHost() || !scene.channel) return false;
  const force = options?.force === true;
  const minIntervalMs = options?.minIntervalMs ?? 110;
  if (!force && scene.time.now - scene.lastSharedSnapshotSentAt < minIntervalMs) return false;
  scene.lastSharedSnapshotSentAt = scene.time.now;
  return broadcastZombiesRealtimeSharedSnapshot(scene);
}

export function parseZombiesRealtimeSharedSnapshot(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const snapshot = payload as Partial<ZombiesRealtimeSharedSnapshot>;
  if (!snapshot.host_id) return null;
  return snapshot as ZombiesRealtimeSharedSnapshot;
}

export function applyZombiesRealtimeSharedSnapshotState(
  scene: ZombiesRealtimeSharedSnapshotStateScene,
  snapshot: ZombiesRealtimeSharedSnapshot,
) {
  if (!scene.isSharedCoopEnabled() || scene.isSharedRunHost()) return false;
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
    {
      ...player,
      lastDamageAt: player.lastDamageAt ?? 0,
    },
  ])));
  return true;
}

export function applyZombiesRealtimeSharedSnapshotCollections(
  scene: ZombiesRealtimeSharedSnapshotCollectionsScene,
  snapshot: ZombiesRealtimeSharedSnapshot,
) {
  const doorStates = new Map(snapshot.doors.map((door) => [door.id, door.unlocked]));
  for (const door of scene.doors.values()) {
    const unlocked = doorStates.get(door.id) ?? false;
    door.unlocked = unlocked;
    if (unlocked) {
      door.panel.setFillStyle(0x1A3525, 0.88);
      door.panel.setStrokeStyle(2, 0x39FF14, 0.72);
      door.label.setText('ABIERTO');
      door.label.setColor('#9EFFB7');
      door.costText.setText('ACCESO');
      door.costText.setColor('#39FF14');
      door.rect = undefined;
    }
  }
  scene.updateDepthsAccessVisual();

  const nextNodes = new Map(snapshot.spawnNodes.map((node) => [node.id, node]));
  for (const node of scene.spawnNodes.values()) {
    const next = nextNodes.get(node.id);
    if (!next) continue;
    node.occupiedBy = next.occupiedBy;
    node.boardHealth = next.boardHealth;
    node.lastUsedAt = scene.time.now - next.lastUsedAgoMs;
    scene.refreshSpawnNodeVisual(node, 0, Boolean(next.occupiedBy));
  }

  const seenZombies = new Set<string>();
  for (const snapshotZombie of snapshot.zombies) {
    seenZombies.add(snapshotZombie.id);
    let zombie: ZombiesRealtimeZombieEntity | undefined = scene.zombies.get(snapshotZombie.id);
    if (!zombie) {
      const nextZombie = scene.createZombieEntity({
        ...snapshotZombie,
        breachEndsAt: scene.time.now + snapshotZombie.breachInMs,
        lastAttackAt: scene.time.now - Math.max(0, snapshotZombie.attackCooldownMs - snapshotZombie.attackCooldownLeftMs),
        lastSpecialAt: scene.time.now - Math.max(0, 1500 - snapshotZombie.specialCooldownLeftMs),
        lastStompAt: scene.time.now - Math.max(0, 220 - snapshotZombie.stompCooldownLeftMs),
      });
      scene.zombies.set(snapshotZombie.id, nextZombie);
      zombie = nextZombie;
    }
    if (!zombie) continue;
    zombie.type = snapshotZombie.type;
    zombie.assetFolder = snapshotZombie.assetFolder;
    zombie.displayLabel = snapshotZombie.displayLabel;
    zombie.isBoss = snapshotZombie.isBoss;
    zombie.x = snapshotZombie.x;
    zombie.y = snapshotZombie.y;
    zombie.hp = snapshotZombie.hp;
    zombie.maxHp = snapshotZombie.maxHp;
    zombie.speed = snapshotZombie.speed;
    zombie.damage = snapshotZombie.damage;
    zombie.attackRange = snapshotZombie.attackRange;
    zombie.attackCooldownMs = snapshotZombie.attackCooldownMs;
    zombie.hitReward = snapshotZombie.hitReward;
    zombie.killReward = snapshotZombie.killReward;
    zombie.radius = snapshotZombie.radius;
    zombie.state = snapshotZombie.state;
    zombie.phase = snapshotZombie.phase;
    zombie.alive = snapshotZombie.alive;
    zombie.spawnNodeId = snapshotZombie.spawnNodeId;
    zombie.breachEndsAt = scene.time.now + snapshotZombie.breachInMs;
    zombie.lastAttackAt = scene.time.now - Math.max(0, snapshotZombie.attackCooldownMs - snapshotZombie.attackCooldownLeftMs);
    zombie.lastSpecialAt = scene.time.now - Math.max(0, 1500 - snapshotZombie.specialCooldownLeftMs);
    zombie.lastStompAt = scene.time.now - Math.max(0, 220 - snapshotZombie.stompCooldownLeftMs);
    zombie.container.setPosition(zombie.x, zombie.y);
    zombie.shadow.setPosition(zombie.x, zombie.y + zombie.radius + 8);
    zombie.container.setDepth(Math.floor(zombie.y / 10));
    zombie.shadow.setDepth(zombie.container.depth - 1);
    scene.renderZombieHp(zombie);
    scene.setZombieState(zombie, zombie.state);
  }

  for (const zombie of [...scene.zombies.values()]) {
    if (seenZombies.has(zombie.id)) continue;
    scene.safeDestroyZombieVisual(zombie);
    scene.zombies.delete(zombie.id);
  }

  const seenProjectiles = new Set<string>();
  for (const snapshotProjectile of snapshot.projectiles) {
    seenProjectiles.add(snapshotProjectile.id);
    let projectile: ZombiesRealtimeZombieProjectileEntity | undefined = scene.zombieProjectiles.get(snapshotProjectile.id);
    if (!projectile) {
      const nextProjectile = scene.createZombieProjectileEntity({
        ...snapshotProjectile,
        expiresAt: scene.time.now + snapshotProjectile.expiresInMs,
      });
      scene.zombieProjectiles.set(snapshotProjectile.id, nextProjectile);
      projectile = nextProjectile;
    }
    if (!projectile) continue;
    projectile.x = snapshotProjectile.x;
    projectile.y = snapshotProjectile.y;
    projectile.vx = snapshotProjectile.vx;
    projectile.vy = snapshotProjectile.vy;
    projectile.damage = snapshotProjectile.damage;
    projectile.radius = snapshotProjectile.radius;
    projectile.expiresAt = scene.time.now + snapshotProjectile.expiresInMs;
    projectile.body.setPosition(projectile.x, projectile.y);
    projectile.glow.setPosition(projectile.x, projectile.y);
  }

  for (const projectile of [...scene.zombieProjectiles.values()]) {
    if (seenProjectiles.has(projectile.id)) continue;
    scene.destroyZombieProjectile(projectile.id);
  }

  syncZombiesPickupsFromSnapshots({
    add: scene.add,
    pickups: scene.pickups,
    time: scene.time,
    tweens: scene.tweens,
  }, snapshot.pickups);

  scene.applySharedPlayerStateToLocal();
  return true;
}

export function handleZombiesRealtimeSharedSnapshot(
  scene: ZombiesRealtimeSharedSnapshotCollectionsScene,
  payload: unknown,
) {
  const snapshot = parseZombiesRealtimeSharedSnapshot(payload);
  if (!snapshot) return null;
  if (!applyZombiesRealtimeSharedSnapshotState(scene, snapshot)) return false;
  return applyZombiesRealtimeSharedSnapshotCollections(scene, snapshot);
}

export function applyZombiesRealtimeSharedSnapshotAdapterState(
  target: Pick<
    ZombiesRealtimeSharedSnapshotStateScene,
    | 'bossAlive'
    | 'bossRoundActive'
    | 'bossSpawnedThisRound'
    | 'boxRollingUntil'
    | 'depthsUnlocked'
    | 'doublePointsUntil'
    | 'mysteryBoxCooldownUntil'
    | 'nextSpawnAt'
    | 'pickupIdSeq'
    | 'points'
    | 'round'
    | 'roundBreakUntil'
    | 'roundTarget'
    | 'sharedRunHostId'
    | 'sharedRunPlayers'
    | 'spawnedThisRound'
    | 'zombieIdSeq'
    | 'zombieProjectileSeq'
  >,
  source: Pick<
    ZombiesRealtimeSharedSnapshotStateScene,
    | 'bossAlive'
    | 'bossRoundActive'
    | 'bossSpawnedThisRound'
    | 'boxRollingUntil'
    | 'depthsUnlocked'
    | 'doublePointsUntil'
    | 'mysteryBoxCooldownUntil'
    | 'nextSpawnAt'
    | 'pickupIdSeq'
    | 'points'
    | 'round'
    | 'roundBreakUntil'
    | 'roundTarget'
    | 'sharedRunHostId'
    | 'sharedRunPlayers'
    | 'spawnedThisRound'
    | 'zombieIdSeq'
    | 'zombieProjectileSeq'
  >,
) {
  target.bossAlive = source.bossAlive;
  target.bossRoundActive = source.bossRoundActive;
  target.bossSpawnedThisRound = source.bossSpawnedThisRound;
  target.boxRollingUntil = source.boxRollingUntil;
  target.depthsUnlocked = source.depthsUnlocked;
  target.doublePointsUntil = source.doublePointsUntil;
  target.mysteryBoxCooldownUntil = source.mysteryBoxCooldownUntil;
  target.nextSpawnAt = source.nextSpawnAt;
  target.pickupIdSeq = source.pickupIdSeq;
  target.points = source.points;
  target.round = source.round;
  target.roundBreakUntil = source.roundBreakUntil;
  target.roundTarget = source.roundTarget;
  target.sharedRunHostId = source.sharedRunHostId;
  target.sharedRunPlayers = source.sharedRunPlayers;
  target.spawnedThisRound = source.spawnedThisRound;
  target.zombieIdSeq = source.zombieIdSeq;
  target.zombieProjectileSeq = source.zombieProjectileSeq;
}

export function handleRealtimeRemoteLeave(
  scene: Pick<ZombiesRealtimeScene, 'remotePlayers' | 'sharedRunPlayers' | 'isSharedRunHost' | 'maybeScheduleSharedReset'> & {
    lastSharedSnapshotSentAt?: number;
  },
  playerId: string,
) {
  const remote = scene.remotePlayers.get(playerId);
  if (!remote) return;
  remote.avatar.destroy();
  remote.nameplate.destroy();
  scene.remotePlayers.delete(playerId);
  scene.sharedRunPlayers.delete(playerId);
  if (scene.isSharedRunHost()) {
    if (typeof scene.lastSharedSnapshotSentAt === 'number') {
      scene.lastSharedSnapshotSentAt = 0;
    }
    scene.maybeScheduleSharedReset();
  }
}

export function bindZombiesChatBridge(
  scene: Pick<ZombiesRealtimeScene, 'cleanupFns' | 'chatSystem' | 'playerId' | 'px' | 'py' | 'remotePlayers' | 'readStringField'>,
) {
  const cleanup = eventBus.on(EVENTS.CHAT_RECEIVED, (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const playerId = scene.readStringField(payload, 'playerId', 'player_id');
    const message = scene.readStringField(payload, 'message');
    if (!playerId || !message) return;

    if (playerId === scene.playerId) {
      scene.chatSystem?.showBubble('__player__', message, scene.px, scene.py, true);
      return;
    }

    const remote = scene.remotePlayers.get(playerId);
    if (!remote) return;
    scene.chatSystem?.showBubble(playerId, message, remote.x, remote.y, false);
  });

  scene.cleanupFns.push(cleanup);
  return cleanup;
}

export function bindRealtimeChannelHandlers(
  scene: Pick<
    ZombiesRealtimeScene,
    | 'channel'
    | 'isSharedCoopEnabled'
    | 'playerId'
    | 'playerUsername'
    | 'px'
    | 'py'
    | 'lastMoveDx'
    | 'lastMoveDy'
    | 'lastIsMoving'
    | 'avatarConfig'
  >,
  channel: ZombiesRealtimeChannel,
  handlers: {
    onPresenceSync: () => void;
    onRemoteState: (payload: unknown) => void;
    onRemoteLeave: (payload: unknown) => void;
    onSharedSnapshot?: (payload: unknown) => void;
    onSharedShot?: (payload: unknown) => void;
    onSharedInteract?: (payload: unknown) => void;
    onSharedWeapon?: (payload: unknown) => void;
    onSharedMaxAmmo?: () => void;
    onSharedReset?: () => void;
  },
) {
  channel
    .on('presence', { event: 'sync' }, () => {
      handlers.onPresenceSync();
    })
    .on('broadcast', { event: 'player:join' }, ({ payload }) => {
      handlers.onRemoteState(payload);
    })
    .on('broadcast', { event: 'player:move' }, ({ payload }) => {
      handlers.onRemoteState(payload);
    })
    .on('broadcast', { event: 'player:leave' }, ({ payload }) => {
      handlers.onRemoteLeave(payload);
    })
    .on('broadcast', { event: 'shared:snapshot' }, ({ payload }) => {
      handlers.onSharedSnapshot?.(payload);
    })
    .on('broadcast', { event: 'shared:shot' }, ({ payload }) => {
      handlers.onSharedShot?.(payload);
    })
    .on('broadcast', { event: 'shared:interact' }, ({ payload }) => {
      handlers.onSharedInteract?.(payload);
    })
    .on('broadcast', { event: 'shared:weapon' }, ({ payload }) => {
      handlers.onSharedWeapon?.(payload);
    })
    .on('broadcast', { event: 'shared:max_ammo' }, () => {
      handlers.onSharedMaxAmmo?.();
    })
    .on('broadcast', { event: 'shared:reset' }, () => {
      handlers.onSharedReset?.();
    })
    .subscribe(() => {
      if (scene.isSharedCoopEnabled() && channel.track) {
        channel.track(buildRealtimePresencePayload(scene)).catch(() => undefined);
      }
      broadcastRealtimeSelfState(scene, 'player:join');
    });

  return channel;
}

export function setupZombiesRealtimeBridge(
  scene: Pick<
    ZombiesRealtimeScene,
    | 'channel'
    | 'isSharedCoopEnabled'
    | 'playerId'
    | 'playerUsername'
    | 'px'
    | 'py'
    | 'lastMoveDx'
    | 'lastMoveDy'
    | 'lastIsMoving'
    | 'avatarConfig'
  >,
  channel: ZombiesRealtimeChannel,
  handlers: Parameters<typeof bindRealtimeChannelHandlers>[2],
) {
  return bindRealtimeChannelHandlers(scene, channel, handlers);
}

export function connectZombiesRealtimeChannel(
  scene: Pick<
    ZombiesRealtimeScene,
    | 'channel'
    | 'isSharedCoopEnabled'
    | 'playerId'
    | 'playerUsername'
    | 'px'
    | 'py'
    | 'lastMoveDx'
    | 'lastMoveDy'
    | 'lastIsMoving'
    | 'avatarConfig'
  >,
  channel: ZombiesRealtimeChannel,
  handlers: Parameters<typeof bindRealtimeChannelHandlers>[2],
) {
  return setupZombiesRealtimeBridge(scene, channel, handlers);
}

export function syncZombiesRealtimePresenceState(
  scene: Pick<ZombiesRealtimeScene, 'isSharedCoopEnabled' | 'channel' | 'sharedRunPlayers' | 'px' | 'py'> & {
    sharedRunHostId: string | null;
    lastSharedSnapshotSentAt: number;
    isSharedRunHost: () => boolean;
  },
  presence: Record<string, Array<{ player_id?: string; username?: string; joined_at?: number }>>,
) {
  if (!scene.isSharedCoopEnabled() || !scene.channel) return false;

  const players = new Map<string, ZombiesRealtimeSharedPlayerState>();
  for (const entries of Object.values(presence)) {
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

  if (scene.isSharedRunHost()) {
    scene.lastSharedSnapshotSentAt = 0;
  }

  return true;
}

export function teardownZombiesRealtimeChannel(
  scene: Pick<ZombiesRealtimeScene, 'channel' | 'playerId'>,
) {
  if (!scene.channel) return false;
  scene.channel.send({
    type: 'broadcast',
    event: 'player:leave',
    payload: buildRealtimeLeavePayload(scene),
  });
  scene.channel.unsubscribe?.();
  scene.channel = null;
  return true;
}

export function teardownZombiesRealtimeSession(
  scene: Pick<ZombiesRealtimeScene, 'channel' | 'playerId' | 'remotePlayers'>,
) {
  const hadChannel = teardownZombiesRealtimeChannel(scene);
  for (const remote of scene.remotePlayers.values()) {
    remote.avatar.destroy();
    remote.nameplate.destroy();
  }
  scene.remotePlayers.clear();
  return hadChannel;
}

export type ZombiesRealtimeSharedShotPayload = {
  player_id: string;
  username: string;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  pellets: number;
  spread: number;
  range: number;
  damage: number;
  color: number;
};

export type ZombiesRealtimeSharedShotScene = Pick<
  ZombiesRealtimeScene,
  'channel' | 'isSharedCoopEnabled' | 'playerId' | 'playerUsername' | 'px' | 'py'
> & {
  fireShotBurst: (
    playerId: string,
    username: string,
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weapon: unknown,
    isHost: boolean,
  ) => void;
  isSharedRunHost: () => boolean;
};

export function broadcastZombiesRealtimeSharedShot(
  scene: Pick<ZombiesRealtimeSharedShotScene, 'channel' | 'isSharedCoopEnabled'>,
  payload: ZombiesRealtimeSharedShotPayload,
) {
  if (!scene.isSharedCoopEnabled() || !scene.channel) return false;
  scene.channel.send({
    type: 'broadcast',
    event: 'shared:shot',
    payload,
  });
  return true;
}

export function handleZombiesRealtimeSharedShot(
  scene: ZombiesRealtimeSharedShotScene,
  payload: unknown,
) {
  if (!scene.isSharedCoopEnabled() || !payload || typeof payload !== 'object') return false;
  const shot = payload as Partial<ZombiesRealtimeSharedShotPayload>;
  if (!shot.player_id || shot.player_id === scene.playerId) return false;
  scene.fireShotBurst(
    shot.player_id,
    shot.username ?? 'waspi_guest',
    shot.originX ?? scene.px,
    shot.originY ?? scene.py,
    shot.targetX ?? scene.px,
    shot.targetY ?? scene.py,
    shot,
    scene.isSharedRunHost(),
  );
  return true;
}

export type ZombiesRealtimeSharedInteractPayload = {
  player_id: string;
  kind: 'door' | 'box' | 'upgrade' | 'repair';
  sectionId?: string;
  nodeId?: string;
  weaponId?: string;
  px?: number;
  py?: number;
};

export type ZombiesRealtimeSharedInteractScene = Pick<
  ZombiesRealtimeScene,
  'channel' | 'isSharedCoopEnabled' | 'playerId' | 'px' | 'py'
> & {
  isSharedRunHost: () => boolean;
  sharedRunPlayers: Map<string, ZombiesRealtimeSharedPlayerState>;
  doors: Map<string, {
    id: string;
    unlocked: boolean;
    rect?: Phaser.Geom.Rectangle;
  }>;
  spawnNodes: Map<string, {
    id: string;
    x: number;
    y: number;
  }>;
  lastSharedSnapshotSentAt?: number;
  tryUnlockDoor: (sectionId: string) => void;
  tryRepairBarricade: (nodeId: string) => void;
  rollSharedMysteryBoxForPlayer: (playerId: string) => void;
  upgradeSharedWeaponForPlayer: (playerId: string, weaponId: string) => void;
};

export function broadcastZombiesRealtimeSharedInteract(
  scene: Pick<ZombiesRealtimeSharedInteractScene, 'channel' | 'isSharedCoopEnabled'>,
  payload: ZombiesRealtimeSharedInteractPayload,
) {
  if (!scene.isSharedCoopEnabled() || !scene.channel) return false;
  scene.channel.send({
    type: 'broadcast',
    event: 'shared:interact',
    payload,
  });
  return true;
}

export function handleZombiesRealtimeSharedInteractRequest(
  scene: ZombiesRealtimeSharedInteractScene,
  payload: unknown,
) {
  if (!scene.isSharedRunHost() || !payload || typeof payload !== 'object') return false;
  const request = payload as Partial<ZombiesRealtimeSharedInteractPayload>;
  if (!request.player_id) return false;

  const actor = scene.sharedRunPlayers.get(request.player_id);
  if (!actor || !actor.alive) return false;

  const ax = request.px ?? actor.x;
  const ay = request.py ?? actor.y;

  if (request.kind === 'door' && request.sectionId) {
    const door = scene.doors.get(request.sectionId);
    if (!door?.rect || door.unlocked) return false;
    const expandedDoor = new Phaser.Geom.Rectangle(door.rect.x - 35, door.rect.y - 35, door.rect.width + 70, door.rect.height + 70);
    if (!Phaser.Geom.Rectangle.Contains(expandedDoor, ax, ay)) return false;
    scene.tryUnlockDoor(request.sectionId);
    scene.lastSharedSnapshotSentAt = 0;
    return true;
  }

  if (request.kind === 'repair' && request.nodeId) {
    const node = scene.spawnNodes.get(request.nodeId);
    if (!node || Phaser.Math.Distance.Between(ax, ay, node.x, node.y) > 78) return false;
    scene.tryRepairBarricade(request.nodeId);
    scene.lastSharedSnapshotSentAt = 0;
    return true;
  }

  if (request.kind === 'box') {
    if (Phaser.Math.Distance.Between(ax, ay, 435, 698) > 74) return false;
    scene.rollSharedMysteryBoxForPlayer(request.player_id);
    return true;
  }

  if (request.kind === 'upgrade' && request.weaponId) {
    if (Phaser.Math.Distance.Between(ax, ay, 1278, 610) > 76) return false;
    scene.upgradeSharedWeaponForPlayer(request.player_id, request.weaponId);
    return true;
  }

  return false;
}

export type ZombiesRealtimeSharedWeaponGrantPayload = {
  player_id: string;
  kind: 'notice' | 'box' | 'upgrade';
  ok: boolean;
  message?: string;
  weaponId?: string;
};

export type ZombiesRealtimeSharedWeaponGrantScene = Pick<
  ZombiesRealtimeScene,
  'channel' | 'isSharedCoopEnabled' | 'playerId'
> & {
  weaponInventory: Record<string, {
    owned: boolean;
    ammoInMag: number;
    reserveAmmo: number;
    upgraded: boolean;
  }>;
  weaponOrder: string[];
  currentWeapon: string;
  getWeaponStats: (weaponId: string) => {
    magazineSize: number;
    reserveAmmo: number;
    displayLabel: string;
  };
  showNotice: (text: string, color: string) => void;
};

export function broadcastZombiesRealtimeSharedWeaponGrant(
  scene: Pick<ZombiesRealtimeSharedWeaponGrantScene, 'channel' | 'isSharedCoopEnabled'>,
  payload: ZombiesRealtimeSharedWeaponGrantPayload,
) {
  if (!scene.isSharedCoopEnabled() || !scene.channel) return false;
  scene.channel.send({
    type: 'broadcast',
    event: 'shared:weapon',
    payload,
  });
  return true;
}

export function applyZombiesRealtimeSharedWeaponGrant(
  scene: ZombiesRealtimeSharedWeaponGrantScene,
  payload: ZombiesRealtimeSharedWeaponGrantPayload,
) {
  if (payload.player_id !== scene.playerId) return false;
  if (!payload.ok) {
    if (payload.message) scene.showNotice(payload.message, '#FF6A6A');
    return true;
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
  return true;
}

export function handleZombiesRealtimeSharedWeaponGrant(
  scene: ZombiesRealtimeSharedWeaponGrantScene,
  payload: unknown,
) {
  if (!payload || typeof payload !== 'object') return false;
  const grant = payload as Partial<ZombiesRealtimeSharedWeaponGrantPayload>;
  if (!grant.player_id || !grant.kind || typeof grant.ok !== 'boolean') return false;
  return applyZombiesRealtimeSharedWeaponGrant(scene, {
    player_id: grant.player_id,
    kind: grant.kind,
    ok: grant.ok,
    message: grant.message,
    weaponId: grant.weaponId,
  });
}

export type ZombiesRealtimeSharedResetScene = Pick<
  ZombiesRealtimeScene,
  'channel' | 'playerId' | 'time' | 'sharedRunPlayers' | 'isSharedRunHost'
> & {
  sharedResetPending: boolean;
  showNotice: (text: string, color: string) => void;
  restartRun: () => void;
};

export function scheduleZombiesRealtimeSharedReset(
  scene: ZombiesRealtimeSharedResetScene,
) {
  if (!scene.isSharedRunHost() || scene.sharedResetPending) return false;
  if ([...scene.sharedRunPlayers.values()].some((player) => player.alive)) return false;

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
  return true;
}

export function handleZombiesRealtimeSharedReset(
  scene: Pick<ZombiesRealtimeSharedResetScene, 'restartRun'>,
) {
  scene.restartRun();
  return true;
}
