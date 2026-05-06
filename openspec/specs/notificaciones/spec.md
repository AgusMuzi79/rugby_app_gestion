# Spec: Comunicación Interna y Notificaciones

## Dominio
`notificaciones`

## Descripción
Sistema de notificaciones internas que permite comunicación dirigida entre roles, reemplazando el uso de canales externos como WhatsApp. Incluye dos tipos: notificaciones manuales (enviadas intencionalmente por un usuario) y notificaciones automáticas del sistema (disparadas por eventos como lesiones, fichajes, inasistencias).

## Actores
- **Subcomisión** — único rol que puede enviar notificaciones manuales a cualquier rol o usuario
- **Coordinador** — recibe notificaciones de inasistencias reiteradas y eventos relevantes
- **Entrenador** — recibe notificaciones de eventos del calendario y comunicados de la Subcomisión
- **Manager** — recibe notificaciones de eventos de recaudación y comunicados de la Subcomisión
- **Sistema** — genera notificaciones automáticas por eventos (lesiones, inasistencias, fichajes)

## Tipos de Notificación

| Tipo | Origen | Destinatario | Disparador |
|---|---|---|---|
| Manual | Subcomisión | Uno o varios roles / usuarios | Acción explícita del usuario |
| Lesión registrada | Sistema | Subcomisión | Entrenador registra una lesión |
| Inasistencia reiterada | Sistema | Coordinador | Jugador supera umbral (4 ausencias consecutivas) |
| Nuevo fichaje | Sistema | Subcomisión | Manager da de alta un fichaje |
| Evento de recaudación creado | Sistema | Managers de la división | Subcomisión crea evento de recaudación |

## Modelo de Datos (conceptual)

### Notificación
- `id`, `tipo: manual | sistema`, `origen_usuario_id (nullable)`, `título`, `mensaje`, `destinatarios: [usuario_id]`, `fecha_envío`, `evento_referencia_id (nullable)`

### Estado de Lectura
- `notificación_id`, `usuario_id`, `leída: bool`, `fecha_lectura`

## User Stories

### US-NOT-01 — Envío de notificación interna (Subcomisión)
**Como** Subcomisión  
**Quiero** enviar notificaciones internas a uno o varios roles o usuarios  
**Para** comunicar avisos, instrucciones o alertas sin usar canales externos

**Criterios de aceptación:**
- Redacto un título y un mensaje de cuerpo libre
- Selecciono destinatarios: por rol completo (ej. "todos los Managers") o individualmente
- El destinatario recibe una notificación push en la app (< 30 segundos)
- Puedo enviar la misma notificación a múltiples roles simultáneamente
- Las notificaciones quedan en el historial del destinatario con estado leída/no leída

### US-NOT-02 — Recepción y lectura de notificaciones
**Como** cualquier usuario  
**Quiero** ver mis notificaciones dentro de la app  
**Para** no perder comunicados ni alertas importantes

**Criterios de aceptación:**
- Existe una sección de notificaciones en la app con todas las recibidas
- Las notificaciones no leídas se destacan visualmente (badge / indicador)
- Puedo marcar una notificación como leída al abrirla
- El historial es consultable con scroll (paginado)
- Las notificaciones muestran: título, mensaje, fecha, origen (rol o sistema)

### US-NOT-03 — Notificación automática por lesión
**Como** Sistema  
**Quiero** enviar una notificación push a la Subcomisión cuando un Entrenador registra una lesión  
**Para** que la Subcomisión pueda actuar según el protocolo sin demora

**Criterios de aceptación:**
- La notificación incluye: nombre del jugador, división y grado de lesión
- Latencia máxima de 30 segundos desde el registro de la lesión
- Si el registro fue offline, la notificación se envía al sincronizar

### US-NOT-04 — Notificación automática por inasistencia reiterada
**Como** Sistema  
**Quiero** notificar al Coordinador cuando un jugador supera el umbral de ausencias  
**Para** que el Coordinador pueda tomar acciones preventivas

**Criterios de aceptación:**
- Disparada cuando un jugador acumula 4 o más ausencias consecutivas
- La notificación incluye: nombre del jugador, división, cantidad de ausencias consecutivas
- Se envía una sola vez por "racha" (no se repite en cada ausencia adicional de la misma racha)
- El Coordinador puede ver el detalle de asistencia desde la notificación

### US-NOT-05 — Notificación automática por nuevo fichaje
**Como** Sistema  
**Quiero** notificar a la Subcomisión cuando un Manager registra un nuevo fichaje  
**Para** mantener a la Subcomisión informada sin que el Manager tenga que avisar manualmente

**Criterios de aceptación:**
- La notificación incluye: nombre del jugador fichado, división
- Latencia máxima de 30 segundos

### US-NOT-06 — Notificación por nuevo evento de recaudación
**Como** Sistema  
**Quiero** notificar a los Managers relevantes cuando la Subcomisión crea un evento de recaudación  
**Para** que los Managers estén al tanto y puedan cargar sus pedidos

**Criterios de aceptación:**
- Notifica a todos los Managers de las divisiones alcanzadas por el evento
- Incluye: nombre del evento, descripción breve

## Reglas de Negocio
- Solo la Subcomisión puede enviar notificaciones manuales.
- Las notificaciones del sistema son automáticas e inmediatas (o al sincronizar si hay modo offline).
- No se puede responder a una notificación; son unidireccionales.
- El historial de notificaciones se mantiene de forma indefinida (no se eliminan).
- La app muestra un indicador (badge) con el conteo de notificaciones no leídas.

## Requerimientos No Funcionales
- Notificaciones push con latencia máxima de 30 segundos.
- El usuario debe poder recibir notificaciones aunque la app esté en segundo plano (push nativo de iOS/Android o service worker en PWA).
- El historial de notificaciones debe ser paginado para no degradar el rendimiento con grandes volúmenes.
