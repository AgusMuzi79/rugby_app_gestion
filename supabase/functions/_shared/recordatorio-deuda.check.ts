// Verificación autocontenida de recordatorio-deuda.ts (aviso mensual de deuda del día 22 y
// resolución de socios por número en lotes); no hay runner de tests en el repo ni Deno local.
// Desde la raíz del repo:
//   npx --yes tsx supabase/functions/_shared/recordatorio-deuda.check.ts
// Sale con código distinto de 0 si algo falla. La base se simula en memoria (con el mismo tope de
// 1000 filas por request que aplica PostgREST) y el fetch de Expo se inyecta, nunca sale a la red.

import assert from 'node:assert/strict'
import {
  DIA_AVISO_DEUDA,
  MAX_ANTIGUEDAD_CORTE_DIAS,
  agruparRecordatorios,
  buscarSociosPorNumero,
  construirRecordatoriosDeuda,
  corteVigente,
  decidirEnvio,
  enviarPushRecordatoriosDeuda,
  esMenorDeEdad,
  esViolacionUnica,
  estadoFinalEnvio,
  fechaArgentina,
  mesArgentina,
  textoRecordatorio,
  type DeudorRow,
} from './recordatorio-deuda.ts'
import type { FetchLike } from './expoPush.ts'

let casos = 0
async function caso(nombre: string, fn: () => void | Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// ─── Base simulada ────────────────────────────────────────────────────────────
// Soporta lo que usa el módulo: select, in, eq, order, range, update. Igual que PostgREST, nunca
// devuelve más de 1000 filas por request aunque no se pida .range().

const TOPE_POSTGREST = 1000
type Fila = Record<string, unknown>

function baseSimulada(tablas: Record<string, Fila[]>) {
  const requests: { tabla: string; filtros: number }[] = []
  const updates: { tabla: string; valores: Fila; ids: unknown[] }[] = []

  function from(tabla: string) {
    let filas = [...(tablas[tabla] ?? [])]
    let desde = 0
    let hasta = Number.POSITIVE_INFINITY
    let filtros = 0
    let actualizacion: Fila | null = null
    let idsActualizados: unknown[] = []

    const q = {
      select() { return q },
      update(valores: Fila) { actualizacion = valores; return q },
      in(col: string, valores: unknown[]) {
        filtros++
        if (actualizacion && col === 'id') idsActualizados = valores
        filas = filas.filter((f) => valores.includes(f[col]))
        return q
      },
      eq(col: string, valor: unknown) { filtros++; filas = filas.filter((f) => f[col] === valor); return q },
      order(col: string) {
        filas.sort((a, b) => String(a[col]).localeCompare(String(b[col])))
        return q
      },
      range(a: number, b: number) { desde = a; hasta = b; return q },
      then(resolve: (r: { data: Fila[] | null; error: null }) => unknown) {
        requests.push({ tabla, filtros })
        if (actualizacion) {
          updates.push({ tabla, valores: actualizacion, ids: idsActualizados })
          return Promise.resolve(resolve({ data: null, error: null }))
        }
        const pagina = filas.slice(desde, Math.min(hasta + 1, desde + TOPE_POSTGREST))
        return Promise.resolve(resolve({ data: pagina, error: null }))
      },
    }
    return q
  }

  return { db: { from }, requests, updates }
}

const TOKEN = (n: number | string) => `ExponentPushToken[${n}]`

function fetchOk(llamadas: unknown[][] = []): FetchLike {
  return async (_url, init) => {
    const msgs = JSON.parse(String(init?.body)) as unknown[]
    llamadas.push(msgs)
    return new Response(JSON.stringify({ data: msgs.map(() => ({ status: 'ok', id: 'x' })) }), { status: 200 })
  }
}

async function main() {
  const vivo = setInterval(() => {}, 1000)

  // ─── Fecha en Argentina ──────────────────────────────────────────────────────

  await caso('fechaArgentina: usa la hora de Buenos Aires (UTC-3), no UTC', () => {
    assert.equal(fechaArgentina(new Date('2026-10-22T02:00:00Z')), '2026-10-21')
    assert.equal(fechaArgentina(new Date('2026-10-22T03:00:00Z')), '2026-10-22')
    assert.equal(fechaArgentina(new Date('2026-10-22T13:00:00Z')), '2026-10-22')
  })

  await caso('mesArgentina: mes calendario (YYYY-MM) de la fecha argentina', () => {
    assert.equal(mesArgentina('2026-10-22'), '2026-10')
    assert.equal(mesArgentina(fechaArgentina(new Date('2026-11-01T02:00:00Z'))), '2026-10')
  })

  // ─── Antigüedad del reporte ─────────────────────────────────────────────────

  await caso('corteVigente: hasta MAX_ANTIGUEDAD_CORTE_DIAS días de antigüedad', () => {
    assert.equal(MAX_ANTIGUEDAD_CORTE_DIAS, 2)
    assert.equal(corteVigente('2026-10-22', '2026-10-22'), true)
    assert.equal(corteVigente('2026-10-20', '2026-10-22'), true)
    assert.equal(corteVigente('2026-10-19', '2026-10-22'), false)
    assert.equal(corteVigente('2026-09-30', '2026-10-01'), true)
    assert.equal(corteVigente(null, '2026-10-22'), false)
  })

  // ─── Decisión de envío ──────────────────────────────────────────────────────

  await caso('decidirEnvio: el día 22 con reporte fresco y sin envío del mes, envía', () => {
    assert.equal(DIA_AVISO_DEUDA, 22)
    assert.deepEqual(
      decidirEnvio({ hoy: '2026-10-22', forzar: false, ultimoCorte: '2026-10-21' }),
      { enviar: true },
    )
  })

  await caso('decidirEnvio: fuera del día 22 saltea, salvo que se fuerce', () => {
    const d = decidirEnvio({ hoy: '2026-10-21', forzar: false, ultimoCorte: '2026-10-21' })
    assert.equal(d.enviar, false)
    assert.match(d.enviar ? '' : d.motivo, /día 22/)
    assert.deepEqual(
      decidirEnvio({ hoy: '2026-10-21', forzar: true, ultimoCorte: '2026-10-21' }),
      { enviar: true },
    )
  })

  // ─── Reserva del mes y estado final de la corrida ───────────────────────────

  await caso('esViolacionUnica: sólo el código 23505 de Postgres', () => {
    assert.equal(esViolacionUnica({ code: '23505', message: 'duplicate key' }), true)
    assert.equal(esViolacionUnica({ code: '42P01', message: 'no existe la tabla' }), false)
    assert.equal(esViolacionUnica(null), false)
  })

  await caso('estadoFinalEnvio: con al menos un entregado queda enviado', () => {
    assert.deepEqual(
      estadoFinalEnvio({ destinatarios: 3, enviados: 1, sinToken: 1, fallidos: 1 }),
      { estado: 'enviado', motivo: '1 destinatario(s) con error de envío.' },
    )
    assert.deepEqual(
      estadoFinalEnvio({ destinatarios: 2, enviados: 2, sinToken: 0, fallidos: 0 }),
      { estado: 'enviado', motivo: null },
    )
  })

  await caso('estadoFinalEnvio: si no llegó ninguno y hubo fallas queda error (no bloquea el mes)', () => {
    const r = estadoFinalEnvio({ destinatarios: 5, enviados: 0, sinToken: 2, fallidos: 3 })
    assert.equal(r.estado, 'error')
    assert.match(r.motivo ?? '', /ningún aviso/i)
    assert.match(r.motivo ?? '', /3/)
  })

  await caso('estadoFinalEnvio: sin deudores o todos sin la app queda enviado (no hay a quién reintentar)', () => {
    assert.deepEqual(estadoFinalEnvio({ destinatarios: 0, enviados: 0, sinToken: 0, fallidos: 0 }), { estado: 'enviado', motivo: null })
    assert.deepEqual(estadoFinalEnvio({ destinatarios: 4, enviados: 0, sinToken: 4, fallidos: 0 }), { estado: 'enviado', motivo: null })
  })

  await caso('decidirEnvio: reporte viejo o inexistente saltea con motivo', () => {
    const viejo = decidirEnvio({ hoy: '2026-10-22', forzar: false, ultimoCorte: '2026-10-07' })
    assert.equal(viejo.enviar, false)
    assert.match(viejo.enviar ? '' : viejo.motivo, /07\/10\/2026/)
    const nada = decidirEnvio({ hoy: '2026-10-22', forzar: false, ultimoCorte: null })
    assert.equal(nada.enviar, false)
    assert.match(nada.enviar ? '' : nada.motivo, /No hay ningún reporte/)
  })

  // ─── Destinatarios ──────────────────────────────────────────────────────────

  await caso('esMenorDeEdad: menos de 18 años a la fecha dada', () => {
    const hoy = new Date('2026-10-22T13:00:00Z')
    assert.equal(esMenorDeEdad('2010-01-01', hoy), true)
    assert.equal(esMenorDeEdad('2000-01-01', hoy), false)
    assert.equal(esMenorDeEdad(null, hoy), false)
  })

  const hoy = new Date('2026-10-22T13:00:00Z')
  const deudor = (p: Partial<DeudorRow> & { id: string }): DeudorRow => ({
    profile_id: null, cabecera_id: null, fecha_nacimiento: '1980-01-01', meses_impagos: 1, deuda_vencida: 1000,
    profiles: { nombre: `Socio ${p.id}` }, ...p,
  })

  await caso('agruparRecordatorios: el menor se atribuye al titular y se agrupa con su propia deuda', () => {
    const titulares = new Map([['tit', { profileId: 'p-tit', nombre: 'Titular' }]])
    const r = agruparRecordatorios([
      deudor({ id: 'tit', profile_id: 'p-tit', meses_impagos: 1, deuda_vencida: 100 }),
      deudor({ id: 'hijo', profile_id: 'p-hijo', cabecera_id: 'tit', fecha_nacimiento: '2015-05-05', meses_impagos: 2, deuda_vencida: 50 }),
    ], titulares, hoy)
    assert.equal(r.length, 1)
    assert.equal(r[0].profileId, 'p-tit')
    assert.deepEqual(r[0].items.map((i) => [i.socioId, i.propio]), [['tit', true], ['hijo', false]])
  })

  await caso('agruparRecordatorios: se omite el menor sin titular y el adulto sin cuenta', () => {
    const r = agruparRecordatorios([
      deudor({ id: 'huerfano', profile_id: 'p-h', fecha_nacimiento: '2015-05-05' }),
      deudor({ id: 'sin-cuenta', profile_id: null }),
      deudor({ id: 'ok', profile_id: 'p-ok' }),
    ], new Map(), hoy)
    assert.deepEqual(r.map((x) => x.profileId), ['p-ok'])
  })

  await caso('agruparRecordatorios: un socio leído dos veces (paginación con un import en curso) cuenta una sola vez', () => {
    const r = agruparRecordatorios([
      deudor({ id: 'dup', profile_id: 'p-dup', meses_impagos: 1, deuda_vencida: 100 }),
      deudor({ id: 'dup', profile_id: 'p-dup', meses_impagos: 1, deuda_vencida: 100 }),
    ], new Map(), hoy)
    assert.equal(r.length, 1)
    assert.equal(r[0].items.length, 1)
    assert.equal(textoRecordatorio(r[0].items).body.startsWith('Tenés 1 período pendiente por $100'), true)
  })

  await caso('textoRecordatorio: mismo título y texto que antes, singular y plural', () => {
    const uno = textoRecordatorio([{ socioId: 'a', nombre: 'A', propio: true, mesesImpagos: 1, deudaVencida: 1500 }])
    assert.equal(uno.title, 'Cuotas pendientes')
    assert.match(uno.body, /^Tenés 1 período pendiente por \$1\.500,00\. Revisá el detalle en Cuotas\.$/)
    const varios = textoRecordatorio([
      { socioId: 'a', nombre: 'A', propio: true, mesesImpagos: 1, deudaVencida: 100 },
      { socioId: 'b', nombre: 'B', propio: false, mesesImpagos: 2, deudaVencida: 200 },
    ])
    assert.match(varios.body, /^Tenés 3 períodos pendientes por \$300,00\./)
  })

  // ─── Consultas paginadas / en lotes ─────────────────────────────────────────

  await caso('buscarSociosPorNumero: resuelve los 1305 códigos aunque PostgREST corte en 1000', async () => {
    const socios = Array.from({ length: 1500 }, (_, i) => ({ id: `s${i}`, numero_socio: String(10000 + i) }))
    const { db, requests } = baseSimulada({ socios })
    const codigos = Array.from({ length: 1305 }, (_, i) => String(10000 + i)).concat(['99999'])
    const mapa = await buscarSociosPorNumero(db, codigos)
    assert.equal(mapa.size, 1305)
    assert.equal(mapa.get('11304'), 's1304')
    assert.equal(mapa.has('99999'), false)
    assert.ok(requests.length >= 7, `se esperaban varios lotes, hubo ${requests.length}`)
  })

  await caso('construirRecordatoriosDeuda: pagina deudores (>1000) y resuelve titulares en lotes', async () => {
    const socios: Fila[] = []
    for (let i = 0; i < 1200; i++) {
      socios.push({
        id: `d${String(i).padStart(4, '0')}`, profile_id: `p${i}`, cabecera_id: null, fecha_nacimiento: '1980-01-01',
        meses_impagos: 1, deuda_vencida: 10, estado: 'activo', semaforo: i % 2 ? 'rojo' : 'amarillo',
        profiles: { nombre: `S${i}` },
      })
    }
    socios.push({
      id: 'menor', profile_id: null, cabecera_id: 'd0000', fecha_nacimiento: '2015-01-01', meses_impagos: 2,
      deuda_vencida: 5, estado: 'pendiente', semaforo: 'rojo', profiles: null,
    })
    socios.push({ id: 'verde', profile_id: 'pv', estado: 'activo', semaforo: 'verde', profiles: null })
    socios.push({ id: 'baja', profile_id: 'pb', estado: 'baja', semaforo: 'rojo', profiles: null })
    const { db } = baseSimulada({ socios })
    const r = await construirRecordatoriosDeuda(db, hoy)
    assert.equal(r.length, 1200)
    const tit = r.find((x) => x.profileId === 'p0')!
    assert.deepEqual(tit.items.map((i) => i.socioId).sort(), ['d0000', 'menor'])
  })

  await caso('enviarPushRecordatoriosDeuda: cuenta enviados / sin token y sella sólo a los entregados', async () => {
    const { db, updates } = baseSimulada({
      push_tokens: [
        { usuario_id: 'p1', token: TOKEN(1) },
        { usuario_id: 'p1', token: TOKEN('1b') },
        { usuario_id: 'p3', token: 'no-es-expo' },
      ],
    })
    const llamadas: unknown[][] = []
    const resumen = await enviarPushRecordatoriosDeuda(db, [
      { profileId: 'p1', nombreDestinatario: 'Uno', items: [{ socioId: 's1', nombre: 'Uno', propio: true, mesesImpagos: 1, deudaVencida: 10 }] },
      { profileId: 'p2', nombreDestinatario: 'Dos', items: [{ socioId: 's2', nombre: 'Dos', propio: true, mesesImpagos: 1, deudaVencida: 10 }] },
      { profileId: 'p3', nombreDestinatario: 'Tres', items: [{ socioId: 's3', nombre: 'Tres', propio: true, mesesImpagos: 1, deudaVencida: 10 }] },
    ], { fetchImpl: fetchOk(llamadas), log: () => {} })
    assert.deepEqual(resumen, { destinatarios: 3, enviados: 1, sinToken: 2, fallidos: 0 })
    assert.equal(llamadas.flat().length, 2)
    const sellados = updates.filter((u) => u.tabla === 'socios').flatMap((u) => u.ids)
    assert.deepEqual(sellados, ['s1'])
  })

  clearInterval(vivo)
  console.log(`\n${casos} casos OK`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
