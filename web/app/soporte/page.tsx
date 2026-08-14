import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Soporte — Uncas Rugby',
  description: 'Cómo contactarte con UNCAS Rugby Club para soporte de la app.',
}

// Página pública, sin autenticación — URL requerida por App Store Connect
// (Support URL) para publicar la app. El soporte es manual, a cargo de
// Secretaría del Club, igual que el resto de la gestión de socios.

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-playfair italic text-xl text-tinta mb-3">{titulo}</h2>
      <div className="font-lora text-sm text-tinta/80 leading-relaxed flex flex-col gap-3">
        {children}
      </div>
    </section>
  )
}

export default function SoportePage() {
  return (
    <main className="min-h-screen bg-papel">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-playfair italic text-3xl text-tinta mb-1">Soporte</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide mb-10">
          UNCAS Rugby Club — app móvil y panel de gestión
        </p>

        <Seccion titulo="¿Tenés un problema con la app o una consulta?">
          <p>
            Escribinos a Secretaría del Club y te ayudamos — problemas para ingresar, dudas sobre tu
            cuota o tu carnet, errores en la app, o cualquier otra consulta.
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              Por email:{' '}
              <a href="mailto:uncasrclub@gmail.com" className="text-oro-hondo underline">
                uncasrclub@gmail.com
              </a>
            </li>
            <li>
              Por WhatsApp:{' '}
              <a href="https://wa.me/5492494522888" className="text-oro-hondo underline">
                +54 9 249 452-2888
              </a>
            </li>
          </ul>
        </Seccion>

        <Seccion titulo="Tiempo de respuesta">
          <p>Secretaría responde en horario de atención habitual del Club, de lunes a viernes.</p>
        </Seccion>
      </div>
    </main>
  )
}
