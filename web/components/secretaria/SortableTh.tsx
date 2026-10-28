'use client'

// Encabezado de columna ordenable (tipo Explorador de Windows), compartido por
// Socios y Deudas. El <th> lleva aria-sort y el click vive en un <button>, así
// se puede ordenar con teclado (Tab + Enter/Espacio) y el lector de pantalla
// anuncia el orden actual. El foco visible lo da el :focus-visible global.

export type SortDirection = 'asc' | 'desc'

export default function SortableTh<C extends string>({
  column, label, align, sortColumn, sortDirection, onSort, extraClass,
}: {
  column: C
  label: string
  align: 'left' | 'center' | 'right'
  sortColumn: C
  sortDirection: SortDirection
  onSort: (c: C) => void
  extraClass?: string
}) {
  const activo = sortColumn === column
  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
  return (
    <th
      scope="col"
      aria-sort={activo ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`font-lora text-xs tracking-widest text-tinta/50 py-3 pr-4 select-none ${alignClass} ${extraClass ?? ''}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`tracking-widest cursor-pointer hover:text-tinta transition-colors ${activo ? 'text-oro' : ''}`}
      >
        {label}
        {activo && <span aria-hidden="true">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
      </button>
    </th>
  )
}
