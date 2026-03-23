import Phaser from 'phaser';
import { CHAT, ZONES } from '../../config/constants';
import { eventBus, EVENTS } from '../../config/eventBus';
import { supabase, isConfigured } from '../../../lib/supabase';
import { preferSupabaseHttpBroadcast } from '../../../lib/supabaseRealtime';
import type { SharedParcelState } from '../../../lib/vecindad';
import { MAX_VECINDAD_STAGE, getBuildCost } from '../../../lib/vecindad';
import type { VecindadState } from '../../../lib/playerState';
import type { PresenceVoice, WorldVoiceSceneLike } from './voice';
import {
  handleWorldVoicePresenceJoin,
  handleWorldVoicePresenceLeave,
  handleWorldVoicePresenceSync,
} from './voice';

const REMOTE_MOVE_MIN_MS = 100;

type RealtimeChannelLike = ReturnType<NonNullable<typeof supabase>['channel']>;

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

export type WorldParcelVisual = {
  title: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text;
  structure: Phaser.GameObjects.Graphics;
};

export type WorldRealtimeVecindadSceneLike = Omit<WorldVoiceSceneLike, 'channel'> & {
  channel: RealtimeChannelLike | null;
  bridgeCleanupFns: Array<() => void>;
  playerUsername: string;
  px: number;
  py: number;
  lastMoveDx: number;
  lastMoveDy: number;
  lastIsMoving: boolean;
  lastPosSent: number;
  lastBroadcastX: number;
  lastBroadcastY: number;
  remoteMoveTimes: Map<string, number>;
  vecindadState: VecindadState;
  sharedParcelState: Map<string, SharedParcelState>;
  vecindadHud?: Phaser.GameObjects.Text;
  parcelVisuals: Map<string, WorldParcelVisual>;
  inputBlocked?: boolean;
  lastChatSent?: number;
  emitPresence: () => void;
  broadcastSelfState: (event: string, action?: string) => void;
  handleRemoteMove: (payload: unknown) => void;
  handleRemoteChat: (payload: unknown) => void;
  handleRemoteJoin: (payload: unknown) => void;
  handleRemoteLeave: (payload: unknown) => void;
  handleRemoteUpdate: (payload: unknown) => void;
  handleRemoteVecindadUpdate: (payload: unknown) => void;
  handleHit: (payload: unknown) => void;
  handleRemoteEmote: (payload: unknown) => void;
  allowRemoteEvent: (map: Map<string, number>, key: string, minMs: number) => boolean;
  applySharedVecindadParcels?: (parcels: SharedParcelState[]) => void;
  broadcastVecindadState?: (parcels: SharedParcelState[]) => void;
};

export function setupWorldRealtimeBridge(scene: WorldRealtimeVecindadSceneLike): 'multiplayer' | 'solo' {
  if (!supabase || !isConfigured) {
    console.log('[Waspi] Supabase not configured - solo mode');
    return 'solo';
  }

  const channel = preferSupabaseHttpBroadcast(supabase.channel('waspi-world', {
    config: {
      broadcast: { self: false },
      presence: { key: scene.playerId },
    },
  }));
  scene.channel = channel;
  const voiceScene = scene as unknown as WorldVoiceSceneLike;

  channel
    .on('broadcast', { event: 'player:move' }, ({ payload }) => {
      if (allowWorldRemoteMove(scene, payload)) scene.handleRemoteMove(payload);
    })
    .on('broadcast', { event: 'player:chat' }, ({ payload }) => {
      scene.handleRemoteChat(payload);
    })
    .on('broadcast', { event: 'player:join' }, ({ payload }) => {
      scene.handleRemoteJoin(payload);
    })
    .on('broadcast', { event: 'player:leave' }, ({ payload }) => {
      scene.handleRemoteLeave(payload);
    })
    .on('broadcast', { event: 'player:update' }, ({ payload }) => {
      scene.handleRemoteUpdate(payload);
    })
    .on('broadcast', { event: 'vecindad:update' }, ({ payload }) => {
      scene.handleRemoteVecindadUpdate(payload);
    })
    .on('broadcast', { event: 'player:hit' }, ({ payload }) => {
      scene.handleHit(payload);
    })
    .on('broadcast', { event: 'player:emote' }, ({ payload }) => {
      scene.handleRemoteEmote(payload);
    })
    .on('presence', { event: 'sync' }, () => {
      handleWorldVoicePresenceSync(voiceScene);
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      handleWorldVoicePresenceJoin(voiceScene, newPresences as PresenceVoice[]);
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      handleWorldVoicePresenceLeave(voiceScene, leftPresences as PresenceVoice[]);
    })
    .subscribe(() => {
      scene.broadcastSelfState('player:join');
    });

  return 'multiplayer';
}

export function syncWorldRealtimePosition(
  scene: Pick<
    WorldRealtimeVecindadSceneLike,
    | 'channel'
    | 'playerId'
    | 'playerUsername'
    | 'px'
    | 'py'
    | 'lastMoveDx'
    | 'lastMoveDy'
    | 'lastIsMoving'
    | 'lastPosSent'
    | 'lastBroadcastX'
    | 'lastBroadcastY'
  >,
  forceUpdate = false
) {
  const now = Date.now();
  if (now - scene.lastPosSent < 66) return;

  const dx = Math.abs(scene.px - scene.lastBroadcastX);
  const dy = Math.abs(scene.py - scene.lastBroadcastY);
  if (dx < 2 && dy < 2 && !forceUpdate) return;

  scene.lastPosSent = now;
  scene.lastBroadcastX = scene.px;
  scene.lastBroadcastY = scene.py;

  scene.channel?.send({
    type: 'broadcast',
    event: 'player:move',
    payload: {
      player_id: scene.playerId,
      username: scene.playerUsername,
      x: Math.round(scene.px),
      y: Math.round(scene.py),
      dir: scene.lastMoveDx,
      dy: scene.lastMoveDy,
      moving: scene.lastIsMoving,
    },
  });
}

export function registerWorldVecindadBridge(scene: WorldRealtimeVecindadSceneLike) {
  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.CHAT_INPUT_FOCUS, () => {
    scene.inputBlocked = true;
  }));

  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.CHAT_INPUT_BLUR, () => {
    scene.inputBlocked = false;
  }));

  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.PARCEL_STATE_CHANGED, (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    applyWorldParcelState(scene, payload as Record<string, unknown>);
  }));

  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.VECINDAD_SHARED_STATE_CHANGED, (payload: unknown) => {
    applyWorldSharedParcelsEvent(scene, payload);
  }));
}

export function applyWorldParcelState(
  scene: Pick<WorldRealtimeVecindadSceneLike, 'vecindadState' | 'parcelVisuals'> & {
    refreshParcelVisuals?: () => void;
    renderVecindadHud?: () => void;
  },
  payload: Record<string, unknown>
) {
  scene.vecindadState = {
    ownedParcelId: typeof payload.ownedParcelId === 'string' ? payload.ownedParcelId : undefined,
    buildStage: typeof payload.buildStage === 'number' ? payload.buildStage : 0,
    materials: typeof payload.materials === 'number' ? payload.materials : 0,
    cannabisFarmUnlocked: typeof payload.cannabisFarmUnlocked === 'boolean' ? payload.cannabisFarmUnlocked : false,
    farmPlants: Array.isArray(payload.farmPlants) ? (payload.farmPlants as VecindadState['farmPlants']) : [],
  };

  scene.refreshParcelVisuals?.();
  scene.renderVecindadHud?.();
}

export function applyWorldSharedParcels(
  scene: Pick<WorldRealtimeVecindadSceneLike, 'sharedParcelState'> & {
    refreshParcelVisuals?: () => void;
    renderVecindadHud?: () => void;
    applySharedVecindadParcels?: (parcels: SharedParcelState[]) => void;
  },
  parcels: SharedParcelState[]
) {
  if (scene.applySharedVecindadParcels) {
    scene.applySharedVecindadParcels(parcels);
  } else {
    scene.sharedParcelState.clear();
    parcels.forEach((parcel) => {
      scene.sharedParcelState.set(parcel.parcelId, parcel);
    });
  }

  scene.refreshParcelVisuals?.();
  scene.renderVecindadHud?.();
}

export function parseWorldSharedParcelsPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return { parcels: [] as SharedParcelState[], broadcast: false };
  }

  return {
    parcels: Array.isArray((payload as { parcels?: unknown[] }).parcels)
      ? (payload as { parcels: SharedParcelState[] }).parcels
      : [],
    broadcast: (payload as { broadcast?: boolean }).broadcast === true,
  };
}

export function applyWorldSharedParcelsEvent(
  scene: Pick<WorldRealtimeVecindadSceneLike, 'sharedParcelState'> & {
    refreshParcelVisuals?: () => void;
    renderVecindadHud?: () => void;
    applySharedVecindadParcels?: (parcels: SharedParcelState[]) => void;
    broadcastVecindadState?: (parcels: SharedParcelState[]) => void;
  },
  payload: unknown,
  options?: {
    broadcast?: boolean;
  },
) {
  const parsed = parseWorldSharedParcelsPayload(payload);
  applyWorldSharedParcels(scene, parsed.parcels);

  if ((options?.broadcast ?? parsed.broadcast) === true) {
    scene.broadcastVecindadState?.(parsed.parcels);
  }

  return parsed.parcels;
}

export function refreshWorldVecindadHud(
  scene: Pick<WorldRealtimeVecindadSceneLike, 'add' | 'vecindadHud' | 'vecindadState' | 'px' | 'py'>
) {
  const parcel = scene.vecindadState.ownedParcelId ? `PARCELA ${scene.vecindadState.ownedParcelId}` : 'SIN PARCELA';
  const stage = Math.max(0, scene.vecindadState.buildStage);
  const nextCost = stage >= MAX_VECINDAD_STAGE ? 0 : getBuildCost(Math.max(stage, 1));
  const lines = [
    'LA VECINDAD',
    parcel,
    `MATS ${scene.vecindadState.materials}`,
    `STAGE ${stage}/${MAX_VECINDAD_STAGE}${stage >= MAX_VECINDAD_STAGE ? ' MAX' : ` NEXT ${nextCost}`}`,
  ];

  if (!scene.vecindadHud) {
    scene.vecindadHud = scene.add.text(8, 92, lines, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B9FF9E',
      lineSpacing: 6,
      stroke: '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0).setDepth(9999);
  } else {
    scene.vecindadHud.setText(lines);
  }

  scene.vecindadHud.setVisible(isInsideWorldVecindadDistrict(scene));
}

export function isInsideWorldVecindadDistrict(
  scene: Pick<WorldRealtimeVecindadSceneLike, 'px' | 'py'>
) {
  return scene.px >= ZONES.VECINDAD_X
    && scene.px <= ZONES.VECINDAD_X + ZONES.VECINDAD_W
    && scene.py >= ZONES.VECINDAD_Y
    && scene.py <= ZONES.VECINDAD_Y + ZONES.VECINDAD_H;
}

export function allowWorldRemoteMove(
  scene: Pick<WorldRealtimeVecindadSceneLike, 'playerId' | 'remoteMoveTimes' | 'allowRemoteEvent'>,
  payload: unknown
) {
  const next = payload as Partial<WorldRemoteMoveEvent> | null;
  if (!next?.player_id || next.player_id === scene.playerId) return false;
  return scene.allowRemoteEvent(scene.remoteMoveTimes, next.player_id, REMOTE_MOVE_MIN_MS);
}

export function buildWorldChatBroadcastPayload(
  scene: Pick<WorldRealtimeVecindadSceneLike, 'playerId' | 'playerUsername' | 'px' | 'py'>,
  message: string
) {
  return {
    player_id: scene.playerId,
    username: scene.playerUsername,
    message,
    x: Math.round(scene.px),
    y: Math.round(scene.py),
  };
}

export function canWorldSendChat(lastChatSent: number, now = Date.now()) {
  return now - lastChatSent >= CHAT.RATE_LIMIT_MS;
}

export async function loadWorldSharedVecindadState(
  scene: Pick<WorldRealtimeVecindadSceneLike, 'sharedParcelState'> & {
    refreshParcelVisuals?: () => void;
    renderVecindadHud?: () => void;
    applySharedVecindadParcels?: (parcels: SharedParcelState[]) => void;
  },
) {
  const res = await fetch('/api/vecindad').catch(() => null);
  if (!res?.ok) return [] as SharedParcelState[];
  const json = await res.json().catch(() => null) as { parcels?: SharedParcelState[] } | null;
  const parcels = Array.isArray(json?.parcels) ? json.parcels : [];
  applyWorldSharedParcels(scene, parcels);
  return parcels;
}

export function broadcastWorldVecindadState(
  scene: Pick<WorldRealtimeVecindadSceneLike, 'channel'>,
  parcels: SharedParcelState[],
) {
  if (!scene.channel) return false;
  scene.channel.send({
    type: 'broadcast',
    event: 'vecindad:update',
    payload: { parcels },
  });
  return true;
}

export function handleWorldRemoteVecindadUpdate(
  scene: Pick<WorldRealtimeVecindadSceneLike, 'sharedParcelState'> & {
    refreshParcelVisuals?: () => void;
    renderVecindadHud?: () => void;
    applySharedVecindadParcels?: (parcels: SharedParcelState[]) => void;
  },
  payload: unknown,
) {
  const { parcels } = parseWorldSharedParcelsPayload(payload);
  applyWorldSharedParcels(scene, parcels);
  return parcels;
}
