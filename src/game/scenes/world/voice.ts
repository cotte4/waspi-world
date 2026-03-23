import Phaser from 'phaser';
import { eventBus, EVENTS } from '../../config/eventBus';
import { getVoiceChat, destroyVoiceChat } from '../../systems/voiceChatInstance';
import { applySinkIdToAudioContext } from '../../systems/audioOutputSink';

const VOICE_PREF_KEY = 'waspi_voice_pref';
const VOICE_MIC_DEVICE_KEY = 'waspi_voice_mic_device_id';
const VOICE_MIC_GRANT_RELOAD_KEY = 'waspi_voice_mic_grant_reload_done';

export type PresenceVoice = {
  voice_peer_id?: string;
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
  px: number;
  py: number;
  voiceMuteBtn?: Phaser.GameObjects.Text;
  voiceStatusText?: Phaser.GameObjects.Text;
  voicePromptObjects: VoicePromptObject[];
  localSpeakingIndicator?: Phaser.GameObjects.Arc;
  speakingIndicators: Map<string, Phaser.GameObjects.Arc>;
  isActivatingVoice: boolean;
  game?: Phaser.Game;
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

function setVoiceIdleHud(scene: WorldVoiceSceneLike) {
  scene.voiceMuteBtn?.setText('[MIC]').setStyle({ color: '#9999BB' });
  scene.voiceStatusText?.setText('').setStyle({ color: '#7777AA' });
}

function setVoiceActiveHud(scene: WorldVoiceSceneLike) {
  scene.voiceMuteBtn?.setText('[MIC ON]').setStyle({ color: '#39FF14' });
  scene.voiceStatusText?.setText('').setStyle({ color: '#39FF14' });
}

function setVoiceMutedHud(scene: WorldVoiceSceneLike) {
  scene.voiceMuteBtn?.setText('[MUTED]').setStyle({ color: '#FF006E' });
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
    0
  ).setDepth(200);
}

export function closeWorldVoicePrompt(scene: WorldVoiceSceneLike) {
  scene.voicePromptObjects.forEach((object) => object.destroy());
  scene.voicePromptObjects = [];
}

export async function activateWorldVoice(scene: WorldVoiceSceneLike) {
  if (scene.isActivatingVoice) return;

  const vc = getVoiceChat();
  if (vc.connected) return;

  scene.isActivatingVoice = true;

  try {
    const micStateBefore = await getMicPermissionState();
    const preferredMicId = getPreferredMicDeviceId();

    scene.voiceMuteBtn?.setText('[MIC ...]').setStyle({ color: '#F5C842' });

    try {
      await vc.init(scene.playerId, preferredMicId ?? undefined);
    } catch (error) {
      const name = (error as DOMException)?.name;
      if (preferredMicId && (name === 'NotFoundError' || name === 'OverconstrainedError')) {
        clearPreferredMicDeviceId();
        await vc.init(scene.playerId);
      } else {
        throw error;
      }
    }

    await scene.channel?.track({ player_id: scene.playerId, voice_peer_id: vc.peerId });
    connectWorldVoicePeersInRoom(scene);

    setVoiceActiveHud(scene);

    if (micStateBefore === 'prompt' && !hasDoneMicGrantReload()) {
      markMicGrantReloadDone();
      window.location.reload();
      return;
    }
  } catch (error) {
    const name = (error as DOMException)?.name;
    let label = '[NO MIC]';
    let hint = 'Revisa la configuracion del browser';

    if (name === 'NotAllowedError') {
      label = '[DENEGADO]';
      hint = 'Habilita el mic en el candado de la URL';
    } else if (name === 'NotFoundError') {
      label = '[SIN MIC]';
      hint = 'No se encontro microfono conectado';
    } else if (name === 'NotReadableError') {
      label = '[MIC EN USO]';
      hint = 'Otra app esta usando el microfono';
    }

    console.warn('[VoiceChat] Mic init failed:', error);
    scene.voiceMuteBtn?.setText(label).setStyle({ color: '#FF006E' });
    scene.voiceStatusText?.setText(hint).setStyle({ color: '#FF6666' });
    scene.time.delayedCall(4000, () => {
      scene.voiceStatusText?.setText('').setStyle({ color: '#7777AA' });
    });
  } finally {
    scene.isActivatingVoice = false;
  }
}

export async function disableWorldVoice(scene: WorldVoiceSceneLike) {
  closeWorldVoicePrompt(scene);

  const vc = getVoiceChat();
  if (!vc.connected) return;

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
  newPresences: PresenceVoice[]
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
  leftPresences: PresenceVoice[]
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
    if (!await isMicGranted()) return;
    await activateWorldVoice(scene);
  } catch {
    // Silent failure. Manual activation via HUD remains available.
  }
}

export function showWorldVoicePrompt(scene: WorldVoiceSceneLike) {
  if (scene.voicePromptObjects.length > 0) return;

  const camW = scene.cameras.main.width;
  const camH = scene.cameras.main.height;
  const panelW = 290;
  const panelH = 116;
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
    'Vas a escuchar a otros jugadores',
    'cuando esten cerca. Audio P2P directo.',
  ], {
    fontSize: '6px',
    fontFamily: 'Silkscreen, monospace',
    color: '#AAAACC',
    lineSpacing: 4,
  }).setScrollFactor(0).setDepth(depth);

  const btnActivar = scene.add.text(px + 12, py + 78, '[ACTIVAR]', {
    fontSize: '7px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#39FF14',
    backgroundColor: '#0E1A0E',
    padding: { x: 5, y: 3 },
  }).setScrollFactor(0).setDepth(depth).setInteractive({ useHandCursor: true });

  const btnSinVoz = scene.add.text(px + 130, py + 78, '[SIN VOZ]', {
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

    setVoiceActiveHud(scene);
  });
}

export function bindWorldVoiceBridge(scene: WorldVoiceSceneLike): VoiceCleanup {
  const unsubMic = eventBus.on(EVENTS.VOICE_MIC_CHANGED, (deviceId: unknown) => {
    const vc = getVoiceChat();
    if (!vc.connected || typeof deviceId !== 'string') return;
    vc.switchMic(deviceId).catch((error) => console.warn('[VoiceChat] Mic switch failed:', error));
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

  const unsubEnable = eventBus.on(EVENTS.VOICE_ENABLE, () => {
    const vc = getVoiceChat();
    if (vc.connected) return;
    setVoicePref('on');
    void activateWorldVoice(scene);
  });

  return () => {
    unsubMic();
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
