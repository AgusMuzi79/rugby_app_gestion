import { useState } from 'react'
import { View, Text, Modal, TextInput, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '@/constants/theme'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { accionesTenis, useSancionesTenis, type Infraccion } from '@/hooks/useTenisGestor'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { etiquetaDiaCorta, fechaArgentina } from '@/lib/tenis'
import { BuscadorJugador, type JugadorElegido } from './BuscadorJugador'
import { FilaJugador } from './FormReserva'
import { Aviso, BarraModal, Boton, Chip, Titulo, estilosTenis } from './ui'

// Infracciones y suspensiones. La primera infracción de una persona es un
// aviso (se perdona); desde la segunda el gestor decide una suspensión con la
// cantidad de días que quiera. Una persona suspendida no puede reservar ni ser
// agregada como jugador.

const TIPOS: Record<string, string> = {
  no_show:               'No se presentó',
  jugadores_incorrectos: 'Jugadores incorrectos',
  otra:                  'Otra',
}

type Persona = { socioId: string | null; invitadoId: string | null; nombre: string }

type Formulario =
  | { tipo: 'suspender'; persona: Persona | null }
  | { tipo: 'infraccion'; persona: Persona | null }

function ddmm(fecha: string): string {
  return fecha ? etiquetaDiaCorta(fecha.slice(0, 10)) : ''
}

export function Sanciones() {
  const { infracciones, suspensiones, loading, error, refetch } = useSancionesTenis()
  useRefreshOnFocus(refetch)
  const [form, setForm] = useState<Formulario | null>(null)
  const [dias, setDias] = useState('')
  const [nota, setNota] = useState('')
  const [tipoInf, setTipoInf] = useState('otra')
  const [guardando, setGuardando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  function abrir(f: Formulario) {
    setForm(f); setDias(''); setNota(''); setTipoInf('otra'); setErrorForm(null)
  }

  async function correr(id: string, accion: () => Promise<{ ok: boolean; mensaje?: string }>) {
    setOcupado(id)
    const r = await accion()
    setOcupado(null)
    if (!r.ok) Alert.alert('No se pudo completar', r.mensaje ?? 'Probá de nuevo.')
    else refetch()
  }

  function perdonar(i: Infraccion) {
    Alert.alert('Perdonar infracción', `¿Perdonás la infracción de ${i.nombre}? Queda como aviso.`, [
      { text: 'No', style: 'cancel' },
      { text: 'Perdonar', onPress: () => correr(i.id, () => accionesTenis.infraccionPerdonar(i.id)) },
    ])
  }

  function levantar(id: string, nombre: string) {
    Alert.alert('Levantar suspensión', `¿Levantás la suspensión de ${nombre}? Vuelve a poder reservar.`, [
      { text: 'No', style: 'cancel' },
      { text: 'Levantar', onPress: () => correr(id, () => accionesTenis.suspensionLevantar(id)) },
    ])
  }

  async function guardar() {
    if (!form?.persona) { setErrorForm('Elegí a la persona.'); return }
    const p = form.persona
    setErrorForm(null)
    let r: { ok: boolean; mensaje?: string }
    if (form.tipo === 'suspender') {
      const n = Number(dias)
      if (!Number.isInteger(n) || n < 1 || n > 365) { setErrorForm('Ingresá una cantidad de días entre 1 y 365.'); return }
      if (!nota.trim()) { setErrorForm('Escribí el motivo.'); return }
      setGuardando(true)
      r = await accionesTenis.suspender({ socioId: p.socioId, invitadoId: p.invitadoId, dias: n, motivo: nota.trim() })
    } else {
      setGuardando(true)
      r = await accionesTenis.infraccionCrear({ socioId: p.socioId, invitadoId: p.invitadoId, reservaId: null, tipo: tipoInf, nota: nota.trim() })
    }
    setGuardando(false)
    if (!r.ok) { setErrorForm(r.mensaje ?? 'Probá de nuevo.'); return }
    setForm(null)
    refetch()
  }

  if (loading && infracciones.length === 0 && suspensiones.length === 0 && !error) {
    return <ActivityIndicator color={colors.oro} style={s.cargando} />
  }
  if (error && infracciones.length === 0 && suspensiones.length === 0) return <ErrorCarga mensaje={error} onReintentar={refetch} />

  const elegir = (j: JugadorElegido) => {
    const socioId = 'socio_id' in j.entrada ? j.entrada.socio_id : null
    setForm(f => f && { ...f, persona: { socioId, invitadoId: null, nombre: j.nombre } })
  }

  return (
    <ScrollView
      contentContainerStyle={s.contenido}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.oro} />}
    >
      <View style={estilosTenis.fila}>
        <Boton texto="+ INFRACCIÓN" variante="secundario" onPress={() => abrir({ tipo: 'infraccion', persona: null })} />
        <Boton texto="+ SUSPENSIÓN" variante="secundario" onPress={() => abrir({ tipo: 'suspender', persona: null })} />
      </View>

      <Titulo>SUSPENDIDOS</Titulo>
      {suspensiones.length === 0 && <Text style={estilosTenis.vacio}>No hay suspensiones vigentes.</Text>}
      {suspensiones.map(su => (
        <View key={su.id} style={[estilosTenis.card, s.card]}>
          <Text style={s.nombre}>{su.nombre}</Text>
          <Text style={estilosTenis.textoCard}>Del {ddmm(su.desde)} al {ddmm(su.hasta)}</Text>
          {!!su.motivo && <Text style={estilosTenis.mutedCard}>{su.motivo}</Text>}
          <Boton texto="LEVANTAR SUSPENSIÓN" variante="secundario" cargando={ocupado === su.id} onPress={() => levantar(su.id, su.nombre)} />
        </View>
      ))}

      <Titulo>INFRACCIONES</Titulo>
      {infracciones.length === 0 && <Text style={estilosTenis.vacio}>No hay infracciones.</Text>}
      {infracciones.map(i => (
        <View key={i.id} style={[estilosTenis.card, s.card]}>
          <Text style={s.nombre}>{i.nombre}</Text>
          <Text style={estilosTenis.textoCard}>
            {TIPOS[i.tipo] ?? i.tipo} · {ddmm(i.created_at ? fechaArgentina(i.created_at) : '')}{i.automatica ? ' · automática' : ''}
          </Text>
          {!!i.nota && <Text style={estilosTenis.mutedCard}>{i.nota}</Text>}
          {i.perdonada ? (
            <Text style={estilosTenis.mutedCard}>Perdonada (aviso)</Text>
          ) : (
            <View style={s.acciones}>
              <View style={{ flex: 1 }}>
                <Boton texto="PERDONAR" variante="secundario" cargando={ocupado === i.id} onPress={() => perdonar(i)} />
              </View>
              <View style={{ flex: 1 }}>
                <Boton
                  texto="SUSPENDER"
                  variante="peligro"
                  onPress={() => abrir({ tipo: 'suspender', persona: { socioId: i.socio_id, invitadoId: i.invitado_id, nombre: i.nombre } })}
                />
              </View>
            </View>
          )}
        </View>
      ))}

      <Modal visible={form !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setForm(null)}>
        <SafeAreaView style={estilosTenis.sheet}>
          <BarraModal titulo={form?.tipo === 'suspender' ? 'SUSPENDER' : 'NUEVA INFRACCIÓN'} onCerrar={() => setForm(null)} />
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={estilosTenis.sheetCuerpo} keyboardShouldPersistTaps="handled">
              <Text style={estilosTenis.label}>PERSONA</Text>
              {form?.persona ? (
                <FilaJugador nombre={form.persona.nombre} onQuitar={() => setForm(f => f && { ...f, persona: null })} />
              ) : (
                <BuscadorJugador excluir={[]} onElegir={elegir} permitirInvitado={false} />
              )}

              {form?.tipo === 'suspender' ? (
                <>
                  <Text style={estilosTenis.label}>DÍAS DE SUSPENSIÓN</Text>
                  <TextInput
                    style={estilosTenis.input}
                    value={dias}
                    onChangeText={t => setDias(t.replace(/\D/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    placeholder="7"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="Días de suspensión"
                  />
                </>
              ) : (
                <>
                  <Text style={estilosTenis.label}>TIPO</Text>
                  <View style={estilosTenis.fila}>
                    {Object.entries(TIPOS).map(([k, v]) => (
                      <Chip key={k} texto={v.toUpperCase()} activo={tipoInf === k} onPress={() => setTipoInf(k)} />
                    ))}
                  </View>
                </>
              )}

              <Text style={estilosTenis.label}>{form?.tipo === 'suspender' ? 'MOTIVO' : 'NOTA'}</Text>
              <TextInput
                style={[estilosTenis.input, s.nota]}
                value={nota}
                onChangeText={setNota}
                multiline
                placeholder={form?.tipo === 'suspender' ? 'Segunda vez que no se presenta…' : 'Qué pasó'}
                placeholderTextColor={colors.muted}
                accessibilityLabel={form?.tipo === 'suspender' ? 'Motivo de la suspensión' : 'Nota de la infracción'}
              />
              {errorForm && <Aviso tipo="error">{errorForm}</Aviso>}
              <Boton texto="GUARDAR" onPress={guardar} cargando={guardando} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  contenido: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 60 },
  cargando:  { marginVertical: 24 },
  card:      { marginBottom: 12 },
  nombre:    { fontFamily: fonts.label, fontSize: 16, letterSpacing: 1, color: colors.oro },
  acciones:  { flexDirection: 'row', gap: 12 },
  nota:      { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 },
})
