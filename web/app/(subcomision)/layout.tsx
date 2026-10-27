import type { Metadata } from 'next'
import PanelShell from '@/components/PanelShell'

export const metadata: Metadata = {
  title: {
    template: '%s — Subcomisión · Uncas Rugby',
    default: 'Subcomisión — Uncas Rugby',
  },
}

export default function SubcomisionLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell panel="subcomision">{children}</PanelShell>
}
