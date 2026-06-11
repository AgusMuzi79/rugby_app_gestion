import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, TextInput, Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSobre } from '@/hooks/useSobre'
import { useSignOut } from '@/hooks/useSignOut'
import { useTheme } from '@/contexts/ThemeContext'
import { fonts } from '@/constants/theme'

const GOLD      = '#F5B41C'
const GOLD_DEEP = '#C9890A'
const ROJO      = '#CC4127'
const VERDE     = '#22C55E'

export function SobreScreen() {
  const insets = useSafeAreaInsets()
  const {
    perfil, loading,
    nombre, setNombre, guardandoNombre, nombreGuardado, guardarNombre,
    enviandoReset, resetEnviado, enviarResetPassword,
    foto, cambiandoFoto, cambiarFoto,
  } = useSobre()
  const { signOut }              = useSignOut()
  const { colors } = useTheme()

  if (loading) {
    return (
      <View style={[s.root, s.center, { backgroundColor: colors.fondo, paddingTop: insets.top }]}>
        <ActivityIndicator color={GOLD} />
      </View>
    )
  }

  const rolDisplay = perfil && perfil.divisiones.length === 1
    ? `${perfil.rolLabel.toUpperCase()} · ${perfil.divisiones[0].toUpperCase()}`
    : perfil?.rolLabel.toUpperCase() ?? ''

  const iniciales = (perfil?.nombre ?? '?')
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const border = colors.grisClaro

  return (
    <View style={[s.root, { backgroundColor: colors.fondo, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={s.headerZone}>
          <Text style={[s.seccion, { color: GOLD }]}>SECCIÓN · SOBRE</Text>
          <Text style={[s.titulo, { color: colors.texto }]}>Mi perfil</Text>
          <View style={[s.headerLine, { backgroundColor: border }]} />
        </View>

        {/* ── Foto + rol ───────────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={[s.cardAccent, { backgroundColor: GOLD }]} />
          <TouchableOpacity onPress={cambiarFoto} style={s.fotoWrap} activeOpacity={0.8} disabled={cambiandoFoto}>
            {cambiandoFoto ? (
              <View style={[s.fotoCirculo, { backgroundColor: colors.grisClaro }]}>
                <ActivityIndicator color={GOLD} />
              </View>
            ) : foto ? (
              <Image source={{ uri: foto }} style={s.fotoImg} />
            ) : (
              <View style={[s.fotoCirculo, { backgroundColor: colors.grisClaro }]}>
                <Text style={[s.fotoIniciales, { color: GOLD }]}>{iniciales}</Text>
              </View>
            )}
            {!cambiandoFoto && (
              <View style={[s.fotoBadge, { backgroundColor: GOLD }]}>
                <Text style={s.fotoBadgeTexto}>✎</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={[s.rolLabel, { color: GOLD_DEEP }]}>{rolDisplay}</Text>
          {perfil && perfil.divisiones.length > 1 && (
            <Text style={[s.divisionesExtra, { color: colors.muted }]}>
              {perfil.divisiones.join(' · ')}
            </Text>
          )}
        </View>

        {/* ── Nombre ──────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: GOLD }]}>NOMBRE</Text>
          <View style={[s.inputRow, { backgroundColor: colors.card, borderColor: border }]}>
            <TextInput
              style={[s.inputField, { color: colors.texto, fontFamily: fonts.cuerpo }]}
              value={nombre}
              onChangeText={setNombre}
              autoCapitalize="words"
              autoCorrect={false}
              placeholderTextColor={colors.muted}
            />
            <TouchableOpacity
              style={[
                s.guardarBtn,
                { backgroundColor: nombreGuardado ? VERDE : GOLD, opacity: guardandoNombre ? 0.6 : 1 },
              ]}
              onPress={guardarNombre}
              disabled={guardandoNombre}
              activeOpacity={0.8}
            >
              {guardandoNombre
                ? <ActivityIndicator size="small" color="#0E0E0E" />
                : <Text style={s.guardarBtnTexto}>{nombreGuardado ? '✓' : 'Guardar'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Seguridad ───────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: GOLD }]}>SEGURIDAD</Text>
          <TouchableOpacity
            style={[s.rowBtn, { backgroundColor: colors.card, borderColor: border, opacity: enviandoReset ? 0.6 : 1 }]}
            onPress={enviarResetPassword}
            disabled={enviandoReset}
            activeOpacity={0.8}
          >
            {enviandoReset
              ? <ActivityIndicator color={GOLD} />
              : <Text style={[s.rowBtnTexto, { color: resetEnviado ? VERDE : colors.texto }]}>
                  {resetEnviado ? '✓ Email enviado' : 'Cambiar contraseña'}
                </Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Cuenta ──────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: GOLD }]}>CUENTA</Text>
          <TouchableOpacity
            style={[s.signOutBtn, { borderColor: ROJO }]}
            onPress={signOut}
            activeOpacity={0.75}
          >
            <Text style={[s.signOutTexto, { color: ROJO }]}>CERRAR SESIÓN</Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.version, { color: colors.muted }]}>UNCAS RUGBY APP · V1.0</Text>

      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 20 },

  // Header
  headerZone: { paddingTop: 24, paddingBottom: 20 },
  seccion:    { fontFamily: fonts.label, fontSize: 9, letterSpacing: 3, marginBottom: 8 },
  titulo:     { fontFamily: fonts.titulo, fontSize: 32, lineHeight: 38, marginBottom: 20 },
  headerLine: { height: 1 },

  // Foto card
  card:       { marginTop: 24, borderRadius: 2, padding: 24, overflow: 'hidden', alignItems: 'center' },
  cardAccent: { position: 'absolute', top: 0, left: 24, width: 40, height: 3 },
  fotoWrap:   { position: 'relative', marginBottom: 14, marginTop: 8 },
  fotoImg:    { width: 80, height: 80, borderRadius: 40 },
  fotoCirculo: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  fotoIniciales: { fontFamily: fonts.titulo, fontSize: 28 },
  fotoBadge:    { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  fotoBadgeTexto: { fontSize: 12, color: '#0E0E0E' },
  rolLabel:        { fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, marginTop: 4 },
  divisionesExtra: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, marginTop: 4 },

  // Sections
  section:      { marginTop: 28 },
  sectionTitle: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 3, marginBottom: 10 },

  // Nombre
  inputRow:        { flexDirection: 'row', alignItems: 'center', borderRadius: 2, borderWidth: 1, overflow: 'hidden' },
  inputField:      { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  guardarBtn:      { paddingHorizontal: 16, paddingVertical: 14, justifyContent: 'center', alignItems: 'center', minWidth: 80 },
  guardarBtnTexto: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: '#0E0E0E' },

  // Seguridad
  rowBtn:      { borderRadius: 2, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  rowBtnTexto: { fontFamily: fonts.cuerpo, fontSize: 14 },

  // Cuenta
  signOutBtn:   { borderWidth: 1.5, paddingVertical: 16, alignItems: 'center', borderRadius: 2 },
  signOutTexto: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 3 },

  // Footer
  version: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2, textAlign: 'center', marginTop: 40 },
})
