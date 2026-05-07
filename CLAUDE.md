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

### Entorno local Supabase
- Supabase CLI v2.98.2 instalada en `%USERPROFILE%\AppData\Local\supabase\supabase.exe` (en PATH de usuario)
- `supabase start` corriendo: Studio en http://127.0.0.1:54323, DB en postgresql://postgres:postgres@127.0.0.1:54322/postgres
- Las 3 migraciones aplicadas y validadas con `supabase db reset`
- Tipos TypeScript generados en `lib/database.types.ts` (989 líneas, 18 tablas del schema `public`)

Para levantar el entorno al volver (requiere Docker Desktop corriendo):
```bash
supabase start
```

### Boilerplate Expo creado (app/)
- `app/app/_layout.tsx` — root layout con auth guard por rol y listener de sesión Supabase
- `app/lib/supabase.ts` — cliente Supabase con AsyncStorage, AppState listener, tipos generados
- `app/lib/database.types.ts` — tipos TypeScript generados desde el schema (copia de `lib/database.types.ts`)
- `app/lib/offlineQueue.ts` — cola offline para asistencia y lesiones (AsyncStorage)
- `app/stores/authStore.ts` — Zustand store de autenticación
- `app/constants/roles.ts` — tipos y constantes de roles + rutas iniciales por rol
- `app/babel.config.js` + `app/metro.config.js` — NativeWind v4 configurado
- `app/global.css` — entrada Tailwind v4 (`@import "tailwindcss"`)
- `app/nativewind-env.d.ts` — tipos NativeWind para TypeScript
- `app/.env.local` — variables placeholder (ya en .gitignore via `.env*.local`)
- `app/package.json` `main` → `expo-router/entry`
- `app/tsconfig.json` — alias `@/*` configurado
- `app/app.json` — `scheme: rugby-app` agregado para deep linking

**Nota**: `lib/database.types.ts` en la raíz ya no es la fuente de verdad. Regenerar siempre en `app/lib/`:
```bash
supabase gen types typescript --local > app/lib/database.types.ts
```

### Próximo paso al volver
Crear las pantallas de auth (`app/app/(auth)/login.tsx`) y el primer flujo funcional (entrenador → asistencia offline).

## Fuentes

- PRD completo: [`prd.md`](prd.md) — v1.0, Mayo 2026
- Specs por dominio: [`openspec/specs/`](openspec/specs/)
- Migraciones DB: [`supabase/migrations/`](supabase/migrations/)
