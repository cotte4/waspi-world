import Peer, { type MediaConnection } from 'peerjs';
import * as Sentry from '@sentry/nextjs';
import { track } from '@/src/lib/analytics';
import type {
  VoiceIceConfigResponse,
  VoiceIceServer,
  VoiceMetricProps,
  VoicePeerServerConfig,
  VoiceUiState,
} from './voiceShared';

interface PeerAudioState {
  peerId: string;
  mediaConnection: MediaConnection;
  audioElement: HTMLAudioElement;
  stream: MediaStream;
  analyser?: AnalyserNode;
  analyserData?: Uint8Array<ArrayBuffer>;
}

export interface VoiceChatConfig {
  minDistance: number;
  maxDistance: number;
  falloffCurve: 'linear' | 'logarithmic' | 'exponential';
  masterVolume: number;
}

export type VoiceChatInitOptions = {
  userId: string;
  sessionId?: string;
  deviceId?: string;
  authToken?: string | null;
};

export type VoiceChatEvent =
  | { type: 'status'; status: VoiceUiState; detail?: string }
  | { type: 'metric'; name: string; props?: VoiceMetricProps }
  | { type: 'error'; stage: string; message: string; code?: string; recoverable?: boolean }
  | { type: 'peer-call'; peerId: string }
  | { type: 'peer-stream'; peerId: string };

type VoiceChatListener = (event: VoiceChatEvent) => void;

const DEFAULT_ICE_CONFIG: VoiceIceConfigResponse = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  turnEnabled: false,
  ttlSeconds: 3600,
  issuedAt: new Date(0).toISOString(),
};

function loadFallbackIceConfig(): VoiceIceConfigResponse {
  const raw = process.env.NEXT_PUBLIC_VOICE_ICE_SERVERS;
  if (!raw) return DEFAULT_ICE_CONFIG;

  try {
    const parsed = JSON.parse(raw) as { iceServers?: VoiceIceServer[] };
    if (!Array.isArray(parsed.iceServers) || parsed.iceServers.length === 0) {
      return DEFAULT_ICE_CONFIG;
    }
    return {
      iceServers: parsed.iceServers,
      turnEnabled: parsed.iceServers.some((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.some((value) => typeof value === 'string' && value.startsWith('turn'));
      }),
      ttlSeconds: 3600,
      issuedAt: new Date(0).toISOString(),
    };
  } catch {
    console.warn('[VoiceChat] Invalid NEXT_PUBLIC_VOICE_ICE_SERVERS JSON, using default STUN config.');
    return DEFAULT_ICE_CONFIG;
  }
}

function loadPeerServerConfig(): VoicePeerServerConfig {
  const portRaw = Number(process.env.NEXT_PUBLIC_PEERJS_PORT ?? '443');
  const secureRaw = (process.env.NEXT_PUBLIC_PEERJS_SECURE ?? 'true').toLowerCase();
  return {
    host: process.env.NEXT_PUBLIC_PEERJS_HOST?.trim() || undefined,
    port: Number.isFinite(portRaw) ? portRaw : 443,
    path: process.env.NEXT_PUBLIC_PEERJS_PATH?.trim() || undefined,
    secure: secureRaw !== 'false',
    key: process.env.NEXT_PUBLIC_PEERJS_KEY?.trim() || undefined,
  };
}

function getPeerDebugLevel() {
  const raw = Number(process.env.NEXT_PUBLIC_PEERJS_DEBUG ?? '1');
  return Number.isFinite(raw) ? raw : 1;
}

function sanitizePeerPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

function createVoiceInstanceSuffix(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return sanitizePeerPart(crypto.randomUUID()).slice(0, 12);
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(6);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  }

  return Math.random().toString(36).slice(2, 14);
}

function buildPeerId(userId: string, sessionId?: string, instanceSuffix = createVoiceInstanceSuffix()): string {
  const parts = [sanitizePeerPart(userId)];
  if (sessionId) parts.push(sanitizePeerPart(sessionId));
  parts.push(instanceSuffix);
  return `waspi-${parts.join('-')}`;
}

function isDomException(error: unknown): error is DOMException {
  return typeof DOMException !== 'undefined' && error instanceof DOMException;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown voice error';
}

async function fetchVoiceIceConfig(authToken?: string | null): Promise<VoiceIceConfigResponse> {
  if (!authToken) return loadFallbackIceConfig();

  try {
    const response = await fetch('/api/voice/ice', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (response.status === 401) {
        throw new Error(payload?.error || 'Unauthorized');
      }

      console.warn('[VoiceChat] ICE config request failed, using fallback STUN config.', payload?.error || response.status);
      return loadFallbackIceConfig();
    }

    const payload = await response.json() as VoiceIceConfigResponse;
    if (!Array.isArray(payload.iceServers) || payload.iceServers.length === 0) {
      console.warn('[VoiceChat] ICE config response was empty, using fallback STUN config.');
      return loadFallbackIceConfig();
    }
    return payload;
  } catch (error) {
    if (formatErrorMessage(error).toLowerCase().includes('unauthorized')) {
      throw error;
    }
    console.warn('[VoiceChat] ICE config fetch crashed, using fallback STUN config.', error);
    return loadFallbackIceConfig();
  }
}

export class VoiceChatManager {
  private peer: Peer | null = null;
  private localStream: MediaStream | null = null;
  private peers: Map<string, PeerAudioState> = new Map();
  private mutedPeerIds = new Set<string>();
  private listeners = new Set<VoiceChatListener>();
  private relayReportedPeerIds = new Set<string>();
  private config: VoiceChatConfig;
  private isMuted = false;
  private isInitialized = false;
  private isInitializing = false;
  private myPeerId = '';
  private voiceUserId = '';
  private sessionId = '';
  private peerInstanceSuffix = createVoiceInstanceSuffix();
  private iceConfig = DEFAULT_ICE_CONFIG;
  private readonly peerDebugLevel = getPeerDebugLevel();
  private readonly peerServerConfig = loadPeerServerConfig();
  private runtimeState: VoiceUiState = 'disconnected';
  private initStartedAt = 0;
  private firstRemoteAudioAt: number | null = null;

  private audioContext?: AudioContext;
  private localAnalyser?: AnalyserNode;
  private localAnalyserData?: Uint8Array<ArrayBuffer>;

  constructor(config?: Partial<VoiceChatConfig>) {
    this.config = {
      minDistance: 150,
      maxDistance: 600,
      falloffCurve: 'logarithmic',
      masterVolume: 1,
      ...config,
    };
  }

  subscribe(listener: VoiceChatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: VoiceChatEvent) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // noop
      }
    });
  }

  private setRuntimeState(status: VoiceUiState, detail?: string) {
    this.runtimeState = status;
    this.emit({ type: 'status', status, detail });
  }

  private trackMetric(name: string, props?: VoiceMetricProps) {
    track(name, props);
    this.emit({ type: 'metric', name, props });
  }

  private reportError(stage: string, error: unknown, extra?: Record<string, unknown>) {
    const message = formatErrorMessage(error);
    const code = error instanceof Error ? error.name : undefined;
    this.emit({ type: 'error', stage, message, code, recoverable: stage !== 'init' });
    Sentry.captureException(error, {
      tags: { subsystem: 'voice', stage },
      extra: {
        peerId: this.myPeerId,
        voiceUserId: this.voiceUserId,
        ...extra,
      },
    });
  }

  async init(options: VoiceChatInitOptions): Promise<string> {
    if (this.isInitialized || this.isInitializing) return this.myPeerId;

    this.isInitializing = true;
    this.initStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.firstRemoteAudioAt = null;
    this.voiceUserId = options.userId;
    this.sessionId = options.sessionId ?? '';
    this.myPeerId = buildPeerId(options.userId, options.sessionId, this.peerInstanceSuffix);
    this.setRuntimeState('connecting', 'Conectando voz...');
    this.trackMetric('voice_init_started', {
      has_auth: Boolean(options.authToken),
      has_session_suffix: Boolean(options.sessionId),
    });

    try {
      this.iceConfig = await fetchVoiceIceConfig(options.authToken);
      this.localStream = await this.createLocalStream(options.deviceId);
      this.setupLocalVAD();

      const peerOptions: Record<string, unknown> = {
        config: { iceServers: this.iceConfig.iceServers },
        debug: this.peerDebugLevel,
      };
      if (this.peerServerConfig.host) peerOptions.host = this.peerServerConfig.host;
      if (this.peerServerConfig.port) peerOptions.port = this.peerServerConfig.port;
      if (this.peerServerConfig.path) peerOptions.path = this.peerServerConfig.path;
      if (typeof this.peerServerConfig.secure === 'boolean') peerOptions.secure = this.peerServerConfig.secure;
      if (this.peerServerConfig.key) peerOptions.key = this.peerServerConfig.key;

      await this.openPeer(peerOptions);

      if (!this.peer) throw new Error('Peer failed to initialize after openPeer');
      this.peer.on('call', (incoming) => this.handleIncomingCall(incoming));
      this.peer.on('disconnected', () => {
        this.setRuntimeState('retrying', 'Reconectando señalizacion...');
        this.trackMetric('voice_signaling_disconnected');
        try {
          this.peer?.reconnect();
        } catch (error) {
          this.reportError('peer_reconnect', error);
        }
      });
      this.peer.on('error', (error) => {
        this.setRuntimeState('network_blocked', 'No pude estabilizar la conexion de voz.');
        this.trackMetric('voice_peer_error', { message: formatErrorMessage(error) });
        this.reportError('peer_runtime', error);
      });
      this.peer.on('close', () => {
        if (this.isInitialized) {
          this.setRuntimeState('disconnected', 'Voz desconectada.');
        }
      });

      this.isInitialized = true;
      this.setRuntimeState('active', 'Voz activa.');
      this.trackMetric('voice_peer_open', {
        turn_enabled: this.iceConfig.turnEnabled,
        peer_server_host: this.peerServerConfig.host ?? 'default',
      });
      return this.myPeerId;
    } catch (error) {
      if (isDomException(error)) {
        switch (error.name) {
          case 'NotAllowedError':
            this.setRuntimeState('denied', 'Permiso de microfono denegado.');
            break;
          case 'NotFoundError':
          case 'OverconstrainedError':
            this.setRuntimeState('no_mic', 'No encontre un microfono valido.');
            break;
          case 'NotReadableError':
            this.setRuntimeState('mic_in_use', 'Otra app esta usando el microfono.');
            break;
          default:
            this.setRuntimeState('error', formatErrorMessage(error));
            break;
        }
      } else {
        this.setRuntimeState('error', formatErrorMessage(error));
      }
      this.trackMetric('voice_init_failed', {
        message: formatErrorMessage(error),
      });
      this.reportError('init', error, { turnEnabled: this.iceConfig.turnEnabled });
      this.destroy();
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  private async openPeer(peerOptions: Record<string, unknown>) {
    const openOnce = async () => {
      this.peer = new Peer(this.myPeerId, peerOptions);

      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          this.peer?.off('error', onError);
          resolve();
        };
        const onError = (error: unknown) => {
          this.peer?.off('open', onOpen);
          reject(error);
        };
        this.peer?.once('open', onOpen);
        this.peer?.once('error', onError);
      });
    };

    try {
      await openOnce();
    } catch (error) {
      if (!formatErrorMessage(error).toLowerCase().includes('is taken')) throw error;

      try {
        this.peer?.destroy();
      } catch {
        // noop
      }

      this.peerInstanceSuffix = createVoiceInstanceSuffix();
      this.myPeerId = buildPeerId(this.voiceUserId, this.sessionId, this.peerInstanceSuffix);
      await openOnce();
    }
  }

  private async createLocalStream(deviceId?: string): Promise<MediaStream> {
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId) audioConstraints.deviceId = { exact: deviceId };
    return navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });
  }

  static async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  }

  async switchMic(deviceId: string): Promise<void> {
    if (!this.isInitialized) return;

    const newStream = await this.createLocalStream(deviceId);
    const newTrack = newStream.getAudioTracks()[0];
    for (const [, state] of this.peers) {
      const conn = state.mediaConnection as unknown as { peerConnection?: RTCPeerConnection };
      const pc = conn.peerConnection;
      if (!pc) continue;
      const sender = pc.getSenders().find((entry) => entry.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(newTrack);
    }

    this.localStream?.getTracks().forEach((trackEntry) => trackEntry.stop());
    this.localStream = newStream;
    this.localAnalyser = undefined;
    this.localAnalyserData = undefined;
    this.setupLocalVAD();
    this.trackMetric('voice_mic_switched');
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private setupLocalVAD() {
    if (!this.localStream) return;
    const ctx = this.getAudioContext();
    const source = ctx.createMediaStreamSource(this.localStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    this.localAnalyser = analyser;
    this.localAnalyserData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
  }

  private setupPeerVAD(state: PeerAudioState) {
    try {
      const ctx = this.getAudioContext();
      const source = ctx.createMediaElementSource(state.audioElement);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      state.analyser = analyser;
      state.analyserData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    } catch {
      // noop
    }
  }

  private readLevel(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number {
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) sum += data[index];
    return (sum / data.length) / 255;
  }

  getLocalSpeakingLevel(): number {
    if (!this.localAnalyser || !this.localAnalyserData) return 0;
    return this.readLevel(this.localAnalyser, this.localAnalyserData);
  }

  getSpeakingLevel(peerId: string): number {
    const state = this.peers.get(peerId);
    if (!state?.analyser || !state.analyserData) return 0;
    return this.readLevel(state.analyser, state.analyserData);
  }

  callPeer(remotePeerId: string) {
    if (!this.peer || !this.localStream) return;
    if (this.peers.has(remotePeerId) || remotePeerId === this.myPeerId) return;

    this.trackMetric('voice_call_started');
    this.emit({ type: 'peer-call', peerId: remotePeerId });
    const call = this.peer.call(remotePeerId, this.localStream, {
      metadata: {
        voiceUserId: this.voiceUserId,
      },
    });
    this.observePeerConnection(remotePeerId, call);
    call.on('stream', (stream) => this.addPeerAudio(remotePeerId, call, stream));
    call.on('close', () => this.removePeerAudio(remotePeerId));
    call.on('error', (error) => {
      this.reportError('call_outgoing', error, { remotePeerId });
      this.removePeerAudio(remotePeerId);
    });
  }

  private handleIncomingCall(call: MediaConnection) {
    if (!this.localStream) return;
    this.observePeerConnection(call.peer, call);
    call.answer(this.localStream);
    call.on('stream', (stream) => this.addPeerAudio(call.peer, call, stream));
    call.on('close', () => this.removePeerAudio(call.peer));
    call.on('error', (error) => {
      this.reportError('call_incoming', error, { remotePeerId: call.peer });
      this.removePeerAudio(call.peer);
    });
  }

  private observePeerConnection(peerId: string, call: MediaConnection) {
    const conn = call as unknown as { peerConnection?: RTCPeerConnection };
    const pc = conn.peerConnection;
    if (!pc) return;

    const handleConnectionState = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        this.setRuntimeState('active', 'Voz activa.');
        this.trackMetric('voice_peer_connected');
        void this.reportRelayUsage(peerId, pc);
        return;
      }
      if (state === 'failed') {
        this.setRuntimeState('network_blocked', 'La red no permitio conectar la voz.');
        this.trackMetric('voice_connection_failed');
      } else if (state === 'disconnected') {
        this.setRuntimeState('retrying', 'Reintentando voz...');
      }
    };

    const handleIceState = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed') {
        this.setRuntimeState('network_blocked', 'La voz quedo bloqueada por la red.');
        this.trackMetric('voice_ice_failed');
      }
    };

    pc.addEventListener('connectionstatechange', handleConnectionState);
    pc.addEventListener('iceconnectionstatechange', handleIceState);
    call.once('close', () => {
      pc.removeEventListener('connectionstatechange', handleConnectionState);
      pc.removeEventListener('iceconnectionstatechange', handleIceState);
    });
  }

  private async reportRelayUsage(peerId: string, pc: RTCPeerConnection) {
    if (this.relayReportedPeerIds.has(peerId)) return;
    this.relayReportedPeerIds.add(peerId);
    try {
      const stats = await pc.getStats();
      let selectedPair: RTCStats | null = null;
      let localCandidate: RTCStats | null = null;
      let remoteCandidate: RTCStats | null = null;

      stats.forEach((entry) => {
        if (entry.type === 'transport') {
          const pairId = (entry as RTCTransportStats).selectedCandidatePairId;
          if (pairId) {
            selectedPair = stats.get(pairId) ?? null;
          }
        }
      });

      if (!selectedPair) {
        stats.forEach((entry) => {
          const pair = entry as RTCIceCandidatePairStats & { selected?: boolean };
          if (entry.type === 'candidate-pair' && (pair.selected || pair.nominated || pair.state === 'succeeded')) {
            selectedPair = entry;
          }
        });
      }

      const pair = selectedPair as RTCIceCandidatePairStats | null;
      if (pair) {
        if (pair.localCandidateId) localCandidate = stats.get(pair.localCandidateId) ?? null;
        if (pair.remoteCandidateId) remoteCandidate = stats.get(pair.remoteCandidateId) ?? null;
      }

      const localCandidateType = localCandidate && 'candidateType' in localCandidate
        ? (localCandidate as RTCStats & { candidateType?: string }).candidateType
        : undefined;
      const remoteCandidateType = remoteCandidate && 'candidateType' in remoteCandidate
        ? (remoteCandidate as RTCStats & { candidateType?: string }).candidateType
        : undefined;
      const relay =
        localCandidateType === 'relay'
        || remoteCandidateType === 'relay';

      this.trackMetric('voice_turn_path', {
        relay: Boolean(relay),
      });
    } catch (error) {
      this.reportError('relay_detection', error, { peerId });
    }
  }

  private addPeerAudio(peerId: string, conn: MediaConnection, stream: MediaStream) {
    if (this.peers.has(peerId)) this.removePeerAudio(peerId);

    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.volume = 0;
    audio.style.display = 'none';
    document.body.appendChild(audio);

    const state: PeerAudioState = { peerId, mediaConnection: conn, audioElement: audio, stream };
    this.peers.set(peerId, state);
    this.emit({ type: 'peer-stream', peerId });
    this.trackMetric('voice_remote_stream_received');

    if (this.firstRemoteAudioAt === null) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.firstRemoteAudioAt = now;
      const elapsedMs = Math.round(now - this.initStartedAt);
      this.trackMetric('voice_first_remote_audio_ms', { elapsed_ms: elapsedMs });
    }

    const setupVADIfStillConnected = () => {
      if (this.peers.has(peerId)) this.setupPeerVAD(state);
    };

    audio.play()
      .then(setupVADIfStillConnected)
      .catch((error) => {
        this.reportError('audio_autoplay', error, { peerId });
        audio.addEventListener('play', setupVADIfStillConnected, { once: true });
      });
  }

  private removePeerAudio(peerId: string) {
    const state = this.peers.get(peerId);
    if (!state) return;
    state.audioElement.pause();
    state.audioElement.srcObject = null;
    state.audioElement.remove();
    try {
      state.mediaConnection.close();
    } catch {
      // noop
    }
    state.stream.getTracks().forEach((trackEntry) => trackEntry.stop());
    this.peers.delete(peerId);
    this.mutedPeerIds.delete(peerId);
  }

  updateProximityVolumes(
    myPos: { x: number; y: number },
    peerPositions: Map<string, { x: number; y: number }>,
  ) {
    for (const [peerId, state] of this.peers) {
      const pos = peerPositions.get(peerId);
      if (!pos || this.mutedPeerIds.has(peerId)) {
        state.audioElement.volume = 0;
        continue;
      }

      const dx = myPos.x - pos.x;
      const dy = myPos.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let vol: number;
      if (dist <= this.config.minDistance) {
        vol = 1;
      } else if (dist >= this.config.maxDistance) {
        vol = 0;
      } else {
        const t = (dist - this.config.minDistance) / (this.config.maxDistance - this.config.minDistance);
        switch (this.config.falloffCurve) {
          case 'logarithmic':
            vol = 1 - Math.log(1 + t * 9) / Math.log(10);
            break;
          case 'exponential':
            vol = Math.pow(1 - t, 2);
            break;
          default:
            vol = 1 - t;
            break;
        }
      }

      const finalVolume = this.isMuted ? 0 : Math.max(0, Math.min(1, vol * this.config.masterVolume));
      state.audioElement.volume = finalVolume;
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.localStream?.getAudioTracks().forEach((trackEntry) => {
      trackEntry.enabled = !this.isMuted;
    });
    this.trackMetric('voice_mute_toggled', { muted: this.isMuted });
    return this.isMuted;
  }

  setPeerMuted(peerId: string, muted: boolean) {
    if (muted) this.mutedPeerIds.add(peerId);
    else this.mutedPeerIds.delete(peerId);
  }

  setMasterVolume(vol: number) {
    this.config.masterVolume = Math.max(0, Math.min(1, vol));
  }

  async applyOutputSink(sinkId: string): Promise<void> {
    const ctx = this.audioContext;
    if (!ctx || ctx.state === 'closed') return;
    const contextWithSink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (typeof contextWithSink.setSinkId !== 'function') return;
    try {
      await contextWithSink.setSinkId(sinkId);
    } catch (error) {
      this.reportError('set_sink_id', error);
    }
  }

  disconnectPeer(peerId: string) {
    this.removePeerAudio(peerId);
  }

  destroy() {
    for (const [peerId] of this.peers) this.removePeerAudio(peerId);
    this.peers.clear();
    this.mutedPeerIds.clear();
    this.relayReportedPeerIds.clear();
    this.localStream?.getTracks().forEach((trackEntry) => trackEntry.stop());
    this.localStream = null;
    try {
      this.audioContext?.close();
    } catch {
      // noop
    }
    this.audioContext = undefined;
    this.localAnalyser = undefined;
    this.localAnalyserData = undefined;
    this.peer?.destroy();
    this.peer = null;
    this.isInitialized = false;
    this.isInitializing = false;
    this.myPeerId = '';
    this.voiceUserId = '';
    this.sessionId = '';
    this.iceConfig = DEFAULT_ICE_CONFIG;
    this.setRuntimeState('disconnected', 'Voz apagada.');
  }

  get connected(): boolean { return this.isInitialized; }
  get muted(): boolean { return this.isMuted; }
  get peerCount(): number { return this.peers.size; }
  get peerId(): string { return this.myPeerId; }
  get connectedPeerIds(): string[] { return Array.from(this.peers.keys()); }
  get currentState(): VoiceUiState { return this.runtimeState; }
  get currentVoiceUserId(): string { return this.voiceUserId; }
}
