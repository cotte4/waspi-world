/**
 * logger.ts — Waspi World event logger
 *
 * Inserts events into the `event_logs` Supabase table.
 * All calls are fire-and-forget: never throws, never blocks responses.
 *
 * ── SQL MIGRATION (run once in Supabase SQL editor) ──────────────────────────
 *
 *   create table event_logs (
 *     id          uuid primary key default gen_random_uuid(),
 *     created_at  timestamptz default now(),
 *     event_type  text not null,
 *     player_id   uuid,
 *     player_email text,
 *     metadata    jsonb default '{}'::jsonb,
 *     severity    text default 'info'
 *   );
 *
 *   -- No RLS: only accessible server-side via service role key.
 *   -- Optionally add an index for dashboarding:
 *   create index idx_event_logs_type_created on event_logs (event_type, created_at desc);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createSupabaseAdminClient } from './supabaseServer';

export type LogEventType =
  | 'tenks_earn'
  | 'tenks_spend'
  | 'purchase'
  | 'player_login'
  | 'server_error';

export interface LogEvent {
  event_type: LogEventType;
  player_id?: string;
  player_email?: string;
  metadata?: Record<string, unknown>;
  severity?: 'info' | 'warn' | 'error';
}

export async function logEvent(event: LogEvent): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) return;
    await admin.from('event_logs').insert({
      event_type: event.event_type,
      player_id: event.player_id ?? null,
      player_email: event.player_email ?? null,
      metadata: event.metadata ?? {},
      severity: event.severity ?? 'info',
    });
  } catch {
    // Fire-and-forget — never propagate logging errors
  }
}
