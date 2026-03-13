# WASPI WORLD — Product Requirements Document

**Versión:** 1.1 — MVP
**Estado:** En desarrollo
**Autor:** Memas AI Solutions
**Fecha:** Marzo 2026
**Última actualización:** 2026-03-13 — Fase 1 scaffoldeada y corriendo

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Visión de Producto](#2-visión-de-producto)
3. [World Design — Mundo Abierto](#3-world-design--mundo-abierto)
4. [Sistema de Chat Social](#4-sistema-de-chat-social)
5. [Sistemas de Juego](#5-sistemas-de-juego)
6. [Economía: TENKS](#6-economía-tenks)
7. [Minijuegos](#7-minijuegos)
8. [Sistema Comercial](#8-sistema-comercial)
9. [Tech Stack](#9-tech-stack)
10. [Modelo de Datos](#10-modelo-de-datos)
11. [Experiencia Mobile](#11-experiencia-mobile)
12. [Seguridad](#12-seguridad)
13. [Timeline de Desarrollo](#13-timeline-de-desarrollo)
14. [Costos Operativos](#14-costos-operativos)
15. [Métricas de Éxito](#15-métricas-de-éxito)
16. [Criterios de Aceptación del MVP](#16-criterios-de-aceptación-del-mvp)
17. [Decisiones Abiertas](#17-decisiones-abiertas)
18. [Roadmap Post-MVP](#18-roadmap-post-mvp)
19. [Estado del Desarrollo](#19-estado-del-desarrollo)

---

## 1. Resumen Ejecutivo

Waspi World es una plataforma de e-commerce gamificada para una marca de indumentaria streetwear. En lugar de un storefront tradicional, el comprador crea un avatar (su "waspi"), entra a un mundo abierto 2D top-down con estética inspirada en The Binding of Isaac, y explora libremente una calle con locales comerciales. Puede entrar a tiendas, jugar minijuegos en el arcade, tomar algo en el café, y chatear con otros jugadores en tiempo real estilo BoomBang — con burbujas de texto sobre el personaje. Cuando compra ropa, su waspi la usa en el mundo Y la prenda le llega a su casa.

La moneda virtual del mundo se llama **TENKS**. Se obtienen al crear cuenta, ganar minijuegos y completar logros. Los TENKS operan dentro del ecosistema del juego como mecanismo de engagement; la compra de ropa física se procesa con dinero real via Stripe.

| Dimensión | Detalle |
|---|---|
| Producto | Mundo abierto 2D con e-commerce integrado y chat social |
| Género | Exploración top-down open world, estética hand-drawn oscura/quirky |
| Referencia visual | The Binding of Isaac (personajes), BoomBang (chat social) |
| Plataforma MVP | Web browser (desktop + mobile responsive) |
| Modelo de negocio | Venta directa D2C de indumentaria física |
| Mecánica core | Explorás un mundo abierto → chateás con otros → visitás tiendas → comprás ropa real + virtual |
| Moneda virtual | TENKS |
| Timeline MVP | 10–14 semanas |
| Target | 18–30, cultura streetwear/gaming, Argentina inicialmente |

---

## 2. Visión de Producto

### 2.1 El problema

El e-commerce de indumentaria está comoditizado. Todas las tiendas online se ven iguales: grilla de productos, filtros, carrito, checkout. No hay diferenciación experiencial ni componente social. Para un público joven inmerso en cultura gaming, la experiencia de "scrollear y comprar" es aburrida y solitaria.

### 2.2 La solución

Waspi World transforma la compra en experiencia social. El usuario crea su waspi, entra a un mundo abierto donde ve a otros jugadores caminando, chatea con ellos via burbujas de texto, explora locales, juega minijuegos, y es atendido por un vendedor que vive dentro del mundo. **No es un sitio web con un juego adentro — es un mundo con una tienda adentro.**

### 2.3 Referencia clave: BoomBang

BoomBang (y su predecesor Habbo Hotel) demostraron que un mundo virtual 2D con chat social y avatares customizables genera engagement masivo. Waspi World toma esa fórmula probada y la aplica a un contexto comercial específico: streetwear. La diferencia es que acá la monetización no es virtual sino física — vendés ropa real que además existe en el juego.

### 2.4 Principios de diseño

1. **Mundo abierto, sin interrupciones:** el jugador camina libremente por todo el mapa sin pantallas de carga ni transiciones cortantes
2. **Social first:** ver otros waspis y chatear es parte central, no un feature secundario
3. **Cada prenda existe en dos mundos:** lo que comprás para tu waspi es lo que recibís en tu casa
4. **El vendedor es un personaje del mundo,** no un modal de UI
5. **Performance es gameplay:** 60fps constantes, carga < 3 segundos
6. **TENKS dan vida al mundo:** la economía virtual genera loops de engagement

---

## 3. World Design — Mundo Abierto

### 3.1 Concepto de mundo abierto

Mapa continuo y scrolleable (3200×1800px MVP). El jugador camina libremente y la cámara lo sigue con smooth lerp. Solo los interiores de edificios tienen transición (fade rápido de 300ms).

### 3.2 Layout del mundo

```
┌──────────────────────────────────────────────────────────┐
│                      WASPI WORLD                         │
│                                                          │
│  ┌────────┐    ┌────────────┐    ┌────────┐             │
│  │ ARCADE │    │WASPI STORE │    │  CAFÉ  │             │
│  └───┬────┘    └────┬───────┘    └───┬────┘             │
│      │              │               │                   │
│  ════╩══════════════╩═══════════════╩═════              │
│  ║         CALLE PRINCIPAL (vereda + calle)  ║          │
│  ════════════════════════════════════════════            │
│                                                          │
│              ┌──────┬──────┐                            │
│              │  TU CASA   │  ← spawn                   │
│              └─────────────┘                            │
│                                                          │
│  ┌────────────┐    ┌───────────┐                        │
│  │   PLAZA    │    │ EXPANSIÓN │  ← post-MVP            │
│  └────────────┘    └───────────┘                        │
└──────────────────────────────────────────────────────────┘
```

### 3.3 Sistema de cámara

| Aspecto | Especificación |
|---|---|
| Tipo | Cámara 2D que sigue al jugador con smooth lerp (factor 0.1) |
| Viewport | 800×600px base, escalado responsivo |
| Bounds | La cámara no puede salir de los límites del mundo (clamped) |
| Zoom | 1x default |
| Culling | Solo se renderizan tiles y entidades dentro del viewport + margen |
| Parallax | Fondo lejano (cielo/estrellas) con parallax sutil |

### 3.4 Zonas del mundo

#### Calle Principal
El corazón del mundo. Una calle horizontal con veredas a ambos lados, faroles, carteles de neón, y las fachadas de los locales comerciales.

#### Tu Casa (interior)
Espacio privado del jugador. Spawn point. Contiene: espejo (abre character creator), armario (inventario de ropa), cama (decorativa).

#### Waspi Store (interior)
Tienda principal de ropa. Interior con estantes, maniquíes con outfits, y el vendedor NPC. Al hablar con el vendedor se abre el panel de compra.

#### Arcade (interior)
Sala de máquinas arcade. Cada máquina es un minijuego distinto.

#### Café (interior)
Espacio social. Mesas, barra, barista NPC. Post-MVP: pedidos de bebidas con buffs de TENKS.

#### Plaza (exterior)
Espacio abierto al sur de la calle. Fuente en el centro, pasto, árboles. Zona de chill. Post-MVP: eventos temporales.

### 3.5 Estética visual

| Elemento | Especificación |
|---|---|
| Rendering | Canvas 2D / WebGL via Phaser 3 |
| Perspectiva | Top-down 3/4 view |
| Paleta base | Fondos `#0E0E14`, acentos `#F5C842` dorado, neón saturado en carteles |
| Personajes | Proporciones chibi — cabeza ~40% del cuerpo, ojos grandes, expresivos |
| Exterior | Calle con asfalto texturizado, faroles con glow, carteles de neón animados |
| Interiores | Store (dorado/negro), Arcade (neón azul/rosa), Café (cálido/madera) |
| Animación | 4-8 frames por ciclo de caminata, bob en idle, brazos con swing |
| Efectos | Viñeta, grain overlay, glow en interactivos, sombras dinámicas simples |
| Tipografía | Press Start 2P (HUD), Silkscreen (chat y diálogos) |

---

## 4. Sistema de Chat Social

### 4.1 Concepto

Mensajes como burbujas de texto sobre la cabeza del waspi. La comunicación es espacial — para leer lo que alguien dice, tenés que estar cerca en el mundo.

### 4.2 Mecánica del chat

| Aspecto | Especificación |
|---|---|
| Input | Barra de texto fija en la parte inferior (siempre visible) |
| Activación | Click/tap en la barra o ENTER |
| Envío | ENTER para enviar, ESC para cancelar |
| Display | Burbuja sobre la cabeza del waspi emisor |
| Estilo de burbuja | Fondo semi-transparente oscuro, borde dorado (propio) o azul (otros) |
| Duración | 5 segundos (fade out en el último segundo) |
| Limite de caracteres | 140 caracteres |
| Rate limiting | Máximo 1 mensaje por segundo por jugador |
| Visibilidad | Solo se ven burbujas dentro del viewport |

### 4.3 Chat log

Chat log compacto en la esquina inferior izquierda con los últimos 10–15 mensajes. Se puede minimizar/expandir.

### 4.4 Moderación

- Filtro de palabras prohibidas (lista negra configurable server-side)
- Sistema de reportes: click derecho → Reportar
- Mute individual
- Rate limiting server-side (1 msg/seg, 30 msgs/min)
- Logs persistidos 48hs para revisión
- Ban temporal automático por acumulación de reportes

### 4.5 Implementación técnica

WebSockets via **Supabase Realtime** (Channels). Canal global `waspi-world`.

| Evento WebSocket | Payload | Dirección |
|---|---|---|
| `player:join` | `{player_id, username, avatar_config, x, y}` | Server → All clients |
| `player:move` | `{player_id, x, y, dir}` | Client → Server → Others |
| `player:chat` | `{player_id, username, message, x, y}` | Client → Server → All |
| `player:leave` | `{player_id}` | Server → All clients |
| `player:equip` | `{player_id, slot, product_id}` | Client → Server → All |

### 4.6 Presencia de otros jugadores

| Aspecto multijugador | Especificación |
|---|---|
| Modelo | Authoritative server (Supabase valida) |
| Sync rate | ~15 position updates/seg por jugador |
| Interpolación | Client-side interpolation (lerp 0.18) |
| Capacidad MVP | Hasta 30 jugadores simultáneos |
| Nameplate | Username flotante sobre cada waspi |
| Equipped visible | Otros jugadores ven tu ropa equipada en tiempo real |

---

## 5. Sistemas de Juego

### 5.1 Sistema de avatar

| Parámetro | Opciones MVP |
|---|---|
| Color de piel | 6 tonos (claro a oscuro) |
| Color de ojos | 6 colores |
| Color de pelo | 6 colores |
| Estilo de pelo | 4 estilos (spiky, flat, mohawk, none) |
| Ropa superior | Dinámico según inventario |
| Ropa inferior | Dinámico según inventario |

### 5.2 Sistema de clothing

Capas de rendering (abajo hacia arriba):
1. Sombra (ellipse en el piso)
2. Piernas base (color de piel)
3. Ropa inferior (cargo, pantalón)
4. Cuerpo/torso base (color de piel)
5. Ropa superior (remera, hoodie)
6. Brazos (color de piel, swing animado)
7. Cabeza (círculo, color de piel)
8. Pelo (según estilo y color)
9. Ojos (esclerótica + pupila + brillo)
10. Accesorios (gorras, lentes — post-MVP)

### 5.3 Movimiento y colisión

| Aspecto | Especificación |
|---|---|
| Input | WASD/flechas (desktop), joystick virtual (mobile) |
| Velocidad | 180 px/seg (delta-time based) |
| Colisión | Zona de edificios con detección de puertas |
| Dirección | 4 direcciones, afecta sprite |
| Cámara | Smooth lerp (0.1), clamped a world bounds |
| Diagonal | Normalizado (×0.707) |

### 5.4 Sistema de interacción

| Tipo | Trigger | Resultado |
|---|---|---|
| Puerta de edificio | Proximidad + SPACE | Transición suave (fade 300ms) |
| NPC | Proximidad + SPACE | Diálogo typewriter |
| Producto en estante | Proximidad | Tooltip con nombre y precio |
| Máquina arcade | Proximidad + SPACE | Lanza minijuego |
| Espejo (Tu Casa) | Proximidad + SPACE | Abre character creator |
| Armario (Tu Casa) | Proximidad + SPACE | Abre inventario de ropa |
| Otro jugador | Click derecho / long-press | Ver perfil, reportar, mutear |
| Banca | Proximidad + SPACE | Waspi se sienta (cosmético) |

---

## 6. Economía: TENKS

### 6.1 Qué son los TENKS

Moneda virtual exclusiva del ecosistema del juego. **No tiene valor monetario real**, no se puede comprar con dinero, no se puede retirar ni transferir. Existe para generar engagement.

> ⚠️ Los TENKS NO se usan para comprar ropa física. La ropa real se paga con dinero real via Stripe. Esta separación evita confusión legal sobre monedas virtuales con valor real.

### 6.2 Cómo se obtienen

| Fuente | Cantidad | Frecuencia |
|---|---|---|
| Registro (welcome bonus) | 5.000 TENKS | Una vez |
| Login diario | 100 TENKS | Diario (+50 por día consecutivo) |
| Ganar minijuego (penales 3+ goles) | 300 TENKS | Por partida |
| Ganar minijuego (básquet 5+ seguidos) | 500 TENKS | Por partida |
| Completar logro | 200–1000 TENKS | Una vez por logro |
| Referir un amigo que compra | 1.000 TENKS | Por referido |
| Evento especial/drop | Variable | Eventos temporales |

### 6.3 En qué se gastan

| Uso | Costo |
|---|---|
| Items cosméticos exclusivos | 500–3000 TENKS |
| Personalizar Tu Casa | 200–1000 TENKS (post-MVP) |
| Entrada a eventos especiales | 500 TENKS |
| Cambiar color de burbuja de chat | 300 TENKS |
| Efecto especial al caminar (estela, partículas) | 1000 TENKS |

---

## 7. Minijuegos

### 7.1 Filosofía

Los minijuegos cumplen tres funciones: **engagement** (razón para quedarse), **viralización** (scores compartibles), y **conversión** (descuentos como reward).

### 7.2 Penales (MVP)

| Aspecto | Detalle |
|---|---|
| Mecánica | Timing: indicador móvil sobre el arco, click/tap para disparar |
| Dificultad | Arquero aleatorio, ~40% chance de atajada |
| Rondas | 5 tiros |
| Reward TENKS | 3+ goles = 300 TENKS |
| Reward descuento | 3+ goles = cupón 10% (uso único, vence 48hs) |
| Duración | ~45 segundos |

### 7.3 Básquet (Post-MVP #1)

| Aspecto | Detalle |
|---|---|
| Mecánica | Arrastre para ángulo/fuerza, física parabólica |
| Formato | Tiros libres, streak counter |
| Reward | 5+ seguidos = 500 TENKS + item cosmético exclusivo |

### 7.4 Pipeline futuro

- **Carrera de waspis:** multiplayer async, mejor tiempo vs leaderboard
- **Ruleta diaria:** spin gratis 1x/día, prizes de 100–1000 TENKS o descuento
- **Trivia streetwear:** preguntas de cultura urbana, 5 correctas = reward
- **Piedra papel tijera vs vendedor:** ganar = descuento flash de 5 minutos

---

## 8. Sistema Comercial

### 8.1 Flujo de compra

1. Jugador entra a la Waspi Store caminando por la calle
2. Se acerca al vendedor NPC y presiona SPACE
3. Diálogo con el vendedor (personalidad, recomendaciones)
4. Se abre panel de shop (overlay in-game)
5. Jugador selecciona producto, elige talle
6. Click COMPRAR → `POST /api/checkout` → Stripe Checkout (nueva tab)
7. Pago exitoso → webhook → item en inventario virtual
8. El waspi equipa la prenda automáticamente
9. Email de confirmación + envío físico

### 8.2 Catálogo MVP

| SKU | Producto | Precio | Tipo virtual | Color |
|---|---|---|---|---|
| TEE-BLK-01 | Remera Negra WASPI | $15.000 ARS | tee | `#1A1A1A` |
| TEE-WHT-01 | Remera Blanca WASPI | $15.000 ARS | tee | `#E8E8E8` |
| TEE-RED-01 | Remera Roja LIMITED | $22.000 ARS | tee | `#D94444` |
| CRG-BLK-01 | Cargo Negro | $35.000 ARS | cargo | `#1A1A1A` |
| CRG-OLV-01 | Cargo Olive | $35.000 ARS | cargo | `#556B2F` |
| HOD-GRY-01 | Hoodie Gris WASPI | $45.000 ARS | hoodie | `#555555` |

### 8.3 Vendedor NPC — Fases

| Modo | Fase | Descripción |
|---|---|---|
| NPC Scriptado | MVP | Diálogos fijos, abre panel de shop |
| IA Conversacional | v2 | Agente Claude, recomienda según historial |
| Humano en vivo | v3 | El dueño controla un waspi vendedor en real-time |

### 8.4 Descuentos de minijuegos

Cupónes via **Stripe Coupons API**. Cada cupón: uso único, 48hs de vencimiento, vinculado al `player_id`. Validación server-side — el client no puede fabricar descuentos.

---

## 9. Tech Stack

### 9.1 Arquitectura

Tres capas:
- **Game Client:** Phaser 3 en browser (rendering e input)
- **Backend API:** Next.js API Routes + Vercel Functions (lógica de negocio y pagos)
- **Real-time Layer:** Supabase Realtime (chat, presencia, sync de posiciones)

El game client es **untrusted** — toda acción crítica (compras, TENKS, descuentos) se valida server-side.

### 9.2 Stack detallado

| Capa | Tecnología | Justificación |
|---|---|---|
| Game Engine | Phaser 3.80+ | Escenas, física Arcade, tilemap nativo, cámara con follow/bounds |
| Frontend shell | Next.js 16 | Landing, SEO, auth flow, carga del juego |
| Pagos | Stripe Checkout hosted | PCI compliance, Coupons API |
| Backend API | Next.js API Routes + Vercel Functions | REST endpoints |
| Real-time | Supabase Realtime (Channels) | Chat, presencia, sync de posiciones |
| Base de datos | Supabase PostgreSQL | Players, inventarios, orders, TENKS |
| Auth | Supabase Auth (magic link + Google + Discord) | Discord es clave para el target |
| Analytics | Plausible + custom events | Funnel in-game completo |
| Email | Resend | Confirmación de compra, welcome |
| Hosting | Vercel | CDN global, edge functions |

### 9.3 Estructura del proyecto

```
waspi-world/
  app/                          ← Next.js App Router
    page.tsx                    ← Landing page
    play/page.tsx               ← Monta el juego Phaser
    components/
      PhaserGame.tsx            ← Client component (dynamic import)
    api/
      checkout/route.ts         ← Stripe Checkout Session
      webhooks/stripe/route.ts  ← Webhooks
      player/route.ts           ← CRUD player state + TENKS
      shop/route.ts             ← Catálogo
      chat/moderate/route.ts    ← Moderación de chat
  src/
    game/
      scenes/
        BootScene.ts            ← Carga de assets y pantalla inicial
        WorldScene.ts           ← MUNDO ABIERTO PRINCIPAL ✅
        StoreInterior.ts        ← Interior tienda
        ArcadeInterior.ts       ← Interior arcade
        CafeInterior.ts         ← Interior café
        HouseInterior.ts        ← Interior casa
        PenaltyMinigame.ts      ← Minijuego penales
      systems/
        AvatarRenderer.ts       ← Rendering con capas de ropa ✅
        CameraSystem.ts         ← Smooth follow + culling
        ChatSystem.ts           ← Burbujas + chat log + input ✅
        MultiplayerSync.ts      ← Presencia, posición, interpolación ✅
        DialogSystem.ts         ← Diálogos NPC typewriter
        ShopSystem.ts           ← Panel de compra + Stripe bridge
        InventorySystem.ts      ← Items + equipamiento
        TenksSystem.ts          ← Economía virtual TENKS
        MinigameManager.ts      ← Registro y launch de minijuegos
      config/
        constants.ts            ← Colores, velocidades, timings ✅
        eventBus.ts             ← Event bus React ↔ Phaser ✅
        world.ts                ← Tilemap refs, spawn points, zones
        catalog.ts              ← Productos virtual + real
        npcs.ts                 ← NPCs, diálogos, posiciones
    lib/
      stripe.ts
      supabase.ts               ✅
      realtime.ts
  public/
    assets/
      tilemaps/                 ← JSON exports de Tiled
      tilesets/                 ← Tilesheet PNGs
      sprites/                  ← Personajes, NPCs
      ui/                       ← HUD, iconos, frames
      audio/                    ← SFX, ambient
```

---

## 10. Modelo de Datos

### 10.1 Tabla: `players`

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | = auth.users.id |
| username | TEXT UNIQUE NOT NULL | Visible en nameplate y chat |
| avatar_config | JSONB NOT NULL | `{bodyColor, eyeColor, hairColor, hairStyle}` |
| equipped_top | TEXT (FK → products.id) | Nullable |
| equipped_bottom | TEXT (FK → products.id) | Nullable |
| tenks | INTEGER DEFAULT 5000 | Saldo de TENKS |
| achievements | JSONB DEFAULT '[]' | IDs desbloqueados |
| chat_color | TEXT DEFAULT '#FFFFFF' | Color de burbuja |
| is_muted | BOOLEAN DEFAULT false | Muted por moderación |
| muted_players | JSONB DEFAULT '[]' | IDs silenciados por este user |
| last_position | JSONB | `{x, y, zone}` para re-entry |
| login_streak | INTEGER DEFAULT 0 | Días consecutivos |
| last_login_date | DATE | Para calcular streak |
| created_at | TIMESTAMPTZ | now() |
| updated_at | TIMESTAMPTZ | Trigger |

### 10.2 Tabla: `products`

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT (PK) | SKU |
| name | TEXT NOT NULL | Nombre visible |
| price_ars | INTEGER NOT NULL | Centavos |
| stripe_price_id | TEXT | ID en Stripe |
| category | TEXT NOT NULL | tee, cargo, hoodie, accesorio |
| virtual_type | TEXT NOT NULL | Para engine de rendering |
| virtual_color | TEXT NOT NULL | Hex |
| sizes | JSONB | `[{size, stock}]` |
| tenks_price | INTEGER | Si es comprable con TENKS (cosmético only) |
| is_active | BOOLEAN DEFAULT true | Visibilidad |
| is_limited | BOOLEAN DEFAULT false | Badge LIMITED |

### 10.3 Tabla: `player_inventory`

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | |
| player_id | UUID (FK) | |
| product_id | TEXT (FK) | |
| acquired_via | TEXT NOT NULL | purchase, minigame, tenks, promo |
| order_id | UUID (FK) | Si fue compra real |
| created_at | TIMESTAMPTZ | |

### 10.4 Tabla: `orders`

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | |
| player_id | UUID (FK) | |
| stripe_session_id | TEXT UNIQUE | |
| items | JSONB NOT NULL | Snapshot con talle |
| subtotal | INTEGER NOT NULL | Centavos |
| total | INTEGER NOT NULL | Centavos |
| currency | TEXT DEFAULT 'ars' | ars \| usd |
| status | TEXT DEFAULT 'pending' | pending, paid, shipped, delivered, cancelled |
| shipping_address | JSONB | |
| discount_code | TEXT | Cupón usado |
| discount_percent | INTEGER | % aplicado |
| tracking_number | TEXT | Al despachar |

### 10.5 Tabla: `discount_codes`

| Campo | Tipo | Notas |
|---|---|---|
| code | TEXT (PK) | Código único |
| player_id | UUID (FK) | |
| percent_off | INTEGER NOT NULL | 5–30 |
| source | TEXT NOT NULL | penalty_win, basquet_streak, promo |
| used | BOOLEAN DEFAULT false | Uso único |
| expires_at | TIMESTAMPTZ | 48hs default |

### 10.6 Tabla: `chat_messages`

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | |
| player_id | UUID (FK) | |
| username | TEXT NOT NULL | Denormalized |
| message | TEXT NOT NULL | Max 140 chars |
| zone | TEXT | Zona donde se envió |
| x | FLOAT | Posición X |
| y | FLOAT | Posición Y |
| created_at | TIMESTAMPTZ | |

> Se purga automáticamente cada 48hs via pg_cron. Solo se retiene para moderación.

### 10.7 Tabla: `game_sessions`

| Campo | Tipo | Notas |
|---|---|---|
| player_id | UUID (FK) | |
| minigame | TEXT NOT NULL | penalty, basquet, etc |
| score | INTEGER | |
| result | TEXT | win, lose |
| tenks_earned | INTEGER DEFAULT 0 | |
| reward_code | TEXT | Descuento si aplica |

### 10.8 Tabla: `tenks_transactions`

| Campo | Tipo | Notas |
|---|---|---|
| player_id | UUID (FK) | |
| amount | INTEGER NOT NULL | Positivo = ingreso, negativo = gasto |
| reason | TEXT NOT NULL | welcome_bonus, daily_login, minigame_win, etc |
| balance_after | INTEGER NOT NULL | Saldo resultante |

---

## 11. Experiencia Mobile

| Control desktop | Equivalente mobile |
|---|---|
| WASD / Flechas | Joystick virtual (thumb pad inferior izquierdo) |
| SPACE (interactuar) | Botón A (inferior derecho) |
| ENTER (chat) | Tap en barra de chat |
| ESC (cerrar) | Botón X o swipe down |
| Click (minijuegos) | Tap |

- Canvas escalado a 100% viewport width, aspect ratio mantenido
- HUD reposicionado para no tapar controles táctiles
- Chat log minimizado por default en mobile
- Shop panel full-screen en mobile
- Character creator usa sliders en vez de grilla de colores

---

## 12. Seguridad

- HTTPS obligatorio (Vercel automático)
- Stripe Checkout hosted — nunca se tocan datos de tarjeta
- Verificación de firma en webhooks de Stripe
- Supabase RLS: players solo acceden a sus datos, products lectura pública
- API keys en env vars, nunca expuestas al client
- Rate limiting en `/api/checkout` y `/api/chat`
- Validación server-side de discount codes y TENKS (client untrusted)
- Anti-cheat: scores validados en server, TENKS nunca se modifican client-side
- WebSocket auth: token de Supabase Auth requerido para conectarse al canal
- CSP headers en Next.js shell
- Posiciones de jugadores validadas server-side (no teleport cheats)

---

## 13. Timeline de Desarrollo

| Semana | Entregable | Estado |
|---|---|---|
| 1–2 | **Foundation** — scaffold, rendering base del waspi, character creator, movimiento + colisión | ✅ Completo |
| 3–4 | **Open World** — tilemap con Tiled, cámara smooth, zonas exteriores, transiciones, NPCs ambient | 🔄 Parcial (mundo dibujado programáticamente) |
| 5–6 | **Interiores + Shop** — 5 interiores, sistema de diálogo, panel de shop, Stripe, clothing visual | ⏳ Pendiente |
| 7–8 | **Multiplayer + Chat** — WebSocket setup, presencia, sync, burbujas, moderación | ✅ Completo (Supabase Realtime) |
| 9–10 | **TENKS + Minijuegos** — economía TENKS, minijuego penales, descuentos, login streak, auth | ⏳ Pendiente |
| 11–12 | **Mobile + Polish** — controles táctiles, responsive, audio, performance, landing page | ⏳ Pendiente |
| 13–14 | **Lanzamiento** — productos reales, smoke testing, analytics, dominio custom, soft launch | ⏳ Pendiente |

---

## 14. Costos Operativos

| Servicio | Tier | Costo mensual |
|---|---|---|
| Vercel | Free / Pro ($20) | $0–$20 USD |
| Supabase | Free (500MB, 50k MAU, Realtime included) | $0 USD |
| Stripe | Pay-as-you-go | 2.9% + $0.30/tx |
| Dominio | Anual | ~$1 USD/mes |
| Cloudinary | Free (25GB) | $0 USD |
| Resend | Free (3k emails/mes) | $0 USD |
| Plausible | Cloud | $9 USD |
| **TOTAL** | | **$1–$30 USD/mes** |

---

## 15. Métricas de Éxito

| Métrica | Target MVP | Medición |
|---|---|---|
| Tasa de creación de avatar | > 80% de visitantes | avatar_created / page_view |
| Tiempo promedio en el mundo | > 5 minutos | Duración sesión |
| Mensajes de chat por sesión | > 3 | chat_messages / sessions |
| Rooms visitadas por sesión | > 3 | room_entered events |
| Tasa de apertura de shop | > 40% | shop_opened / avatar_created |
| Conversión shop → compra | > 5% | purchase_completed / shop_opened |
| Minijuegos por sesión | > 0.5 | minigame_played / sessions |
| Descuentos canjeados | > 30% de otorgados | discount_used / discount_earned |
| Retención D7 | > 15% | Players que vuelven a los 7 días |
| TENKS gastados / ganados | > 40% ratio | Salud de la economía virtual |

---

## 16. Criterios de Aceptación del MVP

1. Un jugador puede crear su waspi, salir de su casa al mundo abierto, caminar libremente por la calle, y entrar a cualquiera de los 4 locales sin pantallas de carga
2. Otros jugadores son visibles en el mundo en tiempo real con su avatar y ropa equipada
3. El chat funciona: escribir un mensaje muestra una burbuja sobre el waspi visible para otros jugadores cercanos
4. El flujo de compra completo funciona: hablar con vendedor → shop → Stripe → item en inventario → prenda visible en el waspi
5. El minijuego de penales otorga TENKS y cupón de descuento aplicable en el checkout real
6. La economía de TENKS funciona: se ganan, se gastan, se muestran en el HUD, y se persisten entre sesiones
7. La experiencia es jugable en mobile con controles táctiles a 60fps
8. Se completó al menos una compra real end-to-end en producción
9. El chat tiene moderación básica funcional (filtro de palabras, rate limit, mute)

---

## 17. Decisiones Abiertas

| Pregunta | Impacto | Responsable |
|---|---|---|
| ¿Nombre final de marca / dominio? | Todo | Marca |
| ¿Sprites internos o tercerizado? | Timeline + presupuesto | Marca + Dev |
| ¿Música/SFX? ¿Licenciada u original? | Experiencia inmersiva | Marca |
| ¿Nombre y personalidad del vendedor NPC? | Diálogos, branding | Marca |
| ¿Catálogo final con talles y precios? | Stripe + DB | Marca |
| ¿Auth requerido para explorar o solo para comprar/chatear? | Fricción de onboarding | Producto |
| ¿Moneda (ARS, USD, ambas)? | Stripe, UI | Marca + Dev |
| ¿Mercado Pago desde día 1? | Agrega ~1 semana | Marca + Dev |
| ¿Hay TENKS-only items desde el día 1? | Contenido del shop | Producto |

---

## 18. Roadmap Post-MVP

| Fase | Features | Estimación |
|---|---|---|
| v1.1 | Más minijuegos (básquet, trivia), Mercado Pago, items cosméticos con TENKS, ruleta diaria | 3–4 semanas |
| v1.2 | Vendedor IA conversacional (Claude), recomendaciones, guía de talles interactiva | 4–6 semanas |
| v2.0 | Customización de Tu Casa, ciclo día/noche, emotes animados | 4–6 semanas |
| v2.1 | Vendedor humano en vivo, spectate mode en arcade, leaderboards globales | 6–8 semanas |
| v3.0 | Nuevas zonas (expandir mapa), eventos temporales (drops, pop-up stores) | Ongoing |
| v3.1 | Mobile app nativa, push notifications, marketplace P2P | 8–10 semanas |

---

## 19. Estado del Desarrollo

> Última actualización: **2026-03-13**

### ✅ Completado (Semanas 1–2)

- **Scaffold:** Next.js 16 + Phaser 3 + Supabase + Stripe instalados
- **WorldScene:** Mundo 2D completo dibujado programáticamente
  - Calle principal con sidewalks, líneas de calle, faroles con glow
  - ARCADE (neón rosa), WASPI STORE (dorado pulsante), CAFÉ (neón naranja)
  - TU CASA (spawn point), PLAZA con fuente y bancas
  - Cielo con estrellas
- **AvatarRenderer:** Chibi waspi layerado con animación de caminata
- **ChatSystem:** Burbujas BoomBang-style (dorado=propio, azul=otros), fade out
- **MultiplayerSync:** Supabase Realtime broadcast (degradación elegante a solo mode)
- **Play page:** Overlay de chat con log + input + HUD de usuario
- **Landing page:** Pantalla de entrada al mundo
- **Build:** Pasa TypeScript + Turbopack sin errores

### 🔄 En progreso

- Supabase Realtime configurado y conectado (env vars listas)

### ⏳ Próximos pasos

- Interiores de edificios (Store, Arcade, Café, Casa)
- Sistema de diálogo NPC typewriter
- Panel de shop + Stripe Checkout
- Sistema de TENKS completo
- Minijuego de penales
- Auth (Supabase Auth: magic link + Google + Discord)
- Character creator completo
- Mobile controls (joystick virtual)
