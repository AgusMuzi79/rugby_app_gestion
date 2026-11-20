'use client'

// Página pública: destino del link "Olvidé mi contraseña" (REDIRECT_RECUPERO en
// supabase/functions/_shared/recupero-password.ts). Funciona aunque el mail se
// abra en una PC, donde el deep link de la app no abre nada.
//
// Usa su propio cliente de Supabase en memoria: el de lib/supabase.ts guardaría
// la sesión del link en el localStorage del panel. Sin un fragmento de recovery
// válido nunca muestra el formulario (alguien del staff logueado que entre a la
// URL no tiene que ver un cambio de contraseña).

import { useEffect, useRef, useState } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  AVISO_FALLA_VERIFICACION, AVISO_LINK_VENCIDO, MIN_PASSWORD, destinoTrasVerificar, errorAlGuardar,
  parsearFragmentoRecupero, validarNuevaPassword,
  type ErroresNuevaPassword, type FragmentoRecupero,
} from '@/lib/resetPassword'

type Estado = 'cargando' | 'invalido' | 'falla' | 'formulario' | 'listo'

const AVISO_LINK_INVALIDO = 'Este link no es válido. Pedí uno nuevo desde la app.'

function crearCliente(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const claseInput =
  'w-full font-lora text-tinta bg-transparent border-b border-borde-control py-2 text-sm outline-none focus:border-oro transition-colors pr-16'
const claseToggle =
  'absolute right-0 top-1/2 -translate-y-1/2 font-lora text-xs tracking-widest text-texto-2 hover:text-tinta transition-colors'

export default function ResetPasswordPage() {
  const clienteRef = useRef<SupabaseClient | null>(null)
  const fragmentoRef = useRef<FragmentoRecupero | null>(null)
  const [estado, setEstado] = useState<Estado>('cargando')
  const [aviso, setAviso] = useState('')
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [errores, setErrores] = useState<ErroresNuevaPassword>({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let cancelado = false
    // El fragmento se lee una sola vez y se saca de la barra de direcciones:
    // los tokens no tienen que quedar en el historial ni a la vista. Queda en un
    // ref porque en desarrollo (StrictMode) el efecto corre dos veces.
    if (!fragmentoRef.current) {
      fragmentoRef.current = parsearFragmentoRecupero(window.location.hash)
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
    const fragmento = fragmentoRef.current

    if (fragmento.tipo === 'error') {
      setAviso(fragmento.mensaje)
      setEstado('invalido')
      return
    }
    if (fragmento.tipo === 'invalido') {
      setAviso(AVISO_LINK_INVALIDO)
      setEstado('invalido')
      return
    }

    verificarLink(() => cancelado)
    return () => { cancelado = true }
  }, [])

  // Abre la sesión del link con los tokens guardados en el ref. Una falla de red
  // no gasta el link: deja reintentar con los mismos tokens en vez de decir que venció.
  function verificarLink(cancelado: () => boolean = () => false) {
    const fragmento = fragmentoRef.current
    if (fragmento?.tipo !== 'tokens') return
    setEstado('cargando')
    const cliente = crearCliente()
    clienteRef.current = cliente
    const ir = (session: boolean, error: unknown) => {
      if (cancelado()) return
      const destino = destinoTrasVerificar({ session, error })
      if (destino === 'invalido') setAviso(AVISO_LINK_VENCIDO)
      setEstado(destino)
    }
    cliente.auth
      .setSession({ access_token: fragmento.accessToken, refresh_token: fragmento.refreshToken })
      .then(({ data, error }) => ir(Boolean(data.session), error))
      .catch((error: unknown) => ir(false, error))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorGeneral('')
    const nuevos = validarNuevaPassword(password, confirmacion)
    setErrores(nuevos)
    if (nuevos.password || nuevos.confirmacion) return

    const cliente = clienteRef.current
    if (!cliente) {
      setAviso(AVISO_LINK_VENCIDO)
      setEstado('invalido')
      return
    }

    setGuardando(true)
    try {
      const { error } = await cliente.auth.updateUser({ password })
      if (error) {
        const resultado = errorAlGuardar(error)
        if (resultado.tipo === 'vencido') {
          setAviso(resultado.mensaje)
          setEstado('invalido')
        } else {
          setErrorGeneral(resultado.mensaje)
        }
        return
      }
      // La contraseña ya cambió: el éxito no espera a la red. La sesión del link
      // sólo vive en memoria; se cierra en segundo plano para no dejarla usable.
      clienteRef.current = null
      setPassword('')
      setConfirmacion('')
      setEstado('listo')
      void cliente.auth.signOut({ scope: 'local' }).catch(() => undefined)
    } catch (error) {
      setErrorGeneral(errorAlGuardar(error).mensaje)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <main className="min-h-screen bg-papel flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <p className="font-lora text-tinta/50 text-xs tracking-widest mb-3">
            UNCAS RUGBY CLUB · EST. 1836
          </p>
          <h1 className="font-playfair italic text-5xl font-black text-tinta leading-tight">
            Uncas Rugby App
          </h1>
          <p className="font-lora text-tinta/50 text-sm mt-3 tracking-wide">
            Establecé tu nueva contraseña de acceso.
          </p>
        </div>

        <div className="bg-card border border-gris-claro p-8">
          {estado === 'cargando' && (
            <p role="status" className="font-lora text-tinta/60 text-sm text-center">Verificando el link…</p>
          )}

          {estado === 'invalido' && (
            <div className="flex flex-col gap-3">
              <p role="alert" className="font-lora text-rojo-texto text-sm">{aviso}</p>
              <p className="font-lora text-tinta/70 text-sm">
                En la app, tocá <span className="text-oro-hondo">¿Olvidaste tu contraseña?</span> en la
                pantalla de ingreso y te llega un mail con un link nuevo.
              </p>
            </div>
          )}

          {estado === 'falla' && (
            <div className="flex flex-col gap-4">
              <p role="alert" className="font-lora text-rojo-texto text-sm">{AVISO_FALLA_VERIFICACION}</p>
              <button
                type="button"
                onClick={() => verificarLink()}
                className="bg-oro text-papel font-lora text-xs tracking-widest py-4 hover:bg-oro/90 transition-colors"
              >
                REINTENTAR
              </button>
            </div>
          )}

          {estado === 'listo' && (
            <p role="status" className="font-lora text-tinta text-sm">
              Contraseña actualizada. Ya podés ingresar en la app con tu nueva contraseña.
            </p>
          )}

          {estado === 'formulario' && (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <label htmlFor="reset-password" className="font-lora text-xs tracking-widest text-tinta/60">
                  NUEVA CONTRASEÑA
                </label>
                <div className="relative">
                  <input
                    id="reset-password"
                    type={mostrar ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD}
                    aria-invalid={Boolean(errores.password)}
                    aria-describedby={errores.password ? 'reset-password-error' : undefined}
                    className={claseInput}
                    placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrar(v => !v)}
                    aria-pressed={mostrar}
                    aria-label={mostrar ? 'Ocultar contraseña' : 'Ver contraseña'}
                    className={claseToggle}
                  >
                    {mostrar ? 'OCULTAR' : 'VER'}
                  </button>
                </div>
                {errores.password && (
                  <p id="reset-password-error" role="alert" className="font-lora text-rojo-texto text-sm">
                    {errores.password}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="reset-confirmacion" className="font-lora text-xs tracking-widest text-tinta/60">
                  CONFIRMAR CONTRASEÑA
                </label>
                <input
                  id="reset-confirmacion"
                  type={mostrar ? 'text' : 'password'}
                  value={confirmacion}
                  onChange={e => setConfirmacion(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={Boolean(errores.confirmacion)}
                  aria-describedby={errores.confirmacion ? 'reset-confirmacion-error' : undefined}
                  className={claseInput}
                  placeholder="Repetí tu contraseña"
                />
                {errores.confirmacion && (
                  <p id="reset-confirmacion-error" role="alert" className="font-lora text-rojo-texto text-sm">
                    {errores.confirmacion}
                  </p>
                )}
              </div>

              {errorGeneral && (
                <p role="alert" className="font-lora text-rojo-texto text-sm">{errorGeneral}</p>
              )}

              <button
                type="submit"
                disabled={guardando}
                className="mt-2 bg-oro text-papel font-lora text-xs tracking-widest py-4 hover:bg-oro/90 transition-colors disabled:opacity-50"
              >
                {guardando ? 'GUARDANDO…' : 'GUARDAR CONTRASEÑA →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
