import type { Metadata } from 'next'
import PanelShell from '@/components/PanelShell'

export const metadata: Metadata = {
  title: {
    template: '%s — Beneficios · Uncas Rugby',
    default: 'Beneficios — Uncas Rugby',
  },
}

export default function BeneficiosLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell panel="beneficios">{children}</PanelShell>
}
