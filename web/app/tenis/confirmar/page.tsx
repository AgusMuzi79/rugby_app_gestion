import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FEATURES } from '@/lib/features'
import Confirmar from '../_components/Confirmar'

// The one-time token travels in `?t=`: never send it to other sites as Referer.
export const metadata: Metadata = { referrer: 'no-referrer' }

export default async function ConfirmarTenisPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  if (!FEATURES.tenis) notFound()
  const { t } = await searchParams
  const token = typeof t === 'string' && t.trim() ? t.trim() : null
  return (
    <>
      <h1 className="font-playfair italic text-3xl text-tinta mb-8">Tu reserva de tenis</h1>
      <Confirmar token={token} />
    </>
  )
}
