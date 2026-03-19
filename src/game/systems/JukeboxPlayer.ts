// JukeboxPlayer.ts
// Wrapper for the YouTube IFrame API.
// Only the "host" client instantiates and controls the player.
// All other clients receive playback state via Supabase Realtime broadcast.

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
            rel: number;
            modestbranding: number;
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
  stopVideo(): void;
  destroy(): void;
}

const PLAYER_CONTAINER_ID = 'jukebox-yt-player';

export class JukeboxPlayer {
  private player: YTPlayer | null = null;
  private isHost = false;
  private pendingVideoId: string | null = null;
  private onSongEnded: () => void;
  private apiLoaded = false;

  constructor(onSongEnded: () => void) {
    this.onSongEnded = onSongEnded;
    this.ensureContainer();
    this.loadYouTubeApi();
  }

  // -------------------------------------------------------------------------
  // setHost — called when host assignment changes
  // -------------------------------------------------------------------------

  setHost(isHost: boolean) {
    this.isHost = isHost;

    if (isHost && !this.player && this.apiLoaded) {
      this.initPlayer();
    } else if (!isHost && this.player) {
      this.player.stopVideo();
    }
  }

  // -------------------------------------------------------------------------
  // play — load and autoplay a videoId (host only)
  // -------------------------------------------------------------------------

  play(videoId: string) {
    if (!this.isHost) return;

    if (!this.player) {
      // Queue the video until the player is ready
      this.pendingVideoId = videoId;
      if (this.apiLoaded) {
        this.initPlayer();
      }
      return;
    }

    this.player.loadVideoById(videoId);
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

    const container = document.getElementById(PLAYER_CONTAINER_ID);
    if (container) container.remove();

    this.isHost = false;
    this.pendingVideoId = null;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private ensureContainer() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(PLAYER_CONTAINER_ID)) return;

    const div = document.createElement('div');
    div.id = PLAYER_CONTAINER_ID;
    // Visually hidden but present in DOM so audio plays
    div.style.cssText =
      'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px;left:-9999px;';
    document.body.appendChild(div);
  }

  private loadYouTubeApi() {
    if (typeof window === 'undefined') return;

    if (window.YT?.Player) {
      this.apiLoaded = true;
      return;
    }

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      this.apiLoaded = true;
      if (this.isHost) {
        this.initPlayer();
      }
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }

  private initPlayer() {
    if (!window.YT?.Player) return;
    if (this.player) return;

    this.player = new window.YT.Player(PLAYER_CONTAINER_ID, {
      width: 1,
      height: 1,
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        modestbranding: 1,
      },
      events: {
        onReady: () => {
          if (this.pendingVideoId) {
            this.player?.loadVideoById(this.pendingVideoId);
            this.pendingVideoId = null;
          }
        },
        onStateChange: (event) => {
          if (!window.YT?.PlayerState) return;
          if (event.data === window.YT.PlayerState.ENDED) {
            this.onSongEnded();
          }
        },
        onError: (event) => {
          console.error('JukeboxPlayer YouTube error code:', event.data);
          // Treat errors as song ended so the queue advances
          this.onSongEnded();
        },
      },
    });
  }
}
