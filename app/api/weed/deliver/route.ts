// POST /api/weed/deliver
// Server-side validation and reward for Weed Delivery NPC orders.
// Rewards:
//   quality 'normal'   → 200 TENKS + 20 XP weed
//   quality 'good'     → 400 TENKS + 20 XP weed
//   quality 'excellent'→ 800 TENKS + 20 XP weed
// The XP cap for /api/skills is 50 XP per request — 20 is within limit.

import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { appendTenksTransaction } from '@/src/lib/commercePersistence';

// ---------------------------------------------------------------------------
// Constants — server-authoritative, never trust the client for amounts
// ---------------------------------------------------------------------------

const VALID_NPC_IDS = ['dealer_1', 'dealer_2', 'dealer_3'] as const;
type WeedNpcId = typeof VALID_NPC_IDS[number];

const VALID_QUALITIES = ['normal', 'good', 'excellent'] as const;
type WeedQualityTier = typeof VALID_QUALITIES[number];

const QUALITY_REWARDS: Record<WeedQualityTier, number> = {
  normal: 200,
  good: 400,
  excellent: 800,
};

const XP_WEED_REWARD = 20;

function isValidNpcId(value: unknown): value is WeedNpcId {
  return VALID_NPC_IDS.includes(value as WeedNpcId);
}

function isValidQuality(value: unknown): value is WeedQualityTier {
  return VALID_QUALITIES.includes(value as WeedQualityTier);
}

// ---------------------------------------------------------------------------
// POST /api/weed/deliver
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  const body = await request.json().catch(() => null) as {
    npc_id?: unknown;
    strain_name?: unknown;
    quality?: unknown;
  } | null;

  if (!body) {
    return NextResponse.json({ error: 'Body JSON inválido.' }, { status: 400 });
  }

  // ── Validate npc_id ────────────────────────────────────────────────────────
  if (!isValidNpcId(body.npc_id)) {
    return NextResponse.json(
      { error: `npc_id debe ser uno de: ${VALID_NPC_IDS.join(', ')}.` },
      { status: 400 },
    );
  }
  const npcId: WeedNpcId = body.npc_id;

  // ── Validate quality ───────────────────────────────────────────────────────
  if (!isValidQuality(body.quality)) {
    return NextResponse.json(
      { error: `quality debe ser uno de: ${VALID_QUALITIES.join(', ')}.` },
      { status: 400 },
    );
  }
  const quality: WeedQualityTier = body.quality;

  // ── Server-authoritative reward calculation ────────────────────────────────
  const tenksEarned = QUALITY_REWARDS[quality];

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client no disponible.' }, { status: 500 });
  }

  // ── Server-side cooldown check ─────────────────────────────────────────────
  const COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const { data: cooldownRow } = await admin
    .from('weed_delivery_cooldowns')
    .select('delivered_at')
    .eq('player_id', user.id)
    .eq('npc_id', npcId)
    .maybeSingle<{ delivered_at: string }>();

  if (cooldownRow) {
    const elapsed = Date.now() - new Date(cooldownRow.delivered_at).getTime();
    if (elapsed < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: 'En enfriamiento.', cooldown_remaining_seconds: remainingSeconds },
        { status: 429 },
      );
    }
  }

  // ── Fetch current TENKS balance ────────────────────────────────────────────
  const { data: balanceRow, error: balanceErr } = await admin
    .from('player_tenks_balance')
    .select('balance')
    .eq('player_id', user.id)
    .maybeSingle<{ balance: number }>();

  if (balanceErr) {
    return NextResponse.json({ error: balanceErr.message }, { status: 500 });
  }

  const currentBalance = balanceRow?.balance ?? 5000;
  const newBalance = currentBalance + tenksEarned;

  // ── Upsert new TENKS balance ───────────────────────────────────────────────
  const { error: upsertErr } = await admin
    .from('player_tenks_balance')
    .upsert({ player_id: user.id, balance: newBalance });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // ── Record cooldown ────────────────────────────────────────────────────────
  await admin
    .from('weed_delivery_cooldowns')
    .upsert(
      { player_id: user.id, npc_id: npcId, delivered_at: new Date().toISOString() },
      { onConflict: 'player_id,npc_id' },
    );

  // ── Log TENKS transaction ──────────────────────────────────────────────────
  try {
    await appendTenksTransaction(admin, {
      playerId: user.id,
      amount: tenksEarned,
      reason: `weed_delivery_${npcId}`,
      balanceAfter: newBalance,
    });
  } catch (logErr) {
    // Non-fatal — balance was already updated
    console.error('[weed/deliver] appendTenksTransaction failed:', logErr);
  }

  // ── Grant Weed XP — replicate the /api/skills POST logic inline ───────────
  // We do this inline to avoid an internal HTTP round-trip and to keep the
  // endpoint atomic. XP amount (20) is within MAX_XP_GAIN_PER_REQUEST (50).
  const XP_THRESHOLDS: Record<number, number> = { 0: 0, 1: 0, 2: 100, 3: 300, 4: 700, 5: 1500 };
  const MAX_LEVEL = 5;

  function computeLevel(xp: number): number {
    let level = 1;
    for (let lv = MAX_LEVEL; lv >= 1; lv--) {
      if (xp >= XP_THRESHOLDS[lv]) { level = lv; break; }
    }
    return level;
  }

  let xpEarned = 0;
  try {
    const { data: skillRow, error: skillFetchErr } = await admin
      .from('player_skills')
      .select('xp, level, action_count')
      .eq('user_id', user.id)
      .eq('skill_id', 'weed')
      .maybeSingle<{ xp: number; level: number; action_count: number }>();

    if (!skillFetchErr) {
      const currentXp = skillRow?.xp ?? 0;
      const newXp = currentXp + XP_WEED_REWARD;
      const newLevel = computeLevel(newXp);
      const newActionCount = (skillRow?.action_count ?? 0) + 1;

      await admin
        .from('player_skills')
        .upsert(
          {
            user_id: user.id,
            skill_id: 'weed',
            xp: newXp,
            level: newLevel,
            action_count: newActionCount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,skill_id' },
        );

      xpEarned = XP_WEED_REWARD;
    }
  } catch (xpErr) {
    // XP grant is non-fatal — TENKS were already awarded
    console.error('[weed/deliver] XP grant failed:', xpErr);
  }

  return NextResponse.json({
    tenks_earned: tenksEarned,
    xp_earned: xpEarned,
    notice: `+${tenksEarned} TENKS y +${xpEarned} XP WEED por la entrega a ${npcId}.`,
  });
}
