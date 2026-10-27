'use client'

import { useEffect, useId, useRef } from 'react'

interface Props {
  titulo: string
  onClose: () => void
  children: React.ReactNode
  /** Ancho máximo del panel (clase de Tailwind). */
  ancho?: string
  /** Relleno del panel. */
  relleno?: string
  /** Clases del encabezado (título + botón cerrar). */
  encabezado?: string
}

// Modal sobre <dialog> nativo: showModal() lo pone en la capa superior, atrapa el
// foco y vuelve inerte el resto de la página. Se monta abierto: el padre lo
// desmonta para cerrarlo. Escape y la × llaman a onClose.
export default function Modal({
  titulo,
  onClose,
  children,
  ancho = 'max-w-xl',
  relleno = 'p-8',
  encabezado = 'flex justify-between items-center mb-6',
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitulo = useId()
  // false desde que el padre lo desmonta: el `close` nativo que dispara ese
  // cierre llega después (asíncrono) y no tiene que volver a llamar a onClose.
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
      // Devuelve el foco al control que abrió el modal.
      previo?.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={e => { e.preventDefault(); onClose() }}
      // Si el navegador lo cierra por su cuenta (sin un cancel cancelable), el
      // padre se entera igual y no queda un modal cerrado con el estado abierto.
      onClose={() => { if (abierto.current) { abierto.current = false; onClose() } }}
      className={`m-auto w-[calc(100%-2rem)] ${ancho} max-h-[90vh] overflow-y-auto bg-card text-tinta ${relleno} backdrop:bg-dark/70`}
    >
      <div className={encabezado}>
        <h2 id={idTitulo} className="font-lora text-xs tracking-widest text-tinta/60">{titulo}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-my-3 -mr-3 min-h-11 min-w-11 flex items-center justify-center text-texto-2 hover:text-tinta text-xl leading-none"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}
