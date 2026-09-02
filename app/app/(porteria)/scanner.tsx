import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ActivityIndicator, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView } from 'expo-camera'
import { useAudioPlayer } from 'expo-audio'
import { Feather } from '@expo/vector-icons'
import { useScanner, type ScanResult } from '@/hooks/useScanner'
import { colors, fonts } from '@/constants/theme'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Mismo criterio que el carnet del socio: 'activo' con semáforo 'rojo'
// (2+ períodos impagos) se muestra como 'moroso' acá también.
function estadoVisual(result: ScanResult): string {
  if (result.estado === 'activo' && result.semaforo === 'rojo') return 'moroso'
  return result.estado ?? ''
}

// Autoservicio (tablet fija, sin nadie tocando pantalla entre socio y socio):
// a los pocos segundos vuelve sola a modo cámara para el próximo escaneo.
const AUTO_RESET_MS = 4000

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScannerScreen() {
  const insets = useSafeAreaInsets()
  const { permission, requestPermission, result, scanning, validando, handleQR, handleDNI, reset } = useScanner()

  // Fallback sin QR — el socio no llevaba el celular encima.
  const [modoDni, setModoDni] = useState(false)
  const [dniInput, setDniInput] = useState('')

  const sonidoOk      = useAudioPlayer(require('../../assets/sounds/ok.wav'))
  const sonidoAlerta  = useAudioPlayer(require('../../assets/sounds/alerta.wav'))

  // Un sonido distinto según el resultado — pensado para que el encargado del
  // gimnasio lo note sin tener que mirar la pantalla en cada escaneo.
  useEffect(() => {
    if (!result) return
    const moroso = result.valido ? estadoVisual(result) === 'moroso' : true
    const player = moroso ? sonidoAlerta : sonidoOk
    player.seekTo(0)
    player.play()
  }, [result])

  // Autoservicio: vuelve sola a la cámara, sin esperar que alguien la toque.
  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => {
      reset()
      setModoDni(false)
      setDniInput('')
    }, AUTO_RESET_MS)
    return () => clearTimeout(t)
  }, [result, reset])

  const consultarDni = () => {
    const dni = dniInput.trim()
    if (!dni) return
    setDniInput('')
    handleDNI(dni)
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
          <Text style={s.permBarLabel}>LECTOR · SCANNER</Text>
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
    const esValido = result?.valido === true
    const moroso   = result ? (esValido ? estadoVisual(result) === 'moroso' : true) : false

    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.permBar}>
          <Text style={s.permBarLabel}>LECTOR · SCANNER</Text>
        </View>

        {validando ? (
          <View style={s.validandoContainer}>
            <ActivityIndicator color={colors.oro} size="large" />
            <Text style={s.validandoText}>Verificando carnet…</Text>
          </View>
        ) : result ? (
          <View style={s.resultContainer}>
            {/* Banda de estado — foco en la cuota, acá no se bloquea el acceso a nadie */}
            <View style={[s.resultBand, { backgroundColor: moroso ? colors.rojoUrgente : '#1A7A1A' }]}>
              <Feather
                name={moroso ? 'alert-triangle' : 'check-circle'}
                size={32}
                color={colors.blanco}
              />
              <Text style={s.resultBandText}>
                {esValido ? (moroso ? 'MOROSO' : 'AL DÍA') : 'QR NO VÁLIDO'}
              </Text>
            </View>

            {esValido ? (
              <View style={s.resultBody}>
                {/* Foto */}
                {result.foto_url ? (
                  <Image source={{ uri: result.foto_url }} style={s.fotoSocio} />
                ) : (
                  <View style={[s.fotoSocio, s.fotoPlaceholder]}>
                    <Feather name="user" size={40} color={colors.grisClaro} />
                  </View>
                )}

                {/* Info */}
                <View style={s.resultInfo}>
                  <Text style={s.resultNombre}>{result.nombre ?? '—'}</Text>

                  <View style={s.resultRow}>
                    <Text style={s.resultLabel}>Nº SOCIO</Text>
                    <Text style={s.resultValor}>{result.numero_socio}</Text>
                  </View>
                  <View style={s.resultRow}>
                    <Text style={s.resultLabel}>CATEGORÍA</Text>
                    <Text style={s.resultValor}>{result.categoria}</Text>
                  </View>
                  <View style={s.resultRow}>
                    <Text style={s.resultLabel}>ESTADO</Text>
                    <Text style={[
                      s.resultValor,
                      estadoVisual(result) === 'moroso' && { color: colors.rojoUrgente },
                    ]}>
                      {estadoVisual(result).toUpperCase()}
                    </Text>
                  </View>

                  {!result.foto_validada && (
                    <View style={s.alertaFoto}>
                      <Text style={s.alertaFotoText}>⚠ Foto pendiente de validación</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View style={s.motivoContainer}>
                <Text style={s.motivoText}>{result.motivo ?? 'QR inválido'}</Text>
              </View>
            )}

            <TouchableOpacity
              style={s.nuevoBtn}
              onPress={() => { reset(); setModoDni(false); setDniInput('') }}
              activeOpacity={0.8}
            >
              <Text style={s.nuevoBtnText}>ESCANEAR OTRO</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    )
  }

  // ── Sin QR, ingresar DNI ──────────────────────────────────────────────────
  if (modoDni) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.permBar}>
          <Text style={s.permBarLabel}>LECTOR · SCANNER</Text>
        </View>

        <View style={s.dniContainer}>
          <Feather name="hash" size={40} color={MUTED} />
          <Text style={s.dniTitle}>No tenés el carnet a mano</Text>
          <Text style={s.dniSub}>Ingresá tu DNI para consultar tu estado</Text>

          <TextInput
            style={s.dniInput}
            value={dniInput}
            onChangeText={setDniInput}
            keyboardType="number-pad"
            placeholder="12345678"
            placeholderTextColor={MUTED}
            maxLength={9}
            autoFocus
            onSubmitEditing={consultarDni}
          />

          <TouchableOpacity style={s.dniBtn} onPress={consultarDni} activeOpacity={0.8}>
            <Text style={s.dniBtnText}>CONSULTAR</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setModoDni(false); setDniInput('') }} activeOpacity={0.7}>
            <Text style={s.dniVolver}>Volver a escanear QR</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Cámara activa ──────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.permBar}>
        <Text style={s.permBarLabel}>LECTOR · SCANNER</Text>
      </View>

      <View style={s.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="front"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => handleQR(data)}
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

        <View style={s.hint}>
          <Text style={s.hintText}>Acercá el QR de tu carnet a la cámara</Text>
        </View>

        <TouchableOpacity style={s.dniLink} onPress={() => setModoDni(true)} activeOpacity={0.7}>
          <Text style={s.dniLinkText}>¿No tenés el carnet? Ingresar DNI</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const VISOR_SIZE = 240

const MUTED = '#8E8574'

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.papel },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },

  permBar: {
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.papel,
    borderBottomWidth: 1, borderBottomColor: '#2C2418',
  },
  permBarLabel: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },

  permTitle: {
    fontFamily: fonts.titulo, fontSize: 26, color: colors.tinta, textAlign: 'center',
  },
  permSub: {
    fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED,
    textAlign: 'center', paddingHorizontal: 40,
  },
  permBtn: {
    marginTop: 8, borderWidth: 1, borderColor: colors.oro,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 4,
  },
  permBtnText: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
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
  hintText: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5,
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)',
  },
  dniLink: {
    position: 'absolute', bottom: 16, left: 0, right: 0, alignItems: 'center',
  },
  dniLinkText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 1,
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)',
    textDecorationLine: 'underline',
  },

  // Ingresar DNI (fallback sin QR)
  dniContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40,
  },
  dniTitle: {
    fontFamily: fonts.titulo, fontSize: 22, color: colors.tinta, textAlign: 'center',
  },
  dniSub: {
    fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 8,
  },
  dniInput: {
    width: '100%', maxWidth: 320, fontFamily: fonts.cuerpo, fontSize: 20, textAlign: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.oro,
    backgroundColor: 'transparent', color: colors.tinta, letterSpacing: 2,
  },
  dniBtn: {
    marginTop: 12, width: '100%', maxWidth: 320, borderRadius: 4,
    paddingVertical: 16, alignItems: 'center', backgroundColor: colors.oro,
  },
  dniBtnText: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5, color: colors.papel,
  },
  dniVolver: {
    marginTop: 16, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1,
    textTransform: 'uppercase', color: MUTED, textDecorationLine: 'underline',
  },

  // Validando
  validandoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  validandoText: {
    fontFamily: fonts.cuerpo, fontSize: 16, fontStyle: 'italic', color: MUTED,
  },

  // Resultado
  resultContainer: { flex: 1 },
  resultBand: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 24, paddingVertical: 20,
  },
  resultBandText: {
    fontFamily: fonts.label, fontSize: 16, letterSpacing: 3,
    textTransform: 'uppercase', color: colors.blanco,
  },

  resultBody: {
    flexDirection: 'row', gap: 20, padding: 24,
  },
  fotoSocio: {
    width: 100, height: 120, borderRadius: 4,
    borderWidth: 1, borderColor: '#333333',
  },
  fotoPlaceholder: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C2418',
  },
  resultInfo: { flex: 1, gap: 10 },
  resultNombre: {
    fontFamily: fonts.titulo, fontSize: 22, color: colors.tinta, marginBottom: 6,
  },
  resultRow:   { gap: 2 },
  resultLabel: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 2,
    textTransform: 'uppercase', color: MUTED,
  },
  resultValor: {
    fontFamily: fonts.cuerpo, fontSize: 14, color: colors.tinta,
  },
  alertaFoto: {
    marginTop: 6, backgroundColor: colors.oroHondo,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 3,
  },
  alertaFotoText: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, color: colors.blanco,
  },

  motivoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  motivoText: {
    fontFamily: fonts.cuerpo, fontSize: 16, fontStyle: 'italic',
    color: MUTED, textAlign: 'center',
  },

  nuevoBtn: {
    margin: 24, borderWidth: 1, borderColor: colors.oro,
    paddingVertical: 16, alignItems: 'center', borderRadius: 4,
  },
  nuevoBtnText: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
})
