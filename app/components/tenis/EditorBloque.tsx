import { useState } from 'react'
import { Modal, ScrollView, Text, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { accionesTenis, type BloqueEditable } from '@/hooks/useTenisGestor'
import {
  TIPOS_BLOQUE, diaSemanaIso, esFechaValida, estiloItem, horaArgentina, isoArgentina, validarRangoHorario,
  type Cancha, type ItemGrilla, type TipoBloque,
} from '@/lib/tenis'
import { Aviso, BarraModal, Boton, Chip, estilosTenis } from './ui'

// Bloques del gestor. Fijo: todas las semanas un día y horario, con fecha de
// fin opcional (academia, profes). Puntual: un rato de un día (lluvia,
// mantenimiento); cancela las reservas que pisa y les avisa.

const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']

export type ModoBloque = 'fijo' | 'puntual'

// Valores iniciales para editar un bloque fijo tocado en la grilla.
export function bloqueDesdeItem(item: ItemGrilla, fecha: string): BloqueEditable {
  return {
    id:            item.bloque_id ?? undefined,
    // La grilla repite un bloque de todas las canchas en cada una: se edita el bloque entero.
    cancha_id:     item.bloque_todas ? null : item.cancha_id,
    tipo:          (TIPOS_BLOQUE as readonly string[]).includes(item.tipo) ? item.tipo as TipoBloque : 'clase',
    titulo:        item.titulo ?? '',
    dia_semana:    item.dia_semana ?? diaSemanaIso(fecha),
    hora_desde:    horaArgentina(item.inicio),
    hora_hasta:    horaArgentina(item.fin),
    vigente_desde: item.vigente_desde ?? fecha,
    vigente_hasta: item.vigente_hasta ?? null,
  }
}

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
  const [cancha, setCancha] = useState<string | null>(inicial ? inicial.cancha_id : canchaInicial)
  const [dia,    setDia]    = useState(inicial?.dia_semana ?? diaSemanaIso(fecha))
  const [desde,  setDesde]  = useState(inicial?.hora_desde ?? horaInicial ?? '')
  const [hasta,  setHasta]  = useState(inicial?.hora_hasta ?? '')
  const [vigDesde, setVigDesde] = useState(inicial?.vigente_desde ?? fecha)
  const [vigHasta, setVigHasta] = useState(inicial?.vigente_hasta ?? '')
  const [dia1,   setDia1]   = useState(fecha)
  const [guardando, setGuardando] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  async function guardar() {
    if (!titulo.trim()) { setError('Escribí un título (por ejemplo "Academia" o "Lluvia").'); return }
    const rango = validarRangoHorario(desde, hasta)
    if (rango) { setError(rango); return }
    setError(null)

    if (modo === 'fijo') {
      if (!esFechaValida(vigDesde)) { setError('Revisá la fecha "desde" (AAAA-MM-DD).'); return }
      const fin = vigHasta.trim()
      if (fin && (!esFechaValida(fin) || fin < vigDesde)) { setError('Revisá la fecha de fin (AAAA-MM-DD, posterior a la de inicio).'); return }
      setGuardando(true)
      const r = await accionesTenis.bloqueGuardar({
        id: inicial?.id, cancha_id: cancha, tipo, titulo: titulo.trim(), dia_semana: dia,
        hora_desde: desde, hora_hasta: hasta, vigente_desde: vigDesde, vigente_hasta: fin || null,
      })
      setGuardando(false)
      if (!r.ok) { setError(r.mensaje); return }
      onGuardado()
      return
    }

    if (!esFechaValida(dia1)) { setError('Revisá la fecha (AAAA-MM-DD).'); return }
    setGuardando(true)
    const r = await accionesTenis.bloqueoPuntual({
      canchaId: cancha, desde: isoArgentina(dia1, desde), hasta: isoArgentina(dia1, hasta), tipo, titulo: titulo.trim(),
    })
    setGuardando(false)
    if (!r.ok) { setError(r.mensaje); return }
    if (r.data.canceladas > 0) {
      Alert.alert('Bloqueo guardado', `Se cancelaron ${r.data.canceladas} ${r.data.canceladas === 1 ? 'reserva' : 'reservas'} y se avisó a los jugadores.`)
    }
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
          titulo={modo === 'fijo' ? (inicial?.id ? 'EDITAR BLOQUE FIJO' : 'NUEVO BLOQUE FIJO') : 'BLOQUEO PUNTUAL'}
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

            <Text style={estilosTenis.label}>CANCHA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilosTenis.filaScroll}>
              <Chip texto="TODAS" activo={cancha === null} onPress={() => setCancha(null)} />
              {canchas.map(c => <Chip key={c.id} texto={c.nombre} activo={c.id === cancha} onPress={() => setCancha(c.id)} />)}
            </ScrollView>

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
              <Aviso>Las reservas que pisa este bloqueo se cancelan y se avisa a los jugadores.</Aviso>
            )}
            {error && <Aviso tipo="error">{error}</Aviso>}
            <Boton texto="GUARDAR" onPress={guardar} cargando={guardando} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}
