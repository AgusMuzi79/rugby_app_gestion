# Spec: Gestión de Lesiones

## Dominio
`lesiones`

## Descripción
Registro digital de lesiones de jugadores con detalle y grado de severidad, notificación inmediata a la Subcomisión y acceso a protocolos de actuación por grado. Reemplaza la comunicación informal por WhatsApp y elimina la dependencia de documentos físicos en momentos críticos.

## Actores
- **Entrenador** — registra la lesión con detalle y grado
- **Subcomisión** — recibe notificación push inmediata, accede a protocolos y al historial de lesiones
- **Coordinador** — accede a protocolos de actuación

## Escala de Gravedad (fija, definida por el club)

| Grado | Descripción |
|---|---|
| 1 | Leve — sin pérdida de actividad |
| 2 | Moderada — requiere reposo/tratamiento menor |
| 3 | Importante — baja deportiva de corta duración |
| 4 | Grave — baja deportiva prolongada, requiere evaluación médica |
| 5 | Muy grave — urgencia médica, protocolo de emergencia |

> La escala no es configurable desde la app. Es fija por definición del club.

## Modelo de Datos (conceptual)

### Lesión
- `id`, `jugador_id`, `fecha`, `descripción`, `grado: 1..5`, `registrado_por (entrenador_id)`, `división`

### Documento de Protocolo
- `id`, `título`, `grado_asociado`, `archivo_url`, `disponible_offline: bool`

## User Stories

### US-LES-01 — Registro de lesión
**Como** Entrenador  
**Quiero** registrar una lesión de un jugador con detalle y grado  
**Para** que la Subcomisión sea notificada de inmediato y actúe según el protocolo

**Criterios de aceptación:**
- Selecciono el jugador afectado de la lista de mi equipo y la fecha del incidente
- Ingreso una descripción libre de la lesión
- Asigno un grado del 1 al 5
- La Subcomisión recibe una notificación push instantánea (< 30 segundos)
- La notificación incluye: nombre del jugador, división y grado de lesión
- La lesión queda registrada en el historial del jugador
- Disponible en modo offline; la notificación se envía al recuperar conexión

### US-LES-02 — Historial de lesiones del jugador
**Como** Entrenador o Subcomisión  
**Quiero** ver el historial de lesiones de un jugador  
**Para** tener contexto de sus antecedentes físicos

**Criterios de aceptación:**
- Se puede consultar el historial desde el perfil del jugador
- Muestra fecha, grado, descripción y quién lo registró
- Ordenado cronológicamente (más reciente primero)

### US-LES-03 — Acceso a protocolos de actuación
**Como** Subcomisión o Coordinador  
**Quiero** acceder a los protocolos de actuación clasificados por grado de lesión  
**Para** tomar decisiones rápidas y correctas sin depender de documentos físicos

**Criterios de aceptación:**
- Existe una sección de documentos dentro del módulo de lesiones
- Los protocolos están organizados por grado (1 a 5)
- Los documentos son descargables para uso offline (descarga previa)
- Una vez descargados, son accesibles sin conexión
- Todos los roles pueden consultar los protocolos
- Solo la Subcomisión puede subir, editar o eliminar documentos

### US-LES-04 — Carga y gestión de documentos de protocolo (Subcomisión)
**Como** Subcomisión  
**Quiero** subir y actualizar los documentos de protocolos de lesión  
**Para** mantener actualizada la documentación operativa del club en la app

**Criterios de aceptación:**
- Puedo subir documentos en formato PDF
- Puedo asociar cada documento a un grado de lesión
- Puedo reemplazar un documento existente con una versión actualizada
- Los usuarios que tenían el documento descargado son notificados de la actualización

## Reglas de Negocio
- La escala de grados es fija (1 a 5); no es editable desde la app.
- La Subcomisión siempre recibe notificación push por cualquier lesión registrada, independientemente del grado.
- Un Entrenador solo puede registrar lesiones de jugadores de sus propios equipos.
- Los protocolos son de consulta libre para todos los roles; la edición es exclusiva de Subcomisión.
- La notificación push debe incluir: nombre del jugador, división, grado y breve descripción.

## Requerimientos No Funcionales
- Modo offline para registro de lesión; notificación se envía al recuperar conexión.
- Documentos de protocolo disponibles offline tras descarga previa.
- Notificación push con latencia máxima de 30 segundos desde el registro.
- Almacenamiento seguro de datos sensibles del jugador.
