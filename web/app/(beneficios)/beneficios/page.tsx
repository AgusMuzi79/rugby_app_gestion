'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import { errorTamano, prepararImagen } from '@/lib/imagenSubida'
import {
  BUCKET_BENEFICIOS, ESTADO_LABEL, RUBROS, datosBeneficio, errorImagen, estadoBeneficio,
  extensionImagen, formDesdeBeneficio, formVacio, hoyArgentina, labelRubro, ordenarBeneficios,
  rutaDesdeUrlPublica, validarBeneficio,
  type BeneficioFila, type EstadoBeneficio, type FormBeneficio,
} from '@/lib/beneficios'

const COLUMNAS = 'id, nombre, rubro, descuento, descripcion, condiciones, direccion, zona, telefono_whatsapp, ' +
  'instagram, sitio_web, logo_url, imagen_url, destacado, orden, activo, vigente_desde, vigente_hasta'

const ESTILO_ESTADO: Record<EstadoBeneficio, string> = {
  activo:     'bg-oro/20 border border-oro text-tinta',
  pausado:    'bg-gris-claro text-tinta',
  vencido:    'border border-rojo text-rojo-texto',
  programado: 'border border-borde-control text-tinta',
}

type TipoImagen = 'logo' | 'foto'
const COLUMNA_IMAGEN: Record<TipoImagen, 'logo_url' | 'imagen_url'> = { logo: 'logo_url', foto: 'imagen_url' }

/** One image slot of the form: a new file (with preview) or the removal of the saved one. */
interface SlotImagen { file: File | null; preview: string | null; quitada: boolean }
const SLOT_VACIO: SlotImagen = { file: null, preview: null, quitada: false }

type Editor = { modo: 'crear' } | { modo: 'editar'; fila: BeneficioFila }

function fechaCorta(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

function textoVigencia(b: BeneficioFila) {
  if (b.vigente_desde && b.vigente_hasta) return `Del ${fechaCorta(b.vigente_desde)} al ${fechaCorta(b.vigente_hasta)}`
  if (b.vigente_desde) return `Desde el ${fechaCorta(b.vigente_desde)}`
  if (b.vigente_hasta) return `Hasta el ${fechaCorta(b.vigente_hasta)}`
  return 'Sin vencimiento'
}

/** Best effort: the row is already saved/deleted, a leftover file is only storage. */
async function borrarObjetos(urls: (string | null | undefined)[]) {
  const rutas = urls.map(u => rutaDesdeUrlPublica(u, BUCKET_BENEFICIOS)).filter((r): r is string => !!r)
  if (rutas.length === 0) return
  const { error } = await supabase.storage.from(BUCKET_BENEFICIOS).remove(rutas)
  if (error) console.warn('beneficios: image cleanup failed', error.message)
}

async function subirImagen(id: string, tipo: TipoImagen, file: File): Promise<{ url: string } | { error: string }> {
  const ruta = `${id}/${tipo}-${Date.now()}.${extensionImagen(file.type)}`
  const { error } = await supabase.storage.from(BUCKET_BENEFICIOS).upload(ruta, file, { contentType: file.type })
  if (error) return { error: error.message }
  return { url: supabase.storage.from(BUCKET_BENEFICIOS).getPublicUrl(ruta).data.publicUrl }
}

export default function BeneficiosPage() {
  const [lista, setLista]         = useState<BeneficioFila[]>([])
  const [loading, setLoading]     = useState(true)
  const [listError, setListError] = useState('')
  const [aviso, setAviso]         = useState('')
  const [editor, setEditor]       = useState<Editor | null>(null)
  const [aBorrar, setABorrar]     = useState<BeneficioFila | null>(null)
  const [borrando, setBorrando]   = useState(false)
  const [cambiandoId, setCambiandoId] = useState<string | null>(null)
  // Last request number: a late response from an older fetch never overwrites a newer list.
  const pedidoRef = useRef(0)

  const cargar = useCallback(async () => {
    const pedido = ++pedidoRef.current
    setLoading(true)
    const { data, error } = await supabase.from('beneficios').select(COLUMNAS).limit(500)
    if (pedido !== pedidoRef.current) return
    if (error) {
      setListError(error.message)
    } else {
      setListError('')
      setLista(ordenarBeneficios((data ?? []) as unknown as BeneficioFila[]))
    }
    setLoading(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const hoy = hoyArgentina()
  const vigentes = lista.filter(b => estadoBeneficio(b, hoy) === 'activo').length

  const alternarActivo = async (b: BeneficioFila) => {
    setAviso('')
    setCambiandoId(b.id)
    const { data, error } = await supabase.from('beneficios').update({ activo: !b.activo }).eq('id', b.id).select('id')
    setCambiandoId(null)
    if (error) { setAviso(`No se pudo ${b.activo ? 'pausar' : 'activar'} "${b.nombre}": ${error.message}`); return }
    if (!data || data.length === 0) {
      setAviso(`No se guardó el cambio en "${b.nombre}": no tenés permiso o el beneficio ya no existe.`)
      await cargar()
      return
    }
    setLista(ls => ls.map(x => x.id === b.id ? { ...x, activo: !b.activo } : x))
  }

  const confirmarBorrado = async () => {
    if (!aBorrar) return
    const b = aBorrar
    setBorrando(true); setAviso('')
    const { data, error } = await supabase.from('beneficios').delete().eq('id', b.id).select('id')
    setBorrando(false)
    setABorrar(null)
    if (error) { setAviso(`No se pudo eliminar "${b.nombre}": ${error.message}`); return }
    if (!data || data.length === 0) {
      setAviso(`No se eliminó "${b.nombre}": no tenés permiso o el beneficio ya no existe.`)
      await cargar()
      return
    }
    await borrarObjetos([b.logo_url, b.imagen_url])
    setLista(ls => ls.filter(x => x.id !== b.id))
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Club de beneficios</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">
            {lista.length} {lista.length === 1 ? 'local' : 'locales'} · {vigentes} visibles hoy para los socios
          </p>
        </div>
        <button
          onClick={() => setEditor({ modo: 'crear' })}
          className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors"
        >
          + NUEVO BENEFICIO
        </button>
      </div>

      {aviso && <p role="alert" className="font-lora text-rojo-texto text-sm mb-4">{aviso}</p>}

      {loading && lista.length === 0 ? (
        <p className="font-lora text-texto-2 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : listError ? (
        <div className="border border-gris-claro p-8 text-center">
          <p role="alert" className="font-lora text-rojo-texto text-sm mb-4">No se pudieron cargar los beneficios: {listError}</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="font-lora text-xs tracking-widest px-4 py-2 border border-gris-claro text-tinta hover:border-oro transition-colors"
          >
            REINTENTAR
          </button>
        </div>
      ) : lista.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-texto-2 text-sm tracking-widest mb-2">SIN BENEFICIOS TODAVÍA</p>
          <p className="font-lora text-xs text-texto-2">Cargá el primer local adherido con &quot;+ NUEVO BENEFICIO&quot;.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {lista.map(b => {
            const estado = estadoBeneficio(b, hoy)
            return (
              <div key={b.id} className="border-b border-gris-claro py-5 flex flex-wrap sm:flex-nowrap gap-4 items-start hover:bg-gris-claro/20 transition-colors px-2">
                {b.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logo_url} alt="" loading="lazy" width={64} height={64} className="w-16 h-16 object-cover shrink-0" />
                ) : (
                  <div aria-hidden className="w-16 h-16 shrink-0 bg-gris-claro flex items-center justify-center font-playfair text-2xl text-tinta/40">
                    {b.nombre.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-lora text-sm text-tinta leading-snug">{b.nombre}</p>
                    <span className={`font-lora text-[11px] tracking-widest px-1.5 py-0.5 ${ESTILO_ESTADO[estado]}`}>{ESTADO_LABEL[estado]}</span>
                    {b.destacado && (
                      <span className="font-lora text-[11px] tracking-widest text-tinta border border-oro px-1.5 py-0.5">DESTACADO</span>
                    )}
                  </div>
                  <p className="font-lora text-xs text-tinta mb-1">{b.descuento}</p>
                  <p className="font-lora text-xs text-texto-2">
                    {labelRubro(b.rubro)}{b.zona ? ` · ${b.zona}` : ''} · {textoVigencia(b)} · Orden {b.orden}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    onClick={() => setEditor({ modo: 'editar', fila: b })}
                    className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-tinta hover:border-oro transition-colors"
                  >
                    EDITAR
                  </button>
                  <button
                    onClick={() => void alternarActivo(b)}
                    disabled={cambiandoId === b.id}
                    className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-tinta hover:border-tinta/40 transition-colors disabled:opacity-50"
                  >
                    {b.activo ? 'PAUSAR' : 'ACTIVAR'}
                  </button>
                  <button
                    onClick={() => setABorrar(b)}
                    className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-rojo-texto hover:border-rojo transition-colors"
                  >
                    ELIMINAR
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editor && (
        <EditorBeneficio
          editor={editor}
          onClose={() => setEditor(null)}
          onGuardado={async advertencia => {
            setEditor(null)
            setAviso(advertencia ?? '')
            await cargar()
          }}
        />
      )}

      {aBorrar && (
        <Modal titulo="ELIMINAR BENEFICIO" onClose={() => { if (!borrando) setABorrar(null) }}>
          <p className="font-lora text-sm text-tinta mb-2">¿Eliminar &quot;{aBorrar.nombre}&quot;?</p>
          <p className="font-lora text-xs text-texto-2 mb-6">
            Los socios dejan de verlo y se borran su logo y su foto. No se puede deshacer: si sólo querés ocultarlo un tiempo, usá PAUSAR.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => void confirmarBorrado()}
              disabled={borrando}
              className="font-lora text-xs tracking-widest px-5 py-3 border border-rojo text-rojo-texto hover:bg-rojo hover:text-white transition-colors disabled:opacity-50"
            >
              {borrando ? 'ELIMINANDO…' : 'ELIMINAR'}
            </button>
            <button
              onClick={() => setABorrar(null)}
              disabled={borrando}
              className="font-lora text-xs tracking-widest px-5 py-3 border border-gris-claro text-tinta/60 hover:text-tinta transition-colors"
            >
              CANCELAR
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Create / edit form ──────────────────────────────────────────────────────

function EditorBeneficio({ editor, onClose, onGuardado }: {
  editor: Editor
  onClose: () => void
  onGuardado: (advertencia?: string) => void | Promise<void>
}) {
  const original = editor.modo === 'editar' ? editor.fila : null
  const [form, setForm]           = useState<FormBeneficio>(() => original ? formDesdeBeneficio(original) : formVacio())
  const [imagenes, setImagenes]   = useState<Record<TipoImagen, SlotImagen>>({ logo: SLOT_VACIO, foto: SLOT_VACIO })
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState('')

  // Release the preview object URLs when the modal closes.
  const previews = useRef<string[]>([])
  useEffect(() => () => { previews.current.forEach(u => URL.revokeObjectURL(u)) }, [])

  const set = <K extends keyof FormBeneficio>(campo: K, valor: FormBeneficio[K]) =>
    setForm(f => ({ ...f, [campo]: valor }))

  const elegirImagen = (tipo: TipoImagen, file: File) => {
    const errorPeso = errorTamano(file.size)
    if (errorPeso) { setFormError(errorPeso); return }
    setFormError('')
    const preview = URL.createObjectURL(file)
    previews.current.push(preview)
    setImagenes(im => ({ ...im, [tipo]: { file, preview, quitada: false } }))
  }

  const quitarImagen = (tipo: TipoImagen) =>
    setImagenes(im => ({ ...im, [tipo]: { file: null, preview: null, quitada: true } }))

  const urlVisible = (tipo: TipoImagen) => {
    const slot = imagenes[tipo]
    if (slot.preview) return slot.preview
    if (slot.quitada) return null
    return original?.[COLUMNA_IMAGEN[tipo]] ?? null
  }

  const guardar = async () => {
    const error = validarBeneficio(form)
    if (error) { setFormError(error); return }
    setGuardando(true); setFormError('')

    // Shrink and check the new images before writing anything.
    const archivos: Partial<Record<TipoImagen, File>> = {}
    for (const tipo of ['logo', 'foto'] as TipoImagen[]) {
      const file = imagenes[tipo].file
      if (!file) continue
      const subir = await prepararImagen(file)
      const errorArchivo = errorImagen(subir)
      if (errorArchivo) {
        setFormError(`${tipo === 'logo' ? 'Logo' : 'Foto'}: ${errorArchivo}`)
        setGuardando(false)
        return
      }
      archivos[tipo] = subir
    }

    const datos = datosBeneficio(form)
    if (!original) await crear(datos, archivos)
    else await editar(original, datos, archivos)
  }

  const crear = async (datos: ReturnType<typeof datosBeneficio>, archivos: Partial<Record<TipoImagen, File>>) => {
    // Insert first: the image path needs the id.
    const { data, error } = await supabase.from('beneficios').insert(datos).select('id').single()
    if (error || !data) {
      setFormError(`No se pudo guardar el beneficio: ${error?.message ?? 'sin respuesta'}`)
      setGuardando(false)
      return
    }
    const urls: Partial<Record<'logo_url' | 'imagen_url', string>> = {}
    const fallidas: string[] = []
    for (const tipo of ['logo', 'foto'] as TipoImagen[]) {
      const file = archivos[tipo]
      if (!file) continue
      const r = await subirImagen(data.id, tipo, file)
      if ('url' in r) urls[COLUMNA_IMAGEN[tipo]] = r.url
      else fallidas.push(tipo === 'logo' ? 'el logo' : 'la foto')
    }
    if (Object.keys(urls).length > 0) {
      const { data: filas, error: errUpd } = await supabase.from('beneficios').update(urls).eq('id', data.id).select('id')
      if (errUpd || !filas || filas.length === 0) {
        await borrarObjetos(Object.values(urls))
        fallidas.push(...Object.keys(urls).map(c => c === 'logo_url' ? 'el logo' : 'la foto'))
      }
    }
    setGuardando(false)
    await onGuardado(fallidas.length > 0
      ? `El beneficio se guardó, pero no se pudo subir ${fallidas.join(' ni ')}. Editalo para volver a intentarlo.`
      : undefined)
  }

  const editar = async (
    fila: BeneficioFila,
    datos: ReturnType<typeof datosBeneficio>,
    archivos: Partial<Record<TipoImagen, File>>,
  ) => {
    const cambios: Record<string, unknown> = { ...datos }
    const nuevas: string[] = []
    const viejas: (string | null)[] = []
    for (const tipo of ['logo', 'foto'] as TipoImagen[]) {
      const columna = COLUMNA_IMAGEN[tipo]
      const file = archivos[tipo]
      if (file) {
        const r = await subirImagen(fila.id, tipo, file)
        if ('error' in r) {
          await borrarObjetos(nuevas)
          setFormError(`No se pudo subir ${tipo === 'logo' ? 'el logo' : 'la foto'}: ${r.error}. No se guardó ningún cambio.`)
          setGuardando(false)
          return
        }
        nuevas.push(r.url)
        cambios[columna] = r.url
        viejas.push(fila[columna])
      } else if (imagenes[tipo].quitada) {
        cambios[columna] = null
        viejas.push(fila[columna])
      }
    }

    const { data, error } = await supabase.from('beneficios').update(cambios).eq('id', fila.id).select('id')
    if (error || !data || data.length === 0) {
      await borrarObjetos(nuevas)
      setFormError(error
        ? `No se pudo guardar: ${error.message}`
        : 'No se guardó: no tenés permiso o el beneficio ya no existe.')
      setGuardando(false)
      return
    }
    await borrarObjetos(viejas)
    setGuardando(false)
    await onGuardado()
  }

  const cerrar = () => { if (!guardando) onClose() }

  return (
    <Modal titulo={original ? 'EDITAR BENEFICIO' : 'NUEVO BENEFICIO'} onClose={cerrar} ancho="max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Campo id="b-nombre" label="NOMBRE DEL LOCAL *" valor={form.nombre} onChange={v => set('nombre', v)} placeholder="Ej: Café del Centro" />
        <div>
          <label htmlFor="b-rubro" className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">RUBRO *</label>
          <select
            id="b-rubro"
            value={form.rubro}
            onChange={e => set('rubro', e.target.value)}
            className="w-full font-lora text-sm text-tinta bg-papel border border-borde-control px-2 py-2 focus:border-oro"
          >
            <option value="">Elegí un rubro</option>
            {RUBROS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Campo id="b-descuento" label="DESCUENTO *" valor={form.descuento} onChange={v => set('descuento', v)} placeholder="Ej: 15% en efectivo" />
        </div>
        <div className="sm:col-span-2">
          <AreaTexto id="b-descripcion" label="DESCRIPCIÓN" valor={form.descripcion} onChange={v => set('descripcion', v)} placeholder="Qué ofrece el local" />
        </div>
        <div className="sm:col-span-2">
          <AreaTexto id="b-condiciones" label="CONDICIONES" valor={form.condiciones} onChange={v => set('condiciones', v)} placeholder="Ej: No acumulable con otras promos" />
        </div>
        <Campo id="b-direccion" label="DIRECCIÓN" valor={form.direccion} onChange={v => set('direccion', v)} placeholder="Calle y número, ciudad" />
        <Campo id="b-zona" label="ZONA" valor={form.zona} onChange={v => set('zona', v)} placeholder="Ej: Centro" />
        <Campo id="b-whatsapp" label="WHATSAPP" valor={form.telefono_whatsapp} onChange={v => set('telefono_whatsapp', v)} placeholder="Ej: 249 154 123456" tipo="tel" />
        <Campo id="b-instagram" label="INSTAGRAM" valor={form.instagram} onChange={v => set('instagram', v)} placeholder="@local o link del perfil" />
        <div className="sm:col-span-2">
          <Campo id="b-web" label="SITIO WEB" valor={form.sitio_web} onChange={v => set('sitio_web', v)} placeholder="www.local.com.ar" />
        </div>
        <Campo id="b-desde" label="VIGENTE DESDE" valor={form.vigente_desde} onChange={v => set('vigente_desde', v)} tipo="date" />
        <Campo id="b-hasta" label="VIGENTE HASTA" valor={form.vigente_hasta} onChange={v => set('vigente_hasta', v)} tipo="date" />
        <Campo id="b-orden" label="ORDEN" valor={form.orden} onChange={v => set('orden', v)} tipo="number" ayuda="Menor número, más arriba en la lista." />
        <div className="flex flex-col gap-3 justify-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.destacado} onChange={e => set('destacado', e.target.checked)} className="accent-oro" />
            <span className="font-lora text-sm text-tinta">Destacado (aparece primero)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} className="accent-oro" />
            <span className="font-lora text-sm text-tinta">Activo (lo ven los socios)</span>
          </label>
        </div>
        <CampoImagen
          titulo="LOGO"
          url={urlVisible('logo')}
          cuadrada
          onElegir={f => elegirImagen('logo', f)}
          onQuitar={() => quitarImagen('logo')}
        />
        <CampoImagen
          titulo="FOTO"
          url={urlVisible('foto')}
          onElegir={f => elegirImagen('foto', f)}
          onQuitar={() => quitarImagen('foto')}
        />
      </div>

      {formError && <p role="alert" className="font-lora text-rojo-texto text-sm mt-4">{formError}</p>}

      <p className="font-lora text-xs text-texto-2 italic mt-4">
        Los socios ven el beneficio en la app mientras esté activo y dentro de su vigencia.
      </p>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => void guardar()}
          disabled={guardando}
          className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
        >
          {guardando ? 'GUARDANDO…' : original ? 'GUARDAR CAMBIOS' : 'CREAR BENEFICIO'}
        </button>
        <button
          onClick={cerrar}
          disabled={guardando}
          className="font-lora text-xs tracking-widest px-5 py-3 border border-gris-claro text-tinta/60 hover:text-tinta transition-colors"
        >
          CANCELAR
        </button>
      </div>
    </Modal>
  )
}

function Campo({ id, label, valor, onChange, placeholder, tipo = 'text', ayuda }: {
  id: string; label: string; valor: string; onChange: (v: string) => void
  placeholder?: string; tipo?: string; ayuda?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">{label}</label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        step={tipo === 'number' ? 1 : undefined}
        className="w-full font-lora text-sm text-tinta bg-transparent border-b border-borde-control py-2 outline-none focus:border-oro transition-colors"
      />
      {ayuda && <p className="font-lora text-[11px] text-texto-2 mt-1">{ayuda}</p>}
    </div>
  )
}

function AreaTexto({ id, label, valor, onChange, placeholder }: {
  id: string; label: string; valor: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">{label}</label>
      <textarea
        id={id}
        value={valor}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full font-lora text-sm text-tinta bg-transparent border border-borde-control p-3 outline-none focus:border-oro transition-colors resize-none"
      />
    </div>
  )
}

function CampoImagen({ titulo, url, cuadrada = false, onElegir, onQuitar }: {
  titulo: string; url: string | null; cuadrada?: boolean
  onElegir: (f: File) => void; onQuitar: () => void
}) {
  const input = (texto: string) => (
    // sr-only instead of hidden: the input stays reachable with Tab and the
    // focus ring shows on the label acting as the button.
    <label className="font-lora text-xs tracking-widest text-oro cursor-pointer hover:underline focus-within:outline-2 focus-within:outline-oro focus-within:outline-offset-2">
      {texto}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onElegir(f) }}
        className="sr-only"
      />
    </label>
  )
  return (
    <div>
      <p className="font-lora text-xs tracking-widest text-tinta/50 mb-2">{titulo} (OPCIONAL)</p>
      {url ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className={`w-full object-cover ${cuadrada ? 'aspect-square max-w-40' : 'aspect-[4/3]'}`} />
          <div className="flex gap-4 mt-2">
            {input('REEMPLAZAR')}
            <button type="button" onClick={onQuitar} className="font-lora text-xs tracking-widest text-rojo-texto hover:underline">
              QUITAR
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center border border-dashed border-gris-claro py-6">
          {input(`+ AGREGAR ${titulo}`)}
        </div>
      )}
    </div>
  )
}
