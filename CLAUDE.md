# WASPI WORLD

E-commerce gamificado — mundo abierto 2D estilo Binding of Isaac para marca streetwear.

## Stack
- **Game Engine**: Phaser 3.80+
- **Frontend shell**: Next.js 15 (App Router) + TypeScript + Tailwind
- **Real-time**: Supabase Realtime (WebSockets, chat + presencia)
- **DB**: Supabase PostgreSQL
- **Auth**: Supabase Auth (magic link + Google + Discord)
- **Pagos**: Stripe Checkout hosted + Coupons API
- **Email**: Resend
- **Hosting**: Vercel

## Project Structure
```
src/
  app/                    ← Next.js App Router
    page.tsx              ← Landing page
    play/page.tsx         ← Monta el juego Phaser
    api/
      checkout/           ← Stripe Checkout Session
      webhooks/stripe/    ← Webhook handler
      player/             ← CRUD player state + TENKS
      shop/               ← Catálogo de productos
      chat/moderate/      ← Moderación de chat
  game/
    scenes/               ← Escenas Phaser (WorldScene, StoreInterior, etc.)
    systems/              ← AvatarRenderer, ChatSystem, MultiplayerSync, etc.
    config/               ← world.ts, catalog.ts, npcs.ts, constants.ts
  lib/
    stripe.ts
    supabase.ts
    realtime.ts
public/
  assets/
    tilemaps/             ← JSON exports de Tiled
    tilesets/             ← Tilesheet PNGs
    sprites/              ← Personajes, NPCs
    ui/                   ← HUD, iconos, frames
    audio/                ← SFX, ambient
```

## Key Commands
- `npm run dev` — start dev server (localhost:3000)
- `npm run build` — build for production
- `npm run lint` — lint

## Critical PRD Decisions
1. **Mundo abierto continuo**: tilemap 3200x2400px, cámara con smooth lerp, sin pantallas de carga entre zonas. Solo fade 300ms al entrar/salir de edificios.
2. **Social first**: chat BoomBang-style con burbujas sobre la cabeza. WebSocket via Supabase Realtime.
3. **Moneda TENKS**: solo engagement, NO se compra con dinero. Ropa física se paga con Stripe (ARS).
4. **Capas de rendering**: sombra → piernas → ropa inferior → torso → ropa superior → brazos → cabeza → pelo → ojos → accesorios.
5. **Client untrusted**: TENKS, descuentos y scores validados server-side siempre.
6. **MVP target**: 30 jugadores simultáneos, 60fps, carga < 3 segundos.

## Paleta Visual
- Fondo: `#0E0E14`
- Acento dorado: `#F5C842`
- Fuentes: Press Start 2P (HUD), Silkscreen (chat/diálogos)

## Zonas MVP
Calle Principal → Tu Casa (spawn) → Waspi Store → Arcade → Café → Plaza

## Catálogo MVP (6 SKUs)
TEE-BLK-01, TEE-WHT-01, TEE-RED-01, CRG-BLK-01, CRG-OLV-01, HOD-GRY-01

## Workflow
- Siempre leer el PRD antes de implementar features
- Commit después de cada feature completa, no archivo por archivo
- Actualizar estado del PRD al completar fases
- El PRD está en: `../prd titi.pdf`
