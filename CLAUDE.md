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
- `app/app/index.tsx` — redirect automático a `/(auth)/login` (resuelve "unmatched route" al iniciar)
- `app/app/_layout.tsx` — root layout con auth guard. Usa `useRootNavigationState()` para esperar el navigator. Parsea deep links al iniciar: PKCE (`?code=`) via `exchangeCodeForSession` e implicit (`#access_token=`) via `setSession`. Maneja evento `PASSWORD_RECOVERY` → setea flag `isPasswordRecovery` → redirige a `/(auth)/reset-password`. **CRÍTICO**: dep de useEffect es `session?.access_token` (string primitivo), NO el objeto `session` — evita loop infinito por TOKEN_REFRESHED.
- `app/app/(auth)/login.tsx` — diseño La Bitácora final con fuentes custom reales: PlayfairDisplay_900Black_Italic (título), Lora_400Regular (inputs/subtítulo), ArchivoNarrow_400Regular (labels/botones). Tokens de `constants/theme.ts`. Muestra banner verde de éxito si recibe param `?mensaje=` (post reset-password). "UNCAS RUGBY CLUB · EST. 1836".
- `app/app/(auth)/forgot-password.tsx` — misma identidad La Bitácora que login. `redirectTo: 'uncasrugby://reset-password'`.
- `app/app/(auth)/reset-password.tsx` — pantalla nueva. Dos campos contraseña + show/hide. Llama `supabase.auth.updateUser({ password })`, luego signOut + clearAuth + redirect a login con mensaje de éxito. Usa hook `useResetPassword`.
- `app/app/(auth)/_layout.tsx` — stack sin header
- `app/app/(subcomision|coordinador|entrenador|manager)/_layout.tsx` — tab navigation oscura (fondo `#0E0E0E`, activo `#E8B53C`, inactivo `#666666`), iconos Feather, `tabBarShowLabel: false`. Tab "Sobre" navega a la pantalla de perfil. **Ver estructura de tabs por rol abajo.**
- `app/lib/supabase.ts` — cliente con AsyncStorage + AppState, `detectSessionInUrl: false`
- `app/lib/offlineQueue.ts` — `encolar/obtenerCola/eliminarDeCola/tamañoCola` (nombres en español, tipo `OperacionOffline`)
- `app/stores/authStore.ts` — Zustand: session, rol, loading, **isPasswordRecovery**, setSession, setRol, clearAuth, **setPasswordRecovery**
- `app/constants/roles.ts` — incluye `admin` mapeado a `/(subcomision)/diario` (no dashboard)
- `app/constants/theme.ts` — sistema de diseño "La Bitácora": `colors` (tinta/oro/oroHondo/papel/blanco/grisClaro/rojoUrgente) + `fonts` (titulo=PlayfairDisplay_900Black_Italic, cuerpo=Lora_400Regular, label=ArchivoNarrow_400Regular)
- `app/hooks/useLogin.ts` — signIn + fetch profile.rol
- `app/hooks/useForgotPassword.ts` — resetPasswordForEmail con `redirectTo: 'uncasrugby://reset-password'`
- `app/hooks/useResetPassword.ts` — validación (match + mínimo 8 chars), `updateUser({ password })`, signOut, `setPasswordRecovery(false)`
- `app/hooks/useSignOut.ts` — signOut + clearAuth

**Estructura de tabs por rol** (icon Feather → pantalla):

| Rol | Tab 1 | Tab 2 | Tab 3 | Tab 4 | href:null |
|---|---|---|---|---|---|
| Subcomisión | home→diario | users→usuarios | activity→cronica | user→sobre | salir, dashboard, eventos, informes, notificaciones, protocolos |
| Coordinador | home→diario | calendar→calendario | activity→cronica | user→sobre | salir, asistencia |
| Entrenador | home→diario | list→asistencia | activity→cronica | user→sobre | salir, lesiones, partido |
| Manager | home→diario | dollar-sign→cobranzas | activity→cronica | user→sobre | salir, fichajes |

**Nota**: El tab "salir" ya no tiene `tabBarButton` custom. La sesión se cierra desde la pantalla Sobre con el botón "CERRAR SESIÓN".

**Nota**: Tailwind v3 (no v4). NativeWind v4 no soporta Tailwind v4. `global.css` usa `@tailwind base/components/utilities`.

**Nota**: Regenerar tipos siempre en `app/lib/`:
```bash
supabase gen types typescript --local > app/lib/database.types.ts
```

### Edge Functions
| Función | Estado | Descripción |
|---|---|---|
| `supabase/functions/admin-usuarios/` | ✅ completo | create (`inviteUserByEmail` → Supabase envía email via SMTP configurado + template del Dashboard) / deactivate (ban 876000h) / reactivate |
| `supabase/functions/notifications/` | ✅ completo | lesión→Subcomisión, fichaje→Subcomisión, 4 ausencias consecutivas→Coordinador via Expo Push API. Tipos: `lesion`, `fichaje`, `ausencias_consecutivas`, `manual`. Manual: solo push (DB insert lo hace el cliente). |
| `supabase/functions/_shared/` | ✅ | `supabase-admin.ts` (service role client) + `cors.ts` (headers + helpers) |

**`admin-usuarios` create flow**: usa `supabase.auth.admin.inviteUserByEmail(email, { data: { nombre }, redirectTo: 'uncasrugby://reset-password' })` — Supabase crea el usuario y envía el email de invite usando el SMTP de Gmail configurado en el proyecto + template definido en el Dashboard. Sin integración Resend.

**Nota Edge Functions local**: `supabase start` NO levanta el Edge Runtime. Para probar funciones localmente, correr `supabase functions serve` en paralelo.

### Dependencias nativas instaladas
- `react-native-modal-datetime-picker@18.0.0` + `@react-native-community/datetimepicker@8.4.4` — pickers nativos de fecha/hora
- `react-native-reanimated@4.1.7` — compatible con SDK 54 / RN 0.81.5 (actualizado desde 3.17.5). Requerido por NativeWind css-interop en runtime.
- `babel.config.js` tiene `react-native-reanimated/plugin` en plugins

**⚠️ IMPORTANTE**: Para cualquier `npm install` en este proyecto usar siempre `--legacy-peer-deps` por conflicto `react-dom@19.2.6` vs `react@19.1.0`. Si se omite, npm puede eliminar paquetes transitivos (incluido reanimated).

### Componentes UI compartidos
- `app/components/ui/DatePickerField.tsx` — picker nativo de fecha y hora. Props: `label`, `value` (ISO `YYYY-MM-DD` o `HH:MM`), `onChange`, `mode` ('date'|'time', default 'date'), `maximumDate`, `minimumDate`, `onClear`. Usa `react-native-modal-datetime-picker` + Ionicons.
- `app/components/shared/Header.tsx` — logo + "UNCAS RUGBY CLUB" + "La Bitácora" PlayfairDisplay, con divider gris. Usado en todas las pantallas de rol.
- `app/components/shared/CronicaScreen.tsx` — pantalla Crónica compartida (usada como default export en las 4 rutas `/cronica`). Renderiza feed multi-fuente (lesiones, fichajes, resultados, notificaciones), items urgentes con fondo oscuro, botón "+ NUEVA NOTIFICACIÓN" solo para subcomisión/admin con modal de envío.
- `app/components/shared/SobreScreen.tsx` — pantalla Mi Perfil compartida (usada como default export en las 4 rutas `/sobre`). Fondo oscuro tinta. Muestra nombre (PlayfairDisplay), rol + división en dorado. Toggle biometría (gestiona SecureStore `biometria_email` / `biometria_password`), toggle notificaciones (placeholder). Botón "CERRAR SESIÓN" negro/dorado. Versión "UNCAS RUGBY APP · V1.0".

### Pantallas implementadas — Subcomisión
| Pantalla | Hook | Estado |
|---|---|---|
| `(subcomision)/diario.tsx` | `useDiarioSubcomision.ts` | ✅ completo — 4 stat cards, crónica reciente, atajos |
| `(subcomision)/cronica.tsx` | `useCronica.ts` | ✅ completo — feed 7 días, nueva notif modal (subcomision only) |
| `(subcomision)/usuarios.tsx` | `useUsuarios.ts` | ✅ completo — lista/detalle/crear/desactivar/reactivar |
| `(subcomision)/eventos.tsx` | `useEventos.ts` | ✅ completo — identidad La Bitácora aplicada — tabs ACTIVOS/HISTORIAL con underline dorado, barra progreso por evento, detalle PlayfairDisplay, cerrar evento TINTA/ROJO, modal tipo 3-botones |
| `(subcomision)/informes.tsx` | `useInformes.ts` | ✅ completo — asistencia per-jugador, resultados W/L/D, fichajes recientes, financiero con forma_de_pago |
| `(subcomision)/notificaciones.tsx` | `useNotificaciones.ts` | ✅ completo — modal nueva notif (título/mensaje/rol), historial enviadas, push via Edge Function |
| `(subcomision)/sobre.tsx` | `useSobre.ts` | ✅ completo — re-exporta `SobreScreen` |

**`useDiarioSubcomision`**: 5 queries paralelas — asistencia últimos 30D + variación vs 7D previos, lesiones activas (grado≥3), fichajes 7D, notificaciones recientes. Retorna stats (asistenciaPct, variacion7D, lesionesActivas, fichajesRecientes), cronicaItems (últimas 5 novedades) y `sinDatos`.

**`useDashboard`**: suscripción Realtime canal único `dashboard-subcomision` (asistencias, fichajes, resultados, cobranzas). Secciones: Asistencia (% + badge 4+ ausencias consecutivas), Resultados (últimos 5 no-infantil), Fichajes (count por división), Financiero (cobrado vs pendiente).

**`useUsuarios`**: lista todos los profiles, paso lista/detalle, modal nuevo usuario (invoke `admin-usuarios` action=create), desactivar/reactivar (invoke action=deactivate/reactivate). Actualización optimista del estado local.

**`useEventos`**: `EventoItem` con countPagados/countPendientes/totalCobrado calculado desde join `cobranzas(estado, monto)`. Detalle carga cobranzas con join anidado `jugadores(division_id, divisiones(nombre))` para desglose por división + pedidos con `profiles(nombre)` y `items_pedido(concepto, cantidad)`. `monto_sugerido` almacenado en campo `descripcion` (no existe columna propia). Cerrar evento = UPDATE `estado = 'cerrado'` con `Alert.alert` de confirmación. Tipos: `'recaudacion' | 'viaje' | 'tercer_tiempo'`.

**`useInformes`**: carga en paralelo: asistencias per-jugador (join 3-nivel eventos→asistencias, índice `jugador→evento→estado`), resultados con W/L/D, fichajes count por división + últimos 20 recientes, financiero con forma_de_pago breakdown (`Record<string, number>`). Filtrado client-side por `divisionFiltro`.

### Pantallas implementadas — Coordinador
| Pantalla | Hook | Estado |
|---|---|---|
| `(coordinador)/diario.tsx` | `useDiarioCoordinador.ts` | ✅ completo — eventos semana, alertas asistencia, barras por división |
| `(coordinador)/cronica.tsx` | `useCronica.ts` | ✅ completo — feed 7 días compartido |
| `(coordinador)/calendario.tsx` | `useCalendario.ts` | ✅ completo — lista eventos, modal nuevo evento con DatePickerField |
| `(coordinador)/asistencia.tsx` | `useAsistenciaCoordinador.ts` | ✅ completo — asistencia per-jugador, badge 4 ausencias, selector división |
| `(coordinador)/sobre.tsx` | `useSobre.ts` | ✅ completo — re-exporta `SobreScreen` |

**`useDiarioCoordinador`**: 4 queries paralelas — divisiones, eventos próximos 7D, eventos últimos 30D, cobranzas activas (por división + globales). Calcula `EventoSemana[]` (con `cobranzaActiva: boolean`), `AlertaJugador[]` (4 ausencias consecutivas), `BarraAsistencia[]` (% por división, color-coded). `.or()` dinámico para filtrar cobranzas por división + `division_id.is.null`.

**`useCalendario`**: fetch divisiones del coordinador desde `profile.divisiones`. Query eventos rango -30 días / +60 días. `crearEvento` inserta en `eventos` con validación.

**`useAsistenciaCoordinador`**: 3 queries paralelas (jugadores, eventos last 30 días, asistencias last 60 días). Cálculo per-jugador: total eventos en su división, presentes, %. Consecutivas: últimos 4 eventos de la división, todos 'ausente'. Selector de división activa con refetch.

### Pantallas implementadas — Entrenador
| Pantalla | Hook | Estado |
|---|---|---|
| `(entrenador)/diario.tsx` | `useDiarioEntrenador.ts` | ✅ completo — próximo evento, tareas pendientes, atajos |
| `(entrenador)/cronica.tsx` | `useCronica.ts` | ✅ completo — feed 7 días compartido |
| `(entrenador)/asistencia.tsx` | `useAsistencia.ts` | ✅ completo — identidad La Bitácora aplicada |
| `(entrenador)/partido.tsx` | `usePartido.ts` | ✅ completo — identidad La Bitácora aplicada |
| `(entrenador)/lesiones.tsx` | `useLesiones.ts` | ✅ completo — identidad La Bitácora aplicada — grado badges progresivos (1→5 colores), card expansion, FAB dorado, tab PROTOCOLOS |
| `(entrenador)/sobre.tsx` | `useSobre.ts` | ✅ completo — re-exporta `SobreScreen` |

**`useDiarioEntrenador`**: 6 queries paralelas. `TareaPendiente[]`: partidos últimos 3D sin resultado (RESULTADO), próximo partido sin mesa (MESA), lesiones recientes 7D (LESIÓN). `proximoEvento`: próximo partido o entrenamiento.

**`useAsistencia`**: fetch jugadores por división → pre-carga asistencias del día → guardar crea evento de entrenamiento automáticamente → verifica 4 ausencias consecutivas con Promise.all → invoca `notifications` si hay 4 ausencias.

**Diseño asistencia.tsx**: fondo papel, header "SECCIÓN · CANCHA" + "Toma de asistencia" (PlayfairDisplay) + botón GUARDAR arriba a la derecha (borde dorado). Tres cajas de contadores (PRESENTES/AUSENTES/JUSTIF.) con borde de color. Lista numerada con badges `[PRES]` `[AUS]` `[JUST]`. Alerta "⚠ 4 AUSENCIAS" inline bajo el nombre post-guardado.

**`usePartido`**: lista partidos próximos (hoy + 14 días) → selección → Paso 1 equipo+partido → Paso 2 asistencia (presente/ausente) → Paso 3 mesa (Titulares/Suplentes) → Paso 4 resultado. Validación: ≤15 titulares, ≤8 suplentes.

**Diseño partido.tsx**: 4 pasos con header dinámico "SECCIÓN · CANCHA" + título del paso en PlayfairDisplay (ej. `Asistencia · M15 Prueba`). Paso 1: cards con borde negro, badges OBLIGATORIO (negro) / OPCIONAL (dorado). Paso 2: contadores + lista numerada igual que asistencia. Paso 3: ConteoBar dorado, jugadores en tres grupos (TITULARES/SUPLENTES/DISPONIBLES), asignados en card negro/dorado, disponibles en card papel/gris con botones [T][S]. Paso 4: inputs con borde negro, números en PlayfairDisplay 40px.

**`useLesiones`**: lista lesiones de la división, modal nuevo registro con `DatePickerField`, online (insert DB + invoke `notifications`) / offline (`encolar`). Validación fecha: `if (!fecha)` (no regex — usa DatePickerField).

**Diseño lesiones.tsx**: fondo papel. Dos tabs LESIONES ACTIVAS / PROTOCOLOS (underline dorado). Badge de grado progresivo: 1=verde, 2=ámbar, 3=naranja, 4=rojo, 5=rojo oscuro+borde. Grado ≥3: card fondo TINTA + texto ORO. Tap en card expande descripción + "VER HISTORIAL DEL JUGADOR". SelectorGrado: activo = TINTA+ORO. Input descripción: borde inferior ORO. FAB dorado.

### Pantallas implementadas — Manager
| Pantalla | Hook | Estado |
|---|---|---|
| `(manager)/diario.tsx` | `useDiarioManager.ts` | ✅ completo — cobranzas activas, pedidos subcomisión, últimos fichajes |
| `(manager)/cronica.tsx` | `useCronica.ts` | ✅ completo — feed 7 días compartido |
| `(manager)/cobranzas.tsx` | `useCobranzas.ts` | ✅ completo — identidad La Bitácora aplicada — barra progreso por evento, modal por jugador, selector PAGADO/PENDIENTE, forma de pago |
| `(manager)/fichajes.tsx` | `useFichajes.ts` | ✅ completo — identidad La Bitácora aplicada — lista numerada, badge OK, botón ABRIR documentos (signed URL) |
| `(manager)/sobre.tsx` | `useSobre.ts` | ✅ completo — re-exporta `SobreScreen` |

**`useDiarioManager`**: 3 queries paralelas — divisiones, eventos_financieros activos (con `cobranzas(estado, monto)` join para calcular pct/monto), últimos 3 fichajes. `EventoProgreso` incluye `esGlobal` (division_id IS NULL = pedido de subcomisión), `pct`, `montoCobrado`, `montoTotal`.

**`useCobranzas`**: lista eventos financieros activos para la división + globales. `EventoFinanciero` incluye `pctCobrado`, `countPagados`, `countJugadores`, `montoCobrado` (calculados en paralelo al cargar). `CobranzaJugador`: estado toggle, monto string (para TextInput), formaDePago. Upsert por `evento_financiero_id,jugador_id`. `resumen` calculado reactivamente: cobrado, pagados, pendientes.

**Diseño cobranzas.tsx**: lista de eventos con barra de progreso (ORO, height 4), `X/Y PAGADOS · $cobrado`. Tap en evento → lista jugadores. Tap en jugador → modal: selector grande PAGADO/PENDIENTE, monto con borde inferior ORO, forma de pago (3 botones). Botón "GUARDAR" persiste todos los jugadores.

**`useFichajes`**: lista jugadores fichados, modal nuevo fichaje (jugador + fichaje en 2 inserts), upload documentos a Storage bucket `fichajes` (base64 via expo-file-system), invoca `notifications` al crear fichaje. `DatePickerField` para fecha nacimiento. Validación fecha: `if (!fechaNacimiento)` (no regex). `abrirDocumento(storagePath)`: signed URL (60s) → `Linking.openURL`. Estado `abriendoDoc: string | null` para spinner por documento.

**Diseño fichajes.tsx**: lista numerada (01, 02…) con badge "OK" dorado. Detalle: nombre PlayfairDisplay 28px, lista documentos con botón "ABRIR" + ícono. Modal nuevo fichaje: campos con borde inferior ORO, `DatePickerField` para nacimiento, botón "FICHAR JUGADOR" TINTA. Banner de éxito TINTA + borde ORO.

### Pantalla Sobre — Perfil de usuario
**`useSobre`** (`app/hooks/useSobre.ts`): fetch `profiles` (nombre, rol, divisiones) + join `divisiones` para nombres. Gestiona biometría via `expo-local-authentication` + `expo-secure-store` (keys: `biometria_email`, `biometria_password`). Toggle off = delete keys. Toggle on = Alert (requiere cerrar sesión para activar). Toggle notificaciones es placeholder local.

**`SobreScreen`** (`app/components/shared/SobreScreen.tsx`): fondo `tinta`, header "SECCIÓN · SOBRE" + "Mi perfil" (PlayfairDisplay). Card en `papel` con acento dorado, nombre en PlayfairDisplay grande, rol + división en ArchivoNarrow dorado (formato `ENTRENADOR · M14` si hay una división). Sección CONFIGURACIÓN: dos Switches gold-tinted. Sección CUENTA: botón "CERRAR SESIÓN" (borde dorado, texto dorado, negro). Versión al pie. Rutas: `(rol)/sobre.tsx` re-exportan `SobreScreen` como default.

### Crónica — Feed compartido
**`useCronica`**: hook compartido para la tab Crónica de todos los roles. Queries últimos 7 días:
- `lesiones` → items tipo LESIÓN (urgente si grado ≥ 3)
- `jugadores` (creados recientemente) → items tipo FICHAJE
- `resultados` con join `eventos(rival, division_id, divisiones(nombre))` → items tipo RESULTADO
- `notificaciones` → ASISTENCIA (`ausencias_consecutivas`) o INFO (`manual`)

Filtrado por división para no-subcomisión (lesiones + fichajes por `division_id`; resultados filtrado client-side). `routeForTipo(tipo, rol)` mapea a la ruta correcta por rol. `enviarNotificacion(titulo, mensaje)` inserta en `notificaciones` + invoca Edge Function `notifications`.

### Push Notifications
- `app/lib/notifications.ts` — `registerPushToken()`: permisos → canal Android → `getExpoPushTokenAsync()` → upsert en `push_tokens` (onConflict: 'token')
- Llamado en `useLogin.ts` después de autenticar (fire-and-forget con `void`)
- `useLesiones`, `useFichajes`, `useAsistencia` invocan `notifications` Edge Function en los eventos correspondientes

**Nota expo-file-system v19**: `EncodingType` NO es un named export. Usar string literal `'base64'` en `readAsStringAsync`.

**Nota expo-notifications v0.32**: `NotificationBehavior` requiere `shouldShowBanner` y `shouldShowList` además de los 3 campos estándar.

**Nota Expo Go SDK 53**: push remotas eliminadas de Expo Go. `notifications.ts` usa `Constants.appOwnership === 'expo'` para detectar Expo Go y saltear todo lo relacionado a push (incluyendo imports dinámicos de `expo-notifications`). Para probar push se necesita un development build (`eas build --profile development`).

### Supabase Cloud
- Proyecto: `tlexvbattnzpmdftjsao` (producción)
- URL: `https://tlexvbattnzpmdftjsao.supabase.co`
- `app/.env.local` apunta a cloud (no a local)
- Migraciones aplicadas en cloud (`supabase db push`)
- Edge Functions deployadas: `admin-usuarios`, `notifications`
- Redirect URL configurada: `uncasrugby://reset-password` en Authentication → URL Configuration ✅
- SMTP: Gmail configurado en Supabase Dashboard → Project Settings → Auth → SMTP

### EAS Build
- `app/eas.json` creado con profiles: `development` (developmentClient), `preview` (internal, APK), `production` (internal)
- EAS CLI v18.13.0 instalado globalmente
- Project ID: `d363d962-7caf-4050-81fc-b70b493289ca` (en `app.json extra.eas`)
- Scheme deep linking: `uncasrugby` (en `app.json`)
- Build command: `eas build --profile preview --platform all` (desde `app/`)

### Deep Linking — Flujo de recuperación de contraseña
1. `useForgotPassword` llama `resetPasswordForEmail(email, { redirectTo: 'uncasrugby://reset-password' })`
2. Supabase envía email con link `uncasrugby://reset-password#access_token=...&type=recovery`
3. `_layout.tsx` parsea el deep link → `setSession` → `setPasswordRecovery(true)`
4. También maneja evento `PASSWORD_RECOVERY` de `onAuthStateChange`
5. Nav guard detecta `isPasswordRecovery` → navega a `/(auth)/reset-password`
6. `useResetPassword` valida y llama `updateUser({ password })` → signOut → redirect login con banner

### Próximo paso al volver
App conectada a Supabase Cloud, EAS configurado, flujo de onboarding completo.

**Pendiente para activar el email de bienvenida**:
- Configurar `RESEND_API_KEY` en Supabase secrets
- Agregar `uncasrugby://reset-password` como Redirect URL en Supabase Auth

**Para lanzar build de distribución**:
```bash
cd app
eas build --profile preview --platform android   # APK para Android
eas build --profile preview --platform ios        # IPA para iOS (requiere Apple Developer)
```

## Fuentes

- PRD completo: [`prd.md`](prd.md) — v1.0, Mayo 2026
- Specs por dominio: [`openspec/specs/`](openspec/specs/)
- Migraciones DB: [`supabase/migrations/`](supabase/migrations/)
