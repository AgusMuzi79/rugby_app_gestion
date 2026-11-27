import { useRef, useState } from 'react'
import { Modal, ScrollView, View, Text, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { accionesTenis } from '@/hooks/useTenisGestor'
import {
  TIPOS_BLOQUE, diaSemanaIso, esFechaValida, estiloItem, isoArgentina, validarRangoHorario,
  type Cancha, type TipoBloque,
} from '@/lib/tenis'
import {
  canchasDestino, resumenBloques, type BloqueEditable, type ModoBloque, type ResultadoBloque,
} from '@/lib/tenisGestion'
import { Aviso, BarraModal, Boton, Chip, estilosTenis } from './ui'

// Bloques del gestor. Fijo: todas las semanas un día y horario, con fecha de
// fin opcional (academia, profes). Puntual: un rato de un día (lluvia,
// mantenimiento); cancela las reservas que pisa y les avisa. Uno nuevo se
// puede cargar en varias canchas a la vez: TODAS (o elegirlas todas) es un solo
// bloque de todas las canchas; si no, se crea uno igual en cada cancha elegida.
// Editar un bloque existente (fijo o puntual) sigue siendo de una cancha (o de
// todas); editar un puntual también cancela las reservas que pase a pisar.

const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']

export type { ModoBloque }
export { bloqueDesdeItem, modoBloqueItem } from '@/lib/tenisGestion'

export function EditorBloque({ modo, fecha, canchas, inicial, canchaInicial = null, horaInicial, onCerrar, onGuardado }: {
  modo:       ModoBloque
  fecha:      string
  canchas:    Cancha[]
  inicial?:   BloqueEditable
  // Celda libre tocada en la grilla (bloqueo puntual desde ahí).
  canchaInicial?: string | null
  horaInicial?:   string
  onCerrar:   () => void
  onGuardado: () => void
}) {
  const [tipo,   setTipo]   = useState<TipoBloque>(inicial?.tipo ?? (modo === 'puntual' ? 'no_disponible' : 'clase'))
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  // Canchas elegidas; vacío = TODAS. Editando, una sola (o TODAS).
  const editando = !!inicial?.id
  const [elegidas, setElegidas] = useState<string[]>(() => {
    const c = inicial ? inicial.cancha_id : canchaInicial
    return c ? [c] : []
  })
  const [dia,    setDia]    = useState(inicial?.dia_semana ?? diaSemanaIso(fecha))
  const [desde,  setDesde]  = useState(inicial?.hora_desde ?? horaInicial ?? '')
  const [hasta,  setHasta]  = useState(inicial?.hora_hasta ?? '')
  const [vigDesde, setVigDesde] = useState(inicial?.vigente_desde ?? fecha)
  const [vigHasta, setVigHasta] = useState(inicial?.vigente_hasta ?? '')
  const [dia1,   setDia1]   = useState(inicial?.fecha ?? fecha)
  const [guardando, setGuardando] = useState(false)
  // Synchronous guard: a double tap must not create the blocks twice.
  const enCurso = useRef(false)
  const [error,  setError]  = useState<string | null>(null)

  function tocarCancha(id: string | null) {
    if (id === null || editando) { setElegidas(id ? [id] : []); return }
    setElegidas(e => (e.includes(id) ? e.filter(x => x !== id) : [...e, id]))
  }

  const destinos = canchasDestino(elegidas, canchas)
  const nombreCancha = (id: string | null) => (id === null ? 'TODAS' : canchas.find(c => c.id === id)?.nombre ?? '')

  async function guardar() {
    if (enCurso.current) return
    if (!titulo.trim()) { setError('Escribí un título (por ejemplo "Academia" o "Lluvia").'); return }
    const rango = validarRangoHorario(desde, hasta)
    if (rango) { setError(rango); return }
    const fin = vigHasta.trim()
    if (modo === 'fijo') {
      if (!esFechaValida(vigDesde)) { setError('Revisá la fecha "desde" (AAAA-MM-DD).'); return }
      if (fin && (!esFechaValida(fin) || fin < vigDesde)) { setError('Revisá la fecha de fin (AAAA-MM-DD, posterior a la de inicio).'); return }
    } else if (!esFechaValida(dia1)) { setError('Revisá la fecha (AAAA-MM-DD).'); return }
    setError(null)

    // Una cancha por vez (o una fila de TODAS); cada resultado se informa aparte.
    enCurso.current = true
    setGuardando(true)
    const resultados: ResultadoBloque[] = []
    let canceladas = 0
    try {
    for (const canchaId of editando ? [elegidas[0] ?? null] : destinos) {
      let r: Awaited<ReturnType<typeof accionesTenis.bloqueGuardar>> | Awaited<ReturnType<typeof accionesTenis.bloqueoPuntual>>
      try {
      r = modo === 'fijo'
        ? await accionesTenis.bloqueGuardar({
            id: inicial?.id, cancha_id: canchaId, tipo, titulo: titulo.trim(), dia_semana: dia,
            hora_desde: desde, hora_hasta: hasta, vigente_desde: vigDesde, vigente_hasta: fin || null,
          })
        : await accionesTenis.bloqueoPuntual({
            id: inicial?.id, canchaId, desde: isoArgentina(dia1, desde), hasta: isoArgentina(dia1, hasta), tipo, titulo: titulo.trim(),
          })
      } catch {
        r = { ok: false, mensaje: 'No se pudo guardar. Revisá la conexión e intentá de nuevo.' }
      }
      if (r.ok && r.data && 'canceladas' in r.data) canceladas += r.data.canceladas
      resultados.push({ cancha: nombreCancha(canchaId), ok: r.ok, mensaje: r.ok ? undefined : r.mensaje })
    }
    } finally {
      enCurso.current = false
      setGuardando(false)
    }

    const resumen = resumenBloques(resultados)
    // Nada guardado: el error queda en el formulario para corregir y reintentar.
    if (resumen?.ninguno) { setError(resultados.length === 1 ? resultados[0].mensaje ?? resumen.texto : resumen.texto); return }
    const avisoCanceladas = canceladas > 0
      ? `Se cancelaron ${canceladas} ${canceladas === 1 ? 'reserva' : 'reservas'} y se avisó a los jugadores.`
      : null
    if (resumen) Alert.alert(resumen.titulo, [resumen.texto, avisoCanceladas].filter(Boolean).join('\n\n'))
    else if (avisoCanceladas) Alert.alert(editando ? 'Bloque guardado' : 'Bloqueo guardado', avisoCanceladas)
    onGuardado()
  }

  const input = (valor: string, set: (t: string) => void, placeholder: string, label: string) => (
    <TextInput
      style={estilosTenis.input}
      value={valor}
      onChangeText={set}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      autoCorrect={false}
      accessibilityLabel={label}
    />
  )

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={estilosTenis.sheet}>
        <BarraModal
          titulo={modo === 'fijo'
            ? (editando ? 'EDITAR BLOQUE FIJO' : 'NUEVO BLOQUE FIJO')
            : (editando ? 'EDITAR BLOQUE' : 'BLOQUEO PUNTUAL')}
          onCerrar={onCerrar}
        />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={estilosTenis.sheetCuerpo} keyboardShouldPersistTaps="handled">
            <Text style={estilosTenis.label}>TIPO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilosTenis.filaScroll}>
              {TIPOS_BLOQUE.map(t => (
                <Chip key={t} texto={estiloItem({ tipo: t }).etiqueta.toUpperCase()} activo={t === tipo} onPress={() => setTipo(t)} />
              ))}
            </ScrollView>

            <Text style={estilosTenis.label}>TÍTULO</Text>
            {input(titulo, setTitulo, modo === 'fijo' ? 'Academia, Profe Juan…' : 'Lluvia, mantenimiento…', 'Título del bloque')}

            <Text style={estilosTenis.label}>{editando ? 'CANCHA' : 'CANCHAS (PODÉS ELEGIR VARIAS)'}</Text>
            <View style={estilosTenis.fila}>
              <Chip texto="TODAS" activo={elegidas.length === 0} onPress={() => tocarCancha(null)} />
              {canchas.map(c => <Chip key={c.id} texto={c.nombre} activo={elegidas.includes(c.id)} onPress={() => tocarCancha(c.id)} />)}
            </View>
            {!editando && destinos.length > 1 && (
              <Text style={estilosTenis.mutedCard}>Se crea un bloque en cada una: {destinos.map(nombreCancha).join(', ')}.</Text>
            )}

            {modo === 'fijo' ? (
              <>
                <Text style={estilosTenis.label}>DÍA DE LA SEMANA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilosTenis.filaScroll}>
                  {DIAS.map((d, i) => <Chip key={d} texto={d} activo={dia === i + 1} onPress={() => setDia(i + 1)} />)}
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={estilosTenis.label}>FECHA (AAAA-MM-DD)</Text>
                {input(dia1, setDia1, 'AAAA-MM-DD', 'Fecha del bloqueo')}
              </>
            )}

            <Text style={estilosTenis.label}>DESDE (HH:MM)</Text>
            {input(desde, setDesde, '18:00', 'Hora de inicio')}
            <Text style={estilosTenis.label}>HASTA (HH:MM)</Text>
            {input(hasta, setHasta, '20:00', 'Hora de fin')}

            {modo === 'fijo' && (
              <>
                <Text style={estilosTenis.label}>VIGENTE DESDE (AAAA-MM-DD)</Text>
                {input(vigDesde, setVigDesde, 'AAAA-MM-DD', 'Vigente desde')}
                <Text style={estilosTenis.label}>HASTA (OPCIONAL)</Text>
                {input(vigHasta, setVigHasta, 'Sin fecha de fin', 'Vigente hasta')}
              </>
            )}

            {modo === 'puntual' && (
              <Aviso>{editando
                ? 'Si el bloque pasa a pisar reservas, se cancelan y se avisa a los jugadores.'
                : 'Las reservas que pisa este bloqueo se cancelan y se avisa a los jugadores.'}</Aviso>
            )}
            {error && <Aviso tipo="error">{error}</Aviso>}
            <Boton texto="GUARDAR" onPress={guardar} cargando={guardando} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}
