import {
  View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, StyleSheet, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { useColaboradores } from '@/hooks/useColaboradores'
import { textoConfirmarQuitar, type DivisionColaboradores, type ResultadoBusqueda } from '@/lib/colaboradores'
import { colors, fonts } from '@/constants/theme'

// El entrenador designa y quita colaboradores de sus divisiones
// (odd/tasks/colaborador-por-entrenador.md). Ruta oculta: se abre desde el
// atajo COLABORADORES del Inicio; "‹" y el Back de sistema vuelven al Inicio.

function SelectorDivision({
  divisiones, divisionId, onSeleccionar,
}: {
  divisiones: DivisionColaboradores[]
  divisionId: string | null
  onSeleccionar: (id: string) => void
}) {
  if (divisiones.length < 2) return null
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.divisionChips}
      accessibilityRole="radiogroup"
      accessibilityLabel="División"
      keyboardShouldPersistTaps="handled"
    >
      {divisiones.map(div => {
        const activo = div.id === divisionId
        return (
          <TouchableOpacity
            key={div.id}
            style={[s.divisionChip, activo && s.divisionChipActivo]}
            onPress={() => onSeleccionar(div.id)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: activo, checked: activo }}
            accessibilityLabel={`División ${div.nombre}`}
          >
            <Text style={[s.divisionChipTexto, activo && s.divisionChipTextoActivo]}>
              {div.nombre.toUpperCase()}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.secRow}>
      <Text style={s.secTitle}>{title}</Text>
      <View style={s.secLine} />
    </View>
  )
}

function FilaResultado({
  r, enCurso, onDesignar,
}: {
  r: ResultadoBusqueda
  enCurso: string | null
  onDesignar: (id: string) => void
}) {
  const ocupado = enCurso === r.profileId
  return (
    <View style={s.fila}>
      <View style={s.filaTexto}>
        <Text style={s.nombre} numberOfLines={2}>{r.nombre}</Text>
        {!r.yaEsColaborador && !r.elegible && r.motivo ? (
          <Text style={s.motivo}>{r.motivo}</Text>
        ) : null}
      </View>
      {r.yaEsColaborador ? (
        <View style={s.tag}>
          <Text style={s.tagTexto}>COLABORADOR</Text>
        </View>
      ) : r.elegible ? (
        <TouchableOpacity
          style={[s.btnDesignar, enCurso !== null && s.desactivado]}
          onPress={() => onDesignar(r.profileId)}
          disabled={enCurso !== null}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Designar a ${r.nombre} como colaborador`}
        >
          {ocupado
            ? <ActivityIndicator color={colors.sobreOro} />
            : <Text style={s.btnDesignarTexto}>DESIGNAR</Text>}
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

export default function ColaboradoresScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const h = useColaboradores()

  function pedirQuitar(profileId: string, nombre: string) {
    Alert.alert(
      'Quitar colaborador',
      textoConfirmarQuitar(nombre, h.divisionNombre),
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: () => { void h.quitar(profileId) } },
      ],
    )
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.navigate('/(entrenador)/diario')}
          style={s.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Volver al inicio"
        >
          <Ionicons name="chevron-back" size={24} color={colors.oro} />
        </TouchableOpacity>
        <View style={s.topBarTexto}>
          <Text style={s.topBarLabel}>CUERPO TÉCNICO</Text>
          <Text style={s.titulo}>Colaboradores</Text>
        </View>
      </View>
      <View style={s.separador} />

      {h.loading ? (
        <ActivityIndicator color={colors.oro} style={s.cargando} />
      ) : h.sinDivision ? (
        <View style={s.section}>
          <Text style={s.vacio}>Sin división asignada. Contactá a la Subcomisión.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.ayuda}>
            El colaborador sólo toma asistencia y recibe el recordatorio 30 minutos antes de los
            entrenamientos y actividades. Tiene que tener cuenta en la app.
          </Text>

          {h.errorCarga && <ErrorCarga mensaje={h.errorCarga} onReintentar={h.refetch} />}

          {h.divisiones.length > 0 && (
            <>
              <SelectorDivision
                divisiones={h.divisiones}
                divisionId={h.divisionId}
                onSeleccionar={h.elegirDivision}
              />

              {h.errorAccion ? (
                <View style={s.section} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <Text style={s.error}>{h.errorAccion}</Text>
                </View>
              ) : null}

              {/* ── Colaboradores actuales ── */}
              {!h.errorCarga && (
                <View style={s.section}>
                  <SectionHeader title={`COLABORADORES · ${h.divisionNombre.toUpperCase()}`} />
                  {h.colaboradores.length === 0 ? (
                    <Text style={s.vacio}>Esta división todavía no tiene colaboradores.</Text>
                  ) : (
                    h.colaboradores.map(c => (
                      <View key={c.profileId} style={s.fila}>
                        <Text style={[s.nombre, s.filaTexto]} numberOfLines={2}>{c.nombre}</Text>
                        <TouchableOpacity
                          style={[s.btnQuitar, h.enCurso !== null && s.desactivado]}
                          onPress={() => pedirQuitar(c.profileId, c.nombre)}
                          disabled={h.enCurso !== null}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`Quitar a ${c.nombre}`}
                        >
                          {h.enCurso === c.profileId
                            ? <ActivityIndicator color={colors.rojoTexto} />
                            : <Text style={s.btnQuitarTexto}>QUITAR</Text>}
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* ── Agregar ── */}
              <View style={s.section}>
                <SectionHeader title="AGREGAR COLABORADOR" />
                <TextInput
                  style={s.input}
                  value={h.texto}
                  onChangeText={h.setTexto}
                  placeholder="Nombre o DNI"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="search"
                  accessibilityLabel="Buscar socio por nombre o DNI"
                />
                {h.avisoBusqueda ? <Text style={s.aviso}>{h.avisoBusqueda}</Text> : null}

                {h.buscando ? (
                  <ActivityIndicator color={colors.oro} style={s.cargandoBusqueda} />
                ) : h.errorBusqueda ? (
                  <ErrorCarga mensaje={h.errorBusqueda} onReintentar={h.reintentarBusqueda} />
                ) : h.buscado && h.resultados.length === 0 ? (
                  <Text style={s.vacio}>No encontramos socios con cuenta en la app con esa búsqueda.</Text>
                ) : (
                  h.resultados.map(r => (
                    <FilaResultado key={r.profileId} r={r} enCurso={h.enCurso} onDesignar={id => { void h.asignar(id) }} />
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.fondo },
  scroll: { paddingBottom: 48, paddingTop: 16 },
  cargando:         { marginTop: 40 },
  cargandoBusqueda: { marginTop: 20 },

  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  backBtn:     { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  topBarTexto: { flex: 1 },
  topBarLabel: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: colors.oroHondo },
  titulo:      { fontFamily: fonts.titulo, fontSize: 28, color: colors.texto },
  separador:   { height: 1, backgroundColor: colors.borde },

  ayuda: {
    fontFamily: fonts.cuerpo, fontSize: 15, color: colors.textoSecundario,
    paddingHorizontal: 20, paddingBottom: 16, lineHeight: 21,
  },

  section:  { paddingHorizontal: 20, paddingTop: 18 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: colors.borde },

  // Selector de división (mismo patrón que Asistencia)
  divisionChips: { paddingHorizontal: 20, gap: 8 },
  divisionChip: {
    minHeight: 44, justifyContent: 'center',
    borderWidth: 1, borderColor: colors.borde, borderRadius: 3,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  divisionChipActivo:      { backgroundColor: colors.oro, borderColor: colors.oro },
  divisionChipTexto:       { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1.5, color: colors.textoSecundario },
  divisionChipTextoActivo: { color: colors.sobreOro, fontWeight: '700' },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borde,
  },
  filaTexto: { flex: 1 },
  nombre:    { fontFamily: fonts.cuerpo, fontSize: 16, color: colors.texto },
  motivo:    { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.textoSecundario, marginTop: 2 },

  tag:      { borderWidth: 1, borderColor: colors.oro, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4 },
  tagTexto: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: colors.oro },

  btnDesignar: {
    minHeight: 44, minWidth: 104, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.oro, borderRadius: 4, paddingHorizontal: 14,
  },
  btnDesignarTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.sobreOro, fontWeight: '700' },
  btnQuitar: {
    minHeight: 44, minWidth: 92, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.rojoTexto, borderRadius: 4, paddingHorizontal: 14,
  },
  btnQuitarTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.rojoTexto },
  desactivado:    { opacity: 0.6 },

  input: {
    backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.borde,
    padding: 12, fontFamily: fonts.cuerpo, fontSize: 17, color: colors.texto,
  },
  aviso: { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.textoSecundario, marginTop: 8 },
  error: { fontFamily: fonts.cuerpo, fontSize: 15, color: colors.rojoTexto },
  vacio: { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.textoSecundario, marginTop: 8 },
})
