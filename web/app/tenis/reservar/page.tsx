import { notFound } from 'next/navigation'
import { FEATURES } from '@/lib/features'
import ReservarForm from '../_components/ReservarForm'

export default function ReservarTenisPage() {
  if (!FEATURES.tenis) notFound()
  return (
    <>
      <h1 className="font-playfair italic text-3xl text-tinta mb-2">Reservá una cancha</h1>
      <p className="font-lora text-sm text-tinta/80 leading-relaxed mb-8">
        Para quienes no son socios. Elegí el día y el horario, cargá tus datos y los de los otros jugadores, y
        confirmá desde el mail que te mandamos.
      </p>
      <ReservarForm />
    </>
  )
}
