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
import { useForgotPassword } from '@/hooks/useForgotPassword'

const GOLD = '#C9A84C'
const CREAM = '#F5F0E8'
const DARK = '#1A1A1A'
const DIVIDER = '#D1C9B8'
const PLACEHOLDER = '#9B9183'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const { enviarLink, loading, error, enviado } = useForgotPassword()
  const router = useRouter()

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: CREAM }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center px-8 py-16">

          {/* Título */}
          <Text style={[styles.title, { color: DARK }]}>
            Recuperar acceso
          </Text>

          {/* Línea divisoria */}
          <View style={[styles.divider, { backgroundColor: DIVIDER }]} />

          {enviado ? (
            /* ── Estado de éxito ── */
            <View className="items-center">
              <Text style={[styles.successIcon]}>✓</Text>
              <Text style={[styles.successTitle, { color: DARK }]}>
                Link enviado
              </Text>
              <Text style={[styles.successBody, { color: PLACEHOLDER }]}>
                Si el email está registrado, vas a recibir un link para
                restablecer tu contraseña.
              </Text>
            </View>
          ) : (
            /* ── Formulario ── */
            <>
              <Text style={[styles.subtitle, { color: PLACEHOLDER }]}>
                Ingresá tu email y te enviamos un link para restablecer tu
                contraseña.
              </Text>

              {/* Campo EMAIL */}
              <View className="mb-8">
                <Text style={[styles.label, { color: DARK }]}>EMAIL</Text>
                <TextInput
                  style={[styles.input, { color: DARK, borderBottomColor: GOLD }]}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="correo@club.com"
                  placeholderTextColor={PLACEHOLDER}
                  editable={!loading}
                />
              </View>

              {/* Error banner */}
              {error !== null && (
                <View style={[styles.errorBanner, { borderColor: GOLD }]} className="mb-4">
                  <Text className="text-sm text-center" style={{ color: DARK }}>
                    {error}
                  </Text>
                </View>
              )}

              {/* Botón principal */}
              <TouchableOpacity
                style={[styles.button, { backgroundColor: loading ? '#333' : DARK }]}
                onPress={() => enviarLink(email)}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={GOLD} size="small" />
                ) : (
                  <Text style={[styles.buttonText, { color: GOLD }]}>
                    ENVIAR LINK →
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Volver al login */}
          <TouchableOpacity
            className="items-center mt-8"
            onPress={() => router.back()}
            disabled={loading}
          >
            <Text className="text-xs tracking-wide" style={{ color: PLACEHOLDER }}>
              ← Volver al inicio de sesión
            </Text>
          </TouchableOpacity>

          {/* Footer */}
          <Text className="text-center text-xs mt-12" style={{ color: PLACEHOLDER }}>
            Uso exclusivo del cuerpo técnico y directivo
          </Text>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
    fontSize: 36,
    fontStyle: 'italic',
    fontFamily: 'serif',
    marginBottom: 16,
    lineHeight: 42,
  },
  divider: {
    height: 1,
    marginBottom: 20,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 13,
    fontStyle: 'italic',
    fontFamily: 'serif',
    lineHeight: 20,
    marginBottom: 36,
  },
  label: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    fontSize: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
  },
  button: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
  },
  buttonText: {
    fontSize: 12,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: '#FEF8EC',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  successIcon: {
    fontSize: 48,
    color: '#C9A84C',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontStyle: 'italic',
    fontFamily: 'serif',
    marginBottom: 12,
    textAlign: 'center',
  },
  successBody: {
    fontSize: 13,
    fontStyle: 'italic',
    fontFamily: 'serif',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
})
