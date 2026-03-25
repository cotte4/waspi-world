import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { appendTenksTransaction, syncPlayerMetadataSnapshot } from '@/src/lib/commercePersistence';
import { creditBalance } from '@/src/lib/tenksBalance';

const VALID_SKILL_IDS = ['mining', 'fishing', 'gardening', 'cooking', 'gym', 'weed'] as const;
type SkillId = (typeof VALID_SKILL_IDS)[number];

const XP_THRESHOLDS: Record<number, number> = {
  0: 0,
  1: 0,
  2: 100,
  3: 300,
  4: 700,
  5: 1500,
};
const MAX_LEVEL = 5;
const MAX_XP_GAIN = 50;

interface DailyQuestRow {
  id: string;
  date: string;
  skill_id: string;
  action_type: string;
  target: number;
  reward_xp: number;
  reward_tenks: number;
}

interface PlayerDailyQuestRow {
  progress: number;
  completed_at: string | null;
  updated_at: string | null;
}

interface SkillRow {
  xp: number;
  level: number;
}

function getTodayUtc(): string {
  return new Date().toISOString().split('T')[0];
}

function isValidSkillId(value: unknown): value is SkillId {
  return VALID_SKILL_IDS.includes(value as SkillId);
}

function computeLevel(xp: number): number {
  let level = 0;
  for (let lv = MAX_LEVEL; lv >= 1; lv--) {
    if (xp >= (XP_THRESHOLDS[lv] ?? Infinity)) {
      level = lv;
      break;
    }
  }
  return level;
}

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    quest_id?: unknown;
    action_type?: unknown;
    skill_id?: unknown;
  } | null;

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body.quest_id !== 'string' || body.quest_id.trim() === '') {
    return NextResponse.json({ error: 'quest_id must be a non-empty string.' }, { status: 400 });
  }
  if (typeof body.action_type !== 'string' || body.action_type.trim() === '') {
    return NextResponse.json({ error: 'action_type must be a non-empty string.' }, { status: 400 });
  }
  if (typeof body.skill_id !== 'string' || body.skill_id.trim() === '') {
    return NextResponse.json({ error: 'skill_id must be a non-empty string.' }, { status: 400 });
  }

  const quest_id = body.quest_id;
  const action_type = body.action_type;
  const skill_id = body.skill_id;
  const today = getTodayUtc();

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const { data: quest, error: questError } = await admin
    .from('daily_quests')
    .select('id, date, skill_id, action_type, target, reward_xp, reward_tenks')
    .eq('id', quest_id)
    .maybeSingle<DailyQuestRow>();

  if (questError) {
    return NextResponse.json({ error: questError.message }, { status: 500 });
  }
  if (!quest) {
    return NextResponse.json({ error: 'Quest not found.' }, { status: 404 });
  }
  if (quest.date !== today) {
    return NextResponse.json({ error: 'This quest is from a different day.' }, { status: 400 });
  }

  if (quest.action_type !== action_type) {
    return NextResponse.json(
      { error: `action_type mismatch: expected '${quest.action_type}'.` },
      { status: 400 },
    );
  }
  if (quest.skill_id !== skill_id) {
    return NextResponse.json(
      { error: `skill_id mismatch: expected '${quest.skill_id}'.` },
      { status: 400 },
    );
  }

  const { data: existing, error: fetchError } = await admin
    .from('player_daily_quests')
    .select('progress, completed_at, updated_at')
    .eq('user_id', user.id)
    .eq('quest_id', quest_id)
    .maybeSingle<PlayerDailyQuestRow>();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (existing?.updated_at) {
    const lastUpdate = new Date(existing.updated_at).getTime();
    if (Date.now() - lastUpdate < 1000) {
      return NextResponse.json({ error: 'Too many updates. Wait a moment.' }, { status: 429 });
    }
  }

  if (existing?.completed_at != null) {
    return NextResponse.json({
      progress: existing.progress,
      completed: true,
      reward_granted: false,
    });
  }

  const nowIso = new Date().toISOString();
  const oldProgress = existing?.progress ?? 0;
  const newProgress = Math.min(oldProgress + 1, quest.target);
  const justCompleted = newProgress >= quest.target;

  const upsertData = {
    user_id: user.id,
    quest_id,
    progress: newProgress,
    completed_at: justCompleted ? nowIso : null,
    updated_at: nowIso,
  };

  if (!existing) {
    const { error: insertError } = await admin
      .from('player_daily_quests')
      .insert(upsertData);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  } else {
    const { error: updateError } = await admin
      .from('player_daily_quests')
      .update({ progress: newProgress, completed_at: justCompleted ? nowIso : null, updated_at: nowIso })
      .eq('user_id', user.id)
      .eq('quest_id', quest_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  if (!justCompleted) {
    return NextResponse.json({ progress: newProgress, completed: false, reward_granted: false });
  }

  let newBalance = 0;
  try {
    const credited = await creditBalance(admin, {
      playerId: user.id,
      amount: quest.reward_tenks,
    });
    newBalance = credited.newBalance;

    if (quest.reward_tenks > 0) {
      await appendTenksTransaction(admin, {
        playerId: user.id,
        amount: quest.reward_tenks,
        reason: `daily_quest_${quest_id}`,
        balanceAfter: newBalance,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to grant TENKS reward.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let leveled_up = false;
  let new_level: number | null = null;

  if (isValidSkillId(quest.skill_id) && quest.reward_xp > 0) {
    const skillId: SkillId = quest.skill_id;
    const xpToGrant = Math.min(quest.reward_xp, MAX_XP_GAIN);

    const { data: existingSkill, error: skillFetchError } = await admin
      .from('player_skills')
      .select('xp, level')
      .eq('user_id', user.id)
      .eq('skill_id', skillId)
      .maybeSingle<SkillRow>();

    if (!skillFetchError) {
      const currentXp = existingSkill?.xp ?? 0;
      const newXp = currentXp + xpToGrant;
      const oldLevel = existingSkill?.level ?? 0;
      const computedLevel = computeLevel(newXp);
      leveled_up = computedLevel > oldLevel;
      new_level = computedLevel;

      await admin
        .from('player_skills')
        .upsert(
          {
            user_id: user.id,
            skill_id: skillId,
            xp: newXp,
            level: computedLevel,
            updated_at: nowIso,
          },
          { onConflict: 'user_id,skill_id' },
        );
    }
  }

  try {
    await syncPlayerMetadataSnapshot(admin, user);
  } catch (error) {
    console.error('[Waspi][quests/daily/progress] snapshot sync failed:', error);
  }

  return NextResponse.json({
    progress: newProgress,
    completed: true,
    reward_granted: true,
    reward_tenks: quest.reward_tenks,
    reward_xp: quest.reward_xp,
    new_balance: newBalance,
    leveled_up,
    new_level,
  });
}
