// Lectura del calendario del gimnasio pegado desde Excel / Google Sheets (separado por tabulaciones)
// o subido como CSV. Módulo puro: sin dependencias ni DOM, así se puede probar con node
// (ver calendarioImport.check.ts).
//
// Columnas, en este orden: Día | Desde | Hasta | Cupo | Profesor (opcional). La primera fila puede
// ser el encabezado (se detecta cuando la primera celda es "Día").
//   · Día: un día ('Lun', 'lunes', 'Miércoles', 'mie', 'Sáb', '1'..'7'), un rango ('Lun-Vie',
//     'Lunes a Viernes') o una lista ('Lun, Mié, Vie', 'Lun y Mié', 'Lun/Mié'). Sin distinguir
//     mayúsculas ni tildes. Se expande a una fila por día.
//   · Desde / Hasta: 'H', 'H:MM', 'HH:MM', 'HH:MM:SS', 'HH.MM', con 'h' o 'hs' opcional ('7hs').
//   · Cupo: entero de 1 a 500.   · Profesor: texto libre (máx. 80); vacío = sin profesor.
// Día de la semana ISO: 1 = lunes … 7 = domingo.

export interface FilaCalendario {
  dia_semana: number
  hora_desde: string // HH:MM
  hora_hasta: string // HH:MM
  cupo: number
  profesor: string | null
  /** Línea del texto de origen (1-based) de la que salió esta fila; sirve para mapear errores. */
  linea: number
}

export interface ErrorCalendario {
  /** Línea del texto de origen (1-based); 0 si el error no es de una línea puntual. */
  linea: number
  motivo: string
}

export interface ResultadoCalendario {
  filas: FilaCalendario[]
  errores: ErrorCalendario[]
}

export const MAX_FILAS_IMPORTACION = 300
export const CUPO_MAXIMO = 500
export const PROFESOR_MAXIMO = 80

// ─── Plantilla descargable ────────────────────────────────────────────────────

// ';' porque es lo que Excel en español abre en columnas; BOM para que respete los acentos.
export const PLANTILLA_CSV =
  '﻿' +
  [
    'Día;Desde;Hasta;Cupo;Profesor',
    'Lun-Vie;07:00;08:30;25;Ana Pérez',
    'Lun, Mié, Vie;18:00;19:30;30;Luis Gómez / Marta Díaz',
    'Sáb;09:00;11:00;15;',
  ].join('\r\n') +
  '\r\n'

// ─── Texto -> registros ───────────────────────────────────────────────────────

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizar(s: string): string {
  return sinTildes(s).toLowerCase().trim()
}

// Delimitador: tabulación (pegado desde planillas), si no ';' (CSV de Excel en español), si no ','.
// Se decide con la primera línea que tenga contenido (no sólo separadores) y se cuentan sólo los
// caracteres fuera de comillas.
function detectarDelimitador(completo: string): string {
  const texto = completo.split(/\n/).find((l) => /[^\s;,]/.test(l)) ?? completo
  let tabs = 0
  let puntoYComa = 0
  let comas = 0
  let enComillas = false
  for (const c of texto) {
    if (c === '"') enComillas = !enComillas
    else if (!enComillas) {
      if (c === '\t') tabs++
      else if (c === ';') puntoYComa++
      else if (c === ',') comas++
    }
  }
  if (tabs > 0) return '\t'
  if (puntoYComa > 0) return ';'
  if (comas > 0) return ','
  return '\t'
}

interface Registro {
  celdas: string[]
  linea: number
}

// Lector de CSV con comillas ("" escapa una comilla; las comillas pueden contener el delimitador
// y saltos de línea). `linea` es la línea física donde empieza cada registro.
function leerRegistros(texto: string, delim: string): { registros: Registro[]; comillaSinCerrar: number | null } {
  const registros: Registro[] = []
  let celdas: string[] = []
  let campo = ''
  let enComillas = false
  let linea = 1
  let lineaInicio = 1
  let lineaComilla = 0

  const cerrarRegistro = () => {
    celdas.push(campo)
    registros.push({ celdas, linea: lineaInicio })
    celdas = []
    campo = ''
  }

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else enComillas = false
      } else {
        campo += c
        if (c === '\n') linea++
      }
    } else if (c === '"' && campo.trim() === '') {
      enComillas = true
      lineaComilla = linea
      campo = ''
    } else if (c === delim) {
      celdas.push(campo)
      campo = ''
    } else if (c === '\n') {
      cerrarRegistro()
      linea++
      lineaInicio = linea
    } else {
      campo += c
    }
  }
  if (campo !== '' || celdas.length > 0) cerrarRegistro()

  return { registros, comillaSinCerrar: enComillas ? lineaComilla : null }
}

// ─── Días ─────────────────────────────────────────────────────────────────────

const DIAS = new Map<string, number>([
  ['lun', 1], ['lunes', 1], ['1', 1],
  ['mar', 2], ['martes', 2], ['2', 2],
  ['mie', 3], ['mier', 3], ['miercoles', 3], ['3', 3],
  ['jue', 4], ['jueves', 4], ['4', 4],
  ['vie', 5], ['viernes', 5], ['5', 5],
  ['sab', 6], ['sabado', 6], ['6', 6],
  ['dom', 7], ['domingo', 7], ['7', 7],
])

function diaDe(token: string): number | undefined {
  return DIAS.get(normalizar(token).replace(/\.$/, ''))
}

const RANGO_RE = /^(.+?)\s*(?:[-–—]|\s+a\s+|\s+al\s+)\s*(.+)$/i

function leerDias(celda: string): { dias: number[] } | { error: string } {
  const crudo = celda.trim()
  if (crudo === '') return { error: 'falta el día' }

  const dias: number[] = []
  const partes = crudo.split(/\s+y\s+|[,;/]/i).map((p) => p.trim()).filter((p) => p !== '')
  if (partes.length === 0) return { error: 'falta el día' }

  for (const parte of partes) {
    const unico = diaDe(parte)
    if (unico !== undefined) {
      dias.push(unico)
      continue
    }
    const rango = RANGO_RE.exec(parte)
    if (rango) {
      const desde = diaDe(rango[1])
      const hasta = diaDe(rango[2])
      if (desde === undefined) return { error: `el día "${rango[1].trim()}" no se reconoce` }
      if (hasta === undefined) return { error: `el día "${rango[2].trim()}" no se reconoce` }
      if (desde > hasta) {
        return { error: `el rango "${parte}" está al revés (el segundo día tiene que ser posterior al primero)` }
      }
      for (let d = desde; d <= hasta; d++) dias.push(d)
      continue
    }
    return { error: `el día "${parte}" no se reconoce` }
  }
  return { dias: [...new Set(dias)].sort((a, b) => a - b) }
}

// ─── Horas, cupo, profesor ────────────────────────────────────────────────────

const HORA_RE = /^(\d{1,2})(?:[:.](\d{2}))?(?:[:.](\d{2}))?$/

// 'H', 'H:MM', 'HH:MM', 'HH:MM:SS', 'HH.MM' y sufijo 'h'/'hs'/'hrs' -> 'HH:MM', o null si no sirve.
function leerHora(celda: string): string | null {
  const t = celda.trim().toLowerCase().replace(/\s*(hrs|hs|h)\.?$/, '').replace(/\s+/g, '')
  const m = HORA_RE.exec(t)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] === undefined ? 0 : Number(m[2])
  const seg = m[3] === undefined ? 0 : Number(m[3])
  if (h > 23 || min > 59 || seg > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// ─── Entrada principal ────────────────────────────────────────────────────────

export function parseCalendario(texto: string): ResultadoCalendario {
  const filas: FilaCalendario[] = []
  const errores: ErrorCalendario[] = []

  const limpio = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const delim = detectarDelimitador(limpio)
  const { registros, comillaSinCerrar } = leerRegistros(limpio, delim)

  let primero = true
  for (const reg of registros) {
    const celdas = reg.celdas.map((c) => c.trim())
    if (celdas.every((c) => c === '')) continue // línea en blanco

    // Encabezado opcional: la primera celda no vacía de la primera fila es "Día".
    if (primero) {
      primero = false
      const cabecera = normalizar(celdas[0])
      if (cabecera === 'dia' || cabecera === 'dias') continue
    }

    const prefijo = `Fila ${reg.linea}:`
    const falla = (motivo: string) => errores.push({ linea: reg.linea, motivo: `${prefijo} ${motivo}` })

    // Las celdas vacías sobrantes al final (comas de más al exportar) no cuentan.
    let ultima = celdas.length
    while (ultima > 0 && celdas[ultima - 1] === '') ultima--
    if (celdas.length < 4) {
      falla('faltan columnas (se esperan Día, Desde, Hasta, Cupo y, si querés, Profesor)')
      continue
    }
    if (ultima > 5) {
      falla('hay columnas de más (se esperan Día, Desde, Hasta, Cupo y Profesor)')
      continue
    }

    const [celdaDia, celdaDesde, celdaHasta, celdaCupo, celdaProfesor = ''] = celdas
    let ok = true

    const dias = leerDias(celdaDia ?? '')
    if ('error' in dias) { ok = false; falla(dias.error) }

    const desde = leerHora(celdaDesde ?? '')
    if (desde === null) {
      ok = false
      falla(`la hora de inicio "${celdaDesde ?? ''}" no es válida (usá HH:MM, por ejemplo 07:30)`)
    }
    const hasta = leerHora(celdaHasta ?? '')
    if (hasta === null) {
      ok = false
      falla(`la hora de fin "${celdaHasta ?? ''}" no es válida (usá HH:MM, por ejemplo 08:30)`)
    }
    if (desde !== null && hasta !== null && hasta <= desde) {
      ok = false
      falla(`la hora de fin (${hasta}) tiene que ser posterior a la de inicio (${desde})`)
    }

    let cupo = 0
    if (/^\d+$/.test(celdaCupo ?? '') && Number(celdaCupo) >= 1 && Number(celdaCupo) <= CUPO_MAXIMO) {
      cupo = Number(celdaCupo)
    } else {
      ok = false
      falla(`el cupo "${celdaCupo ?? ''}" no es válido (tiene que ser un número entero de 1 a ${CUPO_MAXIMO})`)
    }

    const profesor = celdaProfesor === '' ? null : celdaProfesor
    if (profesor !== null && profesor.length > PROFESOR_MAXIMO) {
      ok = false
      falla(`el profesor no puede superar ${PROFESOR_MAXIMO} caracteres`)
    }

    if (ok && !('error' in dias) && desde !== null && hasta !== null) {
      for (const d of dias.dias) {
        filas.push({ dia_semana: d, hora_desde: desde, hora_hasta: hasta, cupo, profesor, linea: reg.linea })
      }
    }
  }

  if (comillaSinCerrar !== null) {
    errores.push({
      linea: comillaSinCerrar,
      motivo: `Fila ${comillaSinCerrar}: hay unas comillas sin cerrar`,
    })
  }
  if (filas.length > MAX_FILAS_IMPORTACION) {
    errores.push({
      linea: 0,
      motivo: `El calendario tiene ${filas.length} franjas y el máximo por importación es ${MAX_FILAS_IMPORTACION}.`,
    })
  }
  if (filas.length === 0 && errores.length === 0) {
    errores.push({ linea: 0, motivo: 'No encontramos franjas: pegá el calendario o subí un CSV.' })
  }

  errores.sort((a, b) => a.linea - b.linea)
  return { filas, errores }
}
