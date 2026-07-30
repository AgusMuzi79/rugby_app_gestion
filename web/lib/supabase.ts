import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
