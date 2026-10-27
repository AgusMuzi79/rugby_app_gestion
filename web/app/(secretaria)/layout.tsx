import type { Metadata } from 'next'
import PanelShell from '@/components/PanelShell'

export const metadata: Metadata = {
  title: {
    template: '%s — Secretaría · Uncas Rugby',
    default: 'Secretaría — Uncas Rugby',
  },
}

export default function SecretariaLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell panel="secretaria">{children}</PanelShell>
}
