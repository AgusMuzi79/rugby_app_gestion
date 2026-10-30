import { useState, useEffect, useRef } from 'react'
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
import { BotonVerPassword } from '@/components/ui/BotonVerPassword'
import { useResetPassword } from '@/hooks/useResetPassword'
import { colors, fonts } from '@/constants/theme'

const PLACEHOLDER = '#9B9A8F'

export default function ResetPasswordScreen() {
  const [password, setPassword]           = useState('')
  const [confirmacion, setConfirmacion]   = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const confirmacionRef = useRef<TextInput>(null)
  const { actualizarPassword, cancelar, loading, error, completado } = useResetPassword()
  const router = useRouter()

  useEffect(() => {
    if (completado) {
      router.replace({
        pathname: '/(auth)/login',
        params: { mensaje: 'Contraseña actualizada. Ingresá con tu nueva clave.' },
      })
    }
  }, [completado])

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>

          <Text style={styles.clubName}>UNCAS RUGBY CLUB · EST. 1836</Text>
          <Text style={styles.title}>Uncas Rugby App</Text>
          <View style={styles.divider} />
          <Text style={styles.subtitle}>Establecé tu nueva contraseña de acceso.</Text>

          {/* Nueva contraseña */}
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>NUEVA CONTRASEÑA</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!mostrarPassword}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={PLACEHOLDER}
                editable={!loading}
                accessibilityLabel="Nueva contraseña"
                textContentType="newPassword"
                autoComplete="new-password"
                passwordRules="minlength: 8;"
                autoCapitalize="none"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => confirmacionRef.current?.focus()}
              />
              <BotonVerPassword
                style={styles.eyeButton}
                visible={mostrarPassword}
                onToggle={() => setMostrarPassword(v => !v)}
              />
            </View>
          </View>

          {/* Confirmar contraseña */}
          <View style={styles.fieldWrapLast}>
            <Text style={styles.label}>CONFIRMAR CONTRASEÑA</Text>
            <TextInput
              ref={confirmacionRef}
              style={styles.input}
              value={confirmacion}
              onChangeText={setConfirmacion}
              secureTextEntry={!mostrarPassword}
              placeholder="Repetí tu contraseña"
              placeholderTextColor={PLACEHOLDER}
              editable={!loading}
              accessibilityLabel="Confirmar contraseña"
              textContentType="newPassword"
              autoComplete="new-password"
              passwordRules="minlength: 8;"
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={() => { if (!loading) void actualizarPassword(password, confirmacion) }}
            />
          </View>

          {/* Error */}
          {error !== null && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Botón */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonLoading]}
            onPress={() => actualizarPassword(password, confirmacion)}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={colors.oro} size="small" />
              : <Text style={styles.buttonText}>GUARDAR CONTRASEÑA →</Text>
            }
          </TouchableOpacity>

          {/* Salida: si no, el guard devuelve siempre a esta pantalla */}
          <TouchableOpacity
            style={styles.cancelWrap}
            accessibilityRole="button"
            onPress={async () => {
              await cancelar()
              router.replace('/(auth)/login')
            }}
            disabled={loading}
          >
            <Text style={styles.cancelText}>Cancelar y volver al inicio</Text>
          </TouchableOpacity>

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
    marginBottom: 28,
  },
  fieldWrapLast: {
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    fontFamily: fonts.cuerpo,
    fontSize: 18,
    color: colors.texto,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.oro,
    backgroundColor: 'transparent',
  },
  eyeButton: {
    paddingBottom: 4,
    paddingLeft: 8,
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
    textAlign: 'center',
    color: colors.texto,
  },
  cancelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 12,
    minHeight: 44,
  },
  cancelText: {
    fontFamily: fonts.label,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.textoSecundario,
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
