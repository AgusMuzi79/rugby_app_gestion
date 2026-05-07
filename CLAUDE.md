# App de Gestión Operativa del Club — Contexto del Proyecto

## Resumen
Aplicación interna para el cuerpo técnico y organizativo de un club de rugby. Digitaliza procesos hoy manejados por WhatsApp, planillas en papel y documentos físicos. Inicialmente ~60 usuarios activos, 17 planteles.

## Roles de Usuario

| Rol | Responsabilidad |
|---|---|
| **Subcomisión** | Órgano directivo. Visión global. Admin del sistema (alta/baja usuarios). |
| **Coordinador** | Gestiona calendario y divisiones infantiles/juveniles. |
| **Entrenador** | Toma asistencia, registra lesiones, carga resultados. |
| **Manager** | Gestiona cobranzas y fichajes de su equipo. |

> Los jugadores **no tienen acceso** a la app en esta versión.

## Dominios y Specs

Los specs viven en `openspec/specs/` organizados por dominio:

| Dominio | Spec | Descripción |
|---|---|---|
| `auth` | [spec](openspec/specs/auth/spec.md) | Autenticación, roles, alta/baja de usuarios |
| `entrenamientos-partidos` | [spec](openspec/specs/entrenamientos-partidos/spec.md) | Asistencia, mesa de partido, resultados, calendario |
| `lesiones` | [spec](openspec/specs/lesiones/spec.md) | Registro de lesiones, protocolos de actuación |
| `financiero` | [spec](openspec/specs/financiero/spec.md) | Cobranzas de viajes/tercer tiempo, eventos de recaudación |
| `fichajes` | [spec](openspec/specs/fichajes/spec.md) | Alta de jugadores y documentación |
| `notificaciones` | [spec](openspec/specs/notificaciones/spec.md) | Notificaciones manuales (Subcomisión) y automáticas del sistema |
| `informes` | [spec](openspec/specs/informes/spec.md) | Dashboard global y por división |

## Reglas de Negocio Clave

- **Escala de lesiones:** fija del 1 al 5, definida por el club. No configurable desde la app.
- **Cobranzas:** sin integración con sistemas de pago. Registro manual de estado (Pagado/Pendiente), monto y forma de pago (efectivo, transferencia, otro).
- **Fichajes:** el Manager tiene autoridad directa. Sin flujo de aprobación.
- **Eventos de recaudación:** los crea la Subcomisión y los cierra manualmente. Sin vencimiento automático.
- **Resultados deportivos:** solo disponibles para divisiones juveniles en adelante. Infantiles no tienen marcador.
- **Alerta de inasistencias:** se dispara al superar 4 ausencias **consecutivas** (no acumuladas). Notifica al Coordinador.
- **Administración del sistema:** la Subcomisión gestiona el alta y baja de todos los usuarios. Sin perfil técnico separado.
- **17 planteles activos:** infantiles, juveniles, plantel superior, femenino y rugby mixed.

## Requerimientos No Funcionales

- **Plataforma:** app móvil (iOS/Android) + acceso web responsive. PWA o app híbrida válida para MVP.
- **Offline:** toma de asistencia y registro de lesión deben funcionar sin conexión, con sincronización posterior.
- **Performance:** respuesta < 2 segundos para operaciones comunes. Notificaciones push < 30 segundos de latencia.
- **Seguridad:** autenticación por usuario y contraseña. 2FA recomendado para Subcomisión. Datos de jugadores (DNI, documentación) con almacenamiento seguro.
- **Escalabilidad:** ~60 usuarios iniciales, sin límite fijo de crecimiento. Arquitectura que permita sumar divisiones o roles sin rediseño mayor.

## Stack Tecnológico

| Capa | Tecnología | Decisión |
|---|---|---|
| Mobile + Web | React Native + Expo (TypeScript) | Un solo codebase para iOS, Android y web (Expo Web) |
| Auth | Supabase Auth | Email + password; TOTP 2FA para Subcomisión; RLS por rol |
| Base de datos | PostgreSQL via Supabase | Relacional, transaccional; modelo de datos con FK entre jugadores, eventos, asistencia, cobranzas |
| Real-time | Supabase Realtime | Suscripciones a tablas para dashboard de Subcomisión |
| Storage | Supabase Storage | Documentos de fichajes (DNI, fichas médicas) y protocolos de lesión; acceso controlado por RLS |
| Lógica server-side | Supabase Edge Functions (TypeScript/Deno) | Cálculo de ausencias consecutivas, disparo de notificaciones push, alertas automáticas |
| Push Notifications | Expo Push API (llamada desde Edge Functions) | Triggers de Postgres → Edge Function → Expo Push API → dispositivo |
| Offline | AsyncStorage + cola de sync (NetInfo) | Cola de writes pendientes (asistencia, lesiones); sync automático al recuperar conexión |
| Deploy mobile | Expo EAS — internal distribution (MVP) | Sin pasar por App Store / Google Play en MVP; link de instalación directa para los ~60 usuarios |
| Deploy web | Expo Web → Vercel | Para acceso desde navegador desktop (Subcomisión, Coordinador) |

### Estructura del repositorio

```
rugby_app_gestion/
├── app/                  # Expo app (mobile + web)
├── supabase/
│   ├── migrations/       # SQL migrations versionadas
│   └── functions/        # Edge Functions (TypeScript)
├── openspec/             # Specs por dominio
└── CLAUDE.md
```

Sin Turborepo ni workspaces: no hay código compartido real entre proyectos separados porque todo vive en el mismo proyecto Expo.

### Decisión más irreversible
El schema de PostgreSQL y las políticas de RLS. Diseñar antes de escribir frontend.

## Skills

| Skill | Ubicación | Cuándo usarla |
|---|---|---|
| `arquitecto-general` | [.claude/skills/arquitecto-general/SKILL.md](.claude/skills/arquitecto-general/SKILL.md) | Toda decisión técnica de arquitectura: qué stack usar, qué base de datos elegir, cómo deployar, monorepo vs. repos separados, comparar tecnologías (Flutter vs React Native, SQL vs NoSQL, REST vs GraphQL, etc.), definir el stack de un proyecto nuevo o revisar una decisión ya tomada. |
| `senior-expo` | [.claude/skills/senior-expo/SKILL.md](.claude/skills/senior-expo/SKILL.md) | Todo lo que sea código del frontend mobile: componentes, pantallas, navegación (Expo Router), manejo de estado, lógica offline, formularios, NativeWind, configuración de EAS, estructura de carpetas de Expo. Si hay código React Native / Expo en juego, esta skill aplica. |
| `senior-supabase` | [.claude/skills/senior-supabase/SKILL.md](.claude/skills/senior-supabase/SKILL.md) | Todo lo que sea backend Supabase: diseño de schema PostgreSQL, migraciones SQL, políticas de RLS, Edge Functions, Supabase Auth, Storage, Realtime, permisos por rol y seguridad de datos. Si hay Supabase en juego, esta skill aplica. |
| `senior-expo-supabase` | [.claude/skills/senior-expo-supabase/SKILL.md](.claude/skills/senior-expo-supabase/SKILL.md) | Integración entre Expo y Supabase: configuración del cliente, auth flow completo, suscripciones realtime desde React Native, subida de archivos a Storage, llamadas a Edge Functions, manejo de tokens y sesión. Cuando el código cruza los dos mundos al mismo tiempo. |

## Estado del Proyecto

### Completado
- PRD v1.0 capturado en `prd.md`
- 7 specs de dominio en `openspec/specs/` (37 user stories)
- Stack tecnológico definido (ver sección arriba)
- Schema PostgreSQL completo: 18 tablas, helper functions RLS, índices → `supabase/migrations/20260506000000_init_schema.sql`
- Columna `plataforma` en `push_tokens` → `supabase/migrations/20260506000001_add_platform_to_push_tokens.sql`
- Políticas RLS completas para las 18 tablas (44 políticas) → `supabase/migrations/20260506000002_rls_policies.sql`
- Rol `admin` con CRUD en las 18 tablas → `supabase/migrations/20260506000003_add_admin_role.sql`
- Política INSERT en `eventos` para entrenador (tipo entrenamiento) → `supabase/migrations/20260507000000_eventos_insert_entrenador.sql`

### Entorno local Supabase
- Supabase CLI v2.98.2 instalada en `%USERPROFILE%\AppData\Local\supabase\supabase.exe` (en PATH de usuario)
- `supabase start` corriendo: Studio en http://127.0.0.1:54323, DB en postgresql://postgres:postgres@127.0.0.1:54322/postgres
- Las 4 migraciones aplicadas
- Tipos TypeScript generados en `app/lib/database.types.ts`

Para levantar el entorno al volver (requiere Docker Desktop corriendo):
```bash
supabase start
```

### Usuarios de prueba (local)
| Email | Contraseña | Rol | División |
|---|---|---|---|
| admin@uncas.club | Admin1234! | admin | — |
| subco@uncas.club | Admin1234! | subcomision | — |
| coordinador@uncas.club | Admin1234! | coordinador | — |
| entrenador@uncas.club | Admin1234! | entrenador | M15 Prueba |
| manager@uncas.club | Admin1234! | manager | M15 Prueba |

- 10 jugadores de prueba en división M15 Prueba (`00000000-0000-0000-0000-000000000001`)
- 1 partido de prueba: vs Pampas RC, 2026-05-10, Cancha principal

### Expo app (app/)
- `app/app/_layout.tsx` — root layout, auth guard sin `useSegments` (devuelve `[]` en root layout de Expo Router — usar session/rol directo)
- `app/app/(auth)/login.tsx` + `forgot-password.tsx` — diseño "La Bitácora" (cream/gold/serif)
- `app/app/(auth)/_layout.tsx` — stack sin header
- `app/app/(subcomision|coordinador|entrenador|manager)/_layout.tsx` — tab navigation oscura, tab "Salir" con `tabBarButton` + `salir.tsx` por grupo
- `app/lib/supabase.ts` — cliente con AsyncStorage + AppState
- `app/lib/offlineQueue.ts` — `encolar/obtenerCola/eliminarDeCola/tamañoCola` (nombres en español, tipo `OperacionOffline`)
- `app/stores/authStore.ts` — Zustand: session, rol, loading, setSession, setRol, clearAuth
- `app/constants/roles.ts` — incluye `admin` mapeado a `/(subcomision)/dashboard`
- `app/hooks/useLogin.ts` — signIn + fetch profile.rol
- `app/hooks/useForgotPassword.ts` — resetPasswordForEmail
- `app/hooks/useSignOut.ts` — signOut + clearAuth

**Nota**: Tailwind v3 (no v4). NativeWind v4 no soporta Tailwind v4. `global.css` usa `@tailwind base/components/utilities`.

**Nota**: Regenerar tipos siempre en `app/lib/`:
```bash
supabase gen types typescript --local > app/lib/database.types.ts
```

### Edge Functions
| Función | Estado | Descripción |
|---|---|---|
| `supabase/functions/admin-usuarios/` | ✅ completo | create (inviteUserByEmail) / deactivate (ban 876000h) / reactivate |
| `supabase/functions/notifications/` | ✅ completo | lesión→Subcomisión, fichaje→Subcomisión, 4 ausencias consecutivas→Coordinador via Expo Push API |
| `supabase/functions/_shared/` | ✅ | `supabase-admin.ts` (service role client) + `cors.ts` (headers + helpers) |

**Nota Edge Functions local**: `supabase start` NO levanta el Edge Runtime. Para probar funciones localmente, correr `supabase functions serve` en paralelo.

### Pantallas implementadas — Subcomisión
| Pantalla | Hook | Estado |
|---|---|---|
| `(subcomision)/dashboard.tsx` | `useDashboard.ts` | ✅ completo — selector división + 4 secciones + Realtime |
| `(subcomision)/usuarios.tsx` | `useUsuarios.ts` | ✅ completo — lista/detalle/crear/desactivar/reactivar |

**`useDashboard`**: suscripción Realtime canal único `dashboard-subcomision` (asistencias, fichajes, resultados, cobranzas). Secciones: Asistencia (% + badge 4+ ausencias consecutivas), Resultados (últimos 5 no-infantil), Fichajes (count por división), Financiero (cobrado vs pendiente).

**`useUsuarios`**: lista todos los profiles, paso lista/detalle, modal nuevo usuario (invoke `admin-usuarios` action=create), desactivar/reactivar (invoke action=deactivate/reactivate). Actualización optimista del estado local.

### Pantallas implementadas — Entrenador
| Pantalla | Hook | Estado |
|---|---|---|
| `(entrenador)/asistencia.tsx` | `useAsistencia.ts` | ✅ US-EP-01 completo (online + offline) |
| `(entrenador)/partido.tsx` | `usePartido.ts` | ✅ US-EP-02 + US-EP-03 completo |
| `(entrenador)/lesiones.tsx` | `useLesiones.ts` | ✅ completo (online + offline) |

**`useAsistencia`**: fetch jugadores por división → pre-carga asistencias del día → guardar crea evento de entrenamiento automáticamente → verifica 4 ausencias consecutivas con Promise.all → invoca `notifications` si hay 4 ausencias.

**`usePartido`**: lista partidos próximos (hoy + 14 días) → selección → Paso 1 asistencia (presente/ausente) → Paso 2 mesa (C/T/S/CT por jugador presente) → validación (1 cap, ≤15 cancha, ≤8 suplentes).

**`useLesiones`**: lista lesiones de la división, modal nuevo registro, online (insert DB + invoke `notifications`) / offline (`encolar`).

### Pantallas implementadas — Manager
| Pantalla | Hook | Estado |
|---|---|---|
| `(manager)/fichajes.tsx` | `useFichajes.ts` | ✅ completo — lista/detalle/nuevo/documentos |

**`useFichajes`**: lista jugadores fichados, modal nuevo fichaje (jugador + fichaje en 2 inserts), upload documentos a Storage bucket `fichajes` (base64 via expo-file-system), invoca `notifications` al crear fichaje.

### Push Notifications
- `app/lib/notifications.ts` — `registerPushToken()`: permisos → canal Android → `getExpoPushTokenAsync()` → upsert en `push_tokens` (onConflict: 'token')
- Llamado en `useLogin.ts` después de autenticar (fire-and-forget con `void`)
- `useLesiones`, `useFichajes`, `useAsistencia` invocan `notifications` Edge Function en los eventos correspondientes

**Nota expo-file-system v19**: `EncodingType` NO es un named export. Usar string literal `'base64'` en `readAsStringAsync`.

**Nota expo-notifications v0.32**: `NotificationBehavior` requiere `shouldShowBanner` y `shouldShowList` además de los 3 campos estándar.

### Próximo paso al volver
Pantallas del rol Coordinador: calendario con lista de eventos (US-EP-05) y vista de asistencia por división. O pantallas del Manager: cobranzas (spec financiero).

## Fuentes

- PRD completo: [`prd.md`](prd.md) — v1.0, Mayo 2026
- Specs por dominio: [`openspec/specs/`](openspec/specs/)
- Migraciones DB: [`supabase/migrations/`](supabase/migrations/)
