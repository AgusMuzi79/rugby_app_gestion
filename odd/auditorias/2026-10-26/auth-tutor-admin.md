# Auditoría — auth-tutor-admin

**Repo:** `/home/claude/agusmuzi79/rugby_app_gestion` @ 5a0ce4c (read-only). Rutas relativas a `app/` salvo `supabase/…`.

**Alcance leído completo (5.046 líneas):**
- `app/(auth)/`: `login.tsx` (356), `registro.tsx` (307), `registro-tutor.tsx` (473), `registrar-mail.tsx` (202), `forgot-password.tsx` (249), `reset-password.tsx` (235), `terminos.tsx` (220), `acceso-restringido.tsx` (137), `_layout.tsx` (7)
- `app/_layout.tsx` (221) — guards y splash
- `app/(tutor)/`: `_layout.tsx` (96), `sobre.tsx` (185), `carnet|cuotas|noticias|calendario.tsx` (re-exports de socio, 2 c/u)
- `app/(admin)/`: `_layout.tsx` (28), `comunicados.tsx` (400), `sistema.tsx` (240), `usuarios.tsx`/`sobre.tsx` (re-exports)
- `components/shared/UsuariosScreen.tsx` (779), `components/ui/DatePickerField.tsx` (137)
- `supabase/functions/`: `login-dni` (76), `registro-tutor` (346), `actualizar-mi-mail` (59), `admin-usuarios` (283)

**Soporte leído (~1.600 líneas):** hooks `useLogin`, `useForgotPassword`, `useResetPassword`, `useTerminos`, `useAccesoRestringido`, `useMailSintetico`, `useRegistrarMail`, `useRegistroTutor`, `useMenoresTutor`, `useSignOut`, `useComunicadosAdmin`, `useUsuarios` (completo), `useSistemaAdmin` (1–80); `stores/authStore.ts`, `stores/tutorStore.ts`; `constants/{theme,roles,tabOptions}.ts`; `lib/supabase.ts`; `components/shared/Header.tsx` (1–60) y `SelectorVistaActiva` en `SobreScreen.tsx` (45–99); `supabase/functions/importar-socios/index.ts` (395–430), `_shared/parse-padron-socios.ts` (54–60, 115–145); migraciones `20260828000000_login_por_dni.sql`, `20260805000000_terminos_condiciones.sql` (55–80); `supabase/config.toml` (rate limits/SMTP); `odd/tasks/tutor-menores.md` (1–60); `.claude/context/historial.md:588` (SMTP del reset).

---

# Pasada 1 — auditor-ux

## Veredicto

Auditados por código los 9 pantallas de auth, el guard raíz, el rol tutor y el rol admin (más las 4 functions que llaman). **No sale a producción así**: el botón principal de *todas* las pantallas de acceso es texto oro sobre crema a 1.60:1 (el mismo bug de tokens de `cab360a` que ya se arregló en socio), y un socio que entra por primera vez no tiene en ningún lado la información de que su contraseña es su DNI sin puntos — y si lo escribe con puntos, el login le contesta "Credenciales incorrectas". Con ~1500 socios poco técnicos en su primer contacto, esas dos cosas solas generan la fila en Secretaría. Pasada única de un evaluador: la cobertura real es parcial (~35–42% de los problemas según Nielsen); esto no reemplaza ver a 3–5 socios reales intentando entrar.

**S4:** 2 · **S3:** 9 · **S2:** 1 · **S1:** 0 (quedaron afuera 3 S2 y 2 S1, ver Pasada 2 y "No pude verificar")

## Hallazgos

### S4 — El botón principal de todo el flujo de acceso es ilegible (1.60:1) y los banners de error son invisibles (1.09:1)

**Dónde:**
- Botón primario `backgroundColor: colors.tinta`/`'#F3EFE4'` + texto `colors.oro`: `app/(auth)/login.tsx:271-288` ("INGRESAR AL DIARIO →"), `forgot-password.tsx:177-191`, `reset-password.tsx:197-210`, `registro.tsx:269-282`, `registrar-mail.tsx:153-167`, `terminos.tsx:182-196`, `acceso-restringido.tsx:105-117`, `registro-tutor.tsx:425-440`, `app/(tutor)/_layout.tsx:86-90`.
- Banner de error fondo `#FEF8EC` + texto `colors.tinta`: `reset-password.tsx:212-225`, `registrar-mail.tsx:179-193`, `terminos.tsx:197-210`.
- Subtítulos/instrucciones `#7C7267` sobre `#15110A`: `login.tsx:222-230`, `forgot-password.tsx:149-157`, `acceso-restringido.tsx:96-104`, `registro-tutor.tsx:373-380`, `registrar-mail.tsx:133-141`, `terminos.tsx:132-140`, `(tutor)/_layout.tsx:82-85` (son el texto que explica qué hacer).
- Admin (mismo origen): `edicionBar` fondo `colors.tinta` + texto `colors.oro` en `app/(admin)/comunicados.tsx:278-285` y `sistema.tsx:222-229`. `UsuariosScreen.tsx:672-676` (header crema con título `colors.blanco` y sub `#8E8574`), `:733-735` (header del modal crema, título blanco, ✕ oro), y texto `colors.tinta` sobre oro en `:710-712` (GUARDAR CAMBIOS), `:728-730` (FAB "+ Nuevo usuario"), `:748-750` (Buscar), `:763-765` (rol activo), `:776-779` (Crear / Asignar rol).
- Input de `registrar-mail.tsx:142-152`: el único indicio del campo es el borde `#2C2418` sobre `#15110A`.

**Rompe:** WCAG 2.2 SC 1.4.3 Contraste (Mínimo) AA · SC 1.4.11 Contraste de no-texto AA · Nielsen #1 Visibilidad del estado (un error que no se lee no existe).
**Por qué:** `cab360a` invirtió `tinta` a `#F3EFE4`; todo lo que quería "fondo oscuro" quedó crema. El CTA del primer contacto mide 1.60:1 (necesita 4.5:1) y el mensaje que explica por qué falló el reset mide 1.09:1: es literalmente blanco sobre blanco. Es texto esencial en la puerta de entrada → S4.

| Ubicación | Hoy | Ratio | Cambiar a | Ratio |
|---|---|---|---|---|
| Botón primario auth + tutor layout | `#F5B41C` sobre `#F3EFE4` | 1.60:1 | `colors.sobreOro` `#15110A` sobre `colors.oro` `#F5B41C` | 10.24:1 |
| Error banner reset/registrar-mail/términos | `#F3EFE4` sobre `#FEF8EC` | 1.09:1 | `colors.texto` sobre `colors.card` `#1C1710`, borde `colors.rojoTexto` | 15.50:1 |
| Subtítulos auth | `#7C7267` sobre `#15110A` | 3.99:1 | `colors.textoSecundario` `#B8AD96` | 8.47:1 |
| Usuarios header título | `#FFFFFF` sobre `#F3EFE4` | 1.15:1 | `colors.texto` sobre `colors.fondo` | 16.37:1 |
| Usuarios header sub | `#8E8574` sobre `#F3EFE4` | 3.17:1 | `colors.muted` sobre `colors.fondo` | 5.16:1 |
| Usuarios botones oro (GUARDAR, FAB, Buscar, rol activo, Crear) | `#F3EFE4` sobre `#F5B41C` | 1.60:1 | `colors.sobreOro` sobre `colors.oro` | 10.24:1 |
| Admin `edicionBar` label | `#F5B41C` sobre `#F3EFE4` | 1.60:1 | barra `colors.card`, label `colors.oro` | 9.69:1 |
| Usuarios ✕ del modal | `#F5B41C` sobre `#F3EFE4` | 1.60:1 | header `colors.fondo`, ✕ `colors.oro` | 10.24:1 |
| Badges de rol en Usuarios (`ROL_COLOR` + `'22'`) | p.ej. `#7C3AED` sobre `#291C2D` | 2.84:1 (`#2563EB` 3.11, `#DC2626` 3.33, `#059669` 4.09) | texto `colors.texto`, el color de rol sólo en el borde | 14.08:1 |
| Input registrar-mail (borde) | `#2C2418` sobre `#15110A` | 1.23:1 | `borderColor: colors.oro` (como el resto de auth) | 10.24:1 |

**Fix:**
```ts
// en cada pantalla de (auth) y (tutor)/_layout.tsx
button:      { backgroundColor: colors.oro, paddingVertical: 16, alignItems: 'center', borderRadius: 4 },
buttonText:  { fontFamily: fonts.label, fontSize: 14, letterSpacing: 2.5, color: colors.sobreOro },
// spinner del botón cargando: <ActivityIndicator color={colors.sobreOro} />  (o dejar buttonLoading #333 + oro: 6.88:1)
errorBanner: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.rojoTexto, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 },
errorText:   { fontFamily: fonts.cuerpo, fontSize: 15, textAlign: 'center', color: colors.texto },
subtitle:    { /* … */ color: colors.textoSecundario },
// UsuariosScreen.tsx
header:      { paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: colors.fondo },
headerTitle: { fontFamily: fonts.titulo, fontSize: 28, color: colors.texto },
headerSub:   { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.muted, marginTop: 4 },
modalHeader: { /* … */ backgroundColor: colors.fondo },
modalTitulo: { /* … */ color: colors.texto },
// y reemplazar `color: colors.tinta` por `color: colors.sobreOro` en botonGuardarTexto, fabTexto,
// buscarBtnTexto, rolBtnTextoActivo, botonPrimarioTexto y los ActivityIndicator sobre oro.
// comunicados.tsx / sistema.tsx: edicionBar backgroundColor: colors.card
```
Sumar los pares nuevos a `lib/contraste.check.ts` para que no vuelva a pasar.

---

### S4 — Primer ingreso: nadie le dice al socio que la clave es su DNI, y el DNI con puntos se rechaza como "credenciales incorrectas"

**Dónde:** `app/(auth)/login.tsx:82-121` (no hay ninguna ayuda: label "DNI O MAIL", placeholder "DNI o tu mail", password `••••••••`); `supabase/functions/login-dni/index.ts:40,49-53` (`.eq('dni', identificador)` sin normalizar); la clave inicial es el DNI en `supabase/functions/importar-socios/index.ts:406,421` y `admin-usuarios/index.ts:87`; `profiles.dni` se guarda sólo dígitos (`_shared/parse-padron-socios.ts:54-56`), pero `admin-usuarios/index.ts:70` lo guarda tal cual se tipeó (con puntos si los puso Secretaría).
**Rompe:** Nielsen #10 Ayuda y documentación · Nielsen #6 Reconocimiento antes que recuerdo · Ley de Postel · Nielsen #5 Prevención de errores.
**Por qué:** Para los socios importados no hay mail de bienvenida (sólo el alta de staff manda "Contraseña inicial: tu número de DNI", `admin-usuarios/index.ts:212`). Un socio que escribe `30.123.456` — como figura en su documento — en cualquiera de los dos campos recibe "Credenciales incorrectas" y no tiene forma de saber que el problema son los puntos. Es el usuario quedando afuera en el primer contacto → S4.

**Fix:**
```ts
// supabase/functions/login-dni/index.ts — normalizar DNI y aceptar la clave inicial con puntos
} else {
  const dniNorm = identificador.replace(/\D/g, '')
  if (!dniNorm) return jsonError(401, GENERIC_ERROR)
  const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('dni', dniNorm).maybeSingle()
  // …
}
let { data: authData, error: authErr } = await supabaseAnon.auth.signInWithPassword({ email, password })
// Postel: la clave inicial es el DNI; si la tipeó con puntos/espacios, reintentar sólo con dígitos
const passDigits = password.replace(/\D/g, '')
if (authErr && passDigits !== password && /^[\d.\s-]+$/.test(password)) {
  ;({ data: authData, error: authErr } = await supabaseAnon.auth.signInWithPassword({ email, password: passDigits }))
}
// admin-usuarios/index.ts:70
const dni = (body.dni as string | undefined)?.replace(/\D/g, '')
```
```tsx
// app/(auth)/login.tsx — debajo del campo CONTRASEÑA
<Text style={s.ayuda}>¿Es tu primera vez? Tu usuario y tu contraseña son tu DNI, sin puntos.</Text>
// ayuda: { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.textoSecundario, marginTop: 8 }
// y en el label: "DNI (SIN PUNTOS) O MAIL"; keyboardType se queda default porque acepta mail.
```

---

### S3 — Los errores no dicen qué pasó: sin conexión = "credenciales incorrectas", y los mensajes de las functions nunca llegan a la pantalla

**Dónde:**
- `hooks/useLogin.ts:45-48` y `:55-58`: cualquier error de `login-dni` (sin red, 400 "Faltan datos" por campo vacío, 429 de GoTrue, 500) → "Credenciales incorrectas. Verificá tu DNI o mail y tu contraseña."
- `hooks/useLogin.ts:60-64,94-96` y `app/_layout.tsx:147-153`: si la lectura de `profiles` falla, `rol` queda `null`, el guard (`app/_layout.tsx:166-199`) no hace nada y el usuario queda en el login, logueado, sin ningún mensaje. Un rol desconocido cae a `ROL_RUTAS[rol] ?? '/(auth)/login'` (`:199`), igual de mudo.
- `hooks/useRegistrarMail.ts:18-21` y `hooks/useUsuarios.ts:278-279, 318-319, 393-394, 416-417`: `data?.error ?? fnError?.message`. Con un non-2xx `supabase.functions.invoke` devuelve `data: null` (el propio repo lo documenta en `supabase/functions/registro-tutor/index.ts:20-21`), así que "Ese mail ya está en uso por otra cuenta" (`actualizar-mi-mail/index.ts:292-294`), "Ya existe un usuario con ese email/DNI", "El socio ya tiene ese rol asignado" (`admin-usuarios/index.ts:95,122,169`) se muestran como **"Edge Function returned a non-2xx status code"**.
- `hooks/useRegistrarMail.ts:25-34`: si falla "Ahora no", devuelve `false` sin setear error → el botón no hace nada.
- `hooks/useUsuarios.ts:116-125`: `const { data } = await …` sin mirar `error` → con la red caída la lista dice "Sin usuarios registrados."
- `app/(auth)/registro.tsx:69`: muestra `passErr.message` crudo de GoTrue en inglés ("New password should be different from the old password.").

**Rompe:** Nielsen #9 Ayudar a reconocer, diagnosticar y recuperarse de errores · Nielsen #2 Lenguaje del usuario · Nielsen #1 Visibilidad del estado.
**Por qué:** Un socio sin señal en la cancha lee "credenciales incorrectas", prueba tres veces y termina pidiendo un reset que no necesitaba. Los errores de negocio que Agus escribió en español existen en las functions pero el cliente nunca los lee.

**Fix:**
```ts
// lib/errorFunction.ts (nuevo)
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
export const SIN_CONEXION = 'No hay conexión. Revisá tu internet y probá de nuevo.'
export async function mensajeDeFunction(error: unknown, fallback: string): Promise<{ mensaje: string; status?: number }> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context.status
    try {
      const body = await error.context.json()
      if (typeof body?.error === 'string') return { mensaje: body.error, status }
    } catch { /* body no JSON */ }
    return { mensaje: fallback, status }
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return { mensaje: SIN_CONEXION }
  return { mensaje: fallback }
}
// useLogin.ts
if (!dni.trim() || !password) { setError('Completá tu DNI y tu contraseña.'); return }
const { data: loginData, error: loginError } = await supabase.functions.invoke('login-dni', { body: { dni, password } })
if (loginError) {
  const { status } = await mensajeDeFunction(loginError, '')
  setError(
    status === 401 ? 'El DNI o la contraseña no coinciden. Si es tu primera vez, la contraseña es tu DNI sin puntos.'
    : status === 429 ? 'Hubo demasiados intentos. Esperá unos minutos y probá de nuevo.'
    : status ? 'El sistema no respondió. Probá de nuevo en unos minutos.'
    : SIN_CONEXION)
  return
}
// …
const { data: profile, error: profileError } = await supabase.from('profiles').select('rol, roles').eq('id', data.user.id).single()
if (profileError || !profile?.rol) {
  await supabase.auth.signOut()
  setError('Entraste, pero no pudimos cargar tu perfil. Probá de nuevo; si sigue pasando, avisá a Secretaría.')
  return
}
// login-dni/index.ts:69-70 — no tapar el rate limit
if (authErr?.status === 429) return jsonError(429, 'Demasiados intentos')
// useRegistrarMail / useUsuarios: reemplazar `data?.error ?? fnError?.message ?? X` por
//   (await mensajeDeFunction(fnError, X)).mensaje  cuando fnError; y en omitir():
//   if (updateErr) setError('No pudimos guardar tu elección. Probá de nuevo.')
// useUsuarios.fetchUsuarios: `const { data, error } = …; if (error) { setErrorLista('No se pudo cargar la lista.'); return }`
// registro.tsx:69: setError(passErr.message.includes('different') ? 'Elegí una contraseña distinta a la actual.' : 'No pudimos guardar la contraseña. Probá de nuevo.')
```

---

### S3 — "Olvidé mi contraseña" pide un mail que muchos socios no tienen y no explica qué hacer si no llega

**Dónde:** `app/(auth)/forgot-password.tsx:57-76` (sólo campo EMAIL, después de un login que pidió DNI) y `:44-53` (éxito: "Si el email está registrado, vas a recibir un link…"); `hooks/useForgotPassword.ts:15-21` (`resetPasswordForEmail(email, { redirectTo: 'uncasrugby://reset-password' })`).
**Rompe:** Nielsen #4 Consistencia (login por DNI, recuperación por mail) · Nielsen #10 Ayuda · Nielsen #6 · Ley de Tesler (la complejidad la paga el socio).
**Por qué:** Los socios sin mail en NUVIX tienen `socio-{n}@uncas.local` (`parse-padron-socios.ts:141`): para ellos el reset es imposible y la pantalla no lo dice. Los que sí tienen mail no saben cuál cargó el club. Y el link es un deep link `uncasrugby://`: si abren el mail en la compu, no funciona. Nada de eso está en pantalla; el usuario espera un mail que nunca llega.

**Fix:**
```tsx
// forgot-password.tsx — aceptar DNI o mail y explicar el camino alternativo
<Text style={styles.label}>DNI O MAIL</Text>
<TextInput … keyboardType="default" textContentType="username" autoComplete="username" placeholder="Tu DNI sin puntos o tu mail" />
// éxito:
<Text style={styles.successBody}>
  Si tu cuenta tiene un mail registrado, te mandamos un link. Abrilo desde este celular (el link abre la app).
  Revisá también la carpeta de spam.{'\n\n'}
  Si no te llega en unos minutos, o nunca registraste un mail en el club, acercate a Secretaría con tu DNI.
</Text>
```
```ts
// supabase/functions/login-dni: nueva acción `reset` (misma resolución DNI → email, sin JWT)
// body { action: 'reset', dni } → si el email es sintético (@uncas.local) devolver jsonOk({ ok: true }) igual
// (no revelar), si no: await supabaseAnon.auth.resetPasswordForEmail(email, { redirectTo: 'uncasrugby://reset-password' })
// useForgotPassword: invoke('login-dni', { body: { action: 'reset', dni: valor } })
```

---

### S3 — El link de reset vencido falla en silencio y la pantalla de nueva contraseña no tiene salida

**Dónde:** `app/_layout.tsx:104-114` (sólo mira `access_token`/`refresh_token`; el fragmento `#error=access_denied&error_code=otp_expired` se ignora), `:111-113` (marca `isPasswordRecovery` *antes* de que `setSession` funcione), `:172-174` (mientras el flag esté, todo redirige a reset), `app/(auth)/reset-password.tsx:36-115` (no hay "Volver"/"Cancelar"; si `updateUser` falla porque la sesión no es válida, el mensaje es "No se pudo actualizar la contraseña. Intentá de nuevo." para siempre, `hooks/useResetPassword.ts:27-31`).
**Rompe:** Nielsen #1 Visibilidad del estado · Nielsen #3 Control y libertad (flujo del que sólo se sale matando la app = S3 automático) · Nielsen #9.
**Por qué:** El caso típico (el socio toca el link al día siguiente o dos veces) lo deja en el login sin explicación, o atrapado en reset sin poder volver.

**Fix:**
```ts
// app/_layout.tsx, dentro de handleUrl, antes de buscar tokens
const raw = url.split('#')[1] ?? url.split('?')[1] ?? ''
const errParams = new URLSearchParams(raw)
if (errParams.get('error_code') || errParams.get('error')) {
  router.replace({ pathname: '/(auth)/forgot-password',
    params: { aviso: 'El link venció o ya se usó. Pedí uno nuevo.' } })
  return
}
// …y marcar recovery sólo si la sesión quedó:
const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
if (error) { router.replace({ pathname: '/(auth)/forgot-password', params: { aviso: 'El link venció. Pedí uno nuevo.' } }); return }
if (type === 'recovery') setPasswordRecovery(true)
```
```tsx
// reset-password.tsx, debajo del botón
<TouchableOpacity style={styles.backWrap} onPress={async () => { setPasswordRecovery(false); await supabase.auth.signOut(); clearAuth() }}
  accessibilityRole="button">
  <Text style={styles.backText}>Cancelar y volver al inicio</Text>
</TouchableOpacity>
// forgot-password.tsx: leer `aviso` con useLocalSearchParams y mostrarlo en un banner arriba del form.
```

---

### S3 — El guard raíz te manda al inicio cada vez que se renueva el token (cada ~1 h o al volver a la app)

**Dónde:** `app/_layout.tsx:138` (`setSession(newSession)` también en `TOKEN_REFRESHED`) + deps del guard `:201-205` (`session?.access_token`) + `:199` (`router.replace(ROL_RUTAS[rol])` sin mirar dónde está el usuario). Además `useTerminos`/`useAccesoRestringido`/`useMailSintetico` dependen de `[session]` y re-disparan el guard cuando terminan.
**Rompe:** Nielsen #3 Control y libertad · Nielsen #1 · (posible pérdida de datos en pantallas de stack de otros roles).
**Por qué:** El guard no distingue "llegué a la app" de "ya estoy adentro". Cada refresh (autoRefresh cada ~55 min, o al volver de background con el token vencido) cambia `access_token` → `router.replace` al home del rol. Un admin a mitad de un comunicado, un tutor revisando cuotas, un entrenador cargando asistencia: los saca de donde estaban. Mismo mecanismo hace que, después de registrar el mail (`registrar-mail.tsx:27-30`), el próximo refresh lo vuelva a mandar a `registrar-mail` una vez porque `useMailSintetico` todavía tiene `pendiente: true` en el primer pase.

**Fix:**
```ts
// app/_layout.tsx
import { Slot, useRouter, useSegments } from 'expo-router'
const segments = useSegments()
const grupoActual = segments[0] // '(auth)', '(admin)', '(tutor)', …
function irA(destino: string) {
  const grupoDestino = destino.match(/^\/(\([^)]+\))/)?.[1]
  const pantallaDestino = destino.split('/').pop()
  // ya estoy en el grupo correcto (y no en una pantalla de auth) → no tocar la navegación
  if (grupoDestino !== '(auth)' && grupoActual === grupoDestino) return
  if (grupoDestino === '(auth)' && segments[1] === pantallaDestino) return
  router.replace(destino as Href)
}
// reemplazar cada router.replace(...) del guard por irA(...), y agregar grupoActual a las deps.
// useRegistrarMail.guardar: después del ok, `await supabase.auth.refreshSession()` para que
// session.user.email deje de ser @uncas.local y useMailSintetico se recalcule.
```

---

### S3 — El guard de términos puede dejar a alguien atrapado sin salida (y saltearse si falla la red)

**Dónde:** `hooks/useTerminos.ts:35-39,47-52` (errores de las dos queries ignorados: si falla la de `terminos_aceptaciones`, `aceptacion` queda `null` → `pendiente: true`; si falla la de `terminos_versiones`, `activa` es `null` → `pendiente: false` y entra sin aceptar), `:73-79` (el insert de alguien que ya había aceptado choca con `UNIQUE (profile_id, version_id)` de `20260805000000_terminos_condiciones.sql:67` → "No se pudo registrar la aceptación" en loop), `app/(auth)/terminos.tsx:39-98` (no hay "Cerrar sesión" ni salida), `:57` (`pdfUrl && Linking.openURL(pdfUrl)`: si no hay PDF el botón no hace nada).
**Rompe:** Nielsen #3 Control y libertad · Nielsen #9 · Nielsen #5.
**Por qué:** Un fallo transitorio de red al abrir la app convierte a un socio que ya aceptó en uno que no puede volver a aceptar ni salir. Y el inverso deja pasar sin aceptar (exposición legal).

**Fix:**
```ts
// useTerminos.ts
const { data: activa, error: errActiva } = await supabase.from('terminos_versiones')…
const { data: aceptacion, error: errAcep } = activa ? await supabase.from('terminos_aceptaciones')… : { data: null, error: null }
if (errActiva || errAcep) {
  setState(s => ({ ...s, loading: false, pendiente: true, error: 'No pudimos verificar los términos. Revisá tu conexión y tocá Reintentar.' }))
  return
}
// aceptar():
if (error && error.code !== '23505') { /* error real */ }
setState(s => ({ ...s, aceptando: false, pendiente: false }))
```
```tsx
// terminos.tsx
<TouchableOpacity style={styles.pdfButton} disabled={!pdfUrl} onPress={() => Linking.openURL(pdfUrl!).catch(() => Alert.alert('No se pudo abrir el documento', 'Probá de nuevo más tarde.'))}>
{error && <TouchableOpacity onPress={refetch}><Text>Reintentar</Text></TouchableOpacity>}
<TouchableOpacity style={styles.linkWrap} onPress={signOut}><Text style={styles.linkText}>Cerrar sesión</Text></TouchableOpacity>
```

---

### S3 — Gestores de contraseñas y autocompletado no saben qué es cada campo (cero `textContentType`/`autoComplete`/`accessibilityLabel`)

**Dónde:** `login.tsx:84-93,100-108`; `reset-password.tsx:53-61,79-87`; `registro.tsx:107-116,123-131,149-157`; `registro-tutor.tsx:160-169,196-206,211-220,260-270,287-296`; `registrar-mail.tsx:54-63`; `forgot-password.tsx:65-75`. El único caso bien hecho es el código OTP (`registro-tutor.tsx:252-253`). Grep en todo el alcance: 0 `accessibilityLabel`, 0 `returnKeyType`/`onSubmitEditing`. Los botones ojo (`login.tsx:109-119`, `reset-password.tsx:62-72`, `registro.tsx:132-142`, `registro-tutor.tsx:271-281`) son un ícono sin nombre.
**Rompe:** WCAG 2.2 SC 1.3.5 Identificar el propósito de la entrada (AA) · SC 3.3.8 Autenticación accesible (AA, el espíritu: que los gestores funcionen) · SC 4.1.2 Nombre, función, valor (A) · SC 1.3.1/3.3.2 (el `<Text>` de label no está asociado al input en RN) · Nielsen #7 (Enter en la contraseña no ingresa).
**Por qué:** Pegar funciona (RN no lo bloquea), pero iOS/Android no ofrecen guardar ni autocompletar la clave en login, ni sugerir una fuerte en reset/registro, porque no saben qué es usuario y qué es contraseña. Para un socio mayor que se olvida la clave, el gestor es la diferencia entre entrar o ir a Secretaría. TalkBack/VoiceOver lee "botón" en el ojo.

**Fix:**
```tsx
// login.tsx
const passRef = useRef<TextInput>(null)
<TextInput … accessibilityLabel="DNI o mail" textContentType="username" autoComplete="username"
  importantForAutofill="yes" returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} />
<TextInput ref={passRef} … accessibilityLabel="Contraseña" textContentType="password" autoComplete="password"
  importantForAutofill="yes" returnKeyType="go" onSubmitEditing={() => login(dni, password)} />
<TouchableOpacity style={s.eyeButton} … accessibilityRole="button"
  accessibilityLabel={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} />
// reset-password / registro / registro-tutor (las dos contraseñas):
  textContentType="newPassword" autoComplete="new-password" passwordRules="minlength: 8;"
// mails (registro-tutor, registrar-mail, forgot): textContentType="emailAddress" autoComplete="email"
// nombre: textContentType="name" autoComplete="name"; fecha tutor: autoComplete="birthdate-full"
// registrar-mail.tsx: agregar <Text style={styles.label}>TU MAIL</Text> visible + accessibilityLabel="Tu mail"
```

---

### S3 — El alta del tutor sólo se descubre logueándose como el menor

**Dónde:** único acceso a `/(auth)/registro-tutor` es `app/(auth)/acceso-restringido.tsx:19-31,51-58` (grep en `app/` y `web/`: no hay otro link). `login.tsx` no tiene entrada.
**Rompe:** Nielsen #6 Reconocimiento antes que recuerdo · Ley de Tesler · Nielsen #10.
**Por qué:** Para llegar al formulario, la madre/el padre tiene que saber que el hijo tiene cuenta, adivinar que la clave del chico es su DNI, entrar como él y recién ahí ver "¿Sos su familiar o tutor?". Nadie hace eso: el camino natural es abrir la app y buscar "crear cuenta" en el login. `registro-tutor.tsx` ya funciona sin sesión (`registroSinSesion`, `:83-87`), así que el link es gratis.

**Fix:**
```tsx
// login.tsx, debajo de "Olvidé mi contraseña"
<Link href="/(auth)/registro-tutor" asChild>
  <TouchableOpacity style={s.linkWrap} accessibilityRole="link" disabled={loading}>
    <Text style={s.linkText}>¿Sos madre, padre o tutor de un socio menor de 13? Creá tu cuenta</Text>
  </TouchableOpacity>
</Link>
// linkWrap: { alignItems: 'center', marginTop: 16, paddingVertical: 12 }
```

---

### S3 — Admin: los 8 roles creables van en una sola fila sin wrap (~33 pt por botón)

**Dónde:** `components/shared/UsuariosScreen.tsx:760-761` (`rolSelector: { flexDirection: 'row' }`, `rolBtn: { flex: 1 }`) con `ROLES_CREABLES_ADMIN` de 8 ítems (`:326-335`), usado en `:440-453` y `:550-563`.
**Rompe:** Ley de Fitts / Apple HIG 44 pt · Nielsen #6 (labels cortados) · WCAG SC 1.4.4/1.4.12 (no sobrevive a texto más grande).
**Por qué:** 390 pt − 40 de padding − 56 de gaps = 294 / 8 ≈ 36,7 pt por botón (≈33 pt de contenido). "Coordinador" o "Subcomisión" a 14 pt no entran: se parten letra por letra o se cortan. El admin elige el rol de un usuario sin poder leerlo. Con subcomisión (4 roles) entra justo.

**Fix:**
```ts
rolSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
rolBtn:      { flexBasis: '30%', flexGrow: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 10,
               borderRadius: 8, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.borde, alignItems: 'center' },
// + accessibilityRole="radio" accessibilityState={{ checked: activo }} en cada botón
```

---

### S3 — Botones de ícono sin nombre y targets chicos en admin y registro-tutor

**Dónde:** `app/(admin)/comunicados.tsx:141-143` (X del modal: ícono 20 pt sin padding = 20×20), `:77-79` + `:319` (papelera: 14 + 2×8 = 30 pt), `:251-253` (FAB "+" sin label); `UsuariosScreen.tsx:347-349` (✕ texto 21 pt sin padding), `:180-182` ("‹ Usuarios" 16 pt sin padding); `registro-tutor.tsx:414-421` (chips de relación: 12 pt ≈15 de línea + 16 + 3 = ~34 pt); links de texto sin padding: `login.tsx:338-341` ("Olvidé mi contraseña" ~17 pt), `registro-tutor.tsx:463` ("Reenviar código" / "Volver"), `registrar-mail.tsx:168-171` ("Ahora no"). Ninguno tiene `accessibilityLabel`; los chips de `comunicados.tsx:151-156` y `UsuariosScreen.tsx` (divisiones, rol) no tienen `accessibilityState`.
**Rompe:** WCAG 2.2 SC 4.1.2 Nombre, función, valor (A) · Apple HIG 44×44 pt / Material 48 dp · Ley de Fitts.
**Por qué:** TalkBack lee la papelera y la X como "botón" sin más; un admin con lector de pantalla no sabe cuál borra. La X de 20 pt y la papelera de 30 pt están lejos de 44.

**Fix:**
```tsx
// comunicados.tsx
<TouchableOpacity onPress={handleClose} style={{ padding: 12 }} accessibilityRole="button" accessibilityLabel="Cerrar sin publicar">
<TouchableOpacity style={s.actionBtn} … accessibilityRole="button" accessibilityLabel={`Eliminar "${comunicado.titulo}"`}>
// actionBtn: { …, padding: 15 }   → 14 + 30 = 44
<TouchableOpacity style={s.fab} … accessibilityRole="button" accessibilityLabel="Nuevo comunicado">
<TouchableOpacity … accessibilityRole="radio" accessibilityState={{ checked: activo }}>   // chips de audiencia
// UsuariosScreen.tsx:347
<TouchableOpacity onPress={hook.cerrarModal} style={{ padding: 12 }} accessibilityRole="button" accessibilityLabel="Cerrar">
  <Feather name="x" size={22} color={colors.oro} />
</TouchableOpacity>
// registro-tutor chip: paddingVertical: 14  (→ ~45 pt) + accessibilityRole="radio" accessibilityState={{ checked: activo }}
// links de texto: paddingVertical: 12 en forgotWrap / linkWrap / skipButton
```

---

### S2 — Validación sólo al enviar, de a un error por vez, lejos del campo

**Dónde:** `registro-tutor.tsx:92-98` (`validarDatos` devuelve el primer error) + `:307-311` (banner único abajo, debajo de 5 campos y con el teclado abierto); `:116-123` (paso código); `reset-password.tsx` vía `useResetPassword.ts:14-21`; `registro.tsx:60-63`; `UsuariosScreen.tsx:594-598` (`errorForm` abajo del form) vía `useUsuarios.ts:297-301`. Ningún campo se marca.
**Rompe:** Nielsen #5 Prevención de errores · Nielsen #9 ("¿dice dónde?") · WCAG SC 3.3.1 Identificación de errores (A) — se identifica en texto, pero no se asocia al campo.
**Por qué:** El tutor con mail mal escrito y fecha incompleta toca ENVIAR, ve un error, lo arregla, toca de nuevo, ve otro. Son 4 campos validables localmente que se podrían marcar al salir de cada uno. Lo dejo en S2 porque el mensaje es claro y no se pierde nada.

**Fix:**
```tsx
// registro-tutor.tsx
const [tocados, setTocados] = useState<Record<string, boolean>>({})
const errores = {
  relacion: !relacion ? 'Elegí tu relación con el socio.' : null,
  email:    !EMAIL_RE.test(emailNormalizado) ? 'Revisá el mail: falta la @ o el dominio.' : null,
  fecha:    !fechaAIso(fecha) ? 'Usá el formato DD/MM/AAAA.' : null,
  dni:      dniNormalizado.length < 6 ? 'El DNI tiene 7 u 8 números.' : null,
}
// en cada TextInput: onBlur={() => setTocados(t => ({ ...t, email: true }))}
// debajo de cada campo:
{tocados.email && errores.email && <Text style={s.errorCampo} accessibilityLiveRegion="polite">{errores.email}</Text>}
// al enviar: setTocados({ relacion: true, email: true, fecha: true, dni: true }) y no llamar si hay errores
// errorCampo: { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.rojoTexto, marginTop: 6 }  // 5.27:1 sobre card
```

## Lo que está bien

- **Anti-enumeración bien resuelta:** `login-dni` y `registro-tutor` nunca distinguen "DNI no existe" de "no coincide" ni devuelven el mail guardado; el éxito de forgot-password es genérico. No lo rompan al aplicar el fix de errores: el 401 sigue siendo un solo mensaje.
- **`registro-tutor` es el mejor flujo del área:** dos pasos con título que cambia ("Revisá tu mail"), muestra a qué mail se mandó el código, OTP con `oneTimeCode`/`one-time-code`, máscara DD/MM/AAAA tolerante (`formatearFechaTipeada`), DNI normalizado (`replace(/\D/g, '')`), "Reenviar" y "Volver" sin perder datos, y la function devuelve errores de negocio con 200 + `motivo` mapeado a mensajes accionables (Nielsen #9). Rollback completo si falla a mitad.
- **Selector de vista multi-rol (`SobreScreen.tsx:45-99`):** escribe `profiles.rol` *antes* de cambiar la vista local, deshabilita mientras cambia, anuncia `selected/busy`, y el guard re-lee `rol` del perfil, así que la vista elegida persiste entre sesiones. El orden de gates en el guard (restringido → términos → mail sintético) es correcto: un menor no ve términos que no puede aceptar.
- **Splash sin flash del login:** espera perfil + términos + restricción antes de ocultar, con red de seguridad de 8 s (`app/_layout.tsx:74-90`).
- **Destructivas en admin bien protegidas:** eliminar usuario tiene doble confirmación con copy explícito ("Esta acción no se puede deshacer"), publicar comunicado confirma a quién le llega el push, y `eliminar` detecta "0 filas borradas" por RLS en vez de mentir éxito (`useComunicadosAdmin.ts:116-129`). `sistema.tsx` distingue "no disponible" (error) de "vacío" — exactamente la lección #2.

## No pude verificar

- **Rate limit de GoTrue detrás de `login-dni` (posible S4 en el lanzamiento):** todas las llamadas a `signInWithPassword` salen de la IP de la Edge Function, y el límite `sign_in_sign_ups` es por IP (30 cada 5 min en `supabase/config.toml:202`; el valor de producción no está en el repo). Si Supabase no propaga la IP del cliente desde la function, 30 logins en 5 minutos (una convocatoria por WhatsApp) bloquean a todo el club con "Credenciales incorrectas". Hace falta: mirar Auth → Rate Limits en el dashboard y disparar 35 logins seguidos contra `login-dni` en staging.
- **Teclado tapando campos en Android:** `KeyboardAvoidingView behavior="height"` con `edgeToEdgeEnabled: true` (`app.config.js:39`, Expo 54 / RN 0.81) y contenido `justifyContent: 'center'` + `paddingVertical: 64`. En registro-tutor (5 campos + chips) el botón y el banner de error probablemente quedan bajo el teclado. Necesito screenshots de un Android 14/15 real con el teclado abierto en login, registro-tutor (paso datos) y reset-password.
- **Lector de pantalla real**, orden de foco y escalado de fuente al 130–200 % (los títulos de 52 pt con `lineHeight` fijo pueden recortarse).
- **Vencimiento real del link de reset en producción** (local `otp_expiry = 3600`) — para poner el número en el texto de forgot-password.
- **Race entre `useResetPassword` (`router.replace` a login con `mensaje`) y el guard** (`clearAuth` → `replace('/(auth)/login')` sin params): el banner "Contraseña actualizada" puede perderse. Requiere probarlo en dispositivo.
- **Cuántos socios tienen `dni = 'SD{n}'`** (sin DNI válido en NUVIX, `parse-padron-socios.ts:138`): esos no pueden entrar por DNI ni saben su clave ("SD123"). Hace falta un `select count(*) from socios where dni like 'SD%'`.
- Las pantallas de socio re-exportadas para el tutor (`carnet`, `cuotas`, `noticias`, `calendario`) se auditaron el 2026-10-13; no las repetí.

---

# Pasada 2 — impeccable audit (native, iOS + Android)

`impeccable detect` no aplica: el área es 100 % React Native (`audit.native.md`: "no browser tooling or `impeccable detect` applies"). Puntaje desde código contra `ios.md` / `android.md`.

## Audit Health Score

| # | Dimensión | Puntaje | Hallazgo clave |
|---|---|---|---|
| 1 | Accessibility | 1 | 0 `accessibilityLabel` en el alcance; CTA de auth a 1.60:1 (= auditor-ux #1, #8, #12) |
| 2 | Performance | 3 | Lista de usuarios con `ScrollView` + `map` (n chico, aceptable); sin jank evidente |
| 3 | Appearance & Theming | 1 | Auth y admin ignoran los tokens semánticos: hex sueltos y `PLACEHOLDER` duplicado en 6 archivos; `DatePickerField` con paleta clara en app oscura |
| 4 | Platform Conformance | 1 | Back de Android en detalle de usuario sale de la pantalla; modal de comunicado descarta sin guard y sin `insets.bottom`; glifos de texto como íconos; header con `paddingTop: 60` fijo |
| 5 | Adaptivity | 2 | Formularios de auth estirados en iPad (`supportsTablet: true`, sin `maxWidth`); teclado sin cadena `next`/`go` |
| **Total** | | **8/20** | **Poor** |

## Platform Conformance Verdict

**Falla a medias.** Las pantallas de auth en sí son honestas (stack sin header, scroll, `keyboardShouldPersistTaps`), pero admin se comporta como una web portada: `UsuariosScreen` hace navegación con estado local (`paso: 'lista' | 'detalle'`) que el Back del sistema no conoce, el header usa un `paddingTop: 60` mágico en vez de safe area, los íconos son caracteres Unicode (`✕ › ‹`) mezclados con Feather e Ionicons, y el modal de comunicado es una sheet falsa (no arrastra, no respeta el home indicator, descarta lo escrito con el Back).

## Executive Summary

- Audit Health Score: **8/20** (Poor)
- Issues: P0: 0 · P1: 3 · P2: 4 · P3: 1 (más los de la pasada 1, no repetidos)
- Top: Back de Android roto en detalle de usuario; comunicado escrito se pierde con un Back accidental; tokens ignorados en auth/admin (raíz del contraste); `DatePickerField` fuera de tema (compartido).
- Próximo paso: aplicar los fixes S4 de la pasada 1 (contraste + primer ingreso), luego P1.

## Detailed Findings by Severity

**[P0] Contraste de botón primario / banners / badges** — (= auditor-ux #1)

**[P1] Back del sistema en el detalle de usuario saca de la pantalla en vez de volver a la lista**
- **Location:** `components/shared/UsuariosScreen.tsx:63-79` (vista por estado `hook.paso`), `:180-182` (botón "‹ Usuarios" propio). No hay `BackHandler` ni ruta.
- **Category:** Conformance
- **Impact:** En Android el gesto Back desde "Detalle" cambia de tab o cierra la app; en iOS no hay edge-swipe. El admin pierde el contexto.
- **Guideline:** Android "System Back always works"; iOS "Edge-swipe back stays alive".
- **Recommendation:** Mover el detalle a una ruta de stack (`app/(admin)/usuarios/[id].tsx` con `_layout` Stack) o, mínimo:
  ```ts
  useFocusEffect(useCallback(() => {
    if (hook.paso !== 'detalle') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { hook.volverALista(); return true })
    return () => sub.remove()
  }, [hook.paso]))
  ```
- **Suggested command:** `/impeccable adapt`

**[P1] El modal de comunicado descarta el texto con Back/X sin preguntar y no respeta el home indicator**
- **Location:** `app/(admin)/comunicados.tsx:107-110` (`handleClose` → `limpiar()`), `:131` (`onRequestClose={handleClose}`), `:335` (`modalContent: { padding: 24 }` sin `insets.bottom`).
- **Category:** Conformance
- **Impact:** Un Back accidental borra un comunicado largo sin deshacer. El botón PUBLICAR queda pegado al home indicator en iPhone.
- **Guideline:** iOS "honor swipe-to-dismiss unless data loss requires a guard"; Android insets.
- **Recommendation:**
  ```ts
  const handleClose = () => {
    if (!titulo.trim() && !cuerpo.trim()) { limpiar(); onClose(); return }
    Alert.alert('¿Descartar el comunicado?', 'Se pierde lo que escribiste.', [
      { text: 'Seguir editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => { limpiar(); onClose() } },
    ])
  }
  // contentContainerStyle={[s.modalContent, { paddingBottom: insets.bottom + 24 }]}
  ```
- **Suggested command:** `/impeccable harden`

**[P1] Header de UsuariosScreen con `paddingTop: 60` fijo**
- **Location:** `components/shared/UsuariosScreen.tsx:672`
- **Category:** Conformance
- **Impact:** En iPhone con Dynamic Island (inset 59) el label queda a 1 pt del status bar; en Android edge-to-edge con status bar de 24 dp sobran 36. Es el único header del área que no usa `useSafeAreaInsets` ni el `Header` compartido (que sí usan `comunicados.tsx:214-215` y `sistema.tsx:117-118`).
- **Guideline:** Safe area / edge-to-edge insets.
- **Recommendation:** `const insets = useSafeAreaInsets()` y `paddingTop: insets.top + 16`, o usar `<Header />` + `edicionBar` como las otras dos pantallas de admin (consistencia interna).
- **Suggested command:** `/impeccable adapt`

**[P2] Auth y admin no usan los tokens semánticos (raíz del bug de contraste)**
- **Location:** `const PLACEHOLDER = '#9B9A8F'` en `login.tsx:19`, `forgot-password.tsx:17`, `reset-password.tsx:18`, `registro.tsx:20`, `registro-tutor.tsx:25`; `backgroundColor: '#15110A'` literal en los 9 archivos de auth; `FONDO/CARD/TEXTO/MUTED` redefinidos en `comunicados.tsx:267-271` y `sistema.tsx:209-215`; `GOLD/GOLD_DEEP/VERDE` en `(tutor)/sobre.tsx:13-15`; `ROJO = '#EF4444'`/`VERDE` en `UsuariosScreen.tsx:22-24`.
- **Category:** Theming
- **Impact:** El próximo cambio de paleta vuelve a romper estas pantallas en silencio, como pasó con `cab360a`.
- **Recommendation:** Reemplazar por `colors.fondo`, `colors.card`, `colors.texto`, `colors.muted`, `colors.textoSecundario`, `colors.rojoTexto`, `colors.confirmacion` (todos existen en `constants/theme.ts:9-30`). Prohibir `colors.tinta`/`colors.papel` como fondo en código nuevo.
- **Suggested command:** `/impeccable colorize`

**[P2] `DatePickerField` con paleta clara dentro de una app oscura y sin semántica**
- **Location:** `components/ui/DatePickerField.tsx:6-9,134-136` (campo `#fff`, texto `#1A1A1A`, borde `#D1C9B8`), `:99-112` (sin `accessibilityRole`/`accessibilityLabel`/`accessibilityHint`), `:93-95` ("Quitar" 13 pt + hitSlop 8 ≈ 32 pt).
- **Category:** Theming / Accessibility
- **Impact:** Un recuadro blanco brillante en medio de pantallas `#15110A` (rompe figura-fondo y consistencia); TalkBack lee "Seleccionar fecha" sin saber de qué campo.
- **Recommendation:**
  ```ts
  campo: { …, backgroundColor: colors.card, borderColor: colors.borde },
  texto: { flex: 1, fontSize: 17, color: colors.texto },
  placeholder: { color: colors.muted },   // 4.88:1 sobre card
  // <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: ${displayText ?? 'sin elegir'}`} accessibilityHint="Abre el selector">
  ```
- **Suggested command:** `/impeccable colorize`

**[P2] Formularios de auth estirados en iPad**
- **Location:** `app.config.js:22` (`supportsTablet: true`) + `container: { paddingHorizontal: 32 }` sin `maxWidth` en `login.tsx:187-192` y los otros 8 archivos de auth.
- **Category:** Adaptivity
- **Impact:** En un iPad los inputs y el botón miden ~700 pt de ancho; el ojo no encuentra el campo.
- **Recommendation:** `container: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 64, width: '100%', maxWidth: 480, alignSelf: 'center' }`.
- **Suggested command:** `/impeccable adapt`

**[P2] Íconos como caracteres de texto y tres sets mezclados**
- **Location:** `UsuariosScreen.tsx:140,348,426,181` (`›`, `✕`, `‹ Usuarios`), `forgot-password.tsx:47` (`✓` a 48 pt), `(tutor)/sobre.tsx:117` y `UsuariosScreen.tsx` banners (`✓`); auth usa Ionicons, tabs/admin usan Feather.
- **Category:** Conformance
- **Impact:** Los glifos dependen de la fuente (Barlow Black no tiene `✕` → fallback del sistema, tamaño y baseline distintos entre iOS/Android) y no escalan como íconos.
- **Recommendation:** Feather `x`, `chevron-right`, `chevron-left`, `check` en todos lados; un solo set.
- **Suggested command:** `/impeccable polish`

**[P3] Login biométrico casi nunca aparece**
- **Location:** `hooks/useSignOut.ts:22-28` borra `EMAIL_KEY`/`PASSWORD_KEY` en cada logout; `login.tsx:145` sólo muestra el botón si hay credenciales guardadas.
- **Category:** Conformance
- **Impact:** Después de "Cerrar sesión" la huella desaparece; sólo sirve si la sesión vence sola. Es una decisión deliberada (dispositivo compartido, comentario en `useSignOut.ts:20-21`), pero el usuario que activó "Acceso rápido" no entiende por qué se fue. Decisión de producto.
- **Suggested command:** `/impeccable clarify`

## Patterns & Systemic Issues

- **`colors.tinta` usado como "oscuro"** en 14 lugares del área (lista en auditor-ux #1): es sistémico, no puntual. Un `grep -n "colors.tinta" app/app/\(auth\) app/app/\(admin\) app/app/\(tutor\) app/components/shared/UsuariosScreen.tsx` y revisar cada uso.
- **`supabase.functions.invoke` + `data?.error`** asume que el body llega en un non-2xx: aparece en `useRegistrarMail` y 4 veces en `useUsuarios`; muy probablemente también en otras áreas (`grep -rn "data?.error ?? " app/hooks`).
- **Navegación del guard por `router.replace` incondicional**: mismo patrón para todos los roles.

## Positive Findings

- `TAB_SCREEN_OPTIONS` con labels visibles y 4 tabs en admin / 4 visibles en tutor (HIG 2–5).
- `sistema.tsx` y `comunicados.tsx` usan `Header` + `useSafeAreaInsets`, `useScrollToTop`, pull-to-refresh nativo, y no parpadean en foco (`loading && lista.length === 0`).
- `Alert.alert` nativo para todas las confirmaciones destructivas (no diálogos caseros).
- `(tutor)/_layout.tsx` maneja error y vacío con Reintentar + Cerrar sesión: el tutor nunca queda en una pantalla muerta.

## Recommended Actions

1. **[P0] `/impeccable colorize`**: tokens semánticos en auth/admin/Usuarios (contraste del CTA, banners, badges).
2. **[P1] `/impeccable adapt`**: detalle de usuario como ruta de stack + safe area del header de Usuarios.
3. **[P1] `/impeccable harden`**: guard de descarte en el modal de comunicado + `insets.bottom`.
4. **[P2] `/impeccable adapt`**: `maxWidth: 480` en auth para iPad.
5. **[P2] `/impeccable polish`**: un solo set de íconos; `DatePickerField` al tema oscuro.
6. **[P3] `/impeccable clarify`**: copy de la biometría o decisión de conservarla.
7. `/impeccable polish` final.

---

## Compartido

- **`components/shared/UsuariosScreen.tsx`** — también lo usa `(subcomision)/usuarios`. Todo lo reportado acá (contraste del header/botones/badges, ✕ sin label, errores de function tragados, lista vacía falsa, Back roto, `paddingTop: 60`) aplica a subcomisión; no reportarlo de nuevo. La fila de 8 roles es sólo admin (subcomisión ve 4).
- **`components/ui/DatePickerField.tsx`** — usado por `(entrenador)/lesiones.tsx`, `(manager)/fichajes.tsx`, `(coordinador)/calendario.tsx`, `(secretaria)/socios.tsx`, `components/eventos/EgresosPanel.tsx`. Hallazgo P2 de arriba (paleta clara, sin semántica, "Quitar" chico) cubre a todos.
- **`app/_layout.tsx` (guard)** — el `router.replace` al home en cada refresh de token afecta a **todos los roles** (auditor-ux #6). Las otras áreas no deberían reportarlo como propio; sí anotar si encuentran pantallas de stack con formularios largos (ahí sí hay pérdida de datos).
- **`hooks/useTerminos.ts`** — también lo usan `SobreScreen` y `(tutor)/sobre.tsx` para el link al PDF; el fix de errores no cambia esa API.
- **Patrón `data?.error ?? fnError?.message`** — buscarlo en el resto de `app/hooks` (ver Patterns).

## Fuera de alcance pero grave

1. **`admin-usuarios` deja que Subcomisión banee, borre o lea el mail de cualquier cuenta, incluido el admin.** `supabase/functions/admin-usuarios/index.ts:41-43` sólo verifica que el caller sea `subcomision` o `admin`; `handleDesactivar` (`:227-241`), `handleEliminar` (`:245-253`) y `handleGetUser` (`:257-265`) aceptan cualquier `userId` sin mirar el rol del destino. La UI esconde admin/socios (`useUsuarios.ts:116-125`), pero la function es pública con JWT: cualquier subcomisión puede `deleteUser` del admin o de un socio (borra en cascada su perfil y datos), o banearse a sí misma. Fix: leer `profiles.rol, roles` del `userId` destino y rechazar si es `admin`, si es el propio caller, o si su rol no está en `ROLES_POR_CALLER[callerRol]` (403).
2. **`useTerminos` deja entrar sin aceptar términos si falla la lectura de la versión activa** (`hooks/useTerminos.ts:35-45`: `!activa` → `pendiente: false`). Con un fallo de red al abrir la app, el usuario entra y nunca queda registro de aceptación de esa versión hasta la próxima apertura. Exposición legal (Ley 25.326 / términos de uso). Fix incluido en T6.

---

## Tareas sugeridas

- [ ] T1 — **Fix auth/admin contrast: primary buttons, error banners, subtitles, Usuarios header and badges** (S4 / P0). `colors.tinta` (now `#F3EFE4`) is used as a dark background: primary CTA gold on cream 1.60:1 in `app/(auth)/{login.tsx:271-288, forgot-password.tsx:177-191, reset-password.tsx:197-210, registro.tsx:269-282, registrar-mail.tsx:153-167, terminos.tsx:182-196, acceso-restringido.tsx:105-117, registro-tutor.tsx:425-440}`, `app/(tutor)/_layout.tsx:86-90`; error banners `#F3EFE4` on `#FEF8EC` 1.09:1 in `reset-password.tsx:212-225`, `registrar-mail.tsx:179-193`, `terminos.tsx:197-210`; subtitles `#7C7267` 3.99:1; `UsuariosScreen.tsx:672-676,733-735` (white on cream 1.15:1) and cream-on-gold buttons `:710,:728,:748,:763,:776`; role badges 2.84–4.09:1; `(admin)/comunicados.tsx:278-285`, `sistema.tsx:222-229`. Fix: buttons `backgroundColor: colors.oro` + text `colors.sobreOro` (10.24:1); banners `colors.card` + `colors.texto` + border `colors.rojoTexto`; subtitles `colors.textoSecundario` (8.47:1); Usuarios header/modal header `colors.fondo` + `colors.texto`; badge text `colors.texto`, role color only as border; edicionBar `colors.card`. Add the pairs to `lib/contraste.check.ts`. [OTA]
- [ ] T2 — **Tell first-time members their password is their DNI and accept DNI with dots** (S4). `app/(auth)/login.tsx:82-121` has no hint; `supabase/functions/login-dni/index.ts:40,49-53` matches `profiles.dni` (digits only) against the raw input; `admin-usuarios/index.ts:70` stores DNI with dots. Fix: `identificador.replace(/\D/g,'')` before the lookup; retry `signInWithPassword` with digits only when the password is only digits/dots/spaces; normalize DNI in `admin-usuarios` create; add helper text under the password field ("¿Es tu primera vez? Tu usuario y tu contraseña son tu DNI, sin puntos.") and label "DNI (SIN PUNTOS) O MAIL". [backend: function] + [OTA] + [decision: OK to show publicly that the initial password is the DNI? (it already is in the staff welcome mail)]
- [ ] T3 — **Distinguish login/network/server errors and surface Edge Function messages** (S3). `hooks/useLogin.ts:45-48,55-58` maps every failure to "Credenciales incorrectas"; `useLogin.ts:60-64` + `app/_layout.tsx:147-153` leave the user silently on the login when the profile read fails; `useRegistrarMail.ts:18-21` and `useUsuarios.ts:278,318,393,416` read `data?.error` from a non-2xx response (always null) so users see "Edge Function returned a non-2xx status code"; `useRegistrarMail.ts:25-34` fails silently; `useUsuarios.ts:116-125` swallows the list error; `registro.tsx:69` shows raw GoTrue English. Fix: new `lib/errorFunction.ts` (`FunctionsHttpError` → `await error.context.json()`, `FunctionsFetchError` → "No hay conexión…"), validate empty fields locally, map 401/429/5xx/offline to distinct copy, sign out + explain when the profile can't load, return 429 from `login-dni` when GoTrue rate-limits. [OTA] + [backend: function]
- [ ] T4 — **Password recovery by DNI with honest instructions** (S3). `app/(auth)/forgot-password.tsx:44-76` only accepts email (members log in by DNI; many have `@uncas.local`), success copy doesn't say what to do if nothing arrives or that the link must be opened on the phone. Fix: field "DNI o mail"; add `action: 'reset'` to `login-dni` that resolves DNI → email and calls `resetPasswordForEmail` (generic OK for synthetic emails); success copy: open on this phone, check spam, "si nunca registraste un mail, acercate a Secretaría con tu DNI". [backend: function] + [OTA]
- [ ] T5 — **Handle expired/invalid reset links and give reset-password an exit** (S3). `app/_layout.tsx:104-114` ignores `error_code=otp_expired` and sets `isPasswordRecovery` before `setSession` succeeds; `reset-password.tsx` has no way back. Fix: parse `error`/`error_code` from fragment/query → `router.replace('/(auth)/forgot-password', { aviso: 'El link venció o ya se usó. Pedí uno nuevo.' })`; set recovery only after `setSession` without error; add "Cancelar y volver al inicio" (clear flag + signOut); show `aviso` banner on forgot-password. [OTA]
- [ ] T6 — **Terms gate: don't trap or skip on transient errors; add sign-out** (S3). `hooks/useTerminos.ts:35-52` ignores query errors (fail → trapped or skipped), `:73-79` treats unique violation `23505` as failure; `app/(auth)/terminos.tsx` has no exit and the PDF button no-ops without `pdfUrl`. Fix: on read error keep `pendiente: true` with a retry message; treat `23505` as accepted; add Reintentar + "Cerrar sesión"; disable PDF button when no URL and catch `openURL`. [OTA]
- [ ] T7 — **Root guard: only redirect when the user is in the wrong route group** (S3). `app/_layout.tsx:138,166-205` re-runs on every `TOKEN_REFRESHED` (`session?.access_token` dep) and `router.replace`s to the role home, yanking users out of whatever they were doing (all roles). Fix: `useSegments()`; skip `replace` when `segments[0]` already equals the destination group (or the destination auth screen); add `segments[0]` to deps; after `actualizar-mi-mail` succeeds call `supabase.auth.refreshSession()` so `useMailSintetico` stops re-gating. [OTA]
- [ ] T8 — **Autofill/password-manager hints, input labels and keyboard chaining on auth** (S3). Zero `textContentType`/`autoComplete`/`accessibilityLabel`/`returnKeyType` in `login.tsx:84-108`, `reset-password.tsx:53-87`, `registro.tsx:107-157`, `registro-tutor.tsx:160-296`, `registrar-mail.tsx:54-63`, `forgot-password.tsx:65-75`; eye toggles unnamed. Fix: `username`/`password` on login, `newPassword`/`new-password` + `passwordRules="minlength: 8;"` on new passwords, `emailAddress`/`email`, `name`, `birthdate-full`; `accessibilityLabel` = visible label on every input; eye `accessibilityLabel` "Mostrar/Ocultar contraseña"; `returnKeyType="next"` → focus next, `"go"` → submit; visible label on registrar-mail. [OTA]
- [ ] T9 — **Add a "create family/guardian account" entry point on the login** (S3). The only path to `/(auth)/registro-tutor` is `acceso-restringido.tsx:19-31`, which requires logging in as the minor. Fix: link under "Olvidé mi contraseña" in `login.tsx` → `/(auth)/registro-tutor` (already works without session). [OTA]
- [ ] T10 — **Wrap the admin role selector** (S3). `UsuariosScreen.tsx:760-761` puts 8 `flex: 1` buttons in one row (~33 pt each, labels unreadable) for `ROLES_CREABLES_ADMIN` (`:326-335`). Fix: `flexWrap: 'wrap'`, `flexBasis: '30%'`, `flexGrow: 1`, `minHeight: 44`, `accessibilityRole="radio"` + `accessibilityState={{ checked }}`. [OTA]
- [ ] T11 — **Name icon-only buttons and bring targets to 44 pt in admin and registro-tutor** (S3). `comunicados.tsx:141-143` (X 20 pt), `:77-79,319` (trash 30 pt), `:251-253` (FAB); `UsuariosScreen.tsx:347-349` (✕ text), `:180-182`; `registro-tutor.tsx:414-421` (chips ~34 pt); text links in `login.tsx:338-341`, `registro-tutor.tsx:463`, `registrar-mail.tsx:168-171`. Fix: `padding: 12`/`15`, Feather icons, `accessibilityLabel` ("Cerrar sin publicar", `Eliminar "<título>"`, "Nuevo comunicado", "Cerrar"), `accessibilityRole="radio"` + state on chips, `paddingVertical: 12` on text links. [OTA]
- [ ] T12 — **Restore system Back on the user detail view** (P1). `UsuariosScreen.tsx:63-79,180-182` uses local `paso` state; Android Back leaves the screen. Fix: move detail to a stack route `(admin|subcomision)/usuarios/[id]` or add a focused `BackHandler` that calls `hook.volverALista()`. [OTA]
- [ ] T13 — **Guard against discarding a typed comunicado and respect the bottom inset** (P1). `comunicados.tsx:107-110,131` clears on X/Back without confirmation; `:335` ignores `insets.bottom`. Fix: confirm "¿Descartar el comunicado?" when title/body not empty; `paddingBottom: insets.bottom + 24`. [OTA]
- [ ] T14 — **Use safe-area insets (or the shared Header) in UsuariosScreen** (P1). `UsuariosScreen.tsx:672` hard-codes `paddingTop: 60`. Fix: `useSafeAreaInsets().top + 16`, or `<Header />` + `edicionBar` like `comunicados.tsx`/`sistema.tsx`. [OTA]
- [ ] T15 — **Inline per-field validation on registro-tutor, reset and new-user forms** (S2). `registro-tutor.tsx:92-98,307-311`, `useResetPassword.ts:14-21`, `registro.tsx:60-63`, `useUsuarios.ts:297-301` show one error at a time in a bottom banner. Fix: `tocados` + `errores` map, validate on blur, error text under each field (`colors.rojoTexto`), mark all on submit. [OTA]
- [ ] T16 — **Block Subcomisión from banning/deleting/reading admins, self or non-staff via admin-usuarios** (out of scope, grave). `supabase/functions/admin-usuarios/index.ts:227-265` act on any `userId`. Fix: load target `profiles.rol, roles`; 403 if target is admin, is the caller, or its role isn't in `ROLES_POR_CALLER[callerRol]`. [backend: function]
- [ ] T17 — **Verify GoTrue sign-in rate limit behind login-dni before launch** (unverified, potential S4). All `signInWithPassword` calls originate from the Edge Function IP; `sign_in_sign_ups` is per IP (30/5 min locally, `supabase/config.toml:202`). Fix: check production Auth → Rate Limits and load-test 35 logins in 5 min on staging; if it trips, raise the limit or forward client IP / move to a per-DNI limiter in the function. [decision: run the check now or accept the risk for the WhatsApp launch blast?]
