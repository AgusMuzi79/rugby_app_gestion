// Cambios del partido que todavía no se guardaron (panel web).
//
// Copia de la parte de partido de app/lib/marcasSinGuardar.ts
// (`presenciasSinGuardar`, `textoSinGuardar`): antes de cambiar de partido o
// de división se pregunta si hay marcas sin guardar. En el panel también se
// cuenta la mesa (`mesaSinGuardar`, sólo web) para avisar al salir de ese paso
// o de la página. El panel no puede importar de app/: mantener los dos en
// sync. Lógica pura (marcasSinGuardarWeb.check.ts).

// Partido: todos arrancan presentes; `guardado` tiene lo último cargado o
// guardado por jugador (sin entrada = presente).
export function presenciasSinGuardar(
  jugadores: { id: string; presente: boolean }[],
  guardado: Record<string, boolean>,
): number {
  return jugadores.filter(j => j.presente !== (guardado[j.id] ?? true)).length
}

// Mesa: lo que se mandaría (presentes con rol) contra lo guardado del equipo.
export function mesaSinGuardar(
  jugadores: { id: string; presente: boolean; rolEnMesa: string | null }[],
  guardado: Record<string, string>,
): number {
  return jugadores.filter(j => (j.presente ? j.rolEnMesa : null) !== (guardado[j.id] ?? null)).length
}

export function textoSinGuardar(cantidad: number, donde: string): string {
  const marcas = `${cantidad} marca${cantidad === 1 ? '' : 's'}`
  return `Tenés ${marcas} sin guardar${donde ? ` en ${donde}` : ''}.`
}
