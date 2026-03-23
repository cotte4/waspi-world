export const WORLD_SCENE_KEY = 'WorldScene';
export const WORLD_REALTIME_CHANNEL = 'waspi-world';

export const WORLD_VOICE_PREF_KEY = 'waspi_voice_pref';
export const WORLD_VOICE_MIC_DEVICE_KEY = 'waspi_voice_mic_device_id';
export const WORLD_VOICE_MIC_GRANT_RELOAD_KEY = 'waspi_voice_mic_grant_reload_done';

export const WORLD_REMOTE_RATE_LIMITS = {
  moveMinMs: 100,
  chatMinMs: 1000,
  hitMinMs: 120,
} as const;

export const WORLD_REMOTE_LIMITS = {
  maxChatDistancePx: 2600,
  maxHitDistancePx: 600,
  localHitCooldownMs: 600,
  positionBroadcastMinMs: 66,
  positionBroadcastMinDeltaPx: 2,
} as const;

export const WORLD_VOICE_HUD = {
  bottomOffsetPx: 118,
  buttonDepth: 9999,
  promptDepth: 10001,
  speakingIndicatorDepth: 200,
  speakingIndicatorRadius: 5,
  statusClearDelayMs: 4000,
} as const;

export const WORLD_NPC_KEYS = {
  mentor: 'mentor',
  cottenks: 'cottenks',
  barber: 'barber',
} as const;

export type WorldNpcKey = typeof WORLD_NPC_KEYS[keyof typeof WORLD_NPC_KEYS];

export const WORLD_NPC_POSITIONS = {
  mentor: { x: 1200, y: 558 },
  cottenks: { x: 1615, y: 558 },
  barber: { x: 820, y: 558 },
} as const;

export const WORLD_INTERACTION_PROMPT_DEFAULT = {
  color: '#F5C842',
  visible: false,
  text: '',
} as const;

export const WORLD_BUILDING_PROMPT_LAYOUT = {
  defaultWidth: 110,
  defaultHeight: 76,
  casinoWidth: 120,
  casinoHeight: 80,
  vecindadWidth: 140,
  vecindadHeight: 80,
  zombiesWidth: 200,
  zombiesHeight: 90,
  pvpWidth: 180,
  pvpHeight: 90,
  npcWidth: 180,
  npcHeight: 70,
  barberWidth: 160,
  barberHeight: 70,
} as const;

export const WORLD_RENDER_LAYERS = {
  background: -10,
  ground: 0,
  street: 1,
  facadeMarkers: 1.8,
  overlay: 9999,
  interactionHighlight: 3100,
  interactionHint: 3101,
  npcNameplate: 9000,
} as const;

export type WorldRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WorldPoint = {
  x: number;
  y: number;
};

export type WorldNamedPoint = WorldPoint & {
  id: string;
};

export type WorldInteractionPrompt = {
  text: string;
  visible: boolean;
  color: string;
};

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

export type WorldParcelSnapshot = {
  parcelId: string;
  ownerId?: string;
  ownerUsername?: string;
  buildStage: number;
};

export type WorldRemoteMoveEvent = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  dir: number;
  dy: number;
  moving: boolean;
  weapon?: string;
  aim?: number;
  action?: string;
};

export type WorldRemoteChatEvent = {
  player_id: string;
  username: string;
  message: string;
  x: number;
  y: number;
};

export type WorldRemoteStateEvent = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  avatar?: Record<string, unknown>;
  equipped?: { top?: string; bottom?: string };
  weapon?: string;
  aim?: number;
  action?: string;
};

export type WorldRemoteHitEvent = {
  target_id: string;
  source_id: string;
  dmg: number;
  kx?: number;
  ky?: number;
};

export function createWorldInteractionPrompt(
  text = WORLD_INTERACTION_PROMPT_DEFAULT.text,
  visible = WORLD_INTERACTION_PROMPT_DEFAULT.visible,
  color = WORLD_INTERACTION_PROMPT_DEFAULT.color,
): WorldInteractionPrompt {
  return { text, visible, color };
}

export function isWorldNpcKey(value: unknown): value is WorldNpcKey {
  return value === WORLD_NPC_KEYS.mentor
    || value === WORLD_NPC_KEYS.cottenks
    || value === WORLD_NPC_KEYS.barber;
}

export function getWorldNpcPosition(npcKey: WorldNpcKey): WorldPoint {
  return WORLD_NPC_POSITIONS[npcKey];
}

