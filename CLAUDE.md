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
| [`.claude/context/historial.md`](.claude/context/historial.md) | Changelog detallado sesion por sesion: bugs, causas raiz, decisiones de negocio |

## Roles de usuario

| Rol | Responsabilidad |
|---|---|
| **Subcomisión** | Órgano directivo. Visión global. Admin del sistema. |
| **Coordinador** | Gestiona calendario y divisiones infantiles/juveniles. |
| **Entrenador** | Toma asistencia, registra lesiones, carga resultados. |
| **Manager** | Gestiona cobranzas y fichajes de su equipo. |
| **Secretaría** | Gestiona socios (alta, categorías, servicios, foto, estado) y publica noticias (siempre a los socios, ya no puede elegir "cuerpo técnico"). |
| **Lector** (ex-Portería, sólo el label — rol interno sigue siendo `porteria`) | Escanea carnets QR en el gimnasio (autoservicio, cámara frontal) para ver estado de cuota. |
| **Canchero** | Mismo escaneo que Lector pero atendido (cámara trasera) — hoy en tenis, a futuro gestiona turnos de cancha. |
| **Buffet** | Mismo escaneo que Lector + publica promociones/noticias a todos los socios. |
| **Cliente Gimnasio** | No es socio del club — accede a la app únicamente para ver su carnet digital QR. |
| **Socio** | Ve su carnet digital QR, cuotas, noticias del club y sus servicios contratados. |

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Mobile | React Native + Expo (TypeScript) |
| Auth + DB + Realtime | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Push | Expo Push API desde Edge Functions |
| Offline | AsyncStorage + cola de sync (NetInfo) |
| Deploy mobile | Expo EAS — internal distribution (sin App Store en MVP) |
| Deploy web subcomisión | Next.js 16 → Vercel |
| Deploy web secretaría | Next.js 16 → Vercel (mismo repo, route group separado) |

### Estructura del repositorio

```
rugby_app_gestion/
├── app/                  # Expo app (mobile)
├── supabase/
│   ├── migrations/       # SQL migrations versionadas
│   └── functions/        # Edge Functions (TypeScript/Deno)
├── web/                  # Panel web Next.js
│   └── app/
│       ├── (subcomision)/   # Panel subcomisión — guard rol subcomision/admin
│       └── (secretaria)/    # Panel secretaría — guard rol secretaria/admin
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

**v1 — Gestión Operativa:** completa.

**v2 — Módulo Socios:** completa (mobile + panel web secretaría).

**v3 — Multi-rol, Calendario y Comunicaciones:** completa.

La app está **en producción** en ambas stores desde agosto 2026 y se sigue iterando sobre ella. El historial completo de cómo se construyó cada feature (bugs, causas raíz, decisiones de negocio, sesión por sesión) vive en [`.claude/context/historial.md`](.claude/context/historial.md) — no hace falta leerlo entero, se busca por fecha o por feature.

**Subsistemas en producción:**
- Auth multi-rol (`profiles.roles[]`): socio, secretaría, lector, canchero, buffet, cliente gimnasio, coordinador, entrenador, manager, subcomisión, admin.
- Carnet QR (TOTP, paso de 60s) + escaneo por Lector/Canchero/Buffet + historial de accesos al gimnasio.
- Gestión de socios: alta manual + importador mensual recurrente del padrón NUVIX (`importar-socios`), 1528+ socios reales cargados.
- Semáforo de morosidad: importador recurrente del reporte de deuda NUVIX (`importar-deuda`). Pago real vía alias + comprobante por WhatsApp (interino, hasta integrar Banco Macro).
- Recordatorios por push (deuda, débito automático) — sin mail: NUVIX ya manda los transaccionales de pago.
- Calendario, asistencia, lesiones, fichajes, cobranzas e informes — flujo completo por rol (coordinador/entrenador/manager).
- Noticias con audiencia (socios / cuerpo técnico) y push al publicar. Buffet publica sus propias promos (con foto opcional) desde app o web, siempre audiencia `todos`.
- Paneles web Next.js separados para subcomisión, secretaría, Lector (accesos) y Buffet (promos) — Vercel, dominio `uncasapp.com`.

**Estado de las stores (actualizado 2026-09-17):**
- **Android:** versión 12 (1.0.4) en Producción, 100% de rollout.
- **iOS:** build 17 (1.0.5) en TestFlight (grupo externo) y versión pública 1.0.5 enviada a revisión de Apple ("Waiting for Review").

**Pendiente / backlog** (sin detalle acá — ver `historial.md` o memoria de proyecto):
- Integración Banco Macro (reemplazaría el alias manual de pago).
- Dar de baja el proyecto viejo de Vercel (`web-chi-nine-26.vercel.app`) — bloqueado hasta que Agus loguee Chrome con su cuenta personal.
- Rotar la `service_role` key de Supabase (al migrar a infraestructura del club).
- Shop del club y gestor de alquiler de espacios — sin priorizar todavía.

**Recordatorio de proceso:** cada build nuevo de iOS subido con `eas submit` hay que agregarlo a mano al grupo de testers en TestFlight (App Store Connect → TestFlight → grupo → Builds → "+") — `eas submit` sólo sube el binario, no lo hace visible a nadie.

## Fuentes

- PRD: [`prd.md`](prd.md)
- Specs: [`openspec/specs/`](openspec/specs/)
- Migraciones: [`supabase/migrations/`](supabase/migrations/)
