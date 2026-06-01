# APP DE GESTIÓN DEL CLUB — DOCUMENTO DE REQUERIMIENTOS
### Integración: Gestión Operativa + Módulo de Socios
**Versión 2.1 | Mayo 2026**

---

## 1. Resumen Ejecutivo

La App de Gestión del Club es una plataforma unificada que centraliza dos grandes dominios: la gestión operativa interna del cuerpo técnico y la relación institucional con los socios del club.

La **v1** (ya especificada e implementada) cubre los procesos del cuerpo técnico: asistencia, lesiones, fichajes, cobranzas operativas e informes. La **v2** incorpora el módulo de socios: carnet digital, pago de cuotas, control de acceso en portería y comunicación institucional.

Ambos módulos conviven en una sola app con roles diferenciados. Un mismo usuario puede tener más de un rol (por ejemplo, un jugador que también es socio). La base de datos y la autenticación son compartidas.

---

## 2. Usuarios y Roles

| Rol | Descripción | Módulo |
|---|---|---|
| **Subcomisión** | Órgano directivo. Visión global de todas las divisiones y del estado institucional. | Operativo |
| **Coordinador** | Gestiona calendario y divisiones infantiles/juveniles. | Operativo |
| **Entrenador** | Toma asistencia, registra lesiones, carga resultados. | Operativo |
| **Manager** | Gestiona cobranzas y fichajes de su equipo. | Operativo |
| **Secretaría** | Administra socios: altas, pagos manuales, categorías, noticias. | Socios |
| **Portería** | Escanea carnets QR para validar acceso al club. | Socios |
| **Socio** | Usuario final. Accede a su carnet digital, paga cuotas y recibe noticias. | Socios |

> **Nota:** Los jugadores no tienen acceso a la app en rol de "jugador". Sin embargo, si son socios del club, acceden con el rol Socio. Todo jugador es socio, pero no todo socio es jugador.

---

## 3. Alcance del MVP

### 3.1 MVP v1 — Gestión Operativa (implementado)

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

### 3.2 MVP v2 — Módulo de Socios

- Carnet digital con QR dinámico tipo TOTP (funciona offline)
- Foto de perfil obligatoria con validación de rostro via IA
- Pago de cuotas integrado con Mercado Pago
- Registro manual de pago en ventanilla (Secretaría)
- Generación y envío automático de comprobante PDF por email
- Gestión de categorías y montos de cuota desde Secretaría
- Alta de socios nuevos por Secretaría
- Muro de noticias con filtrado por deporte/categoría
- Notificaciones push institucionales
- Control de acceso en portería via escaneo de QR
- Sesión única por dispositivo para el rol Socio
- Estado de morosidad visible en el carnet (bloqueado si adeuda)

### 3.3 Fuera del MVP (backlog futuro)

- Reglas automáticas de recargo por morosidad (pendiente de definición por la comisión directiva)
- Portal web para socios
- Estadísticas deportivas por jugador/socio
- Integración con sistemas de federación
- Recuperación de cuenta al cambiar de dispositivo (flujo manual por ahora)

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

### Épica 7: Identidad Digital del Socio

#### Historia 7.1 — Carnet digital con QR dinámico

| | |
|---|---|
| **Como** | Socio |
| **Quiero** | ver mi carnet digital en la app con un código QR que se actualiza automáticamente |
| **Para** | identificarme en portería sin necesidad de carnet físico ni conexión a internet |
| **Criterios de aceptación** | ✓ El QR es de tipo TOTP: se regenera cada 30 segundos |
| | ✓ El carnet funciona sin conexión a internet en el dispositivo del socio |
| | ✓ El carnet muestra nombre, foto, categoría y estado de membresía |
| | ✓ Si el socio está moroso, el carnet se muestra visualmente bloqueado |
| | ✓ La sesión está vinculada a un único dispositivo; no puede haber dos sesiones activas simultáneas |

#### Historia 7.2 — Foto de perfil con validación de rostro

| | |
|---|---|
| **Como** | Socio |
| **Quiero** | subir una foto de perfil que aparezca en mi carnet |
| **Para** | que mi identidad sea verificable visualmente en portería |
| **Criterios de aceptación** | ✓ La foto es obligatoria para completar el perfil |
| | ✓ El sistema valida automáticamente que la imagen contenga un rostro humano real (via IA) |
| | ✓ Se rechaza cualquier imagen que no sea un rostro (logos, objetos, imágenes de otra persona, etc.) |
| | ✓ El socio recibe un mensaje claro si la foto es rechazada y puede reintentarlo |

#### Historia 7.3 — Validación de acceso en Portería

| | |
|---|---|
| **Como** | Personal de Portería |
| **Quiero** | escanear el QR del carnet de un socio para validar su acceso al club |
| **Para** | controlar el ingreso de forma rápida y segura sin necesidad de verificación manual |
| **Criterios de aceptación** | ✓ La app de portería lee el QR y muestra el resultado de validación en menos de 2 segundos |
| | ✓ Muestra nombre, foto y estado del socio (habilitado / moroso / inactivo) |
| | ✓ El sistema detecta QRs vencidos o inválidos y alerta al operador |
| | ✓ Funciona con conectividad limitada (no requiere conexión perfecta) |
| | ✓ Portería no tiene acceso a datos financieros ni documentación del socio |

---

### Épica 8: Gestión de Cuotas y Pagos

#### Historia 8.1 — Pago de cuota desde la app

| | |
|---|---|
| **Como** | Socio |
| **Quiero** | pagar mi cuota mensual desde la app |
| **Para** | regularizar mi situación sin tener que ir al club en persona |
| **Criterios de aceptación** | ✓ Puedo ver el monto a pagar según mi categoría |
| | ✓ El pago se procesa via Mercado Pago (tarjeta, transferencia, billetera) |
| | ✓ Al completar el pago, recibo un comprobante PDF por email automáticamente |
| | ✓ El comprobante también queda disponible para descarga desde la app |
| | ✓ Mi estado de membresía se actualiza automáticamente al confirmar el pago |

#### Historia 8.2 — Registro manual de pago en ventanilla

| | |
|---|---|
| **Como** | Secretaría |
| **Quiero** | registrar un pago realizado en efectivo o transferencia por ventanilla |
| **Para** | que el estado del socio quede actualizado en el sistema aunque no haya pagado por la app |
| **Criterios de aceptación** | ✓ Puedo buscar un socio y registrar un pago manual con monto, fecha y forma de pago |
| | ✓ Se genera el comprobante PDF y se envía por email al socio |
| | ✓ El estado de morosidad del socio se actualiza inmediatamente |
| | ✓ Queda registrado que el pago fue ingresado manualmente por Secretaría |

#### Historia 8.3 — Gestión de categorías y montos de cuota

| | |
|---|---|
| **Como** | Secretaría |
| **Quiero** | administrar las categorías de socios y sus montos de cuota desde la app |
| **Para** | actualizar los precios cuando la comisión directiva lo decida sin necesidad de intervención técnica |
| **Criterios de aceptación** | ✓ Puedo ver la lista de categorías activas con sus montos vigentes |
| | ✓ Puedo crear, editar y desactivar categorías |
| | ✓ Cada socio tiene asignada una categoría que determina su cuota mensual |
| | ✓ Los cambios de monto aplican al próximo período, no retroactivamente |

---

### Épica 9: Administración de Socios

#### Historia 9.1 — Alta de nuevo socio

| | |
|---|---|
| **Como** | Secretaría |
| **Quiero** | dar de alta a un nuevo socio en el sistema |
| **Para** | que pueda acceder a la app, obtener su carnet y pagar su cuota |
| **Criterios de aceptación** | ✓ Puedo ingresar datos básicos: nombre, DNI, fecha de nacimiento, email, categoría |
| | ✓ El sistema envía un email de invitación al socio para que complete su perfil y suba su foto |
| | ✓ El socio queda en estado "pendiente" hasta completar su foto de perfil validada |
| | ✓ Una vez completado, el carnet queda activo |

#### Historia 9.2 — Consulta de estado de socios

| | |
|---|---|
| **Como** | Secretaría |
| **Quiero** | ver el listado de socios con su estado de membresía y deuda |
| **Para** | identificar rápidamente quiénes están al día y quiénes tienen cuotas pendientes |
| **Criterios de aceptación** | ✓ Puedo filtrar socios por estado (al día, moroso, inactivo) y por categoría |
| | ✓ Veo el historial de pagos de cada socio |
| | ✓ Puedo buscar socios por nombre o DNI |

---

### Épica 10: Comunicación Institucional

#### Historia 10.1 — Muro de noticias

| | |
|---|---|
| **Como** | Socio |
| **Quiero** | ver las novedades del club en un feed de noticias dentro de la app |
| **Para** | estar informado sobre eventos, partidos, actividades y comunicados sin depender de grupos de WhatsApp |
| **Criterios de aceptación** | ✓ El muro muestra noticias en orden cronológico |
| | ✓ Puedo filtrar por deporte o categoría |
| | ✓ Las noticias pueden incluir texto e imágenes |

#### Historia 10.2 — Publicación de noticias

| | |
|---|---|
| **Como** | Secretaría o Subcomisión |
| **Quiero** | publicar noticias y comunicados en el muro de la app |
| **Para** | informar a los socios de forma centralizada y sin intermediarios |
| **Criterios de aceptación** | ✓ Puedo redactar y publicar noticias con título, cuerpo e imagen opcional |
| | ✓ Puedo asignar etiquetas por deporte o categoría |
| | ✓ Puedo enviar una notificación push asociada a la publicación |
| | ✓ Puedo editar o eliminar noticias publicadas |
| | ✓ Secretaría publica contenido institucional (cuotas, socios, administración) |
| | ✓ Subcomisión publica contenido deportivo y operativo |

---

## 5. Requerimientos No Funcionales

| Categoría | Requerimiento |
|---|---|
| **Plataforma** | App móvil (iOS/Android) + acceso web responsive. PWA o app híbrida válida para MVP. |
| **Offline - Operativo** | Toma de asistencia y registro de lesión deben funcionar sin conexión, con sync posterior. |
| **Offline - Socios** | El carnet QR del socio debe funcionar sin conexión. La validación en portería debe operar con conectividad limitada. |
| **Performance** | Respuesta < 2 segundos para operaciones comunes. Validación de QR en portería < 2 segundos. Push < 30 segundos de latencia. |
| **Seguridad - Auth** | Email + password. 2FA recomendado para Subcomisión. Datos de jugadores/socios (DNI, documentación) con almacenamiento seguro. |
| **Seguridad - QR** | El secreto TOTP es único por socio y nunca se expone en el cliente. |
| **Seguridad - Sesión** | Un socio solo puede tener sesión activa en un dispositivo a la vez. |
| **Pagos** | Integración con Mercado Pago vía checkout y webhooks de confirmación. |
| **Comprobantes** | Generación de PDF automática al confirmar pago (manual o digital). Plantilla con logo del club. |
| **Foto de perfil** | Validación de rostro via AWS Rekognition antes de activar el carnet. |
| **Escalabilidad** | ~60 usuarios operativos iniciales + socios del club. Arquitectura que permita sumar divisiones, roles o módulos sin rediseño mayor. |

---

## 6. Restricciones y Supuestos

- Las reglas de penalización por morosidad y recargos están **pendientes de definición** por la comisión directiva (reunión viernes). No se implementa lógica de bloqueo por mora hasta tener esa definición.
- El QR TOTP rota cada **30 segundos** (estándar de la industria).
- Si un socio cambia de celular, portería puede verificar visualmente la identidad al escanear (la foto aparece en pantalla). No se requiere flujo técnico de recuperación de dispositivo en el MVP.
- La Portería no tiene acceso a datos financieros ni a documentación personal de los socios.
- Secretaría puede registrar pagos en efectivo sin pasar por Mercado Pago.
- Todo jugador es también socio, pero no todo socio es jugador.
- Los montos de cuota son actualizables por Secretaría; los cambios aplican al próximo período.
- Comprobantes PDF con plantilla personalizada con logo del club (logo a proveer por el club al momento de implementar).
- Validación de rostro via **AWS Rekognition** (`DetectFaces`). Capa gratuita de 5.000 imágenes/mes, suficiente para el volumen del club.
- Publicación de noticias: Secretaría publica contenido institucional; Subcomisión publica contenido deportivo y operativo.
- La escala de gravedad de lesiones es fija del 1 al 5. No editable desde la app.
- Los eventos de recaudación se cierran manualmente por la Subcomisión, sin vencimiento automático.

---

## 7. Preguntas Abiertas

| # | Pregunta | Responsable |
|---|---|---|
| 1 | ¿Con cuántos meses de deuda se bloquea el carnet? | Comisión Directiva — reunión viernes |
| 2 | ¿Se aplican recargos por mora? ¿A partir de cuándo y de cuánto? | Comisión Directiva — reunión viernes |
| 3 | ¿La regla de bloqueo por morosidad la puede configurar Secretaría desde la app, o es fija? | A definir tras reunión |

---

## 8. Decisiones Cerradas

| | Decisión |
|---|---|
| ✅ | TOTP rota cada **30 segundos** |
| ✅ | Cambio de celular: portería verifica identidad visualmente con la foto. Sin flujo técnico en MVP |
| ✅ | Publicación de noticias: **Secretaría** (institucional/cuotas) y **Subcomisión** (deportivo/operativo) |
| ✅ | Comprobantes PDF con plantilla personalizada y logo del club (logo a proveer al implementar) |
| ✅ | Validación de rostro: **AWS Rekognition** — capa gratuita cubre el volumen del club |
| ✅ | Stack v2: se mantiene React Native + Expo + Supabase. Se agrega Mercado Pago SDK |
| ✅ | La tabla `jugadores` se vincula con la nueva tabla `socios` via `socio_id` |
| ✅ | La Edge Function `notifications` existente se extiende para cubrir notificaciones institucionales del módulo socios |
| ✅ | Escala de lesiones fija del 1 al 5, definida por el club. No editable desde la app |
| ✅ | Fichajes: el Manager tiene autoridad directa, sin flujo de aprobación |
| ✅ | Administración del sistema: la Subcomisión gestiona alta y baja de todos los usuarios operativos |

---

*Documento generado con Claude — Anthropic | Mayo 2026*
