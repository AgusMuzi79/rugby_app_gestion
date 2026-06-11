'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CategoriaSocio {
  id: string
  nombre: string
  monto_mensual: number
  activa: boolean
}

interface ServicioOpcional {
  id: string
  nombre: string
  monto_mensual: number
  activo: boolean
}

interface SocioItem {
  id: string
  numero_socio: string
  dni: string
  estado: string
  foto_path: string | null
  foto_validada: boolean
  created_at: string
  nombre: string
  categoria: string
  categoria_id: string
  mp_card_last_four: string | null
  mp_card_brand: string | null
}

type FiltroEstado = 'todos' | 'activo' | 'moroso' | 'pendiente' | 'inactivo'

const FILTROS: FiltroEstado[] = ['todos', 'activo', 'moroso', 'pendiente', 'inactivo']
const ESTADO_LABEL: Record<string, string> = {
  activo: 'Activo', moroso: 'Moroso', pendiente: 'Pendiente', inactivo: 'Inactivo',
}
const ESTADO_COLOR: Record<string, string> = {
  activo: 'text-[#2ECC71] border-[#2ECC71]',
  moroso: 'text-oro border-oro',
  pendiente: 'text-[#E67E22] border-[#E67E22]',
  inactivo: 'text-tinta/30 border-gris-claro',
}

function periodoActual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function callEdgeFunction(name: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify(body),
    }
  )
  return res.json()
}

// ─── Detalle socio ────────────────────────────────────────────────────────────

function DetalleSocio({
  socio,
  categorias,
  servicios,
  serviciosSocio,
  onClose,
  onRefresh,
}: {
  socio: SocioItem
  categorias: CategoriaSocio[]
  servicios: ServicioOpcional[]
  serviciosSocio: string[]
  onClose: () => void
  onRefresh: () => void
}) {
  const [modalPago,     setModalPago]     = useState(false)
  const [modalTarjeta,  setModalTarjeta]  = useState(false)
  const [modalCobrar,   setModalCobrar]   = useState(false)
  const [actualizando,  setActualizando]  = useState(false)
  const [msg,           setMsg]           = useState('')

  const categoria = categorias.find(c => c.id === socio.categoria_id)

  const setStatus = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500) }

  const handleDesactivar = async () => {
    if (!confirm('¿Desactivar este socio? Se bloqueará su acceso.')) return
    setActualizando(true)
    const json = await callEdgeFunction('admin-socios', { action: 'deactivate', socioId: socio.id })
    setActualizando(false)
    if (json.error) { setStatus(`Error: ${json.error}`); return }
    setStatus('Socio desactivado.')
    onRefresh()
  }

  const handleReactivar = async () => {
    setActualizando(true)
    const json = await callEdgeFunction('admin-socios', { action: 'reactivate', socioId: socio.id })
    setActualizando(false)
    if (json.error) { setStatus(`Error: ${json.error}`); return }
    setStatus('Socio reactivado.')
    onRefresh()
  }

  const handleValidarFoto = async () => {
    setActualizando(true)
    const json = await callEdgeFunction('admin-socios', { action: 'validate-photo', socioId: socio.id })
    setActualizando(false)
    if (json.error) { setStatus(`Error: ${json.error}`); return }
    setStatus(json.validada ? 'Foto validada ✓' : (json.mensaje ?? 'No se pudo validar la foto.'))
    onRefresh()
  }

  const handleToggleServicio = async (servicioId: string, agregar: boolean) => {
    if (agregar) {
      await supabase.from('socio_servicios').insert({ socio_id: socio.id, servicio_id: servicioId })
    } else {
      await supabase.from('socio_servicios').delete()
        .eq('socio_id', socio.id).eq('servicio_id', servicioId)
    }
    onRefresh()
  }

  const handleQuitarTarjeta = async () => {
    if (!confirm('¿Quitar la tarjeta guardada de este socio?')) return
    setActualizando(true)
    const json = await callEdgeFunction('socios-pagos', { action: 'remove-card', socioId: socio.id })
    setActualizando(false)
    if (json.error) { setStatus(`Error: ${json.error}`); return }
    setStatus('Tarjeta quitada.')
    onRefresh()
  }

  const montoServicios = servicios
    .filter(s => serviciosSocio.includes(s.id))
    .reduce((sum, s) => sum + s.monto_mensual, 0)
  const montoTotal = (categoria?.monto_mensual ?? 0) + montoServicios

  return (
    <div>
      <button
        onClick={onClose}
        className="font-lora text-xs tracking-widest text-tinta/50 hover:text-tinta mb-6 flex items-center gap-2 transition-colors"
      >
        ← VOLVER A SOCIOS
      </button>

      {msg && (
        <div className="mb-4 p-3 border border-gris-claro bg-card font-lora text-sm text-tinta">{msg}</div>
      )}

      <div className="grid grid-cols-3 gap-8">
        {/* Info principal */}
        <div className="col-span-2 flex flex-col gap-6">
          <div>
            <h2 className="font-playfair italic text-3xl text-tinta mb-1">{socio.nombre}</h2>
            <p className="font-lora text-xs tracking-widest text-oro-hondo">Nº {socio.numero_socio}</p>
          </div>

          <table className="w-full border-collapse">
            <tbody>
              {[
                { label: 'DNI',       value: socio.dni },
                { label: 'CATEGORÍA', value: categoria?.nombre ?? socio.categoria },
                { label: 'ESTADO',    value: ESTADO_LABEL[socio.estado] ?? socio.estado },
                { label: 'FOTO',      value: socio.foto_validada ? 'Validada ✓' : 'Pendiente de validación' },
              ].map(row => (
                <tr key={row.label} className="border-b border-gris-claro">
                  <td className="font-lora text-xs tracking-widest text-tinta/50 py-3 pr-6 w-32">{row.label}</td>
                  <td className="font-lora text-sm text-tinta py-3">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Servicios opcionales */}
          <div>
            <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">SERVICIOS OPCIONALES</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {servicios.map(srv => {
                const activo = serviciosSocio.includes(srv.id)
                return (
                  <button
                    key={srv.id}
                    onClick={() => handleToggleServicio(srv.id, !activo)}
                    className={`font-lora text-xs tracking-widest px-4 py-2 border transition-colors ${
                      activo
                        ? 'bg-oro border-oro text-papel'
                        : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
                    }`}
                  >
                    {srv.nombre} · ${srv.monto_mensual.toLocaleString('es-AR')}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between items-baseline border-t border-gris-claro pt-3">
              <span className="font-lora text-xs tracking-widest text-tinta/50">TOTAL MENSUAL</span>
              <span className="font-playfair italic text-2xl text-tinta">
                ${montoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Débito automático */}
          <div>
            <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">DÉBITO AUTOMÁTICO</p>
            {socio.mp_card_last_four ? (
              <div className="border border-gris-claro p-4 flex items-center gap-4 bg-card">
                <span className="font-lora text-sm text-tinta/50">●●●● ●●●● ●●●● {socio.mp_card_last_four}</span>
                {socio.mp_card_brand && (
                  <span className="font-lora text-xs tracking-widest text-oro/70">{socio.mp_card_brand.toUpperCase()}</span>
                )}
              </div>
            ) : (
              <p className="font-lora text-sm text-tinta/40 italic">Sin tarjeta asociada</p>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col gap-3">
          <p className="font-lora text-xs tracking-widest text-tinta/50 mb-1">ACCIONES</p>

          {socio.estado !== 'inactivo' && (
            <button
              onClick={() => setModalPago(true)}
              className="font-lora text-xs tracking-widest py-3 border border-gris-claro text-tinta hover:border-tinta transition-colors"
            >
              REGISTRAR PAGO
            </button>
          )}

          {!socio.foto_validada && socio.foto_path && (
            <button
              onClick={handleValidarFoto}
              disabled={actualizando}
              className="font-lora text-xs tracking-widest py-3 border border-oro text-oro hover:bg-oro/10 transition-colors disabled:opacity-50"
            >
              VALIDAR FOTO
            </button>
          )}

          {socio.estado !== 'inactivo' && (
            socio.mp_card_last_four ? (
              <>
                <button
                  onClick={() => setModalCobrar(true)}
                  className="font-lora text-xs tracking-widest py-3 border border-gris-claro text-tinta hover:border-tinta transition-colors"
                >
                  COBRAR CON TARJETA
                </button>
                <button
                  onClick={handleQuitarTarjeta}
                  disabled={actualizando}
                  className="font-lora text-xs tracking-widest py-3 border border-rojo text-rojo hover:bg-rojo/5 transition-colors disabled:opacity-50"
                >
                  QUITAR TARJETA
                </button>
              </>
            ) : (
              <button
                onClick={() => setModalTarjeta(true)}
                className="font-lora text-xs tracking-widest py-3 border border-gris-claro text-tinta hover:border-tinta transition-colors"
              >
                ASOCIAR TARJETA
              </button>
            )
          )}

          {socio.estado !== 'inactivo' ? (
            <button
              onClick={handleDesactivar}
              disabled={actualizando}
              className="font-lora text-xs tracking-widest py-3 border border-rojo text-rojo hover:bg-rojo/5 transition-colors disabled:opacity-50"
            >
              DESACTIVAR SOCIO
            </button>
          ) : (
            <button
              onClick={handleReactivar}
              disabled={actualizando}
              className="font-lora text-xs tracking-widest py-3 border border-[#2ECC71] text-[#2ECC71] hover:bg-[#2ECC71]/5 transition-colors disabled:opacity-50"
            >
              REACTIVAR SOCIO
            </button>
          )}
        </div>
      </div>

      {/* Modal pago manual */}
      {modalPago && (
        <ModalPagoManual
          socioId={socio.id}
          socioNombre={socio.nombre}
          montoDefault={montoTotal}
          onClose={() => setModalPago(false)}
          onSuccess={(msg) => { setStatus(msg); setModalPago(false); onRefresh() }}
        />
      )}

      {/* Modal asociar tarjeta */}
      {modalTarjeta && (
        <ModalAsociarTarjeta
          socioId={socio.id}
          socioNombre={socio.nombre}
          onClose={() => setModalTarjeta(false)}
          onSuccess={(msg) => { setStatus(msg); setModalTarjeta(false); onRefresh() }}
        />
      )}

      {/* Modal cobrar tarjeta */}
      {modalCobrar && (
        <ModalCobrarTarjeta
          socioId={socio.id}
          socioNombre={socio.nombre}
          onClose={() => setModalCobrar(false)}
          onSuccess={(msg) => { setStatus(msg); setModalCobrar(false); onRefresh() }}
        />
      )}
    </div>
  )
}

// ─── Modal pago manual ────────────────────────────────────────────────────────

function ModalPagoManual({
  socioId, socioNombre, montoDefault, onClose, onSuccess,
}: {
  socioId: string
  socioNombre: string
  montoDefault: number
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [periodo,   setPeriodo]   = useState(periodoActual)
  const [monto,     setMonto]     = useState(String(montoDefault))
  const [formaPago, setFormaPago] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [enviando,  setEnviando]  = useState(false)
  const [error,     setError]     = useState('')

  const handleConfirm = async () => {
    if (!/^\d{4}-\d{2}$/.test(periodo.trim())) { setError('Período inválido. Usá YYYY-MM.'); return }
    const montoNum = parseFloat(monto.replace(',', '.'))
    if (isNaN(montoNum) || montoNum <= 0) { setError('Monto inválido.'); return }
    setEnviando(true); setError('')
    const json = await callEdgeFunction('socios-pagos', {
      action: 'manual', socioId, periodo: periodo.trim(), monto: montoNum, formaPago,
    })
    setEnviando(false)
    if (json.error) { setError(json.error); return }
    onSuccess(`Pago ${periodo.trim()} registrado ✓`)
  }

  return (
    <Modal titulo="REGISTRAR PAGO" onClose={onClose}>
      <p className="font-lora text-sm text-tinta/50 italic mb-5">{socioNombre}</p>
      <FormField label="PERÍODO" value={periodo} onChange={setPeriodo} placeholder="2026-06" />
      <FormField label="MONTO ($)" value={monto} onChange={setMonto} placeholder="5000" type="number" />
      <div className="mt-4">
        <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">FORMA DE PAGO</label>
        <div className="flex gap-2">
          {(['efectivo', 'transferencia'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFormaPago(f)}
              className={`font-lora text-xs tracking-widest px-4 py-2 border flex-1 transition-colors ${
                formaPago === f ? 'bg-oro border-oro text-papel' : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
              }`}
            >
              {f === 'efectivo' ? 'EFECTIVO' : 'TRANSFERENCIA'}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="font-lora text-rojo text-sm mt-3">{error}</p>}
      <ModalActions onConfirm={handleConfirm} onCancel={onClose} loading={enviando} label="CONFIRMAR PAGO" />
    </Modal>
  )
}

// ─── Modal asociar tarjeta ────────────────────────────────────────────────────

function ModalAsociarTarjeta({
  socioId, socioNombre, onClose, onSuccess,
}: {
  socioId: string
  socioNombre: string
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [cardNumber,     setCardNumber]     = useState('')
  const [expMonth,       setExpMonth]       = useState('')
  const [expYear,        setExpYear]        = useState('')
  const [cvv,            setCvv]            = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [enviando,       setEnviando]       = useState(false)
  const [error,          setError]          = useState('')

  const formatCard = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 16)
    return d.replace(/(\d{4})(?=\d)/g, '$1 ')
  }

  const handleConfirm = async () => {
    const digits = cardNumber.replace(/\s/g, '')
    if (digits.length < 13) { setError('Número de tarjeta inválido.'); return }
    const month = parseInt(expMonth)
    if (!month || month < 1 || month > 12) { setError('Mes inválido (1-12).'); return }
    const yearRaw = parseInt(expYear)
    const fullYear = yearRaw < 100 ? 2000 + yearRaw : yearRaw
    if (!fullYear || fullYear < new Date().getFullYear()) { setError('Año inválido.'); return }
    if (!cvv) { setError('CVV requerido.'); return }
    if (!cardholderName.trim()) { setError('Nombre del titular requerido.'); return }
    setEnviando(true); setError('')
    const json = await callEdgeFunction('socios-pagos', {
      action: 'associate-card',
      socioId,
      cardData: {
        card_number: digits, expiration_month: month, expiration_year: fullYear,
        security_code: cvv, cardholder_name: cardholderName.trim(),
      },
    })
    setEnviando(false)
    if (json.error) { setError(json.error); return }
    onSuccess('Tarjeta asociada ✓')
  }

  return (
    <Modal titulo="ASOCIAR TARJETA" onClose={onClose}>
      <p className="font-lora text-sm text-tinta/50 italic mb-5">{socioNombre}</p>
      <div className="flex flex-col gap-4">
        <FormField
          label="NÚMERO DE TARJETA"
          value={cardNumber}
          onChange={v => setCardNumber(formatCard(v))}
          placeholder="1234 5678 9012 3456"
        />
        <div className="grid grid-cols-3 gap-3">
          <FormField label="MES (MM)" value={expMonth} onChange={v => setExpMonth(v.replace(/\D/g, '').slice(0, 2))} placeholder="06" />
          <FormField label="AÑO (AAAA)" value={expYear} onChange={v => setExpYear(v.replace(/\D/g, '').slice(0, 4))} placeholder="2028" />
          <FormField label="CVV" value={cvv} onChange={v => setCvv(v.replace(/\D/g, '').slice(0, 4))} placeholder="123" type="password" />
        </div>
        <FormField
          label="NOMBRE EN LA TARJETA"
          value={cardholderName}
          onChange={setCardholderName}
          placeholder="JUAN PÉREZ"
        />
      </div>
      {error && <p className="font-lora text-rojo text-sm mt-3">{error}</p>}
      <ModalActions onConfirm={handleConfirm} onCancel={onClose} loading={enviando} label="GUARDAR TARJETA" />
    </Modal>
  )
}

// ─── Modal cobrar tarjeta ─────────────────────────────────────────────────────

function ModalCobrarTarjeta({
  socioId, socioNombre, onClose, onSuccess,
}: {
  socioId: string
  socioNombre: string
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [periodo,  setPeriodo]  = useState(periodoActual)
  const [enviando, setEnviando] = useState(false)
  const [error,    setError]    = useState('')

  const handleConfirm = async () => {
    if (!/^\d{4}-\d{2}$/.test(periodo.trim())) { setError('Período inválido. Usá YYYY-MM.'); return }
    setEnviando(true); setError('')
    const json = await callEdgeFunction('socios-pagos', {
      action: 'charge-card', socioId, periodo: periodo.trim(),
    })
    setEnviando(false)
    if (json.error) { setError(json.error); return }
    onSuccess(`Cobro ${periodo.trim()} procesado ✓`)
  }

  return (
    <Modal titulo="COBRAR CON TARJETA" onClose={onClose}>
      <p className="font-lora text-sm text-tinta/50 italic mb-5">{socioNombre}</p>
      <FormField label="PERÍODO" value={periodo} onChange={setPeriodo} placeholder="2026-06" />
      {error && <p className="font-lora text-rojo text-sm mt-3">{error}</p>}
      <ModalActions onConfirm={handleConfirm} onCancel={onClose} loading={enviando} label="CONFIRMAR COBRO" />
    </Modal>
  )
}

// ─── Modal nuevo socio ────────────────────────────────────────────────────────

function ModalNuevoSocio({
  categorias,
  onClose,
  onSuccess,
}: {
  categorias: CategoriaSocio[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [nombre,   setNombre]   = useState('')
  const [email,    setEmail]    = useState('')
  const [dni,      setDni]      = useState('')
  const [catId,    setCatId]    = useState('')
  const [creando,  setCreando]  = useState(false)
  const [error,    setError]    = useState('')

  const handleCrear = async () => {
    if (!nombre.trim()) { setError('Nombre obligatorio.'); return }
    if (!email.trim())  { setError('Email obligatorio.'); return }
    if (!dni.trim())    { setError('DNI obligatorio.'); return }
    if (!catId)         { setError('Seleccioná una categoría.'); return }
    setCreando(true); setError('')
    const json = await callEdgeFunction('admin-socios', {
      action: 'create', email: email.trim().toLowerCase(), nombre: nombre.trim(), dni: dni.trim(), categoria_id: catId,
    })
    setCreando(false)
    if (json.error) { setError(json.error); return }
    onSuccess()
  }

  const categoriasActivas = categorias.filter(c => c.activa)

  return (
    <Modal titulo="NUEVO SOCIO" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <FormField label="NOMBRE COMPLETO" value={nombre} onChange={setNombre} placeholder="Juan Pérez" />
        <FormField label="EMAIL" value={email} onChange={setEmail} placeholder="juan@ejemplo.com" type="email" />
        <FormField label="DNI" value={dni} onChange={setDni} placeholder="12345678" />
        <div>
          <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">CATEGORÍA</label>
          <div className="flex flex-wrap gap-2">
            {categoriasActivas.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatId(c.id)}
                className={`font-lora text-xs tracking-widest px-4 py-2 border transition-colors ${
                  catId === c.id
                    ? 'bg-oro border-oro text-papel'
                    : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
                }`}
              >
                {c.nombre} · ${c.monto_mensual.toLocaleString('es-AR')}/mes
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="font-lora text-rojo text-sm mt-3">{error}</p>}
      <ModalActions onConfirm={handleCrear} onCancel={onClose} loading={creando} label="CREAR Y ENVIAR INVITACIÓN" />
    </Modal>
  )
}

// ─── Componentes compartidos ──────────────────────────────────────────────────

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-dark/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <p className="font-lora text-xs tracking-widest text-tinta/60">{titulo}</p>
          <button onClick={onClose} className="text-tinta/40 hover:text-tinta text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
      />
    </div>
  )
}

function ModalActions({
  onConfirm, onCancel, loading, label,
}: {
  onConfirm: () => void; onCancel: () => void; loading: boolean; label: string
}) {
  return (
    <div className="flex gap-3 mt-6">
      <button
        onClick={onConfirm}
        disabled={loading}
        className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50 flex-1"
      >
        {loading ? 'PROCESANDO…' : label}
      </button>
      <button
        onClick={onCancel}
        className="font-lora text-xs tracking-widest px-5 py-3 border border-gris-claro text-tinta/60 hover:text-tinta transition-colors"
      >
        CANCELAR
      </button>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function SociosPage() {
  const [socios,       setSocios]       = useState<SocioItem[]>([])
  const [categorias,   setCategorias]   = useState<CategoriaSocio[]>([])
  const [servicios,    setServicios]    = useState<ServicioOpcional[]>([])
  const [serviciosSocio, setServiciosSocio] = useState<string[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filtro,       setFiltro]       = useState<FiltroEstado>('todos')
  const [busqueda,     setBusqueda]     = useState('')
  const [detalle,      setDetalle]      = useState<SocioItem | null>(null)
  const [modalNuevo,   setModalNuevo]   = useState(false)

  const fetchAll = useCallback(async () => {
    const [{ data: sociosData }, { data: catsData }, { data: srvsData }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('socios')
        .select('id, numero_socio, dni, estado, foto_path, foto_validada, created_at, mp_card_last_four, mp_card_brand, categoria_id, profiles!socios_profile_id_fkey(nombre), categorias_socio!socios_categoria_id_fkey(nombre)')
        .order('numero_socio'),
      supabase.from('categorias_socio').select('id, nombre, monto_mensual, activa').order('nombre'),
      supabase.from('servicios_opcionales').select('id, nombre, monto_mensual, activo').order('nombre'),
    ])

    const normalized: SocioItem[] = (sociosData ?? []).map((s: Record<string, unknown>) => ({
      id:               s.id as string,
      numero_socio:     s.numero_socio as string,
      dni:              s.dni as string,
      estado:           s.estado as string,
      foto_path:        s.foto_path as string | null,
      foto_validada:    s.foto_validada as boolean,
      created_at:       s.created_at as string,
      mp_card_last_four: s.mp_card_last_four as string | null,
      mp_card_brand:    s.mp_card_brand as string | null,
      categoria_id:     s.categoria_id as string,
      nombre:           (s.profiles as { nombre: string } | null)?.nombre ?? '—',
      categoria:        (s.categorias_socio as { nombre: string } | null)?.nombre ?? '—',
    }))

    setSocios(normalized)
    setCategorias(catsData ?? [])
    setServicios(srvsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const fetchServiciosSocio = useCallback(async (socioId: string) => {
    const { data } = await supabase
      .from('socio_servicios')
      .select('servicio_id')
      .eq('socio_id', socioId)
    setServiciosSocio((data ?? []).map((r: { servicio_id: string }) => r.servicio_id))
  }, [])

  const handleAbrirDetalle = (socio: SocioItem) => {
    setDetalle(socio)
    void fetchServiciosSocio(socio.id)
  }

  const handleRefreshDetalle = useCallback(async () => {
    await fetchAll()
    if (detalle) void fetchServiciosSocio(detalle.id)
  }, [fetchAll, detalle, fetchServiciosSocio])

  const sociosFiltrados = socios
    .filter(s => filtro === 'todos' || s.estado === filtro)
    .filter(s => {
      if (!busqueda.trim()) return true
      const q = busqueda.toLowerCase()
      return s.nombre.toLowerCase().includes(q) || s.dni.includes(q) || s.numero_socio.includes(q)
    })

  // ── Vista detalle ──────────────────────────────────────────────────────────
  if (detalle) {
    const actualizado = socios.find(x => x.id === detalle.id) ?? detalle
    return (
      <DetalleSocio
        socio={actualizado}
        categorias={categorias}
        servicios={servicios}
        serviciosSocio={serviciosSocio}
        onClose={() => setDetalle(null)}
        onRefresh={handleRefreshDetalle}
      />
    )
  }

  // ── Vista lista ────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Socios</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">
            {socios.length} socios registrados
          </p>
        </div>
        <button
          onClick={() => setModalNuevo(true)}
          className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors"
        >
          + NUEVO SOCIO
        </button>
      </div>

      {/* Barra de búsqueda + filtros */}
      <div className="flex gap-4 mb-6 items-center">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, DNI o Nº socio…"
          className="flex-1 font-lora text-sm text-tinta bg-card border border-gris-claro px-4 py-2 outline-none focus:border-oro transition-colors"
        />
        <div className="flex gap-1">
          {FILTROS.map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`font-lora text-xs tracking-widest px-3 py-2 border transition-colors ${
                filtro === f
                  ? 'bg-oro border-oro text-papel'
                  : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
              }`}
            >
              {f === 'todos' ? 'TODOS' : (ESTADO_LABEL[f] ?? f).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : sociosFiltrados.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">
            {busqueda ? 'SIN RESULTADOS' : 'NO HAY SOCIOS EN ESTA VISTA'}
          </p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gris-claro">
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-4 w-16">Nº</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-4">NOMBRE</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-4">CATEGORÍA</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-4">DNI</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-center py-3 pr-4">ESTADO</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-center py-3">TARJETA</th>
            </tr>
          </thead>
          <tbody>
            {sociosFiltrados.map(s => (
              <tr
                key={s.id}
                onClick={() => handleAbrirDetalle(s)}
                className="border-b border-gris-claro hover:bg-gris-claro/30 transition-colors cursor-pointer"
              >
                <td className="font-playfair text-sm text-oro-hondo py-4 pr-4">{s.numero_socio}</td>
                <td className="font-lora text-sm text-tinta py-4 pr-4">{s.nombre}</td>
                <td className="font-lora text-sm text-tinta/60 py-4 pr-4">{s.categoria}</td>
                <td className="font-lora text-sm text-tinta/60 py-4 pr-4">{s.dni}</td>
                <td className="text-center py-4 pr-4">
                  <span className={`font-lora text-xs tracking-widest px-2 py-0.5 border ${ESTADO_COLOR[s.estado] ?? 'border-gris-claro text-tinta/40'}`}>
                    {(ESTADO_LABEL[s.estado] ?? s.estado).toUpperCase()}
                  </span>
                </td>
                <td className="text-center py-4">
                  <span className="font-lora text-xs text-tinta/40">
                    {s.mp_card_last_four ? `●●●● ${s.mp_card_last_four}` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalNuevo && (
        <ModalNuevoSocio
          categorias={categorias}
          onClose={() => setModalNuevo(false)}
          onSuccess={() => { setModalNuevo(false); void fetchAll() }}
        />
      )}
    </div>
  )
}
