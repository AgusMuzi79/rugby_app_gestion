import {
  View, Text, ScrollView, Switch, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSobre } from '@/hooks/useSobre'
import { useSignOut } from '@/hooks/useSignOut'
import { colors, fonts } from '@/constants/theme'

export function SobreScreen() {
  const insets = useSafeAreaInsets()
  const {
    perfil, loading,
    biometriaActiva, biometriaDisponible,
    notificacionesActivas,
    toggleBiometria, toggleNotificaciones,
  } = useSobre()
  const { signOut } = useSignOut()

  if (loading) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.oro} />
      </View>
    )
  }

  // "ENTRENADOR · M14" si hay una sola división; solo "COORDINADOR" si hay varias o ninguna
  const rolDisplay = perfil && perfil.divisiones.length === 1
    ? `${perfil.rolLabel.toUpperCase()} · ${perfil.divisiones[0].toUpperCase()}`
    : perfil?.rolLabel.toUpperCase() ?? ''
  const divisionesExtra = perfil && perfil.divisiones.length > 1
    ? perfil.divisiones.join(' · ')
    : null

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={s.headerZone}>
          <Text style={s.seccion}>SECCIÓN · SOBRE</Text>
          <Text style={s.titulo}>Mi perfil</Text>
          <View style={s.headerLine} />
        </View>

        {/* ── Perfil card ──────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardAccent} />
          <Text style={s.nombre}>{perfil?.nombre ?? '—'}</Text>
          <Text style={s.rolLabel}>{rolDisplay}</Text>
          {divisionesExtra !== null && (
            <Text style={s.divisionesExtra}>{divisionesExtra}</Text>
          )}
        </View>

        {/* ── Configuración ───────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>CONFIGURACIÓN</Text>
          <View style={s.settingsCard}>
            <View style={s.settingRow}>
              <Text style={s.settingLabel}>Biometría</Text>
              <Switch
                value={biometriaActiva}
                onValueChange={toggleBiometria}
                disabled={!biometriaDisponible && !biometriaActiva}
                trackColor={{ false: '#2A2A2A', true: colors.oroHondo }}
                thumbColor={biometriaActiva ? colors.oro : '#555'}
                ios_backgroundColor="#2A2A2A"
              />
            </View>
            <View style={s.settingDivider} />
            <View style={s.settingRow}>
              <Text style={s.settingLabel}>Notificaciones</Text>
              <Switch
                value={notificacionesActivas}
                onValueChange={toggleNotificaciones}
                trackColor={{ false: '#2A2A2A', true: colors.oroHondo }}
                thumbColor={notificacionesActivas ? colors.oro : '#555'}
                ios_backgroundColor="#2A2A2A"
              />
            </View>
          </View>
        </View>

        {/* ── Cuenta ──────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>CUENTA</Text>
          <TouchableOpacity style={s.signOutBtn} onPress={signOut} activeOpacity={0.75}>
            <Text style={s.signOutText}>CERRAR SESIÓN</Text>
          </TouchableOpacity>
        </View>

        {/* ── Versión ─────────────────────────────────────────────── */}
        <Text style={s.version}>UNCAS RUGBY APP · V1.0</Text>

      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.tinta,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    paddingHorizontal: 20,
  },

  // ── Header ──────────────────────────────────────────────────────
  headerZone: {
    paddingTop: 24,
    paddingBottom: 20,
  },
  seccion: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.oro,
    marginBottom: 8,
  },
  titulo: {
    fontFamily: fonts.titulo,
    fontSize: 32,
    color: colors.blanco,
    lineHeight: 38,
    marginBottom: 20,
  },
  headerLine: {
    height: 1,
    backgroundColor: '#1E1E1E',
  },

  // ── Profile card ────────────────────────────────────────────────
  card: {
    marginTop: 24,
    backgroundColor: colors.papel,
    borderRadius: 2,
    padding: 24,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 24,
    width: 40,
    height: 3,
    backgroundColor: colors.oro,
  },
  nombre: {
    fontFamily: fonts.titulo,
    fontSize: 26,
    color: colors.tinta,
    lineHeight: 32,
    marginTop: 14,
  },
  rolLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.oroHondo,
    marginTop: 10,
  },
  divisionesExtra: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1,
    color: '#888',
    marginTop: 4,
  },

  // ── Settings ────────────────────────────────────────────────────
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.oro,
    marginBottom: 12,
  },
  settingsCard: {
    backgroundColor: '#141414',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  settingLabel: {
    fontFamily: fonts.cuerpo,
    fontSize: 14,
    color: colors.blanco,
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#1E1E1E',
    marginHorizontal: 20,
  },

  // ── Sign out ────────────────────────────────────────────────────
  signOutBtn: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: colors.oro,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 2,
  },
  signOutText: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 3,
    color: colors.oro,
  },

  // ── Version ─────────────────────────────────────────────────────
  version: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 2,
    color: '#444',
    textAlign: 'center',
    marginTop: 40,
  },
})
