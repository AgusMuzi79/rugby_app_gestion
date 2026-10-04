'use client'

import { useCallback, useEffect, useState } from 'react'
import { callEdgeFunction, type EdgeResponse } from '@/lib/edgeFunction'

// Administración de turnos del gimnasio (Edge Function `gimnasio-turnos-admin`).
// Día de semana ISO: 1 = lunes … 7 = domingo. Horas 'HH:MM'.

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Franja {
  id: string
  dia_semana: number
  hora_desde: string
  hora_hasta: string
  cupo: number
  activa: boolean
}

interface ReservaOcupacion {
  reserva_id: string
  estado: string
  origen: string
  numero_socio: string | null
  nombre: string
  dni: string | null
}

interface FranjaOcupacion {
  franja_id: string
  hora_desde: string
  hora_hasta: string
  capacidad: number
  ocupados: number
  ocupados_fijos: number
  cerrado: boolean
  inactiva: boolean
  reservas: ReservaOcupacion[]
}

interface Excepcion {
  id: string
  fecha: string
  franja_id: string | null
  cerrado: boolean
  cupo_override: number | null
  motivo: string | null
}

interface Config {
  modo_cupos: 'informativo' | 'bloqueante'
  anticipacion_dias: number
  pct_cupo_fijos: number
  faltas_aviso: number
  semanas_fijos: number
  tolerancia_min: number
}

interface Limite {
  servicio_id: string | null
  categoria_nombre: string | null
  nombre: string
  dias_por_semana: number | null
  configurado: boolean
}

type Seccion = 'ocupacion' | 'franjas' | 'excepciones' | 'config'

const SECCIONES: { id: Seccion; label: string }[] = [
  { id: 'ocupacion',   label: 'OCUPACIÓN' },
  { id: 'franjas',     label: 'FRANJAS' },
  { id: 'excepciones', label: 'EXCEPCIONES' },
  { id: 'config',      label: 'CONFIGURACIÓN' },
]

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DIAS_CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const ESTADO_LABEL: Record<string, string> = {
  reservada: 'Reservada', cancelada: 'Cancelada', asistio: 'Asistió', falto: 'Faltó',
}
const ORIGEN_LABEL: Record<string, string> = {
  socio: 'Socio', fijo: 'Turno fijo', encargado: 'Encargado',
}

const INPUT = 'font-lora text-sm text-tinta bg-card border border-gris-claro px-3 py-2 outline-none focus:border-oro transition-colors'
const LABEL = 'font-lora text-xs tracking-widest text-tinta/50'
const BTN = 'font-lora text-xs tracking-widest px-5 py-2 border border-oro text-oro hover:bg-oro/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'
const BTN_PELIGRO = 'font-lora text-xs tracking-widest px-3 py-1 border border-rojo text-rojo hover:bg-rojo/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'
const TH = 'font-lora text-xs tracking-widest text-tinta/50 py-3 pr-4 text-left'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoyISO(): string {
  // Fecha local del navegador (Argentina), no UTC — igual que en accesos.
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-')
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay()
  return `${DIAS_CORTO[dia === 0 ? 7 : dia]} ${d}/${m}/${y}`
}

// Mensaje de una respuesta que no salió bien: motivo de negocio, error crudo o genérico.
function mensajeError(r: EdgeResponse): string {
  return r.motivo ?? (typeof r.error === 'string' && r.error ? r.error : 'No se pudo completar la operación.')
}

function etiquetaFranja(f: Franja): string {
  return `${DIAS_CORTO[f.dia_semana]} ${f.hora_desde}–${f.hora_hasta}`
}

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null

function AvisoBox({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null
  return (
    <div className={`border p-3 mb-4 ${aviso.tipo === 'ok' ? 'border-[#2ECC71]' : 'border-rojo'}`}>
      <p className={`font-lora text-sm ${aviso.tipo === 'ok' ? 'text-[#2ECC71]' : 'text-rojo'}`}>{aviso.texto}</p>
    </div>
  )
}

function Cargando() {
  return <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
}

function useFranjas() {
  const [franjas, setFranjas] = useState<Franja[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const recargar = useCallback(async () => {
    setLoading(true)
    const r = await callEdgeFunction<{ franjas: Franja[] }>('gimnasio-turnos-admin', { action: 'franjas-listar' })
    if (r.ok) { setFranjas(r.franjas ?? []); setError('') }
    else { setFranjas([]); setError(mensajeError(r)) }
    setLoading(false)
  }, [])

  useEffect(() => { recargar() }, [recargar])
  return { franjas, loading, error, recargar }
}

// ─── Ocupación ────────────────────────────────────────────────────────────────

function OcupacionSeccion() {
  const [fecha, setFecha]     = useState(hoyISO())
  const [franjas, setFranjas] = useState<FranjaOcupacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [aviso, setAviso]     = useState<Aviso>(null)
  const [dni, setDni]         = useState('')
  const [franjaId, setFranjaId] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async (f: string) => {
    setLoading(true)
    const r = await callEdgeFunction<{ franjas: FranjaOcupacion[] }>('gimnasio-turnos-admin', { action: 'ocupacion', fecha: f })
    if (r.ok) { setFranjas(r.franjas ?? []); setError('') }
    else { setFranjas([]); setError(mensajeError(r)) }
    setLoading(false)
  }, [])

  useEffect(() => { cargar(fecha) }, [fecha, cargar])

  const anotables = franjas.filter(f => !f.inactiva && !f.cerrado)

  const anotar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!franjaId) { setAviso({ tipo: 'error', texto: 'Elegí una franja.' }); return }
    setEnviando(true)
    setAviso(null)
    const r = await callEdgeFunction<{ socio: { numero_socio: string; nombre: string } }>('gimnasio-turnos-admin', {
      action: 'reserva-manual', dni: dni.trim(), franja_id: franjaId, fecha,
    })
    if (r.ok) {
      setAviso({ tipo: 'ok', texto: `Anotado: ${r.socio?.nombre ?? ''} (Nº ${r.socio?.numero_socio ?? '—'}).` })
      setDni('')
      await cargar(fecha)
    } else {
      setAviso({ tipo: 'error', texto: mensajeError(r) })
    }
    setEnviando(false)
  }

  const cancelar = async (reservaId: string, nombre: string) => {
    if (!window.confirm(`¿Cancelar la reserva de ${nombre}?`)) return
    setAviso(null)
    const r = await callEdgeFunction('gimnasio-turnos-admin', { action: 'reserva-cancelar', reserva_id: reservaId })
    if (r.ok) await cargar(fecha)
    else setAviso({ tipo: 'error', texto: mensajeError(r) })
  }

  return (
    <div>
      <div className="flex flex-col gap-1 mb-6 w-fit">
        <label className={LABEL}>FECHA</label>
        <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} className={INPUT} />
      </div>

      <AvisoBox aviso={aviso} />

      {loading ? <Cargando /> : error ? (
        <div className="border border-rojo p-8 text-center">
          <p className="font-lora text-rojo text-sm tracking-widest">{error}</p>
        </div>
      ) : franjas.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">SIN FRANJAS ESTE DÍA</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {franjas.map(f => {
            const pct = f.capacidad > 0 ? Math.min(100, Math.round((f.ocupados / f.capacidad) * 100)) : 0
            return (
              <div key={f.franja_id} className="border border-gris-claro p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-playfair text-lg text-tinta">
                    {f.hora_desde} – {f.hora_hasta}
                    {f.cerrado && <span className="ml-3 font-lora text-xs tracking-widest px-2 py-0.5 border text-rojo border-rojo">CERRADO</span>}
                    {f.inactiva && <span className="ml-3 font-lora text-xs tracking-widest px-2 py-0.5 border text-tinta/40 border-gris-claro">FRANJA INACTIVA</span>}
                  </p>
                  <p className="font-lora text-sm text-tinta/60">{f.ocupados} / {f.capacidad} lugares</p>
                </div>
                <div className="h-2 bg-gris-claro mb-4">
                  <div className={`h-2 ${pct >= 100 ? 'bg-rojo' : 'bg-oro'}`} style={{ width: `${pct}%` }} />
                </div>

                {f.reservas.length === 0 ? (
                  <p className="font-lora text-tinta/40 text-xs tracking-widest">SIN RESERVAS</p>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gris-claro">
                        <th className={TH}>Nº</th>
                        <th className={TH}>NOMBRE</th>
                        <th className={TH}>DNI</th>
                        <th className={TH}>ESTADO</th>
                        <th className={TH}>ORIGEN</th>
                        <th className={TH}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.reservas.map(r => (
                        <tr key={r.reserva_id} className={`border-b border-gris-claro ${r.estado === 'cancelada' ? 'opacity-40' : ''}`}>
                          <td className="font-playfair text-sm text-oro-hondo py-3 pr-4">{r.numero_socio ?? '—'}</td>
                          <td className="font-lora text-sm text-tinta py-3 pr-4">{r.nombre}</td>
                          <td className="font-lora text-sm text-tinta/60 py-3 pr-4">{r.dni ?? '—'}</td>
                          <td className="font-lora text-sm text-tinta py-3 pr-4">{ESTADO_LABEL[r.estado] ?? r.estado}</td>
                          <td className="font-lora text-sm text-tinta/60 py-3 pr-4">{ORIGEN_LABEL[r.origen] ?? r.origen}</td>
                          <td className="py-3 text-right">
                            {r.estado === 'reservada' && (
                              <button className={BTN_PELIGRO} onClick={() => cancelar(r.reserva_id, r.nombre)}>CANCELAR</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}

      <form onSubmit={anotar} className="mt-8 border border-gris-claro p-4 flex flex-wrap gap-4 items-end">
        <p className="w-full font-lora text-xs tracking-widest text-oro">ANOTAR POR DNI ({fechaLarga(fecha)})</p>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>DNI</label>
          <input value={dni} onChange={e => setDni(e.target.value)} inputMode="numeric" maxLength={20} className={INPUT} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>FRANJA</label>
          <select value={franjaId} onChange={e => setFranjaId(e.target.value)} className={INPUT} required>
            <option value="">Elegir…</option>
            {anotables.map(f => (
              <option key={f.franja_id} value={f.franja_id}>{f.hora_desde} – {f.hora_hasta}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={enviando || !dni.trim()} className={BTN}>ANOTAR</button>
      </form>
    </div>
  )
}

// ─── Franjas ──────────────────────────────────────────────────────────────────

interface FranjaForm { id: string; dia_semana: number; hora_desde: string; hora_hasta: string; cupo: string }
const FRANJA_VACIA: FranjaForm = { id: '', dia_semana: 1, hora_desde: '', hora_hasta: '', cupo: '' }

function FranjasSeccion() {
  const { franjas, loading, error, recargar } = useFranjas()
  const [form, setForm]   = useState<FranjaForm>(FRANJA_VACIA)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [enviando, setEnviando] = useState(false)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setAviso(null)
    const r = await callEdgeFunction<{ reservas_futuras: number }>('gimnasio-turnos-admin', {
      action: 'franja-guardar',
      ...(form.id ? { id: form.id } : {}),
      dia_semana: form.dia_semana,
      hora_desde: form.hora_desde,
      hora_hasta: form.hora_hasta,
      cupo: Number(form.cupo),
    })
    if (r.ok) {
      const n = r.reservas_futuras ?? 0
      setAviso({
        tipo: 'ok',
        texto: form.id && n > 0
          ? `Franja guardada. Tiene ${n} reserva${n === 1 ? '' : 's'} futura${n === 1 ? '' : 's'}: no se tocaron.`
          : 'Franja guardada.',
      })
      setForm(FRANJA_VACIA)
      await recargar()
    } else {
      setAviso({ tipo: 'error', texto: mensajeError(r) })
    }
    setEnviando(false)
  }

  const desactivar = async (f: Franja) => {
    if (!window.confirm(`¿Desactivar la franja ${etiquetaFranja(f)}? Las reservas futuras NO se cancelan solas.`)) return
    setAviso(null)
    const r = await callEdgeFunction<{ reservas_futuras: number; turnos_fijos_activos: number }>('gimnasio-turnos-admin', {
      action: 'franja-desactivar', franja_id: f.id,
    })
    if (r.ok) {
      setAviso({
        tipo: 'ok',
        texto: `Franja desactivada. Quedan ${r.reservas_futuras ?? 0} reservas futuras y ${r.turnos_fijos_activos ?? 0} turnos fijos activos para revisar.`,
      })
      await recargar()
    } else {
      setAviso({ tipo: 'error', texto: mensajeError(r) })
    }
  }

  const reactivar = async (f: Franja) => {
    setAviso(null)
    const r = await callEdgeFunction('gimnasio-turnos-admin', {
      action: 'franja-guardar', id: f.id, dia_semana: f.dia_semana,
      hora_desde: f.hora_desde, hora_hasta: f.hora_hasta, cupo: f.cupo, activa: true,
    })
    if (r.ok) await recargar()
    else setAviso({ tipo: 'error', texto: mensajeError(r) })
  }

  const editar = (f: Franja) => {
    setAviso(null)
    setForm({ id: f.id, dia_semana: f.dia_semana, hora_desde: f.hora_desde, hora_hasta: f.hora_hasta, cupo: String(f.cupo) })
  }

  return (
    <div>
      <AvisoBox aviso={aviso} />

      <form onSubmit={guardar} className="mb-8 border border-gris-claro p-4 flex flex-wrap gap-4 items-end">
        <p className="w-full font-lora text-xs tracking-widest text-oro">{form.id ? 'EDITAR FRANJA' : 'NUEVA FRANJA'}</p>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>DÍA</label>
          <select value={form.dia_semana} onChange={e => setForm({ ...form, dia_semana: Number(e.target.value) })} className={INPUT}>
            {DIAS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>DESDE</label>
          <input type="time" value={form.hora_desde} onChange={e => setForm({ ...form, hora_desde: e.target.value })} className={INPUT} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>HASTA</label>
          <input type="time" value={form.hora_hasta} onChange={e => setForm({ ...form, hora_hasta: e.target.value })} className={INPUT} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>CUPO</label>
          <input type="number" min={1} max={500} value={form.cupo} onChange={e => setForm({ ...form, cupo: e.target.value })} className={`${INPUT} w-24`} required />
        </div>
        <button type="submit" disabled={enviando} className={BTN}>GUARDAR</button>
        {form.id && (
          <button type="button" onClick={() => setForm(FRANJA_VACIA)} className="font-lora text-xs tracking-widest text-tinta/50 hover:text-tinta">
            CANCELAR EDICIÓN
          </button>
        )}
      </form>

      {loading ? <Cargando /> : error ? (
        <div className="border border-rojo p-8 text-center">
          <p className="font-lora text-rojo text-sm tracking-widest">{error}</p>
        </div>
      ) : franjas.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">TODAVÍA NO HAY FRANJAS CARGADAS</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map(dia => {
            const delDia = franjas.filter(f => f.dia_semana === dia)
            return (
              <div key={dia} className="border border-gris-claro p-4">
                <p className="font-playfair text-lg text-tinta mb-2">{DIAS[dia]}</p>
                {delDia.length === 0 ? (
                  <p className="font-lora text-tinta/40 text-xs tracking-widest">SIN FRANJAS</p>
                ) : delDia.map(f => (
                  <div key={f.id} className={`flex items-center gap-4 py-2 border-t border-gris-claro ${f.activa ? '' : 'opacity-50'}`}>
                    <span className="font-lora text-sm text-tinta w-32">{f.hora_desde} – {f.hora_hasta}</span>
                    <span className="font-lora text-sm text-tinta/60 flex-1">Cupo {f.cupo}{f.activa ? '' : ' · inactiva'}</span>
                    <button className={BTN} onClick={() => editar(f)}>EDITAR</button>
                    {f.activa
                      ? <button className={BTN_PELIGRO} onClick={() => desactivar(f)}>DESACTIVAR</button>
                      : <button className={BTN} onClick={() => reactivar(f)}>REACTIVAR</button>}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Excepciones ──────────────────────────────────────────────────────────────

function ExcepcionesSeccion() {
  const { franjas } = useFranjas()
  const [desde, setDesde] = useState(hoyISO())
  const [hasta, setHasta] = useState(sumarDias(hoyISO(), 60))
  const [lista, setLista] = useState<Excepcion[]>([])
  const [loading, setLoading] = useState(true)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [enviando, setEnviando] = useState(false)

  const [fecha, setFecha]       = useState(hoyISO())
  const [franjaId, setFranjaId] = useState('')   // '' = todas las franjas de la fecha
  const [cerrado, setCerrado]   = useState(true)
  const [cupo, setCupo]         = useState('')
  const [motivo, setMotivo]     = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await callEdgeFunction<{ excepciones: Excepcion[] }>('gimnasio-turnos-admin', {
      action: 'excepciones-listar', desde, hasta,
    })
    if (r.ok) setLista(r.excepciones ?? [])
    else { setLista([]); setAviso({ tipo: 'error', texto: mensajeError(r) }) }
    setLoading(false)
  }, [desde, hasta])

  useEffect(() => { cargar() }, [cargar])

  const etiquetaDe = (id: string | null) => {
    if (!id) return 'Todas las franjas'
    const f = franjas.find(x => x.id === id)
    return f ? etiquetaFranja(f) : 'Franja eliminada'
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setAviso(null)
    const r = await callEdgeFunction<{ reservas_afectadas: number }>('gimnasio-turnos-admin', {
      action: 'excepcion-guardar',
      fecha,
      franja_id: franjaId || null,
      cerrado,
      cupo_override: cupo === '' ? null : Number(cupo),
      motivo: motivo.trim() || undefined,
    })
    if (r.ok) {
      const n = r.reservas_afectadas ?? 0
      setAviso({
        tipo: 'ok',
        texto: cerrado && n > 0
          ? `Excepción guardada. Hay ${n} reserva${n === 1 ? '' : 's'} vigente${n === 1 ? '' : 's'} en ese cierre: no se cancelaron solas.`
          : 'Excepción guardada.',
      })
      setCupo(''); setMotivo('')
      await cargar()
    } else {
      setAviso({ tipo: 'error', texto: mensajeError(r) })
    }
    setEnviando(false)
  }

  const borrar = async (x: Excepcion) => {
    if (!window.confirm(`¿Borrar la excepción del ${fechaLarga(x.fecha)}?`)) return
    setAviso(null)
    const r = await callEdgeFunction('gimnasio-turnos-admin', { action: 'excepcion-borrar', excepcion_id: x.id })
    if (r.ok) await cargar()
    else setAviso({ tipo: 'error', texto: mensajeError(r) })
  }

  return (
    <div>
      <AvisoBox aviso={aviso} />

      <form onSubmit={guardar} className="mb-8 border border-gris-claro p-4 flex flex-wrap gap-4 items-end">
        <p className="w-full font-lora text-xs tracking-widest text-oro">NUEVA EXCEPCIÓN (FERIADO, CIERRE, CUPO ESPECIAL)</p>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>FECHA</label>
          <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} className={INPUT} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>FRANJA</label>
          <select value={franjaId} onChange={e => setFranjaId(e.target.value)} className={INPUT}>
            <option value="">Todas las franjas</option>
            {franjas.filter(f => f.activa).map(f => <option key={f.id} value={f.id}>{etiquetaFranja(f)}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 font-lora text-sm text-tinta pb-2">
          <input type="checkbox" checked={cerrado} onChange={e => setCerrado(e.target.checked)} />
          Cerrado
        </label>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>CUPO ESPECIAL</label>
          <input type="number" min={1} max={500} value={cupo} onChange={e => setCupo(e.target.value)} className={`${INPUT} w-28`} placeholder="opcional" />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>MOTIVO</label>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} className={INPUT} placeholder="opcional" />
        </div>
        <button type="submit" disabled={enviando} className={BTN}>GUARDAR</button>
        {!cerrado && cupo === '' && (
          <p className="w-full font-lora text-xs text-tinta/50">Una excepción abierta necesita un cupo especial.</p>
        )}
      </form>

      <div className="flex gap-4 mb-4">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>DESDE</label>
          <input type="date" value={desde} onChange={e => e.target.value && setDesde(e.target.value)} className={INPUT} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>HASTA</label>
          <input type="date" value={hasta} onChange={e => e.target.value && setHasta(e.target.value)} className={INPUT} />
        </div>
      </div>

      {loading ? <Cargando /> : lista.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">SIN EXCEPCIONES EN ESTE RANGO</p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gris-claro">
              <th className={TH}>FECHA</th>
              <th className={TH}>FRANJA</th>
              <th className={TH}>EFECTO</th>
              <th className={TH}>MOTIVO</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody>
            {lista.map(x => (
              <tr key={x.id} className="border-b border-gris-claro">
                <td className="font-lora text-sm text-tinta py-3 pr-4">{fechaLarga(x.fecha)}</td>
                <td className="font-lora text-sm text-tinta/60 py-3 pr-4">{etiquetaDe(x.franja_id)}</td>
                <td className="font-lora text-sm text-tinta py-3 pr-4">
                  {x.cerrado ? 'Cerrado' : `Cupo ${x.cupo_override}`}
                  {x.cerrado && x.cupo_override !== null ? ` (cupo ${x.cupo_override})` : ''}
                </td>
                <td className="font-lora text-sm text-tinta/60 py-3 pr-4">{x.motivo ?? '—'}</td>
                <td className="py-3 text-right">
                  <button className={BTN_PELIGRO} onClick={() => borrar(x)}>BORRAR</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Configuración ────────────────────────────────────────────────────────────

const CAMPOS_CONFIG: { campo: keyof Omit<Config, 'modo_cupos'>; label: string; min: number; max: number; ayuda: string }[] = [
  { campo: 'anticipacion_dias', label: 'ANTICIPACIÓN (DÍAS)', min: 0, max: 30, ayuda: 'Con cuántos días de anticipación se puede reservar (0 a 30).' },
  { campo: 'pct_cupo_fijos',    label: '% DE CUPO PARA FIJOS', min: 0, max: 100, ayuda: 'Porcentaje del cupo de cada franja reservado a turnos fijos.' },
  { campo: 'faltas_aviso',      label: 'FALTAS PARA AVISAR', min: 1, max: 20, ayuda: 'Faltas seguidas de un turno fijo antes del aviso por push.' },
  { campo: 'semanas_fijos',     label: 'SEMANAS DE TURNOS FIJOS', min: 1, max: 12, ayuda: 'Cuántas semanas hacia adelante se reservan los turnos fijos.' },
  { campo: 'tolerancia_min',    label: 'TOLERANCIA (MIN)', min: 0, max: 120, ayuda: 'Minutos de margen alrededor del horario de la franja.' },
]

function ConfigSeccion() {
  const [cfg, setCfg]     = useState<Config | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [limites, setLimites] = useState<Limite[]>([])
  const [dias, setDias]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [enviando, setEnviando] = useState(false)

  const clave = (l: Limite) => l.servicio_id ?? `cat:${l.categoria_nombre}`

  const cargar = useCallback(async () => {
    setLoading(true)
    const [c, l] = await Promise.all([
      callEdgeFunction<{ config: Config }>('gimnasio-turnos-admin', { action: 'config-get' }),
      callEdgeFunction<{ limites: Limite[] }>('gimnasio-turnos-admin', { action: 'limites-listar' }),
    ])
    if (c.ok && c.config) {
      setCfg(c.config)
      setValores(Object.fromEntries(CAMPOS_CONFIG.map(x => [x.campo, String(c.config[x.campo])])))
    } else {
      setAviso({ tipo: 'error', texto: mensajeError(c) })
    }
    if (l.ok) {
      const items = l.limites ?? []
      setLimites(items)
      setDias(Object.fromEntries(items.map(x => [clave(x), x.dias_por_semana === null ? '' : String(x.dias_por_semana)])))
    } else {
      setAviso({ tipo: 'error', texto: mensajeError(l) })
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const guardarConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cfg) return
    setEnviando(true)
    setAviso(null)
    const r = await callEdgeFunction<{ config: Config }>('gimnasio-turnos-admin', {
      action: 'config-guardar',
      modo_cupos: cfg.modo_cupos,
      ...Object.fromEntries(CAMPOS_CONFIG.map(x => [x.campo, Number(valores[x.campo])])),
    })
    if (r.ok) setAviso({ tipo: 'ok', texto: 'Configuración guardada.' })
    else setAviso({ tipo: 'error', texto: mensajeError(r) })
    setEnviando(false)
  }

  const guardarLimite = async (l: Limite) => {
    setAviso(null)
    const v = dias[clave(l)]?.trim() ?? ''
    const r = await callEdgeFunction('gimnasio-turnos-admin', {
      action: 'limite-guardar',
      ...(l.servicio_id ? { servicio_id: l.servicio_id } : { categoria_nombre: l.categoria_nombre }),
      dias_por_semana: v === '' ? null : Number(v),
    })
    if (r.ok) {
      setAviso({ tipo: 'ok', texto: `Límite de "${l.nombre}" guardado.` })
      await cargar()
    } else {
      setAviso({ tipo: 'error', texto: mensajeError(r) })
    }
  }

  if (loading) return <Cargando />
  if (!cfg) return <AvisoBox aviso={aviso} />

  return (
    <div>
      <AvisoBox aviso={aviso} />

      <form onSubmit={guardarConfig} className="mb-10 border border-gris-claro p-4 flex flex-col gap-4">
        <p className="font-lora text-xs tracking-widest text-oro">CONFIGURACIÓN GENERAL</p>

        <div className="flex flex-col gap-1">
          <label className={LABEL}>MODO DE CUPOS EN EL LECTOR</label>
          <select value={cfg.modo_cupos} onChange={e => setCfg({ ...cfg, modo_cupos: e.target.value as Config['modo_cupos'] })} className={`${INPUT} w-64`}>
            <option value="informativo">Informativo (solo avisa)</option>
            <option value="bloqueante">Bloqueante (exige reserva)</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-6">
          {CAMPOS_CONFIG.map(x => (
            <div key={x.campo} className="flex flex-col gap-1 w-56">
              <label className={LABEL}>{x.label}</label>
              <input
                type="number" min={x.min} max={x.max}
                value={valores[x.campo] ?? ''}
                onChange={e => setValores({ ...valores, [x.campo]: e.target.value })}
                className={INPUT} required
              />
              <p className="font-lora text-xs text-tinta/40">{x.ayuda}</p>
            </div>
          ))}
        </div>

        <div><button type="submit" disabled={enviando} className={BTN}>GUARDAR CONFIGURACIÓN</button></div>
      </form>

      <p className="font-lora text-xs tracking-widest text-oro mb-3">DÍAS POR SEMANA SEGÚN SERVICIO</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gris-claro">
            <th className={TH}>SERVICIO / CATEGORÍA</th>
            <th className={TH}>DÍAS POR SEMANA</th>
            <th className={TH}></th>
          </tr>
        </thead>
        <tbody>
          {limites.map(l => (
            <tr key={clave(l)} className="border-b border-gris-claro">
              <td className="font-lora text-sm text-tinta py-3 pr-4">{l.nombre}</td>
              <td className="py-3 pr-4">
                <input
                  type="number" min={1} max={7} placeholder="sin límite"
                  value={dias[clave(l)] ?? ''}
                  onChange={e => setDias({ ...dias, [clave(l)]: e.target.value })}
                  className={`${INPUT} w-28`}
                />
              </td>
              <td className="py-3 text-right">
                <button className={BTN} onClick={() => guardarLimite(l)}>GUARDAR</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-lora text-xs text-tinta/40 mt-2">Vacío = sin límite de días por semana.</p>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function TurnosPage() {
  const [seccion, setSeccion] = useState<Seccion>('ocupacion')

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-playfair italic text-4xl text-tinta mb-1">Turnos del Gimnasio</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide">
          Franjas con cupo, ocupación por día y reglas de reserva
        </p>
      </div>

      <div className="flex gap-6 mb-8 border-b border-gris-claro">
        {SECCIONES.map(s => (
          <button
            key={s.id}
            onClick={() => setSeccion(s.id)}
            className={`font-lora text-xs tracking-widest pb-3 -mb-px border-b-2 transition-colors ${
              seccion === s.id ? 'text-tinta border-oro' : 'text-gris border-transparent hover:text-tinta'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {seccion === 'ocupacion'   && <OcupacionSeccion />}
      {seccion === 'franjas'     && <FranjasSeccion />}
      {seccion === 'excepciones' && <ExcepcionesSeccion />}
      {seccion === 'config'      && <ConfigSeccion />}
    </div>
  )
}
