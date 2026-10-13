'use client'

// Muestra sólo los primeros `limite` ítems de una lista larga, con un botón para
// ver todos y volver a colapsar. `render` recibe los ítems visibles y arma el
// contenedor (tabla, <ul>, etc.), así sirve para cualquier forma de lista. Si la
// lista tiene `limite` ítems o menos, no aparece el botón.

import { useState, type ReactNode } from 'react'

export default function ListaColapsable<T>({ items, render, limite = 10 }: {
  items: T[]
  render: (visibles: T[]) => ReactNode
  limite?: number
}) {
  const [expandida, setExpandida] = useState(false)
  const colapsable = items.length > limite
  const visibles = colapsable && !expandida ? items.slice(0, limite) : items

  return (
    <>
      {render(visibles)}
      {colapsable && (
        <button
          type="button"
          onClick={() => setExpandida(e => !e)}
          className="mt-2 font-lora text-xs tracking-widest text-oro hover:text-oro/80 transition-colors"
        >
          {expandida ? 'Ver menos' : `Ver todos (${items.length})`}
        </button>
      )}
    </>
  )
}
