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
import { ROL_RUTA_INICIAL } from '@/constants/roles'
import { colors, fonts } from '@/constants/theme'

export default function TerminosScreen() {
  const { loading, version, titulo, pdfUrl, aceptando, error, aceptar } = useTerminos()
  const [leido, setLeido] = useState(false)
  const router = useRouter()
  const rol = useAuthStore(s => s.rol)

  const handleAceptar = async () => {
    const ok = await aceptar()
    if (ok && rol) router.replace(ROL_RUTA_INICIAL[rol])
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
            style={styles.pdfButton}
            onPress={() => pdfUrl && Linking.openURL(pdfUrl)}
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
              {leido && <Ionicons name="checkmark" size={14} color={colors.tinta} />}
            </View>
            <Text style={styles.checkLabel}>Leí y acepto los Términos y Condiciones</Text>
          </TouchableOpacity>

          {error !== null && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, (!leido || aceptando) && styles.buttonDisabled]}
            onPress={handleAceptar}
            disabled={!leido || aceptando}
            activeOpacity={0.85}
          >
            {aceptando
              ? <ActivityIndicator color={colors.oro} size="small" />
              : <Text style={styles.buttonText}>ACEPTO →</Text>
            }
          </TouchableOpacity>

          <Text style={styles.footer}>UNCAS RUGBY APP · V1.0</Text>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  kav:           { flex: 1, backgroundColor: '#15110A' },
  loadingWrap:   { flex: 1, backgroundColor: '#15110A', alignItems: 'center', justifyContent: 'center' },
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
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.oro,
    marginBottom: 10,
  },
  title: {
    textAlign: 'center',
    fontFamily: fonts.titulo,
    fontSize: 36,
    color: colors.tinta,
    marginBottom: 16,
    lineHeight: 42,
  },
  divider: {
    height: 1,
    backgroundColor: '#2C2418',
    marginBottom: 24,
  },
  subtitle: {
    textAlign: 'center',
    fontFamily: fonts.cuerpo,
    fontStyle: 'italic',
    fontSize: 13,
    color: '#7C7267',
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
    fontSize: 12,
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
    fontSize: 14,
    color: colors.tinta,
  },
  button: {
    backgroundColor: colors.tinta,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
  },
  buttonDisabled: {
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
    color: '#9B9A8F',
    marginTop: 48,
  },
})
