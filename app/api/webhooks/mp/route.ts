import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Payment } from 'mercadopago';
import { isMpConfigured, mpClient } from '@/src/lib/mercadopago';
import { createSupabaseAdminClient } from '@/src/lib/supabaseServer';
import { creditTenks, grantInventoryItem } from '@/src/lib/playerState';
import {
  ensureCatalogSeeded,
  ensurePlayerRow,
  createOrderRecord,
  addInventoryFromOrder,
  appendTenksTransaction,
  hydratePlayerFromDatabase,
  syncPlayerMetadataSnapshot,
} from '@/src/lib/commercePersistence';
import { resend, isResendConfigured, buildProductConfirmationEmail, buildTenksConfirmationEmail } from '@/src/lib/resend';
import { getItem } from '@/src/game/config/catalog';
import { getTenksPack } from '@/src/lib/tenksPacks';

function verifyMpSignature(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // si no hay secret configurado, salteamos la verificación

  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  const dataId = request.nextUrl.searchParams.get('data.id');

  if (!xSignature) return false;

  // MP firma con: "id:{data.id};request-id:{x-request-id};ts:{ts};"
  const parts = Object.fromEntries(xSignature.split(',').map(p => p.split('=')));
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId ?? ''};request-id:${xRequestId ?? ''};ts:${ts};`;

  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  return expected === v1;
}

export async function POST(request: NextRequest) {
  if (!isMpConfigured || !mpClient) {
    return NextResponse.json({ error: 'Mercado Pago is not configured.' }, { status: 503 });
  }

  const rawBody = await request.text();

  if (!verifyMpSignature(request, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  // MP puede enviar IPN como body JSON o como query params según la versión
  const body = JSON.parse(rawBody || 'null') as {
    type?: string;
    action?: string;
    data?: { id?: string | number };
  } | null;

  const queryId = request.nextUrl.searchParams.get('id');
  const queryTopic = request.nextUrl.searchParams.get('topic');

  const isPaymentNotification =
    body?.type === 'payment' || body?.action?.startsWith('payment.') || queryTopic === 'payment';

  if (!isPaymentNotification) {
    return NextResponse.json({ received: true });
  }

  const paymentId = body?.data?.id?.toString() ?? queryId;
  if (!paymentId) {
    return NextResponse.json({ received: true });
  }

  const paymentClient = new Payment(mpClient);
  let payment;
  try {
    payment = await paymentClient.get({ id: paymentId });
  } catch (err) {
    console.error('[Waspi][mp-webhook] Failed to fetch payment', paymentId, err);
    return NextResponse.json({ error: 'Could not fetch payment.' }, { status: 400 });
  }

  if (payment.status !== 'approved') {
    return NextResponse.json({ received: true });
  }

  // MP convierte camelCase a snake_case en metadata al guardar
  const metadata = payment.metadata as Record<string, unknown> | null;
  const purchaseType = metadata?.purchase_type as string | undefined;
  const customerUserId = metadata?.customer_user_id as string | undefined;

  if (!customerUserId) {
    console.error('[Waspi][mp-webhook] Missing customer_user_id in metadata', paymentId);
    return NextResponse.json({ error: 'Missing customer_user_id in metadata.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin client unavailable.' }, { status: 500 });
  }

  const { data: userData, error: getUserError } = await admin.auth.admin.getUserById(customerUserId);
  if (getUserError || !userData.user) {
    return NextResponse.json({ error: getUserError?.message ?? 'User not found.' }, { status: 500 });
  }

  const user = userData.user;

  // Idempotencia: verificar si el payment ya fue procesado
  const processedPayments = Array.isArray(user.user_metadata?.waspiProcessedMpPayments)
    ? (user.user_metadata.waspiProcessedMpPayments as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  if (processedPayments.includes(paymentId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const current = await hydratePlayerFromDatabase(admin, user);
  let next = current;

  await ensureCatalogSeeded(admin);
  await ensurePlayerRow(admin, user, current);

  if (purchaseType === 'tenks_pack') {
    const tenksRaw = metadata?.tenks;
    const tenks = Number(tenksRaw ?? 0);
    const tenksPackReason = `tenks_pack_mp_${paymentId}`;

    if (Number.isFinite(tenks) && tenks > 0) {
      const { data: existingGrant } = await admin
        .from('tenks_transactions')
        .select('id')
        .eq('player_id', customerUserId)
        .eq('reason', tenksPackReason)
        .maybeSingle<{ id: string }>();

      if (!existingGrant) {
        next = creditTenks(current, tenks);
        await appendTenksTransaction(admin, {
          playerId: customerUserId,
          amount: tenks,
          reason: tenksPackReason,
          balanceAfter: next.tenks,
        });
      }
    }
  }

  if (purchaseType === 'product') {
    const itemId = metadata?.item_id as string | undefined;
    if (itemId) {
      const mpSessionId = `mp_${paymentId}`;
      const subtotalArs = payment.transaction_amount ?? 0;

      let order: { data: { id: string } | null; error: { message: string } | null } = await admin
        .from('orders')
        .select('id')
        .eq('stripe_session_id', mpSessionId)
        .maybeSingle<{ id: string }>();

      if (!order.data) {
        const createdOrder = await createOrderRecord(admin, {
          playerId: customerUserId,
          stripeSessionId: mpSessionId,
          itemId,
          size: (metadata?.size as string | undefined) ?? '',
          subtotalArs,
          totalArs: subtotalArs,
          discountCode: null,
          discountPercent: null,
          shippingAddress: null,
        });
        order = { data: createdOrder, error: null };
      }

      if (order.data) {
        const { data: existingInventory } = await admin
          .from('player_inventory')
          .select('id')
          .eq('player_id', customerUserId)
          .eq('product_id', itemId)
          .eq('order_id', order.data.id)
          .maybeSingle<{ id: string }>();

        if (!existingInventory) {
          await addInventoryFromOrder(admin, {
            playerId: customerUserId,
            productId: itemId,
            orderId: order.data.id,
          });
        }
      }

      next = grantInventoryItem(next, itemId);
    }
  }

  await ensurePlayerRow(admin, user, next, { syncTenksBalance: purchaseType === 'tenks_pack' });

  try {
    await syncPlayerMetadataSnapshot(admin, user, next);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to persist player metadata.';
    console.error('[Waspi][mp-webhook] metadata snapshot failed', customerUserId, paymentId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Marcar payment como procesado (leer metadata fresca antes de escribir)
  const { data: latestUserData } = await admin.auth.admin.getUserById(customerUserId);
  const latestProcessed = Array.isArray(latestUserData?.user?.user_metadata?.waspiProcessedMpPayments)
    ? (latestUserData.user.user_metadata.waspiProcessedMpPayments as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  await admin.auth.admin.updateUserById(customerUserId, {
    user_metadata: {
      ...(latestUserData?.user?.user_metadata ?? {}),
      waspiProcessedMpPayments: [...new Set([...latestProcessed, paymentId])].slice(-50),
    },
  });

  // Email de confirmación — no fatal
  if (isResendConfigured && resend && payment.payer?.email) {
    try {
      const email = payment.payer.email;
      const name = payment.payer.first_name ?? null;

      if (purchaseType === 'product') {
        const itemId = metadata?.item_id as string | undefined;
        const item = itemId ? getItem(itemId) : null;
        if (item) {
          const emailData = buildProductConfirmationEmail({
            customerEmail: email,
            customerName: name,
            itemName: item.name,
            size: (metadata?.size as string | undefined) ?? '',
            totalArs: payment.transaction_amount ?? 0,
            orderId: `mp_${paymentId}`,
          });
          await resend.emails.send({
            from: 'WASPI WORLD <noreply@waspiworld.com>',
            to: emailData.to,
            subject: emailData.subject,
            html: emailData.html,
          });
        }
      }

      if (purchaseType === 'tenks_pack') {
        const packId = metadata?.pack_id as string | undefined;
        const pack = packId ? getTenksPack(packId) : null;
        if (pack) {
          const emailData = buildTenksConfirmationEmail({
            customerEmail: email,
            customerName: name,
            packName: pack.name,
            tenks: pack.tenks,
            totalArs: payment.transaction_amount ?? 0,
          });
          await resend.emails.send({
            from: 'WASPI WORLD <noreply@waspiworld.com>',
            to: emailData.to,
            subject: emailData.subject,
            html: emailData.html,
          });
        }
      }
    } catch (emailErr) {
      console.error('[Waspi][mp-webhook] email send failed', emailErr);
    }
  }

  return NextResponse.json({ received: true });
}
