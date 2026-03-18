// GET /api/mastery
// Returns: { mastery: { skill_id: string; mp: number; unlocked: string[] }[] }

import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ── Types ───────────────────────────────────────────────────────────────────

const VALID_SKILL_IDS = ['mining', 'fishing', 'gardening', 'cooking', 'gym', 'weed'] as const;

interface MasteryMpRow {
  skill_id: string;
  points: number;
}

interface MasteryUnlockRow {
  skill_id: string;
  node_id: string;
}

interface MasteryEntry {
  skill_id: string;
  mp: number;
  unlocked: string[];
}

// ── GET /api/mastery ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const [mpRes, unlocksRes] = await Promise.all([
    admin
      .from('player_mastery_mp')
      .select('skill_id, points')
      .eq('user_id', user.id)
      .returns<MasteryMpRow[]>(),
    admin
      .from('player_mastery_unlocks')
      .select('skill_id, node_id')
      .eq('user_id', user.id)
      .returns<MasteryUnlockRow[]>(),
  ]);

  if (mpRes.error) {
    return NextResponse.json({ error: mpRes.error.message }, { status: 500 });
  }
  if (unlocksRes.error) {
    return NextResponse.json({ error: unlocksRes.error.message }, { status: 500 });
  }

  // Build lookup maps
  const mpMap = new Map<string, number>(
    (mpRes.data ?? []).map((r) => [r.skill_id, r.points])
  );

  const unlockedMap = new Map<string, string[]>();
  for (const row of unlocksRes.data ?? []) {
    const existing = unlockedMap.get(row.skill_id) ?? [];
    existing.push(row.node_id);
    unlockedMap.set(row.skill_id, existing);
  }

  // Return all 6 skills, defaulting to mp=0 and unlocked=[] if no row
  const mastery: MasteryEntry[] = VALID_SKILL_IDS.map((skillId) => ({
    skill_id: skillId,
    mp: mpMap.get(skillId) ?? 0,
    unlocked: unlockedMap.get(skillId) ?? [],
  }));

  return NextResponse.json({ mastery });
}
