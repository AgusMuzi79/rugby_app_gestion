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
  // Cuotas, modal de pago: botón COPIAR ALIAS / ✓ COPIADO dentro del recuadro del alias.
  ['COPIAR ALIAS sobre fondo (modal de pago)', colors.oro, colors.fondo],
  ['✓ COPIADO sobre fondo (modal de pago)', colors.confirmacion, colors.fondo],
  // Etiquetas de la tab bar (constants/tabOptions.ts, no importable fuera de RN:
  // usa colors.fondo / colors.oro / colors.muted desde X4).
  ['etiqueta activa de la tab bar', colors.oro, colors.fondo],
  ['etiqueta inactiva de la tab bar', colors.muted, colors.fondo],
  // X4 — contraste en todas las áreas (tablas de odd/tasks/auditoria-ux-*.md).
  // Botones primarios, chips / pills / selectores activos, FAB, badges OK / HOY / W,
  // TOMAR ASISTENCIA, COBRANZA ACTIVA, ASISTENCIA (Crónica), CERRAR SESIÓN de Usuarios.
  ['sobreOro sobre estadoPendiente (badge PENDIENTE de Secretaría / cliente gimnasio)', colors.sobreOro, colors.estadoPendiente],
  ['sobreOro sobre estadoActivo (badge AL DÍA / ACTIVO)', colors.sobreOro, colors.estadoActivo],
  ['blanco sobre gris #555555 (badge INACTIVO de Secretaría)', colors.blanco, '#555555'],
  // Superficies crema (tinta): barras de edición, tarjeta urgente de Crónica y
  // Lesiones, jugador en mesa, header de Informes y Protocolos, banners OK.
  ['mutedSobreClaro sobre tinta (desc / autor urgente, fecha urgente, sub de banner)', colors.mutedSobreClaro, colors.tinta],
  ['grisClaro sobre tinta (fecha de la barra de edición)', colors.grisClaro, colors.tinta],
  // Texto rojo y verde sobre oscuro.
  ['estadoActivo sobre card (NETO positivo, PAGADOS, FICHA MÉD., Reactivar)', colors.estadoActivo, colors.card],
  ['estadoActivo sobre fondo (turno con reserva del escáner)', colors.estadoActivo, colors.fondo],
  ['confirmacion sobre fondo (✓ Asistencia guardada, contador PRESENTES)', colors.confirmacion, colors.fondo],
  // Subtítulos y textos secundarios.
  ['textoSecundario sobre fondo (subtítulos de auth, "Ahora no")', colors.textoSecundario, colors.fondo],
  ['textoSecundario sobre borde (pills inactivas de Informes)', colors.textoSecundario, colors.borde],
  ['oro sobre card (REINTENTAR dentro del banner de error de Términos)', colors.oro, colors.card],
  // Badges con fondo de color propio.
  ['blanco sobre verde #4A7C59 (badge PAGADO / PRES)', colors.blanco, '#4A7C59'],
  ['blanco sobre #C0392B (badge LESIÓN de Crónica, G4 de Lesiones)', colors.blanco, '#C0392B'],
  ['sobreOro sobre #C4960A (badge G2 de Lesiones)', colors.sobreOro, '#C4960A'],
  ['#5B9BE0 sobre card (badge VIAJE de Subcomisión)', '#5B9BE0', colors.card],
]

for (const [nombre, texto, fondo] of pares) {
  caso(`AA: ${nombre} = ${contraste(texto, fondo).toFixed(2)}`, () => {
    assert.ok(contraste(texto, fondo) >= CONTRASTE_TEXTO_AA)
  })
}

console.log(`\n${casos} casos OK`)
