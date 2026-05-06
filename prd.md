# APP DE GESTIÓN OPERATIVA DEL CLUB
### Documento de Captura de Requerimientos
**Versión 1.0 | Mayo 2026**

---

## 1. Resumen Ejecutivo

La App de Gestión Operativa del Club es una solución digital interna orientada al cuerpo técnico y organizativo del club. Su propósito es centralizar y digitalizar todos los procesos que hoy se manejan de forma manual (vía WhatsApp, planillas o papel), eliminando la pérdida de información, los retrasos en las comunicaciones y la falta de visibilidad entre áreas.

La aplicación cubre cuatro grandes dominios: gestión de partidos y entrenamientos, seguimiento de jugadores (asistencia, lesiones, fichajes), administración financiera operativa (cobranzas de viajes, tercer tiempo y eventos) y comunicación interna entre los distintos roles del club.

En su primera versión, la app será utilizada exclusivamente por el cuerpo técnico y organizativo, con cuatro roles bien definidos: Subcomisión, Coordinador, Entrenador y Manager.

---

## 2. Usuarios y Roles

| Rol | Descripción | Responsabilidades principales |
|---|---|---|
| **Subcomisión** | Órgano directivo de la rama deportiva. Tiene visión global de todas las divisiones. | Recibe informes agregados (deportivos, financieros, fichajes). Recibe alertas de lesiones. Genera eventos de recaudación. Da de alta usuarios. Envía notificaciones a cualquier rol. |
| **Coordinador** | Responsable de la coordinación de divisiones infantiles y juveniles. | Da de alta eventos deportivos y administrativos. Recibe informes de asistencia con alertas por inasistencias reiteradas. Gestiona el calendario de la división. |
| **Entrenador** | Responsable técnico de cada equipo o división. | Releva asistencia en entrenamientos y partidos. Registra lesiones con detalle y grado. Carga resultado del partido. Administra la mesa de partido. |
| **Manager** | Responsable operativo y administrativo del equipo. | Gestiona cobranzas (viajes, tercer tiempo). Administra fichajes. Carga pedidos de eventos de Subcomisión y confirma recepción de comprobantes. |

---

## 3. Alcance del MVP

### 3.1 Incluido en el MVP

- Gestión de asistencia a entrenamientos y partidos (por Entrenador)
- Registro de lesiones con detalle y grado de severidad
- Carga de resultado de partido
- Control de cobranzas: viajes, tercer tiempo y eventos de Subcomisión
- Gestión de fichajes de jugadores
- Generación y recepción de notificaciones internas entre roles
- Panel de informes para Subcomisión (asistencia, resultados, financiero, fichajes)
- Alta de eventos por Coordinador y Subcomisión
- Carpeta de documentos importantes (protocolos de lesiones, guías operativas)
- Sistema de roles y permisos diferenciados

### 3.2 Fuera del MVP (backlog futuro)

- Portal o acceso para jugadores o familias
- Integración con sistemas de pago externos
- App pública o acceso para socios
- Estadísticas deportivas avanzadas por jugador
- Módulo de comunicación con terceros (árbitros, federaciones)

---

## 4. Épicas y User Stories

### Épica 1: Gestión de Entrenamientos y Partidos

#### Historia 1.1 — Relevo de asistencia a entrenamiento

| | |
|---|---|
| **Como** | Entrenador |
| **Quiero** | registrar la asistencia de los jugadores en cada entrenamiento desde la app |
| **Para** | tener un registro digital y poder identificar jugadores con inasistencias reiteradas sin depender de planillas en papel |
| **Criterios de aceptación** | ✓ Puedo seleccionar la fecha y el equipo antes de tomar asistencia |
| | ✓ Puedo marcar a cada jugador como Presente, Ausente o Justificado |
| | ✓ El sistema resalta automáticamente a jugadores con 4 o más ausencias consecutivas |
| | ✓ El Coordinador recibe una notificación cuando un jugador supera ese umbral |
| | ✓ El registro queda guardado y es consultable históricamente |

#### Historia 1.2 — Asistencia a partido/encuentro

| | |
|---|---|
| **Como** | Entrenador |
| **Quiero** | registrar quiénes asistieron al partido y conformar la mesa de partido desde la app |
| **Para** | tener control de la nómina oficial y cumplir con los requisitos administrativos del encuentro |
| **Criterios de aceptación** | ✓ Puedo seleccionar el partido del calendario y confirmar asistentes |
| | ✓ Puedo armar y guardar la mesa de partido (capitán, suplentes, cuerpo técnico) |
| | ✓ El registro queda vinculado al partido correspondiente |

#### Historia 1.3 — Carga de resultado del partido

| | |
|---|---|
| **Como** | Entrenador |
| **Quiero** | cargar el resultado del partido finalizado (disponible a partir de juveniles) |
| **Para** | que la Subcomisión y el Coordinador tengan acceso inmediato al resultado sin esperar reportes manuales |
| **Criterios de aceptación** | ✓ Solo disponible para divisiones juveniles en adelante |
| | ✓ Puedo ingresar resultado propio y del rival |
| | ✓ El resultado queda visible en el informe de la Subcomisión |
| | ✓ Se registra fecha, rival y cancha del encuentro |

---

### Épica 2: Gestión de Lesiones

#### Historia 2.1 — Registro de lesión

| | |
|---|---|
| **Como** | Entrenador |
| **Quiero** | registrar una lesión de un jugador con detalle y grado de severidad |
| **Para** | que la Subcomisión sea notificada de inmediato y pueda actuar según el protocolo correspondiente |
| **Criterios de aceptación** | ✓ Puedo seleccionar el jugador afectado y la fecha del incidente |
| | ✓ Puedo ingresar descripción de la lesión y asignarle un grado del 1 al 5 |
| | ✓ La Subcomisión recibe una notificación push instantánea al cargar la lesión |
| | ✓ La notificación incluye nombre del jugador, división y grado de lesión |
| | ✓ La lesión queda registrada en el historial del jugador |

#### Historia 2.2 — Acceso a protocolos de lesión

| | |
|---|---|
| **Como** | Subcomisión o Coordinador |
| **Quiero** | acceder a los protocolos de actuación según el grado de lesión desde la app |
| **Para** | poder tomar decisiones correctas y rápidas en el momento del incidente sin depender de documentos físicos |
| **Criterios de aceptación** | ✓ Existe una sección de documentos con los protocolos clasificados por grado de lesión |
| | ✓ Los documentos son accesibles sin conexión (descarga previa) |
| | ✓ Solo roles autorizados pueden editar o subir documentos; todos pueden consultarlos |

---

### Épica 3: Gestión Financiera Operativa

#### Historia 3.1 — Control de cobranzas de viaje / tercer tiempo

| | |
|---|---|
| **Como** | Manager |
| **Quiero** | registrar qué jugadores pagaron el viaje o tercer tiempo asociado a un evento |
| **Para** | tener un control claro de quién abonó y quién tiene deuda pendiente, reemplazando las listas en papel |
| **Criterios de aceptación** | ✓ Puedo seleccionar el evento y ver la lista de jugadores del equipo |
| | ✓ Puedo marcar a cada jugador como Pagado o Pendiente |
| | ✓ Puedo registrar el monto cobrado y la forma de pago por jugador |
| | ✓ El estado de pago es visible para el Coordinador y la Subcomisión |
| | ✓ Se puede exportar o consultar el resumen de cobranza por evento |

#### Historia 3.2 — Gestión de eventos de Subcomisión (pedidos)

| | |
|---|---|
| **Como** | Manager |
| **Quiero** | cargar un pedido asociado a un evento de recaudación generado por la Subcomisión y confirmar recepción del comprobante |
| **Para** | que la Subcomisión tenga trazabilidad de los pedidos y pagos sin necesidad de seguimiento por WhatsApp |
| **Criterios de aceptación** | ✓ Puedo ver los eventos activos generados por la Subcomisión |
| | ✓ Puedo cargar un pedido con detalle (cantidad, concepto) |
| | ✓ Puedo marcar el pedido como confirmado al recibir el comprobante de pago |
| | ✓ La Subcomisión ve en tiempo real el estado de cada pedido |

---

### Épica 4: Gestión de Fichajes

#### Historia 4.1 — Alta de fichaje de jugador

| | |
|---|---|
| **Como** | Manager |
| **Quiero** | registrar el fichaje de un nuevo jugador con sus datos y documentación en la app |
| **Para** | que la Subcomisión pueda ver en tiempo real la cantidad de jugadores fichados por división sin depender de reportes manuales |
| **Criterios de aceptación** | ✓ Puedo ingresar los datos del jugador (nombre, DNI, fecha de nacimiento, división) |
| | ✓ Puedo adjuntar documentación escaneada (DNI, ficha médica, etc.) |
| | ✓ El fichaje queda asociado a la división y aparece en el informe de la Subcomisión |
| | ✓ La Subcomisión recibe notificación cuando se registra un nuevo fichaje |

---

### Épica 5: Comunicación Interna y Notificaciones

#### Historia 5.1 — Envío de notificación interna

| | |
|---|---|
| **Como** | Subcomisión |
| **Quiero** | enviar notificaciones internas a uno o varios roles según elija |
| **Para** | comunicar avisos, instrucciones o alertas de forma dirigida sin usar canales externos como WhatsApp |
| **Criterios de aceptación** | ✓ Puedo redactar un mensaje y seleccionar el/los destinatarios por rol o individualmente |
| | ✓ El destinatario recibe una notificación push en la app |
| | ✓ Las notificaciones quedan en un historial consultable |
| | ✓ Puedo enviar notificaciones masivas a todos los de un rol |

---

### Épica 6: Informes para la Subcomisión

#### Historia 6.1 — Dashboard de informes

| | |
|---|---|
| **Como** | Subcomisión |
| **Quiero** | ver un panel con informes actualizados de asistencia, resultados deportivos, fichajes y cobranzas por división |
| **Para** | tener visibilidad global del club sin tener que consultar a cada entrenador o manager individualmente |
| **Criterios de aceptación** | ✓ El panel muestra datos por división seleccionable |
| | ✓ El informe de asistencia resalta divisiones con alto nivel de ausencias |
| | ✓ El informe de fichajes muestra cantidad total por división |
| | ✓ El informe financiero muestra estado de cobranzas (cobrado vs pendiente) por evento |
| | ✓ Los informes se actualizan automáticamente a medida que Entrenadores y Managers cargan datos |

---

## 5. Requerimientos No Funcionales

### Plataforma
- Aplicación móvil (iOS y Android). En primera instancia puede ser una PWA o app híbrida.
- Acceso también desde navegador web (responsive) para uso en escritorio.

### Seguridad y Accesos
- Autenticación por usuario y contraseña. Considerar autenticación de dos factores para la Subcomisión.
- Sistema de roles y permisos: cada rol solo ve y puede hacer lo que le corresponde.
- Los datos de jugadores (DNI, documentación) deben almacenarse de forma segura.

### Disponibilidad
- La app debe funcionar en modo offline para funciones críticas (toma de asistencia, registro de lesión) con sincronización posterior cuando hay conexión.
- Alta disponibilidad esperada en horarios de entrenamiento y partido (mañana y tarde/noche).

### Performance
- Respuesta de la app en menos de 2 segundos para operaciones comunes.
- Notificaciones push en tiempo real (menos de 30 segundos de latencia).

### Escalabilidad
- La app debe soportar ~60 usuarios activos iniciales sin límite fijo de crecimiento.
- Arquitectura que permita sumar nuevas divisiones o roles sin rediseño mayor.

---

## 6. Restricciones y Supuestos

### Supuestos
- Cada entrenador y manager tiene un smartphone con acceso a internet (al menos ocasional).
- La Subcomisión actúa como administrador del sistema y gestiona el alta y baja de usuarios.
- Los jugadores no tienen acceso a la app en esta versión.
- Los eventos de recaudación son creados por la Subcomisión; los Managers solo responden a ellos.
- El club cuenta con 17 planteles activos (infantiles, juveniles, plantel superior, femenino y rugby mixed).
- La escala de gravedad de lesiones es fija del 1 al 5, definida internamente por el club. No requiere configuración desde la app.
- Los fichajes son cargados y confirmados directamente por el Manager, sin flujo de aprobación adicional.
- Los eventos de recaudación se cierran manualmente por la Subcomisión; no tienen fecha de vencimiento automática.
- La elección de stack tecnológico queda a criterio del arquitecto técnico del proyecto.

### Restricciones
- La app debe soportar un mínimo de ~60 usuarios activos (34 entrenadores + 17 managers + 5 coordinadores + 8 subcomisión) sin límite fijo de crecimiento.
- No hay integración con sistemas de pago en esta versión; las cobranzas registran monto, forma de pago y estado de forma manual.
- Los documentos de protocolos deben ser cargados manualmente por la Subcomisión.
- Presupuesto y tiempo de desarrollo a definir con el equipo técnico.

---

## 7. Decisiones Tomadas

Las siguientes preguntas fueron respondidas y quedan cerradas como definiciones del proyecto:

### Escala y usuarios
17 planteles activos. Aproximadamente 60 usuarios iniciales (2 entrenadores + 1 manager por división, 5 coordinadores, 8 subcomisión). Sin límite fijo de usuarios.

### Lesiones
Escala fija del 1 al 5, definida por el club. No editable desde la app.

### Cobranzas
Se registran: estado (pagado / pendiente), monto y forma de pago (efectivo, transferencia, etc.).

### Administración del sistema
La Subcomisión gestiona el alta y baja de todos los usuarios directamente desde la app. No hay perfil técnico separado.

### Fichajes
El Manager tiene autoridad directa. No requiere aprobación de Coordinador ni Subcomisión.

### Eventos de recaudación
Se cierran manualmente por la Subcomisión. No tienen vencimiento automático.

### Stack tecnológico
A definir por el arquitecto técnico del proyecto. Sin restricciones desde el lado del negocio.

---

*Documento generado con Claude — Anthropic | Mayo 2026*
