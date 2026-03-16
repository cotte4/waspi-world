import Peer, { type MediaConnection } from 'peerjs';

// ─── Types ────────────────────────────────────────────────────────────────────

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

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// ─── Class ────────────────────────────────────────────────────────────────────

export class VoiceChatManager {
  private peer: Peer | null = null;
  private localStream: MediaStream | null = null;
  private peers: Map<string, PeerAudioState> = new Map();
  private config: VoiceChatConfig;
  private isMuted = false;
  private isInitialized = false;
  private myPeerId = '';

  // Web Audio API — shared context, local VAD
  private audioContext?: AudioContext;
  private localAnalyser?: AnalyserNode;
  private localAnalyserData?: Uint8Array<ArrayBuffer>;

  constructor(config?: Partial<VoiceChatConfig>) {
    this.config = {
      minDistance: 150,
      maxDistance: 600,
      falloffCurve: 'logarithmic',
      masterVolume: 1.0,
      ...config,
    };
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  async init(userId: string, deviceId?: string): Promise<string> {
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId) audioConstraints.deviceId = { exact: deviceId };

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });

    this.setupLocalVAD();

    this.myPeerId = `waspi-${userId}`;
    this.peer = new Peer(this.myPeerId, { config: ICE_SERVERS, debug: 1 });

    await new Promise<void>((resolve, reject) => {
      this.peer!.on('open', () => resolve());
      this.peer!.on('error', reject);
    });

    this.peer.on('call', (incoming) => this.handleIncomingCall(incoming));
    this.peer.on('disconnected', () => {
      try { this.peer?.reconnect(); } catch { /* noop */ }
    });

    this.isInitialized = true;
    console.log(`[VoiceChat] Ready as ${this.myPeerId}`);
    return this.myPeerId;
  }

  // ─── Mic device management ─────────────────────────────────────────────────

  static async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  /**
   * Switch to a different microphone while keeping all active WebRTC calls alive.
   * Uses RTCRtpSender.replaceTrack() — no renegotiation needed.
   */
  async switchMic(deviceId: string): Promise<void> {
    if (!this.isInitialized) return;

    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const newTrack = newStream.getAudioTracks()[0];

    // Hot-swap the audio track in every active peer connection
    for (const [, state] of this.peers) {
      const conn = state.mediaConnection as unknown as { peerConnection?: RTCPeerConnection };
      const pc = conn.peerConnection;
      if (!pc) continue;
      const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(newTrack);
    }

    // Stop old stream tracks and swap
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = newStream;

    // Re-setup local VAD with the new stream
    this.localAnalyser = undefined;
    this.localAnalyserData = undefined;
    this.setupLocalVAD();

    console.log(`[VoiceChat] Mic switched to device: ${deviceId}`);
  }

  // ─── VAD (Voice Activity Detection) ───────────────────────────────────────

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private setupLocalVAD(): void {
    if (!this.localStream) return;
    const ctx = this.getAudioContext();
    const source = ctx.createMediaStreamSource(this.localStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    // Do NOT connect to destination — prevents mic playback echo
    this.localAnalyser = analyser;
    this.localAnalyserData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
  }

  private setupPeerVAD(state: PeerAudioState): void {
    try {
      const ctx = this.getAudioContext();
      // createMediaElementSource can only be called once per element
      const source = ctx.createMediaElementSource(state.audioElement);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination); // Must reconnect so audio still plays
      state.analyser = analyser;
      state.analyserData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    } catch {
      // Already wrapped — silently skip
    }
  }

  private readLevel(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number {
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return (sum / data.length) / 255; // 0–1
  }

  /** 0–1 level of the local mic. Call every frame for live feedback. */
  getLocalSpeakingLevel(): number {
    if (!this.localAnalyser || !this.localAnalyserData) return 0;
    return this.readLevel(this.localAnalyser, this.localAnalyserData);
  }

  /** 0–1 level for a remote peer's audio stream. */
  getSpeakingLevel(peerId: string): number {
    const state = this.peers.get(peerId);
    if (!state?.analyser || !state.analyserData) return 0;
    return this.readLevel(state.analyser, state.analyserData);
  }

  // ─── Connections ───────────────────────────────────────────────────────────

  callPeer(remotePeerId: string): void {
    if (!this.peer || !this.localStream) return;
    if (this.peers.has(remotePeerId)) return;
    if (remotePeerId === this.myPeerId) return;

    const call = this.peer.call(remotePeerId, this.localStream);
    call.on('stream', (stream) => this.addPeerAudio(remotePeerId, call, stream));
    call.on('close', () => this.removePeerAudio(remotePeerId));
    call.on('error', () => this.removePeerAudio(remotePeerId));
  }

  private handleIncomingCall(call: MediaConnection): void {
    if (!this.localStream) return;
    call.answer(this.localStream);
    call.on('stream', (stream) => this.addPeerAudio(call.peer, call, stream));
    call.on('close', () => this.removePeerAudio(call.peer));
    call.on('error', () => this.removePeerAudio(call.peer));
  }

  // ─── Audio elements ────────────────────────────────────────────────────────

  private addPeerAudio(peerId: string, conn: MediaConnection, stream: MediaStream): void {
    if (this.peers.has(peerId)) this.removePeerAudio(peerId);

    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.volume = 0;
    audio.style.display = 'none';
    document.body.appendChild(audio);

    const state: PeerAudioState = { peerId, mediaConnection: conn, audioElement: audio, stream };
    this.peers.set(peerId, state);

    // Setup VAD after audio starts playing (autoplay policy).
    // Guard: peer might have left before play() resolves.
    const setupVADIfStillConnected = () => {
      if (this.peers.has(peerId)) this.setupPeerVAD(state);
    };
    audio.play()
      .then(setupVADIfStillConnected)
      .catch(() => {
        audio.addEventListener('play', setupVADIfStillConnected, { once: true });
      });

    console.log(`[VoiceChat] +peer ${peerId} (total: ${this.peers.size})`);
  }

  private removePeerAudio(peerId: string): void {
    const state = this.peers.get(peerId);
    if (!state) return;
    state.audioElement.pause();
    state.audioElement.srcObject = null;
    state.audioElement.remove();
    try { state.mediaConnection.close(); } catch { /* noop */ }
    state.stream.getTracks().forEach((t) => t.stop());
    this.peers.delete(peerId);
    console.log(`[VoiceChat] -peer ${peerId}`);
  }

  // ─── Proximity volume ──────────────────────────────────────────────────────

  updateProximityVolumes(
    myPos: { x: number; y: number },
    peerPositions: Map<string, { x: number; y: number }>,
  ): void {
    for (const [peerId, state] of this.peers) {
      const pos = peerPositions.get(peerId);
      if (!pos) { state.audioElement.volume = 0; continue; }

      const dx = myPos.x - pos.x;
      const dy = myPos.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let vol: number;
      if (dist <= this.config.minDistance) {
        vol = 1.0;
      } else if (dist >= this.config.maxDistance) {
        vol = 0.0;
      } else {
        const t = (dist - this.config.minDistance) / (this.config.maxDistance - this.config.minDistance);
        switch (this.config.falloffCurve) {
          case 'logarithmic': vol = 1.0 - Math.log(1 + t * 9) / Math.log(10); break;
          case 'exponential': vol = Math.pow(1.0 - t, 2); break;
          default: vol = 1.0 - t;
        }
      }

      vol = this.isMuted ? 0 : Math.max(0, Math.min(1, vol * this.config.masterVolume));
      state.audioElement.volume = vol;
    }
  }

  // ─── Controls ──────────────────────────────────────────────────────────────

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = !this.isMuted; });
    return this.isMuted;
  }

  setMasterVolume(vol: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, vol));
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  disconnectPeer(peerId: string): void {
    this.removePeerAudio(peerId);
  }

  destroy(): void {
    for (const [id] of this.peers) this.removePeerAudio(id);
    this.peers.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    try { this.audioContext?.close(); } catch { /* noop */ }
    this.audioContext = undefined;
    this.localAnalyser = undefined;
    this.localAnalyserData = undefined;
    this.peer?.destroy();
    this.peer = null;
    this.isInitialized = false;
    console.log('[VoiceChat] Destroyed');
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

  get connected(): boolean { return this.isInitialized; }
  get muted(): boolean { return this.isMuted; }
  get peerCount(): number { return this.peers.size; }
  get peerId(): string { return this.myPeerId; }
  get connectedPeerIds(): string[] { return Array.from(this.peers.keys()); }
}
