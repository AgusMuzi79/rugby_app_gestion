// Verificación autocontenida de cargaPartidoWeb.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/cargaPartidoWeb.check.ts
// Casos de app/lib/cargaPartido.check.ts + la carga de lo guardado de app/hooks/usePartido.ts.
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { abrirPaso, aplicarGuardado, aplicarResultado, type DestinoPartido } from './cargaPartidoWeb'

let casos = 0
async function caso(nombre: string, fn: () => Promise<void> | void) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const BASE = [
  { id: 'a', nombre_completo: 'Ana' },
  { id: 'b', nombre_completo: 'Beto' },
  { id: 'c', nombre_completo: 'Caro' },
]

const PARTIDO = { id: 'p1', rival: 'Pucará' }
const EQUIPO = { id: 'e1' }
const RED = new TypeError('Failed to fetch')

function puertoFalso(errores: unknown[]) {
  const cargas: unknown[][] = []
  const pasos: [DestinoPartido, unknown, unknown][] = []
  let reintentar: (() => void) | null = null
  const puerto = {
    cargar: async (p: unknown, e: unknown, b: unknown) => { cargas.push([p, e, b]); return errores.shift() ?? null },
    fallo: (_err: unknown, repetir: () => void) => { reintentar = repetir },
    irA: async (d: DestinoPartido, p: unknown, e: unknown) => { pasos.push([d, p, e]) },
  }
  return { puerto, cargas, pasos, reintentar: () => reintentar }
}

async function main() {
  await caso('sin nada guardado: todos presentes, sin mesa, nada marcado como guardado', () => {
    const r = aplicarGuardado(BASE, [], null)
    assert.deepEqual(r.jugadores.map(j => [j.id, j.presente, j.rolEnMesa]), [['a', true, null], ['b', true, null], ['c', true, null]])
    assert.equal(r.asistenciaGuardada, false)
    assert.equal(r.mesaGuardada, false)
    assert.deepEqual(r.presenciaGuardada, { a: true, b: true, c: true })
    assert.deepEqual(r.estadosPrevios, {})
  })

  await caso('asistencia guardada (también desde la app): ausente y justificado = no presente', () => {
    const r = aplicarGuardado(BASE, [
      { jugador_id: 'a', estado: 'presente' },
      { jugador_id: 'b', estado: 'ausente' },
      { jugador_id: 'c', estado: 'justificado' },
      { jugador_id: 'zz', estado: 'ausente' }, // de baja: no está en el plantel
    ], null)
    assert.deepEqual(r.jugadores.map(j => j.presente), [true, false, false])
    assert.equal(r.asistenciaGuardada, true)
    assert.deepEqual(r.presenciaGuardada, { a: true, b: false, c: false })
    assert.deepEqual(r.estadosPrevios, { a: 'presente', b: 'ausente', c: 'justificado', zz: 'ausente' })
  })

  await caso('mesa guardada: roles titular/suplente; un rol raro se ignora', () => {
    const r = aplicarGuardado(BASE, [], { mesa_jugadores: [
      { jugador_id: 'a', rol_en_mesa: 'titular' },
      { jugador_id: 'b', rol_en_mesa: 'suplente' },
      { jugador_id: 'c', rol_en_mesa: 'aguatero' },
    ] })
    assert.deepEqual(r.jugadores.map(j => j.rolEnMesa), ['titular', 'suplente', null])
    assert.equal(r.mesaGuardada, true)
    assert.deepEqual(r.rolesGuardados, { a: 'titular', b: 'suplente' })
  })

  await caso('mesa creada sin jugadores también cuenta como guardada', () => {
    const r = aplicarGuardado(BASE, [], { mesa_jugadores: [] })
    assert.equal(r.mesaGuardada, true)
  })

  await caso('resultado: guardado o vacío con el rival del partido', () => {
    assert.deepEqual(aplicarResultado({ puntos_propios: 24, puntos_rival: 17, rival: null }, 'Pucará'),
      { puntosPropios: '24', puntosRival: '17', rivalNombre: 'Pucará', guardado: true })
    assert.deepEqual(aplicarResultado({ puntos_propios: 3, puntos_rival: 0, rival: 'CASI' }, 'Pucará'),
      { puntosPropios: '3', puntosRival: '0', rivalNombre: 'CASI', guardado: true })
    assert.deepEqual(aplicarResultado(null, null),
      { puntosPropios: '', puntosRival: '', rivalNombre: '', guardado: false })
  })

  await caso('abrir paso: lectura OK va al paso pedido con ese partido y equipo', async () => {
    const f = puertoFalso([null])
    const ok = await abrirPaso({ partido: PARTIDO, equipo: EQUIPO, base: BASE, destino: 'resultado' }, f.puerto)
    assert.equal(ok, true)
    assert.deepEqual(f.pasos, [['resultado', PARTIDO, EQUIPO]])
  })

  await caso('abrir paso: si falla, REINTENTAR repite esa misma carga y abre el mismo paso', async () => {
    const f = puertoFalso([RED, null])
    const ok = await abrirPaso({ partido: PARTIDO, equipo: EQUIPO, base: BASE, destino: 'asistencia' }, f.puerto)
    assert.equal(ok, false)
    assert.deepEqual(f.pasos, [])
    f.reintentar()!()
    await new Promise(res => setImmediate(res))
    assert.deepEqual(f.cargas, [[PARTIDO, EQUIPO, BASE], [PARTIDO, EQUIPO, BASE]])
    assert.deepEqual(f.pasos, [['asistencia', PARTIDO, EQUIPO]])
  })

  console.log(`\n${casos} casos ok`)
}

main().catch(e => { console.error(e); process.exit(1) })
