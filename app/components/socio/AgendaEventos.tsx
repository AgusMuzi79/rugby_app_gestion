import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import {
  DIAS_AGENDA, agruparPorFecha, etiquetaFecha, horaCorta, lineaEvento, type Agenda,
} from '@/lib/agenda'
import { letraEvento } from '@/lib/tipoEvento'
import { colors, fonts } from '@/constants/theme'

// Sección "MIS EVENTOS" de la Agenda del socio: eventos de sus divisiones en
// los próximos DIAS_AGENDA días, agrupados por día. Sin división no se muestra (sólo gimnasio).

export function AgendaEventos({ agenda, loading, error, onReintentar }: {
  agenda:       Agenda | null
  loading:      boolean
  error:        string | null
  onReintentar: () => void
}) {
  if (error) {
    return (
      <View style={s.bloque}>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.reintentar} onPress={onReintentar} activeOpacity={0.75} accessibilityRole="button">
          <Text style={s.reintentarText}>REINTENTAR</Text>
        </TouchableOpacity>
      </View>
    )
  }
  if (!agenda) {
    return loading ? <ActivityIndicator color={colors.oro} style={{ marginTop: 24 }} /> : null
  }
  if (agenda.divisiones.length === 0) return null

  const grupos = agruparPorFecha(agenda.eventos)

  return (
    <View style={s.bloque}>
      <Text style={s.seccion}>MIS EVENTOS</Text>
      {grupos.length === 0 ? (
        <Text style={s.vacio}>No hay eventos de tu división en los próximos {DIAS_AGENDA} días.</Text>
      ) : (
        grupos.map(g => (
          <View key={g.fecha} style={s.dia}>
            <Text style={s.diaTitulo}>{etiquetaFecha(g.fecha)}</Text>
            {g.eventos.map(ev => {
              const hora = horaCorta(ev.hora)
              return (
                <View key={ev.id} style={s.card}>
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{letraEvento(ev.tipo)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.titulo}>{lineaEvento(ev, agenda.divisiones)}</Text>
                    {(hora || ev.lugar) && (
                      <Text style={s.detalle}>{[hora, ev.lugar].filter(Boolean).join(' · ')}</Text>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        ))
      )}
    </View>
  )
}

const s = StyleSheet.create({
  bloque:  { gap: 10 },
  seccion: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5, color: colors.oroHondo, marginTop: 14 },
  vacio:   { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.muted, paddingVertical: 8 },

  dia:       { marginTop: 4, gap: 8 },
  diaTitulo: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 4, padding: 14,
    backgroundColor: colors.card, borderColor: colors.borde,
  },
  badge: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.oro,
  },
  badgeText: { fontFamily: fonts.label, fontSize: 14, color: colors.sobreOro },
  titulo:    { fontFamily: fonts.cuerpo, fontSize: 17, fontWeight: '600', color: colors.texto },
  detalle:   { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.textoSecundario, marginTop: 2 },

  errorText:      { fontFamily: fonts.cuerpo, fontSize: 16, color: colors.texto },
  reintentar:     { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.oro, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 24 },
  reintentarText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },
})
