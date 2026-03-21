# Voice chat (WebRTC / PeerJS) — Estado y brecha hacia producción

Documento de auditoría: **qué está implementado hoy** en Waspi World y **qué falta** para que la voz sea usable de forma fiable en internet (incl. despliegue en Vercel).

**Alcance:** solo el subsistema de **voz espacial P2P** (`VoiceChatManager`, integración en `WorldScene`, settings en React). No cubre chat de texto, economía ni otras APIs.

---

## 1. Resumen ejecutivo

| Área | Estado |
|------|--------|
| UX básica en juego (activar mic, mute, proximidad) | Implementado |
| Descubrimiento de peers (quién tiene voz) | Implementado vía Supabase Realtime **Presence** |
| Señalización WebRTC (oferta/respuesta) | Delegada a **PeerJS** (cliente) |
| NAT traversal | Solo **STUN** público (Google) |
| Relay cuando P2P falla (**TURN**) | **No** configurado |
| Servidor PeerJS propio | **No** — se usa el **cloud por defecto** de la librería |
| Credenciales ICE desde backend | **No** — no hay `/api/voice/ice` ni similar |
| Vinculación voz ↔ cuenta Supabase Auth | **No** — el ID de jugador en mundo es **por pestaña** (`sessionStorage`), no `user.id` |

**Conclusión:** en redes “amigables” (misma WiFi, NAT simple) puede funcionar. En producción heterogénea (móvil, CGNAT, oficinas) **falta TURN** y, para robustez, **infraestructura de signaling PeerJS** y opcionalmente **identidad estable** si se quiere auditar o moderar por usuario.

---

## 2. Arquitectura actual (cómo fluye la voz)

```
┌─────────────┐     Presence: player_id + voice_peer_id      ┌─────────────┐
│  Browser A  │◄─────────────────────────────────────────────►│   Supabase  │
│  (Phaser)   │           Realtime channel mundial             │   Realtime  │
└──────┬──────┘                                              └─────────────┘
       │
       │  PeerJS signaling (WebSocket HTTP a broker PeerJS)
       ▼
┌──────────────────┐              STUN              ┌──────────────────┐
│ PeerJS cloud     │◄──► Google stun.l.google.com   │  Browser B       │
│ (por defecto)    │      (solo descubre IP pública) │  (misma sala)    │
└──────────────────┘                                 └──────────────────┘
       │
       └── Media: WebRTC audio P2P (o falla si no hay ruta directa ni TURN)
```

1. **Identidad en sala:** `WorldScene` usa `playerId` = UUID en `sessionStorage` (`waspi_session_id`), **una por pestaña**.
2. **PeerJS ID:** `waspi-${playerId}` (ver `VoiceChatManager.init`).
3. **Presence:** al activar voz, se hace `channel.track({ player_id, voice_peer_id })` para publicar el PeerJS id.
4. **Descubrimiento:** eventos `presence: sync | join | leave` llaman a `callPeer` / `disconnectPeer` según `voice_peer_id`.
5. **Audio:** `getUserMedia` → `peer.call()` / `answer()` → `<audio>` con `srcObject` + volumen por distancia (`updateProximityVolumes`).

**Hosting (Vercel):** la app sirve HTML/JS por HTTPS; **no** transporta RTP de voz. Los media van entre navegadores (o por TURN si existiera). Vercel no sustituye PeerServer ni TURN.

---

## 3. Inventario — Lo que **tenemos** (código)

### 3.1 `VoiceChatManager` (`src/game/systems/VoiceChatManager.ts`)

- Dependencia **peerjs** `^1.5.5`.
- **ICE:** `iceServers` con dos STUN de Google; **sin TURN**.
- `Peer` creado como `new Peer(this.myPeerId, { config: ICE_SERVERS, debug: 1 })` — **sin** `host`, `path`, `key` personalizados → **broker público PeerJS**.
- Mic: `getUserMedia` con `echoCancellation`, `noiseSuppression`, `autoGainControl`; `deviceId` opcional.
- **Cambio de mic en caliente:** `switchMic` vía `replaceTrack`.
- **Conexiones:** `callPeer`, `handleIncomingCall` + `answer`.
- **Playback:** elementos `<audio>` ocultos, autoplay con manejo de políticas del navegador.
- Proximidad: `minDistance` 150, `maxDistance` 600, curva logarítmica por defecto.
- **VAD** local y por peer (Web Audio Analyser) para indicadores de “hablando”.
- **Salida Web Audio:** `applyOutputSink` (`setSinkId`) donde el navegador lo permite (Chrome/Edge típ.).
- **Limpieza:** `destroy`, cierre de streams y conexiones.

### 3.2 `voiceChatInstance.ts`

- Singleton `getVoiceChat()` / `destroyVoiceChat()` con config de proximidad por defecto.

### 3.3 `WorldScene` (`src/game/scenes/WorldScene.ts`)

- HUD: botón mic (`[MIC]` / `[MIC ON]` / `[MUTED]` / estados de error).
- **Prompt inicial** para habilitar voz (`waspi_voice_pref` on/off en `localStorage`).
- **`activateVoice`:** orden correcto: `init` PeerJS + mic → `track` presence con `voice_peer_id` → `connectToVoicePeersInRoom` (corrige carrera con sync).
- Reintento si el mic preferido dejó de existir (`NotFoundError` / `OverconstrainedError`).
- Tras primer grant de permiso en estado `prompt`, **reload** único (`waspi_voice_mic_grant_reload_done`) para estado limpio.
- Handlers: `handleVoicePresenceSync`, `handleVoicePresenceJoin`, `handleVoicePresenceLeave`.
- **Desactivar voz:** `track` solo `player_id` (quita `voice_peer_id`), `destroyVoiceChat`.
- **Bridge React:** `VOICE_MIC_CHANGED`, `VOICE_DISABLE`, `AUDIO_OUTPUT_SINK_CHANGED` (salida hacia voz/Phaser vía `GamePage` + `WorldScene`).
- **Proximidad en game loop:** cada ~5 frames, `updateProximityVolumes` con posiciones locales/remotas (mapeo `waspi-${playerId}` ↔ posición remota) — ver uso de `remotePlayers` y `peerId` en escena (~L6199).

### 3.4 Settings (`app/play/GamePage.tsx`)

- Pestaña **VOZ:** lista de micrófonos, desactivar voz.
- Pestaña **AUDIO:** salida Web Audio (`setSinkId`) donde aplica; nota de limitación con YouTube/jukebox.

### 3.5 Dependencias de producto ya cubiertas en código

- HTTPS en producción (requerido por `getUserMedia`) — asumido con Vercel.
- Consentimiento de usuario y mensajes de error básicos (denegado, sin mic, mic en uso).

---

## 4. Identidad y modelo

| Aspecto | Implementación actual | Implicación |
|---------|------------------------|-------------|
| `playerId` en mundo | UUID por **pestaña** (`sessionStorage`) | Mismo usuario con dos pestañas = dos peers de voz distintos (coherente con multijugador actual). |
| PeerJS id | `waspi-${playerId}` | Estable mientras viva la pestaña. |
| Usuario Supabase | No usado como `playerId` de voz | Moderación/reportes por “cuenta” no están amarrados al peer sin trabajo extra. |

**Brecha opcional:** si el PRD pide “voz por cuenta”, habría que alinear `playerId` o al menos `voice_peer_id` con políticas de auth (y manejar multi-dispositivo).

---

## 5. Lo que **falta** para producción fiable

### 5.1 Infraestructura WebRTC (crítico)

| Ítem | Por qué importa |
|------|------------------|
| **Servidor TURN** (con TLS/TURNS recomendable) | En muchas redes P2P **nunca** se establece con solo STUN; sin TURN el audio no llega. |
| **Credenciales TURN efímeras** | Evita publicar usuario/clave TURN en el cliente; lo habitual es un endpoint que devuelve `iceServers` con TTL. |
| **Integración en `VoiceChatManager`** | Ampliar `ICE_SERVERS` con `turn:` / `turns:` vía fetch al iniciar voz o al crear `Peer`. |

### 5.2 Signaling PeerJS (alto impacto en robustez)

| Ítem | Por qué importa |
|------|------------------|
| **PeerServer alojado** (Node u oferta gestionada) | El cloud público PeerJS tiene límites, latencia y disponibilidad no garantizada para un producto. |
| **Config cliente:** `host`, `port`/`443`, `path`, `secure: true`, opc. `key` | Hoy no está en código; hay que añadir variables de entorno `NEXT_PUBLIC_PEERJS_*` o similar. |
| **Despliegue:** no en Vercel serverless “puro” para WS largo | Opciones: VM, Fly.io, Railway, Render, un pequeño servicio always-on. |

### 5.3 Backend / seguridad

| Ítem | Estado |
|------|--------|
| API `GET/POST` para ICE (TURN) | Falta |
| Rate limit / auth en ese endpoint | Falta (recomendado: sesión Supabase) |
| Rotación de secretos TURN | Depende del proveedor (Twilio, Metered, Xirsys, coturn propio, etc.) |

### 5.4 Observabilidad y producto

| Ítem | Estado |
|------|--------|
| Métricas: % éxito de `connectionstate`, tiempo hasta `connected` | No visto en código |
| Telemetría de fallos PeerJS (`peer.on('error')`) hacia analytics | Parcial (console) |
| UX “reintentar conexión” / mensaje “red restrictiva” | Mejora sugerida cuando falle ICE |
| Pruebas en iOS Safari / Samsung Internet | Verificar manualmente (WebRTC + autoplay) |

### 5.5 Privacidad y cumplimiento (fuera de código)

- Política de grabación, edad mínima, jurisdicción (voz = dato personal).
- Posibilidad de **denunciar** usuario de voz (hoy hay mute/report en otros flujos; ver alineación con `playerId` de sesión).

---

## 6. Variables de entorno

**Hoy:** no hay vars dedicadas a voz en `.env.local.example` (solo Supabase, etc. según repo).

**Sugeridas para cerrar brechas:**

- `NEXT_PUBLIC_PEERJS_HOST`, `NEXT_PUBLIC_PEERJS_PORT`, `NEXT_PUBLIC_PEERJS_PATH`, `NEXT_PUBLIC_PEERJS_SECURE`
- TURN: mejor **no** en público; endpoint server-side con `TURN_*` o API del proveedor.

---

## 7. Riesgos resumidos

1. **Sin TURN:** alta tasa de fallos silenciosos o intermitentes según red del jugador.
2. **PeerJS público:** punto único de dependencia y poco control operativo.
3. **Identidad por pestaña:** coherente con el juego actual; puede complicar soporte o moderación “por cuenta”.
4. **Coste TURN:** el tráfico relay es de pago en la mayoría de proveedores; conviene límites y monitoring.

---

## 8. Checklist propuesto (orden sugerido)

1. [ ] Contratar o desplegar **TURN** (y probar desde red móvil + otra ISP).
2. [ ] Añadir **route handler** Next.js que devuelva `RTCIceServer[]` autenticado (p. ej. token Supabase).
3. [ ] Inyectar esos servidores al crear `Peer` / al iniciar llamadas en `VoiceChatManager`.
4. [ ] Desplegar **PeerServer** propio y configurar el cliente con env vars.
5. [ ] Probar E2E en **Vercel** (HTTPS) con dos dispositivos reales.
6. [ ] (Opcional) Alinear documentación PRD y soporte con modelo de identidad (cuenta vs sesión).

---

## 9. Referencias en repo

| Archivo | Rol |
|---------|-----|
| `src/game/systems/VoiceChatManager.ts` | WebRTC + PeerJS + ICE (solo STUN) |
| `src/game/systems/voiceChatInstance.ts` | Singleton |
| `src/game/scenes/WorldScene.ts` | Presence, UI mic, proximidad, ciclo de vida |
| `app/play/GamePage.tsx` | Settings mic / salida audio |
| `package.json` | `peerjs` |

---

*Última revisión según código del repo al generar este documento. Actualizar al implementar TURN/PeerServer.*
