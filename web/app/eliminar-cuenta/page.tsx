import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Eliminar tu cuenta — Uncas Rugby',
  description: 'Cómo solicitar la eliminación de tu cuenta y tus datos en la app de UNCAS Rugby Club.',
}

// Página pública, sin autenticación — URL requerida por Google Play Console
// (y App Store Connect) cuando la app permite crear cuentas. El proceso de
// borrado hoy es manual (a cargo de Secretaría), igual que el resto de las
// bajas/altas del Club — no hay autoservicio automático todavía.

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

        <Seccion titulo="Qué se elimina">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Tu acceso y credenciales de inicio de sesión.</li>
            <li>Tu perfil: datos de contacto, foto de carnet, tokens de notificaciones.</li>
            <li>Datos deportivos asociados (asistencia, fichajes) si no corresponden a otro socio.</li>
          </ul>
        </Seccion>

        <Seccion titulo="Qué se conserva">
          <p>
            Los registros de cuotas y pagos pueden conservarse por el tiempo que exijan las
            obligaciones contables e impositivas del Club, de forma disociada de tu perfil una vez
            eliminada la cuenta.
          </p>
        </Seccion>

        <Seccion titulo="Plazo">
          <p>Procesamos la solicitud dentro de los 30 días de recibida.</p>
        </Seccion>
      </div>
    </main>
  )
}
