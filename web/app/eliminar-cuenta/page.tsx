import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Eliminar tu cuenta — Uncas Rugby',
  description: 'Cómo solicitar la eliminación de tu cuenta y tus datos en la app de UNCAS Rugby Club.',
}

// Página pública, sin autenticación — URL requerida por Google Play Console
// (y App Store Connect) cuando la app permite crear cuentas. La baja es
// manual (a cargo de Secretaría, vía el padrón de NUVIX) y la cuenta se
// bloquea, no se borra: el texto tiene que decir exactamente eso.

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

export default function EliminarCuentaPage() {
  return (
    <main className="min-h-screen bg-papel">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-playfair italic text-3xl text-tinta mb-1">Eliminar tu cuenta</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide mb-10">
          UNCAS Rugby Club — app móvil y panel de gestión
        </p>

        <Seccion titulo="Cómo solicitar la eliminación">
          <p>
            Podés pedir la eliminación de tu cuenta y tus datos personales escribiendo a{' '}
            <a href="mailto:uncasrclub@gmail.com" className="text-oro-hondo underline">
              uncasrclub@gmail.com
            </a>{' '}
            desde el email con el que estás registrado, indicando tu nombre completo y DNI. Si sos
            menor de edad, la solicitud la tiene que hacer tu madre/padre/tutor.
          </p>
        </Seccion>

        {/* Proceso real (decisión del club 2026-10-26): Secretaría da de baja al socio
            en el padrón de NUVIX y el import siguiente bloquea la cuenta
            (importar-socios: ban de la cuenta). No se borra nada en la base ni en Auth. */}
        <Seccion titulo="Qué pasa con tu cuenta">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Secretaría te da de baja en el padrón de socios del Club.</li>
            <li>Con la siguiente actualización del padrón, tu cuenta queda bloqueada: ya no podés iniciar sesión ni usar el carnet digital.</li>
            <li>Dejás de recibir notificaciones del Club.</li>
          </ul>
        </Seccion>

        <Seccion titulo="Qué se conserva">
          <p>
            Tus datos no se borran: quedan guardados, sin uso y con acceso restringido, junto con el
            historial de tu cuenta (cuotas, pagos, accesos y actividad deportiva), por el tiempo que
            exijan las obligaciones contables e impositivas del Club. Si volvés a asociarte, tu
            cuenta se reactiva con el mismo historial.
          </p>
        </Seccion>

        <Seccion titulo="Plazo">
          <p>Procesamos la solicitud dentro de los 30 días de recibida.</p>
        </Seccion>
      </div>
    </main>
  )
}
