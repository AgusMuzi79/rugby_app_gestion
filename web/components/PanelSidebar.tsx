'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export interface NavItem {
  href: string
  label: string
}

interface Props {
  /** Nombre del panel debajo del logo (Subcomisión, Buffet, …). */
  panel: string
  items: NavItem[]
  nombre?: string
  rol?: string
}

const ID_MENU = 'panel-sidebar'

// Barra lateral única de los paneles web: fija de lg en adelante; debajo de lg
// queda fuera de pantalla y se abre con el botón MENÚ de la barra superior.
export default function PanelSidebar({ panel, items, nombre, rol }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  // Ruta en la que se abrió el menú: al navegar deja de coincidir y se cierra solo.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null)
  const abierto = abiertoEn === pathname
  const botonMenu   = useRef<HTMLButtonElement>(null)
  const botonCerrar = useRef<HTMLButtonElement>(null)

  const cerrar = () => {
    setAbiertoEn(null)
    botonMenu.current?.focus()
  }

  useEffect(() => {
    if (!abierto) return
    botonCerrar.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAbiertoEn(null)
      botonMenu.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [abierto])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <>
      {/* Barra superior: sólo debajo de lg */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-4 h-14 px-4 bg-dark border-b border-gris-claro">
        <p className="font-playfair font-black text-xl tracking-wide leading-none">
          <span className="text-tinta">UN</span><span className="text-oro">CAS</span>
          <span className="font-lora font-normal text-gris text-[9px] tracking-[4px] uppercase ml-3 align-middle">{panel}</span>
        </p>
        <button
          ref={botonMenu}
          type="button"
          onClick={() => setAbiertoEn(pathname)}
          aria-expanded={abierto}
          aria-controls={ID_MENU}
          className="min-h-11 min-w-11 px-3 font-lora text-xs tracking-widest text-tinta border border-gris-claro hover:border-oro transition-colors"
        >
          MENÚ
        </button>
      </header>

      {abierto && (
        <div className="lg:hidden fixed inset-0 z-30 bg-dark/70" onClick={cerrar} aria-hidden="true" />
      )}

      <aside
        id={ID_MENU}
        className={`fixed inset-y-0 left-0 z-40 w-56 flex flex-col overflow-y-auto bg-dark border-r border-gris-claro transition-[transform,visibility] duration-200 lg:visible lg:translate-x-0 ${
          abierto ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >

        {/* Logo */}
        <div className="px-6 py-8 border-b border-gris-claro flex items-start justify-between gap-2">
          <div>
            <p className="font-playfair font-black text-2xl tracking-wide leading-none">
              <span className="text-tinta">UN</span><span className="text-oro">CAS</span>
            </p>
            <p className="font-lora text-gris text-[9px] tracking-[4px] mt-1.5 uppercase">{panel}</p>
          </div>
          <button
            ref={botonCerrar}
            type="button"
            onClick={cerrar}
            aria-label="Cerrar menú"
            className="lg:hidden -my-3 -mr-3 min-h-11 min-w-11 flex items-center justify-center text-texto-2 hover:text-tinta text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Secciones" className="flex-1 px-4 py-6">
          <p className="font-lora text-gris text-[9px] tracking-widest mb-3 px-2 uppercase">Secciones</p>
          <div className="flex flex-col gap-0.5">
            {items.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
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
            className="text-xs font-lora tracking-widest text-gris hover:text-rojo-texto transition-colors"
          >
            CERRAR SESIÓN
          </button>
        </div>

      </aside>
    </>
  )
}
