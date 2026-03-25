export type InteractionNpcKey = 'mentor' | 'cottenks' | 'barber';

export type InteractionTarget = {
  color: number;
  h: number;
  label: string;
  npcKey?: InteractionNpcKey;
  sceneKey?: string;
  w: number;
  x: number;
  y: number;
};

export type BuildingRectLike = {
  h: number;
  w: number;
  x: number;
  y: number;
};

export type WorldBuildingsLike = {
  ARCADE: BuildingRectLike;
  CAFE: BuildingRectLike;
  CASINO: BuildingRectLike;
  GYM: BuildingRectLike;
  HOUSE: BuildingRectLike;
  STORE: BuildingRectLike;
};

export type WorldZonesLike = {
  BUILDING_BOTTOM: number;
  PLAZA_Y: number;
  SOUTH_SIDEWALK_Y: number;
};

type GraphicsLike = {
  clear(): GraphicsLike;
  fillRoundedRect(x: number, y: number, width: number, height: number, radius: number): GraphicsLike;
  fillStyle(color: number, alpha?: number): GraphicsLike;
  lineStyle(width?: number, color?: number, alpha?: number): GraphicsLike;
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius: number): GraphicsLike;
};

type DialogLike = {
  advance(): void;
  isActive(): boolean;
};

export type PromptEventPayload = {
  color: string;
  text: string;
  visible: boolean;
};

export type WorldInteractionSceneLike = {
  barberPanelOpen: boolean;
  cottenksDialog?: DialogLike | null;
  gunDealerDialog?: DialogLike | null;
  gunShopOpen: boolean;
  inTransition: boolean;
  interactionHighlight?: GraphicsLike;
  lastInteractionPromptLabel: string | null;
  mentorDialog?: DialogLike | null;
  px: number;
  py: number;
  time: {
    now: number;
  };
};

export type WorldInteractionDependencies = {
  buildings: WorldBuildingsLike;
  emitPrompt: (payload: PromptEventPayload) => void;
  getColorRgbString: (color: number) => string;
  getGunDealerPosition: () => { x: number; y: number };
  gunShopBounds: BuildingRectLike;
  zones: WorldZonesLike;
};

export type WorldInteractionCallbacks = {
  buildOwnedParcel: () => void;
  closeBarberPanel: () => void;
  closeGunShopPanel: () => void;
  collectNearbyMaterial: () => boolean;
  getNearbyParcel: () => { cost: number; id: string } | null;
  isInteractJustDown: () => boolean;
  openBarberPanel: () => void;
  openCottenksDialog: () => void;
  openMentorDialog: () => void;
  requestParcelBuy: (parcelId: string, cost: number) => void;
  sharedParcelOccupied: (parcelId: string) => boolean;
  transitionToScene: (sceneKey: string) => void;
};

export type WorldResolvedInteractionCallbacks = Omit<
  WorldInteractionCallbacks,
  'collectNearbyMaterial' | 'getNearbyParcel'
> & {
  collectMaterialNode: (node: { value: number }) => void;
};

export type WorldManualInteractionTargets = {
  materialNode: { value: number } | null;
  parcel: { cost: number; id: string } | null;
};

export type WorldInteractionFrameState = {
  manual: WorldManualInteractionTargets;
  target: InteractionTarget | null;
};

export type WorldInteractionFrameResult = WorldInteractionFrameState & {
  handled: boolean;
};

// Future WorldScene integration:
// replace `getInteractionTarget()` by wiring current scene state plus static map deps here.
export function resolveWorldInteractionTarget(
  scene: Pick<
    WorldInteractionSceneLike,
    'barberPanelOpen' | 'cottenksDialog' | 'mentorDialog' | 'px' | 'py'
  >,
  deps: Omit<WorldInteractionDependencies, 'emitPrompt' | 'getColorRgbString'>,
) {
  const { buildings, getGunDealerPosition, gunShopBounds, zones } = deps;
  const { x: gunDealerX, y: gunDealerY } = getGunDealerPosition();
  const arcadeDoorX = buildings.ARCADE.x + buildings.ARCADE.w / 2;
  const storeDoorX = buildings.STORE.x + buildings.STORE.w / 2;
  const cafeDoorX = buildings.CAFE.x + buildings.CAFE.w / 2;
  const casinoDoorX = buildings.CASINO.x + buildings.CASINO.w / 2;
  const gymDoorX = buildings.GYM.x + buildings.GYM.w / 2;
  const basementDoorX = buildings.HOUSE.x + buildings.HOUSE.w / 2;
  const basementDoorY = buildings.HOUSE.y + buildings.HOUSE.h - 32;

  const nearCasino = Math.abs(scene.px - casinoDoorX) < 60 && scene.py < zones.BUILDING_BOTTOM;
  const nearVecindad = scene.px < 220 && scene.py > zones.SOUTH_SIDEWALK_Y - 30 && scene.py < zones.PLAZA_Y + 120;
  const nearPvpBooth = scene.px >= 900 && scene.px <= 1080 && scene.py >= zones.PLAZA_Y + 420 && scene.py <= zones.PLAZA_Y + 550;
  const zombiesPadX = 640;
  const zombiesPadY = zones.PLAZA_Y + 430;
  const nearZombiesPad = Math.abs(scene.px - zombiesPadX) < 90 && Math.abs(scene.py - zombiesPadY) < 80;
  const nearBasement = Math.abs(scene.px - basementDoorX) < 90
    && scene.py >= buildings.HOUSE.y + buildings.HOUSE.h - 90
    && scene.py <= buildings.HOUSE.y + buildings.HOUSE.h + 70;
  const nearArcade = Math.abs(scene.px - arcadeDoorX) < 60 && scene.py < zones.BUILDING_BOTTOM;
  const nearStore = Math.abs(scene.px - storeDoorX) < 60 && scene.py < zones.BUILDING_BOTTOM;
  const nearCafe = Math.abs(scene.px - cafeDoorX) < 60 && scene.py < zones.BUILDING_BOTTOM;
  const nearGunShop = Math.abs(scene.px - gunDealerX) < 92
    && scene.py >= gunShopBounds.y + gunShopBounds.h - 108
    && scene.py <= gunShopBounds.y + gunShopBounds.h + 52;
  const nearGym = Math.abs(scene.px - gymDoorX) < 70
    && scene.py >= buildings.GYM.y + buildings.GYM.h - 80
    && scene.py <= buildings.GYM.y + buildings.GYM.h + 60;

  if (nearVecindad) {
    return { x: 120, y: zones.PLAZA_Y + 40, w: 140, h: 80, label: 'SPACE ENTRAR VECINDAD', color: 0xf5c842, sceneKey: 'VecindadScene' } satisfies InteractionTarget;
  }
  if (nearBasement) {
    return { x: basementDoorX, y: basementDoorY, w: buildings.HOUSE.w + 20, h: buildings.HOUSE.h + 10, label: 'SPACE ENTRAR BASEMENT', color: 0xb48bff, sceneKey: 'BasementScene' } satisfies InteractionTarget;
  }
  if (nearZombiesPad) {
    return { x: zombiesPadX, y: zombiesPadY, w: 200, h: 90, label: 'SPACE ENTRAR MODO ZOMBIES', color: 0xff6ea8, sceneKey: 'ZombiesScene' } satisfies InteractionTarget;
  }
  if (nearPvpBooth) {
    return { x: 990, y: zones.PLAZA_Y + 485, w: 180, h: 90, label: 'SPACE ENTRAR PVP PIT', color: 0xff4da6, sceneKey: 'PvpArenaScene' } satisfies InteractionTarget;
  }
  if (nearArcade) {
    return { x: arcadeDoorX, y: buildings.ARCADE.y + buildings.ARCADE.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR ARCADE', color: 0x46b3ff, sceneKey: 'ArcadeInterior' } satisfies InteractionTarget;
  }
  if (nearStore) {
    return { x: storeDoorX, y: buildings.STORE.y + buildings.STORE.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR SHOP', color: 0x39ff14, sceneKey: 'StoreInterior' } satisfies InteractionTarget;
  }
  if (nearCafe) {
    return { x: cafeDoorX, y: buildings.CAFE.y + buildings.CAFE.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR CAFE', color: 0xff8b3d, sceneKey: 'CafeInterior' } satisfies InteractionTarget;
  }
  if (nearCasino) {
    return { x: casinoDoorX, y: buildings.CASINO.y + buildings.CASINO.h - 28, w: 120, h: 80, label: 'SPACE ENTRAR CASINO', color: 0xf5c842, sceneKey: 'CasinoInterior' } satisfies InteractionTarget;
  }
  if (nearGunShop) {
    return { x: gunDealerX, y: gunDealerY, w: 164, h: 76, label: 'SPACE ENTRAR GUN SHOP', color: 0x46b3ff, sceneKey: 'GunShopInterior' } satisfies InteractionTarget;
  }
  if (nearGym) {
    return { x: gymDoorX, y: buildings.GYM.y + buildings.GYM.h - 28, w: 110, h: 76, label: 'SPACE ENTRAR GYM', color: 0xff2222, sceneKey: 'GymInterior' } satisfies InteractionTarget;
  }

  const mentorX = 1200;
  const mentorY = 558;
  const nearMentor = Math.abs(scene.px - mentorX) < 90 && Math.abs(scene.py - mentorY) < 90;
  if (nearMentor && !scene.mentorDialog?.isActive()) {
    return { x: mentorX, y: mentorY - 36, w: 180, h: 70, label: 'SPACE HABLAR CON EL MENTOR', color: 0x4ecdc4, npcKey: 'mentor' } satisfies InteractionTarget;
  }

  const cottenksX = 1615;
  const cottenksY = 558;
  const nearCottenks = Math.abs(scene.px - cottenksX) < 100 && Math.abs(scene.py - cottenksY) < 100;
  if (nearCottenks && !scene.cottenksDialog?.isActive()) {
    return { x: cottenksX, y: cottenksY - 36, w: 180, h: 70, label: 'SPACE HABLAR CON COTTENKS', color: 0xf5c842, npcKey: 'cottenks' } satisfies InteractionTarget;
  }

  const barberX = 820;
  const barberY = 558;
  const nearBarber = Math.abs(scene.px - barberX) < 90 && Math.abs(scene.py - barberY) < 90;
  if (nearBarber && !scene.barberPanelOpen) {
    return { x: barberX, y: barberY - 36, w: 160, h: 70, label: 'SPACE WARDROBE', color: 0xff88cc, npcKey: 'barber' } satisfies InteractionTarget;
  }

  return null;
}

// Future WorldScene integration:
// replace `updateInteractionHighlight()` and keep prompt emission unified with React bridge.
export function syncWorldInteractionPrompt(
  scene: Pick<WorldInteractionSceneLike, 'interactionHighlight' | 'lastInteractionPromptLabel' | 'time'>,
  target: InteractionTarget | null,
  deps: WorldInteractionDependencies,
) {
  scene.interactionHighlight?.clear();

  if (!target) {
    if (scene.lastInteractionPromptLabel !== null) {
      scene.lastInteractionPromptLabel = null;
      deps.emitPrompt({ text: '', visible: false, color: '#F5C842' });
    }
    return null;
  }

  if (scene.interactionHighlight) {
    const pulse = 0.3 + ((Math.sin(scene.time.now / 180) + 1) * 0.16);
    scene.interactionHighlight.lineStyle(3, target.color, 0.88);
    scene.interactionHighlight.strokeRoundedRect(target.x - target.w / 2, target.y - target.h / 2, target.w, target.h, 10);
    scene.interactionHighlight.fillStyle(target.color, pulse * 0.2);
    scene.interactionHighlight.fillRoundedRect(target.x - target.w / 2, target.y - target.h / 2, target.w, target.h, 10);
  }

  if (scene.lastInteractionPromptLabel !== target.label) {
    scene.lastInteractionPromptLabel = target.label;
    deps.emitPrompt({
      text: target.label,
      visible: true,
      color: deps.getColorRgbString(target.color),
    });
  }

  return target;
}

// Future WorldScene integration:
// call this once per frame to keep target resolution and prompt emission together.
export function updateWorldInteractionPrompt(
  scene: Pick<
    WorldInteractionSceneLike,
    'barberPanelOpen' | 'cottenksDialog' | 'interactionHighlight' | 'lastInteractionPromptLabel' | 'mentorDialog' | 'time' | 'px' | 'py'
  >,
  deps: WorldInteractionDependencies,
) {
  const target = resolveWorldInteractionTarget(scene, deps);
  return syncWorldInteractionPrompt(scene, target, deps);
}

// Future WorldScene integration:
// frame-level wrapper for the current prompt/highlight path.
// Intended replacement shape:
// `const interactionTarget = runWorldInteractionFrame(this, deps);`
export function runWorldInteractionFrame(
  scene: Pick<
    WorldInteractionSceneLike,
    'barberPanelOpen' | 'cottenksDialog' | 'interactionHighlight' | 'lastInteractionPromptLabel' | 'mentorDialog' | 'time' | 'px' | 'py'
  >,
  deps: WorldInteractionDependencies,
) {
  return updateWorldInteractionPrompt(scene, deps);
}

// Future WorldScene integration:
// share nearby vecindad/manual probes between `updateParcelPrompt()` and manual input handling.
export function resolveWorldManualInteractionTargets(probes: {
  getNearbyMaterial: () => { value: number } | null;
  getNearbyParcel: () => { cost: number; id: string } | null;
}): WorldManualInteractionTargets {
  return {
    materialNode: probes.getNearbyMaterial(),
    parcel: probes.getNearbyParcel(),
  };
}

// Future WorldScene integration:
// single frame-level snapshot for prompt/highlight plus vecindad/manual probes.
// This helps reuse one resolved state across update loop, prompt, and manual interact input.
export function resolveWorldInteractionFrameState(
  scene: Pick<
    WorldInteractionSceneLike,
    'barberPanelOpen' | 'cottenksDialog' | 'interactionHighlight' | 'lastInteractionPromptLabel' | 'mentorDialog' | 'time' | 'px' | 'py'
  >,
  deps: WorldInteractionDependencies,
  probes: {
    getNearbyMaterial: () => { value: number } | null;
    getNearbyParcel: () => { cost: number; id: string } | null;
  },
): WorldInteractionFrameState {
  return {
    target: runWorldInteractionFrame(scene, deps),
    manual: resolveWorldManualInteractionTargets(probes),
  };
}

// Future WorldScene integration:
// consume the full frame state in manual/input paths without re-running prompt/highlight or probes.
export function handleWorldInteractionFrameState(
  scene: Pick<WorldInteractionSceneLike, 'cottenksDialog' | 'gunDealerDialog' | 'gunShopOpen' | 'inTransition' | 'mentorDialog'> & {
    barberPanelOpen: boolean;
    vecindadState?: { ownedParcelId?: string };
  },
  frameState: WorldInteractionFrameState,
  callbacks: WorldInteractionCallbacks,
) {
  return handleResolvedWorldInteraction(scene, frameState.target, callbacks);
}

// Future WorldScene integration:
// consume an already resolved frame state and return a single result object for downstream glue code.
export function runWorldInteractionFrameState(
  scene: Pick<WorldInteractionSceneLike, 'cottenksDialog' | 'gunDealerDialog' | 'gunShopOpen' | 'inTransition' | 'mentorDialog'> & {
    barberPanelOpen: boolean;
    vecindadState?: { ownedParcelId?: string };
  },
  frameState: WorldInteractionFrameState,
  callbacks: WorldInteractionCallbacks,
): WorldInteractionFrameResult {
  return {
    ...frameState,
    handled: handleWorldInteractionFrameState(scene, frameState, callbacks),
  };
}

// Future WorldScene integration:
// one-call bridge when the scene wants the full frame result without chaining helpers manually.
export function resolveAndRunWorldInteractionFrame(
  scene: Pick<
    WorldInteractionSceneLike,
    | 'barberPanelOpen'
    | 'cottenksDialog'
    | 'gunDealerDialog'
    | 'gunShopOpen'
    | 'inTransition'
    | 'interactionHighlight'
    | 'lastInteractionPromptLabel'
    | 'mentorDialog'
    | 'px'
    | 'py'
    | 'time'
  > & {
    vecindadState?: { ownedParcelId?: string };
  },
  deps: WorldInteractionDependencies,
  probes: {
    getNearbyMaterial: () => { value: number } | null;
    getNearbyParcel: () => { cost: number; id: string } | null;
  },
  callbacks: WorldInteractionCallbacks,
): WorldInteractionFrameResult {
  const frameState = resolveWorldInteractionFrameState(scene, deps, probes);
  return runWorldInteractionFrameState(scene, frameState, callbacks);
}

// Future WorldScene integration:
// input path that consumes both `target` and already-resolved manual probes from the frame result.
// This removes the need to re-run nearby material/parcel getters inside manual interaction handling.
export function handleResolvedWorldInteractionResult(
  scene: Pick<WorldInteractionSceneLike, 'cottenksDialog' | 'gunDealerDialog' | 'gunShopOpen' | 'inTransition' | 'mentorDialog'> & {
    barberPanelOpen: boolean;
    vecindadState?: { ownedParcelId?: string };
  },
  interactionResult: Pick<WorldInteractionFrameResult, 'manual' | 'target'>,
  callbacks: WorldResolvedInteractionCallbacks,
) {
  if (scene.inTransition) return false;
  if (!callbacks.isInteractJustDown()) return false;

  if (scene.gunDealerDialog?.isActive()) {
    scene.gunDealerDialog.advance();
    return true;
  }

  if (scene.mentorDialog?.isActive()) {
    scene.mentorDialog.advance();
    return true;
  }

  if (scene.cottenksDialog?.isActive()) {
    scene.cottenksDialog.advance();
    return true;
  }

  if (scene.gunShopOpen) {
    callbacks.closeGunShopPanel();
    return true;
  }

  if (interactionResult.target?.sceneKey) {
    callbacks.transitionToScene(interactionResult.target.sceneKey);
    return true;
  }
  if (interactionResult.target?.npcKey === 'mentor') {
    callbacks.openMentorDialog();
    return true;
  }
  if (interactionResult.target?.npcKey === 'cottenks') {
    callbacks.openCottenksDialog();
    return true;
  }
  if (interactionResult.target?.npcKey === 'barber') {
    callbacks.openBarberPanel();
    return true;
  }

  if (scene.barberPanelOpen) {
    callbacks.closeBarberPanel();
    return true;
  }

  if (interactionResult.manual.materialNode) {
    callbacks.collectMaterialNode(interactionResult.manual.materialNode);
    return true;
  }

  const nearParcel = interactionResult.manual.parcel;
  if (!nearParcel) return false;

  if (scene.vecindadState?.ownedParcelId === nearParcel.id) {
    callbacks.buildOwnedParcel();
    return true;
  }

  if (!scene.vecindadState?.ownedParcelId && !callbacks.sharedParcelOccupied(nearParcel.id)) {
    callbacks.requestParcelBuy(nearParcel.id, nearParcel.cost);
    return true;
  }

  return false;
}

// Future WorldScene integration:
// one-call path for scenes that already want prompt/highlight sync plus manual input handling
// without re-running nearby material/parcel probes.
export function resolveAndHandleWorldInteractionFrame(
  scene: Pick<
    WorldInteractionSceneLike,
    | 'barberPanelOpen'
    | 'cottenksDialog'
    | 'gunDealerDialog'
    | 'gunShopOpen'
    | 'inTransition'
    | 'interactionHighlight'
    | 'lastInteractionPromptLabel'
    | 'mentorDialog'
    | 'px'
    | 'py'
    | 'time'
  > & {
    vecindadState?: { ownedParcelId?: string };
  },
  deps: WorldInteractionDependencies,
  probes: {
    getNearbyMaterial: () => { value: number } | null;
    getNearbyParcel: () => { cost: number; id: string } | null;
  },
  callbacks: WorldResolvedInteractionCallbacks,
): WorldInteractionFrameResult {
  const frameState = resolveWorldInteractionFrameState(scene, deps, probes);
  return {
    ...frameState,
    handled: handleResolvedWorldInteractionResult(scene, frameState, callbacks),
  };
}

// Future WorldScene integration:
// tiny bridge between frame target resolution and the current input dispatch path.
// Intended usage:
// `runWorldInteractionFrameInput(this, deps, callbacks);`
export function runWorldInteractionFrameInput(
  scene: Pick<
    WorldInteractionSceneLike,
    | 'barberPanelOpen'
    | 'cottenksDialog'
    | 'gunDealerDialog'
    | 'gunShopOpen'
    | 'inTransition'
    | 'interactionHighlight'
    | 'lastInteractionPromptLabel'
    | 'mentorDialog'
    | 'px'
    | 'py'
    | 'time'
  > & {
    vecindadState?: { ownedParcelId?: string };
  },
  deps: WorldInteractionDependencies,
  callbacks: WorldInteractionCallbacks,
) {
  const target = runWorldInteractionFrame(scene, deps);
  const handled = handleWorldInteraction(scene, target, callbacks);
  return { handled, target };
}

// Future WorldScene integration:
// input-only bridge for cases where the frame loop already resolved the target.
// This avoids re-running prompt/highlight work from ad-hoc input paths.
export function handleResolvedWorldInteraction(
  scene: Pick<WorldInteractionSceneLike, 'cottenksDialog' | 'gunDealerDialog' | 'gunShopOpen' | 'inTransition' | 'mentorDialog'> & {
    barberPanelOpen: boolean;
    vecindadState?: { ownedParcelId?: string };
  },
  target: InteractionTarget | null,
  callbacks: WorldInteractionCallbacks,
) {
  return handleWorldInteraction(scene, target, callbacks);
}

// Future WorldScene integration:
// explicit manual-button path that consumes a target already resolved during the frame update.
// Keeps frame update (`runWorldInteractionFrame`) separate from ad-hoc input dispatch.
export function runManualWorldInteraction(
  scene: Pick<WorldInteractionSceneLike, 'cottenksDialog' | 'gunDealerDialog' | 'gunShopOpen' | 'inTransition' | 'mentorDialog'> & {
    barberPanelOpen: boolean;
    vecindadState?: { ownedParcelId?: string };
  },
  resolvedTarget: InteractionTarget | null,
  callbacks: WorldInteractionCallbacks,
) {
  return handleResolvedWorldInteraction(scene, resolvedTarget, callbacks);
}

// Future WorldScene integration:
// replace the top-level branching inside `handleInteraction()` with scene-bound callbacks.
export function handleWorldInteraction(
  scene: Pick<WorldInteractionSceneLike, 'cottenksDialog' | 'gunDealerDialog' | 'gunShopOpen' | 'inTransition' | 'mentorDialog'> & {
    barberPanelOpen: boolean;
    vecindadState?: { ownedParcelId?: string };
  },
  target: InteractionTarget | null,
  callbacks: WorldInteractionCallbacks,
) {
  if (scene.inTransition) return false;
  if (!callbacks.isInteractJustDown()) return false;

  if (scene.gunDealerDialog?.isActive()) {
    scene.gunDealerDialog.advance();
    return true;
  }

  if (scene.mentorDialog?.isActive()) {
    scene.mentorDialog.advance();
    return true;
  }

  if (scene.cottenksDialog?.isActive()) {
    scene.cottenksDialog.advance();
    return true;
  }

  if (scene.gunShopOpen) {
    callbacks.closeGunShopPanel();
    return true;
  }

  if (target?.sceneKey) {
    callbacks.transitionToScene(target.sceneKey);
    return true;
  }
  if (target?.npcKey === 'mentor') {
    callbacks.openMentorDialog();
    return true;
  }
  if (target?.npcKey === 'cottenks') {
    callbacks.openCottenksDialog();
    return true;
  }
  if (target?.npcKey === 'barber') {
    callbacks.openBarberPanel();
    return true;
  }

  if (scene.barberPanelOpen) {
    callbacks.closeBarberPanel();
    return true;
  }

  if (callbacks.collectNearbyMaterial()) {
    return true;
  }

  const nearParcel = callbacks.getNearbyParcel();
  if (!nearParcel) return false;

  if (scene.vecindadState?.ownedParcelId === nearParcel.id) {
    callbacks.buildOwnedParcel();
    return true;
  }

  if (!scene.vecindadState?.ownedParcelId && !callbacks.sharedParcelOccupied(nearParcel.id)) {
    callbacks.requestParcelBuy(nearParcel.id, nearParcel.cost);
    return true;
  }

  return false;
}
