import Phaser from 'phaser';
import { AvatarRenderer, type AvatarConfig } from '../../systems/AvatarRenderer';
import { getShootTargetWorld } from '../../systems/shootingAim';
import { SAFE_PLAZA_RETURN } from '../../config/constants';
import { transitionToScene, transitionToWorldScene } from '../../systems/SceneUi';
import { getSkillSystem } from '../../systems/SkillSystem';
import { recordDistanceDelta } from '../../systems/StatsSystem';
import {
  ZOMBIES_PLAYER,
  ZOMBIES_POINTS,
  ZOMBIES_SECTIONS,
  type ZombiesSectionId,
  type ZombiesWeaponId,
} from '../../config/zombies';

export const ZOMBIES_MUZZLE_FORWARD = 20;
export const ZOMBIES_MUZZLE_UP = 12;
export const ZOMBIES_FURIA_DURATION_MS = 10_000;
export const ZOMBIES_FURIA_COOLDOWN_MS = 180_000;
export const ZOMBIES_PLAYER_RETURN = { x: 1600, y: 1540 } as const;
export const ZOMBIES_EXIT_PAD = { x: 182, y: 878, radius: 42 } as const;
export const ZOMBIES_BOX_POS = { x: 435, y: 698 } as const;
export const ZOMBIES_PACK_POS = { x: 1278, y: 610 } as const;
export const ZOMBIES_DEPTHS_PAD = { x: 1586, y: 918, radius: 46 } as const;

export type ZombiesInteractionKind = 'exit' | 'door' | 'box' | 'repair' | 'upgrade' | 'depths';

export type ZombiesInteractionOption = {
  kind: ZombiesInteractionKind;
  x: number;
  y: number;
  radius: number;
  label: string;
  color: number;
  sectionId?: ZombiesSectionId;
  nodeId?: string;
};

export type ZombiesPlayerSceneLike = Phaser.Scene & {
  avatarConfig: AvatarConfig;
  playerId: string;
  playerUsername: string;
  player: AvatarRenderer;
  playerName: Phaser.GameObjects.Text;
  px: number;
  py: number;
  hp: number;
  points: number;
  gameOver: boolean;
  lastMoveDx: number;
  lastMoveDy: number;
  lastIsMoving: boolean;
  lastShotAt: number;
  reloadEndsAt: number;
  boxRollingUntil: number;
  mysteryBoxCooldownUntil: number;
  furiaActive: boolean;
  furiaUntil: number;
  furiaCooldownUntil: number;
  currentWeapon: ZombiesWeaponId;
  weaponOrder: ZombiesWeaponId[];
  weaponInventory: Record<ZombiesWeaponId, {
    owned: boolean;
    ammoInMag: number;
    reserveAmmo: number;
    upgraded: boolean;
  }>;
  activePrompt?: Phaser.GameObjects.Text;
  promptGlow?: Phaser.GameObjects.Graphics;
  furiaHudText?: Phaser.GameObjects.Text;
  noticeText?: Phaser.GameObjects.Text;
  powerupBanner?: Phaser.GameObjects.Text;
  reticle?: Phaser.GameObjects.Graphics;
  controls: {
    readMovement: (useDeadZone?: boolean) => { dx: number; dy: number };
    isActionDown: (action: 'shoot' | 'interact' | 'back') => boolean;
    isActionJustDown: (action: 'interact' | 'back') => boolean;
  };
  keyW: Phaser.Input.Keyboard.Key;
  keyA: Phaser.Input.Keyboard.Key;
  keyS: Phaser.Input.Keyboard.Key;
  keyD: Phaser.Input.Keyboard.Key;
  keyI: Phaser.Input.Keyboard.Key;
  keyJ: Phaser.Input.Keyboard.Key;
  keyK: Phaser.Input.Keyboard.Key;
  keyL: Phaser.Input.Keyboard.Key;
  keyE: Phaser.Input.Keyboard.Key;
  keyQ: Phaser.Input.Keyboard.Key;
  keyF: Phaser.Input.Keyboard.Key;
  keyR: Phaser.Input.Keyboard.Key;
  keyOne: Phaser.Input.Keyboard.Key;
  keyTwo: Phaser.Input.Keyboard.Key;
  keyThree: Phaser.Input.Keyboard.Key;
  keyFour: Phaser.Input.Keyboard.Key;
  keyFive: Phaser.Input.Keyboard.Key;
  keyEsc: Phaser.Input.Keyboard.Key;
  keySpace: Phaser.Input.Keyboard.Key;
  pointerDownHandler?: (pointer: Phaser.Input.Pointer) => void;
  returnScene: string;
  returnX: number;
  returnY: number;
  entryLabel: string;
  allowDepthsGate: boolean;
  time: Phaser.Time.Clock;
  game: Phaser.Game;
  cameras: Phaser.Cameras.Scene2D.CameraManager;
  input: Phaser.Input.InputPlugin;
  ensureAudioContext?: () => AudioContext | undefined;
  syncLocalSharedPlayerState?: () => void;
  depthsUnlocked: boolean;
  doors: Map<ZombiesSectionId, {
    unlocked: boolean;
    rect?: Phaser.Geom.Rectangle;
    panel: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    costText: Phaser.GameObjects.Text;
    cost: number;
  }>;
  spawnNodes: Map<string, {
    id: string;
    x: number;
    y: number;
    occupiedBy?: string;
    boardHealth: number;
    maxBoards: number;
  }>;
  showNotice: (text: string, color?: string) => void;
  showBossIntro: (text: string) => void;
  renderHud: () => void;
  updatePromptHud: (option: ZombiesInteractionOption | null) => void;
  tryMovePlayer: (nextX: number, nextY: number) => boolean;
  isBlocked: (x: number, y: number, radius: number) => boolean;
  tryReload: () => void;
  cycleWeapon: () => void;
  tryActivateFuria: () => void;
  getWeaponStats: (weaponId: ZombiesWeaponId) => {
    displayLabel: string;
    fireDelayMs: number;
    reloadMs: number;
    magazineSize: number;
    reserveAmmo: number;
    pellets: number;
    spread: number;
    range: number;
    damage: number;
    color: number;
  };
  getPackCost: (weaponId: ZombiesWeaponId) => number;
  fireShotBurst: (
    shooterId: string,
    username: string,
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weapon: {
      pellets: number;
      spread: number;
      range: number;
      damage: number;
      color: number;
    },
    applyDamage: boolean,
  ) => void;
  broadcastSharedShot: (payload: {
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
  }) => void;
  broadcastSharedInteract: (payload: {
    player_id: string;
    kind: ZombiesInteractionKind;
    sectionId?: ZombiesSectionId;
    nodeId?: string;
    weaponId?: ZombiesWeaponId;
    px?: number;
    py?: number;
  }) => void;
  isSharedCoopEnabled: () => boolean;
  isSharedRunHost: () => boolean;
  tryUnlockDoor: (doorId: ZombiesSectionId) => void;
  tryRollMysteryBox: () => void;
  tryUpgradeCurrentWeapon: () => void;
  tryRepairBarricade: (nodeId: string) => void;
  requestExit: () => void;
  enterBasementDepths: () => void;
  handleContextInteraction?: () => void;
  getNearbyInteraction?: () => ZombiesInteractionOption | null;
};

export function setupZombiesPlayer(scene: ZombiesPlayerSceneLike) {
  scene.player = new AvatarRenderer(scene, scene.px, scene.py, scene.avatarConfig);
  scene.player.setDepth(60);
  scene.playerName = scene.add.text(scene.px, scene.py - 44, scene.playerUsername, {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#F5C842',
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5, 1).setDepth(70);
}

export function setupZombiesInput(scene: ZombiesPlayerSceneLike) {
  const keyboard = scene.input.keyboard!;
  scene.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
  scene.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
  scene.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
  scene.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  scene.keyI = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
  scene.keyJ = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
  scene.keyK = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
  scene.keyL = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
  scene.keyE = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  scene.keyQ = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
  scene.keyF = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
  scene.keyR = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  scene.keyOne = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
  scene.keyTwo = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
  scene.keyThree = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
  scene.keyFour = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
  scene.keyFive = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
  scene.keyEsc = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  scene.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

  scene.pointerDownHandler = () => {
    scene.ensureAudioContext?.();
    if (scene.gameOver) return;
    tryShootZombies(scene);
  };
  scene.input.on('pointerdown', scene.pointerDownHandler);
}

export function cleanupZombiesInput(scene: ZombiesPlayerSceneLike) {
  if (!scene.pointerDownHandler) return;
  scene.input.off('pointerdown', scene.pointerDownHandler);
  scene.pointerDownHandler = undefined;
}

export function handleZombiesMovement(scene: ZombiesPlayerSceneLike) {
  let { dx, dy } = scene.controls.readMovement(true);
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
  }

  const speed = ZOMBIES_PLAYER.speed * (scene.reloadEndsAt > scene.time.now ? 0.78 : 1);
  const nextX = scene.px + dx * speed * scene.game.loop.delta / 1000;
  const nextY = scene.py + dy * speed * scene.game.loop.delta / 1000;
  const prevX = scene.px;
  const prevY = scene.py;
  const moved = scene.tryMovePlayer(nextX, nextY);

  if (moved) {
    const dist = Math.hypot(scene.px - prevX, scene.py - prevY);
    if (dist > 0.5) recordDistanceDelta(dist);
  }

  scene.lastIsMoving = moved;
  scene.lastMoveDx = moved ? dx : 0;
  scene.lastMoveDy = moved ? dy : 0;
  scene.syncLocalSharedPlayerState?.();
}

export function tryMoveZombiesPlayer(scene: ZombiesPlayerSceneLike, nextX: number, nextY: number) {
  const radius = ZOMBIES_PLAYER.radius;
  let moved = false;
  if (!scene.isBlocked(nextX, scene.py, radius)) {
    scene.px = nextX;
    moved = true;
  }
  if (!scene.isBlocked(scene.px, nextY, radius)) {
    scene.py = nextY;
    moved = true;
  }
  return moved;
}

export function handleZombiesCombatInput(scene: ZombiesPlayerSceneLike) {
  if (scene.reloadEndsAt > scene.time.now) return;
  if (scene.boxRollingUntil > scene.time.now) return;

  if (scene.controls.isActionDown('shoot')) {
    tryShootZombies(scene);
  }

  if (Phaser.Input.Keyboard.JustDown(scene.keyQ)) {
    scene.cycleWeapon();
  }
  if (Phaser.Input.Keyboard.JustDown(scene.keyF)) {
    scene.tryActivateFuria();
  }
  if (Phaser.Input.Keyboard.JustDown(scene.keyR)) {
    scene.tryReload();
  }

  const directKeys: Array<[Phaser.Input.Keyboard.Key, ZombiesWeaponId]> = [
    [scene.keyOne, 'pistol'],
    [scene.keyTwo, 'shotgun'],
    [scene.keyThree, 'smg'],
    [scene.keyFour, 'rifle'],
    [scene.keyFive, 'raygun'],
  ];
  for (const [key, weaponId] of directKeys) {
    if (Phaser.Input.Keyboard.JustDown(key) && scene.weaponInventory[weaponId].owned) {
      scene.currentWeapon = weaponId;
      scene.showNotice(`ARMADO ${scene.getWeaponStats(weaponId).displayLabel}`, '#7CC9FF');
    }
  }
}

export function getZombiesAimAngle(scene: ZombiesPlayerSceneLike): number {
  const p = scene.input.activePointer;
  const wp = scene.cameras.main.getWorldPoint(p.x, p.y);
  const d = Phaser.Math.Distance.Between(scene.px, scene.py, wp.x, wp.y);
  if (d > 14) return Phaser.Math.Angle.Between(scene.px, scene.py, wp.x, wp.y);
  if (Math.abs(scene.lastMoveDx) + Math.abs(scene.lastMoveDy) > 0.04) {
    return Math.atan2(scene.lastMoveDy, scene.lastMoveDx);
  }
  return -Math.PI / 2;
}

export function tryShootZombies(scene: ZombiesPlayerSceneLike) {
  if (scene.gameOver) return;
  if (scene.reloadEndsAt > scene.time.now) return;
  if (scene.boxRollingUntil > scene.time.now) return;

  const weapon = scene.getWeaponStats(scene.currentWeapon);
  const ammo = scene.weaponInventory[scene.currentWeapon];
  if (scene.time.now - scene.lastShotAt < weapon.fireDelayMs) return;
  if (ammo.ammoInMag <= 0) {
    scene.tryReload();
    return;
  }

  ammo.ammoInMag -= 1;
  scene.lastShotAt = scene.time.now;
  scene.player.playShoot();

  const aim = getZombiesAimAngle(scene);
  const { x: targetX, y: targetY } = getShootTargetWorld(scene, scene.px, scene.py, aim);
  const baseAng = Phaser.Math.Angle.Between(scene.px, scene.py, targetX, targetY);
  const originX = scene.px + Math.cos(baseAng) * ZOMBIES_MUZZLE_FORWARD;
  const originY = scene.py - ZOMBIES_MUZZLE_UP + Math.sin(baseAng) * (ZOMBIES_MUZZLE_FORWARD * 0.35);

  scene.fireShotBurst(
    scene.playerId,
    scene.playerUsername,
    originX,
    originY,
    targetX,
    targetY,
    weapon,
    !scene.isSharedCoopEnabled() || scene.isSharedRunHost(),
  );

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
    scene.time.delayedCall(140, () => scene.tryReload());
  }
}

export function handleZombiesContextInteraction(scene: ZombiesPlayerSceneLike) {
  if (!scene.controls.isActionJustDown('interact')) return;
  const option = scene.getNearbyInteraction ? scene.getNearbyInteraction() : getNearbyZombiesInteraction(scene);
  if (!option) return;

  if (option.kind === 'exit') {
    scene.requestExit();
    return;
  }
  if (option.kind === 'door' && option.sectionId) {
    if (scene.isSharedCoopEnabled() && !scene.isSharedRunHost()) {
      scene.broadcastSharedInteract({ player_id: scene.playerId, kind: 'door', sectionId: option.sectionId, px: scene.px, py: scene.py });
      return;
    }
    scene.tryUnlockDoor(option.sectionId);
    return;
  }
  if (option.kind === 'box') {
    if (scene.isSharedCoopEnabled() && !scene.isSharedRunHost()) {
      scene.broadcastSharedInteract({ player_id: scene.playerId, kind: 'box', px: scene.px, py: scene.py });
      return;
    }
    scene.tryRollMysteryBox();
    return;
  }
  if (option.kind === 'upgrade') {
    if (scene.isSharedCoopEnabled() && !scene.isSharedRunHost()) {
      scene.broadcastSharedInteract({ player_id: scene.playerId, kind: 'upgrade', weaponId: scene.currentWeapon, px: scene.px, py: scene.py });
      return;
    }
    scene.tryUpgradeCurrentWeapon();
    return;
  }
  if (option.kind === 'depths') {
    scene.enterBasementDepths();
    return;
  }

  if (option.kind === 'repair' && option.nodeId) {
    if (scene.isSharedCoopEnabled() && !scene.isSharedRunHost()) {
      scene.broadcastSharedInteract({ player_id: scene.playerId, kind: 'repair', nodeId: option.nodeId });
      return;
    }
    scene.tryRepairBarricade(option.nodeId);
  }
}

export function getNearbyZombiesInteraction(scene: ZombiesPlayerSceneLike): ZombiesInteractionOption | null {
  const options: ZombiesInteractionOption[] = [];

  if (Phaser.Math.Distance.Between(scene.px, scene.py, ZOMBIES_EXIT_PAD.x, ZOMBIES_EXIT_PAD.y) <= ZOMBIES_EXIT_PAD.radius + 24) {
    options.push({ kind: 'exit', x: ZOMBIES_EXIT_PAD.x, y: ZOMBIES_EXIT_PAD.y, radius: ZOMBIES_EXIT_PAD.radius + 18, label: `E VOLVER A ${scene.entryLabel}`, color: 0x39FF14 });
  }

  const boxRadius = 74;
  if (Phaser.Math.Distance.Between(scene.px, scene.py, ZOMBIES_BOX_POS.x, ZOMBIES_BOX_POS.y) <= boxRadius) {
    const cooldown = Math.max(0, Math.ceil((scene.mysteryBoxCooldownUntil - scene.time.now) / 1000));
    options.push({
      kind: 'box',
      x: ZOMBIES_BOX_POS.x,
      y: ZOMBIES_BOX_POS.y + 8,
      radius: 56,
      label: scene.boxRollingUntil > scene.time.now
        ? 'BOX GIRANDO...'
        : cooldown > 0
          ? `BOX RECARGA ${cooldown}s`
          : `E MYSTERY BOX ${ZOMBIES_POINTS.mysteryBoxCost} PTS`,
      color: 0xFF7CCE,
    });
  }

  const workshopUnlocked = scene.doors.get('workshop')?.unlocked ?? false;
  if (workshopUnlocked && Phaser.Math.Distance.Between(scene.px, scene.py, ZOMBIES_PACK_POS.x, ZOMBIES_PACK_POS.y) <= 76) {
    const weaponState = scene.weaponInventory[scene.currentWeapon];
    const weaponStats = scene.getWeaponStats(scene.currentWeapon);
    options.push({
      kind: 'upgrade',
      x: ZOMBIES_PACK_POS.x,
      y: ZOMBIES_PACK_POS.y,
      radius: 58,
      label: weaponState.upgraded
        ? `${weaponStats.displayLabel} AL MAX`
        : `E PACK ${weaponStats.displayLabel} ${scene.getPackCost(scene.currentWeapon)} PTS`,
      color: 0x46B3FF,
    });
  }

  const depthsOpen = scene.allowDepthsGate && scene.depthsUnlocked;
  if (depthsOpen && Phaser.Math.Distance.Between(scene.px, scene.py, ZOMBIES_DEPTHS_PAD.x, ZOMBIES_DEPTHS_PAD.y) <= ZOMBIES_DEPTHS_PAD.radius + 34) {
    options.push({
      kind: 'depths',
      x: ZOMBIES_DEPTHS_PAD.x,
      y: ZOMBIES_DEPTHS_PAD.y,
      radius: ZOMBIES_DEPTHS_PAD.radius + 18,
      label: 'E BAJAR AL BASEMENT',
      color: 0xFF6EA8,
    });
  }

  for (const [sectionId, door] of scene.doors.entries()) {
    if (door.unlocked || !door.rect) continue;
    const expandedDoor = new Phaser.Geom.Rectangle(door.rect.x - 35, door.rect.y - 35, door.rect.width + 70, door.rect.height + 70);
    const nearDoor = Phaser.Geom.Rectangle.Contains(expandedDoor, scene.px, scene.py);
    if (!nearDoor) continue;
    options.push({
      kind: 'door',
      x: door.panel.x,
      y: door.panel.y,
      radius: Math.max(door.panel.width, door.panel.height) / 2,
      label: `E ABRIR ${ZOMBIES_SECTIONS.find((section) => section.id === sectionId)?.label} ${door.cost} PTS`,
      color: 0xF5C842,
      sectionId,
    });
  }

  for (const node of scene.spawnNodes.values()) {
    if (node.occupiedBy || node.boardHealth >= node.maxBoards) continue;
    const distance = Phaser.Math.Distance.Between(scene.px, scene.py, node.x, node.y);
    if (distance > 78) continue;
    options.push({
      kind: 'repair',
      x: node.x,
      y: node.y,
      radius: 44,
      label: 'E REPAIR BARRICADE +20 PTS',
      color: 0x46B3FF,
      nodeId: node.id,
    });
  }

  if (!options.length) return null;
  return options.sort((a, b) => Phaser.Math.Distance.Between(scene.px, scene.py, a.x, a.y) - Phaser.Math.Distance.Between(scene.px, scene.py, b.x, b.y))[0];
}

export function updateZombiesPromptHud(scene: ZombiesPlayerSceneLike, option: ZombiesInteractionOption | null) {
  if (!scene.activePrompt || !scene.promptGlow) return;
  scene.promptGlow.clear();
  if (!option) {
    scene.activePrompt.setAlpha(0);
    return;
  }

  const screen = scene.cameras.main.worldView;
  const screenX = option.x - screen.x;
  const screenY = option.y - screen.y;
  const pulse = 0.18 + ((Math.sin(scene.time.now / 180) + 1) * 0.1);
  scene.promptGlow.lineStyle(2, option.color, 0.85);
  scene.promptGlow.strokeCircle(screenX, screenY, option.radius);
  scene.promptGlow.fillStyle(option.color, pulse);
  scene.promptGlow.fillCircle(screenX, screenY, option.radius - 6);
  const color = Phaser.Display.Color.IntegerToColor(option.color);
  scene.activePrompt.setText(option.label);
  scene.activePrompt.setColor(`rgb(${color.red}, ${color.green}, ${color.blue})`);
  scene.activePrompt.setAlpha(1);
}

export function requestZombiesExit(scene: ZombiesPlayerSceneLike) {
  if (scene.scene.key === 'ZombiesScene') {
    transitionToWorldScene(scene, SAFE_PLAZA_RETURN.X, SAFE_PLAZA_RETURN.Y);
    return;
  }

  transitionToScene(scene, scene.returnScene, {
    returnX: scene.returnX,
    returnY: scene.returnY,
  });
}

export function enterZombiesBasementDepths(scene: ZombiesPlayerSceneLike) {
  transitionToScene(scene, 'BasementZombiesScene', {
    returnScene: scene.returnScene,
    returnX: scene.returnX,
    returnY: scene.returnY,
    entryLabel: scene.entryLabel,
    allowDepthsGate: false,
    modeLabel: 'BASEMENT DEPTHS',
  });
}

export function tryActivateZombiesFuria(scene: ZombiesPlayerSceneLike) {
  if (!getSkillSystem().hasUnlocked('gym', 4)) {
    scene.showNotice('GYM LV4 REQUIRED', '#888899');
    return;
  }
  const now = scene.time.now;
  if (scene.furiaActive && now < scene.furiaUntil) return;
  if (now < scene.furiaCooldownUntil) {
    const secLeft = Math.ceil((scene.furiaCooldownUntil - now) / 1000);
    scene.showNotice(`FURIA COOLDOWN ${secLeft}s`, '#888899');
    return;
  }
  scene.furiaActive = true;
  const furiaDuration = ZOMBIES_FURIA_DURATION_MS + (getSkillSystem().hasSynergy('cuerpo_maquina') ? 3000 : 0);
  scene.furiaUntil = now + furiaDuration;
  scene.furiaCooldownUntil = now + ZOMBIES_FURIA_COOLDOWN_MS;
  scene.cameras.main.flash(200, 255, 60, 60, false);
  const furiaLabel = getSkillSystem().getSpec('gym') === 'gym_fighter'
    ? 'FURIA ACTIVE - +80% DAMAGE [FIGHTER]'
    : 'FURIA ACTIVE - +30% DAMAGE';
  scene.showNotice(furiaLabel, '#FF4444');
}

export function updateZombiesFuriaHud(scene: ZombiesPlayerSceneLike) {
  const now = scene.time.now;
  if (!scene.furiaHudText) return;
  if (scene.furiaActive && now < scene.furiaUntil) {
    const secLeft = Math.ceil((scene.furiaUntil - now) / 1000);
    scene.furiaHudText.setText(`FURIA ${secLeft}s`).setColor('#FF4444');
  } else {
    if (scene.furiaActive) {
      scene.furiaActive = false;
      scene.showNotice('FURIA ENDED', '#888899');
    }
    if (!getSkillSystem().hasUnlocked('gym', 4)) {
      scene.furiaHudText.setText('');
      return;
    }
    if (now < scene.furiaCooldownUntil) {
      const secLeft = Math.ceil((scene.furiaCooldownUntil - now) / 1000);
      scene.furiaHudText.setText(`[F] FURIA ${secLeft}s CD`).setColor('#555566');
    } else {
      scene.furiaHudText.setText('[F] FURIA').setColor('#FF6666');
    }
  }
}
