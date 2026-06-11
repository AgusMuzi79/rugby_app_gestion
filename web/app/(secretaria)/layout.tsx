'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SidebarSecretaria from '@/components/SidebarSecretaria'

interface UserProfile {
  nombre: string
  rol: string
}

export default function SecretariaLayout({ children }: { children: React.ReactNode }) {
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

      if (!data || !['secretaria', 'admin'].includes(data.rol)) {
        await supabase.auth.signOut()
        router.replace('/login')
        return
      }

      setProfile(data)
      setLoading(false)
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-papel flex items-center justify-center">
        <p className="font-lora text-tinta/50 tracking-widest text-sm">CARGANDO…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-papel">
      <SidebarSecretaria nombre={profile?.nombre} rol={profile?.rol} />
      <main className="flex-1 ml-56 p-8 min-h-screen">{children}</main>
    </div>
  )
}
