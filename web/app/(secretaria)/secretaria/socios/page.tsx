'use client'

import { useEffect, useState, useCallback, useMemo, useDeferredValue } from 'react'
import { supabase, selectAllRows } from '@/lib/supabase'
import { callEdgeFunction } from '@/lib/edgeFunction'
import SolicitudesBaja from '@/components/secretaria/SolicitudesBaja'
import SortableTh, { type SortDirection } from '@/components/secretaria/SortableTh'
import VerMas from '@/components/secretaria/VerMas'
import ErrorCarga from '@/components/secretaria/ErrorCarga'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import { coincideBusqueda, nombresSocio, resumenDeudaNuvix, type Semaforo } from '@/lib/busquedaSocios'
import { PAGINA_LISTA, paginar, ordenarCon, reemplazarPorId } from '@/lib/listaPaginada'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CategoriaSocio {
  id: string
  nombre: string
  monto_mensual: number
  activa: boolean
}

interface ServicioOpcional {
  id: string
  nombre: string
  monto_mensual: number
  activo: boolean
}

interface VinculoServicio {
  servicio_id: string
  importe:     number | null
}

interface SocioItem {
  id: string
  numero_socio: string
  dni: string
  estado: string
  foto_path: string | null
  foto_validada: boolean
  created_at: string
  /** Nombre del padrón de NUVIX (el que conoce la secretaria); si falta, el de la app. */
  nombre: string
  /** Nombre que el socio puso en la app (Mi perfil); también se busca por este. */
  nombreApp: string
  semaforo: Semaforo | null
  deuda_vencida: number
  meses_impagos: number
  categoria: string
  categoria_id: string
}

type FiltroEstado = 'todos' | 'activo' | 'moroso' | 'pendiente' | 'inactivo'

// 'moroso' no se incluye en los filtros: era del flujo legacy de débito
// automático con tarjeta (descartado por la directiva), nadie lo setea más
// — el filtro siempre daba cero resultados. La morosidad real vive en
// /secretaria/deuda (semáforo NUVIX). El label/color se dejan por si queda
// algún registro legacy con ese estado, para que no se muestre en crudo.
const FILTROS: FiltroEstado[] = ['todos', 'activo', 'pendiente', 'inactivo']
const ESTADO_LABEL: Record<string, string> = {
  activo: 'Activo', moroso: 'Moroso', pendiente: 'Pendiente', inactivo: 'Inactivo',
}
const ESTADO_COLOR: Record<string, string> = {
  activo: 'text-[#2ECC71] border-[#2ECC71]',
  moroso: 'text-oro border-oro',
  pendiente: 'text-[#E67E22] border-[#E67E22]',
  inactivo: 'text-texto-2 border-gris-claro',
}

// ─── Detalle socio ────────────────────────────────────────────────────────────

function DetalleSocio({
  socio,
  categorias,
  servicios,
  serviciosSocio,
  fechaCorteDeuda,
  errorServicios,
  errorRefresco,
  onClose,
  onRefresh,
}: {
  socio: SocioItem
  categorias: CategoriaSocio[]
  servicios: ServicioOpcional[]
  serviciosSocio: VinculoServicio[]
  fechaCorteDeuda: string | null
  /** No se pudieron leer los servicios del socio: no se muestran chips ni total (serían falsos). */
  errorServicios: string | null
  /** No se pudo releer el socio después de una acción: lo que se ve puede estar desactualizado. */
  errorRefresco: string | null
  onClose: () => void
  onRefresh: () => void
}) {
  const [actualizando,  setActualizando]  = useState(false)
  const [msg,           setMsg]           = useState('')
  const [fotoUrl,       setFotoUrl]       = useState<string | null>(null)
  const [fotoError,     setFotoError]     = useState(false)

  useEffect(() => {
    setFotoError(false)
    if (!socio.foto_path) { setFotoUrl(null); return }
    supabase.storage
      .from('socios-fotos')
      .createSignedUrl(socio.foto_path, 300)
      .then(({ data, error }) => {
        if (error || !data) { setFotoUrl(null); setFotoError(true); return }
        setFotoUrl(data.signedUrl)
      })
  }, [socio.foto_path])

  const categoria = categorias.find(c => c.id === socio.categoria_id)

  // Sin auto-ocultado: el mensaje queda hasta la próxima acción (auditoría UX, X8).
  const setStatus = (m: string) => setMsg(m)
  const msgEsError = msg.startsWith('Error:')

  const handleDesactivar = async () => {
    if (!confirm('¿Desactivar este socio? Se bloqueará su acceso.')) return
    setActualizando(true)
    const json = await callEdgeFunction('admin-socios', { action: 'deactivate', socio_id: socio.id })
    setActualizando(false)
    if (json.error) { setStatus(`Error: ${json.error}`); return }
    setStatus('Socio desactivado.')
    onRefresh()
  }

  const handleReactivar = async () => {
    setActualizando(true)
    const json = await callEdgeFunction('admin-socios', { action: 'reactivate', socio_id: socio.id })
    setActualizando(false)
    if (json.error) { setStatus(`Error: ${json.error}`); return }
    setStatus('Socio reactivado.')
    onRefresh()
  }

  const handleValidarFoto = async () => {
    setActualizando(true)
    const json = await callEdgeFunction<{ validada?: boolean; mensaje?: string }>('admin-socios', { action: 'validate-photo', socio_id: socio.id })
    setActualizando(false)
    if (json.error) { setStatus(`Error: ${json.error}`); return }
    setStatus(json.validada ? 'Foto validada ✓' : (json.mensaje ?? 'No se pudo validar la foto.'))
    onRefresh()
  }

  const handleToggleServicio = async (servicioId: string, agregar: boolean) => {
    const { error } = agregar
      ? await supabase.from('socio_servicios').insert({ socio_id: socio.id, servicio_id: servicioId })
      : await supabase.from('socio_servicios').delete()
          .eq('socio_id', socio.id).eq('servicio_id', servicioId)
    const nombre = servicios.find(s => s.id === servicioId)?.nombre ?? 'el servicio'
    if (error) setStatus(`Error: no se pudo ${agregar ? 'agregar' : 'quitar'} ${nombre}: ${error.message}`)
    else setStatus(`${nombre} ${agregar ? 'agregado' : 'quitado'}.`)
    onRefresh()
  }

  // importe real del vínculo manda sobre el precio de catálogo (reconciliación
  // con el Padrón de Servicios de NUVIX, 2026-08-05 — mismo criterio que socios-pagos)
  const vinculoPorServicioId = new Map(serviciosSocio.map(v => [v.servicio_id, v]))
  const montoServicios = servicios
    .filter(s => vinculoPorServicioId.has(s.id))
    .reduce((sum, s) => sum + (vinculoPorServicioId.get(s.id)!.importe ?? s.monto_mensual), 0)
  const montoTotal = (categoria?.monto_mensual ?? 0) + montoServicios

  return (
    <div>
      <button
        onClick={onClose}
        className="font-lora text-xs tracking-widest text-tinta/50 hover:text-tinta mb-6 flex items-center gap-2 transition-colors"
      >
        ← VOLVER A SOCIOS
      </button>

      {/* Regiones vivas siempre montadas para que el lector de pantalla anuncie el cambio. */}
      <div role="status">
        {msg && !msgEsError && (
          <div className="mb-4 p-3 border border-gris-claro bg-card font-lora text-sm text-tinta">{msg}</div>
        )}
      </div>
      <div role="alert">
        {msgEsError && (
          <div className="mb-4 p-3 border border-gris-claro bg-card font-lora text-sm text-rojo-texto">{msg}</div>
        )}
      </div>

      {errorRefresco && (
        <ErrorCarga mensaje={errorRefresco} onReintentar={onRefresh} className="mb-4" />
      )}

      <div className="grid grid-cols-3 gap-8">
        {/* Info principal */}
        <div className="col-span-2 flex flex-col gap-6">
          <div>
            <h2 className="font-playfair italic text-3xl text-tinta mb-1">{socio.nombre}</h2>
            <p className="font-lora text-xs tracking-widest text-oro-hondo">Nº {socio.numero_socio}</p>
            {socio.nombreApp && socio.nombreApp !== socio.nombre && (
              <p className="font-lora text-xs text-texto-2 mt-1">En la app: {socio.nombreApp}</p>
            )}
          </div>

          <table className="w-full border-collapse">
            <tbody>
              {[
                { label: 'DNI',       value: socio.dni },
                { label: 'CATEGORÍA', value: categoria?.nombre ?? socio.categoria },
                { label: 'ESTADO',    value: ESTADO_LABEL[socio.estado] ?? socio.estado },
                { label: 'FOTO',      value: socio.foto_validada ? 'Validada ✓' : 'Sin validar' },
                { label: 'DEUDA NUVIX', value: resumenDeudaNuvix(socio, fechaCorteDeuda) },
              ].map(row => (
                <tr key={row.label} className="border-b border-gris-claro">
                  <td className="font-lora text-xs tracking-widest text-tinta/50 py-3 pr-6 w-32">{row.label}</td>
                  <td className="font-lora text-sm text-tinta py-3">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Servicios opcionales */}
          <div>
            <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">SERVICIOS OPCIONALES</p>
            {errorServicios ? (
              <ErrorCarga mensaje={errorServicios} onReintentar={onRefresh} />
            ) : (<>
            <div className="flex flex-wrap gap-2 mb-3">
              {servicios.map(srv => {
                const vinculo = vinculoPorServicioId.get(srv.id)
                const activo = !!vinculo
                // si ya está vinculado, el importe real manda; si no, el precio de
                // catálogo es sólo una referencia de lo que probablemente le corresponda
                const monto = vinculo?.importe ?? srv.monto_mensual
                return (
                  <button
                    key={srv.id}
                    onClick={() => handleToggleServicio(srv.id, !activo)}
                    className={`font-lora text-xs tracking-widest px-4 py-2 border transition-colors ${
                      activo
                        ? 'bg-oro border-oro text-papel'
                        : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
                    }`}
                  >
                    {srv.nombre} · ${monto.toLocaleString('es-AR')}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between items-baseline border-t border-gris-claro pt-3">
              <span className="font-lora text-xs tracking-widest text-tinta/50">TOTAL MENSUAL</span>
              <span className="font-playfair italic text-2xl text-tinta">
                ${montoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            </>)}
          </div>

        </div>

        {/* Acciones */}
        <div className="flex flex-col gap-3">
          {fotoUrl ? (
            <img src={fotoUrl} alt="Foto socio" className="w-full aspect-square object-cover mb-1" />
          ) : (
            <div className="w-full aspect-square bg-card border border-gris-claro flex items-center justify-center mb-1">
              <span className="font-lora text-xs tracking-widest text-texto-2 text-center px-2">
                {fotoError ? 'NO SE PUDO CARGAR LA FOTO' : 'SIN FOTO'}
              </span>
            </div>
          )}
          <p className="font-lora text-xs tracking-widest text-tinta/50 mb-1">ACCIONES</p>

          {!socio.foto_validada && socio.foto_path && (
            <button
              onClick={handleValidarFoto}
              disabled={actualizando}
              className="font-lora text-xs tracking-widest py-3 border border-oro text-oro hover:bg-oro/10 transition-colors disabled:opacity-50"
            >
              VALIDAR FOTO
            </button>
          )}

          {socio.estado !== 'inactivo' ? (
            <button
              onClick={handleDesactivar}
              disabled={actualizando}
              className="font-lora text-xs tracking-widest py-3 border border-rojo text-rojo-texto hover:bg-rojo/5 transition-colors disabled:opacity-50"
            >
              DESACTIVAR SOCIO
            </button>
          ) : (
            <button
              onClick={handleReactivar}
              disabled={actualizando}
              className="font-lora text-xs tracking-widest py-3 border border-[#2ECC71] text-[#2ECC71] hover:bg-[#2ECC71]/5 transition-colors disabled:opacity-50"
            >
              REACTIVAR SOCIO
            </button>
          )}
        </div>
      </div>

    </div>
  )
}

// ─── Orden de columnas (tipo Explorador de Windows) ───────────────────────────

type SortColumn = 'numero_socio' | 'nombre' | 'categoria' | 'dni' | 'estado'

const SORT_LABEL: Record<SortColumn, string> = {
  numero_socio: 'Nº', nombre: 'NOMBRE', categoria: 'CATEGORÍA', dni: 'DNI', estado: 'ESTADO',
}

function compareSocios(a: SocioItem, b: SocioItem, column: SortColumn): number {
  if (column === 'numero_socio') {
    const na = Number(a.numero_socio)
    const nb = Number(b.numero_socio)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return a.numero_socio.localeCompare(b.numero_socio, 'es')
  }
  return String(a[column]).localeCompare(String(b[column]), 'es')
}

// ─── Lectura de socios ────────────────────────────────────────────────────────

// Mismas columnas para la lista completa y para releer un socio después de editarlo.
const SELECT_SOCIO = 'id, numero_socio, dni, estado, foto_path, foto_validada, created_at, categoria_id, nombre_padron, semaforo, deuda_vencida, meses_impagos, profiles!socios_profile_id_fkey(nombre), categorias_socio!socios_categoria_id_fkey(nombre)'

function normalizarSocio(s: Record<string, unknown>): SocioItem {
  return {
    id:               s.id as string,
    numero_socio:     s.numero_socio as string,
    dni:              s.dni as string,
    estado:           s.estado as string,
    foto_path:        s.foto_path as string | null,
    foto_validada:    s.foto_validada as boolean,
    created_at:       s.created_at as string,
    categoria_id:     s.categoria_id as string,
    ...nombresSocio(s.nombre_padron as string | null, s.profiles as { nombre: string | null } | null),
    semaforo:         (s.semaforo as Semaforo | null) ?? null,
    deuda_vencida:    Number(s.deuda_vencida ?? 0),
    meses_impagos:    Number(s.meses_impagos ?? 0),
    categoria:        (s.categorias_socio as { nombre: string } | null)?.nombre ?? '—',
  }
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function SociosPage() {
  const [socios,       setSocios]       = useState<SocioItem[]>([])
  const [categorias,   setCategorias]   = useState<CategoriaSocio[]>([])
  const [servicios,    setServicios]    = useState<ServicioOpcional[]>([])
  const [serviciosSocio, setServiciosSocio] = useState<VinculoServicio[]>([])
  const [fechaCorteDeuda, setFechaCorteDeuda] = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [errorCarga,   setErrorCarga]   = useState<string | null>(null)
  const [errorServicios, setErrorServicios] = useState<string | null>(null)
  const [errorRefresco,  setErrorRefresco]  = useState<string | null>(null)
  const [filtro,      setFiltro]       = useState<FiltroEstado>('todos')
  const [busqueda,     setBusqueda]     = useState('')
  const [detalle,      setDetalle]      = useState<SocioItem | null>(null)
  const [sortColumn,    setSortColumn]    = useState<SortColumn>('numero_socio')
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
      const [sociosData, cats, srvs, ultimaDeuda] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectAllRows<Record<string, unknown>>((from, to) =>
          (supabase as any)
            .from('socios')
            .select(SELECT_SOCIO)
            .order('numero_socio')
            .range(from, to)
        ),
        supabase.from('categorias_socio').select('id, nombre, monto_mensual, activa').order('nombre'),
        supabase.from('servicios_opcionales').select('id, nombre, monto_mensual, activo').order('nombre'),
        // El semáforo de cada socio lo dejó la última importación aplicada (no la de fecha de corte más nueva).
        supabase.from('importaciones_deuda').select('fecha_corte').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      const err = primerError(cats.error, srvs.error, ultimaDeuda.error)
      if (err) throw err

      setSocios((sociosData ?? []).map(normalizarSocio))
      setCategorias(cats.data ?? [])
      setServicios(srvs.data ?? [])
      setFechaCorteDeuda((ultimaDeuda.data as { fecha_corte: string } | null)?.fecha_corte ?? null)
      setErrorCarga(null)
    } catch (e) {
      setErrorCarga(mensajeErrorCarga('los socios', e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const fetchServiciosSocio = useCallback(async (socioId: string) => {
    const { data, error } = await supabase
      .from('socio_servicios')
      .select('servicio_id, importe')
      .eq('socio_id', socioId)
    if (error) { setErrorServicios(mensajeErrorCarga('los servicios del socio', error)); return }
    setErrorServicios(null)
    setServiciosSocio((data ?? []) as VinculoServicio[])
  }, [])

  const handleAbrirDetalle = (socio: SocioItem) => {
    setDetalle(socio)
    setServiciosSocio([])
    setErrorServicios(null)
    setErrorRefresco(null)
    void fetchServiciosSocio(socio.id)
  }

  // Después de una acción en el detalle se vuelve a leer sólo ese socio (no todo el padrón).
  const fetchSocio = useCallback(async (socioId: string) => {
    const { data, error } = await supabase.from('socios').select(SELECT_SOCIO).eq('id', socioId).maybeSingle()
    if (error) {
      // No se saca al socio de la lista: el error no dice que ya no exista.
      setErrorRefresco(mensajeErrorCarga('los datos actualizados del socio', error))
      return
    }
    setErrorRefresco(null)
    const nuevo = data ? normalizarSocio(data as unknown as Record<string, unknown>) : null
    setSocios(lista => reemplazarPorId(lista, socioId, nuevo))
  }, [])

  const handleRefreshDetalle = useCallback(async () => {
    if (!detalle) return
    await Promise.all([fetchSocio(detalle.id), fetchServiciosSocio(detalle.id)])
  }, [detalle, fetchSocio, fetchServiciosSocio])

  // La búsqueda se difiere para que tipear no espere al filtro + orden de ~1.500 filas.
  const busquedaDiferida = useDeferredValue(busqueda)
  const sociosFiltrados = useMemo(
    () => ordenarCon(
      socios
        .filter(s => filtro === 'todos' || s.estado === filtro)
        .filter(s => coincideBusqueda(busquedaDiferida, s)),
      (a, b) => compareSocios(a, b, sortColumn),
      sortDirection,
    ),
    [socios, filtro, busquedaDiferida, sortColumn, sortDirection],
  )

  // Se renderizan de a PAGINA_LISTA filas; al cambiar filtros u orden vuelve a la primera tanda.
  const [limite, setLimite] = useState(PAGINA_LISTA)
  const claveVista = `${filtro}|${busquedaDiferida}|${sortColumn}|${sortDirection}`
  const [claveLimite, setClaveLimite] = useState(claveVista)
  if (claveLimite !== claveVista) {
    setClaveLimite(claveVista)
    setLimite(PAGINA_LISTA)
  }
  const { visibles, restantes } = paginar(sociosFiltrados, limite)

  // ── Vista detalle ──────────────────────────────────────────────────────────
  if (detalle) {
    const actualizado = socios.find(x => x.id === detalle.id) ?? detalle
    return (
      <DetalleSocio
        socio={actualizado}
        categorias={categorias}
        servicios={servicios}
        serviciosSocio={serviciosSocio}
        fechaCorteDeuda={fechaCorteDeuda}
        errorServicios={errorServicios}
        errorRefresco={errorRefresco}
        onClose={() => setDetalle(null)}
        onRefresh={handleRefreshDetalle}
      />
    )
  }

  // ── Vista lista ────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Socios</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">
            {loading || errorCarga ? 'Padrón de socios' : `${socios.length} socios registrados`} · las altas entran con el import del padrón de NUVIX
          </p>
        </div>
      </div>

      {/* Solicitudes de baja pedidas desde la app (sólo si hay pendientes) */}
      <SolicitudesBaja />

      {/* Barra de búsqueda + filtros */}
      <div className="flex gap-4 mb-6 items-center">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, DNI o Nº socio…"
          className="flex-1 font-lora text-sm text-tinta bg-card border border-borde-control px-4 py-2 outline-none focus:border-oro transition-colors"
        />
        <div className="flex gap-1">
          {FILTROS.map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`font-lora text-xs tracking-widest px-3 py-2 border transition-colors ${
                filtro === f
                  ? 'bg-oro border-oro text-papel'
                  : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
              }`}
            >
              {f === 'todos' ? 'TODOS' : (ESTADO_LABEL[f] ?? f).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="font-lora text-texto-2 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : errorCarga ? (
        <ErrorCarga mensaje={errorCarga} onReintentar={() => { setLoading(true); void fetchAll() }} />
      ) : sociosFiltrados.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-texto-2 text-sm tracking-widest">
            {busqueda ? 'SIN RESULTADOS' : 'NO HAY SOCIOS EN ESTA VISTA'}
          </p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gris-claro">
              <SortableTh column="numero_socio" label={SORT_LABEL.numero_socio} align="left"   extraClass="w-16" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <SortableTh column="nombre" label={SORT_LABEL.nombre}       align="left"   sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <SortableTh column="categoria" label={SORT_LABEL.categoria}    align="left"   sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <SortableTh column="dni" label={SORT_LABEL.dni}          align="left"   sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <SortableTh column="estado" label={SORT_LABEL.estado}       align="center" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {visibles.map(s => (
              <tr
                key={s.id}
                onClick={() => handleAbrirDetalle(s)}
                className="border-b border-gris-claro hover:bg-gris-claro/30 transition-colors cursor-pointer"
              >
                <td className="font-playfair text-sm text-oro-hondo py-4 pr-4">{s.numero_socio}</td>
                <td className="font-lora text-sm text-tinta py-4 pr-4">
                  {/* Botón real para llegar al detalle con teclado; la fila sigue clickeable con mouse. */}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleAbrirDetalle(s) }}
                    className="text-left hover:text-oro transition-colors"
                  >
                    {s.nombre}
                  </button>
                </td>
                <td className="font-lora text-sm text-tinta/60 py-4 pr-4">{s.categoria}</td>
                <td className="font-lora text-sm text-tinta/60 py-4 pr-4">{s.dni}</td>
                <td className="text-center py-4 pr-4">
                  <span className={`font-lora text-xs tracking-widest px-2 py-0.5 border ${ESTADO_COLOR[s.estado] ?? 'border-gris-claro text-texto-2'}`}>
                    {(ESTADO_LABEL[s.estado] ?? s.estado).toUpperCase()}
                  </span>
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
