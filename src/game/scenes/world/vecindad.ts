export type VecindadStateLike = {
  buildStage: number;
  cannabisFarmUnlocked: boolean;
  farmPlants: unknown[];
  materials: number;
  ownedParcelId?: string;
};

export type SharedParcelStateLike = {
  buildStage: number;
  ownerUsername: string;
  parcelId: string;
};

export type VecindadParcelConfigLike = {
  cost: number;
  h: number;
  id: string;
  w: number;
  x: number;
  y: number;
};

type TextLike = {
  setColor(color: string): TextLike;
  setDepth(depth: number): TextLike;
  setOrigin(x: number, y?: number): TextLike;
  setScrollFactor(factor: number): TextLike;
  setText(text: string | string[]): TextLike;
  setVisible(visible: boolean): TextLike;
  setStyle(style: { color: string }): TextLike;
};

type GraphicsLike = {
  clear(): GraphicsLike;
};

export type ParcelVisualLike = {
  badge: TextLike;
  detail: TextLike;
  status: TextLike;
  structure: GraphicsLike;
  title: TextLike;
};

export type VecindadZonesLike = {
  VECINDAD_H: number;
  VECINDAD_W: number;
  VECINDAD_X: number;
  VECINDAD_Y: number;
};

export type VecindadSceneLike = {
  add: {
    text(
      x: number,
      y: number,
      text: string | string[],
      style: {
        color: string;
        fontFamily: string;
        fontSize: string;
        lineSpacing?: number;
        stroke?: string;
        strokeThickness?: number;
      },
    ): TextLike;
  };
  parcelPrompt?: TextLike;
  parcelVisuals: Map<string, ParcelVisualLike>;
  px: number;
  py: number;
  sharedParcelState: Map<string, SharedParcelStateLike>;
  vecindadHud?: TextLike;
  vecindadState: VecindadStateLike;
};

export type VecindadPromptState = {
  color: string;
  text: string;
};

export type VecindadInteractionKind =
  | 'none'
  | 'collect'
  | 'build'
  | 'buy'
  | 'occupied'
  | 'owned-max'
  | 'owned-other';

export type VecindadInteractionState = {
  kind: VecindadInteractionKind;
  parcel: VecindadParcelConfigLike | null;
  prompt: VecindadPromptState;
};

export type VecindadInteractionAction = VecindadInteractionState & {
  buildCost: number | null;
  parcelId: string | null;
};

export type VecindadInteractionActionCallbacks = {
  collectNearbyMaterial: () => boolean;
  buildOwnedParcel: () => void;
  requestParcelBuy: (parcelId: string, cost: number) => void;
  onOccupiedParcel?: (parcelId: string) => void;
  onAlreadyOwnsParcel?: (parcelId: string) => void;
};

export type VecindadInteractionExecutionResult = {
  handled: boolean;
  branch: VecindadInteractionKind;
};

export type VecindadUiSyncResult = {
  action: VecindadInteractionAction;
  hud: TextLike | undefined;
  prompt: VecindadPromptState;
};

export type VecindadSceneSyncResult = VecindadUiSyncResult;

export type VecindadParcelVisualSyncOptions = {
  drawParcelStructure: (parcel: VecindadParcelConfigLike, graphics: GraphicsLike, buildStage: number) => void;
  maxStage: number;
  onAfterRefresh?: () => void;
};

export type VecindadSceneSyncOptions = VecindadParcelVisualSyncOptions & {
  sharedParcels: SharedParcelStateLike[];
  visualParcels: VecindadParcelConfigLike[];
  getBuildCost: (stage: number) => number;
  isInsideDistrict: boolean;
  maxStage: number;
  nearbyMaterial?: { value: number } | null;
  nearbyParcel?: VecindadParcelConfigLike | null;
};

export type VecindadPromptApplyTarget = {
  setText(text: string): unknown;
  setStyle(style: { color: string }): unknown;
};

export type VecindadPromptSceneLike = Pick<VecindadSceneLike, 'sharedParcelState' | 'vecindadState'>;

export type VecindadMaterialNodeLike = {
  available: boolean;
  band: {
    setVisible(visible: boolean): unknown;
  };
  crate: {
    setVisible(visible: boolean): unknown;
  };
  label: {
    setVisible(visible: boolean): unknown;
  };
  respawnAt: number;
  value: number;
};

// Future WorldScene integration:
// use as the fallback state for `this.vecindadState` and for storage parse failures.
export function createDefaultVecindadState(): VecindadStateLike {
  return {
    ownedParcelId: undefined,
    buildStage: 0,
    materials: 0,
    cannabisFarmUnlocked: false,
    farmPlants: [],
  };
}

// Future WorldScene integration:
// `loadVecindadState()` -> parse `waspi_player_state` and assign `this.vecindadState`.
export function loadVecindadStateFromStorage(raw: string | null | undefined): VecindadStateLike {
  if (!raw) return createDefaultVecindadState();

  try {
    const parsed = JSON.parse(raw) as { vecindad?: Partial<VecindadStateLike> };
    return {
      ownedParcelId: typeof parsed.vecindad?.ownedParcelId === 'string' ? parsed.vecindad.ownedParcelId : undefined,
      buildStage: typeof parsed.vecindad?.buildStage === 'number' ? parsed.vecindad.buildStage : 0,
      materials: typeof parsed.vecindad?.materials === 'number' ? parsed.vecindad.materials : 0,
      cannabisFarmUnlocked: typeof parsed.vecindad?.cannabisFarmUnlocked === 'boolean'
        ? parsed.vecindad.cannabisFarmUnlocked
        : false,
      farmPlants: Array.isArray(parsed.vecindad?.farmPlants) ? parsed.vecindad.farmPlants : [],
    };
  } catch {
    return createDefaultVecindadState();
  }
}

// Future WorldScene integration:
// `applySharedVecindadParcels()` -> update the map, then call `refreshVecindadParcelVisuals(...)`.
export function applySharedVecindadParcels(
  scene: Pick<VecindadSceneLike, 'sharedParcelState'>,
  parcels: SharedParcelStateLike[],
) {
  scene.sharedParcelState.clear();
  parcels.forEach((parcel) => {
    scene.sharedParcelState.set(parcel.parcelId, parcel);
  });
}

// Future WorldScene integration:
// `refreshParcelVisuals()` -> pass `this`, `VECINDAD_PARCELS`, and existing structure/HUD callbacks.
export function refreshVecindadParcelVisuals(
  scene: Pick<VecindadSceneLike, 'parcelVisuals' | 'sharedParcelState' | 'vecindadState'>,
  parcels: VecindadParcelConfigLike[],
  options: VecindadParcelVisualSyncOptions,
) {
  for (const parcel of parcels) {
    const visuals = scene.parcelVisuals.get(parcel.id);
    if (!visuals) continue;

    const shared = scene.sharedParcelState.get(parcel.id);
    const ownedByMe = scene.vecindadState.ownedParcelId === parcel.id;
    const occupiedByAnother = Boolean(shared && !ownedByMe);
    const playerOwnsAnother = Boolean(scene.vecindadState.ownedParcelId && !ownedByMe);
    const buildStage = ownedByMe
      ? Math.max(1, scene.vecindadState.buildStage)
      : shared?.buildStage ?? 0;

    visuals.status.setText(
      ownedByMe
        ? 'TU PARCELA'
        : occupiedByAnother
          ? 'OCUPADA'
          : 'FOR SALE',
    );
    visuals.status.setColor(
      ownedByMe
        ? '#39FF14'
        : occupiedByAnother
          ? '#46B3FF'
          : '#E6E1C8',
    );

    visuals.detail.setText(
      ownedByMe
        ? `STAGE ${buildStage} / MATS ${scene.vecindadState.materials}`
        : occupiedByAnother
          ? `${shared?.ownerUsername ?? 'VECINO'} · STAGE ${buildStage}`
          : playerOwnsAnother
            ? 'YA TENES OTRA PARCELA'
            : 'COMPRA Y CONSTRUYE',
    );
    visuals.detail.setColor(
      ownedByMe
        ? '#B9FF9E'
        : occupiedByAnother
          ? '#9EDCFF'
          : playerOwnsAnother
            ? '#FFB36A'
            : '#9EB09A',
    );

    visuals.badge.setText(
      ownedByMe
        ? 'OWNED'
        : occupiedByAnother
          ? `@${(shared?.ownerUsername ?? 'vecino').slice(0, 10)}`
          : `${parcel.cost}T`,
    );
    visuals.badge.setColor(ownedByMe ? '#39FF14' : occupiedByAnother ? '#46B3FF' : '#F5C842');

    options.drawParcelStructure(parcel, visuals.structure, buildStage);
  }

  options.onAfterRefresh?.();
}

// Future WorldScene integration:
// apply shared parcel state and refresh visuals in one call for realtime updates.
export function syncSharedVecindadParcelVisuals(
  scene: Pick<VecindadSceneLike, 'parcelVisuals' | 'sharedParcelState' | 'vecindadState'>,
  parcels: SharedParcelStateLike[],
  visualParcels: VecindadParcelConfigLike[],
  options: VecindadParcelVisualSyncOptions,
) {
  applySharedVecindadParcels(scene, parcels);
  refreshVecindadParcelVisuals(scene, visualParcels, options);
}

// Future WorldScene integration:
// one-call sync for shared parcels, visuals, HUD, and interaction prompt/action.
export function syncVecindadScene(
  scene: Pick<VecindadSceneLike, 'add' | 'parcelPrompt' | 'parcelVisuals' | 'sharedParcelState' | 'vecindadHud' | 'vecindadState'>,
  options: VecindadSceneSyncOptions,
): VecindadSceneSyncResult {
  syncSharedVecindadParcelVisuals(scene, options.sharedParcels, options.visualParcels, options);
  return syncVecindadUi(scene, options);
}

// Future WorldScene integration:
// `renderVecindadHud()` -> call after parcel refresh and on state changes.
export function renderVecindadHud(
  scene: Pick<VecindadSceneLike, 'add' | 'vecindadHud' | 'vecindadState'> & {
    vecindadHud?: TextLike;
  },
  options: {
    getBuildCost: (stage: number) => number;
    isInsideDistrict: boolean;
    maxStage: number;
  },
) {
  const parcel = scene.vecindadState.ownedParcelId
    ? `PARCELA ${scene.vecindadState.ownedParcelId}`
    : 'SIN PARCELA';
  const stage = Math.max(0, scene.vecindadState.buildStage);
  const nextCost = stage >= options.maxStage ? 0 : options.getBuildCost(Math.max(stage, 1));
  const text = [
    'LA VECINDAD',
    parcel,
    `MATS ${scene.vecindadState.materials}`,
    `STAGE ${stage}/${options.maxStage}${stage >= options.maxStage ? ' MAX' : ` NEXT ${nextCost}`}`,
  ];

  if (!scene.vecindadHud) {
    scene.vecindadHud = scene.add.text(8, 92, text, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B9FF9E',
      lineSpacing: 6,
      stroke: '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0).setDepth(9999);
    scene.vecindadHud.setVisible(options.isInsideDistrict);
    return scene.vecindadHud;
  }

  scene.vecindadHud.setText(text);
  scene.vecindadHud.setVisible(options.isInsideDistrict);
  return scene.vecindadHud;
}

// Future WorldScene integration:
// `updateParcelPrompt()` -> compute prompt first, then push text/color into `this.parcelPrompt`.
export function resolveVecindadPromptState(
  scene: Pick<VecindadSceneLike, 'sharedParcelState' | 'vecindadState'>,
  options: {
    getBuildCost: (stage: number) => number;
    maxStage: number;
    nearbyMaterial?: { value: number } | null;
    nearbyParcel?: VecindadParcelConfigLike | null;
  },
): VecindadPromptState {
  if (options.nearbyMaterial) {
    return {
      text: `E RECOGER TU CACHE +${options.nearbyMaterial.value} MATS`,
      color: '#B9FF9E',
    };
  }

  const parcel = options.nearbyParcel;
  if (!parcel) {
    return { text: '', color: '#F5C842' };
  }

  if (scene.vecindadState.ownedParcelId === parcel.id) {
    const currentStage = Math.max(1, scene.vecindadState.buildStage);
    if (currentStage >= options.maxStage) {
      return { text: `PARCELA ${parcel.id} COMPLETA`, color: '#39FF14' };
    }

    const cost = options.getBuildCost(currentStage);
    return {
      text: `E CONSTRUIR STAGE ${currentStage + 1} - ${cost} MATS`,
      color: '#39FF14',
    };
  }

  const shared = scene.sharedParcelState.get(parcel.id);
  if (shared) {
    return {
      text: `PARCELA ${parcel.id} OCUPADA POR ${shared.ownerUsername.toUpperCase()}`,
      color: '#46B3FF',
    };
  }

  if (scene.vecindadState.ownedParcelId) {
    return {
      text: 'YA TENES UNA PARCELA EN LA VECINDAD',
      color: '#FFB36A',
    };
  }

  return {
    text: `E COMPRAR PARCELA ${parcel.id} - ${parcel.cost} TENKS`,
    color: '#F5C842',
  };
}

// Future WorldScene integration:
// use this when the interaction flow needs both the prompt text and the action kind.
export function resolveVecindadInteractionState(
  scene: VecindadPromptSceneLike,
  options: {
    getBuildCost: (stage: number) => number;
    maxStage: number;
    nearbyMaterial?: { value: number } | null;
    nearbyParcel?: VecindadParcelConfigLike | null;
  },
): VecindadInteractionState {
  const prompt = resolveVecindadPromptState(scene, options);

  if (options.nearbyMaterial) {
    return {
      kind: 'collect',
      parcel: null,
      prompt,
    };
  }

  const parcel = options.nearbyParcel ?? null;
  if (!parcel) {
    return {
      kind: 'none',
      parcel: null,
      prompt,
    };
  }

  if (scene.vecindadState.ownedParcelId === parcel.id) {
    const currentStage = Math.max(1, scene.vecindadState.buildStage);
    return {
      kind: currentStage >= options.maxStage ? 'owned-max' : 'build',
      parcel,
      prompt,
    };
  }

  if (scene.sharedParcelState.get(parcel.id)) {
    return {
      kind: 'occupied',
      parcel,
      prompt,
    };
  }

  if (scene.vecindadState.ownedParcelId) {
    return {
      kind: 'owned-other',
      parcel,
      prompt,
    };
  }

  return {
    kind: 'buy',
    parcel,
    prompt,
  };
}

// Future WorldScene integration:
// use this when the interaction flow needs a single actionable parcel/material decision.
export function resolveVecindadInteractionAction(
  scene: VecindadPromptSceneLike,
  options: {
    getBuildCost: (stage: number) => number;
    maxStage: number;
    nearbyMaterial?: { value: number } | null;
    nearbyParcel?: VecindadParcelConfigLike | null;
  },
): VecindadInteractionAction {
  const state = resolveVecindadInteractionState(scene, options);
  const parcelId = state.parcel?.id ?? null;

  if (state.kind === 'build') {
    const currentStage = Math.max(1, scene.vecindadState.buildStage);
    return {
      ...state,
      parcelId,
      buildCost: options.getBuildCost(currentStage),
    };
  }

  if (state.kind === 'buy') {
    return {
      ...state,
      parcelId,
      buildCost: state.parcel?.cost ?? null,
    };
  }

  return {
    ...state,
    parcelId,
    buildCost: null,
  };
}

// Future WorldScene integration:
// execute the resolved parcel/material action without re-branching in the scene.
export function executeVecindadInteractionAction(
  action: VecindadInteractionAction,
  callbacks: VecindadInteractionActionCallbacks,
): VecindadInteractionExecutionResult {
  if (action.kind === 'collect') {
    return { handled: callbacks.collectNearbyMaterial(), branch: 'collect' };
  }

  if (action.kind === 'build') {
    callbacks.buildOwnedParcel();
    return { handled: true, branch: 'build' };
  }

  if (action.kind === 'buy' && action.parcelId && action.buildCost !== null) {
    callbacks.requestParcelBuy(action.parcelId, action.buildCost);
    return { handled: true, branch: 'buy' };
  }

  if (action.kind === 'occupied' && action.parcelId) {
    callbacks.onOccupiedParcel?.(action.parcelId);
    return { handled: false, branch: 'occupied' };
  }

  if (action.kind === 'owned-other' && action.parcelId) {
    callbacks.onAlreadyOwnsParcel?.(action.parcelId);
    return { handled: false, branch: 'owned-other' };
  }

  return { handled: false, branch: 'none' };
}

// Future WorldScene integration:
// call once per frame or interaction change to keep parcel prompt text + color in sync.
export function syncVecindadPrompt(
  scene: VecindadPromptSceneLike,
  prompt: VecindadPromptApplyTarget | null | undefined,
  options: {
    getBuildCost: (stage: number) => number;
    maxStage: number;
    nearbyMaterial?: { value: number } | null;
    nearbyParcel?: VecindadParcelConfigLike | null;
  },
) {
  if (!prompt) return resolveVecindadPromptState(scene, options);

  const state = resolveVecindadInteractionAction(scene, options);
  prompt.setText(state.prompt.text);
  prompt.setStyle({ color: state.prompt.color });
  return state.prompt;
}

// Future WorldScene integration:
// call this from `updateParcelPrompt()` and let the module own the UI glue.
export function updateVecindadParcelPrompt(
  scene: Pick<VecindadSceneLike, 'parcelPrompt' | 'sharedParcelState' | 'vecindadState'>,
  options: {
    getBuildCost: (stage: number) => number;
    maxStage: number;
    nearbyMaterial?: { value: number } | null;
    nearbyParcel?: VecindadParcelConfigLike | null;
  },
) {
  return syncVecindadPrompt(scene, scene.parcelPrompt, options);
}

// Future WorldScene integration:
// one-call sync for prompt + HUD + resolved interaction action.
export function syncVecindadUi(
  scene: Pick<VecindadSceneLike, 'add' | 'parcelPrompt' | 'vecindadHud' | 'sharedParcelState' | 'vecindadState'>,
  options: {
    getBuildCost: (stage: number) => number;
    isInsideDistrict: boolean;
    maxStage: number;
    nearbyMaterial?: { value: number } | null;
    nearbyParcel?: VecindadParcelConfigLike | null;
  },
): VecindadUiSyncResult {
  const action = resolveVecindadInteractionAction(scene, options);
  const prompt = syncVecindadPrompt(scene, scene.parcelPrompt, options);
  const hud = renderVecindadHud(scene, options);

  return { action, hud, prompt };
}

// Future WorldScene integration:
// `isInsideVecindadDistrict()` -> reuse from update loop / HUD visibility / prompt visibility.
export function isInsideVecindadDistrict(
  scene: Pick<VecindadSceneLike, 'px' | 'py'>,
  zones: VecindadZonesLike,
) {
  return scene.px >= zones.VECINDAD_X
    && scene.px <= zones.VECINDAD_X + zones.VECINDAD_W
    && scene.py >= zones.VECINDAD_Y
    && scene.py <= zones.VECINDAD_Y + zones.VECINDAD_H;
}

export function collectVecindadMaterial(
  scene: Pick<VecindadSceneLike, 'vecindadState'> & {
    refreshParcelVisuals: () => void;
  },
  node: VecindadMaterialNodeLike,
  options: {
    nextRespawnAt: number;
    onCollected: (nextState: VecindadStateLike, nodeValue: number) => void;
  },
) {
  node.available = false;
  node.respawnAt = options.nextRespawnAt;
  node.crate.setVisible(false);
  node.band.setVisible(false);
  node.label.setVisible(false);

  const nextState: VecindadStateLike = {
    ...scene.vecindadState,
    materials: scene.vecindadState.materials + node.value,
  };
  scene.vecindadState = nextState;
  scene.refreshParcelVisuals();
  options.onCollected(nextState, node.value);
  return nextState;
}

export function resolveOwnedParcelBuildAttempt(
  state: Pick<VecindadStateLike, 'buildStage' | 'materials' | 'ownedParcelId'>,
  options: {
    getBuildCost: (stage: number) => number;
    maxStage: number;
  },
) {
  if (!state.ownedParcelId) {
    return {
      allowed: false,
      cost: null,
      reason: 'no-owned-parcel' as const,
      stage: null,
    };
  }

  const currentStage = Math.max(1, state.buildStage);
  if (currentStage >= options.maxStage) {
    return {
      allowed: false,
      cost: null,
      reason: 'max-stage' as const,
      stage: currentStage,
    };
  }

  const cost = options.getBuildCost(currentStage);
  if (state.materials < cost) {
    return {
      allowed: false,
      cost,
      reason: 'insufficient-materials' as const,
      stage: currentStage,
    };
  }

  return {
    allowed: true,
    cost,
    reason: 'ready' as const,
    stage: currentStage,
  };
}
