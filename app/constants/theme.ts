export const colors = {
  tinta:       '#F3EFE4',
  oro:         '#F5B41C',
  oroHondo:    '#C9890A',
  papel:       '#15110A',
  blanco:      '#FFFFFF',
  grisClaro:   '#2C2418',
  rojoUrgente: '#CC4127',
  // Semánticos de texto (auditoría UX, T4): `tinta` pasó a ser claro, así que
  // el texto sobre oro / naranja / verde / crema usa estos. Ratios en
  // lib/contraste.check.ts.
  sobreOro:      '#15110A', // texto sobre oro, oroHondo y badges de color
  oroSobreClaro: '#7A4F00', // acento dorado sobre fondo crema (tinta)
  rojoTexto:     '#E5634A', // texto de error / aviso sobre fondo oscuro
  // Texto secundario (fechas, descripciones, autor) sobre fondo crema (tinta),
  // 7.39:1 (auditoría UX, X4). Reemplaza #9A8870 / #C9B98A / #7A6D50.
  mutedSobreClaro: '#5C4A2E',
  // Semánticos de superficie, texto y estado (auditoría UX, T17). Este archivo
  // es la única fuente de valores: ThemeContext deriva su paleta de acá. Un
  // rediseño cambia valores, no nombres. Algunos coinciden hoy con tokens de
  // marca (fondo = papel, texto = tinta, borde = grisClaro) a propósito: son
  // significados distintos y pueden divergir.
  fondo:           '#15110A', // fondo de pantalla
  card:            '#1C1710', // superficie de cards, sheets y chips
  texto:           '#F3EFE4', // texto principal sobre fondo / card
  muted:           '#8E8574', // texto secundario, labels, placeholders
  textoSecundario: '#B8AD96', // texto de apoyo un escalón más claro que muted
  borde:           '#2C2418', // bordes de card, divisores, tracks
  bordeRealce:     '#3A2E1E', // borde de la tarjeta física y sus piezas
  exito:           '#1A7A1A', // pagado: borde, badge e ícono
  confirmacion:    '#22C55E', // texto / botón de acción confirmada, partido ganado
  estadoActivo:    '#2ECC71', // badge de estado ACTIVO, turno con lugar
  estadoPendiente: '#E67E22', // badge PENDIENTE, banner de foto faltante
}

// Grilla de canchas de tenis (reservas-tenis): la misma paleta de OnDepor que
// el club ya conoce, un fondo por tipo de reserva o bloque y el texto que se
// lee encima con contraste AA (blanco sólo sobre el azul oscuro; el resto lleva
// texto oscuro). Ratios en lib/tenis.check.ts.
export const tenis = {
  web:           { fondo: '#10577D', texto: '#FFFFFF' }, // reserva web (socio) e invitado
  telefonica:    { fondo: '#4094C4', texto: '#15110A' }, // reserva telefónica
  torneo:        { fondo: '#F06B3A', texto: '#15110A' },
  clase:         { fondo: '#499A6B', texto: '#15110A' }, // clase / escuelita
  entrenamiento: { fondo: '#F5D580', texto: '#15110A' }, // academia
  noDisponible:  { fondo: '#BABFC2', texto: '#15110A' },
  enSuspenso:    { fondo: '#ACD2E7', texto: '#15110A' },
} as const

// Vista semanal de disponibilidad de tenis (como OnDepor): verde con muchas
// canchas libres, ámbar a mitad, naranja con pocas y bordó cuando está
// completo. Texto con contraste AA (lib/tenisGrilla.check.ts).
export const calorTenis = {
  alto:     { fondo: '#1F7A3D', texto: '#FFFFFF' },
  medio:    { fondo: '#E3B341', texto: '#15110A' },
  bajo:     { fondo: '#E8742F', texto: '#15110A' },
  completo: { fondo: '#7A1F1F', texto: '#FFFFFF' },
} as const

export const fonts = {
  titulo: 'Barlow_900Black',
  cuerpo: 'Barlow_400Regular',
  label:  'BarlowSemiCondensed_600SemiBold',
  mono:   'JetBrainsMono_400Regular',
}
