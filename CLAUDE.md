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
| **Subcomisión** | Órgano directivo. Visión global. Admin del sistema. |
| **Coordinador** | Gestiona calendario y divisiones infantiles/juveniles. |
| **Entrenador** | Toma asistencia, registra lesiones, carga resultados. |
| **Manager** | Gestiona cobranzas y fichajes de su equipo. |
| **Secretaría** | Gestiona socios (alta, categorías, servicios, foto, estado) y publica noticias. |
| **Portería** | Escanea carnets QR de socios para validar acceso. |
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

**v1 — Gestión Operativa:** completa — identidad visual nueva aplicada, todas las pantallas por rol, EAS Android APK listo.

**v2 — Módulo Socios:** funcionalidad mobile completa ✅ — panel web secretaría completo ✅

| Ítem | Estado |
|---|---|
| Pantallas Expo (secretaria, portería, socio) | ✅ |
| Schema SQL + migraciones cloud | ✅ |
| `categorias_socio` seed en cloud | ✅ |
| Firebase/FCM configurado | ✅ |
| Dev build Android funcionando | ✅ |
| Login socio: email + DNI como contraseña inicial | ✅ |
| Foto de carnet: gestionada desde "Mi Perfil" del socio | ✅ |
| `admin-socios` deployada en cloud | ✅ |
| `socios-qr` deployada | ✅ |
| `socios-pagos` deployada (`--no-verify-jwt`) | ✅ |
| Migration `20260608000000` push_tokens UPDATE policy fix | ✅ |
| Migration `20260609000000` servicios_opcionales | ✅ |
| Migration `20260609000002` mp_card_fields (`db push` aplicado) | ✅ |
| Migration `20260610000000` push_tokens DELETE policy fix | ✅ |
| Noticias con filtro por deporte (rugby/hockey/tenis) | ✅ |
| Servicios opcionales por socio — UI + Edge Function | ✅ |
| Pago manual secretaría (modal + `socios-pagos` action `manual`) | ✅ |
| Débito automático con tarjeta — Edge Function completa | ✅ |
| UI Expo tarjeta — secretaría (asociar/quitar/cobrar) + socio (vista) | ✅ |
| `useCuotas` — cuota virtual mes actual + sección servicios activos | ✅ |
| push_tokens — reemplazado upsert por delete+insert (fix RLS) | ✅ |
| pg_cron activado + cron job `cobro-mensual-socios` registrado | ✅ |
| `CRON_SECRET` seteado en Supabase secrets | ✅ |
| Panel web secretaría — estructura (layout, sidebar, stub pages) | ✅ |
| Panel web secretaría — páginas reales (socios, noticias, servicios) | ✅ |
| Login web: toggle ver/ocultar contraseña | ✅ |
| `useScrollToTop` en todas las tabs (13 pantallas, 7 roles) | ✅ |
| Identidad visual nueva — app + web (Barlow, paleta marrón, patrón rayas) | ✅ |
| Portería: test carnet QR end-to-end | ⏳ pendiente |
| Secrets AWS (Rekognition) + MercadoPago + Resend | ⏳ cuando estén disponibles |
| Limpiar duplicados `servicios_opcionales` (seed corrido 2 veces) | ✅ |
| Deploy web en Vercel | ⏳ pendiente |

**Notas de comportamiento actual:**
- `validate-photo` corre sin Rekognition si `AWS_ACCESS_KEY_ID` no está seteado (valida manualmente directo en DB).
- Migraciones v2 se aplicaron manualmente en cloud — historial reparado con `migration repair`.
- `20260608` y `20260609000000` se aplicaron vía `supabase db query --linked`.
- `20260610000000` aplicada en cloud vía `supabase db push`.
- Foto del socio se gestiona desde "Mi Perfil" (useSobre), no desde el carnet. Al cambiar la foto, `foto_validada` se resetea a `false`.
- `totp-client.ts` usa SHA-1 + HMAC puro en JS (sin `crypto.subtle`) — compatible con todas las versiones de Hermes.
- `useCuotas` inyecta una cuota virtual para el mes actual si no existe en DB — se reemplaza por la real al pagar.
- `push_tokens` usa DELETE + INSERT en lugar de upsert para evitar conflictos de RLS entre usuarios del mismo dispositivo.
- Secretaría tiene panel web propio en `web/app/(secretaria)/` — separado de subcomisión.
- Las páginas de secretaría están en `(secretaria)/secretaria/{socios,noticias,servicios}/page.tsx` — el segmento `secretaria/` es necesario para que las rutas resuelvan a `/secretaria/*` (el route group no agrega segmento de URL).
- Login web detecta el rol y redirige: `secretaria` → `/secretaria/socios`, resto → `/dashboard`.
- `web/.env.local` apunta a Supabase cloud (`tlexvbattnzpmdftjsao`).
- `useScrollToTop` de `@react-navigation/native` aplicado en todas las tabs principales — tocar el ícono activo scrollea al tope.
- **Identidad visual:** tema fijo oscuro (sin toggle light/dark). Paleta: fondo `#15110A`, card `#1C1710`, sidebar web `#0B0905`, oro `#F5B41C`, texto `#F3EFE4`, muted `#8E8574`. Fuentes: Barlow + Barlow Semi Condensed + JetBrains Mono.
- Fondo de pantallas app es `transparent` — el patrón de rayas diagonales lo provee `StripeBackground` en el root layout (`app/components/shared/StripeBackground.tsx`).
- Web: patrón de rayas en `body` y `.bg-papel` via `globals.css`. Sidebars usan `style` inline (`#0B0905`) porque `components/` no era escaneado por Tailwind (ahora fijo con `@source "../components"`).
- `suppressHydrationWarning` en `<html>` del layout web — evita falso error por Dark Reader extension.

**Débito automático con tarjeta — diseño implementado:**
- `associate-card`: secretaria o socio asocian tarjeta → tokeniza con CVV → guarda en MP customer → sin cobro al momento
- `remove-card`: elimina tarjeta de MP y limpia campos en `socios`
- `charge-card`: cobro manual por secretaria con tarjeta guardada (para pagos extra o reintento)
- `cobro-mensual`: cron diario 9am — cobra socios con tarjeta, reintentos días +1/+2/+3, al 4to fallo notifica secretaria por push + marca moroso
- Cambio de tarjeta por el socio: **no dispara cobro** aunque el período esté impago
- `forma_pago = 'tarjeta'` agregado al CHECK constraint en `pagos_socios`

**Próximo paso:**
- Portería: test carnet QR end-to-end
- Deploy web en Vercel
- Setear secrets de MercadoPago, Resend y AWS cuando estén disponibles

Pendiente cuando lleguen los secrets:
```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN=...
supabase secrets set RESEND_API_KEY=... CLUB_EMAIL_FROM=...
supabase secrets set AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1
```

## Fuentes

- PRD: [`prd.md`](prd.md)
- Specs: [`openspec/specs/`](openspec/specs/)
- Migraciones: [`supabase/migrations/`](supabase/migrations/)
