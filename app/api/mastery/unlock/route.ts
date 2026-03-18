// POST /api/mastery/unlock
// Body: { skill_id: string; node_id: string }
// Returns: { success: true; new_mp: number } | { error: string }
//
// Unlocks a mastery node after validating Lv5, MP balance, prerequisites,
// and that the node hasn't been unlocked already.

import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { getMasteryTree, getMasteryNode } from '@/src/game/config/masteryTrees';

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_SKILL_IDS = new Set(['mining', 'fishing', 'gardening', 'cooking', 'gym', 'weed']);

// ── Types ────────────────────────────────────────────────────────────────────

interface UnlockBody {
  skill_id: string;
  node_id: string;
}

interface SkillRow {
  level: number;
}

interface MasteryMpRow {
  points: number;
}

interface MasteryUnlockRow {
  node_id: string;
}

// ── POST /api/mastery/unlock ─────────────────────────────────────────────────

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
  let body: UnlockBody;
  try {
    body = (await request.json()) as UnlockBody;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { skill_id, node_id } = body;

  if (typeof skill_id !== 'string' || !VALID_SKILL_IDS.has(skill_id)) {
    return NextResponse.json({ error: 'invalid_skill_id' }, { status: 400 });
  }

  if (typeof node_id !== 'string') {
    return NextResponse.json({ error: 'invalid_node_id' }, { status: 400 });
  }

  // Validate node exists in the correct tree (server-side, from config)
  const tree = getMasteryTree(skill_id as Parameters<typeof getMasteryTree>[0]);
  if (!tree) {
    return NextResponse.json({ error: 'invalid_skill_id' }, { status: 400 });
  }

  const node = getMasteryNode(node_id);
  if (!node || node.skillId !== skill_id) {
    return NextResponse.json({ error: 'invalid_node_id' }, { status: 400 });
  }

  // Check player is Lv5 in this skill
  const { data: skillRow } = await admin
    .from('player_skills')
    .select('level')
    .eq('user_id', user.id)
    .eq('skill_id', skill_id)
    .single<SkillRow>();

  if (!skillRow || skillRow.level < 5) {
    return NextResponse.json({ error: 'Necesitas Lv5 en esta skill.' }, { status: 403 });
  }

  // Load MP and unlocked nodes in parallel
  const [mpRes, unlocksRes] = await Promise.all([
    admin
      .from('player_mastery_mp')
      .select('points')
      .eq('user_id', user.id)
      .eq('skill_id', skill_id)
      .maybeSingle<MasteryMpRow>(),
    admin
      .from('player_mastery_unlocks')
      .select('node_id')
      .eq('user_id', user.id)
      .eq('skill_id', skill_id)
      .returns<MasteryUnlockRow[]>(),
  ]);

  if (mpRes.error) {
    return NextResponse.json({ error: mpRes.error.message }, { status: 500 });
  }
  if (unlocksRes.error) {
    return NextResponse.json({ error: unlocksRes.error.message }, { status: 500 });
  }

  const currentMp = mpRes.data?.points ?? 0;
  const unlockedIds = new Set((unlocksRes.data ?? []).map((r) => r.node_id));

  // Validate: enough MP
  if (currentMp < node.cost) {
    return NextResponse.json({ error: 'MP insuficiente.' }, { status: 400 });
  }

  // Validate: not already unlocked
  if (unlockedIds.has(node_id)) {
    return NextResponse.json({ error: 'Nodo ya desbloqueado.' }, { status: 400 });
  }

  // Validate: prerequisites are unlocked
  for (const prereqId of node.requires) {
    if (!unlockedIds.has(prereqId)) {
      return NextResponse.json(
        { error: `Prerequisito no desbloqueado: ${prereqId}` },
        { status: 400 }
      );
    }
  }

  // Insert unlock record
  const { error: insertError } = await admin
    .from('player_mastery_unlocks')
    .insert({ user_id: user.id, skill_id, node_id });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Deduct MP
  const newMp = currentMp - node.cost;
  const { error: updateError } = await admin
    .from('player_mastery_mp')
    .upsert(
      { user_id: user.id, skill_id, points: newMp },
      { onConflict: 'user_id,skill_id' }
    );

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, new_mp: newMp });
}
