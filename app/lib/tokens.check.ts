// Guarda del refactor de tokens (auditoría UX, T17): los semánticos de
// constants/theme.ts resuelven a los mismos valores que antes estaban como
// literales en las pantallas del socio, y useTheme() expone la misma paleta
// histórica derivada de esa única fuente.
//   npx tsx app/lib/tokens.check.ts
// Sale con código distinto de 0 si algo falla. Si un rediseño cambia valores
// a propósito, se actualiza este archivo junto con theme.ts.

import assert from 'node:assert/strict'
import { colors } from '../constants/theme'
import { THEME_COLORS } from '../contexts/ThemeContext'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// Tokens que ya existían: el refactor no puede cambiar ningún valor.
const existentes = {
  tinta:         '#F3EFE4',
  oro:           '#F5B41C',
  oroHondo:      '#C9890A',
  papel:         '#15110A',
  blanco:        '#FFFFFF',
  grisClaro:     '#2C2418',
  rojoUrgente:   '#CC4127',
  sobreOro:      '#15110A',
  oroSobreClaro: '#7A4F00',
  rojoTexto:     '#E5634A',
}

// Semánticos nuevos = el literal que reemplazan.
const semanticos = {
  fondo:           '#15110A',
  card:            '#1C1710',
  texto:           '#F3EFE4',
  muted:           '#8E8574',
  textoSecundario: '#B8AD96',
  borde:           '#2C2418',
  bordeRealce:     '#3A2E1E',
  exito:           '#1A7A1A',
  confirmacion:    '#22C55E',
  estadoActivo:    '#2ECC71',
  estadoPendiente: '#E67E22',
}

caso('theme.ts: tokens existentes sin cambios de valor', () => {
  for (const [k, v] of Object.entries(existentes)) {
    assert.equal(colors[k as keyof typeof colors], v, k)
  }
})

caso('theme.ts: semánticos nuevos resuelven al literal que reemplazan', () => {
  for (const [k, v] of Object.entries(semanticos)) {
    assert.equal(colors[k as keyof typeof colors], v, k)
  }
})

// Paleta que useTheme() devolvía antes del refactor (ThemeContext.tsx a 2a61d13).
const paletaHistorica = {
  fondo:       '#15110A',
  texto:       '#F3EFE4',
  acento:      '#F5B41C',
  card:        '#1C1710',
  tinta:       '#F3EFE4',
  papel:       '#15110A',
  oro:         '#F5B41C',
  oroHondo:    '#C9890A',
  blanco:      '#FFFFFF',
  grisClaro:   '#2C2418',
  rojoUrgente: '#CC4127',
  muted:       '#8E8574',
}

caso('ThemeContext: misma paleta histórica con las mismas claves', () => {
  for (const [k, v] of Object.entries(paletaHistorica)) {
    assert.equal(THEME_COLORS[k as keyof typeof THEME_COLORS], v, k)
  }
})

caso('ThemeContext: deriva de theme.ts (todo token de theme.ts está en useTheme)', () => {
  for (const [k, v] of Object.entries(colors)) {
    assert.equal(THEME_COLORS[k as keyof typeof THEME_COLORS], v, k)
  }
  assert.equal(THEME_COLORS.acento, colors.oro)
})

console.log(`\n${casos} casos OK`)
