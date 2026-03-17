import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ---------------------------------------------------------------------------
// Inline validation constants (never import from src/game — browser code)
// ---------------------------------------------------------------------------

const VALID_SKILL_IDS = [
  'mining', 'fishing', 'gardening', 'cooking', 'gym', 'weed',
] as const;
type SkillId = (typeof VALID_SKILL_IDS)[number];

const VALID_SPEC_IDS = [
  'mining_extractor', 'mining_prospector',
  'gardening_botanist', 'gardening_cultivator',
  'weed_grower', 'weed_dealer',
  'fishing_baitmaster', 'fishing_hunter',
  'cooking_neighborhood', 'cooking_alchemist',
  'gym_athlete', 'gym_fighter',
] as const;
type SpecId = (typeof VALID_SPEC_IDS)[number];

// Maps each spec_id to its owning skill_id — used to validate that the
// requested spec belongs to the skill the player wants to specialize.
const SPEC_TO_SKILL: Record<SpecId, SkillId> = {
  mining_extractor:    'mining',
  mining_prospector:   'mining',
  gardening_botanist:  'gardening',
  gardening_cultivator:'gardening',
  weed_grower:         'weed',
  weed_dealer:         'weed',
  fishing_baitmaster:  'fishing',
  fishing_hunter:      'fishing',
  cooking_neighborhood:'cooking',
  cooking_alchemist:   'cooking',
  gym_athlete:         'gym',
  gym_fighter:         'gym',
};

// Display names echoed back in the success notice
const SPEC_NAMES: Record<SpecId, string> = {
  mining_extractor:    'EXTRACTOR',
  mining_prospector:   'PROSPECTOR',
  gardening_botanist:  'BOTANICO',
  gardening_cultivator:'CULTIVADOR',
  weed_grower:         'GROWER',
  weed_dealer:         'DEALER',
  fishing_baitmaster:  'BATEADOR',
  fishing_hunter:      'CAZADOR',
  cooking_neighborhood:'CHEF DE BARRIO',
  cooking_alchemist:   'ALQUIMISTA',
  gym_athlete:         'ATLETA',
  gym_fighter:         'PELEADOR',
};

// Minimum level required to choose a specialization
const MIN_LEVEL_FOR_SPEC = 3;

// ---------------------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------------------

interface SkillRow {
  level: number;
}

interface SpecRow {
  skill_id: string;
  spec_id: string;
  chosen_at: string;
}

// ---------------------------------------------------------------------------
// GET /api/skills/specialize
// Returns all specializations chosen by the authenticated player.
// Response: { specializations: Array<{ skill_id, spec_id, chosen_at }> }
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
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

  const { data, error } = await admin
    .from('player_specializations')
    .select('skill_id, spec_id, chosen_at')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const specializations = (data as SpecRow[]).map((row) => ({
    skill_id:  row.skill_id,
    spec_id:   row.spec_id,
    chosen_at: row.chosen_at,
  }));

  return NextResponse.json({ specializations });
}

// ---------------------------------------------------------------------------
// POST /api/skills/specialize
// Chooses a specialization for a skill. Permanent — cannot be changed.
//
// Body: { skill_id: string, spec_id: string }
// Returns: { spec_id, skill_id, notice }
// Errors:
//   400 — invalid input, or player level too low
//   409 — specialization already chosen for this skill
// ---------------------------------------------------------------------------

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

  // --- Parse and validate body ---
  const body = await request.json().catch(() => null) as {
    skill_id?: unknown;
    spec_id?: unknown;
  } | null;

  const rawSkillId = body?.skill_id;
  const rawSpecId  = body?.spec_id;

  if (
    typeof rawSkillId !== 'string' ||
    !(VALID_SKILL_IDS as readonly string[]).includes(rawSkillId)
  ) {
    return NextResponse.json({ error: 'skill_id inválido.' }, { status: 400 });
  }

  if (
    typeof rawSpecId !== 'string' ||
    !(VALID_SPEC_IDS as readonly string[]).includes(rawSpecId)
  ) {
    return NextResponse.json({ error: 'spec_id inválido.' }, { status: 400 });
  }

  const skillId = rawSkillId as SkillId;
  const specId  = rawSpecId  as SpecId;

  // Validate that the spec belongs to the declared skill
  if (SPEC_TO_SKILL[specId] !== skillId) {
    return NextResponse.json(
      { error: `La especialización "${specId}" no pertenece al skill "${skillId}".` },
      { status: 400 },
    );
  }

  // --- Read player's skill level and existing spec in parallel ---
  const [skillResult, existingResult] = await Promise.all([
    admin
      .from('player_skills')
      .select('level')
      .eq('user_id', user.id)
      .eq('skill_id', skillId)
      .maybeSingle<SkillRow>(),
    admin
      .from('player_specializations')
      .select('spec_id')
      .eq('user_id', user.id)
      .eq('skill_id', skillId)
      .maybeSingle<{ spec_id: string }>(),
  ]);

  if (skillResult.error) {
    return NextResponse.json({ error: skillResult.error.message }, { status: 500 });
  }

  if (existingResult.error) {
    return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
  }

  const playerLevel = skillResult.data?.level ?? 0;

  if (playerLevel < MIN_LEVEL_FOR_SPEC) {
    return NextResponse.json(
      { error: `Necesitas Lv${MIN_LEVEL_FOR_SPEC} para especializar. Nivel actual: ${playerLevel}.` },
      { status: 400 },
    );
  }

  if (existingResult.data !== null) {
    return NextResponse.json(
      { error: 'Ya elegiste especialización para este skill.', current_spec: existingResult.data.spec_id },
      { status: 409 },
    );
  }

  // --- Insert specialization ---
  const { error: insertError } = await admin
    .from('player_specializations')
    .insert({ user_id: user.id, skill_id: skillId, spec_id: specId });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const specName = SPEC_NAMES[specId];

  return NextResponse.json({
    spec_id:  specId,
    skill_id: skillId,
    notice:   `Especialización ${specName} elegida!`,
  });
}
