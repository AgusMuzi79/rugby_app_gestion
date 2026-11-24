import type { Metadata } from 'next'

// Public tennis booking pages for non-members (no login, no Supabase session).
// Each page checks FEATURES.tenis and answers 404 while the module is off.
export const metadata: Metadata = {
  title: 'Reservá una cancha de tenis — Uncas',
  description: 'Reservá un turno en las canchas de tenis del Club Uncas sin ser socio.',
  robots: { index: false, follow: false },
}

export default function TenisLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-papel">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <p className="font-lora text-texto-2 text-xs tracking-widest mb-2">UNCAS · TENIS</p>
        {children}
      </div>
    </main>
  )
}
