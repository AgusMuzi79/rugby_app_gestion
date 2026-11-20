'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  formatearFechaHora, formatearPrecio, horaArgentina, pantallaConfirmar, validarComprobante,
  vencimientoComprobante, CONFIG_DEFAULT,
} from '@/lib/tenis'
import { tenisInvitados } from './api'
import { Aviso, BotonPrincipal, Seccion } from './ui'

// tenis-invitados `confirmar` (idempotent: a reload shows the current state).
type Confirmada = {
  ya_confirmada?: boolean
  total?: number
  alias?: string
  comprobante_vence_at?: string | null
  reserva?: {
    id?: string | null
    cancha?: string | null
    inicio?: string | null
    fin?: string | null
    hora_real?: string | null
    modalidad?: 'singles' | 'dobles' | null
    estado?: string | null
    comprobante_estado?: 'pendiente' | 'aprobado' | 'rechazado' | null
    comprobante_motivo?: string | null
    comprobante_vence_at?: string | null
    jugadores?: { nombre: string; cargo: number; motivo?: string | null; es_titular?: boolean }[]
  }
}
// tenis-invitados `subir-comprobante`.
type Subida = { path?: string; signed_url?: string; upload_token?: string; content_type?: string; max_bytes?: number }

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'invalido' }
  | { tipo: 'vencido'; mensaje: string }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'ok'; data: Confirmada }

export default function Confirmar({ token }: { token: string | null }) {
  const [estado, setEstado] = useState<Estado>(token ? { tipo: 'cargando' } : { tipo: 'invalido' })
  const pedido = useRef(false)

  async function confirmar() {
    if (!token) return
    setEstado({ tipo: 'cargando' })
    const r = await tenisInvitados<Confirmada>('confirmar', { token })
    if (r.ok) { setEstado({ tipo: 'ok', data: r.data }); return }
    const pantalla = pantallaConfirmar(r.codigo)
    if (pantalla === 'invalido') setEstado({ tipo: 'invalido' })
    else if (pantalla === 'vencido') setEstado({ tipo: 'vencido', mensaje: r.error })
    else setEstado({ tipo: 'error', mensaje: r.error })
  }

  useEffect(() => {
    // Once per mount (StrictMode runs effects twice in dev); `confirmar` is idempotent anyway.
    if (pedido.current) return
    pedido.current = true
    void confirmar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (estado.tipo === 'cargando') {
    return <p role="status" className="font-lora text-sm text-texto-2">Confirmando tu reserva…</p>
  }
  if (estado.tipo === 'invalido') {
    return (
      <Seccion titulo="Enlace no válido">
        <p className="font-lora text-sm text-tinta/80 leading-relaxed mb-4">
          No pudimos reconocer este enlace. Abrilo completo desde el mail que te mandamos, o hacé una reserva nueva.
        </p>
        <VolverAReservar />
      </Seccion>
    )
  }
  if (estado.tipo === 'vencido') {
    return (
      <Seccion titulo="La reserva ya no está activa">
        <p className="font-lora text-sm text-tinta/80 leading-relaxed mb-4">{estado.mensaje}</p>
        <VolverAReservar />
      </Seccion>
    )
  }
  if (estado.tipo === 'error') {
    return (
      <Seccion titulo="No pudimos confirmar">
        <p role="alert" className="font-lora text-sm text-rojo-texto mb-4">{estado.mensaje}</p>
        <BotonPrincipal onClick={() => void confirmar()}>REINTENTAR</BotonPrincipal>
      </Seccion>
    )
  }
  return <Confirmacion token={token!} data={estado.data} />
}

function VolverAReservar() {
  return (
    <Link href="/tenis/reservar" className="font-lora text-sm text-oro underline">Reservar un turno</Link>
  )
}

function Confirmacion({ token, data }: { token: string; data: Confirmada }) {
  const alias = data.alias ?? CONFIG_DEFAULT.alias_pago
  const r = data.reserva
  const vence = data.comprobante_vence_at ?? (r?.inicio ? vencimientoComprobante(r.inicio) : null)
  const [comprobante, setComprobante] = useState(r?.comprobante_estado ?? null)

  return (
    <>
      <Seccion titulo={data.ya_confirmada ? 'Tu reserva' : '¡Reserva confirmada!'}>
        <dl className="font-lora text-sm text-tinta/80 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {r?.cancha && (<><dt>Cancha</dt><dd className="text-tinta">{r.cancha}</dd></>)}
          {r?.inicio && (
            <><dt>Turno</dt><dd className="text-tinta">
              {formatearFechaHora(r.inicio)}{r.fin ? ` a ${horaArgentina(r.fin)}` : ''}
              {r.hora_real ? ` (empieza ${r.hora_real})` : ''}
            </dd></>
          )}
          {r?.modalidad && (<><dt>Partido</dt><dd className="text-tinta">{r.modalidad === 'singles' ? 'Singles' : 'Dobles'}</dd></>)}
        </dl>
        {r?.jugadores && r.jugadores.length > 0 && (
          <ul className="font-lora text-sm text-tinta/80 flex flex-col gap-1 mt-4">
            {r.jugadores.map((j, i) => (
              <li key={i} className="flex justify-between gap-4"><span>{j.nombre}</span><span>{formatearPrecio(j.cargo)}</span></li>
            ))}
          </ul>
        )}
        {typeof data.total === 'number' && (
          <p className="font-lora text-base text-tinta font-semibold flex justify-between gap-4 border-t border-gris-claro pt-3 mt-4">
            <span>Total a transferir</span><span>{formatearPrecio(data.total)}</span>
          </p>
        )}
      </Seccion>

      {comprobante === 'aprobado' ? (
        <Aviso tono="info">El club aprobó tu comprobante. ¡Te esperamos en la cancha!</Aviso>
      ) : comprobante === 'pendiente' ? (
        <Aviso tono="info">Recibimos tu comprobante. El club lo revisa y te avisa por mail si hay algún problema.</Aviso>
      ) : (
        <>
          <Seccion titulo="Pagá por transferencia">
            <p className="font-lora text-sm text-tinta/80 mb-2">Alias</p>
            <Alias alias={alias} />
            {vence && (
              <p className="font-lora text-sm text-tinta mt-4">
                Subí el comprobante antes del <strong>{formatearFechaHora(vence)}</strong>. Si no, la reserva se cancela sola.
              </p>
            )}
          </Seccion>
          {comprobante === 'rechazado' && (
            <Aviso tono="error">
              El club rechazó el comprobante{r?.comprobante_motivo ? `: ${r.comprobante_motivo}` : '.'} Subí uno nuevo.
            </Aviso>
          )}
          <SubirComprobante token={token} onListo={() => setComprobante('pendiente')} />
        </>
      )}
    </>
  )
}

function Alias({ alias }: { alias: string }) {
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(alias)
      setCopiado('si')
    } catch {
      setCopiado('no')
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <code className="font-lora text-lg text-oro bg-dark px-3 py-2 select-all">{alias}</code>
      <button
        type="button"
        onClick={() => void copiar()}
        className="font-lora text-sm tracking-widest border border-borde-control text-tinta px-4 py-2 min-h-11 hover:border-oro"
      >
        COPIAR ALIAS
      </button>
      <span aria-live="polite" className="font-lora text-sm text-texto-2">
        {copiado === 'si' ? 'Copiado.' : copiado === 'no' ? 'No se pudo copiar: seleccionalo a mano.' : ''}
      </span>
    </div>
  )
}

function SubirComprobante({ token, onListo }: { token: string; onListo: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setError(f ? validarComprobante(f) : null)
    setArchivo(f)
  }

  async function subir() {
    if (!archivo) { setError('Elegí el archivo del comprobante.'); return }
    const invalido = validarComprobante(archivo)
    if (invalido) { setError(invalido); return }
    setSubiendo(true)
    setError(null)
    try {
      const pedido = await tenisInvitados<Subida>('subir-comprobante', {
        token,
        tipo: archivo.type,
        tamano: archivo.size,
      })
      if (!pedido.ok) { setError(pedido.error); return }
      const url = pedido.data.signed_url
      const path = pedido.data.path
      if (!url || !path) { setError('El servidor respondió algo inesperado. Probá de nuevo.'); return }
      const put = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': pedido.data.content_type ?? archivo.type },
        body: archivo,
      })
        .catch(() => null)
      if (!put || !put.ok) { setError('No se pudo subir el archivo. Revisá tu conexión y probá de nuevo.'); return }
      const reg = await tenisInvitados('registrar-comprobante', { token, path })
      if (!reg.ok) { setError(reg.error); return }
      onListo()
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Seccion titulo="Subí el comprobante">
      <label htmlFor="comprobante" className="font-lora text-xs tracking-widest text-tinta/80 block mb-2">
        FOTO O PDF (HASTA 5 MB)
      </label>
      <input
        id="comprobante"
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        onChange={elegir}
        aria-describedby={error ? 'comprobante-error' : undefined}
        className="font-lora text-sm text-tinta w-full mb-4 file:mr-3 file:border file:border-borde-control file:bg-transparent file:text-tinta file:px-3 file:py-2"
      />
      {error && <p id="comprobante-error" role="alert" className="font-lora text-sm text-rojo-texto mb-4">{error}</p>}
      <BotonPrincipal onClick={() => void subir()} disabled={subiendo || !archivo}>
        {subiendo ? 'SUBIENDO…' : 'ENVIAR COMPROBANTE'}
      </BotonPrincipal>
    </Seccion>
  )
}
