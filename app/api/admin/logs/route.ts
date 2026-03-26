import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
  hasServiceRole,
  isServerSupabaseConfigured,
} from '@/src/lib/supabaseServer';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!ADMIN_EMAIL || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const eventType = params.get('type') ?? '';
  const severity  = params.get('severity') ?? '';
  const page      = Math.max(1, parseInt(params.get('page') ?? '1', 10));
  const from      = (page - 1) * PAGE_SIZE;
  const to        = from + PAGE_SIZE - 1;

  let query = admin
    .from('event_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (eventType) query = query.eq('event_type', eventType);
  if (severity)  query = query.eq('severity', severity);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
