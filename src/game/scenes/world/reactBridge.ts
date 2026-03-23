import { eventBus, EVENTS } from '../../config/eventBus';
import {
  canWorldSendChat,
  applyWorldParcelState,
  applyWorldSharedParcelsEvent,
  registerWorldVecindadBridge,
  type WorldParcelVisual,
  type WorldRealtimeVecindadSceneLike,
} from './realtimeVecindad';
import { loadStoredAvatarConfig, type AvatarConfig, type AvatarAction } from '../../systems/AvatarRenderer';
import type { SharedParcelState } from '../../../lib/vecindad';
import type { VecindadState } from '../../../lib/playerState';
import type { ChatSystem } from '../../systems/ChatSystem';

type WorldReactBridgeSceneLike = Pick<
  WorldRealtimeVecindadSceneLike,
  | 'bridgeCleanupFns'
  | 'channel'
  | 'playerId'
  | 'playerUsername'
  | 'px'
  | 'py'
  | 'sharedParcelState'
  | 'inputBlocked'
  | 'lastChatSent'
> & {
  chatSystem: ChatSystem;
  mutedPlayerIds: Set<string>;
  inTransition: boolean;
  vecindadState: VecindadState;
  parcelVisuals: Map<string, WorldParcelVisual>;
  moderateChat: (message: string) => Promise<string>;
  refreshParcelVisuals: () => void;
  renderVecindadHud: () => void;
  applySharedVecindadParcels: (parcels: SharedParcelState[]) => void;
  broadcastVecindadState: (parcels: SharedParcelState[]) => void;
  rebuildLocalAvatar: (nextConfig: AvatarConfig) => void;
  refreshUtilitiesFromInventory: () => void;
  broadcastSelfState: (event: 'player:join' | 'player:update', action?: AvatarAction) => void;
  transitionToScene: (targetKey: string, extra?: Record<string, unknown>) => void;
};

export function setupWorldReactBridge(scene: WorldReactBridgeSceneLike) {
  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.CHAT_SEND, async (message: unknown) => {
    if (typeof message !== 'string') return;
    const trimmed = message.trim();
    if (!trimmed) return;
    const now = Date.now();
    if (!canWorldSendChat(scene.lastChatSent ?? 0, now)) return;
    scene.lastChatSent = now;

    const moderated = await scene.moderateChat(trimmed);
    if (!moderated) return;

    scene.chatSystem.showBubble('__player__', moderated, scene.px, scene.py, true);

    scene.channel?.send({
      type: 'broadcast',
      event: 'player:chat',
      payload: {
        player_id: scene.playerId,
        username: scene.playerUsername,
        message: moderated,
        x: Math.round(scene.px),
        y: Math.round(scene.py),
      },
    });

    eventBus.emit(EVENTS.CHAT_RECEIVED, {
      playerId: scene.playerId,
      username: scene.playerUsername,
      message: moderated,
      isMe: true,
    });
  }));

  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.PLAYER_ACTION_MUTE, (payload: unknown) => {
    const playerId = (payload as { playerId?: string } | null)?.playerId;
    if (!playerId) return;
    scene.mutedPlayerIds.add(playerId);
    scene.chatSystem.clearBubble(playerId);
  }));

  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.PLAYER_ACTION_REPORT, () => {}));

  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.PARCEL_STATE_CHANGED, (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const parcelStateScene = {
      parcelVisuals: scene.parcelVisuals,
      refreshParcelVisuals: () => scene.refreshParcelVisuals(),
      renderVecindadHud: () => scene.renderVecindadHud(),
      vecindadState: scene.vecindadState,
    };
    applyWorldParcelState(parcelStateScene, payload as Record<string, unknown>);
    scene.vecindadState = parcelStateScene.vecindadState as VecindadState;
  }));

  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.VECINDAD_SHARED_STATE_CHANGED, (payload: unknown) => {
    applyWorldSharedParcelsEvent({
      applySharedVecindadParcels: (parcels) => scene.applySharedVecindadParcels(parcels),
      broadcastVecindadState: (parcels) => scene.broadcastVecindadState(parcels),
      refreshParcelVisuals: () => scene.refreshParcelVisuals(),
      renderVecindadHud: () => scene.renderVecindadHud(),
      sharedParcelState: scene.sharedParcelState,
    }, payload);
  }));

  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.AVATAR_SET, (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;

    const next = {
      ...loadStoredAvatarConfig(),
      ...(payload as AvatarConfig),
    };
    scene.rebuildLocalAvatar(next);
    scene.refreshUtilitiesFromInventory();
    scene.broadcastSelfState('player:update');
  }));

  scene.bridgeCleanupFns.push(eventBus.on(EVENTS.OPEN_CREATOR, () => {
    if (scene.inTransition) return;
    scene.transitionToScene('CreatorScene');
  }));

  registerWorldVecindadBridge(scene as unknown as WorldRealtimeVecindadSceneLike);
}
