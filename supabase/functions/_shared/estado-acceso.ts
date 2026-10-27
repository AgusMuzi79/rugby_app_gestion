// Estado del socio en la puerta (socios-qr `validate` y `validate-dni`).
//
// `validate` nunca miraba `socios.estado`: un socio dado de baja (el import lo
// pasa a `inactivo` y banea la cuenta) seguía saliendo verde "AL DÍA" en el
// lector. Lógica pura (estado-acceso.check.ts).

export const MOTIVO_SOCIO_BAJA = 'Socio dado de baja. Consultá en Secretaría.'

// null = el estado no impide el acceso.
export function motivoRechazoPorEstado(estado: string | null | undefined): string | null {
  return estado === 'inactivo' ? MOTIVO_SOCIO_BAJA : null
}
