'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/secretaria/socios',    label: 'Socios'    },
  { href: '/secretaria/noticias',  label: 'Noticias'  },
  { href: '/secretaria/servicios', label: 'Servicios' },
]

interface Props {
  nombre?: string
  rol?: string
}

export default function SidebarSecretaria({ nombre, rol }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-56 border-r flex flex-col z-20" style={{ backgroundColor: '#0B0905', borderColor: '#2C2418' }}>

      {/* Logo */}
      <div className="px-6 py-8 border-b border-gris-claro">
        <p className="font-playfair font-black text-2xl tracking-wide leading-none">
          <span className="text-tinta">UN</span><span className="text-oro">CAS</span>
        </p>
        <p className="font-lora text-gris text-[9px] tracking-[4px] mt-1.5 uppercase">Secretaría</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6">
        <p className="font-lora text-gris text-[9px] tracking-widest mb-3 px-2 uppercase">Secciones</p>
        <div className="flex flex-col gap-0.5">
          {NAV.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-2 py-2.5 text-xs tracking-widest font-lora transition-colors flex items-center justify-between ${
                  active
                    ? 'text-tinta font-semibold'
                    : 'text-gris hover:text-tinta'
                }`}
              >
                {label}
                {active && <span className="w-0.5 h-3.5 bg-oro flex-shrink-0" />}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Sesión */}
      <div className="px-6 py-6 border-t border-gris-claro">
        <p className="font-lora text-gris text-[9px] tracking-widest mb-3 uppercase">Sesión</p>
        {nombre && (
          <p className="font-lora text-oro text-sm font-semibold truncate mb-0.5">{nombre}</p>
        )}
        {rol && (
          <p className="font-lora text-gris text-[10px] uppercase tracking-widest mb-4">{rol}</p>
        )}
        <button
          onClick={handleSignOut}
          className="text-xs font-lora tracking-widest text-gris hover:text-rojo transition-colors"
        >
          CERRAR SESIÓN
        </button>
      </div>

    </aside>
  )
}
