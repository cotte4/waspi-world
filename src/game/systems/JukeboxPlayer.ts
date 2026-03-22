// JukeboxPlayer.ts
// YouTube IFrame API — all clients in the café play audio; only the presence "host"
// reports ENDED/errors so the queue advances once per track.

import { getDefaultJukeboxFallbackTrack, getLocalJukeboxSongByVideoId } from './jukeboxLibrary';
import { eventBus, EVENTS } from '../config/eventBus';

// Extend the Window type for the YouTube IFrame API
declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          width: number;
          height: number;
          playerVars: {
            autoplay: number;
            controls: number;
            disablekb: number;
            fs: number;
            origin?: string;
            rel: number;
            modestbranding: number;
            playsinline: number;
          };
          events: {
            onStateChange?: (event: { data: number }) => void;
            onError?: (event: { data: number }) => void;
            onReady?: () => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  loadVideoById(videoId: string): void;
  playVideo?: () => void;
  mute?: () => void;
  stopVideo(): void;
  destroy(): void;
  unMute?: () => void;
  setVolume?: (volume: number) => void;
}

const PLAYER_CONTAINER_ID = 'jukebox-yt-player';
const LOCAL_AUDIO_ID = 'jukebox-local-audio';

export class JukeboxPlayer {
  private static apiReadyCallbacks = new Set<() => void>();
  private static apiScriptInjected = false;

  private player: YTPlayer | null = null;
  /** Only the presence "host" reports ENDED so the queue advances once for the room. */
  private shouldReportEnded = false;
  private pendingVideoId: string | null = null;
  private currentVideoId: string | null = null;
  private onSongEnded: () => void;
  private apiLoaded = false;
  private playerReady = false;
  private myApiCallback: (() => void) | null = null;
  private userGestureUnsub: (() => void) | null = null;
  private localAudio: HTMLAudioElement | null = null;
  private fallbackActive = false;
  private playbackRetryTimer: number | null = null;
  private playbackRetryAttempts = 0;

  constructor(onSongEnded: () => void) {
    this.onSongEnded = onSongEnded;
    this.ensureContainer();
    this.ensureLocalAudio();
    this.loadYouTubeApi();
  }

  // -------------------------------------------------------------------------
  // setHost — called when host assignment changes
  // -------------------------------------------------------------------------

  setHost(isHost: boolean) {
    this.shouldReportEnded = isHost;
  }

  // -------------------------------------------------------------------------
  // play — load and autoplay a videoId
  // -------------------------------------------------------------------------

  play(videoId: string) {
    if (this.currentVideoId === videoId && (this.player || this.pendingVideoId === videoId)) {
      return;
    }
    this.bindUserGestureRetry();
    this.currentVideoId = videoId;
    this.pendingVideoId = null;
    if (this.tryPlayLocalTrack(videoId)) {
      return;
    }
    if (!this.player || !this.playerReady) {
      this.pendingVideoId = videoId;
      if (this.apiLoaded) {
        this.initPlayer();
      }
      return;
    }

    this.startPlayback(videoId);
  }

  stop() {
    this.pendingVideoId = null;
    this.currentVideoId = null;
    this.clearPlaybackRetry();
    this.stopLocalAudio();
    if (!this.player) return;
    try {
      this.player.stopVideo();
    } catch { /* player may be torn down */ }
  }

  // -------------------------------------------------------------------------
  // destroy — cleanup DOM and player instance
  // -------------------------------------------------------------------------

  destroy() {
    if (this.player) {
      try {
        this.player.stopVideo();
        this.player.destroy();
      } catch { /* silent — player may already be destroyed */ }
      this.player = null;
    }
    this.playerReady = false;

    if (this.myApiCallback) {
      JukeboxPlayer.apiReadyCallbacks.delete(this.myApiCallback);
      this.myApiCallback = null;
    }

    this.userGestureUnsub?.();
    this.userGestureUnsub = null;

    const container = document.getElementById(PLAYER_CONTAINER_ID);
    if (container) container.remove();
    this.localAudio?.remove();
    this.localAudio = null;

    this.shouldReportEnded = false;
    this.pendingVideoId = null;
    this.clearPlaybackRetry();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private ensureContainer() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(PLAYER_CONTAINER_ID)) return;

    const div = document.createElement('div');
    div.id = PLAYER_CONTAINER_ID;
    // Keep player valid for YouTube autoplay/viewport checks, but visually unobtrusive.
    div.style.cssText =
      'position:fixed;opacity:0.01;pointer-events:none;width:220px;height:220px;bottom:8px;right:8px;z-index:1;';
    document.body.appendChild(div);
  }

  private ensureLocalAudio() {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById(LOCAL_AUDIO_ID);
    if (existing instanceof HTMLAudioElement) {
      this.localAudio = existing;
      return;
    }

    const audio = document.createElement('audio');
    audio.id = LOCAL_AUDIO_ID;
    audio.preload = 'auto';
    audio.style.display = 'none';
    audio.addEventListener('ended', () => {
      if (this.shouldReportEnded) {
        this.onSongEnded();
      }
    });
    document.body.appendChild(audio);
    this.localAudio = audio;
  }

  private loadYouTubeApi() {
    if (typeof window === 'undefined') return;

    if (window.YT?.Player) {
      this.apiLoaded = true;
      if (this.pendingVideoId && !this.player) this.initPlayer();
      return;
    }

    // Register callback in the shared static Set (safe across multiple instances)
    this.myApiCallback = () => {
      this.apiLoaded = true;
      if (this.pendingVideoId && !this.player) this.initPlayer();
    };
    JukeboxPlayer.apiReadyCallbacks.add(this.myApiCallback);

    // Only set the global handler once
    if (!window.onYouTubeIframeAPIReady) {
      window.onYouTubeIframeAPIReady = () => {
        JukeboxPlayer.apiReadyCallbacks.forEach((cb) => cb());
      };
    }

    // Only inject the script once
    if (!JukeboxPlayer.apiScriptInjected && !document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      JukeboxPlayer.apiScriptInjected = true;
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }

  private tryUnmutePlaying() {
    if (!this.player) return;
    try {
      this.player.unMute?.();
      this.player.setVolume?.(100);
    } catch { /* iframe may not be ready */ }
  }

  private stopLocalAudio() {
    this.fallbackActive = false;
    if (!this.localAudio) return;
    try {
      this.localAudio.pause();
      this.localAudio.currentTime = 0;
      this.localAudio.loop = false;
      this.localAudio.removeAttribute('src');
      this.localAudio.load();
    } catch { /* local audio may be unavailable */ }
  }

  private tryPlayLocalTrack(videoId: string): boolean {
    const localSong = getLocalJukeboxSongByVideoId(videoId);
    if (!localSong || !this.localAudio) return false;
    try {
      this.clearPlaybackRetry();
      this.stopLocalAudio();
      this.localAudio.src = localSong.assetPath;
      this.localAudio.currentTime = 0;
      this.localAudio.volume = 1;
      void this.localAudio.play()
        .then(() => eventBus.emit(EVENTS.JUKEBOX_AUDIO_UNLOCKED))
        .catch(() => eventBus.emit(EVENTS.JUKEBOX_AUDIO_UNLOCK_REQUIRED));
      return true;
    } catch {
      eventBus.emit(EVENTS.JUKEBOX_AUDIO_UNLOCK_REQUIRED);
      return false;
    }
  }

  private clearPlaybackRetry() {
    if (this.playbackRetryTimer !== null) {
      window.clearTimeout(this.playbackRetryTimer);
      this.playbackRetryTimer = null;
    }
    this.playbackRetryAttempts = 0;
  }

  private schedulePlaybackRetry(videoId: string) {
    if (typeof window === 'undefined') return;
    if (!this.player || !this.playerReady) return;
    if (this.playbackRetryAttempts >= 4) return;
    if (this.playbackRetryTimer !== null) return;

    this.playbackRetryTimer = window.setTimeout(() => {
      this.playbackRetryTimer = null;
      if (!this.player || !this.playerReady) return;
      if (this.currentVideoId !== videoId || this.fallbackActive) return;
      this.playbackRetryAttempts += 1;
      try {
        this.player.playVideo?.();
        this.tryUnmutePlaying();
      } catch {
        eventBus.emit(EVENTS.JUKEBOX_AUDIO_UNLOCK_REQUIRED);
      }
      this.schedulePlaybackRetry(videoId);
    }, 1200);
  }

  playFallback() {
    const fallbackTrack = getDefaultJukeboxFallbackTrack();
    if (!fallbackTrack || !this.localAudio) return;
    if (this.fallbackActive && this.localAudio.src.includes(fallbackTrack.assetPath)) return;
    this.bindUserGestureRetry();
    this.currentVideoId = null;
    this.pendingVideoId = null;
    this.clearPlaybackRetry();
    this.fallbackActive = true;
    try {
      this.stopLocalAudio();
      this.fallbackActive = true;
      this.localAudio.src = fallbackTrack.assetPath;
      this.localAudio.currentTime = 0;
      this.localAudio.loop = true;
      this.localAudio.volume = 0.65;
      void this.localAudio.play()
        .then(() => eventBus.emit(EVENTS.JUKEBOX_AUDIO_UNLOCKED))
        .catch(() => eventBus.emit(EVENTS.JUKEBOX_AUDIO_UNLOCK_REQUIRED));
    } catch { /* local audio may be unavailable */ }
  }

  private startPlayback(videoId: string) {
    this.stopLocalAudio();
    if (this.tryPlayLocalTrack(videoId)) return;
    if (!this.player || !this.playerReady) {
      this.pendingVideoId = videoId;
      return;
    }
    this.clearPlaybackRetry();
    try {
      // Start muted first to satisfy autoplay policies, then unmute best-effort.
      this.player.loadVideoById(videoId);
      this.player.mute?.();
      this.player.playVideo?.();
      this.schedulePlaybackRetry(videoId);
      window.setTimeout(() => this.tryUnmutePlaying(), 250);
    } catch {
      eventBus.emit(EVENTS.JUKEBOX_AUDIO_UNLOCK_REQUIRED);
    }
  }

  private bindUserGestureRetry() {
    if (typeof window === 'undefined' || this.userGestureUnsub) return;
    const retry = () => {
      if (this.fallbackActive) {
        this.playFallback();
        return;
      }
      if (!this.currentVideoId) return;
      if (this.tryPlayLocalTrack(this.currentVideoId)) return;
      if (!this.player) return;
      try {
        this.player.playVideo?.();
        this.tryUnmutePlaying();
      } catch { /* silent */ }
    };
    const onGesture = () => retry();
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture);
    this.userGestureUnsub = () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }

  private initPlayer() {
    if (!window.YT?.Player) return;
    if (this.player) return;
    this.bindUserGestureRetry();

    this.player = new window.YT.Player(PLAYER_CONTAINER_ID, {
      width: 220,
      height: 220,
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          this.playerReady = true;
          this.tryUnmutePlaying();
          if (this.pendingVideoId) {
            this.startPlayback(this.pendingVideoId);
            this.pendingVideoId = null;
            this.tryUnmutePlaying();
          }
        },
        onStateChange: (event) => {
          if (!window.YT?.PlayerState) return;
          if (event.data === window.YT.PlayerState.PLAYING) {
            this.clearPlaybackRetry();
            eventBus.emit(EVENTS.JUKEBOX_AUDIO_UNLOCKED);
            this.tryUnmutePlaying();
          }
          if (event.data === window.YT.PlayerState.CUED && this.currentVideoId) {
            this.player?.playVideo?.();
            this.schedulePlaybackRetry(this.currentVideoId);
          }
          if (event.data === window.YT.PlayerState.BUFFERING && this.currentVideoId) {
            this.schedulePlaybackRetry(this.currentVideoId);
          }
          if (event.data === window.YT.PlayerState.ENDED && this.shouldReportEnded) {
            this.clearPlaybackRetry();
            this.onSongEnded();
          } else if (event.data === window.YT.PlayerState.ENDED) {
            this.clearPlaybackRetry();
          }
        },
        onError: (event) => {
          this.clearPlaybackRetry();
          console.error('JukeboxPlayer YouTube error code:', event.data);
          if (this.shouldReportEnded) this.onSongEnded();
        },
      },
    });
  }
}
