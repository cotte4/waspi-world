# Mercado Pago Integration — Cobros en ARS

**Status:** 🟡 In Progress
**Created:** 2026-03-19
**Priority:** High
**Project:** Waspi World

---

## Problem Statement

Stripe no soporta ARS para cuentas no registradas en Argentina. El checkout actual usa un hack de conversión USD/ARS que no sirve para producción. Se necesita integrar Mercado Pago para cobrar en pesos argentinos.

## Current State

- `/api/checkout` usa Stripe con `currency: 'usd'` y conversión `priceArs / 1300` — solo válido para testing
- El webhook de Stripe funciona y acredita TENKS correctamente en test mode
- El frontend llama a `startStripeCheckout()` para ambos tipos de compra (producto físico + TENKS packs)
- No hay integración con Mercado Pago

## Proposed Solution

Agregar Mercado Pago como procesador de pagos para cobros en ARS. Stripe queda como opción internacional (USD). El frontend detecta el tipo de pago y llama al endpoint correcto.

**Flujo MP:**
1. Frontend POST `/api/checkout/mp` → crea preferencia MP → devuelve `init_point` URL
2. Usuario paga en checkout de Mercado Pago
3. MP envía webhook IPN a `/api/webhooks/mp`
4. Webhook acredita TENKS o crea order en DB

---

## Implementation Plan

1. `npm install mercadopago` — instalar SDK oficial
2. Crear `src/lib/mercadopago.ts` — cliente MP + `isMpConfigured` guard
3. Crear `app/api/checkout/mp/route.ts` — crea preferencia, devuelve `init_point`
4. Crear `app/api/webhooks/mp/route.ts` — procesa IPN, acredita TENKS/orders, idempotencia
5. Actualizar `app/play/GamePage.tsx` — `startCheckout()` que decide MP vs Stripe según moneda
6. Agregar env vars en `.env.local` y Vercel

---

## Technical Details

### Backend — `src/lib/mercadopago.ts`
```ts
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

const accessToken = process.env.MP_ACCESS_TOKEN ?? '';
export const isMpConfigured = Boolean(accessToken);
export const mpClient = isMpConfigured ? new MercadoPagoConfig({ accessToken }) : null;
```

### API — `app/api/checkout/mp/route.ts`
- POST `{ type: 'product' | 'tenks_pack', itemId?, size?, discountCode?, packId? }`
- Crea `Preference` con `back_urls` apuntando a `/play?checkout=success/product_success/cancelled`
- `auto_return: 'approved'`
- `metadata: { purchaseType, itemId, size, packId, tenks, customerUserId }`
- Devuelve `{ url: preference.init_point }`

### API — `app/api/webhooks/mp/route.ts`
- POST recibe IPN de MP: `{ type: 'payment', data: { id } }`
- Fetch payment details via `new Payment(mpClient).get({ id })`
- Verificar `payment.status === 'approved'`
- Idempotencia: guardar payment ID en `user_metadata.waspiProcessedMpPayments[]`
- Mismo flujo que webhook Stripe: acreditar TENKS o crear order

### Frontend — `app/play/GamePage.tsx`
- Renombrar `startStripeCheckout` → `startCheckout`
- Para `type: 'product'` y `type: 'tenks_packs'` → POST `/api/checkout/mp` (ARS)
- Mantener `/api/checkout` de Stripe para pagos internacionales en USD (futuro)

### Env vars nuevas
```
MP_ACCESS_TOKEN=TEST-...       # Mercado Pago > Mis aplicaciones > Credenciales
NEXT_PUBLIC_MP_PUBLIC_KEY=TEST-...
MP_WEBHOOK_SECRET=             # opcional, para validar firma IPN
```

### Retorno de checkout
Igual que Stripe — mismas URLs ya configuradas en el frontend:
- `?checkout=success` → TENKS acreditados
- `?checkout=product_success` → compra física exitosa
- `?checkout=cancelled` → cierre sin mensaje

---

## Archivos a tocar

| Archivo | Cambios |
|---|---|
| `src/lib/mercadopago.ts` | Nuevo — cliente MP |
| `app/api/checkout/mp/route.ts` | Nuevo — crea preferencia |
| `app/api/webhooks/mp/route.ts` | Nuevo — procesa IPN |
| `app/play/GamePage.tsx` | `startCheckout()` → MP en lugar de Stripe para ARS |
| `.env.local` | Agregar MP_ACCESS_TOKEN, NEXT_PUBLIC_MP_PUBLIC_KEY |

---

## Testing Plan

- [ ] Pack TENKS: checkout MP abre en AR, pago con tarjeta de test MP, webhook acredita TENKS
- [ ] Producto físico: checkout MP con shipping address, webhook crea order en DB
- [ ] Idempotencia: IPN recibida 2 veces no duplica TENKS
- [ ] Retorno: banners correctos post-pago
- [ ] Código de descuento: precio reducido en preferencia MP

## Success Criteria

- [ ] Jugador puede comprar TENKS pack pagando en ARS con tarjeta argentina
- [ ] Jugador puede comprar ropa física pagando en ARS
- [ ] TENKS se acreditan automáticamente tras el pago
- [ ] Order queda registrada en tabla `orders`

## Notes

- Credenciales TEST de MP: [mercadopago.com.ar/developers](https://www.mercadopago.com.ar/developers) → Mis aplicaciones → Credenciales
- Tarjeta de test MP: `5031 7557 3453 0604`, vence `11/25`, CVV `123`, nombre `APRO` (aprobado)
- Para webhooks en local: MP no tiene CLI como Stripe — usar ngrok o similar, o testear directo en Vercel preview
- Stripe queda en el codebase para pagos USD internacionales (futuro)
