// Parser del "Padrón Extendido" de NUVIX (Padron Extendido.xlt.xls).
//
// A diferencia del resto de los reportes NUVIX de este proyecto
// (parse-deuda-nuvix.ts), éste NO es un Crystal Reports con bandas — es una
// tabla plana normal: fila de headers en la posición 0, 1 fila por
// persona/cuenta. Ver openspec/changes/importador-mensual-socios/design.md §1.1.

export type EstadoPadron = 'SOCIO' | 'BAJA' | 'CESANTES' | 'CLIENTE GYM' | 'ALQUILERES' | 'PROVEEDORES' | string

export interface SocioPadron {
  numeroSocio:     string
  nombre:          string
  estado:          EstadoPadron
  categoriaRaw:    string
  dni:             string
  dniSintetico:    boolean
  fechaNacimiento: string | null // ISO date, o null si no se pudo determinar
  email:           string
  emailSintetico:  boolean
  esTitular:       boolean // "Socio Cabecera" se autorreferencia (mismo patrón que cabecera_cod_cliente en la carga masiva de julio)
  pagaConTarjeta:  boolean // Vendedor='VISA' — débito o crédito, ambas se cobran automáticamente el mismo día (ver project-forma-pago-padron)
}

// Nombres exactos en categorias_socio — ver design.md §5, verificado contra
// producción (2026-08-21). CLIENTE / CLIENTE GYM no mapean: son poblaciones
// que ya se excluyen antes de llegar acá (sólo se procesa Estado='SOCIO').
const CATEGORIA_MAP: Record<string, string> = {
  'ACTIVO MAYOR':      'Activo Mayor',
  'ACTIVO MENOR':      'Activo Menor',
  'ACTIVO UNQUITAS':   'Activo Unquitas',
  'DEPENDIENTES GRUPO':'Dependiente Grupo Familiar',
  'TITULARES GRUPO':   'Titular de Grupo',
  'VITALICIO':         'Vitalicio',
  'BECADO RUGBY':      'Becado Rugby',
  'BECADO HOCKEY':     'Becado Hockey',
  'BECADO TENNIS':     'Becado Tenis',
}

export function categoriaNombreDb(categoriaRaw: string): string | null {
  return CATEGORIA_MAP[categoriaRaw.trim().toUpperCase()] ?? null
}

function esDniValido(raw: string): boolean {
  return /^\d{6,9}$/.test(raw.trim())
}

function esEmailValido(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
}

function normalizarNombre(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// NUVIX usa 1/1/80 como sentinel de "sin fecha" en varios campos de fecha de
// este export (convención clásica de epoch FAT/dBase) — no es una fecha de
// nacimiento real, aparece incluso en cuentas técnicas sin persona real.
// El año de 2 dígitos se desambigua con la columna Edad cuando está
// disponible (evita interpretar "9/16/49" como 2049 en vez de 1949).
function parseFechaNacimiento(raw: string, edadRaw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const [, moStr, dStr, yStr] = m
  const mo = Number(moStr)
  const d  = Number(dStr)

  let year: number
  if (yStr.length === 4) {
    year = Number(yStr)
  } else {
    const yy          = Number(yStr)
    const edad        = Number(edadRaw)
    const anioActual   = new Date().getFullYear()
    const candidatos   = [1900 + yy, 2000 + yy]
    year = Number.isFinite(edad) && edad > 0
      ? candidatos.reduce((mejor, c) =>
          Math.abs(anioActual - c - edad) < Math.abs(anioActual - mejor - edad) ? c : mejor)
      : (yy > (anioActual % 100) ? 1900 + yy : 2000 + yy)
  }

  if (mo === 1 && d === 1 && year === 1980) return null // sentinel "sin dato"

  return `${year}-${pad2(mo)}-${pad2(d)}`
}

export function parsePadronSocios(rows: unknown[][]): SocioPadron[] {
  const header = (rows[0] ?? []).map(h => String(h ?? '').trim())
  const idx = (name: string) => header.indexOf(name)

  const iCod       = idx('Cód. Cliente')
  const iNombre    = idx('Razón Social')
  const iEstado    = idx('Estado')
  const iCategoria = idx('Categoría')
  const iDni       = idx('Número Documento')
  const iMail      = idx('Mail1')
  const iFechaNac  = idx('FechaNacimiento')
  const iEdad      = idx('Edad')
  const iCabecera  = idx('Socio Cabecera')
  const iVendedor  = idx('Vendedor')

  if (iCod === -1 || iEstado === -1) return []

  const out: SocioPadron[] = []
  for (const r of rows.slice(1)) {
    const numeroSocio = String(r[iCod] ?? '').trim()
    // "0 CONTADO" — cuenta técnica de NUVIX (consumidor final genérico), no una persona
    if (!numeroSocio || numeroSocio === '0') continue

    const dniRaw    = String(r[iDni] ?? '').trim()
    const dniValido = esDniValido(dniRaw)

    const mailRaw    = String(r[iMail] ?? '').trim()
    const mailValido = esEmailValido(mailRaw)

    const nombre   = String(r[iNombre] ?? '').trim()
    const cabecera = String(r[iCabecera] ?? '').trim()

    out.push({
      numeroSocio,
      nombre,
      estado:          String(r[iEstado] ?? '').trim().toUpperCase(),
      categoriaRaw:    String(r[iCategoria] ?? '').trim(),
      dni:             dniValido ? dniRaw : `SD${numeroSocio}`,
      dniSintetico:    !dniValido,
      fechaNacimiento: parseFechaNacimiento(String(r[iFechaNac] ?? ''), String(r[iEdad] ?? '')),
      email:           mailValido ? mailRaw.toLowerCase() : `socio-${numeroSocio}@uncas.local`,
      emailSintetico:  !mailValido,
      // "Socio Cabecera" se autorreferencia por NOMBRE (no por código, a
      // diferencia del maestro de agosto) cuando la persona es titular de su
      // propio grupo familiar.
      esTitular:       !!cabecera && normalizarNombre(cabecera) === normalizarNombre(nombre),
      pagaConTarjeta:  String(r[iVendedor] ?? '').trim().toUpperCase() === 'VISA',
    })
  }
  return resolverEmailsDuplicados(out)
}

// Es común que una familia entera comparta un único mail real en NUVIX (ej.
// el mail del padre cargado para 4 hijos) — mismo hallazgo que ya resolvió
// scripts/import-socios-masivo.mjs en julio ("el titular se queda con el
// real cuando existe"). Sin esto, auth.admin.createUser falla para el 2do
// hermano en adelante (el mail ya está en uso) — encontrado en vivo probando
// el import real (2026-08-21): 225 mails compartidos por 763 personas en la
// muestra, causó ~15 altas fallidas en la primera corrida real.
function resolverEmailsDuplicados(filas: SocioPadron[]): SocioPadron[] {
  const conteo = new Map<string, number>()
  for (const f of filas) {
    if (f.emailSintetico) continue
    conteo.set(f.email, (conteo.get(f.email) ?? 0) + 1)
  }

  return filas.map(f => {
    if (f.emailSintetico) return f
    if ((conteo.get(f.email) ?? 0) <= 1) return f
    if (f.esTitular) return f // el titular se queda con el mail real

    return { ...f, email: `socio-${f.numeroSocio}@uncas.local`, emailSintetico: true }
  })
}
