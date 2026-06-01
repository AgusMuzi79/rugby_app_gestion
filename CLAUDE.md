# App de Gestión Operativa del Club — UNCAS Rugby

Aplicación interna para el cuerpo técnico y organizativo. Digitaliza procesos hoy manejados por WhatsApp, planillas y documentos físicos. ~60 usuarios activos, 17 planteles.

## Contexto extendido

| Archivo | Contenido |
|---|---|
| [`.claude/context/stack.md`](.claude/context/stack.md) | Entorno local, deps, env vars, EAS, comandos frecuentes |
| [`.claude/context/estado-expo.md`](.claude/context/estado-expo.md) | Pantallas, hooks, navegación, dark mode |
| [`.claude/context/estado-supabase.md`](.claude/context/estado-supabase.md) | Migraciones, Edge Functions, RLS, notas de schema |
| [`.claude/context/estado-web.md`](.claude/context/estado-web.md) | Panel Next.js, páginas implementadas, bugs corregidos |
| [`.claude/context/reglas-negocio.md`](.claude/context/reglas-negocio.md) | Reglas fijas, specs, backlog |

## Roles de usuario

| Rol | Responsabilidad |
|---|---|
| **Subcomisión** | Órgano directivo. Visión global. Admin del sistema (alta/baja usuarios). |
| **Coordinador** | Gestiona calendario y divisiones infantiles/juveniles. |
| **Entrenador** | Toma asistencia, registra lesiones, carga resultados. |
| **Manager** | Gestiona cobranzas y fichajes de su equipo. |

Los jugadores **no tienen acceso** a la app en esta versión.

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Mobile + Web | React Native + Expo (TypeScript) — un codebase para iOS, Android y web |
| Auth + DB + Realtime | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Push | Expo Push API desde Edge Functions |
| Offline | AsyncStorage + cola de sync (NetInfo) |
| Deploy mobile | Expo EAS — internal distribution (sin App Store en MVP) |
| Deploy web | Next.js 16 → Vercel (panel Subcomisión) |

### Estructura del repositorio

```
rugby_app_gestion/
├── app/                  # Expo app (mobile + web)
├── supabase/
│   ├── migrations/       # SQL migrations versionadas
│   └── functions/        # Edge Functions (TypeScript/Deno)
├── web/                  # Panel web Next.js (Subcomisión)
├── openspec/             # Specs por dominio (37 user stories)
└── CLAUDE.md
```

## Skills disponibles

| Skill | Cuándo usarla |
|---|---|
| `arquitecto-general` | Decisiones de arquitectura, comparar tecnologías, definir stack |
| `senior-expo` | Todo código frontend mobile: componentes, pantallas, navegación, NativeWind, EAS |
| `senior-supabase` | Schema PostgreSQL, migraciones, RLS, Edge Functions, Auth, Storage |
| `senior-expo-supabase` | Integración Expo↔Supabase: auth flow, realtime, storage, Edge Functions |

## Estado del proyecto

**App mobile:** completa — dark mode global, todas las pantallas por rol, EAS Android APK listo.  
**Panel web:** completo — 5 páginas (login, dashboard, usuarios, divisiones, informes).  
**Backend:** 5 migraciones + 2 Edge Functions deployadas en cloud.

**Pendientes:** iOS build, deploy Vercel, dark mode system en web. Ver backlog completo en [`reglas-negocio.md`](.claude/context/reglas-negocio.md).

## Fuentes

- PRD: [`prd.md`](prd.md)
- Specs: [`openspec/specs/`](openspec/specs/)
- Migraciones: [`supabase/migrations/`](supabase/migrations/)
