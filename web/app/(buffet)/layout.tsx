import type { Metadata } from 'next'
import PanelShell from '@/components/PanelShell'

export const metadata: Metadata = {
  title: {
    template: '%s — Buffet · Uncas Rugby',
    default: 'Buffet — Uncas Rugby',
  },
}

export default function BuffetLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell panel="buffet">{children}</PanelShell>
}
