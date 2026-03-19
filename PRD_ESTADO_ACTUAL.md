# WASPI WORLD — PRD Estado Actual
**Fecha:** 2026-03-19
**Nota:** Actualizado post sesión de Stripe integration, shop UI polish, env vars, y QA end-to-end.
**Archivos fuente:** `PRD_WASPI_WORLD.md` (v1.2), código real en `src/` y `app/`.

---

## Sesión 2026-03-19 — Lo que se hizo

### Stripe Integration — end-to-end funcionando
- Shop overlay: 4 tabs (ROPA VIRTUAL / ROPA FÍSICA / + TENKS / MIS ÓRDENES)
- `startStripeCheckout()` — POST `/api/checkout` → redirect a Stripe hosted checkout
- TENKS packs: 3-card grid con "MÁS POPULAR" badge, precios en USD temporalmente
- ROPA FÍSICA: size selector pixel-art, campo CUPÓN con gold border
- MIS ÓRDENES: status pills (PAGADO/ENVIADO/ENTREGADO), fechas DD/MM/YYYY, ☠ empty state
- `checkoutRedirecting`: overlay fullscreen spinner "CONECTANDO CON STRIPE..."
- `shopStatus`: banner animado verde/dorado post-checkout
- Webhook Stripe: `checkout.session.completed` → acredita TENKS, crea orders en DB
- `/api/checkout`: shipping address collection AR, phone collection habilitados
- `/api/player/orders`: GET historial de órdenes del jugador
- `src/lib/resend.ts`: templates de email de confirmación (no-fatal, pendiente RESEND_API_KEY)

### Env vars configuradas en .env.local
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (test), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test), `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

### Supabase schema aplicado
- Tablas: `products`, `players`, `orders`, `player_inventory`, `tenks_transactions`
- Todos los 503s del juego resueltos (ahora responden 401 cuando no hay auth)

### QA end-to-end
- Compra de TENKS pack: checkout Stripe → webhook 200 → TENKS acreditados ✅
- Nota: moneda `usd` temporalmente (Stripe no soporta ARS para cuentas no-AR)

### Planes creados
- `planning/features/mercadopago-integration.md` — integración MP para cobros en ARS (próximo)
- `planning/features/resend-emails.md` — emails de confirmación (pendiente RESEND_API_KEY)

---

## Sesión 2026-03-16 — Lo que se hizo

### Bug fixes
- **Parcel buy sin TENKS**: `handleInteraction()` en WorldScene no tenía rama para compra de parcelas. Agregado. Ahora se deducen correctamente los TENKS.
- **Basement zombie exit freeze**: `BasementScene.update()` llamaba `enterZombieDepths()` sin chequear proximidad. Guardado con `isNearZombieAccess()`.

### Sentry
- Configurado `@sentry/nextjs` con `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`.
- CSP actualizado con `*.ingest.us.sentry.io`. Source maps solo en Vercel.
- **Pendiente**: agregar env vars en el dashboard de Vercel.

### Visual polish megapass (commits `89cf735`, `160b0d4`)

**HUD global:**
- HP bar: borde neon dorado, flash rojo al recibir daño, ancho 140px
- XP bar: barra delgada azul neon debajo del HP, muestra progreso al próximo nivel
- Level badge: pill top-left con `LVL X/Y`
- Weapon cooldown bar: thin bar animada que se llena según cooldown del arma equipada

**WorldScene ambiente:**
- Drop shadows detrás de cada edificio (depth 1.5)
- Entrance floor markers: zona coloreada + chevron permanente frente a cada puerta
- Interaction hint bobbing: el texto de acción sube/baja ±4px en ciclo
- Ambient particles: ~20 puntos neon flotantes en la plaza/zonas bajas

**Interiores:**
- `StoreInterior`: dot pattern dorado, focal glow animado sobre NPC, mostrador procedural, estanterías
- `ArcadeInterior`: red de circuitos neon rosa, 4 máquinas arcade con pantalla CRT, luces intermitentes, carteles de juegos
- `CafeInterior`: paleta cálida `#1a1209`, 7 fuentes de vapor con loop float+fade
- `CasinoInterior`: marquesina parpadeante en bordes, poker glow pulsante, 8 fichas decorativas

**Combat feedback:**
- Muzzle flash: círculo blanco/amarillo ~80ms al disparar
- Hit tint: tint rojo 100ms en AvatarRenderer al recibir daño
- Damage numbers: color por arma (dorado/naranja/azul/verde), tamaño por magnitud, `CRIT!` si daño ≥ 30

**Minimap:**
- Top-right, 160×100px, fondo negro, borde neon azul
- Edificios en colores temáticos, punto dorado = jugador, puntos azules = remotos
- Toggle con `showArenaHud`

**Transiciones:**
- `showSceneTitle()` en `SceneUi.ts`: backdrop + título 18px, fade in/hold/fade out
- Llamado en Store, Arcade, Café, Casino, Basement

**Minijuegos:**
- Countdown 3→2→1→GO! al inicio de ambos minijuegos
- BasketMinigame: score 14px neon, timer bar, scale punch, "NICE SHOT!"
- PenaltyMinigame: pips de progreso, confetti en gol, "GOLAZO!"

**Enemigos:**
- Formas procedurales: rusher=triángulo, shooter=cuadrado+barril, tank=hexágono, boss=estrella 8 puntas
- Idle bobbing desfasado por `phase`
- Proximity agro glow cuando jugador a <220px
- Hurt flash blanco 180ms al recibir daño
- HP bar on-demand: solo visible 2.5s después de recibir golpe

### Tiled migration
- Revisado concepto. Decisión: **diferido**. Requiere diseñar el mapa en Tiled primero. El mundo programático queda como decisión final hasta que existan los assets.

---

---

## 1. Resumen Ejecutivo

Waspi World está significativamente más avanzado de lo que el PRD original v1.2 proyectaba para esta etapa. Lo que el documento original planificaba como un build de 13–14 semanas tiene implementadas la mayoría de sus fases core más un conjunto de features que nunca estuvieron en el PRD original (Casino, Zombies, PvP, La Vecindad, sistema de parcelas, armas premium, COTTENKS como NPC).

**Estado por dimensión:**

| Dimensión | Estado real |
|---|---|
| Game engine / mundo | Funcional — 15 escenas, mundo 3200x1800px dibujado proceduralmente |
| Multiplayer / chat | Funcional — Supabase Realtime, chat BoomBang-style, interpolación |
| Avatar / customización | Funcional — procedural + 4 seeds especiales + sprite overhaul iniciado |
| Inventario / tienda | Funcional — 13 items en catálogo (6 ropa + 7 utility/armas), StoreInterior implementado |
| Economía TENKS | Parcialmente funcional — TENKS operativos pero en localStorage, sin auth real |
| Pagos Stripe | Funcional en test mode — flujo end-to-end verificado (USD temporal, pendiente MP para ARS) |
| Auth Supabase | Funcional — magic link + Google, TENKS y skills server-side |
| Audio | Mínimo — 1 archivo (arcade-theme.mp3), sistema preparado sin SFX |
| Tests | Ninguno implementado |
| Tilemaps Tiled | NO existen — mundo dibujado con Phaser Graphics primitivos |

**Qué falta para lanzamiento:**
1. **Mercado Pago** — cobros en ARS (plan: `mercadopago-integration.md`)
2. Live keys de Stripe en Vercel + webhook endpoint registrado en Stripe Dashboard
3. Resend emails — agregar `RESEND_API_KEY` y verificar dominio
4. Audio SFX por escena
5. Definir si Phaser Graphics es decisión final o si se migra a Tiled

---

## 2. Arquitectura Real (vs CLAUDE.md)

### 2.1 Estructura de carpetas real

```
waspi-world/                        <- raiz del proyecto
  app/                              <- CORRECCION: no esta en src/app/, esta en la RAIZ
    page.tsx                        <- Landing page
    layout.tsx
    globals.css
    favicon.ico
    play/page.tsx                   <- Monta el juego Phaser
    PhaserGame.tsx                  <- Client component (dynamic import)
    components/                     <- Componentes React de UI
    api/                            <- 8 grupos de routes = 12 endpoints
      checkout/route.ts
      webhooks/stripe/route.ts
      player/route.ts
      shop/route.ts
      shop/buy/route.ts
      chat/moderate/route.ts
      chat/report/route.ts
      pvp/match/route.ts
      vecindad/route.ts
      minigames/basket/start/route.ts
      minigames/basket/reward/route.ts
      minigames/penalty/reward/route.ts
  src/
    game/
      scenes/                       <- 15 escenas (no 6 como declaraba CLAUDE.md)
      systems/                      <- 17 sistemas (no los ~8 listados en CLAUDE.md)
      config/                       <- catalog.ts, constants.ts, eventBus.ts, zombies.ts
                                    <- FALTA: world.ts, npcs.ts (declarados pero no existen)
  lib/                              <- stripe.ts, supabase.ts, supabaseAdmin.ts, supabaseServer.ts, y otras
  public/assets/
    audio/                          <- 1 archivo: arcade-theme.mp3
    sprites/
      character/player/             <- Sprites overhaul completo (4 variantes trap_A-D)
      enemies/zombies/              <- 4 arquetipos con animaciones completas
      guns/                         <- 6 armas con idle/shoot strips
      cottenks.png                  <- Sprite del NPC COTTENKS
    seeds/                          <- 4 seeds de avatar: buho, chacha, gengar, piplup
    modes/zombies/                  <- Subdirectorios vacios (audio, fx, map, mystery-box, pickups, weapons, zombies)
  supabase/
    migrations/                     <- 6 migrations (NO documentado en CLAUDE.md)
  planning/                         <- Docs de planning (NO documentado en CLAUDE.md)
    features/stats-panel.md
    completed/
  PRD_WASPI_WORLD.md                <- PRD detallado (estado al 2026-03-14)
  PRD_SPRITE_OVERHAUL.md            <- PRD especifico de sprite overhaul
  PRD.md                            <- PRD original v1.2
  PRD_ESTADO_ACTUAL.md              <- Este archivo
```

### 2.2 Stack real vs declarado

| Componente | Declarado en CLAUDE.md | Real |
|---|---|---|
| Next.js version | 15 | 16.1.6 (package.json) |
| Phaser version | 3.80+ | 3.90.0 |
| React version | no especificado | 19.2.3 |
| Auth | Supabase Auth (magic link + Google + Discord) | NO implementado — UUID localStorage |
| Tilemaps | JSON exports de Tiled | NO existen — Phaser Graphics primitivos |
| Tilesets | Tilesheet PNGs | NO existen |
| Audio | SFX, ambient | Solo arcade-theme.mp3 |
| app/ location | src/app/ | /app/ (raiz del proyecto) |
| world.ts | src/game/config/world.ts | Archivo NO existe |
| npcs.ts | src/game/config/npcs.ts | Archivo NO existe |

---

## 3. Escenas Implementadas (15 total)

| Escena | Archivo | Estado | Notas |
|---|---|---|---|
| BootScene | `BootScene.ts` | Completo | Precarga de assets, splash screen |
| WorldScene | `WorldScene.ts` | Completo | Mundo principal 3200x1800, 8 zonas, combat, PvE |
| StoreInterior | `StoreInterior.ts` | Completo | NPC vendor, shop overlay, multiplayer |
| ArcadeInterior | `ArcadeInterior.ts` | Completo | Acceso a minijuegos, reproduce arcade-theme.mp3 |
| CafeInterior | `CafeInterior.ts` | Completo | Interior social |
| HouseInterior | `HouseInterior.ts` | Completo | Spawn, espejo (avatar creator), armario |
| BasketMinigame | `BasketMinigame.ts` | Completo | Tiro libre, power bar + angle needle, TENKS |
| PenaltyMinigame | `PenaltyMinigame.ts` | Completo | Penales con gameplay implementado |
| PvpArenaScene | `PvpArenaScene.ts` | Completo | Matchmaking Supabase, apuestas TENKS, lives |
| ZombiesScene | `ZombiesScene.ts` | Completo | PvE waves, 4 arquetipos, weapons, mystery box |
| BasementZombiesScene | `BasementZombiesScene.ts` | Completo | "Depths" — variante underground del modo zombies |
| BasementScene | `BasementScene.ts` | Completo | Zona basement/underground del mundo |
| CasinoInterior | `CasinoInterior.ts` | Completo | 4 juegos: slots, roulette, blackjack, Texas Hold'em |
| VecindadScene | `VecindadScene.ts` | Completo | Mapa 2800x1900, 11 parcelas, construccion por stages |
| CreatorScene | `CreatorScene.ts` | Completo | Editor de avatar (bodyColor, hairColor, eyeColor, sliders PP/TT, smoke) |

**Total: 15 escenas.** El PRD original v1.2 declaraba 6 (BootScene + WorldScene + 4 interiores). El PRD actualizado de 2026-03-14 ya reconocia 14 de estas.

### Escenas originalmente fuera del PRD

- `BasementScene` — zona extra no mencionada en ningun PRD previo
- `BasementZombiesScene` — variante underground del modo zombies
- `CasinoInterior` — no existia en PRD original (4 juegos funcionales)
- `ZombiesScene` — modo PvE completo, no existia en PRD original
- `PvpArenaScene` — matchmaking con apuestas, no existia en PRD original
- `VecindadScene` — zona completa de parcelas, introducida como "Fase 7" en sesion 2

---

## 4. Systems Implementados (17 total)

| Sistema | Archivo | Documentado en CLAUDE.md | Descripcion |
|---|---|---|---|
| AvatarRenderer | `AvatarRenderer.ts` | Si | Avatar procedural multicapa + seeds sprites + chroma-key. Sprite-based path agregado (PRD Sprite Overhaul) |
| ChatSystem | `ChatSystem.ts` | Si | Chat BoomBang-style, burbujas, rate limiting, mute |
| TenksSystem | `TenksSystem.ts` | Si | Balance TENKS, localStorage (`waspi_tenks_v1`) |
| InventorySystem | `InventorySystem.ts` | Si | Owned/equipped items, getEquippedColors |
| DialogSystem | `DialogSystem.ts` | Si | Dialogos NPC con typewriter effect |
| AudioSettings | `AudioSettings.ts` | Si | Musica + SFX toggles, localStorage |
| HudSettings | `HudSettings.ts` | Si | Visibilidad de elementos HUD, localStorage |
| ProgressionSystem | `ProgressionSystem.ts` | Si | XP + nivel (1-11+), 11 milestones, localStorage |
| CombatStats | `CombatStats.ts` | Si | K/D ratio, kills/deaths, localStorage |
| InteriorRoom | `InteriorRoom.ts` | Si | Helper para renderizar interiores reutilizables |
| SceneUi | `SceneUi.ts` | Si | createBackButton, transitionToScene, announceScene |
| SceneControls | `SceneControls.ts` | NO | Manejo unificado de controles por escena |
| AnimationSafety | `AnimationSafety.ts` | NO | Guard para evitar errores en animaciones Phaser |
| BranchedDialog | `BranchedDialog.ts` | NO | Sistema de dialogos con branching (arbol de respuestas) |
| ControlSettings | `ControlSettings.ts` | NO | Settings de controles por jugador |
| EnemySprite | `EnemySprite.ts` | NO | State machine para sprites de zombies (del PRD Sprite Overhaul) |
| StatsSystem | `StatsSystem.ts` | NO | Tracking de stats persistido via Supabase (tabla player_stats) |

**5 sistemas no documentados en CLAUDE.md:** `AnimationSafety`, `BranchedDialog`, `ControlSettings`, `EnemySprite`, `StatsSystem`.

---

## 5. Inventario de Assets

### 5.1 Sprites disponibles

**Character / Player** (`public/assets/sprites/character/player/`)
- Sprite overhaul completo en 4 variantes: trap_A, trap_B, trap_C, trap_D
- Cada variante tiene: idle (4 frames), walk_down/up/side (6 frames cada una), shoot (4 frames), hurt (3 frames), death (6 frames)
- Archivos individuales por frame + strips concatenados por animacion
- Archivos base en raiz: `idle_raw_1024.png`, `idle_strip.png`, `idle_frame_01-04.png`
- Seed de referencia: `seed.png`
- Base models: `base_model_A-D.png` + variantes `trap_A-D.png`

**Enemies / Zombies** (`public/assets/sprites/enemies/zombies/`)
- 4 arquetipos: `rusher` (64px), `shooter` (64px), `tank` (96px), `boss` (128px)
- Cada uno con: idle (4f), walk (6f), attack (4-6f), hurt (3f), death (6-8f)
- Frames individuales + strips + raw PNG por animacion
- Archivos de concepto en raiz: `zombie_option_A-D.png`

**Guns** (`public/assets/sprites/guns/`)
- 6 armas: 01_glock, 02_uzi, 03_shotgun, 04_blaster, 05_deagle, 06_cannon
- Cada una: idle_strip + idle_frames (4f), shoot_strip + shoot_frames (4f), seed.png
- FALTA: reload_strip para todas (definido en PRD Sprite Overhaul, no generado)
- FALTA: arm_overlay/ directorio (definido en PRD Sprite Overhaul, no creado)
- Activas en gameplay: 01_glock (pistol) + 03_shotgun. Las otras 4 tienen assets pero sin WeaponMode

**NPC** (`public/assets/sprites/`)
- `cottenks.png` — NPC COTTENKS con sprite propio

**Seeds de avatar** (`public/assets/seeds/`)
- `buho.png`, `chacha.png`, `gengar.png`, `piplup.png`

### 5.2 Audio

| Archivo | Ubicacion | Estado |
|---|---|---|
| `arcade-theme.mp3` | `public/assets/audio/` | Activo — se reproduce en ArcadeInterior |
| SFX de disparos | — | FALTA |
| SFX de pasos | — | FALTA |
| SFX de hits / dano | — | FALTA |
| SFX muerte de enemigo | — | FALTA |
| Musica WorldScene (ambient) | — | FALTA |
| Musica StoreInterior | — | FALTA |
| Musica CasinoInterior | — | FALTA |
| Musica ZombiesScene | — | FALTA |
| Audio para zombies | `modes/zombies/audio/` | Directorio vacio |
| FX para zombies | `modes/zombies/fx/` | Directorio vacio |

### 5.3 Assets declarados en CLAUDE.md que NO existen

- `public/assets/tilemaps/` — directorio no existe en el proyecto
- `public/assets/tilesets/` — directorio no existe en el proyecto
- `public/assets/ui/` — directorio no existe (HUD renderizado con Phaser primitivos y fuentes pixel art)

---

## 6. API Routes (12 endpoints funcionales)

| Endpoint | Metodo(s) | Descripcion |
|---|---|---|
| `/api/player` | GET, POST, PATCH | CRUD player state, TENKS |
| `/api/shop` | GET | Catalogo de productos |
| `/api/shop/buy` | POST | Compra con TENKS (virtual) |
| `/api/checkout` | POST | Stripe Checkout Session (compra ARS) |
| `/api/webhooks/stripe` | POST | Webhook Stripe — otorga item en inventario post-pago |
| `/api/chat/moderate` | POST | Moderacion de mensajes de chat |
| `/api/chat/report` | POST | Reporte de jugador |
| `/api/pvp/match` | GET, POST | Matchmaking PvP server-side |
| `/api/vecindad` | GET, POST, PATCH | CRUD parcelas de La Vecindad |
| `/api/minigames/basket/start` | POST | Inicia sesion de minijuego basquet |
| `/api/minigames/basket/reward` | POST | Calcula y otorga recompensa basquet |
| `/api/minigames/penalty/reward` | POST | Calcula y otorga recompensa penales |

**CLAUDE.md declaraba solo 5 routes**: checkout, webhooks/stripe, player, shop, chat/moderate. Existen **12 endpoints reales**.

---

## 7. Base de Datos (Supabase Migrations)

6 migrations en `supabase/migrations/` — carpeta no documentada en CLAUDE.md ni en ningun PRD previo:

| Archivo | Descripcion |
|---|---|
| `20260313_prd_schema.sql` | Schema inicial — tablas base del PRD (players, products, player_inventory, orders, etc.) |
| `202603130101_vecindad_parcels.sql` | Tabla de parcelas de La Vecindad |
| `202603130102_game_sessions_reward_code_unique.sql` | Constraint unique en game_sessions.reward_code |
| `202603130103_vecindad_stage_zero.sql` | Stage 0 de construccion para Vecindad |
| `20260314_player_stats.sql` | Tabla `player_stats` (zombie_kills, pvp_kills, deaths, tenks_earned, etc.) |
| `20260314_vecindad_realtime.sql` | Supabase Realtime habilitado para parcelas en tiempo real |

---

## 8. Catalogo de Productos

**13 items en `src/game/config/catalog.ts`:**

| ID | Nombre | Tipo | Precio TENKS | Precio ARS |
|---|---|---|---|---|
| UTIL-GUN-01 | PISTOLA 9MM | utility | 5.000 | — |
| UTIL-GUN-SHOT-01 | ESCOPETA 12G | utility | 11.000 | — |
| UTIL-GUN-SMG-01 | BUZZ SMG | utility | 14.000 | — |
| UTIL-GUN-RIFL-01 | RANGER RIFLE | utility | 21.000 | — |
| UTIL-GUN-GOLD-01 | RAY-X (limited) | utility | 42.000 | — |
| UTIL-BALL-01 | FOOTBALL | utility | 5.000 | — |
| UTIL-DEED-01 | ESCRITURA Vecindad | utility | 0 (gratis con parcela) | — |
| TEE-BLK-01 | Remera Waspi Negra | tee | 800 | $15.000 |
| TEE-WHT-01 | Remera Waspi Blanca | tee | 800 | $15.000 |
| TEE-RED-01 | Remera Limited Roja | tee | 1.200 | $22.000 |
| CRG-BLK-01 | Cargo Negro | cargo | 1.400 | $35.000 |
| CRG-OLV-01 | Cargo Olive | cargo | 1.400 | $35.000 |
| HOD-GRY-01 | Hoodie Gris | hoodie | 1.600 | $45.000 |

El PRD original declaraba 6 SKUs de ropa. El catalogo real tiene 6 SKUs de ropa + 7 items utility/armas = **13 items totales**.

---

## 9. Gaps Criticos Pre-Lanzamiento

### CRITICO (blocker de lanzamiento)

**1. Auth Supabase — NO implementado**
- Estado actual: player_id es un UUID generado localmente y guardado en localStorage.
- Impacto: TENKS y progresion no persisten entre sesiones ni entre dispositivos. Imposible vincular compras Stripe a una cuenta real. La tabla `players` en DB no tiene usuarios reales.
- Solucion requerida: Implementar Supabase Auth (magic link + Google). Migrar player_id de localStorage a auth.users.id. Proteger todas las API routes con token JWT de Supabase.

**2. TENKS server-side — NO validado**
- Estado actual: TENKS se suman/restan en localStorage via TenksSystem.ts. La API `/api/player` existe pero no es la fuente de verdad.
- Impacto: cualquier jugador puede modificar su balance de TENKS desde DevTools. Anti-cheat imposible. Viola el principio "Client untrusted" declarado en el PRD.
- Solucion requerida: despues de implementar Auth, mover el balance de TENKS a la columna `players.tenks` en Supabase PostgreSQL. Todas las operaciones de TENKS deben ir por `/api/player` con validacion server-side.

**3. Stripe end-to-end sin testear**
- Estado actual: la integracion esta wired (`/api/checkout`, `/api/webhooks/stripe`) y los `stripePriceEnv` estan configurados en el catalogo, pero el flujo completo checkout → webhook → grant de inventario no ha sido ejecutado en produccion.
- Impacto: el core de e-commerce (razon de existir del proyecto) puede fallar silenciosamente.
- Solucion requerida: configurar variables de entorno Stripe reales. Ejecutar una compra de prueba end-to-end. Validar que el webhook otorga el item y que el email de Resend se envia.

### MEDIO (requerido para MVP completo)

**4. Audio — sistema preparado, sin archivos**
- AudioSettings.ts completo con toggles. AudioContext inicializado en WorldScene. Solo existe `arcade-theme.mp3`.
- Faltan: SFX de disparos, pasos, hits, muerte de enemigos, compras, interacciones con NPC. Musica ambient por escena (WorldScene, StoreInterior, CasinoInterior, ZombiesScene).
- Los subdirectorios `modes/zombies/audio/` y `modes/zombies/fx/` existen pero estan vacios.

**5. Tests — cero coverage**
- No hay tests unitarios ni de integracion en el proyecto.
- Especialmente critico para: TenksSystem, InventorySystem, ProgressionSystem, API routes de checkout y webhooks.

**6. Tilemaps Tiled — decision pendiente**
- El mundo se dibuja con Phaser Graphics primitivos (rectangulos, arcos, lineas). No hay JSON exports de Tiled ni tilesheet PNGs.
- El PRD actualizado de 2026-03-14 ya reconoce esto como una limitacion conocida.
- Opcion A — "Phaser Graphics es decision final": actualizar toda la documentacion y eliminar referencias a tilemaps Tiled. Colisiones siguen siendo rectangulos aproximados, sin pathfinding.
- Opcion B — "Migrar a Tiled": impacta visual, performance (culling real via tilemap), y colisiones (pathfinding posible con Navmesh). Estimacion: 1–2 semanas de trabajo.

**7. Armas adicionales — assets sin gameplay**
- uzi, blaster, deagle, cannon tienen sprites completos pero sin WeaponMode en WorldScene ni logica de gameplay.
- Los items del catalogo (UTIL-GUN-SMG-01, UTIL-GUN-RIFL-01, UTIL-GUN-GOLD-01) son comprables con TENKS pero sin diferencia funcional al equiparlos.

### BAJO (post-MVP)

**8. Actualizar CLAUDE.md** con estructura real del proyecto: `app/` en raiz (no en `src/`), 15 escenas, 17 sistemas, 12 API routes, sin `world.ts` ni `npcs.ts`.

**9. Leaderboard global** — ProgressionSystem guarda XP/nivel en localStorage. StatsSystem guarda en Supabase `player_stats` pero no hay endpoint ni UI de ranking global.

**10. Chat moderation** — `/api/chat/moderate` y `/api/chat/report` existen como endpoints pero la logica de moderacion (filtro de palabras configurable, ban automatico) no esta implementada.

**11. Resend email** — Resend esta en las dependencias (`resend: ^6.9.3`) pero el flujo post-compra (confirmacion de pedido, email de bienvenida) no esta implementado.

**12. Mercado Pago** — mencionado en el PRD original como prioritario para el mercado argentino. No hay ninguna referencia en el codigo.

**13. Reload animation + arm overlay** — definidos en `PRD_SPRITE_OVERHAUL.md` como Phase 3 pero los archivos (`reload_strip.png` para cada arma, directorio `arm_overlay/`) no existen aun.

**14. Daily login streak + TENKS diarios** — mecanica del PRD original (100 TENKS/dia, +50 por dia consecutivo) sin implementar.

---

## 10. PRD Original vs Estado Real (Tabla Comparativa)

| Feature | PRD Original v1.2 (Marzo 2026) | Estado Real (2026-03-15) |
|---|---|---|
| Escenas totales | 6 (Boot, World, Store, Arcade, Cafe, House) | 15 escenas implementadas |
| Dimensiones del mundo | 3200x2400px (CLAUDE.md) / 3200x1800px (PRD) | 3200x1800px — dibujado con Phaser Graphics |
| Tilemaps | JSON exports de Tiled | NO existen. Mundo 100% programatico |
| Auth | Supabase Auth (magic link + Google + Discord) | NO implementado |
| TENKS persistence | Supabase PostgreSQL (players.tenks) | localStorage (TenksSystem.ts) |
| Minijuegos MVP | Solo penales | Penales + basquet + Casino (4 juegos) + modo Zombies |
| Catalogo de items | 6 SKUs de ropa | 13 items (6 ropa + 7 utility/armas) |
| API routes | 5 endpoints | 12 endpoints funcionales |
| Sistemas del juego | ~8 listados en CLAUDE.md | 17 implementados |
| Enemigos | No en PRD original | 4 arquetipos con sprites + animaciones completas |
| PvP | No en PRD original | PvpArenaScene con matchmaking server-side y apuestas TENKS |
| La Vecindad | No en PRD original | 11 parcelas, 4 stages de construccion, Realtime sincronizado |
| Casino | No en PRD original | 4 juegos funcionales (slots, roulette, blackjack, holdem) |
| NPC COTTENKS | No en PRD original | Sprite propio implementado |
| Sprites de personaje | Procedural chibi (Binding of Isaac style) | Procedural + sprite overhaul en 4 variantes (trap_A–D) |
| Sprites de enemigos | No en PRD original | 4 arquetipos con animaciones completas (idle/walk/attack/hurt/death) |
| Audio | SFX + ambient (planificado) | 1 archivo (arcade-theme.mp3) |
| Tests | No mencionados | Ninguno |
| DB migrations | No documentadas | 6 migrations en supabase/migrations/ |
| `world.ts` (config) | Declarado en CLAUDE.md | Archivo no existe |
| `npcs.ts` (config) | Declarado en CLAUDE.md | Archivo no existe |
| `zombies.ts` (config) | No declarado | Existe en src/game/config/ |
| app/ location | src/app/ (CLAUDE.md) | /app/ en raiz del proyecto |
| Next.js version | 15 (CLAUDE.md) | 16.1.6 |
| Phaser version | 3.80+ | 3.90.0 |
| StatsSystem + player_stats | No en PRD original | Implementado, tabla en Supabase |
| PRDs en proyecto | 0 (PRD era PDF externo) | 3 archivos MD en raiz del proyecto |

---

## 11. Roadmap — Proximas Fases

### Fase A: Fundamentos de Produccion (blocker — sin esto no se puede lanzar)
Estimacion: 1–2 semanas

1. **Auth Supabase** — magic link + Google OAuth. Migrar player_id localStorage a auth.users.id. Proteger endpoints con JWT. Vincular todas las tablas de DB al user real.
2. **TENKS server-side** — balance en columna `players.tenks` en DB. Todas las operaciones via `/api/player`. TenksSystem pasa a ser solo un cache local que sincroniza con el server. Eliminar posibilidad de modificacion client-side.
3. **Stripe smoke test** — ejecutar compra end-to-end en produccion. Validar webhook + inventory grant + email Resend. Configurar todos los `STRIPE_PRICE_*` env vars en Vercel.
4. **Variables de entorno produccion** — audit completo de env vars necesarias: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_* (6 vars), RESEND_API_KEY.

### Fase B: Audio y Polish (MVP completo)
Estimacion: 1 semana

5. **SFX core** — disparos (por tipo de arma), hits recibidos/dados, pasos, muerte de enemigo, compra exitosa, interaccion NPC, nivel up.
6. **Musica por escena** — WorldScene ambient (lo-fi hip hop / chill), ZombiesScene (tense loop), CasinoInterior (jazz/lounge), StoreInterior (chill streetwear vibes).
7. **Completar armas activas** — implementar WeaponMode para uzi, blaster, deagle, cannon. Conectar items de catalogo con logica real de gameplay.

### Fase C: Sprite Overhaul Final (segun PRD_SPRITE_OVERHAUL.md)
Estimacion: 2–3 semanas (segun disponibilidad de assets generados con AI pipeline)

8. **Phase 3 pendiente** — generar reload_strip.png para las 6 armas. Crear directorio arm_overlay/ con hold_idle y hold_shoot strips.
9. **Wiring completo** — verificar que las 4 variantes de player (trap_A–D) se usan correctamente segun AvatarKind. Validar que el fallback procedural sigue funcionando.
10. **NEAREST filter** — asegurar que todos los nuevos spritesheets usan Phaser.Textures.FilterMode.NEAREST para mantener el look pixel art.

### Fase D: Features Post-MVP
Estimacion: 3–4 semanas

11. **Leaderboard global** — endpoint GET /api/leaderboard + UI in-game. Fuente de datos: tabla `player_stats` ya existente en DB.
12. **Chat moderation real** — filtro de palabras configurable server-side. Ban temporal automatico por acumulacion de reportes. Logs en DB (48hs retention via pg_cron).
13. **Mercado Pago** — integracion para el mercado argentino. Alta prioridad para conversion en el target local.
14. **Daily login streak + TENKS diarios** — 100 TENKS/dia + 50 por dia consecutivo. Requiere Auth implementado primero.
15. **Decision tilemaps** — confirmar Phaser Graphics como final O migrar a Tiled. Si se migra: impacta colisiones, pathfinding enemies, performance del rendering.

### Fase E: Expansion de Contenido
Estimacion: continuo

16. **Nuevas zonas** — expansion del mapa mas alla de las 8 zonas actuales. El PRD menciona "EXPANSION" al sur de la Plaza como zona post-MVP.
17. **Vendedor IA conversacional** — Claude API como reemplazo del dialog scriptado en StoreInterior. Recomendaciones segun historial de compras.
18. **Eventos temporales** — drops limitados, pop-up stores, partidos PvP rankeados.
19. **Mobile** — validar calidad de touch controls en dispositivos reales iOS/Android. Chat log minimizado por defecto en mobile. Shop panel full-screen en mobile.
20. **Cupones Stripe** — API preparada en el PRD, no implementada en UI. Conectar con resultados de minijuegos (penales/basquet 3+ goles = cupon 10%).

---

## 12. Archivos Clave de Referencia

| Documento | Path | Descripcion |
|---|---|---|
| PRD actualizado | `PRD_WASPI_WORLD.md` | Estado detallado al 2026-03-14 — el mas completo antes de este archivo |
| PRD original | `PRD.md` | Version 1.2, Marzo 2026 — vision inicial del producto |
| PRD Sprite Overhaul | `PRD_SPRITE_OVERHAUL.md` | Spec tecnica completa para sprites de jugador, zombies y armas (3 fases) |
| Stats Panel (WIP) | `planning/features/stats-panel.md` | Feature en progreso, no lanzado |
| Schema SQL | `supabase/migrations/20260313_prd_schema.sql` | Schema base de la DB |
| Player Stats SQL | `supabase/migrations/20260314_player_stats.sql` | Tabla player_stats |
| Catalogo | `src/game/config/catalog.ts` | 13 items con precios TENKS y ARS + helpers getItem/getPhysicalCatalog |
| EventBus | `src/game/config/eventBus.ts` | 30+ eventos tipados Phaser-React bridge |
| CLAUDE.md | `CLAUDE.md` | Instrucciones del proyecto — requiere actualizacion para reflejar estado real |
