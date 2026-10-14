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
}

export const fonts = {
  titulo: 'Barlow_900Black',
  cuerpo: 'Barlow_400Regular',
  label:  'BarlowSemiCondensed_600SemiBold',
  mono:   'JetBrainsMono_400Regular',
}
