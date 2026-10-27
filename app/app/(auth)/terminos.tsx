import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTerminos } from '@/hooks/useTerminos'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { ROL_RUTA_INICIAL } from '@/constants/roles'
import { colors, fonts } from '@/constants/theme'

export default function TerminosScreen() {
  const { loading, version, titulo, pdfUrl, aceptando, error, aceptar, refetch } = useTerminos()
  const [leido, setLeido] = useState(false)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const router = useRouter()
  const rol = useAuthStore(s => s.rol)
  // Sin versión cargada (la lectura falló) no hay nada que aceptar todavía.
  const sinVersion = !version

  const handleAceptar = async () => {
    const ok = await aceptar()
    if (ok && rol) router.replace(ROL_RUTA_INICIAL[rol])
  }

  const abrirPdf = async () => {
    if (!pdfUrl) return
    setErrorPdf(null)
    try {
      await Linking.openURL(pdfUrl)
    } catch {
      setErrorPdf('No se pudo abrir el documento. Probá de nuevo.')
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.oro} size="large" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>

          <Text style={styles.clubName}>UNCAS RUGBY CLUB · EST. 1836</Text>
          <Text style={styles.title}>Términos y{'\n'}Condiciones</Text>
          <View style={styles.divider} />
          <Text style={styles.subtitle}>
            Antes de continuar necesitamos que leas y aceptes los Términos y Condiciones
            {version ? ` (versión ${version})` : ''} de uso de la app del club.
          </Text>

          <TouchableOpacity
            style={[styles.pdfButton, !pdfUrl && styles.pdfDisabled]}
            onPress={abrirPdf}
            disabled={!pdfUrl}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.oro} />
            <Text style={styles.pdfButtonText}>{titulo ?? 'VER DOCUMENTO'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setLeido(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, leido && styles.checkboxChecked]}>
              {leido && <Ionicons name="checkmark" size={14} color={colors.sobreOro} />}
            </View>
            <Text style={styles.checkLabel}>Leí y acepto los Términos y Condiciones</Text>
          </TouchableOpacity>

          {(error ?? errorPdf) !== null && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorText}>{error ?? errorPdf}</Text>
              {sinVersion && (
                <TouchableOpacity onPress={() => { void refetch() }} accessibilityRole="button" style={styles.linkBtn}>
                  <Text style={[styles.linkText, styles.linkTextBanner]}>REINTENTAR</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, (!leido || aceptando || sinVersion) && styles.buttonDisabled]}
            onPress={handleAceptar}
            disabled={!leido || aceptando || sinVersion}
            activeOpacity={0.85}
          >
            {aceptando
              ? <ActivityIndicator color={colors.sobreOro} size="small" />
              : <Text style={styles.buttonText}>ACEPTO →</Text>
            }
          </TouchableOpacity>

          {/* Salida: sin esto la persona quedaba atrapada en esta pantalla. */}
          <TouchableOpacity
            onPress={() => { void supabase.auth.signOut() }}
            accessibilityRole="button"
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>Cerrar sesión</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>UNCAS RUGBY APP · V1.0</Text>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  kav:           { flex: 1, backgroundColor: colors.fondo },
  loadingWrap:   { flex: 1, backgroundColor: colors.fondo, alignItems: 'center', justifyContent: 'center' },
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
    fontSize: 36,
    color: colors.texto,
    marginBottom: 16,
    lineHeight: 42,
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
    marginBottom: 32,
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.oro,
    borderRadius: 4,
    paddingVertical: 14,
    marginBottom: 28,
  },
  pdfButtonText: {
    fontFamily: fonts.label,
    fontSize: 14,
    letterSpacing: 1.5,
    color: colors.oro,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.oro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.oro,
  },
  checkLabel: {
    flex: 1,
    fontFamily: fonts.cuerpo,
    fontSize: 16,
    color: colors.texto,
  },
  button: {
    backgroundColor: colors.oro,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  pdfDisabled: { opacity: 0.5 },
  linkBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  linkText: {
    fontFamily: fonts.label,
    fontSize: 14,
    letterSpacing: 1.5,
    color: colors.oro,
  },
  // REINTENTAR dentro del banner de error (card).
  linkTextBanner: { color: colors.oro },
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
  footer: {
    fontFamily: fonts.label,
    textAlign: 'center',
    fontSize: 12,
    letterSpacing: 1.5,
    color: '#9B9A8F',
    marginTop: 48,
  },
})
