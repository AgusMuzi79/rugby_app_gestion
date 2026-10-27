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

export const fonts = {
  titulo: 'Barlow_900Black',
  cuerpo: 'Barlow_400Regular',
  label:  'BarlowSemiCondensed_600SemiBold',
  mono:   'JetBrainsMono_400Regular',
}
