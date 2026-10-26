# Auditoría — manager-subcomision-mobile

**Alcance exacto** (repo `rugby_app_gestion`, commit 5a0ce4c, solo código, sin capturas de dispositivo):

- `app/app/(manager)/**`: `_layout.tsx` (36), `diario.tsx` (353), `cobranzas.tsx` (595), `egresos.tsx` (175), `fichajes.tsx` (548), `eventos.tsx` (8), `cronica.tsx` (2), `sobre.tsx` (1), `salir.tsx` (13)
- `app/app/(subcomision)/**`: `_layout.tsx` (41), `diario.tsx` (313), `eventos.tsx` (822), `noticias.tsx` (288), `informes.tsx` (395), `dashboard.tsx` (303), `protocolos.tsx` (381), `cronica.tsx` (2), `usuarios.tsx` (1), `sobre.tsx` (1), `salir.tsx` (13)
- `app/components/eventos/**`: `CobrosPanel.tsx` (313), `DetalleRecaudacion.tsx` (152), `EgresosPanel.tsx` (197), `ResumenBalance.tsx` (40), `estilo.ts` (25)
- Hooks: `useCobranzas` (329), `useCobrosSubcomision` (160), `useEgresos` (265), `useEventos` (473), `useDiarioManager` (147), `useDiarioSubcomision` (161), `useFichajes` (374), `useNoticiasSubcomision` (168), `useInformes` (364), `useDashboard` (328), `useProtocolos` (163), `useRefreshOnFocus` (22)
- Libs: `montoSugerido` (27), `balanceEvento` (112), `cobrosPorDivision` (129), `noticiaSubcomision` (57); `constants/theme.ts` (38), `constants/tabOptions.ts` (22)
- Migraciones leídas para verificar flujos: `20261019000000_subcomision_eventos_propios.sql` (1-270), `20261016000000_…multi_division.sql` (320-360), `20260506000000_init_schema.sql` (334-346, tabla `cobranzas`)

**Total: ~8.360 líneas de app + ~330 de SQL.** `CronicaScreen.tsx` / `UsuariosScreen.tsx` no se auditaron en detalle (ver Compartido).
Aritmética verificada con `node` (ver hallazgo #2). Contrastes medidos con `contraste.py` (ver tabla al final).

---

# Pasada 1 — auditor-ux

## Veredicto

Audité los flujos de plata del Manager (Cobranzas, Egresos, Eventos), el detalle de recaudación de Subcomisión (Cobros | Egresos | Balance), Noticias, Informes y los dos "Inicio", leyendo los hooks y las policies. **No sale a producción**: la pantalla de Cobranzas del Manager puede **borrar pagos ya registrados** y **guarda $15 cuando el manager escribe "15.000"**, y los porcentajes de "cobrado" de Inicio, Eventos e Informes **marcan 100 % con 3 de 80 jugadores pagos**. La parte de Subcomisión (CobrosPanel + EgresosPanel + ResumenBalance) está bien resuelta en lógica; lo que falla ahí es contraste, accesibilidad y navegación.

**S4:** 2 · **S3:** 8 · **S2:** 2 · **S1:** 0

## Hallazgos

### S4 — "GUARDAR TODOS" pisa todas las cobranzas del evento con el estado local (borra pagos y reescribe fecha y autor)

**Dónde:** `app/hooks/useCobranzas.ts:280-297` (upsert de *todas* las filas), `:211-224` (error de lectura de `cobranzas` tragado), `:291-292` (`fecha_pago: fechaHoy()` y `registrado_por` para todos los pagados), `:49-51` (fecha en UTC); `app/app/(manager)/cobranzas.tsx:307` (el GUARDAR del modal llama al mismo guardado total).
**Rompe:** Nielsen #5 Prevención de errores · Nielsen #3 Control y libertad · WCAG 2.2 SC 3.3.4 (acciones financieras: verificación o reversión) · regla de piso: pérdida de datos sin confirmación ni deshacer = S4.
**Por qué:** cada guardado manda un upsert con los N jugadores tal como están en memoria:
1. Si la query de `cobranzas` falla (`cobranzasRes.error` no se mira), todos aparecen PENDIENTE con el monto sugerido; un "GUARDAR TODOS" convierte a pendiente con `monto: null` a todos los que ya habían pagado. Sin aviso.
2. Si la Subcomisión (CobrosPanel) u otro manager de la misma división registró un pago mientras esta pantalla estaba abierta, se pisa (last-write-wins sobre una foto vieja).
3. Aunque nada falle, todos los pagados quedan con `fecha_pago = hoy` y `registrado_por = este manager`: el historial de cuándo pagó cada uno y quién lo cobró se destruye en cada guardado. `toISOString()` además fecha el pago en UTC: un tercer tiempo cobrado a las 22 h queda con la fecha de mañana.

**Fix:** guardar sólo lo que cambió, por jugador (como ya lo hace `useCobrosSubcomision.guardarCobro`), y no tocar `fecha_pago` de lo que ya estaba pagado.
```ts
// useCobranzas.ts
const [original, setOriginal] = useState<Map<string, CobranzaJugador>>(new Map())
const [errorLectura, setErrorLectura] = useState(false)

// en seleccionarEvento, después del Promise.all:
if (jgsRes.error || cobranzasRes.error) {
  setErrorLectura(true); setJugadores([]); setCargandoJugadores(false)
  setError('No se pudieron cargar los pagos. Volvé a abrir el evento.')
  return
}
const lista = /* …mismo map… */
setJugadores(lista)
setOriginal(new Map(lista.map(j => [j.jugadorId, j])))
const fechaPagoPrevia = new Map((cobranzasRes.data ?? []).map(c => [c.jugador_id, c.fecha_pago]))

function fechaLocal() { // reemplaza fechaHoy()
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function guardarCobranzas() {
  if (errorLectura) return
  const cambiados = jugadores.filter(j => {
    const o = original.get(j.jugadorId)
    return !o || o.estado !== j.estado || o.monto !== j.monto || o.formaDePago !== j.formaDePago
  })
  if (cambiados.length === 0) { setGuardadoOk(true); return }
  const rows = cambiados.map(j => {
    const yaPagado = original.get(j.jugadorId)?.estado === 'pagado'
    return {
      evento_financiero_id: eventoSeleccionado.id,
      jugador_id: j.jugadorId,
      estado: j.estado,
      monto: j.estado === 'pagado' ? montoSugeridoDe(j.monto) : null,   // ver hallazgo #2
      forma_de_pago: j.estado === 'pagado' ? j.formaDePago : null,
      fecha_pago: j.estado === 'pagado' ? (yaPagado ? fechaPagoPrevia.get(j.jugadorId) ?? fechaLocal() : fechaLocal()) : null,
      registrado_por: session.user.id,
    }
  })
  // …upsert(rows) y, si ok, setOriginal(new Map(jugadores.map(j => [j.jugadorId, j])))
}
```
Agregá `fecha_pago` al select de `:220`. A mediano plazo (subcomisión y manager cobrando la misma recaudación): RPC con `updated_at` como control optimista.

---

### S4 — El monto que escribe el manager se guarda dividido por mil ("15.000" → $15) y "pagado" se acepta sin monto

**Dónde:** `app/hooks/useCobranzas.ts:53-57` (`parseMonto`), `:79` (resumen COBRADO), `:289` (lo que se graba); `app/app/(manager)/cobranzas.tsx:232-240` (input).
**Rompe:** Ley de Postel (aceptar el formato del usuario) · Nielsen #2 (convención local `$1.234,56`) · Nielsen #5 · WCAG 2.2 SC 3.3.4.
**Por qué:** verificado con node: `parseMonto("15.000") = 15`, `parseMonto("1.500,50") = 1.5`, `parseMonto("12.000") = 12`. Un manager argentino escribe el punto de miles y la app graba $15 en la base, sin error. El resumen "COBRADO" de la misma pantalla muestra $15, así que tampoco lo detecta. Egresos (`balanceEvento.validarEgreso`) y Subcomisión (`useCobrosSubcomision:120`) ya usan `montoSugeridoDe`, que parsea bien: es la única entrada de plata con el parser roto. Además, marcar PAGADO con el campo vacío graba `estado: 'pagado', monto: null`: cuenta como pagado y suma $0.
**Fix:**
```ts
// useCobranzas.ts — borrar parseMonto y usar el parser local compartido
import { montoInicialCobranza, montoSugeridoDe } from '@/lib/montoSugerido'
// resumen
cobrado: jugadores.filter(j => j.estado === 'pagado').reduce((s, j) => s + (montoSugeridoDe(j.monto) ?? 0), 0),
// antes del upsert
const sinMonto = cambiados.find(j => j.estado === 'pagado' && montoSugeridoDe(j.monto) == null)
if (sinMonto) { setError(`Falta el monto de ${sinMonto.nombre}.`); return }
```
Y agregá a `lib/montoSugerido.check.ts` los casos `"15.000" → 15000` y `"1.500,50" → 1500.5` (ya pasan con `montoSugeridoDe`; dejalos fijados para que nadie vuelva a usar `parseFloat`).

---

### S3 — "% cobrado" y "pendientes" se calculan sobre filas de `cobranzas`, no sobre jugadores: marca 100 % con 3 de 80

**Dónde:**
- `app/hooks/useDiarioSubcomision.ts:127-134` → tarjeta COBRADO de Inicio (`(subcomision)/diario.tsx:168-173`, se pinta "oro" si ≥ 80 %)
- `app/hooks/useEventos.ts:257-271` → barra y "N PAGADOS · N PEND." de `(subcomision)/eventos.tsx:130-131, 164-169`
- `app/hooks/useInformes.ts:301-323` → `porcentajeCobrado` y barra de `informes.tsx:222-231`
- `app/hooks/useDiarioManager.ts:103-116` → `pct`, `total` y `montoTotal` de `(manager)/diario.tsx:56-66`
- (`useDashboard.ts:283-293`, pantalla inalcanzable)

**Rompe:** Nielsen #1 Visibilidad del estado del sistema (el sistema informa un estado falso) · lección 8 del brief (dato de negocio incorrecto).
**Por qué:** las filas de `cobranzas` existen sólo para quien alguien tocó. `CobrosPanel` (Subcomisión) hace upsert de un jugador por vez, así que en una recaudación sólo hay filas de los que pagaron: `pagados / filas = 3/3 = 100 %` y "0 PEND.". Informes es peor: pondera por monto y los pendientes se graban con `monto: null` (`useCobrosSubcomision.ts:120`, `useCobranzas.ts:289`), así que `totalCobrado / (totalCobrado + 0)` da siempre 100 %. En el Inicio del Manager, `montoTotal` suma montos de todas las filas, pero las pendientes son null: muestra "$45k / $45k" al lado de "3/20 PAGADOS". La propia app ya sabe calcularlo bien: `cobrosPorDivision` y `useCobranzas.cargarEventos:170-195` usan los jugadores activos del evento como denominador. Hay hoy tres porcentajes distintos para el mismo evento.
**Fix:** una sola fuente. Lo más simple y consistente es una RPC (ya existe el patrón `resumen_egresos_evento`):
```sql
-- resumen_cobranzas_eventos(p_ids uuid[]) RETURNS TABLE(evento_id uuid, jugadores int, pagados int, cobrado numeric)
-- jugadores = count(jugadores activos con jugador_en_evento_financiero(evento, j.id) y visibles para el rol)
-- pagados/cobrado = de cobranzas estado='pagado' (misma regla de visibilidad que resumen_egresos_evento)
```
y en los cuatro hooks: `pct = jugadores > 0 ? round(pagados / jugadores * 100) : 0`, `pendientes = jugadores - pagados`, y sacar `montoTotal` del Inicio del Manager (o reemplazarlo por `sugerido × jugadores` si hay monto sugerido). Mientras tanto, sin backend: no mostrar porcentaje cuando no se conoce el total de jugadores (`'—'` en vez de 100 %).

---

### S3 — Errores de red tragados: la pantalla muestra "vacío", "0" o "sin división" en vez de un error

**Dónde:**
- `useDiarioManager.ts:60-67, 141` → si falla `profiles`, muestra **"Sin división asignada. Contactá a la Subcomisión."** (`(manager)/diario.tsx:123-130`)
- `useCobranzas.ts:103-110` (mismo falso "Sin división"), `:128-132` → "Sin eventos activos", `:155-168`
- `useFichajes.ts:101-108` (falso "Sin división"), `:120-126` → "Sin jugadores fichados aún", `:336-343` (ABRIR documento falla en silencio)
- `useDiarioSubcomision.ts:66-155` → ningún `.error` mirado y `catch {}`: "0 FICHADOS", "0 LESIONES", "Sin novedades"
- `useInformes.ts:101-327` → ninguna de las 7 queries mira `error`: "Sin datos de asistencia", "Sin eventos financieros activos"
- `useEventos.ts:291-301` (detalle del Manager: "Sin pedidos registrados") y **`:361-373` (CERRAR EVENTO: si el update falla no pasa nada; el spinner para y el evento sigue activo, sin mensaje)**
- `useProtocolos.ts:57-64, 142-146` (borra de la lista aunque el delete falle)

**Rompe:** Nielsen #9 Ayudar a reconocer, diagnosticar y recuperarse de errores · Nielsen #1 · lección 2 del brief.
**Por qué:** el directivo ve "0 lesiones" o "sin eventos" y decide sobre ese dato. El manager ve "Sin división asignada" y llama a la Subcomisión por un corte de señal en la cancha. Cerrar evento es una acción con confirmación y sin resultado visible.
**Fix:** patrón único que ya usa `useEgresos` / `useEventos.fetchDivisionesManager`:
```ts
const { data: profile, error } = await supabase.from('profiles')…
if (error) { setErrorCarga('No se pudo cargar tu división. Tocá para reintentar.'); setLoading(false); return }
```
y en las pantallas el banner con reintento que ya existe en `egresos.tsx:75-79`. En `cerrarEvento`:
```ts
const { data, error } = await supabase.from('eventos_financieros')
  .update({ estado: 'cerrado' }).eq('id', eventoDetalle.id).select('id')
setCerrando(false)
if (error || !data?.length) { setErrorCierre('No se pudo cerrar el evento. Probá de nuevo.'); return }
```
(mostrar `errorCierre` arriba del botón en `DetalleRecaudacion.tsx:107` y `eventos.tsx:313`).

---

### S3 — Modal de pago del Manager: la X deja "PAGADO" sin guardar, GUARDAR cierra antes de saber si guardó, y Android Back no lo cierra

**Dónde:** `app/app/(manager)/cobranzas.tsx:307` (`guardarCobranzas(); setModalJugadorId(null)` sin `await`), `:192-194` (X), `:372` (Volver a Eventos), `:449` (`<Modal>` sin `onRequestClose`); también `app/app/(manager)/fichajes.tsx:329`.
**Rompe:** Nielsen #1 · Nielsen #3 Control y libertad · Nielsen #9.
**Por qué:** en el modal, tocar PAGADO edita el estado en memoria; la X cierra y la fila queda con el badge verde PAGADO **sin estar guardada**. Si después toca "Eventos" o cambia de pestaña, se pierde sin aviso. Si toca GUARDAR, el modal se cierra en el acto; un error aparece en un banner al final de la lista, posiblemente fuera de la vista, y el éxito ("COBRANZAS GUARDADAS", `:423-427`) también queda abajo de todo. En Android, sin `onRequestClose` el botón Back no cierra el modal.
**Fix:** el modal guarda sólo ese jugador y espera el resultado (mismo contrato que `CobrosPanel.guardar`):
```tsx
async function handleGuardarModal() {
  const ok = await guardarCobro(modalJugadorId!)   // upsert de 1 fila, ver hallazgo #1
  if (ok) setModalJugadorId(null)                  // si falla, el error queda dentro del modal
}
<Modal … onRequestClose={() => setModalJugadorId(null)}>
```
La X descarta los cambios de ese jugador (restaurar desde `original`). Si quedan cambios sin guardar en la lista, `volverAEventos` pide confirmación con `Alert.alert('Cambios sin guardar', …, [{text:'Seguir editando'},{text:'Descartar', style:'destructive'}])`. Sacá el banner de éxito del final de la lista y mostralo en el `bottomBar`, junto al botón.

---

### S3 — Contraste: los botones principales y los estados "activo" son oro sobre crema (1,60:1), y hay otros 9 pares que no llegan

**Dónde (oro sobre crema, `#F5B41C` / `#F3EFE4` = 1,60:1):** `cobranzas.tsx:592-594` (GUARDAR / GUARDAR TODOS), `:555-556` (banner COBRANZAS GUARDADAS), `:587-589` (forma de pago activa); `CobrosPanel.tsx:305-312`; `EgresosPanel.tsx:369-371` (AGREGAR EGRESO); `(subcomision)/eventos.tsx:807-809` (tipo activo), `:811-814` (división activa), `:819-821` (CREAR EVENTO / REINTENTAR); `fichajes.tsx:526-527, 543-545`; `(manager)/diario.tsx:245-249` (barra de edición), `:314-320` (CONFIRMAR COMPROBANTE); `(subcomision)/diario.tsx:229-235, 273-279`; `informes.tsx:326-327`; `protocolos.tsx` header (blanco sobre crema, 1,15:1). Crema sobre oro: `(manager)/diario.tsx:332-338` (badge OK).
**Otros que no llegan:** ver la tabla al final (rojo y verde de los montos en `ResumenBalance`, el badge ALERTA de la crónica, el botón CERRAR EVENTO, etc.).
**Rompe:** WCAG 2.2 SC 1.4.3 Contraste (Mínimo), nivel AA → S3 por regla de piso.
**Por qué:** es la lección 1 del brief: `cab360a` invirtió `colors.tinta` y estos archivos declaran `TEXTO = '#F3EFE4'` localmente y lo usan como fondo de botón. El GUARDAR, la acción más importante de Cobranzas y Egresos, se lee a 1,60:1.
**Fix:** misma solución que socio, con tokens semánticos. Botón primario = fondo oro, texto `colors.sobreOro`:
```ts
// components/eventos/estilo.ts (y que cobranzas/eventos/fichajes importen de acá en vez de redeclarar)
export const BOTON_PRIMARIO       = { backgroundColor: colors.oro, paddingVertical: 15, borderRadius: 3, alignItems: 'center' } as const
export const BOTON_PRIMARIO_TEXTO = { fontFamily: fonts.label, color: colors.sobreOro, fontSize: 13, letterSpacing: 2.5, fontWeight: '700' } as const
// estados "activo" de chips/pills/selectores: backgroundColor: colors.oro + color: colors.sobreOro (10,24:1)
// barras de edición crema: dejar fondo colors.tinta y usar colors.oroSobreClaro para el label (6,20:1)
```

---

### S3 — Controles sin nombre, rol ni estado para VoiceOver/TalkBack (1 solo `accessibilityLabel` en todo el área)

**Dónde:** botones sólo-ícono: X de modales (`cobranzas.tsx:192`, `CobrosPanel.tsx:57`, `(subcomision)/eventos.tsx:385`, `fichajes.tsx:340`), volver (`DetalleRecaudacion.tsx:57`, `eventos.tsx:202`), abrir/borrar protocolo (`protocolos.tsx:95, 107`), borrar noticia "✕" (`noticias.tsx:48`). Selectores sin `accessibilityState={{ selected }}`: PAGADO/PENDIENTE (`cobranzas.tsx:203-222`, `CobrosPanel.tsx:67-82`), forma de pago (`cobranzas.tsx:250`, `CobrosPanel.tsx:110`), tipo/alcance/divisiones (`eventos.tsx:400, 435, 348`), pestañas Cobros/Egresos (`DetalleRecaudacion.tsx:88`) y Activos/Historial (`eventos.tsx:90`), chips de evento (`egresos.tsx:35`). Mensajes de estado sin live region: "COBRANZAS GUARDADAS" (`cobranzas.tsx:423`), "FICHAJE REGISTRADO" (`fichajes.tsx:407`), banners de error.
**Rompe:** WCAG 2.2 SC 4.1.2 Nombre, función, valor (A) · SC 4.1.3 Mensajes de estado (AA) · SC 1.1.1 (A).
**Por qué:** con lector de pantalla, la X se anuncia como "botón" sin nombre (el glifo de Ionicons no tiene texto) y en PAGADO/PENDIENTE no hay forma de saber cuál está elegido: el manager no puede saber si marcó el pago.
**Fix:**
```tsx
<TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={8} …>
<TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: pagado }} accessibilityLabel="Pagado" …>
<View accessibilityRole="radiogroup" accessibilityLabel="Estado del pago">…</View>
<TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: sel }} …>   // Cobros | Egresos
<View accessibilityLiveRegion="polite" accessibilityRole="alert">…banner…</View>
// iOS: AccessibilityInfo.announceForAccessibility('Cobranzas guardadas') después del guardado
```

---

### S3 — Navegación de Subcomisión: 6 pestañas, y Protocolos y Dashboard son pantallas sin entrada

**Dónde:** `app/app/(subcomision)/_layout.tsx:8-35` (Inicio, Usuarios, Eventos, Crónica, Noticias, Mi perfil = 6), `:12` y `:38` (`dashboard` y `protocolos` con `href: null`); nadie navega a `/(subcomision)/protocolos` ni a `/dashboard` (grep en `app/` y `web/app`: 0 resultados). `app/app/(entrenador)/lesiones.tsx:304` le dice al entrenador "La Subcomisión los publica aquí".
**Rompe:** Apple HIG / Material (tab bar de 3 a 5 destinos) → ley de Jakob · Nielsen #6 Reconocimiento antes que recuerdo · Nielsen #3 (función inalcanzable).
**Por qué:** la Subcomisión no tiene forma de subir protocolos de lesiones desde el celular, aunque la pantalla existe y la otra punta (entrenador) la espera. `dashboard.tsx` + `useDashboard.ts` (631 líneas, con un canal realtime sobre 4 tablas enteras) es código muerto con otra paleta (crema, cards blancas, serif). Con 6 pestañas, en un iPhone chico cada una baja a unos 62 pt de ancho y las etiquetas se cortan; en socio ya se decidió ir a 5.
**Fix:** [decision] Propuesta: 5 pestañas = Inicio · Eventos · Noticias · Crónica · Usuarios; "Mi perfil" pasa al avatar del Header (igual que socio, decisión del 2026-10-13). Agregar en `(subcomision)/diario.tsx:199-214` un tercer atajo "PROTOCOLOS DE LESIONES →" a `/(subcomision)/protocolos`. Borrar `dashboard.tsx` y `useDashboard.ts` (Informes ya cubre lo mismo).

---

### S3 — Al volver a la pestaña Eventos, el detalle de la recaudación se desmonta y se pierde el egreso a medio cargar

**Dónde:** `app/hooks/useEventos.ts:146, 153` (`useRefreshOnFocus(fetchTodo)` → `setLoading(true)`); `app/app/(subcomision)/eventos.tsx:566-584` (el `if (loading) return <Spinner/>` va **antes** de renderizar `DetalleRecaudacion`). Mismo patrón con spinner a pantalla completa en cada foco: `informes.tsx:261-268` (+ `useInformes.ts:87-90`), `(manager)/diario.tsx:160`, `(subcomision)/diario.tsx:140`, `fichajes.tsx:174` vía `useFichajes`.
**Rompe:** Nielsen #3 (se pierde lo cargado) · umbral de Doherty · lección 3 del brief.
**Por qué:** la Subcomisión está cargando un egreso ("Pizzas, $48.000"), cambia de pestaña para chequear algo y vuelve: el spinner reemplaza a `DetalleRecaudacion`, que se desmonta y vuelve a montarse con el formulario vacío, la pestaña reseteada a COBROS y el scroll arriba. `eventoDetalle` además queda viejo (no se refresca).
**Fix:**
```ts
// useEventos.ts
const [refrescando, setRefrescando] = useState(false)
async function fetchTodo(silencioso = false) {
  silencioso ? setRefrescando(true) : setLoading(true)
  …
}
useRefreshOnFocus(() => { if (paso === 'lista') fetchTodo(true) })   // con el detalle abierto no se recarga la lista
```
y en `eventos.tsx` mover `if (loading)` debajo de los dos `if (paso === 'detalle' …)`. Mismo cambio (`refrescando` silencioso + `RefreshControl`) en `useInformes`, `useDiarioManager` y `useDiarioSubcomision`.

---

### S3 — Fichajes: un manager con varias divisiones sólo puede fichar en la primera, y un fichaje a medias no se puede reintentar

**Dónde:** `app/hooks/useFichajes.ts:107` (`divisiones?.[0]`), `:209-250` (insert de `jugadores`, después `fichajes`, sin transacción), `:129-133` (la lista filtra a los jugadores sin fichaje).
**Rompe:** Nielsen #5 Prevención de errores · Nielsen #9 · lección 8 del brief.
**Por qué:** el resto del rol ya maneja varias divisiones (`useCobranzas`, `useEventos`, `useDiarioManager`); Fichajes no: el manager de M15 y M16 ficha siempre en M15 y sólo ve esa lista. Si el insert de `fichajes` falla, el jugador queda creado pero invisible en la lista, y al reintentar aparece "Ya existe un jugador con ese DNI en esta división": no hay forma de terminarlo desde la app.
**Fix:** cargar `misDivisiones` como en `useEventos.fetchDivisionesManager`, agregar un selector DIVISIÓN obligatorio en el modal (`fichajes.tsx:355`, preseleccionada si es una sola) y un filtro por división en la lista. Mover el alta a una RPC `fichar_jugador(p_nombre, p_dni, p_fecha_nac, p_division, p_posicion)` que hace jugador + vínculo con socio + fichaje en una transacción. [backend: function]

---

### S2 — Inicio del Manager: montos en formato yanqui y una tarjeta que habla de "pedidos/comprobantes" para algo que es una cobranza

**Dónde:** `app/app/(manager)/diario.tsx:19-23` (`formatMonto` → "$12.5k", verificado: `12500 → "$12.5k"`, `1250 → "$1.3k"`), `:74-97` (`CardPedido`: "PEDIDO ABIERTO", "x/y confirmados", "CONFIRMAR COMPROBANTE →" que lleva a Cobranzas; `ev.descripcion` en cursiva muestra el monto sugerido crudo, p. ej. "2500"). Formatos distintos en el resto: `estilo.ts:22` "$ 12.500", `informes.tsx:228` "$12.500", `eventos.tsx:67` "26/10/26" vs `estilo.ts:14` "26 oct 2026".
**Rompe:** Nielsen #2 Relación con el mundo real (AR: `$ 12.500`) · Nielsen #4 Consistencia y estándares.
**Por qué:** "$12.5k" no es como se escribe plata en Argentina (punto decimal, sufijo inglés) y redondea: $1.250 se ve como $1.3k. La tarjeta de eventos globales usa vocabulario de un flujo que no existe en esta pantalla: el manager no "confirma comprobantes", cobra.
**Fix:** usar `formatMonto` de `components/eventos/estilo.ts` en todos lados (borrar las copias en `cobranzas.tsx:56`, `eventos.tsx:70`, `diario.tsx:19`, `informes.tsx:228,239`). En `CardPedido`: badge "COBRANZA DEL CLUB", texto `${pagados}/${total} pagaron`, botón "COBRAR →", y la línea de descripción reemplazada por `${formatMonto(montoSugeridoDe(ev.descripcion))} por jugador` cuando exista.

---

### S2 — Targets chicos en las acciones de las listas y los modales

**Dónde:** borrar egreso `EgresosPanel.tsx:360` (padding 4 + ícono 18 = **26×26 pt**); X de los modales `cobranzas.tsx:564`, `CobrosPanel.tsx:286`, `eventos.tsx:786`, `fichajes.tsx:536` (4 + 20 + 4 = **28×28**); volver `DetalleRecaudacion.tsx:131`, `eventos.tsx:735` (4 + 22 + 4 = **30×30**); "✕" de noticia `noticias.tsx:266` (8 + ~19 + 8 ≈ **35**); "Cancelar" de `noticias.tsx:110` y `protocolos.tsx:141` (sin padding, ~20 pt de alto); ABRIR documento `fichajes.tsx:508` (5 + 16 + 5 ≈ **26** de alto); pills de división `eventos.tsx:811` (8 + 18 + 8 ≈ **34**) e `informes.tsx:332` (6 + 18 + 6 ≈ **30**); forma de pago `cobranzas.tsx:586`, `CobrosPanel.tsx:305` (10 + 17 + 10 ≈ **37**).
**Rompe:** ley de Fitts · Apple HIG 44×44 pt · Material 48×48 dp. (Pasan el mínimo AA de 24 px de SC 2.5.8, por eso S2 y no S3.)
**Por qué:** el borrar egreso de 26 pt está pegado al monto, en una fila que se usa con una mano.
**Fix:** `hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}` en los íconos + `minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center'` en `filaAccion`, `modalClose` y `backBtn`; `minHeight: 44` en pills y botones de forma de pago; `paddingVertical: 12, paddingHorizontal: 8` en los "Cancelar".

---

Dejé afuera 4 S2: Noticias publica y manda push a todo el club sin paso de confirmación, y "Cancelar" descarta el borrador sin preguntar (`noticias.tsx:92-98`); la tarjeta de evento cerrado del Manager no se puede abrir (`eventos.tsx:642`); la pantalla de jugadores de Cobranzas no tiene búsqueda (con 40+ jugadores); el saludo es siempre "Buen día" (`(subcomision)/diario.tsx:136`).

## Lo que está bien

- **Subcomisión cobra bien:** `useCobrosSubcomision.guardarCobro` guarda un jugador por vez, valida monto > 0 con el parser local, respeta evento cerrado (y la RLS de `20261019000000` también lo exige), recarga y devuelve `ok` para que el modal se cierre sólo si guardó. Es el modelo a copiar en Cobranzas del Manager.
- **Balance que cierra:** `balanceEvento.ts` redondea a centavos y el resumen sale de la RPC `resumen_egresos_evento` (server-side, misma regla de visibilidad). `neto = round(cobrado − egresos)` y `formatMonto` muestra el negativo como "− $ 200" en rojo, no sólo con color.
- **Borrados con confirmación y mensaje concreto:** egreso ("¿Borrar "Micro" ($ 48.000)?", con `accessibilityLabel` y manejo de 0 filas por RLS), noticia (maneja `sin_filas`) y cierre de evento.
- **Carreras de red cubiertas** con `ultimoPedido` en `useEgresosEvento` y `useCobrosSubcomision` (no se pisa el detalle de otro evento con una respuesta vieja).
- **Noticias:** el aviso explica que se publica ya y manda push, si el push falla se avisa sin deshacer, el footer usa `insets.bottom`, `onRequestClose` presente. `useEgresos` y `useEventos` (modo manager) distinguen "error de carga" de "sin división", con reintento.

## No pude verificar

- **Lector de pantalla real** (orden de lectura, qué anuncia Ionicons sin label), **Dynamic Type / escala de fuente** grande: necesito un build en dispositivo.
- **`numeric` como string:** `useEventos.ts:271`, `useInformes.ts:304-310`, `useDiarioManager.ts:108-109` suman `c.monto ?? 0` sin `Number()`. PostgREST serializa `numeric` como número JSON, así que hoy debería andar, pero `balanceEvento.ts:34` asume que puede venir string: si viene, la suma concatena ("0150002000"). Hacen falta una respuesta real o un test de integración.
- **Doble tap** en AGREGAR EGRESO / CREAR EVENTO / FICHAR: la guarda es sólo `disabled={guardando}` (estado de React). Con un toque doble muy rápido podría entrar dos veces antes del re-render; no lo pude reproducir sin dispositivo (ver impeccable P2).
- **iOS pageSheet** en `cobranzas.tsx:449`: si el swipe-down cierra la hoja sin `onRequestClose`, `visible` queda en true y el modal no se vuelve a abrir. Hay que probarlo en un iPhone.
- **Modales en Android con edge-to-edge:** si el header del modal queda debajo de la status bar.
- **Cobertura:** es una pasada heurística única; encuentra cerca del 35 % de los problemas que encontrarían 3 a 5 evaluadores. No reemplaza ver a un manager cobrando un tercer tiempo real.

---

# Pasada 2 — impeccable audit (native, iOS + Android)

El detector `impeccable detect` es para web y no se corrió: esta es una auditoría de RN desde el código, contra `ios.md` y `android.md`.

## Audit Health Score

| # | Dimensión | Puntaje | Hallazgo clave |
|---|-----------|---------|----------------|
| 1 | Accesibilidad | 1 | 1 solo label en ~5.000 líneas de UI, contraste 1,60:1 en botones primarios, targets de 26 a 37 pt (= auditor-ux #6, #7, #12) |
| 2 | Performance | 2 | Listas largas sin virtualizar (Informes renderiza todos los jugadores del club en un `ScrollView`) |
| 3 | Apariencia y theming | 1 | Paleta hardcodeada y redeclarada en 7 archivos; `estilo.ts` existe pero no lo usan; Dashboard con otra paleta |
| 4 | Conformidad de plataforma | 1 | La navegación interna con estado `paso` rompe Back/edge-swipe, `SafeAreaView` de RN con edge-to-edge en Android, 6 pestañas |
| 5 | Adaptividad | 2 | `supportsTablet: true` con layouts de teléfono estirados; KAV presente pero inconsistente |
| **Total** | | **7/20** | **Poor** |

## Platform Conformance Verdict

**No pasa.** Se lee como una web portada en tres cosas concretas: (1) Cobranzas, Fichajes y Eventos simulan una pila con `paso: 'lista' | 'detalle'` y un botón "‹ Volver" dibujado, así que ni el Back de Android ni el edge-swipe de iOS vuelven a la lista; (2) en Android, con `edgeToEdgeEnabled: true`, el `SafeAreaView` de `react-native` no hace nada y los headers quedan debajo de la status bar; (3) la Subcomisión tiene 6 pestañas.

## Executive Summary

- Puntaje: **7/20 (Poor)**.
- Issues: P0 0 · P1 3 · P2 4 · P3 1 (más 3 que coinciden con auditor-ux).
- Lo más grave: navegación falsa sin Back de sistema, insets en Android, Back que no cierra modales.
- Próximo paso: pasar a rutas reales de expo-router los detalles (`cobranzas/[eventoId]`, `fichajes/[jugadorId]`, `eventos/[id]`) y a `react-native-safe-area-context`; con eso se resuelven 2 de los 3 P1.

## Detailed Findings by Severity

**[P1] Navegación simulada con estado: Back y edge-swipe no vuelven a la lista**
- **Ubicación:** `(manager)/cobranzas.tsx:338-447` (`paso === 'jugadores'`, botón `:372`), `fichajes.tsx:205-326` (`paso === 'detalle'`, `:238`), `(subcomision)/eventos.tsx:575-596` + `useEventos.ts:131, 281-357`.
- **Categoría:** Conformance.
- **Impacto:** en Android, Back desde el detalle de un evento no vuelve a la lista: en un `Tabs` de expo-router (default `backBehavior: 'firstRoute'`) salta a Inicio, y al volver a la pestaña el detalle sigue abierto. En iOS no hay gesto de borde. La pila tampoco se ve en el historial.
- **Guideline:** Material, "System Back always works" · HIG, "Edge-swipe back stays alive".
- **Recomendación:** convertir cada pestaña en `Stack` (`(manager)/cobranzas/_layout.tsx` + `index.tsx` + `[eventoId].tsx`; ídem fichajes y eventos), pasando el id por params y moviendo la carga del detalle al hook de la ruta. Mientras tanto, como mínimo: `useFocusEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (paso !== 'eventos') { volverAEventos(); return true } return false }); return () => sub.remove() })`.
- **Comando sugerido:** `/impeccable adapt`

**[P1] Insets: `SafeAreaView` de `react-native` con Android edge-to-edge, y `paddingTop: 60` fijo**
- **Ubicación:** `cobranzas.tsx:9, 327`, `egresos.tsx:8, 66`, `fichajes.tsx:8, 192`, `(subcomision)/eventos.tsx:14, 606`, `DetalleRecaudacion.tsx:9, 55`, `CobrosPanel.tsx:10, 51`; `informes.tsx:326`, `protocolos.tsx` header (`paddingTop: 60`), `dashboard.tsx:253`; `app.config.js:39` (`edgeToEdgeEnabled: true`).
- **Categoría:** Conformance.
- **Impacto:** en Android el `SafeAreaView` de RN no aplica insets (sólo funciona en iOS): el label "MANAGER · M15" queda debajo de la status bar (el header tiene `paddingTop: 20` y la barra mide entre 24 y 48 dp). El `60` fijo sobra en iPhone sin notch y no alcanza con Dynamic Island + fuente grande.
- **Guideline:** HIG, "Safe area" · Material, "Edge-to-edge with window insets".
- **Recomendación:** `import { SafeAreaView } from 'react-native-safe-area-context'` con `edges={['top']}` (las diarios ya usan `useSafeAreaInsets`), y en informes/protocolos `paddingTop: insets.top + 16`.
- **Comando sugerido:** `/impeccable adapt`

**[P1] Back de Android no cierra los modales de Cobranzas y Fichajes** (= auditor-ux #5)

**[P2] Theming: paleta redeclarada a mano en cada pantalla**
- **Ubicación:** `cobranzas.tsx:27-35`, `(subcomision)/eventos.tsx:33-42`, `fichajes.tsx:26-34`, `informes.tsx:21-29`, `protocolos.tsx:19-25` + hex sueltos, `(manager)/diario.tsx` (`'#9B9183'`, `'#7C7267'`, `'#1C1710'`), `dashboard.tsx:17-24` (paleta de otra app: `#F5F0E8`, cards `#FFFFFF`, `fontFamily: 'serif'`), `tabOptions.ts:5,17` (`#0E0E0E`, `#E8B53C` fuera del tema). Sólo `noticias.tsx` usa `useTheme()`.
- **Categoría:** Theming.
- **Impacto:** el bug crema/oro (auditor-ux #6) existe porque cada archivo tiene su `TEXTO = '#F3EFE4'`. El rediseño que viene (decisión de socio: "un rediseño cambia valores, no nombres") no va a llegar a estas pantallas.
- **Recomendación:** `components/eventos/estilo.ts` re-exporta `colors.fondo/card/texto/muted/borde` + `sobreOro`, `rojoTexto`, `exito`; borrar los bloques "Tokens" locales e importar de ahí; `VERDE '#4A7C59'` → `colors.estadoActivo`.
- **Comando sugerido:** `/impeccable colorize`

**[P2] Listas largas sin virtualizar**
- **Ubicación:** `informes.tsx:305-314` + `useInformes.ts:175-195` (una card por **cada jugador activo del club**, con 4 secciones en un solo `ScrollView`); `CobrosPanel.tsx:203-232` dentro del `ScrollView` de `DetalleRecaudacion.tsx:81` (una recaudación "todo el club" puede tener cientos de filas); `cobranzas.tsx:401-415`; `fichajes.tsx:207-225`.
- **Categoría:** Performance.
- **Impacto:** cientos de nodos montados de una vez, con scroll pesado en Android de gama baja (el celular típico de un manager).
- **Recomendación:** `SectionList` (Informes por división, CobrosPanel por división con `stickySectionHeadersEnabled`), `FlatList` en Cobranzas/Fichajes con `keyExtractor` y `getItemLayout` (filas de alto fijo). En Informes, mostrar por defecto los jugadores con alerta o menos del 50 % y un "Ver todos".
- **Comando sugerido:** `/impeccable optimize`

**[P2] Guardas de doble envío sólo con estado de React; el egreso no es idempotente**
- **Ubicación:** `EgresosPanel.tsx:286-289` → `useEgresos.ts:284-304` (`insert` sin clave), `(subcomision)/eventos.tsx:507-511` → `useEventos.ts:399-433`, `fichajes.tsx:415-418`.
- **Categoría:** Conformance / robustez.
- **Impacto:** dos toques seguidos antes del re-render pueden duplicar un egreso, que resta del neto. El de crear evento muestra un evento repetido.
- **Recomendación:** `const enVuelo = useRef(false); if (enVuelo.current) return; enVuelo.current = true; try { … } finally { enVuelo.current = false }` en `agregarEgreso`, `crearEvento` y `guardarFichaje`.
- **Comando sugerido:** `/impeccable harden`

**[P2] Texto que se recorta con la fuente del sistema agrandada**
- **Ubicación:** `(subcomision)/diario.tsx:268` (`fontSize: 13, lineHeight: 14`), `eventos.tsx:808` (`fontSize: 12, lineHeight: 14` en botones de 2 líneas con `minHeight: 56`), `ResumenBalance.tsx:12-23` (`adjustsFontSizeToFit` + `numberOfLines={1}`, que con montos de 7 cifras achica el número hasta hacerlo ilegible en lugar de reacomodar).
- **Categoría:** Accesibilidad / Adaptividad.
- **Impacto:** con escala 1,3 o más, el `lineHeight` fijo corta los descendentes y el balance se encoge a unos 9 pt.
- **Recomendación:** `lineHeight ≈ 1.3 × fontSize` o sin `lineHeight`; en `ResumenBalance`, `minimumFontScale={0.8}` y pasar a columna (`flexDirection: 'column'`) cuando `useWindowDimensions().fontScale > 1.2`.
- **Comando sugerido:** `/impeccable typeset`

**[P3] Tablet: layouts de teléfono estirados**
- **Ubicación:** `app.config.js:22` (`supportsTablet: true`); ninguna pantalla del área limita el ancho.
- **Categoría:** Adaptividad.
- **Recomendación:** contenedor `maxWidth: 640, alignSelf: 'center', width: '100%'` en las listas y formularios.
- **Comando sugerido:** `/impeccable adapt`

(= auditor-ux #8: 6 pestañas y pantallas huérfanas.)

## Patterns & Systemic Issues

- **Tokens locales en lugar de semánticos:** en 7 archivos; causa del contraste 1,60:1.
- **`const { data } = await …` sin `error`:** en 9 hooks del área.
- **"Pantalla con pasos" en vez de rutas:** en 3 flujos, y rompe el Back en todos.
- **Formateadores de plata y fecha duplicados:** 5 copias de `formatMonto`/`formatPesos` y 4 de `formatFecha` con salidas distintas.

## Positive Findings

- Tab bar con etiquetas visibles e inactivo a 5,29:1 (`tabOptions.ts`), heredado del arreglo de socio.
- `KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"` en todos los formularios con montos.
- Teclados correctos: `decimal-pad` para montos, `number-pad` para DNI, `DatePickerField` para fechas en lugar de texto libre.
- `Alert.alert` nativo con `style: 'destructive'` para los borrados y el cierre de evento.

## Recommended Actions

1. **[P1] `/impeccable adapt`**: rutas reales para los detalles de Cobranzas, Fichajes y Eventos, y `SafeAreaView` de `react-native-safe-area-context`.
2. **[P1] `/impeccable harden`**: `onRequestClose` en los modales y guardas con `useRef` en los envíos.
3. **[P2] `/impeccable colorize`**: tokens semánticos en `estilo.ts` y borrar las paletas locales.
4. **[P2] `/impeccable optimize`**: `SectionList`/`FlatList` en Informes, CobrosPanel, Cobranzas y Fichajes.
5. **[P2] `/impeccable typeset`**: `lineHeight` proporcional y `ResumenBalance` adaptable.
6. **`/impeccable polish`**: pasada final.

---

## Compartido

- **`CronicaScreen.tsx` / `UsuariosScreen.tsx`** (otro agente): se integran como re-export directo: `(manager)/cronica.tsx`, `(subcomision)/cronica.tsx` (`export default CronicaScreen`) y `(subcomision)/usuarios.tsx`. Son pestañas: Manager 4 de 5, Subcomisión 2 y 4 de 6. El bug de contraste que tienen se ve en estos dos roles.
- **`components/eventos/estilo.ts`** lo usan Manager (Egresos) y Subcomisión (DetalleRecaudacion, CobrosPanel, EgresosPanel). Arreglar ahí los tokens (#6 y P2 theming) arregla los dos roles; `cobranzas.tsx`, `(subcomision)/eventos.tsx` y `fichajes.tsx` lo tienen que importar en vez de redeclarar.
- **`(subcomision)/eventos.tsx` (`EventosPantalla`)** lo usa también el Manager vía `(manager)/eventos.tsx`: los hallazgos #4 (cerrar evento), #9 (spinner que desmonta el detalle), contraste y Back afectan a los dos roles.
- **`useRefreshOnFocus` + `setLoading(true)`** (lección 3): además de este área, cualquier hook que lo combine así. Conviene que el hook exponga `refrescando` en lugar de cada pantalla.
- **`SafeAreaView` de `react-native`** con `edgeToEdgeEnabled: true`: probablemente se repite fuera de este área (`grep -rn "SafeAreaView,$" app/app`).
- **`constants/tabOptions.ts`**: hex fuera del tema (`#0E0E0E`, `#1A1A1A`, `#E8B53C`); compartido por todos los roles.

## Fuera de alcance pero grave

1. **La RLS de cobranzas del Manager no exige evento activo ni tipo.** `supabase/migrations/20261016000000_eventos_financieros_multi_division.sql:328-350`: `cobranzas_insert_manager` / `cobranzas_update_manager` sólo chequean rol, división del jugador y `jugador_en_evento_financiero`. La de Subcomisión sí exige `ef.estado = 'activo'` (`20261019000000…:64-80`, `p_escritura`). Un manager puede modificar cobranzas de un evento **cerrado** (por API, o si la UI deja de filtrar) y de **recaudaciones de la Subcomisión** (`useCobranzas.cargarEventos:127-132` no filtra `tipo`, así que hoy las lista y "GUARDAR TODOS" pisa lo que cargó la Subcomisión: hallazgo #1). Fix: agregar `AND EXISTS (SELECT 1 FROM eventos_financieros ef WHERE ef.id = cobranzas.evento_financiero_id AND ef.estado = 'activo')` a ambas policies y decidir si el manager cobra recaudaciones [decision].
2. **`useDashboard.ts:75-91`**: canal realtime `postgres_changes` sin filtro sobre `asistencias`, `fichajes`, `resultados` y `cobranzas` de todo el club. Hoy está muerto (pantalla inalcanzable), pero si alguien lo vuelve a enlazar, recarga 4 queries completas con cada asistencia que marque cualquier entrenador. Borrarlo con la pantalla.

---

## Tabla de contraste

| Ubicación | Hoy | Ratio | Cambiar a | Ratio |
|---|---|---|---|---|
| Botones primarios GUARDAR / AGREGAR EGRESO / CREAR EVENTO / FICHAR, estados activos de chips y selectores (ver #6) | `#F5B41C` sobre `#F3EFE4` | 1,60:1 | texto `colors.sobreOro #15110A` sobre `colors.oro #F5B41C` | 10,24:1 |
| Badge OK `(manager)/diario.tsx:332-338` | `#F3EFE4` sobre `#F5B41C` | 1,60:1 | `#15110A` sobre `#F5B41C` | 10,24:1 |
| Barras de edición crema (label) `(manager)/diario.tsx:247`, `(subcomision)/diario.tsx:233`, `informes.tsx:327` | `#F5B41C` sobre `#F3EFE4` | 1,60:1 | `colors.oroSobreClaro #7A4F00` sobre `#F3EFE4` | 6,20:1 |
| Header de Protocolos (título) | `#FFFFFF` sobre `#F3EFE4` | 1,15:1 | `#15110A` sobre `#F3EFE4` | 16,37:1 |
| Meta del chip activo `egresos.tsx:165` | `#C9890A` sobre `#F3EFE4` | 2,59:1 | `#7A4F00` sobre `#F3EFE4` | 6,20:1 |
| Subtexto de banner OK `fichajes.tsx:528` | `#8E8574` sobre `#F3EFE4` | 3,17:1 | `#15110A` sobre `#F3EFE4` | 16,37:1 |
| CERRAR EVENTO del Manager `eventos.tsx:776-778` | `#CC4127` sobre `#F3EFE4` | 4,20:1 | `colors.rojoTexto #E5634A` sobre `#15110A`, botón outline | 5,57:1 |
| CERRAR EVENTO de Subcomisión `DetalleRecaudacion.tsx:151` | `#CC4127` sobre `#15110A` | 3,90:1 | `#E5634A` sobre `#15110A` | 5,57:1 |
| EGRESOS y NETO negativo `ResumenBalance.tsx:39`; PENDIENTE de los selectores `cobranzas.tsx:576`, `CobrosPanel.tsx:298` | `#CC4127` sobre `#1C1710` / `#15110A` | 3,69 / 3,90:1 | `#E5634A` sobre `#1C1710` | 5,27:1 |
| NETO positivo `ResumenBalance.tsx:38`; PAGADOS `cobranzas.tsx:528`, `eventos.tsx:751` | `#4A7C59` sobre `#1C1710` / `#15110A` | 3,66 / 3,87:1 | `colors.estadoActivo #2ECC71` sobre `#1C1710` | 8,47:1 |
| Subtexto de las stat cards `(subcomision)/diario.tsx:268` | `#7C7267` sobre `#1C1710` | 3,78:1 | `colors.muted #8E8574` | 4,88:1 |
| Detalle del pedido `(manager)/diario.tsx:312` | `#7C7267` sobre `#15110A` | 3,99:1 | `#8E8574` | 5,16:1 |
| Badge ALERTA de la crónica `(subcomision)/diario.tsx:74,79` | `#FFFFFF` sobre `#C9890A` | 2,97:1 | `#15110A` sobre `#C9890A` | 6,33:1 |
| Badge W `informes.tsx:377-378` | `#FFFFFF` sobre `#22C55E` | 2,28:1 | `#15110A` sobre `#22C55E` | 8,25:1 |
| Pills inactivas `informes.tsx:332-334` (14 px) | `#8E8574` sobre `#2C2418` | 4,19:1 | `colors.textoSecundario #B8AD96` | 6,89:1 |
| Badge VIAJE `(subcomision)/eventos.tsx:42,141` (12 px) | `#3B7FC4` sobre `#1C1710` | 4,26:1 | `#5B9BE0` | 6,11:1 |

OK (no tocar): `#8E8574` sobre `#15110A` 5,16 y sobre `#1C1710` 4,88; blanco sobre verde `#4A7C59` 4,86 (badge PAGADO); `#FFAAAA` sobre `#2A1010` 9,82; tab inactiva 5,29; `#C9890A` sobre `#15110A` 6,33.

---

## Tareas sugeridas

- [ ] T1 — **Manager cobranzas: save only changed rows, keep payment history** (S4 / P0-data). `useCobranzas.ts:280-297` upserts every player with local state; `:211-224` ignores the `cobranzas` read error (all show PENDIENTE → save wipes paid rows); `:291-292` re-stamps `fecha_pago`/`registrado_por` for every paid player on each save; `:49-51` uses the UTC date. Fix: track an `original` map, upsert only dirty rows, keep the previous `fecha_pago` for rows already paid, local `YYYY-MM-DD`, block saving when the read failed (error banner + retry). Modal GUARDAR saves that single player and awaits (`cobranzas.tsx:307`). [OTA]
- [ ] T2 — **Manager cobranzas: parse amounts with the local parser and require an amount when paid** (S4). `useCobranzas.ts:53-57` `parseFloat` turns "15.000" into 15 and "1.500,50" into 1.5 (verified). Fix: use `montoSugeridoDe` in the summary (`:79`) and the payload (`:289`); reject `pagado` with an empty/invalid amount ("Falta el monto de {nombre}"); add the "15.000" and "1.500,50" cases to `montoSugerido.check.ts`. [OTA]
- [ ] T3 — **Single source for "% cobrado" / pendientes (denominator = event players)** (S3). `useDiarioSubcomision.ts:127-134`, `useEventos.ts:257-271`, `useInformes.ts:301-323`, `useDiarioManager.ts:103-116` divide by `cobranzas` rows (only paid rows exist for subcomisión recaudaciones; pending rows have `monto null`) → 100 % with 3/80 paid, "$45k / $45k". Fix: RPC `resumen_cobranzas_eventos(p_ids uuid[])` returning `jugadores, pagados, cobrado` with the same visibility rules as `resumen_egresos_evento`; use it in the four hooks; drop `montoTotal` from the manager home. [backend: migration/function]
- [ ] T4 — **Surface network errors instead of empty / "sin división" states; check the close-event result** (S3). Locations in auditor-ux #4 (`useDiarioManager.ts:60-67`, `useCobranzas.ts:103-132,155-168`, `useFichajes.ts:101-126,336-343`, `useDiarioSubcomision.ts:66-155`, `useInformes.ts:101-327`, `useEventos.ts:291-301,361-373`, `useProtocolos.ts:57-64,142-146`). Fix: check `error` on each query, `errorCarga` + retry banner (pattern in `egresos.tsx:75-79`); `cerrarEvento` uses `.select('id')`, shows `errorCierre` on error or 0 rows. [OTA]
- [ ] T5 — **Payment modal: no silent unsaved state, Android Back closes it** (S3 / P1). `cobranzas.tsx:192,307,372,449`, `fichajes.tsx:329`. Fix: X discards that player's edits (restore from `original`); `onRequestClose` on both modals; leaving the event with dirty rows asks "Cambios sin guardar"; success/error banner next to the bottom button, not at the end of the list. [OTA]
- [ ] T6 — **Contrast: cream/gold primary buttons and the 15 other failing pairs** (S3). See the contrast table. Fix: semantic tokens in `components/eventos/estilo.ts` (`BOTON_PRIMARIO` = oro bg + `colors.sobreOro` text; active chips the same; `rojoTexto`, `estadoActivo`, `muted`); `cobranzas.tsx`, `(subcomision)/eventos.tsx`, `fichajes.tsx`, both `diario.tsx`, `informes.tsx`, `protocolos.tsx` import them; extend `lib/contraste.check.ts` with the new pairs. [OTA]
- [ ] T7 — **Accessibility names, roles and states** (S3). Icon-only buttons and selectors listed in auditor-ux #7. Fix: `accessibilityRole`/`accessibilityLabel` on icon buttons; `radio`/`radiogroup` + `accessibilityState.selected` on PAGADO/PENDIENTE, forma de pago, tipo, alcance, divisiones; `tab` on Cobros/Egresos and Activos/Historial; `accessibilityLiveRegion="polite"` on success/error banners + `AccessibilityInfo.announceForAccessibility` after saves. [OTA]
- [ ] T8 — **Subcomisión navigation: 5 tabs, reach Protocolos, delete Dashboard** (S3). `(subcomision)/_layout.tsx` has 6 tabs; `protocolos.tsx` and `dashboard.tsx` have no entry point (entrenador screen says "La Subcomisión los publica aquí"). Fix: proposal = Inicio · Eventos · Noticias · Crónica · Usuarios, Mi perfil moves to the header avatar (as in socio); add "PROTOCOLOS DE LESIONES →" shortcut in `(subcomision)/diario.tsx:199-214`; delete `dashboard.tsx` + `useDashboard.ts`. [decision: confirm the 5 tabs and whether Protocolos lives in Inicio or in its own tab]
- [ ] T9 — **Focus refresh must not unmount the open detail or blank the screen** (S3). `useEventos.ts:146,153` + `(subcomision)/eventos.tsx:566-584` unmounts `DetalleRecaudacion` (typed egreso lost); full-screen spinner on focus in `informes.tsx:261`, both `diario.tsx`, `useFichajes`. Fix: silent `refrescando` state for focus refreshes, skip the list refetch while `paso === 'detalle'`, move `if (loading)` below the detail branches, `RefreshControl` for the silent state. [OTA]
- [ ] T10 — **Fichajes: choose the division; atomic player + fichaje creation** (S3). `useFichajes.ts:107` only uses `divisiones[0]`; `:209-250` creates the player and then the fichaje without a transaction (an orphan player blocks the retry with "ya existe ese DNI"). Fix: load all manager divisions, required DIVISIÓN selector in the modal and a filter on the list; RPC `fichar_jugador(...)` doing player + socio link + fichaje in one transaction. [backend: migration/function]
- [ ] T11 — **Real routes for the detail screens (system Back / edge swipe)** (P1). `cobranzas.tsx:338-447`, `fichajes.tsx:205-326`, `(subcomision)/eventos.tsx:575-596` fake a stack with `paso`. Fix: per-tab `Stack` with `[eventoId].tsx` / `[jugadorId].tsx` / `[id].tsx`; interim `BackHandler` that calls `volverA…` when a detail is open. [OTA]
- [ ] T12 — **Safe-area insets on Android edge-to-edge** (P1). `SafeAreaView` from `react-native` in `cobranzas.tsx:327`, `egresos.tsx:66`, `fichajes.tsx:192`, `(subcomision)/eventos.tsx:606`, `DetalleRecaudacion.tsx:55`, `CobrosPanel.tsx:51`; fixed `paddingTop: 60` in `informes.tsx:326` and `protocolos.tsx`. Fix: `SafeAreaView` from `react-native-safe-area-context` with `edges={['top']}`, `insets.top + 16` for the fixed headers. [OTA]
- [ ] T13 — **Manager home: AR money format and correct copy for club-wide events** (S2). `(manager)/diario.tsx:19-23` prints "$12.5k"; `:74-97` says "PEDIDO ABIERTO / confirmados / CONFIRMAR COMPROBANTE" for a cobranza and shows the raw `descripcion`. Fix: shared `formatMonto` from `estilo.ts` everywhere (remove the copies in `cobranzas.tsx:56`, `eventos.tsx:70`, `diario.tsx:19`, `informes.tsx:228,239`); card copy "COBRANZA DEL CLUB", "{p}/{t} pagaron", "COBRAR →", "$ X por jugador". [OTA]
- [ ] T14 — **Touch targets ≥ 44 pt** (S2). `EgresosPanel.tsx:360` (26), `modalClose` in `cobranzas.tsx:564`, `CobrosPanel.tsx:286`, `eventos.tsx:786`, `fichajes.tsx:536` (28), `backBtn` in `DetalleRecaudacion.tsx:131`, `eventos.tsx:735` (30), `noticias.tsx:266` (~35), the "Cancelar" links in `noticias.tsx:110` and `protocolos.tsx:141`, `fichajes.tsx:508`, pills `eventos.tsx:811`, `informes.tsx:332`, forma de pago `cobranzas.tsx:586`, `CobrosPanel.tsx:305`. Fix: `hitSlop` + `minWidth/minHeight: 44`. [OTA]
- [ ] T15 — **Ref-based double-submit guards** (P2). `useEgresos.ts:284`, `useEventos.ts:399`, `useFichajes.ts:196`. Fix: `useRef` in-flight flag around each submit. [OTA]
- [ ] T16 — **Manager RLS for cobranzas requires an active event** (out of scope, serious). `20261016000000…sql:328-350` lacks `estado = 'activo'` (subcomisión's policy has it); `useCobranzas.cargarEventos` also lists subcomisión recaudaciones. Fix: add the active-event check to `cobranzas_insert_manager` / `cobranzas_update_manager` + SQL scenario test. [backend: migration] [decision: should managers collect payments on subcomisión recaudaciones at all, or only on viajes / tercer tiempos?]
