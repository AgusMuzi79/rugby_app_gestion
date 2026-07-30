import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { Database } from './database.types'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

const isTunnel = supabaseUrl.includes('loca.lt') || supabaseUrl.includes('ngrok')

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: isTunnel ? { 'bypass-tunnel-reminder': 'true' } : {},
  },
})

// PostgREST devuelve máximo 1000 filas por default — usar para listas que pueden superarlo
// (socios, profiles). Recibe un builder de query parametrizado por rango.
export async function selectAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000
): Promise<T[]> {
  let all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) throw error
    const page = data ?? []
    all = all.concat(page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
}

// Pausa el auto-refresh del token cuando la app pasa a background
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
