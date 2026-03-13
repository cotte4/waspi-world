import { NextRequest, NextResponse } from 'next/server';
import { stripe, isStripeConfigured } from '@/src/lib/stripe';
import { createSupabaseAdminClient, getAuthenticatedUser } from '@/src/lib/supabaseServer';
import { getTenksPack } from '@/src/lib/tenksPacks';
import { getCatalogItemWithStripe } from '@/src/lib/catalogServer';
import { ensureCatalogSeeded, ensurePlayerRow, loadDiscountCode } from '@/src/lib/commercePersistence';
import { DEFAULT_PLAYER_STATE, normalizePlayerState } from '@/src/lib/playerState';

function getBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL
    ?? `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export async function POST(request: NextRequest) {
  if (!isStripeConfigured || !stripe) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as
    | { type?: 'tenks_pack'; packId?: string }
    | { type?: 'product'; itemId?: string; size?: string; discountCode?: string }
    | null;

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to buy items.' }, { status: 401 });
  }
  const baseUrl = getBaseUrl(request);
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin client unavailable.' }, { status: 500 });
  }

  const playerState = normalizePlayerState(user.user_metadata?.waspiPlayer ?? DEFAULT_PLAYER_STATE);
  await ensureCatalogSeeded(admin);
  await ensurePlayerRow(admin, user, playerState);

  let session;
  if (body?.type === 'product') {
    const catalogEntry = body.itemId ? getCatalogItemWithStripe(body.itemId) : null;
    const item = catalogEntry?.item ?? null;
    if (!item || typeof item.priceArs !== 'number') {
      return NextResponse.json({ error: 'Product not found.' }, { status: 400 });
    }

    const sizes = item.sizes ?? [];
    const size = body.size?.trim().toUpperCase();
    if (!size || !sizes.includes(size)) {
      return NextResponse.json({ error: 'Select a valid size.' }, { status: 400 });
    }

    let discountCode: string | null = null;
    let discountPercent: number | null = null;
    if (body.discountCode?.trim()) {
      const discount = await loadDiscountCode(admin, user.id, body.discountCode.trim().toUpperCase());
      if (!discount) {
        return NextResponse.json({ error: 'Discount code is invalid or expired.' }, { status: 400 });
      }
      discountCode = discount.code;
      discountPercent = discount.percent_off;
    }

    const unitAmount = item.priceArs * 100;
    const coupon = discountPercent
      ? await stripe.coupons.create({
          percent_off: discountPercent,
          duration: 'once',
          name: discountCode ?? undefined,
        })
      : null;

    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${baseUrl}/play?checkout=product_success`,
      cancel_url: `${baseUrl}/play?checkout=cancelled`,
      line_items: [
        {
          quantity: 1,
          ...(catalogEntry?.stripePriceId
            ? { price: catalogEntry.stripePriceId }
            : {
                price_data: {
                  currency: 'ars',
                  unit_amount: unitAmount,
                  product_data: {
                    name: item.name,
                    description: `${item.description ?? 'Waspi World item'} | Talle ${size}`,
                    metadata: {
                      itemId: item.id,
                      size,
                    },
                  },
                },
              }),
        },
      ],
      discounts: coupon ? [{ coupon: coupon.id }] : undefined,
      metadata: {
        purchaseType: 'product',
        itemId: item.id,
        size,
        subtotalArs: String(item.priceArs),
        discountCode: discountCode ?? '',
        discountPercent: discountPercent ? String(discountPercent) : '',
        customerUserId: user.id,
      },
      customer_email: user.email ?? undefined,
    });
  } else {
    const packId = body && 'packId' in body ? body.packId : undefined;
    if (!packId) {
      return NextResponse.json({ error: 'Missing packId.' }, { status: 400 });
    }

    const pack = getTenksPack(packId);
    if (!pack) {
      return NextResponse.json({ error: 'TENKS pack not found.' }, { status: 400 });
    }

    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${baseUrl}/play?checkout=success`,
      cancel_url: `${baseUrl}/play?checkout=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'ars',
            unit_amount: pack.priceArs * 100,
            product_data: {
              name: pack.name,
              description: pack.description,
              metadata: {
                packId: pack.id,
                tenks: String(pack.tenks),
              },
            },
          },
        },
      ],
      metadata: {
        purchaseType: 'tenks_pack',
        packId: pack.id,
        tenks: String(pack.tenks),
        customerUserId: user.id,
      },
      customer_email: user.email ?? undefined,
    });
  }

  return NextResponse.json({
    url: session.url,
    id: session.id,
  });
}
