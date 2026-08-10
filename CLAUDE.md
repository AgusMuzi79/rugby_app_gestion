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
| Preview build Android generada — `dda1831f` (2026-06-18) | ✅ superada |
| Preview build Android — `a678ac11` (2026-07-31, incluye toda la auditoría pre-producción hasta el commit `c82bfb3`) | ✅ [APK](https://expo.dev/artifacts/eas/mI7SC2hkMjXiY736BDQ_lM9wGIZ_mv3__Qn6CNfn4Bw.apk) |
| Preview build Android — `2c3505c0` (2026-08-03, agrega el fix de espaciado de `(socio)/calendario.tsx`, commit `4d15ae0`) | ✅ superada |
| Preview build Android — `fd404c00` (2026-08-03, incluye badge "J" guiño interno en carnet físico para un grupo de socios, commit `eaec70b`) | ✅ superada |
| Preview build Android — `c1464e5e` (2026-08-04, corrige posición del badge "J" a esquina inferior derecha, commit `265c99a`) | ✅ superada |
| Preview build Android — `942188b3` (2026-08-04, junta los cambios JS pendientes: fix paginación `useSociosSecretaria`/`useDiarioSecretaria`, `declarar-comprobante` en `useCuotas`, TOTP/biometría namespaceados por usuario, semáforo binario de morosidad en `(socio)/cuotas.tsx`; hasta el commit `e913cc0`) | ✅ superada |
| Preview build Android — `f823789d` (2026-08-04, fixes del pipeline de push notifications: `registerPushToken()` en sesión restaurada, `projectId` explícito, plugin `expo-notifications`, handler de foreground temprano, fix badge "J" tapado en el carnet; hasta el commit `0934eb1`) | ✅ superada |
| Preview build Android — `693342f5` (2026-08-10, junta detalle de deuda del socio, pantalla de Términos y Condiciones + guard, config de stores en `app.config.js`/`eas.json`; hasta el commit `b011992`) | ✅ [APK](https://expo.dev/artifacts/eas/ifJOUxBzztDXJjLMT11n27sH3fzbHNeb4xaxbFsEkL4.apk) |
| Repo GitHub conectado a Vercel — auto-deploy en push a main | ✅ |
| Fix deploy Vercel: `rootDirectory` corregido a `web/` en project settings (Vercel buildaba desde root y escaneaba `app/` de Expo) | ✅ |
| Migration `20260618000000` — repara `profiles` donde `rol` activo no estaba en `roles[]` | ✅ |
| Migration `20260618000001` — función `register_push_token` SECURITY DEFINER (fix RLS upsert) | ✅ |
| `push_tokens` — registra via RPC `register_push_token` (SECURITY DEFINER, evita conflicto RLS) | ✅ |
| `cors.ts` — `Access-Control-Allow-Headers` incluye `x-client-info, apikey` (fix Supabase SDK) | ✅ |
| `admin-usuarios` `handleAssignRole` — join `profiles` para `nombre` (socios no tiene nombre/email) | ✅ |
| `buscarSocio` web + mobile — join `profiles!socios_profile_id_fkey` para obtener nombre | ✅ |
| Web login — restaura `rol` activo a rol web si el usuario switcheó a rol móvil desde la app | ✅ |
| `fecha_nacimiento` en creación de socio — formulario web secretaría + modal mobile | ✅ |
| Carnet físico — botón "VER CARNET" en `(socio)/carnet.tsx` abre modal con vista tipo DNI | ✅ |
| QR TOTP — paso cambiado de 30s a 60s (cliente + servidor + Edge Function `socios-qr`) | ✅ |
| Pull-to-refresh en pantalla carnet + `refresh` en `useCarnet` (resetea foto URL cacheada) | ✅ |
| `useRefreshOnFocus` — hook helper con `useFocusEffect` + ref pattern (callback estable) | ✅ |
| Refresh automático al volver al foco — aplicado en 16 hooks de datos (diarios, calendario, noticias, cuotas, socios, protocolos, notificaciones, eventos, informes, crónica, asistencia) | ✅ |
| Fix `notifications` Edge Function — `noticia_publicada` y `cancelacion_entrenamiento` bloqueadas por validación genérica de `NotifPayload` | ✅ |
| Fix `useCronica` — payload con `tipo` en vez de `type`, sin wrapper `payload`, sin `rolDestinatario` | ✅ |
| Fix `notifications` — `getDestinatariosSocio()` con `.contains('roles', ['socio'])` en vez de `.eq('rol', 'socio')` (multi-rol) | ✅ |
| Fix noticias web — pasa `audiencia` al Edge Function; `cuerpo_tecnico` pushea a staff, `todos` pushea a socios | ✅ |
| `app.config.js` + `eas.json` — dev build usa package `com.uncas.rugbyapp.dev` para coexistir con preview build en el mismo teléfono | ✅ |
| `(socio)/calendario.tsx` — header igualado al resto de tabs (`<Header />` + barra edición), "Fixture" renombrado a "CALENDARIO" | ✅ |
| Carnet físico — agrega logo del club (esquina), deporte + división (si es jugador), chips de roles | ✅ |
| `useCarnet` — agrega `roles`, `division`, `deporte` a `CarnetData` (query a `jugadores → divisiones`) | ✅ |
| `useSobre` — foto busca siempre en `socios` (no solo si `rol === 'socio'`); staff con doble rol ve su foto de socio | ✅ |
| Migration `20260624000000` — fix RLS `socios` y `socios-fotos`: elimina `get_rol() = 'socio'` de policies de propiedad (bloqueaba staff multi-rol) | ✅ |
| Migration `20260624000001` — `cuotas.estado` agrega `'en_revision'`, `cuotas.comprobante_path TEXT`, RLS UPDATE propio por socio | ✅ |
| `useCuotas` — sin MercadoPago; `subirComprobante()` sube foto al bucket `comprobantes`, pone cuota en `en_revision` | ✅ |
| `(socio)/cuotas.tsx` — rediseño completo: cards expandibles, modal con alias `cuenta.uncas.rugby`, subida de comprobante, estados verde/oro/pendiente | ✅ |
| Migration `20260714000000` — precios reales de `categorias_socio` y `servicios_opcionales` (Abril 2026, reemplaza placeholders) | ✅ |
| Migration `20260729000000` — `socios.cabecera_id`, `jugadores.fichado_temporada_actual`, servicio "Tenis Carnet" | ✅ |
| Migration `20260731000000` — trigger `guard_profiles_role_update`: bloquea que un usuario autoescale `rol`/`roles`/`divisiones`/`activo` en su propio `profiles` (hallazgo #1 de auditoría pre-producción) | ✅ |
| Migration `20260731000001` — triggers `guard_cuotas_update`/`guard_socios_update`: bloquea que el socio se automarque una cuota `pagado` o toque `monto`, y que se autovalide la foto o cambie `estado`/`categoria_id`/etc. (hallazgos #2/#3) | ✅ |
| `admin-socios` `validate-photo` — sin AWS configurado, ya no autoaprueba si el caller es el propio socio (queda pendiente de revisión por Secretaría) | ✅ |
| `notifications` — chequea rol del caller por tipo de notificación (antes cualquier autenticado, incluido un socio, podía mandar push a todo el club) (hallazgo #4) | ✅ |
| Push a socios — corregida URL de Expo (faltaba `/api/v2/`), chunking de 100 mensajes/request, backfill `roles=['socio']` en los 1527 socios importados con `roles='{}'` (hallazgo #5, parte push) | ✅ |
| Comprobantes de pago — bucket `comprobantes` acepta JPG/PNG + policies INSERT/UPDATE propias del socio; acción `declarar-comprobante` en `socios-pagos` resuelve/crea la cuota con monto server-side (soluciona el caso de la cuota del mes actual) (hallazgo #5, parte comprobantes) | ✅ incluido en preview build `942188b3` |
| TOTP del carnet + credenciales de biometría namespaceadas por usuario y borradas en `signOut()`/reset de contraseña (hallazgo #6, teléfonos compartidos) | ✅ incluido en preview build `942188b3` |
| Limpieza de datos de prueba en cloud (8 socios test + división M15 + dependencias) | ✅ |
| **Carga masiva de socios reales** — 1528 socios, 322 jugadores UAR, 27 divisiones, 1115 servicios opcionales, 588 grupos familiares | ✅ |
| Backfill TOTP (`socios_secrets`) para los 1528 socios importados — habilita el carnet QR | ✅ |
| Migration `20260804000003` — activa en bloque (`estado='activo'`) a los 1528 socios de la carga masiva, sin foto validada (ver nota abajo) | ✅ |
| Fix paginación PostgREST (tope 1000 filas) — panel web socios, `useSociosSecretaria`, `useDiarioSecretaria`, `notifications` (deployada) | ✅ |
| `scripts/import-socios-masivo.mjs` + `scripts/backfill-totp-secrets.mjs` — reutilizables para próximas cargas | ✅ |
| **Semáforo de morosidad** — importador recurrente del reporte NUVIX (`RPT_Vencimientos`), calcula verde/amarillo/rojo/exento por socio | ✅ |
| Migration `20260804000000` — `importaciones_deuda`, `comprobantes_deuda`, columnas de semáforo en `socios`, RLS, función `importar_deuda_nuvix` | ✅ |
| Migration `20260804000001` — fix: el semáforo participa para `estado IN ('activo', 'pendiente')`, no sólo `'activo'` | ✅ |
| Migration `20260804000002` — fix: `exento` por nombre de categoría (Vitalicio/Becado), no por `monto_mensual = 0` | ✅ |
| Edge Function `importar-deuda` (verify_jwt activo, rol secretaria/admin) | ✅ |
| Web `secretaria/deuda` ("Importar": subida + historial) y `secretaria/deudas` ("Deudas": listado filtrable por color, separado 2026-08-05) + links en el sidebar | ✅ |
| Semáforo binario en `(socio)/cuotas.tsx` — `useCuotas` lee `socios.semaforo`, banner sólo si hay deuda real | ✅ incluido en preview build `942188b3` |
| **Push notifications — funcionando end-to-end**, confirmado con un envío real recibido en el teléfono (2026-08-04) | ✅ |
| Pantalla mobile de detalle de deuda del socio — modal en `(socio)/cuotas.tsx`, `useDeudaDetalle` | ✅ código — requiere build nueva del mobile |
| Migration `20260804000004` — RLS: socios leen `importaciones_deuda` (sello de frescura) | ✅ |
| Secrets AWS (Rekognition) + Resend | ⏳ cuando estén disponibles |
| Integración Banco Macro (pagos automáticos) | ⏳ pendiente — reemplazaría alias manual |

**Notas de comportamiento actual:**
- `validate-photo` corre sin Rekognition si `AWS_ACCESS_KEY_ID` no está seteado (valida manualmente directo en DB).
- Migraciones v2 se aplicaron manualmente en cloud — historial reparado con `migration repair`.
- `20260608` y `20260609000000` se aplicaron vía `supabase db query --linked`.
- `20260610000000` aplicada en cloud vía `supabase db push`.
- Migraciones v3 (`20260616000000`, `20260616000001`, `20260616000002`) aplicadas vía `supabase db push`.
- Migraciones `20260617000000`, `20260617000001`, `20260618000000`, `20260618000001` aplicadas vía `supabase db push`.
- `20260714000000` aplicada en cloud vía `supabase db push`. `categorias_socio` (Abril 2026): Titular de Grupo $60.000, Activo Mayor $50.000, Activo Menor $25.000, Activo Unquitas $12.500, Dependiente Grupo Familiar $0, Vitalicio $0, Becado Rugby/Hockey/Tenis $0. `servicios_opcionales`: Hockey $31.250, Rugby $25.000, Tenis $25.000, Gimnasio $18.750 (tarifa única — el schema no distingue Gym Mayor/Menor por edad todavía). Falta categoría "Cliente" (sin precio confirmado, 6 socios activos).
- Foto del socio se gestiona desde "Mi Perfil" (useSobre), no desde el carnet. Al cambiar la foto, `foto_validada` se resetea a `false`.
- **Los 1528 socios de la carga masiva están `estado='activo'` sin foto validada (migration `20260804000003`, 2026-08-04).** La carga masiva no trajo `foto_path` desde NUVIX, así que el botón "VALIDAR FOTO" de secretaría nunca iba a aparecer para ellos (`web/.../socios/page.tsx` solo lo muestra si `foto_path` no es null) — la única forma de resolverlo sería que cada socio suba su propia foto desde "Mi Perfil", algo que no iba a pasar para 1528 personas en un plazo razonable. Decisión de Agus: son socios reales verificados desde el sistema del club (no altas orgánicas sin verificar), se activan en bloque. El gate de foto sigue estricto para altas nuevas — `admin-socios`/`validate-photo` sin cambios, un alta manual nueva sigue arrancando en `pendiente` hasta que secretaría valide una foto real.
- `totp-client.ts` usa SHA-1 + HMAC puro en JS (sin `crypto.subtle`) — compatible con todas las versiones de Hermes. Paso TOTP = **60 segundos** (cambiado de 30s) — sincronizado en `totp-client.ts`, `_shared/totp.ts` y `useCarnet.ts`.
- `useCuotas` inyecta una cuota virtual para el mes actual si no existe en DB — se reemplaza por la real al confirmar pago.
- `push_tokens` usa RPC `register_push_token` (SECURITY DEFINER) — hace DELETE + INSERT bypasseando RLS. Las policies de UPDATE/INSERT bloqueaban tanto upsert como delete+insert directo cuando el token pertenecía a otro usuario.
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
- **Guard anti-escalada en `profiles`:** trigger `guard_profiles_role_update` (migration `20260731000000`) bloquea, para cualquier caller que no sea admin/subcomisión, cambios a `roles[]`, `divisiones` y `activo`, y solo permite cambiar `rol` a un valor ya presente en `roles[]` propio (switcheo multi-rol legítimo). Conexiones con `service_role` (`auth.uid() IS NULL`, todas las Edge Functions) quedan exentas. Antes de este fix, `profiles_update_own` no tenía `WITH CHECK` ni restricción de columnas — cualquier socio podía hacer `UPDATE profiles SET rol='admin'` desde el cliente.
- **Guards anti-escalada en `cuotas` y `socios`:** mismo patrón (migration `20260731000001`). `guard_cuotas_update` — el socio solo puede pasar su propia cuota de `pendiente` a `en_revision` junto con `comprobante_path`; nunca `pagado`, ni tocar `monto`/`periodo`/`socio_id`. `guard_socios_update` — el socio solo puede subir `foto_path` con `foto_validada=false`; nunca autovalidarse (`foto_validada=true`) ni tocar `estado`/`categoria_id`/`dni`/`numero_socio`/`cabecera_id`/campos de tarjeta. Secretaría/admin (y subcomisión para `socios`) exentos. Complementa el fix de `admin-socios` `validate-photo`: sin AWS configurado, si el caller es el propio socio ya no se autoaprueba (antes: cualquier foto subida por el socio pasaba `foto_validada=true` + `estado='activo'` sin revisión humana).
- **Chequeo de rol en `notifications`:** `ROLES_POR_TIPO` en `supabase/functions/notifications/index.ts` — cada tipo de notificación (`lesion`, `fichaje`, `ausencias_consecutivas`, `cancelacion_entrenamiento`, `noticia_publicada`, `manual`) solo lo puede disparar el rol dueño de esa pantalla (`admin` siempre puede todo). Para `manual`, elegir un `rolDestinatario` distinto de `'todos'` queda reservado a subcomisión/admin (crónica de manager/entrenador/coordinador solo manda con `'todos'`). Antes de este fix, la función solo validaba que el JWT fuera válido — cualquier socio autenticado podía mandar push a todo el club (o simular una cancelación de entrenamiento, un fichaje, etc.).
- **Push a socios — causa raíz real (no la de paginación):** tres bugs independientes hacían que ningún socio recibiera push. 1) `EXPO_PUSH_URL` apuntaba a `.../expo-push-notification-service/push/send` en vez de `.../api/v2/push/send` (`socios-pagos` sí usaba la URL correcta, `notifications` no). 2) `scripts/import-socios-masivo.mjs` nunca seteaba `profiles.roles` al crear el profile → los 1528 socios quedaban con `roles='{}'` (default de columna) y `getDestinatariosSocio()` filtra por `.contains('roles', ['socio'])`, que con array vacío da `false`. Corregido en el script (`roles: ['socio']`) y con backfill en producción (`UPDATE profiles SET roles = ARRAY['socio'] WHERE roles = '{}' AND rol = 'socio'` — 1527 filas). 3) Expo rechaza requests de más de 100 mensajes; `enviarExpoPush` ahora manda en chunks de 100 y loguea si Expo devuelve error (antes el fetch no chequeaba la respuesta, así que un 404 quedaba invisible).
- **Teléfonos compartidos — TOTP y biometría namespaceados (hallazgo #6):** `useCarnet.ts` cacheaba el secreto TOTP en SecureStore bajo la clave global `'totp_secret'`, y `useLogin.ts` guardaba `biometria_email`/`biometria_password` también con claves globales — ninguna se borraba en `signOut()`. En un teléfono compartido (588 grupos familiares) el segundo usuario que loguea heredaba el secreto TOTP del primero (carnet nunca valida) y cualquier huella/Face ID enrolada en el dispositivo destrababa la sesión guardada del usuario anterior. Fix: `totpSecretKey(userId)` namespacea el secreto por usuario (exportado desde `useCarnet.ts`); `useSignOut.ts` borra las tres claves (`EMAIL_KEY`, `PASSWORD_KEY` de `useLogin.ts`, y el TOTP del usuario saliente) antes de limpiar el store de auth; `useResetPassword.ts` también limpia `EMAIL_KEY`/`PASSWORD_KEY` al cambiar contraseña (quedarían con la contraseña vieja si no). **Cambio 100% JS — no toma efecto hasta la próxima build/OTA del mobile.**
- **Comprobantes de pago — flujo arreglado:** el bucket `comprobantes` (`20260601000002_socios_storage.sql`) solo aceptaba `application/pdf` (pensado para el PDF que generaba el checkout de Mercado Pago) y nunca tuvo policy de INSERT para el socio — el flujo de alias+comprobante (agregado después, `20260624000001`) necesitaba subir un JPG directo desde el cliente y fallaba siempre. Migration `20260731000002` amplía mime types (`image/jpeg`, `image/png`) y agrega `comprobantes_insert_own`/`comprobantes_update_own` (mismo folder-scoping que `socios-fotos`, por `get_socio_id()`). Además, para la cuota del mes actual (la virtual que inyecta el cliente), la subida no creaba ni actualizaba ninguna fila en `cuotas` — el socio pagaba y el sistema nunca se enteraba. Fix: acción nueva `declarar-comprobante` en `socios-pagos` (reusa la lógica de cálculo de monto de `handleCheckout`: categoría + servicios opcionales, siempre server-side) que resuelve o crea la fila de `cuotas` en `en_revision`; `useCuotas.ts` ya no escribe `cuotas` directo, llama a esta acción y hace `refetch()`. **Este último cambio es JS — no toma efecto hasta la próxima build/OTA del mobile.**
- **noticias.audiencia:** `'todos'` (socios + staff) o `'cuerpo_tecnico'` (solo coordinador/entrenador/manager). RLS aplica el filtro automáticamente — el hook `useNoticias` no necesita cambios. El push respeta la audiencia: `todos` → `getDestinatariosSocio()` (contains 'socio' en `roles[]`); `cuerpo_tecnico` → coordinador+entrenador+manager.
- **`useRefreshOnFocus`:** hook helper en `app/hooks/useRefreshOnFocus.ts`. Usa `useFocusEffect` con un ref interno para mantener el callback estable (evita re-ejecución en cada render aunque el fetch no sea `useCallback`). Se aplica en todos los hooks de datos — no aplicar en `useAsistencia` (flujo puntual) ni en hooks que ya tienen `useFocusEffect` propio.
- **Calendario socio:** `useCalendarioSocio` detecta si el socio es jugador (por DNI → `jugadores.socio_id`) y filtra partidos/resultados con badge "MI EQUIPO". Filtrable por deporte (rugby/hockey/tenis).
- **Cancelación de eventos:** coordinador marca `cancelado=true` + inserta noticia automática (audiencia='todos', `generada_automaticamente=true`) + push a jugadores de la división via `jugadores → socios → push_tokens`.
- **`divisiones.deporte`:** campo en schema, seed ruby por default. Selector en web `/divisiones` al crear división.
- **Push notifications — dev build:** el dev build (`com.uncas.rugbyapp.dev`) NO recibe notificaciones push. La Edge Function `notifications` corre correctamente y entrega los tokens a Expo, pero FCM los descarta porque `com.uncas.rugbyapp.dev` no está registrado en Firebase. Testear push siempre con el **preview build** (`com.uncas.rugbyapp`). Para habilitar en dev: registrar el package en Firebase Console y regenerar `google-services.json`.
- **Push notifications — RESUELTO (2026-08-04).** Nadie en todo el club recibía push. Eran **3 bugs independientes**, encontrados en cadena — arreglar el primero exponía el segundo, y así:
  1. **Cliente nunca registraba/renovaba el token** (auditoría con Opus): `registerPushToken()` sólo se llamaba desde el login explícito (`useLogin.ts`) — una sesión restaurada al abrir la app (lo normal) nunca lo disparaba. Sumado a `getExpoPushTokenAsync()` sin `projectId` (obligatorio, fallaba en silencio — sin Sentry/logging remoto en el repo, invisible en producción), el plugin `expo-notifications` faltante en `app.config.js`, y el `setNotificationHandler` de foreground que sólo se registraba si montaba la pantalla de login. Fix: todo centralizado en el listener de auth de `_layout.tsx` (que siempre carga primero), `projectId` explícito, plugin agregado. Requirió build nueva (`f823789d`).
  2. **`getDestinatariosSocio()` (y las otras 3 funciones con el mismo patrón) devolvían 0 tokens en silencio para audiencia 'todos'**: PostgREST arma la URL de `.in('usuario_id', ids)` con todos los ids en la query string — con los 1528 socios recién activados (2026-08-04) esa URL supera los ~56.000 caracteres y el request vuelve "Bad Request", que el código no revisaba (`{ data: pushRows }` sin chequear `error`). Encontrado llamando la Edge Function directo con un token real y viendo `tokensValidos: 0` en la respuesta. Fix: `fetchPushTokens()` trae los tokens en lotes de 100 ids, mismo patrón que ya se usaba para el chunking de Expo. Deployada — sin esto, **ningún push de audiencia 'todos' había llegado a nadie desde la carga masiva**, probablemente ni antes (el límite ya estaba cerca con menos socios).
  3. **La credencial FCM V1 se subió al lugar equivocado en EAS**: el menú interactivo de `eas credentials -p android` tiene una opción separada "Push Notifications (Legacy): Manage your FCM (Legacy) API Key" — el Google Service Account Key (formato JSON, sólo válido para FCM V1) se cargó ahí la primera vez, así que Expo lo encontraba pero no lo podía usar (`InvalidCredentials: Unable to retrieve the FCM server key`). La opción correcta en ese mismo menú es **"Google Service Account"** (sin decir "V1" explícito en el label). Una vez reasignado ahí, confirmado con un envío real: `{ tokensValidos: 1, ok: 1, errores: [] }` y notificación recibida en el teléfono.
  - De paso: `enviarExpoPush()` ahora devuelve un resumen (`tokensValidos`/`ok`/`errores` por ticket de Expo) en la respuesta HTTP de `notifications`, no sólo en logs — permite diagnosticar llamando la función directo sin depender del visor de logs del dashboard (que además mostró tener lag/inconsistencias para esta función durante el debugging).
  - Fix de paso: el badge "J" del carnet físico (`(socio)/carnet.tsx`) quedaba tapado por la franja inferior (`cardFooter`, fondo sólido) porque se renderizaba antes en el árbol — se corrigió el orden.
  - **Inconsistencia menor sin resolver**: `guardarNotificacion()` (inserta en la tabla `notificaciones` para el historial in-app) sólo se llama para `lesion`/`fichaje`/`ausencias_consecutivas` — `noticia_publicada`, `manual` y `cancelacion_entrenamiento` nunca quedan registradas ahí, aunque el push sí se envíe. No afecta la entrega del push, sólo el historial in-app.
  - Quedaron algunas noticias de prueba con títulos basura ("fffffffffff", "erssdftyg", "adssssssssssssss") publicadas con audiencia 'todos' durante el debugging — pendiente que secretaría las borre del panel web.

**Alcance definido por comisión directiva (2026-07-03):** la app es un **complemento** al sistema de gestión existente del club, pensada principalmente para visualizar socios morosos (semáforo). El pago real dentro de la app se implementaría **solo si se concreta la integración con Banco Macro** — hasta entonces, el flujo de alias + comprobante es una solución interina, no el objetivo final. No priorizar pulido adicional de ese flujo (ej. página de aprobación de comprobantes) sin confirmar con directiva que vale la pena vs. esperar a Macro.

**Flujo de pago de cuotas (actual — interino, ver nota de alcance arriba):**
- Socio ve sus cuotas con cards expandibles (pendiente / en revisión / pagada)
- Cuota pendiente → "VER CÓMO PAGAR" → modal con alias `cuenta.uncas.rugby` + monto + botón subir comprobante
- Socio sube foto del comprobante → se guarda en bucket `comprobantes/{socio_id}/{periodo}.jpg` → estado pasa a `en_revision`
- Secretaría confirma manualmente desde el panel web (pendiente de implementar en web)
- Integración Banco Macro prevista para futuro — reemplazaría el alias manual

**Carga masiva de socios reales — COMPLETA (2026-07-29/30).** Se importaron los 1528 socios activos reales del club (de 1534 en `Estado=SOCIO`; excluidos los 6 de categoría "Cliente" sin precio confirmado), cruzando por DNI dos exports del sistema del club:
- `Tabla de datos.txt` — export NUVIX, padrón completo de socios (TSV, ISO-8859-1, 3098 filas, 52 columnas; vocabulario de ERP de ventas, no de club: "Vendedor", "Lista", "Condición Venta").
- `Jugadores.xls` — padrón UAR de jugadores fichados (1255 filas). Archivo `.xls` real OLE2/BIFF — **`xlrd` no lo abre (compdoc corruption), usar SheetJS (`xlsx` npm) vía Node.** Trae la división específica de cada jugador (M6...M22, Mayores, Infantil) y `Ult.fichaje` (año del último fichaje).

El cruce, mapeo de columnas y limpieza se resolvieron en un archivo maestro intermedio (`socios_activos_maestra.xlsx`, armado en otra sesión) antes de importar. Resultado en cloud:
- **1528 socios** (auth user + profile + socio), estado inicial `pendiente` (falta validar foto, igual que en el alta manual).
- **322 jugadores** vinculados vía UAR en **27 divisiones** nuevas — `categoria` derivada del nombre: sufijo "Femenino"→`femenino`, "Inclusivo"→`mixed`, M6-M12→`infantil`, M13-M18→`juvenil`, M19+/Mayores→`superior`.
- **1115 vínculos de servicio opcional**: Hockey 306, Rugby 290, Tenis 405 (incluye los 155 "Tenis Carnet" fusionados), Gimnasio 114.
- **588 grupos familiares** resueltos (`socios.cabecera_id`, nuevo campo — migration `20260729000000`).
- **1528 secretos TOTP** (backfill — el import masivo no pasa por `admin-socios`, que es quien genera el secreto en el alta manual).
- **Regla de negocio jugadores/UAR:** "fichaje vigente" = `Ult.fichaje` == año de temporada actual → `jugadores.fichado_temporada_actual` (nuevo campo). Sin fichaje vigente: puede entrenar y usar la app normalmente, pero no figura en mesa de partido.

**Decisiones de mapeo aplicadas:**
- Categoría "Cliente" (6 socios, sin precio confirmado en ninguna fuente) → excluidos de esta carga.
- Servicio "Tenis Carnet" (155 socios) → catálogo propio creado en `servicios_opcionales` ($25.000) pero los socios quedaron vinculados al servicio "Tenis" existente para no duplicar el cargo — decisión de Agus, ajustable después si se define mejor la modalidad.
- DNI inválido/faltante (42 casos) → DNI sintético `SD{código_nuvix}` — no pueden loguearse hasta que secretaría cargue el DNI real.
- Email sin dato o compartido en la familia → email sintético `socio-{código}@uncas.local` (el titular se queda con el real cuando existe).
- Becados de rugby: **16 de 33 ya son mayores de edad (18+)** — el club nunca revisó si corresponde mantenerles la beca al cumplir 18. Flag pendiente de revisar con secretaría, no bloquea nada.

**Bugs encontrados y corregidos durante el import (dejar como referencia para la próxima carga):**
- El maestro pone `cabecera_cod_cliente` = código propio para los titulares (auto-referencia) → 214 socios quedaron con `cabecera_id` apuntando a sí mismos. Corregido con `UPDATE socios SET cabecera_id = NULL WHERE cabecera_id = id`.
- 2 emails fallaron en la primera pasada: uno con "ñ" (inválido para Supabase Auth — se usó el fallback de email UAR sin acentos) y el del propio Agus (colisionaba con su cuenta admin — se vinculó el socio a la cuenta admin existente en vez de crear una duplicada, mismo patrón multi-rol que ya usa la app).
- **PostgREST devuelve máximo 1000 filas por default sin `.range()`** — con 1528 socios esto truncaba silenciosamente en 4 lugares: la lista de socios del panel web y de `useSociosSecretaria` (mobile), las stats de `useDiarioSecretaria`, y `getDestinatariosSocio()` en la Edge Function `notifications` (~35% de los socios no recibían push de noticias). Corregido con un helper `selectAllRows` (paginado por `range`) en `web/lib/supabase.ts` y `app/lib/supabase.ts`; `notifications` ya redeployada. **Cualquier query nueva a `socios`/`profiles` (o a futuro `jugadores`/`socio_servicios` si crecen) tiene que tener esto en cuenta.**

Scripts reutilizables para la próxima carga/actualización: `scripts/import-socios-masivo.mjs` (idempotente por DNI, `--dry-run` por default) y `scripts/backfill-totp-secrets.mjs`. Los datos fuente (`data/import/`) están en `.gitignore` — nunca se suben al repo por ser PII real.

**Semáforo de morosidad — COMPLETO (2026-08-04).** El enfoque original (interpretar `FechaInicioLiquidacion` como proxy de meses adeudados) se descartó — nunca se confirmó con el club y tenía 39% de falsos morosos. Reemplazado por un importador recurrente del reporte real de cuentas corrientes de NUVIX (`RPT_Vencimientos`, Crystal Reports `.xls` con bandas). Propuesta OpenSpec completa (proposal/design/tasks/specs) en `openspec/changes/importador-deuda-nuvix/`.

- Secretaría sube el `.xls` desde `web/(secretaria)/secretaria/deuda`. Se parsea con SheetJS (`_shared/parse-deuda-nuvix.ts`), se valida que la suma de subtotales por cuenta cierre exacto contra el Total General del propio archivo (si no, aborta todo — no guarda nada a medias), y se persiste vía una función Postgres transaccional (`importar_deuda_nuvix`, SECURITY DEFINER, sólo invocable por `service_role`).
- Semáforo por socio: cuenta **períodos distintos con `vencido > 0`** (derivados de la descripción del comprobante, no de la fecha de vencimiento) — 0 = verde, 1 = amarillo, 2+ = rojo. `reg_cesantes` (plan de regularización) se excluye del conteo. `exento` = categoría `Vitalicio`/`Becado Rugby`/`Becado Hockey`/`Becado Tenis`.
- `socios.numero_socio` ya era el Cód. Cliente de NUVIX (poblado por la carga masiva) — no hizo falta columna nueva para el cruce.
- Reimportar el mismo archivo (misma `fecha_corte`) reemplaza limpio, sin duplicar. El semáforo se recalcula para todos los socios `activo`/`pendiente` en cada import — uno que salda su deuda y no vuelve a aparecer en el archivo siguiente vuelve a verde solo.
- **Dos bugs reales encontrados recién al probar contra producción** (la validación offline del parser, sin cruzar contra `socios`, no los detecta):
  1. El semáforo daba 0/0/0/0 — filtraba `estado='activo'`, pero los 1528 socios de la carga masiva quedaron en `'pendiente'` (falta validar foto en bulk). Fix: participa `estado IN ('activo', 'pendiente')`.
  2. `exento` explotó a 653 — estaba definido como categoría con `monto_mensual = 0`, que también agarra "Dependiente Grupo Familiar" (la categoría de la mayoría del club, $0 porque se factura al titular, no por exención). Fix: por nombre exacto de categoría.
- Resultado final probado contra el archivo real (`todos_desde_el_2022.xls`, corte 28/07/2026): comprobantes 1.739 y personas 536 exactos; **rojo 102 / amarillo 96 / verde 1.278 / exento 52** vs. el número de referencia del club (rojo 108 / amarillo 100 / verde 1.273) — dentro de ~0.4%, sin cerrar exacto. Un diagnóstico de lectura contra producción no encontró ningún bug (el `meses_impagos` guardado coincide 100% con un recálculo independiente en JS); se decidió con Agus no seguir cazando ese margen por ahora.
- **Semáforo binario en `(socio)/cuotas.tsx` — implementado (2026-08-04, follow-up separado).** `useCuotas` lee `socios.semaforo` + `deuda_actualizada_at` de la propia fila (misma RLS que ya usa, sin cambios) y expone `alDia` (booleano — `false` sólo si `semaforo` es `amarillo`/`rojo`) y `deudaActualizadaAt`. La pantalla muestra un tercer banner (estilo tarjeta, borde izquierdo en `colors.rojoUrgente`, distinto de los dos banners dorados existentes que son del flujo interino de alias+comprobante) **sólo si `!alDia`**, con la fecha de corte del último import ("datos al DD/MM") para que quede claro que puede haber desfasaje con lo que el socio ya pagó. Si está al día no se muestra nada (decisión de Agus — silencio = todo bien). **Cambio 100% JS, no toma efecto hasta la próxima build/OTA del mobile** — no se pudo probar visualmente en un dispositivo real en esta sesión.
- **Pantalla mobile de detalle de deuda del socio — implementada (2026-08-05).** Modal `DeudaClubModal` en `(socio)/cuotas.tsx`, se abre al tocar el banner "según los registros del club...". `useDeudaDetalle.ts` trae la última `importaciones_deuda` + los `comprobantes_deuda` propios del socio y agrupa por período (no lista plana — hasta 6 comprobantes por socio en el mismo mes, se factura una línea por disciplina/integrante). Reglas de `design.md §6` implementadas tal cual: sello de frescura obligatorio ("datos al {fecha_corte}"), `reg_cesantes` en sección aparte ("Plan de regularización", nunca mezclado con cuotas), `a_vencer` mostrado como informativo ("vence el DD/MM"), nunca sumado a la deuda. Migration `20260804000004` — la RLS de `importaciones_deuda` sólo daba SELECT a secretaria/admin, un socio no podía leer ni la `fecha_corte` para el sello de frescura; se abrió lectura a cualquier autenticado (no es data sensible por-persona, son totales agregados). **Cambio 100% JS + 1 migración — requiere build/OTA nueva del mobile, no se probó visualmente en un dispositivo real en esta sesión.**
- **Filtro "Moroso" legacy — resuelto (2026-08-05).** Se sacó de `FILTROS` en `web/.../secretaria/socios/page.tsx` (basado en `socios.estado='moroso'`, seteado sólo por el flujo de tarjeta descartado — siempre daba cero resultados). `ESTADO_LABEL`/`ESTADO_COLOR` se dejan por si queda algún registro legacy con ese estado. La morosidad real vive en `/secretaria/deuda` (semáforo NUVIX) — no se mezclaron los dos sistemas.
- **Import en 3 partes — resuelto con script (2026-08-10).** El importador no soporta más de un archivo por corte (cada llamada reemplaza el corte entero y recalcula el semáforo mirando sólo esa importación — importar partes por separado hace que cada una pise a la anterior, ver detalle en memoria [[project-semaforo-morosidad]]). El club mandó el export partido en 3 (socios/cesantes/clientes del gimnasio); se armó `scripts/combinar-deuda-nuvix.mjs` (reutilizable) para juntarlos en un solo archivo válido antes de subirlo — importado y verificado por Agus contra los datos de secretaría, coincide. Para la próxima, pedir el export unificado; si vuelve a venir partido, correr el script primero.

**Débito automático con tarjeta (código legacy — MercadoPago descartado por el club):**
- Edge Functions `associate-card`, `remove-card`, `charge-card`, `cobro-mensual` existen en el repo pero ya no se usan desde la UI
- `mp_card_last_four`, `mp_card_brand` siguen en la tabla `socios` pero la UI de cuotas ya no los muestra

**Notas adicionales:**
- Socios del club: **1528 cargados en producción** (carga masiva 2026-07-29/30, ver arriba). Los ~60 usuarios son el cuerpo técnico/organizativo, separado de esto.
- `useUsuarios` filtra `rol = 'socio'` — los socios no aparecen en la gestión de usuarios de subcomisión.
- Creación de usuarios staff: nombre + email + DNI. Contraseña inicial = DNI. Sin invite email.
- También se puede asignar rol a un socio existente buscando por DNI (exacto) o nombre (ilike, hasta 5 resultados).
- `assign-role` siempre garantiza `'socio'` en `roles[]` — todo staff es socio primero.
- Roles creables por subcomisión: coordinador, entrenador, manager, subcomisión. Secretaría y portería solo admin.
- Email de bienvenida: se envía vía Resend al crear usuario. Si `RESEND_API_KEY` no está seteado, se omite sin fallar.
- `CLUB_EMAIL_FROM=uncasrclub@gmail.com` — seteado en Supabase secrets.

**Auditoría pre-producción (2026-07-31, Opus):** los 7 hallazgos bloqueantes resueltos — #1-#6 vía código (deployados/commiteados) y #7 (rotar `service_role` key) hecho manualmente por Agus en el Dashboard de Supabase. No quedan bloqueantes abiertos de la auditoría; los hallazgos 🟡/🟢 (importantes/menores) siguen documentados en memoria de proyecto para retomar cuando corresponda.

**Términos y Condiciones — base técnica (2026-08-05).** Independiente del texto legal final (en revisión por el abogado de la familia de Agus + asesor legal del club). Aceptación obligatoria la primera vez que el usuario entra, con registro versionado de quién aceptó qué y cuándo (valor legal bajo Ley 25.326 — hay menores de edad entre los socios). Migration `20260805000000_terminos_condiciones.sql`: `terminos_versiones` (documento vigente, índice único parcial — solo una `activo`), `terminos_aceptaciones` (`UNIQUE(profile_id, version_id)` — una versión nueva vuelve a pedir aceptación a todos sin perder historial), bucket `legales` (público, solo PDF, solo admin/subcomisión sube/borra). `app/hooks/useTerminos.ts` (versión activa + aceptación propia + `aceptar()`), pantalla `app/app/(auth)/terminos.tsx` (checkbox + link al PDF + botón ACEPTO), guard de `_layout.tsx` redirige ahí si hay versión activa sin aceptar. Sin ninguna versión `activo` todavía (texto no cerrado) nadie queda bloqueado. Pendiente: texto legal final, publicar la primera versión (subir PDF + INSERT en `terminos_versiones` — sin UI admin todavía, se hace directo la primera vez), link persistente en "Mi Perfil" (no implementado en esta pasada), build/OTA nueva del mobile para que tome efecto.

**Reconciliación de categorías, servicios y precios de Socios — COMPLETA (2026-08-05).** La carga masiva original usó una fuente de valor único (`categoria_socio`/`servicio_opcional`, una columna cada una) que no podía representar más de un servicio por socio, y los precios cargados en `20260714000000` eran incorrectos. Apareció el Padrón de Servicios real (misma fuente que liquida NUVIX, una fila por socio y concepto) — propuesta completa archivada en `openspec/changes/archive/2026-08-05-actualizar-servicios-socios/`. Resultado aplicado en producción, verificado contra 8 tests de aceptación (0 discrepancias):
- **970 vínculos socio↔servicio**: Hockey 293 · Rugby 258 · Gimnasio 249 · Carnet Tenis 156 · Hockey Inclusivo 8 (nuevo) · Rugby Inclusivo 6 (nuevo). Servicio Tenis desactivado (`activo=false`, no borrado) — el tenis es parte de la cuota social, no un servicio aparte; "Carnet Tenis" (rename de "Tenis Carnet") es el producto real de acceso a canchas sin ser socio.
- **59 socios reclasificados** a la categoría que realmente liquida NUVIX (`categoria_liquidacion`), no la del padrón general.
- **Decisión de arquitectura**: la app no factura — refleja lo que NUVIX liquida. Se descartó modelar el precio de un servicio por ninguna regla propia (ni categoría, ni edad): `socio_servicios` ahora tiene `importe` (autoritativo, viene del CSV) y `variante_nuvix` (trazabilidad, ej. "GYM Mayor"). El precio de catálogo (`servicios_opcionales.monto_mensual`) es sólo informativo.
- **34 socios activos sin ningún concepto de cuota en la liquidación** — no se tocaron, quedan marcados para que Secretaría investigue (ver `reconciliaciones_socios`, sin UI dedicada todavía).
- **6 cuentas institucionales de NUVIX** (Casino, Colegio Nuestra Tierra, UAR, Universidad Nacional del Centro, Nativa Compañía de Seguros, Gómez Marcelo) — nunca fueron socios, comparten la tabla de clientes de NUVIX con la gente real. Esto reemplaza/corrige la nota vieja de "categoría Cliente, 6 socios sin precio confirmado" — no son socios, no hay nada que sumar a la carga.
- **Pendiente, no implementado a propósito**: "beca como descuento" — 31 socios becados en el padrón (`Becado Rugby/Hockey/Tenis`) a quienes NUVIX ya les liquida la cuota normal de su categoría real, no $0. Sugiere que la beca debería ser un `beca_pct` sobre la categoría real, no una categoría aparte — sin confirmar con el club, documentado en `design.md` §7 de la change.
- **Incidente en el camino**: durante la ejecución se encontró que Agus había modificado el catálogo de servicios directo en producción (fuera de cualquier migración) mientras exploraba la idea de "Gimnasio Mayor/Menor" que después se descartó — corregido con una migración de fix (`20260805000002`). Sin este chequeo, el script hubiera fallado en silencio o duplicado vínculos; en cambio detectó el desfasaje y no escribió nada hasta resolverlo.
- Scripts: `scripts/reconciliar-servicios-socios.mjs` (dry-run por default, `--commit` para aplicar, idempotente).

**Aprobación de comprobantes — implementado (2026-08-07).** Confirmado con directiva que vale la pena (ver nota de alcance más arriba). `socios-pagos` suma dos acciones: `aprobar-comprobante` (cuota `en_revision` → `pagado`, inserta `pagos_socios` con `estado='aprobado'`, dispara el mismo generador de PDF + email que ya usa el pago manual) y `rechazar-comprobante` (cuota vuelve a `pendiente` con `comprobante_path=null` para que el socio pueda resubir, inserta `pagos_socios` con `estado='rechazado'` como registro histórico — no hizo falta ampliar el `CHECK` de `cuotas.estado`, esa tabla ya admite `'rechazado'` a diferencia de `cuotas.estado` que no — y le manda un email al socio con el motivo vía Resend, sin persistirlo en ninguna tabla). Página nueva `web/(secretaria)/secretaria/comprobantes/page.tsx`: lista cuotas `en_revision` con la foto del comprobante (signed URL, mismo patrón que `socios-fotos`), botones Aprobar/Rechazar. Sin migración — no se tocó schema.
- **Push al aprobar/rechazar (2026-08-10):** `aprobar-comprobante` y `rechazar-comprobante` ahora también mandan push al socio dueño de la cuota (`notificarPushAprobacionComprobante`/`notificarPushRechazoComprobante`, mismo patrón inline que `notificarSecretaria` — no pasa por la Edge Function `notifications`, va directo por Expo con los tokens del `profile_id` de ese socio puntual, no llega a nadie más), en paralelo con el email/PDF existente. Deployado y confirmado funcionando (Agus probó rechazo y aprobación reales).

**Fixes de arranque mobile — código listo, pendiente de build (2026-08-10).** `app/app/_layout.tsx`: la splash screen se escondía apenas cargaban las fuentes, sin esperar a que resuelvan sesión/perfil/términos — con sesión guardada, el usuario veía la pantalla de login "flashear" antes del redirect a su pantalla real. Ahora la splash espera a fuentes + `loading` de auth + (si hay sesión) `rol` resuelto + chequeo de términos, salvo en los flujos de recovery/nuevo-usuario que no dependen de perfil. De paso, `setSession` se dispara apenas llega la sesión (antes esperaba a que resolviera el query de perfil), así el chequeo de Términos arranca en paralelo con el de perfil en vez de encadenado — un viaje de red menos en el arranque. También `useLogin.ts`: el prompt de huella decía `"Ingresá a La Bitácora"` (tagline interno del proyecto, no el nombre de la app) — cambiado a `"Ingresá a Uncas Rugby"`. Ninguno de los tres cambios tomó efecto todavía — quedan para el próximo build junto con lo demás que Agus tenía pendiente.

**Preparación para Play Store / App Store — en curso (2026-08-07).** Agus está por pagar las cuentas de developer (Apple $99/año, Google $25 único). Lo que ya se dejó listo en el repo, sin esperar las cuentas:
- `app/app.config.js` — agregado `ios.bundleIdentifier` (`com.uncas.rugbyapp`, `.dev` para el variant de desarrollo — antes no existía ninguno, sin esto no se podía ni compilar para iOS). `expo-image-picker`/`expo-camera` pasaron de string simple a config con `photosPermission`/`cameraPermission` en español (antes usaban el default en inglés de Expo, mal visto en review de Apple) y `microphonePermission: false` en ambos (la app no graba audio — menos permisos pedidos, cuestionario de privacidad más simple).
- `app/eas.json` — perfil `production` pasó de `distribution: "internal"` a `"store"` (antes no servía para subir a ninguna store — internal es para builds ad-hoc/UDIDs registrados).
- `web/app/privacidad/page.tsx` — **borrador** de Política de Privacidad, página pública sin auth en `/privacidad` (fuera de los route groups `(secretaria)`/`(subcomision)`, no hay middleware global que la bloquee). Ambas stores exigen una URL pública de privacidad para publicar la ficha — es un documento más chico y distinto de Términos y Condiciones, no hace falta esperar a que el abogado cierre el texto de T&C para tener esto publicado, pero sigue siendo un borrador mío, no texto legal revisado.

**Todavía pendiente, no depende de código:**
- ~~**Crear las cuentas (Apple Developer Program, Google Play Console).**~~ ✅ **Ambas dadas de alta (2026-08-10)** — cuentas personales de Agus bajo "NoisyDev" (Google Play Developer name = NoisyDev; Apple Individual con Seller name = nombre real de Agus, ver [[project-store-accounts]] en memoria). Falta: sacar de cada consola el service account JSON (Play) y appleId/ascAppId/appleTeamId o API key (App Store Connect) para completar `submit.production` en `eas.json`.
- Revisión legal de `/privacidad` (mismo abogado que Términos y Condiciones).
- ~~**Cuenta demo para los revisores.**~~ ✅ **Creada (2026-08-07)** — `demo@uncas.local` / `99999999`, rol socio, socio nº `0012`, estado activo con foto validada (creada directo en producción replicando el flujo de `admin-socios`, categoría Activo Mayor para que se vea una cuota pendiente real). Falta cargarla en las notas de revisión de App Store Connect / Play Console cuando se mande a review.
- Completar `submit.production` en `eas.json` una vez existan las cuentas: Android necesita un service account JSON key de Play Console (no se commitea, va como secret/env de EAS); iOS necesita `appleId` + `ascAppId` + `appleTeamId` (o una App Store Connect API key) — ninguno de los dos existe todavía.
- Assets de ficha: ícono 1024×1024 sin transparencia para Apple (distinto del ícono runtime), screenshots, descripción, categoría — no relevado en esta pasada.
- Primer build/TestFlight de iOS — nunca corrió en un dispositivo real, esperar bugs de plataforma que nunca aparecieron en Android (dark mode, safe areas, gestos) antes de mandar a revisión.
- Cuestionarios de datos de cada store (Data Safety en Google, App Privacy en Apple) — completarlos recién cuando exista la ficha, usando `/privacidad` como referencia de qué se declaró.

**Próximo paso:**
- Semáforo de morosidad: reimportar mensualmente el reporte NUVIX desde `secretaria/deuda` a medida que el club lo genere. **2026-08-10:** el club mandó el export partido en 3 archivos (socios/cesantes/clientes del gimnasio) en vez de uno solo — el importador no soporta eso (pisa cada parte con la siguiente, ver [[project-semaforo-morosidad]] en memoria). Se combinaron con `scripts/combinar-deuda-nuvix.mjs` (nuevo, reutilizable) y se importó bien — verificado por Agus contra los datos de secretaría. Para la próxima, pedirle al club el export unificado en un solo archivo de nuevo; si vuelve a venir partido, correr el script antes de subirlo.
- **Instalar la preview build `693342f5` (2026-08-10)** en los teléfonos del club — sigue siendo la build vigente instalada. Ya hay 3 cambios de código nuevos sin buildear (splash/login flash, paralelizar perfil+términos, texto del prompt de huella — ver nota arriba) — **no lanzar el build hasta que Agus lo pida explícitamente**, capaz tiene más cambios para juntar en el mismo build.
- Avanzar la preparación de stores según la lista de arriba — cuenta demo y revisión legal de `/privacidad` son los próximos pasos que no dependen de tener las cuentas creadas
- Setear secrets de Resend y AWS cuando estén disponibles
- Rotar la `service_role` key de Supabase cuando corresponda (plan de Agus: al migrar la base a la infraestructura del club)

**Deploy web:** https://web-chi-nine-26.vercel.app (prod) — proyecto `agusmuzi79-4892s-projects/web` en Vercel. Repo GitHub conectado — auto-deploy en push a `main`. Para deploy manual: `vercel --prod --yes` desde la **raíz del repo** (no desde `web/`) — el `rootDirectory=web` en Vercel settings lo resuelve internamente.

Pendiente cuando lleguen los secrets:
```bash
supabase secrets set RESEND_API_KEY=... CLUB_EMAIL_FROM=...
supabase secrets set AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1
```

## Fuentes

- PRD: [`prd.md`](prd.md)
- Specs: [`openspec/specs/`](openspec/specs/)
- Migraciones: [`supabase/migrations/`](supabase/migrations/)
