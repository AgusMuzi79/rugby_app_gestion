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

export function Campo(p: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  type?: string
  inputMode?: 'numeric' | 'email' | 'text'
  autoComplete?: string
}) {
  const errId = `${p.id}-error`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={p.id} className="font-lora text-xs tracking-widest text-tinta/80">{p.label}</label>
      <input
        id={p.id}
        type={p.type ?? 'text'}
        inputMode={p.inputMode}
        autoComplete={p.autoComplete}
        value={p.value}
        onChange={e => p.onChange(e.target.value)}
        aria-invalid={p.error ? true : undefined}
        aria-describedby={p.error ? errId : undefined}
        className="font-lora text-tinta bg-transparent border-b border-borde-control py-2 text-base outline-none focus:border-oro transition-colors"
      />
      {p.error && <p id={errId} className="font-lora text-rojo-texto text-sm">{p.error}</p>}
    </div>
  )
}

export function Opcion(p: { activo: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      onClick={p.onClick}
      aria-pressed={p.activo}
      aria-label={p.label}
      className={`font-lora text-sm tracking-wide px-3 py-2 min-h-11 border transition-colors ${
        p.activo ? 'bg-oro text-papel border-oro' : 'text-tinta border-borde-control hover:border-oro'
      }`}
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
