// GET /api/events
// Returns: { events: GlobalEvent[] }
// Eventos activos: start_at <= now() AND end_at > now()
// Ruta pública — no requiere auth

import { NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ── Types ──────────────────────────────────────────────────────────────────

interface GlobalEventEffect {
  multiplier?: number;
  shift?: number;
}

interface GlobalEvent {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  start_at: string;
  end_at: string;
  event_type: 'xp_boost' | 'quality_boost' | 'community';
  skill_ids: string[];
  effect: GlobalEventEffect;
}

// ── GET /api/events ────────────────────────────────────────────────────────

export async function GET() {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const now = new Date().toISOString();

  const { data, error } = await admin
    .from('global_events')
    .select('id, name, description, icon, color, start_at, end_at, event_type, skill_ids, effect')
    .lte('start_at', now)
    .gte('end_at', now)
    .order('start_at')
    .returns<GlobalEvent[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
