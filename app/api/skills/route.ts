import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { getSkillDef } from '@/src/game/config/skillTrees';
import type { MilestoneDef } from '@/src/game/config/skillTrees';

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_SKILL_IDS = ['mining', 'fishing', 'gardening', 'cooking', 'gym', 'weed'] as const;
type SkillId = (typeof VALID_SKILL_IDS)[number];

/** Cumulative XP required to reach each level. Index == level number. */
const XP_THRESHOLDS: Record<number, number> = {
  0: 0,
  1: 0,    // Everyone with the skill is at least Lv1
  2: 100,
  3: 300,
  4: 700,
  5: 1500,
};

const MAX_LEVEL = 5;
const MAX_XP_GAIN_PER_REQUEST = 50;

// ── Types ──────────────────────────────────────────────────────────────────

interface SkillRow {
  user_id: string;
  skill_id: SkillId;
  xp: number;
  level: number;
  action_count: number;
  updated_at: string;
}

interface SkillPublic {
  skill_id: SkillId;
  xp: number;
  level: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function computeLevel(xp: number): number {
  let level = 1; // anyone who has a skill row is at least Lv1
  for (let lv = MAX_LEVEL; lv >= 1; lv--) {
    if (xp >= XP_THRESHOLDS[lv]) {
      level = lv;
      break;
    }
  }
  return level;
}

/** Returns the default (zeroed) state for every skill when no DB rows exist. */
function defaultSkills(): SkillPublic[] {
  return VALID_SKILL_IDS.map((skill_id) => ({ skill_id, xp: 0, level: 0 }));
}

function isValidSkillId(value: unknown): value is SkillId {
  return VALID_SKILL_IDS.includes(value as SkillId);
}

// ── GET /api/skills ────────────────────────────────────────────────────────

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

  const { data, error } = await admin
    .from('player_skills')
    .select('skill_id, xp, level')
    .eq('user_id', user.id)
    .returns<SkillPublic[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If the player has no rows yet, return zeroed defaults for all skills
  if (!data || data.length === 0) {
    return NextResponse.json({ skills: defaultSkills() });
  }

  // Fill in any missing skills with zeroed defaults
  const existingIds = new Set(data.map((r) => r.skill_id));
  const missing: SkillPublic[] = VALID_SKILL_IDS
    .filter((id) => !existingIds.has(id))
    .map((skill_id) => ({ skill_id, xp: 0, level: 0 }));

  return NextResponse.json({ skills: [...data, ...missing] });
}

// ── POST /api/skills ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await request.json().catch(() => null) as {
    skill_id?: unknown;
    xp_gain?: unknown;
    source?: unknown;
  } | null;

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // ── Validate skill_id ─────────────────────────────────────────────────────
  if (!isValidSkillId(body.skill_id)) {
    return NextResponse.json(
      { error: `skill_id must be one of: ${VALID_SKILL_IDS.join(', ')}.` },
      { status: 400 },
    );
  }
  const skill_id: SkillId = body.skill_id;

  // ── Validate xp_gain ──────────────────────────────────────────────────────
  const xp_gain = body.xp_gain;
  if (
    typeof xp_gain !== 'number' ||
    !Number.isInteger(xp_gain) ||
    xp_gain < 1 ||
    xp_gain > MAX_XP_GAIN_PER_REQUEST
  ) {
    return NextResponse.json(
      { error: `xp_gain must be a positive integer between 1 and ${MAX_XP_GAIN_PER_REQUEST}.` },
      { status: 400 },
    );
  }

  // ── Validate source ───────────────────────────────────────────────────────
  if (typeof body.source !== 'string' || body.source.trim() === '') {
    return NextResponse.json({ error: 'source must be a non-empty string.' }, { status: 400 });
  }

  // ── Fetch current skill row ───────────────────────────────────────────────
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const { data: existing, error: fetchError } = await admin
    .from('player_skills')
    .select('xp, level, action_count')
    .eq('user_id', user.id)
    .eq('skill_id', skill_id)
    .maybeSingle<Pick<SkillRow, 'xp' | 'level' | 'action_count'>>();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // ── Compute new XP, level, and action count ───────────────────────────────
  const currentXp = existing?.xp ?? 0;
  const newXp = currentXp + xp_gain;
  const oldLevel = existing?.level ?? 0;
  const newLevel = computeLevel(newXp);
  const leveled_up = newLevel > oldLevel;
  const oldActionCount = existing?.action_count ?? 0;
  const newActionCount = oldActionCount + 1;

  // ── Upsert ────────────────────────────────────────────────────────────────
  const { data: upserted, error: upsertError } = await admin
    .from('player_skills')
    .upsert(
      {
        user_id: user.id,
        skill_id,
        xp: newXp,
        level: newLevel,
        action_count: newActionCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,skill_id' },
    )
    .select('skill_id, xp, level')
    .single<SkillPublic>();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // ── Check for newly unlocked milestones ───────────────────────────────────
  let milestone_unlocked: MilestoneDef | null = null;
  try {
    const skillDef = getSkillDef(skill_id);
    const crossed = skillDef.milestones.filter(
      (m) => oldActionCount < m.count && newActionCount >= m.count,
    );
    if (crossed.length > 0) {
      const milestone = crossed[0];
      await admin.from('player_skill_milestones').upsert(
        { user_id: user.id, skill_id, milestone_id: milestone.id, reached_at: new Date().toISOString() },
        { onConflict: 'user_id,skill_id,milestone_id', ignoreDuplicates: true },
      );
      milestone_unlocked = milestone;
    }
  } catch {
    // Milestone check failures are non-critical — never block the XP response
  }

  return NextResponse.json({
    skill_id: upserted.skill_id,
    xp: upserted.xp,
    level: upserted.level,
    leveled_up,
    ...(milestone_unlocked ? { milestone_unlocked } : {}),
  });
}
