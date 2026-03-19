# Resend Email Confirmations

**Status:** 🟡 In Progress
**Created:** 2026-03-19
**Priority:** Low
**Project:** Waspi World

---

## Problem Statement

El juego no envía emails de confirmación post-compra. El código ya existe pero está desactivado porque falta `RESEND_API_KEY`.

## Current State

- ✅ `src/lib/resend.ts` — cliente Resend + `buildProductConfirmationEmail()` + `buildTenksConfirmationEmail()`
- ✅ `/api/webhooks/stripe/route.ts` — ya llama a Resend post-purchase (try/catch no-fatal)
- ❌ `RESEND_API_KEY` no está en `.env.local` ni en Vercel
- ❌ Dominio `waspiworld.com` no verificado en Resend
- ❌ `/api/webhooks/mp` (futuro) necesitará el mismo wiring

---

## Implementation Plan

1. Crear cuenta en [resend.com](https://resend.com)
2. Verificar dominio `waspiworld.com` en Resend → agregar DNS TXT record
3. Crear API key en Resend Dashboard
4. Agregar `RESEND_API_KEY` en Vercel (Settings → Environment Variables)
5. Agregar `RESEND_API_KEY` en `.env.local` para testing local
6. Una vez integrado MP: copiar el mismo bloque de email en `/api/webhooks/mp/route.ts`

---

## Technical Details

### Email templates ya implementados en `src/lib/resend.ts`

- `buildProductConfirmationEmail({ customerEmail, customerName, itemName, size, totalArs, orderId })`
  - Subject: `Tu pedido WASPI está confirmado 🛍️`
  - Incluye: nombre del producto, talle, total ARS, ETA 3-5 días hábiles

- `buildTenksConfirmationEmail({ customerEmail, customerName, packName, tenks, totalArs })`
  - Subject: `¡Tus TENKS llegaron! 🪙`
  - Incluye: cantidad de TENKS, pack comprado, total ARS

### From address
```
WASPI WORLD <noreply@waspiworld.com>
```
Requiere dominio verificado en Resend.

### Env vars
```
RESEND_API_KEY=re_...
```

---

## Archivos a tocar

| Archivo | Cambios |
|---|---|
| `.env.local` | Agregar RESEND_API_KEY |
| Vercel Dashboard | Agregar RESEND_API_KEY como env var |
| `app/api/webhooks/mp/route.ts` | Copiar bloque de email de stripe webhook (futuro) |

---

## Testing Plan

- [ ] Email de confirmación llega tras compra TENKS pack
- [ ] Email de confirmación llega tras compra producto físico
- [ ] Email no bloquea el webhook si falla (try/catch ya en su lugar)

## Success Criteria

- [ ] Email llega dentro de 60s del pago
- [ ] Templates se ven bien en Gmail y mobile

## Notes

- Resend free tier: 3.000 emails/mes, suficiente para MVP
- Si el dominio no está verificado, usar `onboarding@resend.dev` como from (solo en test)
- Depende de Mercado Pago Integration para tener el wiring completo
