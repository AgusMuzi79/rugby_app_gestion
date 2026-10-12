import { useState, useEffect, useRef } from 'react'
import { supabase, selectAllRows } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { montoSugeridoDe } from '@/lib/montoSugerido'
import {
  cobrosPorDivision,
  type CobranzaRow,
  type CobrosPorDivision,
  type FormaDePago,
  type JugadorCobro,
} from '@/lib/cobrosPorDivision'
import type { DivisionRef } from './useEventos'

// Cobros de una recaudación de Subcomisión: quién pagó, agrupado por división.
// Jugadores: los de las divisiones del evento; si el evento es de todo el club,
// todos los que la Subcomisión ve (la RLS de jugadores ya filtra su disciplina).
// La RLS de cobranzas (20261019000000) limita las escrituras a jugadores del
// evento y con el evento activo.

export interface EventoCobrosRef {
  id:          string
  estado:      string
  descripcion: string | null   // monto sugerido por jugador
  divisiones:  DivisionRef[]   // vacío = todo el club
}

export interface CambioCobro {
  pagado:      boolean
  monto:       string
  formaDePago: FormaDePago | null
}

const VACIO: CobrosPorDivision = { divisiones: [], total: { pagados: 0, pendientes: 0, cobrado: 0 } }
const ERROR_CARGA = 'No se pudieron cargar los cobros. Intentá de nuevo.'

function fechaHoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useCobrosSubcomision(evento: EventoCobrosRef | null) {
  const { session } = useAuthStore()

  const [cargando, setCargando]     = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [cobros, setCobros]         = useState<CobrosPorDivision>(VACIO)

  const [guardandoId, setGuardandoId]     = useState<string | null>(null)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  const eventoId = evento?.id ?? null
  const editable = evento?.estado === 'activo'
  const ultimoPedido = useRef<string | null>(null)

  useEffect(() => {
    setErrorGuardado(null)
    if (eventoId) recargar()
    else setCobros(VACIO)
  }, [eventoId])

  async function recargar() {
    if (!evento) return
    const id = evento.id
    ultimoPedido.current = id
    setCargando(true)
    setErrorCarga(null)

    const divIds = evento.divisiones.map(d => d.id)
    type JugadorRow = {
      id: string; nombre_completo: string; division_id: string
      divisiones: { nombre: string } | null
    }

    try {
      const [jugadores, cobranzas] = await Promise.all([
        selectAllRows<JugadorRow>((from, to) => {
          let q = supabase
            .from('jugadores')
            .select('id, nombre_completo, division_id, divisiones(nombre)')
            .eq('activo', true)
            .order('nombre_completo')
            .range(from, to)
          if (divIds.length > 0) q = q.in('division_id', divIds)
          return q
        }),
        selectAllRows<CobranzaRow>((from, to) =>
          supabase
            .from('cobranzas')
            .select('jugador_id, estado, monto, forma_de_pago')
            .eq('evento_financiero_id', id)
            .range(from, to),
        ),
      ])
      if (ultimoPedido.current !== id) return

      const lista: JugadorCobro[] = jugadores.map(j => ({
        id:             j.id,
        nombre:         j.nombre_completo,
        divisionId:     j.division_id,
        divisionNombre: j.divisiones?.nombre ?? null,
      }))
      setCobros(cobrosPorDivision(lista, cobranzas, evento.descripcion))
    } catch {
      if (ultimoPedido.current !== id) return
      setErrorCarga(ERROR_CARGA)
      setCobros(VACIO)
    } finally {
      if (ultimoPedido.current === id) setCargando(false)
    }
  }

  // Marca pagado (con monto y forma de pago) o vuelve a pendiente.
  async function guardarCobro(jugadorId: string, cambio: CambioCobro): Promise<boolean> {
    if (!session || !evento) return false
    if (!editable) {
      setErrorGuardado('El evento está cerrado: no se pueden registrar pagos.')
      return false
    }

    const monto = cambio.pagado ? montoSugeridoDe(cambio.monto) : null
    if (cambio.pagado && monto == null) {
      setErrorGuardado('Ingresá un monto mayor a 0.')
      return false
    }

    setGuardandoId(jugadorId)
    setErrorGuardado(null)
    const { error } = await supabase
      .from('cobranzas')
      .upsert({
        evento_financiero_id: evento.id,
        jugador_id:           jugadorId,
        estado:               cambio.pagado ? 'pagado' : 'pendiente',
        monto,
        forma_de_pago:        cambio.pagado ? cambio.formaDePago : null,
        fecha_pago:           cambio.pagado ? fechaHoy() : null,
        registrado_por:       session.user.id,
      }, { onConflict: 'evento_financiero_id,jugador_id' })
    setGuardandoId(null)

    if (error) {
      setErrorGuardado('No se pudo guardar el pago: ' + error.message)
      return false
    }
    await recargar()
    return true
  }

  return {
    cargando,
    errorCarga,
    recargar,
    editable,
    cobros,
    guardandoId,
    errorGuardado,
    limpiarError: () => setErrorGuardado(null),
    guardarCobro,
  }
}

export type CobrosSubcomisionState = ReturnType<typeof useCobrosSubcomision>
