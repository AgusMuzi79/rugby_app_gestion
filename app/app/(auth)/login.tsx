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
import { Link } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useLogin } from '@/hooks/useLogin'

const GOLD        = '#C9A84C'
const CREAM       = '#F5F0E8'
const DARK        = '#1A1A1A'
const DIVIDER     = '#D1C9B8'
const PLACEHOLDER = '#9B9183'

export default function LoginScreen() {
  const [email, setEmail]                   = useState('')
  const [password, setPassword]             = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)

  const {
    login,
    loginConBiometria,
    loading,
    error,
    biometriaDisponible,
    credencialesGuardadas,
  } = useLogin()

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

          {/* Logo */}
          <View className="items-center mb-5">
            <Image
              source={require('../../assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Club name */}
          <Text style={[styles.clubName, { color: GOLD }]}>
            UNCAS RUGBY CLUB · EST. 1969
          </Text>

          {/* Título serif itálico */}
          <Text style={[styles.title, { color: DARK }]}>
            La Bitácora
          </Text>

          {/* Línea divisoria */}
          <View style={[styles.divider, { backgroundColor: DIVIDER }]} />

          {/* Subtítulo */}
          <Text style={styles.subtitle}>
            Diario operativo del cuerpo técnico y organizativo
          </Text>

          {/* Campo USUARIO */}
          <View className="mb-7">
            <Text style={[styles.label, { color: DARK }]}>USUARIO</Text>
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

          {/* Campo CONTRASEÑA */}
          <View className="mb-8">
            <Text style={[styles.label, { color: DARK }]}>CONTRASEÑA</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.passwordInput, { color: DARK, borderBottomColor: GOLD }]}
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
            <View
              style={[styles.errorBanner, { borderColor: GOLD }]}
              className="mb-4"
            >
              <Text className="text-sm text-center" style={{ color: DARK }}>
                {error}
              </Text>
            </View>
          )}

          {/* Botón principal */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: loading ? '#333' : DARK }]}
            onPress={() => login(email, password)}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={GOLD} size="small" />
            ) : (
              <Text style={[styles.buttonText, { color: GOLD }]}>
                INGRESAR AL DIARIO →
              </Text>
            )}
          </TouchableOpacity>

          {/* Botón biométrico */}
          {biometriaDisponible && credencialesGuardadas && !loading && (
            <TouchableOpacity
              style={[styles.biometriaButton, { borderColor: GOLD }]}
              onPress={loginConBiometria}
              activeOpacity={0.8}
            >
              <Ionicons name="finger-print-outline" size={20} color={GOLD} style={{ marginRight: 8 }} />
              <Text style={[styles.biometriaText, { color: GOLD }]}>
                INGRESAR CON HUELLA / FACE ID
              </Text>
            </TouchableOpacity>
          )}

          {/* Olvidé contraseña */}
          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity className="items-center mt-6" disabled={loading}>
              <Text className="text-xs tracking-wide" style={{ color: PLACEHOLDER }}>
                Olvidé mi contraseña
              </Text>
            </TouchableOpacity>
          </Link>

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
  logo: {
    width: 88,
    height: 88,
  },
  clubName: {
    textAlign: 'center',
    fontSize: 10,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    fontFamily: 'serif',
    marginBottom: 10,
  },
  title: {
    textAlign: 'center',
    fontSize: 48,
    fontStyle: 'italic',
    fontFamily: 'serif',
    marginBottom: 16,
    lineHeight: 54,
  },
  divider: {
    height: 1,
    marginBottom: 14,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 13,
    fontStyle: 'italic',
    fontFamily: 'serif',
    color: '#7C7267',
    marginBottom: 40,
    lineHeight: 20,
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
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
  },
  eyeButton: {
    paddingBottom: 4,
    paddingLeft: 8,
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
  biometriaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 4,
  },
  biometriaText: {
    fontSize: 11,
    letterSpacing: 2,
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
})
