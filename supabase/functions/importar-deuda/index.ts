// Edge Function: importar-deuda
//
// Importador recurrente del reporte de cuentas corrientes NUVIX
// (RPT_Vencimientos) — alimenta el semáforo de morosidad (socios.semaforo).
// El pago no pasa por la app; NUVIX es la fuente de verdad, esto sólo la
// refleja. Ver openspec/changes/importador-deuda-nuvix/design.md.
//
// A diferencia de socios-pagos (--no-verify-jwt, pensada para webhooks/cron),
// esta función tiene verify_jwt ACTIVO — la invoca un humano autenticado
// desde el panel web de Secretaría.
//
// Callers permitidos: secretaria, admin.
//
// Flujo:
//   1. Verificar rol del caller
//   2. Leer el .xls del FormData, parsear con SheetJS (parseDeudaNuvix)
//   3. Si no reconcilia contra el Total General del propio archivo: abortar,
//      no tocar la base, devolver el detalle del desbalance
//   4. Resolver cod_cliente → socio_id vía socios.numero_socio (bulk)
//   5. Persistir todo + recalcular el semáforo en una sola transacción de
//      Postgres (RPC importar_deuda_nuvix, SECURITY DEFINER)
//   6. Devolver el resumen: comprobantes, personas, matcheados, sin match,
//      conteo por color

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { parseDeudaNuvix } from '../_shared/parse-deuda-nuvix.ts'
import { enviarEmail, emailTemplate } from '../_shared/email.ts'
// xlsx es un paquete CJS — Deno lo importa por default export (module.exports),
// mismo paquete y misma forma de leerlo que scripts/import-socios-masivo.mjs.
import XLSX from 'npm:xlsx@0.18.5'

const ROLES_PERMITIDOS = ['secretaria', 'admin']
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_PUSH_CHUNK_SIZE = 100

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonError(405, 'Método no permitido')

  // ─── Verificar JWT + rol ────────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return jsonError(401, 'Sin autorización')

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
  if (authErr || !caller) return jsonError(401, 'Token inválido')

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('rol')
    .eq('id', caller.id)
    .single()

  if (!callerProfile || !ROLES_PERMITIDOS.includes(callerProfile.rol)) {
    return jsonError(403, 'Sin permiso — sólo Secretaría o Admin pueden importar el reporte de deuda')
  }

  // ─── Leer el archivo del FormData ───────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonError(400, 'Body inválido — se espera FormData con el archivo en el campo "archivo"')
  }

  const archivo = formData.get('archivo')
  if (!(archivo instanceof File)) return jsonError(400, 'archivo es requerido')

  const bytes = new Uint8Array(await archivo.arrayBuffer())

  // deno-lint-ignore no-explicit-any
  let workbook: any
  try {
    workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
  } catch (e) {
    return jsonError(400, `No se pudo leer el archivo (¿es un .xls válido?): ${e instanceof Error ? e.message : String(e)}`)
  }

  const sheetNames: string[] = workbook.SheetNames ?? []
  const sheetName = sheetNames.find((n: string) => n.includes('RPT_Vencimientos')) ?? sheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : null
  if (!sheet) return jsonError(400, 'El archivo no tiene ninguna hoja legible')

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, cellDates: true, raw: true }) as unknown[][]

  // ─── Parsear + validar reconciliación ───────────────────────────────────────
  const parsed = parseDeudaNuvix(rows)

  if (!parsed.fechaCorte) {
    return jsonError(400, 'No se encontró la fila "Período Informado:" — no se pudo determinar la fecha de corte del archivo')
  }

  if (!parsed.reconcilia) {
    return jsonError(400,
      'El archivo no reconcilia: la suma de subtotales por cuenta no coincide con el Total General. ' +
      'No se importó nada. Detalle: ' + JSON.stringify(parsed.desbalance)
    )
  }

  // ─── Resolver cod_cliente → socio_id vía socios.numero_socio ────────────────
  const codClientesUnicos = [...new Set(parsed.comprobantes.map(c => c.cod_cliente))]

  const { data: sociosMatch, error: sociosErr } = await supabaseAdmin
    .from('socios')
    .select('id, numero_socio')
    .in('numero_socio', codClientesUnicos)

  if (sociosErr) return jsonError(500, `Error resolviendo socios: ${sociosErr.message}`)

  const socioIdPorCod = new Map<string, string>((sociosMatch ?? []).map(s => [s.numero_socio as string, s.id as string]))

  const comprobantesConSocio = parsed.comprobantes.map(c => ({
    ...c,
    socio_id: socioIdPorCod.get(c.cod_cliente) ?? null,
  }))

  const personas = codClientesUnicos.length
  const sociosMatcheados = new Set(comprobantesConSocio.filter(c => c.socio_id).map(c => c.cod_cliente)).size
  const sinMatch = personas - sociosMatcheados

  // ─── Persistir (transacción vía RPC) ────────────────────────────────────────
  const payload = {
    fecha_corte: parsed.fechaCorte,
    periodo_desde: parsed.periodoDesde,
    periodo_hasta: parsed.periodoHasta,
    archivo_nombre: archivo.name,
    total_vencido: parsed.totalGeneral?.vencido ?? 0,
    total_a_vencer: parsed.totalGeneral?.aVencer ?? 0,
    total_general: parsed.totalGeneral?.total ?? 0,
    // "Comprobantes" para el resumen no incluye las filas SALDO ANTERIOR
    // (no son un comprobante NUVIX real, son el arrastre de saldo previo al
    // período informado) — verificado contra el archivo de referencia:
    // 1792 filas de detalle - 53 SALDO ANTERIOR = 1739, el número que dio el club.
    comprobantes_count: comprobantesConSocio.filter(c => !c.es_saldo_anterior).length,
    personas,
    socios_matcheados: sociosMatcheados,
    sin_match: sinMatch,
    reconcilia: true,
    importado_por: caller.id,
    comprobantes: comprobantesConSocio,
  }

  const { data: resultado, error: rpcErr } = await supabaseAdmin.rpc('importar_deuda_nuvix', {
    p_payload: payload,
  })

  if (rpcErr) return jsonError(500, `Error al guardar la importación: ${rpcErr.message}`)

  // ─── Recordatorio de deuda (amarillo + rojo) ─────────────────────────────────
  // El semáforo ya quedó recalculado por la RPC de arriba — se arma la lista de
  // candidatos ahora (rápido, solo lecturas) y se despacha el push en
  // background para no demorar la respuesta al panel de Secretaría.
  // Decisión de Secretaría (2026-08-26): los mails transaccionales de pagos
  // los maneja NUVIX — los recordatorios de la app van por push, no por mail.
  // enviarRecordatoriosDeuda() (mail) queda escrita sin llamarse, por si el
  // club migra a un plan de Resend que soporte el volumen más adelante.
  const recordatorios = await construirRecordatoriosDeuda()
  EdgeRuntime.waitUntil(enviarPushRecordatoriosDeuda(recordatorios))

  return jsonOk({
    importacion_id: resultado?.importacion_id ?? null,
    comprobantes: payload.comprobantes_count,
    personas,
    socios_matcheados: sociosMatcheados,
    sin_match: sinMatch,
    verde: resultado?.verde ?? 0,
    amarillo: resultado?.amarillo ?? 0,
    rojo: resultado?.rojo ?? 0,
    exento: resultado?.exento ?? 0,
    recordatorios_deuda: recordatorios.length,
  })
})

// ─── Recordatorio de deuda por mail ──────────────────────────────────────────
//
// Se dispara en cada import (no en un cron aparte) — a quien tenga semáforo
// amarillo/rojo después de recalcular, salvo que ya se le haya mandado el
// recordatorio hace menos de CADENCIA_DIAS (columna socios.recordatorio_deuda_enviado_at,
// migración 20260819000000) — evita duplicar si secretaría reimporta el
// archivo varias veces en el mismo período. Un menor de edad nunca recibe el
// mail a su propio nombre: la deuda se le atribuye al titular de su grupo
// familiar (mismo criterio que la app, ver migración 20260813000000_titular_ve_deuda_menores.sql).
// Si el menor no tiene titular resuelto, se omite (no hay fallback mandándoselo a él).

const CADENCIA_DIAS = 15

type ItemDeuda = { socioId: string; nombre: string; propio: boolean; mesesImpagos: number; deudaVencida: number }
type RecordatorioDeuda = { profileId: string; nombreDestinatario: string; items: ItemDeuda[] }

function esMenorDeEdad(fechaNacimiento: string | null): boolean {
  if (!fechaNacimiento) return false
  const hace18 = new Date()
  hace18.setFullYear(hace18.getFullYear() - 18)
  return new Date(fechaNacimiento) > hace18
}

function dentroDeCadencia(enviadoAt: string | null): boolean {
  if (!enviadoAt) return false
  const limite = new Date()
  limite.setDate(limite.getDate() - CADENCIA_DIAS)
  return new Date(enviadoAt) > limite
}

async function construirRecordatoriosDeuda(): Promise<RecordatorioDeuda[]> {
  const { data: deudoresRaw } = await supabaseAdmin
    .from('socios')
    .select('id, profile_id, cabecera_id, fecha_nacimiento, meses_impagos, deuda_vencida, recordatorio_deuda_enviado_at, profiles!socios_profile_id_fkey(nombre)')
    .in('estado', ['activo', 'pendiente'])
    .in('semaforo', ['amarillo', 'rojo'])

  // Cadencia: si a este socio puntual ya se le mandó el recordatorio hace
  // menos de CADENCIA_DIAS, no vuelve a entrar aunque siga en mora — evita
  // duplicar si secretaría reimporta el archivo varias veces en el medio.
  const deudores = (deudoresRaw ?? []).filter((d) => !dentroDeCadencia(d.recordatorio_deuda_enviado_at as string | null))
  if (deudores.length === 0) return []

  const cabeceraIds = [...new Set(
    deudores
      .filter((d) => esMenorDeEdad(d.fecha_nacimiento as string | null) && d.cabecera_id)
      .map((d) => d.cabecera_id as string)
  )]

  const titulares = new Map<string, { profileId: string; nombre: string }>()
  if (cabeceraIds.length > 0) {
    const { data: titularesData } = await supabaseAdmin
      .from('socios')
      .select('id, profile_id, profiles!socios_profile_id_fkey(nombre)')
      .in('id', cabeceraIds)
    for (const t of titularesData ?? []) {
      const perfil = t.profiles as { nombre: string } | null
      titulares.set(t.id as string, { profileId: t.profile_id as string, nombre: perfil?.nombre ?? 'Titular' })
    }
  }

  const porDestinatario = new Map<string, RecordatorioDeuda>()

  for (const d of deudores) {
    const menor  = esMenorDeEdad(d.fecha_nacimiento as string | null)
    const perfil = d.profiles as { nombre: string } | null
    const nombre = perfil?.nombre ?? 'Socio'

    let profileId: string | null
    let nombreDestinatario: string

    if (menor) {
      const titular = d.cabecera_id ? titulares.get(d.cabecera_id as string) : undefined
      if (!titular) continue
      profileId = titular.profileId
      nombreDestinatario = titular.nombre
    } else {
      profileId = d.profile_id as string | null
      nombreDestinatario = nombre
    }
    if (!profileId) continue

    if (!porDestinatario.has(profileId)) {
      porDestinatario.set(profileId, { profileId, nombreDestinatario, items: [] })
    }
    porDestinatario.get(profileId)!.items.push({
      socioId:      d.id as string,
      nombre,
      propio:       !menor,
      mesesImpagos: (d.meses_impagos as number) ?? 0,
      deudaVencida: Number(d.deuda_vencida) || 0,
    })
  }

  return [...porDestinatario.values()]
}

// ─── Recordatorio de deuda por push ──────────────────────────────────────────
//
// Reemplaza a enviarRecordatoriosDeuda() (mail, abajo) desde 2026-08-26 — ver
// project-recordatorios-solo-push en memoria. Misma lista de destinatarios
// (construirRecordatoriosDeuda) y misma cadencia (recordatorio_deuda_enviado_at),
// sólo cambia el canal.

async function fetchPushTokensPorProfile(profileIds: string[]): Promise<Map<string, string[]>> {
  const porProfile = new Map<string, string[]>()
  for (let i = 0; i < profileIds.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = profileIds.slice(i, i + EXPO_PUSH_CHUNK_SIZE)
    const { data, error } = await supabaseAdmin.from('push_tokens').select('usuario_id, token').in('usuario_id', chunk)
    if (error) { console.error('Error trayendo push_tokens:', error.message); continue }
    for (const row of data ?? []) {
      const usuarioId = row.usuario_id as string
      const arr = porProfile.get(usuarioId) ?? []
      arr.push(row.token as string)
      porProfile.set(usuarioId, arr)
    }
  }
  return porProfile
}

type ExpoPushMessage = { to: string; title: string; body: string; sound: string; data: Record<string, unknown> }

async function enviarExpoPushBatch(messages: ExpoPushMessage[]): Promise<boolean> {
  let ok = true
  for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + EXPO_PUSH_CHUNK_SIZE)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(chunk),
      })
      if (!res.ok) { ok = false; console.error('Expo push falló:', res.status, await res.text()) }
    } catch (e) {
      ok = false
      console.error('Error enviando push:', e)
    }
  }
  return ok
}

async function enviarPushRecordatoriosDeuda(recordatorios: RecordatorioDeuda[]): Promise<void> {
  if (recordatorios.length === 0) return

  const tokensPorProfile = await fetchPushTokensPorProfile(recordatorios.map((r) => r.profileId))

  let enviados = 0, omitidosSinToken = 0, errores = 0

  for (const r of recordatorios) {
    const tokens = (tokensPorProfile.get(r.profileId) ?? [])
      .filter((t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))
    if (tokens.length === 0) { omitidosSinToken++; continue }

    const montoTotal    = r.items.reduce((acc, it) => acc + it.deudaVencida, 0)
    const periodosTotal = r.items.reduce((acc, it) => acc + it.mesesImpagos, 0)
    const body = `Tenés ${periodosTotal} período${periodosTotal === 1 ? '' : 's'} pendiente${periodosTotal === 1 ? '' : 's'} `
      + `por $${montoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}. Revisá el detalle en Cuotas.`

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to, title: 'Cuotas pendientes', body, sound: 'default', data: { type: 'recordatorio_deuda' },
    }))

    const ok = await enviarExpoPushBatch(messages)

    if (ok) {
      enviados++
      const socioIds = r.items.map((it) => it.socioId)
      await supabaseAdmin
        .from('socios')
        .update({ recordatorio_deuda_enviado_at: new Date().toISOString() })
        .in('id', socioIds)
    } else {
      errores++
    }
  }

  console.log(`Recordatorios de deuda (push): ${enviados} enviados, ${omitidosSinToken} omitidos (sin token), ${errores} con error, de ${recordatorios.length} destinatarios.`)
}

// ─── Recordatorio de deuda por mail (deshabilitado, ver arriba) ─────────────

async function enviarRecordatoriosDeuda(recordatorios: RecordatorioDeuda[], fechaCorte: string): Promise<void> {
  if (recordatorios.length === 0) return
  const fechaCorteLabel = new Date(fechaCorte).toLocaleDateString('es-AR')

  let enviados = 0, omitidosSinMail = 0, errores = 0

  for (const r of recordatorios) {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(r.profileId)
    const email = user?.email ?? ''
    if (!email || email.endsWith('@uncas.local')) { omitidosSinMail++; continue }

    const filas = r.items.map((it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${it.propio ? 'Vos' : it.nombre}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${it.mesesImpagos} período${it.mesesImpagos === 1 ? '' : 's'}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">$${it.deudaVencida.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join('')

    const html = emailTemplate(`
      <p style="font-size:15px">Hola ${r.nombreDestinatario},</p>
      <p style="font-size:15px;line-height:1.6">Según los registros del club, a la fecha tenés cuotas pendientes:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #15110A">Socio</th>
            <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #15110A">Adeudado</th>
            <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #15110A">Monto</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <p style="font-size:13px;color:#888">Datos al ${fechaCorteLabel}. Si ya pagaste, puede no estar reflejado todavía.</p>
      <p style="font-size:15px;line-height:1.6">Podés ver el detalle y cómo regularizar desde la sección de Cuotas en la app.</p>
    `)

    const ok = await enviarEmail({ to: email, subject: 'Recordatorio de cuotas pendientes — UNCAS Rugby Club', html })

    if (ok) {
      enviados++
      const socioIds = r.items.map((it) => it.socioId)
      await supabaseAdmin
        .from('socios')
        .update({ recordatorio_deuda_enviado_at: new Date().toISOString() })
        .in('id', socioIds)
    } else {
      errores++
    }
  }

  console.log(`Recordatorios de deuda: ${enviados} enviados, ${omitidosSinMail} omitidos (sin mail válido), ${errores} con error de envío, de ${recordatorios.length} destinatarios.`)
}
