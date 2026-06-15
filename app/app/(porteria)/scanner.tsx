import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView } from 'expo-camera'
import { Feather } from '@expo/vector-icons'
import { useScanner } from '@/hooks/useScanner'
import { colors, fonts } from '@/constants/theme'

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScannerScreen() {
  const insets = useSafeAreaInsets()
  const { permission, requestPermission, result, scanning, validando, handleQR, reset } = useScanner()

  // ── Sin permiso ──────────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={colors.oro} />
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <View style={s.permBar}>
          <Text style={s.permBarLabel}>PORTERÍA · SCANNER</Text>
        </View>
        <View style={s.center}>
          <Feather name="camera-off" size={48} color={MUTED} />
          <Text style={s.permTitle}>Cámara requerida</Text>
          <Text style={s.permSub}>
            La app necesita acceso a la cámara para escanear los carnets.
          </Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={s.permBtnText}>PERMITIR ACCESO</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Resultado ──────────────────────────────────────────────────────────
  if (result || validando) {
    const esValido = result?.valido === true

    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.permBar}>
          <Text style={s.permBarLabel}>PORTERÍA · SCANNER</Text>
        </View>

        {validando ? (
          <View style={s.validandoContainer}>
            <ActivityIndicator color={colors.oro} size="large" />
            <Text style={s.validandoText}>Verificando carnet…</Text>
          </View>
        ) : result ? (
          <View style={s.resultContainer}>
            {/* Banda de estado */}
            <View style={[s.resultBand, { backgroundColor: esValido ? '#1A7A1A' : colors.rojoUrgente }]}>
              <Feather
                name={esValido ? 'check-circle' : 'x-circle'}
                size={32}
                color={colors.blanco}
              />
              <Text style={s.resultBandText}>
                {esValido ? 'ACCESO PERMITIDO' : 'ACCESO DENEGADO'}
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
                      result.estado === 'moroso' && { color: colors.oro },
                    ]}>
                      {(result.estado ?? '').toUpperCase()}
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

            <TouchableOpacity style={s.nuevoBtn} onPress={reset} activeOpacity={0.8}>
              <Text style={s.nuevoBtnText}>ESCANEAR OTRO</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    )
  }

  // ── Cámara activa ──────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.permBar}>
        <Text style={s.permBarLabel}>PORTERÍA · SCANNER</Text>
      </View>

      <View style={s.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
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
          <Text style={s.hintText}>Apuntá al QR del carnet del socio</Text>
        </View>
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
