import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSignOut } from '@/hooks/useSignOut'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { colors, fonts } from '@/constants/theme'

export default function AccesoRestringidoScreen() {
  const { signOut } = useSignOut()
  const router = useRouter()
  const userId = useAuthStore(s => s.session?.user.id)
  const [abriendoRegistro, setAbriendoRegistro] = useState(false)

  // The adult's sign-up (registro-tutor) runs without a session: that screen
  // signs this minor's session out on mount. The minor's DNI is read here,
  // while the session still exists, to prefill the form.
  async function irARegistroTutor() {
    setAbriendoRegistro(true)
    let dni = ''
    if (userId) {
      const { data } = await supabase
        .from('socios')
        .select('dni')
        .eq('profile_id', userId)
        .maybeSingle()
      dni = data?.dni ?? ''
    }
    router.replace({ pathname: '/(auth)/registro-tutor', params: { dni } })
  }

  return (
    <View style={styles.container}>
      <Text style={styles.clubName}>UNCAS RUGBY CLUB · EST. 1836</Text>

      <Ionicons name="shield-outline" size={40} color={colors.oro} style={styles.icon} />

      <Text style={styles.title}>Esta cuenta la{'\n'}administra un adulto</Text>
      <View style={styles.divider} />
      <Text style={styles.subtitle}>
        Por ser menor de 13 años, el acceso directo a la app no está habilitado. Pedile a tu
        madre, padre o tutor que gestione tu carnet, tus cuotas y las noticias del club desde
        su propia cuenta.
      </Text>

      <TouchableOpacity style={styles.button} onPress={signOut} activeOpacity={0.85}>
        <Text style={styles.buttonText}>CERRAR SESIÓN</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkWrap}
        onPress={irARegistroTutor}
        disabled={abriendoRegistro}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.linkText}>¿Sos su familiar o tutor? Creá tu cuenta</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>UNCAS RUGBY APP</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#15110A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  clubName: {
    textAlign: 'center',
    fontFamily: fonts.label,
    fontSize: 13,
    letterSpacing: 2.5,
    color: colors.oro,
    marginBottom: 24,
  },
  icon: { marginBottom: 20 },
  title: {
    textAlign: 'center',
    fontFamily: fonts.titulo,
    fontSize: 28,
    color: colors.tinta,
    marginBottom: 16,
    lineHeight: 34,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: '#2C2418',
    marginBottom: 24,
  },
  subtitle: {
    textAlign: 'center',
    fontFamily: fonts.cuerpo,
    fontStyle: 'italic',
    fontSize: 15,
    color: '#7C7267',
    lineHeight: 20,
    marginBottom: 36,
  },
  button: {
    backgroundColor: colors.tinta,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    borderRadius: 4,
  },
  buttonText: {
    fontFamily: fonts.label,
    fontSize: 14,
    letterSpacing: 2.5,
    color: colors.oro,
  },
  linkWrap: {
    marginTop: 24,
  },
  linkText: {
    fontFamily: fonts.label,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.oro,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  footer: {
    fontFamily: fonts.label,
    textAlign: 'center',
    fontSize: 12,
    letterSpacing: 1.5,
    color: '#9B9A8F',
    marginTop: 48,
  },
})
