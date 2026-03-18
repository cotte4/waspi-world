// POST /api/mastery/earn
// Body: { skill_id: string }
// Returns: { awarded: boolean; new_mp: number }
//
// Grants 1 MP when the player is at Lv5 in the given skill.
// Rate limiting is handled client-side (max 1 call per action).

import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_SKILL_IDS = new Set(['mining', 'fishing', 'gardening', 'cooking', 'gym', 'weed']);

// ── Types ────────────────────────────────────────────────────────────────────

interface EarnBody {
  skill_id: string;
}

interface SkillRow {
  level: number;
}

interface MasteryMpRow {
  points: number;
}

// ── POST /api/mastery/earn ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
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

  // Validate body
  let body: EarnBody;
  try {
    body = (await request.json()) as EarnBody;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { skill_id } = body;

  if (typeof skill_id !== 'string' || !VALID_SKILL_IDS.has(skill_id)) {
    return NextResponse.json({ error: 'invalid_skill_id' }, { status: 400 });
  }

  // Check player is Lv5 in this skill
  const { data: skillRow } = await admin
    .from('player_skills')
    .select('level')
    .eq('user_id', user.id)
    .eq('skill_id', skill_id)
    .single<SkillRow>();

  if (!skillRow || skillRow.level < 5) {
    return NextResponse.json({ awarded: false, new_mp: 0 });
  }

  // Read current MP for this skill (may not exist yet)
  const { data: mpRow } = await admin
    .from('player_mastery_mp')
    .select('points')
    .eq('user_id', user.id)
    .eq('skill_id', skill_id)
    .maybeSingle<MasteryMpRow>();

  const currentPoints = mpRow?.points ?? 0;
  const newPoints = currentPoints + 1;

  // Upsert with the incremented value
  const { error: upsertError } = await admin
    .from('player_mastery_mp')
    .upsert(
      { user_id: user.id, skill_id, points: newPoints },
      { onConflict: 'user_id,skill_id' }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ awarded: true, new_mp: newPoints });
}
