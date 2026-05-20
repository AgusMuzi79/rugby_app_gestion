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
  Image,
  StyleSheet,
} from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useLogin } from '@/hooks/useLogin'
import { colors, fonts } from '@/constants/theme'

const PLACEHOLDER = '#9B9A8F'
const DIVIDER     = colors.grisClaro

export default function LoginScreen() {
  const [email, setEmail]                     = useState('')
  const [password, setPassword]               = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)

  const {
    login,
    loginConBiometria,
    loading,
    error,
    biometriaDisponible,
    credencialesGuardadas,
  } = useLogin()

  const { mensaje } = useLocalSearchParams<{ mensaje?: string }>()

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.papel }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>

          {/* Logo */}
          <View style={styles.logoWrap}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Club name */}
          <Text style={styles.clubName}>
            UNCAS RUGBY CLUB · EST. 1836
          </Text>

          {/* Título serif itálico */}
          <Text style={styles.title}>Uncas Rugby App</Text>

          {/* Línea divisoria */}
          <View style={[styles.divider, { backgroundColor: DIVIDER }]} />

          {/* Subtítulo */}
          <Text style={styles.subtitle}>
            Diario operativo del cuerpo técnico y organizativo
          </Text>

          {/* Banner de éxito (ej. post reset-password) */}
          {!!mensaje && (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>{mensaje}</Text>
            </View>
          )}

          {/* Campo USUARIO */}
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>USUARIO</Text>
            <TextInput
              style={styles.input}
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

          {/* Campo CONTRASEÑA */}
          <View style={[styles.fieldWrap, { marginBottom: 32 }]}>
            <Text style={styles.label}>CONTRASEÑA</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!mostrarPassword}
                placeholder="••••••••"
                placeholderTextColor={PLACEHOLDER}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setMostrarPassword(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={mostrarPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={PLACEHOLDER}
                />
              </TouchableOpacity>
            </View>
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
            onPress={() => login(email, password)}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.oro} size="small" />
            ) : (
              <Text style={styles.buttonText}>INGRESAR AL DIARIO →</Text>
            )}
          </TouchableOpacity>

          {/* Botón biométrico */}
          {biometriaDisponible && credencialesGuardadas && !loading && (
            <TouchableOpacity
              style={styles.biometriaButton}
              onPress={loginConBiometria}
              activeOpacity={0.8}
            >
              <Ionicons
                name="finger-print-outline"
                size={20}
                color={colors.oro}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.biometriaText}>
                INGRESAR CON HUELLA / FACE ID
              </Text>
            </TouchableOpacity>
          )}

          {/* Olvidé contraseña */}
          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity style={styles.forgotWrap} disabled={loading}>
              <Text style={styles.forgotText}>Olvidé mi contraseña</Text>
            </TouchableOpacity>
          </Link>

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
  logoWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 88,
    height: 88,
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
    fontSize: 52,
    color: colors.tinta,
    marginBottom: 16,
    lineHeight: 58,
  },
  divider: {
    height: 1,
    marginBottom: 14,
  },
  subtitle: {
    textAlign: 'center',
    fontFamily: fonts.cuerpo,
    fontStyle: 'italic',
    fontSize: 13,
    color: '#7C7267',
    marginBottom: 40,
    lineHeight: 20,
  },
  fieldWrap: {
    marginBottom: 28,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.tinta,
    marginBottom: 8,
  },
  input: {
    fontFamily: fonts.cuerpo,
    fontSize: 16,
    color: colors.tinta,
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
    fontSize: 16,
    color: colors.tinta,
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
    backgroundColor: colors.tinta,
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
  biometriaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.oro,
    borderRadius: 4,
  },
  biometriaText: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.oro,
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
  successBanner: {
    backgroundColor: '#F0F9EC',
    borderWidth: 1,
    borderColor: '#7CB87C',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  successText: {
    fontFamily: fonts.cuerpo,
    fontSize: 13,
    textAlign: 'center',
    color: '#2D6A2D',
  },
  forgotWrap: {
    alignItems: 'center',
    marginTop: 24,
  },
  forgotText: {
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
