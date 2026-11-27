import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import {
  DIAS_AGENDA, accionesTenisAgenda, agruparAgenda, etiquetaFecha, horaCorta, lineaEvento, lineaTenis, otrosJugadores,
  type Agenda, type EventoAgenda,
} from '@/lib/agenda'
import { CONFIG_DEFECTO, ESTADOS_RESERVA, type MiReserva } from '@/lib/tenis'
import { letraEvento } from '@/lib/tipoEvento'
import { colors, fonts } from '@/constants/theme'

// Sección "MIS EVENTOS" de la Agenda del socio: eventos de sus divisiones y
// sus turnos de tenis (FEATURES.tenis, `tenis`) en los próximos DIAS_AGENDA
// días, mezclados por día y hora. Sin división ni turnos de tenis no se
// muestra (sólo gimnasio). El titular edita o cancela su turno desde la card.

export interface TenisAgenda {
  reservas:   MiReserva[]   // ya filtradas con reservasTenisAgenda
  ahoraMs:    number
  cancelando: string | null
  onEditar:   (r: MiReserva) => void
  onCancelar: (r: MiReserva) => void
}

export function AgendaEventos({ agenda, loading, error, onReintentar, tenis }: {
  agenda:       Agenda | null
  loading:      boolean
  error:        string | null
  onReintentar: () => void
  tenis?:       TenisAgenda
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
  const reservas = tenis?.reservas ?? []
  if (agenda.divisiones.length === 0 && reservas.length === 0) return null

  const grupos = agruparAgenda(agenda.eventos, reservas)

  return (
    <View style={s.bloque}>
      <Text style={s.seccion}>MIS EVENTOS</Text>
      {grupos.length === 0 ? (
        <Text style={s.vacio}>No hay eventos de tu división en los próximos {DIAS_AGENDA} días.</Text>
      ) : (
        grupos.map(g => (
          <View key={g.fecha} style={s.dia}>
            <Text style={s.diaTitulo}>{etiquetaFecha(g.fecha)}</Text>
            {g.items.map(i => (i.tipo === 'tenis' && tenis
              ? <CardTenis key={`t-${i.reserva.id}`} r={i.reserva} tenis={tenis} />
              : i.tipo === 'evento'
                ? <CardEvento key={i.evento.id} ev={i.evento} agenda={agenda} />
                : null))}
          </View>
        ))
      )}
    </View>
  )
}

function CardEvento({ ev, agenda }: { ev: EventoAgenda; agenda: Agenda }) {
  const hora = horaCorta(ev.hora)
  return (
    <View style={s.card}>
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
}

// Turno de tenis: arranque real (+5 min), cancha, modalidad y con quién juega.
// El titular ve EDITAR (reserva suya, confirmada) y CANCELAR dentro del plazo que
// configura la gestora (lo informa el servidor).
function CardTenis({ r, tenis }: { r: MiReserva; tenis: TenisAgenda }) {
  const otros = otrosJugadores(r)
  const { editar: editable, cancelar: cancelable } = accionesTenisAgenda(r, tenis.ahoraMs)
  return (
    <View style={[s.card, s.cardTenis]}>
      <View style={s.filaTenis}>
        <View style={s.badge}>
          <Text style={s.badgeText}>T</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{lineaTenis(r, CONFIG_DEFECTO.margen_inicio_min)}</Text>
          {otros.length > 0 && <Text style={s.detalle}>Con {otros.join(', ')}</Text>}
          {r.estado !== 'confirmada' && <Text style={s.detalle}>{ESTADOS_RESERVA[r.estado] ?? r.estado}</Text>}
        </View>
      </View>
      {(editable || cancelable) && (
        <View style={s.acciones}>
          {editable && (
            <TouchableOpacity style={s.accion} onPress={() => tenis.onEditar(r)} activeOpacity={0.75} accessibilityRole="button">
              <Text style={s.accionTexto}>EDITAR</Text>
            </TouchableOpacity>
          )}
          {cancelable && (
            <TouchableOpacity
              style={s.accion}
              onPress={() => tenis.onCancelar(r)}
              disabled={tenis.cancelando === r.id}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              {tenis.cancelando === r.id
                ? <ActivityIndicator color={colors.oro} />
                : <Text style={s.accionTexto}>CANCELAR</Text>}
            </TouchableOpacity>
          )}
        </View>
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
  cardTenis:   { flexDirection: 'column', alignItems: 'stretch' },
  filaTenis:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  acciones:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  accion:      { minHeight: 44, minWidth: 96, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.oro, borderRadius: 4, paddingHorizontal: 16 },
  accionTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },
  badgeText: { fontFamily: fonts.label, fontSize: 14, color: colors.sobreOro },
  titulo:    { fontFamily: fonts.cuerpo, fontSize: 17, fontWeight: '600', color: colors.texto },
  detalle:   { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.textoSecundario, marginTop: 2 },

  errorText:      { fontFamily: fonts.cuerpo, fontSize: 16, color: colors.texto },
  reintentar:     { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.oro, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 24 },
  reintentarText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },
})
