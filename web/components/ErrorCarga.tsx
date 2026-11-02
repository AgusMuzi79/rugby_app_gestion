'use client'

// Bloque de error de carga con REINTENTAR. Se muestra en lugar de la lista cuando
// la consulta falló: nunca un vacío ("sin datos") si en realidad no se pudo leer.
export default function ErrorCarga({ mensaje, onReintentar, className }: {
  mensaje: string
  onReintentar: () => void
  className?: string
}) {
  return (
    <div role="alert" className={`border border-rojo p-6 text-center ${className ?? ''}`}>
      <p className="font-lora text-sm text-rojo-texto mb-3">{mensaje}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="font-lora text-xs tracking-widest px-4 py-2 border border-gris-claro text-tinta hover:border-oro transition-colors"
      >
        REINTENTAR
      </button>
    </div>
  )
}
