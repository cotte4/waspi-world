# WASPI WORLD — PRD Estado Actual
**Fecha:** 2026-03-27
**Nota:** Incluye jukebox del CafÃ© (fixes), limpieza de ramas GitHub, y rol de los cuatro documentos PRD.
**Archivos fuente:** los cuatro `PRD*.md` en la raÃ­z (ver Â§0), cÃ³digo en `src/` y `app/`.

---

## 0. Por quÃ© hay cuatro archivos PRD

No son cuatro â€œversionesâ€ del mismo documento: cada uno cumple un **rol distinto**. AsÃ­ evitÃ¡s mezclar visiÃ³n comercial, checklist de producto, spec de arte y auditorÃ­a contra el cÃ³digo.

| Archivo | Rol | CuÃ¡ndo usarlo |
|--------|-----|----------------|
| **`PRD.md`** | PRD **original** (v1.2 Memas): visiÃ³n, modelo de negocio, timeline clÃ¡sico, criterios de MVP. | Referencia histÃ³rica y para explicar el producto a terceros. **No refleja** todo lo implementado despuÃ©s. |
| **`PRD_WASPI_WORLD.md`** | PRD **operativo por fases**: checklist de features (world, social, avatar, economÃ­aâ€¦) alineado al cÃ³digo reciente. | Planificar releases y marcar fases COMPLETAS / pendientes. |
| **`PRD_SPRITE_OVERHAUL.md`** | **EspecificaciÃ³n vertical** solo de sprites (jugador, zombies, armas, overlays). | GeneraciÃ³n de assets, QA visual, fases 1â€“3 de arte. |
| **`PRD_ESTADO_ACTUAL.md`** (*este archivo*) | **Inventario + brecha vs cÃ³digo**: escenas, APIs, migraciones, gaps, notas de sesiÃ³n. Fuente de verdad para â€œquÃ© hay hoy en el repoâ€. | Onboarding, priorizar deuda tÃ©cnica, actualizar post-sprint. |

**RecomendaciÃ³n:** mantener **`PRD_ESTADO_ACTUAL.md`** al dÃ­a tras cambios grandes; actualizar **`PRD_WASPI_WORLD.md`** cuando cerrÃ¡s fases de producto; tocar **`PRD_SPRITE_OVERHAUL.md`** solo cuando cambia el pipeline de arte; **`PRD.md`** casi estÃ¡tico salvo pivot de negocio.

---

## Sesión 2026-03-27 — Skill system overhaul + milestone cosmetics

### Lo que se hizo

**Character Creator**
- Zoom controls + facing controls (◁ − + ▷) en la columna central del CreatorScene
- `patchConfig()` en AvatarRenderer: actualizaciones quirúrgicas sin destroy/rebuild del avatar
- `syncContainerChildren()`: Z-order fijo para capas del avatar procedural
- Hair style labels completos, descriptores en seed grid, swatches con custom color picker
- `randomCfg()` excluye cosméticos bloqueados (bucket, headband, shades, visor, sparkle, stars)

**Sistema de Skills**
- `QualityBanner.ts`: banner animado flotante por acción (glow ring, flash en legendary)
- Calidad visual en todas las escenas de skill (Bosque, Cave, Vecindad pesca/cosecha, Gym)
- Spec XP bonuses conectados: `mining_extractor` +5, `fishing_baitmaster` +5, `gardening_botanist` +5
- Streaks de gym: multiplicador 1x→1.3x→1.6x→2x en combos consecutivos
- Daily first-action 2x XP: validado server-side vía `updated_at`; toast al cliente
- Sinergias XP en todas las escenas: `huerto_propio` +30%, `gourmet_del_mar` +25%
- **Level 6 LEGEND** a 3500 XP — cosmético puro, título “LEGEND ✦”

**Milestone Cosmetic Delivery**
- `milestoneCosmetics.ts`: 6 cosméticos mapeados a milestones
- `GET /api/cosmetics/unlocked`: deriva unlocks de `player_skill_milestones`
- `SkillSystem`: detecta milestone cosmético en `addXp()`, emite `COSMETIC_UNLOCKED`
- `CosmeticRevealOverlay.tsx`: modal fullscreen animado al desbloquear
- `CharacterCreatorOverlay`: opciones 🔒 con tooltip; unlock live sin reload
- `BootScene`: un solo `initSkillSystem()` paralelo (skills + specs + cosmetics + items)
- SQL: índice compuesto `player_skill_milestones(user_id, milestone_id)` — **aplicar en Supabase**

### Próximos pasos
- **Skill leaderboard**: `GET /api/skills/leaderboard?skill=X` + panel UI
- **Milestone stat rewards**: mining_50 (+3 XP/golpe), fishing_50 (+10% suerte) — aplicar en escenas
- **Cooking**: solo 2 fuentes de XP; agregar minijuego o segunda fuente
- **NPC ambient animations**: bounce idle (Doña Rosa, Don Carlos, Miguel, Luisa)
- **Colisiones en parcelas** construidas en Vecindad
- **TURN server** propio para voz WebRTC

### Known issues
- React “Cannot update during render” en apertura del Casino
- `/api/vecindad` y `/api/events` con 500s pendientes de investigación

---

## Sesión 2026-03-22 — Plan de refactor estructural

### Objetivo
- Reducir deuda tÃ©cnica en los archivos mÃ¡s grandes sin cambiar la arquitectura base del proyecto.
- Convertir los archivos gigantes en orquestadores y mover la lÃ³gica detallada a mÃ³dulos con responsabilidad clara.
- Mejorar navegaciÃ³n, review diffs, onboarding y seguridad al tocar gameplay/UI.

### DecisiÃ³n de arquitectura
- **`app/play/GamePage.tsx`** pasa a tratarse como un **compositor de hooks y overlays**, no como dueÃ±o de todos los dominios de UI.
- **`src/game/scenes/WorldScene.ts`** se mantiene como **escena principal Ãºnica**, pero con extracciÃ³n progresiva a mÃ³dulos en `src/game/scenes/world/`.
- **`src/game/scenes/ZombiesScene.ts`** se mantiene como **base scene reutilizable** para `BasementZombiesScene`, pero con extracciÃ³n a mÃ³dulos en `src/game/scenes/zombies/`.

### Orden recomendado de ejecuciÃ³n
1. **`GamePage.tsx`** â€” mayor mejora de mantenibilidad con menor riesgo de gameplay.
2. **`WorldScene.ts`** â€” extracciÃ³n por subsistemas, sin romper ownership de la escena.
3. **`ZombiesScene.ts`** â€” limpieza por dominios ya relativamente estables.

### Progreso de sesión
- Estado actual: `GamePage` ya quedo en etapa de cierre y validacion final.
- Integración real: los modulos `world/*` y `zombies/*` ya estan entrando en fase de cierre; `WorldScene` y `ZombiesScene` solo conservan bloques inline remanentes que se estan integrando o removiendo.
- Fase actual: integracion final y estabilizacion, no descubrimiento.
- Pendiente: cerrar wiring fino y remover los bloques inline remanentes de `GamePage`, `WorldScene` y `ZombiesScene`, y correr QA de regresion.
#### 1. `app/play/GamePage.tsx`

**Problema actual**
- Mezcla auth, shop/checkout, chat, joystick mobile, settings, event bus, player sync, overlays y render JSX gigante.
- Alto costo cognitivo para cualquier cambio pequeÃ±o.

**Objetivo**
- Dejar `PlayPage` como capa de composiciÃ³n.
- Mover estado y side effects a hooks por dominio.

**Extracciones propuestas**
- `app/play/hooks/usePlayPageAuth.ts`
- `app/play/hooks/usePlayPageShop.ts`
- `app/play/hooks/usePlayPageChat.ts`
- `app/play/hooks/usePlayPageSettings.ts`
- `app/play/hooks/usePlayPageJoystick.ts`
- `app/play/hooks/usePlayPageSceneEvents.ts`
- `app/play/hooks/usePlayPagePlayerState.ts`
- `app/play/lib/playPageConstants.ts`
- `app/play/lib/playPageStorage.ts`
- `app/play/types.ts`

**Secuencia de implementaciÃ³n**
1. Mover types, scene sets, storage keys y helpers de localStorage fuera del archivo.
2. Extraer `usePlayPageSceneEvents` para aislar subscriptions a `eventBus`.
3. Extraer `usePlayPageAuth`.
4. Extraer `usePlayPageShop`.
5. Extraer `usePlayPageChat`.
6. ReciÃ©n despuÃ©s evaluar si conviene dividir el JSX en subcomponentes.

#### 2. `src/game/scenes/WorldScene.ts`

**Problema actual**
- La escena es el centro del juego y ademÃ¡s contiene detalles de voice, HUD, training, armas, render de mapa, NPCs, realtime y minimap.
- El tamaÃ±o por sÃ­ solo no es el problema; la mezcla de responsabilidades sÃ­.

**Objetivo**
- Mantener una sola escena principal.
- Extraer helpers/mÃ³dulos que operen sobre `scene: WorldScene`.

**Extracciones propuestas**
- `src/game/scenes/world/boot.ts`
- `src/game/scenes/world/voice.ts`
- `src/game/scenes/world/weapons.ts`
- `src/game/scenes/world/training.ts`
- `src/game/scenes/world/realtime.ts`
- `src/game/scenes/world/renderWorld.ts`
- `src/game/scenes/world/npcs.ts`
- `src/game/scenes/world/vecindad.ts`
- `src/game/scenes/world/minimap.ts`

**Secuencia de implementaciÃ³n**
1. Extraer constantes/helper puros usados por voice/weapons/training.
2. Extraer `renderWorld.ts` (`drawBackground`, `drawPlaza`, `drawBuildings`, `drawStreet`, `drawLampPosts`, `drawVignette`).
3. Extraer `voice.ts`.
4. Extraer `weapons.ts`.
5. Extraer `training.ts`.
6. Extraer `realtime.ts` y `minimap.ts`.

**Regla**
- Evitar estado oculto en mÃ³dulos. La fuente de verdad sigue siendo `WorldScene`.

#### 3. `src/game/scenes/ZombiesScene.ts`

**Problema actual**
- Mezcla arena builder, doors, HUD, rounds, zombies, pickups, coop/shared snapshots, remotos y chat bridge.
- AdemÃ¡s funciona como base para `BasementZombiesScene`, por lo que cualquier refactor debe preservar esa relaciÃ³n.

**Objetivo**
- Mantener `ZombiesScene` como base scene.
- Extraer dominios grandes sin romper la extensiÃ³n de `BasementZombiesScene`.

**Extracciones propuestas**
- `src/game/scenes/zombies/arena.ts`
- `src/game/scenes/zombies/hud.ts`
- `src/game/scenes/zombies/spawning.ts`
- `src/game/scenes/zombies/combat.ts`
- `src/game/scenes/zombies/pickups.ts`
- `src/game/scenes/zombies/sharedRun.ts`
- `src/game/scenes/zombies/realtime.ts`
- `src/game/scenes/zombies/player.ts`

**Secuencia de implementaciÃ³n**
1. Extraer `arena.ts`.
2. Extraer `hud.ts`.
3. Extraer `sharedRun.ts`.
4. Extraer `combat.ts`.
5. Extraer `pickups.ts` y `realtime.ts`.

### Criterios de calidad del refactor
- No dividir por lÃ­neas; dividir por responsabilidad.
- No crear archivos minÃºsculos que agreguen fricciÃ³n.
- Cada extracciÃ³n debe poder probarse visualmente antes de pasar a la siguiente.
- No cambiar comportamiento salvo que aparezca un bug incidental.
- El nombre del archivo debe anticipar correctamente quÃ© contiene.

### Riesgos a evitar
- Sobre-fragmentaciÃ³n de React/Phaser en demasiados archivos.
- Mover lÃ³gica stateful a helpers sin una interfaz clara.
- Romper el bridge React-Phaser (`eventBus`) por reordenar efectos sin auditar dependencias.
- Romper `BasementZombiesScene` al extraer lÃ³gica que hoy asume campos `protected`/privados vÃ­a casting.

### Resultado esperado
- Menor tiempo para ubicar cÃ³digo por feature.
- Menor riesgo al tocar shop/auth/chat/UI.
- Menor riesgo al iterar World/Zombies sin abrir archivos de miles de lÃ­neas para cambios pequeÃ±os.

---

## SesiÃ³n 2026-03-21 â€” Lo que se hizo

### Bug fixes
- **ZombiesScene boundary exploits (2 gaps)**: jugador podÃ­a bajar del START ROOM bajo y=940 y entrar a BURNT STREET sin abrir la puerta; tambiÃ©n podÃ­a salir por la derecha del WORKSHOP (x>1650) evitando la puerta de STREET. Ambos cerrados con colliders adicionales.
- **GYM building solapaba TRAINING zone**: GYM estaba en (1480,960) dentro de la zona de dummies de entrenamiento. Movido a (1550,1450), debajo de TRAINING y fuera de cualquier otra zona.
- **Arcade cross-trigger fix + casino exploit** ya estaban en commits anteriores.

### Features
- **Gym building visual** (WorldScene): fachada de hormigÃ³n, cornisa roja LED, cartel animado `â˜… GYM â˜…`, ventanas con mancuernas/barras, puerta de neÃ³n rojo, con marker de entrada en `drawBuildingEntranceMarkers()`.
- **Fishing dock sign** (VecindadScene): cartel montado en el pier post con `ðŸŽ£ DOCK [E]`, panel oscuro + borde teal.
- **VecindadScene â€” mejoras de calles y NPCs**:
  - 2 nuevas calles: alley horizontal entre rows 2â†’3 (y=1268) y bottom lane entre rows 3â†’4 (y=1584), ambas con centerline dashes.
  - Crosswalk stripes en ambas intersecciones de calles verticales Ã— calle principal.
  - 8 grietas de asfalto + 5 charcos con brillo en calles.
  - Graffiti en paredes de parcelas: `WASPI`, `EL BARRIO`, `â˜… CALLE â˜…`, `NO PISAR`.
  - 28 farolas con poste + brazo + bombilla + doble glow (antes eran 4 puntos).
  - 6 bancos extra, 6 tachos de basura con detalle, 6 maceteros con arbustos pixel.
  - 4 NPCs ambientales: **DOÃ‘A ROSA** (calle principal), **DON CARLOS** (calle principal), **MIGUEL** (calle vertical izquierda), **LUISA** (segundo alley). Cada uno con cuerpo pixel Ãºnico, nombre, hint `[E]` y dialog panel on press.

### PrÃ³ximos pasos sugeridos
- Probar en browser que los NPCs ambientales no colisionan con weed NPCs (FLACO estÃ¡ en x=490 y DOÃ‘A ROSA en x=560 â€” margen de 70px, OK)
- `PRD_VOICE_WEBRTC_ESTADO.md` â€” doc de auditorÃ­a sobre el subsistema de voz WebRTC ya committeado; revisar si vale implementar servidor TURN propio
- Animaciones idle para NPCs ambientales (bounce sutil)
- Colisiones en parcelas para que el jugador no atraviese las casas construidas
- Investigar los 500 en `/api/vecindad` y `/api/events` (pendiente de sesiÃ³n anterior)
- React "Cannot update during render" en apertura del Casino (pendiente)

---

## SesiÃ³n 2026-03-20 â€” Lo que se hizo

### Jukebox del CafÃ© â€” UX y audio
- Overlay React (`JukeboxOverlay`): bÃºsqueda YouTube vÃ­a `/api/jukebox/search`; al abrir el overlay Phaser **desactiva el teclado** en `CafeInterior` para que el input de bÃºsqueda reciba teclas (antes solo funcionaba pegar).
- **ReproducciÃ³n:** todos los clientes en el cafÃ© reproducen el track vÃ­a iframe YouTube; solo el â€œhostâ€ de presencia reporta `ENDED` para avanzar la cola una vez (evita dobles skips).
- Intentos de **unmute** / volumen al reproducir (polÃ­ticas del navegador pueden seguir exigiendo interacciÃ³n previa).
- Fix: cierre del modal por backdrop llamaba `handleClose` recursivo â†’ corregido a `onClose()`.

### GitHub â€” ramas
- Eliminadas ramas remotas obsoletas o ya absorbidas por `main`: entre otras, `docs/prd-update`, `basement-map`, `creator-redesign`, `hud-store-redesign`, `characters`, `zombies`.
- **Flujo sugerido:** `main` como tronco; features en ramas cortas + PR; borrar rama al mergear.

### DocumentaciÃ³n
- Esta secciÃ³n Â§0 â€” explicaciÃ³n de los 4 PRDs; contadores de API/migraciones alineados al repo.

---

## SesiÃ³n 2026-03-19 â€” Lo que se hizo

### Stripe Integration â€” end-to-end funcionando
- Shop overlay: 4 tabs (ROPA VIRTUAL / ROPA FÃSICA / + TENKS / MIS Ã“RDENES)
- `startStripeCheckout()` â€” POST `/api/checkout` â†’ redirect a Stripe hosted checkout
- TENKS packs: 3-card grid con "MÃS POPULAR" badge, precios en USD temporalmente
- ROPA FÃSICA: size selector pixel-art, campo CUPÃ“N con gold border
- MIS Ã“RDENES: status pills (PAGADO/ENVIADO/ENTREGADO), fechas DD/MM/YYYY, â˜  empty state
- `checkoutRedirecting`: overlay fullscreen spinner "CONECTANDO CON STRIPE..."
- `shopStatus`: banner animado verde/dorado post-checkout
- Webhook Stripe: `checkout.session.completed` â†’ acredita TENKS, crea orders en DB
- `/api/checkout`: shipping address collection AR, phone collection habilitados
- `/api/player/orders`: GET historial de Ã³rdenes del jugador
- `src/lib/resend.ts`: templates de email de confirmaciÃ³n (no-fatal, pendiente RESEND_API_KEY)

### Env vars configuradas en .env.local
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (test), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test), `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

### Supabase schema aplicado
- Tablas: `products`, `players`, `orders`, `player_inventory`, `tenks_transactions`
- Todos los 503s del juego resueltos (ahora responden 401 cuando no hay auth)

### QA end-to-end
- Compra de TENKS pack: checkout Stripe â†’ webhook 200 â†’ TENKS acreditados âœ…
- Nota: moneda `usd` temporalmente (Stripe no soporta ARS para cuentas no-AR)

### Planes creados
- `planning/features/mercadopago-integration.md` â€” integraciÃ³n MP para cobros en ARS (prÃ³ximo)
- `planning/features/resend-emails.md` â€” emails de confirmaciÃ³n (pendiente RESEND_API_KEY)

---

## SesiÃ³n 2026-03-16 â€” Lo que se hizo

### Bug fixes
- **Parcel buy sin TENKS**: `handleInteraction()` en WorldScene no tenÃ­a rama para compra de parcelas. Agregado. Ahora se deducen correctamente los TENKS.
- **Basement zombie exit freeze**: `BasementScene.update()` llamaba `enterZombieDepths()` sin chequear proximidad. Guardado con `isNearZombieAccess()`.

### Sentry
- Configurado `@sentry/nextjs` con `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`.
- CSP actualizado con `*.ingest.us.sentry.io`. Source maps solo en Vercel.
- **Pendiente**: agregar env vars en el dashboard de Vercel.

### Visual polish megapass (commits `89cf735`, `160b0d4`)

**HUD global:**
- HP bar: borde neon dorado, flash rojo al recibir daÃ±o, ancho 140px
- XP bar: barra delgada azul neon debajo del HP, muestra progreso al prÃ³ximo nivel
- Level badge: pill top-left con `LVL X/Y`
- Weapon cooldown bar: thin bar animada que se llena segÃºn cooldown del arma equipada

**WorldScene ambiente:**
- Drop shadows detrÃ¡s de cada edificio (depth 1.5)
- Entrance floor markers: zona coloreada + chevron permanente frente a cada puerta
- Interaction hint bobbing: el texto de acciÃ³n sube/baja Â±4px en ciclo
- Ambient particles: ~20 puntos neon flotantes en la plaza/zonas bajas

**Interiores:**
- `StoreInterior`: dot pattern dorado, focal glow animado sobre NPC, mostrador procedural, estanterÃ­as
- `ArcadeInterior`: red de circuitos neon rosa, 4 mÃ¡quinas arcade con pantalla CRT, luces intermitentes, carteles de juegos
- `CafeInterior`: paleta cÃ¡lida `#1a1209`, 7 fuentes de vapor con loop float+fade
- `CasinoInterior`: marquesina parpadeante en bordes, poker glow pulsante, 8 fichas decorativas

**Combat feedback:**
- Muzzle flash: cÃ­rculo blanco/amarillo ~80ms al disparar
- Hit tint: tint rojo 100ms en AvatarRenderer al recibir daÃ±o
- Damage numbers: color por arma (dorado/naranja/azul/verde), tamaÃ±o por magnitud, `CRIT!` si daÃ±o â‰¥ 30

**Minimap:**
- Top-right, 160Ã—100px, fondo negro, borde neon azul
- Edificios en colores temÃ¡ticos, punto dorado = jugador, puntos azules = remotos
- Toggle con `showArenaHud`

**Transiciones:**
- `showSceneTitle()` en `SceneUi.ts`: backdrop + tÃ­tulo 18px, fade in/hold/fade out
- Llamado en Store, Arcade, CafÃ©, Casino, Basement

**Minijuegos:**
- Countdown 3â†’2â†’1â†’GO! al inicio de ambos minijuegos
- BasketMinigame: score 14px neon, timer bar, scale punch, "NICE SHOT!"
- PenaltyMinigame: pips de progreso, confetti en gol, "GOLAZO!"

**Enemigos:**
- Formas procedurales: rusher=triÃ¡ngulo, shooter=cuadrado+barril, tank=hexÃ¡gono, boss=estrella 8 puntas
- Idle bobbing desfasado por `phase`
- Proximity agro glow cuando jugador a <220px
- Hurt flash blanco 180ms al recibir daÃ±o
- HP bar on-demand: solo visible 2.5s despuÃ©s de recibir golpe

### Tiled migration
- Revisado concepto. DecisiÃ³n: **diferido**. Requiere diseÃ±ar el mapa en Tiled primero. El mundo programÃ¡tico queda como decisiÃ³n final hasta que existan los assets.

---

---

## 1. Resumen Ejecutivo

Waspi World estÃ¡ significativamente mÃ¡s avanzado de lo que el PRD original v1.2 proyectaba para esta etapa. Lo que el documento original planificaba como un build de 13â€“14 semanas tiene implementadas la mayorÃ­a de sus fases core mÃ¡s un conjunto de features que nunca estuvieron en el PRD original (Casino, Zombies, PvP, La Vecindad, sistema de parcelas, armas premium, COTTENKS como NPC).

**Estado por dimensiÃ³n:**

| DimensiÃ³n | Estado real |
|---|---|
| Game engine / mundo | Funcional â€” 15 escenas, mundo 3200x1800px dibujado proceduralmente |
| Multiplayer / chat | Funcional â€” Supabase Realtime, chat BoomBang-style, interpolaciÃ³n |
| Avatar / customizaciÃ³n | Funcional â€” procedural + 4 seeds especiales + sprite overhaul iniciado |
| Inventario / tienda | Funcional â€” 13 items en catÃ¡logo (6 ropa + 7 utility/armas), StoreInterior implementado |
| EconomÃ­a TENKS | Parcialmente funcional â€” sync server-side vÃ­a API cuando hay sesiÃ³n; cache local |
| Pagos Stripe | Funcional en test mode â€” flujo end-to-end verificado (USD temporal, pendiente MP para ARS) |
| Auth Supabase | Funcional â€” magic link + Google, TENKS y skills server-side |
| Audio | BGM por escena vÃ­a `AudioManager`; SFX limitados; **jukebox CafÃ© = YouTube** (no Phaser) |
| Tests | Ninguno implementado |
| Tilemaps Tiled | NO existen â€” mundo dibujado con Phaser Graphics primitivos |

**QuÃ© falta para lanzamiento:**
1. **Mercado Pago** â€” cobros en ARS (plan: `mercadopago-integration.md`)
2. Live keys de Stripe en Vercel + webhook endpoint registrado en Stripe Dashboard
3. Resend emails â€” agregar `RESEND_API_KEY` y verificar dominio
4. Audio SFX por escena
5. Definir si Phaser Graphics es decisiÃ³n final o si se migra a Tiled

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
    api/                            <- ~38 route.ts (ver listado en Â§6)
      checkout, webhooks/stripe, player (+ orders, stats, barbershop, tenks)
      shop, shop/buy, chat/moderate, chat/report, pvp/match, vecindad
      jukebox/add|search|skip, skills/*, guilds/*, mastery/*, contracts/*
      quests/daily, fishing/collection, events, weed/deliver, minigames/*
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
  PRD.md                            <- PRD original v1.2 (vision comercial)
  PRD_WASPI_WORLD.md                <- PRD por fases (checklist producto)
  PRD_SPRITE_OVERHAUL.md            <- Spec sprites / armas / zombies
  PRD_ESTADO_ACTUAL.md              <- Este archivo (inventario vs codigo)
```

### 2.2 Stack real vs declarado

| Componente | Declarado en CLAUDE.md | Real |
|---|---|---|
| Next.js version | 15 | 16.1.6 (package.json) |
| Phaser version | 3.80+ | 3.90.0 |
| React version | no especificado | 19.2.3 |
| Auth | Supabase Auth (magic link + Google + Discord) | **Funcional** con proyecto configurado â€” magic link + Google en `GamePage`; invitados pueden usar UUID local hasta vincular |
| Tilemaps | JSON exports de Tiled | NO existen â€” Phaser Graphics primitivos |
| Tilesets | Tilesheet PNGs | NO existen |
| Audio | SFX, ambient | Solo arcade-theme.mp3 |
| app/ location | src/app/ | /app/ (raiz del proyecto) |
| world.ts | src/game/config/world.ts | Archivo NO existe |
| npcs.ts | src/game/config/npcs.ts | Archivo NO existe |

---

## 3. Escenas Implementadas (15 escenas)

| Escena | Archivo | Estado | Notas |
|---|---|---|---|
| BootScene | `BootScene.ts` | Completo | Precarga de assets, splash screen |
| WorldScene | `WorldScene.ts` | Completo | Mundo principal 3200x1800, 8 zonas, combat, PvE |
| StoreInterior | `StoreInterior.ts` | Completo | NPC vendor, shop overlay, multiplayer |
| ArcadeInterior | `ArcadeInterior.ts` | Completo | Acceso a minijuegos, reproduce arcade-theme.mp3 |
| CafeInterior | `CafeInterior.ts` | Completo | Interior social + **jukebox** (queue Supabase Realtime, overlay React, TENKS search/add/skip) |
| HouseInterior | `HouseInterior.ts` | Completo | Spawn, espejo (avatar creator), armario |
| BasketMinigame | `BasketMinigame.ts` | Completo | Tiro libre, power bar + angle needle, TENKS |
| PenaltyMinigame | `PenaltyMinigame.ts` | Completo | Penales con gameplay implementado |
| PvpArenaScene | `PvpArenaScene.ts` | Completo | Matchmaking Supabase, apuestas TENKS, lives |
| ZombiesScene | `ZombiesScene.ts` | Completo | PvE waves, 4 arquetipos, weapons, mystery box |
| BasementZombiesScene | `BasementZombiesScene.ts` | Completo | "Depths" â€” variante underground del modo zombies |
| BasementScene | `BasementScene.ts` | Completo | Zona basement/underground del mundo |
| CasinoInterior | `CasinoInterior.ts` | Completo | 4 juegos: slots, roulette, blackjack, Texas Hold'em |
| VecindadScene | `VecindadScene.ts` | Completo | Mapa 2800x1900, 11 parcelas, construccion por stages |
| CreatorScene | `CreatorScene.ts` | Completo | Editor de avatar (bodyColor, hairColor, eyeColor, sliders PP/TT, smoke) |

**Total: 15 escenas.** El PRD original v1.2 declaraba 6 (BootScene + WorldScene + 4 interiores). El PRD actualizado de 2026-03-14 ya reconocia 14 de estas.

### Escenas originalmente fuera del PRD

- `BasementScene` â€” zona extra no mencionada en ningun PRD previo
- `BasementZombiesScene` â€” variante underground del modo zombies
- `CasinoInterior` â€” no existia en PRD original (4 juegos funcionales)
- `ZombiesScene` â€” modo PvE completo, no existia en PRD original
- `PvpArenaScene` â€” matchmaking con apuestas, no existia en PRD original
- `VecindadScene` â€” zona completa de parcelas, introducida como "Fase 7" en sesion 2

---

## 4. Systems Implementados (19+ listados; hay mÃ¡s utilitarios)

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
| JukeboxSystem | `JukeboxSystem.ts` | Parcial | Cola cafÃ©, presencia host, API `/api/jukebox/*` |
| JukeboxPlayer | `JukeboxPlayer.ts` | Parcial | YouTube IFrame API, audio fuera de Phaser |

**Sistemas no documentados en CLAUDE.md (ejemplos):** `AnimationSafety`, `BranchedDialog`, `ControlSettings`, `EnemySprite`, `StatsSystem`, `JukeboxSystem`, `JukeboxPlayer`.

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
- `cottenks.png` â€” NPC COTTENKS con sprite propio

**Seeds de avatar** (`public/assets/seeds/`)
- `buho.png`, `chacha.png`, `gengar.png`, `piplup.png`

### 5.2 Audio

| Archivo | Ubicacion | Estado |
|---|---|---|
| `arcade-theme.mp3` | `public/assets/audio/` | Activo â€” se reproduce en ArcadeInterior |
| SFX de disparos | â€” | FALTA |
| SFX de pasos | â€” | FALTA |
| SFX de hits / dano | â€” | FALTA |
| SFX muerte de enemigo | â€” | FALTA |
| Musica WorldScene (ambient) | â€” | FALTA |
| Musica StoreInterior | â€” | FALTA |
| Musica CasinoInterior | â€” | FALTA |
| Musica ZombiesScene | â€” | FALTA |
| Audio para zombies | `modes/zombies/audio/` | Directorio vacio |
| FX para zombies | `modes/zombies/fx/` | Directorio vacio |

### 5.3 Assets declarados en CLAUDE.md que NO existen

- `public/assets/tilemaps/` â€” directorio no existe en el proyecto
- `public/assets/tilesets/` â€” directorio no existe en el proyecto
- `public/assets/ui/` â€” directorio no existe (HUD renderizado con Phaser primitivos y fuentes pixel art)

---

## 6. API Routes (~38 handlers `route.ts`)

Inventario **2026-03-20** (agrupado por dominio). Cada fila puede exponer GET/POST/PATCH segÃºn el archivo.

| Dominio | Rutas base |
|---------|------------|
| Player / economÃ­a | `/api/player`, `/api/player/orders`, `/api/player/stats`, `/api/player/tenks`, `/api/player/barbershop` |
| Comercio | `/api/shop`, `/api/shop/buy`, `/api/checkout`, `/api/webhooks/stripe` |
| Social / chat | `/api/chat/moderate`, `/api/chat/report` |
| Juego / PvP / mundo | `/api/pvp/match`, `/api/vecindad`, `/api/events` |
| Minijuegos | `/api/minigames/basket/start`, `.../reward`, `/api/minigames/penalty/reward` |
| Jukebox (CafÃ©) | `/api/jukebox/search`, `/api/jukebox/add`, `/api/jukebox/skip` |
| ProgresiÃ³n meta | `/api/skills`, `/api/skills/purchase`, `/api/skills/quality`, `/api/skills/milestones`, `/api/skills/specialize`, `/api/mastery`, `/api/mastery/earn`, `/api/mastery/unlock`, `/api/guilds`, `/api/guilds/join`, `/api/guilds/rep`, `/api/contracts`, `/api/contracts/claim`, `/api/contracts/progress`, `/api/quests/daily`, `/api/quests/daily/progress`, `/api/fishing/collection`, `/api/weed/deliver` |

**Nota:** `CLAUDE.md` suele estar desactualizado respecto a este listado; usar `app/api/**/route.ts` como fuente.

---

## 7. Base de Datos (Supabase Migrations)

**21 archivos** en `supabase/migrations/` (2026-03-20). Los primeros + ejemplos de expansion:

| Archivo | Descripcion |
|---|---|
| `20260313_prd_schema.sql` | Schema inicial â€” players, products, player_inventory, orders, etc. |
| `202603130101_vecindad_parcels.sql` | Parcelas La Vecindad |
| `202603130102_game_sessions_reward_code_unique.sql` | Constraint unique game_sessions |
| `202603130103_vecindad_stage_zero.sql` | Vecindad stage 0 |
| `20260314_player_stats.sql` | `player_stats` |
| `20260314_vecindad_realtime.sql` | Realtime parcelas |
| `20260315_player_tenks_balance.sql` / `20260315_rls_policies.sql` | TENKS / RLS |
| `20260317_*.sql` | Contratos, guilds, mastery, skills, especializaciones, eventos globales (+ seeds) |
| `20260318_skill_milestones.sql` | Hitos skills |
| `20260319_fish_collection.sql` | ColecciÃ³n pesca |
| `20260319_jukebox.sql` | Tablas queue/cache jukebox cafÃ© |

Ver carpeta para el detalle completo.

---

## 8. Catalogo de Productos

**13 items en `src/game/config/catalog.ts`:**

| ID | Nombre | Tipo | Precio TENKS | Precio ARS |
|---|---|---|---|---|
| UTIL-GUN-01 | PISTOLA 9MM | utility | 5.000 | â€” |
| UTIL-GUN-SHOT-01 | ESCOPETA 12G | utility | 11.000 | â€” |
| UTIL-GUN-SMG-01 | BUZZ SMG | utility | 14.000 | â€” |
| UTIL-GUN-RIFL-01 | RANGER RIFLE | utility | 21.000 | â€” |
| UTIL-GUN-GOLD-01 | RAY-X (limited) | utility | 42.000 | â€” |
| UTIL-BALL-01 | FOOTBALL | utility | 5.000 | â€” |
| UTIL-DEED-01 | ESCRITURA Vecindad | utility | 0 (gratis con parcela) | â€” |
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

**1. Auth Supabase â€” implementado en flujo feliz; endurecer invitados**
- Estado actual: magic link + Google en `GamePage` cuando Supabase estÃ¡ configurado; APIs usan `Authorization` donde corresponde. Puede coexistir UUID local para sesiÃ³n sin login completo.
- Impacto residual: jugadores no autenticados o flujos hÃ­bridos pueden desincronizar identidad con DB; hay que documentar y minimizar el modo â€œsolo localâ€.
- Siguiente paso: auditar que toda acciÃ³n econÃ³mica sensible exija JWT; unificar `player_id` con `auth.users.id` para cuentas reales.

**2. TENKS â€” servidor como fuente de verdad (parcial)**
- Estado actual: TENKS con operaciones vÃ­a `/api/player`, `/api/player/tenks`, packs y webhooks; jukebox add/skip validados server-side. Cache local en TenksSystem.
- Impacto residual: sin sesiÃ³n, manipulaciÃ³n client-side sigue siendo un riesgo donde el juego no sincroniza.
- Siguiente paso: cerrar gaps auditando cada path que suma/resta TENKS; tests en rutas crÃ­ticas.

**3. Stripe â€” verificado en test; falta producciÃ³n**
- Estado actual (mar 2026): flujo checkout â†’ webhook â†’ TENKS/inventario probado en **test mode**; USD segÃºn cuenta; MP/ARS pendiente.
- Impacto: keys live + webhook producciÃ³n y dominio de email siguen siendo pasos de go-live.
- Solucion: variables Vercel live, webhook URL registrado, smoke test en producciÃ³n; `RESEND_API_KEY` + dominio para confirmaciones.

### MEDIO (requerido para MVP completo)

**4. Audio â€” sistema preparado, sin archivos**
- AudioSettings.ts completo con toggles. AudioContext inicializado en WorldScene. Solo existe `arcade-theme.mp3`.
- Faltan: SFX de disparos, pasos, hits, muerte de enemigos, compras, interacciones con NPC. Musica ambient por escena (WorldScene, StoreInterior, CasinoInterior, ZombiesScene).
- Los subdirectorios `modes/zombies/audio/` y `modes/zombies/fx/` existen pero estan vacios.

**5. Tests â€” cero coverage**
- No hay tests unitarios ni de integracion en el proyecto.
- Especialmente critico para: TenksSystem, InventorySystem, ProgressionSystem, API routes de checkout y webhooks.

**6. Tilemaps Tiled â€” decision pendiente**
- El mundo se dibuja con Phaser Graphics primitivos (rectangulos, arcos, lineas). No hay JSON exports de Tiled ni tilesheet PNGs.
- El PRD actualizado de 2026-03-14 ya reconoce esto como una limitacion conocida.
- Opcion A â€” "Phaser Graphics es decision final": actualizar toda la documentacion y eliminar referencias a tilemaps Tiled. Colisiones siguen siendo rectangulos aproximados, sin pathfinding.
- Opcion B â€” "Migrar a Tiled": impacta visual, performance (culling real via tilemap), y colisiones (pathfinding posible con Navmesh). Estimacion: 1â€“2 semanas de trabajo.

**7. Armas adicionales â€” assets sin gameplay**
- uzi, blaster, deagle, cannon tienen sprites completos pero sin WeaponMode en WorldScene ni logica de gameplay.
- Los items del catalogo (UTIL-GUN-SMG-01, UTIL-GUN-RIFL-01, UTIL-GUN-GOLD-01) son comprables con TENKS pero sin diferencia funcional al equiparlos.

### BAJO (post-MVP)

**8. Actualizar CLAUDE.md** con estructura real: `app/` en raÃ­z, ~15 escenas, sistemas (incl. jukebox), ~38 API routes, sin `world.ts` ni `npcs.ts` si siguen ausentes.

**9. Leaderboard global** â€” ProgressionSystem guarda XP/nivel en localStorage. StatsSystem guarda en Supabase `player_stats` pero no hay endpoint ni UI de ranking global.

**10. Chat moderation** â€” `/api/chat/moderate` y `/api/chat/report` existen como endpoints pero la logica de moderacion (filtro de palabras configurable, ban automatico) no esta implementada.

**11. Resend email** â€” `src/lib/resend.ts` y templates listos; falta `RESEND_API_KEY` en prod y verificar dominio para envÃ­os reales.

**12. Mercado Pago** â€” mencionado en el PRD original como prioritario para el mercado argentino. No hay ninguna referencia en el codigo.

**13. Reload animation + arm overlay** â€” definidos en `PRD_SPRITE_OVERHAUL.md` como Phase 3 pero los archivos (`reload_strip.png` para cada arma, directorio `arm_overlay/`) no existen aun.

**14. Daily login streak + TENKS diarios** â€” mecanica del PRD original (100 TENKS/dia, +50 por dia consecutivo) sin implementar.

---

## 10. PRD Original vs Estado Real (Tabla Comparativa)

| Feature | PRD Original v1.2 (Marzo 2026) | Estado Real (2026-03-20) |
|---|---|---|
| Escenas totales | 6 (Boot, World, Store, Arcade, Cafe, House) | 15 escenas implementadas |
| Dimensiones del mundo | 3200x2400px (CLAUDE.md) / 3200x1800px (PRD) | 3200x1800px â€” dibujado con Phaser Graphics |
| Tilemaps | JSON exports de Tiled | NO existen. Mundo 100% programatico |
| Auth | Supabase Auth (magic link + Google + Discord) | Magic link + Google operativos con Supabase configurado |
| TENKS persistence | Supabase PostgreSQL (players.tenks) | DB + APIs + cache local; endurecer paths sin auth |
| Minijuegos MVP | Solo penales | Penales + basquet + Casino (4 juegos) + modo Zombies |
| Catalogo de items | 6 SKUs de ropa | 13 items (6 ropa + 7 utility/armas) |
| API routes | 5 endpoints | **~38** route handlers en `app/api` |
| Sistemas del juego | ~8 listados en CLAUDE.md | 19+ listados en Â§4 (+ utilitarios) |
| Jukebox CafÃ© | No en PRD original | Queue Realtime + YouTube + TENKS (search/add/skip server-validados) |
| Enemigos | No en PRD original | 4 arquetipos con sprites + animaciones completas |
| PvP | No en PRD original | PvpArenaScene con matchmaking server-side y apuestas TENKS |
| La Vecindad | No en PRD original | 11 parcelas, 4 stages de construccion, Realtime sincronizado |
| Casino | No en PRD original | 4 juegos funcionales (slots, roulette, blackjack, holdem) |
| NPC COTTENKS | No en PRD original | Sprite propio implementado |
| Sprites de personaje | Procedural chibi (Binding of Isaac style) | Procedural + sprite overhaul en 4 variantes (trap_Aâ€“D) |
| Sprites de enemigos | No en PRD original | 4 arquetipos con animaciones completas (idle/walk/attack/hurt/death) |
| Audio | SFX + ambient (planificado) | BGM por escena + arcade-theme; SFX incompletos; jukebox = streaming YouTube |
| Tests | No mencionados | Ninguno |
| DB migrations | No documentadas | **21** migrations en `supabase/migrations/` |
| `world.ts` (config) | Declarado en CLAUDE.md | Archivo no existe |
| `npcs.ts` (config) | Declarado en CLAUDE.md | Archivo no existe |
| `zombies.ts` (config) | No declarado | Existe en src/game/config/ |
| app/ location | src/app/ (CLAUDE.md) | /app/ en raiz del proyecto |
| Next.js version | 15 (CLAUDE.md) | 16.x |
| Phaser version | 3.80+ | 3.90.x |
| StatsSystem + player_stats | No en PRD original | Implementado, tabla en Supabase |
| PRDs en proyecto | 0 (PRD era PDF externo) | **4** archivos `PRD*.md` (ver Â§0) |

---

## 11. Roadmap â€” Proximas Fases

### Fase A: Fundamentos de Produccion (blocker â€” sin esto no se puede lanzar)
Estimacion: 1â€“2 semanas

1. **Auth Supabase** â€” magic link + Google OAuth. Migrar player_id localStorage a auth.users.id. Proteger endpoints con JWT. Vincular todas las tablas de DB al user real.
2. **TENKS server-side** â€” balance en columna `players.tenks` en DB. Todas las operaciones via `/api/player`. TenksSystem pasa a ser solo un cache local que sincroniza con el server. Eliminar posibilidad de modificacion client-side.
3. **Stripe smoke test** â€” ejecutar compra end-to-end en produccion. Validar webhook + inventory grant + email Resend. Configurar todos los `STRIPE_PRICE_*` env vars en Vercel.
4. **Variables de entorno produccion** â€” audit completo de env vars necesarias: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_* (6 vars), RESEND_API_KEY.

### Fase B: Audio y Polish (MVP completo)
Estimacion: 1 semana

5. **SFX core** â€” disparos (por tipo de arma), hits recibidos/dados, pasos, muerte de enemigo, compra exitosa, interaccion NPC, nivel up.
6. **Musica por escena** â€” WorldScene ambient (lo-fi hip hop / chill), ZombiesScene (tense loop), CasinoInterior (jazz/lounge), StoreInterior (chill streetwear vibes).
7. **Completar armas activas** â€” implementar WeaponMode para uzi, blaster, deagle, cannon. Conectar items de catalogo con logica real de gameplay.

### Fase B.1: Integracion final y estabilizacion
Estimacion: 1 semana

8. **`GamePage.tsx`** — cerrar wiring final de hooks extraidos y remover restos inline que siguen dentro del compositor.
9. **`WorldScene.ts`** — cerrar `world/*` integrando o removiendo los bloques inline remanentes de `renderWorld`, `interaction` y `vecindad`.
10. **`ZombiesScene.ts`** — cerrar `zombies/*` integrando o removiendo los bloques inline remanentes de `realtime` y `pickups`.
11. **QA de regresion del refactor** — validar auth, shop, chat, joystick mobile, WorldScene, ZombiesScene y BasementZombiesScene tras el cierre final.

### Fase C: Refuerzo tecnico y assets pendientes
Estimacion: 2-3 semanas

12. **Phase 3 pendiente** — generar reload_strip.png para las 6 armas. Crear directorio arm_overlay/ con hold_idle y hold_shoot strips.
13. **Wiring completo** — verificar que las 4 variantes de player (trap_Aâ€“D) se usan correctamente segun AvatarKind. Validar que el fallback procedural sigue funcionando.
14. **NEAREST filter** — asegurar que todos los nuevos spritesheets usan Phaser.Textures.FilterMode.NEAREST para mantener el look pixel art.

### Fase D: Features Post-MVP
Estimacion: 3â€“4 semanas

15. **Leaderboard global** â€” endpoint GET /api/leaderboard + UI in-game. Fuente de datos: tabla `player_stats` ya existente en DB.
16. **Chat moderation real** â€” filtro de palabras configurable server-side. Ban temporal automatico por acumulacion de reportes. Logs en DB (48hs retention via pg_cron).
17. **Mercado Pago** â€” integracion para el mercado argentino. Alta prioridad para conversion en el target local.
18. **Daily login streak + TENKS diarios** â€” 100 TENKS/dia + 50 por dia consecutivo. Requiere Auth implementado primero.
19. **Decision tilemaps** â€” confirmar Phaser Graphics como final O migrar a Tiled. Si se migra: impacta colisiones, pathfinding enemies, performance del rendering.

### Fase E: Expansion de Contenido
Estimacion: continuo

20. **Nuevas zonas** â€” expansion del mapa mas alla de las 8 zonas actuales. El PRD menciona "EXPANSION" al sur de la Plaza como zona post-MVP.
21. **Vendedor IA conversacional** â€” Claude API como reemplazo del dialog scriptado en StoreInterior. Recomendaciones segun historial de compras.
22. **Eventos temporales** â€” drops limitados, pop-up stores, partidos PvP rankeados.
23. **Mobile** â€” validar calidad de touch controls en dispositivos reales iOS/Android. Chat log minimizado por defecto en mobile. Shop panel full-screen en mobile.
24. **Cupones Stripe** â€” API preparada en el PRD, no implementada en UI. Conectar con resultados de minijuegos (penales/basquet 3+ goles = cupon 10%).

---

## 12. Archivos Clave de Referencia

| Documento | Path | Descripcion |
|---|---|---|
| **Estado vs cÃ³digo (fuente operativa)** | `PRD_ESTADO_ACTUAL.md` | Este archivo â€” inventario, gaps, sesiones |
| PRD por fases | `PRD_WASPI_WORLD.md` | Checklist de producto actualizado por fases |
| PRD original | `PRD.md` | v1.2 â€” visiÃ³n comercial y MVP clÃ¡sico |
| PRD Sprite Overhaul | `PRD_SPRITE_OVERHAUL.md` | Spec tÃ©cnica sprites jugador/zombies/armas |
| Stats Panel | `planning/completed/stats-panel.md` | Registro â€” overlay en GamePage + StatsSystem |
| Schema SQL | `supabase/migrations/20260313_prd_schema.sql` | Schema base de la DB |
| Player Stats SQL | `supabase/migrations/20260314_player_stats.sql` | Tabla player_stats |
| Catalogo | `src/game/config/catalog.ts` | 13 items con precios TENKS y ARS + helpers getItem/getPhysicalCatalog |
| EventBus | `src/game/config/eventBus.ts` | 30+ eventos tipados Phaser-React bridge |
| CLAUDE.md | `CLAUDE.md` | Instrucciones del proyecto â€” requiere actualizacion para reflejar estado real |
