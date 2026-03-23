import Phaser from 'phaser';
import { type ZombiesWeaponId } from '../../config/zombies';

export type ZombiesPickupKind = 'max_ammo' | 'insta_kill' | 'double_points' | 'nuke';

export type ZombiesPickupState = {
  id: string;
  kind: ZombiesPickupKind;
  x: number;
  y: number;
  glow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  expiresAt: number;
};

export type ZombiesPickupWeaponInventoryEntry = {
  ammoInMag: number;
  owned: boolean;
  reserveAmmo: number;
  upgraded: boolean;
};

export type ZombiesPickupSharedTarget = {
  id?: string;
  x: number;
  y: number;
};

export type ZombiesSharedPickupSnapshot = {
  id: string;
  kind: ZombiesPickupKind;
  x: number;
  y: number;
  expiresInMs: number;
};

export type ZombiesPickupSceneLike = Phaser.Scene & {
  pickupIdSeq: number;
  pickups: Map<string, ZombiesPickupState>;
  time: Phaser.Time.Clock;
  tweens: Phaser.Tweens.TweenManager;
  add: Phaser.GameObjects.GameObjectFactory;
  weaponOrder: ZombiesWeaponId[];
  weaponInventory: Record<ZombiesWeaponId, ZombiesPickupWeaponInventoryEntry>;
  instaKillUntil: number;
  doublePointsUntil: number;
  isSharedRunHost: () => boolean;
  broadcastSharedMaxAmmo: () => void;
  getWeaponStats: (weaponId: ZombiesWeaponId) => {
    magazineSize: number;
    reserveAmmo: number;
    displayLabel: string;
  };
  getAliveSharedTargets: () => ZombiesPickupSharedTarget[];
  showNotice: (text: string, color: string) => void;
  showPowerupBanner: (text: string, color: string) => void;
  showFloatingText: (text: string, x: number, y: number, color: string) => void;
  triggerNuke: () => void;
};

export type ZombiesPickupEntitySnapshot = Omit<ZombiesPickupState, 'glow' | 'body' | 'label'>;

type ZombiesPickupVisualScene = Pick<ZombiesPickupSceneLike, 'add' | 'tweens'>;
type ZombiesPickupStorageScene = Pick<ZombiesPickupSceneLike, 'pickups'>;
type ZombiesPickupApplyScene = Pick<ZombiesPickupSceneLike, 'pickups' | 'time'> & ZombiesPickupVisualScene;

export type ZombiesPickupStepResult = {
  collected: ZombiesPickupState[];
  snapshots: ZombiesSharedPickupSnapshot[];
};

export type ZombiesPickupHostCycleResult = {
  collected: ZombiesPickupState[];
  snapshots: ZombiesSharedPickupSnapshot[] | null;
};

export type ZombiesPickupDropCycleResult = ZombiesPickupHostCycleResult & {
  dropped: ReturnType<typeof trySpawnZombiesPickupDrop>;
};

export type ZombiesPickupRuntimeState = Pick<
  ZombiesPickupSceneLike,
  'doublePointsUntil' | 'instaKillUntil' | 'pickupIdSeq'
>;

export type ZombiesPickupSceneAdapterState = Pick<
  ZombiesPickupSceneLike,
  'add' | 'doublePointsUntil' | 'instaKillUntil' | 'pickupIdSeq' | 'pickups' | 'time' | 'tweens' | 'weaponInventory' | 'weaponOrder'
>;

export type ZombiesPickupSceneAdapterBindings = Pick<
  ZombiesPickupSceneLike,
  'broadcastSharedMaxAmmo' | 'getAliveSharedTargets' | 'getWeaponStats' | 'isSharedRunHost' | 'showFloatingText' | 'showNotice' | 'showPowerupBanner' | 'triggerNuke'
>;

const ZOMBIES_PICKUP_MAX_ACTIVE = 2;
const ZOMBIES_PICKUP_EXPIRES_MS = 12_000;
const ZOMBIES_PICKUP_MAX_AMMO_CHANCE = 0.035;
const ZOMBIES_PICKUP_INSTA_KILL_CHANCE = 0.052;
const ZOMBIES_PICKUP_DOUBLE_POINTS_CHANCE = 0.07;
const ZOMBIES_PICKUP_NUKE_CHANCE = 0.08;
const ZOMBIES_PICKUP_MAX_AMMO_RADIUS = 34;

export function applyMaxAmmoToZombiesLoadout(scene: Pick<
  ZombiesPickupSceneLike,
  'weaponOrder' | 'weaponInventory' | 'getWeaponStats'
>) {
  for (const weaponId of scene.weaponOrder) {
    const weapon = scene.getWeaponStats(weaponId);
    const ammo = scene.weaponInventory[weaponId];
    ammo.ammoInMag = weapon.magazineSize;
    ammo.reserveAmmo = Math.max(ammo.reserveAmmo, weapon.reserveAmmo);
  }
}

export function applySharedMaxAmmoToZombiesLoadout(scene: Pick<
  ZombiesPickupSceneLike,
  'weaponOrder' | 'weaponInventory' | 'getWeaponStats'
>) {
  applyMaxAmmoToZombiesLoadout(scene);
}

export function findZombiesPickupCollector(
  scene: Pick<ZombiesPickupSceneLike, 'getAliveSharedTargets'>,
  pickup: Pick<ZombiesPickupState, 'x' | 'y'>,
) {
  return scene.getAliveSharedTargets().find((player) =>
    Phaser.Math.Distance.Between(player.x, player.y, pickup.x, pickup.y) <= ZOMBIES_PICKUP_MAX_AMMO_RADIUS
  ) ?? null;
}

export function spawnZombiesPickup(scene: ZombiesPickupSceneLike, x: number, y: number) {
  if (scene.pickups.size >= ZOMBIES_PICKUP_MAX_ACTIVE) return null;

  const dropRoll = Phaser.Math.FloatBetween(0, 1);
  const kind = rollZombiesPickupKind(dropRoll);
  if (!kind) return null;

  const glowColor = getZombiesPickupGlowColor(kind);
  const labelColor = getZombiesPickupLabelColor(kind);
  const labelText = getZombiesPickupLabelText(kind);
  const id = `pickup_${++scene.pickupIdSeq}`;
  const pickup = createZombiesPickupEntity(scene, {
    id,
    kind,
    x,
    y,
    expiresAt: scene.time.now + ZOMBIES_PICKUP_EXPIRES_MS,
  }, glowColor, labelColor, labelText);

  scene.pickups.set(id, pickup);
  return pickup;
}

export function trySpawnZombiesPickupDrop(
  scene: ZombiesPickupSceneLike,
  x: number,
  y: number,
) {
  const pickup = spawnZombiesPickup(scene, x, y);
  if (!pickup) return null;
  return {
    pickup,
    snapshot: buildZombiesPickupSnapshot(scene, pickup),
  };
}

export function createZombiesPickupEntity(
  scene: ZombiesPickupVisualScene,
  snapshot: ZombiesPickupEntitySnapshot,
  glowColor: number,
  labelColor: string,
  labelText: string,
) {
  const glow = scene.add.ellipse(snapshot.x, snapshot.y + 6, 52, 20, glowColor, 0.12).setDepth(90);
  glow.setStrokeStyle(1, glowColor, 0.45);
  const body = scene.add.rectangle(snapshot.x, snapshot.y - 8, 24, 24, glowColor, 0.8).setDepth(91);
  body.setStrokeStyle(2, 0xffffff, 0.7);
  const label = scene.add.text(snapshot.x, snapshot.y - 32, labelText, {
    fontSize: '6px',
    fontFamily: '"Press Start 2P", monospace',
    color: labelColor,
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(92);

  scene.tweens.add({
    targets: [glow, body],
    alpha: { from: 0.82, to: 1 },
    scaleX: { from: 0.96, to: 1.05 },
    scaleY: { from: 0.96, to: 1.05 },
    yoyo: true,
    repeat: -1,
    duration: 620,
    ease: 'Sine.easeInOut',
  });

  return {
    ...snapshot,
    glow,
    body,
    label,
  };
}

export function updateZombiesPickups(scene: ZombiesPickupSceneLike) {
  return stepZombiesPickups(scene);
}

export function stepZombiesPickups(scene: ZombiesPickupSceneLike) {
  const collected: ZombiesPickupState[] = [];
  for (const pickup of [...scene.pickups.values()]) {
    const pulse = Math.sin(scene.time.now / 140 + pickup.x * 0.01) * 3;
    pickup.body.setY(pickup.y - 8 + pulse);
    pickup.label.setY(pickup.y - 32 + pulse * 0.5);
    pickup.glow.setY(pickup.y + 6);

    if (scene.time.now >= pickup.expiresAt) {
      destroyZombiesPickup(scene, pickup.id);
      continue;
    }

    const collector = findZombiesPickupCollector(scene, pickup);
    if (collector) {
      applyZombiesPickupEffect(scene, pickup);
      collected.push(pickup);
    }
  }
  return collected;
}

export function stepZombiesPickupsWithSnapshots(
  scene: ZombiesPickupSceneLike,
): ZombiesPickupStepResult {
  const collected = stepZombiesPickups(scene);
  return {
    collected,
    snapshots: buildZombiesPickupSnapshots(scene),
  };
}

export function applyZombiesPickupEffect(scene: ZombiesPickupSceneLike, pickup: ZombiesPickupState) {
  if (pickup.kind === 'max_ammo') {
    applyMaxAmmoToZombiesLoadout(scene);
    if (scene.isSharedRunHost()) {
      scene.broadcastSharedMaxAmmo();
    }
    scene.showNotice('MAX AMMO', '#46B3FF');
  } else if (pickup.kind === 'insta_kill') {
    scene.showNotice('INSTA-KILL', '#FF6A6A');
    scene.showPowerupBanner('INSTA KILL', '#FF6A6A');
    setZombiesPickupTimer(scene, 'instaKillUntil', 12_000);
  } else if (pickup.kind === 'double_points') {
    scene.showNotice('DOUBLE POINTS', '#F5C842');
    scene.showPowerupBanner('DOUBLE POINTS', '#F5C842');
    setZombiesPickupTimer(scene, 'doublePointsUntil', 15_000);
  } else if (pickup.kind === 'nuke') {
    scene.triggerNuke();
    scene.showNotice('NUKE', '#9BFF4F');
  }

  const pickupLabel = getZombiesPickupLabelText(pickup.kind);
  const pickupColor = getZombiesPickupLabelColor(pickup.kind);
  scene.showFloatingText(pickupLabel, pickup.x, pickup.y - 26, pickupColor);
  destroyZombiesPickup(scene, pickup.id);
}

export function collectZombiesPickup(
  scene: ZombiesPickupSceneLike,
  pickup: ZombiesPickupState,
) {
  applyZombiesPickupEffect(scene, pickup);
  return pickup;
}

export function collectZombiesPickupById(
  scene: ZombiesPickupSceneLike,
  pickupId: string,
) {
  const pickup = scene.pickups.get(pickupId);
  if (!pickup) return null;
  applyZombiesPickupEffect(scene, pickup);
  return pickup;
}

export function destroyZombiesPickup(scene: ZombiesPickupStorageScene, pickupId: string) {
  const pickup = scene.pickups.get(pickupId);
  if (!pickup) return;
  pickup.glow.destroy();
  pickup.body.destroy();
  pickup.label.destroy();
  scene.pickups.delete(pickupId);
}

export function triggerZombiesNuke(scene: ZombiesPickupSceneLike) {
  scene.triggerNuke();
}

export function buildZombiesPickupSnapshot(
  scene: Pick<ZombiesPickupSceneLike, 'time'>,
  pickup: Pick<ZombiesPickupState, 'id' | 'kind' | 'x' | 'y' | 'expiresAt'>,
): ZombiesSharedPickupSnapshot {
  return {
    id: pickup.id,
    kind: pickup.kind,
    x: pickup.x,
    y: pickup.y,
    expiresInMs: Math.max(0, pickup.expiresAt - scene.time.now),
  };
}

export function buildZombiesPickupSnapshots(
  scene: Pick<ZombiesPickupSceneLike, 'pickups' | 'time'>,
) {
  return [...scene.pickups.values()].map((pickup) => buildZombiesPickupSnapshot(scene, pickup));
}

export function upsertZombiesPickupFromSnapshot(
  scene: ZombiesPickupApplyScene,
  snapshot: ZombiesSharedPickupSnapshot,
) {
  let pickup = scene.pickups.get(snapshot.id);
  const glowColor = getZombiesPickupGlowColor(snapshot.kind);
  const labelColor = getZombiesPickupLabelColor(snapshot.kind);
  const labelText = getZombiesPickupLabelText(snapshot.kind);

  if (!pickup) {
    pickup = createZombiesPickupEntity(scene, {
      id: snapshot.id,
      kind: snapshot.kind,
      x: snapshot.x,
      y: snapshot.y,
      expiresAt: scene.time.now + snapshot.expiresInMs,
    }, glowColor, labelColor, labelText);
    scene.pickups.set(snapshot.id, pickup);
  }

  pickup.kind = snapshot.kind;
  pickup.x = snapshot.x;
  pickup.y = snapshot.y;
  pickup.expiresAt = scene.time.now + snapshot.expiresInMs;
  pickup.body.setPosition(pickup.x, pickup.y - 8);
  pickup.label.setText(labelText);
  pickup.label.setColor(labelColor);
  pickup.label.setPosition(pickup.x, pickup.y - 32);
  pickup.glow.setFillStyle(glowColor, 0.12);
  pickup.glow.setStrokeStyle(1, glowColor, 0.45);
  pickup.glow.setPosition(pickup.x, pickup.y + 6);
  pickup.body.setFillStyle(glowColor, 0.8);

  return pickup;
}

export function syncZombiesPickupsFromSnapshots(
  scene: ZombiesPickupApplyScene & ZombiesPickupStorageScene,
  pickups: ZombiesSharedPickupSnapshot[],
) {
  const seen = new Set<string>();
  for (const snapshot of pickups) {
    seen.add(snapshot.id);
    upsertZombiesPickupFromSnapshot(scene, snapshot);
  }

  for (const pickup of [...scene.pickups.values()]) {
    if (seen.has(pickup.id)) continue;
    destroyZombiesPickup(scene, pickup.id);
  }
}

export function applySharedZombiesPickups(
  scene: Pick<ZombiesPickupSceneLike, 'pickups' | 'time'> & Pick<
    ZombiesPickupSceneLike,
    'weaponOrder' | 'weaponInventory' | 'instaKillUntil' | 'doublePointsUntil' | 'isSharedRunHost' | 'broadcastSharedMaxAmmo' | 'getWeaponStats' | 'getAliveSharedTargets' | 'showNotice' | 'showPowerupBanner' | 'showFloatingText' | 'triggerNuke' | 'pickupIdSeq' | 'tweens' | 'add'
  >,
  pickups: ZombiesSharedPickupSnapshot[],
) {
  syncZombiesPickupsFromSnapshots(scene, pickups);
}

export function syncSharedZombiesPickupsCycle(
  scene: ZombiesPickupSceneLike,
): ZombiesPickupStepResult {
  return stepZombiesPickupsWithSnapshots(scene);
}

export function runZombiesPickupHostCycle(
  scene: Pick<ZombiesPickupSceneLike, 'isSharedRunHost'> & ZombiesPickupSceneLike,
): ZombiesPickupHostCycleResult {
  const collected = stepZombiesPickups(scene);
  return {
    collected,
    snapshots: scene.isSharedRunHost() ? buildZombiesPickupSnapshots(scene) : null,
  };
}

export function runZombiesPickupCycle(
  scene: ZombiesPickupSceneLike,
): ZombiesPickupHostCycleResult {
  return runZombiesPickupHostCycle(scene);
}

export function runZombiesPickupDropCycle(
  scene: ZombiesPickupSceneLike,
  dropAt?: { x: number; y: number } | null,
): ZombiesPickupDropCycleResult {
  const dropped = dropAt ? trySpawnZombiesPickupDrop(scene, dropAt.x, dropAt.y) : null;
  const { collected, snapshots } = runZombiesPickupCycle(scene);
  return {
    dropped,
    collected,
    snapshots,
  };
}

export function syncZombiesPickupRuntimeState(
  target: ZombiesPickupRuntimeState,
  source: ZombiesPickupRuntimeState,
) {
  target.doublePointsUntil = source.doublePointsUntil;
  target.instaKillUntil = source.instaKillUntil;
  target.pickupIdSeq = source.pickupIdSeq;
  return target;
}

export function createZombiesPickupRuntimeState(
  source: Pick<ZombiesPickupRuntimeState, 'doublePointsUntil' | 'instaKillUntil' | 'pickupIdSeq'>,
): ZombiesPickupRuntimeState {
  return {
    doublePointsUntil: source.doublePointsUntil,
    instaKillUntil: source.instaKillUntil,
    pickupIdSeq: source.pickupIdSeq,
  };
}

export function applyZombiesPickupRuntimeState(
  target: Pick<ZombiesPickupRuntimeState, 'doublePointsUntil' | 'instaKillUntil' | 'pickupIdSeq'>,
  source: ZombiesPickupRuntimeState,
) {
  target.doublePointsUntil = source.doublePointsUntil;
  target.instaKillUntil = source.instaKillUntil;
  target.pickupIdSeq = source.pickupIdSeq;
  return target;
}

export function createZombiesPickupSceneAdapter(
  state: ZombiesPickupSceneAdapterState,
  bindings: ZombiesPickupSceneAdapterBindings,
) {
  return {
    ...state,
    ...bindings,
  } as unknown as ZombiesPickupSceneLike;
}

export function runAndSyncZombiesPickupCycle(
  target: ZombiesPickupRuntimeState,
  scene: ZombiesPickupSceneLike,
): ZombiesPickupHostCycleResult {
  const result = runZombiesPickupCycle(scene);
  syncZombiesPickupRuntimeState(target, scene);
  return result;
}

export function rollZombiesPickupKind(dropRoll: number) {
  if (dropRoll <= ZOMBIES_PICKUP_MAX_AMMO_CHANCE) return 'max_ammo';
  if (dropRoll <= ZOMBIES_PICKUP_INSTA_KILL_CHANCE) return 'insta_kill';
  if (dropRoll <= ZOMBIES_PICKUP_DOUBLE_POINTS_CHANCE) return 'double_points';
  if (dropRoll <= ZOMBIES_PICKUP_NUKE_CHANCE) return 'nuke';
  return null;
}

export function getZombiesPickupGlowColor(kind: ZombiesPickupKind) {
  return kind === 'max_ammo'
    ? 0x46B3FF
    : kind === 'insta_kill'
      ? 0xFF3344
      : kind === 'double_points'
        ? 0xF5C842
        : 0x9BFF4F;
}

export function getZombiesPickupLabelColor(kind: ZombiesPickupKind) {
  return kind === 'max_ammo'
    ? '#7CC9FF'
    : kind === 'insta_kill'
      ? '#FF6A6A'
      : kind === 'double_points'
        ? '#FFD36A'
        : '#C9FF89';
}

export function getZombiesPickupLabelText(kind: ZombiesPickupKind) {
  return kind === 'max_ammo'
    ? 'MAX AMMO'
    : kind === 'insta_kill'
      ? 'INSTA-KILL'
      : kind === 'double_points'
        ? 'DOUBLE PTS'
        : 'NUKE';
}

function setZombiesPickupTimer(
  scene: ZombiesPickupSceneLike,
  key: 'instaKillUntil' | 'doublePointsUntil',
  durationMs: number,
) {
  const currentTime = scene.time.now;
  scene[key] = currentTime + durationMs;
}
