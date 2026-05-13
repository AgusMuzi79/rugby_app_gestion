# La Bitácora — App de Gestión Operativa UNCAS Rugby Club

App interna para el cuerpo técnico y organizativo del club. Digitaliza procesos hoy manejados por WhatsApp, planillas en papel y documentos físicos.

**~60 usuarios activos · 17 planteles · MVP en distribución interna**

---

## Roles de usuario

| Rol | Responsabilidad |
|---|---|
| **Subcomisión** | Órgano directivo. Visión global. Administración del sistema (alta/baja de usuarios). |
| **Coordinador** | Gestiona calendario y divisiones infantiles/juveniles. |
| **Entrenador** | Toma asistencia, registra lesiones, carga resultados. |
| **Manager** | Gestiona cobranzas y fichajes de su equipo. |

> Los jugadores no tienen acceso a la app en esta versión.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Mobile + Web | React Native + Expo (TypeScript) — un solo codebase para iOS, Android y web |
| Auth | Supabase Auth — email/password; TOTP 2FA para Subcomisión; RLS por rol |
| Base de datos | PostgreSQL via Supabase — 18 tablas, 44 políticas RLS |
| Real-time | Supabase Realtime — suscripciones al dashboard de Subcomisión |
| Storage | Supabase Storage — documentos de fichajes (DNI, fichas médicas) |
| Lógica server-side | Supabase Edge Functions (TypeScript/Deno) |
| Push Notifications | Expo Push API — disparadas desde Edge Functions |
| Offline | AsyncStorage + cola de sync (NetInfo) |
| Deploy mobile | Expo EAS — distribución interna (sin App Store / Google Play en MVP) |
| Deploy web | Expo Web → Vercel |

---

## Estructura del repositorio

```
rugby_app_gestion/
├── app/                        # Expo app (mobile + web)
│   ├── app/
│   │   ├── _layout.tsx         # Root layout con auth guard
│   │   ├── (auth)/             # Login, forgot-password
│   │   ├── (subcomision)/      # Diario, Usuarios, Crónica, Eventos, Informes, Notificaciones
│   │   ├── (coordinador)/      # Diario, Calendario, Asistencia, Crónica
│   │   ├── (entrenador)/       # Diario, Asistencia, Partido, Lesiones, Crónica
│   │   └── (manager)/          # Diario, Cobranzas, Fichajes, Crónica
│   ├── components/
│   │   ├── shared/             # Header, CronicaScreen
│   │   └── ui/                 # DatePickerField y otros
│   ├── constants/
│   │   ├── theme.ts            # Sistema de diseño "La Bitácora"
│   │   └── roles.ts            # Mapeo rol → ruta
│   ├── hooks/                  # Hooks por pantalla y dominio
│   ├── lib/
│   │   ├── supabase.ts         # Cliente Supabase
│   │   ├── notifications.ts    # Registro de push tokens
│   │   ├── offlineQueue.ts     # Cola de operaciones offline
│   │   └── database.types.ts   # Tipos generados desde Supabase
│   └── stores/
│       └── authStore.ts        # Zustand: session, rol, loading
├── supabase/
│   ├── migrations/             # SQL migrations versionadas
│   └── functions/              # Edge Functions (TypeScript/Deno)
├── openspec/
│   └── specs/                  # Specs por dominio (37 user stories)
├── prd.md                      # PRD v1.0
└── CLAUDE.md                   # Contexto e instrucciones para el agente
```

---

## Dominios y specs

| Dominio | Descripción |
|---|---|
| `auth` | Autenticación, roles, alta/baja de usuarios |
| `entrenamientos-partidos` | Asistencia, mesa de partido, resultados, calendario |
| `lesiones` | Registro de lesiones, protocolos de actuación |
| `financiero` | Cobranzas de viajes/tercer tiempo, eventos de recaudación |
| `fichajes` | Alta de jugadores y documentación |
| `notificaciones` | Notificaciones manuales (Subcomisión) y automáticas del sistema |
| `informes` | Dashboard global y por división |

Los specs viven en `openspec/specs/`.

---

## Reglas de negocio clave

- **Escala de lesiones:** fija del 1 al 5. No configurable desde la app.
- **Cobranzas:** registro manual de estado (Pagado/Pendiente), monto y forma de pago (efectivo, transferencia, otro). Sin integración con sistemas de pago.
- **Fichajes:** el Manager tiene autoridad directa. Sin flujo de aprobación.
- **Eventos de recaudación:** los crea la Subcomisión y los cierra manualmente. Sin vencimiento automático.
- **Resultados deportivos:** solo disponibles para divisiones juveniles en adelante. Infantiles no tienen marcador.
- **Alerta de inasistencias:** se dispara al superar 4 ausencias **consecutivas** (no acumuladas). Notifica al Coordinador vía push.
- **17 planteles activos:** infantiles, juveniles, plantel superior, femenino y rugby mixed.

---

## Pantallas implementadas

### Subcomisión
| Pantalla | Estado |
|---|---|
| Diario (dashboard) | ✅ — stats globales, crónica reciente, atajos |
| Usuarios | ✅ — lista, detalle, crear, desactivar, reactivar |
| Crónica (feed) | ✅ — feed 7 días, modal nueva notificación |
| Eventos | ✅ — activos/historial, nuevo evento, detalle con cobranzas, cerrar |
| Informes | ✅ — asistencia per-jugador, resultados, fichajes, financiero |
| Notificaciones | ✅ — enviar push por rol, historial |

### Coordinador
| Pantalla | Estado |
|---|---|
| Diario (dashboard) | ✅ — eventos semana, alertas asistencia, barras por división |
| Calendario | ✅ — lista eventos, modal nuevo evento con date picker |
| Asistencia | ✅ — per-jugador, badge 4 ausencias, selector división |
| Crónica (feed) | ✅ — feed 7 días compartido |

### Entrenador
| Pantalla | Estado |
|---|---|
| Diario (dashboard) | ✅ — próximo evento, tareas pendientes, atajos |
| Asistencia | ✅ — online + offline (cola de sync) |
| Partido | ✅ — asistencia partido + mesa completa con validaciones |
| Lesiones | ✅ — registro + historial + protocolos (signed URL) |
| Crónica (feed) | ✅ — feed 7 días compartido |

### Manager
| Pantalla | Estado |
|---|---|
| Diario (dashboard) | ✅ — cobranzas activas, pedidos subcomisión, últimos fichajes |
| Fichajes | ✅ — lista, detalle, nuevo fichaje, upload documentos |
| Cobranzas | pendiente |
| Crónica (feed) | ✅ — feed 7 días compartido |

---

## Sistema de diseño

`constants/theme.ts` — identidad visual **La Bitácora**:

| Token | Valor |
|---|---|
| `tinta` | `#0E0E0E` — fondo principal |
| `oro` | `#E8B53C` — acento activo, CTAs |
| `oroHondo` | `#C49B2E` — oro oscuro para estados pressed |
| `papel` | `#F5F0E8` — superficies claras, cards |
| `rojoUrgente` | `#C0392B` — alertas de urgencia |
| Font título | PlayfairDisplay 900 Black Italic |
| Font cuerpo | Lora 400 Regular |
| Font label | ArchivoNarrow 400 Regular |

---

## Edge Functions

| Función | Descripción |
|---|---|
| `admin-usuarios` | create / deactivate / reactivate usuarios via Supabase Admin API |
| `notifications` | Push a Subcomisión (lesión, fichaje) y a Coordinador (4 ausencias consecutivas) via Expo Push API |

---

## Base de datos

18 tablas PostgreSQL con RLS completo (44 políticas). Migraciones en `supabase/migrations/`:

| Migración | Contenido |
|---|---|
| `20260506000000_init_schema.sql` | Schema completo: tablas, FK, índices, helper functions RLS |
| `20260506000001_add_platform_to_push_tokens.sql` | Columna `plataforma` en `push_tokens` |
| `20260506000002_rls_policies.sql` | 44 políticas RLS para las 18 tablas |
| `20260506000003_add_admin_role.sql` | Rol `admin` con CRUD completo |
| `20260507000000_eventos_insert_entrenador.sql` | Política INSERT en `eventos` para entrenador |

---

## Levantar el entorno local

Requiere Docker Desktop corriendo.

```bash
# Iniciar Supabase local
supabase start

# Studio: http://127.0.0.1:54323
# DB:     postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Levantar Edge Functions (en paralelo, terminal separada)
supabase functions serve

# Regenerar tipos TypeScript
supabase gen types typescript --local > app/lib/database.types.ts

# Iniciar la app Expo
cd app
npx expo start
```

> **Nota:** Siempre usar `--legacy-peer-deps` en `npm install` por conflicto `react-dom@19` vs `react@19`.

### Usuarios de prueba

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

## Requerimientos no funcionales

- **Offline:** asistencia y registro de lesión funcionan sin conexión, con sync posterior.
- **Performance:** < 2 segundos para operaciones comunes. Push < 30 segundos de latencia.
- **Seguridad:** auth por email/password. 2FA TOTP recomendado para Subcomisión. Datos de jugadores (DNI, documentación) con almacenamiento seguro en Supabase Storage.
- **Push en producción:** las notificaciones push no funcionan en Expo Go (SDK 53). Requieren un development build via `eas build --profile development`.
