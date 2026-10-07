import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSobre } from '@/hooks/useSobre'
import { useSignOut } from '@/hooks/useSignOut'
import { useTheme } from '@/contexts/ThemeContext'
import { useTutorStore } from '@/stores/tutorStore'
import { fonts } from '@/constants/theme'

const GOLD      = '#F5B41C'
const GOLD_DEEP = '#C9890A'
const ROJO      = '#CC4127'
const VERDE     = '#22C55E'

const RELACION_LABEL: Record<string, string> = {
  madre: 'Madre',
  padre: 'Padre',
  tutor: 'Tutor/a',
  otro:  'Familiar',
}

// "Mi perfil" of a tutor: their own account (name, mail, password reset,
// sign-out) plus the linked minors, read-only. Unlike the socio's SobreScreen
// there is no photo upload or name edit of the minor: a tutor never writes
// the minor's data.
export default function TutorSobreScreen() {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const { perfil, loading, enviandoReset, resetEnviado, enviarResetPassword } = useSobre()
  const { signOut } = useSignOut()
  const menores        = useTutorStore(s => s.menores)
  const seleccionadoId = useTutorStore(s => s.socioSeleccionadoId)
  const seleccionar    = useTutorStore(s => s.setSocioSeleccionado)

  if (loading) {
    return (
      <View style={[s.root, s.center, { backgroundColor: colors.fondo, paddingTop: insets.top }]}>
        <ActivityIndicator color={GOLD} />
      </View>
    )
  }

  const border = colors.grisClaro

  return (
    <View style={[s.root, { backgroundColor: colors.fondo, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headerZone}>
          <Text style={[s.seccion, { color: GOLD }]}>SECCIÓN · SOBRE</Text>
          <Text style={[s.titulo, { color: colors.texto }]}>Mi perfil</Text>
          <View style={[s.headerLine, { backgroundColor: border }]} />
        </View>

        {/* ── Cuenta del tutor ─────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={[s.cardAccent, { backgroundColor: GOLD }]} />
          <Text style={[s.nombre, { color: colors.texto }]}>{perfil?.nombre || '—'}</Text>
          {!!perfil?.email && (
            <Text style={[s.email, { color: colors.muted }]}>{perfil.email}</Text>
          )}
          <Text style={[s.rolLabel, { color: GOLD_DEEP }]}>{perfil?.rolLabel.toUpperCase() ?? ''}</Text>
        </View>

        {/* ── Socios a cargo (solo lectura) ────────────────────────── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: GOLD }]}>
            {menores.length === 1 ? 'SOCIO A TU CARGO' : 'SOCIOS A TU CARGO'}
          </Text>
          {menores.map(m => {
            const activo = m.id === seleccionadoId
            return (
              <TouchableOpacity
                key={m.id}
                style={[
                  s.menorRow,
                  { backgroundColor: colors.card, borderColor: activo ? GOLD : border },
                ]}
                onPress={() => seleccionar(m.id)}
                disabled={menores.length === 1}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
              >
                <Text style={[s.menorNombre, { color: colors.texto }]}>{m.nombre}</Text>
                <Text style={[s.menorDato, { color: colors.muted }]}>
                  Nº DE SOCIO {m.numero_socio} · {(RELACION_LABEL[m.relacion] ?? 'Familiar').toUpperCase()}
                </Text>
              </TouchableOpacity>
            )
          })}
          <Text style={[s.nota, { color: colors.muted }]}>
            Para corregir los datos de un socio a tu cargo, acercate a Secretaría.
          </Text>
        </View>

        {/* ── Seguridad (cuenta propia del tutor) ──────────────────── */}
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

  headerZone: { paddingTop: 24, paddingBottom: 20 },
  seccion:    { fontFamily: fonts.label, fontSize: 12, letterSpacing: 3, marginBottom: 8 },
  titulo:     { fontFamily: fonts.titulo, fontSize: 32, lineHeight: 38, marginBottom: 20 },
  headerLine: { height: 1 },

  card:       { marginTop: 24, borderRadius: 2, padding: 24, overflow: 'hidden', alignItems: 'center' },
  cardAccent: { position: 'absolute', top: 0, left: 24, width: 40, height: 3 },
  nombre:     { fontFamily: fonts.titulo, fontSize: 24, textAlign: 'center', marginTop: 8 },
  email:      { fontFamily: fonts.cuerpo, fontSize: 15, marginTop: 4 },
  rolLabel:   { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, marginTop: 10 },

  section:      { marginTop: 28 },
  sectionTitle: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 3, marginBottom: 10 },

  menorRow:    { borderRadius: 2, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8 },
  menorNombre: { fontFamily: fonts.cuerpo, fontSize: 17 },
  menorDato:   { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, marginTop: 4 },
  nota:        { fontFamily: fonts.cuerpo, fontStyle: 'italic', fontSize: 14, marginTop: 4 },

  rowBtn:      { borderRadius: 2, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  rowBtnTexto: { fontFamily: fonts.cuerpo, fontSize: 16 },

  signOutBtn:   { borderWidth: 1.5, paddingVertical: 16, alignItems: 'center', borderRadius: 2 },
  signOutTexto: { fontFamily: fonts.label, fontSize: 14, letterSpacing: 3 },

  version: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, textAlign: 'center', marginTop: 40 },
})
