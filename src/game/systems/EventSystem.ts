// EventSystem.ts
// Client-side singleton for global events that affect all players simultaneously.
// Loads from /api/events; polls every 5 minutes by default.
// All fetch failures are caught silently so the game never crashes.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GlobalEventType = 'xp_boost' | 'quality_boost' | 'community';

export type EventEffect = {
  multiplier?: number; // for xp_boost
  shift?: number;      // for quality_boost
};

export type GlobalEvent = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  start_at: string;
  end_at: string;
  event_type: GlobalEventType;
  skill_ids: string[];  // empty = all skills
  effect: EventEffect;
};

// ---------------------------------------------------------------------------
// API response shape
// ---------------------------------------------------------------------------

type ApiEventsResponse = {
  events?: GlobalEvent[];
};

// ---------------------------------------------------------------------------
// EventSystem class
// ---------------------------------------------------------------------------

class EventSystem {
  private events: GlobalEvent[] = [];
  private loaded = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // -------------------------------------------------------------------------
  // loadEvents — GET /api/events
  // -------------------------------------------------------------------------

  async loadEvents(): Promise<void> {
    try {
      const res = await fetch('/api/events');
      if (!res.ok) return;
      const data = (await res.json()) as ApiEventsResponse;
      if (Array.isArray(data.events)) {
        this.events = data.events;
        this.loaded = true;
      }
    } catch { /* silent */ }
  }

  // -------------------------------------------------------------------------
  // getActiveEvents — client-side time filter (double validation)
  // -------------------------------------------------------------------------

  getActiveEvents(): GlobalEvent[] {
    const now = Date.now();
    return this.events.filter((ev) => {
      const start = new Date(ev.start_at).getTime();
      const end = new Date(ev.end_at).getTime();
      return start <= now && now < end;
    });
  }

  // -------------------------------------------------------------------------
  // getXpMultiplier — returns the highest multiplier for a skill from xp_boost
  // events. Base 1.0. Two events return the greater, not multiplicative.
  // -------------------------------------------------------------------------

  getXpMultiplier(skillId: string): number {
    const active = this.getActiveEvents().filter(
      (ev) => ev.event_type === 'xp_boost',
    );
    let best = 1.0;
    for (const ev of active) {
      const appliesToSkill =
        ev.skill_ids.length === 0 || ev.skill_ids.includes(skillId);
      if (appliesToSkill && typeof ev.effect.multiplier === 'number') {
        if (ev.effect.multiplier > best) best = ev.effect.multiplier;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // getQualityShift — returns the highest shift for a skill from quality_boost
  // events. Returns 0 if no active events apply.
  // -------------------------------------------------------------------------

  getQualityShift(skillId: string): number {
    const active = this.getActiveEvents().filter(
      (ev) => ev.event_type === 'quality_boost',
    );
    let best = 0;
    for (const ev of active) {
      const appliesToSkill =
        ev.skill_ids.length === 0 || ev.skill_ids.includes(skillId);
      if (appliesToSkill && typeof ev.effect.shift === 'number') {
        if (ev.effect.shift > best) best = ev.effect.shift;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // hasActiveEvents
  // -------------------------------------------------------------------------

  hasActiveEvents(): boolean {
    return this.getActiveEvents().length > 0;
  }

  // -------------------------------------------------------------------------
  // startPolling — reloads events every intervalMs (default 5 minutes)
  // -------------------------------------------------------------------------

  startPolling(intervalMs = 300_000): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      void this.loadEvents();
    }, intervalMs);
  }

  // -------------------------------------------------------------------------
  // stopPolling
  // -------------------------------------------------------------------------

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
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

let _instance: EventSystem | null = null;

export function getEventSystem(): EventSystem {
  if (!_instance) _instance = new EventSystem();
  return _instance;
}

export function initEventSystem(): Promise<void> {
  return getEventSystem().loadEvents();
}
