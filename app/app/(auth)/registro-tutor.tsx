import { useEffect, useState } from 'react'
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
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/stores/authStore'
import { useSignOut } from '@/hooks/useSignOut'
import { useRegistroTutor, type RelacionTutor } from '@/hooks/useRegistroTutor'
import { colors, fonts } from '@/constants/theme'

// Sign-up of the adult (mother, father, guardian) of a member under 13 who is
// not a club member. Opened from acceso-restringido.tsx with the minor's DNI.
// Runs without a session: the root guard leaves it alone while
// `registroSinSesion` is set (see app/_layout.tsx).

const PLACEHOLDER = '#9B9A8F'
const HITSOP = { top: 8, bottom: 8, left: 8, right: 8 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN = 8

const RELACIONES: { value: RelacionTutor; label: string }[] = [
  { value: 'madre', label: 'Madre' },
  { value: 'padre', label: 'Padre' },
  { value: 'tutor', label: 'Tutor/a' },
  { value: 'otro',  label: 'Otro familiar' },
]

// "DD/MM/AAAA" while typing: keeps digits only and inserts the slashes.
function formatearFechaTipeada(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

// "DD/MM/AAAA" -> "YYYY-MM-DD", or null when it is not a real past date.
function fechaAIso(texto: string): string | null {
  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const fecha = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  const valida = fecha.getFullYear() === Number(yyyy)
    && fecha.getMonth() === Number(mm) - 1
    && fecha.getDate() === Number(dd)
  if (!valida || fecha > new Date() || Number(yyyy) < 1900) return null
  return `${yyyy}-${mm}-${dd}`
}

type Paso = 'datos' | 'codigo'

export default function RegistroTutorScreen() {
  const router = useRouter()
  const { dni: dniParam } = useLocalSearchParams<{ dni?: string }>()
  const session = useAuthStore(s => s.session)
  const setRegistroSinSesion = useAuthStore(s => s.setRegistroSinSesion)
  const { signOut } = useSignOut()
  const { loading, error, setError, solicitarCodigo, crearCuenta } = useRegistroTutor()

  const [paso, setPaso]                     = useState<Paso>('datos')
  const [nombre, setNombre]                 = useState('')
  const [relacion, setRelacion]             = useState<RelacionTutor | null>(null)
  const [email, setEmail]                   = useState('')
  const [fecha, setFecha]                   = useState('')
  const [dniMenor, setDniMenor]             = useState(dniParam ?? '')
  const [codigo, setCodigo]                 = useState('')
  const [password, setPassword]             = useState('')
  const [password2, setPassword2]           = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [aviso, setAviso]                   = useState<string | null>(null)

  // Flag first, then sign the restricted minor out: the guard must see the
  // flag when the session clears. Cleared on unmount (account created ->
  // routed by role, or the user went back to the login).
  useEffect(() => {
    setRegistroSinSesion(true)
    if (session) void signOut()
    return () => setRegistroSinSesion(false)
  }, []) // mount only: a later session is the new tutor's, never signed out here

  const emailNormalizado = email.trim().toLowerCase()
  const dniNormalizado = dniMenor.replace(/\D/g, '')

  function validarDatos(): string | null {
    if (!relacion) return 'Elegí tu relación con el socio.'
    if (!EMAIL_RE.test(emailNormalizado)) return 'Ingresá un mail válido.'
    if (!fechaAIso(fecha)) return 'Ingresá tu fecha de nacimiento con el formato DD/MM/AAAA.'
    if (!dniNormalizado) return 'Ingresá el DNI del socio menor.'
    return null
  }

  async function enviarCodigo(esReenvio: boolean) {
    setAviso(null)
    const invalido = validarDatos()
    if (invalido) { setError(invalido); return }
    const ok = await solicitarCodigo({
      dniMenor:        dniNormalizado,
      email:           emailNormalizado,
      relacion:        relacion!,
      fechaNacimiento: fechaAIso(fecha)!,
    })
    if (!ok) return
    setCodigo('')
    setPaso('codigo')
    if (esReenvio) setAviso('Te enviamos un código nuevo.')
  }

  async function confirmarCuenta() {
    setAviso(null)
    if (!/^\d{6}$/.test(codigo)) { setError('El código tiene 6 números.'); return }
    if (password.length < PASSWORD_MIN) {
      setError(`La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.`)
      return
    }
    if (password !== password2) { setError('Las contraseñas no coinciden.'); return }
    // Success signs in; the root layout routes the new tutor by role.
    await crearCuenta({
      dniMenor: dniNormalizado,
      email:    emailNormalizado,
      codigo,
      password,
      nombre:   nombre.trim(),
    })
  }

  function volverADatos() {
    setError(null)
    setAviso(null)
    setPaso('datos')
  }

  return (
    <KeyboardAvoidingView
      style={s.kbView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={s.container}>
          <Text style={s.clubName}>UNCAS RUGBY CLUB · EST. 1836</Text>
          <Text style={s.title}>{paso === 'datos' ? 'Cuenta de\nfamiliar o tutor' : 'Revisá tu mail'}</Text>
          <View style={s.divider} />

          {paso === 'datos' ? (
            <>
              <Text style={s.subtitle}>
                Usá el mismo mail que tiene cargado el club para el socio menor. Te vamos a mandar
                un código para confirmar que sos vos.
              </Text>

              <View style={s.fieldWrap}>
                <Text style={s.label}>NOMBRE Y APELLIDO</Text>
                <TextInput
                  style={s.input}
                  value={nombre}
                  onChangeText={setNombre}
                  autoCapitalize="words"
                  autoCorrect={false}
                  placeholder="Tu nombre y apellido"
                  placeholderTextColor={PLACEHOLDER}
                  editable={!loading}
                />
              </View>

              <View style={s.fieldWrap}>
                <Text style={s.label}>RELACIÓN CON EL SOCIO</Text>
                <View style={s.chipsRow}>
                  {RELACIONES.map(r => {
                    const activo = relacion === r.value
                    return (
                      <TouchableOpacity
                        key={r.value}
                        style={[s.chip, activo && s.chipActivo]}
                        onPress={() => setRelacion(r.value)}
                        disabled={loading}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activo }}
                      >
                        <Text style={[s.chipTexto, activo && s.chipTextoActivo]}>{r.label.toUpperCase()}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              <View style={s.fieldWrap}>
                <Text style={s.label}>TU MAIL</Text>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="tu@mail.com"
                  placeholderTextColor={PLACEHOLDER}
                  editable={!loading}
                />
              </View>

              <View style={s.fieldWrap}>
                <Text style={s.label}>TU FECHA DE NACIMIENTO</Text>
                <TextInput
                  style={s.input}
                  value={fecha}
                  onChangeText={t => setFecha(formatearFechaTipeada(t))}
                  keyboardType="number-pad"
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={PLACEHOLDER}
                  maxLength={10}
                  editable={!loading}
                />
              </View>

              <View style={s.fieldWrapLast}>
                <Text style={s.label}>DNI DEL SOCIO MENOR</Text>
                <TextInput
                  style={s.input}
                  value={dniMenor}
                  onChangeText={setDniMenor}
                  keyboardType="number-pad"
                  placeholder="Sin puntos"
                  placeholderTextColor={PLACEHOLDER}
                  editable={!loading}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={s.subtitle}>
                Te mandamos un código a {emailNormalizado}. Ingresalo y elegí una contraseña para tu cuenta.
              </Text>

              <View style={s.fieldWrap}>
                <Text style={s.label}>CÓDIGO</Text>
                <TextInput
                  style={[s.input, s.codigoInput]}
                  value={codigo}
                  onChangeText={t => setCodigo(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  placeholder="······"
                  placeholderTextColor={PLACEHOLDER}
                  maxLength={6}
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  editable={!loading}
                />
              </View>

              <View style={s.fieldWrap}>
                <Text style={s.label}>CONTRASEÑA</Text>
                <View style={s.passwordRow}>
                  <TextInput
                    style={s.passwordInput}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!mostrarPassword}
                    placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
                    placeholderTextColor={PLACEHOLDER}
                    autoCapitalize="none"
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

              <View style={s.fieldWrapLast}>
                <Text style={s.label}>REPETÍ LA CONTRASEÑA</Text>
                <TextInput
                  style={s.input}
                  value={password2}
                  onChangeText={setPassword2}
                  secureTextEntry={!mostrarPassword}
                  placeholder="••••••••"
                  placeholderTextColor={PLACEHOLDER}
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>
            </>
          )}

          {aviso !== null && (
            <View style={s.successBanner}>
              <Text style={s.successText}>{aviso}</Text>
            </View>
          )}

          {error !== null && (
            <View style={s.errorBanner}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={loading ? s.buttonLoading : s.button}
            onPress={() => (paso === 'datos' ? enviarCodigo(false) : confirmarCuenta())}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.oro} size="small" />
            ) : (
              <Text style={s.buttonText}>{paso === 'datos' ? 'ENVIAR CÓDIGO' : 'CREAR CUENTA'}</Text>
            )}
          </TouchableOpacity>

          {paso === 'codigo' && (
            <TouchableOpacity style={s.linkWrap} onPress={() => enviarCodigo(true)} disabled={loading}>
              <Text style={s.linkText}>Reenviar código</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={s.linkWrap}
            onPress={() => (paso === 'codigo' ? volverADatos() : router.replace('/(auth)/login'))}
            disabled={loading}
          >
            <Text style={s.linkText}>{paso === 'codigo' ? 'Volver' : 'Volver al inicio'}</Text>
          </TouchableOpacity>

          <Text style={s.footer}>UNCAS RUGBY APP</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  kbView: { flex: 1, backgroundColor: '#15110A' },
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
    fontSize: 34,
    lineHeight: 40,
    marginBottom: 16,
    color: '#F3EFE4',
  },
  divider: { height: 1, marginBottom: 14, backgroundColor: '#2C2418' },
  subtitle: {
    textAlign: 'center',
    fontFamily: fonts.cuerpo,
    fontStyle: 'italic',
    fontSize: 15,
    color: '#7C7267',
    marginBottom: 32,
    lineHeight: 20,
  },
  fieldWrap: { marginBottom: 24 },
  fieldWrapLast: { marginBottom: 32 },
  label: {
    fontFamily: fonts.label,
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 8,
    color: '#F3EFE4',
  },
  input: {
    fontFamily: fonts.cuerpo,
    fontSize: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.oro,
    backgroundColor: 'transparent',
    color: '#F3EFE4',
  },
  codigoInput: { fontFamily: fonts.mono, fontSize: 24, letterSpacing: 8 },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: {
    flex: 1,
    fontFamily: fonts.cuerpo,
    fontSize: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.oro,
    backgroundColor: 'transparent',
    color: '#F3EFE4',
  },
  eyeButton: { paddingBottom: 4, paddingLeft: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1C1710',
    borderWidth: 1.5,
    borderColor: '#2C2418',
  },
  chipActivo: { backgroundColor: colors.oro + '33', borderColor: colors.oro },
  chipTexto: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: '#8E8574' },
  chipTextoActivo: { color: colors.oro },
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
    fontSize: 14,
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
    backgroundColor: '#1C1710',
  },
  errorText: { fontFamily: fonts.cuerpo, fontSize: 15, textAlign: 'center', color: '#F3EFE4' },
  successBanner: {
    backgroundColor: '#F0F9EC',
    borderWidth: 1,
    borderColor: '#7CB87C',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  successText: { fontFamily: fonts.cuerpo, fontSize: 15, textAlign: 'center', color: '#2D6A2D' },
  linkWrap: { alignItems: 'center', marginTop: 20 },
  linkText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: PLACEHOLDER },
  footer: {
    fontFamily: fonts.label,
    textAlign: 'center',
    fontSize: 12,
    letterSpacing: 1.5,
    color: PLACEHOLDER,
    marginTop: 48,
  },
})
