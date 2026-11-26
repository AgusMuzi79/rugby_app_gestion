import { useState } from 'react'
import { View, Text, TextInput, Modal, ScrollView, Switch, Alert, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '@/constants/theme'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { accionesGestion, useNovedadesGestion } from '@/hooks/useTenisGestion'
import { etiquetaDiaCorta, fechaArgentina, horaArgentina } from '@/lib/tenis'
import type { NovedadTenis } from '@/lib/tenisGestion'
import { Aviso, BarraModal, Boton, estilosTenis } from './ui'

// Cartelera de tenis (`tenis_novedades`), como la de OnDepor: la gestora
// escribe novedades (torneos, cortes, avisos) y las publica por push y mail a
// los jugadores de tenis (Edge Function `tenis-gestion` › publicar-novedad).

type Borrador = { id?: string; titulo: string; texto: string; destacada: boolean }

function momento(iso: string | null): string {
  return iso ? `${etiquetaDiaCorta(fechaArgentina(iso))} ${horaArgentina(iso)}` : ''
}

export function CarteleraTenis() {
  const { datos: lista, loading, error, refetch } = useNovedadesGestion()
  const [editando, setEditando] = useState<Borrador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  async function guardar() {
    if (!editando) return
    const titulo = editando.titulo.trim()
    const texto = editando.texto.trim()
    if (!titulo || !texto) { setErrorForm('Completá el título y el texto.'); return }
    setGuardando(true)
    setErrorForm(null)
    const r = await accionesGestion.novedadGuardar({ ...editando, titulo, texto })
    setGuardando(false)
    if (!r.ok) { setErrorForm(r.mensaje); return }
    setEditando(null)
    setAviso('Novedad guardada. Todavía no se mandó: tocá PUBLICAR para avisar a los jugadores.')
    refetch()
  }

  function borrar(n: NovedadTenis) {
    Alert.alert('Borrar novedad', `Se borra "${n.titulo}" de la cartelera. ¿Confirmás?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive', onPress: async () => {
          setOcupado(`borrar-${n.id}`)
          setErrorAccion(null)
          const r = await accionesGestion.novedadBorrar(n.id)
          setOcupado(null)
          if (!r.ok) setErrorAccion(r.mensaje)
          else refetch()
        },
      },
    ])
  }

  function publicar(n: NovedadTenis) {
    Alert.alert(
      n.enviada_at ? 'Volver a publicar' : 'Publicar novedad',
      `${n.enviada_at ? 'Ya se mandó una vez. ' : ''}Les llega por push y mail a los jugadores de tenis. ¿Confirmás?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Publicar', onPress: async () => {
            setOcupado(`publicar-${n.id}`)
            setErrorAccion(null)
            setAviso(null)
            const r = await accionesGestion.publicarNovedad(n.id)
            setOcupado(null)
            if (!r.ok) { setErrorAccion(r.mensaje); return }
            setAviso(`Publicada: ${r.data.push} push y ${r.data.mails} mails enviados.`)
            refetch()
          },
        },
      ],
    )
  }

  return (
    <ScrollView
      contentContainerStyle={s.contenido}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.oro} />}
    >
      <Boton texto="NUEVA NOVEDAD" onPress={() => { setErrorForm(null); setEditando({ titulo: '', texto: '', destacada: false }) }} />
      {aviso && <Aviso>{aviso}</Aviso>}
      {errorAccion && <Aviso tipo="error">{errorAccion}</Aviso>}
      {error && <ErrorCarga mensaje={error} onReintentar={refetch} />}
      {loading && lista.length === 0 && <ActivityIndicator color={colors.oro} style={s.cargando} />}
      {!loading && !error && lista.length === 0 && <Text style={estilosTenis.vacio}>Todavía no hay novedades en la cartelera.</Text>}

      {lista.map(n => (
        <View key={n.id} style={[estilosTenis.card, s.card, n.destacada && s.destacada]}>
          {n.destacada && <Text style={s.etiqueta}>DESTACADA</Text>}
          <Text style={s.titulo}>{n.titulo}</Text>
          <Text style={estilosTenis.textoCard}>{n.texto}</Text>
          <Text style={estilosTenis.mutedCard}>
            {n.enviada_at
              ? `Enviada el ${momento(n.enviada_at)} · ${n.push_enviados} push · ${n.mails_enviados} mails`
              : `Sin enviar${n.created_at ? ` · creada el ${momento(n.created_at)}` : ''}`}
          </Text>
          <Boton
            texto={n.enviada_at ? 'VOLVER A PUBLICAR' : 'PUBLICAR'}
            variante={n.enviada_at ? 'secundario' : 'primario'}
            cargando={ocupado === `publicar-${n.id}`}
            onPress={() => publicar(n)}
          />
          <View style={s.acciones}>
            <View style={s.flex}>
              <Boton texto="EDITAR" variante="secundario" onPress={() => {
                setErrorForm(null)
                setEditando({ id: n.id, titulo: n.titulo, texto: n.texto, destacada: n.destacada })
              }} />
            </View>
            <View style={s.flex}>
              <Boton texto="BORRAR" variante="peligro" cargando={ocupado === `borrar-${n.id}`} onPress={() => borrar(n)} />
            </View>
          </View>
        </View>
      ))}

      <Modal visible={editando !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditando(null)}>
        <SafeAreaView style={estilosTenis.sheet}>
          <BarraModal titulo={editando?.id ? 'EDITAR NOVEDAD' : 'NUEVA NOVEDAD'} onCerrar={() => setEditando(null)} />
          <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={estilosTenis.sheetCuerpo} keyboardShouldPersistTaps="handled">
              <Text style={estilosTenis.label}>TÍTULO</Text>
              <TextInput
                style={estilosTenis.input}
                value={editando?.titulo ?? ''}
                onChangeText={t => setEditando(e => e && { ...e, titulo: t })}
                maxLength={120}
                accessibilityLabel="Título de la novedad"
              />
              <Text style={estilosTenis.label}>TEXTO</Text>
              <TextInput
                style={[estilosTenis.input, s.texto]}
                value={editando?.texto ?? ''}
                onChangeText={t => setEditando(e => e && { ...e, texto: t })}
                multiline
                maxLength={2000}
                accessibilityLabel="Texto de la novedad"
              />
              <View style={s.switchFila}>
                <Text style={[estilosTenis.textoCard, s.flex]}>Destacada (va primero en la cartelera)</Text>
                <Switch
                  value={editando?.destacada ?? false}
                  onValueChange={v => setEditando(e => e && { ...e, destacada: v })}
                  trackColor={{ true: colors.oro, false: colors.bordeRealce }}
                  thumbColor={colors.blanco}
                  accessibilityLabel="Novedad destacada"
                />
              </View>
              {errorForm && <Aviso tipo="error">{errorForm}</Aviso>}
              <Boton texto="GUARDAR" cargando={guardando} onPress={guardar} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  flex:       { flex: 1 },
  contenido:  { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 60, gap: 4 },
  cargando:   { marginVertical: 24 },
  card:       { marginTop: 12 },
  destacada:  { borderColor: colors.oro },
  etiqueta:   { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: colors.oro },
  titulo:     { fontFamily: fonts.titulo, fontSize: 18, color: colors.texto },
  acciones:   { flexDirection: 'row', gap: 12 },
  texto:      { minHeight: 140, textAlignVertical: 'top', paddingTop: 10 },
  switchFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
})
