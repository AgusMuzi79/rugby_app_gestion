'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import PanelSidebar, { type NavItem } from '@/components/PanelSidebar'

export type PanelId = 'subcomision' | 'buffet' | 'secretaria' | 'porteria'

interface UserProfile {
  nombre: string
  rol: string
}

interface ConfigPanel {
  /** Roles que pueden entrar al panel; cualquier otro cierra sesión. */
  roles: string[]
  /** Nombre debajo del logo. */
  nombre: string
  items: NavItem[]
  /** Muestra el rol debajo del nombre en el bloque de sesión. */
  mostrarRol: boolean
}

const PANELES: Record<PanelId, ConfigPanel> = {
  subcomision: {
    roles: ['subcomision', 'admin'],
    nombre: 'Subcomisión',
    mostrarRol: true,
    items: [
      { href: '/dashboard',       label: 'Portada'    },
      { href: '/usuarios',        label: 'Usuarios'   },
      { href: '/divisiones',      label: 'Divisiones' },
      { href: '/informes',        label: 'Informes'   },
      { href: '/noticias',        label: 'Noticias'   },
      { href: '/porteria/turnos', label: 'Turnos'     },
    ],
  },
  buffet: {
    roles: ['buffet', 'admin'],
    nombre: 'Buffet',
    mostrarRol: false,
    items: [
      { href: '/buffet/promos', label: 'Promos' },
    ],
  },
  secretaria: {
    roles: ['secretaria', 'admin'],
    nombre: 'Secretaría',
    mostrarRol: true,
    items: [
      { href: '/secretaria/socios',            label: 'Socios'            },
      { href: '/secretaria/noticias',          label: 'Noticias'          },
      { href: '/secretaria/servicios',         label: 'Servicios'         },
      { href: '/secretaria/categorias',        label: 'Categorías'        },
      { href: '/secretaria/deudas',            label: 'Deudas'            },
      { href: '/secretaria/deuda',             label: 'Importar Deuda'    },
      { href: '/secretaria/socios-import',     label: 'Importar Socios'   },
      { href: '/secretaria/debito-automatico', label: 'Débito Automático' },
    ],
  },
  porteria: {
    roles: ['porteria', 'admin', 'subcomision'],
    nombre: 'Gimnasio',
    mostrarRol: false,
    items: [
      { href: '/porteria/accesos', label: 'Accesos' },
      { href: '/porteria/turnos',  label: 'Turnos'  },
    ],
  },
}

// Guard de rol + barra lateral + contenido, compartido por los layouts de los paneles.
export default function PanelShell({ panel, children }: { panel: PanelId; children: React.ReactNode }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data } = await supabase
        .from('profiles')
        .select('nombre, rol')
        .eq('id', user.id)
        .single()

      if (!data || !PANELES[panel].roles.includes(data.rol)) {
        await supabase.auth.signOut()
        router.replace('/login')
        return
      }

      setProfile(data)
      setLoading(false)
    }

    checkAuth()
  }, [router, panel])

  if (loading) {
    return (
      <div className="min-h-screen bg-papel flex items-center justify-center">
        <p className="font-lora text-tinta/50 tracking-widest text-sm">CARGANDO…</p>
      </div>
    )
  }

  // Subcomisión y admin entran a Turnos (portería) desde su panel: conservan su barra lateral.
  const config = panel === 'porteria' && ['subcomision', 'admin'].includes(profile?.rol ?? '')
    ? PANELES.subcomision
    : PANELES[panel]

  return (
    <div className="min-h-screen bg-papel">
      <PanelSidebar
        panel={config.nombre}
        items={config.items}
        nombre={profile?.nombre}
        rol={config.mostrarRol ? profile?.rol : undefined}
      />
      <main className="lg:ml-56 p-4 sm:p-8 min-h-screen">{children}</main>
    </div>
  )
}
