// Verificación autocontenida de equiposPartido.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/equiposPartido.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { AccesoEquipos, Equipo, NuevoEquipo, generarNombresEquipos, ordenarEquipos, sincronizarEquipos } from './equiposPartido'

let casos = 0
async function caso(nombre: string, fn: () => Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const tick = () => new Promise<void>(r => setTimeout(r, 0))

// Doble de la tabla `equipos`. `unico`: existe el índice (division_id, nombre).
function tabla({ unico, inicial = [] }: { unico: boolean; inicial?: (Equipo & { division_id: string })[] }) {
  const filas = [...inicial]
  let n = filas.length
  const acceso: AccesoEquipos = {
    async listar(divisionId) {
      await tick()
      return { data: filas.filter(f => f.division_id === divisionId).map(({ id, nombre }) => ({ id, nombre })), error: null }
    },
    async crear(nuevas: NuevoEquipo[], modo) {
      await tick()
      if (modo === 'upsert' && !unico) return { error: { code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' } }
      const choca = (x: NuevoEquipo) => filas.some(f => f.division_id === x.division_id && f.nombre === x.nombre)
      if (modo === 'insert' && unico && nuevas.some(choca)) return { error: { code: '23505', message: 'duplicate key' } }
      for (const x of nuevas) {
        if (modo === 'upsert' && choca(x)) continue
        filas.push({ id: `eq${++n}`, division_id: x.division_id, nombre: x.nombre })
      }
      return { error: null }
    },
  }
  return { filas, acceso }
}

const P = { divisionId: 'd1', categoria: 'superior', divisionNombre: 'Mayores', cantidadJugadores: 40, userId: 'u1' }

async function main() {
  await caso('nombres: superior y juvenil, uno cada 35 jugadores', async () => {
    assert.deepEqual(generarNombresEquipos(4, 'superior', 'Mayores'), ['Primera', 'Intermedia', 'Preintermedia', 'Preintermedia B'])
    assert.deepEqual(generarNombresEquipos(2, 'juvenil', 'M15'), ['M15', 'M15 B'])
  })

  await caso('dos cargas en paralelo la primera vez (con índice): un solo equipo por nombre', async () => {
    const t = tabla({ unico: true })
    const [a, b] = await Promise.all([sincronizarEquipos(t.acceso, P), sincronizarEquipos(t.acceso, P)])
    assert.deepEqual(t.filas.map(f => f.nombre).sort(), ['Intermedia', 'Primera'])
    assert.equal(a.error, null)
    assert.equal(b.error, null)
    assert.deepEqual(a.equipos, b.equipos)
    assert.deepEqual(a.equipos.map(e => e.nombre), ['Primera', 'Intermedia'])
  })

  await caso('sin índice todavía (42P10): cae al insert y crea los equipos', async () => {
    const t = tabla({ unico: false })
    const r = await sincronizarEquipos(t.acceso, P)
    assert.equal(r.error, null)
    assert.deepEqual(r.equipos.map(e => e.nombre), ['Primera', 'Intermedia'])
    assert.equal(t.filas.length, 2)
  })

  await caso('con duplicados viejos se usa el más viejo (el primero de la lista)', async () => {
    const t = tabla({ unico: false, inicial: [
      { id: 'viejo', division_id: 'd1', nombre: 'Primera' },
      { id: 'nuevo', division_id: 'd1', nombre: 'Primera' },
      { id: 'int', division_id: 'd1', nombre: 'Intermedia' },
    ] })
    const r = await sincronizarEquipos(t.acceso, P)
    assert.deepEqual(r.equipos, [{ id: 'viejo', nombre: 'Primera' }, { id: 'int', nombre: 'Intermedia' }])
    assert.equal(t.filas.length, 3)
  })

  await caso('extras (equipos que ya no se esperan) quedan al final', async () => {
    assert.deepEqual(
      ordenarEquipos(['M15'], [{ id: 'x', nombre: 'M15 B' }, { id: 'a', nombre: 'M15' }]),
      [{ id: 'a', nombre: 'M15' }, { id: 'x', nombre: 'M15 B' }],
    )
  })

  await caso('error al leer: lo devuelve (no es "no hay equipos") y no crea nada', async () => {
    let creo = false
    const acceso: AccesoEquipos = {
      async listar() { return { data: null, error: { message: 'Network request failed' } } },
      async crear() { creo = true; return { error: null } },
    }
    const r = await sincronizarEquipos(acceso, P)
    assert.ok(r.error)
    assert.equal(creo, false)
  })

  await caso('error al crear (RLS): lo devuelve', async () => {
    const acceso: AccesoEquipos = {
      async listar() { return { data: [], error: null } },
      async crear() { return { error: { code: '42501', message: 'new row violates row-level security policy' } } },
    }
    const r = await sincronizarEquipos(acceso, P)
    assert.equal((r.error as { code: string }).code, '42501')
  })

  console.log(`\n${casos} casos ok`)
}

main().catch(err => {
  console.error('FALLA:', err)
  process.exit(1)
})
