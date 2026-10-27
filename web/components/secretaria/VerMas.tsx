'use client'

// Pie de las listas largas: cuántas filas se ven y un botón para sumar otra tanda.
export default function VerMas({ mostrando, total, restantes, paso, onVerMas }: {
  mostrando: number
  total: number
  restantes: number
  paso: number
  onVerMas: () => void
}) {
  if (restantes <= 0) return null
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <p className="font-lora text-xs tracking-widest text-texto-2">
        MOSTRANDO {mostrando} DE {total}
      </p>
      <button
        type="button"
        onClick={onVerMas}
        className="font-lora text-xs tracking-widest px-5 py-2 border border-oro text-oro hover:bg-oro/10 transition-colors"
      >
        VER MÁS ({Math.min(paso, restantes)})
      </button>
    </div>
  )
}
