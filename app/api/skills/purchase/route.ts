import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';
import { appendTenksTransaction } from '@/src/lib/commercePersistence';

// ---------------------------------------------------------------------------
// Skill shop catalog — defined inline, never in a separate file
// ---------------------------------------------------------------------------

const SKILL_SHOP_ITEMS = [
  { id: 'mining_pickaxe',    skillId: 'mining',    name: 'Pico Reforzado',    cost: 800,  description: '+20% velocidad extracción' },
  { id: 'mining_dynamite',   skillId: 'mining',    name: 'Dinamita x5',       cost: 1200, description: 'Drop x3 en próxima extracción' },
  { id: 'garden_fertilizer', skillId: 'gardening', name: 'Fertilizante Pro',  cost: 600,  description: '-30% tiempo de cosecha x5 usos' },
  { id: 'garden_seeds_rare', skillId: 'gardening', name: 'Semillas Raras x3', cost: 500,  description: 'Semillas premium de alto rendimiento' },
  { id: 'gym_membership',    skillId: 'gym',       name: 'Membresía Gym',     cost: 1000, description: 'Acceso a máquinas premium del gym' },
  { id: 'weed_grow_lamp',    skillId: 'weed',      name: 'Lámpara UV',        cost: 900,  description: '-25% tiempo de cultivo cannabis' },
] as const;

type SkillShopItemId = typeof SKILL_SHOP_ITEMS[number]['id'];

function findSkillItem(id: string): typeof SKILL_SHOP_ITEMS[number] | undefined {
  return SKILL_SHOP_ITEMS.find((item) => item.id === id);
}

function isValidSkillItemId(id: string): id is SkillShopItemId {
  return SKILL_SHOP_ITEMS.some((item) => item.id === id);
}

// ---------------------------------------------------------------------------
// GET /api/skills/purchase — returns list of item_ids already purchased
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
    .from('player_skill_items')
    .select('item_id')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const purchased = (data as { item_id: string }[]).map((row) => row.item_id);

  return NextResponse.json({ purchased });
}

// ---------------------------------------------------------------------------
// POST /api/skills/purchase — buy a skill item with TENKS
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
  const body = await request.json().catch(() => null) as { item_id?: string } | null;
  const itemId = body?.item_id;

  if (typeof itemId !== 'string' || !isValidSkillItemId(itemId)) {
    return NextResponse.json({ error: 'Item no válido.' }, { status: 400 });
  }

  const skillItem = findSkillItem(itemId);
  if (!skillItem) {
    return NextResponse.json({ error: 'Item no válido.' }, { status: 400 });
  }

  // --- Check for duplicate purchase before touching TENKS ---
  const { data: existing, error: existingError } = await admin
    .from('player_skill_items')
    .select('item_id')
    .eq('user_id', user.id)
    .eq('item_id', itemId)
    .maybeSingle<{ item_id: string }>();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json(
      { error: 'Ya tienes este item.', already_owned: true },
      { status: 409 },
    );
  }

  // --- Server-validated TENKS balance (mirrors shop/buy pattern) ---
  // Read from player_tenks_balance and reconcile with players.tenks.
  const { data: balanceRow, error: balanceError } = await admin
    .from('player_tenks_balance')
    .select('balance')
    .eq('player_id', user.id)
    .single<{ balance: number }>();

  const { data: playerRow, error: playerError } = await admin
    .from('players')
    .select('tenks')
    .eq('id', user.id)
    .maybeSingle<{ tenks: number }>();

  if (playerError) {
    return NextResponse.json({ error: playerError.message }, { status: 500 });
  }

  let serverBalance: number;

  if (balanceError && balanceError.code === 'PGRST116') {
    // Row missing — seed from players.tenks or fall back to 0
    serverBalance = playerRow?.tenks ?? 0;

    await admin
      .from('player_tenks_balance')
      .insert({ player_id: user.id, balance: serverBalance });
  } else if (balanceError) {
    return NextResponse.json({ error: balanceError.message }, { status: 500 });
  } else {
    // Reconcile stale balance table rows against players.tenks
    serverBalance = Math.max(balanceRow.balance, playerRow?.tenks ?? balanceRow.balance);
    if (serverBalance !== balanceRow.balance) {
      await admin
        .from('player_tenks_balance')
        .upsert({ player_id: user.id, balance: serverBalance });
    }
  }

  if (serverBalance < skillItem.cost) {
    return NextResponse.json(
      {
        error: `Necesitas ${skillItem.cost.toLocaleString('es-AR')} TENKS para comprar ${skillItem.name}.`,
        balance: serverBalance,
        required: skillItem.cost,
      },
      { status: 400 },
    );
  }

  const newBalance = serverBalance - skillItem.cost;

  // --- Deduct TENKS atomically before granting the item ---
  const { error: deductError } = await admin
    .from('player_tenks_balance')
    .upsert({ player_id: user.id, balance: newBalance });

  if (deductError) {
    return NextResponse.json({ error: deductError.message }, { status: 500 });
  }

  // --- Insert into player_skill_items ---
  const { error: insertError } = await admin
    .from('player_skill_items')
    .insert({ user_id: user.id, item_id: itemId });

  if (insertError) {
    // Compensating action: refund TENKS if item grant fails after deduction.
    try {
      const { data: afterDeduct } = await admin
        .from('player_tenks_balance')
        .select('balance')
        .eq('player_id', user.id)
        .single<{ balance: number }>();
      const currentBalance = typeof afterDeduct?.balance === 'number' ? afterDeduct.balance : newBalance;
      const refundBalance = currentBalance + skillItem.cost;
      await admin
        .from('player_tenks_balance')
        .upsert({ player_id: user.id, balance: refundBalance });
    } catch (refundErr) {
      console.error('POST /api/skills/purchase refund failed after insert error:', refundErr);
    }

    return NextResponse.json(
      { error: `No se pudo guardar la compra (${insertError.message}). Reembolsamos los TENKS.` },
      { status: 500 },
    );
  }

  // --- Log TENKS transaction ---
  try {
    await appendTenksTransaction(admin, {
      playerId: user.id,
      amount: -skillItem.cost,
      reason: `skill_buy_${itemId}`,
      balanceAfter: newBalance,
    });
  } catch (logErr) {
    // Non-fatal — item was already granted
    console.error('POST /api/skills/purchase appendTenksTransaction failed:', logErr);
  }

  return NextResponse.json({
    item_id: itemId,
    new_balance: newBalance,
    item_name: skillItem.name,
    notice: `${skillItem.name} comprado por ${skillItem.cost.toLocaleString('es-AR')} TENKS.`,
  });
}
