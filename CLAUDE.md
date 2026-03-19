# WASPI WORLD

E-commerce gamificado — mundo abierto 2D top-down con elementos de e-commerce gamificado, social multiplayer, minijuegos y progresión persistente. Estilo Binding of Isaac para marca streetwear.

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
    scenes/               ← Escenas Phaser (WorldScene, StoreInterior, ZombiesScene, etc.)
    systems/              ← AvatarRenderer, ChatSystem, MultiplayerSync, etc.
    config/               ← world.ts, catalog.ts, npcs.ts, constants.ts, zombies.ts
  lib/
    stripe.ts
    supabase.ts
    realtime.ts
public/
  assets/
    tilemaps/             ← JSON exports de Tiled
    tilesets/             ← Tilesheet PNGs
    sprites/              ← Personajes, NPCs, armas
    ui/                   ← HUD, iconos, frames
    audio/                ← SFX, ambient
```

## Key Commands
- `npm run dev` — start dev server (localhost:3000)
- `npm run build` — build for production
- `npm run start` — start prod
- `npm run lint` — lint (usar `npm run lint:fix` si existe)

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

---

## Reglas de Código y Convenciones

- TypeScript strict: `"strict": true`, `"noImplicitAny": true` — nunca uses `any`
- Naming: camelCase para variables/métodos, PascalCase para clases/escenas/types/interfaces
- Imports: absolute paths preferidos (`@/game/scenes/WorldScene`)
- Phaser: crea game instance UNA VEZ en `useEffect` con cleanup (`destroy` on unmount) — patrón singleton o `useRef`
- Nunca mezcles lógica Phaser en React components — delega a escenas/systems
- Usa `Phaser.Events` para comunicación React ↔ Phaser
- Assets: preload TODO en Boot/Preload scene; asset keys consistentes (ej: `weapon_pistol_idle`)
- No pongas game logic en React state — usa Phaser data manager para shared state
- Errores: throw custom Errors con mensajes claros; loggea con `console` estructurado en dev

## Performance y Mobile
- Limita draw calls; usa texture atlases; evita physics innecesarios en open world
- Phaser canvas: `scale.mode = Phaser.Scale.FIT` + resize listener en React
- Testea touch controls y orientation lock en mobile

## Seguridad y Economía
- **Todas las transacciones** pasan por Route Handlers (`POST /api/purchase`, `/api/inventory`)
- Nunca confíes solo en client prediction para PvP/economy
- PvP/minijuegos: rooms/instancias separadas (Phaser scenes) + sync via WebSockets

## Pitfalls Comunes (Claude suele equivocarse aquí)
- No destruyas/recrees Phaser game en cada render React
- No cargues assets grandes sin Preload scene
- En multiplayer: valida inputs server-side siempre
- Shop/economy: todas las transacciones por Route Handlers
- No mezcles UI React con canvas Phaser logic

## Audio BGM — un solo tema a la vez (CRÍTICO)

Phaser **no** limpia los `sound.add()` al cambiar de escena: si cada escena arranca su loop sin cortar el anterior, se superponen (mundo + tienda + zombies + arcade).

**Reglas:**

1. **Música de escena** — usar siempre `startSceneMusic()` / `stopSceneMusic()` de `AudioManager.ts` (registran un único slot global y barren huérfanos por clave).
2. **Transiciones** — `transitionToScene()` en `SceneUi.ts` ya llama `clearGlobalBgm()` al iniciar el fade; no dupliques lógica salvo que hagas un `fadeOut + scene.start` manual (entonces llamá `clearGlobalBgm(this)` antes del fade, como en `WorldScene.transitionToScene`).
3. **Excepción Arcade** — el tema `arcade_theme` usa `this.sound.add()` por el unlock de audio; antes de crear el sonido: `clearGlobalBgm(this)`, después: `attachGlobalBgm(this.arcadeMusic)`; al parar: `detachGlobalBgmIfMatch(sound)` antes del fade (ver `ArcadeInterior.ts`).
4. **Nuevas escenas con música** — añadir la clave a `MusicTrack` + `BGM_TRACK_KEYS` en `AudioManager.ts` y usar `startSceneMusic` o el patrón clear + attach anterior.

---

## Scene Transition — Reglas Anti-Freeze (CRÍTICO)

Este juego tiene historial de freezes donde el jugador no puede salir de una escena.
**SIEMPRE** seguir estas reglas al implementar transiciones o escenas nuevas.

### Causa raíz documentada
`scene.input.enabled = false` se setea al iniciar la transición.
Si `FADE_OUT_COMPLETE` no dispara (race condition con audio tweens, minijuegos, etc.),
y el fallback usa `scene.time.delayedCall` que chequea `isActive()`,
**ambos fallan silenciosamente** → input permanece disabled → freeze permanente.

### Regla 1 — SIEMPRE usar `transitionToScene()` de SceneUi.ts
```ts
import { transitionToScene } from '../systems/SceneUi';
transitionToScene(this, 'WorldScene', { returnX, returnY });
```
**NUNCA** hacer manualmente `camera.fadeOut() + scene.start()` para salir de una escena.
Las únicas excepciones aceptadas son transiciones INTERNAS (entrar a minijuego dentro del mismo interior).

### Regla 2 — Todo `create()` debe llamar `announceScene(this)`
```ts
create() {
  this.inTransition = false;
  this.input.enabled = true;
  announceScene(this); // re-habilita input y resetea teclado
  ...
}
```

### Regla 3 — `inTransition` debe resetearse en `init()` Y en WAKE
```ts
init(data = {}) {
  this.inTransition = false; // reset al volver de un minijuego
}

create() {
  ...
  // Defensive: cubre el caso de scene.wake() vs scene.start()
  this.events.on(Phaser.Scenes.Events.WAKE, () => {
    this.inTransition = false;
    this.input.enabled = true;
    if (this.input.keyboard) this.input.keyboard.enabled = true;
  });
}
```

### Regla 4 — Nuevas escenas deben registrar SHUTDOWN cleanup
```ts
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  // limpiar timers, tweens, listeners externos, supabase channels
  this.room?.shutdown();
  this.audioCleanup?.();
});
```

### Regla 5 — Sistemas singleton con fetch: siempre incluir auth header
```ts
import { getAuthHeaders } from '../systems/authHelper';
// En cualquier fetch a /api/*:
const authH = await getAuthHeaders();
const res = await fetch('/api/...', { headers: authH });
// Para POST:
const res = await fetch('/api/...', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authH },
  body: JSON.stringify(payload),
});
```
Sin el header → 401 Unauthorized silencioso en todos los sistemas (skills, guilds, mastery, contracts).

### Checklist para nueva escena interior
- [ ] `create()` llama `announceScene(this)` y `this.input.enabled = true`
- [ ] `init()` setea `this.inTransition = false`
- [ ] Salida usa `transitionToScene()`, nunca `camera.fadeOut() + scene.start()` manual
- [ ] WAKE listener resetea `inTransition` y re-habilita input
- [ ] SHUTDOWN listener limpia todos los recursos (audio, timers, channels)
- [ ] `bindSafeResetToPlaza()` registrado para casos de emergencia

---

## Reglas Anti-Crash — Objetos Phaser en Callbacks Asíncronos (CRÍTICO)

Este juego ha tenido crashes por acceder a objetos Phaser ya destruidos desde callbacks asíncronos.
Los callbacks asíncronos (setTimeout, promise .then, tween onComplete) pueden dispararse **después** de que la escena ya hizo shutdown y destruyó sus objetos.

### Causa raíz documentada
- `window.setTimeout` con bullet cleanup: `b.x` / `b.y` accedidos después de que el bullet fue destruido por `resolveImmediateShot` → `add.circle(NaN, NaN)` → crash.
- Promise `.then()` en compra de arma: `rowBg.clear()` llamado después de que el panel fue cerrado → operación sobre objeto destruido → crash.
- `window.setTimeout` en floating labels: `label.destroy()` llamado sobre objeto ya destruido por SHUTDOWN → crash silencioso o error.

### Regla 6 — `window.setTimeout` que accede a objetos Phaser SIEMPRE necesita doble guard
```ts
window.setTimeout(() => {
  // 1. Verificar que la escena sigue activa
  if (!this.scene?.isActive('NombreEscena')) return;
  // 2. Verificar que el objeto Phaser sigue vivo
  if (!obj.active) return;
  // Recién aquí es seguro acceder a obj.x, obj.y, etc.
  this.spawnEffect(obj.x, obj.y);
  this.destroyObject(obj);
}, delay);
```

### Regla 7 — Promise `.then()` que accede a objetos Phaser SIEMPRE necesita guard
```ts
this.someAsyncOperation().then((result) => {
  // Verificar que el objeto target sigue vivo antes de operar
  if (!targetObj.active) return;
  targetObj.setText(result);
  targetObj.setColor('#fff');
});
```

### Regla 8 — `tween onComplete` que destruye objetos usa guard de `.active`
```ts
// CORRECTO:
this.tweens.add({
  targets: label,
  alpha: 0,
  duration: 380,
  onComplete: () => { if (label.active) label.destroy(); },
});

// INCORRECTO (puede double-destroy si SHUTDOWN corrió antes del tween):
this.tweens.add({
  targets: label,
  alpha: 0,
  duration: 380,
  onComplete: () => label.destroy(), // ← crash si ya fue destruido
});
```

**Nota:** Tweens Phaser-nativos (`this.tweens.add`) son administrados por el TweenManager de la escena y se cancelan en SHUTDOWN — sus `onComplete` NO disparan después del shutdown. El peligro está específicamente en callbacks combinados: tween → `window.setTimeout` → destroy.

### Patrones seguros ya establecidos
- `safeSceneDelayedCall(this, ms, fn)` — `this.time.delayedCall` con guard de `isActive()`
- `safeDestroyGameObject(obj)` — destrucción con guard
- `fetchWithTimeout(url, opts, ms)` — fetch con AbortController y timeout de 6s
- Guard de bullet: `if (b.resolvedHit || !b.active) return;` antes del cleanup

### Checklist para nueva escena interior
- [ ] `create()` llama `announceScene(this)` y `this.input.enabled = true`
- [ ] `init()` setea `this.inTransition = false`
- [ ] Salida usa `transitionToScene()`, nunca `camera.fadeOut() + scene.start()` manual
- [ ] WAKE listener resetea `inTransition` y re-habilita input
- [ ] SHUTDOWN listener limpia todos los recursos (audio, timers, channels)
- [ ] `bindSafeResetToPlaza()` registrado para casos de emergencia
- [ ] Todo `window.setTimeout` que accede a objetos Phaser tiene doble guard (scene + obj.active)
- [ ] Todo Promise `.then()` que accede a objetos Phaser tiene guard de `.active`

---

## Review Checklist (verificar antes de proponer código)
1. ¿Mantiene TypeScript strict sin `any`?
2. ¿La lógica Phaser está aislada de React components?
3. ¿Assets se precargan en Boot/Preload scene?
4. ¿Maneja cleanup del game instance en unmount?
5. ¿Valida inputs/transacciones en server-side?
6. ¿Optimiza para mobile (scale, draw calls, touch)?
7. ¿Usa asset keys y tipos consistentes?
8. ¿Evita mezclar UI React con canvas Phaser logic?
9. ¿Nueva escena interior sigue el checklist anti-freeze?
10. ¿Nuevos fetch en sistemas singleton incluyen `getAuthHeaders()`?
11. ¿`window.setTimeout` con objetos Phaser tiene doble guard (scene + obj.active)?
12. ¿Promise `.then()` con objetos Phaser tiene guard de `.active`?
