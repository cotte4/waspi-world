import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ── Types ──────────────────────────────────────────────────────────────────

interface ContractObjective {
  action: string;
  skill: string;
  quantity: number;
  min_quality?: string;
}

interface ContractRow {
  id: string;
  week_id: string;
  objective: ContractObjective;
}

interface PlayerContractRow {
  progress: number;
  completed_at: string | null;
  updated_at: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getCurrentWeekId(): string {
  const now = new Date();
  // ISO 8601: Thursday of the week determines the year; week 1 is the week
  // containing the year's first Thursday.
  const thursday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 4 - (now.getUTCDay() || 7),
  ));
  const startOfYear = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((thursday.getTime() - startOfYear.getTime()) / 86400000 + 1) / 7,
  );
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

const QUALITY_ORDER = ['basic', 'normal', 'good', 'excellent', 'legendary'] as const;
type Quality = (typeof QUALITY_ORDER)[number];

function isValidQuality(value: unknown): value is Quality {
  return QUALITY_ORDER.includes(value as Quality);
}

function meetsQualityRequirement(actual: string, required: string): boolean {
  const actualIdx = QUALITY_ORDER.indexOf(actual as Quality);
  const requiredIdx = QUALITY_ORDER.indexOf(required as Quality);
  if (actualIdx === -1 || requiredIdx === -1) return false;
  return actualIdx >= requiredIdx;
}

// ── POST /api/contracts/progress ──────────────────────────────────────────

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
    contract_id?: unknown;
    action?: unknown;
    skill?: unknown;
    quality?: unknown;
  } | null;

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body.contract_id !== 'string' || body.contract_id.trim() === '') {
    return NextResponse.json({ error: 'contract_id must be a non-empty string.' }, { status: 400 });
  }
  if (typeof body.action !== 'string' || body.action.trim() === '') {
    return NextResponse.json({ error: 'action must be a non-empty string.' }, { status: 400 });
  }
  if (typeof body.skill !== 'string' || body.skill.trim() === '') {
    return NextResponse.json({ error: 'skill must be a non-empty string.' }, { status: 400 });
  }
  if (body.quality !== undefined && !isValidQuality(body.quality)) {
    return NextResponse.json(
      { error: `quality must be one of: ${QUALITY_ORDER.join(', ')}.` },
      { status: 400 },
    );
  }

  const contract_id = body.contract_id;
  const action = body.action;
  const skill = body.skill;
  const quality = body.quality as Quality | undefined;

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  // ── Fetch contract ────────────────────────────────────────────────────────
  const { data: contract, error: contractError } = await admin
    .from('contracts')
    .select('id, week_id, objective')
    .eq('id', contract_id)
    .maybeSingle<ContractRow>();

  if (contractError) {
    return NextResponse.json({ error: contractError.message }, { status: 500 });
  }
  if (!contract) {
    return NextResponse.json({ error: 'Contract not found.' }, { status: 404 });
  }

  // ── Validate week ─────────────────────────────────────────────────────────
  const currentWeek = getCurrentWeekId();
  if (contract.week_id !== currentWeek) {
    return NextResponse.json(
      { error: 'This contract is from a different week and no longer accepts progress.' },
      { status: 400 },
    );
  }

  // ── Validate action + skill match objective ───────────────────────────────
  if (contract.objective.action !== action) {
    return NextResponse.json(
      { error: `Action mismatch: expected '${contract.objective.action}'.` },
      { status: 400 },
    );
  }
  if (contract.objective.skill !== skill) {
    return NextResponse.json(
      { error: `Skill mismatch: expected '${contract.objective.skill}'.` },
      { status: 400 },
    );
  }

  // ── Validate quality if required ──────────────────────────────────────────
  if (contract.objective.min_quality) {
    if (!quality) {
      return NextResponse.json(
        { error: 'This contract requires a quality value.' },
        { status: 400 },
      );
    }
    if (!meetsQualityRequirement(quality, contract.objective.min_quality)) {
      return NextResponse.json(
        {
          error: `Quality '${quality}' does not meet the minimum requirement of '${contract.objective.min_quality}'.`,
        },
        { status: 400 },
      );
    }
  }

  const targetQuantity = contract.objective.quantity;

  // ── Fetch existing player_contract row ────────────────────────────────────
  const { data: existing, error: fetchError } = await admin
    .from('player_contracts')
    .select('progress, completed_at, updated_at')
    .eq('user_id', user.id)
    .eq('contract_id', contract_id)
    .maybeSingle<PlayerContractRow>();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // ── Rate limit: max 1 progress update per second per user per contract ────
  if (existing?.updated_at) {
    const lastUpdate = new Date(existing.updated_at).getTime();
    const elapsed = Date.now() - lastUpdate;
    if (elapsed < 1000) {
      return NextResponse.json(
        { error: 'Too many progress updates. Please wait before submitting again.' },
        { status: 429 },
      );
    }
  }

  // ── Already completed check ───────────────────────────────────────────────
  const was_already_completed = existing?.completed_at != null;

  if (was_already_completed) {
    return NextResponse.json({
      contract_id,
      progress: existing?.progress ?? targetQuantity,
      completed: true,
      was_already_completed: true,
    });
  }

  const now = new Date().toISOString();

  if (!existing) {
    // ── Insert new row ────────────────────────────────────────────────────
    const newProgress = Math.min(1, targetQuantity);
    const newCompleted = newProgress >= targetQuantity;

    const { error: insertError } = await admin
      .from('player_contracts')
      .insert({
        user_id: user.id,
        contract_id,
        progress: newProgress,
        completed_at: newCompleted ? now : null,
        updated_at: now,
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      contract_id,
      progress: newProgress,
      completed: newCompleted,
      was_already_completed: false,
    });
  }

  // ── Update existing row ───────────────────────────────────────────────────
  const newProgress = Math.min(existing.progress + 1, targetQuantity);
  const newCompleted = newProgress >= targetQuantity;

  const { error: updateError } = await admin
    .from('player_contracts')
    .update({
      progress: newProgress,
      completed_at: newCompleted ? now : null,
      updated_at: now,
    })
    .eq('user_id', user.id)
    .eq('contract_id', contract_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    contract_id,
    progress: newProgress,
    completed: newCompleted,
    was_already_completed: false,
  });
}
