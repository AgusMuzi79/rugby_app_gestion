'use client'

import { useCallback, useEffect, useState } from 'react'
import { callEdgeFunction, type EdgeResponse } from '@/lib/edgeFunction'
import { parseCalendario, PLANTILLA_CSV, type FilaCalendario } from '@/lib/calendarioImport'

// Administración de turnos del gimnasio (Edge Function `gimnasio-turnos-admin`).
// Día de semana ISO: 1 = lunes … 7 = domingo. Horas 'HH:MM'.

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Franja {
  id: string
  dia_semana: number
  hora_desde: string
  hora_hasta: string
  cupo: number
  profesor: string | null
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
  motivo_cierre: string | null
  profesor: string | null
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
  ventana_reserva: 'mes' | 'dias'
  anticipacion_dias: number
  pct_cupo_fijos: number
  faltas_aviso: number
  faltas_baja: number
  semanas_fijos: number
  tolerancia_min: number
}

type VistaPrevia = {
  reservas_a_cancelar: number
  socios_a_avisar: number
  socios_sin_token: number
}

type ResultadoCierre = {
  reservas_canceladas: number
  avisos_enviados: number
  avisos_fallidos: number
  avisos_sin_token: number
}

type Seccion = 'ocupacion' | 'franjas' | 'importar' | 'excepciones' | 'config'

const SECCIONES: { id: Seccion; label: string }[] = [
  { id: 'ocupacion',   label: 'OCUPACIÓN' },
  { id: 'franjas',     label: 'FRANJAS' },
  { id: 'importar',    label: 'IMPORTAR CALENDARIO' },
  { id: 'excepciones', label: 'EXCEPCIONES' },
  { id: 'config',      label: 'CONFIGURACIÓN' },
]

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DIAS_CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const ESTADO_LABEL: Record<string, string> = {
  reservada: 'Reservada', cancelada: 'Cancelada', asistio: 'Asistió', falto: 'Faltó',
}
const ORIGEN_LABEL: Record<string, string> = {
  socio: 'Socio', fijo: 'Turno fijo',
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

  const cargar = useCallback(async (f: string) => {
    setLoading(true)
    const r = await callEdgeFunction<{ franjas: FranjaOcupacion[] }>('gimnasio-turnos-admin', { action: 'ocupacion', fecha: f })
    if (r.ok) { setFranjas(r.franjas ?? []); setError('') }
    else { setFranjas([]); setError(mensajeError(r)) }
    setLoading(false)
  }, [])

  useEffect(() => { cargar(fecha) }, [fecha, cargar])

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
                {f.profesor && (
                  <p className="font-lora text-sm text-tinta/60 mb-2">Prof. {f.profesor}</p>
                )}
                {f.cerrado && f.motivo_cierre && (
                  <p className="font-lora text-xs text-tinta/60 mb-2">Mensaje a los socios: {f.motivo_cierre}</p>
                )}
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
    </div>
  )
}

// ─── Franjas ──────────────────────────────────────────────────────────────────

interface FranjaForm { id: string; dia_semana: number; hora_desde: string; hora_hasta: string; cupo: string; profesor: string }
const FRANJA_VACIA: FranjaForm = { id: '', dia_semana: 1, hora_desde: '', hora_hasta: '', cupo: '', profesor: '' }

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
      profesor: form.profesor.trim() || null,
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
    setForm({
      id: f.id, dia_semana: f.dia_semana, hora_desde: f.hora_desde, hora_hasta: f.hora_hasta,
      cupo: String(f.cupo), profesor: f.profesor ?? '',
    })
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
        <div className="flex flex-col gap-1">
          <label className={LABEL}>PROFESOR</label>
          <input
            value={form.profesor} onChange={e => setForm({ ...form, profesor: e.target.value })}
            maxLength={80} className={`${INPUT} w-64`} placeholder="opcional (Ana / Luis si son dos)"
          />
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
                    <span className="font-lora text-sm text-tinta/60 flex-1">
                      Cupo {f.cupo}{f.profesor ? ` · Prof. ${f.profesor}` : ''}{f.activa ? '' : ' · inactiva'}
                    </span>
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

// ─── Importar calendario ──────────────────────────────────────────────────────

type ModoImport = 'agregar' | 'reemplazar'

interface ResumenImport {
  crear: number
  actualizar: number
  sin_cambios: number
  desactivar: number
  reservas_futuras_afectadas: number
  turnos_fijos_afectados: number
}
interface FilaCrear { dia_semana: number; hora_desde: string; hora_hasta: string; cupo: number; profesor: string | null }
interface FilaActualizar {
  dia_semana: number; hora_desde: string; hora_hasta: string
  cupo_antes: number; cupo: number; profesor_antes: string | null; profesor: string | null; reactivada?: boolean
}
interface FilaDesactivar extends FilaCrear { reservas_futuras: number; turnos_fijos?: number }
type ResultadoImport = {
  aplicado: boolean
  modo: ModoImport
  resumen: ResumenImport
  detalle: { crear: FilaCrear[]; actualizar: FilaActualizar[]; desactivar: FilaDesactivar[] }
  errores?: { fila: number; motivo: string }[]
}

const MODOS_IMPORT: { id: ModoImport; label: string; ayuda: string }[] = [
  {
    id: 'agregar',
    label: 'Agregar a las franjas actuales',
    ayuda: 'Crea las franjas nuevas y actualiza las que coinciden en día y horario. Las demás quedan como están.',
  },
  {
    id: 'reemplazar',
    label: 'Reemplazar todo el calendario',
    ayuda: 'Lo que no esté en el archivo se desactiva (no se borra). Las reservas futuras de esas franjas NO se cancelan solas.',
  },
]

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

// Lee un archivo como texto: primero UTF-8 y, si trae caracteres rotos (CSV guardado por Excel en
// Windows), de nuevo como windows-1252.
function leerArchivo(archivo: File, codificacion: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result ?? ''))
    lector.onerror = () => reject(lector.error)
    lector.readAsText(archivo, codificacion)
  })
}

function descargarPlantilla() {
  const blob = new Blob([PLANTILLA_CSV], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla-calendario-gimnasio.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function ImportarSeccion() {
  const { franjas, loading: cargandoFranjas, recargar } = useFranjas()
  const [texto, setTexto]   = useState('')
  const [modo, setModo]     = useState<ModoImport>('agregar')
  const [previa, setPrevia] = useState<ResultadoImport | null>(null)
  const [filasListas, setFilasListas] = useState<FilaCalendario[]>([])
  const [erroresLectura, setErroresLectura]   = useState<string[]>([])
  const [erroresServidor, setErroresServidor] = useState<string[]>([])
  const [aviso, setAviso]   = useState<Aviso>(null)
  const [trabajando, setTrabajando] = useState(false)

  // Cualquier cambio del texto o del modo invalida la vista previa anterior.
  const limpiarPrevia = () => {
    setPrevia(null); setFilasListas([]); setErroresLectura([]); setErroresServidor([]); setAviso(null)
  }

  const cambiarTexto = (t: string) => { setTexto(t); limpiarPrevia() }
  const cambiarModo = (m: ModoImport) => { setModo(m); limpiarPrevia() }

  const subirCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!archivo) return
    try {
      let t = await leerArchivo(archivo, 'utf-8')
      if (t.includes('�')) t = await leerArchivo(archivo, 'windows-1252')
      cambiarTexto(t)
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo leer el archivo.' })
    }
  }

  // Errores del servidor por posición de fila -> línea del texto original.
  const textoErrorServidor = (fila: number, motivo: string, filas: FilaCalendario[]): string => {
    const linea = filas[fila - 1]?.linea
    const m = motivo.replace(/fila (\d+)/gi, (_, n) => {
      const l = filas[Number(n) - 1]?.linea
      return l ? `línea ${l}` : `fila ${n}`
    })
    return linea ? `Fila ${linea}: ${m}` : m
  }

  const llamar = async (filas: FilaCalendario[], soloVistaPrevia: boolean) => {
    const r = await callEdgeFunction<ResultadoImport>('gimnasio-turnos-admin', {
      action: 'franjas-importar',
      modo,
      solo_vista_previa: soloVistaPrevia,
      // Sólo los campos del contrato: `linea` es de uso local (mapear errores al texto original).
      filas: filas.map(f => ({
        dia_semana: f.dia_semana, hora_desde: f.hora_desde, hora_hasta: f.hora_hasta, cupo: f.cupo, profesor: f.profesor,
      })),
    })
    return r
  }

  const vistaPrevia = async () => {
    limpiarPrevia()
    const { filas, errores } = parseCalendario(texto)
    if (errores.length > 0) {
      setErroresLectura(errores.map(e => e.motivo))
      return
    }
    setTrabajando(true)
    const r = await llamar(filas, true)
    if (r.ok && r.resumen) {
      setPrevia(r)
      setFilasListas(filas)
    } else if (Array.isArray(r.errores) && r.errores.length > 0) {
      setErroresServidor([...new Set(r.errores.map(e => textoErrorServidor(e.fila, e.motivo, filas)))])
    } else {
      setAviso({ tipo: 'error', texto: mensajeError(r) })
    }
    setTrabajando(false)
  }

  const cambios = previa ? previa.resumen.crear + previa.resumen.actualizar + previa.resumen.desactivar : 0
  const puedeConfirmar = !!previa && cambios > 0 && erroresLectura.length === 0 && erroresServidor.length === 0 && !trabajando

  const confirmar = async () => {
    if (!previa || !puedeConfirmar) return
    const s = previa.resumen
    let msg =
      `Se van a crear ${s.crear}, actualizar ${s.actualizar} y desactivar ${s.desactivar} franjas ` +
      `(${s.sin_cambios} quedan igual).`
    if (modo === 'reemplazar') {
      msg +=
        `\n\nReemplazar todo el calendario desactiva las franjas que no están en el archivo. ` +
        `Afecta a ${plural(s.reservas_futuras_afectadas, 'reserva futura', 'reservas futuras')} y ` +
        `${plural(s.turnos_fijos_afectados, 'turno fijo activo', 'turnos fijos activos')}: no se cancelan solos.`
    }
    msg += '\n\n¿Confirmás la importación?'
    if (!window.confirm(msg)) return

    setTrabajando(true)
    setAviso(null)
    const r = await llamar(filasListas, false)
    if (r.ok && r.resumen) {
      const a = r.resumen
      setAviso({
        tipo: 'ok',
        texto:
          `Calendario importado: ${plural(a.crear, 'franja creada', 'franjas creadas')}, ` +
          `${plural(a.actualizar, 'actualizada', 'actualizadas')}, ${plural(a.desactivar, 'desactivada', 'desactivadas')}, ` +
          `${a.sin_cambios} sin cambios.` +
          (a.desactivar > 0
            ? ` Quedan ${plural(a.reservas_futuras_afectadas, 'reserva futura', 'reservas futuras')} y ` +
              `${plural(a.turnos_fijos_afectados, 'turno fijo activo', 'turnos fijos activos')} en franjas desactivadas para revisar.`
            : ''),
      })
      setPrevia(null); setFilasListas([]); setTexto('')
      await recargar()
    } else if (Array.isArray(r.errores) && r.errores.length > 0) {
      // Cambió algo desde la vista previa (otro encargado, por ejemplo): se muestra y se pide revisar.
      setPrevia(null)
      setErroresServidor([...new Set(r.errores.map(e => textoErrorServidor(e.fila, e.motivo, filasListas)))])
    } else {
      setAviso({ tipo: 'error', texto: mensajeError(r) })
    }
    setTrabajando(false)
  }

  const th = TH
  const celda = 'font-lora text-sm text-tinta py-2 pr-4'
  const celdaSuave = 'font-lora text-sm text-tinta/60 py-2 pr-4'

  return (
    <div>
      <AvisoBox aviso={aviso} />

      <div className="mb-8 border border-gris-claro p-4 flex flex-col gap-4">
        <p className="font-lora text-xs tracking-widest text-oro">IMPORTAR CALENDARIO</p>
        <p className="font-lora text-xs text-tinta/50">
          Una fila por franja, con las columnas Día, Desde, Hasta, Cupo y Profesor (opcional). El día puede ser
          «Lun», «Lun-Vie» o «Lun, Mié, Vie». Las horas pueden ir como 7:00, 07:30 o 7hs.
        </p>

        <div className="flex flex-col gap-1">
          <label className={LABEL}>PEGÁ ACÁ EL CALENDARIO DESDE EXCEL O GOOGLE SHEETS</label>
          <textarea
            value={texto}
            onChange={e => cambiarTexto(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={'Día\tDesde\tHasta\tCupo\tProfesor\nLun-Vie\t07:00\t08:30\t25\tAna Pérez'}
            className={`${INPUT} w-full font-mono text-xs`}
          />
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <label className={`${BTN} cursor-pointer`}>
            SUBIR CSV
            <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={subirCsv} className="hidden" />
          </label>
          <button type="button" className={BTN} onClick={descargarPlantilla}>DESCARGAR PLANTILLA</button>
        </div>

        <div className="flex flex-col gap-2">
          <p className={LABEL}>MODO</p>
          {MODOS_IMPORT.map(m => (
            <label key={m.id} className="flex items-start gap-2 font-lora text-sm text-tinta cursor-pointer">
              <input type="radio" name="modo-import" className="mt-1" checked={modo === m.id} onChange={() => cambiarModo(m.id)} />
              <span>
                {m.label}
                <span className="block font-lora text-xs text-tinta/40">{m.ayuda}</span>
              </span>
            </label>
          ))}
        </div>

        <div>
          <button type="button" className={BTN} disabled={trabajando || texto.trim() === ''} onClick={vistaPrevia}>
            {trabajando && !previa ? 'REVISANDO…' : 'VISTA PREVIA'}
          </button>
        </div>
      </div>

      {erroresLectura.length > 0 && (
        <div className="border border-rojo p-4 mb-6">
          <p className="font-lora text-xs tracking-widest text-rojo mb-2">REVISÁ EL ARCHIVO ({erroresLectura.length})</p>
          <ul className="flex flex-col gap-1">
            {erroresLectura.map((e, i) => <li key={i} className="font-lora text-sm text-rojo">{e}</li>)}
          </ul>
        </div>
      )}

      {erroresServidor.length > 0 && (
        <div className="border border-rojo p-4 mb-6">
          <p className="font-lora text-xs tracking-widest text-rojo mb-2">NO SE PUEDE IMPORTAR ({erroresServidor.length})</p>
          <ul className="flex flex-col gap-1">
            {erroresServidor.map((e, i) => <li key={i} className="font-lora text-sm text-rojo">{e}</li>)}
          </ul>
        </div>
      )}

      {previa && (
        <div className="border border-gris-claro p-4 mb-8">
          <p className="font-lora text-xs tracking-widest text-oro mb-3">VISTA PREVIA — TODAVÍA NO SE GUARDÓ NADA</p>
          <p className="font-lora text-sm text-tinta mb-1">
            Crear {previa.resumen.crear} · Actualizar {previa.resumen.actualizar} · Sin cambios {previa.resumen.sin_cambios} · Desactivar {previa.resumen.desactivar}
          </p>
          {previa.resumen.desactivar > 0 && (
            <p className="font-lora text-sm text-rojo mb-1">
              Reservas futuras en franjas que se desactivan: {previa.resumen.reservas_futuras_afectadas} · Turnos fijos activos: {previa.resumen.turnos_fijos_afectados}
            </p>
          )}

          {previa.detalle.crear.length > 0 && (
            <div className="mt-4">
              <p className={`${LABEL} mb-1`}>SE CREAN ({previa.detalle.crear.length})</p>
              <table className="w-full border-collapse">
                <thead><tr className="border-b-2 border-gris-claro">
                  <th className={th}>DÍA</th><th className={th}>HORARIO</th><th className={th}>CUPO</th><th className={th}>PROFESOR</th>
                </tr></thead>
                <tbody>
                  {previa.detalle.crear.map((f, i) => (
                    <tr key={i} className="border-b border-gris-claro">
                      <td className={celda}>{DIAS[f.dia_semana]}</td>
                      <td className={celda}>{f.hora_desde} – {f.hora_hasta}</td>
                      <td className={celda}>{f.cupo}</td>
                      <td className={celdaSuave}>{f.profesor ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {previa.detalle.actualizar.length > 0 && (
            <div className="mt-4">
              <p className={`${LABEL} mb-1`}>SE ACTUALIZAN ({previa.detalle.actualizar.length})</p>
              <table className="w-full border-collapse">
                <thead><tr className="border-b-2 border-gris-claro">
                  <th className={th}>DÍA</th><th className={th}>HORARIO</th><th className={th}>CUPO</th><th className={th}>PROFESOR</th><th className={th}></th>
                </tr></thead>
                <tbody>
                  {previa.detalle.actualizar.map((f, i) => (
                    <tr key={i} className="border-b border-gris-claro">
                      <td className={celda}>{DIAS[f.dia_semana]}</td>
                      <td className={celda}>{f.hora_desde} – {f.hora_hasta}</td>
                      <td className={celda}>{f.cupo_antes === f.cupo ? f.cupo : `${f.cupo_antes} → ${f.cupo}`}</td>
                      <td className={celdaSuave}>
                        {(f.profesor_antes ?? null) === (f.profesor ?? null)
                          ? (f.profesor ?? '—')
                          : `${f.profesor_antes ?? '—'} → ${f.profesor ?? '—'}`}
                      </td>
                      <td className={celdaSuave}>{f.reactivada ? 'se reactiva' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {previa.detalle.desactivar.length > 0 && (
            <div className="mt-4">
              <p className={`${LABEL} mb-1`}>SE DESACTIVAN ({previa.detalle.desactivar.length})</p>
              <table className="w-full border-collapse">
                <thead><tr className="border-b-2 border-gris-claro">
                  <th className={th}>DÍA</th><th className={th}>HORARIO</th><th className={th}>CUPO</th><th className={th}>PROFESOR</th>
                  <th className={th}>RESERVAS FUTURAS</th><th className={th}>TURNOS FIJOS</th>
                </tr></thead>
                <tbody>
                  {previa.detalle.desactivar.map((f, i) => (
                    <tr key={i} className="border-b border-gris-claro">
                      <td className={celda}>{DIAS[f.dia_semana]}</td>
                      <td className={celda}>{f.hora_desde} – {f.hora_hasta}</td>
                      <td className={celda}>{f.cupo}</td>
                      <td className={celdaSuave}>{f.profesor ?? '—'}</td>
                      <td className={`${celda} ${f.reservas_futuras > 0 ? 'text-rojo' : ''}`}>{f.reservas_futuras}</td>
                      <td className={`${celda} ${(f.turnos_fijos ?? 0) > 0 ? 'text-rojo' : ''}`}>{f.turnos_fijos ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex items-center gap-4">
            <button type="button" className={BTN} disabled={!puedeConfirmar} onClick={confirmar}>
              {trabajando ? 'IMPORTANDO…' : 'CONFIRMAR IMPORTACIÓN'}
            </button>
            {cambios === 0 && (
              <p className="font-lora text-xs text-tinta/50">No hay nada para cambiar: el calendario ya está así.</p>
            )}
          </div>
        </div>
      )}

      <p className="font-lora text-xs tracking-widest text-oro mb-3">FRANJAS ACTUALES</p>
      {cargandoFranjas ? <Cargando /> : franjas.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">TODAVÍA NO HAY FRANJAS CARGADAS</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5, 6, 7].map(dia => {
            const delDia = franjas.filter(f => f.dia_semana === dia)
            if (delDia.length === 0) return null
            return (
              <div key={dia} className="border border-gris-claro p-3">
                <p className="font-playfair text-base text-tinta mb-1">{DIAS[dia]}</p>
                {delDia.map(f => (
                  <p key={f.id} className={`font-lora text-sm text-tinta/70 ${f.activa ? '' : 'opacity-50'}`}>
                    {f.hora_desde} – {f.hora_hasta} · cupo {f.cupo}
                    {f.profesor ? ` · Prof. ${f.profesor}` : ''}{f.activa ? '' : ' · inactiva'}
                  </p>
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
    const cuerpo = {
      action: 'excepcion-guardar',
      fecha,
      franja_id: franjaId || null,
      cerrado,
      cupo_override: cupo === '' ? null : Number(cupo),
      motivo: motivo.trim() || undefined,
    }

    // Un cierre cancela reservas y avisa por push: primero se pide la vista previa (no escribe ni
    // envía nada) y sólo se guarda si el encargado confirma el conteo.
    if (cerrado) {
      const previa = await callEdgeFunction<VistaPrevia>('gimnasio-turnos-admin', { ...cuerpo, solo_vista_previa: true })
      if (!previa.ok) {
        setAviso({ tipo: 'error', texto: mensajeError(previa) })
        setEnviando(false)
        return
      }
      const nRes = previa.reservas_a_cancelar ?? 0
      const nSoc = previa.socios_a_avisar ?? 0
      const sinToken = previa.socios_sin_token ?? 0
      const texto =
        `Se cancelarán ${nRes} reserva${nRes === 1 ? '' : 's'} y se avisará a ${nSoc} socio${nSoc === 1 ? '' : 's'} ` +
        `con este mensaje:\n\n"${motivo.trim()}"` +
        (sinToken > 0 ? `\n\n${sinToken} socio${sinToken === 1 ? '' : 's'} no tiene${sinToken === 1 ? '' : 'n'} las notificaciones activadas y no se enterará${sinToken === 1 ? '' : 'n'} por push.` : '') +
        '\n\n¿Confirmás el cierre?'
      if (!window.confirm(texto)) { setEnviando(false); return }
    }

    const r = await callEdgeFunction<ResultadoCierre>('gimnasio-turnos-admin', cuerpo)
    if (r.ok) {
      if (cerrado) {
        const canceladas = r.reservas_canceladas ?? 0
        const fallidos = r.avisos_fallidos ?? 0
        const sinToken = r.avisos_sin_token ?? 0
        setAviso({
          tipo: fallidos > 0 ? 'error' : 'ok',
          texto:
            `Cierre guardado. Se cancelaron ${canceladas} reserva${canceladas === 1 ? '' : 's'}; ` +
            `avisos enviados: ${r.avisos_enviados ?? 0}` +
            (fallidos > 0 ? `, con error: ${fallidos} (las reservas igual quedaron canceladas)` : '') +
            (sinToken > 0 ? `, sin notificaciones activadas: ${sinToken}` : '') + '.',
        })
      } else {
        setAviso({ tipo: 'ok', texto: 'Excepción guardada.' })
      }
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
        <div className="flex flex-col gap-1 w-full max-w-xl">
          <label className={LABEL}>{cerrado ? 'MENSAJE PARA LOS SOCIOS' : 'MOTIVO'}</label>
          <input
            value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} className={INPUT}
            placeholder={cerrado ? 'Ej: Feriado, abrimos el viernes' : 'opcional'}
            required={cerrado} minLength={cerrado ? 3 : undefined}
          />
        </div>
        <button type="submit" disabled={enviando} className={BTN}>{cerrado ? 'CERRAR…' : 'GUARDAR'}</button>
        {cerrado && (
          <p className="w-full font-lora text-xs text-tinta/50">
            Cerrar cancela las reservas de ese día o franja y les avisa por push a los socios con este mensaje. Borrar el cierre después no las restaura.
          </p>
        )}
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
              <th className={TH}>MENSAJE</th>
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

type CampoNumerico = Exclude<keyof Config, 'modo_cupos' | 'ventana_reserva'>

const CAMPOS_CONFIG: { campo: CampoNumerico; label: string; min: number; max: number; ayuda: string }[] = [
  { campo: 'anticipacion_dias', label: 'ANTICIPACIÓN (DÍAS)', min: 0, max: 30, ayuda: 'Con cuántos días de anticipación se puede reservar (0 a 30).' },
  { campo: 'pct_cupo_fijos',    label: '% DE CUPO PARA FIJOS', min: 0, max: 100, ayuda: 'Porcentaje del cupo de cada franja reservado a turnos fijos.' },
  { campo: 'faltas_aviso',      label: 'FALTAS PARA AVISAR', min: 1, max: 20, ayuda: 'Faltas seguidas antes del aviso por push de que se va a liberar el horario.' },
  { campo: 'faltas_baja',       label: 'FALTAS PARA LIBERAR EL HORARIO', min: 2, max: 30, ayuda: 'Faltas seguidas tras las cuales se saca el horario. Tiene que ser mayor que las del aviso.' },
  { campo: 'semanas_fijos',     label: 'SEMANAS DE TURNOS FIJOS', min: 1, max: 12, ayuda: 'Cuántas semanas hacia adelante se reservan los turnos fijos.' },
  { campo: 'tolerancia_min',    label: 'TOLERANCIA (MIN)', min: 0, max: 120, ayuda: 'Minutos de margen alrededor del horario de la franja.' },
]

function ConfigSeccion() {
  const [cfg, setCfg]     = useState<Config | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const c = await callEdgeFunction<{ config: Config }>('gimnasio-turnos-admin', { action: 'config-get' })
    if (c.ok && c.config) {
      setCfg(c.config)
      setValores(Object.fromEntries(CAMPOS_CONFIG.map(x => [x.campo, String(c.config[x.campo])])))
    } else {
      setAviso({ tipo: 'error', texto: mensajeError(c) })
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
      ventana_reserva: cfg.ventana_reserva,
      ...Object.fromEntries(CAMPOS_CONFIG.map(x => [x.campo, Number(valores[x.campo])])),
    })
    if (r.ok) setAviso({ tipo: 'ok', texto: 'Configuración guardada.' })
    else setAviso({ tipo: 'error', texto: mensajeError(r) })
    setEnviando(false)
  }

  if (loading) return <Cargando />
  if (!cfg) return <AvisoBox aviso={aviso} />

  // La anticipación sólo rige cuando la ventana es "próximos N días".
  const campos = CAMPOS_CONFIG.filter(x => x.campo !== 'anticipacion_dias' || cfg.ventana_reserva === 'dias')

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

        <div className="flex flex-col gap-1">
          <label className={LABEL}>VENTANA DE RESERVA</label>
          <select value={cfg.ventana_reserva} onChange={e => setCfg({ ...cfg, ventana_reserva: e.target.value as Config['ventana_reserva'] })} className={`${INPUT} w-64`}>
            <option value="mes">Todo el mes en curso</option>
            <option value="dias">Próximos N días</option>
          </select>
          <p className="font-lora text-xs text-tinta/40">
            {cfg.ventana_reserva === 'mes'
              ? 'Los socios reservan cualquier día desde hoy hasta fin de mes. El mes siguiente se abre el día 1.'
              : 'Los socios reservan desde hoy hasta la cantidad de días que indiques abajo.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-6">
          {campos.map(x => (
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
      {seccion === 'importar'    && <ImportarSeccion />}
      {seccion === 'excepciones' && <ExcepcionesSeccion />}
      {seccion === 'config'      && <ConfigSeccion />}
    </div>
  )
}
