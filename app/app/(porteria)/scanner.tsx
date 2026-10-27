import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ActivityIndicator, Linking, useWindowDimensions, KeyboardAvoidingView, ScrollView, Platform, AccessibilityInfo } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView } from 'expo-camera'
import { useAudioPlayer } from 'expo-audio'
import { useNetInfo } from '@react-native-community/netinfo'
import { Feather } from '@expo/vector-icons'
import { useScanner, UMBRAL_INVITADO_REPETIDO, type InvitadoResult } from '@/hooks/useScanner'
import { anuncioVeredicto, estadoVisual, motivoVeredicto, tituloVeredicto, veredicto, type Veredicto } from '@/lib/veredictoScan'
import { accionDni, normalizarDni, volverAlFormularioDni, PAUSA_DNI_7_MS } from '@/lib/entradaDni'
import { codigoManualAQR, normalizarCodigo, normalizarNumeroSocio } from '@/lib/qrCarnet'
import { useAuthStore } from '@/stores/authStore'
import { useColaOffline } from '@/hooks/useSincronizacionOffline'
import { colors, fonts } from '@/constants/theme'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Un color, ícono y texto por veredicto: el título dice la acción (entra / no
// entra), no el dato. Ratios: blanco/#1A7A1A 5.46 · #15110A/#E67E22 6.60 ·
// blanco/#CC4127 4.82 · texto/card.
const VEREDICTO_UI: Record<Veredicto, { bg: string; fg: string; icon: 'check-circle' | 'alert-circle' | 'x-octagon' | 'wifi-off' }> = {
  pasa:         { bg: colors.exito,           fg: colors.blanco,   icon: 'check-circle' },
  pasa_aviso:   { bg: colors.estadoPendiente, fg: colors.sobreOro, icon: 'alert-circle' },
  // Sin red: se dejó pasar sin validar (el personal mira a la persona).
  pasa_sin_validar: { bg: colors.estadoPendiente, fg: colors.sobreOro, icon: 'wifi-off' },
  no_pasa:      { bg: colors.rojoUrgente,     fg: colors.blanco,   icon: 'x-octagon' },
  sin_conexion: { bg: colors.card,            fg: colors.texto,    icon: 'wifi-off' },
}

// Color de la línea del turnero bajo los datos del socio: verde con reserva, ámbar sin
// reserva (modo informativo), apagado si la franja está cerrada.
function colorTurno(estado: string): string {
  if (estado === 'con_reserva') return colors.estadoActivo
  if (estado === 'sin_reserva') return colors.oro
  return MUTED
}

// Aviso de la cola de ingresos sin conexión: cuántos esperan la red y cuántos
// el servidor no pudo registrar (quedan guardados en la tablet).
function textoCola(pendientes: number, noEnviadas: number): string {
  const partes: string[] = []
  if (pendientes > 0) partes.push(`${pendientes} ${pendientes === 1 ? 'INGRESO' : 'INGRESOS'} SIN CONEXIÓN POR ENVIAR`)
  if (noEnviadas > 0) partes.push(`${noEnviadas} SIN ENVIAR · AVISÁ AL ADMINISTRADOR`)
  return partes.join(' · ')
}

// Sin que nadie toque la pantalla entre un escaneo y el siguiente, vuelve
// sola a modo cámara — tiempo suficiente para leer el resultado (o, en modo
// atendido, mostrárselo al socio) antes de que desaparezca.
const AUTO_RESET_MS = 8000

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScannerScreen() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  // En tablet la pantalla de resultado se lee más de lejos (apoyada en un
  // mostrador) — se agranda todo un escalón extra a partir de este ancho.
  const esTablet = width >= 600
  const { rol } = useAuthStore()
  const esAutoservicio = rol === 'porteria'
  const TITULOS_HEADER: Record<string, string> = { canchero: 'CANCHERO · SCANNER', buffet: 'BUFFET · SCANNER' }
  const tituloHeader = TITULOS_HEADER[rol ?? ''] ?? 'GIMNASIO · SCANNER'
  // Gimnasio (rol porteria): autoservicio, el socio escanea su propio carnet → cámara frontal.
  // Canchero y Buffet: atendido, es él quien escanea el carnet del socio → cámara trasera.
  const camaraFacing = esAutoservicio ? 'front' : 'back'
  const { permission, requestPermission, result, fotoUrl, scanning, validando, handleQR, handleDNI, registrarInvitado, cancelar, reset } = useScanner()
  const netInfo = useNetInfo()
  const sinRed = netInfo.isInternetReachable === false
  // Ingresos sin conexión que esperan la red (los manda el layout, useSincronizacionOffline).
  const colaPendientes = useColaOffline(c => c.pendientes)
  const colaNoEnviadas = useColaOffline(c => c.noEnviadas)

  // Fallback sin QR — el socio no llevaba el celular encima.
  const [modoDni, setModoDni] = useState(false)
  const [dniInput, setDniInput] = useState('')
  // Envío automático de un DNI de 7 dígitos tras la pausa (ver lib/entradaDni).
  const timerDni = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nombreInvitadoRef = useRef<TextInput>(null)

  // Ingresar código: Nº de socio + el código manual del carnet (cambia cada
  // minuto), para cuando la cámara no lee el QR. Va por el mismo camino que
  // un QR escaneado (handleQR), con el mismo código TOTP de un solo uso.
  const [modoCodigo, setModoCodigo]   = useState(false)
  const [numeroInput, setNumeroInput] = useState('')
  const [codigoInput, setCodigoInput] = useState('')
  const codigoRef = useRef<TextInput>(null)

  // Invitados (no-socios): sólo en Gimnasio (rol porteria), es una función del gimnasio.
  const [modoInvitado, setModoInvitado]         = useState(false)
  const [invitadoDni, setInvitadoDni]           = useState('')
  const [invitadoNombre, setInvitadoNombre]     = useState('')
  const [invitadoEnviando, setInvitadoEnviando] = useState(false)
  const [invitadoResultado, setInvitadoResultado] = useState<InvitadoResult | null>(null)

  const cerrarInvitado = () => {
    setModoInvitado(false)
    setInvitadoDni('')
    setInvitadoNombre('')
    setInvitadoResultado(null)
  }

  const sonidoOk      = useAudioPlayer(require('../../assets/sounds/ok.wav'))
  const sonidoAviso   = useAudioPlayer(require('../../assets/sounds/aviso.wav'))
  const sonidoAlerta  = useAudioPlayer(require('../../assets/sounds/alerta.wav'))

  // Un sonido por veredicto — pensado para que el encargado del gimnasio lo
  // note sin tener que mirar la pantalla: ok = pasa, aviso = pasa con aviso
  // (moroso, sin reserva), alerta = no pasa o no se pudo verificar.
  useEffect(() => {
    if (!result) return
    const v = veredicto(result)
    const player = v === 'pasa' ? sonidoOk : v === 'pasa_aviso' || v === 'pasa_sin_validar' ? sonidoAviso : sonidoAlerta
    player.seekTo(0)
    player.play()
    // Lector de pantalla: el resultado se anuncia apenas llega (además de la
    // live region de la banda, que Android no siempre lee al aparecer).
    AccessibilityInfo.announceForAccessibility(anuncioVeredicto(result))
  }, [result])

  // Autoservicio: vuelve sola a la cámara, sin esperar que alguien la toque.
  // Siempre limpia el DNI y el código: en la tablet sin atender no queda el de otro.
  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => {
      reset()
      setModoDni(false)
      setDniInput('')
      setModoCodigo(false)
      setNumeroInput('')
      setCodigoInput('')
    }, AUTO_RESET_MS)
    return () => clearTimeout(t)
  }, [result, reset])

  // Al desmontar no queda un envío de DNI pendiente.
  useEffect(() => () => { if (timerDni.current) clearTimeout(timerDni.current) }, [])

  // Tras la confirmación, vuelve sola a la cámara (mismo criterio que el resultado de un escaneo).
  useEffect(() => {
    if (!invitadoResultado?.ok) return
    const t = setTimeout(cerrarInvitado, AUTO_RESET_MS)
    return () => clearTimeout(t)
  }, [invitadoResultado])

  // DNI del invitado: sólo dígitos; completo (8) pasa al nombre, que tiene
  // tecla Enter (el teclado numérico de iOS no).
  const cambiarInvitadoDni = (texto: string) => {
    const dni = normalizarDni(texto)
    setInvitadoDni(dni)
    if (accionDni(dni) === 'enviar') nombreInvitadoRef.current?.focus()
  }

  const enviarInvitado = async () => {
    const dni = normalizarDni(invitadoDni)
    if (!dni || invitadoEnviando) return
    setInvitadoEnviando(true)
    try {
      const res = await registrarInvitado(dni, invitadoNombre)
      setInvitadoResultado(res)
    } finally {
      setInvitadoEnviando(false)
    }
  }

  const cancelarEnvioDni = () => {
    if (timerDni.current) clearTimeout(timerDni.current)
    timerDni.current = null
  }

  // El input no se limpia acá: si la consulta falla por la red se vuelve al
  // formulario con el DNI cargado (ver despuesDelResultado).
  const consultarDni = (dni: string = dniInput) => {
    cancelarEnvioDni()
    if (!dni) return
    handleDNI(dni)
  }

  const cambiarDni = (texto: string) => {
    const dni = normalizarDni(texto)
    setDniInput(dni)
    cancelarEnvioDni()
    const accion = accionDni(dni)
    if (accion === 'enviar') consultarDni(dni)
    else if (accion === 'esperar') timerDni.current = setTimeout(() => consultarDni(dni), PAUSA_DNI_7_MS)
  }

  const salirDeDni = () => {
    cancelarEnvioDni()
    setModoDni(false)
    setDniInput('')
  }

  // El código se consulta solo al completar los 6 dígitos (el teclado
  // numérico de iOS no tiene Enter).
  const consultarCodigo = (numero: string = numeroInput, codigo: string = codigoInput) => {
    const raw = codigoManualAQR(numero, codigo)
    if (raw) handleQR(raw)
  }

  const cambiarCodigo = (texto: string) => {
    const codigo = normalizarCodigo(texto)
    setCodigoInput(codigo)
    if (codigo.length === 6) consultarCodigo(numeroInput, codigo)
  }

  const salirDeCodigo = () => {
    setModoCodigo(false)
    setNumeroInput('')
    setCodigoInput('')
  }

  // ESCANEAR OTRO: vuelve a la cámara, salvo una consulta por DNI o por
  // código que falló por la red, que vuelve al formulario para reintentar.
  const volverAlFormulario = (modoDni || modoCodigo) && !!result && volverAlFormularioDni(result)
  const despuesDelResultado = () => {
    reset()
    if (!volverAlFormulario) {
      salirDeDni()
      salirDeCodigo()
    }
  }

  // ── Sin permiso ──────────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={colors.oro} />
      </View>
    )
  }

  if (!permission.granted) {
    // Si el usuario ya rechazó el permiso antes, Android/iOS dejan de mostrar
    // el diálogo nativo — requestPermission() resuelve al toque sin abrir nada.
    // Hay que mandarlo a Ajustes del sistema en ese caso.
    const bloqueado = !permission.canAskAgain

    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <View style={s.permBar}>
          <Text style={s.permBarLabel}>{tituloHeader}</Text>
        </View>
        <View style={s.center}>
          <Feather name="camera-off" size={48} color={MUTED} />
          <Text style={s.permTitle}>Cámara requerida</Text>
          <Text style={s.permSub}>
            {bloqueado
              ? 'Denegaste el acceso a la cámara. Activalo desde Ajustes del sistema para poder escanear carnets.'
              : 'La app necesita acceso a la cámara para escanear los carnets.'}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={s.permBtn}
            onPress={bloqueado ? () => Linking.openSettings() : requestPermission}
            activeOpacity={0.8}
          >
            <Text style={s.permBtnText}>{bloqueado ? 'ABRIR AJUSTES' : 'PERMITIR ACCESO'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Resultado ──────────────────────────────────────────────────────────
  if (result || validando) {
    const v        = result ? veredicto(result) : null
    const ui       = v ? VEREDICTO_UI[v] : null
    const pasa     = v === 'pasa' || v === 'pasa_aviso' || v === 'pasa_sin_validar'
    const motivo   = result ? motivoVeredicto(result) : null

    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.permBar}>
          <Text style={s.permBarLabel}>{tituloHeader}</Text>
        </View>

        {validando ? (
          <View style={s.validandoContainer}>
            <ActivityIndicator color={colors.oro} size="large" />
            <Text style={s.validandoText}>Verificando carnet…</Text>
            <TouchableOpacity accessibilityRole="button" style={s.permBtn} onPress={cancelar} activeOpacity={0.8}>
              <Text style={s.permBtnText}>CANCELAR</Text>
            </TouchableOpacity>
          </View>
        ) : result && ui ? (
          <View style={s.resultContainer}>
            {/* Banda del veredicto: ¿entra o no entra? */}
            <View
              style={[s.resultBand, { backgroundColor: ui.bg }, esTablet && s.resultBandTablet]}
              accessible
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              accessibilityLabel={anuncioVeredicto(result)}
            >
              <Feather name={ui.icon} size={esTablet ? 56 : 32} color={ui.fg} />
              <View style={s.resultBandTextos}>
                <Text style={[s.resultBandText, { color: ui.fg }, esTablet && s.resultBandTextTablet]}>
                  {tituloVeredicto(result)}
                </Text>
                {pasa && !!motivo && (
                  <Text style={[s.resultBandMotivo, { color: ui.fg }, esTablet && s.resultBandMotivoTablet]}>
                    {motivo}
                  </Text>
                )}
              </View>
            </View>

            {/* Reintento ya registrado o ingreso sin conexión: no hay ficha del socio, el motivo va en la banda. */}
            {result.reintentoRegistrado || result.encoladoOffline ? null : pasa ? (
              <View style={[s.resultBody, esTablet && s.resultBodyTablet]}>
                {/* Foto */}
                {fotoUrl ? (
                  <Image source={{ uri: fotoUrl }} style={[s.fotoSocio, esTablet && s.fotoSocioTablet]} />
                ) : (
                  <View style={[s.fotoSocio, s.fotoPlaceholder, esTablet && s.fotoSocioTablet]}>
                    <Feather name="user" size={esTablet ? 84 : 40} color={colors.grisClaro} />
                  </View>
                )}

                {/* Info */}
                <View style={[s.resultInfo, esTablet && s.resultInfoTablet]}>
                  <Text style={[s.resultNombre, esTablet && s.resultNombreTablet]}>{result.nombre ?? '—'}</Text>

                  <View style={s.resultRow}>
                    <Text style={[s.resultLabel, esTablet && s.resultLabelTablet]}>Nº SOCIO</Text>
                    <Text style={[s.resultValor, esTablet && s.resultValorTablet]}>{result.numero_socio}</Text>
                  </View>
                  <View style={s.resultRow}>
                    <Text style={[s.resultLabel, esTablet && s.resultLabelTablet]}>CATEGORÍA</Text>
                    <Text style={[s.resultValor, esTablet && s.resultValorTablet]}>{result.categoria}</Text>
                  </View>
                  <View style={s.resultRow}>
                    <Text style={[s.resultLabel, esTablet && s.resultLabelTablet]}>ESTADO</Text>
                    <Text style={[
                      s.resultValor,
                      esTablet && s.resultValorTablet,
                      estadoVisual(result) === 'moroso' && { color: colors.rojoTexto },
                    ]}>
                      {estadoVisual(result).toUpperCase()}
                    </Text>
                  </View>
                  {!!result.turno?.mensaje && (
                    <Text style={[
                      s.turnoLinea,
                      esTablet && s.turnoLineaTablet,
                      { color: colorTurno(result.turno.estado) },
                    ]}>
                      {result.turno.mensaje}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <View style={s.motivoContainer}>
                <Text style={[
                  s.motivoText,
                  esTablet && s.motivoTextTablet,
                  result.turno?.bloquear === true && { color: colors.rojoTexto },
                ]}>
                  {motivo}
                </Text>
              </View>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              style={[s.nuevoBtn, esTablet && s.nuevoBtnTablet]}
              onPress={despuesDelResultado}
              activeOpacity={0.8}
            >
              <Text style={[s.nuevoBtnText, esTablet && s.nuevoBtnTextTablet]}>{!volverAlFormulario ? 'ESCANEAR OTRO' : modoDni ? 'REINTENTAR CON EL DNI' : 'REINTENTAR CON EL CÓDIGO'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    )
  }

  // ── Registrar invitado (no-socio) ─────────────────────────────────────────
  if (modoInvitado && esAutoservicio) {
    const confirmado = invitadoResultado?.ok === true
    const sinConteo  = confirmado && invitadoResultado?.veces == null
    const repetido   = confirmado && (invitadoResultado?.veces ?? 0) >= UMBRAL_INVITADO_REPETIDO

    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.permBar}>
          <Text style={s.permBarLabel}>{tituloHeader}</Text>
        </View>

        <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.dniContainer} keyboardShouldPersistTaps="handled">
            {confirmado ? (
              <>
                <Feather name={repetido ? 'alert-triangle' : 'check-circle'} size={48} color={repetido ? colors.rojoUrgente : colors.oro} />
                <Text style={s.dniTitle}>Invitado registrado</Text>
                <Text style={s.dniSub}>
                  DNI {invitadoResultado?.dni}{invitadoResultado?.nombre ? ` · ${invitadoResultado.nombre}` : ''}
                  {'\n'}
                  {sinConteo
                    ? 'No se pudo calcular cuántas veces vino.'
                    : `${invitadoResultado?.veces} ${invitadoResultado?.veces === 1 ? 'vez' : 'veces'} en los últimos 30 días`}
                </Text>
                {repetido && (
                  <Text style={[s.dniSub, { color: colors.rojoTexto }]}>
                    Derivar a Secretaría para que se haga socio.
                  </Text>
                )}
                <TouchableOpacity accessibilityRole="button" style={s.dniBtn} onPress={cerrarInvitado} activeOpacity={0.8}>
                  <Text style={s.dniBtnText}>LISTO</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Feather name="user-plus" size={40} color={MUTED} />
                <Text style={s.dniTitle}>Registrar invitado</Text>
                <Text style={s.dniSub}>DNI obligatorio, nombre opcional</Text>

                <TextInput
                  style={s.dniInput}
                  value={invitadoDni}
                  onChangeText={cambiarInvitadoDni}
                  keyboardType="number-pad"
                  placeholder="DNI"
                  placeholderTextColor={MUTED}
                  maxLength={12}
                  autoFocus
                />
                <TextInput
                  ref={nombreInvitadoRef}
                  style={s.dniInput}
                  value={invitadoNombre}
                  onChangeText={setInvitadoNombre}
                  placeholder="Nombre (opcional)"
                  placeholderTextColor={MUTED}
                  maxLength={80}
                  onSubmitEditing={enviarInvitado}
                />

                {invitadoResultado && !invitadoResultado.ok && (
                  <Text style={[s.dniSub, { color: colors.rojoTexto }]}>
                    {invitadoResultado.motivo ?? 'No se pudo registrar el invitado'}
                  </Text>
                )}

                <TouchableOpacity
                  accessibilityRole="button"
                  style={[s.dniBtn, (!invitadoDni.trim() || invitadoEnviando) && { opacity: 0.5 }]}
                  onPress={enviarInvitado}
                  disabled={!invitadoDni.trim() || invitadoEnviando}
                  activeOpacity={0.8}
                >
                  {invitadoEnviando
                    ? <ActivityIndicator color={colors.papel} />
                    : <Text style={s.dniBtnText}>REGISTRAR</Text>}
                </TouchableOpacity>

                <TouchableOpacity accessibilityRole="button" onPress={cerrarInvitado} style={s.volverBtn} activeOpacity={0.7}>
                  <Text style={s.dniVolver}>Volver a escanear QR</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    )
  }

  // ── La cámara no lee el QR: Nº de socio + código manual ──────────────────
  if (modoCodigo) {
    const listo = codigoManualAQR(numeroInput, codigoInput) !== null
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.permBar}>
          <Text style={s.permBarLabel}>{tituloHeader}</Text>
        </View>

        <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.dniContainer} keyboardShouldPersistTaps="handled">
            <Feather name="key" size={40} color={MUTED} />
            <Text style={s.dniTitle}>{!esAutoservicio ? 'La cámara no lee el QR' : 'La cámara no lee tu QR'}</Text>
            <Text style={s.dniSub}>
              {!esAutoservicio
                ? 'Pedile al socio su Nº de socio y el código manual del carnet (cambia cada minuto)'
                : 'Ingresá tu Nº de socio y el código manual de tu carnet (cambia cada minuto)'}
            </Text>

            <TextInput
              style={s.dniInput}
              value={numeroInput}
              onChangeText={t => setNumeroInput(normalizarNumeroSocio(t))}
              keyboardType="number-pad"
              placeholder="Nº de socio o de cliente"
              placeholderTextColor={MUTED}
              maxLength={12}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => codigoRef.current?.focus()}
              accessibilityLabel="Número de socio o de cliente"
            />
            <TextInput
              ref={codigoRef}
              style={s.dniInput}
              value={codigoInput}
              onChangeText={cambiarCodigo}
              keyboardType="number-pad"
              placeholder="Código (6 dígitos)"
              placeholderTextColor={MUTED}
              maxLength={9}
              onSubmitEditing={() => consultarCodigo()}
              accessibilityLabel="Código manual del carnet, 6 dígitos"
            />

            <TouchableOpacity
              accessibilityRole="button"
              style={[s.dniBtn, !listo && { opacity: 0.5 }]}
              onPress={() => consultarCodigo()}
              disabled={!listo}
              activeOpacity={0.8}
            >
              <Text style={s.dniBtnText}>CONSULTAR</Text>
            </TouchableOpacity>

            <TouchableOpacity accessibilityRole="button" onPress={salirDeCodigo} style={s.volverBtn} activeOpacity={0.7}>
              <Text style={s.dniVolver}>Volver a escanear QR</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    )
  }

  // ── Sin QR, ingresar DNI ──────────────────────────────────────────────────
  if (modoDni) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.permBar}>
          <Text style={s.permBarLabel}>{tituloHeader}</Text>
        </View>

        <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.dniContainer} keyboardShouldPersistTaps="handled">
            <Feather name="hash" size={40} color={MUTED} />
            <Text style={s.dniTitle}>{!esAutoservicio ? 'El socio no tiene el carnet a mano' : 'No tenés el carnet a mano'}</Text>
            <Text style={s.dniSub}>{!esAutoservicio ? 'Ingresá su DNI para consultar su estado' : 'Ingresá tu DNI para consultar tu estado'}</Text>

            {/* Se consulta solo al completar el DNI: el teclado numérico de iOS no tiene Enter. */}
            <TextInput
              style={s.dniInput}
              value={dniInput}
              onChangeText={cambiarDni}
              keyboardType="number-pad"
              placeholder="12345678"
              placeholderTextColor={MUTED}
              maxLength={12}
              autoFocus
              onSubmitEditing={() => consultarDni()}
            />

            <TouchableOpacity accessibilityRole="button" style={s.dniBtn} onPress={() => consultarDni()} activeOpacity={0.8}>
              <Text style={s.dniBtnText}>CONSULTAR</Text>
            </TouchableOpacity>

            <TouchableOpacity accessibilityRole="button" onPress={salirDeDni} style={s.volverBtn} activeOpacity={0.7}>
              <Text style={s.dniVolver}>Volver a escanear QR</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    )
  }

  // ── Cámara activa ──────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.permBar}>
        <Text style={s.permBarLabel}>{tituloHeader}</Text>
      </View>

      {sinRed && (
        <View style={s.sinRedBanner} accessibilityRole="alert">
          <Feather name="wifi-off" size={16} color={colors.texto} />
          <Text style={s.sinRedTexto}>SIN CONEXIÓN · los ingresos se registran sin validar</Text>
        </View>
      )}
      {(colaPendientes > 0 || colaNoEnviadas > 0) && (
        <View style={s.sinRedBanner} accessible accessibilityLabel={textoCola(colaPendientes, colaNoEnviadas)}>
          <Feather name="upload-cloud" size={16} color={colors.texto} />
          <Text style={s.sinRedTexto}>{textoCola(colaPendientes, colaNoEnviadas)}</Text>
        </View>
      )}

      <View style={s.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing={camaraFacing}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          // Sin handler mientras no se escanea: la cámara deja de mandar
          // eventos (el candado de useScanner frena los que ya venían).
          onBarcodeScanned={scanning ? ({ data }) => handleQR(data) : undefined}
        />

        {/* Visor overlay */}
        <View style={s.overlay}>
          <View style={s.visor}>
            <View style={[s.corner, s.cornerTL]} />
            <View style={[s.corner, s.cornerTR]} />
            <View style={[s.corner, s.cornerBL]} />
            <View style={[s.corner, s.cornerBR]} />
          </View>
        </View>

        <View style={[s.hint, { bottom: esAutoservicio ? 176 : 124 }]}>
          <View style={s.hintChip}>
            <Text style={s.hintText}>
              {!esAutoservicio ? 'Acercá el carnet del socio a la cámara' : 'Acercá el QR de tu carnet a la cámara'}
            </Text>
          </View>
        </View>

        <View style={s.dniLink}>
          <TouchableOpacity accessibilityRole="button" onPress={() => setModoCodigo(true)} activeOpacity={0.7}>
            <View style={s.dniLinkChip}>
              <Text style={s.dniLinkText}>¿No lee el QR? Ingresar código</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => setModoDni(true)} activeOpacity={0.7}>
            <View style={s.dniLinkChip}>
              <Text style={s.dniLinkText}>{!esAutoservicio ? '¿No tiene el carnet? Ingresar DNI' : '¿No tenés el carnet? Ingresar DNI'}</Text>
            </View>
          </TouchableOpacity>
          {esAutoservicio && (
            <TouchableOpacity accessibilityRole="button" onPress={() => setModoInvitado(true)} activeOpacity={0.7}>
              <View style={s.dniLinkChip}>
                <Text style={s.dniLinkText}>Registrar invitado</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const VISOR_SIZE = 240

const MUTED = colors.muted

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.papel },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },

  permBar: {
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.papel,
    borderBottomWidth: 1, borderBottomColor: colors.borde,
  },
  permBarLabel: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },

  permTitle: {
    fontFamily: fonts.titulo, fontSize: 26, color: colors.texto, textAlign: 'center',
  },
  permSub: {
    fontFamily: fonts.cuerpo, fontSize: 15, color: MUTED,
    textAlign: 'center', paddingHorizontal: 40,
  },
  permBtn: {
    marginTop: 8, borderWidth: 1, borderColor: colors.oro,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 4,
  },
  permBtnText: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },

  // Camera
  cameraContainer: { flex: 1, position: 'relative' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visor: {
    width: VISOR_SIZE, height: VISOR_SIZE, position: 'relative',
  },
  corner: {
    position: 'absolute', width: 30, height: 30,
    borderColor: colors.oro, borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  hint: {
    position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center',
  },
  // Fondo oscuro fijo detrás del texto: sin esto, contra un techo o pared
  // blanca (lo que suele captar la cámara frontal) el texto claro se pierde.
  hintChip: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6,
  },
  hintText: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.blanco,
  },
  dniLink: {
    position: 'absolute', bottom: 16, left: 0, right: 0, alignItems: 'center', gap: 8,
  },
  // minHeight 44: área táctil mínima (antes ~30).
  dniLinkChip: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    minHeight: 44, justifyContent: 'center',
  },
  dniLinkText: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 1,
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)',
    textDecorationLine: 'underline',
  },

  // Ingresar DNI (fallback sin QR). flexGrow (no flex): es el contenido de un
  // ScrollView, centrado mientras entra y scrolleable cuando sube el teclado.
  kav: { flex: 1 },
  dniContainer: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40, paddingVertical: 24,
  },
  dniTitle: {
    fontFamily: fonts.titulo, fontSize: 23, color: colors.texto, textAlign: 'center',
  },
  dniSub: {
    fontFamily: fonts.cuerpo, fontSize: 15, color: MUTED, textAlign: 'center', marginBottom: 8,
  },
  dniInput: {
    width: '100%', maxWidth: 320, fontFamily: fonts.cuerpo, fontSize: 21, textAlign: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.oro,
    backgroundColor: 'transparent', color: colors.texto, letterSpacing: 2,
  },
  dniBtn: {
    marginTop: 12, width: '100%', maxWidth: 320, borderRadius: 4,
    paddingVertical: 16, alignItems: 'center', backgroundColor: colors.oro,
  },
  dniBtnText: {
    fontFamily: fonts.label, fontSize: 14, letterSpacing: 2.5, color: colors.papel,
  },
  // El link entero es el botón (minHeight 44), no sólo el texto (~17).
  volverBtn: { marginTop: 8, minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  dniVolver: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 1,
    textTransform: 'uppercase', color: MUTED, textDecorationLine: 'underline',
  },

  // Validando
  validandoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  validandoText: {
    fontFamily: fonts.cuerpo, fontSize: 18, fontStyle: 'italic', color: MUTED,
  },

  // Resultado
  resultContainer: { flex: 1 },
  resultBand: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 24, paddingVertical: 20,
  },
  resultBandText: {
    fontFamily: fonts.label, fontSize: 18, letterSpacing: 3,
    textTransform: 'uppercase', color: colors.blanco,
  },
  resultBandTablet: { paddingHorizontal: 48, paddingVertical: 40, gap: 28 },
  resultBandTextTablet: { fontSize: 34 },
  resultBandTextos: { flex: 1, gap: 4 },
  resultBandMotivo: { fontFamily: fonts.cuerpo, fontSize: 15 },
  resultBandMotivoTablet: { fontSize: 24 },

  sinRedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.card,
  },
  sinRedTexto: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 1.5, color: colors.texto,
  },

  resultBody: {
    flexDirection: 'row', gap: 20, padding: 24,
  },
  // En tablet el body pasa a ocupar todo el espacio libre entre el banner y
  // el botón, y centra el bloque foto+datos ahí — así no queda todo pegado
  // arriba con media pantalla vacía debajo.
  resultBodyTablet: {
    flex: 1, gap: 44, padding: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  fotoSocio: {
    width: 100, height: 120, borderRadius: 4,
    borderWidth: 1, borderColor: '#333333',
  },
  fotoSocioTablet: { width: 240, height: 288 },
  fotoPlaceholder: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.borde,
  },
  resultInfo: { flex: 1, gap: 10 },
  resultInfoTablet: { flex: 0, maxWidth: 460, gap: 28 },
  resultNombre: {
    fontFamily: fonts.titulo, fontSize: 23, color: colors.texto, marginBottom: 6,
  },
  resultNombreTablet: { fontSize: 44, marginBottom: 14 },
  resultRow:   { gap: 2 },
  resultLabel: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
    textTransform: 'uppercase', color: MUTED,
  },
  resultLabelTablet: { fontSize: 17 },
  resultValor: {
    fontFamily: fonts.cuerpo, fontSize: 16, color: colors.texto,
  },
  resultValorTablet: { fontSize: 32 },
  turnoLinea: {
    fontFamily: fonts.label, fontSize: 14, letterSpacing: 0.5, marginTop: 4,
  },
  turnoLineaTablet: { fontSize: 24, marginTop: 8 },

  motivoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  motivoText: {
    fontFamily: fonts.cuerpo, fontSize: 18, fontStyle: 'italic',
    color: MUTED, textAlign: 'center',
  },
  motivoTextTablet: { fontSize: 26 },

  nuevoBtn: {
    margin: 24, borderWidth: 1, borderColor: colors.oro,
    paddingVertical: 16, alignItems: 'center', borderRadius: 4,
  },
  nuevoBtnTablet: { margin: 40, paddingVertical: 22 },
  nuevoBtnText: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
  nuevoBtnTextTablet: { fontSize: 17 },
})
