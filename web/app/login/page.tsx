'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !data.user) {
      setError('Email o contraseña incorrectos.')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('rol, roles')
      .eq('id', data.user.id)
      .single()

    const rolesPermitidos = ['subcomision', 'admin', 'secretaria']
    const rolesArray = (profile?.roles as string[]) ?? []

    // Determinar el rol web activo: puede que profiles.rol esté en 'manager' u otro
    // rol móvil si el usuario toggleó en la app. Buscar el primer rol de web en roles[].
    const rolWeb = rolesPermitidos.find(r => rolesArray.includes(r)) ?? profile?.rol ?? ''

    if (!rolWeb || !rolesPermitidos.includes(rolWeb)) {
      await supabase.auth.signOut()
      setError('No tenés acceso al panel de gestión.')
      setLoading(false)
      return
    }

    if (profile?.rol !== rolWeb) {
      await supabase.from('profiles').update({ rol: rolWeb }).eq('id', data.user.id)
    }

    if (rolWeb === 'secretaria') {
      router.replace('/secretaria/socios')
    } else {
      router.replace('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-papel flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <p className="font-lora text-tinta/50 text-xs tracking-widest mb-3">
            UNCAS RUGBY CLUB · EST. 1836
          </p>
          <h1 className="font-playfair italic text-5xl font-black text-tinta leading-tight">
            Uncas Rugby App
          </h1>
          <p className="font-lora text-tinta/50 text-sm mt-3 tracking-wide">
            Panel de Gestión
          </p>
        </div>

        <div className="bg-card border border-gris-claro p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <label className="font-lora text-xs tracking-widest text-tinta/60">
                CORREO ELECTRÓNICO
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="font-lora text-tinta bg-transparent border-b border-tinta/30 py-2 text-sm outline-none focus:border-oro transition-colors"
                placeholder="nombre@uncas.club"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-lora text-xs tracking-widest text-tinta/60">
                CONTRASEÑA
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full font-lora text-tinta bg-transparent border-b border-tinta/30 py-2 text-sm outline-none focus:border-oro transition-colors pr-16"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 font-lora text-xs tracking-widest text-tinta/40 hover:text-tinta transition-colors"
                >
                  {showPassword ? 'OCULTAR' : 'VER'}
                </button>
              </div>
            </div>

            {error && (
              <p className="font-lora text-rojo text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 bg-oro text-papel font-lora text-xs tracking-widest py-4 hover:bg-oro/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'INGRESANDO…' : 'INGRESAR'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
