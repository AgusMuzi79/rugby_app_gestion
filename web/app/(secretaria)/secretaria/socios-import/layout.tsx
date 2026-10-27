import type { Metadata } from 'next'

// La página es client component: el título va en este layout de servidor.
export const metadata: Metadata = { title: 'Importar socios' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
