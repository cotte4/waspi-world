import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/src/lib/supabaseServer';
import { stripe, stripeWebhookSecret, isStripeConfigured, isStripeWebhookConfigured } from '@/src/lib/stripe';
import { creditTenks, grantInventoryItem } from '@/src/lib/playerState';
import { ensureCatalogSeeded, ensurePlayerRow, createOrderRecord, addInventoryFromOrder, appendTenksTransaction, markDiscountCodeUsed, hydratePlayerFromDatabase, syncPlayerMetadataSnapshot } from '@/src/lib/commercePersistence';
import { toArsFromStripeAmount } from '@/src/lib/commercePricing';
import { resend, isResendConfigured, buildProductConfirmationEmail, buildTenksConfirmationEmail } from '@/src/lib/resend';
import { getItem } from '@/src/game/config/catalog';
import { getTenksPack } from '@/src/lib/tenksPacks';
import { logEvent } from '@/src/lib/logger';

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
    const checkoutCurrency = session.currency ?? session.metadata?.paymentCurrency ?? 'usd';
    const arsPerUsd = Number(session.metadata?.arsPerUsd ?? 1300) || 1300;

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

      const current = await hydratePlayerFromDatabase(admin, user);
      let next = current;
      const tenksPackReason = `tenks_pack_${sessionId}`;

      await ensureCatalogSeeded(admin);
      await ensurePlayerRow(admin, user, current);

      if (purchaseType === 'tenks_pack') {
        const tenksRaw = session.metadata?.tenks;
        const tenks = Number(tenksRaw ?? 0);
        if (Number.isFinite(tenks) && tenks > 0) {
          const { data: existingGrant, error: existingGrantError } = await admin
            .from('tenks_transactions')
            .select('id')
            .eq('player_id', userId)
            .eq('reason', tenksPackReason)
            .maybeSingle<{ id: string }>();

          if (existingGrantError) {
            return NextResponse.json({ error: existingGrantError.message }, { status: 500 });
          }

          if (!existingGrant) {
            next = creditTenks(current, tenks);
            await appendTenksTransaction(admin, {
              playerId: userId,
              amount: tenks,
              reason: tenksPackReason,
              balanceAfter: next.tenks,
            });
          }
        }
      }

      if (purchaseType === 'product') {
        const itemId = session.metadata?.itemId;
        if (itemId) {
          // --- DB FIRST: write durable records before touching user_metadata ---
          const subtotalArs = Number(session.metadata?.subtotalArs ?? 0);
          const discountCode = session.metadata?.discountCode || null;
          const discountPercent = Number(session.metadata?.discountPercent ?? 0) || null;
          const totalArs = session.amount_total
            ? toArsFromStripeAmount(session.amount_total, checkoutCurrency, arsPerUsd)
            : subtotalArs;
          const shippingAddress = session.customer_details?.address
            ? ({
                name: session.customer_details?.name ?? null,
                email: session.customer_details?.email ?? null,
                address: session.customer_details.address,
              } as unknown as Parameters<typeof createOrderRecord>[1]['shippingAddress'])
            : null;

          let order: { data: { id: string } | null; error: { message: string } | null } = await admin
            .from('orders')
            .select('id')
            .eq('stripe_session_id', sessionId)
            .maybeSingle<{ id: string }>();

          if (order.error) {
            return NextResponse.json({ error: order.error.message }, { status: 500 });
          }

          if (!order.data) {
            const createdOrder = await createOrderRecord(admin, {
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
            order = { data: createdOrder, error: null };

            if (discountCode) {
              await markDiscountCodeUsed(admin, discountCode);
            }
          }

          const resolvedOrder = order.data!;
          const { data: existingInventory, error: existingInventoryError } = await admin
            .from('player_inventory')
            .select('id')
            .eq('player_id', userId)
            .eq('product_id', itemId)
            .eq('order_id', resolvedOrder.id)
            .maybeSingle<{ id: string }>();

          if (existingInventoryError) {
            return NextResponse.json({ error: existingInventoryError.message }, { status: 500 });
          }

          if (!existingInventory) {
            await addInventoryFromOrder(admin, {
              playerId: userId,
              productId: itemId,
              orderId: resolvedOrder.id,
            });
          }

          // --- METADATA SECOND: grant item in memory state after DB is safe ---
          next = grantInventoryItem(next, itemId);
        }
      }

      await ensurePlayerRow(admin, user, next, { syncTenksBalance: purchaseType === 'tenks_pack' });

      try {
        await syncPlayerMetadataSnapshot(admin, user, next);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to persist player metadata.';
        console.error('[Waspi] Webhook: player metadata snapshot failed for user', userId, 'session', sessionId, message);
        return NextResponse.json({ error: message }, { status: 500 });
      }

      const { data: latestUserData, error: latestUserError } = await admin.auth.admin.getUserById(userId);
      if (latestUserError || !latestUserData.user) {
        return NextResponse.json({ error: latestUserError?.message ?? 'User not found after metadata update.' }, { status: 500 });
      }
      const latestProcessedSessions = Array.isArray(latestUserData.user.user_metadata?.waspiProcessedStripeSessions)
        ? latestUserData.user.user_metadata.waspiProcessedStripeSessions.filter((value: unknown): value is string => typeof value === 'string')
        : [];

      // Mark session processed separately so this webhook only appends its own id
      // after the player blob has been merged against the latest metadata.
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(latestUserData.user.user_metadata ?? {}),
          waspiProcessedStripeSessions: [...new Set([...latestProcessedSessions, sessionId])].slice(-50),
        },
      });

      if (updateError) {
        console.error('[Waspi] Webhook: user_metadata update failed for user', userId, 'session', sessionId, updateError.message);
        // Return 500 so Stripe retries — DB records are already written and idempotent.
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // Log the purchase event — fire-and-forget
      void logEvent({
        event_type: 'purchase',
        player_id: userId,
        player_email: session.customer_details?.email ?? user.email,
        metadata: {
          purchase_type: purchaseType,
          stripe_session_id: sessionId,
          item_id: session.metadata?.itemId ?? null,
          amount_ars: session.amount_total
            ? toArsFromStripeAmount(session.amount_total, checkoutCurrency, arsPerUsd)
            : null,
          tenks: purchaseType === 'tenks_pack' ? Number(session.metadata?.tenks ?? 0) : null,
        },
      });

      // Send confirmation email — non-fatal: failure must never block webhook 200 response.
      if (isResendConfigured && resend && session.customer_details?.email) {
        try {
          const email = session.customer_details.email;
          const name = session.customer_details.name ?? null;

          if (purchaseType === 'product') {
            const itemId = session.metadata?.itemId;
            const item = itemId ? getItem(itemId) : null;
            if (item) {
              const totalArs = session.amount_total
                ? toArsFromStripeAmount(session.amount_total, checkoutCurrency, arsPerUsd)
                : 0;
              const emailData = buildProductConfirmationEmail({
                customerEmail: email,
                customerName: name,
                itemName: item.name,
                size: session.metadata?.size ?? '',
                totalArs,
                orderId: sessionId,
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
            const packId = session.metadata?.packId;
            const pack = packId ? getTenksPack(packId) : null;
            if (pack) {
              const subtotalArs = Number(session.metadata?.subtotalArs ?? pack.priceArs);
              const totalArs = session.amount_total
                ? toArsFromStripeAmount(session.amount_total, checkoutCurrency, arsPerUsd)
                : subtotalArs;
              const emailData = buildTenksConfirmationEmail({
                customerEmail: email,
                customerName: name,
                packName: pack.name,
                tenks: pack.tenks,
                totalArs,
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
          // Email failure is non-fatal — log but don't fail the webhook
          console.error('[Waspi] Webhook: email send failed', emailErr);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
