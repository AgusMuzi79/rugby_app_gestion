'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { supabase, selectAllRows } from '@/lib/supabase'
import SortableTh, { type SortDirection } from '@/components/secretaria/SortableTh'
import VerMas from '@/components/secretaria/VerMas'
import ErrorCarga from '@/components/secretaria/ErrorCarga'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import { PAGINA_LISTA, paginar, ordenarCon } from '@/lib/listaPaginada'
import { filtrarDeudas, mensajeVacioDeudas, nombresSocio, SEMAFORO_LABEL, type Semaforo } from '@/lib/busquedaSocios'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SocioSemaforo {
  id: string
  numero_socio: string
  dni: string
  /** Nombre del padrón de NUVIX; si falta, el de la app. */
  nombre: string
  /** Nombre que el socio puso en la app; también se busca por este. */
  nombreApp: string
  semaforo: Semaforo | null
  deuda_vencida: number
  meses_impagos: number
  mora_max_dias: number
  categoria: string | null
  serviciosOpcionales: string[]
  servicios: string[]
}

type FiltroSemaforo = 'todos' | Semaforo

const FILTROS: FiltroSemaforo[] = ['todos', 'rojo', 'amarillo', 'verde', 'exento']

const FILTRO_SERVICIO_TODOS = 'todos'

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  verde: 'text-[#2ECC71] border-[#2ECC71]',
  amarillo: 'text-[#E67E22] border-[#E67E22]',
  rojo: 'text-rojo-texto border-rojo',
  exento: 'text-texto-2 border-gris-claro',
}

// Prioridad de urgencia — a quién llamar primero.
const SEMAFORO_ORDEN: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2, exento: 3 }

function formatMoney(n: number | null | undefined): string {
  return `$${(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ─── Orden de columnas (tipo Explorador de Windows) ───────────────────────────

type SortColumn = 'numero_socio' | 'nombre' | 'semaforo' | 'deuda_vencida' | 'meses_impagos' | 'mora_max_dias'

const SORT_LABEL: Record<SortColumn, string> = {
  numero_socio: 'Nº', nombre: 'NOMBRE', semaforo: 'SEMÁFORO',
  deuda_vencida: 'DEUDA VENCIDA', meses_impagos: 'MESES IMPAGOS', mora_max_dias: 'MORA MÁX (DÍAS)',
}

function compareSocios(a: SocioSemaforo, b: SocioSemaforo, column: SortColumn): number {
  switch (column) {
    case 'numero_socio': {
      const na = Number(a.numero_socio)
      const nb = Number(b.numero_socio)
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
      return a.numero_socio.localeCompare(b.numero_socio, 'es')
    }
    case 'nombre':
      return a.nombre.localeCompare(b.nombre, 'es')
    case 'semaforo': {
      // Prioridad de urgencia por default — a quién llamar primero. Empate:
      // dentro del mismo color, el que más debe primero.
      const cmp = (SEMAFORO_ORDEN[a.semaforo ?? ''] ?? 9) - (SEMAFORO_ORDEN[b.semaforo ?? ''] ?? 9)
      return cmp !== 0 ? cmp : b.deuda_vencida - a.deuda_vencida
    }
    case 'deuda_vencida':
      return a.deuda_vencida - b.deuda_vencida
    case 'meses_impagos':
      return a.meses_impagos - b.meses_impagos
    case 'mora_max_dias':
      return a.mora_max_dias - b.mora_max_dias
  }
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function DeudasPage() {
  const [socios, setSocios] = useState<SocioSemaforo[]>([])
  const [fechaCorte, setFechaCorte] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroSemaforo>('rojo')
  const [filtroServicio, setFiltroServicio] = useState<string>(FILTRO_SERVICIO_TODOS)
  const [busqueda, setBusqueda] = useState('')
  const [sortColumn,    setSortColumn]    = useState<SortColumn>('semaforo')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const fetchAll = useCallback(async () => {
    try {
      const [sociosData, serviciosOpcionalesData, socioServiciosData, { data: ultimaImportacion, error: errorUltima }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectAllRows<Record<string, unknown>>((from, to) =>
          (supabase as any)
            .from('socios')
            .select('id, numero_socio, dni, nombre_padron, semaforo, deuda_vencida, meses_impagos, mora_max_dias, profiles!socios_profile_id_fkey(nombre), categorias_socio!socios_categoria_id_fkey(nombre)')
            .in('estado', ['activo', 'pendiente'])
            .not('semaforo', 'is', null)
            .range(from, to)
        ),
        supabase.from('servicios_opcionales').select('id, nombre'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectAllRows<Record<string, unknown>>((from, to) =>
          (supabase as any)
            .from('socio_servicios')
            .select('socio_id, servicio_id')
            .range(from, to)
        ),
        supabase
          .from('importaciones_deuda')
          .select('fecha_corte')
          // La importación que generó el semáforo actual es la última que
          // entró (created_at), no la de fecha de corte más nueva: si se
          // importó un reporte viejo con "IMPORTAR IGUAL", el semáforo es ése.
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      const err = primerError(serviciosOpcionalesData.error, errorUltima)
      if (err) throw err

      const nombrePorServicioId = new Map<string, string>(
        (serviciosOpcionalesData.data ?? []).map((s) => [s.id as string, s.nombre as string])
      )

      const serviciosPorSocioId = new Map<string, string[]>()
      for (const v of socioServiciosData ?? []) {
        const socioId = v.socio_id as string
        const nombreServicio = nombrePorServicioId.get(v.servicio_id as string)
        if (!nombreServicio) continue
        if (!serviciosPorSocioId.has(socioId)) serviciosPorSocioId.set(socioId, [])
        serviciosPorSocioId.get(socioId)!.push(nombreServicio)
      }

      const normalizedSocios: SocioSemaforo[] = (sociosData ?? []).map((s: Record<string, unknown>) => {
        const categoria = (s.categorias_socio as { nombre: string } | null)?.nombre ?? null
        const serviciosOpcionales = serviciosPorSocioId.get(s.id as string) ?? []
        return {
          id: s.id as string,
          numero_socio: s.numero_socio as string,
          dni: (s.dni as string | null) ?? '',
          semaforo: s.semaforo as Semaforo | null,
          deuda_vencida: Number(s.deuda_vencida ?? 0),
          meses_impagos: Number(s.meses_impagos ?? 0),
          mora_max_dias: Number(s.mora_max_dias ?? 0),
          ...nombresSocio(s.nombre_padron as string | null, s.profiles as { nombre: string | null } | null),
          categoria,
          serviciosOpcionales,
          servicios: [
            ...(categoria ? [categoria] : []),
            ...serviciosOpcionales,
          ],
        }
      })

      setSocios(normalizedSocios)
      setFechaCorte((ultimaImportacion as { fecha_corte: string } | null)?.fecha_corte ?? null)
      setErrorCarga(null)
    } catch (e) {
      setErrorCarga(mensajeErrorCarga('las deudas', e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const opcionesServicio = useMemo(
    () => [...new Set(socios.flatMap(s => s.serviciosOpcionales))].sort((a, b) => a.localeCompare(b, 'es')),
    [socios],
  )

  // La búsqueda se difiere para que tipear no espere al filtro + orden de toda la lista.
  const busquedaDiferida = useDeferredValue(busqueda)
  const sociosFiltrados = useMemo(
    () => ordenarCon(
      filtrarDeudas(socios, { filtro, filtroServicio, busqueda: busquedaDiferida }),
      (a, b) => compareSocios(a, b, sortColumn),
      sortDirection,
    ),
    [socios, filtro, filtroServicio, busquedaDiferida, sortColumn, sortDirection],
  )

  // Se renderizan de a PAGINA_LISTA filas (el CSV exporta todas); al cambiar filtros u orden vuelve a la primera tanda.
  const [limite, setLimite] = useState(PAGINA_LISTA)
  const claveVista = `${filtro}|${filtroServicio}|${busquedaDiferida}|${sortColumn}|${sortDirection}`
  const [claveLimite, setClaveLimite] = useState(claveVista)
  if (claveLimite !== claveVista) {
    setClaveLimite(claveVista)
    setLimite(PAGINA_LISTA)
  }
  const { visibles, restantes } = paginar(sociosFiltrados, limite)

  const handleExportar = () => {
    const columnas = ['Nº Socio', 'Nombre', 'Semáforo', 'Deuda Vencida', 'Meses Impagos', 'Mora Máx (días)', 'Categoría', 'Servicios']
    const filas = sociosFiltrados.map(s => [
      s.numero_socio,
      s.nombre,
      s.semaforo ? SEMAFORO_LABEL[s.semaforo] : '',
      s.deuda_vencida.toFixed(2).replace('.', ','),
      String(s.meses_impagos),
      String(s.mora_max_dias),
      s.categoria ?? '',
      s.serviciosOpcionales.join(' / '),
    ])

    // Delimitador ";" (no ",") porque los montos usan coma como separador decimal
    // (es-AR) — con delimitador "," se rompería la columna de deuda vencida.
    const csvEscape = (v: string) => /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const lineas = [columnas, ...filas].map(fila => fila.map(csvEscape).join(';'))
    const bom = '﻿' // fuerza UTF-8 en Excel (si no, rompe las tildes)
    const csv = bom + lineas.join('\r\n')

    const partesNombre = [
      'deudas',
      filtro !== 'todos' ? filtro : null,
      filtroServicio !== FILTRO_SERVICIO_TODOS ? filtroServicio.toLowerCase().replace(/\s+/g, '-') : null,
      fechaCorte ?? new Date().toISOString().slice(0, 10),
    ].filter(Boolean)

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${partesNombre.join('-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-playfair italic text-4xl text-tinta mb-1">Deudas</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide">
          Semáforo de morosidad — deuda real de NUVIX, no se cobra desde la app
          {fechaCorte && <> · datos al {formatFecha(fechaCorte)}</>}
        </p>
      </div>

      <div className="flex gap-4 mb-4 items-center">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, DNI o Nº socio (en todos los colores)…"
          aria-label="Buscar socio por nombre, DNI o Nº, en todos los colores"
          className="flex-1 font-lora text-sm text-tinta bg-card border border-borde-control px-4 py-2 outline-none focus:border-oro transition-colors"
        />
        <div className="flex gap-1">
          {FILTROS.map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              // Con búsqueda el semáforo no se aplica: el botón deja de verse activo.
              aria-pressed={filtro === f && !busqueda.trim()}
              className={`font-lora text-xs tracking-widest px-3 py-2 border transition-colors ${
                filtro === f && !busqueda.trim()
                  ? 'bg-oro border-oro text-papel'
                  : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
              }`}
            >
              {f === 'todos' ? 'TODOS' : SEMAFORO_LABEL[f].toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 mb-6 items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setFiltroServicio(FILTRO_SERVICIO_TODOS)}
            className={`font-lora text-xs tracking-widest px-3 py-2 border transition-colors ${
              filtroServicio === FILTRO_SERVICIO_TODOS
                ? 'bg-oro/20 border-oro text-oro'
                : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
            }`}
          >
            TODOS LOS SERVICIOS
          </button>
          {opcionesServicio.map(nombre => (
            <button
              key={nombre}
              onClick={() => setFiltroServicio(nombre)}
              className={`font-lora text-xs tracking-widest px-3 py-2 border transition-colors ${
                filtroServicio === nombre
                  ? 'bg-oro/20 border-oro text-oro'
                  : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
              }`}
            >
              {nombre.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={handleExportar}
          disabled={sociosFiltrados.length === 0 || !!errorCarga}
          className="font-lora text-xs tracking-widest px-5 py-2 border border-oro text-oro hover:bg-oro/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          EXPORTAR CSV ({sociosFiltrados.length})
        </button>
      </div>

      {loading ? (
        <p className="font-lora text-texto-2 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : errorCarga ? (
        <ErrorCarga mensaje={errorCarga} onReintentar={() => { setLoading(true); void fetchAll() }} />
      ) : sociosFiltrados.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-texto-2 text-sm tracking-widest">
            {mensajeVacioDeudas({ filtro, filtroServicio, busqueda: busquedaDiferida })}
          </p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gris-claro">
              <SortableTh column="numero_socio" label={SORT_LABEL.numero_socio}  align="left"   extraClass="w-16" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <SortableTh column="nombre" label={SORT_LABEL.nombre}        align="left"   sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <SortableTh column="semaforo" label={SORT_LABEL.semaforo}      align="center" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <SortableTh column="deuda_vencida" label={SORT_LABEL.deuda_vencida} align="right"  sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <SortableTh column="meses_impagos" label={SORT_LABEL.meses_impagos} align="center" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <SortableTh column="mora_max_dias" label={SORT_LABEL.mora_max_dias} align="center" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th className="font-lora text-xs tracking-widest text-tinta/50 py-3 pl-4 text-left">SERVICIOS</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(s => (
              <tr key={s.id} className="border-b border-gris-claro">
                <td className="font-playfair text-sm text-oro-hondo py-4 pr-4">{s.numero_socio}</td>
                <td className="font-lora text-sm text-tinta py-4 pr-4">{s.nombre}</td>
                <td className="text-center py-4 pr-4">
                  <span className={`font-lora text-xs tracking-widest px-2 py-0.5 border ${
                    s.semaforo ? SEMAFORO_COLOR[s.semaforo] : 'border-gris-claro text-texto-2'
                  }`}>
                    {s.semaforo ? SEMAFORO_LABEL[s.semaforo].toUpperCase() : '—'}
                  </span>
                </td>
                <td className="font-lora text-sm text-tinta text-right py-4 pr-4">{formatMoney(s.deuda_vencida)}</td>
                <td className="font-lora text-sm text-tinta/60 text-center py-4 pr-4">{s.meses_impagos}</td>
                <td className="font-lora text-sm text-tinta/60 text-center py-4 pr-4">{s.mora_max_dias}</td>
                <td className="py-4 pl-4">
                  <div className="flex flex-wrap gap-1 max-w-[220px]">
                    {s.servicios.length === 0
                      ? <span className="font-lora text-xs text-texto-2">—</span>
                      : s.servicios.map((nombre, i) => (
                          <span key={i} className="font-lora text-[11px] tracking-wide px-2 py-0.5 border border-gris-claro text-tinta/60 whitespace-nowrap">
                            {nombre}
                          </span>
                        ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && !errorCarga && (
        <VerMas
          mostrando={visibles.length}
          total={sociosFiltrados.length}
          restantes={restantes}
          paso={PAGINA_LISTA}
          onVerMas={() => setLimite(l => l + PAGINA_LISTA)}
        />
      )}
    </div>
  )
}
