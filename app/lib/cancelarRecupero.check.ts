// Verificación autocontenida de cancelarRecupero.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/cancelarRecupero.check.ts

import assert from 'node:assert/strict'
import { cerrarSesionRecupero, type SignOut } from './cancelarRecupero'

let casos = 0
async function caso(nombre: string, fn: () => Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// Registra en orden las llamadas: 'signOut:global', 'signOut:local', 'limpiar'.
function escenario(global: 'ok' | 'error' | 'throw', local: 'ok' | 'error' | 'throw' = 'ok') {
  const llamadas: string[] = []
  const signOut: SignOut = async (opciones) => {
    const scope = opciones?.scope ?? 'global'
    llamadas.push(`signOut:${scope}`)
    const r = scope === 'local' ? local : global
    if (r === 'throw') throw new Error('red')
    return { error: r === 'error' ? { message: 'falló' } : null }
  }
  const limpiar = () => { llamadas.push('limpiar') }
  return { llamadas, signOut, limpiar }
}

async function main() {
  await caso('primero se cierra la sesión del link, recién después se limpia el flag (auth review)', async () => {
    const e = escenario('ok')
    await cerrarSesionRecupero(e.signOut, e.limpiar)
    assert.deepEqual(e.llamadas, ['signOut:global', 'limpiar'])
  })

  await caso('si el cierre en el servidor devuelve error: cierre local y después limpiar', async () => {
    const e = escenario('error')
    await cerrarSesionRecupero(e.signOut, e.limpiar)
    assert.deepEqual(e.llamadas, ['signOut:global', 'signOut:local', 'limpiar'])
  })

  await caso('si el cierre en el servidor tira (sin red): cierre local y después limpiar', async () => {
    const e = escenario('throw')
    await cerrarSesionRecupero(e.signOut, e.limpiar)
    assert.deepEqual(e.llamadas, ['signOut:global', 'signOut:local', 'limpiar'])
  })

  await caso('aunque el cierre local también falle, el estado se limpia igual y no tira', async () => {
    const e = escenario('throw', 'throw')
    await cerrarSesionRecupero(e.signOut, e.limpiar)
    assert.deepEqual(e.llamadas, ['signOut:global', 'signOut:local', 'limpiar'])
  })

  console.log(`\n${casos} casos ok`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
