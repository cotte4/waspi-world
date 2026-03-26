import { NextRequest, NextResponse } from 'next/server';
import { Preference } from 'mercadopago';
import { isMpConfigured, mpClient } from '@/src/lib/mercadopago';
import { getAuthenticatedUser } from '@/src/lib/supabaseServer';
import { getTenksPack } from '@/src/lib/tenksPacks';
import { getItem } from '@/src/game/config/catalog';

function getBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL
    ?? `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export async function POST(request: NextRequest) {
  if (!isMpConfigured || !mpClient) {
    return NextResponse.json({ error: 'Mercado Pago is not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as
    | { type?: 'tenks_pack'; packId?: string }
    | { type?: 'product'; itemId?: string; size?: string }
    | null;

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to buy items.' }, { status: 401 });
  }

  const baseUrl = getBaseUrl(request);
  const preference = new Preference(mpClient);

  if (body?.type === 'product') {
    const item = body.itemId ? getItem(body.itemId) : null;
    if (!item || typeof item.priceArs !== 'number') {
      return NextResponse.json({ error: 'Product not found.' }, { status: 400 });
    }
    const sizes = item.sizes ?? [];
    const size = body.size?.trim().toUpperCase();
    if (!size || !sizes.includes(size)) {
      return NextResponse.json({ error: 'Select a valid size.' }, { status: 400 });
    }

    const result = await preference.create({
      body: {
        items: [{
          id: item.id,
          title: item.name,
          description: `${item.description ?? 'Waspi World'} | Talle ${size}`,
          quantity: 1,
          unit_price: item.priceArs,
          currency_id: 'ARS',
        }],
        back_urls: {
          success: `${baseUrl}/play?checkout=product_success`,
          failure: `${baseUrl}/play?checkout=cancelled`,
          pending: `${baseUrl}/play?checkout=cancelled`,
        },
        auto_return: 'approved',
        external_reference: user.id,
        // Nota: MP convierte camelCase a snake_case en metadata
        metadata: {
          purchase_type: 'product',
          item_id: item.id,
          size,
          customer_user_id: user.id,
        },
      },
    });

    return NextResponse.json({ url: result.init_point });
  }

  // tenks_pack
  const packId = body && 'packId' in body ? body.packId : undefined;
  if (!packId) return NextResponse.json({ error: 'Missing packId.' }, { status: 400 });

  const pack = getTenksPack(packId);
  if (!pack) return NextResponse.json({ error: 'TENKS pack not found.' }, { status: 400 });

  const result = await preference.create({
    body: {
      items: [{
        id: pack.id,
        title: pack.name,
        description: pack.description,
        quantity: 1,
        unit_price: pack.priceArs,
        currency_id: 'ARS',
      }],
      back_urls: {
        success: `${baseUrl}/play?checkout=success`,
        failure: `${baseUrl}/play?checkout=cancelled`,
        pending: `${baseUrl}/play?checkout=cancelled`,
      },
      auto_return: 'approved',
      external_reference: user.id,
      metadata: {
        purchase_type: 'tenks_pack',
        pack_id: pack.id,
        tenks: pack.tenks,
        customer_user_id: user.id,
      },
    },
  });

  return NextResponse.json({ url: result.init_point });
}
