'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  COMENTARIO_MAX, CONFIG_DEFAULT, configDesde, diaCorto, duracionTexto, etiquetaDia, faltaParaReservar, fechasReservables,
  formatearFecha, formatearFechaHora, formatearPrecio, horarioDesde, horariosDisponibles, horariosPorFranja, hoyArgentina,
  jugadoresPayload, jugadoresRequeridos, jugadorVacio, normalizarDni, resumenPrecios, textoHorario, validarComentario,
  validarJugadores, validarTitular,
  type Cancha, type JugadorForm, type Libre, type Modalidad, type PasoFaltante, type TenisConfig, type Titular,
} from '@/lib/tenis'
import { tenisInvitados, type Resultado } from './api'
import AvisoSanciones from './AvisoSanciones'
import { Campo, CampoTexto, ETIQUETA_GRUPO, Opcion, Paso, Seccion } from './ui'

// tenis-invitados `disponibilidad`: free starts per match type come computed
// by the function (`libres`, already within that weekday's opening hours);
// `horario` = the day's hours (null = closed); `ocupados` is not needed here.
type Disponibilidad = {
  config?: Partial<TenisConfig>
  horario?: unknown
  canchas?: Cancha[]
  libres?: { singles?: Libre[]; dobles?: Libre[] }
}
type RespuestaReservar = {
  reserva_id?: string
  hold_vence_at?: string | null
  total?: number
  jugadores?: { nombre: string; cargo: number; motivo?: string | null; es_titular?: boolean }[]
  email_enviado?: boolean
}
// What was booked, kept for the "pending" screen (the grid may reload after).
type Reservado = { fecha: string; cancha: Cancha; empieza: string; modalidad: Modalidad }

const TITULAR_VACIO: Titular = { dni: '', nombre: '', apellido: '', email: '' }
const NOMBRE_MODALIDAD: Record<Modalidad, string> = { singles: 'Singles', dobles: 'Dobles' }
const BOTON_SECUNDARIO =
  'font-lora text-sm text-tinta bg-card border border-borde-control px-4 min-h-11 hover:border-oro transition-colors'

function capitalizar(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function ReservarForm() {
  // Bookable days come from the clock and the server `anticipacion_dias`
  // (default until the first `disponibilidad` answers). `hoy` is refreshed on
  // focus and every minute so a page left open past midnight rolls over.
  const [hoy, setHoy] = useState(() => hoyArgentina())
  const [anticipacion, setAnticipacion] = useState(CONFIG_DEFAULT.anticipacion_dias)
  const fechas = useMemo(
    () => fechasReservables(new Date(hoy + 'T12:00:00-03:00'), anticipacion),
    [hoy, anticipacion],
  )
  const [fecha, setFecha] = useState(fechas[0])
  const [modalidad, setModalidad] = useState<Modalidad>('singles')
  const [disp, setDisp] = useState<{ estado: 'cargando' | 'ok' | 'error'; data?: Disponibilidad; error?: string }>({ estado: 'cargando' })
  // Time first (`inicio` of the start), then one of the courts free at it.
  const [horaSel, setHoraSel] = useState<string | null>(null)
  const [canchaSel, setCanchaSel] = useState<string | null>(null)
  const [titular, setTitular] = useState<Titular>(TITULAR_VACIO)
  const [jugadores, setJugadores] = useState<JugadorForm[]>([jugadorVacio()])
  const [comentario, setComentario] = useState('')
  const [intentado, setIntentado] = useState(false)
  // Fields left at least once: their errors show inline before any submit.
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set())
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [listo, setListo] = useState<RespuestaReservar | null>(null)
  const [reservado, setReservado] = useState<Reservado | null>(null)
  // Sanctions notice open: the booking is sent only after "ENTENDIDO, RESERVAR".
  const [avisando, setAvisando] = useState(false)
  const pedido = useRef(0)
  // Synchronous in-flight guard: a second submit before React re-renders
  // (double click, Enter + click) must not create a second hold and email.
  const enviandoRef = useRef(false)
  const listoRef = useRef<HTMLHeadingElement>(null)

  const cargar = useCallback(async (f: string) => {
    const n = ++pedido.current
    setDisp({ estado: 'cargando' })
    const r = await tenisInvitados<Disponibilidad>('disponibilidad', { fecha: f })
    if (n !== pedido.current) return // a newer date was picked
    setDisp(r.ok ? { estado: 'ok', data: r.data } : { estado: 'error', error: r.error })
  }, [])

  useEffect(() => { void cargar(fecha) }, [fecha, cargar])

  useEffect(() => {
    const actualizar = () => setHoy(hoyArgentina())
    const alVolver = () => { if (document.visibilityState === 'visible') actualizar() }
    window.addEventListener('focus', actualizar)
    document.addEventListener('visibilitychange', alVolver)
    const t = setInterval(actualizar, 60_000)
    return () => {
      window.removeEventListener('focus', actualizar)
      document.removeEventListener('visibilitychange', alVolver)
      clearInterval(t)
    }
  }, [])

  // Server config: its `anticipacion_dias` decides the days offered.
  useEffect(() => {
    if (disp.estado === 'ok') setAnticipacion(configDesde(disp.data?.config).anticipacion_dias)
  }, [disp])

  // The selected day is no longer bookable (midnight passed or the server
  // allows fewer days): move to the first bookable one.
  useEffect(() => {
    if (!fechas.includes(fecha)) setFecha(fechas[0])
  }, [fechas, fecha])
  useEffect(() => { if (listo) listoRef.current?.focus() }, [listo])

  const config = configDesde(disp.data?.config)
  // Opening hours of the chosen day (undefined while loading or from an older function).
  const horarioDia = disp.estado === 'ok' ? horarioDesde(disp.data?.horario) : undefined
  // One deduplicated list of start times free in at least one court.
  const horarios = useMemo(() => disp.estado === 'ok'
    ? horariosDisponibles(disp.data?.canchas ?? [], disp.data?.libres, modalidad)
    : [],
  [disp, modalidad])
  const franjas = useMemo(() => horariosPorFranja(horarios), [horarios])
  const horario = horarios.find(h => h.inicio === horaSel) ?? null
  const cancha = horario?.canchas.find(c => c.id === canchaSel) ?? null

  // Another day, match type or a reloaded grid: drop a time that is no longer
  // free, and move the court to the first free one at the chosen time.
  useEffect(() => {
    if (!horaSel) return
    const h = horarios.find(x => x.inicio === horaSel)
    if (!h) { setHoraSel(null); setCanchaSel(null); return }
    if (!canchaSel || !h.canchas.some(c => c.id === canchaSel)) setCanchaSel(h.canchas[0]?.id ?? null)
  }, [horarios, horaSel, canchaSel])

  function elegirHorario(inicio: string) {
    setHoraSel(inicio)
    setCanchaSel(horarios.find(h => h.inicio === inicio)?.canchas[0]?.id ?? null)
    setErrorEnvio(null)
  }

  function cambiarModalidad(m: Modalidad) {
    setModalidad(m)
    const n = jugadoresRequeridos(m)
    setJugadores(prev => Array.from({ length: n }, (_, i) => prev[i] ?? jugadorVacio()))
  }

  function editarJugador(i: number, cambio: Partial<JugadorForm>) {
    setJugadores(prev => prev.map((j, k) => (k === i ? { ...j, ...cambio } : j)))
  }

  function tocar(id: string) {
    setTocados(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
  }
  const ver = (id: string, error: string | undefined) => (intentado || tocados.has(id) ? error : undefined)

  const erroresTitular = validarTitular(titular)
  const erroresJugadores = validarJugadores(jugadores, titular.dni)
  const errorComentario = validarComentario(comentario)
  const resumen = resumenPrecios(modalidad, jugadores, config)
  const falta = faltaParaReservar({
    hayHorario: !!horario, hayCancha: !!cancha, modalidad, erroresTitular, erroresJugadores,
  })

  // Takes the visitor to the first missing step: the first invalid field, or
  // the step heading for the time and court pickers.
  function irA(paso: PasoFaltante) {
    let id = `paso-${paso}-titulo`
    if (paso === 'titular') {
      const k = (['dni', 'nombre', 'apellido', 'email'] as const).find(c => erroresTitular[c])
      if (k) id = `titular-${k}`
    } else if (paso === 'jugadores') {
      const i = erroresJugadores.findIndex(e => Object.keys(e).length > 0)
      const k = (['dni', 'nombre', 'apellido'] as const).find(c => erroresJugadores[i]?.[c])
      if (i >= 0 && k) id = `jugador-${i}-${k}`
    }
    const el = document.getElementById(id)
    if (!el) return
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'center', behavior: reducir ? 'auto' : 'smooth' })
    el.focus({ preventScroll: true })
  }

  // Submit validates and opens the sanctions notice; `reservar` sends. While
  // something is missing the button is aria-disabled: pressing it shows the
  // errors and takes the visitor to the first missing step.
  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviandoRef.current) return
    setIntentado(true)
    setErrorEnvio(null)
    if (falta) { irA(falta.paso); return }
    if (errorComentario) { document.getElementById('comentario')?.focus(); return }
    setAvisando(true)
  }

  async function reservar() {
    setAvisando(false)
    if (enviandoRef.current || !horario || !cancha) return
    enviandoRef.current = true
    setEnviando(true)
    let r: Resultado<RespuestaReservar>
    try {
      r = await tenisInvitados<RespuestaReservar>('reservar', {
        cancha_id: cancha.id,
        inicio: horario.inicio,
        modalidad,
        titular: {
          dni: normalizarDni(titular.dni),
          nombre: titular.nombre.trim(),
          apellido: titular.apellido.trim(),
          email: titular.email.trim().toLowerCase(),
        },
        jugadores: jugadoresPayload(jugadores),
        // Optional; an empty comment is not sent.
        comentario: comentario.trim() || undefined,
      })
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
    if (r.ok) {
      setReservado({ fecha, cancha, empieza: horario.horaReal, modalidad })
      setListo(r.data)
      return
    }
    setErrorEnvio(r.error)
    // The grid changed since it was loaded: reload the free starts.
    if (r.codigo === 'turno_ocupado' || r.codigo === 'bloqueado' || r.codigo === 'hueco_invalido') void cargar(fecha)
    // A DNI that is not a member: switch that player to "No socio" so the name fields show up.
    if (r.codigo === 'jugador_sin_nombre' && typeof r.data?.dni === 'string') {
      const dni = r.data.dni
      setJugadores(prev => prev.map(j => (normalizarDni(j.dni) === dni ? { ...j, tipo: 'invitado' } : j)))
    }
  }

  if (listo) {
    return (
      <Seccion titulo="Reserva pendiente">
        <h2 ref={listoRef} tabIndex={-1} className="font-playfair italic text-2xl text-oro mb-3 outline-none">
          {listo.email_enviado === false
            ? 'No pudimos mandarte el mail de confirmación'
            : `Revisá tu mail: tenés ${config.hold_min} minutos para confirmar la reserva`}
        </h2>
        <div className="font-lora text-sm text-tinta/85 leading-relaxed flex flex-col gap-3">
          {listo.email_enviado === false ? (
            <p role="alert" className="text-rojo-texto">
              No pudimos mandar el mail a <strong>{titular.email.trim()}</strong>. Sin el enlace no se puede
              confirmar: el turno queda guardado sin confirmar y se libera solo en {config.hold_min} minutos.
              Después revisá el email y volvé a reservar.
            </p>
          ) : (
            <p>
              Te mandamos un enlace a <strong className="text-tinta">{titular.email.trim()}</strong>. Si no lo
              abrís a tiempo, el turno se libera. Revisá también la carpeta de spam.
            </p>
          )}
          {reservado && (
            <p>
              Cancha {reservado.cancha.nombre} · {formatearFecha(reservado.fecha)} · empieza{' '}
              <span className="tabular-nums">{reservado.empieza}</span> · {NOMBRE_MODALIDAD[reservado.modalidad]}
            </p>
          )}
          {listo.hold_vence_at && <p>Confirmá antes de: {formatearFechaHora(listo.hold_vence_at)}.</p>}
          {listo.jugadores && listo.jugadores.length > 0 && (
            <ul className="flex flex-col gap-1">
              {listo.jugadores.map((j, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>{j.nombre}</span><span className="tabular-nums">{formatearPrecio(j.cargo)}</span>
                </li>
              ))}
            </ul>
          )}
          {typeof listo.total === 'number' && (
            <p className="text-tinta font-semibold tabular-nums">Total a transferir: {formatearPrecio(listo.total)}</p>
          )}
        </div>
      </Seccion>
    )
  }

  const seleccionTexto = [
    capitalizar(diaCorto(fecha)),
    horario?.horaReal,
    cancha ? `Cancha ${cancha.nombre}` : null,
    NOMBRE_MODALIDAD[modalidad],
  ].filter(Boolean).join(' · ')
  const siguienteDia = fechas[fechas.indexOf(fecha) + 1]
  const listoParaReservar = !falta

  return (
    <form onSubmit={enviar} noValidate aria-busy={enviando}>
      {/* Every control is disabled while the booking is being sent. */}
      <fieldset disabled={enviando} className="min-w-0 border-0 p-0 m-0">
        <Paso id="paso-dia" titulo="Día y partido">
          <fieldset className="mb-5">
            <legend className={ETIQUETA_GRUPO}>Día</legend>
            <div className="flex flex-wrap gap-2">
              {fechas.map(f => (
                <Opcion key={f} activo={f === fecha} onClick={() => setFecha(f)} label={formatearFecha(f)}>
                  <span className="tabular-nums">{etiquetaDia(f, hoy)}</span>
                </Opcion>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className={ETIQUETA_GRUPO}>Partido</legend>
            <div className="flex flex-wrap gap-2">
              <Opcion activo={modalidad === 'singles'} onClick={() => cambiarModalidad('singles')}>
                Singles · {duracionTexto(config.singles_min)}
              </Opcion>
              <Opcion activo={modalidad === 'dobles'} onClick={() => cambiarModalidad('dobles')}>
                Dobles · {duracionTexto(config.dobles_min)}
              </Opcion>
            </div>
          </fieldset>
        </Paso>

        <Paso id="paso-horario" titulo="Horario">
          <p className="font-lora text-sm text-texto-2 mb-4">
            {horarioDia && <>Este día las canchas abren {textoHorario(horarioDia)}. </>}
            Ves la hora real de inicio: el turno arranca {config.margen_inicio_min} minutos después del horario
            reservado (barrido de cancha).
          </p>
          {disp.estado === 'cargando' && (
            <div role="status">
              <span className="sr-only">Cargando horarios…</span>
              <div aria-hidden className="grid grid-cols-3 min-[360px]:grid-cols-4 sm:grid-cols-5 gap-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="h-16 bg-card border border-gris-claro motion-safe:animate-pulse" />
                ))}
              </div>
            </div>
          )}
          {disp.estado === 'error' && (
            <div role="alert" className="font-lora text-sm flex flex-col gap-3 items-start">
              <p className="text-rojo-texto">No pudimos cargar los horarios. {disp.error}</p>
              <button type="button" onClick={() => void cargar(fecha)} className={BOTON_SECUNDARIO}>Reintentar</button>
            </div>
          )}
          {disp.estado === 'ok' && horarios.length === 0 && (
            <div className="font-lora text-sm flex flex-col gap-3 items-start">
              <p className="text-tinta/85">
                {horarioDia === null
                  ? 'Las canchas están cerradas este día. Probá con otro día.'
                  : 'No quedan turnos libres para este día. Probá con otro día.'}
              </p>
              {siguienteDia && (
                <button type="button" onClick={() => setFecha(siguienteDia)} className={BOTON_SECUNDARIO}>
                  Ver {etiquetaDia(siguienteDia, hoy)}
                </button>
              )}
            </div>
          )}
          {disp.estado === 'ok' && franjas.map(f => (
            <fieldset key={f.franja} className="mb-5 last:mb-0">
              <legend className={ETIQUETA_GRUPO}>{f.titulo}</legend>
              <div className="grid grid-cols-3 min-[360px]:grid-cols-4 sm:grid-cols-5 gap-2">
                {f.horarios.map(h => {
                  const activo = h.inicio === horaSel
                  const n = h.canchas.length
                  return (
                    <Opcion
                      key={h.inicio}
                      activo={activo}
                      onClick={() => elegirHorario(h.inicio)}
                      label={`Empieza ${h.horaReal}, ${n} ${n === 1 ? 'cancha libre' : 'canchas libres'}`}
                      className="flex flex-col items-center justify-center gap-1 min-h-16"
                    >
                      <span className="text-lg leading-none tabular-nums">{h.horaReal}</span>
                      <span className={`text-xs font-normal ${activo ? 'text-papel' : 'text-texto-2'}`}>
                        {n} {n === 1 ? 'cancha' : 'canchas'}
                      </span>
                    </Opcion>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </Paso>

        {horario && (
          <Paso id="paso-cancha" titulo="Cancha">
            <fieldset>
              <legend className={ETIQUETA_GRUPO}>
                Libres a las <span className="tabular-nums">{horario.horaReal}</span>
              </legend>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {horario.canchas.map(c => (
                  <Opcion key={c.id} activo={c.id === canchaSel} onClick={() => setCanchaSel(c.id)}>
                    <span className="tabular-nums">Cancha {c.nombre}</span>
                  </Opcion>
                ))}
              </div>
            </fieldset>
          </Paso>
        )}

        <Paso id="paso-titular" titulo="Tus datos">
          <div className="flex flex-col gap-4">
            <Campo id="titular-dni" label="DNI" inputMode="numeric" autoComplete="off" ayuda="7 u 8 números."
              value={titular.dni} onChange={v => setTitular({ ...titular, dni: v })}
              onBlur={() => tocar('titular-dni')} error={ver('titular-dni', erroresTitular.dni)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="titular-nombre" label="Nombre" autoComplete="given-name" value={titular.nombre}
                onChange={v => setTitular({ ...titular, nombre: v })}
                onBlur={() => tocar('titular-nombre')} error={ver('titular-nombre', erroresTitular.nombre)} />
              <Campo id="titular-apellido" label="Apellido" autoComplete="family-name" value={titular.apellido}
                onChange={v => setTitular({ ...titular, apellido: v })}
                onBlur={() => tocar('titular-apellido')} error={ver('titular-apellido', erroresTitular.apellido)} />
            </div>
            <Campo id="titular-email" label="Email" type="email" inputMode="email" autoComplete="email"
              ayuda="Te mandamos el enlace para confirmar la reserva." value={titular.email}
              onChange={v => setTitular({ ...titular, email: v })}
              onBlur={() => tocar('titular-email')} error={ver('titular-email', erroresTitular.email)} />
            <p className="font-lora text-sm text-tinta/85">
              Sos responsable de la reserva: si nadie se presenta, se te cobra el turno completo.
            </p>
          </div>
        </Paso>

        <Paso id="paso-jugadores" titulo={jugadores.length === 1 ? 'Tu rival' : 'Los otros jugadores'}>
          <div className="flex flex-col gap-6">
            {jugadores.map((j, i) => {
              const err = erroresJugadores[i] ?? {}
              const base = `jugador-${i}`
              return (
                <fieldset key={i} className="flex flex-col gap-4 border-t border-gris-claro pt-5 first:border-t-0 first:pt-0">
                  <legend className={ETIQUETA_GRUPO}>Jugador {i + 2}</legend>
                  <div className="flex flex-wrap gap-2">
                    <Opcion activo={j.tipo === 'socio'} onClick={() => editarJugador(i, { tipo: 'socio' })}>Socio del club</Opcion>
                    <Opcion activo={j.tipo === 'invitado'} onClick={() => editarJugador(i, { tipo: 'invitado' })}>No socio</Opcion>
                  </div>
                  <Campo id={`${base}-dni`} label="DNI" inputMode="numeric" autoComplete="off"
                    ayuda={j.tipo === 'socio' ? 'Con el DNI alcanza.' : undefined} value={j.dni}
                    onChange={v => editarJugador(i, { dni: v })}
                    onBlur={() => tocar(`${base}-dni`)} error={ver(`${base}-dni`, err.dni)} />
                  {j.tipo === 'invitado' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Campo id={`${base}-nombre`} label="Nombre" autoComplete="off" value={j.nombre}
                        onChange={v => editarJugador(i, { nombre: v })}
                        onBlur={() => tocar(`${base}-nombre`)} error={ver(`${base}-nombre`, err.nombre)} />
                      <Campo id={`${base}-apellido`} label="Apellido" autoComplete="off" value={j.apellido}
                        onChange={v => editarJugador(i, { apellido: v })}
                        onBlur={() => tocar(`${base}-apellido`)} error={ver(`${base}-apellido`, err.apellido)} />
                    </div>
                  )}
                </fieldset>
              )
            })}
          </div>
        </Paso>

        <Paso id="paso-comentario" titulo="Comentario">
          <CampoTexto id="comentario" label="Comentario (opcional)" max={COMENTARIO_MAX} value={comentario}
            onChange={setComentario} error={errorComentario}
            ayuda="Lo ve el club. Por ejemplo, si alguien llega más tarde." />
        </Paso>

        <Paso id="paso-resumen" titulo="Resumen">
          <ul className="font-lora text-sm text-tinta/85 flex flex-col gap-2 mb-3">
            {resumen.lineas.map((l, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span>{l.etiqueta}</span>
                <span className={l.precio === null ? 'text-texto-2' : 'text-tinta tabular-nums'}>
                  {l.precio === null ? 'precio según socio' : formatearPrecio(l.precio)}
                </span>
              </li>
            ))}
          </ul>
          <p className="font-lora text-base text-tinta font-semibold flex justify-between gap-4 border-t border-gris-claro pt-3">
            <span>Total{resumen.hayPendientes ? ' (sin socios)' : ''}</span>
            <span className="tabular-nums">{formatearPrecio(resumen.total)}</span>
          </p>
          <p className="font-lora text-sm text-texto-2 mt-3">
            El pago es por transferencia. Después de confirmar por mail, subís el comprobante hasta{' '}
            {config.comprobante_horas_antes} horas antes del turno.
          </p>
        </Paso>
      </fieldset>

      {/* Booking bar: sticks to the bottom of the viewport while the form
          scrolls, inside the page width. It sits in the flow after the last
          step, so it never covers it. */}
      <div className="sticky bottom-0 z-10 mt-10 -mx-4 sm:-mx-6 border-t border-gris-claro bg-dark px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {errorEnvio && <p role="alert" className="font-lora text-sm text-rojo-texto mb-2">{errorEnvio}</p>}
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1 font-lora">
            <p className="text-sm text-tinta/85 truncate tabular-nums">{seleccionTexto}</p>
            <p className="flex items-baseline gap-2 min-w-0" aria-live="polite">
              <span className="text-xl font-semibold text-tinta tabular-nums">{formatearPrecio(resumen.total)}</span>
              {falta
                ? <span className="text-sm text-oro truncate">{falta.mensaje}</span>
                : <span className="text-sm text-texto-2 truncate">{resumen.hayPendientes ? 'sin contar socios' : 'en total'}</span>}
            </p>
          </div>
          <button
            type="submit"
            disabled={enviando}
            aria-disabled={listoParaReservar ? undefined : true}
            className={`shrink-0 font-lora text-sm font-semibold tracking-wider px-6 min-h-12 border transition-colors disabled:opacity-60 ${
              listoParaReservar
                ? 'bg-oro text-papel border-oro hover:bg-oro/90'
                : 'bg-transparent text-texto-2 border-borde-control hover:border-oro hover:text-tinta'
            }`}
          >
            {enviando ? 'RESERVANDO…' : 'RESERVAR'}
          </button>
        </div>
      </div>
      {avisando && <AvisoSanciones onVolver={() => setAvisando(false)} onConfirmar={() => void reservar()} />}
    </form>
  )
}
