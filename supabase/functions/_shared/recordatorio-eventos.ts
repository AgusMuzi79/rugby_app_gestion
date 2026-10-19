// Recordatorios de eventos (push ~30 minutos antes de cada entrenamiento o actividad; Edge Function
// recordatorio-eventos, migración 20261026000000_recordatorio_eventos): agrupado, deduplicado y
// textos.
//
// Una misma sesión suele estar cargada una vez por división (p. ej. "Gimnasio 20:30" son 5 filas de
// eventos: M19, M20, M21, M22 y Mayores). Los eventos reclamados en una corrida se agrupan por sesión
// (fecha, hora, tipo, título, lugar) y cada profile recibe UN push por sesión, aunque esté en varias
// divisiones del grupo, aunque sea jugador y entrenador a la vez o tutor de varios jugadores. El
// cuerpo lista las divisiones del grupo que le tocan a ese profile.
//
// TypeScript puro, sin Deno ni base: lo importa la Edge Function y el check con tsx
// (recordatorio-eventos.check.ts).

import { type PushItem, hhmm } from './expoPush.ts'

/** Un evento reclamado por el RPC reclamar_recordatorios_eventos, con sus destinatarios. */
export interface EventoReclamado {
  evento_id: string
  tipo: 'entrenamiento' | 'actividad'
  titulo: string | null
  fecha: string
  /** 'HH:MM:SS' como llega de Postgres. */
  hora: string
  lugar: string | null
  division_id: string
  division_nombre: string
  /** Socios jugadores activos de la división que pasan la regla de la Agenda. */
  socio_ids: string[]
  /** Entrenadores activos con la división asignada. */
  entrenador_profile_ids: string[]
}

/** Un push a un profile por una sesión. */
export interface Recordatorio {
  sesion: string
  profileId: string
  title: string
  body: string
  /** Primer evento del grupo que le toca a este profile (para abrir desde la notificación). */
  eventoId: string
  divisionId: string
}

function textoNoVacio(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** "A", "A y B", "A, B y C". */
export function unirConY(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

/** Actividad: su título; entrenamiento: "Entrenamiento". Con lugar: " — <lugar>". */
export function tituloRecordatorio(e: EventoReclamado): string {
  const base = e.tipo === 'actividad' ? (textoNoVacio(e.titulo) ?? 'Actividad') : 'Entrenamiento'
  const lugar = textoNoVacio(e.lugar)
  return lugar ? `${base} — ${lugar}` : base
}

export function claveSesion(e: EventoReclamado): string {
  return JSON.stringify([e.fecha, hhmm(e.hora), e.tipo, textoNoVacio(e.titulo) ?? '', textoNoVacio(e.lugar) ?? ''])
}

/** Agrupa por sesión, en el orden de aparición. */
export function agruparPorSesion(eventos: EventoReclamado[]): EventoReclamado[][] {
  const grupos = new Map<string, EventoReclamado[]>()
  for (const e of eventos) {
    const k = claveSesion(e)
    const g = grupos.get(k)
    if (g) g.push(e)
    else grupos.set(k, [e])
  }
  return [...grupos.values()]
}

// Orden natural: M9 antes que M19, y "Mayores" después de las M.
const compararDivision = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })

/**
 * Un Recordatorio por (sesión, profile). `profilesPorSocio`: socio_id -> profiles que reciben por ese
 * socio (su propio profile y los de sus tutores); un socio ausente del mapa no genera push.
 */
export function planificarRecordatorios(
  eventos: EventoReclamado[],
  profilesPorSocio: Map<string, string[]>,
): Recordatorio[] {
  const plan: Recordatorio[] = []
  for (const grupo of agruparPorSesion(eventos)) {
    const sesion = claveSesion(grupo[0])
    const title = tituloRecordatorio(grupo[0])
    const hora = hhmm(grupo[0].hora)
    // profile -> eventos del grupo que le tocan, en orden de aparición y sin repetir.
    const porProfile = new Map<string, EventoReclamado[]>()
    const agregar = (profileId: string, e: EventoReclamado) => {
      const lista = porProfile.get(profileId) ?? []
      if (!lista.includes(e)) lista.push(e)
      porProfile.set(profileId, lista)
    }
    for (const e of grupo) {
      for (const socioId of e.socio_ids) {
        for (const profileId of profilesPorSocio.get(socioId) ?? []) agregar(profileId, e)
      }
      for (const profileId of e.entrenador_profile_ids) agregar(profileId, e)
    }
    for (const [profileId, propios] of porProfile) {
      const divisiones = [...new Set(propios.map((e) => e.division_nombre))].sort(compararDivision)
      plan.push({
        sesion,
        profileId,
        title,
        body: `Arranca a las ${hora} (${unirConY(divisiones)})`,
        eventoId: propios[0].evento_id,
        divisionId: propios[0].division_id,
      })
    }
  }
  return plan
}

/**
 * Mensajes de Expo: un mensaje por token, sin repetir un token dentro de la misma sesión (un
 * teléfono compartido por dos profiles recibe uno solo). La clave identifica al destinatario en la
 * sesión, así `enviarPush` cuenta pushes por persona y no por dispositivo.
 */
export function mensajesRecordatorios(plan: Recordatorio[], tokensPorProfile: Map<string, string[]>): PushItem[] {
  const items: PushItem[] = []
  const enviados = new Set<string>()
  for (const r of plan) {
    for (const to of tokensPorProfile.get(r.profileId) ?? []) {
      const k = `${r.sesion}#${to}`
      if (enviados.has(k)) continue
      enviados.add(k)
      items.push({
        clave: `${r.sesion}#${r.profileId}`,
        msg: {
          to,
          title: r.title,
          body: r.body,
          data: { type: 'recordatorio_evento', eventoId: r.eventoId, divisionId: r.divisionId },
          sound: 'default',
        },
      })
    }
  }
  return items
}

function listaDeTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
}

/** Valida la respuesta jsonb del RPC. Lanza si el formato no es el esperado. */
export function parsearReclamados(json: unknown): EventoReclamado[] {
  if (json === null || json === undefined) return []
  if (!Array.isArray(json)) throw new Error('reclamar_recordatorios_eventos: se esperaba un array')
  return json.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>
    const faltante = ['evento_id', 'tipo', 'fecha', 'hora', 'division_id', 'division_nombre']
      .find((k) => typeof r[k] !== 'string')
    if (faltante) throw new Error(`reclamar_recordatorios_eventos: fila ${i} sin '${faltante}'`)
    return {
      evento_id: r.evento_id as string,
      tipo: r.tipo as EventoReclamado['tipo'],
      titulo: (r.titulo as string | null | undefined) ?? null,
      fecha: r.fecha as string,
      hora: r.hora as string,
      lugar: (r.lugar as string | null | undefined) ?? null,
      division_id: r.division_id as string,
      division_nombre: r.division_nombre as string,
      socio_ids: listaDeTextos(r.socio_ids),
      entrenador_profile_ids: listaDeTextos(r.entrenador_profile_ids),
    }
  })
}
