import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import {
  useInformes,
  type JugadorAsistencia,
  type ResultadoInforme,
  type DivisionFichajesResumen,
  type FichajeReciente,
  type EventoFinancieroInforme,
} from '@/hooks/useInformes'
import { colors, fonts } from '@/constants/theme'

// ─── Tokens ───────────────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'
const ROJO    = colors.rojoUrgente
const VERDE   = '#22C55E'
const AMBER   = '#F59E0B'
const AZUL    = '#3B82F6'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function porcStyle(p: number | null) {
  if (p === null)  return s.porcNeutro
  if (p >= 75)     return s.porcAlto
  if (p >= 50)     return s.porcMedio
  return s.porcBajo
}

function resStyle(res: 'W' | 'L' | 'D') {
  return res === 'W' ? s.resW : res === 'L' ? s.resL : s.resD
}

function tipoColor(tipo: string): string {
  const map: Record<string, string> = { viaje: AZUL, tercer_tiempo: VERDE, recaudacion: colors.oro }
  return map[tipo] ?? MUTED
}

// ─── Sección Asistencia ───────────────────────────────────────────────────────

function SeccionAsistencia({ datos }: { datos: JugadorAsistencia[] }) {
  const gruposMap = new Map<string, JugadorAsistencia[]>()
  for (const a of datos) {
    let arr = gruposMap.get(a.divisionId)
    if (!arr) { arr = []; gruposMap.set(a.divisionId, arr) }
    arr.push(a)
  }
  const grupos = Array.from(gruposMap.values())
    .map(jugs => ({
      divisionNombre:  jugs[0]?.divisionNombre ?? '',
      tieneAlertas:    jugs.some(j => j.ausenciasConsecutivas),
      jugadores:       [...jugs].sort((a, b) => (a.porcentaje ?? 101) - (b.porcentaje ?? 101)),
    }))
    .sort((a, b) => a.divisionNombre.localeCompare(b.divisionNombre))

  return (
    <View style={s.seccion}>
      <Text style={s.seccionTitulo}>Asistencia · Últimos 60 días</Text>
      {grupos.length === 0 ? (
        <Text style={s.vacio}>Sin datos de asistencia recientes.</Text>
      ) : (
        grupos.map(g => (
          <View key={g.divisionNombre} style={s.gap4}>
            <View style={s.divHeader}>
              <Text style={s.divHeaderTexto}>{g.divisionNombre}</Text>
              {g.tieneAlertas && (
                <View style={s.badgeRojo}><Text style={s.badgeTexto}>ALERTA</Text></View>
              )}
            </View>
            {g.jugadores.map(j => (
              <View key={j.jugadorId} style={s.card}>
                <View style={s.fila}>
                  <Text style={s.cardNombre} numberOfLines={1}>{j.nombre}</Text>
                  <View style={s.filaRight}>
                    {j.ausenciasConsecutivas && (
                      <View style={s.badgeRojo}><Text style={s.badgeTexto}>4 AUST.</Text></View>
                    )}
                    <Text style={[s.porcNum, porcStyle(j.porcentaje)]}>
                      {j.porcentaje !== null ? `${j.porcentaje}%` : '—'}
                    </Text>
                  </View>
                </View>
                <Text style={s.cardMuted}>{j.presentes} de {j.totalEventos} entrenos</Text>
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  )
}

// ─── Sección Resultados ───────────────────────────────────────────────────────

function SeccionResultados({ datos }: { datos: ResultadoInforme[] }) {
  const wins   = datos.filter(r => r.resultado === 'W').length
  const losses = datos.filter(r => r.resultado === 'L').length
  const draws  = datos.filter(r => r.resultado === 'D').length

  return (
    <View style={s.seccion}>
      <View style={s.seccionEncabezado}>
        <Text style={s.seccionTitulo}>Resultados</Text>
        {datos.length > 0 && (
          <View style={s.wldRow}>
            <Text style={[s.wld, s.wldW]}>W {wins}</Text>
            <Text style={[s.wld, s.wldL]}>L {losses}</Text>
            {draws > 0 && <Text style={[s.wld, s.wldD]}>E {draws}</Text>}
          </View>
        )}
      </View>
      {datos.length === 0 ? (
        <Text style={s.vacio}>Sin resultados cargados.</Text>
      ) : (
        datos.map(r => (
          <View key={r.id} style={s.card}>
            <View style={s.fila}>
              <View style={[s.resBadge, resStyle(r.resultado)]}>
                <Text style={s.resBadgeTexto}>{r.resultado}</Text>
              </View>
              <Text style={s.marcador}>{r.puntosPropios}–{r.puntosRival}</Text>
              <Text style={s.cardNombreResult} numberOfLines={1}>
                {r.rival ? `vs. ${r.rival}` : '—'}
              </Text>
              <Text style={s.cardFecha}>{formatFecha(r.fecha)}</Text>
            </View>
            <Text style={s.cardDiv}>{r.divisionNombre}</Text>
          </View>
        ))
      )}
    </View>
  )
}

// ─── Sección Fichajes ─────────────────────────────────────────────────────────

function SeccionFichajes({
  porDiv,
  recientes,
}: {
  porDiv:    DivisionFichajesResumen[]
  recientes: FichajeReciente[]
}) {
  const total = porDiv.reduce((acc, d) => acc + d.total, 0)
  return (
    <View style={s.seccion}>
      <View style={s.seccionEncabezado}>
        <Text style={s.seccionTitulo}>Fichajes</Text>
        <Text style={s.seccionTotal}>{total} jugadores</Text>
      </View>
      {porDiv.length === 0 ? (
        <Text style={s.vacio}>Sin jugadores fichados.</Text>
      ) : (
        porDiv.map(d => (
          <View key={d.divisionId} style={s.card}>
            <View style={s.fila}>
              <Text style={s.cardNombre} numberOfLines={1}>{d.divisionNombre}</Text>
              <Text style={s.numGrande}>{d.total}</Text>
            </View>
          </View>
        ))
      )}
      {recientes.length > 0 && (
        <>
          <Text style={s.seccionTituloMt}>Últimas altas</Text>
          {recientes.map(f => (
            <View key={f.id} style={s.card}>
              <View style={s.fila}>
                <Text style={s.cardNombre} numberOfLines={1}>{f.nombre}</Text>
                <Text style={s.cardFecha}>{formatFecha(f.fechaFichaje)}</Text>
              </View>
              <Text style={s.cardDiv}>{f.divisionNombre}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}

// ─── Sección Financiero ───────────────────────────────────────────────────────

function SeccionFinanciero({ datos }: { datos: EventoFinancieroInforme[] }) {
  return (
    <View style={s.seccion}>
      <Text style={s.seccionTitulo}>Financiero</Text>
      {datos.length === 0 ? (
        <Text style={s.vacio}>Sin eventos financieros activos.</Text>
      ) : (
        datos.map(ef => {
          // color is truly dynamic (per tipo from runtime data) — keep inline
          const color = tipoColor(ef.tipo)
          return (
            <View key={ef.id} style={s.cardGap}>
              <View style={s.fila}>
                <View style={[s.tipoBadge, { borderColor: color }]}>
                  <Text style={[s.tipoTexto, { color }]}>
                    {ef.tipo.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
                {ef.divisionNombre != null && (
                  <Text style={s.cardFecha}>{ef.divisionNombre}</Text>
                )}
              </View>
              <Text style={s.cardNombre}>{ef.nombre}</Text>

              {/* Barra de progreso — width is dynamic */}
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${ef.porcentajeCobrado}%` }]} />
              </View>

              <View style={s.fila}>
                <Text style={s.cobrado}>${ef.totalCobrado.toLocaleString('es-AR')}</Text>
                <Text style={s.cardMuted}>
                  {ef.porcentajeCobrado}% · {ef.countPagados}P · {ef.countPendientes}PN
                </Text>
              </View>

              {Object.keys(ef.formasDePago).length > 0 && (
                <View style={s.formasRow}>
                  {Object.entries(ef.formasDePago).map(([forma, monto]) => (
                    <View key={forma} style={s.formaPill}>
                      <Text style={s.formaTexto}>
                        {forma}: ${monto.toLocaleString('es-AR')}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )
        })
      )}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InformesScreen() {
  const {
    loading, divisiones, divisionFiltro, setDivisionFiltro,
    asistencias, resultados, fichajesPorDiv, fichajesRecientes, financiero,
  } = useInformes()

  if (loading) {
    return (
      <View style={s.centrado}>
        <ActivityIndicator size="large" color={colors.oro} />
        <Text style={s.cargandoTexto}>Cargando informes…</Text>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.headerLabel}>SUBCOMISIÓN</Text>
        <Text style={s.headerTitle}>Informes</Text>
      </View>

      <View style={s.selectorWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.selectorContent}
        >
          <TouchableOpacity
            style={[s.pill, divisionFiltro === null && s.pillActiva]}
            onPress={() => setDivisionFiltro(null)}
            activeOpacity={0.7}
          >
            <Text style={[s.pillTexto, divisionFiltro === null && s.pillTextoActiva]}>Todas</Text>
          </TouchableOpacity>
          {divisiones.map(d => (
            <TouchableOpacity
              key={d.id}
              style={[s.pill, divisionFiltro === d.id && s.pillActiva]}
              onPress={() => setDivisionFiltro(d.id)}
              activeOpacity={0.7}
            >
              <Text style={[s.pillTexto, divisionFiltro === d.id && s.pillTextoActiva]}>
                {d.nombre}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SeccionAsistencia datos={asistencias} />
        <SeccionResultados datos={resultados} />
        <SeccionFichajes porDiv={fichajesPorDiv} recientes={fichajesRecientes} />
        <SeccionFinanciero datos={financiero} />
      </ScrollView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: FONDO },
  centrado:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 12 },
  cargandoTexto: { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 13 },

  header:      { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: TEXTO },
  headerLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2.5, color: colors.oro, marginBottom: 4 },
  headerTitle: { fontFamily: fonts.titulo, fontSize: 28, color: FONDO },

  selectorWrap:    { backgroundColor: TEXTO, paddingBottom: 12 },
  selectorContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  pill:            { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: DIVIDER, borderWidth: 1, borderColor: DIVIDER },
  pillActiva:      { backgroundColor: colors.oro, borderColor: colors.oro },
  pillTexto:       { fontFamily: fonts.label, color: MUTED, fontSize: 12, fontWeight: '500' },
  pillTextoActiva: { color: FONDO },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48, gap: 24 },

  seccion:           { gap: 8 },
  seccionEncabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionTitulo:     { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: colors.oro, fontWeight: '700', textTransform: 'uppercase' },
  seccionTituloMt:   { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: colors.oro, fontWeight: '700', textTransform: 'uppercase', marginTop: 12 },
  seccionTotal:      { fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED },
  vacio:             { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 13, fontStyle: 'italic', paddingVertical: 4 },
  gap4:              { gap: 4 },

  divHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingHorizontal: 2 },
  divHeaderTexto: { fontFamily: fonts.cuerpo, fontSize: 13, fontWeight: '700', color: TEXTO, letterSpacing: 0.3 },

  card:       { backgroundColor: CARD, borderRadius: 10, padding: 12, gap: 4, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  cardGap:    { backgroundColor: CARD, borderRadius: 10, padding: 12, gap: 8, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  fila:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filaRight:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardNombre: { fontFamily: fonts.cuerpo, fontSize: 14, fontWeight: '600', color: TEXTO, flex: 1, marginRight: 8 },
  cardNombreResult: { fontFamily: fonts.cuerpo, fontSize: 14, fontWeight: '600', color: TEXTO, flex: 1, marginRight: 0, marginLeft: 8 },
  cardMuted:  { fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED },
  cardFecha:  { fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED },
  cardDiv:    { fontFamily: fonts.label, fontSize: 11, color: colors.oro, letterSpacing: 0.5 },

  badgeRojo:  { backgroundColor: ROJO, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTexto: { fontFamily: fonts.label, color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  porcNum:    { fontFamily: fonts.cuerpo, fontSize: 18, fontWeight: '700', minWidth: 44, textAlign: 'right' },
  porcAlto:   { color: VERDE },
  porcMedio:  { color: AMBER },
  porcBajo:   { color: ROJO },
  porcNeutro: { color: MUTED },

  wldRow: { flexDirection: 'row', gap: 10 },
  wld:    { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  wldW:   { color: VERDE },
  wldL:   { color: ROJO },
  wldD:   { color: colors.oro },

  resBadge:      { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  resBadgeTexto: { fontFamily: fonts.label, fontSize: 11, fontWeight: '700', color: '#FFF' },
  resW:          { backgroundColor: VERDE },
  resL:          { backgroundColor: ROJO },
  resD:          { backgroundColor: colors.oro },
  marcador:      { fontFamily: fonts.cuerpo, fontSize: 18, fontWeight: '700', color: TEXTO, marginHorizontal: 6 },

  numGrande: { fontFamily: fonts.cuerpo, fontSize: 24, fontWeight: '700', color: TEXTO },

  tipoBadge: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  tipoTexto: { fontFamily: fonts.label, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cobrado:   { fontFamily: fonts.cuerpo, fontSize: 13, fontWeight: '600', color: TEXTO },

  progressBar:  { height: 4, backgroundColor: DIVIDER, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: VERDE, borderRadius: 2 },

  formasRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  formaPill:  { backgroundColor: DIVIDER, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  formaTexto: { fontFamily: fonts.label, fontSize: 11, color: TEXTO },
})
