// Verificación autocontenida de contraste.ts y de los pares de color que usan
// los tokens semánticos de constants/theme.ts (no hay runner de tests en app/).
//   npx tsx app/lib/contraste.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { contraste, CONTRASTE_TEXTO_AA } from './contraste'
import { colors } from '../constants/theme'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const FONDO = '#15110A'
const CARD  = '#1C1710'

caso('contraste: extremos y simetría', () => {
  assert.equal(contraste('#FFFFFF', '#000000'), 21)
  assert.equal(contraste('#777777', '#777777'), 1)
  assert.equal(contraste('#000000', '#FFFFFF'), contraste('#FFFFFF', '#000000'))
})

caso('contraste: acepta hex corto y minúsculas', () => {
  assert.equal(contraste('#fff', '#000'), 21)
})

caso('contraste: valor conocido (#767676 sobre blanco ≈ 4.54)', () => {
  assert.equal(Math.round(contraste('#767676', '#FFFFFF') * 100) / 100, 4.54)
})

// Pares de la auditoría (T4): texto normal, mínimo AA 4.5:1.
const pares: [string, string, string][] = [
  ['sobreOro sobre oro (botón pagar, banner en revisión, badge J)', colors.sobreOro, colors.oro],
  ['sobreOro sobre oroHondo (banner pendiente, badges EN REVISIÓN / ENVIADO)', colors.sobreOro, colors.oroHondo],
  ['sobreOro sobre naranja (banner foto, badge PENDIENTE)', colors.sobreOro, '#E67E22'],
  ['sobreOro sobre verde (badge ACTIVO)', colors.sobreOro, '#2ECC71'],
  ['sobreOro sobre tinta (chip de filtro activo)', colors.sobreOro, colors.tinta],
  ['oroSobreClaro sobre tinta (barra de edición, tarjeta física)', colors.oroSobreClaro, colors.tinta],
  ['rojoTexto sobre fondo (errores)', colors.rojoTexto, FONDO],
  ['rojoTexto sobre card (Turnos)', colors.rojoTexto, CARD],
  ['blanco sobre rojoUrgente (badge MOROSO / INACTIVO)', colors.blanco, colors.rojoUrgente],
  // Semánticos de T17 (mismos valores que los literales que reemplazan, salvo
  // #0E0E0E → sobreOro en Mi perfil y #EF4444 → rojoTexto en Calendario).
  ['texto sobre fondo', colors.texto, colors.fondo],
  ['texto sobre card', colors.texto, colors.card],
  ['muted sobre fondo', colors.muted, colors.fondo],
  ['muted sobre card', colors.muted, colors.card],
  ['textoSecundario sobre card (Turnos profesor)', colors.textoSecundario, colors.card],
  ['confirmacion sobre card (Calendario ganado)', colors.confirmacion, colors.card],
  ['sobreOro sobre confirmacion (Mi perfil Guardar ✓)', colors.sobreOro, colors.confirmacion],
  // Mi perfil (socio y tutor): texto y borde de CERRAR SESIÓN sobre el fondo.
  ['CERRAR SESIÓN sobre fondo (Mi perfil)', colors.rojoTexto, colors.fondo],
  // Etiquetas de la tab bar (constants/tabOptions.ts, no importable fuera de RN)
  ['etiqueta activa de la tab bar', '#E8B53C', '#0E0E0E'],
  ['etiqueta inactiva de la tab bar', '#8E8574', '#0E0E0E'],
]

for (const [nombre, texto, fondo] of pares) {
  caso(`AA: ${nombre} = ${contraste(texto, fondo).toFixed(2)}`, () => {
    assert.ok(contraste(texto, fondo) >= CONTRASTE_TEXTO_AA)
  })
}

console.log(`\n${casos} casos OK`)
