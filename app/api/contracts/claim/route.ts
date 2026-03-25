import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { appendTenksTransaction, syncPlayerMetadataSnapshot } from '@/src/lib/commercePersistence';
import { creditBalance, debitBalance } from '@/src/lib/tenksBalance';

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_SKILL_IDS = ['mining', 'fishing', 'gardening', 'cooking', 'gym', 'weed'] as const;
type SkillId = (typeof VALID_SKILL_IDS)[number];

/** Cumulative XP required to reach each level. Index == level number. */
const XP_THRESHOLDS: Record<number, number> = {
  0: 0,
  1: 0,
  2: 100,
  3: 300,
  4: 700,
  5: 1500,
};

const MAX_LEVEL = 5;

// ── Types ──────────────────────────────────────────────────────────────────

interface ContractRow {
  id: string;
  skill_id: string;
  reward_tenks: number;
  reward_xp: number;
}

interface PlayerContractRow {
  progress: number;
  completed_at: string | null;
  reward_claimed_at: string | null;
}

interface SkillRow {
  xp: number;
  level: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

function isValidSkillId(value: unknown): value is SkillId {
  return VALID_SKILL_IDS.includes(value as SkillId);
}

// ── POST /api/contracts/claim ─────────────────────────────────────────────

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
  } | null;

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body.contract_id !== 'string' || body.contract_id.trim() === '') {
    return NextResponse.json({ error: 'contract_id must be a non-empty string.' }, { status: 400 });
  }

  const contract_id = body.contract_id;

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  // ── Verify player_contract exists, completed, not already claimed ─────────
  const { data: playerContract, error: pcError } = await admin
    .from('player_contracts')
    .select('progress, completed_at, reward_claimed_at')
    .eq('user_id', user.id)
    .eq('contract_id', contract_id)
    .maybeSingle<PlayerContractRow>();

  if (pcError) {
    return NextResponse.json({ error: pcError.message }, { status: 500 });
  }
  if (!playerContract) {
    return NextResponse.json({ error: 'Contract not found for this player.' }, { status: 404 });
  }
  if (playerContract.completed_at == null) {
    return NextResponse.json({ error: 'Contract is not yet completed.' }, { status: 400 });
  }
  if (playerContract.reward_claimed_at != null) {
    return NextResponse.json({ error: 'Reward already claimed.' }, { status: 400 });
  }

  // ── Fetch contract rewards ────────────────────────────────────────────────
  const { data: contract, error: contractError } = await admin
    .from('contracts')
    .select('id, skill_id, reward_tenks, reward_xp')
    .eq('id', contract_id)
    .maybeSingle<ContractRow>();

  if (contractError) {
    return NextResponse.json({ error: contractError.message }, { status: 500 });
  }
  if (!contract) {
    return NextResponse.json({ error: 'Contract not found.' }, { status: 404 });
  }

  // ── Update TENKS balance ──────────────────────────────────────────────────
  let new_balance: number;
  try {
    const credited = await creditBalance(admin, {
      playerId: user.id,
      amount: contract.reward_tenks,
    });
    new_balance = credited.newBalance;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to credit TENKS.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const rollbackTenks = async () => {
    await debitBalance(admin, {
      playerId: user.id,
      amount: contract.reward_tenks,
      fallbackBalance: new_balance,
    }).catch((rollbackError) => {
      console.error('[Waspi][contracts/claim] TENKS rollback failed:', rollbackError);
    });
  };

  // ── Update skill XP (if skill_id is valid) ────────────────────────────────
  let leveled_up = false;
  let new_level: number | null = null;

  if (isValidSkillId(contract.skill_id) && contract.reward_xp > 0) {
    const skill_id: SkillId = contract.skill_id;

    const { data: existingSkill, error: skillFetchError } = await admin
      .from('player_skills')
      .select('xp, level')
      .eq('user_id', user.id)
      .eq('skill_id', skill_id)
      .maybeSingle<SkillRow>();

    if (skillFetchError) {
      await rollbackTenks();
      return NextResponse.json({ error: skillFetchError.message }, { status: 500 });
    }

    const currentXp = existingSkill?.xp ?? 0;
    const newXp = currentXp + contract.reward_xp;
    const oldLevel = existingSkill?.level ?? 0;
    const computedLevel = computeLevel(newXp);
    leveled_up = computedLevel > oldLevel;
    new_level = computedLevel;

    const { error: skillUpsertError } = await admin
      .from('player_skills')
      .upsert(
        {
          user_id: user.id,
          skill_id,
          xp: newXp,
          level: computedLevel,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,skill_id' },
      );

    if (skillUpsertError) {
      await rollbackTenks();
      return NextResponse.json({ error: skillUpsertError.message }, { status: 500 });
    }
  }

  // ── Mark reward as claimed ────────────────────────────────────────────────
  const { data: claimedRow, error: claimError } = await admin
    .from('player_contracts')
    .update({ reward_claimed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('contract_id', contract_id)
    .is('reward_claimed_at', null)
    .select('contract_id')
    .maybeSingle<{ contract_id: string }>();

  if (claimError) {
    await rollbackTenks();
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimedRow) {
    await rollbackTenks();
    return NextResponse.json({ error: 'Reward already claimed.' }, { status: 409 });
  }

  try {
    await appendTenksTransaction(admin, {
      playerId: user.id,
      amount: contract.reward_tenks,
      reason: `contract_claim_${contract_id}`,
      balanceAfter: new_balance,
    });
  } catch (error) {
    console.error('[Waspi][contracts/claim] transaction log failed:', error);
  }

  try {
    await syncPlayerMetadataSnapshot(admin, user);
  } catch (error) {
    console.error('[Waspi][contracts/claim] snapshot sync failed:', error);
  }

  return NextResponse.json({
    reward_tenks: contract.reward_tenks,
    reward_xp: contract.reward_xp,
    new_balance,
    leveled_up,
    new_level,
  });
}
