import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ─── Style catalogue (server-authoritative) ───────────────────────────────────
// style_id maps to the HairStyle values in AvatarRenderer.ts
const BARBERSHOP_STYLES: Record<string, { label: string; cost: number }> = {
  SPI: { label: 'CORTE CLÁSICO', cost: 50 },
  FLA: { label: 'FADE',          cost: 80 },
  MOH: { label: 'MOHICANO',      cost: 100 },
  MCH: { label: 'MECHA',         cost: 150 },
  X:   { label: 'RAPADO',        cost: 60 },
};

const VALID_STYLE_IDS = Object.keys(BARBERSHOP_STYLES);

// POST /api/player/barbershop
// Body: { style_id: string }
// Returns: { success: true, new_balance: number, style_id: string } | { error: string }
export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { style_id?: unknown } | null;
  const styleId = typeof body?.style_id === 'string' ? body.style_id : '';

  if (!VALID_STYLE_IDS.includes(styleId)) {
    return NextResponse.json(
      { error: `Invalid style_id. Must be one of: ${VALID_STYLE_IDS.join(', ')}` },
      { status: 400 },
    );
  }

  const style = BARBERSHOP_STYLES[styleId];
  const cost = style.cost;

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  // ── 1. Read current balance ────────────────────────────────────────────────
  const { data: balRow, error: balError } = await admin
    .from('player_tenks_balance')
    .select('balance')
    .eq('player_id', user.id)
    .maybeSingle<{ balance: number }>();

  if (balError) {
    return NextResponse.json({ error: balError.message }, { status: 500 });
  }

  const currentBalance = balRow?.balance ?? 0;

  if (currentBalance < cost) {
    return NextResponse.json(
      { error: 'Saldo insuficiente de TENKS.', current_balance: currentBalance, cost },
      { status: 402 },
    );
  }

  // ── 2. Deduct TENKS ────────────────────────────────────────────────────────
  const newBalance = currentBalance - cost;

  const { error: upsertError } = await admin
    .from('player_tenks_balance')
    .upsert({ player_id: user.id, balance: newBalance });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // ── 3. Persist hair style in user_metadata ─────────────────────────────────
  // We store it inside the existing waspiPlayer metadata blob so it loads on next
  // GET /api/player without a separate table.
  const { data: userData, error: userFetchError } = await admin.auth.admin.getUserById(user.id);
  if (userFetchError) {
    return NextResponse.json({ error: userFetchError.message }, { status: 500 });
  }

  const existingMeta = userData.user?.user_metadata ?? {};
  const existingPlayer = (existingMeta['waspiPlayer'] && typeof existingMeta['waspiPlayer'] === 'object')
    ? existingMeta['waspiPlayer'] as Record<string, unknown>
    : {};
  const existingAvatar = (existingPlayer['avatar'] && typeof existingPlayer['avatar'] === 'object')
    ? existingPlayer['avatar'] as Record<string, unknown>
    : {};

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...existingMeta,
      waspiPlayer: {
        ...existingPlayer,
        avatar: {
          ...existingAvatar,
          hairStyle: styleId,
        },
      },
    },
  });

  if (updateError) {
    // TENKS were already deducted — still return success but with a warning so the
    // client can persist locally.
    console.error('[Waspi][barbershop] user_metadata update failed after deduct:', updateError.message);
    return NextResponse.json({
      success: true,
      new_balance: newBalance,
      style_id: styleId,
      notice: 'Estilo aplicado, pero no se pudo persistir en el servidor. Se guardará localmente.',
    });
  }

  return NextResponse.json({ success: true, new_balance: newBalance, style_id: styleId });
}

// Export the styles catalogue so the client can reference it via a GET.
export async function GET() {
  return NextResponse.json({
    styles: Object.entries(BARBERSHOP_STYLES).map(([id, s]) => ({
      style_id: id,
      label: s.label,
      cost: s.cost,
    })),
  });
}
