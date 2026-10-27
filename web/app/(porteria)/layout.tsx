import type { Metadata } from 'next'
import PanelShell from '@/components/PanelShell'

export const metadata: Metadata = {
  title: {
    template: '%s — Gimnasio · Uncas Rugby',
    default: 'Gimnasio — Uncas Rugby',
  },
}

export default function PorteriaLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell panel="porteria">{children}</PanelShell>
}
