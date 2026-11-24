'use client'

import { useEffect, useId, useRef } from 'react'
import { AVISO_SANCIONES } from '@/lib/tenis'

// Sanctions notice before a guest booking is sent. Native <dialog> opened
// with showModal(): top layer, focus kept inside, rest of the page inert,
// Escape closes it. Mounted open: the parent unmounts it to close it.
export default function AvisoSanciones({ onVolver, onConfirmar }: { onVolver: () => void; onConfirmar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitulo = useId()
  const idTexto = useId()
  // false once the parent unmounts it: the async native `close` that follows
  // must not call onVolver again.
  const abierto = useRef(true)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    abierto.current = true
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    return () => {
      abierto.current = false
      if (dialog.open) dialog.close()
      previo?.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      aria-describedby={idTexto}
      onCancel={e => { e.preventDefault(); onVolver() }}
      onClose={() => { if (abierto.current) { abierto.current = false; onVolver() } }}
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-card text-tinta border border-gris-claro p-6 backdrop:bg-dark/70"
    >
      <h2 id={idTitulo} className="font-playfair italic text-xl text-tinta mb-3">{AVISO_SANCIONES.titulo}</h2>
      <p id={idTexto} className="font-lora text-sm text-tinta/80 leading-relaxed mb-6">{AVISO_SANCIONES.texto}</p>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onConfirmar}
          className="w-full bg-oro text-papel font-lora text-sm font-semibold tracking-widest py-4 min-h-11 hover:bg-oro/90 transition-colors"
        >
          ENTENDIDO, RESERVAR
        </button>
        <button
          type="button"
          onClick={onVolver}
          autoFocus
          className="w-full border border-borde-control text-tinta font-lora text-sm tracking-widest py-3 min-h-11 hover:border-oro transition-colors"
        >
          VOLVER
        </button>
      </div>
    </dialog>
  )
}
