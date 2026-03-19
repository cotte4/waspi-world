import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { generateDailyQuests } from '@/src/game/config/questPool';

// ── Types ──────────────────────────────────────────────────────────────────

interface DailyQuestRow {
  id: string;
  date: string;
  skill_id: string;
  action_type: string;
  target: number;
  reward_xp: number;
  reward_tenks: number;
  label: string;
  icon: string;
}

interface PlayerDailyQuestRow {
  quest_id: string;
  progress: number;
  completed_at: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getTodayUtc(): string {
  return new Date().toISOString().split('T')[0];
}

// ── GET /api/quests/daily ──────────────────────────────────────────────────

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

  const today = getTodayUtc();

  // Fetch today's quests from daily_quests table
  const { data: existingQuests, error: fetchError } = await admin
    .from('daily_quests')
    .select('id, date, skill_id, action_type, target, reward_xp, reward_tenks, label, icon')
    .eq('date', today)
    .returns<DailyQuestRow[]>();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  let quests: DailyQuestRow[];

  if (!existingQuests || existingQuests.length === 0) {
    // Generate and insert today's quests
    const generated = generateDailyQuests(today);

    const rows = generated.map((q) => ({
      date: today,
      skill_id: q.skillId,
      action_type: q.actionType,
      target: q.target,
      reward_xp: q.rewardXp,
      reward_tenks: q.rewardTenks,
      label: q.label,
      icon: q.icon,
    }));

    const { data: inserted, error: insertError } = await admin
      .from('daily_quests')
      .insert(rows)
      .select('id, date, skill_id, action_type, target, reward_xp, reward_tenks, label, icon')
      .returns<DailyQuestRow[]>();

    if (insertError) {
      // Handle race condition: another request may have inserted first
      if (insertError.code === '23505') {
        // Unique constraint violation — fetch what's already there
        const { data: retryFetch, error: retryError } = await admin
          .from('daily_quests')
          .select('id, date, skill_id, action_type, target, reward_xp, reward_tenks, label, icon')
          .eq('date', today)
          .returns<DailyQuestRow[]>();

        if (retryError) {
          return NextResponse.json({ error: retryError.message }, { status: 500 });
        }
        quests = retryFetch ?? [];
      } else {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    } else {
      quests = inserted ?? [];
    }
  } else {
    quests = existingQuests;
  }

  if (quests.length === 0) {
    return NextResponse.json({ quests: [] });
  }

  // Fetch player progress for today's quests
  const questIds = quests.map((q) => q.id);

  const { data: playerProgress, error: progressError } = await admin
    .from('player_daily_quests')
    .select('quest_id, progress, completed_at')
    .eq('user_id', user.id)
    .in('quest_id', questIds)
    .returns<PlayerDailyQuestRow[]>();

  if (progressError) {
    return NextResponse.json({ error: progressError.message }, { status: 500 });
  }

  const progressMap = new Map<string, PlayerDailyQuestRow>();
  for (const row of playerProgress ?? []) {
    progressMap.set(row.quest_id, row);
  }

  const merged = quests.map((quest) => {
    const playerRow = progressMap.get(quest.id);
    return {
      id: quest.id,
      skill_id: quest.skill_id,
      action_type: quest.action_type,
      target: quest.target,
      reward_xp: quest.reward_xp,
      reward_tenks: quest.reward_tenks,
      label: quest.label,
      icon: quest.icon,
      progress: playerRow?.progress ?? 0,
      completed: playerRow?.completed_at != null,
      completed_at: playerRow?.completed_at ?? null,
    };
  });

  return NextResponse.json({ quests: merged });
}
