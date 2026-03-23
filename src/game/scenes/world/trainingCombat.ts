import Phaser from 'phaser';

export type EnemyArchetype = 'rusher' | 'shooter' | 'tank' | 'boss';

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TrainingCombatZoneOptions = {
  rect: Rect;
  label?: string;
  labelOffsetY?: number;
  overlayAlpha?: number;
  outlineAlpha?: number;
  overlayDepth?: number;
  labelDepth?: number;
};

export type HudTextOptions = {
  x: number;
  y: number;
  depth?: number;
  color?: string;
  fontSize?: string;
};

export type BossHudOptions = {
  x: number;
  y: number;
  width?: number;
  depth?: number;
  label?: string;
  color?: string;
};

export type TrainingCombatHudLayout = {
  zone: TrainingCombatZoneOptions;
  banner: HudTextOptions;
  training: HudTextOptions;
  notice: HudTextOptions;
  combat: HudTextOptions;
  progression: HudTextOptions;
  boss: BossHudOptions;
  visible?: boolean;
};

export type TrainingCombatHudRefs = {
  trainingZoneGraphics: Phaser.GameObjects.Graphics;
  trainingZoneLabel: Phaser.GameObjects.Text;
  trainingBanner: Phaser.GameObjects.Text;
  trainingHud: Phaser.GameObjects.Text;
  arenaNotice: Phaser.GameObjects.Text;
  combatHud: Phaser.GameObjects.Text;
  progressionHud: Phaser.GameObjects.Text;
  bossHud: Phaser.GameObjects.Container;
  bossBar: Phaser.GameObjects.Graphics;
  bossName: Phaser.GameObjects.Text;
};

export type TrainingZoneRefs = {
  graphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
};

export type HealthHudRefs = {
  hpBar: Phaser.GameObjects.Graphics;
  hpText: Phaser.GameObjects.Text;
  xpBar: Phaser.GameObjects.Graphics;
  levelBadgeBg: Phaser.GameObjects.Rectangle;
  levelBadgeText: Phaser.GameObjects.Text;
};

export type WeaponHudRefs = {
  weaponHud: Phaser.GameObjects.Text;
  weaponCooldownBar: Phaser.GameObjects.Graphics;
};

export type CombatHudVisibilityRefs = Partial<HealthHudRefs & WeaponHudRefs> & {
  trainingHud?: Phaser.GameObjects.Text | null;
  combatHud?: Phaser.GameObjects.Text | null;
  progressionHud?: Phaser.GameObjects.Text | null;
  bossHud?: Phaser.GameObjects.Container | null;
};

export type TrainingHudState = {
  inTraining: boolean;
  trainingScore: number;
  elapsedMs?: number;
  multiplier?: number;
  nextStepSeconds?: number | null;
};

export type CombatHudState = {
  gunEnabled: boolean;
  weaponLabel: string;
  weaponColor?: string;
};

export type ProgressionHudState = {
  level: number;
  maxLevel: number;
  xp: number;
  nextLevelAt: number | null;
  kills: number;
};

export type BossHudState = {
  visible: boolean;
  alive: boolean;
  hp: number;
  maxHp: number;
  label?: string;
  color?: string;
};

export function setupTrainingZone(
  scene: Phaser.Scene,
  options: TrainingCombatZoneOptions,
): TrainingZoneRefs {
  const {
    rect,
    label = 'TRAINING',
    labelOffsetY = 14,
    overlayAlpha = 0.10,
    outlineAlpha = 0.35,
    overlayDepth = 2,
    labelDepth = 3,
  } = options;

  const graphics = scene.add.graphics().setDepth(overlayDepth);
  graphics.fillStyle(0x000000, overlayAlpha);
  graphics.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 12);
  graphics.lineStyle(2, 0x39FF14, outlineAlpha);
  graphics.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 12);

  const labelText = scene.add.text(
    rect.x + rect.w / 2,
    rect.y - labelOffsetY,
    label,
    {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#39FF14',
    },
  ).setOrigin(0.5).setDepth(labelDepth);

  return { graphics, label: labelText };
}

export function createTrainingBanner(scene: Phaser.Scene, options: HudTextOptions) {
  const {
    x,
    y,
    depth = 10001,
    color = '#39FF14',
    fontSize = '8px',
  } = options;

  return scene.add.text(x, y, '', {
    fontSize,
    fontFamily: '"Press Start 2P", monospace',
    color,
    stroke: '#000000',
    strokeThickness: 4,
  }).setScrollFactor(0).setDepth(depth).setOrigin(0.5);
}

export function createTrainingHud(scene: Phaser.Scene, options: HudTextOptions) {
  const {
    x,
    y,
    depth = 9999,
    color = '#39FF14',
    fontSize = '7px',
  } = options;

  return scene.add.text(x, y, '', {
    fontSize,
    fontFamily: '"Press Start 2P", monospace',
    color,
  }).setScrollFactor(0).setDepth(depth);
}

export function createArenaNotice(scene: Phaser.Scene, options: HudTextOptions) {
  const {
    x,
    y,
    depth = 10002,
    color = '#3DD6FF',
    fontSize = '9px',
  } = options;

  return scene.add.text(x, y, '', {
    fontSize,
    fontFamily: '"Press Start 2P", monospace',
    color,
    stroke: '#000000',
    strokeThickness: 4,
  }).setOrigin(0.5).setScrollFactor(0).setDepth(depth).setAlpha(0);
}

export function createCombatHud(scene: Phaser.Scene, options: HudTextOptions) {
  const {
    x,
    y,
    depth = 9999,
    color = '#F5C842',
    fontSize = '7px',
  } = options;

  return scene.add.text(x, y, '', {
    fontSize,
    fontFamily: '"Press Start 2P", monospace',
    color,
    lineSpacing: 5,
  }).setScrollFactor(0).setDepth(depth);
}

export function createProgressionHud(scene: Phaser.Scene, options: HudTextOptions) {
  const {
    x,
    y,
    depth = 9999,
    color = '#46B3FF',
    fontSize = '7px',
  } = options;

  return scene.add.text(x, y, '', {
    fontSize,
    fontFamily: '"Press Start 2P", monospace',
    color,
    lineSpacing: 5,
  }).setScrollFactor(0).setDepth(depth);
}

export function createBossHud(scene: Phaser.Scene, options: BossHudOptions) {
  const {
    x,
    y,
    width = 320,
    depth = 10003,
    label = 'PLAZA BOSS',
    color = '#3DD6FF',
  } = options;

  const frame = scene.add.rectangle(x, y, width, 26, 0x000000, 0.66)
    .setScrollFactor(0)
    .setDepth(depth)
    .setStrokeStyle(1, 0x3DD6FF, 0.55);

  const bossBar = scene.add.graphics().setScrollFactor(0).setDepth(depth + 1);
  const bossName = scene.add.text(x, y - 1, label, {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color,
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 2);

  const bossHud = scene.add.container(0, 0, [frame, bossBar, bossName]);
  bossHud.setVisible(false);

  return { bossHud, bossBar, bossName };
}

export function setupTrainingCombatHud(
  scene: Phaser.Scene,
  layout: TrainingCombatHudLayout,
): TrainingCombatHudRefs {
  const zone = setupTrainingZone(scene, layout.zone);
  const trainingBanner = createTrainingBanner(scene, layout.banner);
  const trainingHud = createTrainingHud(scene, layout.training);
  const arenaNotice = createArenaNotice(scene, layout.notice);
  const combatHud = createCombatHud(scene, layout.combat);
  const progressionHud = createProgressionHud(scene, layout.progression);
  const boss = createBossHud(scene, layout.boss);

  const refs: TrainingCombatHudRefs = {
    trainingZoneGraphics: zone.graphics,
    trainingZoneLabel: zone.label,
    trainingBanner,
    trainingHud,
    arenaNotice,
    combatHud,
    progressionHud,
    bossHud: boss.bossHud,
    bossBar: boss.bossBar,
    bossName: boss.bossName,
  };

  if (layout.visible !== undefined) {
    applyTrainingCombatHudVisibility(refs, layout.visible);
  }

  return refs;
}

export function renderTrainingHud(
  trainingHud: Phaser.GameObjects.Text | null | undefined,
  state: TrainingHudState,
) {
  if (!trainingHud) return;
  if (!state.inTraining) {
    trainingHud.setText('TRAINING KOs ' + state.trainingScore + ' | BONO TENKS x1.0 | PROX +50% EN 11s');
    return;
  }

  const elapsedSec = Math.floor((state.elapsedMs ?? 0) / 1000);
  const multiplier = (state.multiplier ?? 1).toFixed(1);
  const nextLabel = state.nextStepSeconds === null || state.nextStepSeconds === undefined
    ? 'MAX'
    : `PROX +50% EN ${state.nextStepSeconds}s`;

  trainingHud.setText(`TRAINING KOs ${state.trainingScore} | BONO TENKS x${multiplier} | ${nextLabel} | ${elapsedSec}s`);
}

export function renderCombatHud(
  combatHud: Phaser.GameObjects.Text | null | undefined,
  state: CombatHudState,
) {
  if (!combatHud) return;
  if (!state.gunEnabled) {
    combatHud.setText([
      'WEAPON OFFLINE',
      'ACTIVA GUN EN INVENTARIO',
    ]);
    combatHud.setColor('#888888');
    return;
  }

  combatHud.setColor(state.weaponColor ?? '#F5C842');
  combatHud.setText([
    `WEAPON ${state.weaponLabel} | Q CICLA / 1-6`,
    'F / CLICK DISPARA',
  ]);
}

export function renderProgressionHud(
  progressionHud: Phaser.GameObjects.Text | null | undefined,
  state: ProgressionHudState,
) {
  if (!progressionHud) return;
  const nextLabel = state.nextLevelAt === null
    ? 'MAX'
    : `${Math.max(0, state.nextLevelAt - state.xp)} XP`;

  progressionHud.setText([
    `LVL ${state.level}/${state.maxLevel} | XP ${state.xp}`,
    `KOs ${state.kills} | NEXT ${nextLabel}`,
  ]);
}

export function applyTrainingCombatHudVisibility(
  refs: CombatHudVisibilityRefs,
  visible: boolean,
) {
  refs.trainingHud?.setVisible(visible);
  refs.combatHud?.setVisible(visible);
  refs.progressionHud?.setVisible(visible);
  refs.weaponHud?.setVisible(visible);
  refs.weaponCooldownBar?.setVisible(visible);
  refs.hpBar?.setVisible(false);
  refs.hpText?.setVisible(false);
  refs.xpBar?.setVisible(false);
  refs.levelBadgeBg?.setVisible(false);
  refs.levelBadgeText?.setVisible(false);
  refs.bossHud?.setVisible(visible);
}

export function renderBossHud(
  refs: Pick<TrainingCombatHudRefs, 'bossHud' | 'bossBar' | 'bossName'>,
  state: BossHudState,
) {
  if (!refs.bossHud || !refs.bossBar || !refs.bossName) return;
  refs.bossHud.setVisible(state.visible && state.alive);
  refs.bossBar.clear();

  if (!state.visible || !state.alive) return;

  const width = 292;
  const height = 10;
  const x = refs.bossName.x - width / 2;
  const y = refs.bossName.y + 23;
  const pct = Phaser.Math.Clamp(state.hp / Math.max(1, state.maxHp), 0, 1);
  refs.bossName.setText(state.label ?? `PLAZA BOSS ${state.hp}/${state.maxHp}`);
  if (state.color) refs.bossName.setColor(state.color);

  refs.bossBar.fillStyle(0x09131A, 0.85);
  refs.bossBar.fillRoundedRect(x, y, width, height, 3);
  refs.bossBar.fillStyle(0x3DD6FF, 0.88);
  refs.bossBar.fillRoundedRect(x + 1, y + 1, (width - 2) * pct, height - 2, 3);
}

export function showArenaNotice(
  arenaNotice: Phaser.GameObjects.Text | null | undefined,
  message: string,
  color = '#3DD6FF',
  tweenTargets?: {
    tweens: Phaser.Scene['tweens'];
    y?: number;
    duration?: number;
  },
) {
  if (!arenaNotice) return;
  arenaNotice.setText(message);
  arenaNotice.setColor(color);
  arenaNotice.setAlpha(1);

  if (!tweenTargets) return;
  const { tweens, y = arenaNotice.y, duration = 1400 } = tweenTargets;
  arenaNotice.setY(y);
  tweens.killTweensOf(arenaNotice);
  tweens.add({
    targets: arenaNotice,
    alpha: { from: 1, to: 0 },
    y: y - 18,
    duration,
    ease: 'Sine.easeOut',
  });
}

export function getEnemyNameColor(archetype: EnemyArchetype) {
  if (archetype === 'boss') return '#3DD6FF';
  if (archetype === 'tank') return '#D8A8FF';
  if (archetype === 'shooter') return '#FFC38D';
  return '#FF8B8B';
}
