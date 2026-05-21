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
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

const PLACEHOLDER = '#9B9A8F'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const { enviarLink, loading, error, enviado } = useForgotPassword()
  const router = useRouter()
  const { colors: tc } = useTheme()

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tc.fondo }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>

          {/* Club name */}
          <Text style={styles.clubName}>UNCAS RUGBY CLUB · EST. 1836</Text>

          {/* Título */}
          <Text style={[styles.title, { color: tc.tinta }]}>Uncas Rugby App</Text>

          {/* Línea divisoria */}
          <View style={[styles.divider, { backgroundColor: tc.grisClaro }]} />

          {enviado ? (
            /* ── Estado de éxito ── */
            <View style={styles.successWrap}>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={[styles.successTitle, { color: tc.tinta }]}>Link enviado</Text>
              <Text style={styles.successBody}>
                Si el email está registrado, vas a recibir un link para
                restablecer tu contraseña.
              </Text>
            </View>
          ) : (
            /* ── Formulario ── */
            <>
              <Text style={styles.subtitle}>
                Ingresá tu email y te enviamos un link para restablecer tu
                contraseña.
              </Text>

              {/* Campo EMAIL */}
              <View style={styles.fieldWrap}>
                <Text style={[styles.label, { color: tc.tinta }]}>EMAIL</Text>
                <TextInput
                  style={[styles.input, { color: tc.tinta }]}
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
                <View style={[styles.errorBanner, { backgroundColor: tc.card }]}>
                  <Text style={[styles.errorText, { color: tc.tinta }]}>{error}</Text>
                </View>
              )}

              {/* Botón principal */}
              <TouchableOpacity
                style={[styles.button, { backgroundColor: tc.tinta }, loading && styles.buttonLoading]}
                onPress={() => enviarLink(email)}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={colors.oro} size="small" />
                ) : (
                  <Text style={styles.buttonText}>ENVIAR LINK →</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Volver al login */}
          <TouchableOpacity
            style={styles.backWrap}
            onPress={() => router.back()}
            disabled={loading}
          >
            <Text style={styles.backText}>← Volver al inicio de sesión</Text>
          </TouchableOpacity>

          {/* Footer */}
          <Text style={styles.footer}>UNCAS RUGBY APP · V1.0</Text>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
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
    fontSize: 48,
    marginBottom: 16,
    lineHeight: 54,
  },
  divider: {
    height: 1,
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
  fieldWrap: {
    marginBottom: 32,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
  },
  input: {
    fontFamily: fonts.cuerpo,
    fontSize: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.oro,
    backgroundColor: 'transparent',
  },
  button: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
  },
  buttonLoading: {
    backgroundColor: '#333',
  },
  buttonText: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 2.5,
    color: colors.oro,
  },
  errorBanner: {
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
  },
  successWrap: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  successIcon: {
    fontSize: 48,
    color: colors.oro,
    marginBottom: 16,
  },
  successTitle: {
    fontFamily: fonts.titulo,
    fontSize: 28,
    marginBottom: 12,
    textAlign: 'center',
  },
  successBody: {
    fontFamily: fonts.cuerpo,
    fontStyle: 'italic',
    fontSize: 13,
    color: PLACEHOLDER,
    textAlign: 'center',
    lineHeight: 20,
  },
  backWrap: {
    alignItems: 'center',
    marginTop: 32,
  },
  backText: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1,
    color: PLACEHOLDER,
  },
  footer: {
    fontFamily: fonts.label,
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 1.5,
    color: PLACEHOLDER,
    marginTop: 48,
  },
})
