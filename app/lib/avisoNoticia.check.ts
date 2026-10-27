// Verificación autocontenida de avisoNoticia.ts (no hay runner de tests en la app).
//   npx --yes tsx app/lib/avisoNoticia.check.ts
// Sale con código distinto de 0 si algo falla. Misma lógica que web/lib/avisoNoticia.ts.

import assert from 'node:assert/strict'
import { confirmacionPublicar, mensajeResultadoAviso } from './avisoNoticia'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('primera publicación para socios: avisa que se manda la notificación a todos los socios', () => {
  assert.equal(
    confirmacionPublicar({ audiencia: 'todos', notificadaAt: null }),
    'Se avisa por notificación a todos los socios. ¿Publicar?',
  )
  assert.equal(confirmacionPublicar({ audiencia: undefined, notificadaAt: null }), 'Se avisa por notificación a todos los socios. ¿Publicar?')
})

caso('una noticia vieja para cuerpo técnico nombra al cuerpo técnico', () => {
  assert.equal(
    confirmacionPublicar({ audiencia: 'cuerpo_tecnico', notificadaAt: null }),
    'Se avisa por notificación a todo el cuerpo técnico. ¿Publicar?',
  )
})

caso('republicar una noticia ya avisada dice que no se vuelve a mandar', () => {
  assert.equal(
    confirmacionPublicar({ audiencia: 'todos', notificadaAt: '2026-10-20T12:00:00Z' }),
    'Ya se avisó por notificación cuando se publicó por primera vez: no se vuelve a mandar. ¿Publicar?',
  )
})

caso('si el invoke falla, se avisa que quedó publicada pero sin push', () => {
  assert.equal(
    mensajeResultadoAviso({ error: new Error('Edge Function returned a non-2xx status code'), data: null }),
    'La noticia quedó publicada, pero no se pudo mandar el aviso push.',
  )
})

caso('si salió o ya se había avisado, no hay nada que mostrar', () => {
  assert.equal(mensajeResultadoAviso({ error: null, data: { ok: true } }), null)
  assert.equal(mensajeResultadoAviso({ error: null, data: { ok: true, omitido: 'ya_notificada' } }), null)
})

console.log(`\n${casos} casos ok`)
