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
  guild_id: string;
  skill_id: string;
  type: string;
  title: string;
  description: string;
  objective: ContractObjective;
  reward_tenks: number;
  reward_xp: number;
  reward_rep: number;
  week_id: string;
  min_level: number;
}

interface PlayerContractRow {
  contract_id: string;
  progress: number;
  completed_at: string | null;
  reward_claimed_at: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getCurrentWeekId(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + startOfYear.getUTCDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

// ── GET /api/contracts ─────────────────────────────────────────────────────

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

  const week_id = getCurrentWeekId();

  // Fetch contracts for the current week
  const { data: contracts, error: contractsError } = await admin
    .from('contracts')
    .select('id, guild_id, skill_id, type, title, description, objective, reward_tenks, reward_xp, reward_rep, week_id, min_level')
    .eq('week_id', week_id)
    .returns<ContractRow[]>();

  if (contractsError) {
    return NextResponse.json({ error: contractsError.message }, { status: 500 });
  }

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ week_id, contracts: [] });
  }

  // Fetch player progress for these contracts
  const contractIds = contracts.map((c) => c.id);

  const { data: playerContracts, error: progressError } = await admin
    .from('player_contracts')
    .select('contract_id, progress, completed_at, reward_claimed_at')
    .eq('user_id', user.id)
    .in('contract_id', contractIds)
    .returns<PlayerContractRow[]>();

  if (progressError) {
    return NextResponse.json({ error: progressError.message }, { status: 500 });
  }

  // Build a map for quick lookup
  const progressMap = new Map<string, PlayerContractRow>();
  for (const row of playerContracts ?? []) {
    progressMap.set(row.contract_id, row);
  }

  // Merge contracts with player progress
  const merged = contracts.map((contract) => {
    const playerRow = progressMap.get(contract.id);
    return {
      id: contract.id,
      guild_id: contract.guild_id,
      skill_id: contract.skill_id,
      type: contract.type,
      title: contract.title,
      description: contract.description,
      objective: contract.objective,
      reward_tenks: contract.reward_tenks,
      reward_xp: contract.reward_xp,
      reward_rep: contract.reward_rep,
      min_level: contract.min_level,
      progress: playerRow?.progress ?? 0,
      completed: playerRow?.completed_at != null,
      reward_claimed: playerRow?.reward_claimed_at != null,
    };
  });

  return NextResponse.json({ week_id, contracts: merged });
}
