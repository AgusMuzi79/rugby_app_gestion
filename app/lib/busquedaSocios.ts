// Búsqueda en la lista de socios del rol Secretaría en la app (auditoría UX
// secretaría, T17). Mismas reglas que el panel web (web/lib/busquedaSocios.ts;
// no se importa entre app y web): sin tildes ni mayúsculas, cada palabra tiene
// que aparecer en algún campo, en cualquier orden. Lógica pura, verificada en
// busquedaSocios.check.ts.
//
// La secretaria conoce a los socios por el nombre del padrón de NUVIX
// (`socios.nombre_padron`); el socio puede cambiar `profiles.nombre` en Mi
// perfil. Se muestra el del padrón y se busca por los dos.

export interface CamposBusqueda {
  nombre:       string
  nombreApp:    string
  dni?:         string
  numero_socio: string
}

/** Minúsculas y sin tildes, para comparar "García" con "garcia". */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Cada palabra de la búsqueda tiene que aparecer en algún campo (en cualquier orden). */
export function coincideBusqueda(busqueda: string, s: CamposBusqueda): boolean {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const texto = normalizar([s.nombre, s.nombreApp, s.dni ?? '', s.numero_socio].join(' '))
  return palabras.every(p => texto.includes(p))
}

/** Nombre a mostrar (padrón, o el de la app si el padrón no lo trae) y nombre de la app. */
export function nombresSocio(
  nombrePadron: string | null | undefined,
  perfil: { nombre: string | null } | null | undefined,
): { nombre: string; nombreApp: string } {
  const app = perfil?.nombre?.trim() ?? ''
  const padron = nombrePadron?.trim() ?? ''
  return { nombre: padron || app || '—', nombreApp: app }
}

/** Filtro de estado ('todos' = sin filtro) y búsqueda, juntos (igual que Socios en el web). */
export function filtrarSocios<T extends CamposBusqueda & { estado: string }>(
  socios: T[],
  filtro: string,
  busqueda: string,
): T[] {
  return socios
    .filter(s => filtro === 'todos' || s.estado === filtro)
    .filter(s => coincideBusqueda(busqueda, s))
}
