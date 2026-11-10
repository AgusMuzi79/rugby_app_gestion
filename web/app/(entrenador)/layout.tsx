import type { Metadata } from 'next'
import PanelShell from '@/components/PanelShell'

export const metadata: Metadata = {
  title: {
    template: '%s — Entrenador · Uncas Rugby',
    default: 'Entrenador — Uncas Rugby',
  },
}

export default function EntrenadorLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell panel="entrenador">{children}</PanelShell>
}
