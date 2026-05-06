# Spec: Informes y Dashboard de la Subcomisión

## Dominio
`informes`

## Descripción
Panel centralizado de informes para la Subcomisión, con visibilidad global del club: asistencia, resultados deportivos, fichajes y estado financiero por división. Los datos se actualizan automáticamente a medida que los Entrenadores y Managers cargan información. Es el principal punto de consulta de la Subcomisión para la toma de decisiones.

## Actores
- **Subcomisión** — usuario principal del dashboard, visualiza todos los dominios
- **Coordinador** — accede a informes de su propia división (subconjunto del dashboard global)

## Áreas del Dashboard

| Área | Datos mostrados | Fuente |
|---|---|---|
| Asistencia | Porcentaje de asistencia por división, alertas de ausencias reiteradas | Módulo entrenamientos-partidos |
| Resultados deportivos | Últimos resultados por división (juveniles en adelante) | Módulo entrenamientos-partidos |
| Fichajes | Total de jugadores fichados por división, últimas altas | Módulo fichajes |
| Financiero | Estado de cobranzas por evento: cobrado vs. pendiente | Módulo financiero |
| Lesiones | Lesiones activas o recientes por división | Módulo lesiones |

## User Stories

### US-INF-01 — Dashboard global de la Subcomisión
**Como** Subcomisión  
**Quiero** ver un panel con informes actualizados de todos los dominios por división  
**Para** tener visibilidad global del club sin consultar individualmente a cada entrenador o manager

**Criterios de aceptación:**
- El panel permite seleccionar una división específica o ver vista global (todas las divisiones)
- Los datos se actualizan automáticamente al cargar la vista (no requiere acción manual)
- Cada área del dashboard tiene un indicador visual de estado (ej. alertas en rojo si hay problemas)
- Accesible desde el menú principal de la Subcomisión

### US-INF-02 — Informe de asistencia
**Como** Subcomisión  
**Quiero** ver el estado de asistencia por división  
**Para** identificar divisiones o jugadores con bajo nivel de asistencia

**Criterios de aceptación:**
- Muestra porcentaje de asistencia por división en el período reciente
- Resalta visualmente divisiones con alto nivel de ausencias (definir umbral)
- Permite ver el detalle: lista de jugadores con ausencias reiteradas
- Datos actualizados a medida que los Entrenadores cargan asistencia

### US-INF-03 — Informe de resultados deportivos
**Como** Subcomisión  
**Quiero** ver los resultados de los últimos partidos por división  
**Para** tener seguimiento del rendimiento deportivo sin esperar reportes manuales

**Criterios de aceptación:**
- Solo muestra divisiones juveniles en adelante (donde hay marcador)
- Muestra: división, fecha del partido, rival, resultado (propio vs. rival)
- Ordenado por fecha descendente (más reciente primero)
- Los resultados aparecen en el dashboard en cuanto el Entrenador los carga

### US-INF-04 — Informe de fichajes
**Como** Subcomisión  
**Quiero** ver la cantidad de jugadores fichados por división  
**Para** tener visión del crecimiento de la plantilla sin depender de reportes manuales

**Criterios de aceptación:**
- Muestra total de fichajes activos por división
- Lista de los últimos N fichajes con: nombre, división, fecha de alta
- Indicador de documentación incompleta si aplica
- Datos actualizados en tiempo real a medida que los Managers cargan fichajes

### US-INF-05 — Informe financiero
**Como** Subcomisión  
**Quiero** ver el estado de cobranzas por evento  
**Para** tener visión del flujo financiero operativo del club

**Criterios de aceptación:**
- Muestra lista de eventos activos con su estado de cobranza: total cobrado vs. pendiente
- Desglosado por división y por tipo de evento (viaje, tercer tiempo, recaudación)
- Permite ver el detalle de quién pagó y quién tiene deuda en cada evento
- Datos actualizados en tiempo real a medida que los Managers registran pagos

### US-INF-06 — Informe de lesiones recientes
**Como** Subcomisión  
**Quiero** ver un resumen de las lesiones registradas recientemente  
**Para** tener contexto del estado físico del plantel por división

**Criterios de aceptación:**
- Lista de lesiones de los últimos 30 días (o período configurable)
- Muestra: jugador, división, grado, fecha
- Ordenado por grado descendente (más graves primero)
- Desde cada lesión puedo ir al historial del jugador

### US-INF-07 — Informe de división para el Coordinador
**Como** Coordinador  
**Quiero** ver un panel de informes de mi propia división  
**Para** tener visibilidad operativa de mi área sin acceso al panel global

**Criterios de aceptación:**
- Muestra: asistencia, resultados (si aplica) y estado de cobranzas de su división
- No tiene acceso a datos de otras divisiones
- Recibe alertas de inasistencias reiteradas destacadas en su panel

## Reglas de Negocio
- La Subcomisión ve todas las divisiones; el Coordinador solo ve la suya.
- Los datos son de solo lectura en el módulo de informes; las modificaciones se hacen desde los módulos correspondientes.
- Los informes no requieren generación manual; se actualizan en tiempo real al cargar datos.
- La distinción infantil/juvenil aplica solo al informe de resultados (los infantiles no tienen marcador).

## Requerimientos No Funcionales
- La carga inicial del dashboard debe ser menor a 2 segundos.
- Los datos deben reflejar el estado actual sin necesidad de refrescar manualmente.
- El dashboard debe ser funcional en dispositivos móviles y navegador desktop (responsive).
- Para grandes volúmenes de datos (ej. historial de resultados), usar paginación o carga lazy.
