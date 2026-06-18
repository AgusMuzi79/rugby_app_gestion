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

**v3 — Multi-rol, Calendario y Comunicaciones:** completo ✅

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
| Push al publicar noticia (Edge Function `notifications` + web secretaría) | ✅ |
| Panel web secretaría — página categorías (CRUD completo) | ✅ |
| Fix NativeWind — eliminado de `metro.config.js` y `babel.config.js` (0 usos de `className`) | ✅ |
| Fix loop React Navigation v7 — `_layout.tsx` sin `return null` ni `useRootNavigationState` | ✅ |
| Fix `style={{ }}` inline — barrido completo en 28+ pantallas → `StyleSheet.create` | ✅ |
| Fix QR carnet — color negro sobre blanco para máximo contraste y escaneo | ✅ |
| EAS env vars `EXPO_PUBLIC_SUPABASE_URL` + `ANON_KEY` seteadas en environment `preview` | ✅ |
| `supabase.ts` — reemplazado `!` por `?? ''` para evitar crash si faltan env vars | ✅ |
| Limpiar duplicados `servicios_opcionales` (seed corrido 2 veces) | ✅ |
| Deploy web en Vercel | ✅ https://web-chi-nine-26.vercel.app |
| Web secretaría — foto socio: signed URL + display en detalle | ✅ |
| Web secretaría — fix `socioId` → `socio_id` en todos los callEdgeFunction | ✅ |
| Web secretaría — fix `formaPago` → `forma_pago` en pago manual | ✅ |
| `socios-qr` — agrega `nombre` a la respuesta de `validate` | ✅ |
| Portería `scanner.tsx` — fix colores: fondo `papel`, textos `tinta`/`MUTED` | ✅ |
| `useCuotas` + `cuotas.tsx` — desglose categoría+servicios en cards pendientes | ✅ |
| `useUsuarios` — filtra rol `socio` de la lista, agrega labels secretaria/portería | ✅ |
| `admin-usuarios` — login con DNI como contraseña inicial (sin invite email) | ✅ |
| `admin-usuarios` — roles creables por subco vs admin (secretaría/portería solo admin) | ✅ |
| `admin-usuarios` — email de bienvenida genérico vía Resend (fire & forget) | ✅ |
| `usuarios.tsx` — campo DNI, selector de roles por rol del caller, colores secretaria/portería | ✅ |
| `CLUB_EMAIL_FROM=uncasrclub@gmail.com` — seteado en Supabase secrets | ✅ |
| Migration `20260616000000` — `profiles.roles[]`, `jugadores.socio_id`, `divisiones.deporte` | ✅ |
| Migration `20260616000001` — `noticias.audiencia` + `division_id` + `generada_automaticamente` + RLS | ✅ |
| Migration `20260616000002` — RLS socios leen `eventos` y `resultados` | ✅ |
| `profiles.roles[]` — multi-rol: socio como base, staff agrega rol sobre la base socio | ✅ |
| `authStore` — `roles[]` + `rolActivo` + `setRolActivo()` (UPDATE DB + navigate) | ✅ |
| `sobre.tsx` (socio) — selector "VISTA ACTIVA" visible si `roles.length > 1` | ✅ |
| `admin-usuarios` — acción `assign-role`: asigna rol a socio existente por DNI | ✅ |
| `usuarios.tsx` — modal con tabs "Desde socio existente" / "Nuevo usuario" | ✅ |
| `useFichajes` — link `jugadores.socio_id` al fichar si el DNI existe en socios | ✅ |
| `divisiones.deporte` — selector rugby/hockey/tenis en web `/divisiones` | ✅ |
| Cancelación con mensaje — coordinador marca cancelado + inserta noticia + push jugadores | ✅ |
| `notifications` Edge Function — tipo `cancelacion_entrenamiento` + `getTokensJugadoresDivision` | ✅ |
| `useCalendario` — `cancelarEvento()` con mensaje + modal en `calendario.tsx` | ✅ |
| `useCalendarioSocio` — detecta si es jugador, lista partidos/resultados filtrables por deporte | ✅ |
| `(socio)/calendario.tsx` — chips deporte, badge "MI EQUIPO", score coloreado | ✅ |
| Tab calendario en `(socio)/_layout.tsx` | ✅ |
| `noticias.audiencia` — selector `todos`/`cuerpo_tecnico` en subcomisión (push) y web secretaría | ✅ |
| `useNotificaciones` — publica en `noticias` con `audiencia` al enviar push | ✅ |
| RLS noticias por audiencia — socios solo ven `audiencia='todos'`, cuerpo técnico ve ambas | ✅ |
| `database.types.ts` — regenerado (incluye todos los nuevos campos) | ✅ |
| Migration `20260617000000` — RLS SELECT en `profiles` para rol `secretaria` y `porteria` (fix nombres en blanco en panel web) | ✅ |
| Migration `20260617000001` — repara `profiles.roles[]` para perfiles con socios sin `'socio'` en el array | ✅ |
| `useNoticias` — suscripción Supabase Realtime: refetch automático ante INSERT/UPDATE en `noticias` | ✅ |
| `(socio)/noticias.tsx` — chips de filtro por deporte con `flex: 1` (ancho completo) | ✅ |
| `admin-socios` — link `jugadores.socio_id` al crear socio si el DNI existe en jugadores | ✅ |
| `assign-role` — siempre incluye `'socio'` en `roles[]` al asignar rol staff a un socio | ✅ |
| `useUsuarios` — búsqueda de socio por DNI o nombre (auto-detecta, lista de resultados si hay varios) | ✅ |
| Web subcomisión `/usuarios` — filtra socios/admin, fix delete, modal "+ NUEVO USUARIO" con tabs | ✅ |
| Dev build Android generado (incluye v3 completo) | ✅ |
| Repo GitHub conectado a Vercel — auto-deploy en push a main | ✅ |
| Portería: test carnet QR end-to-end | ⏳ pendiente |
| Secrets AWS (Rekognition) + MercadoPago + Resend | ⏳ cuando estén disponibles |

**Notas de comportamiento actual:**
- `validate-photo` corre sin Rekognition si `AWS_ACCESS_KEY_ID` no está seteado (valida manualmente directo en DB).
- Migraciones v2 se aplicaron manualmente en cloud — historial reparado con `migration repair`.
- `20260608` y `20260609000000` se aplicaron vía `supabase db query --linked`.
- `20260610000000` aplicada en cloud vía `supabase db push`.
- Migraciones v3 (`20260616000000`, `20260616000001`, `20260616000002`) aplicadas vía `supabase db push`.
- Foto del socio se gestiona desde "Mi Perfil" (useSobre), no desde el carnet. Al cambiar la foto, `foto_validada` se resetea a `false`.
- `totp-client.ts` usa SHA-1 + HMAC puro en JS (sin `crypto.subtle`) — compatible con todas las versiones de Hermes.
- `useCuotas` inyecta una cuota virtual para el mes actual si no existe en DB — se reemplaza por la real al pagar.
- `push_tokens` usa DELETE + INSERT en lugar de upsert para evitar conflictos de RLS entre usuarios del mismo dispositivo.
- Secretaría tiene panel web propio en `web/app/(secretaria)/` — separado de subcomisión.
- Las páginas de secretaría están en `(secretaria)/secretaria/{socios,noticias,servicios,categorias}/page.tsx` — el segmento `secretaria/` es necesario para que las rutas resuelvan a `/secretaria/*` (el route group no agrega segmento de URL).
- Login web detecta el rol y redirige: `secretaria` → `/secretaria/socios`, resto → `/dashboard`.
- `web/.env.local` apunta a Supabase cloud (`tlexvbattnzpmdftjsao`).
- `useScrollToTop` de `@react-navigation/native` aplicado en todas las tabs principales — tocar el ícono activo scrollea al tope.
- **Identidad visual:** tema fijo oscuro (sin toggle light/dark). Paleta: fondo `#15110A`, card `#1C1710`, sidebar web `#0B0905`, oro `#F5B41C`, texto `#F3EFE4`, muted `#8E8574`. Fuentes: Barlow + Barlow Semi Condensed + JetBrains Mono.
- Fondo de pantallas app es `#15110A` (explícito en `ThemeContext` — `fondo` y `papel` ya no son `transparent`). `StripeBackground` existe en `app/components/shared/StripeBackground.tsx` pero no está montado en el root layout (SVG Pattern tiene bugs en Android). Pendiente reimplementación con líneas SVG individuales.
- Web: patrón de rayas en `body` y `.bg-papel` via `globals.css`. Sidebars usan `style` inline (`#0B0905`) porque `components/` no era escaneado por Tailwind (ahora fijo con `@source "../components"`).
- **NativeWind eliminado del app móvil:** `nativewind` fue removido de `metro.config.js` (`withNativeWind`) y de `babel.config.js` (`jsxImportSource`). La app usa `StyleSheet.create` en todas partes — no hay ningún `className` en el código. NativeWind solo aplica al panel web (`web/`).
- **React Navigation v7 + New Architecture — loop infinito:** nunca retornar `null` desde el root layout (`_layout.tsx`) ni usar `useRootNavigationState()`. Retornar `null` desmonta/remonta el árbol de navegación y `useRootNavigationState` usa `useNavigation()` internamente, ambos generan cascadas de `useSyncExternalStore` → `forceStoreRerender` en loop. Patrón correcto: siempre renderizar el árbol (el `SplashScreen.preventAutoHideAsync()` oculta la UI), y usar un flag `useState(false)` + `useEffect(() => setMounted(true), [])` en lugar de `navState?.key`.
- **EAS env vars:** `.env.local` está en `.gitignore` — EAS no lo lee. Las variables `EXPO_PUBLIC_*` deben setearse con `eas env:create --environment preview`. Ya configuradas: `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` en environment `preview`.
- `suppressHydrationWarning` en `<html>` del layout web — evita falso error por Dark Reader extension.
- **Multi-rol:** `profiles.roles TEXT[]` contiene todos los roles disponibles del usuario; `profiles.rol` es el activo (usado por RLS `get_rol()`). Todo usuario staff es socio primero — `assign-role` agrega un rol sobre la base socio existente. El socio puede cambiar su vista activa desde "Mi Perfil" si tiene más de un rol.
- **noticias.audiencia:** `'todos'` (socios + staff) o `'cuerpo_tecnico'` (solo coordinador/entrenador/manager). RLS aplica el filtro automáticamente — el hook `useNoticias` no necesita cambios.
- **Calendario socio:** `useCalendarioSocio` detecta si el socio es jugador (por DNI → `jugadores.socio_id`) y filtra partidos/resultados con badge "MI EQUIPO". Filtrable por deporte (rugby/hockey/tenis).
- **Cancelación de eventos:** coordinador marca `cancelado=true` + inserta noticia automática (audiencia='todos', `generada_automaticamente=true`) + push a jugadores de la división via `jugadores → socios → push_tokens`.
- **`divisiones.deporte`:** campo en schema, seed ruby por default. Selector en web `/divisiones` al crear división.

**Débito automático con tarjeta — diseño implementado:**
- `associate-card`: secretaria o socio asocian tarjeta → tokeniza con CVV → guarda en MP customer → sin cobro al momento
- `remove-card`: elimina tarjeta de MP y limpia campos en `socios`
- `charge-card`: cobro manual por secretaria con tarjeta guardada (para pagos extra o reintento)
- `cobro-mensual`: cron diario 9am — cobra socios con tarjeta, reintentos días +1/+2/+3, al 4to fallo notifica secretaria por push + marca moroso
- Cambio de tarjeta por el socio: **no dispara cobro** aunque el período esté impago
- `forma_pago = 'tarjeta'` agregado al CHECK constraint en `pagos_socios`

**Notas adicionales:**
- Socios del club: **1000+** personas (los ~60 usuarios son el cuerpo técnico/organizativo).
- `useUsuarios` filtra `rol = 'socio'` — los socios no aparecen en la gestión de usuarios de subcomisión.
- Creación de usuarios staff: nombre + email + DNI. Contraseña inicial = DNI. Sin invite email.
- También se puede asignar rol a un socio existente buscando por DNI (exacto) o nombre (ilike, hasta 5 resultados).
- `assign-role` siempre garantiza `'socio'` en `roles[]` — todo staff es socio primero.
- Roles creables por subcomisión: coordinador, entrenador, manager, subcomisión. Secretaría y portería solo admin.
- Email de bienvenida: se envía vía Resend al crear usuario. Si `RESEND_API_KEY` no está seteado, se omite sin fallar.
- `CLUB_EMAIL_FROM=uncasrclub@gmail.com` — seteado en Supabase secrets.

**Próximo paso:**
- Test end-to-end portería carnet QR con dev build
- Setear secrets de MercadoPago, Resend y AWS cuando estén disponibles

**Deploy web:** https://web-chi-nine-26.vercel.app (prod) — proyecto `agusmuzi79-4892s-projects/web` en Vercel. Repo GitHub conectado — auto-deploy en push a `main`. Para deploy manual desde `web/`: `vercel --prod --yes`.

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
