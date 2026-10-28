// Verificación autocontenida de aviso-noticia.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/aviso-noticia.check.ts

import assert from 'node:assert/strict'
import { leerEstadoReclamo, pushFalloEntero } from './aviso-noticia.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('los cuatro estados del RPC se reconocen', () => {
  for (const e of ['reclamada', 'ya_notificada', 'no_publicada', 'no_existe'] as const) {
    assert.equal(leerEstadoReclamo(e), e)
  }
})

caso('cualquier otra respuesta del RPC no es un estado válido (no se manda el push)', () => {
  assert.equal(leerEstadoReclamo(null), null)
  assert.equal(leerEstadoReclamo(''), null)
  assert.equal(leerEstadoReclamo('RECLAMADA'), null)
  assert.equal(leerEstadoReclamo({ estado: 'reclamada' }), null)
})

caso('falló entero: había tokens y no salió ninguno', () => {
  assert.equal(pushFalloEntero({ tokensValidos: 120, ok: 0 }), true)
})

caso('salió al menos uno: no se libera (los que lo recibieron no lo tienen que recibir de nuevo)', () => {
  assert.equal(pushFalloEntero({ tokensValidos: 120, ok: 1 }), false)
  assert.equal(pushFalloEntero({ tokensValidos: 120, ok: 120 }), false)
})

caso('sin destinatarios con la app no es una falla', () => {
  assert.equal(pushFalloEntero({ tokensValidos: 0, ok: 0 }), false)
})

console.log(`\n${casos} casos ok`)
