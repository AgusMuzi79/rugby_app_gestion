import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Alert,
} from 'react-native'
import { Image } from 'expo-image'
import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBeneficios, useGrupoBeneficios, useSocioAlDia } from '@/hooks/useBeneficios'
import { useSocioObjetivo } from '@/hooks/useSocioObjetivo'
import { labelRubro, urlInstagram, urlMaps, urlSitioWeb, urlWhatsapp } from '@/lib/beneficios'
import { colors, fonts } from '@/constants/theme'

// Benefit detail (hidden tab route "beneficio/[id]"). The shop validates the
// member with the carnet; the app only warns when the fee is not up to date.

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function abrirUrl(url: string) {
  Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir el enlace', 'Probá de nuevo más tarde.'))
}

function BotonEnlace({ icono, texto, url }: { icono: keyof typeof Feather.glyphMap; texto: string; url: string | null }) {
  if (!url) return null
  return (
    <TouchableOpacity style={s.enlace} onPress={() => abrirUrl(url)} activeOpacity={0.8} accessibilityRole="link">
      <Feather name={icono} size={16} color={colors.oro} />
      <Text style={s.enlaceTexto}>{texto}</Text>
    </TouchableOpacity>
  )
}

export default function BeneficioDetalleScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const grupo = useGrupoBeneficios()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { beneficios, loading, error, refrescar, refreshing } = useBeneficios()
  const { socioId } = useSocioObjetivo()
  const alDia = useSocioAlDia(socioId)
  const b = beneficios.find(x => x.id === id)

  const volver = (
    <View style={s.barra}>
      <TouchableOpacity
        onPress={() => router.navigate(`${grupo}/beneficios` as Href)}
        style={s.volver}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Volver a los beneficios"
      >
        <Feather name="arrow-left" size={18} color={colors.texto} />
        <Text style={s.volverTexto}>BENEFICIOS</Text>
      </TouchableOpacity>
    </View>
  )

  if (!b) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {volver}
        {loading ? (
          <ActivityIndicator color={colors.oro} style={s.spinner} />
        ) : (
          <View style={s.centrado}>
            <Text style={error ? s.errorTexto : s.vacio}>
              {error ?? 'Este beneficio ya no está disponible.'}
            </Text>
            {error && (
              <TouchableOpacity onPress={refrescar} disabled={refreshing} style={s.reintentarBtn} activeOpacity={0.8} accessibilityRole="button">
                {refreshing
                  ? <ActivityIndicator color={colors.oro} size="small" />
                  : <Text style={s.reintentarTexto}>Reintentar</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {volver}
      <ScrollView contentContainerStyle={[s.contenido, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {!!b.imagen_url && (
          <Image source={{ uri: b.imagen_url }} style={s.foto} contentFit="cover" cachePolicy="memory-disk" />
        )}

        <View style={s.cabecera}>
          {!!b.logo_url && (
            <Image source={{ uri: b.logo_url }} style={s.logo} contentFit="cover" cachePolicy="memory-disk" />
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.rubro}>
              {labelRubro(b.rubro).toUpperCase()}{b.zona ? ` · ${b.zona.toUpperCase()}` : ''}
            </Text>
            <Text style={s.nombre}>{b.nombre}</Text>
          </View>
        </View>

        <Text style={s.descuento}>{b.descuento}</Text>

        {alDia === false && (
          <View style={s.aviso} accessibilityRole="alert">
            <Feather name="alert-circle" size={16} color={colors.sobreOro} />
            <Text style={s.avisoTexto}>Para usar los beneficios tenés que tener la cuota al día.</Text>
          </View>
        )}

        {!!b.descripcion && <Text style={s.descripcion}>{b.descripcion}</Text>}

        {!!b.condiciones && (
          <>
            <View style={s.secRow}>
              <Text style={s.secTitle}>CONDICIONES</Text>
              <View style={s.secLine} />
            </View>
            <Text style={s.condiciones}>{b.condiciones}</Text>
          </>
        )}

        {!!b.vigente_hasta && (
          <Text style={s.vigencia}>Vigente hasta el {fechaCorta(b.vigente_hasta)}</Text>
        )}

        {!!b.direccion && (
          <TouchableOpacity
            style={s.direccion}
            onPress={() => { const u = urlMaps(b.direccion); if (u) abrirUrl(u) }}
            activeOpacity={0.8}
            accessibilityRole="link"
            accessibilityLabel={`Abrir ${b.direccion} en el mapa`}
          >
            <Feather name="map-pin" size={16} color={colors.oro} />
            <Text style={s.direccionTexto}>{b.direccion}</Text>
            <Feather name="external-link" size={14} color={colors.muted} />
          </TouchableOpacity>
        )}

        <View style={s.enlaces}>
          <BotonEnlace icono="message-circle" texto="WHATSAPP" url={urlWhatsapp(b.telefono_whatsapp)} />
          <BotonEnlace icono="instagram" texto="INSTAGRAM" url={urlInstagram(b.instagram)} />
          <BotonEnlace icono="globe" texto="SITIO WEB" url={urlSitioWeb(b.sitio_web)} />
        </View>

        <TouchableOpacity
          style={s.botonCarnet}
          onPress={() => router.navigate(`${grupo}/carnet` as Href)}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Feather name="credit-card" size={16} color={colors.sobreOro} />
          <Text style={s.botonCarnetTexto}>MOSTRAR MI CARNET</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.fondo },
  spinner:   { marginTop: 60 },
  contenido: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },

  barra:  { paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borde },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 8, alignSelf: 'flex-start' },
  volverTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.texto },

  foto:     { width: '100%', aspectRatio: 16 / 9, borderRadius: 6, backgroundColor: colors.borde },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo:     { width: 56, height: 56, borderRadius: 6, backgroundColor: colors.borde },
  rubro:    { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: colors.oroHondo },
  nombre:   { fontFamily: fonts.titulo, fontSize: 26, lineHeight: 32, color: colors.texto },
  descuento:{ fontFamily: fonts.titulo, fontSize: 40, lineHeight: 46, color: colors.oro },

  aviso: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4, backgroundColor: colors.estadoPendiente,
  },
  avisoTexto: { flex: 1, fontFamily: fonts.label, fontSize: 14, letterSpacing: 0.5, color: colors.sobreOro },

  descripcion: { fontFamily: fonts.cuerpo, fontSize: 17, lineHeight: 23, color: colors.texto },
  secRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  secTitle: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: colors.borde },
  condiciones: { fontFamily: fonts.cuerpo, fontSize: 16, lineHeight: 22, color: colors.textoSecundario },
  vigencia: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.muted },

  direccion: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, padding: 14,
    borderWidth: 1, borderColor: colors.borde, borderRadius: 4, backgroundColor: colors.card,
  },
  direccionTexto: { flex: 1, fontFamily: fonts.cuerpo, fontSize: 15, color: colors.texto },

  enlaces: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  enlace: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.oroHondo, borderRadius: 4,
  },
  enlaceTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },

  botonCarnet: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.oro, borderRadius: 4, paddingVertical: 16, minHeight: 44, marginTop: 10,
  },
  botonCarnetTexto: { fontFamily: fonts.label, fontSize: 14, letterSpacing: 2.5, color: colors.sobreOro },

  vacio:           { fontFamily: fonts.cuerpo, fontSize: 16, fontStyle: 'italic', color: colors.muted, textAlign: 'center' },
  centrado:        { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  errorTexto:      { fontFamily: fonts.cuerpo, color: colors.rojoTexto, fontSize: 16, textAlign: 'center' },
  reintentarBtn:   { minHeight: 44, justifyContent: 'center', marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.oro, borderRadius: 4 },
  reintentarTexto: { fontFamily: fonts.label, fontSize: 13, color: colors.oro, letterSpacing: 1 },
})
