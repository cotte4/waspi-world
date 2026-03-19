// JukeboxSystem.ts
// Client-side singleton for jukebox queue, playback sync, and host management.
// Communicates via Supabase Realtime broadcast on channel "cafe_jukebox".
// All economy actions (add/skip) go through server-validated API routes.

import { supabase, isConfigured } from '../../lib/supabase';
import { eventBus, EVENTS } from '../config/eventBus';
import { getAuthHeaders } from './authHelper';
import { applyTenksBalanceFromServer } from './TenksSystem';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface JukeboxSong {
  videoId: string;
  title: string;
  artist: string;
  addedBy: string;
  addedByName: string;
  cost: 100 | 150;
  addedAt: number;
  queueId?: string;
}

export interface JukeboxState {
  queue: JukeboxSong[];
  nowPlaying: JukeboxSong | null;
  hostId: string | null;
  isFallback: boolean;
  skipVotesForCurrent: number;
}

type JukeboxReactionEmoji = '🔥' | '💩';

// ---------------------------------------------------------------------------
// Realtime broadcast event shapes
// ---------------------------------------------------------------------------

type BroadcastSongAdded = {
  type: 'JUKEBOX_SONG_ADDED';
  payload: JukeboxSong;
};
type BroadcastQueueUpdated = {
  type: 'JUKEBOX_QUEUE_UPDATED';
  payload: { queue: JukeboxSong[] };
};
type BroadcastNowPlaying = {
  type: 'JUKEBOX_NOW_PLAYING';
  payload: JukeboxSong & { startedAt: number };
};
type BroadcastSongEnded = {
  type: 'JUKEBOX_SONG_ENDED';
  payload: { videoId: string };
};
type BroadcastSkipped = {
  type: 'JUKEBOX_SKIPPED';
  payload: { videoId: string; skipVotes: number };
};
type BroadcastReaction = {
  type: 'JUKEBOX_REACTION';
  payload: { playerId: string; playerName: string; emoji: JukeboxReactionEmoji };
};
type BroadcastSkipVote = {
  type: 'JUKEBOX_SKIP_VOTE';
  payload: { playerId: string; videoId: string };
};
type BroadcastHostChanged = {
  type: 'JUKEBOX_HOST_CHANGED';
  payload: { hostId: string | null };
};
type BroadcastFallbackOn  = { type: 'JUKEBOX_FALLBACK_ON';  payload: Record<string, never> };
type BroadcastFallbackOff = { type: 'JUKEBOX_FALLBACK_OFF'; payload: Record<string, never> };

type JukeboxBroadcast =
  | BroadcastSongAdded
  | BroadcastQueueUpdated
  | BroadcastNowPlaying
  | BroadcastSongEnded
  | BroadcastSkipped
  | BroadcastReaction
  | BroadcastSkipVote
  | BroadcastHostChanged
  | BroadcastFallbackOn
  | BroadcastFallbackOff;

// ---------------------------------------------------------------------------
// PresenceState — used for host assignment (oldest join = host)
// ---------------------------------------------------------------------------

type JukeboxPresenceEntry = {
  playerId: string;
  playerName: string;
  joinedAt: number;
};

// ---------------------------------------------------------------------------
// JukeboxSystem singleton
// ---------------------------------------------------------------------------

type ChannelType = ReturnType<NonNullable<typeof supabase>['channel']>;

class JukeboxSystem {
  private static instance: JukeboxSystem | null = null;

  private channel: ChannelType | null = null;
  private playerId = '';
  private playerName = '';
  private state: JukeboxState = {
    queue: [],
    nowPlaying: null,
    hostId: null,
    isFallback: false,
    skipVotesForCurrent: 0,
  };

  private onSongEndedCallback: (() => void) | null = null;

  static getInstance(): JukeboxSystem {
    if (!JukeboxSystem.instance) {
      JukeboxSystem.instance = new JukeboxSystem();
    }
    return JukeboxSystem.instance;
  }

  // -------------------------------------------------------------------------
  // join — called when player enters CafeInterior
  // -------------------------------------------------------------------------

  join(playerId: string, playerName: string) {
    this.playerId = playerId;
    this.playerName = playerName;

    if (!supabase || !isConfigured) return;
    if (this.channel) return; // already joined

    this.channel = supabase.channel('cafe_jukebox', {
      config: {
        broadcast: { self: false },
        presence: { key: playerId },
      },
    });

    this.channel
      .on('broadcast', { event: '*' }, ({ event, payload }: { event: string; payload: unknown }) => {
        this.handleBroadcast({ type: event, payload } as JukeboxBroadcast);
      })
      .on('presence', { event: 'sync' }, () => {
        this.resolveHost();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.channel!.track({
            playerId,
            playerName,
            joinedAt: Date.now(),
          } satisfies JukeboxPresenceEntry);
        }
      });
  }

  // -------------------------------------------------------------------------
  // leave — called when player exits CafeInterior
  // -------------------------------------------------------------------------

  leave(playerId: string) {
    if (!this.channel) return;
    if (playerId !== this.playerId) return;

    this.channel.untrack();
    this.channel.unsubscribe();
    this.channel = null;
    this.state = {
      queue: [],
      nowPlaying: null,
      hostId: null,
      isFallback: false,
      skipVotesForCurrent: 0,
    };
  }

  // -------------------------------------------------------------------------
  // addSong — POST /api/jukebox/add (server-validated TENKS debit)
  // -------------------------------------------------------------------------

  async addSong(song: {
    videoId: string;
    title: string;
    artist: string;
    cost: 100 | 150;
  }): Promise<{ ok: boolean; error?: string; newBalance?: number }> {
    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/jukebox/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({
          ...song,
          addedByName: this.playerName,
        }),
      });

      const data = await res.json() as { ok?: boolean; error?: string; newBalance?: number; queueId?: string };

      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error ?? 'Error al agregar la canción.' };
      }

      const entry: JukeboxSong = {
        videoId: song.videoId,
        title: song.title,
        artist: song.artist,
        addedBy: this.playerId,
        addedByName: this.playerName,
        cost: song.cost,
        addedAt: Date.now(),
        queueId: data.queueId,
      };

      this.state.queue.push(entry);
      this.broadcastRaw('JUKEBOX_SONG_ADDED', entry);
      this.broadcastRaw('JUKEBOX_QUEUE_UPDATED', { queue: this.state.queue });

      eventBus.emit(EVENTS.JUKEBOX_ADD_SONG, entry);
      if (typeof data.newBalance === 'number') {
        applyTenksBalanceFromServer(data.newBalance, 'jukebox_add');
        eventBus.emit(EVENTS.JUKEBOX_TENKS_DEDUCTED, { newBalance: data.newBalance, cost: song.cost });
      }

      this.checkAndAdvanceQueue();
      return { ok: true, newBalance: data.newBalance };
    } catch (err) {
      console.error('JukeboxSystem.addSong error:', err);
      return { ok: false, error: 'Error de red al agregar la canción.' };
    }
  }

  // -------------------------------------------------------------------------
  // voteSkip — POST /api/jukebox/skip (server-validated)
  // -------------------------------------------------------------------------

  async voteSkip(): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
    const current = this.state.nowPlaying;
    if (!current?.queueId) {
      return { ok: false, error: 'No hay canción sonando.' };
    }

    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/jukebox/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ videoId: current.videoId, queueId: current.queueId }),
      });

      const data = await res.json() as {
        ok?: boolean;
        error?: string;
        voteCount?: number;
        skipped?: boolean;
        newBalance?: number;
      };

      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error ?? 'Error al votar skip.' };
      }

      this.state.skipVotesForCurrent = data.voteCount ?? 0;

      this.broadcastRaw('JUKEBOX_SKIP_VOTE', {
        playerId: this.playerId,
        videoId: current.videoId,
      });

      if (data.skipped) {
        this.broadcastRaw('JUKEBOX_SKIPPED', {
          videoId: current.videoId,
          skipVotes: data.voteCount ?? 0,
        });
        this.handleSkipped(current.videoId);
      }

      eventBus.emit(EVENTS.JUKEBOX_SKIP_REQUESTED, {
        voteCount: data.voteCount,
        skipped: data.skipped,
        newBalance: data.newBalance,
      });

      if (typeof data.newBalance === 'number') {
        applyTenksBalanceFromServer(data.newBalance, 'jukebox_skip');
        eventBus.emit(EVENTS.JUKEBOX_TENKS_DEDUCTED, { newBalance: data.newBalance, cost: 500 });
      }

      return { ok: true, skipped: data.skipped };
    } catch (err) {
      console.error('JukeboxSystem.voteSkip error:', err);
      return { ok: false, error: 'Error de red al votar skip.' };
    }
  }

  // -------------------------------------------------------------------------
  // react — free reaction (🔥 / 💩), fire-and-forget broadcast
  // -------------------------------------------------------------------------

  react(emoji: JukeboxReactionEmoji) {
    this.broadcastRaw('JUKEBOX_REACTION', {
      playerId: this.playerId,
      playerName: this.playerName,
      emoji,
    });
    eventBus.emit(EVENTS.JUKEBOX_REACTION_SENT, { emoji });
  }

  // -------------------------------------------------------------------------
  // setOnSongEnded — callback invoked by JukeboxPlayer when a song ends
  // -------------------------------------------------------------------------

  setOnSongEnded(cb: () => void) {
    this.onSongEndedCallback = cb;
  }

  onSongEnded() {
    if (!this.state.nowPlaying) return;
    const ended = this.state.nowPlaying;
    this.broadcastRaw('JUKEBOX_SONG_ENDED', { videoId: ended.videoId });
    this.state.nowPlaying = null;
    this.state.skipVotesForCurrent = 0;
    this.onSongEndedCallback?.();
    this.checkAndAdvanceQueue();
    eventBus.emit(EVENTS.JUKEBOX_STATE_UPDATED, this.getState());
  }

  // -------------------------------------------------------------------------
  // getState — snapshot for React overlay
  // -------------------------------------------------------------------------

  getState(): JukeboxState {
    return { ...this.state, queue: [...this.state.queue] };
  }

  isLocalHost(): boolean {
    return this.state.hostId === this.playerId;
  }

  destroy() {
    if (this.channel) {
      this.channel.untrack();
      this.channel.unsubscribe();
      this.channel = null;
    }
    JukeboxSystem.instance = null;
  }

  // -------------------------------------------------------------------------
  // Private — broadcast helpers
  // -------------------------------------------------------------------------

  private broadcastRaw(type: string, payload: unknown) {
    if (!this.channel) return;
    this.channel.send({ type: 'broadcast', event: type, payload }).catch(() => {/* silent */});
  }

  // -------------------------------------------------------------------------
  // Private — host resolution via Presence
  // -------------------------------------------------------------------------

  private resolveHost() {
    if (!this.channel) return;

    const presenceState = this.channel.presenceState() as Record<string, JukeboxPresenceEntry[]>;
    const entries: JukeboxPresenceEntry[] = Object.values(presenceState).flat();

    if (entries.length === 0) {
      if (this.state.hostId !== null) {
        this.state.hostId = null;
        this.broadcastRaw('JUKEBOX_HOST_CHANGED', { hostId: null });
        eventBus.emit(EVENTS.JUKEBOX_STATE_UPDATED, this.getState());
      }
      return;
    }

    // Oldest joinedAt = host
    entries.sort((a, b) => a.joinedAt - b.joinedAt);
    const newHostId = entries[0].playerId;

    if (newHostId !== this.state.hostId) {
      this.state.hostId = newHostId;
      this.broadcastRaw('JUKEBOX_HOST_CHANGED', { hostId: newHostId });
      eventBus.emit(EVENTS.JUKEBOX_STATE_UPDATED, this.getState());
    }

    // Presence puede llegar después del addSong: sin hostId aún, checkAndAdvanceQueue no avanza.
    if (entries.length > 0) {
      this.checkAndAdvanceQueue();
    }
  }

  // -------------------------------------------------------------------------
  // Private — queue advancement (only executed by host)
  // -------------------------------------------------------------------------

  private checkAndAdvanceQueue() {
    if (!this.isLocalHost()) return;
    if (this.state.nowPlaying) return;

    const next = this.state.queue[0];
    if (!next) {
      if (!this.state.isFallback) {
        this.state.isFallback = true;
        this.broadcastRaw('JUKEBOX_FALLBACK_ON', {});
        eventBus.emit(EVENTS.JUKEBOX_STATE_UPDATED, this.getState());
      }
      return;
    }

    if (this.state.isFallback) {
      this.state.isFallback = false;
      this.broadcastRaw('JUKEBOX_FALLBACK_OFF', {});
    }

    this.state.nowPlaying = next;
    this.state.queue = this.state.queue.filter((s) => s !== next);
    this.state.skipVotesForCurrent = 0;
    this.broadcastRaw('JUKEBOX_NOW_PLAYING', { ...next, startedAt: Date.now() });
    eventBus.emit(EVENTS.JUKEBOX_STATE_UPDATED, this.getState());
  }

  private handleSkipped(videoId: string) {
    if (this.state.nowPlaying?.videoId === videoId) {
      this.state.nowPlaying = null;
      this.state.skipVotesForCurrent = 0;
      this.checkAndAdvanceQueue();
      eventBus.emit(EVENTS.JUKEBOX_STATE_UPDATED, this.getState());
    }
  }

  // -------------------------------------------------------------------------
  // Private — incoming broadcast handler
  // -------------------------------------------------------------------------

  private handleBroadcast(msg: JukeboxBroadcast) {
    switch (msg.type) {
      case 'JUKEBOX_SONG_ADDED':
        if (!this.state.queue.find((s) => s.videoId === msg.payload.videoId)) {
          this.state.queue.push(msg.payload);
        }
        break;

      case 'JUKEBOX_QUEUE_UPDATED':
        this.state.queue = msg.payload.queue;
        break;

      case 'JUKEBOX_NOW_PLAYING':
        this.state.nowPlaying = msg.payload;
        this.state.isFallback = false;
        this.state.skipVotesForCurrent = 0;
        this.state.queue = this.state.queue.filter((s) => s.videoId !== msg.payload.videoId);
        break;

      case 'JUKEBOX_SONG_ENDED':
        if (this.state.nowPlaying?.videoId === msg.payload.videoId) {
          this.state.nowPlaying = null;
          this.state.skipVotesForCurrent = 0;
        }
        break;

      case 'JUKEBOX_SKIPPED':
        this.handleSkipped(msg.payload.videoId);
        return; // state already updated inside handleSkipped

      case 'JUKEBOX_SKIP_VOTE':
        if (this.state.nowPlaying?.videoId === msg.payload.videoId) {
          this.state.skipVotesForCurrent += 1;
        }
        break;

      case 'JUKEBOX_REACTION':
        // Reactions are handled by CafeInterior for the floating emoji effect
        eventBus.emit(EVENTS.JUKEBOX_REACTION_SENT, msg.payload);
        return;

      case 'JUKEBOX_HOST_CHANGED':
        this.state.hostId = msg.payload.hostId;
        break;

      case 'JUKEBOX_FALLBACK_ON':
        this.state.isFallback = true;
        break;

      case 'JUKEBOX_FALLBACK_OFF':
        this.state.isFallback = false;
        break;

      default:
        return;
    }

    eventBus.emit(EVENTS.JUKEBOX_STATE_UPDATED, this.getState());
  }
}

export const jukeboxSystem = JukeboxSystem.getInstance;
export { JukeboxSystem };
