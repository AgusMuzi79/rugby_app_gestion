# Spec: Gestión de Entrenamientos y Partidos

## Dominio
`entrenamientos-partidos`

## Descripción
Registro digital de asistencia a entrenamientos y partidos, armado de la mesa de partido y carga de resultados. Reemplaza las planillas en papel y los reportes manuales por WhatsApp. El Entrenador es el actor principal; el Coordinador y la Subcomisión consumen los datos.

## Actores
- **Entrenador** — registra asistencia, arma mesa de partido, carga resultado
- **Coordinador** — recibe alertas de inasistencias, visualiza calendario y asistencia
- **Subcomisión** — visualiza informes agregados de resultados y asistencia

## Modelo de Datos (conceptual)

### Entrenamiento
- `id`, `fecha`, `división`, `equipo`, `tipo: entrenamiento`

### Partido/Encuentro
- `id`, `fecha`, `división`, `equipo`, `rival`, `cancha`, `tipo: partido`

### Registro de Asistencia (por jugador)
- `evento_id`, `jugador_id`, `estado: Presente | Ausente | Justificado`

### Mesa de Partido
- `partido_id`, `capitán`, `jugadores_titulares[]`, `suplentes[]`, `cuerpo_técnico[]`

### Resultado de Partido
- `partido_id`, `puntos_propios`, `puntos_rival`

## User Stories

### US-EP-01 — Relevo de asistencia a entrenamiento
**Como** Entrenador  
**Quiero** registrar la asistencia de los jugadores en un entrenamiento  
**Para** tener un registro digital y detectar inasistencias reiteradas

**Criterios de aceptación:**
- Selecciono la fecha y mi equipo antes de iniciar el relevo
- Para cada jugador del equipo marco: Presente, Ausente o Justificado
- El sistema resalta automáticamente jugadores con 4 o más ausencias consecutivas
- El Coordinador recibe una notificación cuando un jugador supera ese umbral
- El registro queda guardado y es consultable históricamente
- Disponible en modo offline; sincroniza cuando hay conexión

### US-EP-02 — Asistencia a partido
**Como** Entrenador  
**Quiero** registrar quiénes asistieron al partido  
**Para** tener control de la nómina oficial del encuentro

**Criterios de aceptación:**
- Selecciono el partido desde el calendario de la división
- Confirmo los jugadores presentes de la lista del equipo
- El registro queda vinculado al partido correspondiente
- Disponible en modo offline; sincroniza cuando hay conexión

### US-EP-03 — Armado de mesa de partido
**Como** Entrenador  
**Quiero** armar y guardar la mesa de partido desde la app  
**Para** cumplir con los requisitos administrativos del encuentro

**Criterios de aceptación:**
- Puedo designar capitán, jugadores titulares, suplentes y cuerpo técnico
- La mesa queda asociada al partido correspondiente
- Puedo editar la mesa hasta que el partido inicie

### US-EP-04 — Carga de resultado del partido
**Como** Entrenador  
**Quiero** cargar el resultado del partido finalizado  
**Para** que la Subcomisión y el Coordinador vean el resultado sin esperar reportes manuales

**Criterios de aceptación:**
- Solo disponible para divisiones juveniles en adelante (no infantiles)
- Ingreso puntos propios y del rival
- El resultado queda visible en el informe de la Subcomisión de inmediato
- Se registra fecha, rival y cancha del encuentro (tomados del evento del calendario)
- Si el resultado ya fue cargado, el Entrenador puede editarlo

### US-EP-05 — Alta de eventos en el calendario (Coordinador)
**Como** Coordinador  
**Quiero** dar de alta eventos deportivos (entrenamientos y partidos) en el calendario de mi división  
**Para** que los Entrenadores y Managers vean el calendario actualizado y puedan operar desde él

**Criterios de aceptación:**
- Puedo crear un entrenamiento indicando: fecha, hora, equipo/división, lugar
- Puedo crear un partido indicando: fecha, hora, equipo/división, rival, cancha
- Los eventos quedan visibles para todos los usuarios de esa división
- Puedo editar o cancelar un evento creado

### US-EP-06 — Alta de eventos (Subcomisión)
**Como** Subcomisión  
**Quiero** crear eventos deportivos y administrativos en el calendario  
**Para** tener visibilidad y coordinación global sin delegar siempre al Coordinador

**Criterios de aceptación:**
- Puede crear eventos en cualquier división
- Mismas capacidades que el Coordinador en US-EP-05

## Reglas de Negocio
- La carga de resultados solo está habilitada para divisiones juveniles en adelante; las divisiones infantiles no tienen marcador.
- El umbral de alerta de inasistencias es 4 ausencias consecutivas (no acumuladas).
- Los estados de asistencia válidos son: Presente, Ausente, Justificado.
- Un entrenamiento o partido sin asistencia registrada permanece como "pendiente" en el historial.
- El calendario es por división; los eventos de una división no son visibles para otras divisiones salvo para Subcomisión y Coordinadores globales.

## Requerimientos No Funcionales
- Modo offline para toma de asistencia y registro de resultado; sincronización automática al recuperar conexión.
- La lista de jugadores por equipo debe estar disponible offline para el Entrenador.
- Respuesta en menos de 2 segundos para carga y consulta de asistencia.
