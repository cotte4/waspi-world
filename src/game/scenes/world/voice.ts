import Phaser from 'phaser';
import { eventBus, EVENTS } from '../../config/eventBus';
import { getVoiceChat, destroyVoiceChat } from '../../systems/voiceChatInstance';
import { applySinkIdToAudioContext } from '../../systems/audioOutputSink';
import type { VoiceStatusPayload, VoiceUiState } from '../../systems/voiceShared';
import { supabase } from '../../../lib/supabase';

const VOICE_PREF_KEY = 'waspi_voice_pref';
const VOICE_MIC_DEVICE_KEY = 'waspi_voice_mic_device_id';
const VOICE_MIC_GRANT_RELOAD_KEY = 'waspi_voice_mic_grant_reload_done';

export type PresenceVoice = {
  player_id?: string;
  voice_peer_id?: string;
  voice_user_id?: string;
  [key: string]: unknown;
};

type PresenceChannelLike = {
  track: (payload: Record<string, unknown>) => Promise<unknown>;
  presenceState: <T>() => Record<string, T[]>;
};

type VoicePromptButton = Phaser.GameObjects.Text;
type VoicePromptObject =
  | Phaser.GameObjects.Rectangle
  | Phaser.GameObjects.Text
  | Phaser.GameObjects.Arc
  | VoicePromptButton;
type VoiceCleanup = () => void;

export type WorldVoiceSceneLike = Phaser.Scene & {
  channel?: PresenceChannelLike | null;
  playerId: string;
  sessionPlayerId?: string;
  authUserId?: string | null;
  px: number;
  py: number;
  voiceMuteBtn?: Phaser.GameObjects.Text;
  voiceStatusText?: Phaser.GameObjects.Text;
  voicePromptObjects: VoicePromptObject[];
  localSpeakingIndicator?: Phaser.GameObjects.Arc;
  speakingIndicators: Map<string, Phaser.GameObjects.Arc>;
  isActivatingVoice: boolean;
  mutedPlayerIds?: Set<string>;
  game?: Phaser.Game;
  time: Phaser.Time.Clock;
};

function getVoicePref(): 'on' | 'off' | null {
  try {
    const value = window.localStorage.getItem(VOICE_PREF_KEY);
    if (value === 'on' || value === 'off') return value;
  } catch {
    // noop
  }
  return null;
}

function setVoicePref(pref: 'on' | 'off') {
  try {
    window.localStorage.setItem(VOICE_PREF_KEY, pref);
  } catch {
    // noop
  }
}

function getPreferredMicDeviceId(): string | null {
  try {
    return window.localStorage.getItem(VOICE_MIC_DEVICE_KEY) || null;
  } catch {
    return null;
  }
}

function clearPreferredMicDeviceId() {
  try {
    window.localStorage.removeItem(VOICE_MIC_DEVICE_KEY);
  } catch {
    // noop
  }
}

async function isMicGranted(): Promise<boolean> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state === 'granted';
  } catch {
    return false;
  }
}

async function getMicPermissionState(): Promise<PermissionState | 'unknown'> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state;
  } catch {
    return 'unknown';
  }
}

function hasDoneMicGrantReload(): boolean {
  try {
    return window.localStorage.getItem(VOICE_MIC_GRANT_RELOAD_KEY) === '1';
  } catch {
    return true;
  }
}

function markMicGrantReloadDone() {
  try {
    window.localStorage.setItem(VOICE_MIC_GRANT_RELOAD_KEY, '1');
  } catch {
    // noop
  }
}

function mapStatusLabel(state: VoiceUiState): string {
  switch (state) {
    case 'connecting':
      return '[MIC ...]';
    case 'active':
      return '[MIC ON]';
    case 'retrying':
      return '[RETRY]';
    case 'network_blocked':
      return '[RED]';
    case 'no_mic':
      return '[SIN MIC]';
    case 'denied':
      return '[DENEGADO]';
    case 'mic_in_use':
      return '[MIC EN USO]';
    case 'session_required':
      return '[LOGIN]';
    case 'error':
      return '[ERROR]';
    default:
      return '[MIC]';
  }
}

function mapStatusColor(state: VoiceUiState): string {
  switch (state) {
    case 'active':
      return '#39FF14';
    case 'connecting':
    case 'retrying':
      return '#F5C842';
    case 'disconnected':
      return '#9999BB';
    default:
      return '#FF006E';
  }
}

function publishStatus(scene: WorldVoiceSceneLike, payload: VoiceStatusPayload) {
  const color = mapStatusColor(payload.state);
  scene.voiceMuteBtn?.setText(payload.label).setStyle({ color });
  scene.voiceStatusText?.setText(payload.detail ?? '').setStyle({
    color: payload.state === 'active' ? '#39FF14' : payload.state === 'disconnected' ? '#7777AA' : '#FF6666',
  });
  eventBus.emit(EVENTS.VOICE_STATUS_CHANGED, payload);
}

function setVoiceIdleHud(scene: WorldVoiceSceneLike, detail = '') {
  publishStatus(scene, {
    state: 'disconnected',
    label: '[MIC]',
    detail,
  });
}

function setVoiceActiveHud(scene: WorldVoiceSceneLike, detail = '') {
  publishStatus(scene, {
    state: 'active',
    label: '[MIC ON]',
    detail,
  });
}

function setVoiceMutedHud(scene: WorldVoiceSceneLike) {
  publishStatus(scene, {
    state: 'active',
    label: '[MUTED]',
    detail: scene.voiceStatusText?.text || '',
  });
}

function createWorldVoiceHudObjects(scene: WorldVoiceSceneLike) {
  const baseY = scene.cameras.main.height - 118;

  scene.voiceMuteBtn = scene.add.text(10, baseY, '[MIC]', {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    backgroundColor: '#0A0A14',
    padding: { x: 5, y: 3 },
    color: '#9999BB',
  }).setScrollFactor(0).setDepth(9999).setInteractive({ useHandCursor: true });

  scene.voiceStatusText = scene.add.text(10, baseY + 18, '', {
    fontSize: '6px',
    fontFamily: 'Silkscreen, monospace',
    color: '#7777AA',
  }).setScrollFactor(0).setDepth(9999);

  scene.localSpeakingIndicator = scene.add.arc(
    scene.px,
    scene.py - 54,
    5,
    0,
    360,
    false,
    0x39FF14,
    0,
  ).setDepth(200);
}

async function getAuthSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

function getVoiceIdentity(scene: WorldVoiceSceneLike) {
  const userId = scene.authUserId?.trim() || '';
  if (!userId) return null;
  return {
    userId,
    sessionId: scene.playerId,
  };
}

export function closeWorldVoicePrompt(scene: WorldVoiceSceneLike) {
  scene.voicePromptObjects.forEach((object) => object.destroy());
  scene.voicePromptObjects = [];
}

export async function activateWorldVoice(scene: WorldVoiceSceneLike) {
  if (scene.isActivatingVoice) return;

  const vc = getVoiceChat();
  if (vc.connected) return;

  const identity = getVoiceIdentity(scene);
  if (!identity) {
    publishStatus(scene, {
      state: 'session_required',
      label: mapStatusLabel('session_required'),
      detail: 'Inicia sesion para usar la voz.',
    });
    return;
  }

  scene.isActivatingVoice = true;
  publishStatus(scene, {
    state: 'connecting',
    label: mapStatusLabel('connecting'),
    detail: 'Preparando microfono y conexion...',
  });

  try {
    const micStateBefore = await getMicPermissionState();
    const preferredMicId = getPreferredMicDeviceId();
    const session = await getAuthSession();
    const authToken = session?.access_token ?? null;

    try {
      await vc.init({
        userId: identity.userId,
        sessionId: identity.sessionId,
        deviceId: preferredMicId ?? undefined,
        authToken,
      });
    } catch (error) {
      const name = (error as DOMException)?.name;
      if (preferredMicId && (name === 'NotFoundError' || name === 'OverconstrainedError')) {
        clearPreferredMicDeviceId();
        await vc.init({
          userId: identity.userId,
          sessionId: identity.sessionId,
          authToken,
        });
      } else {
        throw error;
      }
    }

    await scene.channel?.track({
      player_id: scene.playerId,
      voice_peer_id: vc.peerId,
      voice_user_id: identity.userId,
    });
    connectWorldVoicePeersInRoom(scene);
    setVoiceActiveHud(scene);

    if (micStateBefore === 'prompt' && !hasDoneMicGrantReload()) {
      markMicGrantReloadDone();
      window.location.reload();
      return;
    }
  } catch (error) {
    const name = (error as DOMException)?.name;
    let state: VoiceUiState = 'error';
    let detail = 'No pude iniciar la voz.';

    if (name === 'NotAllowedError') {
      state = 'denied';
      detail = 'Habilita el microfono en el candado de la URL.';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      state = 'no_mic';
      detail = 'No se encontro un microfono valido.';
    } else if (name === 'NotReadableError') {
      state = 'mic_in_use';
      detail = 'Otra app esta usando el microfono.';
    } else if (formatErrorMessage(error).toLowerCase().includes('unauthorized')) {
      state = 'session_required';
      detail = 'Inicia sesion para habilitar TURN y voz.';
    } else if (formatErrorMessage(error).toLowerCase().includes('ice')) {
      state = 'network_blocked';
      detail = 'La red bloqueo la conexion de voz.';
    }

    publishStatus(scene, {
      state,
      label: mapStatusLabel(state),
      detail,
      technicalDetail: formatErrorMessage(error),
    });
  } finally {
    scene.isActivatingVoice = false;
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown voice error';
}

export async function disableWorldVoice(scene: WorldVoiceSceneLike) {
  closeWorldVoicePrompt(scene);

  const vc = getVoiceChat();
  if (!vc.connected) {
    setVoiceIdleHud(scene);
    return;
  }

  setVoicePref('off');
  await scene.channel?.track({ player_id: scene.playerId });
  destroyVoiceChat();

  setVoiceIdleHud(scene);
  scene.localSpeakingIndicator?.setAlpha(0);
  for (const [, arc] of scene.speakingIndicators) {
    arc.setAlpha(0);
  }
}

export function connectWorldVoicePeersInRoom(scene: WorldVoiceSceneLike) {
  const vc = getVoiceChat();
  if (!vc.connected) return;

  const state = scene.channel?.presenceState<PresenceVoice>() ?? {};
  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (presence.voice_peer_id && presence.voice_peer_id !== vc.peerId) {
        vc.callPeer(presence.voice_peer_id);
      }
    }
  }
}

export function handleWorldVoicePresenceSync(scene: WorldVoiceSceneLike) {
  connectWorldVoicePeersInRoom(scene);
}

export function handleWorldVoicePresenceJoin(
  scene: WorldVoiceSceneLike,
  newPresences: PresenceVoice[],
) {
  const vc = getVoiceChat();
  if (!vc.connected) return;

  for (const presence of newPresences) {
    if (presence.voice_peer_id && presence.voice_peer_id !== vc.peerId) {
      vc.callPeer(presence.voice_peer_id);
    }
  }
}

export function handleWorldVoicePresenceLeave(
  scene: WorldVoiceSceneLike,
  leftPresences: PresenceVoice[],
) {
  const vc = getVoiceChat();
  if (!vc.connected) return;

  for (const presence of leftPresences) {
    if (presence.voice_peer_id) {
      vc.disconnectPeer(presence.voice_peer_id);
    }
  }
}

export async function tryAutoInitWorldVoice(scene: WorldVoiceSceneLike) {
  if (getVoicePref() !== 'on') return;

  try {
    const session = await getAuthSession();
    scene.authUserId = session?.user.id ?? scene.authUserId ?? null;
    if (!scene.authUserId || !await isMicGranted()) return;
    await activateWorldVoice(scene);
  } catch {
    // Silent failure. Manual activation via HUD remains available.
  }
}

export function showWorldVoicePrompt(scene: WorldVoiceSceneLike) {
  if (scene.voicePromptObjects.length > 0) return;

  const camW = scene.cameras.main.width;
  const camH = scene.cameras.main.height;
  const panelW = 320;
  const panelH = 124;
  const px = (camW - panelW) / 2;
  const py = (camH - panelH) / 2;
  const depth = 10001;

  const bg = scene.add.rectangle(px, py, panelW, panelH, 0x0A0A14, 0.96)
    .setStrokeStyle(1, 0x46B3FF, 0.7)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(depth);

  const title = scene.add.text(px + 12, py + 10, 'VOICE CHAT', {
    fontSize: '8px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#46B3FF',
  }).setScrollFactor(0).setDepth(depth);

  const desc = scene.add.text(px + 12, py + 30, [
    'Escuchas a jugadores cercanos en tiempo real.',
    'Requiere sesion iniciada para TURN y conexion estable.',
  ], {
    fontSize: '6px',
    fontFamily: 'Silkscreen, monospace',
    color: '#AAAACC',
    lineSpacing: 4,
  }).setScrollFactor(0).setDepth(depth);

  const btnActivar = scene.add.text(px + 12, py + 86, '[ACTIVAR]', {
    fontSize: '7px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#39FF14',
    backgroundColor: '#0E1A0E',
    padding: { x: 5, y: 3 },
  }).setScrollFactor(0).setDepth(depth).setInteractive({ useHandCursor: true });

  const btnSinVoz = scene.add.text(px + 130, py + 86, '[SIN VOZ]', {
    fontSize: '7px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#888888',
    backgroundColor: '#0E0E14',
    padding: { x: 5, y: 3 },
  }).setScrollFactor(0).setDepth(depth).setInteractive({ useHandCursor: true });

  btnActivar.on('pointerover', () => btnActivar.setStyle({ color: '#FFFFFF' }));
  btnActivar.on('pointerout', () => btnActivar.setStyle({ color: '#39FF14' }));
  btnActivar.on('pointerdown', async () => {
    closeWorldVoicePrompt(scene);
    setVoicePref('on');
    await activateWorldVoice(scene);
  });

  btnSinVoz.on('pointerover', () => btnSinVoz.setStyle({ color: '#FF006E' }));
  btnSinVoz.on('pointerout', () => btnSinVoz.setStyle({ color: '#888888' }));
  btnSinVoz.on('pointerdown', () => {
    closeWorldVoicePrompt(scene);
    setVoicePref('off');
    setVoiceIdleHud(scene, 'La voz queda desactivada.');
  });

  scene.voicePromptObjects = [bg, title, desc, btnActivar, btnSinVoz];
}

export function bindWorldVoiceHudToggle(scene: WorldVoiceSceneLike) {
  const muteBtn = scene.voiceMuteBtn;
  if (!muteBtn) return;

  muteBtn.on('pointerdown', async () => {
    const vc = getVoiceChat();
    if (!vc.connected) {
      const pref = getVoicePref();
      const granted = await isMicGranted();
      if (pref === 'on' && granted) {
        await activateWorldVoice(scene);
      } else {
        showWorldVoicePrompt(scene);
      }
      return;
    }

    const muted = vc.toggleMute();
    if (muted) {
      setVoiceMutedHud(scene);
      return;
    }

    setVoiceActiveHud(scene, vc.peerCount > 0 ? `${vc.peerCount}p` : '');
  });
}

export function bindWorldVoiceBridge(scene: WorldVoiceSceneLike): VoiceCleanup {
  const unsubManager = getVoiceChat().subscribe((event) => {
    const vc = getVoiceChat();
    if (event.type === 'status') {
      publishStatus(scene, {
        state: event.status,
        label: mapStatusLabel(event.status),
        detail: event.detail,
        peerCount: vc.peerCount,
      });
      return;
    }
    if (event.type === 'peer-stream') {
      const count = vc.peerCount;
      scene.voiceStatusText?.setText(count > 0 ? `${count}p` : '');
      return;
    }
    if (event.type === 'error') {
      publishStatus(scene, {
        state: event.code === 'NotAllowedError' ? 'denied' : 'network_blocked',
        label: mapStatusLabel(event.code === 'NotAllowedError' ? 'denied' : 'network_blocked'),
        detail: event.message,
        technicalDetail: event.stage,
      });
    }
  });

  const unsubMic = eventBus.on(EVENTS.VOICE_MIC_CHANGED, (deviceId: unknown) => {
    const vc = getVoiceChat();
    if (!vc.connected || typeof deviceId !== 'string') return;
    vc.switchMic(deviceId).catch((error) => {
      publishStatus(scene, {
        state: 'error',
        label: mapStatusLabel('error'),
        detail: 'No pude cambiar el microfono.',
        technicalDetail: formatErrorMessage(error),
      });
    });
  });

  const unsubMute = eventBus.on(EVENTS.PLAYER_ACTION_MUTE, (payload: unknown) => {
    const playerId = (payload as { playerId?: string } | null)?.playerId;
    if (!playerId) return;
    const voicePeerIds = getVoicePeerIdsForPlayer(scene, playerId);
    const vc = getVoiceChat();
    voicePeerIds.forEach((peerId) => vc.setPeerMuted(peerId, true));
  });

  const unsubSink = eventBus.on(EVENTS.AUDIO_OUTPUT_SINK_CHANGED, (sinkId: unknown) => {
    if (typeof sinkId !== 'string') return;
    void getVoiceChat().applyOutputSink(sinkId);
    const soundManager = scene.game?.sound as Phaser.Sound.WebAudioSoundManager | undefined;
    const ctx = soundManager && 'context' in soundManager ? soundManager.context : undefined;
    if (ctx) void applySinkIdToAudioContext(ctx, sinkId);
  });

  const unsubDisable = eventBus.on(EVENTS.VOICE_DISABLE, () => {
    void disableWorldVoice(scene);
  });

  const unsubEnable = eventBus.on(EVENTS.VOICE_ENABLE, async () => {
    const session = await getAuthSession();
    scene.authUserId = session?.user.id ?? scene.authUserId ?? null;
    const vc = getVoiceChat();
    if (vc.connected) return;
    setVoicePref('on');
    void activateWorldVoice(scene);
  });

  return () => {
    unsubManager();
    unsubMic();
    unsubMute();
    unsubSink();
    unsubDisable();
    unsubEnable();
  };
}

export function setupWorldVoiceHud(scene: WorldVoiceSceneLike) {
  createWorldVoiceHudObjects(scene);
  setVoiceIdleHud(scene);
  bindWorldVoiceHudToggle(scene);

  const cleanupBridge = bindWorldVoiceBridge(scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupBridge);
}

export function getVoicePeerIdsForPlayer(scene: WorldVoiceSceneLike, playerId: string): string[] {
  const presence = scene.channel?.presenceState<PresenceVoice>() ?? {};
  const peerIds: string[] = [];
  for (const entries of Object.values(presence)) {
    for (const entry of entries) {
      if (entry.player_id === playerId && typeof entry.voice_peer_id === 'string') {
        peerIds.push(entry.voice_peer_id);
      }
    }
  }
  return peerIds;
}

export function buildWorldVoicePeerPositions(scene: WorldVoiceSceneLike & {
  remotePlayers?: Map<string, { x: number; y: number }>;
}) {
  const peerPositions = new Map<string, { x: number; y: number }>();
  const presence = scene.channel?.presenceState<PresenceVoice>() ?? {};
  const remotePlayers = scene.remotePlayers ?? new Map<string, { x: number; y: number }>();

  for (const entries of Object.values(presence)) {
    for (const entry of entries) {
      if (!entry.voice_peer_id || !entry.player_id) continue;
      if (scene.mutedPlayerIds?.has(entry.player_id)) continue;
      const remote = remotePlayers.get(entry.player_id);
      if (!remote) continue;
      peerPositions.set(entry.voice_peer_id, { x: remote.x, y: remote.y });
    }
  }

  return peerPositions;
}
