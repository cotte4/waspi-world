import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import {
  type QualityTier,
  QUALITY_LABELS,
  QUALITY_COLORS,
  QUALITY_XP_BONUS,
  QUALITY_ROLL_WEIGHTS,
  QUALITY_ROLL_WEIGHTS_AUTO,
  rollQualityFromWeights,
} from '@/src/game/config/qualityTiers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_SKILL_IDS = ['mining', 'fishing', 'gardening', 'cooking', 'gym', 'weed'] as const;
type SkillId = (typeof VALID_SKILL_IDS)[number];

const VALID_SOURCES = [
  'node_collect',   // mining
  'farm_harvest',   // gardening / weed
  'fish_catch',     // fishing
  'cook_recipe',    // cooking
  'gym_session',    // gym
] as const;

// ---------------------------------------------------------------------------
// POST /api/skills/quality
// Rolls a quality tier server-side based on the player's actual skill level.
//
// Body: { skill_id: string, source: string, is_auto?: boolean }
// Returns: { quality, label, color, xp_bonus, value_mult }
// ---------------------------------------------------------------------------

interface SkillRow {
  level: number;
}

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  // Parse + validate body
  const body = await request.json().catch(() => null) as {
    skill_id?: unknown;
    source?: unknown;
    is_auto?: unknown;
  } | null;

  const skillId = body?.skill_id;
  const source  = body?.source;
  const isAuto  = body?.is_auto === true;

  if (typeof skillId !== 'string' || !(VALID_SKILL_IDS as readonly string[]).includes(skillId)) {
    return NextResponse.json({ error: 'Invalid skill_id.' }, { status: 400 });
  }

  if (typeof source !== 'string' || !(VALID_SOURCES as readonly string[]).includes(source)) {
    return NextResponse.json({ error: 'Invalid source.' }, { status: 400 });
  }

  // Read player's current skill level from DB (never trust client)
  const { data: skillRow, error: skillError } = await admin
    .from('player_skills')
    .select('level')
    .eq('user_id', user.id)
    .eq('skill_id', skillId)
    .maybeSingle<SkillRow>();

  if (skillError) {
    return NextResponse.json({ error: skillError.message }, { status: 500 });
  }

  const level = skillRow?.level ?? 0;

  // Select roll weights: auto mode is capped at basic/normal
  const weights = isAuto
    ? QUALITY_ROLL_WEIGHTS_AUTO
    : (QUALITY_ROLL_WEIGHTS[level] ?? QUALITY_ROLL_WEIGHTS[0]);

  const quality: QualityTier = rollQualityFromWeights(weights);

  return NextResponse.json({
    quality,
    label:      QUALITY_LABELS[quality],
    color:      QUALITY_COLORS[quality],
    xp_bonus:   QUALITY_XP_BONUS[quality],
    value_mult: getValueMult(quality),
    level,      // echoed back so client can display ceiling info
  });
}

function getValueMult(quality: QualityTier): number {
  const mults: Record<QualityTier, number> = {
    basic: 1.0, normal: 1.5, good: 2.0, excellent: 3.0, legendary: 5.0,
  };
  return mults[quality];
}
