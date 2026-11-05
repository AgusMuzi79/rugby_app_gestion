import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, ScrollView,
} from 'react-native'
import { useMemo, useState } from 'react'
import { Image } from 'expo-image'
import { Feather } from '@expo/vector-icons'
import { useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBeneficios, useGrupoBeneficios } from '@/hooks/useBeneficios'
import { RUBROS, filtrarBeneficios, labelRubro, type Beneficio, type Rubro } from '@/lib/beneficios'
import { colors, fonts } from '@/constants/theme'

// Club de beneficios: list opened from the Carnet banner (hidden tab, href: null).
// Also served to tutors once (tutor) re-exports it.

function Logo({ beneficio, size }: { beneficio: Beneficio; size: number }) {
  if (beneficio.logo_url) {
    return (
      <Image
        source={{ uri: beneficio.logo_url }}
        style={[s.logo, { width: size, height: size }]}
        contentFit="cover"
        cachePolicy="memory-disk"
        accessibilityIgnoresInvertColors
      />
    )
  }
  return (
    <View style={[s.logo, s.logoVacio, { width: size, height: size }]}>
      <Feather name="tag" size={size * 0.4} color={colors.oroHondo} />
    </View>
  )
}

function Destacado({ beneficio, onPress }: { beneficio: Beneficio; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={s.destacado}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${beneficio.nombre}, ${beneficio.descuento}`}
    >
      {beneficio.imagen_url ? (
        <Image source={{ uri: beneficio.imagen_url }} style={s.destacadoImagen} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={[s.destacadoImagen, s.logoVacio]}>
          <Logo beneficio={beneficio} size={56} />
        </View>
      )}
      <View style={s.destacadoCuerpo}>
        <Text style={s.descuento} numberOfLines={1}>{beneficio.descuento}</Text>
        <Text style={s.nombre} numberOfLines={1}>{beneficio.nombre}</Text>
      </View>
    </TouchableOpacity>
  )
}

function BeneficioCard({ beneficio, onPress }: { beneficio: Beneficio; onPress: () => void }) {
  const detalle = beneficio.condiciones ?? beneficio.zona
  return (
    <TouchableOpacity
      style={s.card}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${beneficio.nombre}, ${beneficio.descuento}, ${labelRubro(beneficio.rubro)}`}
    >
      <Logo beneficio={beneficio} size={56} />
      <View style={s.cardCuerpo}>
        <Text style={s.descuento} numberOfLines={1}>{beneficio.descuento}</Text>
        <Text style={s.nombre} numberOfLines={2}>{beneficio.nombre}</Text>
        <Text style={s.rubro}>
          {labelRubro(beneficio.rubro).toUpperCase()}
          {beneficio.zona && beneficio.condiciones ? ` · ${beneficio.zona.toUpperCase()}` : ''}
        </Text>
        {detalle ? <Text style={s.detalle} numberOfLines={1}>{detalle}</Text> : null}
      </View>
      <Feather name="chevron-right" size={18} color={colors.muted} />
    </TouchableOpacity>
  )
}

export default function BeneficiosScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const grupo = useGrupoBeneficios()
  const { beneficios, loading, error, refreshing, refrescar } = useBeneficios()
  const [rubro, setRubro] = useState<Rubro | null>(null)
  const [busqueda, setBusqueda] = useState('')

  // Only rubros that have at least one benefit, in the RUBROS order.
  const rubros = useMemo(
    () => RUBROS.filter(r => beneficios.some(b => b.rubro === r.value)),
    [beneficios],
  )
  const destacados = useMemo(() => beneficios.filter(b => b.destacado), [beneficios])
  const filtrados = useMemo(
    () => filtrarBeneficios(beneficios, { rubro, busqueda }),
    [beneficios, rubro, busqueda],
  )
  const filtrando = !!rubro || busqueda.trim() !== ''

  const abrir = (b: Beneficio) => router.navigate(`${grupo}/beneficio/${b.id}` as Href)

  const encabezado = (
    <View>
      <View style={s.secRow}>
        <Text style={s.secTitle}>TUS BENEFICIOS</Text>
        <View style={s.secLine} />
      </View>
      <Text style={s.intro}>Mostrá tu carnet en el local para usar el descuento.</Text>

      <View style={s.buscador}>
        <Feather name="search" size={16} color={colors.muted} />
        <TextInput
          style={s.buscadorInput}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar local, rubro o zona"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Buscar beneficios"
        />
        {busqueda ? (
          <TouchableOpacity onPress={() => setBusqueda('')} accessibilityRole="button" accessibilityLabel="Borrar búsqueda" style={s.borrar}>
            <Feather name="x" size={16} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {rubros.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {[{ value: null, label: 'Todos' }, ...rubros].map(r => {
            const activo = rubro === r.value
            return (
              <TouchableOpacity
                key={r.value ?? 'todos'}
                style={[s.chip, activo && s.chipActivo]}
                onPress={() => setRubro(r.value as Rubro | null)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
              >
                <Text style={[s.chipTexto, activo && s.chipTextoActivo]}>{r.label.toUpperCase()}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {!filtrando && destacados.length > 0 && (
        <>
          <View style={s.secRow}>
            <Text style={s.secTitle}>DESTACADOS</Text>
            <View style={s.secLine} />
          </View>
          <FlatList
            horizontal
            data={destacados}
            keyExtractor={b => b.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.carrusel}
            renderItem={({ item }) => <Destacado beneficio={item} onPress={() => abrir(item)} />}
          />
          <View style={s.secRow}>
            <Text style={s.secTitle}>TODOS LOS LOCALES</Text>
            <View style={s.secLine} />
          </View>
        </>
      )}
    </View>
  )

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.barra}>
        <TouchableOpacity
          onPress={() => router.navigate(`${grupo}/carnet` as Href)}
          style={s.volver}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Volver al carnet"
        >
          <Feather name="arrow-left" size={18} color={colors.texto} />
          <Text style={s.volverTexto}>CARNET</Text>
        </TouchableOpacity>
      </View>

      {/* A reload failed with benefits already on screen: warn without hiding them */}
      {error && beneficios.length > 0 && (
        <Text style={s.errorRecarga} accessibilityRole="alert">
          No se pudieron actualizar los beneficios. Deslizá hacia abajo para reintentar.
        </Text>
      )}

      {loading && beneficios.length === 0 ? (
        <ActivityIndicator color={colors.oro} style={s.spinner} />
      ) : error && beneficios.length === 0 ? (
        <View style={s.centrado}>
          <Text style={s.errorTexto}>{error}</Text>
          <TouchableOpacity onPress={refrescar} style={s.reintentarBtn} activeOpacity={0.8} accessibilityRole="button">
            <Text style={s.reintentarTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={b => b.id}
          ListHeaderComponent={encabezado}
          contentContainerStyle={s.lista}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <BeneficioCard beneficio={item} onPress={() => abrir(item)} />}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <Text style={s.vacio}>
              {beneficios.length === 0
                ? 'Todavía no hay locales adheridos.'
                : 'No hay beneficios que coincidan con la búsqueda.'}
            </Text>
          }
          onRefresh={refrescar}
          refreshing={refreshing}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.fondo },
  spinner: { marginTop: 60 },
  lista:   { paddingHorizontal: 20, paddingBottom: 60 },

  barra:  { paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borde },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 8, alignSelf: 'flex-start' },
  volverTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.texto },

  secRow:   { flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingBottom: 12, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: colors.borde },
  intro:    { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.textoSecundario, marginBottom: 14 },

  buscador: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44,
    paddingHorizontal: 12, borderWidth: 1, borderColor: colors.borde, borderRadius: 4,
    backgroundColor: colors.card,
  },
  buscadorInput: { flex: 1, fontFamily: fonts.cuerpo, fontSize: 16, color: colors.texto, paddingVertical: 10 },
  borrar: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },

  chips: { gap: 8, paddingTop: 14 },
  chip: {
    paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 22,
    borderWidth: 1.5, borderColor: colors.borde, backgroundColor: colors.card,
  },
  chipActivo:      { borderColor: colors.oro, backgroundColor: colors.oro + '33' },
  chipTexto:       { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: colors.muted },
  chipTextoActivo: { color: colors.oro },

  carrusel: { gap: 12 },
  destacado: {
    width: 220, borderWidth: 1, borderColor: colors.borde, borderRadius: 6,
    backgroundColor: colors.card, overflow: 'hidden',
  },
  destacadoImagen: { width: '100%', height: 110, backgroundColor: colors.borde },
  destacadoCuerpo: { padding: 12, gap: 4 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
    borderWidth: 1, borderColor: colors.borde, borderRadius: 6, backgroundColor: colors.card,
  },
  cardCuerpo: { flex: 1, gap: 3 },
  logo:       { borderRadius: 6, backgroundColor: colors.borde },
  logoVacio:  { alignItems: 'center', justifyContent: 'center' },
  descuento:  { fontFamily: fonts.titulo, fontSize: 20, lineHeight: 24, color: colors.oro },
  nombre:     { fontFamily: fonts.label, fontSize: 16, color: colors.texto },
  rubro:      { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: colors.oroHondo },
  detalle:    { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.textoSecundario },

  vacio: { fontFamily: fonts.cuerpo, fontSize: 16, fontStyle: 'italic', color: colors.muted, textAlign: 'center', marginTop: 32 },

  centrado:        { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  errorTexto:      { fontFamily: fonts.cuerpo, color: colors.rojoTexto, fontSize: 16, textAlign: 'center' },
  errorRecarga:    { fontFamily: fonts.cuerpo, color: colors.rojoTexto, fontSize: 14, textAlign: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  reintentarBtn:   { minHeight: 44, justifyContent: 'center', marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.oro, borderRadius: 4 },
  reintentarTexto: { fontFamily: fonts.label, fontSize: 13, color: colors.oro, letterSpacing: 1 },
})
