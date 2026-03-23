import Phaser from 'phaser';
import { eventBus, EVENTS } from '../../config/eventBus';
import { ZOMBIES_PLAYER, ZOMBIES_VIEWPORT, type ZombiesWeaponId } from '../../config/zombies';
import { getSkillSystem } from '../../systems/SkillSystem';

type ZombiesHudWeaponInventoryEntry = {
  ammoInMag: number;
  reserveAmmo: number;
};

type ZombiesHudWeaponStats = {
  displayLabel: string;
};

type ZombiesPromptOption = {
  x: number;
  y: number;
  radius: number;
  label: string;
  color: number;
};

type ZombiesHudBindings = {
  activePrompt?: Phaser.GameObjects.Text;
  bossIntroText?: Phaser.GameObjects.Text;
  furiaHudText?: Phaser.GameObjects.Text;
  noticeText?: Phaser.GameObjects.Text;
  powerupBanner?: Phaser.GameObjects.Text;
  promptGlow?: Phaser.GameObjects.Graphics;
  reticle?: Phaser.GameObjects.Graphics;
};

type ZombiesHudScene = Phaser.Scene & ZombiesHudBindings & {
  allowDepthsGate: boolean;
  bossAlive: boolean;
  bossRoundActive: boolean;
  bossSpawnedThisRound: boolean;
  boxRollingUntil: number;
  currentWeapon: ZombiesWeaponId;
  depthsUnlocked: boolean;
  doublePointsUntil: number;
  furiaActive: boolean;
  furiaCooldownUntil: number;
  furiaUntil: number;
  gameOver: boolean;
  hp: number;
  instaKillUntil: number;
  killCount: number;
  nextSpawnAt: number;
  points: number;
  reloadEndsAt: number;
  round: number;
  roundTarget: number;
  roundBreakUntil: number;
  spawnedThisRound: number;
  time: Phaser.Time.Clock;
  tweens: Phaser.Tweens.TweenManager;
  weaponInventory: Record<ZombiesWeaponId, ZombiesHudWeaponInventoryEntry>;
  weaponOrder: ZombiesWeaponId[];
  countAliveZombies: () => number;
  getPressureTier: () => string;
  getWeaponStats: (weaponId: ZombiesWeaponId) => ZombiesHudWeaponStats;
};

export type ZombiesHudUpdatePayload = {
  ammoInMag: number;
  doublePointsLeft: number;
  enemiesLeft: number;
  hp: number;
  instaKillLeft: number;
  kills: number;
  maxHp: number;
  reserveAmmo: number;
  score: number;
  status: string;
  totalWaves: number;
  wave: number;
  weapon: string;
  weapons: string;
};

export type { ZombiesPromptOption, ZombiesHudScene };

export function createZombiesHud(scene: ZombiesHudScene) {
  scene.furiaHudText = scene.add.text(18, 18, '', {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#FF4444',
    stroke: '#000000',
    strokeThickness: 3,
  }).setScrollFactor(0).setDepth(1000);

  scene.noticeText = scene.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, 86, '', {
    fontSize: '10px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#F5C842',
    stroke: '#000000',
    strokeThickness: 4,
    align: 'center',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(1200).setAlpha(0);

  scene.powerupBanner = scene.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, 132, '', {
    fontSize: '11px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#FFFFFF',
    stroke: '#000000',
    strokeThickness: 5,
    align: 'center',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(1200).setAlpha(0);

  scene.bossIntroText = scene.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT / 2, '', {
    fontSize: '18px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#FF6A6A',
    stroke: '#000000',
    strokeThickness: 6,
    align: 'center',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(1300).setAlpha(0);

  scene.activePrompt = scene.add.text(ZOMBIES_VIEWPORT.WIDTH / 2, ZOMBIES_VIEWPORT.HEIGHT - 38, '', {
    fontSize: '9px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#F5C842',
    stroke: '#000000',
    strokeThickness: 4,
    align: 'center',
  }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1200).setAlpha(0);

  scene.promptGlow = scene.add.graphics().setScrollFactor(0).setDepth(1190);
  scene.reticle = scene.add.graphics().setScrollFactor(0).setDepth(1100);

  return {
    activePrompt: scene.activePrompt,
    bossIntroText: scene.bossIntroText,
    furiaHudText: scene.furiaHudText,
    noticeText: scene.noticeText,
    powerupBanner: scene.powerupBanner,
    promptGlow: scene.promptGlow,
    reticle: scene.reticle,
  };
}

export function buildZombiesHudPayload(scene: ZombiesHudScene): ZombiesHudUpdatePayload {
  const weapon = scene.getWeaponStats(scene.currentWeapon);
  const ammo = scene.weaponInventory[scene.currentWeapon];
  const now = scene.time.now;
  const doubleSeconds = scene.doublePointsUntil > now
    ? Math.ceil((scene.doublePointsUntil - now) / 1000)
    : 0;
  const instaSeconds = scene.instaKillUntil > now
    ? Math.ceil((scene.instaKillUntil - now) / 1000)
    : 0;
  const roundState = scene.roundBreakUntil > now
    ? `INTER ${Math.ceil((scene.roundBreakUntil - now) / 1000)}s`
    : scene.nextSpawnAt > now && scene.spawnedThisRound === 0
      ? `WAVE ${Math.ceil((scene.nextSpawnAt - now) / 1000)}s`
      : scene.boxRollingUntil > now
        ? 'BOX GIRANDO'
        : scene.reloadEndsAt > now
          ? 'RECARGANDO'
          : 'EN PIE';
  const status = [
    scene.gameOver ? 'GAME OVER' : roundState,
    `ZOMBIES ${scene.countAliveZombies()}/${scene.roundTarget}`,
    `SPAWN ${scene.spawnedThisRound}`,
    `PRESSURE ${scene.getPressureTier()}`,
    scene.allowDepthsGate && scene.depthsUnlocked ? 'DEPTHS OPEN' : '',
    scene.bossAlive ? 'BOSS ACTIVE' : scene.bossRoundActive && !scene.bossSpawnedThisRound ? 'BOSS INCOMING' : '',
  ].filter(Boolean).join('\n');
  const weapons = `ARMAS ${scene.weaponOrder.map((id) => {
    const label = scene.getWeaponStats(id).displayLabel;
    return id === scene.currentWeapon ? `[${label}]` : label;
  }).join('  ')}`;

  return {
    ammoInMag: ammo.ammoInMag,
    doublePointsLeft: doubleSeconds,
    enemiesLeft: scene.countAliveZombies(),
    hp: Math.max(0, Math.round(scene.hp)),
    instaKillLeft: instaSeconds,
    kills: scene.killCount,
    maxHp: ZOMBIES_PLAYER.maxHp,
    reserveAmmo: ammo.reserveAmmo,
    score: scene.points,
    status,
    totalWaves: scene.round,
    wave: scene.round,
    weapon: weapon.displayLabel,
    weapons,
  };
}

export function renderZombiesHud(scene: ZombiesHudScene) {
  const payload = buildZombiesHudPayload(scene);
  eventBus.emit(EVENTS.ZOMBIES_HUD_UPDATE, payload);
  renderZombiesReticle(scene);
  return payload;
}

export function renderZombiesReticle(scene: ZombiesHudScene) {
  if (!scene.reticle) return;
  scene.reticle.clear();
  const pointer = scene.input.activePointer;
  scene.reticle.lineStyle(1, 0xFFFFFF, 0.75);
  scene.reticle.strokeCircle(pointer.x, pointer.y, 8);
  scene.reticle.lineBetween(pointer.x - 12, pointer.y, pointer.x + 12, pointer.y);
  scene.reticle.lineBetween(pointer.x, pointer.y - 12, pointer.x, pointer.y + 12);
}

export function showZombiesNotice(scene: ZombiesHudScene, text: string, color = '#F5C842') {
  if (!scene.noticeText) return;
  scene.noticeText.setText(text);
  scene.noticeText.setColor(color);
  scene.noticeText.setAlpha(1);
  scene.noticeText.setScale(0.94);
  scene.tweens.killTweensOf(scene.noticeText);
  scene.tweens.add({
    targets: scene.noticeText,
    scaleX: 1,
    scaleY: 1,
    alpha: { from: 1, to: 0 },
    duration: 1600,
    ease: 'Sine.easeOut',
  });
}

export function showZombiesPowerupBanner(scene: ZombiesHudScene, text: string, color = '#FFFFFF') {
  if (!scene.powerupBanner) return;
  scene.powerupBanner.setText(text);
  scene.powerupBanner.setColor(color);
  scene.powerupBanner.setAlpha(1);
  scene.powerupBanner.setScale(1.15);
  scene.tweens.killTweensOf(scene.powerupBanner);
  scene.tweens.add({
    targets: scene.powerupBanner,
    alpha: { from: 1, to: 0 },
    scaleX: 1,
    scaleY: 1,
    duration: 1800,
    ease: 'Sine.easeOut',
  });
}

export function showZombiesBossIntro(scene: ZombiesHudScene, text: string) {
  if (!scene.bossIntroText) return;
  scene.bossIntroText.setText(text);
  scene.bossIntroText.setAlpha(1);
  scene.bossIntroText.setScale(0.86);
  scene.tweens.killTweensOf(scene.bossIntroText);
  scene.tweens.add({
    targets: scene.bossIntroText,
    scaleX: 1,
    scaleY: 1,
    alpha: { from: 1, to: 0 },
    duration: 2200,
    ease: 'Cubic.easeOut',
  });
}

export function updateZombiesPromptHud(scene: ZombiesHudScene, option: ZombiesPromptOption | null) {
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

export function updateZombiesFuriaHud(scene: ZombiesHudScene) {
  const now = scene.time.now;
  if (!scene.furiaHudText) return;

  if (scene.furiaActive && now < scene.furiaUntil) {
    const secLeft = Math.ceil((scene.furiaUntil - now) / 1000);
    scene.furiaHudText.setText(`FURIA ${secLeft}s`).setColor('#FF4444');
    return;
  }

  if (scene.furiaActive) {
    scene.furiaActive = false;
    showZombiesNotice(scene, 'FURIA TERMINADA', '#888899');
  }

  if (!getSkillSystem().hasUnlocked('gym', 4)) {
    scene.furiaHudText.setText('');
    return;
  }

  if (now < scene.furiaCooldownUntil) {
    const secLeft = Math.ceil((scene.furiaCooldownUntil - now) / 1000);
    scene.furiaHudText.setText(`[F] FURIA ${secLeft}s CD`).setColor('#555566');
    return;
  }

  scene.furiaHudText.setText('[F] FURIA').setColor('#FF6666');
}
