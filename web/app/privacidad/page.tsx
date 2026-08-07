import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidad — Uncas Rugby',
  description: 'Política de privacidad de la app y el panel de gestión de UNCAS Rugby Club.',
}

// Página pública, sin autenticación — URL requerida por App Store Connect y
// Google Play Console para publicar la app. Es un BORRADOR: falta revisión
// del abogado del club (mismo circuito que Términos y Condiciones,
// ver openspec y CLAUDE.md). No reemplaza esa revisión legal.

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

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-papel">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="mb-4 p-4 border border-oro/40 bg-oro/5">
          <p className="font-lora text-xs tracking-widest text-oro-hondo">
            BORRADOR — pendiente de revisión por el asesor legal del club, mismo circuito que los Términos y Condiciones.
          </p>
        </div>

        <h1 className="font-playfair italic text-3xl text-tinta mb-1">Política de Privacidad</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide mb-10">
          UNCAS Rugby Club — app móvil y panel de gestión · Última actualización: agosto de 2026
        </p>

        <Seccion titulo="1. Quién es responsable de tus datos">
          <p>
            UNCAS Rugby Club ("el Club") es responsable del tratamiento de los datos personales
            recolectados a través de la app móvil y el panel web de gestión, usados para administrar
            socios, cuotas, actividad deportiva y comunicaciones del Club.
          </p>
        </Seccion>

        <Seccion titulo="2. Qué datos recolectamos">
          <p>Según tu rol y tu relación con el Club, podemos tratar:</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Datos de identidad: nombre, DNI, fecha de nacimiento, foto de carnet.</li>
            <li>Datos de contacto: email, teléfono, dirección.</li>
            <li>Datos de socio: número de socio, categoría, estado de la cuota, comprobantes de pago que subís desde la app.</li>
            <li>Datos deportivos: división, asistencia a entrenamientos y partidos, resultados, y, si corresponde, registros de lesiones.</li>
            <li>Datos técnicos: token de notificaciones push, para poder enviarte avisos del Club.</li>
          </ul>
        </Seccion>

        <Seccion titulo="3. Datos de menores de edad">
          <p>
            El Club tiene divisiones infantiles y juveniles — una parte de los socios son menores de
            edad. En esos casos, el alta y la administración de la cuenta están a cargo de un
            madre/padre/tutor o de Secretaría del Club, conforme a la Ley 25.326 de Protección de
            Datos Personales. No recolectamos datos de menores fuera de lo necesario para la gestión
            de su actividad como socio.
          </p>
        </Seccion>

        <Seccion titulo="4. Para qué usamos tus datos">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Gestionar tu carnet de socio y validar tu acceso al Club.</li>
            <li>Administrar cuotas, servicios opcionales y pagos.</li>
            <li>Organizar la actividad deportiva: asistencia, calendario, resultados, fichajes.</li>
            <li>Enviarte noticias y notificaciones relevantes del Club (novedades, cancelaciones, vencimientos).</li>
            <li>Cumplir obligaciones administrativas y de seguridad del Club.</li>
          </ul>
        </Seccion>

        <Seccion titulo="5. Con quién compartimos tus datos">
          <p>
            No vendemos tus datos a terceros. Usamos proveedores de infraestructura para operar la
            app, que procesan datos en nuestro nombre bajo sus propias condiciones de seguridad:
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Supabase — base de datos, autenticación y almacenamiento de archivos (fotos, comprobantes).</li>
            <li>Expo — envío de notificaciones push.</li>
            <li>Resend — envío de emails (comprobantes de pago, avisos).</li>
          </ul>
        </Seccion>

        <Seccion titulo="6. Cómo protegemos tus datos">
          <p>
            El acceso a los datos está restringido por rol: cada usuario sólo ve la información que
            corresponde a su función en el Club (por ejemplo, un socio ve sus propios datos, no los
            de otros socios). Las fotos y comprobantes se guardan en almacenamiento privado, no
            público. Las comunicaciones entre la app y nuestros servidores viajan encriptadas.
          </p>
        </Seccion>

        <Seccion titulo="7. Tus derechos">
          <p>
            Podés pedir acceso, corrección o baja de tus datos personales escribiéndole a Secretaría
            del Club. Si sos menor de edad, tu madre/padre/tutor puede hacerlo en tu representación.
          </p>
        </Seccion>

        <Seccion titulo="8. Contacto">
          <p>
            Para consultas sobre esta política o sobre tus datos personales, contactate con Secretaría
            de UNCAS Rugby Club.
          </p>
        </Seccion>
      </div>
    </main>
  )
}
