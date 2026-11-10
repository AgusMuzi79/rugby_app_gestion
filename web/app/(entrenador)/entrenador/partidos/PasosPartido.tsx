'use client'

// Pasos del partido del entrenador (presentacionales): equipo y partido,
// asistencia, mesa y resultado. Misma estructura y textos que
// app/app/(entrenador)/partido.tsx; el estado y los guardados viven en page.tsx.

import { seccionarPartidos, DIAS_ATRAS_PARTIDOS, DIAS_ADELANTE_PARTIDOS, type Paso } from '@/lib/partidosWeb'
import { MAX_SUPLENTES, MAX_TITULARES, type ConteoMesa, type JugadorPartido, type RolEnMesa } from '@/lib/mesaPartido'
import type { Equipo } from '@/lib/equiposPartidoWeb'

export interface PartidoEvento {
  id: string
  fecha: string
  rival: string | null
  lugar: string | null
  /** Tiene al menos un resultado cargado (de cualquier equipo). */
  conResultado: boolean
}

// YYYY-MM-DD como fecha local (new Date('YYYY-MM-DD') es UTC y en Argentina muestra el día anterior).
export function formatFecha(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}

const BOTON_PRIMARIO = 'font-lora text-xs tracking-widest px-6 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const BOTON_SECUNDARIO = 'font-lora text-xs tracking-widest px-6 py-3 border border-gris-claro text-tinta hover:border-oro transition-colors'
const ETIQUETA = 'font-lora text-xs tracking-widest text-texto-2 mb-3'

const NOMBRE_PASO: Record<Paso, string> = {
  equipo: 'EQUIPO · PARTIDO',
  asistencia: 'ASISTENCIA',
  mesa: 'MESA',
  resultado: 'RESULTADO',
}

export function IndicadorPasos({ pasos, actual }: { pasos: Paso[]; actual: Paso }) {
  const idx = pasos.indexOf(actual)
  return (
    <ol aria-label="Pasos del partido" className="flex flex-wrap gap-x-6 gap-y-2 mb-8 border-b border-gris-claro pb-3">
      {pasos.map((p, i) => (
        <li
          key={p}
          aria-current={p === actual ? 'step' : undefined}
          className={`font-lora text-xs tracking-widest ${p === actual ? 'text-tinta' : i < idx ? 'text-texto-2' : 'text-texto-2/60'}`}
        >
          <span className={p === actual ? 'border-b-2 border-oro pb-3' : ''}>{i + 1}. {NOMBRE_PASO[p]}</span>
        </li>
      ))}
    </ol>
  )
}

/** Error u "✓ … guardado" de cada paso, anunciado al lector de pantalla. */
export function EstadoGuardado({ error, ok }: { error: string | null; ok: string | null }) {
  return (
    <div aria-live="polite" className="mb-4">
      {error ? (
        <p role="alert" className="font-lora text-sm text-rojo-texto border border-rojo px-4 py-3">{error}</p>
      ) : ok ? (
        <p className="font-lora text-sm text-tinta">✓ {ok}</p>
      ) : null}
    </div>
  )
}

function BotonVolver({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="font-lora text-xs tracking-widest text-texto-2 hover:text-tinta mb-6">
      {texto}
    </button>
  )
}

// ─── Paso 1 — Equipo y partido ────────────────────────────────────────────────

export function PasoEquipo({
  partidos, partidoSeleccionado, onSeleccionarPartido,
  equipos, equipoObligatorio, equipoSeleccionado, onSeleccionarEquipo,
  onContinuar, cargando, registraResultado, hayError, hoy,
}: {
  partidos: PartidoEvento[]
  partidoSeleccionado: PartidoEvento | null
  onSeleccionarPartido: (p: PartidoEvento) => void
  equipos: Equipo[]
  equipoObligatorio: Equipo | null
  equipoSeleccionado: Equipo | null
  onSeleccionarEquipo: (e: Equipo) => void
  onContinuar: () => void
  cargando: boolean
  registraResultado: boolean
  hayError: boolean
  hoy: string
}) {
  const puedeAvanzar = equipoSeleccionado !== null && partidoSeleccionado !== null
  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className={ETIQUETA}>SELECCIONAR PARTIDO</p>
        {partidos.length === 0 ? (
          // Con error de lectura, el aviso con REINTENTAR ya está arriba: no es "sin partidos".
          hayError ? null : (
            <div className="py-6">
              <p className="font-lora text-sm text-texto-2">
                Sin partidos entre los últimos {DIAS_ATRAS_PARTIDOS} días y los próximos {DIAS_ADELANTE_PARTIDOS}.
              </p>
              <p className="font-lora text-xs text-texto-2 mt-1">El coordinador debe cargarlos en el calendario.</p>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-6">
            {seccionarPartidos(partidos, hoy, registraResultado).map(seccion => (
              <div key={seccion.clave} role="radiogroup" aria-label={seccion.titulo} className="flex flex-col gap-2">
                <p className={`font-lora text-xs tracking-widest ${seccion.clave === 'sin_resultado' ? 'text-rojo-texto' : 'text-texto-2'}`}>
                  {seccion.titulo}
                </p>
                {seccion.partidos.map(p => {
                  const activo = partidoSeleccionado?.id === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => onSeleccionarPartido(p)}
                      className={`text-left bg-card border px-5 py-3 flex items-center justify-between gap-4 transition-colors ${activo ? 'border-oro' : 'border-gris-claro hover:border-tinta/40'}`}
                    >
                      <span>
                        <span className="block font-playfair text-lg font-bold text-tinta">vs {p.rival ?? 'Rival por confirmar'}</span>
                        <span className="block font-lora text-xs text-texto-2 mt-0.5">{formatFecha(p.fecha)}{p.lugar ? ` · ${p.lugar}` : ''}</span>
                      </span>
                      {activo && <span aria-hidden="true" className="font-lora text-oro">✓</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className={ETIQUETA}>SELECCIONAR EQUIPO</p>
        {equipos.length === 0 ? (
          hayError ? null : <p className="font-lora text-sm text-texto-2">Preparando equipos…</p>
        ) : (
          <div role="radiogroup" aria-label="Equipo" className="flex flex-col gap-2">
            {equipos.map(e => {
              const activo = equipoSeleccionado?.id === e.id
              const esObligatorio = e.id === equipoObligatorio?.id
              return (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => onSeleccionarEquipo(e)}
                  className={`text-left bg-card border px-5 py-3 flex items-center gap-4 transition-colors ${activo ? 'border-oro' : 'border-gris-claro hover:border-tinta/40'}`}
                >
                  <span className="flex-1 font-playfair text-lg font-bold text-tinta">{e.nombre}</span>
                  <span className={`font-lora text-xs tracking-widest px-2 py-0.5 ${esObligatorio ? 'bg-oro text-papel' : 'border border-gris-claro text-texto-2'}`}>
                    {esObligatorio ? 'OBLIGATORIO' : 'OPCIONAL'}
                  </span>
                  {activo && <span aria-hidden="true" className="font-lora text-oro">✓</span>}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <div>
        <button type="button" onClick={onContinuar} disabled={!puedeAvanzar || cargando} className={BOTON_PRIMARIO}>
          {cargando ? 'CARGANDO…' : 'CONTINUAR A ASISTENCIA'}
        </button>
      </div>
    </div>
  )
}

// ─── Paso 2 — Asistencia ──────────────────────────────────────────────────────

export function PasoAsistencia({
  jugadores, guardando, guardada, error, esInfantil, alertas, onToggle, onGuardar, onVolver,
}: {
  jugadores: JugadorPartido[]
  guardando: boolean
  guardada: boolean
  error: string | null
  esInfantil: boolean
  alertas: string[]
  onToggle: (id: string, presente: boolean) => void
  onGuardar: () => void
  onVolver: () => void
}) {
  const presentes = jugadores.filter(j => j.presente).length
  const ausentes = jugadores.length - presentes
  const puedeGuardar = esInfantil || presentes > 0
  return (
    <div>
      <BotonVolver texto="← VOLVER" onClick={onVolver} />

      <div className="flex gap-4 mb-6">
        <div className="bg-card border border-gris-claro px-6 py-3 text-center">
          <p className="font-playfair text-3xl font-black text-tinta">{presentes}</p>
          <p className="font-lora text-xs tracking-widest text-texto-2">PRESENTES</p>
        </div>
        <div className="bg-card border border-gris-claro px-6 py-3 text-center">
          <p className="font-playfair text-3xl font-black text-rojo-texto">{ausentes}</p>
          <p className="font-lora text-xs tracking-widest text-texto-2">AUSENTES</p>
        </div>
      </div>

      {jugadores.length === 0 ? (
        <p className="font-lora text-sm text-texto-2 py-6">No hay jugadores activos en la división.</p>
      ) : (
        <ul className="flex flex-col mb-6">
          {jugadores.map((j, i) => (
            <li key={j.id} className="flex items-center gap-4 border-b border-gris-claro/50 py-2">
              <span className="font-lora text-xs text-texto-2 w-6">{String(i + 1).padStart(2, '0')}</span>
              <span className="flex-1 font-lora text-sm text-tinta">{j.nombre_completo}</span>
              <div role="radiogroup" aria-label={`Asistencia de ${j.nombre_completo}`} className="flex gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={j.presente}
                  aria-label={`Presente, ${j.nombre_completo}`}
                  onClick={() => onToggle(j.id, true)}
                  className={`font-lora text-xs tracking-widest px-3 py-1 border transition-colors ${j.presente ? 'bg-tinta text-papel border-tinta' : 'border-gris-claro text-texto-2 hover:border-tinta/40'}`}
                >
                  PRES
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!j.presente}
                  aria-label={`Ausente, ${j.nombre_completo}`}
                  onClick={() => onToggle(j.id, false)}
                  className={`font-lora text-xs tracking-widest px-3 py-1 border transition-colors ${!j.presente ? 'bg-rojo text-white border-rojo' : 'border-gris-claro text-texto-2 hover:border-tinta/40'}`}
                >
                  AUS
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {alertas.length > 0 && (
        <p role="status" className="font-lora text-sm text-rojo-texto border border-rojo px-4 py-3 mb-4">
          Con 4 ausencias seguidas: {alertas.join(', ')}. Se envió el aviso.
        </p>
      )}
      <EstadoGuardado error={error} ok={guardada && !guardando && esInfantil ? 'Asistencia guardada' : null} />
      <button type="button" onClick={onGuardar} disabled={!puedeGuardar || guardando} className={BOTON_PRIMARIO}>
        {guardando ? 'GUARDANDO…' : esInfantil ? 'GUARDAR ASISTENCIA' : 'GUARDAR Y CONTINUAR A MESA'}
      </button>
    </div>
  )
}

// ─── Paso 3 — Mesa ────────────────────────────────────────────────────────────

function FilaMesa({ jugador, onAsignar, titularLleno, suplenteLleno }: {
  jugador: JugadorPartido
  onAsignar: (id: string, rol: RolEnMesa) => void
  titularLleno: boolean
  suplenteLleno: boolean
}) {
  if (jugador.rolEnMesa !== null) {
    return (
      <li className="flex items-center gap-4 bg-gris-claro border border-oro text-tinta px-4 py-2">
        <span className="flex-1 font-lora text-sm">{jugador.nombre_completo}</span>
        <button
          type="button"
          onClick={() => onAsignar(jugador.id, jugador.rolEnMesa!)}
          aria-label={`Sacar a ${jugador.nombre_completo} de la mesa`}
          className="font-lora text-sm px-2 hover:text-oro"
        >
          ✕
        </button>
      </li>
    )
  }
  return (
    <li className="flex items-center gap-4 bg-card border border-gris-claro px-4 py-2">
      <span className="flex-1 font-lora text-sm text-tinta">{jugador.nombre_completo}</span>
      <button
        type="button"
        onClick={() => onAsignar(jugador.id, 'titular')}
        disabled={titularLleno}
        aria-label={`Poner a ${jugador.nombre_completo} de titular`}
        className="font-lora text-xs tracking-widest px-3 py-1 border border-gris-claro text-tinta hover:border-oro disabled:opacity-40 disabled:cursor-not-allowed"
      >
        TITULAR
      </button>
      <button
        type="button"
        onClick={() => onAsignar(jugador.id, 'suplente')}
        disabled={suplenteLleno}
        aria-label={`Poner a ${jugador.nombre_completo} de suplente`}
        className="font-lora text-xs tracking-widest px-3 py-1 border border-gris-claro text-tinta hover:border-oro disabled:opacity-40 disabled:cursor-not-allowed"
      >
        SUPLENTE
      </button>
    </li>
  )
}

export function PasoMesa({
  presentes, conteo, guardando, guardada, error, onAsignar, onGuardar, onVolver, onIrAResultado,
}: {
  presentes: JugadorPartido[]
  conteo: ConteoMesa
  guardando: boolean
  guardada: boolean
  error: string | null
  onAsignar: (id: string, rol: RolEnMesa) => void
  onGuardar: () => void
  onVolver: () => void
  onIrAResultado: () => void
}) {
  const titularLleno = conteo.titular >= MAX_TITULARES
  const suplenteLleno = conteo.suplente >= MAX_SUPLENTES
  const grupos: { label: string; jugadores: JugadorPartido[] }[] = [
    { label: 'TITULARES', jugadores: presentes.filter(j => j.rolEnMesa === 'titular') },
    { label: 'SUPLENTES', jugadores: presentes.filter(j => j.rolEnMesa === 'suplente') },
    { label: 'DISPONIBLES', jugadores: presentes.filter(j => j.rolEnMesa === null) },
  ]
  return (
    <div>
      <BotonVolver texto="← VOLVER A ASISTENCIA" onClick={onVolver} />

      <div className="flex gap-4 mb-6">
        <div className="bg-card border border-gris-claro px-6 py-3 text-center">
          <p className={`font-playfair text-3xl font-black ${conteo.titular > MAX_TITULARES ? 'text-rojo-texto' : 'text-tinta'}`}>{conteo.titular}/{MAX_TITULARES}</p>
          <p className="font-lora text-xs tracking-widest text-texto-2">TITULARES</p>
        </div>
        <div className="bg-card border border-gris-claro px-6 py-3 text-center">
          <p className={`font-playfair text-3xl font-black ${conteo.suplente > MAX_SUPLENTES ? 'text-rojo-texto' : 'text-tinta'}`}>{conteo.suplente}/{MAX_SUPLENTES}</p>
          <p className="font-lora text-xs tracking-widest text-texto-2">SUPLENTES</p>
        </div>
      </div>

      {presentes.length === 0 && <p className="font-lora text-sm text-texto-2 py-6">No hay jugadores presentes.</p>}

      {grupos.filter(g => g.jugadores.length > 0).map(g => (
        <section key={g.label} className="mb-6">
          <p className={ETIQUETA}>{g.label}</p>
          <ul className="flex flex-col gap-1">
            {g.jugadores.map(j => (
              <FilaMesa key={j.id} jugador={j} onAsignar={onAsignar} titularLleno={titularLleno} suplenteLleno={suplenteLleno} />
            ))}
          </ul>
        </section>
      ))}

      <EstadoGuardado error={error} ok={guardada && !guardando ? 'Mesa guardada' : null} />
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onGuardar} disabled={guardando} className={BOTON_PRIMARIO}>
          {guardando ? 'GUARDANDO…' : 'GUARDAR MESA'}
        </button>
        {guardada && (
          <button type="button" onClick={onIrAResultado} className={BOTON_SECUNDARIO}>IR AL RESULTADO →</button>
        )}
      </div>
    </div>
  )
}

// ─── Paso 4 — Resultado ───────────────────────────────────────────────────────

const INPUT = 'font-lora text-tinta bg-card border border-borde-control px-4 py-2 outline-none focus:border-tinta transition-colors'

export function PasoResultado({
  puntosPropios, puntosRival, rivalNombre, guardando, guardado, error,
  onChangePropios, onChangeRival, onChangeRivalNombre, onGuardar, onVolver,
}: {
  puntosPropios: string
  puntosRival: string
  rivalNombre: string
  guardando: boolean
  guardado: boolean
  error: string | null
  onChangePropios: (v: string) => void
  onChangeRival: (v: string) => void
  onChangeRivalNombre: (v: string) => void
  onGuardar: () => void
  onVolver: () => void
}) {
  return (
    <form onSubmit={e => { e.preventDefault(); onGuardar() }}>
      <BotonVolver texto="← VOLVER A MESA" onClick={onVolver} />

      <div className="flex items-end gap-6 mb-6">
        <label className="flex flex-col">
          <span className={ETIQUETA}>NOSOTROS</span>
          <input
            inputMode="numeric"
            maxLength={3}
            value={puntosPropios}
            onChange={e => onChangePropios(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            aria-label="Puntos nuestros"
            className={`${INPUT} w-24 text-3xl font-playfair font-black text-center`}
          />
        </label>
        <span className="font-playfair italic text-2xl text-texto-2 pb-3">vs</span>
        <label className="flex flex-col">
          <span className={ETIQUETA}>RIVAL</span>
          <input
            inputMode="numeric"
            maxLength={3}
            value={puntosRival}
            onChange={e => onChangeRival(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            aria-label="Puntos del rival"
            className={`${INPUT} w-24 text-3xl font-playfair font-black text-center`}
          />
        </label>
      </div>

      <label className="flex flex-col mb-6 max-w-md">
        <span className={ETIQUETA}>NOMBRE DEL RIVAL</span>
        <input
          value={rivalNombre}
          onChange={e => onChangeRivalNombre(e.target.value)}
          placeholder="Nombre del rival"
          className={`${INPUT} text-sm`}
        />
      </label>

      <EstadoGuardado error={error} ok={guardado && !guardando ? 'Resultado guardado' : null} />
      <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
        {guardando ? 'GUARDANDO…' : guardado ? 'ACTUALIZAR RESULTADO' : 'GUARDAR RESULTADO'}
      </button>
    </form>
  )
}
