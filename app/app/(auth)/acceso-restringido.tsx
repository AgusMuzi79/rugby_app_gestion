import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSignOut } from '@/hooks/useSignOut'
import { colors, fonts } from '@/constants/theme'

export default function AccesoRestringidoScreen() {
  const { signOut } = useSignOut()

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
    fontSize: 10,
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
    fontSize: 13,
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
    fontSize: 12,
    letterSpacing: 2.5,
    color: colors.oro,
  },
  footer: {
    fontFamily: fonts.label,
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 1.5,
    color: '#9B9A8F',
    marginTop: 48,
  },
})
