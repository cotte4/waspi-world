// GuildSystem.ts
// Client-side singleton for guild membership, rep, and join logic.
// Loads from /api/guilds; joinGuild POSTs to /api/guilds/join.
// All fetches are fire-and-forget with silent catch — never crashes the game.

import type { GuildId, GuildRank } from '../config/guilds';
import { GUILD_RANK_ORDER, RANK_THRESHOLDS } from '../config/guilds';

// Re-export for convenience
export type { GuildId, GuildRank };
export { GUILD_RANK_ORDER };
export const GUILD_REP_THRESHOLDS = RANK_THRESHOLDS;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GuildMembership = {
  guild_id: GuildId;
  rep: number;
  rank: GuildRank;
  joined_at: string;
};

export type GuildWithRep = {
  id: GuildId;
  name: string;
  tagline: string;
  color: string;
  icon: string;
  skill_id: string;
  player_rep: GuildMembership | null;
};

// ---------------------------------------------------------------------------
// GuildSystem
// ---------------------------------------------------------------------------

class GuildSystem {
  private guilds: GuildWithRep[] = [];
  private loaded = false;

  // -------------------------------------------------------------------------
  // loadGuilds — GET /api/guilds
  // -------------------------------------------------------------------------

  async loadGuilds(): Promise<void> {
    try {
      const res = await fetch('/api/guilds');
      if (!res.ok) return;
      const data = await res.json() as { guilds?: GuildWithRep[] };
      if (Array.isArray(data.guilds)) {
        this.guilds = data.guilds;
        this.loaded = true;
      }
    } catch { /* silent */ }
  }

  // -------------------------------------------------------------------------
  // getGuilds — returns a shallow copy of all loaded guilds
  // -------------------------------------------------------------------------

  getGuilds(): GuildWithRep[] {
    return [...this.guilds];
  }

  // -------------------------------------------------------------------------
  // getMemberships — only guilds the player has joined
  // -------------------------------------------------------------------------

  getMemberships(): GuildMembership[] {
    return this.guilds
      .filter((g) => g.player_rep !== null)
      .map((g) => g.player_rep as GuildMembership);
  }

  // -------------------------------------------------------------------------
  // isMember
  // -------------------------------------------------------------------------

  isMember(guildId: GuildId): boolean {
    return this.guilds.some((g) => g.id === guildId && g.player_rep !== null);
  }

  // -------------------------------------------------------------------------
  // getRep — 0 if not a member
  // -------------------------------------------------------------------------

  getRep(guildId: GuildId): number {
    const guild = this.guilds.find((g) => g.id === guildId);
    return guild?.player_rep?.rep ?? 0;
  }

  // -------------------------------------------------------------------------
  // getRank — 'novato' if not a member
  // -------------------------------------------------------------------------

  getRank(guildId: GuildId): GuildRank {
    const guild = this.guilds.find((g) => g.id === guildId);
    return guild?.player_rep?.rank ?? 'novato';
  }

  // -------------------------------------------------------------------------
  // getMemberCount — how many guilds the player belongs to
  // -------------------------------------------------------------------------

  getMemberCount(): number {
    return this.getMemberships().length;
  }

  // -------------------------------------------------------------------------
  // joinGuild — POST /api/guilds/join; reloads data on success
  // -------------------------------------------------------------------------

  async joinGuild(
    guildId: GuildId,
  ): Promise<{ success: boolean; notice?: string; error?: string }> {
    try {
      const res = await fetch('/api/guilds/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId }),
      });
      const data = await res.json() as { notice?: string; error?: string };

      if (res.ok) {
        await this.loadGuilds();
        return { success: true, notice: data.notice };
      }

      return { success: false, error: data.error };
    } catch {
      return { success: false, error: 'Error de red.' };
    }
  }

  // -------------------------------------------------------------------------
  // addRep — POST /api/guilds/rep, fire-and-forget; fallback silencioso
  // -------------------------------------------------------------------------

  async addRep(
    guildId: GuildId,
    action: string,
    amount: number,
  ): Promise<{ rank_up: boolean; new_rank: GuildRank }> {
    try {
      const res = await fetch('/api/guilds/rep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId, action, amount }),
      });
      if (!res.ok) return { rank_up: false, new_rank: this.getRank(guildId) };

      const data = await res.json() as { rank_up?: boolean; new_rank?: GuildRank };

      // Update local state optimistically
      const guild = this.guilds.find((g) => g.id === guildId);
      if (guild?.player_rep) {
        guild.player_rep.rep += amount;
        if (data.new_rank) guild.player_rep.rank = data.new_rank;
      }

      return {
        rank_up: data.rank_up ?? false,
        new_rank: data.new_rank ?? this.getRank(guildId),
      };
    } catch {
      return { rank_up: false, new_rank: this.getRank(guildId) };
    }
  }

  // -------------------------------------------------------------------------
  // isLoaded
  // -------------------------------------------------------------------------

  isLoaded(): boolean {
    return this.loaded;
  }
}

// ---------------------------------------------------------------------------
// Singleton exports
// ---------------------------------------------------------------------------

let _instance: GuildSystem | null = null;

export function getGuildSystem(): GuildSystem {
  if (!_instance) _instance = new GuildSystem();
  return _instance;
}

export function initGuildSystem(): Promise<void> {
  return getGuildSystem().loadGuilds();
}
