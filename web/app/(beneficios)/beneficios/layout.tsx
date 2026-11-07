import type { Metadata } from 'next'

// La página es client component: el título va en este layout de servidor.
export const metadata: Metadata = { title: 'Club de beneficios' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
