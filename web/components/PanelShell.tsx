'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import PanelSidebar, { type NavItem } from '@/components/PanelSidebar'
import { decidirSesion, type DecisionSesion } from '@/lib/sesionPanel'

export type PanelId = 'subcomision' | 'buffet' | 'secretaria' | 'porteria' | 'beneficios' | 'entrenador'

interface UserProfile {
  nombre: string
  rol: string
  roles: string[] | null
}

interface ConfigPanel {
  /** Roles que pueden entrar al panel; cualquier otro cierra sesión. */
  roles: string[]
  /**
   * Roles solo web que habilitan el panel por estar en `profiles.roles[]`
   * (la app deja a quien los tiene en rol 'socio'). Ver lib/sesionPanel.ts.
   */
  rolesPorMembresia?: string[]
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
  // Club de beneficios: nada que ver con subcomisión ni secretaría.
  beneficios: {
    roles: ['admin'],
    rolesPorMembresia: ['beneficios'],
    nombre: 'Beneficios',
    mostrarRol: false,
    items: [
      { href: '/beneficios', label: 'Beneficios' },
    ],
  },
  // Entrenador: por el rol activo (el login lo deja en 'entrenador'); la RLS
  // limita los datos a sus divisiones. Partidos se suma con su página.
  entrenador: {
    roles: ['entrenador'],
    nombre: 'Entrenador',
    mostrarRol: false,
    items: [
      { href: '/entrenador/asistencias', label: 'Asistencias' },
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
  const [errorSesion, setErrorSesion] = useState(false)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let cancelado = false
    const checkAuth = async () => {
      let decision: DecisionSesion
      let perfil: UserProfile | null = null
      const permisos = { rolesPermitidos: PANELES[panel].roles, rolesPorMembresia: PANELES[panel].rolesPorMembresia }
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (!user) {
          decision = decidirSesion({ user: null, userError, ...permisos })
        } else {
          const { data, error: perfilError } = await supabase
            .from('profiles')
            .select('nombre, rol, roles')
            .eq('id', user.id)
            .single()
          perfil = data
          decision = decidirSesion({ user, perfil: data, perfilError, ...permisos })
        }
      } catch (e) {
        decision = decidirSesion({ user: null, excepcion: e, ...permisos })
      }
      if (cancelado) return

      switch (decision.tipo) {
        case 'login':
          router.replace('/login')
          return
        case 'cerrar':
          // Sólo con el permiso confirmado como inválido (sin perfil o rol no permitido).
          await supabase.auth.signOut()
          router.replace('/login')
          return
        case 'error':
          // Corte de red / Supabase caído: no se cierra la sesión.
          setErrorSesion(true)
          setLoading(false)
          return
        case 'ok':
          setProfile(perfil)
          setErrorSesion(false)
          setLoading(false)
      }
    }

    checkAuth()
    return () => { cancelado = true }
  }, [router, panel, intento])

  if (errorSesion) {
    return (
      <div className="min-h-screen bg-papel flex items-center justify-center p-4">
        <div role="alert" className="border border-rojo p-6 text-center max-w-sm">
          <p className="font-lora text-sm text-rojo-texto mb-1">No se pudo verificar tu sesión.</p>
          <p className="font-lora text-xs text-texto-2 mb-4">Revisá la conexión a internet y probá de nuevo.</p>
          <button
            type="button"
            onClick={() => { setErrorSesion(false); setLoading(true); setIntento(i => i + 1) }}
            className="font-lora text-xs tracking-widest px-4 py-2 border border-gris-claro text-tinta hover:border-oro transition-colors"
          >
            REINTENTAR
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-papel flex items-center justify-center">
        <p className="font-lora text-tinta/50 tracking-widest text-sm">CARGANDO…</p>
      </div>
    )
  }

  // Subcomisión y admin entran a Turnos (portería) desde su panel: conservan su
  // barra lateral. Admin además ve Accesos (antes lo tenía en la barra de portería).
  const rol = profile?.rol ?? ''
  const config = panel === 'porteria' && ['subcomision', 'admin'].includes(rol)
    ? rol === 'admin'
      ? { ...PANELES.subcomision, items: [...PANELES.subcomision.items, { href: '/porteria/accesos', label: 'Accesos' }] }
      : PANELES.subcomision
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
