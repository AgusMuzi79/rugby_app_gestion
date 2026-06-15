# Estado Expo — Pantallas, Hooks, Navegación y Dark Mode

## Archivos base de la app

- `app/app/index.tsx` — redirect automático a `/(auth)/login`
- `app/app/_layout.tsx` — root layout con auth guard, `ThemeProvider`. Parsea deep links: PKCE (`?code=`) via `exchangeCodeForSession`, implicit (`#access_token=`) via `setSession`. Maneja `PASSWORD_RECOVERY` → `isPasswordRecovery` → `/(auth)/reset-password`. Detecta `type=invite` → `isNuevoUsuario(true)` → `/(auth)/registro`. **CRÍTICO**: dep de useEffect es `session?.access_token` (string primitivo), NO el objeto `session` — evita loop infinito por TOKEN_REFRESHED.
- `app/app/(auth)/_layout.tsx` — stack sin header
- `app/app/(subcomision|coordinador|entrenador|manager)/_layout.tsx` — tab navigation oscura (fondo `#0E0E0E`, activo `#E8B53C`, inactivo `#666666`), iconos Feather, `tabBarShowLabel: false`

### Stores / contextos

- `app/stores/authStore.ts` — Zustand: `session, rol, loading, isPasswordRecovery, isNuevoUsuario, setSession, setRol, clearAuth, setPasswordRecovery, setNuevoUsuario`
- `app/contexts/ThemeContext.tsx` — `ThemeProvider` + `useTheme()`. Modos: `'light' | 'dark' | 'system'`. Persiste en AsyncStorage `@tema`. `ThemeColors`: `fondo, texto, acento, card, tinta, papel, oro, oroHondo, blanco, grisClaro, rojoUrgente, muted`. Light: `fondo:#F6F1E4`, `card:#FFFFFF`, `grisClaro:#E5E0D0`. Dark: `fondo:#1A1A1A`, `card:#2A2A2A`, `grisClaro:#333333`.

### Librerías / constantes

- `app/lib/supabase.ts` — cliente con AsyncStorage + AppState, `detectSessionInUrl: false`
- `app/lib/offlineQueue.ts` — `encolar/obtenerCola/eliminarDeCola/tamañoCola` (tipo `OperacionOffline`)
- `app/lib/notifications.ts` — `registerPushToken()`: permisos → canal Android → `getExpoPushTokenAsync()` → upsert en `push_tokens`
- `app/lib/totp-client.ts` — TOTP RFC 6238 client-side: `generateTOTP(secret)` (síncrono) + `secondsUntilRefresh()`. **Pure JS SHA-1 + HMAC-SHA1** sin `crypto.subtle` — compatible con Hermes/React Native en todas las versiones.
- `app/constants/roles.ts` — `admin` mapeado a `/(subcomision)/diario`. Roles v2: `secretaria→/(secretaria)/diario`, `porteria→/(porteria)/scanner`, `socio→/(socio)/carnet`
- `app/constants/theme.ts` — sistema "La Bitácora": `colors` (tinta/oro/oroHondo/papel/blanco/grisClaro/rojoUrgente) + `fonts` (titulo=PlayfairDisplay_900Black_Italic, cuerpo=Lora_400Regular, label=ArchivoNarrow_400Regular)

**Tablas v2 en hooks**: usar `const db = supabase as any` — `database.types.ts` no incluye tablas v2 hasta regenerar types con Docker local.

### Hooks auth

- `app/hooks/useLogin.ts` — signIn + fetch profile.rol + `registerPushToken()` (fire-and-forget)
- `app/hooks/useForgotPassword.ts` — `resetPasswordForEmail` con `redirectTo: 'uncasrugby://reset-password'`
- `app/hooks/useResetPassword.ts` — validación (match + mínimo 8 chars), `updateUser({ password })`, signOut, `setPasswordRecovery(false)`
- `app/hooks/useSignOut.ts` — signOut + clearAuth

## Estructura de tabs por rol

| Rol | Tab 1 | Tab 2 | Tab 3 | Tab 4 | href:null (ocultos) |
|---|---|---|---|---|---|
| Subcomisión | home→diario | users→usuarios | activity→cronica | user→sobre | salir, dashboard, eventos, informes, notificaciones, protocolos |
| Coordinador | home→diario | calendar→calendario | activity→cronica | user→sobre | salir, asistencia |
| Entrenador | home→diario | list→asistencia | activity→cronica | user→sobre | salir, lesiones, partido |
| Manager | home→diario | dollar-sign→cobranzas | activity→cronica | user→sobre | salir, fichajes |

El tab "salir" no tiene `tabBarButton` custom. La sesión se cierra desde la pantalla Sobre.

## Componentes UI compartidos

- `app/components/ui/DatePickerField.tsx` — picker nativo fecha/hora. Props: `label, value, onChange, mode, maximumDate, minimumDate, onClear`. Usa `react-native-modal-datetime-picker` + Ionicons.
- `app/components/shared/Header.tsx` — logo + "UNCAS RUGBY CLUB". Usa `useTheme()`.
- `app/components/shared/CronicaScreen.tsx` — feed multi-fuente (lesiones, fichajes, resultados, notificaciones), items urgentes con fondo oscuro, botón "+ NUEVA NOTIFICACIÓN" solo subcomisión/admin. Usa `useTheme()`.
- `app/components/shared/SobreScreen.tsx` — Mi Perfil compartida. Foto editable (AsyncStorage `@foto_perfil`), nombre editable, toggle tema 3-botones (CLARO/AUTO/OSCURO), toggle biometría, botón cambiar contraseña, botón cerrar sesión.

## Pantallas — Subcomisión

| Pantalla | Hook | Notas clave |
|---|---|---|
| `(subcomision)/diario.tsx` | `useDiarioSubcomision.ts` | 5 queries paralelas — asistencia±30D/variación, lesiones activas grado≥3, fichajes 7D, notif recientes |
| `(subcomision)/usuarios.tsx` | `useUsuarios.ts` | Lista/detalle/crear/desactivar/reactivar. Detalle invoca `getUser` para email. Edición divisiones in-place + actualización optimista |
| `(subcomision)/eventos.tsx` | `useEventos.ts` | `EventoItem` con join `cobranzas(estado,monto)`. `monto_sugerido` en campo `descripcion`. Cerrar = UPDATE estado='cerrado' con confirmación |
| `(subcomision)/informes.tsx` | `useInformes.ts` | Asistencia per-jugador (join 3-nivel), W/L/D, fichajes+financiero con `forma_de_pago` breakdown. Filtro client-side por `divisionFiltro` |
| `(subcomision)/notificaciones.tsx` | `useNotificaciones.ts` | Modal nueva notif (título/mensaje/rol), historial, push via Edge Function |
| `(subcomision)/cronica.tsx` | `useCronica.ts` | Compartido |
| `(subcomision)/sobre.tsx` | `useSobre.ts` | Re-exporta `SobreScreen` |

**`useDashboard`**: suscripción Realtime canal único `dashboard-subcomision` (asistencias, fichajes, resultados, cobranzas). Pantalla oculta (href:null) pero el hook existe.

## Pantallas — Coordinador

| Pantalla | Hook | Notas clave |
|---|---|---|
| `(coordinador)/diario.tsx` | `useDiarioCoordinador.ts` | 4 queries paralelas — divisiones, eventos próximos 7D, eventos últimos 30D, cobranzas activas. Calcula `EventoSemana[]`, `AlertaJugador[]`, `BarraAsistencia[]`. `.or()` dinámico para cobranzas por división + globales |
| `(coordinador)/calendario.tsx` | `useCalendario.ts` | Divisiones desde `profile.divisiones`. Rango -30/+60 días. `crearEvento` con validación |
| `(coordinador)/asistencia.tsx` | `useAsistenciaCoordinador.ts` | 3 queries paralelas. Consecutivas: últimos 4 eventos de la división todos 'ausente'. Selector división con refetch |
| `(coordinador)/cronica.tsx` | `useCronica.ts` | Compartido |
| `(coordinador)/sobre.tsx` | `useSobre.ts` | Re-exporta `SobreScreen` |

## Pantallas — Entrenador

| Pantalla | Hook | Notas clave |
|---|---|---|
| `(entrenador)/diario.tsx` | `useDiarioEntrenador.ts` | 6 queries paralelas. `TareaPendiente[]`: partidos sin resultado, partido sin mesa, lesiones 7D |
| `(entrenador)/asistencia.tsx` | `useAsistencia.ts` | Pre-carga asistencias del día. Guardar crea evento de entrenamiento. Verifica 4 ausencias → invoca `notifications`. Fondo papel, header "SECCIÓN·CANCHA", contadores PRESENTES/AUSENTES/JUSTIF. |
| `(entrenador)/partido.tsx` | `usePartido.ts` | 4 pasos: equipo+partido → asistencia → mesa (≤15 titulares, ≤8 suplentes) → resultado. Header dinámico PlayfairDisplay |
| `(entrenador)/lesiones.tsx` | `useLesiones.ts` | Online (insert DB + notifications) / offline (encolar). Badge grado progresivo: 1=verde…5=rojo oscuro. Grado≥3: card TINTA+ORO. Validación fecha: `if (!fecha)` (no regex) |
| `(entrenador)/cronica.tsx` | `useCronica.ts` | Compartido |
| `(entrenador)/sobre.tsx` | `useSobre.ts` | Re-exporta `SobreScreen` |

## Pantallas — Manager

| Pantalla | Hook | Notas clave |
|---|---|---|
| `(manager)/diario.tsx` | `useDiarioManager.ts` | 3 queries paralelas. `EventoProgreso` incluye `esGlobal` (division_id IS NULL), `pct`, `montoCobrado`, `montoTotal` |
| `(manager)/cobranzas.tsx` | `useCobranzas.ts` | Upsert por `evento_financiero_id,jugador_id`. Barra progreso ORO, modal PAGADO/PENDIENTE, forma de pago (3 botones) |
| `(manager)/fichajes.tsx` | `useFichajes.ts` | Upload docs a Storage bucket `fichajes` (base64 via expo-file-system). `abrirDocumento`: signed URL 60s → `Linking.openURL`. Validación fecha: `if (!fechaNacimiento)` (no regex) |
| `(manager)/cronica.tsx` | `useCronica.ts` | Compartido |
| `(manager)/sobre.tsx` | `useSobre.ts` | Re-exporta `SobreScreen` |

## Crónica — Feed compartido (`useCronica`)

Queries últimos 7 días: `lesiones` → LESIÓN (urgente si grado≥3), `jugadores` recientes → FICHAJE, `resultados` con join `eventos(rival,division_id,divisiones(nombre))` → RESULTADO, `notificaciones` → ASISTENCIA/INFO. Filtrado por división para no-subcomisión. `enviarNotificacion(titulo, mensaje)` inserta en DB + invoca Edge Function.

## Perfil (`useSobre`)

fetch `profiles` + join `divisiones`. `cambiarFoto()`: expo-image-picker → base64 → AsyncStorage `@foto_perfil`. Biometría: `expo-local-authentication` + `expo-secure-store` (keys: `biometria_email`, `biometria_password`). Toggle off = delete keys.

`enviarResetPassword()`: tiene `try/catch/finally` + timeout de 15s vía `Promise.race` — si Supabase tarda o falla, el spinner siempre para y muestra error. `useForgotPassword` tiene el mismo timeout.

## Pantallas — Secretaría

| Pantalla | Hook | Notas clave |
|---|---|---|
| `(secretaria)/diario.tsx` | `useDiarioSecretaria.ts` | Stats (activos/morosos/pendientes/inactivos) + últimos 6 pagos aprobados |
| `(secretaria)/socios.tsx` | `useSociosSecretaria.ts` | Lista con filtro por estado, FAB crear, detalle con foto/validación. Modal: `KeyboardAvoidingView` es el contenedor raíz con `flex:1 behavior='padding'`; backdrop `TouchableOpacity flex:1` adentro (se achica cuando sube teclado). Si `categorias.filter(c => c.activa)` retorna vacío, muestra mensaje "Sin categorías — verificar seed en Supabase". |
| `(secretaria)/noticias.tsx` | `useNoticias(false)` | CRUD noticias con toggle publicar/borrador. FAB + modal |
| `(secretaria)/sobre.tsx` | `useSobre.ts` | Re-exporta `SobreScreen` |

## Pantallas — Portería

| Pantalla | Hook | Notas clave |
|---|---|---|
| `(porteria)/scanner.tsx` | `useScanner.ts` | `CameraView` con `barcodeScannerSettings: { barcodeTypes: ['qr'] }` + `onBarcodeScanned`. Overlay visor con esquinas. Parsea `{numero_socio}:{6-digit-totp}` → valida con `socios-qr` Edge Function |
| `(porteria)/sobre.tsx` | `useSobre.ts` | Re-exporta `SobreScreen` |

## Pantallas — Socio

| Pantalla | Hook | Notas clave |
|---|---|---|
| `(socio)/carnet.tsx` | `useCarnet.ts` | QR con `react-native-qrcode-svg`. Contenido: `{numero_socio}:{totp_6_digits}`. Countdown 30s con barra de progreso. TOTP secret en `expo-secure-store` (`totp_secret` key), se obtiene una vez de `socios-qr` Edge Function. Sin sección de foto — la foto se gestiona desde "Mi perfil" (`useSobre`). |
| `(socio)/cuotas.tsx` | `useCuotas.ts` | Lista cuotas. `iniciarPago()` → `socios-pagos` action=checkout → abre `checkout_url` con `Linking.openURL` |
| `(socio)/noticias.tsx` | `useNoticias(true)` | Solo noticias publicadas |
| `(socio)/sobre.tsx` | `useSobre.ts` | Re-exporta `SobreScreen` |

## Hooks v2

- `useCarnet` — secret SecureStore → socios-qr → TOTP cada 30s. Retorna solo `{ loading, error, data }`. La foto ya no se maneja aquí — se gestiona en `useSobre` (para rol `socio`, carga desde bucket `socios-fotos` y sube al mismo path).
- `useCuotas` — lista + iniciarPago via socios-pagos
- `useNoticias(soloPublicadas)` — CRUD o solo lectura según param
- `useDiarioSecretaria` — stats socios + pagos recientes
- `useSociosSecretaria` — CRUD socios via admin-socios + fotoSignedUrl
- `useScanner` — parseo QR + validación via socios-qr + signed URL foto

## Push Notifications

- `registerPushToken()` llamado en `useLogin` (fire-and-forget)
- `useLesiones`, `useFichajes`, `useAsistencia` invocan la Edge Function `notifications`
- **Dev build**: requiere `google-services.json` en `app/` + `android.googleServicesFile` en `app.json`. Archivo excluido de git (`.gitignore`).
- En Expo Go SDK 53: detectar con `Constants.appOwnership === 'expo'` y saltear push

## Deep Linking — Flujo completo

1. `resetPasswordForEmail(email, { redirectTo: 'uncasrugby://reset-password' })`
2. Link recibido: `uncasrugby://reset-password#access_token=...&type=recovery`
3. `_layout.tsx` parsea → `setSession` → `setPasswordRecovery(true)`
4. También maneja evento `PASSWORD_RECOVERY` de `onAuthStateChange`
5. Nav guard detecta `isPasswordRecovery` → navega a `/(auth)/reset-password`
6. `useResetPassword` → `updateUser({ password })` → signOut → redirect login con banner

**Flujo invite**: link con `type=invite` → `setNuevoUsuario(true)` → `/(auth)/registro.tsx` → al completar, redirige al diario del rol y limpia flag.

## Dark Mode — Arquitectura (COMPLETO)

Patrón estándar en todas las pantallas:
```tsx
const { colors: tc } = useTheme()
style={[s.root, { backgroundColor: tc.fondo }]}
```

- `StyleSheet.create` se mantiene para layout/spacing; colores se sobreescriben con inline style arrays.
- "Edition bars" (headers oscuros) NO se convierten — son diseño fijo.
- Cards urgentes y botones primarios SIEMPRE oscuros — no se convierten.
- Sub-componentes fuera del componente principal llaman `useTheme()` directamente (sin prop drilling).
