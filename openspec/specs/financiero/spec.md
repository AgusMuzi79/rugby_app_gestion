# Spec: Gestión Financiera Operativa

## Dominio
`financiero`

## Descripción
Control digitalizado de cobranzas asociadas a eventos deportivos (viajes y tercer tiempo) y gestión de pedidos para eventos de recaudación generados por la Subcomisión. Reemplaza listas en papel y el seguimiento por WhatsApp. No hay integración con sistemas de pago externos; todo el registro es manual.

## Actores
- **Manager** — registra pagos por jugador, carga pedidos, confirma recepción de comprobantes
- **Subcomisión** — genera eventos de recaudación, ve estado de cobranzas y pedidos en tiempo real, cierra eventos manualmente
- **Coordinador** — visualiza el estado de cobranzas de su división

## Modelo de Datos (conceptual)

### Evento Financiero
- `id`, `tipo: viaje | tercer_tiempo | recaudación`, `nombre`, `fecha`, `división`, `creado_por`, `estado: activo | cerrado`

### Cobranza por Jugador
- `evento_id`, `jugador_id`, `estado: Pagado | Pendiente`, `monto`, `forma_de_pago: efectivo | transferencia | otro`, `fecha_pago`

### Pedido (evento de recaudación)
- `id`, `evento_id`, `manager_id`, `detalle: [{concepto, cantidad}]`, `estado: pendiente | confirmado`, `fecha_confirmación`

## User Stories

### US-FIN-01 — Registro de cobranza por jugador (viaje / tercer tiempo)
**Como** Manager  
**Quiero** registrar el estado de pago de cada jugador para un evento  
**Para** tener control claro de quién pagó y quién tiene deuda pendiente

**Criterios de aceptación:**
- Selecciono el evento (viaje o tercer tiempo) de la lista de eventos activos de mi equipo
- Veo la lista completa de jugadores del equipo
- Marco a cada jugador como Pagado o Pendiente
- Al marcar como Pagado ingreso: monto cobrado y forma de pago (efectivo, transferencia, otro)
- Puedo actualizar el estado de un jugador en cualquier momento mientras el evento esté activo
- El estado de cobranza es visible para el Coordinador y la Subcomisión en tiempo real
- Puedo consultar el resumen de cobranza del evento: total cobrado vs. pendiente

### US-FIN-02 — Exportación / resumen de cobranza por evento
**Como** Manager o Subcomisión  
**Quiero** ver un resumen consolidado de la cobranza de un evento  
**Para** tener visión rápida del estado financiero sin revisar jugador por jugador

**Criterios de aceptación:**
- El resumen muestra: total de jugadores, cantidad pagados, cantidad pendientes, monto total cobrado
- Desglosado por forma de pago (efectivo vs. transferencia)
- Consultable por la Subcomisión y el Coordinador desde sus respectivos paneles

### US-FIN-03 — Carga de pedido para evento de recaudación (Subcomisión)
**Como** Manager  
**Quiero** cargar un pedido asociado a un evento de recaudación de la Subcomisión  
**Para** que la Subcomisión tenga trazabilidad del pedido sin seguimiento por WhatsApp

**Criterios de aceptación:**
- Veo los eventos de recaudación activos generados por la Subcomisión
- Cargo el pedido con: concepto y cantidad (puede tener múltiples ítems)
- El pedido queda en estado "pendiente" hasta que confirme la recepción del comprobante
- La Subcomisión ve el pedido en tiempo real desde que es cargado

### US-FIN-04 — Confirmación de recepción de comprobante
**Como** Manager  
**Quiero** marcar un pedido como confirmado al recibir el comprobante de pago  
**Para** cerrar el ciclo del pedido y darle trazabilidad a la Subcomisión

**Criterios de aceptación:**
- Puedo marcar el pedido como "confirmado" indicando que recibí el comprobante
- La Subcomisión ve el cambio de estado en tiempo real
- Un pedido confirmado no puede volver a estado pendiente (solo lectura)

### US-FIN-05 — Creación de evento de recaudación (Subcomisión)
**Como** Subcomisión  
**Quiero** crear un evento de recaudación para que los Managers carguen sus pedidos  
**Para** centralizar la gestión de eventos sin comunicación dispersa

**Criterios de aceptación:**
- Creo el evento con: nombre, descripción, fecha (opcional)
- El evento queda visible para todos los Managers como "activo"
- Puedo cerrar el evento manualmente cuando la recaudación está finalizada
- Los eventos cerrados son de solo lectura (no se pueden cargar nuevos pedidos)

### US-FIN-06 — Alta de evento de viaje / tercer tiempo en el calendario
**Como** Coordinador o Subcomisión  
**Quiero** crear un evento de viaje o tercer tiempo asociado a un partido  
**Para** que el Manager pueda gestionar la cobranza correspondiente

**Criterios de aceptación:**
- El evento de cobranza se puede crear desde el módulo de calendário o desde el módulo financiero
- Se vincula opcionalmente a un partido del calendario
- Al crearlo, queda disponible para el Manager del equipo correspondiente

## Reglas de Negocio
- No hay integración con sistemas de pago externos; todo el registro es manual.
- Los campos de cobranza son: estado (Pagado / Pendiente), monto y forma de pago (efectivo, transferencia, otro).
- Los eventos de recaudación solo los crea la Subcomisión; los Managers solo cargan pedidos sobre ellos.
- Los eventos de recaudación se cierran manualmente por la Subcomisión; no tienen vencimiento automático.
- Un Manager solo gestiona cobranzas y pedidos de los equipos que tiene asignados.
- El Coordinador puede ver el estado de cobranzas de su división pero no puede modificarlo.

## Requerimientos No Funcionales
- La vista de resumen de cobranza debe actualizarse en tiempo real (sin necesidad de recargar).
- Datos de cobranza consultables históricamente por evento.
- Respuesta en menos de 2 segundos para carga y consulta de cobranzas.
