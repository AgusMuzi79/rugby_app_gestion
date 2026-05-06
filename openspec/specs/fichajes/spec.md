# Spec: Gestión de Fichajes

## Dominio
`fichajes`

## Descripción
Registro digital de nuevos jugadores fichados por equipo, incluyendo datos personales y documentación escaneada. El Manager tiene autoridad directa sobre el fichaje; no requiere flujo de aprobación. La Subcomisión recibe notificación por cada nuevo fichaje y tiene visibilidad global del total por división.

## Actores
- **Manager** — registra el fichaje del nuevo jugador, adjunta documentación
- **Subcomisión** — recibe notificación de nuevos fichajes, visualiza totales por división en el informe global
- **Coordinador** — visualiza los fichajes de su división (sin capacidad de carga)

## Modelo de Datos (conceptual)

### Jugador
- `id`, `nombre_completo`, `dni`, `fecha_nacimiento`, `división`, `equipo`, `activo: bool`

### Fichaje
- `id`, `jugador_id`, `fecha_fichaje`, `registrado_por (manager_id)`, `documentos: [archivo_url]`

### Documento de Fichaje
- `id`, `fichaje_id`, `tipo: dni | ficha_médica | otro`, `archivo_url`

## User Stories

### US-FICH-01 — Alta de fichaje de jugador
**Como** Manager  
**Quiero** registrar el fichaje de un nuevo jugador con sus datos y documentación  
**Para** que la Subcomisión vea en tiempo real los jugadores fichados por división

**Criterios de aceptación:**
- Ingreso los datos del jugador: nombre completo, DNI, fecha de nacimiento, división
- Adjunto documentación escaneada: DNI, ficha médica y otros documentos según corresponda
- El fichaje queda asociado a la división del Manager
- La Subcomisión recibe una notificación push al registrar el nuevo fichaje
- El jugador aparece en el informe de fichajes de la Subcomisión de inmediato
- El Manager solo puede fichar jugadores para sus propios equipos

### US-FICH-02 — Visualización de fichajes por división (Manager/Coordinador)
**Como** Manager o Coordinador  
**Quiero** ver la lista de jugadores fichados en mi división  
**Para** tener un registro actualizado de la plantilla

**Criterios de aceptación:**
- Lista de jugadores fichados con: nombre, DNI, fecha de fichaje, estado de documentación
- Indicador visual si falta documentación requerida
- Ordenable por fecha de fichaje o nombre

### US-FICH-03 — Detalle de fichaje y documentación
**Como** Manager  
**Quiero** acceder al detalle de un fichaje para ver o agregar documentación  
**Para** completar el legajo del jugador en cualquier momento

**Criterios de aceptación:**
- Puedo ver todos los documentos adjuntados al fichaje
- Puedo agregar nuevos documentos a un fichaje existente
- Puedo ver los datos del jugador y editarlos si hay errores

## Reglas de Negocio
- El Manager tiene autoridad directa sobre el fichaje; no requiere aprobación de Coordinador ni Subcomisión.
- Los datos mínimos requeridos para registrar un fichaje son: nombre completo, DNI, fecha de nacimiento y división.
- La documentación es adjuntable pero no bloquea el alta del fichaje (puede completarse después).
- La Subcomisión recibe notificación push por cada nuevo fichaje registrado.
- Los jugadores fichados son internos al sistema; no tienen acceso a la app.
- Un jugador no puede tener dos fichajes activos en la misma división.

## Requerimientos No Funcionales
- Los documentos (DNI, ficha médica) deben almacenarse de forma segura con acceso restringido.
- El tamaño máximo por documento a definir en implementación (recomendado: 10MB por archivo).
- Formatos soportados: PDF, JPG, PNG.
- La notificación push a la Subcomisión debe llegar en menos de 30 segundos.
