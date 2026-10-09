// Pure logic for the admin Sistema screen. No react-native / supabase imports
// so it can be checked in Node (see sistemaAdmin.check.ts).

// `null` means the section could not be read (RLS or network error); the
// screen shows it as unavailable instead of as empty.
export function seccionOVacia<T>(res: { data: T[] | null; error: unknown }): T[] | null {
  if (res.error) return null
  return res.data ?? []
}

export function conteoOVacio(res: { count: number | null; error: unknown }): number | null {
  if (res.error) return null
  return res.count ?? 0
}
