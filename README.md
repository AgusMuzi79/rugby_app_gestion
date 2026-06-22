# UNCAS Rugby Club — App de Gestión Operativa

App interna para el cuerpo técnico y organizativo del club. Digitaliza procesos hoy manejados por WhatsApp, planillas en papel y documentos físicos.

**~60 usuarios de staff · 1.000+ socios · 17 planteles · MVP en distribución interna**

---

## ¿Qué problema resuelve?

El club manejaba todo por WhatsApp y planillas físicas: asistencias, lesiones, fichajes, cobranzas, comunicados. La app centraliza esos procesos en una sola herramienta con roles diferenciados, historial, notificaciones automáticas y acceso móvil desde la cancha.

---

## Módulos del producto

### v1 — Gestión Operativa (completo ✅)
Herramientas del día a día para el cuerpo técnico: asistencia, lesiones, fichajes, cobranzas, resultados, calendario, notificaciones y dashboard por rol.

### v2 — Módulo Socios (completo ✅)
Gestión de los socios del club: carnet digital QR con TOTP rotativo, cuotas mensuales, pagos con MercadoPago o manual, débito automático con tarjeta, foto de carnet, servicios opcionales, panel web para secretaría.

### v3 — Multi-rol, Calendario y Comunicaciones (completo ✅)
Un socio puede tener también un rol de staff. Calendario del socio con sus partidos y resultados. Noticias con audiencia segmentada. Cancelación de entrenamiento con notificación push automática a los jugadores.

---

## Roles de usuario

| Rol | Acceso | Responsabilidad |
|---|---|---|
| **Subcomisión** | App mobile + Panel web | Visión global del club. Administración del sistema (alta/baja usuarios). Notificaciones masivas. |
| **Coordinador** | App mobile | Gestiona calendario y divisiones. Alerta de inasistencias. |
| **Entrenador** | App mobile | Toma asistencia, registra lesiones, carga resultados de partido. |
| **Manager** | App mobile | Gestiona cobranzas y fichajes de su equipo. |
| **Secretaría** | Panel web | Alta de socios, gestión de cuotas y pagos, noticias institucionales, servicios opcionales. |
| **Portería** | App mobile | Escanea carnet QR de socios para validar acceso. |
| **Socio** | App mobile | Ve su carnet digital QR, historial de cuotas, noticias del club, servicios contratados. |

> Todo usuario de staff es socio primero. Un mismo usuario puede tener múltiples roles y cambiar la vista activa desde "Mi Perfil".

---

## Stack tecnológico

| Capa | Tecnología | Notas |
|---|---|---|
| App mobile | React Native + Expo SDK 54 (TypeScript) | iOS y Android. Distribución interna via EAS. |
| Panel web | Next.js 16 + TypeScript + Tailwind v4 | Deploy en Vercel. Dos paneles en el mismo repo: subcomisión y secretaría. |
| Auth | Supabase Auth | Email + contraseña. Contraseña inicial = DNI. RLS por rol en todas las tablas. |
| Base de datos | PostgreSQL via Supabase | 18+ tablas, 40+ políticas RLS. |
| Realtime | Supabase Realtime | Suscripciones en dashboard y feed de noticias. |
| Storage | Supabase Storage | Fotos de socios, documentos de fichajes, comprobantes, noticias. |
| Lógica server-side | Supabase Edge Functions (TypeScript/Deno) | 6 funciones deployadas en cloud. |
| Push notifications | Expo Push API | Disparadas desde Edge Functions. Requiere Firebase en Android. |
| Pagos | MercadoPago | Checkout Pro + débito automático con tarjeta guardada. |
| Email | Resend | Email de bienvenida al crear usuario staff. |
| Offline | AsyncStorage + cola de sync (NetInfo) | Asistencia y lesiones funcionan sin conexión. |
| Deploy mobile | Expo EAS | Internal distribution. Sin App Store en MVP. |
| Deploy web | Vercel | Auto-deploy en push a `main`. |

---

## Estructura del repositorio

```
rugby_app_gestion/
├── app/                        # App Expo (mobile)
│   ├── app/
│   │   ├── _layout.tsx         # Root layout: auth guard, deep links (reset-password, invite)
│   │   ├── index.tsx           # Redirect a /(auth)/login
│   │   ├── (auth)/             # Login, forgot-password, reset-password, registro
│   │   ├── (subcomision)/      # Diario, Usuarios, Crónica, Eventos, Informes, Notificaciones
│   │   ├── (coordinador)/      # Diario, Calendario, Asistencia, Crónica
│   │   ├── (entrenador)/       # Diario, Asistencia, Partido, Lesiones, Crónica
│   │   ├── (manager)/          # Diario, Cobranzas, Fichajes, Crónica
│   │   ├── (secretaria)/       # Diario, Socios, Noticias, Sobre
│   │   ├── (porteria)/         # Scanner QR, Sobre
│   │   └── (socio)/            # Carnet QR, Cuotas, Noticias, Calendario, Sobre
│   ├── components/
│   │   ├── shared/             # Header, CronicaScreen, SobreScreen, StripeBackground
│   │   └── ui/                 # DatePickerField
│   ├── constants/
│   │   ├── theme.ts            # Sistema de diseño (colores, fuentes)
│   │   └── roles.ts            # Mapeo rol → ruta de navegación
│   ├── contexts/
│   │   └── ThemeContext.tsx    # ThemeProvider + useTheme()
│   ├── hooks/                  # Un hook por pantalla + hooks de dominio
│   ├── lib/
│   │   ├── supabase.ts         # Cliente Supabase con AsyncStorage
│   │   ├── notifications.ts    # Registro de push tokens via RPC
│   │   ├── offlineQueue.ts     # Cola de operaciones offline
│   │   ├── totp-client.ts      # TOTP RFC 6238 en JS puro (Hermes-compatible)
│   │   └── database.types.ts   # Tipos generados por Supabase CLI
│   └── stores/
│       └── authStore.ts        # Zustand: session, rol, roles[], rolActivo
│
├── web/                        # Panel web Next.js
│   └── app/
│       ├── login/              # Login compartido (redirige según rol)
│       ├── (subcomision)/      # Panel subcomisión — guard rol subcomision/admin
│       │   ├── dashboard/      # Stats globales
│       │   ├── usuarios/       # Gestión de usuarios staff
│       │   ├── divisiones/     # Alta y toggle de divisiones
│       │   └── informes/       # Asistencia, resultados, fichajes, financiero
│       └── (secretaria)/       # Panel secretaría — guard rol secretaria/admin
│           └── secretaria/
│               ├── socios/     # CRUD socios, pagos, tarjeta, foto, servicios
│               ├── noticias/   # CRUD noticias con publicación/borrador
│               ├── servicios/  # CRUD servicios opcionales
│               └── categorias/ # CRUD categorías de membresía
│
├── supabase/
│   ├── migrations/             # SQL migrations versionadas (21 migraciones)
│   └── functions/              # Edge Functions (TypeScript/Deno)
│       ├── admin-usuarios/     # Gestión de usuarios staff
│       ├── admin-socios/       # Alta y gestión de socios
│       ├── socios-qr/          # Carnet QR + validación TOTP
│       ├── socios-pagos/       # Pagos MP, débito automático, cobro mensual
│       ├── notifications/      # Push notifications
│       └── _shared/            # supabase-admin.ts, cors.ts, totp.ts
│
├── openspec/
│   └── specs/                  # 37 user stories en 7 dominios
├── prd.md                      # PRD original
└── CLAUDE.md                   # Contexto técnico para el agente IA
```

---

## Pantallas implementadas

### App mobile — Staff

#### Subcomisión
| Pantalla | Descripción |
|---|---|
| **Diario** | Dashboard global: stats de asistencia, lesiones activas, fichajes recientes, notificaciones |
| **Usuarios** | Lista, detalle, crear usuario staff (nuevo o asignando rol a socio existente), desactivar, reactivar |
| **Crónica** | Feed 7 días: lesiones, fichajes, resultados, notificaciones. Botón nueva notificación push |
| **Eventos** | Eventos de recaudación activos e historial. Crear, ver detalle con cobranzas, cerrar |
| **Informes** | 4 tabs: Asistencia per-jugador, Resultados (W/L/D), Fichajes, Financiero por forma de pago |
| **Notificaciones** | Enviar push segmentado por rol. Historial |

#### Coordinador
| Pantalla | Descripción |
|---|---|
| **Diario** | Eventos de la semana, alertas de inasistencia, barras de asistencia por división |
| **Calendario** | Lista de eventos con rango -30/+60 días. Crear evento con date picker. Cancelar con mensaje |
| **Asistencia** | Vista de ausencias por jugador. Badge de 4 ausencias consecutivas. Selector de división |

#### Entrenador
| Pantalla | Descripción |
|---|---|
| **Diario** | Próximo evento, tareas pendientes (resultado faltante, mesa, lesiones recientes) |
| **Asistencia** | Check presente/ausente/justificado. Funciona offline con sync posterior. Push al detectar 4 ausencias |
| **Partido** | Flujo 4 pasos: selección equipo → asistencia → mesa (≤15 titulares, ≤8 suplentes) → resultado |
| **Lesiones** | Registro con grado 1-5, fecha, descripción. Online (DB + push) o offline (cola de sync) |

#### Manager
| Pantalla | Descripción |
|---|---|
| **Diario** | Cobranzas activas con % de avance, pedidos globales de subcomisión, últimos fichajes |
| **Cobranzas** | Registro de pago por jugador: estado (Pagado/Pendiente), monto, forma de pago |
| **Fichajes** | Alta de jugador con datos y upload de documentos (DNI, ficha médica) a Supabase Storage |

### App mobile — Socios y roles v2

#### Secretaría
| Pantalla | Descripción |
|---|---|
| **Diario** | Stats del módulo socios: activos, morosos, pendientes, inactivos. Últimos 6 pagos |
| **Socios** | Lista con filtro por estado, búsqueda. Detalle completo con foto, validación, pago manual, tarjeta, servicios |
| **Noticias** | CRUD de noticias. Toggle publicado/borrador |

#### Portería
| Pantalla | Descripción |
|---|---|
| **Scanner** | Cámara con visor QR. Escanea carnet, valida TOTP vía Edge Function, muestra nombre y foto del socio |

#### Socio
| Pantalla | Descripción |
|---|---|
| **Carnet** | QR con código TOTP rotativo cada 30 segundos. Barra de progreso de expiración |
| **Cuotas** | Historial de cuotas y pagos. Botón "Pagar" abre checkout de MercadoPago |
| **Noticias** | Feed de noticias del club. Filtro por deporte (rugby / hockey / tenis) |
| **Calendario** | Partidos y resultados. Badge "MI EQUIPO" si el socio es jugador. Filtro por deporte |
| **Mi Perfil** | Foto editable, nombre, cambiar contraseña, selector de vista activa si tiene múltiples roles |

### Panel web — Subcomisión
| Ruta | Descripción |
|---|---|
| `/dashboard` | 4 stat cards: asistencia global, fichados, lesiones activas, cobranzas |
| `/usuarios` | Gestión de usuarios staff. Tabs: asignar rol a socio existente / crear usuario nuevo |
| `/divisiones` | Lista activas/inactivas, toggle, crear (con categoría y deporte) |
| `/informes` | 4 tabs: Asistencia, Resultados, Fichajes, Financiero — selector de división |

### Panel web — Secretaría
| Ruta | Descripción |
|---|---|
| `/secretaria/socios` | Tabla con búsqueda y filtro. Alta de socio, detalle completo, pago manual, asociar tarjeta, foto, servicios opcionales |
| `/secretaria/noticias` | CRUD de noticias. Filtro por deporte. Publicar/despublicar. Push al publicar |
| `/secretaria/servicios` | CRUD de servicios opcionales (natación, hockey, etc.) con monto mensual |
| `/secretaria/categorias` | CRUD de categorías de membresía (Activo, Adherente, Juvenil, Vitalicio) con cuota mensual |

---

## Base de datos

### Schema v1 (migraciones `20260506` y `20260507`)
18 tablas principales: `profiles`, `divisiones`, `jugadores`, `eventos`, `asistencias`, `lesiones`, `resultados`, `mesas_partido`, `jugadores_mesa`, `cobranzas`, `eventos_financieros`, `fichajes`, `notificaciones`, `push_tokens`, `protocolos_lesion`, `protocolo_pasos`, `protocolo_alertas`, `grtp_etapas`.

### Schema v2 — Módulo Socios (migración `20260601`)
6 tablas nuevas:

| Tabla | Descripción |
|---|---|
| `categorias_socio` | Categorías de membresía con `monto_mensual` |
| `socios` | Registro central. Estado: `pendiente / activo / moroso / inactivo`. `numero_socio` auto-generado. |
| `socios_secrets` | TOTP secret base32. Sin políticas RLS — solo service role via Edge Functions. |
| `cuotas` | Una por socio por período (YYYY-MM). `monto` = snapshot de la categoría al momento del pago. |
| `pagos_socios` | Cada pago individual. `mp_payment_id` UNIQUE para deduplicación de webhook. |
| `noticias` | Feed institucional. `publicada=false` = borrador. `audiencia`: `todos` o `cuerpo_tecnico`. |

### Schema v3 — Multi-rol y Comunicaciones (migraciones `20260616`)
- `profiles.roles TEXT[]` — array de todos los roles del usuario
- `jugadores.socio_id` — link entre jugador y socio del club
- `divisiones.deporte` — campo rugby/hockey/tenis
- `noticias.audiencia` + `division_id` + `generada_automaticamente`

### Seguridad — RLS
Todas las tablas tienen Row Level Security. Helper functions en DB:
- `get_rol()` → retorna `profiles.rol` del usuario autenticado (rol activo)
- `get_division_ids()` → retorna las divisiones asignadas al perfil
- `get_socio_id()` → retorna el `socios.id` del usuario autenticado

---

## Edge Functions

| Función | Acciones disponibles |
|---|---|
| `admin-usuarios` | `create` (nuevo usuario staff), `assign-role` (asigna rol a socio existente), `deactivate`, `reactivate`, `delete`, `getUser` |
| `admin-socios` | `create` (alta de socio), `deactivate`, `reactivate`, `validate-photo` (Rekognition + fallback manual) |
| `socios-qr` | `get-secret` (obtiene TOTP secret para el socio), `validate` (portería valida el QR) |
| `socios-pagos` | `checkout` (genera pago MP), `webhook` (recibe confirmación MP), `manual` (pago manual secretaría), `associate-card`, `remove-card`, `charge-card`, `cobro-mensual` (cron) |
| `notifications` | Push por tipo: `lesion`, `fichaje`, `ausencias_consecutivas`, `manual`, `cancelacion_entrenamiento` |

### Cobro automático con tarjeta
- `associate-card`: tokeniza tarjeta con CVV → guarda en MercadoPago customer
- `cobro-mensual`: cron diario 9am vía `pg_cron` → cobra socios con tarjeta, reintentos en días +1/+2/+3
- Al 4to fallo: push a secretaría + marca moroso
- `CRON_SECRET` autentica el job en Supabase

---

## Identidad visual

Tema fijo oscuro — sin toggle claro/oscuro.

| Token | Color | Uso |
|---|---|---|
| `fondo` | `#15110A` | Fondo de pantallas |
| `card` | `#1C1710` | Cards y superficies |
| `oro` | `#F5B41C` | Acento, botones primarios, tab activo |
| `texto` | `#F3EFE4` | Texto principal |
| `muted` | `#8E8574` | Texto secundario |
| `rojoUrgente` | `#C0392B` | Alertas urgentes (lesiones grado 3+) |

**Fuentes:** Barlow + Barlow Semi Condensed (web) / PlayfairDisplay + Lora + ArchivoNarrow (mobile)

**Patrón de rayas:** `body` y `.bg-papel` en web via `globals.css`. En mobile: `StripeBackground.tsx` existe pero está pendiente de reimplementación (SVG Pattern tiene bugs en Android).

---

## Deploy

### App mobile
- **Distribución interna** via Expo EAS (sin App Store ni Google Play en MVP).
- Último preview build Android: `dda1831f` (2026-06-18)
- EAS Project ID: `d363d962-7caf-4050-81fc-b70b493289ca`
- Scheme deep linking: `uncasrugby://`

```bash
cd app
eas build --profile preview --platform android    # APK standalone
eas build --profile development --platform android  # Dev build (requiere Metro)
```

### Panel web
- **URL producción:** https://web-chi-nine-26.vercel.app
- Proyecto Vercel: `agusmuzi79-4892s-projects/web`
- Auto-deploy en push a `main` (GitHub conectado)
- `rootDirectory=web` configurado en Vercel project settings

```bash
# Deploy manual desde la raíz del repo:
vercel --prod --yes
```

---

## Levantar el entorno local

Requiere Docker Desktop corriendo.

```bash
# Supabase local
supabase start
# Studio: http://127.0.0.1:54323
# DB:     postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Edge Functions (terminal separada)
supabase functions serve

# Regenerar tipos TypeScript
supabase gen types typescript --local > app/lib/database.types.ts

# App mobile
cd app && npx expo start

# Panel web
cd web && npm run dev   # http://localhost:3000
```

> **Nota:** Siempre usar `npx expo install <pkg>` (no `npm install`) para paquetes del ecosistema Expo — resuelve la versión SDK-compatible automáticamente.

> **Nota:** Usar `--legacy-peer-deps` en `npm install` en el directorio raíz — conflicto `react-dom@19` vs `react@19`. El archivo `app/.npmrc` lo configura automáticamente para EAS Build.

### Usuarios de prueba (entorno local)

| Email | Contraseña | Rol |
|---|---|---|
| admin@uncas.club | Admin1234! | admin |
| subco@uncas.club | Admin1234! | subcomision |
| coordinador@uncas.club | Admin1234! | coordinador |
| entrenador@uncas.club | Admin1234! | entrenador |
| manager@uncas.club | Admin1234! | manager |

- 10 jugadores de prueba en división **M15 Prueba**
- 1 partido de prueba: vs Pampas RC, 2026-05-10

---

## Variables de entorno

```bash
# app/.env.local
EXPO_PUBLIC_SUPABASE_URL=https://tlexvbattnzpmdftjsao.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key>

# web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://tlexvbattnzpmdftjsao.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
```

Secrets en Supabase (algunos pendientes):
```bash
supabase secrets set CRON_SECRET=...               # ✅ configurado
supabase secrets set CLUB_EMAIL_FROM=uncasrclub@gmail.com  # ✅ configurado
supabase secrets set MERCADOPAGO_ACCESS_TOKEN=...  # ⏳ pendiente
supabase secrets set RESEND_API_KEY=...            # ⏳ pendiente
supabase secrets set AWS_ACCESS_KEY_ID=...         # ⏳ pendiente (Rekognition para validar fotos)
supabase secrets set AWS_SECRET_ACCESS_KEY=...     # ⏳ pendiente
```

---

## Reglas de negocio clave

- **Escala de lesiones:** fija del 1 al 5, definida por el club. No configurable.
- **Cobranzas:** registro manual de estado, monto y forma de pago. Sin integración con sistemas de pago (las cuotas de socios sí tienen MercadoPago).
- **Alerta de inasistencias:** se dispara al superar 4 ausencias **consecutivas** (no acumuladas). Push al Coordinador.
- **Multi-rol:** todo usuario de staff es socio primero. `assign-role` agrega un rol sobre el socio existente. `profiles.roles[]` lista todos los roles; `profiles.rol` es el activo (usado por RLS).
- **Contraseña inicial:** DNI del usuario. Sin invite email — el mail de bienvenida se envía via Resend.
- **Roles creables:** subcomisión puede crear coordinador/entrenador/manager/subcomisión. Secretaría y portería solo admin.
- **Noticias por audiencia:** `todos` (socios + staff) o `cuerpo_tecnico` (solo coordinador/entrenador/manager). RLS aplica el filtro automáticamente.
- **TOTP carnet:** generado client-side en JS puro (sin `crypto.subtle`) para compatibilidad con Hermes/React Native. Validado server-side en la Edge Function `socios-qr`.
- **`validate-photo`:** si `AWS_ACCESS_KEY_ID` no está configurado, valida manualmente sin Rekognition.

---

## Pendientes

| Ítem | Estado |
|---|---|
| Test end-to-end portería — carnet QR con dev build | ⏳ |
| Secrets MercadoPago, Resend, AWS Rekognition | ⏳ cuando estén disponibles |
| Build iOS | ⏳ requiere Apple Developer Program ($99/año) |
| StripeBackground mobile (SVG líneas individuales) | ⏳ |

---

## Fuentes

- PRD: [`prd.md`](prd.md)
- Specs por dominio: [`openspec/specs/`](openspec/specs/)
- Migraciones SQL: [`supabase/migrations/`](supabase/migrations/)
- Contexto técnico detallado: [`.claude/context/`](.claude/context/)
