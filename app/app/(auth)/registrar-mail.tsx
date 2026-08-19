import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useRegistrarMail } from '@/hooks/useRegistrarMail'
import { useAuthStore } from '@/stores/authStore'
import { ROL_RUTA_INICIAL } from '@/constants/roles'
import { colors, fonts } from '@/constants/theme'

export default function RegistrarMailScreen() {
  const [email, setEmail] = useState('')
  const { guardar, omitir, guardando, omitiendo, error } = useRegistrarMail()
  const router = useRouter()
  const rol = useAuthStore(s => s.rol)

  const irALaApp = () => { if (rol) router.replace(ROL_RUTA_INICIAL[rol]) }

  const handleGuardar = async () => {
    const ok = await guardar(email)
    if (ok) irALaApp()
  }

  const handleOmitir = async () => {
    const ok = await omitir()
    if (ok) irALaApp()
  }

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>

          <Text style={styles.clubName}>UNCAS RUGBY CLUB · EST. 1836</Text>
          <Text style={styles.title}>Registrá{'\n'}tu mail</Text>
          <View style={styles.divider} />
          <Text style={styles.subtitle}>
            Tu cuenta todavía no tiene un mail propio cargado. Registrá uno real para
            poder recibir avisos del club y para que te sea más fácil ingresar. Podés
            hacerlo ahora o más tarde desde "Mi Perfil".
          </Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="tu-mail@ejemplo.com"
            placeholderTextColor="#7C7267"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          {error !== null && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, (!email.trim() || guardando) && styles.buttonDisabled]}
            onPress={handleGuardar}
            disabled={!email.trim() || guardando || omitiendo}
            activeOpacity={0.85}
          >
            {guardando
              ? <ActivityIndicator color={colors.oro} size="small" />
              : <Text style={styles.buttonText}>GUARDAR →</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleOmitir}
            disabled={guardando || omitiendo}
            activeOpacity={0.7}
          >
            {omitiendo
              ? <ActivityIndicator color="#7C7267" size="small" />
              : <Text style={styles.skipButtonText}>Ahora no</Text>
            }
          </TouchableOpacity>

          <Text style={styles.footer}>UNCAS RUGBY APP · V1.0</Text>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  kav:           { flex: 1, backgroundColor: '#15110A' },
  scrollContent: { flexGrow: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  clubName: {
    textAlign: 'center',
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.oro,
    marginBottom: 10,
  },
  title: {
    textAlign: 'center',
    fontFamily: fonts.titulo,
    fontSize: 36,
    color: colors.tinta,
    marginBottom: 16,
    lineHeight: 42,
  },
  divider: {
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
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2C2418',
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.cuerpo,
    fontSize: 15,
    color: colors.tinta,
    marginBottom: 20,
  },
  button: {
    backgroundColor: colors.tinta,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
  },
  buttonDisabled: {
    backgroundColor: '#333',
  },
  buttonText: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 2.5,
    color: colors.oro,
  },
  skipButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  skipButtonText: {
    fontFamily: fonts.cuerpo,
    fontSize: 13,
    fontStyle: 'italic',
    color: '#7C7267',
    textDecorationLine: 'underline',
  },
  errorBanner: {
    backgroundColor: '#FEF8EC',
    borderWidth: 1,
    borderColor: colors.oro,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: fonts.cuerpo,
    fontSize: 13,
    textAlign: 'center',
    color: colors.tinta,
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
