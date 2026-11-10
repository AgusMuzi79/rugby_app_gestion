'use client'

// Partidos del entrenador en el panel web: mismo flujo que la app
// (app/hooks/usePartido.ts + app/app/(entrenador)/partido.tsx):
// partido y equipo → asistencia del partido → mesa (titulares/suplentes entre
// los presentes) → resultado. Las divisiones infantiles sólo toman asistencia.
// Al volver a abrir se ve lo guardado (también lo cargado desde la app). Las
// reglas puras viven en web/lib (partidosWeb, equiposPartidoWeb, mesaPartido,
// cargaPartidoWeb, marcasSinGuardarWeb). La RLS
// limita lecturas y escrituras a las divisiones del entrenador.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import ErrorCarga from '@/components/ErrorCarga'
import { ventanaPartidos, elegirDivision, pasosPartido, type Paso } from '@/lib/partidosWeb'
import { sincronizarEquipos, type AccesoEquipos, type Equipo } from '@/lib/equiposPartidoWeb'
import {
  alternarPresente, asignarRol, contarMesa, jugadoresDeMesa,
  debeVerificarObligatorio, avisoMesaObligatoria, mensajeErrorMesa, leerPuntos,
  type JugadorPartido, type RolEnMesa,
} from '@/lib/mesaPartido'
import { abrirPaso, aplicarGuardado, aplicarResultado, type DestinoPartido } from '@/lib/cargaPartidoWeb'
import { presenciasSinGuardar, mesaSinGuardar, textoSinGuardar } from '@/lib/marcasSinGuardarWeb'
import { mensajeError } from '@/lib/mensajeErrorWeb'
import { fechaLocal } from '@/lib/informesAsistencia'
import {
  IndicadorPasos, PasoEquipo, PasoAsistencia, PasoMesa, PasoResultado,
  formatFecha, type PartidoEvento,
} from './PasosPartido'

interface Division { id: string; nombre: string; categoria: string }
interface JugadorBase { id: string; nombre_completo: string }

// Tabla `equipos`, del más viejo al más nuevo (con duplicados viejos se usa el más viejo).
const accesoEquipos: AccesoEquipos = {
  listar: async (divisionId) => {
    const { data, error } = await supabase
      .from('equipos').select('id, nombre').eq('division_id', divisionId).order('created_at').order('id')
    return { data, error }
  },
  crear: async (filas, modo) => {
    const { error } = modo === 'upsert'
      ? await supabase.from('equipos').upsert(filas, { onConflict: 'division_id,nombre', ignoreDuplicates: true })
      : await supabase.from('equipos').insert(filas)
    return { error }
  },
}

export default function PartidosEntrenadorPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [cargandoDivision, setCargandoDivision] = useState(false)
  const division = divisiones.find(d => d.id === divisionId) ?? null
  const esInfantil = division?.categoria === 'infantil'

  const [partidos, setPartidos] = useState<PartidoEvento[]>([])
  const [jugadoresBase, setJugadoresBase] = useState<JugadorBase[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const equipoObligatorio = equipos[0] ?? null
  const [partidoSel, setPartidoSel] = useState<PartidoEvento | null>(null)
  const [equipoSel, setEquipoSel] = useState<Equipo | null>(null)

  const [paso, setPaso] = useState<Paso>('equipo')
  const [cargandoTransicion, setCargandoTransicion] = useState(false)

  const [jugadores, setJugadores] = useState<JugadorPartido[]>([])
  const [presenciaGuardada, setPresenciaGuardada] = useState<Record<string, boolean>>({})
  const [rolesGuardados, setRolesGuardados] = useState<Record<string, RolEnMesa>>({})

  const [guardandoAsistencia, setGuardandoAsistencia] = useState(false)
  const [asistenciaGuardada, setAsistenciaGuardada] = useState(false)
  const [errorAsistencia, setErrorAsistencia] = useState<string | null>(null)

  const [guardandoMesa, setGuardandoMesa] = useState(false)
  const [mesaGuardada, setMesaGuardada] = useState(false)
  const [errorMesa, setErrorMesa] = useState<string | null>(null)

  const [puntosPropios, setPuntosPropios] = useState('')
  const [puntosRival, setPuntosRival] = useState('')
  const [rivalNombre, setRivalNombre] = useState('')
  const [guardandoResultado, setGuardandoResultado] = useState(false)
  const [resultadoGuardado, setResultadoGuardado] = useState(false)
  const [errorResultado, setErrorResultado] = useState<string | null>(null)

  // Un error de lectura nunca es "sin partidos": se muestra con REINTENTAR,
  // que repite exactamente lo que falló.
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const reintento = useRef<(() => void) | null>(null)
  // Sólo la última lectura de división escribe (cambio rápido de división).
  const ultimaLectura = useRef(0)
  // Same idea for the partido/equipo reads: changing the selection while a
  // read is in flight must not apply the old answer (a later save would write
  // the previous partido's marks or mesa under the new evento/equipo).
  const lecturaPartido = useRef(0)

  const fallo = (que: string, err: unknown, repetir: () => void) => {
    setErrorCarga(mensajeErrorCarga(que, err))
    reintento.current = repetir
  }
  const limpiarError = () => { setErrorCarga(null); reintento.current = null }

  // ─── Cambios sin guardar ───────────────────────────────────────────────────

  const sinGuardarAsistencia = partidoSel && paso !== 'equipo' ? presenciasSinGuardar(jugadores, presenciaGuardada) : 0
  const sinGuardarMesa = paso === 'mesa' ? mesaSinGuardar(jugadores, rolesGuardados) : 0
  const sinGuardar = sinGuardarAsistencia + sinGuardarMesa

  // Cerrar o recargar la pestaña con cambios sin guardar: el navegador pregunta.
  useEffect(() => {
    if (sinGuardar === 0) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [sinGuardar])

  // Con cambios sin guardar, primero se pregunta (como la app).
  const seguirSinGuardar = (): boolean => {
    if (sinGuardar === 0) return true
    const donde = partidoSel?.rival ? `el partido vs ${partidoSel.rival}` : 'este partido'
    return window.confirm(`${textoSinGuardar(sinGuardar, donde)} ¿Descartarlas?`)
  }

  // ─── Carga ─────────────────────────────────────────────────────────────────

  const reiniciarPartido = () => {
    lecturaPartido.current++
    setPartidoSel(null)
    setJugadores([])
    setPresenciaGuardada({})
    setRolesGuardados({})
    setAsistenciaGuardada(false)
    setMesaGuardada(false)
    setResultadoGuardado(false)
    setErrorAsistencia(null)
    setErrorMesa(null)
    setErrorResultado(null)
    setPaso('equipo')
  }

  // Jugadores activos, partidos (−7/+14 días) y equipos de una división.
  const cargarDivision = useCallback(async (div: Division, uid: string) => {
    const lectura = ++ultimaLectura.current
    setErrorCarga(null)
    reintento.current = null
    setDivisionId(div.id)
    setEquipoSel(null)
    setEquipos([])
    setPartidos([])

    const { desde, hasta } = ventanaPartidos()
    const [jgsRes, partidosRes] = await Promise.all([
      supabase.from('jugadores').select('id, nombre_completo').eq('division_id', div.id).eq('activo', true).order('nombre_completo'),
      supabase
        .from('eventos')
        .select('id, fecha, rival, lugar, resultados(evento_id)')
        .eq('tipo', 'partido')
        .eq('division_id', div.id)
        .eq('cancelado', false)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha'),
    ])
    if (lectura !== ultimaLectura.current) return

    const err = primerError(jgsRes.error, partidosRes.error)
    if (err) {
      setErrorCarga(mensajeErrorCarga('los partidos y el plantel', err))
      reintento.current = () => { void cargarDivision(div, uid) }
      return
    }

    setPartidos((partidosRes.data ?? []).map(p => ({
      id: p.id as string,
      fecha: p.fecha as string,
      rival: p.rival as string | null,
      lugar: p.lugar as string | null,
      conResultado: ((p.resultados as unknown[] | null) ?? []).length > 0,
    })))
    const base = (jgsRes.data ?? []) as JugadorBase[]
    setJugadoresBase(base)

    const r = await sincronizarEquipos(accesoEquipos, {
      divisionId: div.id, categoria: div.categoria, divisionNombre: div.nombre,
      cantidadJugadores: base.length, userId: uid,
    })
    if (lectura !== ultimaLectura.current) return
    if (r.error) {
      setErrorCarga(mensajeErrorCarga('los equipos', r.error))
      reintento.current = () => { void cargarDivision(div, uid) }
    }
    setEquipos(r.equipos)
    if (r.equipos.length === 1) setEquipoSel(r.equipos[0])
  }, [])

  // Divisiones del entrenador (profiles.divisiones) y la elegida.
  const cargarDatos = useCallback(async () => {
    setLoading(true)
    setErrorCarga(null)
    reintento.current = null
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw userError ?? new Error('Sin sesión')
      setUserId(user.id)
      const { data: perfil, error: perfilError } = await supabase
        .from('profiles').select('divisiones').eq('id', user.id).single()
      if (perfilError) throw perfilError
      const ids = ((perfil?.divisiones as string[] | null) ?? []).filter(Boolean)
      if (ids.length === 0) { setDivisiones([]); setLoading(false); return }

      const { data: divs, error: divsError } = await supabase
        .from('divisiones').select('id, nombre, categoria').in('id', ids).order('nombre')
      if (divsError) throw divsError
      const lista = (divs ?? []) as Division[]
      setDivisiones(lista)
      const elegida = lista.find(d => d.id === elegirDivision(lista, null, null))
      if (elegida) await cargarDivision(elegida, user.id)
    } catch (err) {
      setErrorCarga(mensajeErrorCarga('tus divisiones', err))
      reintento.current = () => { void cargarDatos() }
    }
    setLoading(false)
  }, [cargarDivision])

  useEffect(() => { void cargarDatos() }, [cargarDatos])

  const reintentar = () => {
    const r = reintento.current
    if (r) r()
    else void cargarDatos()
  }

  const seleccionarDivision = async (id: string) => {
    const div = divisiones.find(d => d.id === id)
    if (!div || !userId || id === divisionId) return
    if (!seguirSinGuardar()) return
    reiniciarPartido()
    setCargandoDivision(true)
    await cargarDivision(div, userId)
    setCargandoDivision(false)
  }

  // ─── Equipo y partido ──────────────────────────────────────────────────────

  const seleccionarPartido = (p: PartidoEvento) => {
    if (p.id === partidoSel?.id) return
    if (!seguirSinGuardar()) return
    reiniciarPartido()
    setPartidoSel(p)
  }

  const seleccionarEquipo = (e: Equipo) => {
    lecturaPartido.current++
    setEquipoSel(e)
    setMesaGuardada(false)
    setErrorMesa(null)
    setResultadoGuardado(false)
    setErrorResultado(null)
  }

  // Lee la asistencia del partido y la mesa del equipo y las aplica a la lista.
  const cargarPartido = async (
    partido: PartidoEvento, equipo: Equipo, base: JugadorBase[], vigente: () => boolean,
  ): Promise<unknown> => {
    setCargandoTransicion(true)
    const [asistRes, mesaRes] = await Promise.all([
      supabase.from('asistencias').select('jugador_id, estado').eq('evento_id', partido.id),
      supabase
        .from('mesas_de_partido')
        .select('id, mesa_jugadores(jugador_id, rol_en_mesa)')
        .eq('evento_id', partido.id)
        .eq('equipo_id', equipo.id)
        .maybeSingle(),
    ])
    // The selection changed meanwhile: drop this answer (irA checks it too).
    if (!vigente()) { setCargandoTransicion(false); return null }
    const err = primerError(asistRes.error, mesaRes.error)
    if (err) { setCargandoTransicion(false); return err }
    limpiarError()
    const cargado = aplicarGuardado(
      base,
      (asistRes.data ?? []) as { jugador_id: string; estado: string }[],
      mesaRes.data as { mesa_jugadores: { jugador_id: string; rol_en_mesa: string }[] | null } | null,
    )
    setJugadores(cargado.jugadores)
    setPresenciaGuardada(cargado.presenciaGuardada)
    setRolesGuardados(cargado.rolesGuardados)
    setAsistenciaGuardada(cargado.asistenciaGuardada)
    setMesaGuardada(cargado.mesaGuardada)
    setCargandoTransicion(false)
    return null
  }

  const irAResultado = async (partido: PartidoEvento, equipo: Equipo) => {
    const lectura = lecturaPartido.current
    setCargandoTransicion(true)
    const { data, error } = await supabase
      .from('resultados')
      .select('puntos_propios, puntos_rival, rival')
      .eq('evento_id', partido.id)
      .eq('equipo_id', equipo.id)
      .maybeSingle()
    if (lectura !== lecturaPartido.current) { setCargandoTransicion(false); return }
    // Si no se pudo leer, no se muestra un resultado vacío que pise el cargado.
    if (error) {
      fallo('el resultado del partido', error, () => { void irAResultado(partido, equipo) })
      setCargandoTransicion(false)
      return
    }
    limpiarError()
    const r = aplicarResultado(data as { puntos_propios: number; puntos_rival: number; rival: string | null } | null, partido.rival)
    setPuntosPropios(r.puntosPropios)
    setPuntosRival(r.puntosRival)
    setRivalNombre(r.rivalNombre)
    setResultadoGuardado(r.guardado)
    setErrorResultado(null)
    setCargandoTransicion(false)
    setPaso('resultado')
  }

  // Abre ASISTENCIA (o RESULTADO) cargando antes lo guardado; si la lectura
  // falla, REINTENTAR repite esta misma carga (lib/cargaPartidoWeb.ts).
  const abrirPartido = (partido: PartidoEvento, equipo: Equipo, destino: DestinoPartido) => {
    const lectura = ++lecturaPartido.current
    const vigente = () => lectura === lecturaPartido.current
    return abrirPaso({ partido, equipo, base: jugadoresBase, destino }, {
      cargar: (p, e, b) => cargarPartido(p, e, b, vigente),
      fallo: (err, repetir) => { if (vigente()) fallo('la asistencia y la mesa del partido', err, repetir) },
      irA: async (d, p, e) => {
        if (!vigente()) return
        if (d === 'resultado') await irAResultado(p, e)
        else setPaso('asistencia')
      },
    })
  }

  const continuarAAsistencia = () => {
    if (!partidoSel || !equipoSel) return
    void abrirPartido(partidoSel, equipoSel, 'asistencia')
  }

  // Volver al paso 1: al continuar se relee lo guardado, así que se pregunta.
  const volverAEquipo = () => {
    if (!seguirSinGuardar()) return
    setPaso('equipo')
  }

  // ─── Asistencia ────────────────────────────────────────────────────────────

  const marcarPresencia = (id: string, presente: boolean) => {
    const j = jugadores.find(x => x.id === id)
    if (!j || j.presente === presente) return
    setJugadores(prev => alternarPresente(prev, id))
    setAsistenciaGuardada(false)
  }

  const guardarAsistencia = async () => {
    if (!userId || !division || !partidoSel) return
    setGuardandoAsistencia(true)
    setErrorAsistencia(null)
    const payload = jugadores.map(j => ({
      evento_id: partidoSel.id,
      jugador_id: j.id,
      division_id: division.id,
      estado: j.presente ? 'presente' : 'ausente',
      registrado_por: userId,
    }))
    const { error } = await supabase.from('asistencias').upsert(payload, { onConflict: 'evento_id,jugador_id' })
    if (error) {
      console.warn('asistencia partido:', error)
      setErrorAsistencia(mensajeError(error, 'No se pudo guardar la asistencia. Probá de nuevo.'))
      setGuardandoAsistencia(false)
      return
    }

    setPresenciaGuardada(Object.fromEntries(jugadores.map(j => [j.id, j.presente])))
    setAsistenciaGuardada(true)
    setGuardandoAsistencia(false)
    if (!esInfantil) setPaso('mesa')
  }

  // ─── Mesa ──────────────────────────────────────────────────────────────────

  const asignar = (id: string, rol: RolEnMesa) => {
    setMesaGuardada(false)
    const r = asignarRol(jugadores, id, rol)
    setErrorMesa(r.error)
    setJugadores(r.jugadores)
  }

  const guardarMesa = async () => {
    if (!partidoSel || !equipoSel || !equipoObligatorio) return
    if (debeVerificarObligatorio({ esInfantil, equipoId: equipoSel.id, obligatorioId: equipoObligatorio.id })) {
      const { data: mesaOblig, error: obligErr } = await supabase
        .from('mesas_de_partido')
        .select('id')
        .eq('evento_id', partidoSel.id)
        .eq('equipo_id', equipoObligatorio.id)
        .maybeSingle()
      if (obligErr) {
        console.warn('verificar mesa obligatoria:', obligErr)
        setErrorMesa(mensajeError(obligErr, `No se pudo verificar la mesa de "${equipoObligatorio.nombre}". Probá de nuevo.`))
        return
      }
      if (!mesaOblig) { setErrorMesa(avisoMesaObligatoria(equipoObligatorio.nombre)); return }
    }

    const filas = jugadoresDeMesa(jugadores)
    setGuardandoMesa(true)
    setErrorMesa(null)
    // Mesa + jugadores en una sola transacción: si algo falla, la anterior queda como estaba.
    const { error } = await supabase.rpc('guardar_mesa', {
      p_evento: partidoSel.id,
      p_equipo: equipoSel.id,
      p_jugadores: filas,
    })
    if (error) {
      console.warn('guardar mesa:', error)
      setErrorMesa(mensajeErrorMesa(error))
      setGuardandoMesa(false)
      return
    }
    setRolesGuardados(Object.fromEntries(filas.map(f => [f.jugador_id, f.rol_en_mesa])))
    setMesaGuardada(true)
    setGuardandoMesa(false)
    if (!esInfantil) await irAResultado(partidoSel, equipoSel)
  }

  // Volver a la asistencia con la mesa sin guardar: se pregunta y, si se
  // descarta, la mesa vuelve a lo guardado (la app la relee de la base).
  const volverAAsistencia = () => {
    if (sinGuardarMesa > 0) {
      if (!window.confirm(`${textoSinGuardar(sinGuardarMesa, 'la mesa')} ¿Descartarlas?`)) return
      setJugadores(prev => prev.map(j => ({ ...j, rolEnMesa: j.presente ? (rolesGuardados[j.id] ?? null) : null })))
      setErrorMesa(null)
    }
    setPaso('asistencia')
  }

  // ─── Resultado ─────────────────────────────────────────────────────────────

  const guardarResultado = async () => {
    if (!userId || !partidoSel || !equipoSel) return
    const puntos = leerPuntos(puntosPropios, puntosRival)
    if ('error' in puntos) { setErrorResultado(puntos.error); return }
    setGuardandoResultado(true)
    setErrorResultado(null)
    const { error } = await supabase.from('resultados').upsert({
      evento_id: partidoSel.id,
      equipo_id: equipoSel.id,
      puntos_propios: puntos.propios,
      puntos_rival: puntos.rival,
      rival: rivalNombre.trim() || null,
      registrado_por: userId,
    }, { onConflict: 'evento_id,equipo_id' })
    if (error) {
      console.warn('guardar resultado:', error)
      setErrorResultado(mensajeError(error, 'No se pudo guardar el resultado. Probá de nuevo.'))
      setGuardandoResultado(false)
      return
    }
    setResultadoGuardado(true)
    setGuardandoResultado(false)
    // Sale de "SIN RESULTADO" sin recargar la lista.
    const id = partidoSel.id
    setPartidos(prev => prev.map(p => p.id === id ? { ...p, conResultado: true } : p))
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const hoy = fechaLocal()
  const pasos = pasosPartido(esInfantil)
  const conteo = useMemo(() => contarMesa(jugadores), [jugadores])
  const presentes = useMemo(() => jugadores.filter(j => j.presente), [jugadores])

  const subtitulo: Record<Paso, string> = {
    equipo: 'Equipo · Partido',
    asistencia: equipoSel ? `Asistencia · ${equipoSel.nombre}` : 'Asistencia',
    mesa: equipoSel ? `Mesa · ${equipoSel.nombre}` : 'Mesa de partido',
    resultado: 'Resultado',
  }

  const encabezado = (
    <>
      <p className="font-lora text-xs tracking-widest text-texto-2 mb-1">ENTRENADOR · PARTIDOS</p>
      <h1 className="font-playfair italic text-4xl font-black text-tinta mb-6">Partidos</h1>
    </>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-lora text-texto-2 tracking-widest text-sm">CARGANDO…</p>
      </div>
    )
  }

  if (divisiones.length === 0) {
    return (
      <div>
        {encabezado}
        {errorCarga ? (
          <ErrorCarga mensaje={errorCarga} onReintentar={reintentar} />
        ) : (
          <p className="font-lora text-texto-2 text-sm text-center py-12">
            No tenés divisiones asignadas. Pedile a tu coordinador o a la subcomisión que te asigne una.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        {encabezado}
        <div className="flex flex-wrap items-center gap-4">
          {divisiones.length > 1 && paso === 'equipo' ? (
            <select
              aria-label="División"
              value={divisionId ?? ''}
              disabled={cargandoDivision}
              onChange={e => { void seleccionarDivision(e.target.value) }}
              className="font-lora text-sm text-tinta bg-card border border-borde-control px-4 py-2 outline-none focus:border-tinta transition-colors"
            >
              {divisiones.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          ) : (
            <p className="font-lora text-sm text-tinta">{division?.nombre ?? ''}</p>
          )}
          {partidoSel && paso !== 'equipo' && (
            <p className="font-lora text-sm text-texto-2">
              vs {partidoSel.rival ?? 'Rival por confirmar'} · {formatFecha(partidoSel.fecha)}
            </p>
          )}
        </div>
        <p className="font-playfair text-xl font-bold text-tinta mt-4">{subtitulo[paso]}</p>
      </div>

      <IndicadorPasos pasos={pasos} actual={paso} />

      {errorCarga && <ErrorCarga mensaje={errorCarga} onReintentar={reintentar} className="mb-6" />}

      {cargandoDivision && (
        <p className="font-lora text-texto-2 tracking-widest text-sm py-12 text-center">CARGANDO…</p>
      )}

      {paso === 'equipo' && !cargandoDivision && (
        <PasoEquipo
          partidos={partidos}
          partidoSeleccionado={partidoSel}
          onSeleccionarPartido={seleccionarPartido}
          equipos={equipos}
          equipoObligatorio={equipoObligatorio}
          equipoSeleccionado={equipoSel}
          onSeleccionarEquipo={seleccionarEquipo}
          onContinuar={continuarAAsistencia}
          cargando={cargandoTransicion}
          registraResultado={!esInfantil}
          hayError={!!errorCarga}
          hoy={hoy}
        />
      )}

      {paso === 'asistencia' && (
        <PasoAsistencia
          jugadores={jugadores}
          guardando={guardandoAsistencia}
          guardada={asistenciaGuardada}
          error={errorAsistencia}
          esInfantil={esInfantil}
          onToggle={marcarPresencia}
          onGuardar={() => { void guardarAsistencia() }}
          onVolver={volverAEquipo}
        />
      )}

      {paso === 'mesa' && (
        <PasoMesa
          presentes={presentes}
          conteo={conteo}
          guardando={guardandoMesa}
          guardada={mesaGuardada}
          error={errorMesa}
          onAsignar={asignar}
          onGuardar={() => { void guardarMesa() }}
          onVolver={volverAAsistencia}
          onIrAResultado={() => { if (partidoSel && equipoSel) void irAResultado(partidoSel, equipoSel) }}
        />
      )}

      {paso === 'resultado' && (
        <PasoResultado
          puntosPropios={puntosPropios}
          puntosRival={puntosRival}
          rivalNombre={rivalNombre}
          guardando={guardandoResultado}
          guardado={resultadoGuardado}
          error={errorResultado}
          onChangePropios={setPuntosPropios}
          onChangeRival={setPuntosRival}
          onChangeRivalNombre={setRivalNombre}
          onGuardar={() => { void guardarResultado() }}
          onVolver={() => setPaso('mesa')}
        />
      )}
    </div>
  )
}
