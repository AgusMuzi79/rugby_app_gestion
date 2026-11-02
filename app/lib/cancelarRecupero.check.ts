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

// Registra en orden las llamadas: 'signOut:<scope>', 'limpiar'.
function escenario(resultado: 'ok' | 'error' | 'throw') {
  const llamadas: string[] = []
  const signOut: SignOut = async (opciones) => {
    llamadas.push(`signOut:${opciones?.scope ?? 'global'}`)
    if (resultado === 'throw') throw new Error('red')
    return { error: resultado === 'error' ? { message: 'falló' } : null }
  }
  const limpiar = () => { llamadas.push('limpiar') }
  return { llamadas, signOut, limpiar }
}

async function main() {
  await caso('cierra sólo la sesión de este teléfono (scope local), y recién después limpia el flag (auth review)', async () => {
    const e = escenario('ok')
    await cerrarSesionRecupero(e.signOut, e.limpiar)
    assert.deepEqual(e.llamadas, ['signOut:local', 'limpiar'])
  })

  await caso('nunca cierra la sesión en los otros dispositivos (sin scope global), aunque falle', async () => {
    for (const r of ['ok', 'error', 'throw'] as const) {
      const e = escenario(r)
      await cerrarSesionRecupero(e.signOut, e.limpiar)
      assert.ok(!e.llamadas.includes('signOut:global'), r)
    }
  })

  await caso('si el cierre devuelve error: igual limpia el estado, después', async () => {
    const e = escenario('error')
    await cerrarSesionRecupero(e.signOut, e.limpiar)
    assert.deepEqual(e.llamadas, ['signOut:local', 'limpiar'])
  })

  await caso('si el cierre tira (sin red): igual limpia el estado, después, y no tira', async () => {
    const e = escenario('throw')
    await cerrarSesionRecupero(e.signOut, e.limpiar)
    assert.deepEqual(e.llamadas, ['signOut:local', 'limpiar'])
  })

  console.log(`\n${casos} casos ok`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
