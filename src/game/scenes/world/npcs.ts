import Phaser from 'phaser';
import { BUILDINGS, ZONES } from '../../config/constants';
import { eventBus, EVENTS } from '../../config/eventBus';
import type { AvatarConfig } from '../../systems/AvatarRenderer';

export type WorldNpcKey = 'mentor' | 'cottenks' | 'barber';

export type WorldInteractionTarget = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: number;
  sceneKey?: string;
  npcKey?: WorldNpcKey;
};

export type WorldInteractionAction =
  | { kind: 'none' }
  | { kind: 'advance_dialog'; dialog: 'gunDealer' | 'mentor' | 'cottenks' }
  | { kind: 'close_gun_shop' }
  | { kind: 'transition'; sceneKey: string }
  | { kind: 'open_npc'; npcKey: WorldNpcKey };

export type WorldResolvedInteraction = {
  target: WorldInteractionTarget | null;
  action: WorldInteractionAction;
};

export type WorldNpcSceneLike = Phaser.Scene & {
  px: number;
  py: number;
  time: Phaser.Time.Clock;
  tweens: Phaser.Tweens.TweenManager;
  inTransition?: boolean;
  gunShopOpen?: boolean;
  barberPanelOpen?: boolean;
  serverQuestFlags: Record<string, unknown>;
  controls: {
    isActionJustDown: (action: string) => boolean;
  };
  interactionHint?: Phaser.GameObjects.Text;
  interactionHighlight?: Phaser.GameObjects.Graphics;
  lastInteractionPromptLabel: string | null;
  mentorDialog?: { isActive: () => boolean; advance: () => void } | null;
  cottenksDialog?: { isActive: () => boolean; advance: () => void } | null;
  gunDealerDialog?: { isActive: () => boolean; advance: () => void } | null;
  cottenksQuestMarker?: Phaser.GameObjects.Text;
  add: Phaser.GameObjects.GameObjectFactory;
  textures: Phaser.Textures.TextureManager;
  load: Phaser.Loader.LoaderPlugin;
  createSafeAvatarRenderer: (
    x: number,
    y: number,
    cfg: AvatarConfig,
    source: string
  ) => {
    setDepth: (depth: number) => void;
    getContainer: () => Phaser.GameObjects.Container;
    update: (moving: boolean, dir: number) => void;
  };
  getGunDealerPosition: () => { x: number; y: number };
  transitionToScene: (sceneKey: string) => void;
  openMentorDialog: () => void;
  openCottenksDialog: () => void;
  openBarberPanel: () => void;
  closeGunShopPanel: () => void;
};

const MENTOR_X = 1200;
const MENTOR_Y = 558;
const COTTENKS_X = 1615;
const COTTENKS_Y = 558;
const BARBER_X = 820;
const BARBER_Y = 558;
const GUN_SHOP_BOUNDS = {
  x: 2100,
  y: ZONES.PLAZA_Y + 190,
  w: 280,
  h: 210,
};

export function setupWorldInteractionUi(scene: WorldNpcSceneLike) {
  scene.interactionHighlight?.destroy();
  scene.interactionHint?.destroy();

  scene.interactionHighlight = scene.add.graphics().setDepth(3100);
  scene.interactionHint = scene.add.text(0, 0, '', {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#F5C842',
    stroke: '#000000',
    strokeThickness: 4,
  }).setOrigin(0.5, 1).setDepth(3101).setAlpha(0);
}

export function spawnWorldAmbientNpcs(scene: WorldNpcSceneLike) {
  const npcConfigs: AvatarConfig[] = [
    { bodyColor: 0xD4A574, hairColor: 0x1A0A00, topColor: 0x553322, bottomColor: 0x221122 },
    { bodyColor: 0xE8C49A, hairColor: 0x000000, topColor: 0x222255, bottomColor: 0x111133 },
    { bodyColor: 0xC17A4A, hairColor: 0x220000, topColor: 0x334422, bottomColor: 0x1A2211 },
  ];

  const npcPositions = [
    { x: 180, y: 1090 },
    { x: 620, y: 1240 },
    { x: 600, y: 750 },
    { x: 2000, y: 720 },
    { x: 1000, y: 780 },
  ];

  npcPositions.forEach((pos, index) => {
    const cfg = npcConfigs[index % npcConfigs.length];
    const npc = scene.createSafeAvatarRenderer(pos.x, pos.y, cfg, `ambient-npc:${index}`);
    npc.setDepth(40);

    const range = 80 + Math.random() * 60;
    scene.tweens.add({
      targets: npc.getContainer(),
      x: pos.x + (Math.random() > 0.5 ? range : -range),
      duration: 3000 + Math.random() * 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => npc.update(true, 0),
    });
  });
}

export function spawnWorldGunDealerNpc(scene: WorldNpcSceneLike) {
  const { x, y } = scene.getGunDealerPosition();
  const cfg: AvatarConfig = {
    bodyColor: 0xC17A4A,
    hairColor: 0x000000,
    topColor: 0x1a1a2e,
    bottomColor: 0x0d0d1a,
  };

  const npc = scene.createSafeAvatarRenderer(x, y, cfg, 'gun-dealer');
  npc.setDepth(Math.floor(y / 10));

  scene.tweens.add({
    targets: npc.getContainer(),
    y: y + 4,
    duration: 2200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    onUpdate: () => npc.update(false, 0),
  });

  scene.add.text(x, y - 52, 'ARMS DEALER', {
    fontSize: '7px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#FF6B35',
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5, 1).setDepth(9000);
}

export function spawnWorldCottenksNpc(scene: WorldNpcSceneLike) {
  scene.add.text(COTTENKS_X, COTTENKS_Y - 98, 'COTTENKS', {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#F5C842',
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5, 1).setDepth(9000);

  scene.add.text(COTTENKS_X, COTTENKS_Y - 86, 'the og', {
    fontSize: '6px',
    fontFamily: '"Silkscreen", monospace',
    color: '#AAAAAA',
    stroke: '#000000',
    strokeThickness: 2,
  }).setOrigin(0.5, 1).setDepth(9000);

  const metLocally = typeof localStorage !== 'undefined' && !!localStorage.getItem('waspi_cottenks_met');
  const metOnServer = Boolean(scene.serverQuestFlags.cottenks_met);

  if (!metLocally && !metOnServer) {
    const marker = scene.add.text(COTTENKS_X, COTTENKS_Y - 60, '!', {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#0E0E14',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    scene.tweens.add({
      targets: marker,
      y: COTTENKS_Y - 68,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    scene.cottenksQuestMarker = marker;
  }

  const buildSprite = () => {
    const sprite = scene.add.image(COTTENKS_X, COTTENKS_Y, 'cottenks');
    const targetH = 90;
    const scale = sprite.height > 0 ? targetH / sprite.height : 0.2;
    sprite.setScale(scale);
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(Math.floor(COTTENKS_Y / 10));

    scene.tweens.add({
      targets: sprite,
      y: COTTENKS_Y + 4,
      scaleY: scale * 0.97,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  };

  if (scene.textures.exists('cottenks')) {
    buildSprite();
    return;
  }

  scene.load.image('cottenks', '/assets/sprites/cottenks.png');
  scene.load.once('complete', buildSprite);
  scene.load.start();
}

export function getWorldInteractionTarget(scene: WorldNpcSceneLike): WorldInteractionTarget | null {
  const { x: gunDealerX, y: gunDealerY } = scene.getGunDealerPosition();
  const arcadeDoorX = BUILDINGS.ARCADE.x + BUILDINGS.ARCADE.w / 2;
  const storeDoorX = BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2;
  const cafeDoorX = BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2;
  const casinoDoorX = BUILDINGS.CASINO.x + BUILDINGS.CASINO.w / 2;
  const gymDoorX = BUILDINGS.GYM.x + BUILDINGS.GYM.w / 2;
  const basementDoorX = BUILDINGS.HOUSE.x + BUILDINGS.HOUSE.w / 2;
  const basementDoorY = BUILDINGS.HOUSE.y + BUILDINGS.HOUSE.h - 32;
  const zombiesPadX = 640;
  const zombiesPadY = ZONES.PLAZA_Y + 430;

  const nearCasino = Math.abs(scene.px - casinoDoorX) < 60 && scene.py < ZONES.BUILDING_BOTTOM;
  const nearVecindad = scene.px < 220 && scene.py > ZONES.SOUTH_SIDEWALK_Y - 30 && scene.py < ZONES.PLAZA_Y + 120;
  const nearPvpBooth = scene.px >= 900 && scene.px <= 1080 && scene.py >= ZONES.PLAZA_Y + 420 && scene.py <= ZONES.PLAZA_Y + 550;
  const nearZombiesPad = Math.abs(scene.px - zombiesPadX) < 90 && Math.abs(scene.py - zombiesPadY) < 80;
  const nearBasement = Math.abs(scene.px - basementDoorX) < 90
    && scene.py >= BUILDINGS.HOUSE.y + BUILDINGS.HOUSE.h - 90
    && scene.py <= BUILDINGS.HOUSE.y + BUILDINGS.HOUSE.h + 70;
  const nearArcade = Math.abs(scene.px - arcadeDoorX) < 60 && scene.py < ZONES.BUILDING_BOTTOM;
  const nearStore = Math.abs(scene.px - storeDoorX) < 60 && scene.py < ZONES.BUILDING_BOTTOM;
  const nearCafe = Math.abs(scene.px - cafeDoorX) < 60 && scene.py < ZONES.BUILDING_BOTTOM;
  const nearGunShop = Math.abs(scene.px - gunDealerX) < 92
    && scene.py >= GUN_SHOP_BOUNDS.y + GUN_SHOP_BOUNDS.h - 108
    && scene.py <= GUN_SHOP_BOUNDS.y + GUN_SHOP_BOUNDS.h + 52;
  const nearGym = Math.abs(scene.px - gymDoorX) < 70
    && scene.py >= BUILDINGS.GYM.y + BUILDINGS.GYM.h - 80
    && scene.py <= BUILDINGS.GYM.y + BUILDINGS.GYM.h + 60;

  if (nearVecindad) {
    return { x: 120, y: ZONES.PLAZA_Y + 40, w: 140, h: 80, label: 'SPACE ENTRAR VECINDAD', color: 0xF5C842, sceneKey: 'VecindadScene' };
  }
  if (nearBasement) {
    return { x: basementDoorX, y: basementDoorY, w: BUILDINGS.HOUSE.w + 20, h: BUILDINGS.HOUSE.h + 10, label: 'SPACE ENTRAR BASEMENT', color: 0xB48BFF, sceneKey: 'BasementScene' };
  }
  if (nearZombiesPad) {
    return { x: zombiesPadX, y: zombiesPadY, w: 200, h: 90, label: 'SPACE ENTRAR MODO ZOMBIES', color: 0xFF6EA8, sceneKey: 'ZombiesScene' };
  }
  if (nearPvpBooth) {
    return { x: 990, y: ZONES.PLAZA_Y + 485, w: 180, h: 90, label: 'SPACE ENTRAR PVP PIT', color: 0xFF4DA6, sceneKey: 'PvpArenaScene' };
  }
  if (nearArcade) {
    return { x: arcadeDoorX, y: BUILDINGS.ARCADE.y + BUILDINGS.ARCADE.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR ARCADE', color: 0x46B3FF, sceneKey: 'ArcadeInterior' };
  }
  if (nearStore) {
    return { x: storeDoorX, y: BUILDINGS.STORE.y + BUILDINGS.STORE.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR SHOP', color: 0x39FF14, sceneKey: 'StoreInterior' };
  }
  if (nearCafe) {
    return { x: cafeDoorX, y: BUILDINGS.CAFE.y + BUILDINGS.CAFE.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR CAFE', color: 0xFF8B3D, sceneKey: 'CafeInterior' };
  }
  if (nearCasino) {
    return { x: casinoDoorX, y: BUILDINGS.CASINO.y + BUILDINGS.CASINO.h - 28, w: 120, h: 80, label: 'SPACE ENTRAR CASINO', color: 0xF5C842, sceneKey: 'CasinoInterior' };
  }
  if (nearGunShop) {
    return { x: gunDealerX, y: gunDealerY, w: 164, h: 76, label: 'SPACE ENTRAR GUN SHOP', color: 0x46B3FF, sceneKey: 'GunShopInterior' };
  }
  if (nearGym) {
    return { x: gymDoorX, y: BUILDINGS.GYM.y + BUILDINGS.GYM.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR GYM', color: 0xFF2222, sceneKey: 'GymInterior' };
  }

  const nearMentor = Math.abs(scene.px - MENTOR_X) < 90 && Math.abs(scene.py - MENTOR_Y) < 90;
  if (nearMentor && !scene.mentorDialog?.isActive()) {
    return { x: MENTOR_X, y: MENTOR_Y - 36, w: 180, h: 70, label: 'SPACE HABLAR CON EL MENTOR', color: 0x4ECDC4, npcKey: 'mentor' };
  }

  const nearCottenks = Math.abs(scene.px - COTTENKS_X) < 100 && Math.abs(scene.py - COTTENKS_Y) < 100;
  if (nearCottenks && !scene.cottenksDialog?.isActive()) {
    return { x: COTTENKS_X, y: COTTENKS_Y - 36, w: 180, h: 70, label: 'SPACE HABLAR CON COTTENKS', color: 0xF5C842, npcKey: 'cottenks' };
  }

  const nearBarber = Math.abs(scene.px - BARBER_X) < 90 && Math.abs(scene.py - BARBER_Y) < 90;
  if (nearBarber && !scene.barberPanelOpen) {
    return { x: BARBER_X, y: BARBER_Y - 36, w: 160, h: 70, label: 'SPACE BARBERÍA', color: 0xFF88CC, npcKey: 'barber' };
  }

  return null;
}

export function updateWorldInteractionHighlight(scene: WorldNpcSceneLike) {
  if (!scene.interactionHighlight) return;

  const target = getWorldInteractionTarget(scene);
  scene.interactionHighlight.clear();

  if (!target) {
    if (scene.lastInteractionPromptLabel !== null) {
      scene.lastInteractionPromptLabel = null;
      eventBus.emit(EVENTS.WORLD_INTERACTION_PROMPT, { text: '', visible: false, color: '#F5C842' });
    }
    return;
  }

  const pulse = 0.3 + ((Math.sin(scene.time.now / 180) + 1) * 0.16);
  scene.interactionHighlight.lineStyle(3, target.color, 0.88);
  scene.interactionHighlight.strokeRoundedRect(target.x - target.w / 2, target.y - target.h / 2, target.w, target.h, 10);
  scene.interactionHighlight.fillStyle(target.color, pulse * 0.2);
  scene.interactionHighlight.fillRoundedRect(target.x - target.w / 2, target.y - target.h / 2, target.w, target.h, 10);

  if (scene.lastInteractionPromptLabel !== target.label) {
    scene.lastInteractionPromptLabel = target.label;
    const rgb = Phaser.Display.Color.IntegerToRGB(target.color);
    eventBus.emit(EVENTS.WORLD_INTERACTION_PROMPT, {
      text: target.label,
      visible: true,
      color: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    });
  }
}

export function resolveWorldInteractionAction(
  scene: WorldNpcSceneLike,
  target: WorldInteractionTarget | null = getWorldInteractionTarget(scene),
): WorldInteractionAction {
  if (scene.gunDealerDialog?.isActive()) {
    return { kind: 'advance_dialog', dialog: 'gunDealer' };
  }
  if (scene.mentorDialog?.isActive()) {
    return { kind: 'advance_dialog', dialog: 'mentor' };
  }
  if (scene.cottenksDialog?.isActive()) {
    return { kind: 'advance_dialog', dialog: 'cottenks' };
  }
  if (scene.gunShopOpen) {
    return { kind: 'close_gun_shop' };
  }

  if (target?.sceneKey) {
    return { kind: 'transition', sceneKey: target.sceneKey };
  }
  if (target?.npcKey) {
    return { kind: 'open_npc', npcKey: target.npcKey };
  }

  return { kind: 'none' };
}

export function resolveWorldInteractionActionFromTarget(
  scene: WorldNpcSceneLike,
  target: WorldInteractionTarget | null,
) {
  return resolveWorldInteractionAction(scene, target);
}

export function resolveWorldInteraction(
  scene: WorldNpcSceneLike,
  target: WorldInteractionTarget | null = getWorldInteractionTarget(scene),
): WorldResolvedInteraction {
  return {
    target,
    action: resolveWorldInteractionActionFromTarget(scene, target),
  };
}

export function hasWorldInteractionAction(action: WorldInteractionAction) {
  return action.kind !== 'none';
}

export function openWorldInteractionTarget(
  scene: WorldNpcSceneLike,
  action: WorldInteractionAction,
) {
  if (action.kind === 'advance_dialog') {
    if (action.dialog === 'gunDealer') {
      scene.gunDealerDialog?.advance();
      return;
    }
    if (action.dialog === 'mentor') {
      scene.mentorDialog?.advance();
      return;
    }
    scene.cottenksDialog?.advance();
    return;
  }

  if (action.kind === 'close_gun_shop') {
    scene.closeGunShopPanel();
    return;
  }

  if (action.kind === 'transition') {
    scene.transitionToScene(action.sceneKey);
    return;
  }

  if (action.kind === 'open_npc' && action.npcKey === 'mentor') {
    scene.openMentorDialog();
    return;
  }
  if (action.kind === 'open_npc' && action.npcKey === 'cottenks') {
    scene.openCottenksDialog();
    return;
  }
  if (action.kind === 'open_npc' && action.npcKey === 'barber') {
    scene.openBarberPanel();
  }
}

export function tryOpenWorldInteractionAction(
  scene: WorldNpcSceneLike,
  action: WorldInteractionAction,
) {
  if (!hasWorldInteractionAction(action)) return false;
  openWorldInteractionTarget(scene, action);
  return true;
}

export function executeWorldInteractionAction(
  scene: WorldNpcSceneLike,
  action: WorldInteractionAction,
) {
  return tryOpenWorldInteractionAction(scene, action);
}

export function executeResolvedWorldInteraction(
  scene: WorldNpcSceneLike,
  resolved: WorldResolvedInteraction,
) {
  return executeWorldInteractionAction(scene, resolved.action);
}

export function openWorldInteractionFromTarget(
  scene: WorldNpcSceneLike,
  target: WorldInteractionTarget | null,
) {
  const action = resolveWorldInteractionActionFromTarget(scene, target);
  openWorldInteractionTarget(scene, action);
  return action;
}

export function tryOpenWorldInteractionFromTarget(
  scene: WorldNpcSceneLike,
  target: WorldInteractionTarget | null,
) {
  const action = resolveWorldInteractionActionFromTarget(scene, target);
  return tryOpenWorldInteractionAction(scene, action);
}

export function executeWorldInteractionFromTarget(
  scene: WorldNpcSceneLike,
  target: WorldInteractionTarget | null,
) {
  return tryOpenWorldInteractionFromTarget(scene, target);
}

export function tryHandleWorldInteractionFromTarget(
  scene: WorldNpcSceneLike,
  target: WorldInteractionTarget | null,
) {
  if (scene.inTransition) return false;
  if (!scene.controls.isActionJustDown('interact')) return false;
  return executeWorldInteractionFromTarget(scene, target);
}

export function tryHandleWorldInteraction(scene: WorldNpcSceneLike) {
  return tryHandleWorldInteractionFromTarget(scene, getWorldInteractionTarget(scene));
}

export function tryHandleWorldNpcInteraction(scene: WorldNpcSceneLike) {
  return tryHandleWorldInteraction(scene);
}

export function handleWorldNpcInteraction(scene: WorldNpcSceneLike) {
  if (scene.inTransition) return;
  if (!scene.controls.isActionJustDown('interact')) return;

  tryOpenWorldInteractionFromTarget(scene, getWorldInteractionTarget(scene));
}
