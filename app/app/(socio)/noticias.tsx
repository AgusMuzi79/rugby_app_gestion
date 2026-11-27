import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Pressable, Modal, ScrollView,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native'
import { useState, useMemo, useRef } from 'react'
// expo-image: caché en memoria y disco, las imágenes de noticias no se vuelven
// a bajar cada vez que se abre la pestaña. contentFit="cover" = el resizeMode
// por defecto del Image de react-native que se usaba antes.
import { Image } from 'expo-image'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { VisorImagenes } from '@/components/shared/VisorImagenes'
import { useNoticias, type Noticia } from '@/hooks/useNoticias'
import { colors, fonts } from '@/constants/theme'

// ─── Types ────────────────────────────────────────────────────────────────────

type Filtro = 'todas' | 'rugby' | 'hockey' | 'tenis'

const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'todas',  label: 'TODAS'  },
  { value: 'rugby',  label: 'RUGBY'  },
  { value: 'hockey', label: 'HOCKEY' },
  { value: 'tenis',  label: 'TENIS'  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaEdicion(): string {
  const d    = new Date()
  const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yy   = String(d.getFullYear()).slice(2)
  return `${dias[d.getDay()]} ${dd}.${mm}.${yy}`
}

function tiempoRelativo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  if (days  > 0) return `HACE ${days}D`
  if (hours > 0) return `HACE ${hours}H`
  return 'HOY'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FiltroBar({
  filtro,
  onChange,
}: {
  filtro:   Filtro
  onChange: (f: Filtro) => void
}) {
  return (
    <View style={s.filtroBar}>
      {FILTROS.map(f => {
        const activo = filtro === f.value
        return (
          <TouchableOpacity
            key={f.value}
            style={[s.filtroChip, activo ? s.filtroChipActivo : s.filtroChipInactivo]}
            onPress={() => onChange(f.value)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
          >
            <Text style={[s.filtroText, activo ? s.filtroTextActivo : s.filtroTextInactivo]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function DeporteBadge({ noticia }: { noticia: Noticia }) {
  const deporte = (['rugby', 'hockey', 'tenis'] as const)
    .find(d => noticia.etiquetas.includes(d))
  if (!deporte) return null
  return (
    <View style={s.deporteBadge}>
      <Text style={s.deporteText}>{deporte.toUpperCase()}</Text>
    </View>
  )
}

function NoticiaCard({ noticia, onPress }: { noticia: Noticia; onPress: () => void }) {
  const [truncado, setTruncado] = useState(false)

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      <View style={s.cardMeta}>
        <View style={s.metaIzquierda}>
          <Text style={s.metaTiempo}>{tiempoRelativo(noticia.created_at)}</Text>
          {noticia.destacada && (
            <View style={s.destacadaBadge}>
              <Text style={s.destacadaTexto}>DESTACADA</Text>
            </View>
          )}
        </View>
        <DeporteBadge noticia={noticia} />
      </View>

      {noticia.imagenesUrls[0] && (
        <View>
          <Image source={{ uri: noticia.imagenesUrls[0] }} style={s.cardImagen} contentFit="cover" cachePolicy="memory-disk" />
          {noticia.imagenesUrls.length > 1 && (
            <View style={s.contadorBadge} accessibilityLabel={`${noticia.imagenesUrls.length} imágenes`}>
              <Text style={s.contadorTexto}>1/{noticia.imagenesUrls.length}</Text>
            </View>
          )}
        </View>
      )}

      <Text style={s.cardTitulo}>{noticia.titulo}</Text>

      {noticia.cuerpo.trim() !== '' && (
        <>
          <View style={s.divider} />

          <Text
            style={s.cardCuerpo}
            numberOfLines={5}
            // Sólo cambia de false a true una vez: no hay setState en cada layout
            onTextLayout={e => { if (!truncado && e.nativeEvent.lines.length >= 5) setTruncado(true) }}
          >
            {noticia.cuerpo}
          </Text>
          {truncado && <Text style={s.leerMas}>LEER MÁS →</Text>}
        </>
      )}

      <Text style={s.cardAutor}>
        — {noticia.autor}
      </Text>
    </TouchableOpacity>
  )
}

// ─── Galería del detalle ───────────────────────────────────────────────────────

// Paginado horizontal de todas las imágenes (16:9). Tocar una la abre a
// pantalla completa en el visor, en esa misma imagen.
function GaleriaNoticia({ urls, onAbrir }: { urls: string[]; onAbrir: (indice: number) => void }) {
  const [ancho, setAncho]   = useState(0)
  const [indice, setIndice] = useState(0)

  const alTerminarScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (ancho > 0) setIndice(Math.round(e.nativeEvent.contentOffset.x / ancho))
  }

  return (
    <View style={m.galeria} onLayout={e => setAncho(e.nativeEvent.layout.width)}>
      {ancho > 0 && (
        <FlatList
          data={urls}
          keyExtractor={(url, i) => `${i}-${url}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: ancho, offset: ancho * i, index: i })}
          onMomentumScrollEnd={alTerminarScroll}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => onAbrir(index)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Ver imagen ${index + 1} de ${urls.length} en pantalla completa`}
            >
              <Image source={{ uri: item }} style={[m.imagen, { width: ancho }]} contentFit="cover" cachePolicy="memory-disk" />
            </Pressable>
          )}
        />
      )}
      {urls.length > 1 && (
        <View style={s.contadorBadge} pointerEvents="none">
          <Text style={s.contadorTexto}>{indice + 1}/{urls.length}</Text>
        </View>
      )}
    </View>
  )
}

// ─── Modal de detalle ──────────────────────────────────────────────────────────

function NoticiaModal({ noticia, onClose }: { noticia: Noticia; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  // Índice de la imagen abierta a pantalla completa (null = visor cerrado).
  const [visorIndice, setVisorIndice] = useState<number | null>(null)
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={m.overlayBg} activeOpacity={1} onPress={onClose} />
        <View style={[m.sheet, { paddingBottom: insets.bottom + 24 }]}>

          <View style={s.cardMeta}>
            <Text style={s.metaTiempo}>{tiempoRelativo(noticia.created_at)}</Text>
            <DeporteBadge noticia={noticia} />
          </View>

          <ScrollView style={m.scroll} showsVerticalScrollIndicator={false}>
            {noticia.imagenesUrls.length > 0 && (
              <GaleriaNoticia urls={noticia.imagenesUrls} onAbrir={setVisorIndice} />
            )}
            <Text style={m.titulo}>{noticia.titulo}</Text>
            {noticia.cuerpo.trim() !== '' && (
              <>
                <View style={[s.divider, { marginVertical: 12 }]} />
                <Text style={m.cuerpo}>{noticia.cuerpo}</Text>
              </>
            )}
            <Text style={[s.cardAutor, { marginTop: 16 }]}>— {noticia.autor}</Text>
          </ScrollView>

          <TouchableOpacity style={m.cerrarBtn} onPress={onClose} activeOpacity={0.75}>
            <Text style={m.cerrarText}>CERRAR</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dentro del Modal del detalle para que en iOS se presente encima de él */}
      {visorIndice !== null && (
        <VisorImagenes
          visible
          urls={noticia.imagenesUrls}
          indiceInicial={visorIndice}
          onClose={() => setVisorIndice(null)}
        />
      )}
    </Modal>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NoticiasPublicasScreen() {
  const insets = useSafeAreaInsets()
  const { noticias, loading, error, refreshing, refrescar } = useNoticias(true)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [noticiaAbierta, setNoticiaAbierta] = useState<Noticia | null>(null)
  const scrollRef = useRef<FlatList>(null)
  useScrollToTop(scrollRef)

  const noticiasFiltradas = useMemo(() =>
    filtro === 'todas'
      ? noticias
      : noticias.filter(n => n.etiquetas.includes(filtro)),
    [noticias, filtro]
  )

  return (
    <View style={s.root}>
      <View style={[s.topSection, { paddingTop: insets.top }]}>
        <Header />
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>SECCIÓN · NOTICIAS</Text>
          <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
        </View>
        <View style={s.secRow}>
          <Text style={s.secTitle}>NOVEDADES DEL CLUB</Text>
          <View style={s.secLine} />
        </View>
        <FiltroBar filtro={filtro} onChange={setFiltro} />
      </View>

      {/* Falló una recarga con noticias ya en pantalla: se avisa sin tapar la lista */}
      {error && noticias.length > 0 && (
        <Text style={s.errorRecarga} accessibilityRole="alert">
          No se pudieron actualizar las noticias. Deslizá hacia abajo para reintentar.
        </Text>
      )}

      {/* Spinner sólo sin datos: al volver a la pestaña la lista queda montada */}
      {loading && noticias.length === 0 ? (
        <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
      ) : error && noticias.length === 0 ? (
        <View style={s.centrado}>
          <Text style={s.errorTexto}>{error}</Text>
          <TouchableOpacity onPress={refrescar} style={s.reintentarBtn} activeOpacity={0.8}>
            <Text style={s.reintentarTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : noticiasFiltradas.length === 0 ? (
        <View style={s.emptyContainer}>
          <Text style={s.emptyText}>
            {filtro === 'todas'
              ? 'No hay noticias publicadas aún.'
              : `No hay noticias de ${filtro} por el momento.`}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={scrollRef}
          data={noticiasFiltradas}
          keyExtractor={n => n.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <NoticiaCard noticia={item} onPress={() => setNoticiaAbierta(item)} />
          )}
          onRefresh={refrescar}
          refreshing={refreshing}
        />
      )}

      {noticiaAbierta && (
        <NoticiaModal noticia={noticiaAbierta} onClose={() => setNoticiaAbierta(null)} />
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.fondo },
  topSection:    {},
  activityIndicator: { marginTop: 40 },
  listContent:   { paddingHorizontal: 20, paddingBottom: 60, gap: 16, paddingTop: 16 },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oroSobreClaro,
  },
  edicionFecha: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.grisClaro,
  },

  secRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 10,
  },
  secTitle: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5,
    textTransform: 'uppercase', color: colors.oroHondo,
  },
  secLine: { flex: 1, height: 1, backgroundColor: colors.borde },

  // Filtro bar
  filtroBar: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borde,
  },
  filtroChip: {
    flex: 1, borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, justifyContent: 'center',
    alignItems: 'center',
  },
  filtroChipActivo:  { backgroundColor: colors.tinta, borderColor: colors.tinta },
  filtroChipInactivo:{ backgroundColor: 'transparent', borderColor: colors.borde },
  filtroText: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
  },
  filtroTextActivo:  { color: colors.sobreOro },
  filtroTextInactivo:{ color: colors.muted },

  // Cards
  card: {
    borderWidth: 1, borderRadius: 4, padding: 18, gap: 10,
    backgroundColor: colors.card, borderColor: colors.borde,
  },
  cardMeta:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaTiempo: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, color: colors.oroHondo,
  },
  deporteBadge: {
    borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2,
    borderColor: colors.borde,
  },
  metaIzquierda: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Noticia destacada por Subcomisión (va primera durante DIAS_DESTACADA días).
  destacadaBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2, backgroundColor: colors.oro },
  destacadaTexto: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: colors.sobreOro },
  deporteText: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: colors.oroHondo },

  cardImagen: { width: '100%', aspectRatio: 16 / 9, borderRadius: 3, backgroundColor: colors.borde },
  // "1/N" sobre la imagen cuando la noticia tiene varias (card y galería).
  contadorBadge: {
    position: 'absolute', top: 8, right: 8,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  contadorTexto: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.blanco },
  cardTitulo: { fontFamily: fonts.titulo, fontSize: 23, lineHeight: 28, color: colors.texto },
  divider:    { height: 1, backgroundColor: colors.borde },
  cardCuerpo: { fontFamily: fonts.cuerpo, fontSize: 15, lineHeight: 20, color: colors.texto },
  leerMas: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: colors.oro, marginTop: -2,
  },
  cardAutor:  { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: colors.muted },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:      { fontFamily: fonts.cuerpo, fontSize: 16, fontStyle: 'italic', color: colors.muted },

  // Error de carga — mismo patrón que calendario.tsx
  centrado:        { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  errorTexto:      { fontFamily: fonts.cuerpo, color: colors.rojoTexto, fontSize: 16, textAlign: 'center' },
  errorRecarga:    { fontFamily: fonts.cuerpo, color: colors.rojoTexto, fontSize: 14, textAlign: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  reintentarBtn:   { minHeight: 44, justifyContent: 'center', marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.oro, borderRadius: 4 },
  reintentarTexto: { fontFamily: fonts.label, fontSize: 13, color: colors.oro, letterSpacing: 1 },
})

// ─── Estilos del modal de detalle ──────────────────────────────────────────────

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    // paddingBottom en línea (insets.bottom + 24); sin "handle" porque no se arrastra.
    padding: 24, gap: 16,
    borderTopWidth: 1, borderColor: colors.borde,
  },
  scroll: { marginTop: 4 },
  galeria: { marginBottom: 12, borderRadius: 4, overflow: 'hidden' },
  imagen: { aspectRatio: 16 / 9, backgroundColor: colors.borde },
  titulo: { fontFamily: fonts.titulo, fontSize: 26, lineHeight: 32, color: colors.texto },
  cuerpo: { fontFamily: fonts.cuerpo, fontSize: 17, lineHeight: 23, color: colors.texto },
  cerrarBtn: {
    borderWidth: 1, borderColor: colors.oro, borderRadius: 4,
    paddingVertical: 14, alignItems: 'center',
  },
  cerrarText: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
})
