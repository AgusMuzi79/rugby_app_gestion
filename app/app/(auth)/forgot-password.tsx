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
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useForgotPassword } from '@/hooks/useForgotPassword'
import { colors, fonts } from '@/constants/theme'

const PLACEHOLDER = '#9B9A8F'

export default function ForgotPasswordScreen() {
  const [dniOMail, setDniOMail] = useState('')
  const { enviarLink, loading, error, enviado } = useForgotPassword()
  const router = useRouter()
  const { aviso } = useLocalSearchParams<{ aviso?: string }>()

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>

          {/* Club name */}
          <Text style={styles.clubName}>UNCAS RUGBY CLUB · EST. 1836</Text>

          {/* Título */}
          <Text style={styles.title}>Uncas Rugby App</Text>

          {/* Línea divisoria */}
          <View style={styles.divider} />

          {enviado ? (
            /* ── Estado de éxito ── */
            <View style={styles.successWrap}>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successTitle}>Pedido recibido</Text>
              {/* Genérico a propósito: no dice si la cuenta existe ni si su
                  mail es real. Sí dice qué hacer si no llega nada. */}
              <Text style={styles.successBody}>
                Si tu cuenta tiene un mail registrado, en unos minutos te
                llega un link para elegir una contraseña nueva.
              </Text>
              <Text style={styles.successPaso}>
                · Abrí el link desde este teléfono: en la compu no funciona.
              </Text>
              <Text style={styles.successPaso}>
                · Si no lo ves, revisá la carpeta de spam o correo no deseado.
              </Text>
              <Text style={styles.successPaso}>
                · Si nunca registraste un mail, acercate a Secretaría con tu
                DNI.
              </Text>
            </View>
          ) : (
            /* ── Formulario ── */
            <>
              {/* Aviso al llegar desde un link de reset vencido o ya usado */}
              {!!aviso && (
                <View style={styles.avisoBanner}>
                  <Text style={styles.avisoText}>{aviso}</Text>
                </View>
              )}

              <Text style={styles.subtitle}>
                Ingresá tu DNI o tu mail y te mandamos un link al mail de tu
                cuenta para elegir una contraseña nueva.
              </Text>

              {/* Campo DNI o mail (lo mismo que en el login) */}
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>DNI (SIN PUNTOS) O MAIL</Text>
                <TextInput
                  style={styles.input}
                  value={dniOMail}
                  onChangeText={setDniOMail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="DNI o tu mail"
                  placeholderTextColor={PLACEHOLDER}
                  editable={!loading}
                  accessibilityLabel="DNI sin puntos o mail"
                  textContentType="username"
                  autoComplete="username"
                  returnKeyType="go"
                  onSubmitEditing={() => { if (!loading) void enviarLink(dniOMail) }}
                />
              </View>

              {/* Error banner */}
              {error !== null && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Botón principal */}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonLoading]}
                onPress={() => enviarLink(dniOMail)}
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
            // Llegando desde un link vencido (replace) no hay a dónde volver.
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
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
  kav:           { flex: 1, backgroundColor: colors.fondo },
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
    fontSize: 13,
    letterSpacing: 2.5,
    color: colors.oro,
    marginBottom: 10,
  },
  title: {
    textAlign: 'center',
    fontFamily: fonts.titulo,
    fontSize: 48,
    color: colors.texto,
    marginBottom: 16,
    lineHeight: 54,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borde,
    marginBottom: 24,
  },
  subtitle: {
    textAlign: 'center',
    fontFamily: fonts.cuerpo,
    fontStyle: 'italic',
    fontSize: 15,
    color: colors.textoSecundario,
    lineHeight: 20,
    marginBottom: 36,
  },
  fieldWrap: {
    marginBottom: 32,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: 13,
    letterSpacing: 2,
    color: colors.texto,
    marginBottom: 8,
  },
  input: {
    fontFamily: fonts.cuerpo,
    fontSize: 18,
    color: colors.texto,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.oro,
    backgroundColor: 'transparent',
  },
  button: {
    backgroundColor: colors.oro,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
  },
  buttonLoading: {
    backgroundColor: '#333',
  },
  buttonText: {
    fontFamily: fonts.label,
    fontSize: 14,
    letterSpacing: 2.5,
    color: colors.sobreOro,
  },
  avisoBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.oro,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  avisoText: {
    fontFamily: fonts.cuerpo,
    fontSize: 15,
    color: colors.texto,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.rojoTexto,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: fonts.cuerpo,
    fontSize: 15,
    color: colors.texto,
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
    color: colors.texto,
    marginBottom: 12,
    textAlign: 'center',
  },
  successBody: {
    fontFamily: fonts.cuerpo,
    fontSize: 15,
    color: colors.texto,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 16,
  },
  successPaso: {
    alignSelf: 'stretch',
    fontFamily: fonts.cuerpo,
    fontSize: 15,
    color: colors.textoSecundario,
    lineHeight: 21,
    marginBottom: 8,
  },
  backWrap: {
    alignItems: 'center',
    marginTop: 32,
  },
  backText: {
    fontFamily: fonts.label,
    fontSize: 13,
    letterSpacing: 1,
    color: PLACEHOLDER,
  },
  footer: {
    fontFamily: fonts.label,
    textAlign: 'center',
    fontSize: 12,
    letterSpacing: 1.5,
    color: PLACEHOLDER,
    marginTop: 48,
  },
})
