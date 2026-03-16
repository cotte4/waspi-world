/**
 * StatsSystem — module-level singleton for player stat tracking.
 *
 * Scenes call the record* functions directly (fire-and-forget, never blocking).
 * Stats are held in memory, flushed to Supabase every 30s and on demand.
 * Guest players (no userId) accumulate stats in-memory only for the session.
 */

import { supabase } from '../../lib/supabase';
import { eventBus, EVENTS } from '../config/eventBus';

export type PlayerStats = {
  zombie_kills: number;
  pvp_kills: number;
  deaths: number;
  kill_streak_best: number;
  tenks_earned: number;
  tenks_spent: number;
  time_played_seconds: number;
  distance_walked: number;
  zones_visited: string[];
  npcs_talked_to: number;
  basket_best_score: number;
  basket_shots: number;
  basket_makes: number;
  penalty_goals: number;
  penalty_saves: number;
  penalty_wins: number;
  penalty_losses: number;
};

const DEFAULT_STATS: PlayerStats = {
  zombie_kills: 0,
  pvp_kills: 0,
  deaths: 0,
  kill_streak_best: 0,
  tenks_earned: 0,
  tenks_spent: 0,
  time_played_seconds: 0,
  distance_walked: 0,
  zones_visited: [],
  npcs_talked_to: 0,
  basket_best_score: 0,
  basket_shots: 0,
  basket_makes: 0,
  penalty_goals: 0,
  penalty_saves: 0,
  penalty_wins: 0,
  penalty_losses: 0,
};

let cache: PlayerStats = { ...DEFAULT_STATS };
let userId: string | null = null;
let dirty = false;
let currentStreak = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let sessionStartMs = 0;
let eventUnsubs: Array<() => void> = [];

// ─── Internal flush ──────────────────────────────────────────────────────────

async function flush(): Promise<void> {
  if (!dirty || !userId || !supabase) return;
  dirty = false;
  const { error } = await supabase
    .from('player_stats')
    .upsert(
      { user_id: userId, ...cache, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) {
    dirty = true; // retry on next tick
    console.warn('[StatsSystem] flush error', error.message);
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function initStatsSystem(uid: string): Promise<void> {
  // Tear down any previous session first.
  teardownStatsSystem();

  userId = uid;
  sessionStartMs = Date.now();

  if (supabase) {
    const { data } = await supabase
      .from('player_stats')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle<PlayerStats & { user_id: string; updated_at: string }>();

    if (data) {
      cache = {
        zombie_kills: data.zombie_kills,
        pvp_kills: data.pvp_kills,
        deaths: data.deaths,
        kill_streak_best: data.kill_streak_best,
        tenks_earned: data.tenks_earned,
        tenks_spent: data.tenks_spent,
        time_played_seconds: data.time_played_seconds,
        distance_walked: data.distance_walked,
        zones_visited: Array.isArray(data.zones_visited) ? data.zones_visited : [],
        npcs_talked_to: data.npcs_talked_to,
        basket_best_score: data.basket_best_score,
        basket_shots: data.basket_shots,
        basket_makes: data.basket_makes,
        penalty_goals: data.penalty_goals,
        penalty_saves: data.penalty_saves,
        penalty_wins: data.penalty_wins,
        penalty_losses: data.penalty_losses,
      };
    }
  }

  // Subscribe to eventBus events emitted by scenes.
  eventUnsubs = [
    eventBus.on(EVENTS.STATS_ZOMBIE_KILL, () => recordZombieKill()),
    eventBus.on(EVENTS.STATS_PVP_RESULT, (payload: unknown) => {
      const p = payload as { won: boolean } | null;
      if (p?.won) recordPvpKill();
      else recordDeath();
    }),
    eventBus.on(EVENTS.STATS_BASKET_GAME, (payload: unknown) => {
      const p = payload as { score: number; shots: number; makes: number } | null;
      if (p) recordBasketGame(p.score, p.shots, p.makes);
    }),
    eventBus.on(EVENTS.PENALTY_RESULT, (payload: unknown) => {
      const p = payload as { won: boolean; goals: number; shots: number } | null;
      if (!p) return;
      recordPenaltyGame(p.won, p.goals, p.shots - p.goals);
    }),
    eventBus.on(EVENTS.SCENE_CHANGED, (payload: unknown) => {
      if (typeof payload === 'string') recordZoneVisited(payload);
    }),
    // Track TENKS economy automatically via existing TENKS_CHANGED event
    eventBus.on(EVENTS.TENKS_CHANGED, (payload: unknown) => {
      const p = payload as { delta: number; reason: string } | null;
      if (!p || p.delta === 0 || p.reason === 'init') return;
      if (p.delta > 0) recordTenksEarned(p.delta);
      else recordTenksSpent(-p.delta);
    }),
  ];

  flushTimer = setInterval(() => { void flush(); }, 30_000);
}

export function flushStatsSystem(): Promise<void> {
  // Accumulate session time before flushing.
  if (sessionStartMs > 0) {
    const elapsed = Math.floor((Date.now() - sessionStartMs) / 1000);
    cache.time_played_seconds += elapsed;
    sessionStartMs = Date.now(); // reset so we don't double-count
    dirty = true;
  }
  return flush();
}

export function teardownStatsSystem(): void {
  eventUnsubs.forEach((unsub) => unsub());
  eventUnsubs = [];
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  cache = { ...DEFAULT_STATS };
  userId = null;
  dirty = false;
  currentStreak = 0;
  sessionStartMs = 0;
}

// ─── Record functions (called from scenes or eventBus handlers) ────────────

function recordZombieKill(): void {
  cache.zombie_kills += 1;
  currentStreak += 1;
  if (currentStreak > cache.kill_streak_best) {
    cache.kill_streak_best = currentStreak;
  }
  dirty = true;
}

function recordPvpKill(): void {
  cache.pvp_kills += 1;
  currentStreak += 1;
  if (currentStreak > cache.kill_streak_best) {
    cache.kill_streak_best = currentStreak;
  }
  dirty = true;
}

function recordDeath(): void {
  cache.deaths += 1;
  currentStreak = 0;
  dirty = true;
}

function recordBasketGame(score: number, shots: number, makes: number): void {
  if (score > cache.basket_best_score) cache.basket_best_score = score;
  cache.basket_shots += Math.max(0, shots);
  cache.basket_makes += Math.max(0, makes);
  dirty = true;
}

function recordPenaltyGame(won: boolean, goals: number, saves: number): void {
  cache.penalty_goals += Math.max(0, goals);
  cache.penalty_saves += Math.max(0, saves);
  if (won) cache.penalty_wins += 1;
  else cache.penalty_losses += 1;
  dirty = true;
}

function recordZoneVisited(zone: string): void {
  if (!cache.zones_visited.includes(zone)) {
    cache.zones_visited = [...cache.zones_visited, zone];
    dirty = true;
  }
}

export function recordDistanceDelta(pixels: number): void {
  if (pixels <= 0) return;
  cache.distance_walked += Math.floor(pixels);
  dirty = true;
}

export function recordTenksEarned(amount: number): void {
  cache.tenks_earned += Math.max(0, Math.floor(amount));
  dirty = true;
}

export function recordTenksSpent(amount: number): void {
  cache.tenks_spent += Math.max(0, Math.floor(amount));
  dirty = true;
}

export function recordNpcTalk(): void {
  cache.npcs_talked_to += 1;
  dirty = true;
}

export function getStats(): Readonly<PlayerStats> {
  return { ...cache };
}
