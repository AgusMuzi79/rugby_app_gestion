import type { Metadata } from 'next'

// Public tennis booking pages for non-members (no login, no Supabase session).
// Each page checks FEATURES.tenis and answers 404 while the module is off.
export const metadata: Metadata = {
  title: 'Reservá una cancha de tenis — Uncas',
  description: 'Reservá un turno en las canchas de tenis del Club Uncas sin ser socio.',
  robots: { index: false, follow: false },
}

// Browser surfaces follow the palette: gold text selection, dark form
// controls. The club name lives in the footer, not as an eyebrow.
export default function TenisLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-papel [color-scheme:dark] selection:bg-oro selection:text-papel">
      <div className="max-w-xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-8">
        {children}
        <footer className="mt-10 font-lora text-sm text-texto-2">Club Uncas · Canchas de tenis</footer>
      </div>
    </main>
  )
}
