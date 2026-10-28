// Datos de NUVIX que muestra el rol Secretaría en la app (auditoría UX
// secretaría, T10). Lógica pura, verificada en secretariaNuvix.check.ts.
//
// - Servicios del socio: el importe real del vínculo (`socio_servicios.importe`,
//   lo liquida NUVIX) manda sobre el precio de catálogo
//   (`servicios_opcionales.monto_mensual`, sólo referencia). Mismo criterio que
//   el panel web.
// - Inicio: en vez de los pagos cargados en la app (`pagos_socios`), se muestra
//   la fecha del último reporte de deuda aplicado (`importaciones_deuda`).

export interface ServicioCatalogo {
  id:            string
  monto_mensual: number
}

export interface VinculoServicio {
  servicio_id: string
  importe:     number | null
}

/** Monto mensual de un servicio: el del vínculo si existe y trae importe, si no el de catálogo. */
export function montoServicio(servicio: ServicioCatalogo, vinculo: VinculoServicio | undefined): number {
  return vinculo?.importe ?? servicio.monto_mensual
}

/** Suma de los servicios vinculados al socio que están en el catálogo activo. */
export function montoServiciosSocio(catalogo: ServicioCatalogo[], vinculos: VinculoServicio[]): number {
  const porServicio = new Map(vinculos.map(v => [v.servicio_id, v]))
  return catalogo
    .filter(s => porServicio.has(s.id))
    .reduce((sum, s) => sum + montoServicio(s, porServicio.get(s.id)), 0)
}

export interface ReporteDeuda {
  fecha_corte: string   // date (YYYY-MM-DD)
  created_at:  string   // timestamptz
}

function ddmmaaaa(isoFecha: string): string {
  const [y, m, d] = isoFecha.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Argentina no tiene horario de verano: UTC-3 fijo. Así el día de importación
// no depende de la zona horaria del teléfono.
// null si el timestamp no es válido (toISOString tiraría RangeError en el render).
function fechaArgentina(isoTimestamp: string): string | null {
  const t = new Date(isoTimestamp).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

/** Texto del último reporte de deuda aplicado (el que define el semáforo actual). */
export function textoUltimoReporte(reporte: ReporteDeuda | null): string {
  if (!reporte) return 'Todavía no se importó ningún reporte de deuda.'
  const datos = `Datos al ${ddmmaaaa(reporte.fecha_corte)}`
  const importado = fechaArgentina(reporte.created_at)
  return importado ? `${datos} · importado el ${ddmmaaaa(importado)}` : datos
}
