import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/src/lib/supabaseServer';
import { stripe, stripeWebhookSecret, isStripeConfigured, isStripeWebhookConfigured } from '@/src/lib/stripe';
import { DEFAULT_PLAYER_STATE, normalizePlayerState, creditTenks, grantInventoryItem } from '@/src/lib/playerState';
import { ensureCatalogSeeded, ensurePlayerRow, createOrderRecord, addInventoryFromOrder, appendTenksTransaction, markDiscountCodeUsed } from '@/src/lib/commercePersistence';

export async function POST(request: NextRequest) {
  if (!isStripeConfigured || !stripe || !isStripeWebhookConfigured) {
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid webhook signature.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const sessionId = session.id;
    const userId = session.metadata?.customerUserId;
    const purchaseType = session.metadata?.purchaseType;

    if (sessionId && userId) {
      const admin = createSupabaseAdminClient();
      if (!admin) {
        return NextResponse.json({ error: 'Supabase admin client unavailable.' }, { status: 500 });
      }

      const { data: userData, error: getUserError } = await admin.auth.admin.getUserById(userId);
      if (getUserError || !userData.user) {
        return NextResponse.json({ error: getUserError?.message ?? 'User not found.' }, { status: 500 });
      }

      const user = userData.user;
      const processedSessions = Array.isArray(user.user_metadata?.waspiProcessedStripeSessions)
        ? user.user_metadata.waspiProcessedStripeSessions.filter((value: unknown): value is string => typeof value === 'string')
        : [];
      if (processedSessions.includes(sessionId)) {
        return NextResponse.json({ received: true, duplicate: true });
      }

      const current = normalizePlayerState(user.user_metadata?.waspiPlayer ?? DEFAULT_PLAYER_STATE);
      let next = current;

      await ensureCatalogSeeded(admin);
      await ensurePlayerRow(admin, user, current);

      if (purchaseType === 'tenks_pack') {
        const tenksRaw = session.metadata?.tenks;
        const tenks = Number(tenksRaw ?? 0);
        if (Number.isFinite(tenks) && tenks > 0) {
          next = creditTenks(current, tenks);
          await appendTenksTransaction(admin, {
            playerId: userId,
            amount: tenks,
            reason: 'tenks_pack',
            balanceAfter: next.tenks,
          });
        }
      }

      if (purchaseType === 'product') {
        const itemId = session.metadata?.itemId;
        if (itemId) {
          next = grantInventoryItem(next, itemId);
          const subtotalArs = Number(session.metadata?.subtotalArs ?? 0);
          const discountCode = session.metadata?.discountCode || null;
          const discountPercent = Number(session.metadata?.discountPercent ?? 0) || null;
          const totalArs = session.amount_total ? Math.round(session.amount_total / 100) : subtotalArs;
          const shippingAddress = session.customer_details?.address
            ? ({
                name: session.customer_details?.name ?? null,
                email: session.customer_details?.email ?? null,
                address: session.customer_details.address,
              } as unknown as Parameters<typeof createOrderRecord>[1]['shippingAddress'])
            : null;

          const order = await createOrderRecord(admin, {
            playerId: userId,
            stripeSessionId: sessionId,
            itemId,
            size: session.metadata?.size ?? '',
            subtotalArs,
            totalArs,
            discountCode,
            discountPercent,
            shippingAddress,
          });

          await addInventoryFromOrder(admin, {
            playerId: userId,
            productId: itemId,
            orderId: order.id,
          });

          if (discountCode) {
            await markDiscountCodeUsed(admin, discountCode);
          }
        }
      }

      await ensurePlayerRow(admin, user, next);

      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(user.user_metadata ?? {}),
          waspiPlayer: next,
          waspiProcessedStripeSessions: [...processedSessions, sessionId].slice(-50),
        },
      });

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
