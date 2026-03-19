import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

// ── Types ──────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  created_at: string;
  items: Array<{ product_id: string; size: string }>;
  total: number;       // en centavos ARS
  currency: string;
  status: string;
  discount_code: string | null;
}

// ── GET /api/player/orders ─────────────────────────────────────────────────

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

  const { data, error } = await admin
    .from('orders')
    .select('id, created_at, items, total, currency, status, discount_code')
    .eq('player_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<OrderRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}
