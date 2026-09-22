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
- Carnet QR (TOTP, paso de 60s) + escaneo por Lector/Canchero/Buffet + historial de accesos al gimnasio. Lector además exige que el socio tenga el servicio Gimnasio contratado (o sea Cliente Gimnasio) — Canchero/Buffet siguen validando solo "socio al día".
- Titular de grupo familiar (`socios.cabecera_id`) ve el carnet QR de sus dependientes menores de 13 desde su propia cuenta — el link familiar depende de que el padrón NUVIX traiga `cabecera_cod_cliente`; hay ~176 menores de 13 sin ese link todavía (huecos de datos del padrón, no del código).
- Gestión de socios: alta manual + importador mensual recurrente del padrón NUVIX (`importar-socios`), 1528+ socios reales cargados.
- Semáforo de morosidad: importador recurrente del reporte de deuda NUVIX (`importar-deuda`). Pago real vía alias + comprobante por WhatsApp (interino, hasta integrar Banco Macro).
- Recordatorios por push (deuda, débito automático) — sin mail: NUVIX ya manda los transaccionales de pago.
- Calendario, asistencia, lesiones, fichajes, cobranzas e informes — flujo completo por rol (coordinador/entrenador/manager).
- Noticias con audiencia (socios / cuerpo técnico) y push al publicar. Buffet publica sus propias promos (con foto opcional) desde app o web, siempre audiencia `todos`.
- Paneles web Next.js separados para subcomisión, secretaría, Lector (accesos) y Buffet (promos) — Vercel, dominio `uncasapp.com`.

**Estado de las stores (actualizado 2026-09-22):**
- **Android:** versión 15 (1.0.7) en revisión en Producción. La versión 14 (1.0.5) sigue siendo la que ven los usuarios reales mientras tanto.
- **iOS:** versión pública 1.0.7 (build 21) enviada a revisión de Apple ("Waiting for Review", hasta 48hs). Build 21 ya está en TestFlight (Internal + External "Club UNCAS"). La versión pública 1.0.6 sigue siendo la última aprobada/publicada mientras 1.0.7 se revisa.

**Pendiente / backlog** (sin detalle acá — ver `historial.md` o memoria de proyecto):
- Integración Banco Macro (reemplazaría el alias manual de pago).
- Dar de baja el proyecto viejo de Vercel (`web-chi-nine-26.vercel.app`) — bloqueado hasta que Agus loguee Chrome con su cuenta personal.
- Rotar la `service_role` key de Supabase (al migrar a infraestructura del club).
- Shop del club y gestor de alquiler de espacios — sin priorizar todavía.
- 176 socios menores de 13 sin `cabecera_id` (link familiar) — sólo se resolvió puntualmente la familia Fiori (2026-09-18); decidir si conviene un fix masivo o ir caso por caso.
- Confirmar en la práctica (escaneo real en el gimnasio) el gate de servicio Gimnasio agregado a Lector (2026-09-18) — deployado pero sin probar con un socio sin el servicio.
- Trader status de la UE (Digital Services Act) sin completar en App Store Connect — banner recurrente, no bloqueante fuera de la UE, sin resolver.
- Resultado de la revisión de Android v15/1.0.7 e iOS v1.0.7 (build 21) — confirmar cuando Google/Apple respondan.

**Recordatorio de proceso:**
- Cada build nuevo de iOS subido con `eas submit` hay que agregarlo a mano al grupo de testers en TestFlight (App Store Connect → TestFlight → grupo → Builds → "+") — `eas submit` sólo sube el binario, no lo hace visible a nadie.
- Antes de cualquier `eas build --profile production` (iOS o `all`), correr `npm run version:bump` (desde `app/`) — bumpea el patch de `version` de forma incondicional, sin depender de chequear App Store Connect a mano. Ver `.claude/context/historial.md` (2026-09-17) o memoria `feedback-ios-tren-cerrado-eas`.

## Fuentes

- PRD: [`prd.md`](prd.md)
- Specs: [`openspec/specs/`](openspec/specs/)
- Migraciones: [`supabase/migrations/`](supabase/migrations/)
