// Gate de servicio por punto de acceso: qué servicio tiene que tener contratado
// el socio para pasar según el rol de quien escanea. Lógica pura, sin imports,
// para poder chequearla con tsx (servicio-por-rol.check.ts).
//
// - Gimnasio (rol 'porteria'): autoservicio, el escaneo ES el control de
//   acceso. "Cliente Gimnasio" pasa por su categoría (no tiene fila en
//   socio_servicios: el gimnasio es su único servicio, ver
//   20260911000000_rol_cliente_gimnasio).
// - Pileta (rol 'pileta', 20261120000000_rol_pileta): sólo quien pagó la
//   temporada; Secretaría le asigna a mano el servicio "Pileta". Un Cliente
//   Gimnasio no pasa por su categoría.
// - Canchero y Buffet sólo validan "socio al día": sin gate (null).
//
// El servicio se busca por nombre (ILIKE `patron`) y activo en el catálogo,
// para no dejar afuera variantes (Gimnasio Menor, Gimnasio Becado, …).

export interface ServicioRequerido {
  // Para logs y errores.
  nombre:        string
  // Patrón ILIKE sobre servicios_opcionales.nombre.
  patron:        string
  // Lo que ve el socio cuando no tiene el servicio.
  motivo:        string
  // Error de la base al consultar (no es lo mismo que "no tiene el servicio").
  errorConsulta: string
  // Categoría de socio que pasa sin fila en socio_servicios.
  categoriaQuePasa: string | null
}

const SERVICIO_POR_ROL: Record<string, ServicioRequerido> = {
  porteria: {
    nombre:           'Gimnasio',
    patron:           '%gimnasio%',
    motivo:           'No tenés el servicio de Gimnasio contratado. Consultá con Secretaría.',
    errorConsulta:    'No se pudo verificar el servicio de Gimnasio. Probá de nuevo.',
    categoriaQuePasa: 'Cliente Gimnasio',
  },
  pileta: {
    nombre:           'Pileta',
    patron:           '%pileta%',
    motivo:           'No tenés la temporada de Pileta habilitada. Consultá en Secretaría.',
    errorConsulta:    'No se pudo verificar el servicio de Pileta. Probá de nuevo.',
    categoriaQuePasa: null,
  },
}

// null = el rol no exige servicio.
export function servicioRequeridoPorRol(rol: string): ServicioRequerido | null {
  return Object.prototype.hasOwnProperty.call(SERVICIO_POR_ROL, rol) ? SERVICIO_POR_ROL[rol] : null
}

// true = la categoría del socio ya alcanza para pasar el gate.
export function pasaPorCategoria(servicio: ServicioRequerido, categoriaNombre: string | null): boolean {
  return servicio.categoriaQuePasa !== null && categoriaNombre === servicio.categoriaQuePasa
}
