'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  configDesde, fechasReservables, formatearFecha, formatearFechaHora, formatearPrecio,
  jugadoresPayload, jugadoresRequeridos, jugadorVacio, normalizarDni, resumenPrecios, sinErrores,
  turnosLibres, validarJugadores, validarTitular,
  type Cancha, type JugadorForm, type Modalidad, type Ocupado, type TenisConfig, type Titular, type Turno,
} from '@/lib/tenis'
import { tenisInvitados } from './api'
import { Aviso, BotonPrincipal, Campo, Opcion, Seccion } from './ui'

type Disponibilidad = { config?: Partial<TenisConfig>; canchas?: Cancha[]; items?: Ocupado[] }
type RespuestaReservar = {
  reserva_id?: string
  hold_vence_at?: string
  total?: number
  jugadores?: { nombre: string; cargo: number; motivo?: string }[]
}
type Seleccion = { cancha: Cancha; turno: Turno }

const TITULAR_VACIO: Titular = { dni: '', nombre: '', apellido: '', email: '' }

export default function ReservarForm() {
  const fechas = useMemo(() => fechasReservables(), [])
  const [fecha, setFecha] = useState(fechas[0])
  const [modalidad, setModalidad] = useState<Modalidad>('singles')
  const [disp, setDisp] = useState<{ estado: 'cargando' | 'ok' | 'error'; data?: Disponibilidad; error?: string }>({ estado: 'cargando' })
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null)
  const [titular, setTitular] = useState<Titular>(TITULAR_VACIO)
  const [jugadores, setJugadores] = useState<JugadorForm[]>([jugadorVacio()])
  const [intentado, setIntentado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [listo, setListo] = useState<RespuestaReservar | null>(null)
  const pedido = useRef(0)
  const listoRef = useRef<HTMLHeadingElement>(null)

  const cargar = useCallback(async (f: string) => {
    const n = ++pedido.current
    setDisp({ estado: 'cargando' })
    const r = await tenisInvitados<Disponibilidad>('disponibilidad', { fecha: f })
    if (n !== pedido.current) return // a newer date was picked
    setDisp(r.ok ? { estado: 'ok', data: r.data } : { estado: 'error', error: r.error })
  }, [])

  useEffect(() => { void cargar(fecha) }, [fecha, cargar])
  useEffect(() => { if (listo) listoRef.current?.focus() }, [listo])

  const config = configDesde(disp.data?.config)
  const libres = useMemo(() => disp.estado === 'ok'
    ? turnosLibres({ fecha, modalidad, config, canchas: disp.data?.canchas ?? [], items: disp.data?.items ?? [] })
    : [],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [disp, fecha, modalidad])

  // Selection no longer free (other match type or reloaded grid) → drop it.
  useEffect(() => {
    if (seleccion && !libres.some(c => c.cancha.id === seleccion.cancha.id && c.turnos.some(t => t.inicio === seleccion.turno.inicio))) {
      setSeleccion(null)
    }
  }, [libres, seleccion])

  function cambiarModalidad(m: Modalidad) {
    setModalidad(m)
    const n = jugadoresRequeridos(m)
    setJugadores(prev => Array.from({ length: n }, (_, i) => prev[i] ?? jugadorVacio()))
  }

  function editarJugador(i: number, cambio: Partial<JugadorForm>) {
    setJugadores(prev => prev.map((j, k) => (k === i ? { ...j, ...cambio } : j)))
  }

  const erroresTitular = validarTitular(titular)
  const erroresJugadores = validarJugadores(jugadores, titular.dni)
  const resumen = resumenPrecios(modalidad, jugadores, config)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setIntentado(true)
    setErrorEnvio(null)
    if (!seleccion) { setErrorEnvio('Elegí una cancha y un horario.'); return }
    if (!sinErrores(erroresTitular) || !sinErrores(erroresJugadores)) {
      setErrorEnvio('Revisá los datos marcados.')
      return
    }
    setEnviando(true)
    const r = await tenisInvitados<RespuestaReservar>('reservar', {
      fecha,
      cancha_id: seleccion.cancha.id,
      inicio: seleccion.turno.inicio,
      modalidad,
      titular: {
        dni: normalizarDni(titular.dni),
        nombre: titular.nombre.trim(),
        apellido: titular.apellido.trim(),
        email: titular.email.trim().toLowerCase(),
      },
      jugadores: jugadoresPayload(jugadores),
    })
    setEnviando(false)
    if (r.ok) { setListo(r.data); return }
    setErrorEnvio(r.error)
    if (r.codigo === 'turno_ocupado') void cargar(fecha)
  }

  if (listo) {
    return (
      <Seccion titulo="Reserva pendiente">
        <h2 ref={listoRef} tabIndex={-1} className="font-playfair italic text-2xl text-oro mb-3 outline-none">
          Revisá tu mail: tenés {config.hold_min} minutos para confirmar la reserva
        </h2>
        <div className="font-lora text-sm text-tinta/80 leading-relaxed flex flex-col gap-3">
          <p>
            Te mandamos un enlace a <strong className="text-tinta">{titular.email.trim()}</strong>. Si no lo
            abrís a tiempo, el turno se libera. Revisá también la carpeta de spam.
          </p>
          {seleccion && (
            <p>
              Cancha {seleccion.cancha.nombre} · {formatearFecha(fecha)} · empieza {seleccion.turno.empieza} ·{' '}
              {modalidad === 'singles' ? 'Singles' : 'Dobles'}
            </p>
          )}
          {listo.hold_vence_at && <p>Confirmá antes de: {formatearFechaHora(listo.hold_vence_at)}.</p>}
          {listo.jugadores && listo.jugadores.length > 0 && (
            <ul className="flex flex-col gap-1">
              {listo.jugadores.map((j, i) => (
                <li key={i} className="flex justify-between gap-4"><span>{j.nombre}</span><span>{formatearPrecio(j.cargo)}</span></li>
              ))}
            </ul>
          )}
          {typeof listo.total === 'number' && (
            <p className="text-tinta font-semibold">Total a transferir: {formatearPrecio(listo.total)}</p>
          )}
        </div>
      </Seccion>
    )
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Seccion titulo="1. Día y tipo de partido">
        <fieldset className="mb-4">
          <legend className="font-lora text-xs tracking-widest text-tinta/80 mb-2">DÍA</legend>
          <div className="flex flex-wrap gap-2">
            {fechas.map(f => (
              <Opcion key={f} activo={f === fecha} onClick={() => setFecha(f)}>{formatearFecha(f)}</Opcion>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-lora text-xs tracking-widest text-tinta/80 mb-2">PARTIDO</legend>
          <div className="flex flex-wrap gap-2">
            <Opcion activo={modalidad === 'singles'} onClick={() => cambiarModalidad('singles')}>Singles · {config.singles_min / 60} h</Opcion>
            <Opcion activo={modalidad === 'dobles'} onClick={() => cambiarModalidad('dobles')}>Dobles · {config.dobles_min / 60} h</Opcion>
          </div>
        </fieldset>
      </Seccion>

      <Seccion titulo="2. Cancha y horario">
        <p className="font-lora text-sm text-texto-2 mb-4">
          El turno arranca {config.margen_inicio_min} minutos después del horario reservado (barrido de cancha).
        </p>
        {disp.estado === 'cargando' && <p role="status" className="font-lora text-sm text-texto-2">Cargando horarios…</p>}
        {disp.estado === 'error' && (
          <div role="alert" className="font-lora text-sm text-rojo-texto flex flex-col gap-3 items-start">
            <p>{disp.error}</p>
            <button type="button" onClick={() => void cargar(fecha)} className="underline text-oro">Reintentar</button>
          </div>
        )}
        {disp.estado === 'ok' && (
          libres.every(c => c.turnos.length === 0)
            ? <p className="font-lora text-sm text-texto-2">No quedan turnos libres ese día. Probá con otro día.</p>
            : (
              <div className="flex flex-col gap-5">
                {libres.filter(c => c.turnos.length > 0).map(({ cancha, turnos }) => (
                  <fieldset key={cancha.id}>
                    <legend className="font-lora text-xs tracking-widest text-tinta/80 mb-2">CANCHA {cancha.nombre}</legend>
                    <div className="flex flex-wrap gap-2">
                      {turnos.map(t => (
                        <Opcion
                          key={t.inicio}
                          activo={seleccion?.cancha.id === cancha.id && seleccion.turno.inicio === t.inicio}
                          onClick={() => setSeleccion({ cancha, turno: t })}
                          label={`Cancha ${cancha.nombre}, empieza ${t.empieza}`}
                        >
                          {t.empieza}
                        </Opcion>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            )
        )}
      </Seccion>

      <Seccion titulo="3. Tus datos">
        <div className="flex flex-col gap-5">
          <Campo id="titular-dni" label="DNI" inputMode="numeric" autoComplete="off" value={titular.dni}
            onChange={v => setTitular({ ...titular, dni: v })} error={intentado ? erroresTitular.dni : undefined} />
          <Campo id="titular-nombre" label="NOMBRE" autoComplete="given-name" value={titular.nombre}
            onChange={v => setTitular({ ...titular, nombre: v })} error={intentado ? erroresTitular.nombre : undefined} />
          <Campo id="titular-apellido" label="APELLIDO" autoComplete="family-name" value={titular.apellido}
            onChange={v => setTitular({ ...titular, apellido: v })} error={intentado ? erroresTitular.apellido : undefined} />
          <Campo id="titular-email" label="EMAIL" type="email" inputMode="email" autoComplete="email" value={titular.email}
            onChange={v => setTitular({ ...titular, email: v })} error={intentado ? erroresTitular.email : undefined} />
          <p className="font-lora text-sm text-texto-2">
            Sos responsable de la reserva: si nadie se presenta, se te cobra el turno completo.
          </p>
        </div>
      </Seccion>

      <Seccion titulo={`4. ${jugadores.length === 1 ? 'Tu rival' : 'Los otros jugadores'}`}>
        <div className="flex flex-col gap-6">
          {jugadores.map((j, i) => {
            const err = intentado ? erroresJugadores[i] : {}
            const base = `jugador-${i}`
            return (
              <fieldset key={i} className="flex flex-col gap-4 border-t border-gris-claro pt-4 first:border-t-0 first:pt-0">
                <legend className="font-lora text-xs tracking-widest text-tinta/80 mb-2">JUGADOR {i + 2}</legend>
                <div className="flex flex-wrap gap-2">
                  <Opcion activo={j.tipo === 'socio'} onClick={() => editarJugador(i, { tipo: 'socio' })}>Socio del club</Opcion>
                  <Opcion activo={j.tipo === 'invitado'} onClick={() => editarJugador(i, { tipo: 'invitado' })}>No socio</Opcion>
                </div>
                <Campo id={`${base}-dni`} label="DNI" inputMode="numeric" autoComplete="off" value={j.dni}
                  onChange={v => editarJugador(i, { dni: v })} error={err.dni} />
                {j.tipo === 'invitado' && (
                  <>
                    <Campo id={`${base}-nombre`} label="NOMBRE" autoComplete="off" value={j.nombre}
                      onChange={v => editarJugador(i, { nombre: v })} error={err.nombre} />
                    <Campo id={`${base}-apellido`} label="APELLIDO" autoComplete="off" value={j.apellido}
                      onChange={v => editarJugador(i, { apellido: v })} error={err.apellido} />
                  </>
                )}
              </fieldset>
            )
          })}
        </div>
      </Seccion>

      <Seccion titulo="5. Resumen">
        <ul className="font-lora text-sm text-tinta/80 flex flex-col gap-2 mb-4">
          {resumen.lineas.map((l, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>{l.etiqueta}</span>
              <span className={l.precio === null ? 'text-texto-2' : 'text-tinta'}>
                {l.precio === null ? 'precio según socio' : formatearPrecio(l.precio)}
              </span>
            </li>
          ))}
        </ul>
        <p className="font-lora text-base text-tinta font-semibold flex justify-between gap-4 border-t border-gris-claro pt-3">
          <span>Total{resumen.hayPendientes ? ' (sin socios)' : ''}</span>
          <span>{formatearPrecio(resumen.total)}</span>
        </p>
        <p className="font-lora text-sm text-texto-2 mt-3">
          El pago es por transferencia. Después de confirmar por mail, subís el comprobante hasta{' '}
          {config.comprobante_horas_antes} horas antes del turno.
        </p>
      </Seccion>

      {errorEnvio && <Aviso tono="error">{errorEnvio}</Aviso>}
      <BotonPrincipal type="submit" disabled={enviando}>{enviando ? 'RESERVANDO…' : 'RESERVAR'}</BotonPrincipal>
    </form>
  )
}
