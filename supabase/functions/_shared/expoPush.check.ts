// Verificación autocontenida de expoPush.ts (envío de push y textos de turnos fijos); no hay runner
// de tests en el repo ni Deno local. Desde la raíz del repo:
//   npx --yes tsx supabase/functions/_shared/expoPush.check.ts
// Sale con código distinto de 0 si algo falla. El fetch se inyecta, nunca sale a la red.

import assert from 'node:assert/strict'
import {
  EXPO_PUSH_CHUNK_SIZE,
  enviarPush,
  esTokenExpo,
  mensajeAviso,
  mensajeBaja,
  parsearTickets,
  trocear,
  type FetchLike,
  type PushItem,
} from './expoPush.ts'

let casos = 0
async function caso(nombre: string, fn: () => void | Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const silencio = () => {}
const TOKEN = 'ExponentPushToken[abc]'

function item(clave: string, to = TOKEN): PushItem {
  return { clave, msg: { to, title: 't', body: 'b' } }
}

function respuesta(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

// Fetch que contesta tickets 'ok' a todo, y registra los chunks que recibió.
function fetchOk(llamadas: unknown[][] = []): FetchLike {
  return async (_url, init) => {
    const msgs = JSON.parse(String(init?.body)) as unknown[]
    llamadas.push(msgs)
    return respuesta(200, { data: msgs.map(() => ({ status: 'ok', id: 'x' })) })
  }
}

async function main() {
  // AbortSignal.timeout usa un timer sin referencia en Node: sin esto el proceso termina en silencio
  // mientras un fetch simulado espera la señal.
  const vivo = setInterval(() => {}, 1000)

  await caso('esTokenExpo: sólo los prefijos de Expo', () => {
    assert.equal(esTokenExpo('ExponentPushToken[x]'), true)
    assert.equal(esTokenExpo('ExpoPushToken[x]'), true)
    assert.equal(esTokenExpo('fcm:abc'), false)
    assert.equal(esTokenExpo(''), false)
    assert.equal(esTokenExpo(null), false)
    assert.equal(esTokenExpo(42), false)
  })

  await caso('trocear: chunks de tamaño fijo y resto', () => {
    assert.deepEqual(trocear([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
    assert.deepEqual(trocear([], 3), [])
    assert.deepEqual(trocear([1, 2], 5), [[1, 2]])
    assert.throws(() => trocear([1], 0))
  })

  await caso('parsearTickets: un booleano por ticket, en orden', () => {
    assert.deepEqual(
      parsearTickets({ data: [{ status: 'ok' }, { status: 'error', message: 'DeviceNotRegistered' }, { status: 'ok' }] }, 3),
      [true, false, true],
    )
  })

  await caso('parsearTickets: cuerpos malformados devuelven null', () => {
    assert.equal(parsearTickets(null, 1), null)
    assert.equal(parsearTickets(undefined, 1), null)
    assert.equal(parsearTickets('hola', 1), null)
    assert.equal(parsearTickets({}, 1), null)
    assert.equal(parsearTickets({ data: {} }, 1), null)
    assert.equal(parsearTickets({ data: [{ status: 'ok' }] }, 2), null, 'cantidad distinta de la esperada')
    assert.deepEqual(parsearTickets({ data: [null, 'x', {}] }, 3), [false, false, false], 'tickets raros = no entregado')
  })

  await caso('enviarPush: 250 mensajes salen en chunks de 100/100/50', async () => {
    const llamadas: unknown[][] = []
    const items = Array.from({ length: 250 }, (_, i) => item(`k${i}`))
    const r = await enviarPush(items, { fetchImpl: fetchOk(llamadas), log: silencio })
    assert.equal(EXPO_PUSH_CHUNK_SIZE, 100)
    assert.deepEqual(llamadas.map((c) => c.length), [100, 100, 50])
    assert.equal(r.entregados.size, 250)
    assert.equal(r.fallidos, 0)
  })

  await caso('enviarPush: ticket de error deja esa clave como fallida, las demás entregadas', async () => {
    const f: FetchLike = async () => respuesta(200, { data: [{ status: 'ok' }, { status: 'error' }, { status: 'ok' }] })
    const r = await enviarPush([item('a'), item('b'), item('c')], { fetchImpl: f, log: silencio })
    assert.deepEqual([...r.entregados].sort(), ['a', 'c'])
    assert.equal(r.fallidos, 1)
  })

  await caso('enviarPush: una clave con varios dispositivos se entrega si al menos uno anda', async () => {
    const f: FetchLike = async () => respuesta(200, { data: [{ status: 'error' }, { status: 'ok' }, { status: 'error' }] })
    const r = await enviarPush(
      [item('a', 'ExponentPushToken[1]'), item('a', 'ExponentPushToken[2]'), item('b')],
      { fetchImpl: f, log: silencio },
    )
    assert.deepEqual([...r.entregados], ['a'])
    assert.equal(r.fallidos, 1, 'b falló; a cuenta una sola vez')
  })

  await caso('enviarPush: tokens sin prefijo de Expo no se envían y la clave queda fallida', async () => {
    const llamadas: unknown[][] = []
    const r = await enviarPush([item('a', 'fcm:basura'), item('b')], { fetchImpl: fetchOk(llamadas), log: silencio })
    assert.equal(llamadas.length, 1)
    assert.equal(llamadas[0].length, 1, 'sólo viaja el token válido')
    assert.deepEqual([...r.entregados], ['b'])
    assert.equal(r.fallidos, 1)
  })

  await caso('enviarPush: lista vacía no llama a Expo', async () => {
    let llamado = false
    const r = await enviarPush([], { fetchImpl: async () => { llamado = true; return respuesta(200, { data: [] }) }, log: silencio })
    assert.equal(llamado, false)
    assert.equal(r.entregados.size, 0)
    assert.equal(r.fallidos, 0)
  })

  await caso('enviarPush: status no 2xx = chunk no entregado', async () => {
    const r = await enviarPush([item('a'), item('b')], { fetchImpl: async () => respuesta(500, 'caído'), log: silencio })
    assert.equal(r.entregados.size, 0)
    assert.equal(r.fallidos, 2)
  })

  await caso('enviarPush: body malformado (no JSON, sin data, cantidad errónea) = no entregado', async () => {
    for (const body of ['<html>', { data: 'x' }, { data: [{ status: 'ok' }] }, null]) {
      const r = await enviarPush([item('a'), item('b')], { fetchImpl: async () => respuesta(200, body as never), log: silencio })
      assert.equal(r.entregados.size, 0, `body ${JSON.stringify(body)}`)
      assert.equal(r.fallidos, 2)
    }
  })

  await caso('enviarPush: error de red = no entregado, sin lanzar', async () => {
    const r = await enviarPush([item('a')], { fetchImpl: async () => { throw new Error('ECONNRESET') }, log: silencio })
    assert.equal(r.entregados.size, 0)
    assert.equal(r.fallidos, 1)
  })

  await caso('enviarPush: timeout (Expo colgado) se trata como no entregado y no frena a los otros chunks', async () => {
    let n = 0
    const colgado: FetchLike = (_url, init) => {
      n++
      if (n === 1) {
        // Primer chunk: nunca responde; sólo termina cuando salta la señal de timeout.
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('timeout')))
        })
      }
      return fetchOk()(_url, init)
    }
    const items = Array.from({ length: 3 }, (_, i) => item(`k${i}`))
    const t0 = Date.now()
    const r = await enviarPush(items, { fetchImpl: colgado, timeoutMs: 40, chunkSize: 2, log: silencio })
    assert.ok(Date.now() - t0 < 2000, 'no se queda esperando')
    assert.deepEqual([...r.entregados], ['k2'], 'el primer chunk (k0, k1) expiró; el segundo salió')
    assert.equal(r.fallidos, 2)
  })

  await caso('enviarPush: cada llamada lleva una señal de timeout', async () => {
    let señal: AbortSignal | null | undefined
    await enviarPush([item('a')], {
      fetchImpl: async (_u, init) => { señal = init?.signal; return respuesta(200, { data: [{ status: 'ok' }] }) },
      log: silencio,
    })
    assert.ok(señal, 'se pasó signal')
  })

  await caso('mensajeAviso: texto con racha, día plural y horario', () => {
    const m = mensajeAviso({ dia_semana: 1, hora_desde: '18:00:00', hora_hasta: '19:00:00', racha: 2, faltas_baja: 3 }, TOKEN, 'f1')
    assert.equal(m.title, 'Gimnasio: tu turno')
    assert.equal(
      m.body,
      'Faltaste a tus últimos 2 turnos de los lunes 18:00–19:00. Si faltás una vez más, se libera ese horario.',
    )
    assert.equal(m.to, TOKEN)
    assert.deepEqual(m.data, { type: 'gimnasio_turno_aviso', franja_id: 'f1' })
  })

  await caso('mensajeAviso: usa las faltas que restan hasta la baja y el singular', () => {
    const lejos = mensajeAviso({ dia_semana: 6, hora_desde: '09:00', hora_hasta: '10:30', racha: 2, faltas_baja: 5 }, TOKEN)
    assert.equal(
      lejos.body,
      'Faltaste a tus últimos 2 turnos de los sábados 09:00–10:30. Si faltás 3 veces más, se libera ese horario.',
    )
    const uno = mensajeAviso({ dia_semana: 7, hora_desde: '10:00', hora_hasta: '11:00', racha: 1, faltas_baja: 2 }, TOKEN)
    assert.match(uno.body, /^Faltaste a tu último turno de los domingos 10:00–11:00\. Si faltás una vez más/)
  })

  await caso('mensajeBaja: texto con la cantidad real de faltas', () => {
    const m = mensajeBaja({ dia_semana: 1, hora_desde: '18:00:00', hora_hasta: '19:00:00', racha: 3 }, TOKEN, 'f1')
    assert.equal(m.title, 'Gimnasio: se liberó tu horario')
    assert.equal(
      m.body,
      'Faltaste 3 veces seguidas a los lunes 18:00–19:00, así que liberamos ese horario. Podés volver a reservarlo cuando quieras.',
    )
    assert.deepEqual(m.data, { type: 'gimnasio_turno_baja', franja_id: 'f1' })
    const cuatro = mensajeBaja({ dia_semana: 3, hora_desde: '07:00', hora_hasta: '08:00', racha: 4 }, TOKEN)
    assert.match(cuatro.body, /^Faltaste 4 veces seguidas a los miércoles 07:00–08:00/)
  })

  clearInterval(vivo)
  console.log(`\n${casos} casos OK`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
