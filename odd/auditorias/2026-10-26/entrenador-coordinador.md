# Auditoría — entrenador-coordinador

**Repo:** `/home/claude/agusmuzi79/rugby_app_gestion` (commit 5a0ce4c, read-only). Evidencia: código fuente solamente (sin device, sin screenshots).

**Alcance leído (líneas totales):**

| Archivo | Líneas |
|---|---|
| `app/app/(entrenador)/{_layout,diario,asistencia,partido,lesiones,cronica,sobre,salir}.tsx` | 29 + 305 + 438 + 894 + 840 + 2 + 1 + 13 |
| `app/app/(coordinador)/{_layout,diario,calendario,jugadores,asistencia,cronica,sobre,salir}.tsx` | 32 + 321 + 566 + 274 + 239 + 2 + 1 + 13 |
| `app/components/coordinador/ModalMoverJugador.tsx` | 184 |
| `app/components/shared/CronicaScreen.tsx` (**compartido**) | 292 |
| Hooks: `useAsistencia` 288, `usePartido` 561, `useLesiones` 298, `useDiarioEntrenador` 164, `useDiarioCoordinador` (parcial), `useCalendario` 320, `useAsistenciaCoordinador` 173, `useJugadoresDivision` 173, `useMoverJugador` 37, `useCronica` 173, `useRefreshOnFocus` 22 | ~2.505 |
| Soporte: `lib/offlineQueue.ts`, `lib/agenda.ts`, `lib/tipoEvento.ts`, `constants/theme.ts`, `constants/tabOptions.ts`, `components/ui/DatePickerField.tsx` (parcial) | ~250 |
| Backend consultado: `migrations/20260506000000_init_schema.sql` (eventos, lesiones), `20260506000002_rls_policies.sql` (lesiones), `20260507000001_add_equipos.sql`, `20261013000001_pase_temporada_y_mover_jugador.sql`, `functions/notifications/index.ts` (roles) | — |

Total aprox.: **4.446 líneas de pantallas/componentes + ~2.750 de hooks/lib**.

---

# Pasada 1 — auditor-ux

## Veredicto

Auditadas las pantallas del entrenador (Inicio, Asistencia, Partido/Mesa/Resultado, Lesiones) y del coordinador (Inicio, Calendario, Jugadores/Mover, Asistencia) más Crónica, leyendo hooks y Edge Functions. **No está para usarse en la cancha tal como está:** el modo offline es una mentira (lo que se "guarda" sin señal nunca llega a la base), después de las 21 h la asistencia cae en el día siguiente, y los resultados de un partido de ayer no se pueden cargar. El coordinador queda bastante mejor (Mover jugador está bien resuelto), pero ve porcentajes de asistencia incorrectos. Es una pasada heurística única: cubre ~35 % de lo que encontraría un test con entrenadores reales.

**S4:** 3 · **S3:** 8 · **S2:** 1 · **S1:** 0 (dejé afuera 4 S2: push duplicado de "4 ausencias" en cada re-guardado, calendario que arranca 30 días en el pasado, hora con segundos "20:30:00", banner de éxito de Mover que se va a los 4 s; los S2 con valor técnico están en la pasada 2).

## Hallazgos

### S4 — La cola offline nunca se sincroniza: asistencias y lesiones cargadas sin señal se pierden

**Dónde:** `app/hooks/useAsistencia.ts:193-206`, `app/hooks/usePartido.ts:377-390`, `app/hooks/useLesiones.ts:223-233` encolan con `encolar()`; `app/lib/offlineQueue.ts:27-41` exporta `obtenerCola`/`eliminarDeCola`/`tamañoCola` pero **nadie las llama** (grep en `app/` y `supabase/`: cero consumidores). UI: `app/app/(entrenador)/asistencia.tsx:245-246` ("⏳ Pendiente de sincronización"), `lesiones.tsx:653-657` ("LESIÓN REGISTRADA · Se notificará a la Subcomisión").
**Rompe:** Nielsen #1 Visibilidad del estado del sistema · Nielsen #9 · Regla de piso: pérdida de datos sin aviso.
**Por qué:** el entrenador en la cancha sin señal ve "pendiente"/"registrada" y se va tranquilo; el dato queda en AsyncStorage para siempre. La lesión optimista además desaparece de la lista en el próximo foco (`useLesiones.ts:72-76` recarga del servidor). Agravante: `NetInfo.fetch().isConnected` es `true` con señal débil o Wi-Fi sin internet; ahí la request falla y **no** cae a la cola (`useAsistencia.ts:160-168` muestra "No se pudo crear el evento", `useLesiones.ts:203-209` muestra el error crudo).

**Fix:**
```ts
// app/lib/offlineSync.ts (nuevo)
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { obtenerCola, eliminarDeCola } from '@/lib/offlineQueue'

let corriendo = false
export async function sincronizarCola(): Promise<number> {
  if (corriendo) return 0
  const net = await NetInfo.fetch()
  if (net.isInternetReachable === false) return 0
  corriendo = true
  let pendientes = 0
  try {
    for (const item of await obtenerCola()) {
      try {
        if (item.tipo === 'lesion') {
          const { error } = await supabase.from('lesiones').insert(item.payload)
          if (error) throw error
        } else {
          const p = item.payload as { evento_id?: string; division_id: string; fecha?: string; registrado_por: string; jugadores: { jugador_id: string; estado: string }[] }
          const eventoId = p.evento_id ?? await obtenerOCrearEntrenamiento(p.division_id, p.fecha!, p.registrado_por)
          if (!eventoId) throw new Error('evento')
          const { error } = await supabase.from('asistencias').upsert(
            p.jugadores.map(j => ({ ...j, evento_id: eventoId, division_id: p.division_id, registrado_por: p.registrado_por })),
            { onConflict: 'evento_id,jugador_id' })
          if (error) throw error
        }
        await eliminarDeCola(item.id)
      } catch { pendientes++ }
    }
  } finally { corriendo = false }
  return pendientes
}
// obtenerOCrearEntrenamiento: mover acá la función de useAsistencia.ts:212-231, parametrizada por fecha/usuario.
```
```tsx
// app/app/(entrenador)/_layout.tsx — disparadores
useEffect(() => {
  void sincronizarCola()
  const offNet = NetInfo.addEventListener(s => { if (s.isInternetReachable) void sincronizarCola() })
  const app = AppState.addEventListener('change', st => { if (st === 'active') void sincronizarCola() })
  return () => { offNet(); app.remove() }
}, [])
```
- En los tres hooks: si la request online falla por red (`error.message` incluye `Network request failed` / `fetch failed`, o `isInternetReachable === false`), **encolar en vez de mostrar error**.
- Copy honesto: "Guardada en el teléfono. Se sube sola cuando vuelva la señal (N pendientes)." usando `tamañoCola()`; en lesiones reemplazar "Se notificará a la Subcomisión" por eso mismo cuando quedó en cola, y mandar el push recién al sincronizar.
- `crypto.randomUUID()` (`offlineQueue.ts:20`, `useLesiones.ts:226`): reemplazar por `expo-crypto` `randomUUID()` o `` `${Date.now()}-${Math.random().toString(36).slice(2)}` `` (ver "No pude verificar").

---

### S4 — Después de las 21 h la asistencia se guarda en el día siguiente (fecha en UTC)

**Dónde:** `new Date().toISOString().split('T')[0]` en `app/hooks/useAsistencia.ts:52`, `useLesiones.ts:33`, `usePartido.ts:192-193`, `useDiarioEntrenador.ts:33-35`, `useDiarioCoordinador.ts:46-48`, `useAsistenciaCoordinador.ts:44-48`, `useCalendario.ts:136-137`, `app/app/(entrenador)/diario.tsx:17`, `app/app/(coordinador)/calendario.tsx:44,48`.
**Rompe:** Nielsen #2 Relación con el mundo real · Regla de piso: dato incorrecto guardado sin aviso.
**Por qué:** Argentina es UTC−3: desde las 21:00 locales `toISOString()` ya es mañana. El gimnasio del plantel superior es lun/mar/jue 20:30 (CLAUDE.md, cronograma post temporada): tomando lista al final, `obtenerOCrearEvento` no encuentra el entrenamiento de hoy, **crea un entrenamiento fantasma mañana** y le cuelga la asistencia; el header muestra la fecha de mañana (`asistencia.tsx:196`). La lesión arranca con fecha de mañana y el `maximumDate={new Date()}` del picker la contradice. El partido de hoy desaparece de la lista a las 21 h. `lib/agenda.ts:36-42` ya resolvió esto para el socio — no se propagó.

**Fix:**
```ts
// app/lib/fecha.ts (nuevo) — y que lib/agenda.ts lo reutilice
const pad = (n: number) => String(n).padStart(2, '0')
export function fechaLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function fechaLocalMasDias(dias: number, base: Date = new Date()): string {
  return fechaLocal(new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias))
}
```
Reemplazar las 13 apariciones listadas (`hoy()` → `fechaLocal()`, `hace30Dias()` → `fechaLocalMasDias(-30)`, etc.). `useCronica.ts:22` usa `toISOString()` completo contra `created_at` timestamptz: ese está bien, no tocarlo. Agregar `app/lib/fecha.check.ts` con `fechaLocal(new Date(2026, 9, 20, 23, 30)) === '2026-10-20'`.

---

### S4 — Cambiar de división en Asistencia borra las marcas sin guardar, sin avisar

**Dónde:** `app/app/(entrenador)/asistencia.tsx:200-204` → `app/hooks/useAsistencia.ts:143-146` → `fetchJugadores` (`:95-141`) pisa `jugadores` con `estado: null`.
**Rompe:** Nielsen #3 Control y libertad · Nielsen #5 Prevención de errores · Regla de piso (pérdida de datos sin confirmación ni deshacer).
**Por qué:** un entrenador con M15 y M16 marca 28 de 30, toca el chip equivocado (chips de ~30 pt de alto, `asistencia.tsx:324-327`, pegados al header) y pierde todo. Con guantes y al sol, el toque accidental es el caso normal, no el raro.

**Fix:**
```ts
// useAsistencia.ts — guardar el estado persistido para saber si hay cambios
export interface JugadorConEstado { id: string; nombre_completo: string; estado: EstadoAsistencia | null; estadoGuardado: EstadoAsistencia | null }
// en fetchJugadores: estadoGuardado = estadoMap[j.id] ?? null ; tras guardar OK: setJugadores(p => p.map(j => ({ ...j, estadoGuardado: j.estado })))
const sinGuardar = jugadores.filter(j => j.estado !== j.estadoGuardado).length

function seleccionarDivision(id: string) {
  if (id === divisionId) return
  if (sinGuardar === 0) { setDivisionId(id); return }
  Alert.alert(
    'Asistencia sin guardar',
    `Tenés ${sinGuardar} marca${sinGuardar > 1 ? 's' : ''} sin guardar en ${divisionNombre}.`,
    [
      { text: 'Seguir marcando', style: 'cancel' },
      { text: 'Guardar y cambiar', onPress: async () => { if (await guardarAsistencia()) setDivisionId(id) } },
      { text: 'Descartar', style: 'destructive', onPress: () => setDivisionId(id) },
    ],
  )
}
```
(`guardarAsistencia` tiene que devolver `boolean`). Mismo criterio para `usePartido.ts:251-260` (`seleccionarPartido` resetea asistencia/mesa en memoria).

---

### S3 — Tokens invertidos: botones y tarjetas principales a 1.15–2.98:1

**Dónde:** ver tabla de contraste al final (24 ubicaciones). Las más graves: `ModalMoverJugador.tsx:181-183` (CONFIRMAR CAMBIO, oro sobre crema 1.60), `partido.tsx:856-859` (GUARDAR Y CONTINUAR / GUARDAR MESA / GUARDAR RESULTADO, 1.60), `lesiones.tsx:835-837` (REGISTRAR LESIÓN, 1.60), `diario.tsx` entrenador `:246-272` (tarjeta Próximo evento + TOMAR ASISTENCIA, 1.60), `diario.tsx:76,283-286` (badge MESA blanco sobre crema, **1.15**).
**Rompe:** WCAG 2.2 SC 1.4.3 Contraste (Mínimo), AA · lección #1 del brief (`cab360a`).
**Por qué:** es exactamente el bug que se arregló en socio con `sobreOro`/`oroSobreClaro`, pero en estas pantallas sigue. Al sol de la cancha, 1.60:1 es ilegible: el entrenador no ve el texto del botón que tiene que tocar.

**Fix:** dos reglas mecánicas, sin cambiar `theme.ts`:
- Texto sobre `TEXTO`/`colors.tinta` (crema) que hoy es `colors.oro` u `oroHondo` → `colors.oroSobreClaro` (#7A4F00, **6.20:1**). Grises sobre crema (`#9A8870`, `#C9B98A`) → `#5C4A2E` (7.39:1).
- Texto sobre `colors.oro`/`oroHondo` que hoy es `colors.tinta` o blanco → `colors.sobreOro` (#15110A, 10.24 / 6.33:1).
- Texto chico rojo/verde sobre fondo: `colors.rojoUrgente` → `colors.rojoTexto` (5.57), `#4A7C59` → `colors.confirmacion` (8.25).
- Agregar estos pares a `app/lib/contraste.check.ts`.

---

### S3 — Tomar asistencia de 30 jugadores: 31 toques sobre targets de ~24 pt, separados 5 pt

**Dónde:** `app/app/(entrenador)/asistencia.tsx:106-123` (3 badges por fila), estilos `:399-411` (`paddingVertical: 4`, `paddingHorizontal: 7`, `fontSize: 12`, `gap: 5`), GUARDAR arriba a la derecha `:183-193,301-310`; `useAsistencia.ts:108-112` arranca todos en `null` y `:170-172` sólo guarda los marcados.
**Rompe:** Ley de Fitts · Nielsen #7 Flexibilidad y eficiencia (sin acción en lote) · Nielsen #4 Consistencia (en Partido todos arrancan PRESENTE, `usePartido.ts:222-227`; en Entrenamiento arrancan vacíos).
**Por qué:** badge = 4+4 padding + ~14.4 línea + 2 borde ≈ **24 pt de alto** (justo el mínimo AA, 20 pt menos que HIG 44 / Material 48), con 5 pt entre PRES y AUS: con guantes o el pulgar mojado se marca el estado equivocado y no se nota. Caso típico 30 jugadores con 3 ausentes: hoy **30 toques + 1 GUARDAR = 31**, y el botón GUARDAR está en la esquina superior derecha (la zona menos alcanzable con una mano) después de scrollear 30 filas. Los no marcados no se guardan: quedan sin fila y distorsionan el % del coordinador (ver S3 de % abajo).

**Fix:** "Todos presentes" + targets de 44 + guardar abajo. Con el fix: 1 + 3 + 1 = **5 toques**.
```tsx
// Encima de la lista
<TouchableOpacity style={s.todosBtn} onPress={marcarTodosPresentes}
  accessibilityRole="button" accessibilityLabel="Marcar a todos presentes">
  <Text style={s.todosTexto}>✓ TODOS PRESENTES</Text>
</TouchableOpacity>
// hook: function marcarTodosPresentes() { setGuardado(false); setJugadores(p => p.map(j => j.estado ? j : { ...j, estado: 'presente' })) }

// Fila: badges como segmentos de 44
badgesRow: { flexDirection: 'row', gap: 8 },
badge:     { minWidth: 52, minHeight: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 4, borderWidth: 1.5 },
badgeTexto:{ fontFamily: fonts.label, fontSize: 14, letterSpacing: 1 },

// GUARDAR sale del header a un footer fijo
<View style={[s.footer, { paddingBottom: 12 }]}>
  <TouchableOpacity style={s.guardarFooter} onPress={guardarAsistencia} disabled={guardando}
    accessibilityRole="button" accessibilityLabel={`Guardar asistencia, ${marcados} de ${jugadores.length} marcados`}>
    <Text style={s.guardarFooterTexto}>GUARDAR · {marcados}/{jugadores.length}</Text>
  </TouchableOpacity>
</View>
guardarFooter: { backgroundColor: colors.oro, minHeight: 52, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
guardarFooterTexto: { color: colors.sobreOro, fontFamily: fonts.label, fontSize: 15, letterSpacing: 2 },
```
Si `marcados < jugadores.length` al guardar: `Alert` "Faltan N sin marcar. ¿Los marcás presentes?" [Marcar presentes] [Guardar igual]. Sumar `Haptics.selectionAsync()` (expo-haptics) en cada marca — confirma sin mirar.

---

### S3 — "TOMAR ASISTENCIA" escribe en el evento equivocado

**Dónde:** `app/app/(entrenador)/diario.tsx:61-65,144` muestra el botón para el **próximo** evento (puede ser un partido o un entrenamiento de otro día) y navega a `/(entrenador)/asistencia` sin parámetros; `app/hooks/useAsistencia.ts:115-122,212-231` siempre busca/crea un `entrenamiento` **de hoy** con `.maybeSingle()`.
**Rompe:** Nielsen #2 · Nielsen #5 Prevención de errores · Modelo mental (el botón está pegado a la tarjeta de un evento concreto).
**Por qué:** (a) próximo evento = partido del sábado, hoy miércoles → la asistencia va a un entrenamiento fantasma creado hoy, y la del partido queda vacía. (b) Próximo = entrenamiento del jueves → se guarda el miércoles. (c) Dos entrenamientos el mismo día (doble turno, gimnasio + cancha): `maybeSingle()` devuelve error por múltiples filas, `data` es null, y se **crea un tercero** (`eventos` no tiene unique, `init_schema.sql:166-178`); al reabrir no se precargan las marcas.

**Fix:**
```tsx
// diario.tsx — CardEvento
const esDeHoy = ev.fecha === fechaLocal()
{ev.tipo === 'entrenamiento' && esDeHoy && (
  <TouchableOpacity onPress={() => router.navigate({ pathname: '/(entrenador)/asistencia', params: { eventoId: ev.id } })} …>TOMAR ASISTENCIA →</TouchableOpacity>
)}
{ev.tipo === 'partido' && esDeHoy && (
  <TouchableOpacity onPress={() => router.navigate('/(entrenador)/partido')} …>MESA Y ASISTENCIA →</TouchableOpacity>
)}
```
```ts
// useAsistencia.ts — usar el evento recibido; si no hay, listar los de hoy
const { eventoId } = useLocalSearchParams<{ eventoId?: string }>()
const { data: eventosHoy, error } = await supabase.from('eventos')
  .select('id, hora').eq('tipo', 'entrenamiento').eq('division_id', divId)
  .eq('fecha', fechaLocal()).eq('cancelado', false).order('hora', { nullsFirst: false })
// 0 → se crea al guardar; 1 → ese; >1 → chips "20:30 / 22:00" para elegir (default: eventoId o el más cercano a la hora actual)
```
Nunca usar `.maybeSingle()` sobre `eventos` por (división, fecha, tipo).

---

### S3 — Los resultados de un partido pasado no se pueden cargar; "RESULTADO pendiente" lleva a un callejón sin salida

**Dónde:** `app/hooks/usePartido.ts:192-211` lista partidos `fecha >= hoy` y `<= hoy+14`; `app/hooks/useDiarioEntrenador.ts:85-89,120-126` arma la tarea "N partidos sin resultado cargado" con partidos de los **últimos 3 días** y la manda a `/(entrenador)/partido`. Además `usePartido.ts:188` y `useDiarioEntrenador.ts:59` usan sólo `divisiones[0]`.
**Rompe:** Nielsen #3 (no hay salida: la tarea pendiente no se puede cumplir) · Nielsen #4 Consistencia (Asistencia y Lesiones sí tienen selector de división, `asistencia.tsx:50-83`, `lesiones.tsx:204-237`).
**Por qué:** el caso real de carga de resultados es "domingo a la noche o lunes, para el partido del sábado". Hoy eso es imposible en la app: el partido ya no aparece. Y un entrenador con 2 divisiones no puede cargar mesa ni resultado de la segunda **nunca**.

**Fix:**
```ts
// usePartido.ts
const desde = fechaLocalMasDias(-7), hasta = fechaLocalMasDias(14)
supabase.from('eventos').select('id, fecha, rival, lugar, resultados(equipo_id)')
  .eq('tipo', 'partido').in('division_id', [divisionId]).eq('cancelado', false)
  .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false })
```
En `SelectorPartidos` (`partido.tsx:154-198`): sección "SIN RESULTADO" (pasados sin fila en `resultados`) arriba, luego "PRÓXIMOS". Al entrar desde la tarea RESULTADO, preseleccionar el partido y saltar a paso `resultado`. Agregar a `usePartido` las `divisiones` + `seleccionarDivision` igual que `useAsistencia.ts:56-88,143-146`, y en `useDiarioEntrenador` consultar con `.in('division_id', divIds)`.

---

### S3 — Sin señal (o con un error de red), la app dice "Sin división asignada. Contactá a la Subcomisión."

**Dónde:** `const { data } = await …` sin mirar `error` en `app/hooks/useAsistencia.ts:65-77,79-87,101-112,115-137`, `useLesiones.ts:84-99,107-123,131-138,146-152`, `usePartido.ts:182-189,195-220,320-325`, `useDiarioEntrenador.ts:55-65` + `catch {}` en `:158`, `useDiarioCoordinador.ts:68-75,187`, `useAsistenciaCoordinador.ts:54-90,125-145`, `useCalendario.ts:103-125`, `useCronica.ts:64-68,167`.
**Rompe:** Nielsen #9 Reconocer, diagnosticar y recuperarse de errores · Nielsen #1 · lección #2 del brief.
**Por qué:** en la cancha, sin señal, `profile` es `null` → `divIds = []` → `sinDivision = true` → mensaje falso que manda al entrenador a reclamarle a la Subcomisión. En las demás queries un error se ve como "Sin lesiones registradas", "Sin partidos programados", "Sin novedades", lista de 0 jugadores. `useJugadoresDivision.ts:62-72,88-99,118-131` (coordinador › Jugadores) ya hace esto bien: es el patrón a copiar.

**Fix:** en cada hook, `errorCarga: string | null` + `recargar()`:
```ts
const { data: profile, error: errProfile } = await supabase.from('profiles').select('divisiones').eq('id', session.user.id).single()
if (errProfile) { setErrorCarga('No pudimos cargar tus datos. Revisá la señal.'); setLoading(false); return }  // NO tocar sinDivision
```
```tsx
{errorCarga && (
  <View style={s.errorBanner} accessibilityRole="alert">
    <Text style={s.errorTexto}>{errorCarga}</Text>
    <TouchableOpacity onPress={recargar} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button">
      <Text style={s.reintentar}>Reintentar</Text>
    </TouchableOpacity>
  </View>
)}
```
Las pantallas de carga (Asistencia/Partido/Lesiones) deberían además cachear el último plantel en AsyncStorage (`plantel:${divId}`) para poder marcar sin señal — sin eso, el modo offline del S4 sólo sirve si la lista ya estaba cargada.

---

### S3 — El % de asistencia del coordinador cuenta como faltas los entrenamientos donde no se tomó lista

**Dónde:** `app/hooks/useAsistenciaCoordinador.ts:61-69,92-101` (`totalEventos` = todos los eventos no cancelados de los últimos 30 días hasta hoy, tengan o no asistencia; denominador igual para todos), mostrado en `app/app/(coordinador)/asistencia.tsx:49-60` y en las barras de `diario.tsx` coordinador (vía `useDiarioCoordinador`).
**Rompe:** Nielsen #2 (el dato no representa la realidad) · lección #8 del brief (lógica que muestra un dato incorrecto).
**Por qué:** el cronograma post temporada cargó 36 eventos por división; si el entrenador no tomó lista en 6 de los 12 de este mes, **todo el plantel aparece con ≤50 % en rojo**. El evento de hoy cuenta antes de que pase. Un jugador que se sumó (o fue movido) hace una semana tiene 4 eventos posibles pero se lo divide por 12. Además `fetchDivisiones` en cada foco (`:39,148-149`) vuelve a la primera división: el coordinador pierde la que estaba mirando.

**Fix:**
```ts
// traer evento_id para saber en qué eventos se tomó lista
.from('asistencias').select('jugador_id, estado, evento_id').in('evento_id', eventoIds30)

const conLista = new Set(asistencias30.map(a => a.evento_id))
const totalEventos = conLista.size // eventos donde efectivamente se tomó asistencia
// por jugador: sólo los eventos donde tiene registro
const registros  = asistencias30.filter(a => a.jugador_id === j.id)
const presentes  = registros.filter(a => a.estado === 'presente').length
const porcentaje = registros.length > 0 ? Math.round(presentes / registros.length * 100) : null
// detalle: `${presentes} de ${registros.length} entrenamientos con lista`
```
y en `fetchDivisiones`: `setDivisionSeleccionada(prev => prev && divs.some(d => d.id === prev) ? prev : divs[0]?.id ?? null)`. **[decision]** ¿`justificado` cuenta como presente, como falta, o se excluye del denominador? Hoy cuenta como falta.

---

### S3 — Controles sin nombre ni estado para VoiceOver/TalkBack (0 props de accesibilidad en `(entrenador)`)

**Dónde:** grep `accessibilityLabel|accessibilityRole` en `app/app/(entrenador)/` = **0**. Casos: badges PRES/AUS/JUST (`asistencia.tsx:110-120`, ×30 filas, se leen "PRES, botón" sin nombre del jugador ni si está marcado), PRES/AUS de partido (`partido.tsx:78-95`), botones T / S de mesa (`partido.tsx:131-146`), ✕ de quitar de mesa (`:116-123`), grado 1–5 (`lesiones.tsx:430-439`), cerrar modal (ícono solo, `:585-592`), volver de historial (chevron solo, `:148-150`), pestañas LESIONES/PROTOCOLOS (`:249-258`), chips de división (`asistencia.tsx:69-78`, `lesiones.tsx:223-232`), ✕ cancelar evento (`calendario.tsx:89-91`), tipo de evento (`calendario.tsx:153-166`). Mensajes de estado sin live region: `asistencia.tsx:239-250`, banners de `partido.tsx:362-369,495-502,601-608`, `lesiones.tsx:646-658`.
**Rompe:** WCAG 2.2 SC 4.1.2 Nombre, función, valor (A) · SC 4.1.3 Mensajes de estado (AA).
**Por qué:** tomar asistencia con lector de pantalla es imposible (90 botones "PRES/AUS/JUST" indistinguibles). Coordinador › Jugadores y ModalMoverJugador sí lo hacen bien: el patrón ya existe en el repo.

**Fix:**
```tsx
// asistencia.tsx FilaJugador
<View style={s.badgesRow} accessibilityRole="radiogroup" accessibilityLabel={`Asistencia de ${item.nombre_completo}`}>
  {BADGES.map(badge => (
    <TouchableOpacity key={badge.key} …
      accessibilityRole="radio"
      accessibilityState={{ checked: item.estado === badge.key }}
      accessibilityLabel={`${item.nombre_completo}: ${badge.nombre}`}>  {/* nombre: 'Presente' | 'Ausente' | 'Justificado' */}
```
```tsx
// partido.tsx FilaMesa
accessibilityLabel={`Poner a ${jugador.nombre_completo} de titular`} / `… de suplente` / `Sacar a … de la mesa`
// lesiones.tsx
<TouchableOpacity onPress={cerrarModal} accessibilityRole="button" accessibilityLabel="Cerrar sin guardar" …>
<TouchableOpacity onPress={onVolver} accessibilityRole="button" accessibilityLabel="Volver a lesiones" …>
// grado: accessibilityRole="radio" accessibilityState={{ checked: activo }} accessibilityLabel={`Grado ${g}${g === 1 ? ', leve' : g === 5 ? ', grave' : ''}`}
// calendario ✕: accessibilityRole="button" accessibilityLabel={`Cancelar ${tituloEvento(evento)} del ${fechaCorta(evento.fecha)}`}
// banners de estado
<View style={s.statusBar} accessibilityLiveRegion="polite" accessibilityRole="alert">
// + AccessibilityInfo.announceForAccessibility('Asistencia guardada') al terminar (iOS ignora liveRegion)
```

---

### S3 — Targets por debajo del mínimo en acciones frecuentes (algunos debajo de 24 pt AA)

**Dónde (medido = padding + contenido):**
| Control | Ubicación | Tamaño | Falta |
|---|---|---|---|
| "VER HISTORIAL DEL JUGADOR" | `lesiones.tsx:118-125,762-763` | ~15 pt alto (sin padding) | 9 pt para AA, 29 para HIG |
| "Cancelar"/"Volver" (texto) | `calendario.tsx:143-145,330-332,538`, `ModalMoverJugador.tsx:61-69,157` | ~20 pt alto | 4 pt para AA |
| "Reintentar" | `jugadores.tsx:187-189,269` | ~17 pt alto | 7 pt para AA |
| Cerrar modal lesión (ícono 20 + padding 4) | `lesiones.tsx:585-592,808` | 28×28 | 16 pt |
| Volver historial (22 + 4) | `lesiones.tsx:148-150,709` | 30×30 | 14 pt |
| ✕ cancelar evento | `calendario.tsx:89-91,559-560` | ~26×36 | 8–18 pt |
| T / S mesa | `partido.tsx:850` | 34×34, gap 6 | 10 pt |
| "Mover a…" | `jugadores.tsx:262-263` | ~36 alto | 8 pt |
| Chips división | `asistencia.tsx:324-327`, `lesiones.tsx:713-716`, `jugadores.tsx:246` | ~30 alto | 14 pt |
| "← VOLVER" | `partido.tsx:864-865` | ~36 alto, ancho de texto | 8 pt |

**Rompe:** WCAG 2.2 SC 2.5.8 Target Size (Minimum), AA (las tres primeras filas) · Ley de Fitts / HIG 44 pt / Material 48 dp (el resto).
**Por qué:** uso con una mano, guantes, apuro. Los destructivos (✕ cancelar evento, ✕ sacar de mesa) además son los más chicos.

**Fix:** regla única: todo `TouchableOpacity` con `minHeight: 44` (y `minWidth: 44` si es ícono) + `justifyContent: 'center'`; para links de texto, `hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}` además de `paddingVertical: 10`. Ej.:
```ts
modalClose:  { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
backBtn:     { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
historialLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, minHeight: 44, alignSelf: 'flex-start' },
cancelarBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
mesaRolBtn:  { width: 44, height: 44, … }, mesaBotones: { flexDirection: 'row', gap: 8 },
divisionChip:{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', … },
```

---

### S2 — Lesiones: "ACTIVAS" muestra todas las lesiones históricas y no hay forma de corregir una mal cargada

**Dónde:** `app/app/(entrenador)/lesiones.tsx:539-545` ("ACTIVAS" + conteo) sobre `useLesiones.ts:107-112` (todas las de la división, sin filtro); la tabla `lesiones` no tiene alta/estado (`init_schema.sql:263-273`). No hay editar/borrar en la UI aunque la RLS permite `update` al entrenador (`rls_policies.sql:470-475`).
**Rompe:** Nielsen #2 (el rótulo no coincide con el dato) · Nielsen #3 (no se puede deshacer un error: jugador o grado equivocado queda para siempre y ya disparó el push a la Subcomisión).
**Por qué:** tras una temporada, "ACTIVAS 47" con lesiones de marzo; el entrenador no distingue quién está lesionado hoy, que es para lo que abre la pantalla.

**Fix:** corto plazo (OTA): rótulo "REGISTRADAS" y separar "ÚLTIMOS 30 DÍAS" / "ANTERIORES"; en la tarjeta expandida, "EDITAR" (reusar el modal con los valores, `update` por id) para el que la registró. **[decision]** ¿Querés estado de alta (`fecha_alta date null`, "ACTIVAS" = sin alta)? Eso es migración + botón "DAR DE ALTA".

## Lo que está bien

- **Mover jugador** (`ModalMoverJugador.tsx`): flujo en dos pasos (elegir → confirmar con resumen DE/A y aviso de qué pasa con el historial), "Volver" sin cerrar, `onRequestClose` bloqueado mientras mueve, errores del RPC en español en un banner `alert`, labels accesibles completos. Cumple Nielsen #3 por confirmación. No romper esto al tocar el color del botón.
- `useJugadoresDivision.ts`: errores explícitos con Reintentar, guarda contra respuestas viejas (`ultimaConsulta`), mantiene la selección al recargar. Es el patrón a copiar en los demás hooks.
- Partido arranca con todos PRESENTES y la mesa limita 15/8 con contador visible y botones deshabilitados al llenarse (`partido.tsx:42-59,132-146`): buena prevención de errores (Nielsen #5).
- Cancelar evento exige motivo y avisa antes qué se va a publicar y a quién (`calendario.tsx:345-359`): consentimiento informado de una acción con efectos externos.
- Tab bars: 4 (entrenador) y 5 (coordinador) pestañas, con etiqueta (`tabOptions.ts`), inactivo a 5.29:1.

## No pude verificar

- Contraste y legibilidad real al sol, y si el pulgar con guantes acierta: necesita prueba en cancha con 2–3 entrenadores (recomendado antes de cualquier decisión cara sobre Asistencia).
- Si `crypto.randomUUID` existe en Hermes/RN 0.81 de la app (`offlineQueue.ts:20`): si no existe, `encolar()` tira, `guardando` queda en `true` y el botón GUARDAR gira para siempre. Probar en un teléfono en modo avión.
- Comportamiento con Dynamic Type / tamaño de fuente grande (filas de asistencia con nombre `numberOfLines={1}` + 3 badges).
- Lector de pantalla real (orden de lectura, anuncios).
- Si iOS dispara `onRequestClose` al deslizar hacia abajo el `pageSheet` de Nueva lesión (`lesiones.tsx:573`, sin `onRequestClose`): si no, el estado `modalVisible` queda desincronizado.
- `useDiarioCoordinador.ts` sólo lo leí parcialmente (carga, errores); no audité el cálculo de sus barras más allá de que comparte la lógica de `%`.

---

# Pasada 2 — impeccable audit (native: iOS + Android)

`impeccable detect` no aplica (es para web, y `audit.native.md` lo excluye explícitamente); auditado desde código contra `audit.native.md`, `ios.md`, `android.md`.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 1 | Cero labels en `(entrenador)`, targets de 15–34 pt, contraste 1.15–1.60 en botones principales (= auditor-ux) |
| 2 | Performance | 2 | Listas OK (FlatList en Asistencia/Jugadores), pero N+1 de 30–40 queries por cada GUARDAR y recargas con spinner en cada foco |
| 3 | Appearance & Theming | 1 | Cada pantalla redefine `FONDO/TEXTO/CARD/MUTED/DIVIDER` en hex; colores fuera de paleta; inversión de `tinta` sin migrar |
| 4 | Platform Conformance | 2 | `SafeAreaView` de RN con `edgeToEdgeEnabled` (header bajo la status bar en Android), modal sin Back en Android, rutas ocultas sin "atrás" |
| 5 | Adaptivity | 2 | `supportsTablet: true` con layout de teléfono estirado; teclado sin `behavior` en Android (calendario) |
| **Total** | | **8/20** | **Poor** |

## Platform Conformance Verdict

**No pasa del todo.** Lee como app nativa en estructura (Tabs, Modal `pageSheet`, FlatList con pull-to-refresh), pero falla en garantías del sistema: en Android con edge-to-edge el header de 6 pantallas se mete bajo la status bar, el modal de lesión no responde al botón Atrás, y Partido/Lesiones son pestañas ocultas a las que se llega sin barra de navegación ni gesto de vuelta claro. La navegación de pasos de Partido ("← VOLVER" dibujado en el contenido) duplica lo que debería ser un stack.

## Executive Summary

- **8/20 (Poor).** P0: 0 · P1: 3 · P2: 4 · P3: 2 (más 4 que coinciden con auditor-ux).
- Top: (1) `SafeAreaView` inerte en Android edge-to-edge; (2) Modal de lesión sin `onRequestClose`; (3) Lesiones/Partido como tabs ocultas sin back; (4) N+1 + push duplicado al guardar asistencia; (5) recargas con spinner en cada foco.
- Siguiente paso: los 3 P1 son OTA y baratos; hacerlos junto con el S3 de contraste porque tocan los mismos archivos.

## Detailed Findings by Severity

- **(= auditor-ux S3 contraste)** · **(= auditor-ux S3 labels)** · **(= auditor-ux S3 targets)** · **(= auditor-ux S3 errores tragados)**

### [P1] `SafeAreaView` de react-native no hace nada en Android con edge-to-edge
- **Location:** `import { SafeAreaView } from 'react-native'` en `app/app/(entrenador)/asistencia.tsx:9,158,174`, `partido.tsx:8,653,671`, `lesiones.tsx:9,146,474,501,578`, `app/app/(coordinador)/jugadores.tsx:10,141,161`, `calendario.tsx:12,140,327,420,436`, `asistencia.tsx:9,115,125`, `components/coordinador/ModalMoverJugador.tsx:10,58`; `app.config.js:39` `edgeToEdgeEnabled: true`.
- **Category:** Conformance
- **Impact:** el `SafeAreaView` de RN sólo aplica insets en iOS. En Android edge-to-edge el título "Toma de asistencia" y el botón GUARDAR (que hoy vive en el header) quedan bajo la status bar / cutout. El socio ya migró a `react-native-safe-area-context` (`(socio)/calendario.tsx:8`, `carnet.tsx:10`); estas pantallas no.
- **Guideline:** Material — edge-to-edge con window insets; HIG — safe area.
- **Recommendation:** `import { SafeAreaView } from 'react-native-safe-area-context'` con `edges={['top']}` en pantallas de tab (el tab bar ya maneja abajo) y `edges={['top','bottom']}` dentro de los Modal. [OTA]
- **Suggested command:** /impeccable adapt

### [P1] Modal "Nueva lesión" sin `onRequestClose`: el botón Atrás de Android no hace nada
- **Location:** `app/app/(entrenador)/lesiones.tsx:573`
- **Category:** Conformance
- **Impact:** el entrenador aprieta Atrás para salir del formulario y no pasa nada (RN además loguea warning). Los otros modales del área sí lo tienen (`calendario.tsx:138,325`, `ModalMoverJugador.tsx:57`, `CronicaScreen.tsx:154`).
- **Guideline:** Material — "System Back always works".
- **Recommendation:** `onRequestClose={() => { if (!guardando) confirmarDescarte() }}`, donde `confirmarDescarte` pregunta sólo si hay jugador/grado/descripción cargados ("¿Descartar la lesión?" [Seguir] [Descartar]). Mismo guard en el botón ✕. [OTA]
- **Suggested command:** /impeccable harden

### [P1] Partido y Lesiones son pestañas ocultas: sin título de navegación, sin "atrás", ninguna pestaña resaltada
- **Location:** `app/app/(entrenador)/_layout.tsx:24-26` (`href: null`), se llega sólo desde atajos de `diario.tsx:171-201` y Crónica.
- **Category:** Conformance
- **Impact:** al entrar a Lesiones el usuario ve la tab bar con ninguna pestaña activa y no hay back en pantalla; en iOS no hay edge-swipe porque no es un push de stack. Dos de las cuatro tareas centrales del entrenador (lesiones, resultados) no están en la navegación principal (Reconocimiento > recuerdo).
- **Guideline:** HIG — tab bar para secciones, navigation stack para jerarquía; Material — navigation bar 3–5 destinos.
- **Recommendation:** **[decision]** opción A: 5 pestañas (Inicio · Asistencia · Partido · Lesiones · Crónica) y "Mi perfil" al avatar del Header como se hizo en socio. Opción B: `Stack` dentro de Inicio (`(entrenador)/(inicio)/_layout.tsx` con `diario`, `lesiones`, `partido`) para tener header con back y gesto nativo. A es lo más coherente con la decisión del socio. [OTA]
- **Suggested command:** /impeccable layout

### [P2] Recarga en cada foco con spinner de pantalla completa (lección #3)
- **Location:** `app/hooks/useDiarioEntrenador.ts:48-52`, `useDiarioCoordinador.ts:61-65`, `useCronica.ts:57-61` (→ `CronicaScreen.tsx:134-135` spinner reemplaza el feed), `useCalendario.ts:99-101,189` + `calendario.tsx:466-467` (`refreshing={loading}` muestra el pull-to-refresh en cada foco), `useAsistenciaCoordinador.ts:39,42` (además resetea la división, ver auditor-ux).
- **Category:** Performance
- **Impact:** cada cambio de pestaña parpadea y pierde el scroll; en 3G de la cancha son 1–3 s de pantalla vacía.
- **Recommendation:** `fetchTodo({ silencioso: true })` desde `useRefreshOnFocus`: sólo `setLoading(true)` si todavía no hay datos (`if (!cargadoUnaVez.current) setLoading(true)`); `refreshing` atado a un estado `refrescando` que sólo prende el pull manual. [OTA]
- **Suggested command:** /impeccable optimize

### [P2] Cada GUARDAR de asistencia dispara 30–40 queries y re-envía el push de "4 ausencias"
- **Location:** `app/hooks/useAsistencia.ts:191,233-268`
- **Category:** Performance
- **Impact:** `Promise.all` de una query por jugador (N+1) justo cuando la señal es mala, y el spinner del botón espera a todas. Cada re-guardado (corregir una marca) vuelve a invocar `notifications` para los mismos jugadores → push e inserción en `notificaciones` duplicados (Crónica los muestra repetidos).
- **Recommendation:** una sola query `asistencias.select('jugador_id, estado, created_at').eq('division_id', divId).in('jugador_id', ids).order('created_at', { ascending: false })` y agrupar en memoria; notificar sólo si **esta** marca convirtió al jugador en 4 seguidas (antes 3 ausentes + hoy ausente), no si ya estaba en 4. Ideal: moverlo a un trigger/RPC. Correrlo después de mostrar "guardada" (no bloquea el botón). [OTA] (trigger = [backend: migration])
- **Suggested command:** /impeccable optimize

### [P2] Tokens: cada pantalla redefine la paleta en hex local
- **Location:** `partido.tsx:23-29`, `lesiones.tsx:23-30,33-43`, `asistencia.tsx` (entrenador) `:18-20,258-259`, `asistencia.tsx` (coordinador) `:16-23`, `calendario.tsx:26-32`, `jugadores.tsx:23-28`, `ModalMoverJugador.tsx:17-22`, `salir.tsx:12` (ambos roles); fuera de paleta: `#4A7C59`, `#F97316`, `#22C55E` como const local, `#FFAAAA`/`#2A1010`, `#9A8870`, `#C9B98A`, `#7A6D50`, `#7C7267`, `#7A7060`, `#A89E8C`, `#9B9183`. `DatePickerField.tsx:6-9,134` usa otra paleta (campo blanco `#fff` en UI oscura, oro `#C9A84C`).
- **Category:** Theming
- **Impact:** es la causa raíz del bug de contraste: el refactor de `cab360a`/T17 no alcanza a pantallas que no leen `colors.*`. Un rediseño (planeado tras la auditoría del socio) no va a llegar a estas pantallas.
- **Recommendation:** reemplazar consts locales por `colors.fondo/card/texto/muted/borde/confirmacion/rojoTexto`; agregar a `theme.ts` `exitoSobreFondo` (#22C55E) y `errorFondo` (#2A1010) / `errorTexto` (#FFAAAA) y extender `lib/tokens.check.ts`. Hacerlo en el mismo PR que el fix de contraste. [OTA]
- **Suggested command:** /impeccable colorize

### [P2] Errores crudos de Postgres en pantalla
- **Location:** `useAsistencia.ts:185`, `usePartido.ts:373,456,468,511`, `useLesiones.ts:206`, `useCalendario.ts:247`.
- **Category:** Conformance (copy)
- **Impact:** "Error al guardar: new row violates row-level security policy for table…" en inglés y sin acción. Nielsen #9 (qué/dónde/cómo).
- **Recommendation:** helper `mensajeError(err)`: red → "Sin conexión. Se guarda en el teléfono y se sube sola." (y encolar, ver S4); RLS/42501 → "No tenés permiso para esta división. Avisale a la Subcomisión."; resto → "No se pudo guardar. Probá de nuevo." + `console.warn(err)`. [OTA]
- **Suggested command:** /impeccable clarify

### [P3] Calendario del coordinador arranca 30 días en el pasado y muestra la hora con segundos
- **Location:** `useCalendario.ts:131-148` (desde hace 30 días, orden ascendente), `calendario.tsx:60,67,82,510` (`opacity: 0.5` en pasados; `evento.hora` crudo "20:30:00").
- **Category:** Adaptivity/Conformance
- **Impact:** con el cronograma cargado (36 eventos × 5 divisiones) el coordinador scrollea un mes de historia para ver el próximo evento.
- **Recommendation:** `SectionList` con "PRÓXIMOS" primero y "ÚLTIMOS 30 DÍAS" colapsado al final; `evento.hora.slice(0, 5)`. [OTA]
- **Suggested command:** /impeccable layout

### [P3] `console.log` de producción en el calendario
- **Location:** `useCalendario.ts:139,150-151,224,246,250`
- **Category:** Performance
- **Recommendation:** borrarlos o envolver en `if (__DEV__)`. [OTA]
- **Suggested command:** /impeccable polish

## Patterns & Systemic Issues

- `const { data } = await supabase…` sin `error` en 9 de 11 hooks del área: sólo `useJugadoresDivision` y `useMoverJugador` manejan errores.
- `divIds[0]` asumido en 4 lugares (`usePartido`, `useDiarioEntrenador`, `useCronica`, header del diario coordinador) mientras otras 3 pantallas soportan varias divisiones.
- Fechas de calendario con `toISOString()` en 13 lugares.
- `TEXTO` como fondo de "botón primario" en 12 estilos: un solo patrón mal migrado.

## Positive Findings

- `FlatList` + `keyExtractor` + `onRefresh` en Asistencia, Jugadores y Calendario.
- `ModalMoverJugador` y Jugadores: los únicos con `accessibilityRole/State/Label` completos; reusarlos como referencia.
- `useScrollToTop` en las pestañas (tap en pestaña activa vuelve arriba): comportamiento nativo esperado.
- Etiquetas en la tab bar y ≤5 pestañas (cumple HIG/Material).

## Recommended Actions

1. **[P1] `/impeccable adapt`**: migrar `SafeAreaView` a `react-native-safe-area-context` en las 7 pantallas/modales listados.
2. **[P1] `/impeccable harden`**: `onRequestClose` + confirmación de descarte en Nueva lesión.
3. **[P1] `/impeccable layout`**: sacar Partido/Lesiones de tabs ocultas (decisión A/B).
4. **[P2] `/impeccable colorize`**: paleta local → `colors.*` junto con el fix de contraste.
5. **[P2] `/impeccable optimize`**: recarga silenciosa en foco; una query para las 4 ausencias.
6. **[P2] `/impeccable clarify`**: `mensajeError()` en los hooks.
7. **[P3] `/impeccable layout`** + **`/impeccable polish`**: calendario en secciones, hora sin segundos, fuera `console.log`.

---

## Compartido

- **`app/components/shared/CronicaScreen.tsx` (entrenador, coordinador, manager, subcomisión)** — auditada acá, no re-reportar:
  - Contraste (incluido en la tabla): badges `FICHAJE` oro/crema 1.60, `RESULTADO` crema/oroHondo 2.59, `ASISTENCIA` crema/oro 1.60 (`:19-21`); barra "SECCIÓN · CRÓNICA" oro/crema 1.60 (`:190-195`); "+ NUEVA NOTICIA" crema/oro 1.60 (`:210-217`, sólo subcomisión); fila urgente con título oro/crema 1.60, desc `#C9B98A`/crema 1.69, autor `#7A6D50`/crema 4.42 (`:60-73,226-230`); `feedDesc` `#7C7267`/fondo 3.99 (`:251-254`).
  - `useCronica.ts:64-68,167`: errores tragados → "Sin novedades en los últimos 7 días" falso; `divIds[0]` (coordinador/entrenador con varias divisiones sólo ve la primera); resultados filtrados por división **después** de `.limit(5)` global (`:82-85,129-132`) → puede mostrar 0 teniendo resultados propios.
  - **Falsos "Nuevo fichaje"**: el feed usa `jugadores.created_at` (`useCronica.ts:77-80`), pero `mover_jugador_division` y `pase_de_temporada` crean una fila nueva por división (`20261013000001_…sql:65-90`). Cada movimiento del coordinador aparece como "Nuevo fichaje — X", y el 1/1 el pase de temporada inunda la Crónica. Fix: leer de la tabla `fichajes` (o filtrar filas cuyo `dni` ya tenía otra fila), no de `jugadores`.
  - Botón ✕ del modal de detalle: `hitSlop` 10/16 sobre texto de 16 → ~40×52, OK; sin `accessibilityLabel` (incluido en el S3 de labels).
- **`app/components/ui/DatePickerField.tsx`** (usado por lesiones, calendario y otras áreas): campo blanco `#fff` con paleta propia en una UI oscura (`:6-9,134`). Lo dejo como P2 de theming acá; el área que audite `components/ui` no debería re-reportarlo.
- **`app/lib/offlineQueue.ts`** (sin consumidor) y la ausencia de `lib/fecha.ts`: los fixes S4 crean módulos compartidos; cualquier otra área que encole o use `toISOString()` para "hoy" (p. ej. `useFichajes.ts:44`, `useDiarioSubcomision.ts:29-32`) debería usar los mismos helpers.

## Fuera de alcance pero grave

1. **Guardar mesa no es atómico: un fallo a mitad borra la mesa entera.** `app/hooks/usePartido.ts:461-472`: `delete` de `mesa_jugadores` (error ignorado) y después `insert`. Si el insert falla (red, RLS), la mesa queda vacía pero existe, así que el chequeo de "equipo obligatorio con mesa" (`:427-439`) pasa igual. Fix: RPC `guardar_mesa(p_evento, p_equipo, p_jugadores jsonb)` que haga upsert de la mesa + delete + insert en una transacción. [backend: migration]
2. **Equipos duplicados al abrir Partido por primera vez.** `usePartido.ts:106-120`: el `useEffect` y el `useFocusEffect` llaman los dos a `fetchDatos()` en el primer montaje (con `divisionId` todavía null) → dos `doSincronizarEquipos` en paralelo → ambos ven "no existe M15" e insertan (`:141-148`). `equipos` no tiene unique `(division_id, nombre)` (`20260507000001_add_equipos.sql:10-20`). Resultado: dos "Primera" en el selector, mesa cargada en una y resultado en la otra. Fix: unique index `(division_id, nombre)` + `upsert(..., { onConflict: 'division_id,nombre', ignoreDuplicates: true })`, y sacar el `fetchDatos` del `useFocusEffect` cuando ya corre el `useEffect`. Antes de la migración, contar duplicados existentes: `select division_id, nombre, count(*) from equipos group by 1,2 having count(*) > 1`. [backend: migration]
3. **`eventos` sin protección contra duplicados por (división, fecha, tipo)** combinado con `.maybeSingle()` en `useAsistencia.ts:115-122,212-220`: cada guardado con dos entrenamientos ese día crea un tercero (detalle en el S3 "evento equivocado"). No propongo unique (doble turno es legítimo); el fix es del lado de la app.

---

## Tareas sugeridas

- [ ] T1 — **Drain the offline queue** (S4 / P0-equivalent). `lib/offlineQueue.ts` has no consumer; `useAsistencia.ts:193-206`, `usePartido.ts:377-390`, `useLesiones.ts:223-233` enqueue and show "pendiente"/"registrada" forever. Also network failures with `isConnected === true` don't fall back to the queue. Fix: new `lib/offlineSync.ts` `sincronizarCola()` (asistencia: resolve/create event by `division_id`+`fecha`, upsert; lesion: insert + then invoke `notifications`), triggered on mount of `(entrenador)/_layout.tsx`, NetInfo `isInternetReachable` and AppState `active`; enqueue on network errors; show pending count; replace `crypto.randomUUID()` with `expo-crypto`. Add `lib/offlineSync.check.ts` with a mocked supabase. [OTA] (if `expo-crypto` isn't installed: [native build])
- [ ] T2 — **Local date instead of UTC** (S4). `toISOString().split('T')[0]` in 13 places (`useAsistencia.ts:52`, `useLesiones.ts:33`, `usePartido.ts:192-193`, `useDiarioEntrenador.ts:33-35`, `useDiarioCoordinador.ts:46-48`, `useAsistenciaCoordinador.ts:44-48`, `useCalendario.ts:136-137`, `(entrenador)/diario.tsx:17`, `(coordinador)/calendario.tsx:44,48`): after 21:00 ART attendance goes to tomorrow and creates a phantom event. Fix: `lib/fecha.ts` `fechaLocal()` / `fechaLocalMasDias(n)`, reuse from `lib/agenda.ts`, `lib/fecha.check.ts`. Leave `useCronica.ts:22` (timestamptz). [OTA]
- [ ] T3 — **Confirm before discarding unsaved attendance** (S4). `useAsistencia.ts:143-146` division switch wipes marks; `usePartido.ts:251-260` same on match switch. Fix: track `estadoGuardado` per player, `Alert` with Seguir / Guardar y cambiar / Descartar; `guardarAsistencia` returns boolean. [OTA]
- [ ] T4 — **Fix inverted-token call sites in coach/coordinator screens + Crónica** (S3 / P2 theming). 24 locations in the contrast table below at 1.15–2.98:1. Fix: text on cream → `colors.oroSobreClaro`; text on oro/oroHondo → `colors.sobreOro`; small red/green text → `colors.rojoTexto` / `colors.confirmacion`; replace per-file `FONDO/TEXTO/CARD/MUTED/DIVIDER` consts with `colors.*`; add pairs to `lib/contraste.check.ts`. [OTA]
- [ ] T5 — **Attendance in 5 taps instead of 31** (S3). `asistencia.tsx:106-123,399-411`: ~24 pt badges with 5 pt gap, no bulk action, GUARDAR top-right. Fix: "TODOS PRESENTES" button, 44 pt segments with 8 pt gap, sticky bottom GUARDAR with `marcados/total`, prompt for unmarked players, `expo-haptics` selection feedback. [OTA] (haptics: [native build] if `expo-haptics` isn't in the binary)
- [ ] T6 — **Attendance targets the right event** (S3). `diario.tsx:61-65,144` sends any next event to a screen hard-wired to today's entrenamiento (`useAsistencia.ts:115-122,212-231`, `.maybeSingle()`). Fix: show "TOMAR ASISTENCIA" only for today's entrenamiento and pass `eventoId`; partido → Partido screen; hook lists today's entrenamientos and lets the coach pick if >1; never `.maybeSingle()` on eventos by (division, fecha, tipo). [OTA]
- [ ] T7 — **Load results for past matches + multi-division coach** (S3). `usePartido.ts:188,192-211` only `divisiones[0]` and `fecha >= hoy`; the RESULTADO task (`useDiarioEntrenador.ts:85-89,120-126`) dead-ends. Fix: window −7/+14 days, "SIN RESULTADO" section first, deep link from the task preselects match + `resultado` step; division selector like `useAsistencia`; diario queries `.in('division_id', divIds)`. [OTA]
- [ ] T8 — **Stop swallowing network errors** (S3). 9 hooks (list in the finding) treat a failed query as "Sin división asignada"/empty. Fix: `errorCarga` + Reintentar banner (pattern of `useJugadoresDivision.ts`), never set `sinDivision` on error; cache last roster per division in AsyncStorage for offline marking. [OTA]
- [ ] T9 — **Correct coordinator attendance %** (S3). `useAsistenciaCoordinador.ts:61-69,92-101` divides by all events in 30 days, including ones without attendance and today's; `:148-149` resets the selected division on focus. Fix: denominator = events with at least one asistencia row (per player: their rows); keep selection. [decision: does `justificado` count as present, absent or excluded?] [OTA]
- [ ] T10 — **Accessible names/state + live regions** (S3). 0 accessibility props in `(entrenador)`; list in the finding (`asistencia.tsx:110-120`, `partido.tsx:78-146`, `lesiones.tsx:148-150,249-258,430-439,585-592`, `calendario.tsx:89-91,153-166`). Fix: `radiogroup`/`radio` + `accessibilityState`, labels with player name, `accessibilityLiveRegion="polite"` + `announceForAccessibility` on save results. [OTA]
- [ ] T11 — **44 pt minimum targets** (S3). Table in the finding: `lesiones.tsx:118-125,148-150,585-592`, `calendario.tsx:89-91,143-145,330-332`, `ModalMoverJugador.tsx:61-69`, `jugadores.tsx:187-189,262`, `partido.tsx:850,864`, division chips. Fix: `minHeight/minWidth: 44` + `hitSlop` on text links. [OTA]
- [ ] T12 — **Android safe area (edge-to-edge)** (P1). RN `SafeAreaView` in `(entrenador)/{asistencia,partido,lesiones}.tsx`, `(coordinador)/{jugadores,calendario,asistencia}.tsx`, `ModalMoverJugador.tsx` does nothing on Android with `edgeToEdgeEnabled: true` (`app.config.js:39`). Fix: `SafeAreaView` from `react-native-safe-area-context` with explicit `edges`. [OTA]
- [ ] T13 — **Android Back on "Nueva lesión" modal** (P1). `lesiones.tsx:573` has no `onRequestClose`. Fix: add it with a discard confirmation when the form has data; same guard on the ✕. [OTA]
- [ ] T14 — **Partido and Lesiones out of hidden tabs** (P1). `(entrenador)/_layout.tsx:24-26` `href: null`: no back, no highlighted tab. [decision: A) 5 tabs Inicio·Asistencia·Partido·Lesiones·Crónica with "Mi perfil" moved to the Header avatar like socio, or B) Stack inside Inicio] [OTA]
- [ ] T15 — **Non-atomic mesa save** (out of scope, data). `usePartido.ts:461-472` delete-then-insert, delete error ignored. Fix: RPC `guardar_mesa(p_evento uuid, p_equipo uuid, p_jugadores jsonb)` in one transaction. [backend: migration]
- [ ] T16 — **Duplicate equipos on first open** (out of scope, data). Double `fetchDatos()` (`usePartido.ts:106-120`) + no unique on `equipos(division_id, nombre)`. Fix: dedupe existing rows, unique index, `upsert … ignoreDuplicates`, single initial fetch. [backend: migration]
- [ ] T17 — **Silent refresh on focus** (P2). `useDiarioEntrenador.ts:48-52`, `useDiarioCoordinador.ts:61-65`, `useCronica.ts:57-61`, `useCalendario.ts:99-101` + `calendario.tsx:467`, `useAsistenciaCoordinador.ts:39-42`. Fix: spinner only on first load; `refreshing` bound to manual pull only. [OTA]
- [ ] T18 — **One query for 4-absences check; notify only on transition** (P2). `useAsistencia.ts:233-268` N+1 and re-sends push on every save. Fix: single `.in('jugador_id', ids)` query grouped in memory; notify only when this save makes the 4th consecutive absence; run after showing "guardada". [OTA]
- [ ] T19 — **Crónica: real fichajes, multi-division, errors** (shared). `useCronica.ts:77-80` counts moved/season-passed players as "Nuevo fichaje"; `:68` `divIds[0]`; `:82-85,129-132` filter after `limit(5)`; `:167` swallowed errors. Fix: read from `fichajes`, `.in('division_id', divIds)` server-side, `errorCarga` banner. [OTA]
- [ ] T20 — **Human error messages** (P2). Raw `error.message` in `useAsistencia.ts:185`, `usePartido.ts:373,456,468,511`, `useLesiones.ts:206`, `useCalendario.ts:247`. Fix: `lib/mensajeError.ts` mapping network / RLS (42501) / default, with `.check.ts`. [OTA]
- [ ] T21 — **Lesiones: honest label + edit** (S2). `lesiones.tsx:539-545` "ACTIVAS" lists every lesion ever; no way to fix a wrong entry (RLS already allows update, `rls_policies.sql:470-475`). Fix: rename to "REGISTRADAS" with "ÚLTIMOS 30 DÍAS"/"ANTERIORES", EDITAR in the expanded card. [decision: add `fecha_alta` to support real "activas"? → backend: migration] [OTA]

### Tabla de contraste

Medido con `auditor-ux/scripts/contraste.py`. Mínimo AA 4.5:1 (texto normal), 3:1 (≥18.66 px bold / ≥24 px).

| Ubicación | Hoy | Ratio | Cambiar a | Ratio |
|---|---|---|---|---|
| `ModalMoverJugador.tsx:181-183` CONFIRMAR CAMBIO | `#F5B41C` sobre `#F3EFE4` | 1.60 | `oroSobreClaro` #7A4F00 | 6.20 |
| `partido.tsx:856-859` botones primarios (texto `:858`) | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `partido.tsx:834-840` jugador en mesa (nombre oro, ✕ oroHondo) | oro / crema · `#C9890A` / crema | 1.60 · 2.59 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:835-837` REGISTRAR LESIÓN | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:726-728` pestaña activa | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:796-799` grado activo | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:745,751,761` tarjeta urgente (nombre, label) | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:753` fecha urgente · `:832` sub banner OK | `#9A8870` / crema | 2.98 | `#5C4A2E` | 7.39 |
| `lesiones.tsx:830-831` banner "LESIÓN REGISTRADA" | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:34-35,768` badge G2 | `#FFFFFF` / `#C4960A` | 2.72 | `sobreOro` #15110A | 6.91 |
| `(entrenador)/diario.tsx:222-229,246-256` barra edición + tarjeta próximo evento | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `(entrenador)/diario.tsx:265-272` TOMAR ASISTENCIA | crema / oro | 1.60 | `sobreOro` | 10.24 |
| `(entrenador)/diario.tsx:298-300` atajo "+ LESIÓN" | crema / oro | 1.60 | `sobreOro` | 10.24 |
| `(entrenador)/diario.tsx:76,283-286` badge MESA | `#FFFFFF` / crema | **1.15** | `sobreOro` sobre crema #15110A | 16.37 |
| `(entrenador)/diario.tsx:75,283-286` badge RESULTADO | `#FFFFFF` / `#C9890A` | 2.97 | `sobreOro` | 6.33 |
| `(entrenador)/asistencia.tsx:328,332` chip división activo | crema / oro | 1.60 | `sobreOro` | 10.24 |
| `(entrenador)/asistencia.tsx:385-391,432-437` "⚠ 4 AUSENCIAS", error (12–13 px) | `#CC4127` / `#15110A` | 3.90 | `rojoTexto` #E5634A | 5.57 |
| `(entrenador)/asistencia.tsx:420-425` "✓ Asistencia guardada" · `partido.tsx:870` | `#4A7C59` / `#15110A` | 3.87 | `confirmacion` #22C55E | 8.25 |
| `(entrenador)/asistencia.tsx:293-298` meta header (13 px) | `#7A7060` / `#15110A` | 3.86 | `muted` #8E8574 | 5.16 |
| `(coordinador)/jugadores.tsx:247-249`, `asistencia.tsx` (coord) `:208-210` pill activa | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `(coordinador)/calendario.tsx:502-503,545-551,554-556,514+517` + Nuevo, tipo/división activos, GUARDAR, badge "P" | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `(coordinador)/calendario.tsx:523-524` badge HOY | `#FFFFFF` / `#22C55E` | 2.28 | `sobreOro` | 8.25 |
| `(coordinador)/diario.tsx:241-245` barra edición · `:280-284` COBRANZA ACTIVA | oro / crema · crema / oro | 1.60 | `oroSobreClaro` · `sobreOro` | 6.20 · 10.24 |
| `(coordinador)/diario.tsx` `alertaDesc` (14 px) · `CronicaScreen.tsx:251-254` | `#7C7267` / `#15110A` | 3.99 | `muted` #8E8574 | 5.16 |
| `CronicaScreen.tsx:19,190-195,226-230,60,65` FICHAJE, barra, fila urgente | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `CronicaScreen.tsx:20` RESULTADO · `:21` ASISTENCIA · `:216` NUEVA NOTICIA | crema / oroHondo · crema / oro | 2.59 · 1.60 | `sobreOro` | 6.33 · 10.24 |
| `CronicaScreen.tsx:69` desc urgente | `#C9B98A` / crema | 1.69 | `#5C4A2E` | 7.39 |
| `CronicaScreen.tsx:73` autor urgente (11 px) | `#7A6D50` / crema | 4.42 | `#5C4A2E` | 7.39 |
