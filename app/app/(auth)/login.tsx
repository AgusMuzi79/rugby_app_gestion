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
const HITSOP = { top: 8, bottom: 8, left: 8, right: 8 }

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
      style={s.kbView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.container}>

          {/* Logo */}
          <View style={s.logoWrap}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={s.logo}
              resizeMode="contain"
            />
          </View>

          {/* Club name */}
          <Text style={s.clubName}>
            UNCAS RUGBY CLUB · EST. 1836
          </Text>

          {/* Título serif itálico */}
          <Text style={s.title}>Uncas Rugby App</Text>

          {/* Línea divisoria */}
          <View style={s.divider} />

          {/* Subtítulo */}
          <Text style={s.subtitle}>
            Diario operativo del cuerpo técnico y organizativo
          </Text>

          {/* Banner de éxito (ej. post reset-password) */}
          {!!mensaje && (
            <View style={s.successBanner}>
              <Text style={s.successText}>{mensaje}</Text>
            </View>
          )}

          {/* Campo USUARIO */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>USUARIO</Text>
            <TextInput
              style={s.input}
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
          <View style={s.fieldWrapLast}>
            <Text style={s.label}>CONTRASEÑA</Text>
            <View style={s.passwordRow}>
              <TextInput
                style={s.passwordInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!mostrarPassword}
                placeholder="••••••••"
                placeholderTextColor={PLACEHOLDER}
                editable={!loading}
              />
              <TouchableOpacity
                style={s.eyeButton}
                onPress={() => setMostrarPassword(v => !v)}
                hitSlop={HITSOP}
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
            <View style={s.errorBanner}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Botón principal */}
          <TouchableOpacity
            style={loading ? s.buttonLoading : s.button}
            onPress={() => login(email, password)}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.oro} size="small" />
            ) : (
              <Text style={s.buttonText}>INGRESAR AL DIARIO →</Text>
            )}
          </TouchableOpacity>

          {/* Botón biométrico */}
          {biometriaDisponible && credencialesGuardadas && !loading && (
            <TouchableOpacity
              style={s.biometriaButton}
              onPress={loginConBiometria}
              activeOpacity={0.8}
            >
              <Ionicons
                name="finger-print-outline"
                size={20}
                color={colors.oro}
                style={s.biometriaIcon}
              />
              <Text style={s.biometriaText}>
                INGRESAR CON HUELLA / FACE ID
              </Text>
            </TouchableOpacity>
          )}

          {/* Olvidé contraseña */}
          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity style={s.forgotWrap} disabled={loading}>
              <Text style={s.forgotText}>Olvidé mi contraseña</Text>
            </TouchableOpacity>
          </Link>

          {/* Footer */}
          <Text style={s.footer}>UNCAS RUGBY APP · V1.0</Text>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  kbView: {
    flex: 1,
    backgroundColor: '#15110A',
  },
  scrollContent: {
    flexGrow: 1,
  },
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
    marginBottom: 16,
    lineHeight: 58,
    color: '#F3EFE4',
  },
  divider: {
    height: 1,
    marginBottom: 14,
    backgroundColor: '#2C2418',
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
  fieldWrapLast: {
    marginBottom: 32,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
    color: '#F3EFE4',
  },
  input: {
    fontFamily: fonts.cuerpo,
    fontSize: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.oro,
    backgroundColor: 'transparent',
    color: '#F3EFE4',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    fontFamily: fonts.cuerpo,
    fontSize: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.oro,
    backgroundColor: 'transparent',
    color: '#F3EFE4',
  },
  eyeButton: {
    paddingBottom: 4,
    paddingLeft: 8,
  },
  button: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
    backgroundColor: '#F3EFE4',
  },
  buttonLoading: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
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
  biometriaIcon: {
    marginRight: 8,
  },
  biometriaText: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.oro,
  },
  errorBanner: {
    borderWidth: 1,
    borderColor: colors.oro,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    backgroundColor: '#1C1710',
  },
  errorText: {
    fontFamily: fonts.cuerpo,
    fontSize: 13,
    textAlign: 'center',
    color: '#F3EFE4',
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
