// Parser + diff del "Padrón de Servicios por Socio/Frecuencia" de NUVIX
// (RPT_Servicios_Frecuencias, export Crystal Reports con bandas).
//
// Lo usa la Edge Function importar-servicios. Módulo puro: sin Deno ni imports
// npm:, para poder verificarlo con `npx --yes tsx parse-padron-servicios.check.ts`.
//
// Forma del archivo (sheet_to_json con header:1):
//   - Encabezado: fecha (serial numérico o texto), "CLUB UNCAS", título, fila "Código | Razón Social".
//   - Cada servicio abre una banda con ["Servicio:", "<concepto>"], seguida de
//     ["Frecuencia:", "01 - MENSUAL"] (sub-banda, se ignora), filas de socios
//     [código numérico, razón social] y un pie ["Casos:", n].
//   Sólo cuentan las filas con código numérico DENTRO de una banda — la fila de
//   fecha del encabezado también tiene un número en la columna 0.
//
// Semántica de espejo (decisión 2026-10-05, odd/tasks/import-servicios-panel.md):
// para cada servicio mapeado, `socio_servicios` queda igual al archivo — se
// agrega lo que falta, se actualiza importe/variante distintos y se borra lo que
// no figura, incluidas las filas cargadas a mano (variante_nuvix null). Los
// servicios no mapeados nunca se tocan.

// ─── Mapeo ──────────────────────────────────────────────────────────────────

export interface DestinoConcepto {
  /** Nombre del servicio en servicios_opcionales al que va el vínculo. */
  servicio: string
  /** Fila del catálogo de la que se toma el importe (monto_mensual). */
  catalogoPrecio: string
}

// Clave: concepto normalizado (ver normalizarConcepto).
export const MAPEO_CONCEPTOS: Record<string, DestinoConcepto> = {
  'GYM MAYOR':              { servicio: 'Gimnasio',         catalogoPrecio: 'Gimnasio' },
  'GYM MENOR':              { servicio: 'Gimnasio',         catalogoPrecio: 'Gimnasio Menor' },
  'GYM BECADO':             { servicio: 'Gimnasio',         catalogoPrecio: 'Gimnasio Becado' },
  'RUGBY CUOTA DEPORTIVA':  { servicio: 'Rugby',            catalogoPrecio: 'Rugby' },
  'HOCKEY CUOTA DEPORTIVA': { servicio: 'Hockey',           catalogoPrecio: 'Hockey' },
  'CARNET TENIS':           { servicio: 'Carnet Tenis',     catalogoPrecio: 'Carnet Tenis' },
  'RUGBY INCLUSIVO':        { servicio: 'Rugby Inclusivo',  catalogoPrecio: 'Rugby Inclusivo' },
  'HOCKEY INCLUSIVO':       { servicio: 'Hockey Inclusivo', catalogoPrecio: 'Hockey Inclusivo' },
}

// Conceptos del padrón que no son vínculos en socio_servicios (cuotas de
// categoría, Cliente Gimnasio — se identifica por categoría —, Alícuota).
export const CONCEPTOS_IGNORADOS = new Set<string>([
  'CUOTA ACTIVO MAYOR',
  'CUOTA ACTIVO MENOR',
  'CUOTA DEPENDIENTE GRUPO FAMILIAR',
  'CUOTA TITULARES GRUPO',
  'ACTIVO UNQUITAS',
  'CLIENTE GYM',
  'GYM ALICUOTA',
])

/** Servicios del catálogo que el importador espeja. El resto nunca se toca. */
export const SERVICIOS_MAPEADOS = new Set<string>(Object.values(MAPEO_CONCEPTOS).map((d) => d.servicio))

/** Catálogo de precios que hace falta resolver (servicio + variantes de precio). */
export const NOMBRES_CATALOGO = new Set<string>(
  Object.values(MAPEO_CONCEPTOS).flatMap((d) => [d.servicio, d.catalogoPrecio]),
)

export function normalizarConcepto(concepto: string): string {
  return concepto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function claveVinculo(numeroSocio: string, servicio: string): string {
  return `${numeroSocio}|${servicio}`
}

// ─── Parser ─────────────────────────────────────────────────────────────────

export interface FilaPadronServicio {
  numeroSocio: string
  nombre:      string
  /** Texto original del concepto (sin espacios en los extremos), se guarda como variante_nuvix. */
  concepto:    string
}

export interface PadronServicios {
  filas:     FilaPadronServicio[]
  /** Conceptos de las bandas en el orden del archivo (texto original). */
  conceptos: string[]
}

function celda(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}

export function parsePadronServicios(rows: unknown[][]): PadronServicios {
  const filas: FilaPadronServicio[] = []
  const conceptos: string[] = []
  const vistos = new Set<string>()
  let concepto: string | null = null

  for (const r of rows) {
    if (!Array.isArray(r)) continue
    const c0 = celda(r[0])

    if (c0 === 'Servicio:') {
      concepto = celda(r[1]) || null
      if (concepto) conceptos.push(concepto)
      continue
    }
    if (!concepto) continue
    if (!/^\d+$/.test(c0)) continue // Frecuencia:, Casos:, vacías

    // Un mismo socio repetido en la misma banda (p. ej. dos frecuencias) cuenta una vez.
    const k = `${c0}|${normalizarConcepto(concepto)}`
    if (vistos.has(k)) continue
    vistos.add(k)
    filas.push({ numeroSocio: c0, nombre: celda(r[1]), concepto })
  }

  return { filas, conceptos }
}

// ─── Diff ───────────────────────────────────────────────────────────────────

export interface SocioRef {
  id:              string
  nombre:          string
  excluirDeImport: boolean
}

export interface VinculoActual {
  id:            string
  numeroSocio:   string
  /** Nombre del servicio en el catálogo. */
  servicio:      string
  /** numeric de Postgres: puede llegar como número o como texto ("25000.00"). */
  importe:       number | string | null
  varianteNuvix: string | null
}

export interface DiffAgregado {
  numeroSocio:   string
  nombre:        string
  socioId:       string
  servicio:      string
  importe:       number
  varianteNuvix: string
}

export interface DiffActualizado extends DiffAgregado {
  vinculoId:        string
  importeAnterior:  number | null
  varianteAnterior: string | null
}

export interface DiffEliminado {
  numeroSocio:   string
  nombre:        string
  vinculoId:     string
  servicio:      string
  importe:       number | null
  varianteNuvix: string | null
}

export interface DiffConflicto {
  numeroSocio: string
  nombre:      string
  servicio:    string
  conceptos:   string[]
}

export interface DiffSinMatch {
  numeroSocio: string
  nombre:      string
  conceptos:   string[]
}

export interface DiffConceptoDesconocido {
  concepto: string
  casos:    number
}

export interface DiffError {
  numeroSocio: string
  nombre:      string
  servicio:    string
  motivo:      string
}

export interface DiffServicios {
  agregados:             DiffAgregado[]
  actualizados:          DiffActualizado[]
  eliminados:            DiffEliminado[]
  sinCambio:             number
  conflictos:            DiffConflicto[]
  sinMatch:              DiffSinMatch[]
  conceptosDesconocidos: DiffConceptoDesconocido[]
  errores:               DiffError[]
}

export interface EntradaDiff {
  padron:   PadronServicios
  /** Socios de la base por numero_socio (incluye los excluidos, marcados). */
  socios:   Map<string, SocioRef>
  /** monto_mensual por nombre del catálogo. */
  precios:  Map<string, number>
  /** Vínculos actuales; los de servicios no mapeados se ignoran. */
  vinculos: VinculoActual[]
}

function aNumero(v: number | string | null): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function calcularDiffServicios({ padron, socios, precios, vinculos }: EntradaDiff): DiffServicios {
  const diff: DiffServicios = {
    agregados: [], actualizados: [], eliminados: [], sinCambio: 0,
    conflictos: [], sinMatch: [], conceptosDesconocidos: [], errores: [],
  }

  // Conceptos desconocidos (ni mapeados ni ignorados) — se reportan, nunca se aplican.
  const desconocidos = new Map<string, number>()
  for (const f of padron.filas) {
    const n = normalizarConcepto(f.concepto)
    if (MAPEO_CONCEPTOS[n] || CONCEPTOS_IGNORADOS.has(n)) continue
    desconocidos.set(f.concepto, (desconocidos.get(f.concepto) ?? 0) + 1)
  }
  for (const c of padron.conceptos) {
    const n = normalizarConcepto(c)
    if (!MAPEO_CONCEPTOS[n] && !CONCEPTOS_IGNORADOS.has(n) && !desconocidos.has(c)) desconocidos.set(c, 0)
  }
  diff.conceptosDesconocidos = [...desconocidos].map(([concepto, casos]) => ({ concepto, casos }))

  // Deseado (archivo): clave socio|servicio → filas. Más de una = conflicto de variantes.
  const deseadoMulti = new Map<string, FilaPadronServicio[]>()
  const sinMatch = new Map<string, DiffSinMatch>()
  for (const f of padron.filas) {
    const destino = MAPEO_CONCEPTOS[normalizarConcepto(f.concepto)]
    if (!destino) continue
    const socio = socios.get(f.numeroSocio)
    if (!socio) {
      const sm = sinMatch.get(f.numeroSocio) ?? { numeroSocio: f.numeroSocio, nombre: f.nombre, conceptos: [] }
      sm.conceptos.push(f.concepto)
      sinMatch.set(f.numeroSocio, sm)
      continue
    }
    if (socio.excluirDeImport) continue
    const k = claveVinculo(f.numeroSocio, destino.servicio)
    const lista = deseadoMulti.get(k) ?? []
    lista.push(f)
    deseadoMulti.set(k, lista)
  }
  diff.sinMatch = [...sinMatch.values()]

  const deseado = new Map<string, FilaPadronServicio>()
  const enConflicto = new Set<string>()
  for (const [k, filas] of deseadoMulti) {
    const servicio = MAPEO_CONCEPTOS[normalizarConcepto(filas[0].concepto)].servicio
    if (filas.length > 1) {
      enConflicto.add(k)
      diff.conflictos.push({
        numeroSocio: filas[0].numeroSocio,
        nombre:      socios.get(filas[0].numeroSocio)?.nombre || filas[0].nombre,
        servicio,
        conceptos:   filas.map((f) => f.concepto),
      })
      continue
    }
    deseado.set(k, filas[0])
  }

  // Actual (base): sólo servicios mapeados y socios no excluidos.
  const actual = new Map<string, VinculoActual>()
  for (const v of vinculos) {
    if (!SERVICIOS_MAPEADOS.has(v.servicio)) continue
    const socio = socios.get(v.numeroSocio)
    if (!socio || socio.excluirDeImport) continue
    actual.set(claveVinculo(v.numeroSocio, v.servicio), v)
  }

  // Altas / actualizaciones / sin cambio
  for (const [k, f] of deseado) {
    const destino = MAPEO_CONCEPTOS[normalizarConcepto(f.concepto)]
    const socio = socios.get(f.numeroSocio)!
    const nombre = socio.nombre || f.nombre
    const importe = precios.get(destino.catalogoPrecio)
    if (importe === undefined) {
      diff.errores.push({
        numeroSocio: f.numeroSocio, nombre, servicio: destino.servicio,
        motivo: `sin precio en el catálogo para "${destino.catalogoPrecio}"`,
      })
      continue
    }

    const existente = actual.get(k)
    const base: DiffAgregado = {
      numeroSocio: f.numeroSocio, nombre, socioId: socio.id,
      servicio: destino.servicio, importe, varianteNuvix: f.concepto,
    }
    if (!existente) {
      diff.agregados.push(base)
      continue
    }
    const importeAnterior = aNumero(existente.importe)
    if (importeAnterior !== importe || existente.varianteNuvix !== f.concepto) {
      diff.actualizados.push({
        ...base, vinculoId: existente.id, importeAnterior, varianteAnterior: existente.varianteNuvix,
      })
    } else {
      diff.sinCambio++
    }
  }

  // Bajas: vínculos mapeados que el archivo no trae (manuales incluidos). Los
  // conflictos quedan como están. Un vínculo que el archivo trae pero cuyo
  // precio falló sigue en `deseado`, así que tampoco se borra.
  for (const [k, v] of actual) {
    if (deseado.has(k) || enConflicto.has(k)) continue
    diff.eliminados.push({
      numeroSocio:   v.numeroSocio,
      nombre:        socios.get(v.numeroSocio)?.nombre ?? '',
      vinculoId:     v.id,
      servicio:      v.servicio,
      importe:       aNumero(v.importe),
      varianteNuvix: v.varianteNuvix,
    })
  }

  return diff
}

/**
 * Quita del diff las bajas que Secretaría destildó en la vista previa
 * (claves `${numeroSocio}|${servicio}`). Las claves que no corresponden a
 * ninguna baja se ignoran.
 */
export function omitirBajas(diff: DiffServicios, claves: Set<string>): { diff: DiffServicios; omitidos: number } {
  const eliminados = diff.eliminados.filter((e) => !claves.has(claveVinculo(e.numeroSocio, e.servicio)))
  return { diff: { ...diff, eliminados }, omitidos: diff.eliminados.length - eliminados.length }
}
