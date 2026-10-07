import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'
import { colors, fonts } from '@/constants/theme'
import { useMenoresTutor } from '@/hooks/useMenoresTutor'
import { useSignOut } from '@/hooks/useSignOut'

// Rol "Familiar / Tutor" (migration 20261010000000_tutor_menores): an adult who
// is not a member sees the linked minor's socio screens read-only. The screens
// are the socio ones (re-exported); useSocioObjetivo points their hooks at the
// minor selected in useTutorStore. No "turnos" tab: gym bookings are a write
// action of the member.
export default function TutorLayout() {
  const { menores, loading, error, refetch } = useMenoresTutor()
  const { signOut } = useSignOut()

  if (loading && menores.length === 0) {
    return (
      <View style={s.centro}>
        <ActivityIndicator color={colors.oro} />
      </View>
    )
  }

  if (error || menores.length === 0) {
    return (
      <View style={s.centro}>
        <Feather name="users" size={36} color={colors.oro} style={s.icono} />
        <Text style={s.titulo}>{error ? 'No pudimos cargar tus datos' : 'Todavía no hay socios a tu cargo'}</Text>
        <Text style={s.texto}>
          {error
            ? error
            : 'Tu cuenta no tiene ningún socio vinculado. Acercate a Secretaría para revisarlo.'}
        </Text>
        <TouchableOpacity style={s.botonSecundario} onPress={refetch} activeOpacity={0.85}>
          <Text style={s.botonSecundarioTexto}>REINTENTAR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.boton} onPress={signOut} activeOpacity={0.85}>
          <Text style={s.botonTexto}>CERRAR SESIÓN</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="carnet"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="credit-card" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="cuotas"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="dollar-sign" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="noticias"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="rss" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="calendario"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="sobre"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
    </Tabs>
  )
}

const s = StyleSheet.create({
  centro: {
    flex: 1, backgroundColor: '#15110A',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  icono:  { marginBottom: 20 },
  titulo: {
    fontFamily: fonts.titulo, fontSize: 26, lineHeight: 32,
    color: colors.tinta, textAlign: 'center', marginBottom: 14,
  },
  texto: {
    fontFamily: fonts.cuerpo, fontStyle: 'italic', fontSize: 15, lineHeight: 20,
    color: '#7C7267', textAlign: 'center', marginBottom: 32,
  },
  boton: {
    backgroundColor: colors.tinta, paddingVertical: 16, paddingHorizontal: 32,
    alignItems: 'center', borderRadius: 4, marginTop: 12,
  },
  botonTexto: { fontFamily: fonts.label, fontSize: 14, letterSpacing: 2.5, color: colors.oro },
  botonSecundario: {
    borderWidth: 1, borderColor: colors.oro, paddingVertical: 14, paddingHorizontal: 32,
    alignItems: 'center', borderRadius: 4,
  },
  botonSecundarioTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },
})
