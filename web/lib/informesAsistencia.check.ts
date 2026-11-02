// Verificación autocontenida de informesAsistencia.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/informesAsistencia.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { informeAsistencia, fechaLocal, type EventoInforme, type FilaInforme } from './informesAsistencia'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const HOY = '2026-11-02'
const j1 = { id: 'j1', division_id: 'm19' }
const j2 = { id: 'j2', division_id: 'm20' }

function ev(id: string, fecha: string, extra: Partial<EventoInforme> = {}): EventoInforme {
  return { id, division_id: 'm19', fecha, tipo: 'entrenamiento', hora: null, created_at: `${fecha}T00:00:00Z`, ...extra }
}
function fila(evento_id: string, estado: string, jugador_id = 'j1'): FilaInforme {
  return { evento_id, jugador_id, estado }
}

const cuatroPasados = [ev('e1', '2026-10-20'), ev('e2', '2026-10-22'), ev('e3', '2026-10-27'), ev('e4', '2026-10-29')]
const cuatroAusentes = ['e1', 'e2', 'e3', 'e4'].map(id => fila(id, 'ausente'))

caso('4 ausencias reales seguidas en eventos pasados de su división marcan la alerta', () => {
  const r = informeAsistencia([j1], cuatroPasados, cuatroAusentes, HOY).get('j1')!
  assert.equal(r.cuatroConsec, true)
})

caso('un evento futuro de la división no tapa la racha', () => {
  const eventos = [...cuatroPasados, ev('f1', '2026-11-05'), ev('f2', '2026-11-07')]
  const r = informeAsistencia([j1], eventos, cuatroAusentes, HOY).get('j1')!
  assert.equal(r.cuatroConsec, true)
})

caso('eventos de otra división no cortan la racha ni cuentan para el jugador', () => {
  const otra = ev('o1', '2026-10-31', { division_id: 'm20' })
  const filas = [...cuatroAusentes, fila('o1', 'presente')]
  const r = informeAsistencia([j1], [...cuatroPasados, otra], filas, HOY).get('j1')!
  assert.equal(r.cuatroConsec, true)
  assert.equal(r.total, 4)
  assert.equal(r.presentes, 0)
})

caso('cada jugador se mide contra los eventos de su propia división', () => {
  const m20 = ['a', 'b', 'c', 'd'].map((id, i) => ev(id, `2026-10-2${i}`, { division_id: 'm20' }))
  const filas = [...cuatroAusentes, ...['a', 'b', 'c', 'd'].map(id => fila(id, 'presente', 'j2'))]
  const r = informeAsistencia([j1, j2], [...cuatroPasados, ...m20], filas, HOY)
  assert.equal(r.get('j1')!.cuatroConsec, true)
  assert.equal(r.get('j2')!.cuatroConsec, false)
  assert.equal(r.get('j2')!.pct, 100)
})

caso('un presente en el evento más reciente corta la racha', () => {
  const eventos = [...cuatroPasados, ev('e5', '2026-10-31')]
  const r = informeAsistencia([j1], eventos, [...cuatroAusentes, fila('e5', 'presente')], HOY).get('j1')!
  assert.equal(r.cuatroConsec, false)
})

caso('un justificado corta la racha (igual que la alerta de la app)', () => {
  const eventos = [...cuatroPasados, ev('e5', '2026-10-31')]
  const r = informeAsistencia([j1], eventos, [...cuatroAusentes, fila('e5', 'justificado')], HOY).get('j1')!
  assert.equal(r.cuatroConsec, false)
})

caso('un evento sin lista tomada no corta ni suma la racha', () => {
  const eventos = [...cuatroPasados, ev('e5', '2026-10-31')]
  const r = informeAsistencia([j1], eventos, cuatroAusentes, HOY).get('j1')!
  assert.equal(r.cuatroConsec, true)
})

caso('tres ausencias no alcanzan', () => {
  const r = informeAsistencia([j1], cuatroPasados, cuatroAusentes.slice(1), HOY).get('j1')!
  assert.equal(r.cuatroConsec, false)
})

caso('el evento de hoy con lista tomada cuenta para la racha', () => {
  const eventos = [ev('e2', '2026-10-22'), ev('e3', '2026-10-27'), ev('e4', '2026-10-29'), ev('hoy', HOY)]
  const filas = ['e2', 'e3', 'e4', 'hoy'].map(id => fila(id, 'ausente'))
  const r = informeAsistencia([j1], eventos, filas, HOY).get('j1')!
  assert.equal(r.cuatroConsec, true)
})

caso('dos eventos el mismo día se ordenan por hora', () => {
  // Más reciente primero: e7, e6, e5, tarde (ausentes) y recién después
  // maniana (presente). Con el orden invertido la racha quedaría en 3.
  const eventos = [
    ev('maniana', '2026-10-20', { hora: '09:00:00' }),
    ev('tarde', '2026-10-20', { hora: '20:30:00' }),
    ev('e5', '2026-10-22'), ev('e6', '2026-10-27'), ev('e7', '2026-10-29'),
  ]
  const filas = [fila('maniana', 'presente'), ...['tarde', 'e5', 'e6', 'e7'].map(id => fila(id, 'ausente'))]
  const r = informeAsistencia([j1], eventos, filas, HOY).get('j1')!
  assert.equal(r.cuatroConsec, true)
})

caso('las actividades no cuentan para el % ni para la racha', () => {
  const eventos = [...cuatroPasados, ev('act', '2026-10-31', { tipo: 'actividad' })]
  const r = informeAsistencia([j1], eventos, [...cuatroAusentes, fila('act', 'presente')], HOY).get('j1')!
  assert.equal(r.cuatroConsec, true)
  assert.equal(r.total, 4)
})

caso('% : justificado queda fuera del numerador y del denominador', () => {
  const filas = [fila('e1', 'presente'), fila('e2', 'presente'), fila('e3', 'ausente'), fila('e4', 'justificado')]
  const r = informeAsistencia([j1], cuatroPasados, filas, HOY).get('j1')!
  assert.equal(r.presentes, 2)
  assert.equal(r.total, 3)
  assert.equal(r.pct, 67)
})

caso('% : cuentan sólo los eventos ya pasados (no hoy), como en la app', () => {
  const eventos = [...cuatroPasados, ev('hoy', HOY)]
  const filas = [fila('e1', 'presente'), fila('hoy', 'ausente')]
  const r = informeAsistencia([j1], eventos, filas, HOY).get('j1')!
  assert.equal(r.total, 1)
  assert.equal(r.pct, 100)
})

caso('% : sin filas que contar da null', () => {
  const r = informeAsistencia([j1], cuatroPasados, [], HOY).get('j1')!
  assert.equal(r.total, 0)
  assert.equal(r.pct, null)
})

caso('fechaLocal arma YYYY-MM-DD con la fecha local', () => {
  assert.equal(fechaLocal(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
})

console.log(`\n${casos} casos ok`)
