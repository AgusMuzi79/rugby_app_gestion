import { useState, useEffect } from 'react'
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
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { ROL_RUTA_INICIAL, type Rol } from '@/constants/roles'
import { colors, fonts } from '@/constants/theme'

const PLACEHOLDER = '#9B9A8F'

export default function RegistroScreen() {
  const router              = useRouter()
  const { session, setNuevoUsuario } = useAuthStore()

  const [cargando, setCargando]               = useState(true)
  const [nombre, setNombre]                   = useState('')
  const [nombreOriginal, setNombreOriginal]   = useState('')
  const [rol, setRol]                         = useState<Rol | null>(null)
  const [password, setPassword]               = useState('')
  const [confirmacion, setConfirmacion]       = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)

  useEffect(() => {
    void cargarPerfil()
  }, [])

  async function cargarPerfil() {
    if (!session?.user) { setCargando(false); return }
    const { data } = await supabase
      .from('profiles')
      .select('nombre, rol')
      .eq('id', session.user.id)
      .single()
    if (data) {
      setNombre(data.nombre ?? '')
      setNombreOriginal(data.nombre ?? '')
      setRol(data.rol as Rol)
    }
    setCargando(false)
  }

  async function guardar() {
    const nombreTrim = nombre.trim()
    const pass       = password.trim()
    const conf       = confirmacion.trim()

    if (!nombreTrim)      { setError('El nombre es requerido.'); return }
    if (!pass)            { setError('La contraseña es requerida.'); return }
    if (pass.length < 8)  { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (pass !== conf)    { setError('Las contraseñas no coinciden.'); return }

    setLoading(true)
    setError(null)

    const { error: passErr } = await supabase.auth.updateUser({ password: pass })
    if (passErr) { setError(passErr.message); setLoading(false); return }

    if (nombreTrim !== nombreOriginal && session?.user) {
      await supabase
        .from('profiles')
        .update({ nombre: nombreTrim })
        .eq('id', session.user.id)
    }

    setNuevoUsuario(false)
    setLoading(false)
    router.replace((rol ? ROL_RUTA_INICIAL[rol] : '/(auth)/login') as Parameters<typeof router.replace>[0])
  }

  if (cargando) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.papel, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.oro} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.papel }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>

          <Text style={styles.clubName}>UNCAS RUGBY CLUB · EST. 1836</Text>
          <Text style={styles.title}>Uncas Rugby App</Text>
          <View style={[styles.divider, { backgroundColor: colors.grisClaro }]} />
          <Text style={styles.subtitle}>Bienvenido. Confirmá tu nombre y elegí una contraseña de acceso.</Text>

          {/* Nombre */}
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>NOMBRE COMPLETO</Text>
            <TextInput
              style={styles.input}
              value={nombre}
              onChangeText={setNombre}
              autoCapitalize="words"
              autoCorrect={false}
              placeholder="Tu nombre completo"
              placeholderTextColor={PLACEHOLDER}
              editable={!loading}
            />
          </View>

          {/* Contraseña */}
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

          {/* Confirmar */}
          <View style={[styles.fieldWrap, { marginBottom: 32 }]}>
            <Text style={styles.label}>CONFIRMAR CONTRASEÑA</Text>
            <TextInput
              style={styles.input}
              value={confirmacion}
              onChangeText={setConfirmacion}
              secureTextEntry={!mostrarPassword}
              placeholder="Repetí tu contraseña"
              placeholderTextColor={PLACEHOLDER}
              editable={!loading}
            />
          </View>

          {error !== null && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonLoading]}
            onPress={guardar}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={colors.oro} size="small" />
              : <Text style={styles.buttonText}>INGRESAR AL SISTEMA →</Text>
            }
          </TouchableOpacity>

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
    color: colors.tinta,
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
    color: PLACEHOLDER,
    marginTop: 48,
  },
})
