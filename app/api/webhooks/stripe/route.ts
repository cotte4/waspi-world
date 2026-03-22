import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/src/lib/supabaseServer';
import { stripe, stripeWebhookSecret, isStripeConfigured, isStripeWebhookConfigured } from '@/src/lib/stripe';
import { DEFAULT_PLAYER_STATE, normalizePlayerState, creditTenks, grantInventoryItem } from '@/src/lib/playerState';
import { ensureCatalogSeeded, ensurePlayerRow, createOrderRecord, addInventoryFromOrder, appendTenksTransaction, markDiscountCodeUsed } from '@/src/lib/commercePersistence';
import { resend, isResendConfigured, buildProductConfirmationEmail, buildTenksConfirmationEmail } from '@/src/lib/resend';
import { getItem } from '@/src/game/config/catalog';
import { getTenksPack } from '@/src/lib/tenksPacks';

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
          // --- DB FIRST: write durable records before touching user_metadata ---
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

          // --- METADATA SECOND: grant item in memory state after DB is safe ---
          next = grantInventoryItem(next, itemId);
        }
      }

      await ensurePlayerRow(admin, user, next, { syncTenksBalance: purchaseType === 'tenks_pack' });

      // Mark session processed and update user_metadata. If this fails, the item
      // is already in player_inventory (DB) and will be reconciled on next player load.
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(user.user_metadata ?? {}),
          waspiPlayer: next,
          waspiProcessedStripeSessions: [...processedSessions, sessionId].slice(-50),
        },
      });

      if (updateError) {
        console.error('[Waspi] Webhook: user_metadata update failed for user', userId, 'session', sessionId, updateError.message);
        // Return 500 so Stripe retries — DB records are already written and idempotent.
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // Send confirmation email — non-fatal: failure must never block webhook 200 response.
      if (isResendConfigured && resend && session.customer_details?.email) {
        try {
          const email = session.customer_details.email;
          const name = session.customer_details.name ?? null;

          if (purchaseType === 'product') {
            const itemId = session.metadata?.itemId;
            const item = itemId ? getItem(itemId) : null;
            if (item) {
              const totalArs = session.amount_total ? Math.round(session.amount_total / 100) : 0;
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
              const totalArs = session.amount_total ? Math.round(session.amount_total / 100) : pack.priceArs;
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
