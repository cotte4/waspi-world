# WASPI WORLD

WASPI WORLD is a Next.js + Phaser multiplayer game app with:

- a `/play` game client
- Supabase-backed player, chat, progression, vecindad, and commerce APIs
- Stripe checkout for physical products and TENKS packs
- optional voice chat via PeerJS/WebRTC

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example env file and fill in the required values:

```bash
cp .env.local.example .env.local
```

3. Start the dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000/play`.

## Environment Notes

- `NEXT_PUBLIC_APP_URL` should match the public URL you are using for the app.
- `STRIPE_CHECKOUT_CURRENCY` defaults to `usd`.
- `STRIPE_ARS_PER_USD` controls the fallback ARS/USD conversion when checkout is not running directly in `ars`.
- `NEXT_PUBLIC_VOICE_ICE_SERVERS` accepts a JSON WebRTC config. Add TURN servers there for production voice reliability.

## Validation

```bash
npm run lint
npm run build
```

## Current Status

- The refactor is in final stabilization, not broad rewiring.
- Main React and Phaser extraction work is already landed.
- Remaining work is mostly regression QA and smaller runtime cleanup.
