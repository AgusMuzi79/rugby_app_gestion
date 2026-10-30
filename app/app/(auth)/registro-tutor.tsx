import { useEffect, useRef, useState } from 'react'
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
import { BotonVerPassword } from '@/components/ui/BotonVerPassword'
import { ErrorCampo } from '@/components/ui/ErrorCampo'
import { MIN_PASSWORD } from '@/lib/errorFunction'
import {
  erroresVisibles, fechaAIso, formatearFechaTipeada, hayErrores, todosTocados,
  validarFormTutorCodigo, validarFormTutorDatos,
  type CampoTutorCodigo, type CampoTutorDatos, type Tocados,
} from '@/lib/validacionAuth'
import { useAuthStore } from '@/stores/authStore'
import { useSignOut } from '@/hooks/useSignOut'
import { useRegistroTutor, type RelacionTutor } from '@/hooks/useRegistroTutor'
import { colors, fonts } from '@/constants/theme'

// Sign-up of the adult (mother, father, guardian) of a member under 13 who is
// not a club member. Opened from acceso-restringido.tsx with the minor's DNI,
// or from the login (no DNI: the adult types it).
// Runs without a session: the root guard leaves it alone while
// `registroSinSesion` is set (see app/_layout.tsx).

const PLACEHOLDER = '#9B9A8F'
const PASSWORD_MIN = MIN_PASSWORD

const RELACIONES: { value: RelacionTutor; label: string }[] = [
  { value: 'madre', label: 'Madre' },
  { value: 'padre', label: 'Padre' },
  { value: 'tutor', label: 'Tutor/a' },
  { value: 'otro',  label: 'Otro familiar' },
]

// Per-field validation (lib/validacionAuth.ts): each field shows its own error
// once left, and every field is marked on submit.
const CAMPOS_DATOS: readonly CampoTutorDatos[] = ['relacion', 'email', 'fecha', 'dniMenor']
const CAMPOS_CODIGO: readonly CampoTutorCodigo[] = ['codigo', 'password', 'password2']

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
  const [tocadosDatos, setTocadosDatos]     = useState<Tocados<CampoTutorDatos>>({})
  const [tocadosCodigo, setTocadosCodigo]   = useState<Tocados<CampoTutorCodigo>>({})
  const emailRef     = useRef<TextInput>(null)
  const fechaRef     = useRef<TextInput>(null)
  const dniRef       = useRef<TextInput>(null)
  const passwordRef  = useRef<TextInput>(null)
  const password2Ref = useRef<TextInput>(null)

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

  const erroresDatos = validarFormTutorDatos({ relacion, email, fecha, dniMenor })
  const erroresCodigo = validarFormTutorCodigo({ codigo, password, password2 })
  const errDatos = erroresVisibles(erroresDatos, tocadosDatos)
  const errCodigo = erroresVisibles(erroresCodigo, tocadosCodigo)
  const tocarDato = (c: CampoTutorDatos) => setTocadosDatos(t => (t[c] ? t : { ...t, [c]: true }))
  const tocarCodigo = (c: CampoTutorCodigo) => setTocadosCodigo(t => (t[c] ? t : { ...t, [c]: true }))

  async function enviarCodigo(esReenvio: boolean) {
    setAviso(null)
    setError(null)
    setTocadosDatos(todosTocados(CAMPOS_DATOS))
    if (hayErrores(erroresDatos)) return
    const ok = await solicitarCodigo({
      dniMenor:        dniNormalizado,
      email:           emailNormalizado,
      relacion:        relacion!,
      fechaNacimiento: fechaAIso(fecha)!,
    })
    if (!ok) return
    setCodigo('')
    setTocadosCodigo({})
    setPaso('codigo')
    if (esReenvio) setAviso('Te enviamos un código nuevo.')
  }

  async function confirmarCuenta() {
    setAviso(null)
    setError(null)
    setTocadosCodigo(todosTocados(CAMPOS_CODIGO))
    if (hayErrores(erroresCodigo)) return
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
                  accessibilityLabel="Nombre y apellido"
                  textContentType="name"
                  autoComplete="name"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />
              </View>

              <View style={s.fieldWrap}>
                <Text style={s.label}>RELACIÓN CON EL SOCIO</Text>
                <View style={s.chipsRow} accessibilityRole="radiogroup" accessibilityLabel="Relación con el socio">
                  {RELACIONES.map(r => {
                    const activo = relacion === r.value
                    return (
                      <TouchableOpacity
                        key={r.value}
                        style={[s.chip, activo && s.chipActivo]}
                        onPress={() => { setRelacion(r.value); tocarDato('relacion') }}
                        disabled={loading}
                        activeOpacity={0.75}
                        accessibilityRole="radio"
                        accessibilityLabel={r.label}
                        accessibilityState={{ checked: activo, disabled: loading }}
                      >
                        <Text style={[s.chipTexto, activo && s.chipTextoActivo]}>{r.label.toUpperCase()}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <ErrorCampo mensaje={errDatos.relacion} />
              </View>

              <View style={s.fieldWrap}>
                <Text style={s.label}>TU MAIL</Text>
                <TextInput
                  ref={emailRef}
                  style={[s.input, !!errDatos.email && s.inputConError]}
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => tocarDato('email')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="tu@mail.com"
                  placeholderTextColor={PLACEHOLDER}
                  editable={!loading}
                  accessibilityLabel="Tu mail"
                  textContentType="emailAddress"
                  autoComplete="email"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => fechaRef.current?.focus()}
                />
                <ErrorCampo mensaje={errDatos.email} />
              </View>

              <View style={s.fieldWrap}>
                <Text style={s.label}>TU FECHA DE NACIMIENTO</Text>
                <TextInput
                  ref={fechaRef}
                  style={[s.input, !!errDatos.fecha && s.inputConError]}
                  value={fecha}
                  onChangeText={t => setFecha(formatearFechaTipeada(t))}
                  onBlur={() => tocarDato('fecha')}
                  keyboardType="number-pad"
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={PLACEHOLDER}
                  maxLength={10}
                  editable={!loading}
                  accessibilityLabel="Tu fecha de nacimiento, día, mes y año"
                  textContentType="birthdate"
                  autoComplete="birthdate-full"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => dniRef.current?.focus()}
                />
                <ErrorCampo mensaje={errDatos.fecha} />
              </View>

              <View style={s.fieldWrapLast}>
                <Text style={s.label}>DNI DEL SOCIO MENOR</Text>
                <TextInput
                  ref={dniRef}
                  style={[s.input, !!errDatos.dniMenor && s.inputConError]}
                  value={dniMenor}
                  onChangeText={setDniMenor}
                  onBlur={() => tocarDato('dniMenor')}
                  keyboardType="number-pad"
                  placeholder="Sin puntos"
                  placeholderTextColor={PLACEHOLDER}
                  editable={!loading}
                  accessibilityLabel="DNI del socio menor"
                  // Es el DNI de otra persona: nada que autocompletar.
                  autoComplete="off"
                  returnKeyType="go"
                  onSubmitEditing={() => { if (!loading) void enviarCodigo(false) }}
                />
                <ErrorCampo mensaje={errDatos.dniMenor} />
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
                  style={[s.input, s.codigoInput, !!errCodigo.codigo && s.inputConError]}
                  value={codigo}
                  onChangeText={t => setCodigo(t.replace(/\D/g, '').slice(0, 6))}
                  onBlur={() => tocarCodigo('codigo')}
                  keyboardType="number-pad"
                  placeholder="······"
                  placeholderTextColor={PLACEHOLDER}
                  maxLength={6}
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  editable={!loading}
                  accessibilityLabel="Código"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
                <ErrorCampo mensaje={errCodigo.codigo} />
              </View>

              <View style={s.fieldWrap}>
                <Text style={s.label}>CONTRASEÑA</Text>
                <View style={s.passwordRow}>
                  <TextInput
                    ref={passwordRef}
                    style={[s.passwordInput, !!errCodigo.password && s.inputConError]}
                    value={password}
                    onChangeText={setPassword}
                    onBlur={() => tocarCodigo('password')}
                    secureTextEntry={!mostrarPassword}
                    placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
                    placeholderTextColor={PLACEHOLDER}
                    autoCapitalize="none"
                    editable={!loading}
                    accessibilityLabel="Contraseña"
                    textContentType="newPassword"
                    autoComplete="new-password"
                    passwordRules={`minlength: ${PASSWORD_MIN};`}
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => password2Ref.current?.focus()}
                  />
                  <BotonVerPassword
                    style={s.eyeButton}
                    visible={mostrarPassword}
                    onToggle={() => setMostrarPassword(v => !v)}
                  />
                </View>
                <ErrorCampo mensaje={errCodigo.password} />
              </View>

              <View style={s.fieldWrapLast}>
                <Text style={s.label}>REPETÍ LA CONTRASEÑA</Text>
                <TextInput
                  ref={password2Ref}
                  style={[s.input, !!errCodigo.password2 && s.inputConError]}
                  value={password2}
                  onChangeText={setPassword2}
                  onBlur={() => tocarCodigo('password2')}
                  secureTextEntry={!mostrarPassword}
                  placeholder="••••••••"
                  placeholderTextColor={PLACEHOLDER}
                  autoCapitalize="none"
                  editable={!loading}
                  accessibilityLabel="Repetí la contraseña"
                  textContentType="newPassword"
                  autoComplete="new-password"
                  passwordRules={`minlength: ${PASSWORD_MIN};`}
                  returnKeyType="go"
                  onSubmitEditing={() => { if (!loading) void confirmarCuenta() }}
                />
                <ErrorCampo mensaje={errCodigo.password2} />
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
            <TouchableOpacity
              style={s.linkWrap}
              onPress={() => enviarCodigo(true)}
              disabled={loading}
              accessibilityRole="button"
            >
              <Text style={s.linkText}>Reenviar código</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={s.linkWrap}
            onPress={() => (paso === 'codigo' ? volverADatos() : router.replace('/(auth)/login'))}
            disabled={loading}
            accessibilityRole="button"
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
  kbView: { flex: 1, backgroundColor: colors.fondo },
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
    color: colors.texto,
  },
  divider: { height: 1, marginBottom: 14, backgroundColor: colors.borde },
  subtitle: {
    textAlign: 'center',
    fontFamily: fonts.cuerpo,
    fontStyle: 'italic',
    fontSize: 15,
    color: colors.textoSecundario,
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
    color: colors.texto,
  },
  input: {
    fontFamily: fonts.cuerpo,
    fontSize: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.oro,
    backgroundColor: 'transparent',
    color: colors.texto,
  },
  inputConError: { borderBottomColor: colors.rojoTexto },
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
    color: colors.texto,
  },
  eyeButton: { paddingBottom: 4, paddingLeft: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.borde,
  },
  chipActivo: { backgroundColor: colors.oro + '33', borderColor: colors.oro },
  chipTexto: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: colors.muted },
  chipTextoActivo: { color: colors.oro },
  button: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
    backgroundColor: colors.oro,
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
    color: colors.sobreOro,
  },
  errorBanner: {
    borderWidth: 1,
    borderColor: colors.rojoTexto,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    backgroundColor: colors.card,
  },
  errorText: { fontFamily: fonts.cuerpo, fontSize: 15, textAlign: 'center', color: colors.texto },
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
  linkWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingVertical: 12, minHeight: 44 },
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
