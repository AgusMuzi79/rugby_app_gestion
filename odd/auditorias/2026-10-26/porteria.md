# Auditoría — porteria (Gimnasio / Canchero / Buffet + Cliente Gimnasio)

Repo `/home/claude/agusmuzi79/rugby_app_gestion` @ `5a0ce4c` (read-only). Pasada única, un evaluador (cobertura heurística real ~35–50 %: no reemplaza probarlo en la puerta con gente en fila).

**Alcance leído (≈4.300 líneas):**

| Archivo | Líneas |
|---|---|
| `app/app/(porteria)/scanner.tsx` | 613 (completo) |
| `app/app/(porteria)/_layout.tsx`, `sobre.tsx`, `promos.tsx` | 31 + 1 + 275 |
| `app/app/(cliente-gimnasio)/_layout.tsx`, `carnet.tsx`, `turnos.tsx`, `sobre.tsx` | 25 + 199 + 3 + 1 |
| `app/components/shared/TurnosGimnasio.tsx` | 289 |
| `app/hooks/useScanner.ts`, `useCarnet.ts`, `usePromosBuffet.ts`, `useRefreshOnFocus.ts` | 144 + 240 + 124 + 22 |
| `app/constants/theme.ts`, `tabOptions.ts` | 47 + 25 |
| `supabase/functions/socios-qr/index.ts`, `_shared/totp.ts` | 680 + 71 |
| `supabase/migrations/20261008000000_gimnasio_lector_turno.sql` (mensajes del turnero), RLS de `20260910000002_rol_buffet_y_noticias.sql`, `importar-socios/index.ts` (bajas, l. 295–495) | parcial |
| `web/app/(porteria)/layout.tsx`, `web/components/SidebarLector.tsx` | 56 + 76 |
| `web/app/(porteria)/porteria/accesos/page.tsx` | 362 (completo) |
| `web/app/(porteria)/porteria/turnos/page.tsx` | 1–200 y 1040–1205 leídos; 200–1040 recorrido con grep (labels, confirm, aria, onClick) |

No leí `gimnasio-turnos/index.ts` ni `gimnasio-turnos-fijos` en detalle (el turnero del socio ya se auditó en socio; acá sólo cuenta lo que devuelve `gimnasio_turno_actual` al lector, que sí leí).

Contexto que cambia la severidad: el rol `porteria` (label "Gimnasio") es **autoservicio con cámara frontal y sin nadie mirando** — según el propio código, "el escaneo ES el control de acceso" (`socios-qr/index.ts:264-267`). Canchero/Buffet son atendidos (cámara trasera).

---

# Pasada 1 — auditor-ux

## Veredicto

Audité el escáner (app), el carnet de Cliente Gimnasio, las promos de Buffet, el panel web de Gimnasio y la Edge Function `socios-qr`, desde código. **No sale así.** El problema de fondo no es visual: la pantalla de resultado no responde "¿entra o no entra?". Tiene dos estados para tres o cuatro resultados reales. Un socio dado de baja sale en verde "AL DÍA". Sin red, el escáner se queda colgado y el carnet del socio desaparece. El camino feliz está bien resuelto (tablet, foto grande, sonido); lo que falla son los bordes, que en la puerta son el día a día.

**S4:** 4 · **S3:** 8 · **S2:** 0 · **S1:** 0 (dejé afuera 3 S2: auto-reset fijo de 8 s, DNI sin normalizar, borrador de promo que se descarta sin confirmar; los dos primeros pasan a la pasada 2)

## Hallazgos

### S4 — El resultado no dice si la persona entra: "moroso pero pasa" se ve, suena y se rotula igual que "no pasa"

**Dónde:** `app/app/(porteria)/scanner.tsx:75-78` (sonido), `:160-161` (cálculo de `moroso`), `:177-185` (banda), `:233-241` (motivo)
**Rompe:** Nielsen #1 Visibilidad del estado · Nielsen #2 Relación con el mundo real · Nielsen #4 Consistencia · WCAG 2.2 SC 1.4.1 Uso del color
**Por qué:** hay cuatro resultados reales y la UI los aplasta en dos:

| Resultado real | Banda hoy | Texto hoy | Sonido hoy | ¿Entra? |
|---|---|---|---|---|
| Al día, con reserva | verde ✓ | AL DÍA | ok | Sí |
| Moroso (semáforo rojo) | **rojo ⚠** | MOROSO | **alerta** | **Sí** (el comentario de la l. 176 dice "acá no se bloquea el acceso a nadie") |
| Sin servicio Gimnasio / bloqueado por turnero / DNI no encontrado | **rojo ⚠** | **"QR NO VÁLIDO"** | **alerta** | No |
| Error de red / sesión vencida | **rojo ⚠** | **"QR NO VÁLIDO"** + texto crudo en inglés | **alerta** | No se sabe |

Moroso y denegado comparten color, ícono (`alert-triangle`) y sonido, así que el sonido "para no tener que mirar la pantalla" (l. 71-72) justo en el caso ambiguo obliga a mirarla. Un socio sin el servicio contratado lee "QR NO VÁLIDO" cuando su QR era válido, y va a pensar que la app anda mal. En modo atendido (Canchero), el encargado ve rojo y frena a un moroso que tenía que pasar.

**Fix:** un veredicto explícito con cuatro estados, cada uno con color, ícono, título y sonido propios. El título dice la acción, no el dato:

```tsx
// scanner.tsx — reemplaza estadoVisual/moroso en el render y en el useEffect del sonido
type Veredicto = 'pasa' | 'pasa_aviso' | 'no_pasa' | 'sin_conexion'

function veredicto(r: ScanResult): Veredicto {
  if (r.errorRed) return 'sin_conexion'                      // ver hallazgo S4 #3
  if (!r.valido) return 'no_pasa'
  const e = estadoVisual(r)
  if (e === 'inactivo') return 'no_pasa'                      // ver S4 #2
  if (e === 'moroso' || r.turno?.estado === 'sin_reserva') return 'pasa_aviso'
  return 'pasa'
}

const VEREDICTO_UI = {
  pasa:         { bg: colors.exito,           fg: colors.blanco,  icon: 'check-circle', titulo: 'PUEDE PASAR' },
  pasa_aviso:   { bg: colors.estadoPendiente, fg: colors.sobreOro, icon: 'alert-circle', titulo: 'PASA · CON AVISO' },
  no_pasa:      { bg: colors.rojoUrgente,     fg: colors.blanco,  icon: 'x-octagon',    titulo: 'NO PUEDE PASAR' },
  sin_conexion: { bg: colors.card,            fg: colors.texto,   icon: 'wifi-off',     titulo: 'SIN CONEXIÓN' },
} as const
// blanco/#1A7A1A 5.46 · #15110A/#E67E22 6.60 · blanco/#CC4127 4.82 · texto/card ok
```

- Debajo del título, el motivo en una línea: "Cuota atrasada: avisale que pase por Secretaría", "No tiene Gimnasio contratado", "No reservó este horario", "No se pudo verificar: sin conexión".
- Tres sonidos: `ok.wav`, `aviso.wav` (nuevo, distinto, sin alarma), `alerta.wav` sólo para `no_pasa`. Un asset nuevo entra por OTA.
- El rótulo "QR NO VÁLIDO" queda sólo cuando el server devuelve `Código QR inválido o expirado` / `Formato de QR no reconocido`.

---

### S4 — Un socio dado de baja (`inactivo`) sale en verde "AL DÍA"

**Dónde:** `supabase/functions/socios-qr/index.ts:364-434` (`handleValidate`) y `:442-489` (`handleValidateDni`): ninguno mira `socio.estado`. `scanner.tsx:15-18` + `:161` + `:184`: `estadoVisual` devuelve `'inactivo'`, que no es `'moroso'`, así que la banda queda verde con "AL DÍA" y abajo dice "ESTADO: INACTIVO".
**Rompe:** Nielsen #2 · Nielsen #5 Prevención de errores · la regla de negocio "la portería ve nombre y estado" (que acá muestra un estado contradictorio)
**Por qué:** `importar-socios/index.ts:477` pasa a `inactivo` a cada baja del padrón NUVIX y le banea el usuario, pero `validate-dni` igual lo encuentra. En Canchero/Buffet no hay gate de servicio, así que entra en verde. En Gimnasio pasa si le quedó una fila en `socio_servicios` (el importador de socios no la borra). La pantalla se contradice a sí misma: el título dice "al día" y la fila dice "inactivo".
**Fix (server, fuente única):** en ambos handlers, apenas se obtiene `row`:

```ts
if (row.estado === 'inactivo') {
  return jsonOk({ valido: false, motivo: 'Socio dado de baja. Consultá en Secretaría.' })
}
```

En la app, `veredicto()` (S4 #1) trata `inactivo` como `no_pasa`, por si una function vieja sigue deployada.

---

### S4 — Sin red, el escáner se queda en "Verificando carnet…" sin salida, y después culpa al QR

**Dónde:** `app/hooks/useScanner.ts:68-88` y `:97-116`: `invoke` sin timeout, y `res.error.message` va crudo a `motivo`. `scanner.tsx:169-173`: el estado `validando` no tiene ningún botón. `scanner.tsx:82-90`: el auto-reset sólo arranca cuando hay `result`.
**Rompe:** Nielsen #1 · Nielsen #3 Control y libertad (no hay salida) · Nielsen #9 (el mensaje no dice qué pasó) · club-app-context: "Portería necesita funcionar con conectividad limitada"
**Por qué:** con la red caída o lenta, el spinner queda colgado hasta que el fetch del sistema operativo se rinde (decenas de segundos) y no hay forma de cancelar. Después aparece la banda roja "QR NO VÁLIDO" con `Failed to send a request to the Edge Function` o `Edge Function returned a non-2xx status code` (sesión vencida: 401 de `socios-qr/index.ts:59-62`). La fila espera y el socio cree que su carnet está mal. No hay `NetInfo` en el escáner, aunque la dependencia ya está (`package.json:20`).
**Fix:**

```ts
// useScanner.ts
const TIMEOUT_MS = 6000
async function invocarConTimeout(body: object) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await supabase.functions.invoke('socios-qr', { body, signal: ctrl.signal })
  } catch (e) {
    return { data: null, error: e as Error }
  } finally { clearTimeout(t) }
}
// y al armar el resultado:
if (res.error) {
  const status = (res.error as any)?.context?.status
  sr = status === 401
    ? { valido: false, motivo: 'La sesión de esta tablet venció. Pedí que vuelvan a iniciar sesión.', errorRed: true }
    : { valido: false, motivo: 'No se pudo verificar: sin conexión. Probá de nuevo.', errorRed: true }
}
```

Más un botón "CANCELAR" en el bloque `validando` (`scanner.tsx:170-173`) y un banner fijo "SIN CONEXIÓN" en la vista de cámara con `NetInfo.useNetInfo()` (`isInternetReachable === false`). **Qué hacer cuando no hay red** (¿dejar pasar con registro diferido? ¿cachear localmente quién tiene Gimnasio?) es una decisión de negocio: ver tarea [decision].

---

### S4 — Sin red, el carnet del socio desaparece al minuto siguiente

**Dónde:** `app/hooks/useCarnet.ts:104-212` (cada cambio de paso TOTP, l. 226-232, re-consulta `socios`, `profiles` y `jugadores`). Con un error de red, l. 154-158 hace `setError('No se pudo cargar el carnet. Revisá tu conexión.')`, y `app/app/(cliente-gimnasio)/carnet.tsx:94-97` (igual que en el carnet de socio) pinta el error **en lugar** del QR.
**Rompe:** regla de negocio "el carnet QR debe poder validarse sin conexión en el dispositivo del socio" (club-app-context, restricción 1) · Nielsen #1
**Por qué:** el secreto TOTP ya está en SecureStore (l. 91-93), así que el código se puede generar sin red. Aun así, el hook trata cada minuto como una carga nueva desde la DB. En un sótano o vestuario sin señal, el socio llega a la puerta y no tiene QR que mostrar.
**Fix:** separar la carga de datos (una vez, más refresh) de la regeneración del código (local):

```ts
// useCarnet.ts — en el setInterval, si ya hay data, sólo regenerar el código
const timer = setInterval(() => {
  const nowStep = Math.floor(Date.now() / 1000 / TOTP_STEP)
  if (nowStep === lastStepRef.current) return
  lastStepRef.current = nowStep
  if (secretRef.current && dataRef.current) {
    const code = generateTOTP(secretRef.current)
    setData(d => d && { ...d, code, qrContent: `${d.numero_socio}:${code}` })
    return
  }
  buildCarnet()
}, 1000)
// y en buildCarnet: si falla la red y ya hay data previa (o un snapshot en AsyncStorage), no setError
```

Persistir el último `CarnetData` (sin el código) en AsyncStorage para un arranque en frío sin red, y mostrar "Sin conexión · estado al <hora>" debajo del badge. (Compartido con el carnet de socio y de tutor.)

---

### S3 — El "código manual de 6 dígitos" que el carnet manda dictar no se puede cargar en ningún lado

**Dónde:** `app/app/(cliente-gimnasio)/carnet.tsx:124-133` (y `app/app/(socio)/carnet.tsx:354-366`): "Si la cámara no puede leer tu QR, dictá este código". `scanner.tsx:343-378`: la única alternativa es **DNI**, y no hay ningún input para Nº de socio + código.
**Rompe:** Nielsen #4 Consistencia · Nielsen #6 Reconocimiento · Nielsen #2 ("CÓDIGO DE HOY" cuando el código cambia cada 60 s, `_shared/totp.ts:5`)
**Por qué:** el plan B que le prometemos al socio no existe del otro lado. El encargado escucha seis números y no tiene dónde ponerlos, así que termina en el camino de DNI, que no tiene segundo factor (ver "Fuera de alcance"). Además, "de hoy" le hace creer al socio que puede anotarlo a la mañana.
**Fix:** agregar a `scanner.tsx` un modo "Ingresar código" (Nº de socio + 6 dígitos) que llama al mismo `handleQR(`${numero}:${codigo}`)`, con validación TOTP real. En el carnet, cambiar `CÓDIGO DE HOY` por `CÓDIGO MANUAL · CAMBIA CADA MINUTO` y el texto por "Si la cámara no lee tu QR, decí tu Nº de socio y este código." En Gimnasio (autoservicio) este modo debería **reemplazar** el de DNI (ver tarea [decision]).

---

### S3 — Un mismo QR puede disparar varias validaciones (y varios registros de acceso)

**Dónde:** `app/hooks/useScanner.ts:53-66`: el candado es estado de React (`scanning`, `validando`), que se lee desde la closure del render anterior. `scanner.tsx:392`: `onBarcodeScanned` siempre está conectado.
**Rompe:** Nielsen #1 (doble envío) · integridad de datos
**Por qué:** `expo-camera` emite `onBarcodeScanned` varias veces por segundo mientras el QR está en cuadro. Hasta que React re-renderiza con `validando=true`, cada evento ve `scanning=true` y dispara otro `invoke`. Cada uno inserta una fila en `accesos` (`socios-qr/index.ts:430`) y vuelve a sonar.
**Fix:**

```ts
// useScanner.ts
const lockRef = useRef(false)
const handleQR = useCallback(async (raw: string) => {
  if (lockRef.current) return
  lockRef.current = true
  /* ...igual que hoy... */
}, [])
const reset = useCallback(() => { lockRef.current = false; setResult(null); setScanning(true) }, [])
// scanner.tsx:392
onBarcodeScanned={scanning ? ({ data }) => handleQR(data) : undefined}
```

---

### S3 — Cada escaneo encadena ~8 viajes secuenciales antes de mostrar el resultado

**Dónde:** `socios-qr/index.ts:61` (`auth.getUser`), `:64-68` (profiles), `:379-383` (socios), `:390-394` (secret), `:411` (servicio), `:418` (RPC turno), `:430` (`await registrarAcceso`, aunque el comentario de la l. 253 dice "fire & forget") y después `useScanner.ts:79-81` (segundo viaje del cliente para `createSignedUrl`). Al volver, `scanner.tsx:388` remonta la `CameraView` (se desmonta en cada resultado).
**Rompe:** Umbral de Doherty (400 ms) · Nielsen #1
**Por qué:** con gente en fila, cada await suma latencia de red entre la Edge Function y la DB, y el resultado espera hasta que el `INSERT` del log termina. No medí milisegundos (ver "No pude verificar"), pero la cadena está en el código.
**Fix:** (1) `EdgeRuntime.waitUntil(registrarAcceso(...))` en vez de `await` (l. 413, 420, 430, 468, 475, 485). (2) `Promise.all([tieneServicioGimnasio(...), obtenerTurno(...)])`, y si no hay servicio se descarta el turno. (3) Generar la signed URL de la foto dentro de la function y devolver `foto_url` (sacar `useScanner.ts:78-83` y `:106-111`). (4) Mostrar primero la banda y el nombre, y dejar que la foto cargue después (`expo-image` con placeholder).

---

### S3 — Contrastes rotos: la lección #1 (tinta invertida) sigue viva en Cliente Gimnasio y Promos, y el rojo de texto no llega

**Dónde / medido con `contraste.py`:** ver la tabla en "Tareas sugeridas". Resumen:
- `app/app/(cliente-gimnasio)/carnet.tsx:149-152`: "SECCIÓN · GIMNASIO" en `oro` sobre `colors.tinta` (ahora crema): **1.60:1**. En el carnet de socio ya se arregló con `oroSobreClaro`.
- `carnet.tsx:115-117` + `:185-188`: badge "AL DÍA" en blanco sobre `#2ECC71` da **2.10:1**, y "PENDIENTE" en blanco sobre `#E67E22` da **2.85:1**. En el carnet de socio ya está `estadoTextoColor()`.
- `app/app/(porteria)/promos.tsx:235-236` ("+ Nueva") y `:272-274` ("PUBLICAR PROMOCIÓN"): `oro` sobre `TEXTO` crema, **1.60:1**.
- `scanner.tsx:216` ("MOROSO", 16 px), `:237` (motivo bloqueado, 18 px), `:282` y `:317` (invitado, 15 px): `rojoUrgente` sobre `papel`, **3.90:1** (hace falta 4.5).

**Rompe:** WCAG 2.2 SC 1.4.3 Contraste (Mínimo), nivel AA
**Fix:** `oro` → `colors.oroSobreClaro` sobre crema. Badge con `color: estado === 'activo' || estado === 'pendiente' ? colors.sobreOro : colors.blanco` (copiar `estadoTextoColor` de `(socio)/carnet.tsx:57-59`). Botones de promos: `backgroundColor: colors.oro`, `color: colors.sobreOro` (10.24:1). Texto rojo sobre oscuro: `colors.rojoTexto` (5.57:1).

---

### S3 — El escáner no tiene semántica accesible y el resultado no se anuncia; hay links por debajo de 24 pt

**Dónde:** `scanner.tsx`: ningún `accessibilityRole`, `accessibilityLabel` ni `accessibilityLiveRegion` en todo el archivo (l. 146, 244, 286, 322, 333, 368, 372, 414, 420). Targets: "Volver a escanear QR" (`:333-335`, `:372-374`) es texto de 13 px sin padding (~17 pt de alto, **faltan ~7 pt para el mínimo AA de 24**). Los chips "¿No tenés el carnet? Ingresar DNI" / "Registrar invitado" (`:501-504`) miden 6+6 de padding + ~17 de línea ≈ **29 pt** (pasa AA, no llega a los 44 de HIG). `promos.tsx:100-102` ("Cancelar" del modal, sin padding, ~20 pt) y `:130-132` ("QUITAR", ~15 pt): por debajo de 24.
**Rompe:** WCAG 2.2 SC 4.1.2 Nombre, función, valor · SC 4.1.3 Mensajes de estado · SC 2.5.8 Tamaño del objetivo (mínimo)
**Fix:**

```tsx
// banda de resultado
<View accessible accessibilityRole="alert" accessibilityLiveRegion="assertive"
      accessibilityLabel={`${ui.titulo}. ${result.nombre ?? ''}. ${motivo ?? ''}`}>
// + en el useEffect del resultado: AccessibilityInfo.announceForAccessibility(ui.titulo)
// links
<TouchableOpacity accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                  style={{ minHeight: 44, justifyContent: 'center' }} ...>
// chips: paddingVertical: 12 → ~41 pt; con minHeight: 44 llega a HIG
```

---

### S3 — Promos de Buffet: error de red = "Todavía no publicaste ninguna promoción", y la lista entera parpadea en cada foco

**Dónde:** `app/hooks/usePromosBuffet.ts:39-54`: `const { data } = await ...` sin mirar `error`, y `setLoading(true)` en cada fetch. `:57`: `useRefreshOnFocus(fetchPromos)`. `promos.tsx:177-183`: `if (loading) return <spinner/>` reemplaza la pantalla.
**Rompe:** Nielsen #1 · Nielsen #9 (lecciones #2 y #3 del brief)
**Por qué:** sin red, el empty state le miente a Buffet ("no publicaste ninguna"), que vuelve a publicar y duplica la promo y el push a todo el club. Cada vez que vuelve a la pestaña pierde el scroll.
**Fix:** `if (error) { setError('No se pudieron cargar las promociones.'); setLoading(false); return }` + bloque de error con "REINTENTAR" (mismo patrón que `TurnosGimnasio.tsx:187-193`); spinner de pantalla completa sólo si `loading && promos.length === 0`; el refetch de foco va por `refreshing`.

---

### S3 — Panel web de Accesos: cuenta los intentos denegados como "INGRESOS" y no distingue "sin reserva pero pasó" de "rechazado"

**Dónde:** `socios-qr/index.ts:413` y `:420` registran en `accesos` los escaneos **denegados** (sin servicio, bloqueado por turnero). `:430` registra con la misma marca `sin_reserva=true` a los que **pasaron** en modo informativo. `web/app/(porteria)/porteria/accesos/page.tsx:297` ("N INGRESOS"), `:321-330` (mismos tags) y el CSV (`:132-142`) los suman a todos.
**Rompe:** Nielsen #2 · lección #8 del brief (dato de negocio incorrecto)
**Por qué:** el que lee el panel cree que entró gente que fue rechazada, y con el modo bloqueante no tiene forma de saber quién quedó afuera.
**Fix:** columna `accesos.denegado boolean default false` (migración) que se escribe en las l. 413/420/468/475. En el panel: contar `INGRESOS` = `!denegado`, mostrar aparte "N RECHAZADOS" y el tag "RECHAZADO · SIN RESERVA" o "RECHAZADO · SIN SERVICIO". Verificar que el proceso de faltas (`faltas_activas`) no cuente un rechazo como asistencia.

---

### S3 — Panel web: texto de ayuda bajo AA, labels sin asociar y layout que no reflowa

**Dónde:** `text-tinta/40` (≈ `#6E6A61` sobre `#15110A` = **3.49:1**) en `accesos/page.tsx:281, 288, 296` y `turnos/page.tsx:157` (`Cargando`), `:1105`, `:1117`, `:1134`, `:1150`. Los `<label className={LABEL}>` sin `htmlFor` ni input anidado: `accesos/page.tsx:157, 167, 206, 237` y `turnos/page.tsx:198, 359-377, 943-962, 982-986, 1099, 1113, 1128`. Layout: `web/app/(porteria)/layout.tsx:53` `ml-56` fijo + `SidebarLector.tsx:26` `fixed w-56`, sin breakpoint.
**Rompe:** WCAG 2.2 SC 1.4.3 · SC 1.3.1 / 4.1.2 (el label no nombra al campo) · SC 1.4.10 Reflow (a 320 px quedan ~96 px de contenido)
**Fix:** `text-tinta/40` → `text-tinta/60` (≈ `#9D998F`, pasar por `contraste.py`; `tinta/50` = 4.78 ya pasa). `<label htmlFor="acc-desde">` + `id` en cada input (o envolver el input en el label). Sidebar: `hidden md:flex` + top bar con menú en mobile, y `md:ml-56` en el `<main>`.

## Lo que está bien

- **Tablet como caso de primera clase** (`scanner.tsx:38-40`, `:554-612`): banda de 34 px, foto de 240×288 y nombre de 44 px a partir de 600 pt. Es la decisión correcta para un mostrador; no tocarla al rehacer la banda.
- **Sonido diferenciado** (`:68-79`): la idea es buena, sólo le falta un tercer tono. No sacarlo.
- **El turnero es fail-open** (`socios-qr/index.ts:322-362`): un bug del turnero nunca deja a nadie afuera. Bien pensado para la puerta.
- **Invitados**: el server rechaza DNIs de socios (`:547-549`) y no inserta si no pudo verificar (`:541-545`); `veces=null` no muestra un 0 falso (`scanner.tsx:277-279`). Prevención de errores correcta (Nielsen #5).
- **Permiso de cámara bloqueado → "ABRIR AJUSTES"** (`scanner.tsx:131-151`): resuelve el caso en que iOS/Android ya no muestran el diálogo.
- `TurnosGimnasio.tsx`: targets de 44 pt, confirmación en acciones destructivas, error con "REINTENTAR" y spinner sólo con la lista vacía (no repite la lección #3).
- Web Accesos: filtros visibles con contador "N DE M" (`:297`), descarte de respuestas viejas (`:99-106`), rechazo explícito de una respuesta que no cubre el rango (`:110-114`). Nielsen #1 bien resuelto.

## No pude verificar

- **Latencia real** de punta a punta (escaneo → banda). Hace falta medirla con un dispositivo en el gimnasio (`console.time` alrededor de `handleQR` y logs de la function).
- **Lectura con poca luz / reflejo** de la cámara frontal de la tablet. El código no prende la linterna (`enableTorch`) ni sube el brillo del carnet del socio. Se valida en el lugar real.
- **Si la tablet se apaga sola**: no hay `useKeepAwake` en el escáner; depende de la configuración del sistema operativo de esa tablet.
- **Si el teclado `number-pad` tapa el botón CONSULTAR / REGISTRAR en iPhone** (no hay `KeyboardAvoidingView` y el teclado numérico de iOS no tiene tecla Enter): ver P1 de la pasada 2. Hace falta un screenshot en un iPhone chico.
- **Dependientes / menores**: el carnet del menor que ve el titular o tutor usa el mismo `numero_socio:code`, así que el escáner lo trata como a cualquier socio, y la variante "Gimnasio Menor" pasa el gate por `ilike '%gimnasio%'` (`socios-qr/index.ts:288`). No hay ninguna marca de "MENOR" en el resultado; no sé si el club necesita que el encargado la vea (pregunta para Agus).
- VoiceOver/TalkBack reales, Dynamic Type grande y los contrastes del chip sobre la imagen de la cámara (`rgba(0,0,0,.45)` encima de video: el ratio depende del fondo).

---

# Pasada 2 — impeccable audit

Detector web: `impeccable detect --json` sobre los 4 archivos web devolvió `[]` (sin hallazgos automáticos). Mobile: auditado desde el código contra `audit.native.md`, `ios.md` y `android.md`.

| # | Dimensión | Puntaje | Hallazgo clave |
|---|---|---|---|
| 1 | Accesibilidad | 1 | Escáner sin roles/labels/live region; contrastes 1.60–3.90 (= auditor-ux #8, #9, #12) |
| 2 | Performance | 2 | 8 viajes secuenciales por escaneo + remontar la cámara (= auditor-ux #7) |
| 3 | Apariencia y theming | 2 | Tokens semánticos existen pero `scanner.tsx`, `promos.tsx`, `carnet.tsx` (cliente) y `tabOptions.ts` siguen con hex sueltos (`MUTED`, `#1A7A1A`, `#5DBB63`, `#0E0E0E`, `#E8B53C`) |
| 4 | Conformidad de plataforma | 3 | Tabs nativas con label, insets respetados en el escáner, Alert/Modal del sistema; falta háptico y el modal de promos no usa insets |
| 5 | Adaptividad | 2 | Tablet bien resuelta en el resultado, pero el formulario de DNI/invitado no esquiva el teclado y la orientación está bloqueada en portrait |
| **Total** | | **10/20** | **Aceptable (hay trabajo importante)** |

### Veredicto de conformidad

Pasa como app nativa: tabs del sistema con etiqueta, `Alert` nativo, `Modal pageSheet`, `Linking.openSettings()`. No parece un port web. Lo que falla es el **hardening** del escáner como herramienta de alta frecuencia (teclado, háptico, keep-awake, timeouts), no la forma.

### Hallazgos

- **(= auditor-ux #1, #2, #3, #4)** Resultado ambiguo, inactivo en verde, sin red, carnet offline.
- **(= auditor-ux #6, #7)** Doble disparo y latencia.

**[P1] El formulario de DNI / invitado no esquiva el teclado y el `number-pad` de iOS no tiene Enter**
- **Dónde:** `scanner.tsx:269-338` y `:351-375` (sin `KeyboardAvoidingView` ni `ScrollView`); `:300` y `:360` `keyboardType="number-pad"` con `onSubmitEditing` (l. 365), que en iOS nunca se dispara.
- **Categoría:** Adaptividad · **Impacto:** en un iPhone o iPad apaisado, el botón CONSULTAR puede quedar bajo el teclado y no hay tecla para enviar, así que la persona en la fila se traba. · **Guideline:** iOS "content never hides behind the keyboard"; Android IME insets.
- **Recomendación:** envolver `dniContainer` en `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>` + `ScrollView keyboardShouldPersistTaps="handled"`; consultar solo al llegar a 7–8 dígitos (`onChangeText` → `if (/^\d{7,8}$/.test(v)) consultarDni(v)`) o `returnKeyType="done"` con `keyboardType="numeric"`. · `/impeccable harden`

**[P1] Sin háptico en el resultado (Canchero/Buffet, que tienen el teléfono en la mano)**
- **Dónde:** `scanner.tsx:73-79` (sólo audio); `expo-haptics` no está en `app/package.json`.
- **Categoría:** Conformidad · **Impacto:** en un ambiente ruidoso (cancha, buffet) el sonido no se escucha; la vibración es el canal que no depende ni de la vista ni del oído. · **Guideline:** HIG Playing haptics / Material haptic feedback para confirmación y error.
- **Recomendación:** `npx expo install expo-haptics` (**build nativo**) y en el efecto del resultado: `pasa` → `notificationAsync(Success)`, `pasa_aviso` → `Warning`, `no_pasa` → `Error`. Omitir en `porteria` (tablet apoyada). · `/impeccable harden`

**[P2] Auto-reset fijo de 8 s: en autoservicio el siguiente de la fila espera o tiene que tocar**
- **Dónde:** `scanner.tsx:31`, `:82-90`; la cámara se desmonta mientras se ve el resultado (`:159-255`).
- **Categoría:** Performance (percibida) · **Impacto:** con 5 personas en fila, hasta 40 s de espera muerta solo por timers, y además la cámara tiene que volver a arrancar.
- **Recomendación:** tiempo por veredicto (`pasa` 2.5 s, `pasa_aviso` 5 s, `no_pasa` 8 s) y, en `porteria`, dejar la `CameraView` montada debajo del resultado para que un QR nuevo reemplace el resultado sin tocar nada. · `/impeccable optimize`

**[P2] DNI sin normalizar (ley de Postel)**
- **Dónde:** `scanner.tsx:111-116` → `socios-qr/index.ts:449-455` (`.eq('dni', dni)` exacto); `scanner.tsx:114` limpia el input antes de la respuesta, así que si da "no encontrado" hay que volver a tipear todo.
- **Recomendación:** `dni.replace(/\D/g, '')` en cliente y server, y limpiar el input recién después de un resultado `valido`. · `/impeccable harden`

**[P2] Pantalla de escaneo sin keep-awake y orientación bloqueada**
- **Dónde:** `app/app.config.js:9` `orientation: 'portrait'` (global); `scanner.tsx` sin `useKeepAwake`.
- **Impacto:** una tablet de mostrador apaisada queda de costado; la pantalla se apaga entre clientes si el sistema operativo no está configurado.
- **Recomendación:** `useKeepAwake()` de `expo-keep-awake` sólo en `scanner.tsx` cuando `esAutoservicio` (verificar si requiere instalarlo con `npx expo install`; si cambia lo nativo, es build). La orientación es una decisión de cómo está montada la tablet. · `/impeccable adapt`

**[P2] Modal de promos con `SafeAreaView` de RN y footer sin `insets.bottom`**
- **Dónde:** `promos.tsx:13` importa `SafeAreaView` de `react-native` (no hace nada en Android); `:261` `paddingBottom: 16` fijo (lección #7).
- **Recomendación:** `useSafeAreaInsets()` → `paddingBottom: 16 + insets.bottom`; `SafeAreaView` de `react-native-safe-area-context`. · `/impeccable adapt`

**[P3] Hex sueltos en lugar de tokens**
- **Dónde:** `scanner.tsx:23, 177, 436, 444, 569, 573` (`#5DBB63`, `#1A7A1A`, `#8E8574`, `#2C2418`, `#333333`); `promos.tsx:24-28`; `(cliente-gimnasio)/carnet.tsx:30-33, 141, 159-174`; `constants/tabOptions.ts:5, 18` (`#0E0E0E`, `#E8B53C`, que no son `papel` ni `oro`).
- **Recomendación:** `colors.exito`, `colors.muted`, `colors.borde`, `colors.fondo`, `colors.card`, `colors.estadoActivo`. Es lo que hace que la lección #1 se repita. · `/impeccable colorize`

### Patrones sistémicos

- El arreglo de tokens del 13/10 se hizo **pantalla por pantalla en socio**, y las copias (`(cliente-gimnasio)/carnet.tsx` es un fork de `(socio)/carnet.tsx`) quedaron sin arreglar. Mientras haya forks con hex sueltos, la lección #1 va a volver.
- Toda la capa de errores de `useScanner` / `usePromosBuffet` pasa `error.message` crudo o lo ignora. Falta un helper `mensajeHumano(error)` compartido.

### Positivo

- `TurnosGimnasio.tsx` es el componente más sólido del área (targets, estados, confirmaciones) y sirve de modelo.
- Buen uso de `useSafeAreaInsets` en el escáner y de `FlatList` en todas las listas.

### Acciones recomendadas

1. **[P0] `/impeccable clarify`**: veredicto de cuatro estados en el escáner (auditor-ux #1, #2).
2. **[P0] `/impeccable harden`**: timeout, cancelar, sin conexión y carnet offline (auditor-ux #3, #4), candado del escáner (#6).
3. **[P1] `/impeccable optimize`**: function sin awaits innecesarios, foto en la misma respuesta, cámara montada (#7, P2 auto-reset).
4. **[P1] `/impeccable harden`**: teclado, háptico, DNI normalizado.
5. **[P1] `/impeccable colorize`**: contrastes y tokens (#8, P3).
6. **[P2] `/impeccable adapt`**: panel web responsive, insets del modal de promos.
7. `/impeccable polish` al final.

---

## Compartido

- **`app/hooks/useCarnet.ts`** (auditor-ux #4: QR que desaparece sin red): lo usan `(socio)/carnet.tsx`, `(cliente-gimnasio)/carnet.tsx` y el carnet del tutor. Arreglarlo una vez acá; que las otras áreas no lo reporten de nuevo.
- **Texto "CÓDIGO DE HOY / dictá este código"** (auditor-ux #5): también está en `app/app/(socio)/carnet.tsx:354-366`, ya auditado y cerrado, pero quedó sin arreglar porque el escáner no tiene ese input.
- **`colors.tinta` como fondo de `edicionBar` con texto `oro`**: además de cliente gimnasio, el mismo bloque está en `app/app/(entrenador)/diario.tsx:222-226` y `app/app/(manager)/diario.tsx:243-247` (no verifiqué el color de su label: le toca al área de esos roles).
- **`constants/tabOptions.ts`**: hex sueltos (`#0E0E0E`, `#E8B53C`) usados por todas las barras de pestañas.

## Fuera de alcance pero grave

1. **En el gimnasio (autoservicio), cualquiera puede entrar tipeando el DNI de otro socio.** `socios-qr/index.ts:442-489` (`validate-dni`) no tiene segundo factor, y el comentario de las l. 34-38 asume que la tablet está atendida. Pero en el rol `porteria` es la misma persona que quiere entrar la que tipea en la tablet (`scanner.tsx:353-354`: "Ingresá **tu** DNI"), y el propio código dice que "el escaneo ES el control de acceso" (l. 264-267). Además le registra un ingreso (y una asistencia al turno) al dueño de ese DNI. Fix: en `porteria`, reemplazar DNI por Nº de socio + código TOTP (auditor-ux #5), o exigir DNI + los últimos 3 dígitos del Nº de socio y mostrar la foto a pantalla completa. → tarea [decision].
2. **El QR se puede reusar y compartir por captura de pantalla durante ~3 minutos.** `_shared/totp.ts:5` (paso de 60 s) + `verifyTOTP(..., drift = 1)` (l. 65-70) aceptan el código anterior, el actual y el siguiente, sin marcar el código como usado. Una captura mandada por WhatsApp abre el gimnasio, donde nadie mira la foto. Fix: guardar `socios_secrets.ultimo_paso_usado` y rechazar `paso <= ultimo_paso_usado` en `validate` (de paso corta también el doble disparo del lado del server); evaluar `drift` asimétrico (−1, 0). [backend: migration + function]

---

## Tareas sugeridas

- [ ] T1 — **Four-state scan verdict (pass / pass-with-warning / denied / offline)** (S4 / P0). `scanner.tsx:75-78,160-185,233-241` renders moroso (allowed) and denied with the same red band, icon and alert sound, and labels every denial "QR NO VÁLIDO". Fix: add `veredicto()` + `VEREDICTO_UI` (titles "PUEDE PASAR" / "PASA · CON AVISO" / "NO PUEDE PASAR" / "SIN CONEXIÓN"), reason line under the title, a third sound `assets/sounds/aviso.wav`; keep "QR NO VÁLIDO" only for TOTP/format failures. [OTA]
- [ ] T2 — **Reject inactive (dado de baja) members at every reader** (S4 / P0). `socios-qr/index.ts:364-489` never checks `estado`, so `inactivo` returns `valido: true` and the app shows green "AL DÍA" (`scanner.tsx:15-18,184`). Fix: `if (row.estado === 'inactivo') return jsonOk({ valido: false, motivo: 'Socio dado de baja. Consultá en Secretaría.' })` in `handleValidate` and `handleValidateDni`; also map `inactivo` → `no_pasa` client-side (T1). [backend: function] + [OTA]
- [ ] T3 — **Scanner timeout, cancel and human network errors** (S4 / P0). `useScanner.ts:68-116` has no timeout and shows raw `res.error.message` as an invalid QR; `scanner.tsx:169-173` spinner has no exit. Fix: `AbortController` 6 s, `errorRed: true` results with Spanish messages (401 → "La sesión de esta tablet venció"), a CANCELAR button in the validating state, and a `NetInfo` "SIN CONEXIÓN" banner on the camera view. [OTA]
- [ ] T4 — **Offline policy at the door** (S4 / P0). With no network nobody can be validated (`useScanner.ts`), and the club context requires the reader to work with limited connectivity. Fix options: (a) deny with "SIN CONEXIÓN" (T3 only); (b) let in with a deferred queue of `accesos` (AsyncStorage + NetInfo); (c) periodically cache a signed list of members with Gimnasio on the tablet. [decision: what should the gym tablet do when offline — deny, allow and log later, or cached allow-list?]
- [ ] T5 — **Carnet QR must keep rotating offline** (S4 / P0). `useCarnet.ts:154-158,226-232` refetches the DB every 60 s and on a network error replaces the QR with an error (`(cliente-gimnasio)/carnet.tsx:94-97`, same in socio). Fix: regenerate the code locally from the cached secret when data exists; never `setError` over existing data; persist last `CarnetData` in AsyncStorage and show "Sin conexión · estado al HH:MM". [OTA]
- [ ] T6 — **Remove the untrusted DNI fallback from the self-service gym** (S4 security / P0). `validate-dni` (`socios-qr/index.ts:442-489`) has no second factor and in rol `porteria` the person entering types it (`scanner.tsx:353-354`). Fix: in `porteria`, replace "Ingresar DNI" with "Nº de socio + código" (T7) or DNI + last 3 digits of Nº socio with full-screen photo. [decision: is the DNI-only fallback acceptable at the unattended gym tablet?]
- [ ] T7 — **Manual code entry in the scanner + honest copy on the carnet** (S3 / P1). Carnets say "dictá este código" (`(cliente-gimnasio)/carnet.tsx:124-133`, `(socio)/carnet.tsx:354-366`) but `scanner.tsx:343-378` only accepts DNI. Fix: add an "Ingresar código" mode (Nº socio + 6 digits → `handleQR(`${n}:${c}`)`); rename "CÓDIGO DE HOY" → "CÓDIGO MANUAL · CAMBIA CADA MINUTO". [OTA]
- [ ] T8 — **Single-use TOTP codes** (S3 security / P1). `_shared/totp.ts:5,65-70` accepts a code for ~180 s and reuse is unlimited, so a WhatsApp screenshot works. Fix: `socios_secrets.ultimo_paso_usado int`, reject `paso <= ultimo_paso_usado` in `validate`, consider drift (−1, 0). [backend: migration + function]
- [ ] T9 — **Ref lock against duplicate barcode events** (S3 / P1). `useScanner.ts:53-66` locks with React state, so `onBarcodeScanned` (`scanner.tsx:392`) can fire several invokes and `accesos` inserts per QR. Fix: `lockRef` + `onBarcodeScanned={scanning ? handler : undefined}`, release in `reset`. [OTA]
- [ ] T10 — **Cut scan latency** (S3 / P1). `socios-qr/index.ts:61-430` chains ~7 sequential awaits including `await registrarAcceso` (comment says fire & forget), then the client does a 2nd round trip for the photo (`useScanner.ts:78-83`). Fix: `EdgeRuntime.waitUntil(registrarAcceso(...))`, `Promise.all` service + turno, return `foto_url` from the function, render band before photo. Measure before/after with `console.time`. [backend: function] + [OTA]
- [ ] T11 — **Separate denied attempts from entries in Accesos** (S3 / P1). Denied scans are logged (`socios-qr/index.ts:413,420,468,475`) and counted as "INGRESOS" (`web/.../accesos/page.tsx:297`, CSV `:132-142`); `sin_reserva` marks both allowed and denied. Fix: `accesos.denegado boolean default false`, write it on denials, show "N INGRESOS · M RECHAZADOS" and "RECHAZADO · …" tags, exclude from CSV entries/attendance. [backend: migration + function] + web deploy
- [ ] T12 — **Contrast fixes (lesson #1 + red text)** (S3 / P1). See table below. Fix: `oroSobreClaro` on cream, `estadoTextoColor()` on the cliente-gimnasio badge, gold buttons with `sobreOro` text in promos, `rojoTexto` for red text on dark in the scanner. [OTA]
- [ ] T13 — **Scanner accessibility semantics + target sizes** (S3 / P1). `scanner.tsx` has no `accessibilityRole/Label/LiveRegion`; "Volver a escanear QR" (`:333,372`) ≈17 pt, promos "Cancelar"/"QUITAR" (`promos.tsx:100,130`) < 24 pt. Fix: `accessibilityRole="alert"` + `accessibilityLiveRegion="assertive"` + `announceForAccessibility` on the result band; `accessibilityRole="button"`, `minHeight: 44` + `hitSlop` on links; chips `paddingVertical: 12`. [OTA]
- [ ] T14 — **Promos: surface fetch errors, stop full-screen spinner on focus** (S3 / P1). `usePromosBuffet.ts:39-57` ignores `error` and sets `loading` on every focus; `promos.tsx:177-183` replaces the list. Fix: error state + REINTENTAR; full spinner only when `promos.length === 0`; focus refetch via `refreshing`. [OTA]
- [ ] T15 — **Web panel: contrast, label association, responsive sidebar** (S3 / P1). `text-tinta/40` = 3.49:1 (`accesos/page.tsx:281,288,296`, `turnos/page.tsx:157,1105,1117,1134,1150`); `<label>` without `htmlFor` (accesos `:157,167,206,237`, turnos `:198,359-377,943-986,1099-1128`); `layout.tsx:53` `ml-56` + `SidebarLector.tsx:26` fixed `w-56`. Fix: `text-tinta/60`, `htmlFor`/`id`, `hidden md:flex` sidebar + mobile top bar, `md:ml-56`. [web deploy]
- [ ] T16 — **Keyboard-safe DNI / guest forms** (P1). `scanner.tsx:269-375` has no `KeyboardAvoidingView`; iOS `number-pad` has no return key so `onSubmitEditing` (`:365`) never fires. Fix: `KeyboardAvoidingView` + `ScrollView keyboardShouldPersistTaps="handled"`, auto-submit at 7–8 digits, normalize `replace(/\D/g,'')` client + server, clear input only after a valid result. [OTA] (+ [backend: function] for server normalization)
- [ ] T17 — **Haptic feedback for attended readers** (P1). `scanner.tsx:73-79` audio only; `expo-haptics` not installed. Fix: install, Success/Warning/Error per verdict when `!esAutoservicio`. [native build]

### Contraste

| Ubicación | Hoy | Ratio | Cambiar a | Ratio |
|---|---|---|---|---|
| `(cliente-gimnasio)/carnet.tsx:151` "SECCIÓN · GIMNASIO" | `#F5B41C` / `#F3EFE4` | 1.60 | `#7A4F00` (`oroSobreClaro`) | 6.20 |
| `(cliente-gimnasio)/carnet.tsx:187` badge AL DÍA | `#FFFFFF` / `#2ECC71` | 2.10 | `#15110A` (`sobreOro`) | 8.95 |
| `(cliente-gimnasio)/carnet.tsx:187` badge PENDIENTE | `#FFFFFF` / `#E67E22` | 2.85 | `#15110A` | 6.60 |
| `promos.tsx:236` "+ Nueva", `:274` "PUBLICAR PROMOCIÓN" | `#F5B41C` / `#F3EFE4` | 1.60 | fondo `#F5B41C`, texto `#15110A` | 10.24 |
| `scanner.tsx:216` ESTADO "MOROSO" (16 px) | `#CC4127` / `#15110A` | 3.90 | `#E5634A` (`rojoTexto`) | 5.57 |
| `scanner.tsx:237` motivo bloqueado (18 px, móvil) | `#CC4127` / `#15110A` | 3.90 | `#E5634A` | 5.57 |
| `scanner.tsx:282,317` invitado (15 px) | `#CC4127` / `#15110A` | 3.90 | `#E5634A` | 5.57 |
| `scanner.tsx:177,183` banda verde/roja (referencia, OK) | `#FFFFFF` / `#1A7A1A` · `#CC4127` | 5.46 · 4.82 | — | — |
| `scanner.tsx:225` turno con reserva (OK) | `#5DBB63` / `#15110A` | 7.84 | `colors.estadoActivo` (token) | — |
| web `text-tinta/40` (≈`#6E6A61`) | / `#15110A` | 3.49 | `text-tinta/60` (verificar) · `tinta/50` = 4.78 | ≥ 4.5 |
