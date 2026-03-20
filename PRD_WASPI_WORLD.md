# WASPI WORLD — PRD (Estado Actualizado)
**Fecha de actualización:** 2026-03-20 (sesión React UI Migration completa + Auth/TENKS server-side)
**Rama activa:** main

> **Documentos PRD:** este archivo es el checklist por fases. El inventario frente al código (APIs, migraciones, gaps, sesiones) está en **`PRD_ESTADO_ACTUAL.md`**. §0 de ese doc explica los 4 `PRD*.md` del repo. El subsistema de **voz espacial WebRTC/PeerJS** tiene su propio doc: **`PRD_VOICE_WEBRTC_ESTADO.md`**.

---

## Overview

E-commerce gamificado: mundo abierto 2D de vista cenital estilo Binding of Isaac para la marca streetwear WASPI. Los jugadores exploran un mundo persistente, socializan, juegan minijuegos, ganan TENKS (moneda de engagement) y compran ropa física con Stripe (ARS).

**Objetivos MVP:**
- 30 jugadores simultáneos
- 60 fps estables
- Carga inicial < 3 segundos
- Integración Stripe funcional para 6 SKUs físicos

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Game engine | Phaser 3.90.x |
| Frontend shell | Next.js 16.x (App Router) + TypeScript + Tailwind |
| Real-time / DB | Supabase Realtime (WebSockets), Supabase PostgreSQL |
| Auth | Supabase Auth (magic link + Google) — Discord NO implementado |
| Pagos | Stripe Checkout hosted + Coupons API |
| Email | Resend |
| Hosting | Vercel |

---

## Current State — Por Fase

### Fase 1: Core World (COMPLETA)

- [x] Mundo 3200x1800px con capas dibujadas en Phaser Graphics (sin tilemaps Tiled aún)
- [x] Zonas definidas: Calle Principal, Veredas Norte/Sur, Plaza, Training Zone, Vecindad, Casa
- [x] 4 edificios con hitboxes: Arcade, Waspi Store, Café, House
- [x] Cámara con smooth lerp (LERP 0.1) y bounds del mundo
- [x] Movimiento 8 direcciones: WASD + cursors, velocidad 180px/s
- [x] Controles touch/mobile (joystick virtual + botón A)
- [x] Sistema de boot con `runBootStep` / `runFrameStep` — errores aislados, no crashean el juego
- [x] Fade 300ms al entrar/salir de interiores
- [x] Lamp posts, vignette, neon styling — paleta `#0E0E14`

### Fase 2: Multiplayer y Social (COMPLETA)

- [x] Supabase Realtime — canal por escena, broadcast de posición cada 50ms
- [x] Interpolación de remotePlayers (lerp target X/Y)
- [x] Chat BoomBang: burbujas sobre la cabeza, duración 5000ms, 140 chars máx, rate limit 1000ms
- [x] Nameplates en todos los jugadores (locales y remotos)
- [x] Presencia de jugadores visible en tiempo real
- [x] Sistema de mute de jugadores (localStorage)
- [x] Rate limiting en chat/moves/hits para evitar spam
- [x] Player actions: mute / report via eventBus
- [x] Modo solo (fallback si Supabase no está configurado)

### Fase 3: Avatar y Customización (COMPLETA)

- [x] AvatarRenderer: sistema procedural (circle body + primitives) con capas completas
  - Render order: sombra → piernas → ropa inferior → torso → ropa superior → brazos → cabeza → pelo → ojos → accesorios
  - Estilos de pelo: SPI, AFR, WAV, COR, STR (+ CAP, BUN)
  - Animación de caminata: oscilación de piernas y brazos
  - Humo cosmético (smoke bubble animado)
- [x] 4 avatares especiales con seed sprites + chroma-key: `gengar`, `buho`, `piplup`, `chacha`
- [x] CreatorScene: editor de avatar (bodyColor, hairColor, eyeColor, topColor, bottomColor, hairStyle, pp, tt, smoke)
- [x] Cambios de avatar se propagan a remotePlayers via Supabase broadcast
- [x] Ropa del inventario actualiza colores del avatar en tiempo real

### Fase 4: Inventario y Tienda (COMPLETA)

- [x] InventorySystem: owned[], equipped {top, bottom, utility[]}
- [x] Catálogo con **13 items**:
  - Utilidades/armas: UTIL-GUN-01 (5k), UTIL-GUN-SHOT-01 (11k), UTIL-GUN-SMG-01 (14k), UTIL-GUN-RIFL-01 (21k), UTIL-GUN-GOLD-01 / RAY-X (42k), UTIL-BALL-01 (5k), UTIL-DEED-01 (gratis con parcela)
  - Ropa física: TEE-BLK-01, TEE-WHT-01, TEE-RED-01, CRG-BLK-01, CRG-OLV-01, HOD-GRY-01
- [x] Precios TENKS (800–42.000) + precios ARS (15k–45k) con Stripe price envs
- [x] StoreInterior: NPC vendor, dialog system, shop overlay, multiplayer remoto
- [x] TenksSystem: balance local con initTenks / addTenks / getTenksBalance
- [x] Stripe integration en `lib/stripe.ts`
- [x] Commerce persistence en `lib/commercePersistence.ts`

### Fase 5: Combat / PVE / PVP (COMPLETA)

- [x] Sistema de armas: pistol + shotgun con sprites animados (glock: 4 idle + 4 shoot frames)
  - Pistol: 1 pellet, 18 dmg, 120ms cooldown, knockback 18
  - Shotgun: 3 pellets, 16 dmg/pellet, 320ms cooldown, spread 0.15, knockback 34
- [x] Arma se equipa via inventario (UTIL-GUN-01), toggle con Q
- [x] Apuntado con mouse (aim angle), sprite del arma rota hacia cursor
- [x] Sprites de armas en remotePlayers visibles y sincronizados
- [x] 4 arquetipos de enemigos: rusher, shooter, tank, boss (renderizados como arcos de colores)
  - Rusher: 34 HP, rojo, contacto 12 dmg
  - Shooter: 40 HP, naranja, ranged 9 dmg, cooldown 850ms
  - Tank: 72 HP, púrpura, contacto 18 dmg
  - Boss: 220 HP, cyan, ranged 14 dmg, respawn 5s
- [x] Training Zone en Plaza: 5 dummies + 1 boss con posiciones fijas
- [x] IA de enemigos: preferredDistance, strafe, contactDamage, rangedDamage, shotCooldown
- [x] HP del jugador: 100, barra visual HUD (rojo), texto "HP X"
- [x] Boss HUD dedicado (barra + nombre en pantalla)
- [x] CombatStats: kills/deaths en localStorage (`waspi_combat_stats_v1`)
- [x] PvpArenaScene: arena separada con matchmaking via Supabase, apuestas de TENKS, lives system, slots de jugadores
- [x] RemoteHit events via Supabase broadcast (PVP player damage)
- [x] Rate limiting de hits: 120ms local cooldown, 180ms entre eventos remotos

### Fase 6: Progression System (COMPLETA)

- [x] ProgressionSystem: XP + nivel (1–11+) en localStorage (`waspi_progression_v1`)
  - Milestones: [0, 8, 20, 36, 56, 80, 110, 146, 188, 236, 290] XP
  - XP ganado por kills de enemigos (xpReward: 2–12 según archetype)
  - TENKS ganados por kills (tenksReward: 1–5 según archetype)
- [x] HUD de progresión en pantalla (nivel, XP, próximo nivel)
- [x] HUD de combat stats (K/D display)
- [x] HudSettings: toggles para mostrar/ocultar HUD elements (arenaHud, chatHud, etc.)

### Fase 7: La Vecindad (COMPLETA)

- [x] VecindadScene: mapa 2800x1900px separado, acceso desde WorldScene
- [x] 11 parcelas configuradas con posiciones fijas y costo 20.000 TENKS c/u
- [x] Sistema de construcción: 4 stages (BUILD_STAGE_COSTS: 40, 90, 160 materiales)
- [x] Material nodes: cajas recolectables con respawn timer
- [x] Parcelas visibles con título, owner, badge y estructura visual
- [x] Escritura (UTIL-DEED-01): item de inventario que se otorga al comprar parcela
- [x] SharedParcelState sincronizado via Supabase Realtime
- [x] VecindadPersistence en `lib/vecindadPersistence.ts`
- [x] Parcelas también visibles parcialmente en WorldScene (mini-preview en zona VECINDAD)

### Fase 8: Minijuegos (COMPLETA)

- [x] BasketMinigame: tiro libre con power bar + angle needle, 30s por ronda, streaks
  - Recompensas TENKS via `calculateBasketReward` (`lib/basketRewards.ts`)
  - Integración Supabase para guardar score
- [x] PenaltyMinigame: gameplay implementado
- [x] ArcadeInterior: escena interior del arcade con acceso a minijuegos
- [x] CafeInterior: escena interior del café + **jukebox** (cola Realtime, búsqueda YouTube, TENKS; overlay React)
- [x] HouseInterior: Tu Casa (spawn de jugadores)
- [x] InteriorRoom system: helper reutilizable para dibujar interiores
- [x] Chat bubbles en todos los interiores via InteriorRoom + ChatSystem (StoreInterior, VecindadScene, etc.)

### Fase 9: Casino + Zombies (COMPLETA — sesión 2026-03-14)


- [x] CasinoInterior: escena interior del casino con ruleta y mesas de poker
- [x] ZombiesScene + BasementZombiesScene: modo PvE de oleadas
- [x] StatsSystem: tracking de stats persistido via Supabase (`player_stats` table)
- [x] Migración `20260314_player_stats.sql` (zombie_kills, pvp_kills, deaths, tenks_earned, etc.)
- [x] PvP Pit match start handshake fix
- [x] Casino entrance collision fix

### Fase 11: React UI Migration Total (COMPLETA — sesión 2026-03-20)

**14 componentes React nuevos — toda la UI funcional fuera de Phaser:**
- [x] `CasinoOverlay` — 4 juegos (slots, roulette, blackjack, poker) portados a TS puro
- [x] `ZombiesHUD` — wave, score, HP, countdown, game over
- [x] `GunShopOverlay` — compra de armas via `/api/shop/buy`
- [x] `VecindadHUD` — materiales, stage, farm status, prompt contextual
- [x] `BasketHUD`, `PenaltyHUD`, `DartsHUD` — HUDs de minijuegos
- [x] `BosqueHUD` — resource counter + prompt
- [x] `GymHUD` — bag prompt, combo, bench progress, XP flash
- [x] `ArcadeHUD` — machine hint dinámico
- [x] `FlappyHUD`, `DinoHUD` — score, high score, game over
- [x] `WorldHUD` — interaction prompt con animación bob (único UI funcional en WorldScene)
- [x] `PvpHUD` — bet, roster, live board, HP, vidas, notices, countdown
- [x] StoreInterior delegado a ShopOverlay React existente (~150 líneas Phaser eliminadas)

**Lo que queda en Phaser (correcto):** sprites, física, decorativos del mundo, elementos en world-space.

### Fase 10: HUD React Overhaul (COMPLETA — sesión 2026-03-20)

**Migración GamePage.tsx → componentes React independientes (-1200 líneas total):**
- [x] ShopOverlay — tienda virtual/física/TENKS/órdenes con tabs
- [x] InventoryOverlay — loadout slots + grid ropa + utilidades
- [x] SettingsOverlay — 4 tabs: audio, HUD, controles, voice
- [x] StatsOverlay — 4 secciones: combate, economía, exploración, minijuegos
- [x] PlayerActionsOverlay — mute / reportar jugador
- [x] UINotice — toasts con animación slide-in y corner decorations
- [x] LoginCard — WASPI ID branding, magic link + Google
- [x] LeaderboardOverlay — top 10 en 3 tabs (zombies/K:D/nivel), refresh 30s
- [x] QuestTracker — panel colapsable derecha, misiones diarias + barras progreso
- [x] VirtualJoystick — D-pad táctil con indicadores N/S/E/W para mobile
- [x] SkillTreeOverlay — 6 árboles (mining/fishing/gardening/cooking/gym/weed), XP bars, niveles locked/unlocked, milestones

**EventBus — nuevos eventos:**
- [x] `LEADERBOARD_OPEN`, `QUEST_TRACKER_REFRESH`, `SKILL_TREE_OPEN`

**API nuevas:**
- [x] `GET /api/leaderboard?tab=zombies|kd|level` — top 10 sin auth

### Infraestructura de Soporte (COMPLETA)

- [x] BootScene: precarga de assets
- [x] SceneUi: createBackButton, transitionToScene, announceScene
- [x] EventBus (Phaser-React bridge): 30+ eventos tipados (CHAT, PLAYER, TENKS, INVENTORY, AVATAR, SHOP, AUDIO, HUD, PARCEL, UI)
- [x] AudioSettings: música + SFX toggles en localStorage
- [x] DialogSystem: diálogos con NPC, typewriter effect
- [x] `lib/supabase.ts`, `lib/supabaseAdmin.ts`, `lib/supabaseServer.ts`
- [x] `lib/pvpMatchServer.ts`: lógica de matchmaking server-side
- [x] `lib/tenksPacks.ts`: definición de packs de TENKS
- [x] `lib/catalogServer.ts`: acceso server-side al catálogo
- [x] Error isolation: boot steps y frame steps con try/catch, runtimeFailures Set

---

## Systems Built

| Sistema | Archivo | Descripción |
|---------|---------|-------------|
| AvatarRenderer | `systems/AvatarRenderer.ts` | Avatar procedural multicapa + 4 kinds especiales con seed sprites. Animación de caminata, smoke, chroma-key |
| ChatSystem | `systems/ChatSystem.ts` | Chat con burbujas sobre cabeza, rate limiting, mute |
| TenksSystem | `systems/TenksSystem.ts` | Balance de moneda TENKS, addTenks/initTenks |
| InventorySystem | `systems/InventorySystem.ts` | Owned/equipped items, getEquippedColors, hasUtilityEquipped |
| DialogSystem | `systems/DialogSystem.ts` | Diálogos NPC con typewriter |
| AudioSettings | `systems/AudioSettings.ts` | Música + SFX toggles, persistencia localStorage |
| HudSettings | `systems/HudSettings.ts` | Visibilidad de elementos HUD |
| ProgressionSystem | `systems/ProgressionSystem.ts` | XP/nivel/kills, 11 milestones, localStorage |
| CombatStats | `systems/CombatStats.ts` | K/D ratio, localStorage |
| InteriorRoom | `systems/InteriorRoom.ts` | Helper para renderizar interiores reutilizables |
| SceneUi | `systems/SceneUi.ts` | Back button, transiciones, announceScene |
| SceneControls | `systems/SceneControls.ts` | Manejo unificado de controles por escena |
| AnimationSafety | `systems/AnimationSafety.ts` | Guards para evitar errores en animaciones Phaser |
| BranchedDialog | `systems/BranchedDialog.ts` | Diálogos con branching (árbol de respuestas) |
| ControlSettings | `systems/ControlSettings.ts` | Settings de controles por jugador |
| EnemySprite | `systems/EnemySprite.ts` | State machine para sprites de zombies |
| StatsSystem | `systems/StatsSystem.ts` | Tracking de stats persistido via Supabase (`player_stats`) |
| JukeboxSystem | `systems/JukeboxSystem.ts` | Cola café, presencia host, API `/api/jukebox/*` |
| JukeboxPlayer | `systems/JukeboxPlayer.ts` | YouTube IFrame API, audio fuera de Phaser |
| EventBus | `config/eventBus.ts` | Bridge Phaser↔React, 30+ eventos tipados |

---

## Assets

### Sprites (`public/assets/sprites/`)

**Guns** — cada arma tiene: `idle_frame_01–04.png`, `shoot_frame_01–04.png`, `idle_strip.png`, `shoot_strip.png`, `seed.png`

| Directorio | Arma | Estado |
|-----------|------|--------|
| `guns/01_glock` | Pistol (Glock) | ACTIVO en gameplay |
| `guns/02_uzi` | Uzi | Assets listos, sin implementar |
| `guns/03_shotgun` | Shotgun | ACTIVO en gameplay |
| `guns/04_blaster` | Blaster | Assets listos, sin implementar |
| `guns/05_deagle` | Desert Eagle | Assets listos, sin implementar |
| `guns/06_cannon` | Cannon | Assets listos, sin implementar |

### Sin assets aún (pendientes)

- Tilemaps Tiled (.json) — mundo dibujado con Phaser Graphics primitivos
- Tilesets PNG — se usan colores sólidos y rectangles
- Sprites de personaje/NPC (ambientales son procedurales)
- UI frames / iconos
- Audio (SFX + ambient) — sistema preparado pero sin archivos de audio

---

## What's Next (TODO)

### Alta Prioridad

1. **Auth Supabase + TENKS server-side** ✅ — `initTenksFromServer()` llamado en `hydratePlayerState` al autenticar; `applyPlayerState` usa `preferStored: false` para que el server siempre gane. Balance sincronizado desde `player_tenks_balance` en cada login. (sesión 2026-03-20)
2. **Server-side TENKS validation** ✅ — `/api/shop/buy` valida contra `player_tenks_balance` con deducción atómica y refund compensatorio. Jukebox add/skip validados. Falta cerrar path de TENKS earned en zombies/minijuegos sin auth.
3. **Stripe Checkout end-to-end** ✅ — flujo checkout → webhook → TENKS/inventario verificado en **test mode** (sesión 2026-03-19). Pendiente: live keys en Vercel, webhook URL registrado en Stripe Dashboard, smoke test en producción.
4. **Tilemaps reales** — exportar de Tiled, reemplazar Graphics primitivos. Impacta visual y rendimiento. Decisión: **diferida** (ver Known Limitations).
5. **Armas adicionales** — assets de uzi, blaster, deagle, cannon existen pero sin `WeaponMode` ni lógica de gameplay.

### Media Prioridad

6. **Enemigos con sprites** — sprites generados para 4 arquetipos (rusher/shooter/tank/boss), sistema `EnemySprite.ts` implementado. Falta wiring completo con `ZombiesScene`.
7. **Audio** — AudioSettings completo, AudioContext listo en WorldScene. Solo existe `arcade-theme.mp3`. Necesita SFX de disparo, pasos, hits, muerte enemigo, y ambient por escena.
8. **PenaltyMinigame** ✅ — gameplay implementado.
9. **Leaderboard** ✅ — `/api/leaderboard` implementado, LeaderboardOverlay activo con top-10 real.
10. **Chat moderation** — endpoint `/api/chat/moderate` existe. Falta: lógica de filtro de palabras, ban automático por reportes, logs en DB.
11. **Voice chat (WebRTC)** — `VoiceChatManager` implementado con PeerJS + STUN. Falta: servidor TURN para NAT traversal, PeerJS server propio, `/api/voice/ice`, vincular con `auth.users.id`. Ver `PRD_VOICE_WEBRTC_ESTADO.md`.

### Baja Prioridad / Post-MVP

12. **Supabase Auth integrado con Vecindad** — parcelas y builds deberían persistir server-side con el user_id real.
13. **Resend email** — `lib/resend.ts` y templates listos. Falta `RESEND_API_KEY` en prod y verificar dominio.
14. **UI frames / HUD art** — todo el HUD usa fuentes pixel art sin assets gráficos propios.
15. **Coupons Stripe** — API preparada, no implementada en UI.
16. **Admin panel / moderación** — `supabaseAdmin.ts` existe pero sin interfaz.
17. **Daily login streak + TENKS diarios** — 100 TENKS/día + 50 por día consecutivo (PRD original). Sin implementar.
18. **Mercado Pago** — cobros en ARS. Plan en `planning/features/mercadopago-integration.md`.

---

## Known Limitations / Issues

- **TENKS parcialmente server-side**: APIs existen (`/api/player`, `/api/player/tenks`), pero sin sesión activa el balance sigue siendo local. Vincular con `auth.users.id` es blocker de lanzamiento.
- **Progresión no persiste** entre dispositivos (localStorage). `StatsSystem` sí persiste en Supabase `player_stats`.
- **Parcelas Vecindad** sincronizadas via Realtime pero sin persistencia garantizada server-side post-reload para invitados sin auth.
- **Mundo sin tilemaps**: colisiones de edificios son aproximadas (rectángulos), no hay pathfinding. Decisión de migrar a Tiled **diferida**.
- **Enemigos con sprites disponibles** (4 arquetipos) pero wiring con ZombiesScene pendiente — siguen renderizando como arcos de colores en runtime.
- **Sin audio SFX**: sistema completo pero solo existe `arcade-theme.mp3`. SFX de disparo, pasos, hits, y ambient faltan.
- **Gun sprites**: solo glock y shotgun activos. 4 armas (uzi, blaster, deagle, cannon) con assets pero sin `WeaponMode`.
- **Touch controls**: implementados (VirtualJoystick React) pero calidad no validada en dispositivos reales.
- **MVP target 30 players**: no hay stress test de Supabase Realtime con carga real.
- **Voice chat**: WebRTC/PeerJS funciona en LAN/mismo ISP. En internet real sin TURN puede fallar conexión P2P.

---

## Paleta Visual

| Elemento | Color |
|---------|-------|
| Fondo | `#0E0E14` |
| Acento dorado | `#F5C842` |
| Neon azul | `#46B3FF` |
| Neon verde | `#39FF14` |
| Neon rosa | `#FF006E` |
| HUD font | Press Start 2P |
| Chat/dialog font | Silkscreen |

---

## Decisiones de Diseño Clave (Permanentes)

1. **Mundo continuo sin pantallas de carga** — solo fade 300ms al entrar/salir de edificios.
2. **TENKS = engagement, no dinero** — nunca se vende TENKS. Ropa física = Stripe ARS.
3. **Client untrusted** — TENKS, descuentos y scores siempre validados server-side (pendiente de implementar completamente).
4. **Capas de rendering fijas** — sombra → piernas → ropa inferior → torso → ropa superior → brazos → cabeza → pelo → ojos → accesorios.
5. **Error isolation** — boot steps y frame steps envueltos en try/catch. El juego no crashea por un sistema que falla.
6. **Solo mode** — si Supabase no está configurado, el juego funciona como single player sin errores visibles al usuario.
