import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useRef, type ReactNode } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { useSistemaAdmin } from '@/hooks/useSistemaAdmin'
import { colors, fonts } from '@/constants/theme'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fechaDia(isoDate: string) {
  // `date` columns come as 'YYYY-MM-DD'; avoid the UTC shift of new Date().
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

const ESTADO_ENVIO_COLOR: Record<string, string> = {
  enviado:  '#22C55E',
  enviando: '#F5B41C',
  salteado: '#8E8574',
  error:    '#CC4127',
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Seccion<T>({
  titulo,
  filas,
  vacio,
  render,
}: {
  titulo: string
  filas:  T[] | null
  vacio:  string
  render: (fila: T) => ReactNode
}) {
  return (
    <View style={s.seccion}>
      <View style={s.secRow}>
        <Text style={s.secTitle}>{titulo}</Text>
        <View style={s.secLine} />
      </View>
      {filas === null ? (
        <Text style={s.noDisponible}>No disponible: no se pudo leer esta información.</Text>
      ) : filas.length === 0 ? (
        <Text style={s.vacio}>{vacio}</Text>
      ) : (
        filas.map(render)
      )}
    </View>
  )
}

function Fila({ titulo, detalle, meta, metaColor }: {
  titulo:     string
  detalle:    string
  meta?:      string
  metaColor?: string
}) {
  return (
    <View style={s.fila}>
      <View style={s.filaInfo}>
        <Text style={s.filaTitulo}>{titulo}</Text>
        <Text style={s.filaDetalle}>{detalle}</Text>
      </View>
      {meta ? <Text style={[s.filaMeta, metaColor ? { color: metaColor } : null]}>{meta}</Text> : null}
    </View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SistemaAdminScreen() {
  const insets    = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)
  const { sistema, loading, refetch } = useSistemaAdmin()

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>ADMIN · SISTEMA</Text>
          <Text style={s.edicionFecha}>SÓLO LECTURA</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.oro} />}
      >
        {loading && sistema.pushTokens === null ? (
          <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
        ) : (
          <>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>DISPOSITIVOS CON PUSH</Text>
              <Text style={s.kpiValor}>
                {sistema.pushTokens === null ? 'No disponible' : sistema.pushTokens.toLocaleString('es-AR')}
              </Text>
            </View>

            <Seccion
              titulo="Padrón de socios"
              filas={sistema.importacionesSocios}
              vacio="Sin importaciones registradas."
              render={i => (
                <Fila
                  key={i.id}
                  titulo={fechaHora(i.created_at)}
                  detalle={`${i.archivo_nombre ?? 'Sin nombre de archivo'}\n${i.altas} altas · ${i.bajas} bajas · ${i.actualizados} actualizados · ${i.sin_cambio} sin cambio`}
                  meta={i.errores > 0 ? `${i.errores} errores` : undefined}
                  metaColor={ROJO}
                />
              )}
            />

            <Seccion
              titulo="Reporte de deuda"
              filas={sistema.importacionesDeuda}
              vacio="Sin importaciones registradas."
              render={i => (
                <Fila
                  key={i.id}
                  titulo={`Corte ${fechaDia(i.fecha_corte)}`}
                  detalle={`${i.archivo_nombre ?? 'Sin nombre de archivo'}\n${i.personas ?? 0} personas · ${i.socios_matcheados ?? 0} socios · ${i.sin_match ?? 0} sin match\nImportado ${fechaHora(i.created_at)}`}
                  meta={i.reconcilia ? 'Reconcilia' : 'No reconcilia'}
                  metaColor={i.reconcilia ? VERDE : ROJO}
                />
              )}
            />

            <Seccion
              titulo="Padrón de servicios"
              filas={sistema.importacionesServicios}
              vacio="Sin importaciones registradas."
              render={i => (
                <Fila
                  key={i.id}
                  titulo={fechaHora(i.created_at)}
                  detalle={`${i.archivo_nombre ?? 'Sin nombre de archivo'}\n${i.agregados} agregados · ${i.actualizados} actualizados · ${i.eliminados} eliminados · ${i.omitidos} omitidos · ${i.sin_cambio} sin cambio`}
                  meta={i.errores > 0 ? `${i.errores} errores` : undefined}
                  metaColor={ROJO}
                />
              )}
            />

            <Seccion
              titulo="Recordatorios de deuda"
              filas={sistema.recordatoriosDeuda}
              vacio="Sin envíos registrados."
              render={e => (
                <Fila
                  key={e.id}
                  titulo={`${e.mes} · ${fechaHora(e.ejecutado_at)}`}
                  detalle={`${e.enviados}/${e.destinatarios} enviados · ${e.sin_token} sin dispositivo${e.motivo ? `\n${e.motivo}` : ''}`}
                  meta={e.estado.toUpperCase()}
                  metaColor={ESTADO_ENVIO_COLOR[e.estado] ?? MUTED}
                />
              )}
            />
          </>
        )}
      </ScrollView>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'
const ROJO    = '#CC4127'
const VERDE   = '#22C55E'

const s = StyleSheet.create({
  root:              { flex: 1, backgroundColor: FONDO },
  activityIndicator: { marginTop: 40 },
  scrollContent:     { paddingHorizontal: 20, paddingBottom: 40 },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
  edicionFecha: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.grisClaro,
  },

  kpi: {
    marginTop: 20, padding: 16, borderRadius: 4,
    backgroundColor: CARD, borderWidth: 1, borderColor: DIVIDER,
  },
  kpiLabel: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
    textTransform: 'uppercase', color: MUTED,
  },
  kpiValor: { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO, marginTop: 4 },

  seccion: { marginTop: 8 },
  secRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 20, paddingBottom: 8, gap: 10,
  },
  secTitle: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5,
    textTransform: 'uppercase', color: colors.oroHondo,
  },
  secLine: { flex: 1, height: 1, backgroundColor: DIVIDER },

  fila: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  filaInfo:    { flex: 1, gap: 4 },
  filaTitulo:  { fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO },
  filaDetalle: { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED, lineHeight: 18 },
  filaMeta: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5,
    textTransform: 'uppercase', color: MUTED, paddingTop: 2,
  },

  vacio:        { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic', color: MUTED, paddingVertical: 8 },
  noDisponible: { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic', color: ROJO, paddingVertical: 8 },
})
