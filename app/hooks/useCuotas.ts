import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useAuthStore } from '@/stores/authStore'
import { contarPendientes, deudaTotal } from '@/lib/deudaSocio'
import {
  claveComprobante,
  estadoComprobante,
  periodoCuotaVirtual,
  periodosEnGracia,
  prefijoComprobantes,
  sigueAdeudado,
  type ComprobanteEnviado,
  type EstadoComprobante,
} from '@/lib/comprobanteEnviado'
import {
  borrarComprobanteEnviado,
  guardarComprobanteEnviado,
  leerComprobantesEnviados,
} from '@/lib/comprobantesStorage'
import { cargarDeudaDetalle, type DeudaDetalle } from './useDeudaDetalle'

export interface ComprobanteConEstado extends ComprobanteEnviado {
  estado: EstadoComprobante
}

export interface Cuota {
  id:                string
  periodo:           string   // YYYY-MM
  monto:             number
  estado:            'pendiente' | 'en_revision' | 'pagado'
  fecha_pago:        string | null
  comprobante_path:  string | null
  // Sólo la cuota virtual: períodos de NUVIX que cubre su monto (vacío si la
  // deuda es sólo saldo anterior).
  periodosNuvix?:    string[]
}

export interface ServicioActivo {
  id:            string
  nombre:        string
  monto_mensual: number
}

function periodoHoy(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

// socioId: undefined = the logged-in member's own socio (profile_id = auth.uid(),
// unchanged behavior). Given = that socio by id (tutor viewing a linked minor;
// RLS cuotas/socio_servicios/pagos_socios _select_tutor decides access).
export function useCuotas(socioId?: string) {
  const { session } = useAuthStore()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [cuotas,           setCuotas]           = useState<Cuota[]>([])
  const [loading,          setLoading]          = useState(true)
  // true una vez que hubo una carga exitosa para este socio (ver `loading` abajo)
  const [cargado,          setCargado]          = useState(false)
  const [serviciosActivos, setServiciosActivos] = useState<ServicioActivo[]>([])
  const [totalMensual,     setTotalMensual]     = useState(0)
  const [categoriaLabel,   setCategoriaLabel]   = useState<string>('')
  const [montoCategoria,   setMontoCategoria]   = useState<number>(0)
  // Semáforo real de NUVIX (importador de deuda) — señal aparte de `cuotas`,
  // que es el flujo interino de alias+comprobante de la app. Binario a
  // propósito: el socio no ve colores ni se compara contra otros socios.
  // null = todavía no se sabe (cargando o error): no se muestra ningún estado.
  const [alDia,             setAlDia]             = useState<boolean | null>(null)
  const [error,             setError]             = useState<string | null>(null)
  const [deudaActualizadaAt, setDeudaActualizadaAt] = useState<string | null>(null)
  // Deuda NUVIX de la última importación (monto y desglose de la cuota virtual).
  const [deuda,             setDeuda]             = useState<DeudaDetalle | null>(null)
  const [comprobantes,      setComprobantes]      = useState<ComprobanteConEstado[]>([])
  const registradosRef = useRef(new Map<string, ComprobanteConEstado>())

  const fetch = useCallback(async () => {
    if (!session?.user.id) return
    setLoading(true)

    // Un fetch fallido (sin red, RLS, etc.) no puede verse como "no hay
    // cuotas" ni como "al día": se limpia todo y la pantalla muestra el error.
    const fallar = () => {
      setError('No se pudieron cargar tus cuotas. Revisá tu conexión.')
      setCuotas([])
      setAlDia(null)
      setDeuda(null)
      setCargado(false)
      setLoading(false)
    }

    const { data: socio, error: errSocio } = await db
      .from('socios')
      .select('id, categorias_socio(nombre, monto_mensual), semaforo, deuda_actualizada_at, cobro_con_tarjeta')
      .eq(socioId ? 'id' : 'profile_id', socioId ?? session.user.id)
      .maybeSingle()

    if (errSocio) { fallar(); return }
    if (!socio) { setError(null); setLoading(false); return }

    const alDiaSegunClub = !['amarillo', 'rojo'].includes(socio.semaforo)

    const cat = socio.categorias_socio as { nombre: string; monto_mensual: number } | null
    const montoCategoria: number = cat?.monto_mensual ?? 0

    // importe real del vínculo manda sobre el precio de catálogo (reconciliación
    // con el Padrón de Servicios de NUVIX, 2026-08-05 — ver socios-pagos)
    const { data: socioServiciosData, error: errServicios } = await db
      .from('socio_servicios')
      .select('importe, servicios_opcionales(id, nombre, monto_mensual)')
      .eq('socio_id', socio.id)

    if (errServicios) { fallar(); return }

    const servicios: ServicioActivo[] = (socioServiciosData ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((ss: any) => ss.servicios_opcionales && {
        ...ss.servicios_opcionales,
        monto_mensual: ss.importe ?? ss.servicios_opcionales.monto_mensual,
      })
      .filter(Boolean)

    const montoServicios = servicios.reduce((s: number, srv: ServicioActivo) => s + srv.monto_mensual, 0)
    const total = montoCategoria + montoServicios

    const { data, error: errCuotas } = await db
      .from('cuotas')
      .select('id, periodo, monto, estado, comprobante_path, fecha_pago:pagos_socios(created_at)')
      .eq('socio_id', socio.id)
      .order('periodo', { ascending: false })

    if (errCuotas) { fallar(); return }

    const normalized: Cuota[] = (data ?? []).map((c: Record<string, unknown>) => {
      const pagos = c.fecha_pago as { created_at: string }[] | null
      return {
        id:               c.id as string,
        periodo:          c.periodo as string,
        monto:            c.monto as number,
        estado:           c.estado as Cuota['estado'],
        fecha_pago:       pagos?.[0]?.created_at ?? null,
        comprobante_path: c.comprobante_path as string | null,
      }
    })

    // La deuda NUVIX se carga siempre (no sólo con cuota virtual): también es
    // contra lo que se reconcilian los comprobantes mandados por WhatsApp.
    const { data: detalle, error: errDeuda } = await cargarDeudaDetalle(socio.id)
    if (errDeuda) { fallar(); return }

    // La cuota virtual del mes actual sólo se ofrece a pagar por alias si el
    // club (semáforo NUVIX, fuente real de verdad) todavía te marca con deuda.
    // Si ya estás al día, mostrarla igual sería contradecir el propio banner
    // de deuda real. Tampoco se ofrece si el socio paga con débito automático
    // (cobro_con_tarjeta) — a esos no les corresponde transferir por alias, el
    // cobro es automático y el semáforo puede tardar en reflejarlo.
    // El monto es la deuda real de NUVIX (todos los períodos vencidos + saldo
    // anterior, sin el plan de regularización) — misma query que el modal
    // "Deuda según el club", para que los dos números coincidan. Si por algún
    // motivo no hay comprobantes (importación sin filas de este socio), cae al
    // total mensual como antes.
    const hoy = periodoHoy()
    if (!alDiaSegunClub && !socio.cobro_con_tarjeta && !normalized.some(c => c.periodo === hoy)) {
      const totalDeuda = detalle ? deudaTotal(detalle) : 0
      normalized.unshift({
        id:               `virtual-${hoy}`,
        periodo:          hoy,
        monto:            totalDeuda > 0 ? totalDeuda : total,
        estado:           'pendiente',
        fecha_pago:       null,
        comprobante_path: null,
        periodosNuvix:    detalle ? detalle.periodos.map(p => p.periodo) : [],
      })
    }

    // Comprobantes mandados por WhatsApp desde este dispositivo, contra la
    // última importación. Los REGISTRADO se muestran una vez: se borran de
    // AsyncStorage acá y quedan en memoria mientras la pantalla esté montada.
    const periodosAdeudados = detalle ? detalle.periodos.map(p => p.periodo) : []
    const prefijo = prefijoComprobantes(socioId)
    const guardados = await leerComprobantesEnviados(prefijo)
    const conEstado: ComprobanteConEstado[] = guardados.map(e => ({
      ...e,
      estado: estadoComprobante(
        e.enviadoAt,
        detalle?.fechaCorte ?? null,
        sigueAdeudado(e.periodos, periodosAdeudados, !alDiaSegunClub),
      ),
    }))
    for (const e of conEstado) {
      if (e.estado === 'REGISTRADO') {
        registradosRef.current.set(e.clave, e)
        await borrarComprobanteEnviado(e.clave)
      }
    }
    const vigentes = conEstado.filter(e => e.estado !== 'REGISTRADO')

    setError(null)
    setAlDia(alDiaSegunClub)
    setDeudaActualizadaAt(socio.deuda_actualizada_at ?? null)
    setCategoriaLabel(cat?.nombre ?? '')
    setMontoCategoria(montoCategoria)
    setServiciosActivos(servicios)
    setTotalMensual(total)
    setDeuda(detalle)
    // (el tutor puede cambiar de menor: sólo los registrados de este socio)
    const registrados = [...registradosRef.current.values()].filter(e => e.clave.startsWith(prefijo))
    setComprobantes([...vigentes, ...registrados])
    setCuotas(normalized)
    setCargado(true)
    setLoading(false)
  }, [session, socioId])

  // El tutor cambió de menor: no mostrar las cuotas del anterior mientras
  // cargan las nuevas (la pantalla sólo muestra spinner si no hay datos).
  useEffect(() => {
    setCargado(false)
    setCuotas([])
    setAlDia(null)
    setDeuda(null)
    setComprobantes([])
  }, [socioId])

  useEffect(() => { fetch() }, [fetch])
  // Al volver a la pestaña se recarga en silencio: la lista queda montada
  // (sin spinner ni salto de scroll) y se actualiza cuando llega la respuesta.
  useRefreshOnFocus(fetch)

  // Pull-to-refresh: `refreshing` es sólo para el RefreshControl.
  const [refreshing, setRefreshing] = useState(false)
  const refetch = useCallback(async () => {
    setRefreshing(true)
    await fetch()
    setRefreshing(false)
  }, [fetch])

  // Se llama al tocar "ENVIAR COMPROBANTE POR WHATSAPP", antes de abrir
  // WhatsApp: la card pasa a ENVIADO apenas se vuelve a la app.
  const marcarComprobanteEnviado = useCallback(async (cuota: Cuota) => {
    const esVirtual = cuota.id.startsWith('virtual-')
    const periodos  = esVirtual ? cuota.periodosNuvix ?? [] : [cuota.periodo]
    const entrada: ComprobanteEnviado = {
      clave:     claveComprobante(socioId, esVirtual ? periodoCuotaVirtual(periodos) : cuota.periodo),
      enviadoAt: new Date().toISOString(),
      periodos,
    }
    try {
      await guardarComprobanteEnviado(entrada)
    } catch {
      // sin AsyncStorage se pierde el feedback, pero el envío por WhatsApp sigue
    }
    setComprobantes(prev => [
      ...prev.filter(e => e.clave !== entrada.clave),
      { ...entrada, estado: 'ENVIADO' },
    ])
  }, [socioId])

  const virtual = cuotas.find(c => c.id.startsWith('virtual-'))
  const pendientes = contarPendientes({
    periodosPendientes: cuotas.filter(c => c.estado === 'pendiente' && c !== virtual).map(c => c.periodo),
    periodosNuvix:      virtual ? virtual.periodosNuvix ?? [] : null,
    enviadosEnGracia:   periodosEnGracia(comprobantes),
  })

  return {
    cuotas,
    // Spinner de pantalla completa sólo hasta tener datos: las recargas
    // (foco, pull) no desmontan la lista.
    loading: loading && !cargado,
    error,
    refreshing,
    refetch,
    serviciosActivos,
    totalMensual,
    categoriaLabel,
    montoCategoria,
    alDia,
    deudaActualizadaAt,
    deuda,
    pendientes,
    comprobantes,
    marcarComprobanteEnviado,
  }
}
