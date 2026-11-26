// Small presentational pieces shared by the public tennis pages.
// Same look as the other public pages (eliminar-cuenta, login): dark paper,
// Barlow fonts, gold accent, AA tokens texto-2 / borde-control / rojo-texto.

export function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-gris-claro p-5 sm:p-6 mb-5">
      <h2 className="font-playfair italic text-xl text-tinta mb-4">{titulo}</h2>
      {children}
    </section>
  )
}

// One step of the booking form: a heading and its controls, separated by a
// hairline instead of a card. The heading takes focus when the sticky bar
// sends the visitor back to a missing step.
export function Paso({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-titulo`} className="border-t border-gris-claro pt-6 mt-8 first:border-t-0 first:pt-0 first:mt-0 scroll-mt-6">
      <h2 id={`${id}-titulo`} tabIndex={-1} className="font-playfair italic text-xl text-tinta mb-4 outline-none">{titulo}</h2>
      {children}
    </section>
  )
}

// Small group title inside a step (fieldset legend or band title).
export const ETIQUETA_GRUPO = 'font-lora text-sm font-medium text-tinta/85 mb-2'

export function Campo(p: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string
  ayuda?: string
  type?: string
  inputMode?: 'numeric' | 'email' | 'text'
  autoComplete?: string
}) {
  const errId = `${p.id}-error`
  const ayudaId = `${p.id}-ayuda`
  const describe = [p.ayuda ? ayudaId : null, p.error ? errId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={p.id} className="font-lora text-sm font-medium text-tinta">{p.label}</label>
      <input
        id={p.id}
        type={p.type ?? 'text'}
        inputMode={p.inputMode}
        autoComplete={p.autoComplete}
        value={p.value}
        onChange={e => p.onChange(e.target.value)}
        onBlur={p.onBlur}
        aria-invalid={p.error ? true : undefined}
        aria-describedby={describe}
        className={`font-lora text-base text-tinta bg-card border px-3 py-2.5 min-h-11 caret-oro outline-none transition-colors placeholder:text-texto-2 focus:border-oro ${
          p.error ? 'border-rojo-texto' : 'border-borde-control hover:border-tinta/60'
        }`}
      />
      {p.ayuda && <p id={ayudaId} className="font-lora text-sm text-texto-2">{p.ayuda}</p>}
      {p.error && <p id={errId} className="font-lora text-sm text-rojo-texto">{p.error}</p>}
    </div>
  )
}

// Multi-line optional field with a live character count (same look as Campo).
export function CampoTexto(p: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  max: number
  ayuda?: string
  error?: string
}) {
  const errId = `${p.id}-error`
  const ayudaId = `${p.id}-ayuda`
  const cuentaId = `${p.id}-cuenta`
  const describe = [p.ayuda ? ayudaId : null, cuentaId, p.error ? errId : null].filter(Boolean).join(' ')
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={p.id} className="font-lora text-sm font-medium text-tinta">{p.label}</label>
      <textarea
        id={p.id}
        rows={3}
        maxLength={p.max}
        value={p.value}
        onChange={e => p.onChange(e.target.value)}
        aria-invalid={p.error ? true : undefined}
        aria-describedby={describe}
        className={`font-lora text-base text-tinta bg-card border px-3 py-2.5 min-h-24 caret-oro outline-none transition-colors resize-y placeholder:text-texto-2 focus:border-oro ${
          p.error ? 'border-rojo-texto' : 'border-borde-control hover:border-tinta/60'
        }`}
      />
      <div className="flex justify-between gap-4 font-lora text-sm text-texto-2">
        {p.ayuda ? <p id={ayudaId}>{p.ayuda}</p> : <span />}
        <p id={cuentaId} className="shrink-0 tabular-nums">{p.value.length}/{p.max}</p>
      </div>
      {p.error && <p id={errId} className="font-lora text-sm text-rojo-texto">{p.error}</p>}
    </div>
  )
}

export function Opcion(p: { activo: boolean; onClick: () => void; children: React.ReactNode; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={p.onClick}
      aria-pressed={p.activo}
      aria-label={p.label}
      className={`font-lora text-sm px-3 py-2 min-h-11 border transition-colors disabled:opacity-60 ${
        p.activo ? 'bg-oro text-papel border-oro font-semibold' : 'bg-card text-tinta border-borde-control hover:border-oro'
      } ${p.className ?? ''}`}
    >
      {p.children}
    </button>
  )
}

export function BotonPrincipal(p: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button
      type={p.type ?? 'button'}
      onClick={p.onClick}
      disabled={p.disabled}
      className="w-full bg-oro text-papel font-lora text-sm font-semibold tracking-widest py-4 min-h-11 hover:bg-oro/90 transition-colors disabled:opacity-50"
    >
      {p.children}
    </button>
  )
}

export function Aviso({ tono, children }: { tono: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <div
      role={tono === 'error' ? 'alert' : 'status'}
      className={`font-lora text-sm leading-relaxed border p-4 mb-5 ${
        tono === 'error' ? 'border-rojo-texto text-rojo-texto' : 'border-oro-hondo text-tinta'
      }`}
    >
      {children}
    </div>
  )
}
